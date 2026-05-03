---
id: 194
title: "Storage and networking in containers"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every container runtime — Docker, containerd, CRI-O — rests on two kernel mechanisms: OverlayFS for storage and network namespaces plus veth pairs for networking. Understanding these at the syscall level tells you why containers start in milliseconds instead of seconds, why a 500 MB image shared across 50 containers costs roughly 500 MB of disk rather than 25 GB, and why per-connection latency degrades predictably as iptables rule sets grow. These are not implementation details you can defer — they determine capacity planning, debug workflows, and the limits of what containers can isolate.

## Core Concepts

### OverlayFS: Copy-on-Write Layering

OverlayFS presents multiple read-only directory trees (lowerdirs) and one writable directory (upperdir) as a single merged view. The critical property: reads are transparent, but the first write to a file from a lower layer triggers a **copy-up** — the kernel copies the entire file into upperdir before applying the write. Lower layers are never modified.

This operates at the VFS layer, intercepting `lookup`, `open`, and `write` before they reach any physical filesystem driver. The underlying storage can be ext4, xfs, btrfs, or tmpfs — OverlayFS does not care. The mount syscall for an overlay filesystem is:

```c
mount("overlay", "/merged", "overlay", MS_MGC_VAL,
      "lowerdir=/l2:/l1:/l0,upperdir=/upper,workdir=/work");
```

`workdir` must be on the same filesystem as `upperdir`. The kernel uses it as an atomic staging area: during copy-up, the file is written to `workdir` first, then rename(2)'d into `upperdir`. This guarantees that a crash mid-copy-up never leaves a partial file visible in the merged view.

### Linux Namespaces: Kernel-Enforced Scope

A namespace does not sandbox a process — it changes what the process *sees*. Relevant namespaces for containers:

| Namespace | Flag | What it scopes |
|-----------|------|----------------|
| mount | `CLONE_NEWNS` | filesystem tree (`/proc/mounts`) |
| network | `CLONE_NEWNET` | interfaces, routes, iptables, sockets |
| UTS | `CLONE_NEWUTS` | hostname, domainname |
| PID | `CLONE_NEWPID` | process ID numbering |
| IPC | `CLONE_NEWIPC` | SysV semaphores, POSIX message queues |

A container runtime creates these via `clone(2)` or `unshare(2)`:

```c
pid_t pid = clone(child_fn, stack + STACK_SIZE,
    CLONE_NEWNS | CLONE_NEWNET | CLONE_NEWPID | SIGCHLD, NULL);
```

There is no hypervisor boundary. When a container thread executes in user mode, it runs directly on hardware. The namespace machinery is invoked only at kernel boundary crossings: `open(2)`, `socket(2)`, `getpid(2)`, etc. Scheduling overhead relative to a bare process is zero; the cost is in the syscall paths that must resolve names through the namespace.

### veth Pairs and Bridge Networking

A `veth` pair is a bidirectional kernel pipe between two virtual NICs. The kernel source defines the pair in `drivers/net/veth.c`; each end is a full `struct net_device`. Frames written to one end are delivered to the other via `veth_xmit → veth_forward_skb`. No userspace process is in the path — it is a direct `skb` hand-off in kernel memory.

One end of the pair lives in the container's network namespace; the other lives in the host namespace attached to a bridge (`docker0`, `cni0`). The bridge (`net/bridge/br_forward.c`) does Layer 2 forwarding: it learns source MACs from incoming frames and delivers unicast frames to the correct `veth` port. IP routing above the bridge handles inter-subnet traffic.

NAT between the container subnet and the host's external interface is implemented via Netfilter's MASQUERADE target, tracked per-connection by `nf_conntrack`.

### CNI: Decoupling Runtime from Network Policy

The Container Network Interface specification defines a contract: a CNI plugin is an executable that reads JSON config from stdin, accepts environment variables (`CNI_COMMAND`, `CNI_NETNS`, `CNI_IFNAME`, `CNI_CONTAINERID`) set by the runtime, and returns JSON describing the resulting interface configuration. The runtime is responsible only for creating the network namespace and calling the plugin. The plugin owns everything else: bridge creation, veth wiring, IP allocation (via a sub-plugin called IPAM), and route injection.

This separation means you can replace the network model (flat bridge, VXLAN overlay, eBPF routing) without modifying the runtime.

## How It Works

### OverlayFS Layer Structure

Given image layers `L0` (base), `L1`, `L2` (read-only) and container layer `W` (writable):

```
W  (upperdir)   — writable, container-specific
──────────────
L2 (lowerdir)   — read-only image layer
L1 (lowerdir)
L0 (lowerdir)   — base OS layer
```

File lookup for `/etc/passwd` when it exists only in `L1`:
1. Check `W` — absent
2. Check `L2` — absent
3. Check `L1` — found → `dentry` returned

First write to `/etc/passwd`:
1. Kernel detects file is in `L1`, not `W`
2. Copies full file to `workdir` (atomic rename into `W` on completion)
3. All subsequent reads and writes resolve to `W`; `L1`'s copy is shadowed for this container

Copy-up cost is $O(s)$ where $s$ is file size — paid once per file per container. Containers that frequently write to large files in lower layers (e.g., append-heavy logs residing in the image) pay this cost at startup. The mitigation is bind-mounting writable paths rather than letting them live in the overlay.

For $n$ layers, worst-case lookup cost (file absent from all layers) is $O(n)$ directory lookups. Docker images rarely exceed 20 layers; this is not a practical bottleneck except in pathological Dockerfile construction.

Mount overlay manually to inspect the mechanism:

```bash
mkdir -p lower upper work merged
echo "base file" > lower/hello.txt

mount -t overlay overlay \
  -o lowerdir=lower,upperdir=upper,workdir=work \
  merged

# Verify the merged view
cat merged/hello.txt        # reads from lower/

# Trigger copy-up
echo "modified" > merged/hello.txt

# Lower is unchanged; upper holds the copy
cat lower/hello.txt         # "base file"
cat upper/hello.txt         # "modified"

umount merged
```

### veth Pair and Bridge Setup

This is the exact sequence a container runtime executes at network setup:

```bash
# Create an isolated network namespace
ip netns add ctr1

# Create a veth pair
ip link add veth0 type veth peer name veth1

# Move one end into the container namespace
ip link set veth1 netns ctr1

# Host side: bring up and attach to bridge
ip link set veth0 up
ip link set veth0 master docker0

# Container side: configure addressing and default route
ip netns exec ctr1 ip link set lo up
ip netns exec ctr1 ip link set veth1 up
ip netns exec ctr1 ip addr add 172.17.0.2/16 dev veth1
ip netns exec ctr1 ip route add default via 172.17.0.1

# Verify isolation: container sees only lo and veth1
ip netns exec ctr1 ip link show
```

Packet path from container process to the internet:

```
container process
    │  write() → socket send buffer
    ▼
veth1 (container netns) — skb handed off in kernel
    ▼
veth0 (host netns) → docker0 bridge (L2 forwarding)
    ▼
ip_forward() — kernel routing decision
    ▼
iptables POSTROUTING / MASQUERADE
    │  src IP rewritten: 172.17.0.2 → host public IP
    │  conntrack entry created
    ▼
eth0 → physical network

Return path: conntrack matches reply, rewrites dst IP back to 172.17.0.2,
             routes via docker0 → veth0 → veth1 → container socket
```

The MASQUERADE target rewrites the source address in the IP header. Return packets are matched by `nf_conntrack` using a 5-tuple $(src_{ip}, dst_{ip}, src_{port}, dst_{port}, proto)$ and de-NATed before delivery.

### CNI Plugin Invocation

A CNI `ADD` call from a runtime to the `bridge` plugin:

```bash
CNI_COMMAND=ADD \
CNI_CONTAINERID=abc123 \
CNI_NETNS=/proc/12345/ns/net \
CNI_IFNAME=eth0 \
CNI_PATH=/opt/cni/bin \
/opt/cni/bin/bridge <<'EOF'
{
  "cniVersion": "0.4.0",
  "name": "mynet",
  "type": "bridge",
  "bridge": "cni0",
  "isGateway": true,
  "ipMasq": true,
  "ipam": {
    "type": "host-local",
    "subnet": "10.88.0.0/16",
    "routes": [{ "dst": "0.0.0.0/0" }]
  }
}
EOF
```

Inside the plugin, the sequence is:

1. `ip link add cni0 type bridge` (if absent)
2. `ip link add <veth_host> type veth peer name eth0`
3. `ip link set eth0 netns /proc/12345/ns/net`
4. Exec `host-local` IP
