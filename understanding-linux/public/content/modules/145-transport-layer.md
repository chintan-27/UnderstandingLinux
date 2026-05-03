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

## Why This Matters

The network layer is deliberately dumb: it drops packets when router buffers overflow, reorders them when routing tables change mid-flight, and delivers corrupted ones unless the link layer catches the error first. Every application that needs ordered, reliable data delivery would have to solve retransmission, duplicate detection, and rate control independently — and would solve them incompatibly. More importantly, without coordinated rate control, a single aggressive sender triggers **congestion collapse**: retransmissions consume all available bandwidth, leaving no capacity for useful data. This isn't theoretical — in 1986, ARPANET throughput dropped by a factor of 1000 because TCP didn't yet implement congestion control. Van Jacobson's 1988 algorithms (slow start, congestion avoidance, fast retransmit) fixed this, and their core logic still runs in every Linux kernel today.

---

## Core Concepts

### Ports: Multiplexing Connections onto One Host

An IP address identifies a machine. A port identifies a process endpoint. The kernel demultiplexes incoming segments using the full **5-tuple**: `(protocol, src_ip, src_port, dst_ip, dst_port)`. Two browser tabs connecting to the same server get different ephemeral source ports, so they map to different socket structures in the kernel despite sharing the same destination.

Port ranges are enforced by the kernel, not convention:
- **0–1023**: well-known; `bind()` requires `CAP_NET_BIND_SERVICE`
- **1024–49151**: registered; userspace can bind freely
- **49152–65535**: ephemeral; assigned by the kernel when the application doesn't call `bind()`

The ephemeral range on Linux is configurable:

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
# typical output: 32768	60999
```

When the kernel assigns an ephemeral port, it searches this range for a 5-tuple that isn't already in use. If the range is exhausted — common on high-connection-rate servers — `connect()` returns `EADDRNOTAVAIL`.

### UDP: Unreliable but Precisely Minimal

UDP adds ports and an optional checksum to raw IP, and nothing else. A single `sendto()` produces exactly one IP datagram. There is no connection state, no kernel buffer management, no retransmission. The checksum covers the header, payload, and a pseudo-header (src IP, dst IP, protocol, length) — which is why a corrupted IP header that changes the destination can still be caught.

UDP is the right transport when:
- **Latency dominates correctness** (DNS, NTP, online games): a retransmitted DNS response that arrives after the timeout is useless
- **The application owns reliability** (QUIC implements its own selective acknowledgment and congestion control on top of UDP, gaining TLS integration and stream multiplexing without TCP's head-of-line blocking)
- **Multicast or broadcast is required** (TCP is point-to-point by design)

```c
// Minimal UDP send — one syscall, one datagram
int fd = socket(AF_INET, SOCK_DGRAM, 0);
struct sockaddr_in dst = {
    .sin_family = AF_INET,
    .sin_port   = htons(53),
    .sin_addr   = { .s_addr = inet_addr("8.8.8.8") },
};
sendto(fd, buf, len, 0, (struct sockaddr *)&dst, sizeof(dst));
```

### TCP: Reliable Byte Stream

TCP delivers the abstraction of an infinite, lossless, ordered byte pipe. The implementation underneath involves segment numbering, cumulative acknowledgment, retransmission, receive buffering for reordering, and two separate rate controllers (flow control and congestion control). Each byte in the stream has an implicit position tracked by the sequence number. The application reads from a socket buffer; it never sees segment boundaries.

Connection setup requires a **three-way handshake** because both sides must synchronize their initial sequence numbers (ISNs), and each side must confirm that the other's ISN was received:

```
Client                          Server
  |-- SYN (seq=x) ------------->|   client picks ISN x
  |<-- SYN-ACK (seq=y, ack=x+1)-|   server picks ISN y, acks x
  |-- ACK (ack=y+1) ----------->|   client acks y
```

ISNs are randomized to prevent **TCP sequence prediction attacks**, where a third party injects segments into an existing connection by guessing valid sequence numbers.

---

## How It Works

### TCP Segment Structure

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|          Source Port          |       Destination Port        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Sequence Number                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Acknowledgment Number                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Data |           |U|A|P|R|S|F|                               |
| Offset| Reserved  |R|C|S|S|Y|I|            Window             |
|       |           |G|K|H|T|N|N|                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           Checksum            |         Urgent Pointer        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

Key fields:

- **Sequence Number**: byte offset of the first data byte in this segment, relative to the ISN. SYN and FIN each consume one sequence number even though they carry no data — this ensures their loss can be detected and they can be retransmitted.
- **Acknowledgment Number**: the next byte the receiver expects. An ACK of $N$ means all bytes through $N-1$ have been received and buffered correctly. This is **cumulative**: one ACK implicitly acknowledges all earlier segments.
- **Window**: the receiver's current `rwnd` in bytes — how much additional data the sender may transmit beyond the last acknowledged byte. The 16-bit field limits this to 65535 bytes; the **Window Scale** TCP option (negotiated at handshake) left-shifts this by up to 14 bits, allowing windows up to $65535 \times 2^{14} \approx 1$ GB, necessary for high-BDP paths.
- **Data Offset**: header length in 32-bit words. Minimum is 5 (20 bytes, no options); maximum is 15 (60 bytes).

The kernel represents a socket's send/receive state in `struct tcp_sock`, defined in `include/linux/tcp.h`. Relevant fields include `snd_una` (oldest unacknowledged byte), `snd_nxt` (next byte to send), `rcv_nxt` (next byte expected from peer), and `rcv_wnd` (current receive window being advertised).

### Reliability: Retransmission and RTT Estimation

TCP cannot know in advance how long a round trip takes — it varies with path, load, and routing. The **Retransmission Timeout (RTO)** must be long enough that a legitimate slow ACK isn't confused with a lost segment, but short enough that loss is detected quickly.

RFC 6298 defines the estimator. On each ACK, compute a new RTT sample $R$, then update:

$$SRTT \leftarrow (1 - \alpha) \cdot SRTT + \alpha \cdot R, \quad \alpha = \tfrac{1}{8}$$

$$RTTVAR \leftarrow (1 - \beta) \cdot RTTVAR + \beta \cdot |SRTT - R|, \quad \beta = \tfrac{1}{4}$$

$$RTO = SRTT + 4 \cdot RTTVAR$$

The $4 \cdot RTTVAR$ term is deliberate: it makes the RTO margin proportional to RTT variance. A stable low-latency LAN path gets a tight RTO; a high-variance cellular path gets a wider one. The minimum RTO is 1 second (RFC 6298 §2.4) to avoid spurious retransmissions on slow paths.

On RTO expiry, TCP retransmits the earliest unacknowledged segment and doubles the RTO — **exponential backoff**:

$$RTO \leftarrow 2 \cdot RTO$$

This prevents a retransmission storm into an already-congested network. The doubling continues up to a ceiling (typically 120 seconds on Linux, configurable via `/proc/sys/net/ipv4/tcp_retries2`).

**Fast retransmit** bypasses the RTO entirely. When a segment is lost but later segments arrive, the receiver cannot ACK the missing data — it keeps sending ACKs for the last in-sequence byte received (duplicate ACKs). Three duplicate ACKs indicate that at least three segments arrived after the gap, making it highly probable the missing segment is lost (not merely reordered). The sender retransmits immediately. The threshold of three is a heuristic: one or two duplicates plausibly result from reordering; three almost always mean loss.

```bash
# Watch retransmit counters in real time
watch -n1 'ss -s'
# Or per-connection retransmit count:
ss -tin dst 93.184.216.34
# Look for: retrans:X/Y  (segments retransmitted / total retransmissions)
```

### Flow Control: Protecting the Receiver

The receive buffer has finite size. If the sender pushes data
