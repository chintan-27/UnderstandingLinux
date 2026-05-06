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

## Core Concepts
### Introduction to Namespaces and cgroups
Namespaces are a kernel mechanism that partitions global system resources so that each partition sees its own isolated instance. A process belongs to a namespace for each resource type (PID, mount, network, IPC, UTS, user). The kernel maintains a `struct nsproxy` per task that points to the six namespace objects; when a namespace is cloned, the kernel allocates a new namespace struct, increments its reference count, and updates the task’s `nsproxy` entry. Because namespaces share the same kernel code and data structures, the overhead is minimal—only the namespace objects themselves are duplicated.

Control groups (cgroups) provide a hierarchical way to limit, account for, and isolate resource usage (CPU, memory, I/O, etc.) of a collection of processes. In the unified hierarchy (cgroup v2), controllers are mounted under a single filesystem (typically `/sys/fs/cgroup`). Each cgroup directory corresponds to a node in the hierarchy; writing to special files (e.g., `cpu.max`, `memory.limit_in_bytes`) sets limits that the kernel enforces via the scheduler, page reclaim, or block‑io throttling. A process becomes a member of a cgroup by writing its PID to `cgroup.procs` (or `cgroup.threads` for thread‑wise containment). The kernel tracks membership via `struct cgroup` and `struct cgroup_subsys_state` attached to each task.

Why they exist: traditional Unix offered only process‑level isolation via credentials and filesystems. Modern workloads (containers, sandboxes, PaaS) need finer‑grained separation of IDs, network stacks, mount points, and resource guarantees without booting a separate kernel. Namespaces provide the view isolation; cgroups provide the metering and enforcement. Together they let multiple tenants share a kernel safely.

### Process Isolation (First‑Principles)
Consider the PID namespace. The kernel’s PID allocator is a `struct pid_namespace` containing an integer `last_pid`. When `fork()` is called, `pid = alloc_pid()` reads `last_pid`, increments it, and returns the new value. If two processes reside in different `pid_namespace` objects, each has its own `last_pid`, so the same numerical PID can refer to unrelated tasks in different namespaces. The init process of a namespace is the first task created after `unshare(CLONE_NEWPID)` or `clone(CLONE_NEWPID)`; it receives PID 1 within that namespace, but its global PID (visible from the parent namespace) is whatever the allocator handed out. This decoupling enables containers to have their own `ps` output without leaking host PIDs.

### Resource Control (First‑Principles)
Take the CPU controller in cgroup v2. The scheduler’s CFS (Completely Fair Scheduler) allocates CPU time proportional to each group’s weight. The controller exposes two parameters:
- `cpu.max`: `quota period` (e.g., `50000 100000` means 50 ms of runtime per 100 ms period).
- `cpu.weight`: an integer weight (default 100).

If a group has `quota = Q` and `period = P`, its maximum average CPU usage is `Q/P`. For multiple groups, the actual runtime granted to group *i* in each period is:
$$
\text{runtime}_i = \frac{weight_i}{\sum_j weight_j} \times P \times \min\left(1, \frac{Q_i}{P}\right)
$$
Thus, setting `cpu.max=50000 100000` yields a hard cap of 50 % CPU regardless of competing groups; adjusting `cpu.weight` changes the share *within* the allowed quota.

Memory limits work similarly: the kernel tracks `memory.current`; if it exceeds `memory.limit_in_bytes`, the page reclamation routine is invoked, potentially triggering the OOM killer for tasks in that cgroup.

## How It Works
### Namespace Creation
The `clone()` and `unshare()` syscalls accept a flags mask. Each flag corresponds to a namespace type:
| Flag | Namespace | Kernel struct |
|------|-----------|---------------|
| `CLONE_NEWPID` | PID | `struct pid_namespace` |
| `CLONE_NEWNET` | Network | `struct net` |
| `CLONE_NEWNS`  | Mount | `struct mount_namespace` |
| `CLONE_NEWIPC` | IPC   | `struct ipc_namespace` |
| `CLONE_NEWUTS` | UTS   | `struct uts_namespace` |
| `CLONE_NEWUSER`| User  | `struct user_namespace` |

When `unshare(CLONE_NEWPID)` is invoked:
1. Kernel checks `CAP_SYS_ADMIN` (unless user namespace allows it).
2. Allocates a new `pid_namespace` via `create_pid_namespace()`.
3. Sets `current->nsproxy->pid_ns_for_children = new_ns`.
4. Increments the namespace’s reference count.
All subsequently created children inherit this pointer; `fork()` does not copy the namespace, it shares the same pointer.

#### Example: Creating a PID namespace in C
```c
#define _GNU_SOURCE
#include <sched.h>
#include <unistd.h>
#include <stdio.h>
#include <sys/wait.h>

int main(void) {
    /* Create a new PID namespace; child will see its own PID numbering */
    if (unshare(CLONE_NEWPID) == -1) {
        perror("unshare");
        return 1;
    }
    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        return 1;
    }
    if (pid == 0) {          /* child */
        printf("Child PID (inside ns): %d\n", getpid());
        /* Child's init process gets PID 1 */
        execlp("sleep", "sleep", "5", (char *)NULL);
        perror("execlp");
        _exit(1);
    } else {                 /* parent */
        int status;
        waitpid(pid, &status, 0);
        printf("Parent PID (outside ns): %d\n", getpid());
    }
    return 0;
}
```
Compile with `gcc -Wall -o pidns pidns.c && ./pidns`. Output shows the child reporting PID 1 while the parent retains its original PID.

### cgroup Creation (Unified Hierarchy)
1. Mount the cgroup2 filesystem (usually done by systemd):
   ```bash
   mount -t cgroup2 none /sys/fs/cgroup
   ```
2. Create a directory for the new group:
   ```bash
   mkdir -p /sys/fs/cgroup/mygroup
   ```
3. Enable desired controllers by writing a space‑separated list to `cgroup.controllers`:
   ```bash
   echo "+cpu +memory" > /sys/fs/cgroup/mygroup/cgroup.controllers
   ```
   The leading `+` adds controllers; `-` removes them.
4. (Optional) Disable threaded mode if you want process‑level containment:
   ```bash
   echo 0 > /sys/fs/cgroup/mygroup/cgroup.threaded
   ```
5. Set limits. For a 50 % CPU ceiling:
   ```bash
   # quota = 50000 µs, period = 100000 µs → 50 %
   echo 50000 100000 > /sys/fs/cgroup/mygroup/cpu.max
   ```
   For a 200 MiB memory limit:
   ```bash
   echo $((200 * 1024 * 1024)) > /sys/fs/cgroup/mygroup/memory.limit_in_bytes
   ```
6. Move a process into the cgroup by writing its PID to `cgroup.procs`:
   ```bash
   echo $$ > /sys/fs/cgroup/mygroup/cgroup.procs   # current shell
   ```
   Or launch a process directly inside:
   ```bash
   cgexec -g cpu,memory:mygroup stress -c 1 -m 100M
   ```
   (`cgexec` is part of the libcgroup tools; on pure cgroup2 you can also use `systemd-run`.)

#### Process Movement via `setns`
To move an existing process into a namespace, open the namespace’s file descriptor under `/proc/[pid]/ns/` and invoke `setns`:
```c
#include <fcntl.h>
#include <unistd.h>
#include <sched.h>
#include <stdio.h>

int main(void) {
    int fd = open("/proc/self/ns/pid", O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    /* Suppose we want to join the PID namespace of PID 1234 */
    int target_fd = open("/proc/1234/ns/pid", O_RDONLY);
    if (target_fd < 0) { perror("open target"); return 1; }
    if (setns(target_fd, 0) == -1) { perror("setns"); return 1; }
    printf("Now in PID namespace of 1234\n");
    close(fd);
    close(target_fd);
    return 0;
}
```
`setns` requires `CAP_SYS_ADMIN` in the caller’s user namespace unless the target namespace is a user namespace that grants the capability.

### Process Movement in cgroups
Writing a PID to `cgroup.procs` triggers the kernel to:
1. Remove the task from its previous cgroup’s `cgroup.procs` (if any).
2. Add it to the target cgroup’s list.
3. Update the task’s `cgroup` pointer to the new `cgroup_subsys_state`.
The operation is O(1) with respect to the number of tasks; only the cgroup’s internal list is adjusted.

## Worked Examples
### Example 1: Creating a New PID Namespace and Verifying Isolation
**Goal**: Show that a child process sees PID 1 inside the namespace while the parent sees a different PID.

**Steps**:
1. Call `unshare(CLONE_NEWPID)` to create a fresh PID namespace.
2. Fork a child.
3. In the child, `exec` a program that prints its PID and then sleeps.
4. Parent waits, then prints its own PID (still in the original namespace).

**Code** (same as above, annotated):
```c
#define _GNU_SOURCE
#include <sched.h>
#include <unistd.h>
#include <stdio.h>
#include <sys/wait.h>

int main(void) {
    /* 1. New PID namespace */
    if (unshare(CLONE_NEWPID) == -1) {
        perror("unshare"); return 1;
    }
    pid_t child = fork();
    if (child == -1) { perror("fork"); return 1; }
    if (child == 0) {                /* child */
        printf("Child PID (inside ns): %d\n", getpid()); /* should be 1 */
        /* Keep alive long enough to observe */
        sleep(10);
        _exit(0);
    } else {                         /* parent */
        int status;
        waitpid(&child, &status, 0);
        printf("Parent PID (outside ns): %d\n", getpid()); /* original */
    }
    return 0;
}
```
**Expected output** (values will vary):
```
Child PID (inside ns): 1
Parent PID (outside ns): 4237
```
The child’s PID is 1 because it is the first task created after the namespace clone. The parent’s PID remains whatever it was before the `unshare`.

### Example 2: Limiting CPU Resources with cgroup v2
**Goal**: Constrain a CPU‑bound workload to 50 % of a single core and verify with `top`.

**Commands**:
```bash
# 1. Ensure cgroup2 is mounted (usually already on modern distros)
mount | grep -q '/sys/fs/cgroup type cgroup2' || sudo mount -t cgroup2 none /sys/fs/cgroup

# 2. Create a group
sudo mkdir -p /sys/fs/cgroup/cpulimit
sudo echo "+cpu" > /sys/fs/cgroup/cpulimit/cgroup.controllers
sudo echo 0 > /sys/fs/cgroup/cpulimit/cgroup.threaded   # process‑wise

# 3. Set quota: 50 ms per 100 ms period → 50%
sudo echo 50000 100000 > /sys/fs/cgroup/cpulimit/cpu.max

# 4. Run a stress test inside the group (stress from package 'stress')
sudo cgexec -g cpu:cpulimit stress -c 1 &
STRESS_PID=$!

# 5. Observe CPU usage (should hover ~50% of one CPU)
top -b -d 1 -p $STRESS_PID | grep $STRESS_PID

# 6. Cleanup
kill $STRESS_PID
sudo rmdir /sys/fs/cgroup/cpulimit
```
**Explanation**:
- `stress -c 1` creates one busy loop that would otherwise consume 100 % of a CPU.
- The `cpu.max` tells the CFS scheduler to allow at most 50 ms of runtime every 100 ms.
- Over a second, the task gets roughly 500 ms of CPU → 50 % utilization.
- `top` shows the `%CPU` column fluctuating around 50.0.

### Example 3: Isolating Network Interfaces
**Goal**: Create a network namespace, assign a loopback address, and verify that packets stay inside the namespace.

**C code**:
```c
#define _GNU_SOURCE
#include <sched.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    /* 1. New network namespace */
    if (unshare(CLONE_NEWNET) == -1) {
        perror("unshare"); return 1;
    }
    /* 2. Add a loopback device (requires ip tool) */
    if (system("ip link add lo0 type loopback") != 0) {
        perror("ip link add"); return 1;
    }
    if (system("ip link set lo0 up") != 0) {
        perror("ip link set up"); return 1;
    }
    if (system("ip addr add 127.0.0.2/8 dev lo0") != 0) {
        perror("ip addr add"); return 1;
    }
    /* 3. Verify */
    printf("=== lo0 address ===\n");
    system("ip -4 addr show lo0");
    printf("=== ping self ===\n");
    system("ping -c 2 127.0.0.2");
    return 0;
}
```
Compile and run (needs root or `CAP_SYS_ADMIN`):
```bash
sudo gcc -o netns netns.c && sudo ./netns
```
**Expected output** (excerpt):
```
=== lo0 address ===
3: lo0: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noop state UNKNOWN group default qlen 1000
    inet 127.0.0.2/8 scope host lo0
       valid_lft forever preferred_lft forever
=== ping self ===
PING 127.0.0.2 (127.0.0.2) 56(84) bytes of data.
64 bytes from 127.0.0.2: icmp_seq=1 ttl=64 time=0.045 ms
64 bytes from 127.0.0.2: icmp_seq=2 ttl=64 time=0.039 ms

--- 127.0.0.2 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1015ms
```
Notice that the loopback device `lo0` exists only in this namespace; the host’s original `lo` (127.0.0.1) is untouched. A ping to `127.0.0.2` does not appear on the host’s network stack.

## Common Mistakes
| Mistake | What’s Wrong | Why It Happens | How to Fix |
|---------|--------------|----------------|------------|
| **Assuming `unshare(CLONE_NEWUSER)` gives full privileges** | After creating a user namespace, the process still lacks capabilities in the original user namespace. | The user namespace only maps IDs; capabilities are governed by the mapping. Without a proper `uid_map`/`gid_map` set, `CAP_SYS_ADMIN` inside the namespace does not translate to host capabilities. | Write appropriate `uid_map` and `gid_map` files in `/proc/<pid>/` before calling `unshare`. Example: `echo "0 $(id -u) 1" > /proc/self/uid_map`. |
| **Using cgroups v1 tools (`cgcreate`, `cgset`) on a system with only cgroup v2 mounted** | Commands fail with “invalid argument” or silently create v1 hierarchies that are ignored. | Many distros now mount only the unified hierarchy; v1 tools expect a separate `cgroup` filesystem for each controller. | Use the cgroup v2 interface directly (`mkdir /sys/fs/cgroup/mygrp`, write to `cgroup.controllers`, `cpu.max`, etc.) or install `cgroup-tools` that support v2 (`cgcreate -t cpu:mygrp` with `-a` flags). |
| **Forgot to enable controllers before setting limits** | Writing to `cpu.max` returns “No such file or directory”. | In cgroup v2, a controller’s files appear only after the controller is enabled via `cgroup.controllers`. | First echo `+cpu` (or `+memory`) into `cgroup.controllers`, then write limits. |
| **Calling `setns` without `CAP_SYS_ADMIN` in the caller’s user namespace** | `setns` returns `EPERM`. | The kernel checks the caller’s capability in the user namespace that owns the target namespace. If the caller lacks it, the operation is denied. | Either run as root, or create a user namespace that maps the caller’s uid to 0 inside that namespace, then invoke `setns`. |
| **Moving a process into a cgroup by writing its PID to `cgroup.threads` when the group is not threaded** | The write succeeds but the task remains in the parent cgroup; later attempts to manage it fail. | `cgroup.threads` exists only when `cgroup.threaded` is set to 1. Writing there adds the task as a thread group member, not as a process. | Check `cat cgroup.threaded`; if 0, use `cgroup.procs`. If you truly want thread‑wise containment, set `cgroup.threaded=1` **before** adding tasks. |
| **Assuming network namespace isolation hides all host devices** | After `unshare(CLONE_NEWNET)`, physical NICs still appear in `ip link`. | The namespace inherits a *copy* of the host’s device list at creation; however, devices are not moved unless explicitly placed with `ip link set dev eth0 netns <pid>`. | To truly isolate, either create the namespace before any devices are added (e.g., in early boot) or move desired devices into the namespace with `ip link set`. |
| **Not cleaning up namespaces leading to “zombie” ns** | Long‑running shells accumulate unused namespaces, consuming kernel memory. | Each `unshare` increments the namespace’s reference count; it is only freed when the last task exits and the last `put_ns` occurs. | Track the PID of the namespace‑owning process and ensure it exits, or use `nsenter --target <pid> --mount --uts --ipc --net --pid` to join and then exit. |

## Exercises
### Easy
1. **UTS Namespace Hostname Change**  
   ```bash
   unshare -u --fork --pid bash -c 'echo "container" > /proc/sys/kernel/hostname; hostname; exec bash'
   ```
   Verify that the hostname inside the shell differs from the host’s, while `hostname` outside remains unchanged.

2. **Mount Namespace Private Bind**  
   ```bash
   unshare -m --fork --pid bash -c 'mount --bind /tmp /tmp; touch /tmp/foo; ls /tmp'
   ```
   Confirm that the bind mount is visible only in the child shell.

### Medium
1. **Memory‑Limited cgroup**  
   ```bash
   sudo mount -t cgroup2 none /sys/fs/cgroup
   sudo mkdir -p /sys/fs/cgroup/memlimit
   sudo echo "+memory" > /sys/fs/cgroup/memlimit/cgroup.controllers
   sudo echo $((100 * 1024 * 1024)) > /sys/fs/cgroup/memlimit/memory.limit_in_bytes   # 100 MiB
   sudo cgexec -g memory:memlimit stress --vm-bytes 150M --vm
