---
id: 145
title: "Transport layer"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Introduction to Transport Layer
The transport layer sits between the network layer (which offers a best‑effort, unreliable datagram service) and the application layer (which expects process‑to‑process communication). Its fundamental job is to **provide logical channels** that add semantics the network layer does not: reliability, ordering, flow control, and congestion avoidance. Without these guarantees, applications would have to reimplement them, violating the end‑to‑end principle and duplicating effort across the stack.

### TCP (Transmission Control Protocol)
TCP is a **connection‑oriented, byte‑stream protocol** that offers:
* **Reliability** – via acknowledgments (ACKs), sequence numbers, and retransmission timers.
* **In‑order delivery** – the receiver buffers out‑of‑order segments and delivers them to the application only when the next expected sequence number arrives.
* **Flow control** – the receiver advertises a window (`rwnd`) telling the sender how much buffer space is free.
* **Congestion control** – the sender adapts its transmission rate based on inferred network congestion.

These features arise from the need to compensate for the network layer’s *lossy, unordered, and variable‑delay* service. The protocol state machine (LISTEN → SYN_SENT → SYN_RECV → ESTABLISHED → FIN_WAIT_* → …) ensures that both ends agree on initial sequence numbers (ISNs) and can detect duplicated or stale packets.

### UDP (User Datagram Protocol)
UDP is a **connectionless, message‑oriented protocol** that offers:
* **Best‑effort delivery** – no retransmission, no ordering guarantees.
* **Low overhead** – 8‑byte header (source port, destination port, length, checksum) vs. TCP’s ≥20‑byte header.
* **Message boundaries preserved** – each `sendto`/`recvfrom` call corresponds to exactly one IP datagram.

Applications choose UDP when they can tolerate loss (e.g., media streaming) or need to implement their own reliability/congestion mechanisms (e.g., QUIC, DNS over UDP).

### Ports and Sockets
* **Ports** are 16‑bit identifiers (`0–65535`) that demultiplex incoming packets to the correct process.  
  *Well‑known ports* (0‑1023) are assigned by IANA; *registered* (1024‑49151) and *dynamic/ephemeral* (49152‑65535) ranges follow.
* A **socket** is the kernel‑level endpoint: a tuple `(local_ip, local_port, remote_ip, remote_protocol_port)` plus associated buffers and state.  
  In Linux, a socket is represented by a `struct sock` (net/core/sock.h) and, for TCP, a `struct tcp_sock` (net/ipv4/tcp.h). The file descriptor returned by `socket(2)` indexes into the per‑process file table.

### Reliability and Flow Control
Reliability in TCP hinges on **cumulative acknowledgments**: an ACK with sequence number `ACK=n` declares receipt of all bytes `< n`.  
If a segment is lost, the sender detects it via:
* **Duplicate ACKs** (three same ACKs → fast retransmit) or  
* **Retransmission timeout (RTO)**.

Flow control uses the **sliding window**: the sender may transmit up to `min(cwnd, rwnd)` bytes without waiting for an ACK, where `cwnd` is the congestion window and `rwnd` the receiver’s advertised window. The receiver updates `rwnd` in each ACK (`rwnd = RCV.BUF - RCV.NXT`), preventing overflow of its receive buffer.

### Congestion Control
Congestion control prevents **congestion collapse**, a state where excessive retransmissions waste bandwidth and increase delay. TCP’s classic Reno/NewReno algorithm combines:
* **Slow start** – exponential increase of `cwnd` (by 1 MSS per ACK) until a loss event or `ssthresh`.
* **Congestion avoidance** – linear increase (`cwnd += MSS² / cwnd` per ACK).
* **Fast retransmit / fast recovery** – on three duplicate ACKs, retransmit the missing segment and set `cwnd = ssthresh + 3·MSS` (Reno) or `cwnd = ssthresh` (NewReno), then inflate by MSS per duplicate ACK.

Mathematically, let `RTT` be the measured round‑trip time. The **ideal throughput** (ignoring loss) is:
$$
\text{Throughput} \approx \frac{\text{cwnd}}{\text{RTT}} \quad \text{bytes/sec}
$$
When loss occurs, the multiplicative decrease (`cwnd ← cwnd/2`) reduces the sending rate to probe for available bandwidth.

---

## How It Works
### Connection Establishment – Three‑Way Handshake
1. **Client → Server**: `SYN` with `seq = ISN_c`.  
   *Why?* To inform the server of the client’s initial sequence number.
2. **Server → Client**: `SYN‑ACK` with `seq = ISN_s`, `ack = ISN_c + 1`.  
   *Why?* Acknowledges the client’s `SYN` and conveys the server’s ISN.
3. **Client → Server**: `ACK` with `seq = ISN_c + 1`, `ack = ISN_s + 1`.  
   *Why?* Completes bidirectional synchronization; prevents acceptance of delayed duplicate `SYN`s (PAWS algorithm uses timestamps to reject old SYNs).

State transitions (Linux): `TCP_LISTEN → TCP_SYN_RECV → TCP_ESTABLISHED`.

### Data Transfer – Sliding Window & ACK Mechanics
* Sender maintains `send_una` (oldest unacknowledged byte) and `send_nxt` (next byte to send).  
* Receiver maintains `rcv_nxt` (next expected byte) and `rcv_wnd` (available buffer).  
* On each ACK:
  ```
  if (ack > send_una) {
      send_una = ack;
      // free acknowledged data from retransmission queue
  }
  cwnd = update_cwnd(cwnd, ack, dup_ack_cnt);
  ```
* **Delayed ACK** (RFC 1122): receiver may wait up to 200 ms or until a second full‑sized segment arrives before sending an ACK, reducing ACK traffic.
* **Nagle’s algorithm**: buffers small writes until either an ACK arrives or the packet reaches MSS, preventing tiny packets.

### Flow Control in Detail
Receiver advertises:
$$
rwnd = \text{RCV.BUFFER} - (\text{RCV.NXT} - \text{RCV.NXT\_START})
$$
Sender’s **effective window**:
$$
\text{eff\_wnd} = \min(cwnd, rwnd) - (\text{send\_nxt} - \text{send\_una})
$$
If `eff_wnd == 0`, the sender pauses and may send a **zero‑window probe** after the retransmission timeout to learn when the receiver frees space.

### Congestion Control Algorithms (Reno/NewReno)
* **Slow start**:  
  $$ cwnd \leftarrow cwnd + MSS \quad \text{per ACK} $$  
  (exponential growth: after *n* RTTs, `cwnd ≈ 2ⁿ·MSS`).
* **Congestion avoidance**:  
  $$ cwnd \leftarrow cwnd + \frac{MSS^2}{cwnd} \quad \text{per ACK} $$  
  (≈ linear increase of `cwnd` per RTT).
* **On loss (timeout)**:  
  $$ ssthresh \leftarrow \max\left(\frac{cwnd}{2}, 2\cdot MSS\right) $$  
  $$ cwnd \leftarrow 1\cdot MSS $$  
  (restart slow start).
* **On loss (3 dup ACKs)**:  
  $$ ssthresh \leftarrow \max\left(\frac{cwnd}{2}, 2\cdot MSS\right) $$  
  $$ cwnd \leftarrow ssthresh + 3\cdot MSS $$ (Reno)  
  then **fast recovery**: for each additional dup ACK, `cwnd += MSS`; on new ACK, `cwnd = ssthresh`.

Linux exposes these variables via `tcp_info` (see `getsockopt(fd, IPPROTO_TCP, TCP_INFO, ...)`).

---

## Worked Examples
### Example 1: TCP Connection Establishment with Timing
Assume:
* Client ISN = `0x1A2B3C4D`
* Server ISN = `0x9F0E1D2C`
* One‑way propagation delay = `30 ms` (RTT ≈ `60 ms`).

| Time (ms) | Action | Packet | Seq | Ack |
|-----------|--------|--------|-----|-----|
| 0         | Client sends SYN | `SYN` | `0x1A2B3C4D` | — |
| 30        | Server receives SYN | — | — | — |
| 30        | Server sends SYN‑ACK | `SYN‑ACK` | `0x9F0E1D2C` | `0x1A2B3C4E` |
| 60        | Client receives SYN‑ACK | — | — | — |
| 60        | Client sends ACK | `ACK` | `0x1A2B3C4E` | `0x9F0E1D2D` |
| 90        | Server receives ACK | — | — | — |

**Result:** Connection established at *t = 90 ms*. The three‑way exchange guarantees that both sides know each other’s ISN despite possible packet reordering or duplication.

### Example 2: TCP Throughput with Slow Start
Parameters:
* MSS = 1460 bytes
* Initial `cwnd = 10·MSS` (RFC 6928) = 14 600 bytes
* RTT = 50 ms
* No loss until `cwnd` reaches 64 KB.

**Slow start progression** (bytes sent per RTT):
```
RTT0: cwnd = 10·MSS  → 14 600 B
RTT1: cwnd = 20·MSS  → 29 200 B
RTT2: cwnd = 40·MSS  → 58 400 B
RTT3: cwnd = 80·MSS  → 116 800 B (cwnd > 64 KB, switch to avoidance)
```
Throughput after RTT2 (still in slow start):
$$
\frac{58 400\text{ B}}{0.05\text{ s}} = 1.168\text{ MB/s} ≈ 9.34\text{ Mbps}
$$
After entering congestion avoidance at RTT3, increase per RTT ≈ `MSS² / cwnd`:
$$
\Delta cwnd ≈ \frac{1460^2}{116800} ≈ 18.3\text{ B} ≈ 0.0125·MSS
$$
Thus cwnd grows slowly, yielding ~1.2 MB/s steady‑state if loss-free.

### Example 3: UDP Loss Tolerance in a Video Stream
A video encoder sends UDP packets of 1200 bytes (payload) every 20 ms (50 pps).  
Network loss probability `p = 0.02` per packet.

*Expected loss per second*: `50·0.02 = 1` packet lost/s → ~0.08 % of frames missing.  
Since the application can conceal a missing macroblock, the perceptual impact is minimal.  
If the same stream used TCP, a single loss would trigger a retransmission, adding at least one RTT (≈100 ms) of delay—unacceptable for real‑time playback.

### Example 4: Congestion Control Reaction to Loss
Assume:
* Initial `cwnd = 10·MSS`, `ssthresh = 64 KB`
* RTT = 100 ms
* Loss detected via 3 duplicate ACKs when `cwnd = 30·MSS` (≈43.8 KB).

**Fast retransmit/recovery (Reno):**
```
ssthresh = max(cwnd/2, 2·MSS) = max(15·MSS, 2·MSS) = 15·MSS
cwnd = ssthresh + 3·MSS = 18·MSS
```
After recovery, each new ACK adds MSS:
```
cwnd grows by 1·MSS per RTT → linear increase.
```
If instead a timeout occurred:
```
ssthresh = max(cwnd/2, 2·MSS) = 15·MSS
cwnd = 1·MSS
```
and slow start resumes, causing a drastic throughput dip.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Assuming a single `send()` transmits all bytes** | `send()` may return fewer bytes than requested due to buffer limits or non‑blocking mode. | Loop until the requested count is sent, handling `EAGAIN/EWOULDBLOCK` on non‑blocking sockets. |
| 2 | **Ignoring the TCP timestamp option (PAWS)** | Without timestamps, old duplicate segments from a previous incarnation of a connection can be accepted, causing data corruption. | Enable `TCP_TIMESTAMPS` (`setsockopt(fd, IPPROTO_TCP, TCP_TIMESTAMP, &val, sizeof(val))`) or rely on the kernel’s default (enabled since Linux 2.6). |
| 3 | **Using `connect()` on a UDP socket and expecting reliability** | `connect()` merely sets a default destination; UDP remains un‑reliable. | If reliability is needed, implement application‑level ACK/retransmission or switch to TCP. |
| 4 | **Failing to set `SO_REUSEADDR` before binding** | After a server closes, the port stays in `TIME_WAIT` (≈2 × MSL). Subsequent binds fail with “Address already in use”. | Call `setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one))` before `bind()`. |
| 5 | **Not checking return values of `recv()`** | `recv()` can return 0 (peer closed) or –1 (error). Treating –1 as data leads to silent corruption. | Test `if (n <= 0) { if (n == 0) …peer closed; else if (errno != EAGAIN) …error; }` |
| 6 | **Using blocking sockets in high‑concurrency servers** | Each connection blocks a thread, limiting scalability (C10k problem). | Use I/O multiplexing (`poll`, `epoll`, `kqueue`) or asynchronous frameworks (`libuv`, `boost::asio`). |
| 7 | **Disabling Nagle’s algorithm indiscriminately** | `TCP_NODELAY` removes small‑packet buffering, increasing overhead on interactive protocols that send many tiny writes. | Enable `TCP_NODELAY` only for latency‑sensitive bulk data (e.g., HTTP/2 after headers) or use `TCP_CORK` to batch writes intentionally. |
| 8 | **Assuming UDP checksum offload means no verification** | NICs may compute the checksum on transmission, but the receiver still validates it; a malformed checksum leads to packet drop. | Never rely on offload to skip checksum validation; keep `net.ipv4.ip_no_pmtu_disc` and related sysctls at defaults unless you fully understand the trade‑off. |

---

## Exercises
### Easy
1. **UDP Echo** – Write a C program that creates a UDP socket (`SOCK_DGRAM`), binds to port 9000, receives a message, and sends the same data back to the sender’s address. Test with `netcat -u localhost 9000`.  
2. **TCP Port Scanner (connect‑scan)** – Using a blocking TCP socket, attempt `connect()` to ports 1‑1024 on `127.0.0.1` with a 200 ms timeout (`setsockopt(..., SO_RCVTIMEO)`). Print open ports.  

### Medium
3. **TCP Throughput Measurer** – Implement a client that opens a TCP socket to a server (you provide), sends a fixed‑size buffer (e.g., 64 KB) in a loop, and measures the elapsed time. Vary the socket send buffer size (`SO_SNDBUF`) and observe the effect on throughput. Plot throughput vs. buffer size.  
4. **Select‑Based TCP Server** – Write a server that uses `select()` to handle multiple simultaneous clients, echoing back received data. Ensure it correctly handles partial reads and `EAGAIN`.  

### Hard
5. **User‑Space Congestion Control** – Using raw sockets (`socket(AF_INET, SOCK_RAW, IPPROTO_TCP)`) or a TUN/TAP device, implement a simplified TCP sender that follows the Reno slow‑start/congestion‑avoidance algorithm. Log `cwnd` after each ACK and compare its growth to the theoretical formulas.  
6. **eBPF TCP Monitoring** – Attach an eBPF program to the `tcp_sendmsg` kernel tracepoint to record the current `cwnd`, `ssthresh`, and `rtt` for each outgoing segment. Userspace should aggregate and plot cwnd evolution over time for a real web download (e.g., `wget https://speed.hetzner.de/100MB.bin`).  

---

## Linux Connection
### Subsystems and Data Structures
* **TCP implementation** – `net/ipv4/tcp_ipv4.c` (protocol ops), `net/ipv4/tcp.c` (core finite‑state machine), `net/ipv4/tcp_input.c` / `tcp_output.c`.  
* **UDP implementation** – `net/ipv4/udp.c`.  
* **Socket layer** – `net/core/sock.c` (generic `struct sock`), `net/ipv4/af_inet.c` (AF_INET specific ops).  
* **Key structs**  
  * `struct sock` – common fields: `sk_rcvbuf`, `sk_sndbuf`, `sk_state`, `sk_data_ready`, `sk_write_space`.  
  * `struct inet_connection_sock` – inherits `struct sock`, adds `icsk_ca_ops` (congestion control ops), `icsk_rto`.  
  * `struct tcp_sock` – contains `snd_una`, `snd_nxt`, `rcv_nxt`, `snd_wnd`, `rcv_wnd`, `cwnd`, `ssthresh`, `mss_cache`, `tcp_header_len`.  

### Inspecting TCP State
```bash
# Show all TCP sockets with detailed info
ss -tinap

# Show per‑connection statistics (cwnd, ssthresh, rtt, retrans)
ss -ti state established '( dport = :80 or sport = :80 )'

# View kernel TCP tunables
sysctl net.ipv4.tcp_congestion_control   # e.g., cubic, bbr, reno
sysctl net.ipv4.tcp_rmem                 # min, default, max receive buffer
sysctl net.ipv4.tcp_wmem                 # min, default, max send buffer

# Per‑process socket info
ls -l /proc/<pid>/fd/   # socket symlinks point to socket:[<inode>]
cat /proc/<pid>/net/tcp # lists IPv4 TCP sockets for the process
```

### Retrieving TCP Info via `getsockopt`
```c
#include <sys/socket.h>
#include <netinet/tcp.h>
#include <stdio.h>
#include <unistd.h>

int main(void) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    /* ... connect ... */
    struct tcp_info info;
    socklen_t len = sizeof(info);
    if (getsockopt(fd, IPPROTO_TCP, TCP_INFO, &info, &len) == 0) {
        printf("cwnd=%u  ssthresh=%u  rtt=%u.%03u ms\n",
               info.tcpi_cwnd, info.tcpi_snd_ssthresh,
               info.tcpi_rtt / 1000, info.tcpi_rtt % 1000);
    }
    close(fd);
    return 0;
}
```
Compile with `gcc -Wall -o tcpinfo tcpinfo.c`.

### Real‑World Tool Examples
* **`netstat -antp`** – legacy, shows listening/established TCP sockets with PID/program.  
* **`ss -s`** – summary statistics (allocated, orphaned, tw sockets).  
* **`tcptrace`** – offline analysis of pcap files to plot cwnd, RTT, retransmissions.  
* **`iptables -t m
