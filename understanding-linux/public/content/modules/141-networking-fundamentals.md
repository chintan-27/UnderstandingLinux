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

## Why This Matters

Without layering, swapping Ethernet for Wi-Fi requires rewriting every protocol above it — your application becomes coupled to the physical medium. Without framing, a receiver seeing a raw bit stream has no mechanism to locate message boundaries; every byte is equally ambiguous. Without longest-prefix routing, networks cannot be hierarchically aggregated, and routing tables grow proportional to the number of hosts rather than the number of network blocks. Each concept eliminates a specific failure mode. Understanding which failure mode each one solves tells you more than any definition.

---

## Core Concepts

### Layering: Isolating Concerns Across a Stack

Layering enforces that each protocol only sees the payload of the layer directly above it — headers from other layers are opaque data. This is why a TCP implementation doesn't branch on "is this Ethernet or Wi-Fi?": from TCP's perspective, IP is IP regardless of what's underneath. The interface contract between layers is that the lower layer delivers bytes reliably enough for the upper layer's own reliability mechanisms to function (or not — UDP makes no such guarantee).

The TCP/IP model (not OSI, which splits layers in ways that don't correspond to actual implementations):

| Layer | Name | Protocols | Unit |
|---|---|---|---|
| 5 | Application | HTTP, DNS, SMTP | Message |
| 4 | Transport | TCP, UDP | Segment / Datagram |
| 3 | Network | IP, ICMP | Packet |
| 2 | Link | Ethernet, Wi-Fi | Frame |
| 1 | Physical | Cables, radio | Bits |

Each layer adds a header on the way down (encapsulation) and strips it on the way up (decapsulation). The payload at layer $N$ is the complete frame at layer $N-1$. An IP packet is not modified by the Ethernet layer — it is enclosed by it.

### Framing: Carving Byte Streams Into Messages

Physical media deliver a continuous bit stream. The receiver needs two things: clock synchronization (which bit edge is a "1"?) and boundary detection (where does one frame end and the next begin?).

Ethernet solves both with the preamble: 7 bytes of alternating `10101010` followed by the Start Frame Delimiter `10101011`. The alternating pattern lets the receiver's PLL lock onto the sender's clock before the actual frame data arrives. After the SFD, the receiver knows exactly where byte boundaries are.

End-of-frame detection is implicit: the transmitter stops driving the line, and the receiver detects the carrier drop. The CRC-32 at the tail then validates the entire frame was received intact. If the CRC fails, the frame is silently dropped at Layer 2 — no NACK, no retransmission at this layer. That's TCP's problem.

The minimum 64-byte frame size (header + payload, excluding preamble) is not arbitrary. On a 10 Mbps half-duplex segment with a maximum length of 2500 m, the round-trip propagation delay is approximately:

$$t_{prop} = \frac{2 \times 2500\,\text{m}}{2 \times 10^8\,\text{m/s}} = 25\,\mu\text{s}$$

A transmitter must still be sending when a collision signal returns from the far end, otherwise it finishes transmitting before detecting the collision and has no mechanism to retransmit. At 10 Mbps, 64 bytes takes:

$$t_{frame} = \frac{64 \times 8\,\text{bits}}{10 \times 10^6\,\text{bps}} = 51.2\,\mu\text{s}$$

Since $51.2\,\mu\text{s} > 25\,\mu\text{s}$, the transmitter is still on the wire when the collision arrives. Drop below 64 bytes and this guarantee breaks. Modern full-duplex links have no collisions, but the minimum frame size is preserved for compatibility.

### Packets: Independent Forwarding Units

A packet is self-contained: it carries source and destination addresses, so every router can make a forwarding decision independently. In circuit switching, a path is reserved end-to-end before any data flows; bandwidth on that path is unavailable to other traffic even during silence. Packet switching reclaims that idle capacity.

The cost is that packets sharing a link are multiplexed, creating queuing delay and the possibility of loss under congestion. Packets may also arrive out of order if they take different paths. TCP absorbs this with sequence numbers and a reordering buffer; UDP exposes it directly to the application.

### Switching: Forwarding Within a Layer-2 Domain

A switch maintains a MAC address table mapping 48-bit MAC addresses to physical ports. It populates this table purely by observing source MAC addresses of incoming frames — no configuration required. When a frame arrives destined for a MAC not yet in the table, the switch **floods** it out every port except the ingress port. When the destination replies, its source MAC is learned and future frames are unicast directly.

The critical property: each switch port is its own collision domain. On a hub, all ports share one collision domain — only one frame can be in flight at a time, and every host receives every frame. On a switch with $N$ full-duplex ports, you have $N$ simultaneous collision-free conversations. Aggregate throughput scales linearly with port count rather than collapsing under contention.

Spanning Tree Protocol (STP) exists because switches learn by flooding and physical loops exist for redundancy — without loop prevention, a broadcast frame would circulate forever, consuming all bandwidth.

### Routing: Forwarding Between Layer-3 Networks

A router connects networks with distinct address spaces. The distinction from switching is not just Layer 2 vs. Layer 3 — it's that routers participate in protocols that exchange topology information across administrative boundaries (BGP) or within them (OSPF, IS-IS).

On each hop, the router: verifies the IP header checksum, decrements TTL, recomputes the IP header checksum, looks up the destination in its routing table via longest-prefix match, rewrites the Ethernet frame's destination MAC to the next-hop's MAC, and decrements nothing in the TCP/UDP header (that's end-to-end). The IP payload — TCP segment, UDP datagram — is never modified by a router under normal operation.

---

## How It Works

### Encapsulation Down the Stack

```
[Application] "GET / HTTP/1.1\r\nHost: example.com\r\n\r\n"
[Transport]   [ TCP hdr | HTTP data          ]
[Network]     [ IP hdr  | TCP hdr | HTTP data               ]
[Link]        [ Eth hdr | IP hdr  | TCP hdr  | HTTP data | CRC ]
```

The Ethernet header contains the MAC addresses of the two directly connected interfaces (not the ultimate source and destination). These MAC addresses are rewritten at every router hop. The IP addresses in the IP header are not rewritten (in the absence of NAT). This is why `tcpdump` on a transit router shows your IP but the router's own MAC as the source.

### Ethernet Frame Layout

```
Offset  Size    Field
0       7       Preamble (0xAA AA AA AA AA AA AA)
7       1       SFD (0xAB)
8       6       Destination MAC
14      6       Source MAC
20      2       EtherType (0x0800=IPv4, 0x86DD=IPv6, 0x0806=ARP)
22      46–1500 Payload
22+N    4       CRC-32
```

The EtherType field doubles as a length field in 802.3 framing when its value is ≤ 1500 — a design artifact from before Ethernet II was standardized. Values above `0x05DC` are always EtherTypes. The Linux kernel's `net/ethernet.h` defines these:

```c
#include <linux/if_ether.h>

/* EtherType constants */
#define ETH_P_IP    0x0800  /* IPv4 */
#define ETH_P_IPV6  0x86DD  /* IPv6 */
#define ETH_P_ARP   0x0806  /* ARP  */

/* struct ethhdr from include/uapi/linux/if_ether.h */
struct ethhdr {
    unsigned char   h_dest[ETH_ALEN];    /* 6 bytes: destination MAC */
    unsigned char   h_source[ETH_ALEN];  /* 6 bytes: source MAC      */
    __be16          h_proto;             /* EtherType / length        */
} __attribute__((packed));
```

The kernel's `skb` (socket buffer, `struct sk_buff` in `include/linux/skbuff.h`) tracks head, data, tail, and end pointers. Encapsulation is `skb_push()` (moves `data` pointer back, "prepending" a header without copying); decapsulation is `skb_pull()`. No data is copied between layers — only pointers move.

### IPv4 Header

```c
#include <linux/ip.h>

struct iphdr {
    __u8    ihl:4,        /* header length in 32-bit words (min 5 = 20 bytes) */
            version:4;    /* always 4 for IPv4                                 */
    __u8    tos;          /* DSCP / ECN                                        */
    __be16  tot_len;      /* total length including header                     */
    __be16  id;           /* fragment identification                           */
    __be16  frag_off;     /* fragment offset + flags                           */
    __u8    ttl;          /* decremented at each hop; drop at 0                */
    __u8    protocol;     /* 6=TCP, 17=UDP, 1=ICMP                             */
    __sum16 check;        /* one's-complement checksum of header only          */
    __be32  saddr;        /* source IP                                         */
    __be32  daddr;        /* destination IP                                    */
};
```

The IP checksum covers only the IP header, not the payload. TCP and UDP have their own checksums that include a pseudo-header (source IP, dest IP, protocol, length) — this is why an IP address change without checksum recalculation breaks TCP connections silently.

### IP Addressing and CIDR Math

An IPv4
