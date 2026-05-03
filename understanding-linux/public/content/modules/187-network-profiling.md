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

## Module 187: Network Profiling — Packet Drops, Retransmissions, Queueing, and Socket Buffers

## Why This Matters

A server can have zero application errors while silently retransmitting 5% of all TCP segments. The application never sees the drops — TCP hides them — but throughput is halved and latency spikes every time a retransmission stalls a connection for one RTO. The kernel maintains precise counters for every drop, retransmission, queue overflow, and buffer prune event. Profiling means reading those counters, mapping them to specific kernel subsystems, and knowing which tunable fixes which failure mode. Getting that mapping wrong — increasing socket buffers when the problem is NIC ring overflow — wastes time and changes nothing.

---

## Core Concepts

### Packet Drops

A drop is a deliberate discard by software or firmware because a bounded resource — a ring, a queue, a buffer — was full when a new item arrived. The resource determines both the symptom and the fix:

**NIC RX ring buffer overflow.** The NIC writes incoming packets into a DMA ring of pre-allocated descriptors. The kernel's NAPI poll loop drains the ring; if it cannot drain fast enough (soft IRQ budget exhausted, single-CPU bottleneck), the ring fills and the NIC drops at the hardware level — the packet never enters kernel memory. The counter is visible in `ethtool -S eth0` as `rx_missed_errors` or `rx_fifo_errors` depending on the driver. The fix is either increasing the ring size (`ethtool -G eth0 rx 4096`) or distributing interrupts across CPUs via RSS.

**Socket receive buffer prune.** The kernel has received the packet and placed it in the socket's receive queue. The application is not calling `read()` fast enough, so the per-socket buffer fills. When it fills, the kernel prunes incoming segments. The counter is `TcpExtRcvPruned` in `/proc/net/netstat`. The fix is increasing `SO_RCVBUF` or raising `net.ipv4.tcp_rmem`'s max, which governs autotuning.

**SYN backlog overflow.** A listening socket maintains two queues: the SYN backlog (half-open connections awaiting the final ACK) and the accept queue (fully established connections awaiting `accept()`). Under a connection storm, the SYN backlog fills — governed by `net.ipv4.tcp_max_syn_backlog` — and the kernel drops incoming SYNs silently. The client retransmits the SYN after its RTO, so the symptom is slow connection establishment, not a refused connection. The counter is `TcpExtTCPSynRetrans` (nstat) and `ListenDrops` in `/proc/net/netstat`.

These three drops happen at three different layers, and no single counter captures all of them. Profiling requires checking all three.

### Retransmissions

Every retransmission proves that a segment was lost, corrupted in transit, or that its ACK was lost. The cost is not just the extra bandwidth: the sender's congestion window shrinks, reducing throughput for the entire connection for many subsequent RTTs, not just the one stall.

**Timeout-based retransmit (RTO).** The sender waits for the RTO to expire, then retransmits the oldest unacknowledged segment and halves the congestion window (entering slow start on the second consecutive timeout). The minimum RTO in Linux is 200 ms by default (`net.ipv4.tcp_rto_min`). A single timeout on a low-latency LAN connection — where the true RTT is 0.1 ms — means a 2000× penalty relative to the actual path delay.

**Fast retransmit.** Three duplicate ACKs tell the sender that exactly one segment is missing (the receiver is acknowledging everything up to the gap). The sender retransmits immediately without waiting for RTO and reduces the congestion window by less. Fast retransmit fires for isolated drops; RTO fires when multiple segments are lost or the receiver goes silent.

The ratio $\frac{\text{retransmitted segments}}{\text{total segments sent}}$ is the primary per-host signal that the network path, not the server, is the bottleneck. Values above 0.1% on a datacenter LAN warrant investigation.

### Queueing

**NIC TX queue (`txqueuelen`).** The kernel enqueues outgoing packets here before handing them to the driver. Too short: burst drops. Too long: bufferbloat — packets queue for tens of milliseconds behind a burst, adding latency. Byte Queue Limits (BQL) dynamically adjust the effective length to keep the NIC busy while minimizing queue depth. BQL state per queue is in `/sys/class/net/eth0/queues/tx-0/byte_queue_limits/`.

**SYN backlog and accept queue.** Distinct queues with distinct overflow behaviors. SYN backlog overflow drops the SYN (or, if `net.ipv4.tcp_syncookies=1`, issues a SYN cookie and skips the backlog entirely). Accept queue overflow drops the final ACK of the handshake — the connection is established on the client but the server never calls `accept()` on it; the client sees a connected socket that the server immediately closes on the next data packet. The accept queue depth is bounded by `min(backlog, net.core.somaxconn)` where `backlog` is the argument to `listen(2)`.

**Socket send and receive buffers.** Application data pending transmission sits in the send buffer; received segments not yet read by the application sit in the receive buffer. These are the throughput-governing queues — see Socket Buffers below.

A queue that is persistently at capacity is a throughput bottleneck. A queue that occasionally spikes to capacity is absorbing a burst correctly. The distinction matters: raising a persistently-full queue's limit just delays the point of overflow.

### Socket Buffers

The TCP receive window — the maximum number of unacknowledged bytes the sender is allowed to have in flight — is bounded by the receiver's buffer size. The bandwidth-delay product is the amount of data that must be in flight simultaneously to saturate a path:

$$\text{BDP} = \text{bandwidth} \times \text{RTT}$$

For a 10 Gbps link with 50 ms RTT:

$$\text{BDP} = 10 \times 10^9\ \text{bit/s} \times 0.05\ \text{s} = 5 \times 10^8\ \text{bits} = 62.5\ \text{MB}$$

If the receive buffer is 6 MB (the Linux default max), the sender is capped to 6 MB in flight regardless of link capacity. Maximum achievable throughput is then:

$$\text{throughput}_{\max} = \frac{\text{buffer}_{\text{rx}}}{\text{RTT}} = \frac{6 \times 10^6 \times 8\ \text{bits}}{0.05\ \text{s}} = 960\ \text{Mbps}$$

on a 10 Gbps link — a 90% throughput loss caused entirely by an undersized buffer. The formula generalizes: for any target throughput $T$ and measured RTT, the minimum required buffer is:

$$\text{buffer}_{\min} = \frac{T \times \text{RTT}}{8}$$

---

## How It Works

### The Retransmission State Machine

The kernel estimates the path RTT with an exponential moving average (RFC 6298):

$$\text{SRTT}_{n} = (1 - \alpha)\cdot\text{SRTT}_{n-1} + \alpha\cdot\text{RTT}_{n}, \quad \alpha = \frac{1}{8}$$

The mean deviation tracks RTT variance:

$$\text{RTTVAR}_{n} = (1 - \beta)\cdot\text{RTTVAR}_{n-1} + \beta\cdot|\text{SRTT}_{n} - \text{RTT}_{n}|, \quad \beta = \frac{1}{4}$$

The RTO is derived from both:

$$\text{RTO} = \text{SRTT} + 4\cdot\text{RTTVAR}$$

clamped to $[\text{RTO}_{\min},\ \text{RTO}_{\max}]$ = $[200\ \text{ms},\ 120\ \text{s}]$ by default. On each timeout, the kernel doubles the RTO (exponential backoff):

$$\text{RTO}_{k} = \min\!\left(2^k \cdot \text{RTO}_0,\ 120\ \text{s}\right)$$

After `net.ipv4.tcp_retries2` consecutive timeouts (default 15), the kernel abandons the connection. With 15 doublings from 200 ms, the cumulative wait before abandonment is:

$$\sum_{k=0}^{14} \min(2^k \times 0.2,\ 120)\ \text{s} \approx 924\ \text{s}$$

— over 15 minutes. A connection to a dead host does not disappear quickly.

The kernel tracks per-connection retransmit state in `struct tcp_sock` (`include/linux/tcp.h`), specifically the fields `retransmits`, `snd_ssthresh`, and `icsk_retransmit_timer` in the embedded `struct inet_connection_sock`.

### Socket Buffer Autotuning

Linux grows socket buffers dynamically based on observed receive bandwidth. The sysctls define the autotuning envelope:

```bash
sysctl net.ipv4.tcp_rmem   # [min, default, max] for receive buffers
sysctl net.ipv4.tcp_wmem   # [min, default, max] for send buffers
sysctl net.ipv4.tcp_mem    # [pressure, pressure, max] in pages for all TCP sockets combined
```

Each new connection starts at `default`. The kernel calls `tcp_rcv_space_adjust()` on each ACK to grow the buffer toward `max` if the connection can use more bandwidth. Autotuning is disabled per-socket if the application calls `setsockopt(SO_RCVBUF)` directly — an explicit value pins the
