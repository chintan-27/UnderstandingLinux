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

## Why This Matters

Physical networks move bits between hardware interfaces. Virtual networks do the same entirely in software, and the mechanism matters: when a container's `eth0` transmits a frame, that frame crosses no wire, triggers no DMA, and wakes no interrupt handler. Instead, the kernel swaps a pointer and calls `netif_rx()` on a peer device in another namespace. Understanding exactly where packets travel — which kernel function touches them, which data structure routes them, which table they miss — is what separates someone who can configure virtual networking from someone who can debug it when it silently breaks.

---

## Core Concepts

### Network Namespaces

A network namespace is a complete, isolated instance of the kernel's network stack. Each namespace owns independent copies of:

- the interface list (`struct net_device` list anchored in `struct net`)
- the routing table (`struct fib_table`)
- the ARP/neighbor cache (`struct neigh_table`)
- netfilter/iptables rulesets
- the socket table

The kernel tracks which namespace a process belongs to via `task_struct → nsproxy → net_ns`. Every socket operation — `bind()`, `connect()`, `sendmsg()` — resolves through that namespace's state, which is why two processes in different namespaces can both bind `0.0.0.0:80` without conflict: the kernel never consults the same socket table for both.

Namespaces are reference-counted `struct net` objects. They persist as long as either a process or a network interface holds a reference. This is why `ip netns add ns1` creates a bind-mount under `/var/run/netns/ns1` — it holds a file descriptor reference so the namespace survives even after all its processes exit.

```bash
# Inspect the current process's network namespace
ls -la /proc/self/ns/net

# List all named namespaces
ls /var/run/netns/

# Enter a namespace for inspection
ip netns exec ns1 ip route show
ip netns exec ns1 ss -tulpn
```

### Linux Bridge

A bridge is a software Layer 2 switch implemented inside `net/bridge/` in the kernel. The critical path: when a frame arrives on an enslaved interface, `br_handle_frame()` intercepts it inside `netif_receive_skb()` — *before* the IP stack sees it. The bridge then:

1. Looks up the source MAC in the forwarding database (FDB), an `struct hlist_head` hash table keyed by MAC. If absent, it learns the association (MAC → port, timestamp).
2. Looks up the destination MAC. On a hit, it forwards to that port only. On a miss, it floods all ports except ingress.
3. Checks the STP port state — frames arriving on a blocking port are dropped immediately.

The FDB is not persistent. Entries age out after `ageing_time` seconds (default 300 s, tunable at `/sys/class/net/br0/bridge/ageing_time`). During a topology change, STP instructs all bridges to reduce `ageing_time` to `forward_delay` (default 15 s) so stale MAC→port mappings flush before they cause black-holes.

**Spanning Tree.** Two bridges connecting the same two segments create a broadcast loop: each bridge floods an unknown-destination frame, the other bridge receives it on a different port and floods it again, forever. STP breaks this by electing a root bridge and computing, for every non-root bridge, the least-cost path to root. Ports not on that path are put in blocking state.

Port cost is derived from link speed:

$$\text{path cost} = \frac{10^{10}}{\text{bandwidth (bps)}}$$

So a 1 Gbps port has cost $10^{10} / 10^9 = 10$, a 100 Mbps port has cost 100, and a 10 Gbps port has cost 1. The root bridge is elected by lowest Bridge ID, a lexicographically ordered tuple $(\text{priority},\ \text{MAC address})$, where priority defaults to 32768. Every non-root bridge then selects a root port (lowest cost to root) and one designated port per segment. All other ports block.

```bash
# Inspect bridge FDB
bridge fdb show dev br0

# Inspect STP port roles and states
bridge link show

# Tune ageing time (in units of 1/100 s in sysfs, seconds in iproute2)
ip link set br0 type bridge ageing_time 6000   # 60 seconds
```

### veth Pairs

A veth pair is two virtual NICs joined by an in-kernel wire. The transmit path of `veth0` calls `veth_xmit()`, which does no queuing — it directly calls `netif_rx()` on the peer device, `veth1`. The effective latency is a pointer dereference. There is no serialization, no ring buffer, no interrupt.

Each end of a veth pair is a full `struct net_device` and can be placed in a different network namespace. The canonical use: one end in a container namespace, one end enslaved to a bridge in the root namespace. The container gets an interface it owns completely; the bridge connects it to other containers or to an uplink.

One non-obvious property: **veth pairs inherit the MTU from the bridge** when enslaved. If the bridge MTU is 1500 and you need VXLAN (which requires ~50 bytes of headroom), the inner veth MTU must be reduced to 1450 or you will get silent fragmentation or drops.

```bash
# Verify peer relationship
ip link show veth0
# output includes: "link-netnsid 0" and peer index

# Check peer index from inside a namespace
ip netns exec ns1 ip link show veth1
# match "link-netnsid" to a namespace fd
```

### TAP/TUN Devices

TUN is a Layer 3 virtual interface: userspace reads and writes raw IP packets via a file descriptor. TAP is a Layer 2 virtual interface: userspace reads and writes raw Ethernet frames. Both are created via the `tun` kernel module (`tun.ko`), which registers a character device at `/dev/net/tun`.

The creation sequence:

1. `open("/dev/net/tun", O_RDWR)` — obtain a file descriptor to the tun driver.
2. `ioctl(fd, TUNSETIFF, &ifr)` — specify the interface name and flags (`IFF_TUN` or `IFF_TAP`). The kernel creates a `struct net_device` and links it to this fd.
3. The fd is now a bidirectional pipe into the kernel's packet path: packets routed to the interface are `read()`-able from the fd; frames `write()`-en to the fd are injected into `netif_rx()` as if they arrived from a NIC.

The reason this design works for VPNs: a VPN process creates a TUN interface, sets up a route so that traffic to the remote network goes through it, reads plaintext packets from the fd, encrypts them, and sends them over a UDP socket to the remote endpoint. The kernel never needs to know encryption happened — it just sees packets arriving and departing through a normal interface.

QEMU uses TAP: it opens `/dev/net/tun`, creates `tap0`, enslaves it to `br0`, and forwards all guest NIC frames through the fd. The VM's NIC is emulated entirely in QEMU's userspace; every frame the guest "sends" becomes a `write()` to the TAP fd, and appears on `br0` as if from a real NIC attached to the bridge.

```c
#include <fcntl.h>
#include <linux/if_tun.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <string.h>
#include <unistd.h>

/* Returns an open fd bound to a TAP interface named 'dev'.
   After return, the interface exists but is down — bring it up with iproute2. */
int tap_alloc(const char *dev) {
    struct ifreq ifr = {0};
    int fd = open("/dev/net/tun", O_RDWR);
    if (fd < 0) return fd;

    ifr.ifr_flags = IFF_TAP | IFF_NO_PI;
    /* IFF_NO_PI: suppress the 4-byte {flags, proto} header the kernel
       would otherwise prepend to each read(). Without this, your frame
       parser must skip 4 bytes before the Ethernet header. */
    strncpy(ifr.ifr_name, dev, IFNAMSIZ - 1);

    if (ioctl(fd, TUNSETIFF, &ifr) < 0) {
        close(fd);
        return -1;
    }
    return fd;
}

/* Minimal read loop: print byte count of each received Ethernet frame */
void rx_loop(int fd) {
    uint8_t buf[65536];
    ssize_t n;
    while ((n = read(fd, buf, sizeof(buf))) > 0)
        printf("frame: %zd bytes, dst=%02x:%02x:%02x:%02x:%02x:%02x\n",
               n, buf[0], buf[1], buf[2], buf[3], buf[4], buf[5]);
}
```

```bash
# After tap_alloc(), bring the interface up and assign an address
ip link set tap0 up
ip addr add 10.99.0.1/24 dev tap0

# Observe the interface
ip link show tap0
cat /sys/class/net/tap0/tun_flags
```

### Overlay Networks

An overlay tunnels one network protocol inside another to span an L2 domain across a routed L3 underlay. The motivation: in a data center, servers on different racks have different IP subnets, so containers on those servers cannot share an L2 broadcast domain by default. VXLAN solves this by encapsulating entire Ethernet frames inside UDP.

**VXLAN header layout** (per RFC 7348):

```
Outer Ethernet (14 B) | Outer IP (20 B) | UDP (8 B) | VXLAN (8 B) | Inner Ethernet frame
```

Total overhead: $14 + 20 + 8
