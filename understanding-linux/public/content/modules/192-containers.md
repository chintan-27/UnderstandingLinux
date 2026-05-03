---
id: 192
title: "Containers"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When you run a process on Linux, it inherits the kernel's global view of the machine: every PID, every network interface, every mount point. This works for a single workload. It breaks when you need hundreds of workloads on the same hardware, each requiring isolation from the others, bounded resource consumption, and a reproducible filesystem. The solution is not a new kernel abstraction — the kernel has no `container` object, no `container_create()` syscall — but the composition of two existing subsystems: **namespaces** (controlling what a process can see) and **cgroups** (controlling what a process can consume). Every container runtime, from Docker to containerd to `systemd-nspawn`, is userspace glue that calls `clone(2)`, `unshare(2)`, `pivot_root(2)`, and writes to `/sys/fs/cgroup` in the right order.

---

## Core Concepts

### Namespaces: Scoping the Kernel's Global Resources

The kernel maintains several resources as global singletons: the PID table, the network stack, the mount table, the hostname. A namespace wraps one such resource so that processes inside the namespace see a private instance, while the kernel maintains the real global state and translates between views.

Linux currently has seven namespace types:

| Namespace | Flag | Isolates |
|-----------|------|----------|
| `mnt` | `CLONE_NEWNS` | Filesystem mount points |
| `pid` | `CLONE_NEWPID` | Process ID number space |
| `net` | `CLONE_NEWNET` | Network interfaces, routing tables, `iptables` rules |
| `ipc` | `CLONE_NEWIPC` | System V IPC objects, POSIX message queues |
| `uts` | `CLONE_NEWUTS` | Hostname and NIS domain name |
| `user` | `CLONE_NEWUSER` | UID/GID mappings |
| `cgroup` | `CLONE_NEWCGROUP` | cgroup root directory visibility |

Each namespace type maps to a kernel struct: `struct pid_namespace`, `struct mnt_namespace`, `struct net`, and so on. The process's `struct task_struct` points to a `struct nsproxy` that holds one pointer per namespace type:

```c
// include/linux/nsproxy.h (simplified)
struct nsproxy {
    atomic_t count;
    struct uts_namespace    *uts_ns;
    struct ipc_namespace    *ipc_ns;
    struct mnt_namespace    *mnt_ns;
    struct pid_namespace    *pid_ns_for_children;
    struct net              *net_ns;
    struct cgroup_namespace *cgroup_ns;
};
```

When a process calls `getpid()`, the kernel calls `task_tgid_nr_ns(current, task_active_pid_ns(current))` — it looks up the PID *within the current `pid_namespace`*, not from the global table. The same thread of execution has a different PID value at each level of the PID namespace hierarchy simultaneously. A process at PID 1 inside a container might be PID 47382 on the host; both values are valid and consistent within their respective namespaces.

The `uts` namespace is especially useful for observability. Container runtimes call `sethostname(2)` inside a new `uts` namespace to set the container's name as its hostname. BPF programs running on the host can read `/proc/<pid>/uts` or call `bpf_get_current_task()` and dereference `task->nsproxy->uts_ns->name.nodename` to identify which container a traced process belongs to — without any container-runtime cooperation.

You can inspect which namespaces a process belongs to by examining the symlinks in `/proc/<pid>/ns/`:

```bash
# List all namespace identifiers for the current shell
ls -la /proc/$$/ns/

# Compare namespaces of two processes; same inode = same namespace
readlink /proc/$$/ns/pid
readlink /proc/1/ns/pid
```

### cgroups: Accounting and Enforcement

Namespaces change what the kernel *returns* to a process (syscall return values, `/proc` contents, visible interfaces). cgroups change how the kernel *allocates* to a process: CPU time from the scheduler, memory pages from the allocator, I/O bandwidth from the block layer.

A cgroup is a directory under `/sys/fs/cgroup` (cgroups v2, the unified hierarchy). Every process belongs to exactly one cgroup at each point in the hierarchy. You move a process into a cgroup by writing its PID to `cgroup.procs`; you set limits by writing to controller-specific interface files in that directory.

**CPU bandwidth control** uses the CFS quota/period model. A cgroup is allocated a quota $Q$ microseconds of CPU time per period $P$ microseconds. Its effective CPU allocation in cores is:

$$\text{CPU limit} = \frac{Q}{P}$$

The CFS scheduler tracks runtime consumption per-cgroup. When a cgroup exhausts $Q$ within a period, all its tasks are throttled (moved off the run queue) until the period resets. This means a container configured for 0.5 cores can burst to 100% of one CPU for 50 ms, then be throttled for the remaining 50 ms of the period — it is not smoothly rate-limited, it is burst-then-stall.

**Memory control** uses a hard limit `memory.max`. When a cgroup's resident set size reaches this limit, the kernel first tries to reclaim page cache within the cgroup. If that fails, it invokes the OOM killer, which selects a process within the cgroup to kill — not a random host process.

The critical separation: cgroups do not affect what a process *sees*, only what it *gets*. A process inside a cgroup-limited container still reads host-global values from `/proc/meminfo` and `/proc/cpuinfo` unless the runtime also mounts a cgroup-aware `procfs` overlay. This is the source of the well-known JVM heap-sizing bug: older JVMs read `/proc/meminfo` to determine available memory, see the host's full RAM, and size their heap accordingly — immediately exceeding the container's `memory.max` and triggering OOM.

```bash
# Inspect the current shell's cgroup membership
cat /proc/$$/cgroup

# Inspect the cgroup hierarchy from the root
ls /sys/fs/cgroup/

# Read available controllers
cat /sys/fs/cgroup/cgroup.controllers
```

### OverlayFS: Efficient Filesystem Layering

A container needs a root filesystem that is consistent across starts, cheap to provision (no full copy), and writable per-instance. OverlayFS satisfies all three. It merges a stack of read-only `lowerdir` directories with a single read-write `upperdir` into a unified `merged` view.

File lookup follows strict precedence from top to bottom: the `upperdir` is checked first, then each `lowerdir` from highest to lowest. The visible file at path $f$ is:

$$\text{visible}(f) = \begin{cases} \text{upperdir}(f) & \text{if } f \in \text{upperdir} \\ \text{lowerdir}_n(f) & \text{if } f \in \text{lowerdir}_n, f \notin \text{lowerdir}_{n+1}, \ldots \\ \text{ENOENT} & \text{otherwise} \end{cases}$$

Writes always go to `upperdir` via copy-on-write: before modifying a file that exists only in a lower layer, the kernel copies it up to `upperdir` first. Deletions are recorded as *whiteout* files — special device nodes with major/minor $(0, 0)$ — in `upperdir` that mask the lower-layer entry.

Because lower layers are read-only and shared, every container using the same base image shares those pages in the page cache. If ten containers run from the same Ubuntu base layer, that layer's pages are mapped once in RAM.

```bash
# Manual OverlayFS mount demonstrating the layer stack
mkdir -p /tmp/ol/{lower1,lower2,upper,work,merged}
echo "from base"    > /tmp/ol/lower1/shared.txt
echo "from layer2"  > /tmp/ol/lower2/shared.txt   # shadows lower1
echo "lower2 only"  > /tmp/ol/lower2/layer2.txt

mount -t overlay overlay \
  -o lowerdir=/tmp/ol/lower2:/tmp/ol/lower1,upperdir=/tmp/ol/upper,workdir=/tmp/ol/work \
  /tmp/ol/merged

# lower2/shared.txt shadows lower1/shared.txt
cat /tmp/ol/merged/shared.txt    # "from layer2"

# Write goes to upperdir, original lower layer unchanged
echo "modified" > /tmp/ol/merged/shared.txt
cat /tmp/ol/upper/shared.txt     # "modified"
cat /tmp/ol/lower2/shared.txt    # "from layer2" — unmodified
```

### OCI: The Syscall Contract Made Portable

The Open Container Initiative defines two specifications that sit just above the kernel syscall layer:

- **Image spec**: a container image is a stack of compressed tarballs (layers) plus a JSON manifest. Each layer is identified by its SHA-256 digest. The manifest records layer order and the image configuration (entrypoint, environment, working directory).
- **Runtime spec**: a *bundle* is a directory containing an extracted root filesystem and a `config.json`. A conforming OCI runtime (`runc`, `crun`, `gVisor`'s `runsc`) reads `config.json` and performs the sequence: `clone(2)` with the specified namespace flags → write PIDs to cgroup → `pivot_root(2)` into the bundle rootfs → drop capabilities → `execve(2)` the entrypoint.

Docker, containerd, and Kubernetes's CRI all delegate to an OCI runtime at the bottom of the stack. Understanding OCI means you can run containers without Docker:

```bash
# Build an OCI bundle manually and run it with runc
mkdir -p /tmp/bundle/rootfs
# (populate rootfs with a minimal root filesystem, e.g., from a container image)
cd /tmp/bundle
runc
