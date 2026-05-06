---
id: 141
title: "Networking fundamentals"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Layering and Encapsulation
Layering exists to **decouple concerns**: each layer implements a well‑defined service for the layer above while hiding its own complexity. This enables independent evolution (e.g., replacing Ethernet with Wi‑Fi without touching IP) and facilitates reuse (the same TCP implementation runs over many link layers).  

Encapsulation is the concrete mechanism: when a layer passes data down, it **prepends a header** (and sometimes appends a trailer) that contains control information needed by the peer layer. The header size determines the **maximum payload** that can be carried without fragmentation:

\[
\text{Payload}_{\text{max}} = \text{MTU} - \sum_{i=1}^{L} H_i
\]

where \(MTU\) is the maximum transmission unit of the link layer and \(H_i\) are header sizes of layers \(L\) (e.g., Ethernet II = 14 B, IPv4 = 20 B, TCP = 20 B → payload = 1500 − 54 = 1446 B).  

If the payload exceeds this limit, the network layer must **fragment** the packet, incurring reassembly overhead and increased loss probability (a fragment loss discards the whole original packet). Hence, applications often tune their **MSS** (Maximum Segment Size) to avoid IP fragmentation:

\[
\text{MSS} = \text{MTU} - (H_{\text{IP}} + H_{\text{TCP}})
\]

### Framing
At the data‑link layer, a raw bit stream is meaningless without **synchronization** and **error detection**. Framing solves both:

* **Synchronization** – a preamble (e.g., 7 bytes of 0x55 + 0xD5 in Ethernet) lets the receiver lock onto the clock.
* **Error detection** – a trailer containing a Frame Check Sequence (FCS), typically a CRC‑32 polynomial \(x^{32}+x^{26}+x^{23}+x^{22}+x^{16}+x^{12}+x^{11}+x^{10}+x^{8}+x^{7}+x^{5}+x^{4}+x^{2}+x+1\), lets the receiver detect any burst of up to 32‑bit errors with probability \(1-2^{-32}\).

A frame therefore consists of:

```
[Preamble][SFD][Dest MAC][Src MAC][Etype][Payload][FCS]
```

### Packets and the Network Layer
The network layer’s job is **host‑to‑host delivery** across heterogeneous links. It adds a logical address (IPv4/IPv6) and optionally performs fragmentation. Key fields in an IPv4 header:

| Field          | Size (bits) | Purpose |
|----------------|-------------|---------|
| Version        | 4           | 4 for IPv4 |
| IHL            | 4           | Header length in 32‑bit words |
| DSCP/ECN       | 6+2         | QoS / congestion |
| Total Length   | 16          | Entire packet size (bytes) |
| Identification | 16          | Fragment identification |
| Flags/Offset   | 3+13        | Fragment control |
| TTL            | 8           | Hop limit (prevents loops) |
| Protocol       | 8           | Upper‑layer protocol (TCP=6, UDP=17) |
| Header Checksum| 16          | One’s‑complement sum of header |
| Src/Dst Addr   | 32 each     | IP addresses |
| Options        | variable    | Rarely used; padded to 32‑bit boundary |

The **header checksum** is recomputed at every router because TTL changes; it is a simple one’s‑complement sum that detects bit‑flips with high probability.

### Switching
Switching moves frames **within a single broadcast domain**. Two fundamental modes:

* **Store‑and‑Forward** – the entire frame is received, CRC verified, then forwarded. Latency = frame length / link speed + processing delay. Guarantees error‑free forwarding.
* **Cut‑Through** – forwarding begins after reading the destination address (first 14 bytes of Ethernet). Latency ≈ address length / link speed. Faster but may forward corrupt frames; modern ASICs often use **adaptive cut‑through** (switch to store‑and‑forward if error rate rises).

The choice impacts **throughput** under load. For a 1 Gbps link, storing a 1500‑byte frame adds ~12 µs of latency; cut‑through saves ~10 µs but risks retransmissions if error rate > 10⁻⁵.

### Routing
Routing determines the **next‑hop** for a packet whose destination lies outside the local link. It relies on a **routing table** populated by static configuration or dynamic protocols (RIP, OSPF, BGP). The lookup algorithm is **longest prefix match (LPM)**: among all entries where \((\text{dest} \& \text{mask}) = \text{network}\), choose the one with the largest mask (most specific route).  

LPM can be implemented with a **trie** (binary or Patricia) yielding O(W) lookup where W = address width (32 for IPv4, 128 for IPv6). In Linux, the FIB (Forwarding Information Base) uses a **radix tree** (trie with path compression) for both speed and memory efficiency.

The routing table also stores the **preference** (admin distance) and **metrics** (e.g., OSPF cost). When multiple protocols supply routes for the same prefix, the lowest admin distance wins; ties are broken by metric.

## How It Works
### End‑to‑End Data Flow (TCP Example)
1. **Application** – data is written to a socket; TCP segments it according to MSS.
2. **Transport (TCP)** – adds a TCP header (seq/ack, window, flags, checksum). The checksum includes a **pseudo‑header** (src/dst IP, zero, protocol, TCP length) to bind the segment to the IP layer, providing end‑to‑end error detection.
3. **Network (IP)** – encapsulates the segment in an IP header, performs fragmentation if needed (unlikely if MSS respected). The IP header’s TTL is set (commonly 64).
4. **Data Link (Ethernet)** – builds a frame: preamble, SFD, MAC addresses, EtherType (0x0800 for IPv4), payload (the IP packet), FCS. The frame is handed to the NIC driver.
5. **Physical** – NIC encodes bits (e.g., NRZ for copper, PAM‑4 for 10GBASE‑R) and transmits onto the medium.

At each hop, routers repeat steps 3‑5: they **de‑encapsulate** to IP, decrement TTL, recompute header checksum, look up next hop via LPM, then re‑encapsulate into a new link‑layer frame appropriate for the outgoing interface.

### Timing and Bandwidth‑Delay Product
The **bandwidth‑delay product (BDP)** quantifies how many bits can “fill the pipe”:

\[
\text{BDP} = \text{Bandwidth} \times \text{RTT}
\]

For a 100 Mbps link with 30 ms RTT, BDP = 3 Mbit ≈ 375 KB. If the TCP receive window is smaller than BDP, the link is underutilized. Linux exposes the window via `/proc/sys/net/ipv4/tcp_rmem` (min, default, max). Adjusting `tcp_window_scaling` (option `SO_SNDBUF`/`SO_RCVBUF`) allows windows > 64 KB.

### Congestion Control (High‑Level)
TCP’s congestion avoidance approximates **additive increase/multiplicative decrease (AIMD)**:

* On each ACK (no loss): increase cwnd by \( \frac{1}{\text{cwnd}} \) MSS → roughly linear growth.
* On loss (triple duplicate ACK or timeout): set cwnd = cwnd/2 (or 1 MSS on timeout).

This yields a saw‑tooth whose average throughput approximates:

\[
\text{Throughput} \approx \frac{\text{MSS}}{\text{RTT} \sqrt{2p/3}}
\]

where \(p\) is packet loss probability (Mathis formula). Understanding this explains why lossy wireless links severely limit TCP performance.

## Worked Examples
### Example 1: Sending a TCP Packet via the Socket API
```c
/* tcp_send.c – send a 1000‑byte buffer to 8.8.8.8:80 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netinet/tcp.h>   /* for TCP_NODELAY */

int main(void) {
    int sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd < 0) {
        perror("socket");
        return 1;
    }

    /* Disable Nagle’s algorithm for low‑latency demo */
    int flag = 1;
    setsockopt(sockfd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));

    struct sockaddr_in serv = {0};
    serv.sin_family = AF_INET;
    serv.sin_port   = htons(80);          /* HTTP */
    if (inet_pton(AF_INET, "8.8.8.8", &serv.sin_addr) <= 0) {
        perror("inet_pton");
        close(sockfd);
        return 1;
    }

    if (connect(sockfd, (struct sockaddr *)&serv, sizeof(serv)) < 0) {
        perror("connect");
        close(sockfd);
        return 1;
    }

    const size_t payload_len = 1000;
    char *payload = calloc(1, payload_len);
    if (!payload) { perror("calloc"); close(sockfd); return 1; }
    /* Fill with a known pattern for later verification */
    for (size_t i = 0; i < payload_len; ++i) payload[i] = (char)(i & 0xFF);

    ssize_t sent = send(sockfd, payload, payload_len, 0);
    if (sent != (ssize_t)payload_len) {
        perror("send");
        free(payload);
        close(sockfd);
        return 1;
    }
    printf("Sent %zd bytes\n", sent);

    free(payload);
    close(sockfd);
    return 0;
}
```
**Explanation of steps**

1. `socket(AF_INET, SOCK_STREAM, 0)` creates a TCP endpoint (returns file descriptor).  
2. `setsockopt(..., TCP_NODELAY, ...)` disables the Nagle algorithm; without it, TCP would buffer small writes to improve efficiency, adding latency unsuitable for this demonstration.  
3. `inet_pton` converts the dotted‑decimal address to binary network order (big‑endian).  
4. `connect` performs the three‑way handshake (SYN, SYN‑ACK, ACK) – the kernel exchanges SYN packets with sequence numbers chosen randomly (RFC 793 §3.3).  
5. `send` copies the user buffer into kernel socket buffers, then TCP adds its header (20 B) and calculates the checksum over the TCP segment + pseudo‑header. The resulting IP packet is passed to `ip_queue_xmit`, which adds the IPv4 header (20 B) and hands the frame to the NIC driver (`dev_queue_xmit`).  
6. The NIC driver builds the Ethernet frame, appends the FCS, and transmits via the PHY.

**Validation** – On another terminal run:
```bash
sudo tcpdump -i eth0 -nn -s 0 -A 'tcp port 80 and host 8.8.8.8'
```
You will see the payload pattern (`00 01 02 …`) inside the TCP data segment, confirming the user data reached the wire intact.

### Example 2: Static Routing Between Two Subnets
Consider two LANs:
* **LAN‑A**: 192.168.1.0/24, gateway R1 at 192.168.1.1  
* **LAN‑B**: 10.0.0.0/24, gateway R2 at 10.0.0.1  

R1 and R2 are connected via a point‑to‑point link 172.16.0.0/30 (R1 = 172.16.0.1, R2 = 172.16.0.2).

**Step‑by‑step on R1**

1. **Enable IP forwarding** (kernel option):
   ```bash
   sudo sysctl -w net.ipv4.ip_forward=1
   ```
2. **Add interface addresses** (assuming eth0 = LAN‑A, eth1 = link to R2):
   ```bash
   sudo ip addr add 192.168.1.1/24 dev eth0
   sudo ip addr add 172.16.0.1/30 dev eth1
   sudo ip link set eth0 up
   sudo ip link set eth1 up
   ```
3. **Add route to LAN‑B** via the point‑to‑point link:
   ```bash
   sudo ip route add 10.0.0.0/24 via 172.16.0.2 dev eth1
   ```
   The kernel inserts this entry into the FIB (forwarding information base).  
4. **Verify** with `ip route show`:
   ```
   default via 192.168.1.254 dev eth0 
   10.0.0.0/24 via 172.16.0.2 dev eth1 
   172.16.0.0/30 dev eth1 proto kernel scope link src 172.16.0.1 
   192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.1 
   ```

**Packet flow** (host A = 192.168.1.10 → host B = 10.0.0.20):

* Host A sends IP packet (dst = 10.0.0.20).  
* Its ARP cache resolves 192.168.1.1 → MAC of R1’s eth0; frame sent to R1.  
* R1 receives frame, strips Ethernet header, sees dst = 10.0.0.20.  
* FIB lookup: longest prefix match yields `10.0.0.0/24 via 172.16.0.2 dev eth1`.  
* R1 decrements TTL, recalculates IP header checksum, builds new Ethernet frame with src = MAC(eth1), dst = MAC of R2’s eth1 (via ARP on 172.16.0.2), and transmits.  
* R2 performs analogous steps, delivering the frame to host B.

If the `via` address were omitted (mistake), the kernel would treat the destination as directly reachable on eth0, ARP for 10.0.0.20 would fail, and the packet would be dropped—illustrating why **next‑hop** must be on a locally connected subnet.

## Common Mistakes
| # | Mistake | Why It’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Assuming TCP guarantees in‑order delivery at the link layer** | TCP provides ordered byte stream **after** reassembly at the receiver; lower layers may deliver frames out of order (e.g., wireless retransmissions, Ethernet frame reordering in switches). | Applications that rely on per‑frame ordering (e.g., custom protocols) will see gaps or duplicates. |
| 2 | **Setting MTU > 1500 on Ethernet without enabling jumbo frames** | Ethernet standard MTU is 1500 B; exceeding it causes frames to be silently dropped by NICs or switches that don’t support jumbo frames. | Persistent packet loss, apparent “network latency”. |
| 3 | **Neglecting to adjust TCP MSS for VPN overhead** | A VPN adds encapsulation (e.g., 20 B IP + 8 B UDP for GRE). If MSS stays at 1460 B, the inner TCP segment + VPN headers may exceed the physical MTU, triggering IP fragmentation and possible loss. | Reduced throughput, increased latency due to fragmentation/reassembly. |
| 4 | **Using `route add -net` with an incorrect netmask (e.g., /24 for a /26 subnet)** | The kernel installs a route that claims a larger address space than actually owned; packets for addresses outside the real subnet are incorrectly forwarded, causing **black‑holing** or misrouting. | Traffic loss for legitimate hosts, possible security exposure. |
| 5 | **Believing that `ping` loss percentage directly measures available bandwidth** | `ping` uses ICMP Echo, which is often rate‑limited or deprioritized; loss can stem from congestion control policies, not link capacity. | Misdiagnosis of congestion; over‑provisioning or under‑utilization of links. |
| 6 | **Leaving `tcp_timestamps` disabled on high‑BDP links** | TCP timestamps (RFC 1323) protect against PAWS (Protection Against Wrapped Sequence) and enable RTT measurement; without them, large windows can cause spurious retransmissions when sequence numbers wrap. | Unnecessary retransmissions, throughput collapse on long‑fat pipes. |

## Exercises
### Easy
1. **Ping with variable payload**  
   ```bash
   ping -c 5 -s 1472 google.com   # 1472 + 28 B IP/ICMP = 1500 B (no fragmentation)
   ping -c 5 -s 1500 google.com   # Forces fragmentation; observe “frag needed” messages
   ```
   Explain the output differences and relate them to the MTU formula.

2. **Inspect socket buffers**  
   ```bash
   sysctl net.ipv4.tcp_rmem net.ipv4.tcp_wmem
   ss -i state established '( dport = :80 or sport = :80 )'
   ```
   Note the `rcv_buf` and `snd_buf` values; adjust them with `sysctl -w net.ipv4.tcp_rmem="4096 87380 6291456"` and observe changes in `ss -i`.

### Medium
3. **Write a UDP echo client/server that measures RTT**  
   *Server*: bind to port 5000, `recvfrom`, `sendto`.  
   *Client*: send a 500‑byte packet, record `clock_gettime(CLOCK_MONOTONIC)` before and after `recvfrom`.  
   Run over `lo` and over a Wi‑Fi link; compute RTT and compare to `ping`. Explain why UDP RTT can be lower than TCP (no handshake, no congestion control).

4. **Manipulate TCP congestion control**  
   ```bash
   sysctl net.ipv4.tcp_congestion_control   # list available algorithms
   sudo sysctl -w net.ipv4.tcp_congestion_control=bbr
   # Transfer a large file with iperf3 and plot cwnd via:
   sudo ss -ti state established '( dport = :5201 )'
   ```
   Observe the cwnd evolution and relate to BDP calculation.

### Hard
5. **Implement a simple distance‑vector routing protocol in Python**  
   Use UDP sockets on port 2000 to exchange routing tables (dictionary `{dest: (distance, next_hop)}`).  
   Implement Bellman‑Ford update: on receiving a neighbor’s table, for each entry compute `new_dist = neighbor.dist + 1` (unit link cost) and update if better.  
   Simulate a small topology (4 routers) and show convergence after a link‑cost change. Discuss count‑to‑infinity problem and how split horizon mitigates it.

6. **Use eBPF to count dropped packets per interface**  
   ```bash
   sudo bpftrace -e '
   tracepoint:net:net_dev_queue {
     if (args->bytes == 0) { @[args->name, "dropped"] = count(); }
   }
   '
   ```
   Run a traffic generator (e.g., `hping3 -i u1000 -S -p 80 192.168.1.10`) and watch the drop count increase as you lower the interface tx queue length with `txqueuelen`. Explain the relationship between queue length, buffering, and packet loss.

## Linux Connection
### Core Subsystems
| Subsystem | Source File (approx.) | Role |
|-----------|----------------------|------|
| Socket layer | `net/socket.c` | Implements `socket()`, `bind()`, `connect()`, `send()`, `recv()` syscalls; manages sock structures and protocol‑specific ops. |
| TCP/IPv4 | `net/ipv4/tcp_ipv4.c`, `net/ipv4/tcp_input.c` | Handles TCP header creation, checksum, retransmission timers, congestion control (plugable via `tcp_congestion_control`). |
| IP | `net/ipv4/ip_input.c`, `net/ipv4/ip_output.c` | Performs routing lookup (`fib_lookup`), TTL decrement, header checksum, fragmentation/reassembly. |
| Neighbor (ARP) | `net/ipv4/neigh.c` | Implements ARP request/reply, neighbor cache, proxy ARP. |
| Device driver | `net/core/dev.c` | Generic network device API; `dev_queue_xmit`, `netif_receive
