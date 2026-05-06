---
id: 153
title: "Virtual networking"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Network Namespaces – First‑Principles Isolation
A network namespace is a clone of the kernel’s network stack (`struct net`). When a process is created with `clone(CLONE_NEWNET, …)` (or via `unshare -n`) it receives its own copy of:
* network device list (`net_device`),
* routing tables (`fib_table`),
* ARP cache,
* sockets,
* sysctl variables (`/proc/sys/net/...`).

Isolation follows from the fact that each namespace maintains **separate** routing and neighbor tables; a packet lookup uses the namespace‑specific `fib_lookup` routine, so a route that exists in the default namespace is invisible inside a child namespace unless explicitly added.

### Virtual Ethernet (veth) Pairs – A Kernel Pipe
A `veth` device always appears in **pairs**. When the kernel transmits a frame on `veth0`, it directly delivers it to the receive queue of its peer `veth1` (and vice‑versa) without involving any physical medium. This is implemented by the `veth_xmit` function that calls `dev_queue_xmit` on the peer’s `net_device`. Consequently, a veth pair behaves like a full‑duplex Ethernet cable whose two ends can be placed in different namespaces, providing the only way to move traffic between isolated network stacks.

### Bridges – Layer‑2 Forwarding Logic
A Linux bridge (`bridge` device) maintains a **forwarding database (FDB)** mapping MAC addresses to bridge ports. Upon receiving a frame:
1. The bridge learns the source MAC/port (if unknown).
2. It looks up the destination MAC in the FDB.
   * If found → frame is forwarded **only** to that port.
   * If not found → frame is flooded to all ports except the ingress port.
This is pure data‑link (Layer 2) behavior; the bridge does **not** inspect IP headers, so it works with any EtherType (IPv4, IPv6, ARP, etc.). The bridge also honors the Spanning Tree Protocol (STP) to prevent loops.

### TAP/TUN – User‑Space Packet Interfaces
* **TAP** (`tap` device) delivers **raw Ethernet frames** to a file descriptor; reads return the complete Ethernet header + payload. Writes inject a full Ethernet frame into the kernel’s transmit path.
* **TUN** (`tun` device) delivers **IP packets** (no Ethernet header). Reads/writes operate on Layer 3 payloads; the kernel adds the appropriate link‑layer header (based on the device’s `type` and `hard_header_len`) before transmission.

Both are created via the `tun`/`tap` driver (`/dev/net/tun`) using the `TUNSETIFF` ioctl. TAP is useful for userspace switches or VPNs that need to see Ethernet headers; TUN is simpler for pure IP‑only tunnels (e.g., `openvpn` in `--dev tun` mode).

### Overlay Networks – Encapsulation‑Based Virtual LANs
An overlay builds a logical LAN on top of an existing (often IP) underlay by encapsulating frames. The most common Linux implementation is **VXLAN**:
```
+-------------------+   UDP   +-------------------+   IP   +-------------------+
| Original Ethernet |------->| VXLAN Header (8) |------->| UDP Header (8)   |
| (14 B)            |        | (VNI, Flags…)    |        | (src/dst port)   |
+-------------------+        +-------------------+        +-------------------+
                               +-------------------+
                               | IP Header (20 B)  |
                               +-------------------+
```
The total encapsulation overhead is **50 bytes** (14 B Ethernet + 20 B IP + 8 B UDP + 8 B VXLAN). If the physical MTU is 1500 B, the maximum payload for the original Ethernet frame is **1500 − 50 = 1450 B**. This calculation explains why jumbo frames are often enabled on the underlay when using VXLAN.

---

## How It Works
### Step‑by‑Step Construction of an Isolated Network
Below is the canonical sequence, each step accompanied by the kernel mechanism it triggers.

1. **Create a network namespace**  
   ```bash
   # unshare creates a new namespace and runs a shell in it
   unshare -n --fork --pid --mount-proc sh
   ```
   *Why*: `unshare -n` invokes `sys_unshare(CLONE_NEWNET)`, cloning `init_net` into a fresh `struct net`. The shell inherits this namespace, giving it a private network stack.

2. **Create a veth pair**  
   ```bash
   ip link add veth0 type veth peer name veth1
   ```
   *Why*: The `veth` driver allocates two `net_device` structures, links their `rx_handler` callbacks, and registers them with the default namespace.

3. **Move one end into the target namespace**  
   ```bash
   ip link set veth1 netns <pid-or-name>
   ```
   *Why*: The `netns` feature changes the `net_device->nd_net` pointer, moving the device’s reference into the target namespace’s device list. The other end (`veth0`) stays in the caller’s namespace.

4. **Assign IP addresses and bring interfaces up**  
   ```bash
   # In the default namespace (veth0)
   ip addr add 10.0.0.1/24 dev veth0
   ip link set veth0 up

   # In the child namespace (veth1)
   ip netns exec <ns> ip addr add 10.0.0.2/24 dev veth1
   ip netns exec <ns> ip link set veth1 up
   ```
   *Why*: Address configuration updates the device’s `ifa_list` and triggers IPv4 `inetdev_config`; setting the `IFF_UP` flag enables the transmit queue (`netif_start_queue`).

5. **Optional: Insert a bridge to connect multiple veths or physical NICs**  
   ```bash
   ip link add br0 type bridge
   ip link set veth0 master br0
   ip link set eth0 master br0   # if you want to bridge to a physical NIC
   ip link set br0 up
   ```
   *Why*: The bridge device creates its own `net_device`; setting `master` adds the port to the bridge’s port list and enables the bridge’s `rx_handler` (`br_handle_frame`). The bridge then performs FDB learning and forwarding as described above.

6. **Test connectivity**  
   ```bash
   ip netns exec <ns> ping -c 3 10.0.0.1
   ```
   *Why*: The ping packet traverses the veth pair, optionally the bridge, and reaches the peer namespace where the IP stack processes it and returns an ICMP echo reply.

### Key Kernel Data Structures Touched
| Structure | Role in the steps above |
|-----------|------------------------|
| `struct net` | Namespace‑isolated networking stack |
| `struct net_device` | Represents each interface (veth, bridge, phys) |
| `struct net_device_stats` | Updated by drivers on tx/rx |
| `struct neigh_table` | ARP cache, looked up when sending IP packets |
| `struct fib_table` | Routing table used for `ip route` lookups |
| `struct vlan_group` (if VLANs used) | Tag handling on bridge ports |
| `struct udp_offload` (VXLAN) | Handles UDP decapsulation/encapsulation |

---

## Worked Examples
### Example 1: Two‑Namespace veth Link with Ping
**Goal**: Verify that a veth pair provides Layer‑2 connectivity between two isolated namespaces.

```bash
# 1. Create first namespace (ns1)
sudo ip netns add ns1
# 2. Create second namespace (ns2)
sudo ip netns add ns2

# 3. Create veth pair
sudo ip link add veth-ns1 type veth peer name veth-ns2

# 4. Attach each end to its namespace
sudo ip link set veth-ns1 netns ns1
sudo ip link set veth-ns2 netns ns2

# 5. Assign IPs and bring up
sudo ip netns exec ns1 ip addr add 10.0.1.1/24 dev veth-ns1
sudo ip netns exec ns1 ip link set veth-ns1 up
sudo ip netns exec ns2 ip addr add 10.0.1.2/24 dev veth-ns2
sudo ip netns exec ns2 ip link set veth-ns2 up

# 6. Test
sudo ip netns exec ns1 ping -c 3 10.0.1.2
```
**Explanation**:  
* Each namespace gets its own `struct net`.  
* The veth pair’s `tx` function queues the packet on the peer’s `rx` queue, bypassing any NIC.  
* ARP requests/resolve happen inside each namespace; the ARP cache entries are stored in the respective ` neigh_table`.  
* The ping succeeds because the IP layer sees a reachable host (`10.0.1.2`) via the directly connected interface.

### Example 2: Bridge Connecting a Physical NIC and a veth
**Goal**: Allow a container (namespace) to appear on the same Ethernet segment as the host’s `eth0`.

```bash
# 1. Create bridge
sudo ip link add br0 type bridge
# 2. Bring it up
sudo ip link set br0 up

# 3. Attach host NIC (assume eth0 exists) to bridge
sudo ip link set eth0 master br0
sudo ip link set eth0 up

# 4. Create namespace and veth
sudo ip netns add web
sudo ip link add veth-web type veth peer name veth-br
sudo ip link set veth-web netns web
sudo ip link set veth-br master br0

# 5. Configure IPs (optional: use DHCP client inside ns)
sudo ip netns exec web ip addr add 192.168.10.10/24 dev veth-web
sudo ip netns exec web ip link set veth-web up
sudo ip link set br0 up   # ensure bridge is up

# 6. Verify: host can ping container and vice‑versa
ping -c 3 192.168.10.10          # from host
sudo ip netns exec web ping -c 3 192.168.10.1   # from container (host’s bridge IP)
```
**Explanation**:  
* The bridge learns MACs: when the container sends a frame, the bridge sees source MAC of `veth-web` on port `veth-br` and adds it to the FDB.  
* When the host (`eth0`) sends a frame destined for the container’s MAC, the bridge forwards it only to the `veth-br` port.  
* No IP routing is involved; the bridge operates purely at Layer 2, preserving the original Ethernet frame.

### Example 3: VXLAN Overlay Across Two Hosts (Single‑Host Demo)
**Goal**: Demonstrate encapsulation overhead calculation and basic VXLAN setup using two namespaces as simulated hosts.

```bash
# Host A namespace
sudo ip netns add hostA
# Host B namespace
sudo ip netns add hostB

# Underlay: connect the two namespaces via a simple veth (simulating the physical network)
sudo ip link add vethA type veth peer name vethB
sudo ip link set vethA netns hostA
sudo ip link set vethB netns hostB
sudo ip netns exec hostA ip addr add 10.0.0.1/24 dev vethA
sudo ip netns exec hostA ip link set vethA up
sudo ip netns exec hostB ip addr add 10.0.0.2/24 dev vethB
sudo ip netns exec hostB ip link set vethB up

# VXLAN interfaces (ID 42, UDP port 4789)
sudo ip netns exec hostA ip link add vxlan42 type vxlan id 42 dev vethA dstport 4789
sudo ip netns exec hostB ip link add vxlan42 type vxlan id 42 dev vethB dstport 4789
sudo ip netns exec hostA ip link set vxlan42 up
sudo ip netns exec hostB ip link set vxlan42 up

# Assign overlay IPs (still within the same subnet for demo)
sudo ip netns exec hostA ip addr add 10.1.0.1/24 dev vxlan42
sudo ip netns exec hostB ip addr add 10.1.0.2/24 dev vxlan42
sudo ip netns exec hostA ip link set vxlan42 up
sudo ip netns exec hostB ip link set vxlan42 up

# Verify overlay connectivity
sudo ip netns exec hostA ping -c 3 10.1.0.2
```
**Math Verification**:  
* Underlay MTU (default) = 1500 B.  
* VXLAN overhead = 50 B (see Core Concepts).  
* Maximum original Ethernet frame that fits = 1500 − 50 = 1450 B.  
* If we attempted to send a 1500‑B Ethernet frame inside the VXLAN, the kernel would fragment it at the IP layer (underlay), which we can observe with `ip netns exec hostA ping -M do -s 1472 10.1.0.2` (1472 B payload + 28 B ICMP/IP header = 1500 B inner packet → exceeds 1450 B → fragmentation).

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Fails |
|---|---------|--------------|--------------|
| 1 | **Moving only one veth end to a namespace** (`ip link set veth0 netns ns1` but leaving `veth1` in the default namespace) | The pair is split across namespaces, but the other end remains visible to the host, causing asymmetric routing or accidental traffic leakage. | The veth driver treats each end independently; if only one end is moved, the other can still send/receive frames on the host stack, breaking isolation expectations. |
| 2 | **Forgetting to set the interface `UP` flag** after assigning an IP | The interface appears in `ip link show` as `<NO-CARRIER,DOWN,LOWER_UP>` and packets are dropped silently. | The device’s `IFF_UP` flag controls `netif_start_queue`; without it, the transmit queue is never enabled, so `dev_queue_xmit` returns `-ENETDOWN`. |
| 3 | **Using the wrong MTU on an overlay (e.g., VXLAN) without adjusting the underlay** | Packets larger than `(underlay MTU – 50)` are fragmented or dropped, causing intermittent connectivity. | The overlay adds a fixed 50‑byte header; if the inner packet exceeds the available payload, the IP layer fragments, increasing overhead and possibly triggering path MTU discovery failures. |
| 4 | **Attaching a physical NIC to a bridge without disabling IPv4 forwarding on the NIC** | The host may route traffic directly via the NIC bypassing the bridge, leading to asymmetric forwarding and ARP confusion. | When `net.ipv4.conf.<eth>.forwarding` is 1, the kernel treats the NIC as a router; packets may be forwarded based on routing tables instead of bridge FDB, breaking Layer 2 semantics. |
| 5 | **Assuming `ip netns exec` inherits the caller’s DNS resolution** | Commands inside the namespace fail to resolve names because `/etc/resolv.conf` is not namespace‑aware (unless bind‑mounted). | Network namespaces isolate only networking resources; file‑system paths like `/etc/resolv.conf` are shared unless explicitly duplicated or mounted. |

---

## Exercises
### Easy
1. **Basic veth ping** – Create two namespaces (`red`, `blue`), connect them with a veth pair, assign `10.0.0.1/24` and `10.0.0.2/24`, and verify bidirectional ping.  
   *Command checklist*: `ip netns add`, `ip link add … type veth peer`, `ip link set … netns`, `ip addr add`, `ip link set up`, `ping`.

### Medium
2. **Bridge to physical NIC** – On a machine with an active Ethernet interface (`eth0`), create a bridge `br0`, attach `eth0` and a veth whose other end sits in a namespace `web`. Give the namespace an IP in the same subnet as `eth0` (e.g., `192.168.1.100/24`) and confirm that the namespace can reach the host’s gateway and external hosts.  
   *Key steps*: `ip link add br0 type bridge`, `ip link set eth0 master br0`, `ip link set veth-web netns web`, `ip link set veth-br master br0`, address configuration, default route inside namespace (`ip netns exec web ip route add default via 192.168.1.1 dev veth-web`).

### Hard
3. **VXLAN overlay with MTU awareness** – Simulate two hosts (`hostA`, `hostB`) using namespaces. Connect them via an underlay veth pair (MTU 1500). Deploy VXLAN interfaces with VNI 100, assign overlay IPs `10.0.0.1/24` and `10.0.0.2/24`.  
   a. Verify ping works with default packet size.  
   b. Send a ping with payload size 1472 B (`-s 1472`) – observe fragmentation.  
   c. Increase the underlay veth MTU to 1600 (`ip link set mtu 1600`) and repeat the large ping – it should succeed without fragmentation.  
   *Explain*: Show the calculation `1600 – 50 = 1550` bytes available for inner Ethernet frame, which accommodates the 1500‑B ping packet plus its overhead.

---

## Linux Connection
### Subsystems and Files
| Subsystem | Kernel interface | Typical paths / files |
|-----------|------------------|-----------------------|
| Network namespaces | `clone(CLONE_NEWNET)`, `unshare(2)`, `setns(2)` | `/var/run/netns/` (if using `ip netns`), `/proc/<pid>/ns/net` |
| Virtual Ethernet (veth) | `drivers/net/veth.c` | `/sys/class/net/<name>/` (shows `type=veth`) |
| Bridge | `net/bridge/br_device.c`, `net/bridge/br_forward.c` | `/sys/class/net/br0/bridge/` (contains `forward_delay`, `hello_time`, `fdb_ageing_time`) |
| TAP/TUN | `drivers/net/tun.c` | `/dev/net/tun` (opened with `TUNSETIFF`) |
| VXLAN | `net/vxlan.c` | `/sys/class/net/vxlan42/` (shows `id`, `dstport`, `ageing`) |
| IP routing / ARP | `net/ipv4/`, `net/ipv6/` | `/proc/sys/net/ipv4/conf/<dev>/accept_routes`, `/proc/net/arp` |
| iproute2 toolset | User‑space front‑end to netlink | `/sbin/ip`, `/usr/sbin/brctl` (legacy), `/usr/sbin/btmon` (debug) |

### Representative Commands
```bash
# List all network namespaces known to iproute2
ip netns list

# Show the network namespace of a process
ls -l /proc/$$/ns/net

# Dump bridge FDB (learned MACs)
bridge fdb show

# Show VXLAN encapsulation details
ip -d link show vxlan42

# Monitor netlink messages (useful for debugging)
rtmon   # or: ip monitor link

# Capture packets on a veth pair to see the raw Ethernet frames
tcpdump -i veth0 -e -nn
```

---

## Why This Matters
Virtual networking is the linchpin that turns a single Linux kernel into a multi‑tenant, programmable network fabric. By mastering the primitives—**namespaces for isolation**, **veth for plumbing**, **bridges for Layer‑2 switching**, and **tun/tap/vxlan for user‑space interaction**—you gain the ability to:

* Build **container runtimes** (Docker, containerd, cri‑o) that give each container its own network stack while still allowing efficient inter‑container communication via bridges or overlay networks.
* Implement **software‑defined networking (SDN)** solutions (Open vSwitch, Cisco ACI, VMware NSX) where the data plane is expressed as bridges, VXLANs, and netfilter rules orchestrated from a control plane.
* Craft **realistic testbeds** for network protocols, firewall rules, or routing daemons without needing physical hardware; a single host can emulate dozens of routers, switches, and end‑systems.
* Optimize performance in cloud environments: knowing the exact 50‑byte VXLAN overhead lets you size MTUs correctly, avoid unnecessary fragmentation, and thus reduce latency and CPU overhead.
* Diagnose and troubleshoot complex networking issues: the same tools (`ip`, `bridge`, `tcpdump`, `netstat`) used in the exercises are the ones employed in production to verify FDB entries, VXLAN encapsulation, and namespace isolation.

In short, virtual networking transforms Linux from a monolithic kernel into a flexible, composable networking platform. Mastery of these concepts equips you to design, operate, and extend the network layers that underlie containers, virtual machines, and modern cloud infrastructures.
