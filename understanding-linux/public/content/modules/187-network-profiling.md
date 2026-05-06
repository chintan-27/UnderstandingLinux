---
id: 187
title: "Network profiling"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
Network profiling is the quantitative observation of packet‑level events that directly affect end‑to‑end performance: **packet loss**, **retransmission**, **queueing delay**, and **socket buffer occupancy**.  
Each metric is a symptom of an underlying resource contention:

* **Packet loss** occurs when a forwarding device cannot store an incoming packet because its input queue is full. In a lossy environment TCP interprets loss as congestion and reduces its congestion window (cwnd), cutting throughput roughly by a factor of ½ per loss event (the classic “multiplicative decrease”).  
* **Retransmissions** are the TCP sender’s reaction to perceived loss (via duplicate ACKs or timeout). The retransmission timeout (RTO) is computed as $RTO = SRTT + 4\cdot RTTVar$, where $SRTT$ is the smoothed round‑trip time and $RTTVar$ its variance. A mis‑estimated RTT inflates RTO, causing unnecessary delays.  
* **Queueing delay** is the time a packet spends waiting in a buffer before transmission. For a FIFO queue with service rate $\mu$ (packets/s) and average arrival rate $\lambda$, Little’s Law gives the average number in system $L = \lambda W$, where $W$ is the average waiting time. If $\lambda \to \mu$, $W$ diverges → bufferbloat.  
* **Socket buffers** (SO_RCVBUF, SO_SNDBUF) limit how much data the kernel can hold for a socket before applying back‑pressure to the application or the network. The TCP advertised window cannot exceed the socket receive buffer; if the buffer is smaller than the bandwidth‑delay product (BDP), the connection becomes **window‑limited** and cannot fill the pipe, regardless of the physical link capacity.

The **bandwidth‑delay product** quantifies the amount of data that can be “in flight”:
$$
\text{BDP} = \text{Bandwidth (bits/s)} \times \text{RTT (s)} \quad\text{[bits]}
$$
Dividing by 8 yields bytes. Proper socket buffer sizing must be at least BDP (often 1–2× BDP to absorb bursts) to avoid artificial throttling.

## How It Works
### 1. Data Collection
Packet capture is performed at the NIC driver level via the **PF_PACKET** socket interface. Tools like `tcpdump` (libpcap) or `bpftrace` attach to this interface and copy each `sk_buff` into user space. The capture process does **not** alter packet timing because the kernel uses zero‑copy mapping (`mmap`) when available (`-Z` flag in recent tcpdump).

### 2. Queueing Theory Foundations
Consider a single output port modeled as an M/M/1 queue:
* Arrival process: Poisson with rate $\lambda$.
* Service time: Exponential with mean $1/\mu$.

The stationary probability that the queue contains $n$ packets is $P_n = (1-\rho)\rho^n$, where $\rho = \lambda/\mu$ is the utilization. The **average queue length** is $L_q = \frac{\rho^2}{1-\rho}$ and the **average waiting time** (excluding service) is $W_q = \frac{\lambda}{\mu(\mu-\lambda)}$. When $\rho>0.9$, $W_q$ grows sharply—this is the regime where AQM (Active Queue Management) such as **CoDel** or **RED** becomes essential to keep $W_q$ bounded.

### 3. Socket Buffer Autoscaling
Linux provides per‑socket auto‑tuning via `net.ipv4.tcp_rmem` and `net.ipv4.tcp_wmem`, each holding three values: **min**, **default**, **max** (in bytes). The kernel scales the actual buffer between min and max based on measured **TCP throughput** and **RTT**:
```
effective_rmem = clamp(min_rmem,
                       min(default_rmem, measured_throughput * RTT / 8),
                       max_rmem)
```
If the measured BDP exceeds the current max, the kernel will not grow beyond `max_rmem`, causing a ceiling on throughput. Conversely, setting max too high wastes kernel memory and can increase latency due to larger queuing depths.

### 4. Feedback Loop
Data collection → metric extraction (loss %, retransmission count, average queue length via `tc -s qdisc show`, RTT via `ping` or TCP timestamps) → model fitting (e.g., estimate $\lambda$, $\mu$) → parameter adjustment (socket buffer sysctl, `tc qdisc` parameters) → re‑measure.

## Worked Examples
### Example 1: Measuring Loss and BDP on a 1 Gbps Link
```bash
# 1. Set up a 1 Gbps link (eth0) with a known RTT using ping
sudo ip link set eth0 up
sudo ethtool -s eth0 speed 1000 duplex full autoneg off
ping -c 10 10.0.0.2   # remote endpoint
# Suppose avg RTT = 20 ms

# 2. Compute BDP
#   Bandwidth = 1 Gbps = 1e9 bits/s
#   RTT = 0.020 s
#   BDP = 1e9 * 0.020 = 20e6 bits = 2.5e6 bytes ≈ 2.5 MiB
echo "BDP ≈ 2.5 MiB"

# 3. Capture traffic for 10 s
sudo tcpdump -i eth0 -w /tmp/capture.pcap -G 10 -W 1

# 4. Analyze loss and retransmissions with tshark
tshark -r /tmp/capture.pcap -q -z io,stat,0,"BYTES()bytes()"
tshark -r /tmp/capture.pcap -q -z io,stat,0,"TCP ACKed lost segment"
# Output shows e.g. 12 lost segments out of 12500 total → loss ≈ 0.096 %
```
**Why this matters:** With a 2.5 MiB BDP, the default `net.core.rmem_max` (212992 B ≈ 0.2 MiB) would throttle the TCP window to < 10 % of the link capacity, causing severe underutilization. Raising the socket buffer to ≥ 4 MiB (≈ 1.6× BDP) allows the pipe to fill.

### Example 2: Tuning Socket Buffers for a 100 Mbps, 50 ms Path
```bash
# 1. Derive target buffer
#   Bandwidth = 100 Mbps = 1e8 bits/s
#   RTT = 0.050 s
#   BDP = 1e8 * 0.050 = 5e6 bits = 0.625 MiB
#   Choose 2× BDP for burst tolerance → 1.25 MiB ≈ 1 310 720 B

# 2. Apply via sysctl (persistent via /etc/sysctl.d/99-network.conf)
sudo sysctl -w net.core.rmem_max=1310720
sudo sysctl -w net.core.wmem_max=1310720
# Also adjust TCP auto‑tune ranges
sudo sysctl -w net.ipv4.tcp_rmem="4096 87380 1310720"
sudo sysctl -w net.ipv4.tcp_wmem="4096 65536 1310720"

# 3. Verify with ss
ss -i state established '( dport = :5201 )'   # assuming iperf3 server on 5201
# Look at recv-q and send-q fields; they should stay well below the buffer size.
```
**Why this matters:** If the buffer remained at the default 212 KB, the TCP window would clamp at ~0.17 MiB → max throughput ≈ window/RTT = 0.17 MiB / 0.05 s ≈ 27 Mbps, far below the 100 Mbps link.

### Example 3: Installing and Evaluating an AQM (fq_codel)
```bash
# 1. Replace the default pfifo_fast with fq_codel
sudo tc qdisc add dev eth0 root handle 1:0 fq_codel limit 1000 target 5ms interval 100ms

# 2. Show statistics
sudo tc -s qdisc show dev eth0
# Output includes: backlog, drops, overlimits, maxpacket, etc.

# 3. Generate background traffic with iperf3 (TCP) and a low‑priority UDP stream
#    (UDP to expose queue delay)
iperf3 -c 10.0.0.2 -t 30 -P 4 &   # 4 parallel TCP streams
sudo ip link set dev eth0 txqueuelen 1000   # ensure enough depth for measurement
sudo ping -i 0.01 10.0.0.2 |& tee /tmp/ping.log   # 10 ms spacing, measure latency

# 4. Analyze ping latency before/after AQM
#    Expect median RTT ~ few ms with fq_codel vs. tens of ms with drop‑tail.
```
**Why this matters:** Drop‑tail queues exhibit **global synchronization**: many TCP flows reduce cwnd simultaneously after a drop, causing periodic throughput collapse. fq_codel isolates flows and controls standing queue, keeping latency low while preserving link utilization.

## Common Mistakes
| Mistake | What’s Wrong | Why It Hurts |
|---------|--------------|--------------|
| Setting `net.core.rmem_max` to the default value on high‑speed links | The socket receive buffer caps the TCP advertised window. | Throughput becomes window‑limited; the link stays idle despite available bandwidth. |
| Making socket buffers excessively large (e.g., > 10 × BDP) | Large buffers increase queuing depth → higher latency and bufferbloat. | Interactive applications (VoIP, gaming) suffer jitter; TCP’s RTT estimate inflates, causing spurious timeouts. |
| Using a pure drop‑tail queue (`pfifo_fast`) without AQM on a congested uplink | Drop‑tail drops packets only when the queue is full, leading to bursty loss. | Triggers global synchronization among TCP flows, causing periodic throughput crashes and unfairness. |
| Capturing with `tcpdump` while NIC offloads (TSO, GRO, checksum) are enabled | The kernel may coalesce or modify packets before they reach the capture socket. | Observed packet sizes and timestamps do not match what was on the wire, causing erroneous loss/jitter calculations. |
| Ignoring NIC ring buffer size when tuning `txqueuelen`/`rx` via `ethtool -G` | If the ring is too small, the driver drops packets before they reach the kernel queue, invisible to `tc` stats. | Apparent “zero drops” in `tc` while actual loss occurs at the hardware layer, misleading analysis. |
| Assuming retransmission count equals packet loss | Retransmissions can be spurred by delayed ACKs, out‑of‑order delivery, or lost ACKs—not just data loss. | Overestimates congestion, leading to overly aggressive buffer reduction and underutilization. |

## Exercises
### Easy
1. **Capture & Loss Calculation**  
   - Run `sudo tcpdump -i any -w /tmp/test.pcap -c 5000`.  
   - Use `tshark -r /tmp/test.pcap -q -z io,stat,0,"TCP ACKed lost segment"` to count lost segments.  
   - Compute loss percentage and comment on whether the observed loss explains any throughput drop seen in a concurrent `iperf3` test.

### Medium
2. **Socket Buffer Programming**  
   - Write a C program that creates a TCP socket, sets `SO_RCVBUF` and `SO_SNDBUF` to a user‑provided size (via `setsockopt`), performs a `connect()` to a local `iperf3` server, and measures achieved bandwidth with `getsockopt(SO_MAX_SEG_SIZE)` and a simple timed `read()` loop.  
   - Vary the buffer size from 16 KiB to 4 MiB and plot bandwidth vs. buffer size (you can output CSV and plot with `gnuplot`).  
   - Explain the observed curve in terms of BDP.

### Hard
3. **AQM Design & Evaluation**  
   - Starting from the default `pfifo_fast` on `eth0`, implement a two‑stage AQM: first a `htb` root with a leaf `fq_codel` class for bulk traffic, and a second leaf `sfq` for low‑latency traffic (e.g., ICMP). Use `tc filter` to direct DSCP‑EF packets to the `sfq` leaf.  
   - Generate a mixed traffic background: 8 TCP flows (`iperf3 -P 8`) and a UDP video stream (`ffmpeg -re -input ... -f rtp udp://dst:5004`).  
   - Measure 95th‑percentile latency of the UDP stream and TCP goodput with and without the AQM.  
   - Provide a brief writeup discussing trade‑offs (latency vs. fairness, CPU overhead of `tc` filters).

## Linux Connection
Network profiling in Linux touches several kernel subsystems and user‑space tools:

| Subsystem / Path | Purpose | Example Interaction |
|------------------|---------|----------------------|
| `net/core/` (sysctl) | Global socket buffer limits (`net.core.rmem_max`, `net.core.wmem_max`) | `sysctl net.core.rmem_max` |
| `net/ipv4/` (sysctl) | TCP auto‑tune ranges (`net.ipv4.tcp_rmem`, `net.ipv4.tcp_wmem`) and congestion control (`net.ipv4.tcp_congestion_control`) | `sysctl net.ipv4.tcp_congestion_control=bbr` |
| `/proc/net/dev` | Per‑device packet counters (rx/tx packets, drops, fifo) | `cat /proc/net/dev | grep eth0` |
| `/sys/class/net/<dev>/statistics/` | Same counters, exposed via sysfs for easy scripting | `cat /sys/class/net/eth0/statistics/rx_drops` |
| `net/sched/` (tc) | Queueing disciplines and traffic shaping | `tc qdisc add dev eth0 root handle 1: htb default 20` |
| `socket(AF_INET, SOCK_STREAM, 0)` + `setsockopt` | Per‑socket buffer control (`SO_RCVBUF`, `SO_SNDBUF`) | See code in Worked Example 2 |
| `ethtool` | NIC ring buffer size (`ethtool -G`), offload features (`ethtool -k`) | `ethtool -G eth0 rx 2048 tx 2048` |
| `ss -i` | Detailed socket info, including `rto`, `cwnd`, `snd_wnd` | `ss -i state established '( dport = :5201 )'` |
| `bpftrace` / `perf` | Observe kernel events like `tcp_retransmit_skb`, `netif_receive_skb` | `bpftrace -e 'tracepoint:net:netif_receive_skb { @[comm] = count(); }'` |

Run a quick diagnostic stack:
```bash
# Show current socket buffer limits
sysctl net.core.rmem_max net.core.wmem_max
# Show TCP auto‑tune ranges
sysctl net.ipv4.tcp_rmem net.ipv4.tcp_wmem
# Show per‑device drop counters
cat /sys/class/net/eth0/statistics/rx_drops
# Show active qdisc
tc -s qdisc show dev eth0
# Show NIC offloads
ethtool -k eth0
# Show current congestion control for a given socket
ss -i state established '( dport = :5201 )' | grep bode
```

## Why This Matters
Understanding how packets move through the Linux networking stack—from NIC rings, through queueing disciplines, into socket buffers, and finally to the application—lets you **pinpoint** where performance is being throttled.  

* If latency spikes while throughput stays high, you likely have **bufferbloat**: an oversized queue or socket buffer that lets packets wait too long. AQM or reduced socket buffers restore low latency.  
* If throughput caps far below the link speed despite low latency, the **bandwidth‑delay product** is not being honored: socket buffers or the TCP congestion window are too small. Raising `rmem_max/wmem_max` or tuning `tcp_rmem/tcp_wmem` lifts the ceiling.  
* If you see many retransmissions but loss counters are low, the problem may be **spurious timeouts** caused by an inflated RTO (mis‑measured RTT) or delayed ACKs; adjusting TCP timers or enabling TCP timestamps fixes it.  

By applying the quantitative models (BDP, Little’s Law, M/M/1 queue) and the concrete Linux knobs demonstrated above, you can **methodically** tune a system for the target workload—whether that’s a low‑latency trading platform, a high‑throughput data‑center fabric, or a real‑time multimedia service. This mastery transforms network profiling from a passive observation into an active lever for performance engineering.
