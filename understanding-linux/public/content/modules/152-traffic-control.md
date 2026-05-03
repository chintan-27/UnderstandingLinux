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

## Why This Matters

When a bulk TCP transfer and an SSH session share an egress queue, the bulk transfer wins by default — it generates packets faster, fills the queue, and the SSH keystrokes wait behind megabytes of data already committed to the wire. This isn't a bandwidth problem; it's a scheduling problem. Traffic control solves it by replacing the default FIFO queue with a policy-aware scheduler that can enforce rates, prioritize flows, and discard packets intelligently before queues overflow.

Understanding traffic control also explains behaviors that otherwise look like bugs: why a 100 Mbit link shows 200 ms ping times under load (bufferbloat), why `tc` commands applied to ingress have no shaping effect (you cannot delay packets you haven't buffered), and why a misconfigured burst parameter silently stops all transmission.

---

## Core Concepts

### The Queuing Discipline (qdisc)

Every network interface has a **root qdisc** attached to its egress path. The kernel never hands a packet directly from the IP stack to the driver — `dev_queue_xmit()` always goes through `qdisc->enqueue()`, and the driver pulls packets via `qdisc->dequeue()`. This separation of enqueue and dequeue is the mechanism that makes scheduling possible: the qdisc can reorder, delay, or drop between the two calls.

Two structural families:

- **Classless qdiscs**: a single queue, uniform treatment (`pfifo`, `bfifo`, `fq_codel`, `tbf`).
- **Classful qdiscs**: a tree of classes, each with its own child qdisc; packets are assigned to a class by **filters** (`htb`, `prio`, `hfsc`).

The default qdisc is set in `/proc/sys/net/core/default_qdisc` (kernel 3.11+). On modern distributions this is typically `fq_codel`; on older ones, `pfifo_fast`.

```bash
cat /proc/sys/net/core/default_qdisc
```

### Shaping vs. Policing

These two mechanisms enforce rate limits by opposite means:

| | Mechanism | Latency effect | Loss | Applies to |
|---|---|---|---|---|
| **Shaping** | buffer and delay excess packets | increases | none (until buffer full) | egress only |
| **Policing** | drop or re-mark excess packets | none | yes | ingress or egress |

Shaping can only work on egress because shaping requires holding packets in a buffer — you must have custody of the packet to delay it. On ingress, packets have already arrived at the NIC and been DMA'd into memory; you can drop them, but you cannot un-receive them.

Policing is therefore the only mechanism available for ingress rate limiting. The ingress qdisc (`ingress`) combined with a `u32` or `flower` filter and a `police` action implements this:

```bash
# Drop ingress traffic on eth0 exceeding 100 Mbit/s
tc qdisc add dev eth0 handle ffff: ingress
tc filter add dev eth0 parent ffff: protocol ip u32 \
    match u32 0 0 \
    police rate 100mbit burst 200kb drop \
    flowid :1
```

The `burst` here absorbs legitimate short bursts (a full-sized jumbo frame at 9000 bytes, or a burst of standard MTU frames arriving back-to-back at line rate before the token bucket catches up).

### The Token Bucket

Both shapers and policers use the **token bucket** model. Tokens accumulate at rate $r$ (bytes/sec) up to a maximum capacity $B$ (bytes). A packet of size $L$ bytes can only depart when $L$ tokens are available; it then consumes exactly $L$ tokens.

$$\text{tokens}(t) = \min\!\left(B,\ \text{tokens}(t - \Delta t) + r \cdot \Delta t\right)$$

The burst parameter $B$ determines the maximum instantaneous burst: a full bucket lets $B$ bytes depart back-to-back at line rate before rate limiting begins. After the burst, the long-run average rate is bounded by $r$.

The minimum usable burst is one MTU. If $B < \text{MTU}$, the token bucket can never accumulate enough tokens to release a single full-sized packet, and the qdisc stalls. For a 1 Gbit/s link with a 1500-byte MTU, the minimum burst in time is:

$$t_{\min} = \frac{1500 \text{ bytes}}{125 \times 10^6 \text{ bytes/sec}} = 12\ \mu\text{s}$$

In practice, set burst to at least $r / 8$ (one "burst worth" at the configured rate) to avoid token starvation on irregular packet arrival.

### Active Queue Management (AQM)

Tail drop — dropping from the back of a full FIFO — has two well-documented pathologies:

1. **TCP synchronization**: multiple flows hit drop simultaneously, back off simultaneously, and restart simultaneously, causing oscillating throughput.
2. **Bufferbloat**: large buffers absorb bursts without dropping, but the queuing delay experienced by every packet grows with buffer occupancy. A 4 MB buffer at 1 Mbit/s adds $4 \times 10^6 \times 8 / 10^6 = 32$ seconds of worst-case latency.

AQM algorithms intervene before the buffer is full:

- **RED** (Random Early Detection): drops probabilistically based on average queue length. The drop probability increases linearly from 0 to $p_{\max}$ as queue length moves from $\text{min\_th}$ to $\text{max\_th}$.
- **CoDel** (Controlled Delay): ignores queue length entirely and measures **sojourn time** — how long each packet actually waits between enqueue and dequeue. If any packet sojourns longer than a target $\delta$ (default 5 ms) for a full interval $T$ (default 100 ms), CoDel enters a dropping state and drops at intervals following a $1/\sqrt{n}$ schedule (drop frequency increases as $\sqrt{n}$ where $n$ is the count of drops in the current episode).

CoDel's key insight: queue length is a proxy for delay, but it's a bad proxy because it depends on packet size. Sojourn time measures delay directly.

**FQ-CoDel** (Fair Queue CoDel) combines per-flow fair queuing with CoDel on each sub-queue. It prevents a single high-rate flow from starving others while also keeping per-flow latency low. This is the reason it replaced `pfifo_fast` as the default.

---

## How It Works

### The Packet Path Through a Qdisc

```
socket write
  → tcp/ip stack (routing, netfilter OUTPUT)
  → dev_queue_xmit()
  → root qdisc: enqueue()
      [if classful: classify via filters → leaf class → child qdisc enqueue]
  → [packet sits in qdisc queue]
  → driver calls qdisc->dequeue() when TX ring has space
  → packet handed to NIC driver
  → DMA to NIC TX ring → wire
```

The driver's TX ring is a separate, fixed-size hardware queue. The qdisc queue feeds into it. If the TX ring fills (the driver sets `NETIF_F_LLTX` and calls `netif_stop_queue()`), dequeue pauses and the qdisc queue absorbs the backlog. This is the buffer that causes bufferbloat when it's large and unmanaged.

You can inspect the current qdisc on an interface and its statistics:

```bash
tc -s qdisc show dev eth0
```

The `-s` flag shows packet counts, byte counts, drops, and overlimits — overlimits are packets that arrived when the token bucket was empty and had to wait (shaping) or were dropped (policing).

### TBF: Token Bucket Filter

`tbf` is the canonical classless shaper. Parameters:

- `rate $r$`: sustained rate
- `burst $B$`: token bucket depth — maximum instantaneous burst
- `latency`: maximum time a packet may wait; this implicitly caps queue depth:

$$\text{queue}_{\max}\ (\text{bytes}) = \text{latency} \times r$$

So `latency 50ms` at `rate 1mbit` permits a queue of $0.05 \times 125000 = 6250$ bytes. Any packet that would exceed this queue depth is dropped.

```bash
# Shape eth0 egress to 1 Mbit/s, 10 KB burst, max 50 ms queuing delay
tc qdisc add dev eth0 root tbf rate 1mbit burst 10kb latency 50ms

# Verify
tc -s qdisc show dev eth0

# Remove
tc qdisc del dev eth0 root
```

`tbf` also supports a `peakrate` parameter, which adds a second token bucket to limit the burst delivery rate (useful when `burst` must be large for token accumulation reasons but you don't want to actually deliver that burst at line rate):

```bash
tc qdisc add dev eth0 root tbf rate 1mbit burst 32kb peakrate 2mbit mtu 1500 latency 50ms
```

### HTB: Hierarchical Token Bucket

HTB is the standard classful shaper. Each class carries two token buckets:

- `rate`: the guaranteed rate — tokens from this bucket are never lent to other classes.
- `ceil`: the ceiling rate — a class may borrow unused tokens from its parent up to `ceil`.

When a class has data and its `rate` bucket has tokens, it transmits. If its `rate` bucket is empty but the parent has spare capacity (other classes underutilizing their `rate`), it borrows up to `ceil`. No class ever exceeds `ceil`, regardless of available bandwidth.

HTB class priority is set with `prio` (lower number = higher priority). Among classes at the same level competing for borrowed bandwidth, higher-priority classes are served first.

```bash
# Root HTB qdisc, unclassified traffic goes to class 1:30
tc qdisc add dev eth0 root handle 1: htb default 30

# High-priority class: guaranteed
