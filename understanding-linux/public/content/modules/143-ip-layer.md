---
id: 143
title: "IP layer"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### IP Layer Fundamentals
The IP layer provides a **best‑effort, connectionless datagram service**. Unlike TCP, it makes no guarantees about delivery, ordering, or duplicate suppression; those responsibilities are left to higher‑layer protocols. The layer’s primary duties are:
* **Logical addressing** – assigns a globally unique identifier (IP address) to each interface.
* **Routing decision** – selects the next hop based on the destination address and the local routing table (longest‑prefix match).
* **Fragmentation/reassembly** – adapts datagrams to varying link MTUs.
* **Loop prevention** – decrements a hop‑limit field (TTL in IPv4, Hop Limit in IPv6) to discard packets that wander forever.

These functions arise from the need to interconnect heterogeneous networks with unknown topologies while keeping router state minimal.

### IPv4 Header Structure (RFC 791)
| Field (bits) | Meaning | Why it exists |
|--------------|---------|---------------|
| 4‑bit **Version** | Identifies IPv4 (value 4) | Allows coexistence with IPv6 on the same wire. |
| 4‑bit **IHL** (Internet Header Length) | Number of 32‑bit words in the header (min 5) | Supports optional fields without fixed‑size waste. |
| 8‑bit **DSCP/ECN** | Differentiated services & explicit congestion notification | Enables QoS and congestion feedback without new protocols. |
| 16‑bit **Total Length** | Entire IP packet size (header + data) in bytes | Needed for fragmentation and buffer allocation. |
| 16‑bit **Identification** | Unique per‑packet ID (incremented by sender) | Groups fragments of the same original datagram. |
| 3‑bit **Flags** | *DF* (Don’t Fragment), *MF* (More Fragments), reserved | Controls fragmentation behavior; DF enables Path MTU Discovery. |
| 13‑bit **Fragment Offset** | Where this fragment belongs, measured in 8‑byte units | Allows efficient reassembly; 8‑byte granularity balances header size and resolution. |
| 8‑bit **TTL** | Max hops before packet is discarded | Prevents infinite routing loops; each router decrements. |
| 8‑bit **Protocol** | Identifies the next‑layer protocol (TCP=6, UDP=17, ICMP=1) | Demultiplexes to the correct transport handler. |
| 16‑bit **Header Checksum** | Ones‑complement sum of header only | Detects corruption; recomputed when TTL changes. |
| 32‑bit **Source Address** | Sender’s interface address | Needed for reverse‑path forwarding and ICMP error messages. |
| 32‑bit **Destination Address** | Intended receiver’s address | Basis for routing lookup. |
| Variable **Options** (if IHL > 5) | Rarely used (e.g., record route, timestamp) | Provides extensibility without redesigning the core. |

*Checksum calculation*:  
Let the header be treated as a sequence of 16‑bit words \(h_0, h_1, …, h_{n-1}\). The checksum field is set to zero, then  
\[
C = \overline{\sum_{i=0}^{n-1} h_i}\;,
\]  
where the overline denotes ones‑complement addition (carry‑wrap). On receipt, the same sum (including the received checksum) must equal 0xFFFF for a valid header.

### IPv6 Header (RFC 8200)
* Fixed 40‑byte header: Version (4 bits), Traffic Class (8 bits), Flow Label (20 bits), Payload Length (16 bits), Next Header (8 bits), Hop Limit (8 bits), 128‑bit Source & Destination Addresses.
* No header checksum – relies on link‑layer and upper‑layer error detection, reducing per‑router processing.
* Fragmentation moved to **Extension Header** (Fragment Header) because routers never fragment IPv6 packets; only the source may do so, guided by Path MTU Discovery.

### Addressing Types
| Type | IPv4 | IPv6 | Purpose |
|------|------|------|---------|
| **Unicast** | Yes | Yes | One‑to‑one delivery. |
| **Multicast** | Yes (224.0.0.0/4) | Yes (ff00::/8) | One‑to‑many; reduces duplicate transmissions. |
| **Anycast** | Rare (requires routing support) | Yes (allocated from unicast space) | One‑to‑nearest; used for services like DNS root. |
| **Broadcast** | Yes (host‑all‑ones, net‑all‑ones) | **No** – replaced by multicast. |
| **Link‑Local** | 169.254.0.0/16 (APIPA) | fe80::/10 | Automatic address configuration when no DHCP/router advertisement. |
| **Unique Local** | — | fc00::/7 | Analogous to IPv4 private space, not globally routable. |

### Subnetting & CIDR
Classful addressing (A/B/C) wasted address space; **Classless Inter‑Domain Routing (CIDR)** introduced variable‑length subnet masks (VLSM). A prefix length \(p\) (0 ≤ p ≤ 32 for IPv4) defines:
* **Network address**: \(A \land M\) where \(M = \text{0xFFFFFFFF} << (32-p)\).
* **Broadcast address** (IPv4): \(A \lor \sim M\).
* **Number of host addresses**: \(2^{32-p} - 2\) (subtract network & broadcast).  
For IPv6, host count is \(2^{128-p}\) (no separate broadcast; the all‑ones address is reserved as the *subnet‑anycast*).

*Example derivation*:  
If we need at least 500 hosts, we require \(2^{h} - 2 \ge 500 \Rightarrow h \ge \lceil\log_2(502)\rceil = 9\). Hence prefix \(p = 32 - 9 = 23\). Subnet mask = 0xFFFFFE00 = 255.255.254.0.

### Fragmentation Mechanics
When a datagram exceeds the outgoing link’s MTU:
1. **Identification** field is copied to all fragments.
2. **Fragment Offset** = (original data byte offset) / 8 (must be multiple of 8).
3. **More Fragments (MF)** flag = 1 for all but the last fragment; last fragment has MF = 0.
4. **Don’t Fragment (DF)** flag, if set, causes the router to drop the packet and send an ICMP *Fragmentation Needed* (type 3, code 4) message, enabling Path MTU Discovery.

Reassembly occurs **only at the final host** using Identification + Source/Destination + Protocol to match fragments; the receiver buffers until the MF flag of the last fragment arrives, then orders by Fragment Offset.

*Fragment count calculation*:  
Let original payload size = \(L\) bytes, MTU = \(M\) bytes (including IP header). Each fragment can carry at most \(M - \text{IP\_hdr}\) bytes of data, but must be a multiple of 8 except possibly the last.  
Number of fragments \(N = \left\lceil \frac{L}{M - \text{IP\_hdr}} \right\rceil\).  
Offset of fragment \(k\) (0‑based) = \(k \times \frac{M - \text{IP\_hdr}}{8}\) (rounded down to integer).

### TTL / Hop Limit
Each hop decrements the field by one. When it reaches zero:
* The packet is discarded.
* The router **must** send an ICMP Time‑Exceeded (type 11, code 0) message back to the source (using the packet’s source address as destination).  
This mechanism prevents packets from looping forever due to mis‑configured routing and provides a diagnostic tool (traceroute).

Maximum possible hops = initial TTL value. Typical defaults: IPv4 = 64, IPv6 = 64 (can be altered via sysctl).

---

## How It Works
### End‑to‑End Packet Flow (IPv4)
```c
/* Simplified view of ip_rcv() in net/ipv4/ip_input.c */
int ip_rcv(struct sk_buff *skb, struct net_device *dev,
           struct packet_type *pt, struct net_device *orig_dev)
{
    struct iphdr *iph = ip_hdr(skb);

    /* 1. Basic sanity checks */
    if (iph->version != 4 || ip_hdrlen(skb) < sizeof(struct iphdr))
        goto drop;
    if (ip_fast_csum((u8 *)iph, iph->ihl) != 0)
        goto drop;          /* header checksum */

    /* 2. Look up route (longest‑prefix match) */
    struct rtable *rt = ip_route_input(skb,
                                       iph->daddr,
                                       iph->saddr,
                                       iph->tos,
                                       dev);
    if (IS_ERR(rt))
        goto drop;

    /* 3. Check if we need to fragment */
    if (ntohs(iph->tot_len) > dst_mtu(&rt->dst) && !(iph->frag_off & htons(IP_DF))) {
        ip_fragment(skb, &rt->dst, ip_output);
        return 0;
    }

    /* 4. Decrement TTL and recompute checksum */
    if (iph->ttl <= 1) {
        icmp_send(skb, ICMP_TIME_EXCEEDED, ICMP_EXC_TTL, 0);
        goto drop;
    }
    iph->ttl--;
    ip_send_check(iph);    /* inline checksum update */

    /* 5. Hand off to neighbor subsystem (ARP) */
    neigh->output(&rt->dst, neigh, skb);
    return 0;
}
```
*Explanation*:
* The IP layer receives a socket buffer (`skb`) from the link layer.
* It validates version, header length, and checksum.
* A routing lookup (`ip_route_input`) returns the next‑hop `rtable`; this implements the **longest‑prefix match** algorithm using a radix‑trie (fib lookup).
* If the packet exceeds the path MTU and DF is not set, `ip_fragment` splits it.
* TTL is decremented; if it hits zero, an ICMP Time‑Exceeded is generated.
* The header checksum is updated efficiently: because only the TTL changed, the new checksum = old checksum – 1 (ones‑complement arithmetic).
* Finally, the packet is passed to the neighbor subsystem (ARP for IPv4, ND for IPv6) to resolve the link‑layer address of the next hop.

### IPv6 Flow (highlights)
* No header checksum → step omitted.
* Extension headers are processed in order (Hop‑by‑Hop → Routing → Fragment → … → Upper‑Layer).
* Fragmentation is performed **only by the source** (`ip6_fragment`) after consulting the destination cache for the current path MTU.
* Hop Limit plays the same role as TTL; decrement occurs in `ip6_forward`.

---

## Worked Examples
### Example 1: IPv4 Subnetting (CIDR)
**Given**: IP = `192.168.20.57`, desired subnet to accommodate **100 hosts**.

1. Determine host bits needed:  
   \(2^{h} - 2 \ge 100 \Rightarrow h \ge \lceil\log_2(102)\rceil = 7\).  
   Hence network prefix \(p = 32 - h = 25\).

2. Subnet mask:  
   \(M = 0xFFFFFFFF << (32-25) = 0xFFFFFF80\) → **255.255.255.128**.

3. Network address:  
   \(A \land M = 192.168.20.57 \land 255.255.255.128 = 192.168.20.0\).

4. Broadcast address:  
   \(A \lor \sim M = 192.168.20.57 \lor 0x0000007F = 192.168.20.127\).

5. Usable host range: **192.168.20.1 – 192.168.20.126** (126 addresses).

*Verification*:  
\(2^{7} - 2 = 126\) hosts, satisfying the requirement.

### Example 2: IPv6 Subnetting
**Given**: IPv6 address `2001:0db8:1234:abcd:0012:3456:789a:bcde/48`.  
We need a subnet for **65 000 hosts** (≈ 2¹⁶).

1. Host bits required: \(2^{h} \ge 65000 \Rightarrow h \ge 16\).  
   Prefix length \(p = 48 + h = 64\).

2. Subnet prefix: keep first 48 bits, add 16‑bit subnet ID. Choose subnet ID `0x0001`.  
   Subnet prefix = `2001:0db8:1234:abcd:0001::/64`.

3. Network address (all host bits zero):  
   `2001:0db8:1234:abcd:0001:0000:0000:0000`.

4. IPv6 has no broadcast; the **all‑ones** address (`ffff:…:ffff`) is reserved as the *subnet‑anycast* and must not be assigned to an interface.

5. Number of host addresses: \(2^{64}\) (enormous); the required 65 000 are easily accommodated.

### Example 3: Fragmentation Calculation
**Scenario**: Send a UDP datagram of **3500 bytes** (payload) over a path with MTU = 1500 bytes. IPv4 header = 20 bytes (no options).

1. Max payload per fragment = MTU – IP hdr = 1500 – 20 = **1480 bytes**. Must be a multiple of 8 → 1480 ≡ 0 (mod 8) ✓.

2. Number of fragments:  
   \(N = \lceil 3500 / 1480 \rceil = \lceil 2.364 \rceil = 3\).

3. Fragment details (Identification = 0xA1B2, DF = 0):
   * **Frag 0**: Offset = 0, MF = 1, payload = 1480 bytes → total size = 1500.
   * **Frag 1**: Offset = 1480/8 = 185, MF = 1, payload = 1480 bytes → total = 1500.
   * **Frag 2**: Offset = 2·1480/8 = 370, MF = 0, payload = 3500 − 2·1480 = 540 bytes → total = 560 (20 hdr + 540).

4. Reassembly at destination:  
   Sort by Offset (0, 185, 370) and concatenate payloads → original 3500 bytes.

---

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **“IP guarantees delivery.”** | IP is *best‑effort*; loss, duplication, reordering are possible. Reliability is provided by TCP (or application‑level protocols). | Recognize that IP’s only network‑layer service is *datagram forwarding*; higher layers add reliability. |
| **“TTL is a timeout in seconds.”** | TTL counts **router hops**, not time. A packet can traverse many hops in milliseconds or linger seconds on a congested link. | Treat TTL as a hop counter; each forwarding node decrements it by one. |
| **“IPv6 has broadcast addresses.”** | IPv6 deliberately removed broadcast to reduce unnecessary processing; multicast (e.g., ff02::1 for all nodes) replaces it. | Use IPv6 multicast scopes (link‑local, admin‑local, etc.) for one‑to‑many communication. |
| **“Fragmentation happens only at the source.”** | Routers fragment when DF = 0 and packet exceeds outgoing MTU; IPv6 disables router fragmentation, shifting the burden to the source. | In IPv4, any router may fragment; in IPv6, only the source may fragment (after Path MTU Discovery). |
| **“Subnet mask and CIDR prefix are interchangeable without conversion.”** | Mask = 255.255.255.0 corresponds to /24, but masks like 255.255.255.240 (/28) are not obvious at glance. | Always convert: prefix = number of leading 1 bits in mask; mask = 0xFFFFFFFF << (32‑prefix). |
| **“Header checksum covers the whole packet.”** | It covers **only the IPv4 header**; payload integrity is left to upper layers (TCP/UDP checksum) or link‑layer CRCs. | Remember that changing TTL forces a checksum update; payload changes do not affect it. |
| **“Setting DF=1 prevents all fragmentation.”** | DF only blocks fragmentation *by routers*; the source may still fragment if it chooses to ignore the Path MTU. | DF enables Path MTU Discovery; if a router needs to fragment, it drops the packet and sends ICMP 3‑4. |

---

## Exercises
### Easy
1. **Network calculation** – IP = `10.0.5.13/19`. Compute network address, broadcast address, and number of usable hosts.  
   *Solution sketch*: prefix = 19 → host bits = 13 → hosts = \(2^{13}-2=8190\). Network = 10.0.0.0, Broadcast = 10.0.31.255.

2. **TTL trace** – Run `traceroute -m 30 8.8.8.8`. Observe the TTL values in the ICMP Time‑Exceeded replies and explain why they increase by 1 each hop.

### Medium
3. **Variable‑Length Subnet Design** – Given the block `172.16.0.0/16`, allocate subnets for:
   * 4 departments each needing ≤ 500 hosts,
   * 2 guest‑Wi‑Fi networks each needing ≤ 50 hosts,
   * 1 point‑to‑point link needing 2 addresses.  
   Provide the CIDR for each subnet, ensuring no overlap, and calculate the remaining address space.

4. **Fragmentation verification** – Using two Linux hosts connected via a veth pair with MTU = 576, send a UDP packet of 2000 bytes (`ping -s 1900 -M do`). Capture with `tcpdump -nn -vvv -s0 ip`. Identify the Identification, MF flag, and Fragment Offset values in the captured packets.

### Hard
5. **Path MTU Discovery script** – Write a bash script that:
   * Sets the local DF flag on outgoing UDP packets (`ip route change ... mtu lock <value>` or using `setsockopt IP_MTU_DISCOVER`),
   * Probes increasing packet sizes,
   * Parses ICMP “Fragmentation Needed” messages to learn the path MTU,
   * Prints the discovered MTU and the optimal UDP payload size.  
   (Hint: use `nc -u -p <port>` and `tcpdump` or `ss -i` to inspect socket options.)

6. **Linux kernel inspection** – On a running system, display the IPv4 routing table in kernel‑internal format:
   ```bash
   cat /proc/net/ipv4_route
   ```
   Explain each field (destination, gateway, genmask, flags, metric, refcnt, use, window, irtt, iface). Then show how changing `net.ipv4.ip_forward` affects the `flags` column for routes that become forwarding candidates.

---

## Linux Connection
### Subsystem Overview
| Component | Kernel Source (approx.) | Function |
|-----------|--------------------------|----------|
| **IPv4 input** | `net/ipv4/ip_input.c` | `ip_rcv()` – receives packets, validates header, performs lookup, handles fragmentation. |
| **IPv4 output** | `net/ipv4/ip_output.c` | `ip_queue_xmit()` – adds IP header, computes checksum, handles local fragmentation, invokes neighbour subsystem. |
| **IPv6 input** | `net/ipv6/ipv6_input.c` | Similar to IPv4 but processes extension headers; no checksum. |
| **IPv6 output** | `net/ipv6/ipv6_output.c` | `ip6_xmit()` – builds IPv6 header, handles Hop Limit, delegates to `ip6_fragment` if needed. |
| **Routing (FIB)** | `net/ipv4/fib_frontend.c`, `net/ipv6/fib6_frontend.c` | Maintains the Forwarding Information Base (trie) used by longest‑prefix match. |
| **Neighbour subsystem** | `net/ipv4/neigh.c`, `net/ipv6/neigh.c` | ARP (IPv4) or ND (IPv6) resolution; provides neighbour entries and output callbacks. |
| **Netfilter hooks** | `net/netfilter/` | Allows packet mangling (e.g., TTL modification) at `NF_INET_PRE
