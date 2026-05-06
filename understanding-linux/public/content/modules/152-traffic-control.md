---
id: 152
title: "Traffic control"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Why Traffic Control Exists
A packet‑switched network consists of links with a finite transmission capacity **C** (bits / second) and buffers of size **B** (bits). Traffic arriving at a link is rarely a constant‑rate stream; it exhibits *burstiness* due to application behavior, TCP congestion control, or interference. If the instantaneous arrival rate **λ(t)** exceeds **C**, the excess must be buffered. When **λ(t) > C** for a duration longer than **B/C**, packets are dropped, causing latency spikes and unfair bandwidth allocation. Traffic control (TC) therefore enforces a *traffic envelope* **E(t)** that upper‑bounds the cumulative number of bits that may have arrived by time **t**, guaranteeing that the buffer never overflows and that delay bounds can be derived analytically.

### Shaping vs. Policing – First‑Principles View
Both mechanisms enforce the same envelope **E(t)** but differ in *where* the enforcement occurs:

* **Shaping** buffers excess packets *before* they enter the network, smoothing the output to stay within **E(t)**. It is used when the sender can tolerate delay (e.g., bulk transfers) to avoid downstream congestion.
* **Policing** observes the incoming stream and either drops or marks packets that violate **E(t)**, leaving the traffic *as‑is* but penalizing non‑conformers. It is appropriate at network edges to protect resources from misbehaving sources.

Mathematically, a token‑bucket envelope with rate **r** (tokens / s) and bucket size **b** (tokens) is defined as  

$$
E(t) = r \cdot t + b
$$

If the cumulative bits **A(t)** arriving by time **t** satisfy **A(t) ≤ E(t)** for all *t*, the flow is conformant. A shaper ensures the *departure* process **D(t)** obeys the same inequality; a policer enforces it on the *arrival* process **A(t)**.

### Queueing Disciplines – Service Guarantees
After shaping/policing, packets reside in a transmission queue awaiting dispatch. The queueing discipline determines the *service order* and thus the delay experienced by each flow.

* **FIFO** (First‑In‑First‑Out) gives each packet the same service latency distribution; its delay bound is **D ≤ B/C** where **B** is the instantaneous backlog.
* **Priority Queueing (PQ)** assigns strict priority classes; high‑priority traffic sees delay as if lower classes were absent, while lower classes suffer starvation when higher‑priority backlog persists.
* **Weighted Round Robin (WRR)** services queues in proportion to weights **w_i**; over a long interval each class i receives a fraction **w_i / Σ w_j** of the link capacity, providing *fair* bandwidth allocation with bounded delay **D_i ≤ (B_i + Σ_{j≠i} B_j·w_i/w_j)/C**.

These disciplines are derived from the *service curve* concept in network calculus: a discipline offers a service curve **β(t)** such that the backlog **b(t) ≤ (A ⊗ β)(t)**, where ⊗ denotes min‑plus convolution.

## How It Works
### Detailed Packet Flow in Linux TC
1. **Classification** – `tc filter` attaches a filter to a qdisc; the filter extracts packet metadata (e.g., DSCP, src/dst ports, VLAN) and returns a class ID.
2. **Shaping (if present)** – The packet enters a *leaf* qdisc (often TBF, HTB, or SFQ) that implements a token bucket. Tokens are added at rate **r**; a packet of size **L** can be transmitted only if ≥ L tokens are available; otherwise it is queued until tokens accrue.
3. **Policing (if present)** – A police qdisc (e.g., `police` or `rate_estimator`) checks the same token bucket but, on deficiency, either *drops* the packet or *re‑marks* its TC field (e.g., sets DSCP to a lower priority) without buffering.
4. **Queueing** – The packet is placed in the internal queue of the chosen class (FIFO, PQ, WRR, etc.). The discipline’s dequeue routine determines when the packet is handed to the network driver.
5. **Transmission** – The driver dequeues from its hardware ring and sends the frame onto the medium.

Each step is enforced by the Linux *QoS* subsystem (`net/sched/`). The core data structures are:

```c
/* include/uapi/linux/tc_act/tc_police.h */
struct tc_police {
    __u32 rate;          /* tokens per second */
    __u32 burst;         /* bucket size in bytes */
    __u8  over_action;   /* TC_ACT_SHOT, TC_ACT_PIPE, etc. */
    __u8  under_action;
    __u16 action;
};

/* include/net/pkt_sched.h */
struct Qdisc {
    struct Qdisc_ops *ops;
    struct Qdisc *parent;
    u32 handle;
    /* ... */
};
```

The enqueue/dequeue callbacks (`->enqueue`, `->dequeue`) implement the specific algorithm.

### Timing Derivation for Token Bucket Shaper
Consider a TBF with rate **r** (bits/s) and burst **b** (bits). The worst‑case waiting time **W_max** for a packet of size **L** arriving when the bucket is empty follows from solving  

```
r·t + b ≥ L   =>   t ≥ (L - b)/r   (if L > b)
```

Thus  

$$
W_{\text{max}} = \max\!\left(0,\frac{L-b}{r}\right)
$$

If **L ≤ b**, the packet can be sent immediately (zero shaping delay). This formula is used to size **b** for a target latency bound.

## Worked Examples
### Example 1: Hierarchical TBF + Police (Detailed)
Goal: Shape outbound traffic on **eth0** to 200 Mbps with a 10 ms latency bound, and police inbound traffic to 50 Mbps.

**Step 1 – Compute TBF parameters**  
Desired max queuing delay **D_target** = 10 ms. For Ethernet MTU **L_max** = 1500 bytes = 12 000 bits.  

From the delay bound formula:  

```
b = r·D_target   (choose burst to fill the pipe for D_target)
```

```
r = 200 Mbps = 200·10^6 bits/s
b = 200·10^6 * 0.01 = 2·10^6 bits = 250 kB
```

Add a small safety margin (10 %): **b** ≈ 275 kB.

**Step 2 – Add root TBF**  
```bash
tc qdisc add dev eth0 root handle 1: tbf \
    rate 200mbit burst 275kbit latency 10ms
```
*Explanation*: `handle 1:` identifies the qdisc; `tbf` implements the token bucket. The kernel will now shape packets leaving eth0.

**Step 3 – Add police as child**  
We police inbound traffic, so we attach the police under the root with a different handle (e.g., `2:`).  
```bash
tc qdisc add dev eth0 parent 1: handle 2: police \
    rate 50mbit burst 12.5kbit mtu 1500 action drop
```
*Explanation*: `rate 50mbit` → 50 Mbps; `burst 12.5kbit` ≈ 1.5 kB (enough for one Ethernet frame). On violation, `action drop` discards the packet.

**Step 4 – Verify**  
```bash
# Show shaping parameters
tc -s qdisc show dev eth0
# Show police stats
tc -s qdisc show dev eth0 parent 1: handle 2:
```
The `tc -s` output displays `backlog`, `tokens`, `dropped`, etc., confirming that the shaper is limiting output and the police is counting drops.

### Example 2: Priority Queueing with Three Bands
Goal: Assign VoIP (DSCP EF) to highest priority, interactive SSH (DSCP AF21) to medium, bulk FTP (default) to lowest.

**Step 1 – Create root PRIO qdisc**  
```bash
tc qdisc add dev eth0 root handle 1: prio bands 3
```
This creates three bands: `1:1` (high), `1:2` (medium), `1:3` (low).

**Step 2 – Classify VoIP into band 1:1**  
```bash
tc filter add dev eth0 protocol ip parent 1:0 prio 1 u32 \
    match ip dscp 0x2e 0xfc flowid 1:1
```
*Explanation*: DSCP EF = 0x2e (binary 111010). Mask `0xfc` checks the high 6 bits.

**Step 3 – Classify SSH into band 1:2**  
```bash
tc filter add dev eth0 protocol ip parent 1:0 prio 2 u32 \
    match ip dscp 0x48 0xfc flowid 1:2
```
DSCP AF21 = 0x48.

**Step 4 – All remaining traffic goes to band 1:3 automatically** (lowest band is default).

**Step 5 – Verify**  
```bash
tc -s class show dev eth0
```
Each class shows `packets`, `bytes`, `dropped`, and `backlog`. Under load, you should see near‑zero delay for band 1:1 even when bands 1:2/1:3 are saturated.

### Example 3: WRR with Two Flows (Weighted Fair Queueing)
Goal: Allocate 2/3 of the link to flow A (e.g., video) and 1/3 to flow B (e.g., backup) on a 100 Mbps interface.

**Step 1 – Root WRR**  
```bash
tc qdisc add dev eth0 root handle 1: wrr quantum 1500
```
`quantum` is the default byte deficit per round; setting it to the MTU simplifies weight interpretation.

**Step 2 – Add two child classes with weights**  
Weights are expressed via the `weight` parameter (kernel treats them as relative).  
```bash
tc class add dev eth0 parent 1: classid 1:10 wrr weight 2
tc class add dev eth0 parent 1: classid 1:20 wrr weight 1
```

**Step 3 – Attach leaf qdiscs (e.g., SFQ) to each class**  
```bash
tc qdisc add dev eth0 parent 1:10 handle 10: sfq
tc qdisc add dev eth0 parent 1:20 handle 20: sfq
```

**Step 4 – Verify bandwidth split**  
Generate traffic with `iperf3`:
```bash
# On server: iperf3 -s
# On client: iperf3 -c server -t 30 -b 0 -P 1   # flow A
# In another terminal: iperf3 -c server -t 30 -b 0 -P 1   # flow B
```
Then check:
```bash
tc -s class show dev eth0
```
You should observe approximately 66.7 Mbps on class 1:10 and 33.3 Mbps on class 1:20 (allowing for overhead).

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **M1: Using `rate` in `tc qdisc add` without specifying `burst` or `latency`** | The kernel defaults burst to a small value (often ~1 KB). For high‑rate shapers this yields an unrealistically tight bucket, causing unnecessary packet drops and latency spikes. | The token bucket must be large enough to absorb the link’s *bandwidth‑delay product* (BDP). Without adequate burst, the shaper cannot sustain the configured rate, defeating its purpose. |
| **M2: Attaching a police qdisc as a *root* qdisc instead of a child** | A root police drops packets before any shaping or classification, so subsequent qdiscs never see the traffic. | Policing is meant to *condition* an already‑shaped or classified stream. Placing it at the root removes the ability to apply different policies to different classes (e.g., per‑flow policing). |
| **M3: Confusing `handle` and `parent` when building hierarchies** | Example: `tc qdisc add dev eth0 parent 1:0 handle 2:0 tbf …` where `parent 1:0` actually refers to the *root* qdisc’s *ingress* hook (which doesn’t exist for egress). | The egress path uses `parent <major>:<minor>` where `<major>` is the handle of the parent qdisc. Mistaking the parent leads to “RTNETLINK answers: Invalid argument” or silent mis‑placement, causing traffic to bypass intended controls. |
| **M4: Ignoring link‑layer overhead when calculating rates** | Configuring `rate 100mbit` assuming payload only, while Ethernet adds 14 B header + 4 B FCS + 12 B IFG = 30 B per frame. For 1500‑byte MTU, overhead ≈ 2 %. | The actual line rate becomes ~102 Mbit/s, causing the shaper to *under‑utilize* the link or the police to *over‑drop* if not compensated. Proper rate = payload_rate × (1 + overhead/MТU). |
| **M5: Using `tc filter … u32` with incorrect mask for DSCP** | Matching `match ip dscp 0x2e 0x0f` masks only the low 4 bits, letting AF21 (0x48) also match the EF filter. | Misclassification sends VoIP traffic to a lower priority queue, increasing jitter and potentially breaking real‑time applications. Always mask the high 6 bits: `0xfc`. |

## Exercises
### Easy – Shaping Verification
1. Configure `eth0` to shape outbound traffic to **10 Mbps** with a burst that allows a **5 ms** maximum queuing delay (MTU = 1500 B).  
2. Use `tc -s qdisc show dev eth0` to confirm the configured `rate` and `burst`.  
3. Generate a TCP bulk flow with `iperf3 -c <server> -t 10 -b 0` and observe that the achieved throughput does not exceed 10 Mbps (allow a few percent for overhead).  

### Moderate – Hierarchical Police + TBF
1. On `eth0`, create a root TBF shaping to **50 Mbps** (burst sized for 10 ms latency).  
2. Underneath, add a police limiting inbound traffic to **5 Mbps** with `action drop`.  
3. Run two simultaneous `iperf3` streams: one limited to 4 Mbps (should pass) and another limited to 8 Mbps (should be dropped). Verify drops via `tc -s qdisc show dev eth0 parent 1: handle 2:`.  

### Hard – Combined Shaping, Policing, and WRR
1. Shape outbound traffic on `eth0` to **200 Mbps** (TBF, burst for 15 ms).  
2. Create a root PRIO with three bands: VoIP (DSCP EF), Interactive (DSCP AF21), Bulk (default).  
3. Inside the Bulk band, attach a WRR with two classes: Video (weight 2) and Backup (weight 1), each leaf using SFQ.  
4. Police the Interactive band to **10 Mbps** (burst for 5 ms) with `action reclassify` to set DSCP to CS1 (lower priority) on excess.  
5. Validate:  
   * Use `tc -s class show dev eth0` to confirm each band’s byte counts.  
   * Run `ffmpeg` to generate a constant‑bitrate video stream (~30 Mbps) and a `rsync` backup (~50 Mbps) while a VoIP softphone sends packets marked EF.  
   * Observe that VoIP incurs minimal jitter (< 5 ms), video receives ~2/3 of the bulk bandwidth, backup gets the remainder, and the Interactive band never exceeds 10 Mbps (excess packets are remarked).  

## Linux Connection
### Subsystem Overview
| Component | Kernel Path | Purpose |
|-----------|-------------|---------|
| **QoS Core** | `net/sched/` | Implements `Qdisc`, `cls_ops`, `act_ops`; provides the `tc` netlink interface. |
| **Token Bucket (TBF)** | `net/sched/tbf.c` | Implements shaping via a timer‑driven token replenishment (`tb_change`, `tbf_enqueue`). |
| **Police** | `net/sched/police.c` | Implements RFC‑2698 style policing (`police_enqueue`, `police_act`). |
| **PRIO** | `net/sched/prio.c` | Strict priority bands; each band is a separate `Qdisc`. |
| **WRR** | `net/sched/wrr.c` | Weighted round‑robin; maintains `deficit` per class. |
| **SFQ (Stochastic Fair Queueing)** | `net/sched/sfq.c` | Per‑flow hashing for approximate fairness. |
| **Ingress Policing** | `net/sched/sch_ingress.c` | Applied on the *input* side via `tc qdisc add dev eth0 ingress`. |
| **Netlink Interface** | `rtnetlink` (via `tc` utility) | Allows userspace to create/modify qdiscs, classes, filters. |
| **sysfs Statistics** | `/sys/class/net/<dev>/queues/<rx‑tx>/` | Exposes `byte_count`, `packet_count`, `dropped` per hardware queue. |

### Concrete Commands to Inspect Internals
```bash
# Show all qdiscs on eth0 (including ingress)
tc -s qdisc show dev eth0

# Display the netlink message that the kernel just processed (useful for debugging)
tc -d qdisc show dev eth0

# View per‑queue statistics (e.g., after enabling multiple Tx queues)
ethtool -g eth0          # shows ring sizes
ethtool -S eth0 | grep tx_queue

# Look at the raw qdisc struct via debugfs (if CONFIG_NET_SCH_DEBUG)
cat /sys/kernel/debug/net/sched/dev/eth0/qdisc_1:0

# Check token bucket parameters for a TBF
tc -s qdisc show dev eth0 | grep -A2 'tbf'
```
Each command maps directly to a kernel data structure: `tc qdisc show` walks the `Qdisc` linked list attached to the netdevice; the `-s` flag invokes the qdisc’s `->dump_stats` callback, which prints fields from `struct tbf_data`, `struct police_data`, etc.

### Example: Adding a Filter via Netlink (C snippet)
```c
#include <linux/netlink.h>
#include <linux/rtnetlink.h>
#include <linux/pkt_sched.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>
#include <errno.h>

int main(void) {
    int sock = socket(AF_NETLINK, SOCK_RAW, NETLINK_ROUTE);
    if (sock < 0) { perror("socket"); return 1; }

    struct {
        struct nlmsghdr nh;
        struct tcmsg    tc;
        char            buf[256];
    } req;

    memset(&req, 0, sizeof(req));
    req.nh.nlmsg_len   = NLMSG_LENGTH(sizeof(struct tcmsg));
    req.nh.nlmsg_type  = RTM_NEWQDISC;
    req.nh.nlm_flags   = NLM_F_REQUEST | NLM_F_CREATE | NLM_F_EXCL;
    req.nh.nlmsg_seq   = 1;
    req.nh.nlmsg_pid   = getpid();

    req.tc.tcm_family  = AF_UNSPEC;
    req.tc.tcm_ifindex = if_nametoindex("eth0");
    req.tc.tcm_handle  = TC_H_MAKE(1 << 16, 0);   // handle 1:0
    req.tc.tcm_parent  = TC_H_ROOT;              // root
    req.tc.tcm_info    = TC_H_HTB;                // qdisc kind (htb)

    /* Add attributes for rate, ceil, etc. omitted for brevity */

    if (send(sock, &req, req.nh.nlmsg_len, 0) < 0) {
        perror("send");
        close(sock);
        return 1;
    }

    /* Wait for ACK... */
    close(sock);
    return 0;
}
```
This demonstrates how `tc` ultimately talks to the kernel via `rtnetlink`, manipulating the same structures we examined earlier.

## Why This Matters
Traffic control transforms an unreliable, best‑effort packet network into a predictable service platform. By **shaping** we bound the *output* rate, preventing bursts from overwhelming downstream links and guaranteeing that the network’s bandwidth‑delay product is respected. By **policing** we defend the network edge from misbehaving or malicious sources, ensuring that the agreed‑upon service contract (rate, burst) is upheld. Queueing disciplines then translate these rate guarantees into **delay**, **jitter**, and **fairness** guarantees that applications can rely on: VoIP packets traverse a strict‑priority queue with sub‑millisecond jitter, video streams obtain a weighted share of the bulk bandwidth, and background transfers receive the leftovers without starving latency‑sensitive traffic.

In Linux, the `tc` front‑end exposes a rich, modular `net/sched` subsystem where each building block—token bucket, police, PRIO, WRR, SFQ—is a first‑class kernel object with well‑defined netlink attributes. Mastery of these primitives lets a network engineer craft *end‑to‑end* QoS policies that are observable (`tc -s`, `ethtool -S`, `/sys/class/net/*/queues/`), adjustable at runtime, and verifiable with standard traffic generators. The mathematical foundations (token bucket envelope, service curves, delay bounds) provide the reasoning behind every knob, turning what could be a series of mystical commands into a deterministic engineering process. Consequently, proficiency in traffic control is not merely a networking skill—it is a prerequisite for delivering reliable, performant services on modern Linux‑based infrastructure.
