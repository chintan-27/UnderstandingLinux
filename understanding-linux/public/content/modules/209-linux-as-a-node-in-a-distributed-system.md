---
id: 209
title: "Linux as a node in a distributed system"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

A Linux machine on a network is a node whose behavior is shaped by addressing schemes it did not choose, routing decisions made by hardware it cannot see, and other machines competing for shared resources. When a container misconfigures its network namespace, packets vanish with no error. When a process saturates a NIC's transmit queue, unrelated services stall because they share the same `qdisc`. When subnet masks disagree between two hosts on the same wire, ARP succeeds but IP routing fails silently. The gap between diagnosing these failures in minutes versus hours is whether you understand the kernel subsystems involved: the FIB, netns, veth, cgroups, and the tools that expose them.

---

## Core Concepts

### Subnets and the Addressing Contract

An IP address is not a flat identifier — it encodes topology. The subnet mask partitions the 32-bit address into a **network prefix** (identical for all hosts on the segment) and a **host identifier** (unique within the segment). The kernel uses this split at every packet transmission decision.

The test for on-link reachability is a bitwise AND:

$$\text{network\_addr} = \text{ip\_addr} \;\mathbin{\&}\; \text{mask}$$

If the result equals the local network address, the destination is directly reachable and ARP is used. If not, the packet is forwarded to the default gateway. Two hosts misconfigured with different masks will compute different network addresses for the same destination — one sends direct, the other sends to the gateway — and only one will work.

For address `128.32.1.14` with mask `255.255.255.0` (`/24`):

$$\texttt{128.32.1.14} \;\mathbin{\&}\; \texttt{255.255.255.0} = \texttt{128.32.1.0}$$

Usable hosts on this subnet: $2^{32-24} - 2 = 254$. The two reserved addresses are the network address (all host bits zero) and the broadcast address (all host bits one). These are not assignable because the kernel uses the broadcast address for ARP and ICMP broadcasts, and the network address is the routing target in the FIB.

Subnet structure is **local knowledge only**. Routers outside the site route on the delegated prefix. Internal subdivision is invisible to the rest of the Internet — this is why an ISP can delegate a `/20` and the customer can slice it however they need.

### Variable-Length Subnet Masks (VLSM)

Uniform subnetting wastes addresses because every subnet is sized for the worst case. If a site has a `/16` allocation, using `/24` everywhere gives 254 hosts per segment — which is absurd for a point-to-point link that needs exactly two addresses.

VLSM allows different subnets within the same allocation to use different prefix lengths simultaneously:

| Subnet | Prefix | Usable hosts | Use case |
|---|---|---|---|
| `10.0.0.0/23` | 23 bits | $2^9 - 2 = 510$ | Server VLAN |
| `10.0.2.0/25` | 25 bits | $2^7 - 2 = 126$ | Office floor |
| `10.0.2.128/30` | 30 bits | $2^2 - 2 = 2$ | Router-to-router link |

The address space saved on the `/30` link ($252$ addresses versus a `/24$) can be allocated elsewhere. The routing table stores each prefix independently; longest-prefix match ensures packets reach the correct subnet.

### Resource Isolation

A multi-tenant Linux host (containers, VMs, multiple services) needs both **namespace isolation** (who can observe what) and **cgroup limits** (how much each tenant can consume). These are orthogonal mechanisms:

- **Namespaces** (`clone(2)` flags: `CLONE_NEWNET`, `CLONE_NEWPID`, `CLONE_NEWNS`, `CLONE_NEWUSER`, etc.) give each tenant its own independent instance of a kernel resource: a separate network stack, a separate process tree rooted at PID 1, a separate filesystem view. Processes in different network namespaces cannot reach each other's sockets at all — there is no shared socket table to enumerate.
- **cgroups v2** (`/sys/fs/cgroup/`) impose hard limits on CPU time, memory, block I/O, and network bandwidth per process group. The kernel enforces these in the scheduler (CPU), the page allocator (memory), and the block layer (I/O). A process that exceeds `memory.max` gets `ENOMEM`; it is not silently throttled.
- **nftables / eBPF** enforce packet policy at the namespace boundary. An eBPF program attached to a `tc` hook or an XDP hook can drop, redirect, or meter packets before they reach any socket.

The reason both are necessary: namespaces prevent tenants from *seeing* each other's resources; cgroups prevent a tenant from *consuming* so much of a shared resource that others are starved.

### Observability

Linux exposes node state through several distinct channels, each appropriate for different access patterns:

- **`/proc` and `/sys`**: virtual filesystems backed by kernel data structures. `/proc/net/dev` gives per-interface packet counts; `/sys/class/net/<iface>/statistics/` gives the same data in per-file form suitable for shell scripts. Reads are synchronous and zero-copy from the kernel's perspective.
- **Netlink sockets** (`AF_NETLINK`, `NETLINK_ROUTE`): the kernel-native IPC for querying and modifying network configuration. `ip(8)` and `ss(8)` are netlink clients. Netlink is event-driven — you can `bind()` and receive notifications when routes or interfaces change, without polling.
- **Tracepoints and eBPF**: tracepoints are stable, low-overhead hooks compiled into kernel paths (e.g., `net:net_dev_xmit`, `sched:sched_switch`). An eBPF program attached to a tracepoint runs in the kernel context on every event, accumulates data into BPF maps, and exposes the maps to userspace. `bpftool`, `bcc`, and `bpftrace` are the primary interfaces.

---

## How It Works

### Subnet Mask Arithmetic

Given CIDR notation `/n`, the 32-bit mask has $n$ leading ones and $32-n$ trailing zeros:

$$\text{mask} = \underbrace{1\cdots1}_{n}\underbrace{0\cdots0}_{32-n}$$

In hex, `/24` is `0xFFFFFF00`; `/30` is `0xFFFFFFFC`.

Usable hosts per subnet:

$$\text{hosts}(n) = 2^{32-n} - 2$$

For a `/16` block subnetted into `/24`s: $2^8 = 256$ subnets, each with $2^8 - 2 = 254$ usable hosts. Total usable addresses: $256 \times 254 = 65{,}024$. The flat `/16` maximum is $2^{16} - 2 = 65{,}534$. The difference — $510$ addresses — is the cost of subnetting: two reserved addresses per subnet across 256 subnets. That overhead buys you topological structure: each subnet is an independent broadcast domain and can be routed independently.

Verify the arithmetic directly in the kernel's representation:

```bash
# Show interface address with prefix length
ip addr show eth0

# Compute network address manually: ipcalc is available on most distros
ipcalc 128.32.1.14/24

# Or use Python inline
python3 -c "
import ipaddress
n = ipaddress.ip_interface('128.32.1.14/24')
print('network:', n.network)
print('broadcast:', n.network.broadcast_address)
print('usable hosts:', n.network.num_addresses - 2)
"
```

### How Linux Routes a Packet

When a process calls `sendto(2)`, the kernel IP output path (`ip_output()` in `net/ipv4/ip_output.c`) performs a FIB lookup:

```
destination IP → (outgoing interface, nexthop IP, source IP)
```

The FIB (`ip_route_output_key()`) uses a longest-prefix-match trie. Two entries `10.0.0.0/8` and `10.1.2.0/24`: a packet to `10.1.2.5` matches both, but the `/24` wins. The kernel then checks whether the nexthop is on-link:

$$\text{nexthop} \;\mathbin{\&}\; \text{mask} \stackrel{?}{=} \text{local\_network\_addr}$$

If on-link, `arp_find()` is called to resolve the MAC address. If off-link, the packet is handed to the gateway's MAC address at L2 while retaining the original destination IP at L3. This is why changing a subnet mask without updating the gateway breaks routing: the on-link test produces the wrong answer, and ARP is sent for an address that won't respond.

```bash
# Show the FIB — all routes
ip route show table main

# Show which route would be selected for a specific destination
ip route get 10.1.2.5

# Show ARP cache (L2 resolution results)
ip neigh show

# Watch FIB events in real time (netlink monitor)
ip monitor route
```

The kernel's FIB also maintains a route cache. You can inspect the raw FIB tables (policy routing uses multiple tables):

```bash
# Show all routing tables with rules
ip rule show
ip route show table local   # loopback, broadcast routes
ip route show table main    # normal unicast routes
```

### Network Namespaces

A network namespace (`CLONE_NEWNET`) is a complete independent copy of the Linux network stack: its own interface list, FIB, ARP table, iptables/nftables ruleset, conntrack table, and socket namespace. Two processes in different network namespaces share no socket state; `ss -tulpn` in one namespace shows nothing from the other.

The canonical way to wire two namespaces is a **veth pair** — two virtual interfaces connected back-to-back in
