---
id: 119
title: "Namespaces and cgroups"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

Every process on a Linux system shares a single view of the world: the same filesystem tree, the same network interfaces, the same process ID space, the same pool of CPU and memory. This breaks when you need isolation — when process A must not see process B's files, when a misconfigured service must not consume all available RAM, or when two programs both want to bind port 80. Namespaces and cgroups are the two kernel primitives that together make containers possible: namespaces control *what a process can see*, cgroups control *how much of the machine it can use*. Neither is sufficient alone.

---

## Core Concepts

### The Problem with Global Kernel State

The kernel maintains global tables: a process ID table, a mount table, a network interface table, a hostname stored in `uts_ns`. Every process reads from the same tables. If you want a process to believe it is PID 1, or that the hostname is `container-A`, without affecting the rest of the system, the kernel must let you create a *separate instance* of that table and assign the process to it. That is a namespace.

The key distinction: namespaces virtualize identity and visibility; they do not limit resource consumption. A process inside a PID namespace is still a real process consuming real CPU and memory. For that you need cgroups.

### Namespaces: Virtualized Views of Kernel Resources

A namespace wraps a particular type of global resource and gives each member process the illusion of an isolated instance. The kernel provides seven namespace types:

| Namespace | Flag | Isolates |
|-----------|------|----------|
| Mount | `CLONE_NEWNS` | Filesystem mount points (`/proc/mounts`) |
| UTS | `CLONE_NEWUTS` | Hostname and NIS domain (`uname -n`) |
| IPC | `CLONE_NEWIPC` | SysV IPC, POSIX message queues |
| PID | `CLONE_NEWPID` | Process ID number space |
| Network | `CLONE_NEWNET` | Network devices, IP addresses, routing tables, port space |
| User | `CLONE_NEWUSER` | UID and GID mappings |
| Cgroup | `CLONE_NEWCGROUP` | Which cgroup appears as root |

### PID Namespaces: Why PIDs Are Relative

When a process is created inside a new PID namespace, it is assigned PID 1 *within that namespace* while simultaneously having a different PID in every ancestor namespace. The kernel maintains this mapping in `struct pid` (see below). This is why a container's init can be PID 1 from its own perspective while the host sees it as PID 4271 — both are true simultaneously.

The hierarchy is strictly one-directional: a process in an ancestor namespace can see and signal processes in descendant namespaces, but not vice versa. A container process cannot signal the host's PID 1 because that PID does not exist in its namespace table; the lookup simply fails.

Signals also respect namespace boundaries: `kill(1, SIGTERM)` from inside a container targets the container's PID 1, not the host's init.

### Cgroups: Hierarchical Resource Accounting and Enforcement

A control group is a collection of processes bound to shared resource constraints, organized as a tree. A child cgroup's limits are bounded by its parent's — there is no escape upward. Each resource type is managed by a *controller*: `cpu`, `memory`, `io`, `pids`, `cpuset`, and others.

Cgroups do two separable things:

- **Accounting**: track what processes actually consume, readable from pseudo-files under `/sys/fs/cgroup/`
- **Enforcement**: prevent consumption from exceeding a threshold, implemented inside the relevant kernel subsystem (scheduler, memory allocator, block layer)

You can use accounting without enforcement — useful for observability without risk of throttling production workloads.

**cgroup v2** uses a unified hierarchy: all controllers share one tree rooted at `/sys/fs/cgroup/`. **cgroup v1** had a separate tree per controller under `/sys/fs/cgroup/<controller>/`, which caused correctness problems when a process belonged to different groups in different hierarchies — memory limits could apply to a different set of processes than CPU limits. Most modern distros (kernel ≥ 5.2 with systemd ≥ 244) default to v2. Verify with:

```bash
mount | grep cgroup
# cgroup2 on /sys/fs/cgroup type cgroup2 ... → v2 unified
# tmpfs on /sys/fs/cgroup type tmpfs ...     → v1 hybrid
```

---

## How It Works

### Creating Namespaces with `clone()`

The kernel creates namespaces at process creation time via flags passed to `clone()`:

```c
#define _GNU_SOURCE
#include <sched.h>
#include <sys/wait.h>

// Child process starts inside new UTS and PID namespaces.
// It will see itself as PID 1; the parent sees its actual PID.
pid_t pid = clone(child_fn,
                  child_stack + STACK_SIZE,
                  CLONE_NEWUTS | CLONE_NEWPID | SIGCHLD,
                  NULL);
```

An existing process can drop specific namespaces and create new ones with `unshare(2)` — it does not fork:

```c
// After this call, any mounts created by this process are private to it.
// Other processes mounting/unmounting do not affect this process's view.
unshare(CLONE_NEWNS);
```

A process can join an *existing* namespace owned by another process via `setns(2)`, using a file descriptor pointing into `/proc/[pid]/ns/`:

```c
int fd = open("/proc/4271/ns/net", O_RDONLY);
// This process now shares PID 4271's network namespace:
// same interfaces, same routing table, same port space.
setns(fd, CLONE_NEWNET);
close(fd);
```

From the shell, `nsenter(1)` wraps this:

```bash
# Enter the network namespace of PID 4271 and run ip link
nsenter --target 4271 --net ip link show
```

`unshare(1)` creates namespaces from the shell:

```bash
# Start a shell with a new UTS namespace; change hostname without
# affecting the host
unshare --uts bash
hostname container-test
hostname  # → container-test
# In another terminal: hostname → unchanged on host
```

### Namespace Identity in `/proc`

Every namespace has a unique inode number. Two processes are in the same namespace if and only if their corresponding `/proc/[pid]/ns/` symlink targets match:

```bash
ls -la /proc/1/ns/net /proc/4271/ns/net
```

```
lrwxrwxrwx 1 root root 0 ... /proc/1/ns/net    -> net:[4026531992]
lrwxrwxrwx 1 root root 0 ... /proc/4271/ns/net -> net:[4026532241]
```

The number in brackets is the inode number of the namespace object. Different numbers — different network namespaces. You can also hold a namespace alive without any processes in it by bind-mounting its pseudo-file:

```bash
# Keep the network namespace of PID 4271 alive after it exits
mount --bind /proc/4271/ns/net /run/netns/preserved
```

This is how `ip netns` persists named network namespaces in `/run/netns/`.

### PID Namespace Translation in the Kernel

A process has one PID per namespace in its ancestry chain. The kernel stores these in `struct pid`, which contains a variable-length array of `struct upid` — one entry per namespace level:

```c
// Simplified from include/linux/pid.h
struct upid {
    int nr;                   // The PID number visible in this namespace
    struct pid_namespace *ns; // Which namespace this number belongs to
};

struct pid {
    refcount_t count;
    unsigned int level;       // Depth in namespace hierarchy (0 = root)
    struct upid numbers[];    // Flexible array: numbers[0] = root namespace,
                              // numbers[level] = innermost namespace
};
```

When the kernel crosses a namespace boundary — e.g., to send a signal from a parent namespace process to a child namespace process — it walks `numbers[]` to find the correct `nr` for the target namespace. If the target namespace is not in the ancestry chain of the sender's namespace, no `upid` entry exists and the operation returns `ESRCH`.

### The CFS Scheduler and Cgroup CPU Control

The CPU controller integrates with the Completely Fair Scheduler (CFS). Each cgroup has its own CFS run queue and is assigned bandwidth via two parameters in `/sys/fs/cgroup/<group>/`:

- `cpu.max` (v2) or `cpu.cfs_quota_us` / `cpu.cfs_period_us` (v1): quota $Q$ and period $T$ in microseconds

The effective CPU limit is:

$$\text{CPU fraction} = \frac{Q}{T}$$

To limit a cgroup to 25% of one CPU with a 100 ms period:

$$Q = 25000\,\mu s,\quad T = 100000\,\mu s,\quad \frac{25000}{100000} = 0.25$$

To allow 1.5 CPUs on a multi-core machine:

$$Q = 150000\,\mu s,\quad T = 100000\,\mu s,\quad \frac{150000}{100000} = 1.5$$

```bash
# cgroup v2: create a group, limit it to 0.5 CPU
mkdir /sys/fs/cgroup/demo
echo "50000 100000" > /sys/fs/cgroup/demo/cpu.max

# Move current shell into it
echo $$ > /sys/fs/cgroup/demo/cgroup.procs

# Confirm
cat /sys/fs/cgroup/demo/cpu.max
# 50000 100000
```

When a cgroup exhausts its quota within a period, all its processes are **throttled**: they are dequeued from the CFS run queue and placed in a throttled list. They cannot run again until the period timer fires and
