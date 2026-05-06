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

## Core Concepts
### Routing Fundamentals
Routing is the algorithmic selection of a next‑hop interface for each incoming IP packet based on the packet’s destination address and the router’s view of network topology. The selection must be **deterministic**, **loop‑free**, and **optimal** with respect to a configured metric (e.g., hop count, bandwidth, delay).  
A router maintains two complementary data structures:

* **Routing Information Base (RIB)** – the *routing table*. It holds every route learned from static configuration or routing protocols, each annotated with its source (protocol, administrative distance) and metric. The RIB is the *source of truth* for path selection.
* **Forwarding Information Base (FIB)** – the *forwarding table*. It is a compact, hardware‑friendly representation of the RIB, organized for fastest possible longest‑prefix match (LPM). When the RIB changes, the FIB is rebuilt (or incrementally updated) so that packet forwarding can proceed without consulting the RIB per packet.

The separation allows the control plane (protocols, admin) to evolve the RIB independently of the data plane’s need for constant‑time lookups.

### Routing Protocols and Metrics
Routing protocols exchange *reachability* information so that each router can converge on a consistent RIB. Two canonical classes differ in how they compute the “best” path:

| Class | Example | Metric | Convergence Mechanism |
|-------|---------|--------|-----------------------|
| Distance‑vector | RIPv2 | Hop count (integer) | Each router sends its entire vector to neighbors; Bellman‑Ford update: `new_dist = min_over_neighbors( neighbor_cost + received_dist )`. Convergence time ≈ `O(D * N)` where `D` is diameter, `N` routers. |
| Link‑state | OSPFv2 | Cost = `reference_bandwidth / interface_bandwidth` (default ref = 100 Mbps) | Each router floods link‑state advertisements (LSAs) so every router builds an identical topological graph; then runs Dijkstra’s algorithm: `O(|E| + |V| log |V|)`. Metric incorporates bandwidth, delay, etc., enabling true “best‑path” selection. |

*Why the difference matters*: Distance‑vector protocols are simple but prone to count‑to‑infinity and slow convergence; link‑state protocols converge faster and support richer metrics at the cost of more memory and CPU.

### Longest‑Prefix Match (LPM)
Given a destination address `A` (32‑bit for IPv4), the router must find the route entry with the *most specific* matching prefix, i.e., the prefix `P/k` such that `A & mask(k) == network(P)` and `k` is maximal.  
If we store routes in a binary trie of depth 32, each lookup walks at most 32 nodes → worst‑case `O(32) = O(1)`. In practice, path compression (e.g., LC‑trie, PATRICIA) reduces average steps to `≈ log₂ R` where `R` is number of routes.

## How It Works
### Packet Reception and Lookup Pipeline
1. **NIC → Driver → Kernel** – The packet is DMA‑ed into an `sk_buff` (`skb`).  
2. **Netfilter (optional)** – `NF_INET_PRE_ROUTING` hook may mangle or drop.  
3. **Routing Subsystem** – Invokes `fib_lookup()` (net/ipv4/fib_frontend.c).  
   * `fib_lookup()` performs an LPM in the FIB (`fib_table->tb` is a radix tree).  
   * On a hit, it returns a `fib_result` containing:  
     - `fi` → `fib_info` (gateway, metric, device)  
     - `prefixlen` → matched prefix length  
   * On miss, the kernel checks the default route (prefixlen = 0) or triggers an ICMP Destination Unreachable.  
4. **Forwarding** – The `skb->dst` is attached (reference to a `rtable` entry). The output device is selected, MAC header rebuilt (`dev_hard_header`), and the packet queued to the NIC’s transmit ring.  
5. **Post‑routing** – `NF_INET_POST_ROUTING` hook (e.g., MASQUERADE) may rewrite source address.

### RIB ↔ FIB Synchronization
When a routing protocol (e.g., `quagga`, `bird`) or admin adds/modifies a route, it sends a Netlink message (`RTM_NEWROUTE`, `RTM_DELROUTE`) to the kernel. The kernel’s `rtnl` listener updates the RIB (`fib_table->tb_lock`). After the update, `fib_sync()` walks the modified subtree and rebuilds the affected FIB nodes.  
*Why incremental?* A full rebuild of a table with 10⁶ routes would cause noticeable forwarding stalls; incremental updates touch only O(log R) nodes.

### Control Plane Example: OSPF LSA Processing
* An OSPF router receives an LSA (type 1 router‑LSA).  
* It verifies the LSA’s sequence number (`ls_seqno`) against its link‑state database (LSDB). If newer, it stores the LSA and re‑runs Dijkstra.  
* Dijkstra’s priority queue extracts the vertex with minimal tentative distance `dist[v]`. For each neighbor `u`, tentative distance `dist[u] = min(dist[u], dist[v] + cost(v,u))`.  
* After convergence, the resulting shortest‑path tree yields a set of `fib_info` entries (next‑hop, outgoing interface). The kernel installs these via Netlink.

## Worked Examples
### Example 1: Simple Static Route
**Topology**: Host H (10.0.0.5/24) → Router R (eth0 = 10.0.0.1/24, eth1 = 192.168.1.1/24) → Internet.  
**Goal**: Forward packets from H to 172.16.0.0/16 via R’s eth1.

**Steps**  
1. On R, add static route:  
   ```bash
   sudo ip route add 172.16.0.0/16 via 192.168.1.254 dev eth1
   ```  
   *Why `via`?* The kernel needs a next‑hop address reachable on the specified device; it will resolve the MAC via ARP.  
2. Verify RIB entry:  
   ```bash
   ip route show 172.16.0.0/16
   # 172.16.0.0/16 via 192.168.1.254 dev eth1 proto static metric 1024
   ```  
   `proto static` indicates source; metric = 1024 (default for static).  
3. FIB entry (kernel internal) can be viewed via:  
   ```bash
   sudo cat /proc/net/fib_trie | grep -A2 "172.16.0.0/16"
   ```  
   Shows a trie node with `len=16` and `tf=0x2` (terminal flag).  
4. Packet flow: H sends to 172.16.5.10. R’s NIC receives the frame, `skb->dst` set after `fib_lookup()` returns the `fib_info` for eth1/gateway 192.168.1.254. The output device is eth1; ARP resolves 192.168.1.254 → MAC; packet transmitted.

### Example 2: Equal‑Cost Multi‑Path (ECMP) with OSPF
**Topology**: Three routers in a triangle, each link cost = 10 (OSPF). R1 connects to R2 and R3; both R2 and R3 have a route to 10.0.0.0/24 via their directly‑connected link to R2/R3 respectively.  
**OSPF configuration** (on each): `interface eth0 ip ospf cost 10`.

**Derivation of equal cost**  
* Shortest‑path tree from R1 to 10.0.0.0/24: two disjoint paths each of total cost 20 (R1‑R2‑dest and R1‑R3‑dest). Dijkstra yields two predecessors with identical distance → ECMP group size = 2.

**Kernel installation** (after OSPF converges):  
```bash
ip route show 10.0.0.0/24
# 10.0.0.0/24 proto ospf metric 20 
#    nexthop via 10.0.0.2 dev eth0 weight 1 
#    nexthop via 10.0.0.3 dev eth1 weight 1
```  
`weight` determines load‑sharing (default equal).  

**Packet forwarding**: For each packet, `fib_lookup()` returns a `fib_result` containing a *multipath* `fib_info` list. The kernel selects a next hop using a hash of `(src, dst, src_port, dst_port, protocol)` modulo number of paths → deterministic per‑flow load balancing.

### Example 3: Link Failure and Triggered Update
**Scenario**: R1‑R2 point‑to‑point link (10.0.12.0/30) fails. Both routers run RIPv2 (hop‑count metric).  

**RIP reaction**  
* R2 stops receiving RIP updates from R1 on that interface → marks the route via R1 as *invalid* after `garbage‑collection timer` (default 120 s).  
* R2 sends a *triggered update* (RIPv2 triggered‑update flag) to its neighbors, advertising the route with metric = 16 (unreachable).  
* Upon receipt, R1 sets the route’s metric to 16 and, after `hold‑down timer` (180 s), removes it from the RIB.

**Kernel effect**  
* When the metric becomes 16, the routing daemon deletes the kernel route via Netlink:  
  ```bash
  sudo ip route del 10.0.0.0/24 via 10.0.12.1 dev eth0
  ```  
* The corresponding FIB node is removed; subsequent packets destined for 10.0.0.0/24 miss the FIB, causing the kernel to generate an ICMP *Destination Unreachable* (type 3, code 0) and to drop the packet.

**Verification**  
```bash
sudo ip route get 10.0.0.5
# RTNETLINK answers: Network is unreachable
```

## Common Mistakes
| Mistake | Why It’s Wrong | Underlying Reason |
|---------|----------------|-------------------|
| **Assuming the kernel’s `ip route show` reflects the exact FIB used for forwarding** | The output shows the *RIB* (routes as installed by protocols). The FIB may have additional optimizations (e.g., prefixed routes, ECMP hashing) not visible. | The kernel maintains separate structures; `ip route` reads from the RIB via Netlink, not the hardware‑optimized trie. |
| **Treating the default route (`0.0.0.0/0`) as a catch‑all for all unresolved addresses** | If a more specific route exists (e.g., a host route `10.0.0.5/32`), it overrides the default, even if the default points to a different interface. | LPM selects the longest matching prefix; a `/32` is longer than `/0`. |
| **Believing that adding a static route with a lower metric automatically overrides a learned route** | Metric comparison only occurs *within* the same protocol source (`proto`). A static route (`proto static`) has administrative distance = 1, while OSPF (`proto ospf`) = 110; the kernel prefers lower AD *before* metric. | The RIB stores `proto` and `pref` (preference). The selection algorithm first chooses the lowest `pref`, then lowest metric among equal‑pref entries. |
| **Neglecting to flush the neighbour (ARP/ND) cache after changing a gateway** | The kernel may continue using an old MAC address for the new gateway, causing ARP‑resolution failures and dropped packets. | The FIB points to a gateway IP; the MAC is cached separately. Changing the gateway requires `ip neigh flush dev <if>` or waiting for the stale entry’s timeout. |
| **Using `iptables -t mangle -j MARK` to influence routing without enabling policy routing** | Marks only affect packets after the routing decision unless `iptables` is used in the `mangle` table *with* `ip rule` to create a separate routing table. | The kernel’s routing lookup occurs before most netfilter hooks; a mark must be consulted via `ip rule` to trigger an alternate FIB. |

## Exercises
### Easy
1. **Display and interpret** the kernel routing table for the default route.  
   ```bash
   ip route show default
   ```  
   Explain the meaning of `proto`, `metric`, and `scope` fields.

2. **Add a static host route** to `203.0.113.5/32` via your gateway and verify it appears.  
   ```bash
   sudo ip route add 203.0.113.5/32 via $(ip route show default | awk '/default/ {print $3}') dev $(ip route show default | awk '/default/ {print $5}')
   ip route get 203.0.113.5
   ```

### Medium
3. **Configure ECMP** between two gateways on the same subnet and observe per‑flow load balancing.  
   *Assume two gateways: 10.0.0.1 (eth0) and 10.0.0.2 (eth1).*  
   ```bash
   sudo ip route add 172.16.0.0/16 nexthop via 10.0.0.1 dev eth0 weight 1 \
                                 nexthop via 10.0.0.2 dev eth1 weight 1
   ```  
   Run two iperf3 flows to different destination ports and check `ip -s route show 172.16.0.0/16` to see packet counters split.

4. **Monitor routing table updates** in real time while a RIP neighbor goes down.  
   ```bash
   sudo ip monitor route   # in one terminal
   # In another, bring down the interface: sudo ip link set eth1 down
   ```  
   Observe the `DELETE` and `ADD` messages and note the timing.

### Hard
5. **Implement policy‑based routing** to send traffic from a specific source subnet to a different ISP.  
   *Given:* `eth0` (ISP‑A, gateway = 203.0.113.1), `eth1` (ISP‑B, gateway = 198.51.100.1).  
   ```bash
   # Create alternate tables
   echo "200 isp-a" | sudo tee -a /etc/iproute2/rt_tables
   echo "201 isp-b" | sudo tee -a /etc/iproute2/rt_tables

   # Populate tables
   sudo ip route add default via 203.0.113.1 dev eth0 table isp-a
   sudo ip route add default via 198.51.100.1 dev eth1 table isp-b

   # Rules: source‑based selection
   sudo ip rule add from 10.0.0.0/24 table isp-a priority 100
   sudo ip rule add from 10.0.10.0/24 table isp-b priority 110
   sudo ip rule add table main priority 120   # fallback
   ```  
   Verify with `ip route get` from source addresses in each subnet.

6. **Analyze the cost of a longest‑prefix match** in a Linux FIB with 500 k routes.  
   *Assume a path‑compressed trie where each node stores a 16‑bit stride.*  
   Estimate the average number of memory accesses needed for a lookup and compare to a linear scan of an unsorted array. Show the derivation.

## Linux Connection
### Kernel Subsystems
* **Networking stack** – `net/ipv4/` (IPv4) and `net/ipv6/` (IPv6).  
* **Routing Information Base (RIB)** – managed via Netlink family `NETLINK_ROUTE` (`rtnetlink`).  
* **Forwarding Information Base (FIB)** – radix‑tree implementation in `net/ipv4/fib_trie.c` (IPv4) and `net/ipv6/fib6_trie.c` (IPv6).  
* **Policy routing** – `fib_rules.c`, accessed via `ip rule`.  
* **Neighbour subsystem** – ARP (`net/ipv4/arp.c`) and ND (`net/ipv6/ndisc.c`).

### Essential Files & Commands
| Purpose | Path / Command | Explanation |
|---------|----------------|-------------|
| View RIB (user‑friendly) | `ip route show` | Reads kernel RIB via Netlink; displays `proto`, `metric`, `dev`. |
| View FIB (trie) | `cat /proc/net/fib_trie` (IPv4) <br> `cat /proc/net/fib6_trie` (IPv6) | Raw trie nodes; useful for debugging LPM depth. |
| Add/delete route | `ip route add <prefix> [via <gw>] dev <if> [metric <m>]` <br> `ip route del <prefix>` | Sends RTM_NEWROUTE/RTM_DELROUTE Netlink messages. |
| Flush neighbour cache | `ip neigh flush dev <if>` | Clears ARP/ND entries; forces re‑resolution after gateway change. |
| Monitor routing events | `ip monitor route` | Listens to RTM_NEWROUTE, RTM_DELROUTE, RTM_ROUTE_REPLACE. |
| Policy rule list | `ip rule show` | Displays `fib_rules` priorities and associated tables. |
| Add custom table | Edit `/etc/iproute2/rt_tables` then `ip route add … table <name>` | Enables multiple independent FIBs. |
| sysctl for route limits | `net.ipv4.route.max_size` (max number of FIB entries) <br> `net.ipv4.route.gc_thresh` (garbage‑collection thresholds) | Tunable via `/proc/sys/net/ipv4/route/*` or `sysctl -w`. |
| Netlink diagnostics | `rtnetlink -p <pid>` (from `iproute2` dev) or `strace -e trace=netlink ip route …` | Shows raw Netlink messages exchanged with kernel. |

### Example: Adding a Blackhole Route (for testing)
```bash
# Drop all packets to 198.51.100.0/24 locally
sudo ip route add 198.51.100.0/24 dev lo scope link type prohibit
ip route get 198.51.100.5
# Output: RTNETLINK answers: Network is unreachable
```
*Why `type prohibit`?* The kernel installs a FIB node that returns `RTNETLINK` error instead of a next hop, useful for measuring loss or emulating ISP filtering.

## Why This Matters
Routing is the linchpin that transforms a collection of isolated links into a coherent, scalable internetwork. Mastery of the Linux routing subsystem lets you:

* **Design resilient topologies** – By understanding how protocols converge (RIB → FIB) and how metrics influence path selection, you can tune OSPF costs, BGP MEDs, or static weights to steer traffic predictably.
* **Diagnose failures swiftly** – Knowing where the kernel stores routes (`/proc/net/*`), how to watch Netlink events, and how to validate LPM depth turns intermittent packet loss into a solvable problem.
* **Implement advanced traffic engineering** – Policy routing, ECMP, and blackhole routes are not esoteric tricks; they are routine tools for load‑balancing, multi‑homed edge routers, and DDoS mitigation.
* **Optimize resource usage** – The FIB’s radix‑tree lookup is *O(W)* with a tiny constant; appreciating this helps you size routers correctly (e.g., setting `net.ipv4.route.max_size` to avoid spontaneous route drops during churn).
* **Contribute to open‑source networking** – The Linux networking stack is the reference implementation for countless devices; patches to `fib_trie.c` or `rtnetlink` directly affect millions of servers, containers, and cloud instances.

In short, routing theory without a concrete Linux view is abstract; the Linux view without theory is blind. Together they empower you to build, operate, and troubleshoot the networks that power modern computing.
