---
id: 144
title: "Routing"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

When you send a packet to 8.8.8.8, your kernel has no idea where Google's DNS server physically is — it only knows one thing: which neighbor to hand the packet to next. That neighbor makes its own independent decision. Routing is the mechanism that makes this chain work: each node maintains a forwarding table mapping destination prefixes to next hops, and each forwarding decision is purely local. The intelligence is distributed; no single machine needs a global view.

This design choice has a direct consequence for debugging. When a packet disappears, no single machine knows it's gone. There's no end-to-end error signal from the network layer — only a timeout at the application. Misconfigure a gateway address, install a stale route, or break ARP resolution for the default gateway's MAC, and the failure mode is identical: silence.

---

## Core Concepts

### The Forwarding Table

Every IP-capable host and router maintains a **forwarding table** (the kernel's term is the **Forwarding Information Base**, or FIB). For each outgoing packet, the kernel performs a **longest-prefix match**: find every table entry whose prefix covers the destination address, then select the one with the most specific prefix (largest $p$). Specificity wins because more specific routes encode more authoritative local knowledge — the operator who configured `192.168.1.0/24` knows more about that subnet than whoever configured the `0.0.0.0/0` default.

Each entry contains:

| Field | Purpose |
|---|---|
| Destination prefix | The network address and prefix length, e.g. `192.168.1.0/24` |
| Next hop | IP of the next router, or `0.0.0.0` if the destination is directly reachable |
| Output interface | Which local interface to send out |
| Metric | Cost used to prefer one route over another when prefixes tie |
| Route source | How this entry was learned: `kernel`, `static`, `ospf`, `bgp`, etc. |

The prefix-per-network design is what makes routing tractable. A full IPv4 address space is $2^{32} \approx 4.3 \times 10^9$ hosts. A global BGP table as of 2024 carries roughly $10^6$ prefixes. Your laptop's table needs fewer than 10 entries to reach any address on the internet, because the default route `0.0.0.0/0` absorbs everything not explicitly matched.

### Directly Connected vs. Gateway Routes

The kernel distinguishes two fundamentally different forwarding cases:

**On-link**: The destination falls within a prefix assigned to a local interface. The kernel can reach it in one hop by resolving its MAC address and injecting a frame directly. No router needed.

**Off-link**: The destination doesn't match any local prefix. The kernel sends the packet to a **gateway** — a router reachable on one of its local subnets. The gateway assumes responsibility for all further forwarding.

The critical invariant: **the IP destination address never changes in transit**. What changes at every hop is the link-layer (Ethernet) destination — it's rewritten to address the *next* router, not the ultimate destination. A router that rewrites the IP destination would be performing NAT, not routing.

The **default route** (`0.0.0.0/0` for IPv4, `::/0` for IPv6) is the longest-prefix match of last resort — prefix length 0 means zero bits must match, so it matches everything. This single entry is why your laptop's forwarding table needs no knowledge of the global topology.

### ARP: Resolving IP to MAC

IP addresses are logical identifiers. Ethernet requires a 48-bit MAC address in every frame header. **ARP (Address Resolution Protocol)** maps one to the other for IPv4. The kernel needs ARP in exactly two situations: when the next hop is on-link (including when the next hop *is* a gateway on the local subnet).

ARP is a two-message protocol:

1. **Request**: broadcast on the local segment (`FF:FF:FF:FF:FF:FF`), asking "who has IP $X$?"
2. **Reply**: unicast from the owner of $X$, supplying its MAC address.

The result is cached in the **ARP table** (also called the **neighbor cache** in the kernel). Cache entries expire — Linux defaults to a 30-second reachability timeout (`gc_stale_time`). A stale or poisoned ARP entry causes all packets to that IP to be framed for the wrong MAC, silently misdirected at layer 2.

For IPv6, ARP is replaced by **Neighbor Discovery (ND)**, which runs over ICMPv6. Instead of broadcast, ND sends solicitations to the **solicited-node multicast address** derived from the lower 24 bits of the target's IPv6 address:

$$\texttt{FF02::1:FF}\underbrace{xx:xxxx}_{\text{low 24 bits of target}}$$

This means only hosts sharing those 24 bits process the solicitation — typically just one host — avoiding the broadcast storm that ARP can cause on large segments.

### The Router's Mechanical Role

A router is a host with IP forwarding enabled (`net.ipv4.ip_forward = 1`) and at least two interfaces. Its forwarding logic is identical to a host's, with one difference: when it receives a packet not addressed to one of its own IPs, instead of discarding it, it runs the same longest-prefix-match lookup and forwards the packet onward.

At each hop, the router **decrements the TTL** (IPv4) or **Hop Limit** (IPv6) by 1. If the field reaches 0, the router drops the packet and sends an ICMP Type 11 (Time Exceeded) message back to the original source. This is the mechanism `traceroute` exploits: by sending packets with TTL=1, 2, 3, … it collects one ICMP response per hop, mapping the path.

### Dynamic Routing: Why Static Tables Break

Static routes require manual configuration and don't react to failures. Dynamic routing protocols let routers advertise topology information to each other and recompute forwarding tables automatically.

**Distance-vector** protocols (RIP, EIGRP): each router advertises its full table to neighbors. Neighbors update their own tables based on received advertisements. Convergence is slow — changes propagate one hop per advertisement cycle — and the protocol is vulnerable to **count-to-infinity**: when a route disappears, routers can increment each other's metrics indefinitely before detecting the loop.

**Link-state** protocols (OSPF, IS-IS): each router floods only its directly connected links to every other router in the area. Every router independently builds a complete graph of the topology, then runs Dijkstra's algorithm to compute the shortest path tree rooted at itself. Because every router has the same graph, there are no loops. Convergence is fast — a topology change propagates in milliseconds.

**Path-vector** (BGP): used between autonomous systems (ASes) on the internet. Each advertisement includes the full sequence of AS numbers the route traversed. A router rejects any advertisement containing its own AS number, breaking loops at the organizational boundary. BGP's primary job isn't finding shortest paths — it's enforcing policy (which ASes are willing to carry whose traffic, under what business agreements).

---

## How It Works

### Longest-Prefix Match: The Arithmetic

Given destination address $D$ (a 32-bit integer) and a table entry with network address $N$ and prefix length $p$, the entry matches if and only if:

$$D \;\mathbin{\&}\; M_p = N \qquad \text{where } M_p = \underbrace{\sim 0}_{\texttt{0xFFFFFFFF}} \ll (32 - p)$$

The mask $M_p$ has $p$ ones in the most significant bits and zeros elsewhere. The bitwise AND zeroes out the host portion of $D$, leaving only the network portion for comparison.

For $D = \texttt{192.168.1.200}$:

```
Destination:  192.168.1.200  =  11000000.10101000.00000001.11001000

Entry A /24:  mask = 11111111.11111111.11111111.00000000
              D & mask       = 11000000.10101000.00000001.00000000 = 192.168.1.0   ✓ (p=24)

Entry B /16:  mask = 11111111.11111111.00000000.00000000
              D & mask       = 11000000.10101000.00000000.00000000 = 192.168.0.0   ✓ (p=16)

Entry C /0:   mask = 00000000.00000000.00000000.00000000
              D & mask       = 00000000.00000000.00000000.00000000 = 0.0.0.0       ✓ (p=0)
```

Entry A wins. The kernel does not scan the table linearly — it uses a **radix trie** (Linux: `fib_trie`) or a hardware **TCAM** in router ASICs, both of which find the longest match in $O(\log_2 32) = O(5)$ steps for IPv4 (trie depth bounded by address width).

### ARP Exchange: Full Detail

```
Host A: 192.168.1.10 / MAC: AA:AA:AA:AA:AA:AA
Host B: 192.168.1.20 / MAC: BB:BB:BB:BB:BB:BB

Step 1: A wants to send IP packet to 192.168.1.20
        Checks neighbor cache → no entry

Step 2: A sends ARP Request:
        Ethernet:  src=AA:AA:AA:AA:AA:AA  dst=FF:FF:FF:FF:FF:FF
        ARP:       op=REQUEST
                   sender_mac=AA:AA:AA:AA:AA:AA  sender_ip=192.168.1.10
                   target_mac=00:00:00:00:00:00  target_ip=192.168.1.20

Step 3: B recognizes its own IP, responds:
        Ethernet:  src=BB:BB:BB:BB:BB:BB  dst=AA:AA:AA:AA:AA:AA
        ARP:       op=REPLY
                   sender_mac=BB:BB:BB:BB:BB:BB  sender_ip=192.168.1
