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

## Core Concepts
### Introduction to Containers
A container is a **process** (or group of processes) that runs in an isolated view of the system created by Linux kernel primitives. Unlike a virtual machine, which emulates hardware and runs a separate kernel, a container shares the host’s kernel and therefore incurs almost no CPU or memory overhead beyond the isolated processes themselves. The isolation and resource‑control mechanisms that make this possible are **namespaces** and **control groups (cgroups)**. A container image provides the filesystem; the runtime combines the image with a writable layer (usually via a union filesystem) to give the container a mutable root filesystem.

### Namespaces
Namespaces wrap global system resources in a per‑namespace scope. When a process enters a namespace, subsequent system calls that refer to those resources are automatically translated to the namespace’s view. The kernel currently implements eight namespaces (the original seven plus **time**):

| Namespace | Isolated resource | Key syscall flags |
|-----------|-------------------|-------------------|
| `mnt`     | Mount points      | `CLONE_NEWNS` |
| `pid`     | Process IDs       | `CLONE_NEWPID` |
| `net`     | Network devices, ports, routes | `CLONE_NEWNET` |
| `ipc`     | System V IPC, POSIX mqueue | `CLONE_NEWIPC` |
| `user`    | UID/GID mappings  | `CLONE_NEWUSER` |
| `cgroup`  | cgroup version 2 view | `CLONE_NEWCGROUP` |
| `uts`     | Hostname & domain name | `CLONE_NEWUTS` |
| `time`    | Clock offsets (since 5.6) | `CLONE_NEWTIME` |

A container runtime typically calls `clone(2)` (or `unshare(2)`) with the desired combination of `CLONE_NEW*` flags to create a new process that sees only its own namespace. For example, to start a shell in a fresh PID and mount namespace:

```bash
unshare --fork --pid --mount-proc /bin/bash
```

*Why this works*: The `fork` flag causes `unshare` to first fork, then the child calls `unshare(2)` to detach the specified namespaces before exec’ing the shell. The child therefore gets a PID namespace where its own PID is 1, and a mount namespace where it can mount a new root filesystem without affecting the host.

### Cgroups (Control Groups)
Cgroups hierarchically group processes and enforce limits on their resource consumption. Since kernel 4.5 the **unified hierarchy** (cgroup v2) is the default; it exposes a single tree under `/sys/fs/cgroup/` where each directory corresponds to a cgroup and contains control files such as:

* `cpu.max` – maximum CPU bandwidth (quota/period)
* `memory.max` – memory limit in bytes
* `io.max` – I/O bandwidth limits
* `pids.max` – maximum number of processes

A cgroup is created simply by making a directory:

```bash
mkdir -p /sys/fs/cgroup/mycontainer
echo "$$" > /sys/fs/cgroup/mycontainer/cgroup.procs   # attach current shell
```

*Why limits work*: The kernel scheduler checks `cpu.max` before allocating CPU time to tasks in the cgroup. If the quota for the current period is exhausted, the task is throttled until the next period. Memory accounting similarly charges each page to the cgroup; when `memory.max` is reached, further allocations trigger the OOM killer **inside** the cgroup, preventing the host from being starved.

### Filesystem Layering
Containers need a mutable root view while preserving the immutability of the underlying image for storage efficiency. The standard solution on Linux is a **union filesystem**; the most common implementation is **overlayfs**. Overlayfs combines several *lower* (read‑only) directories with a single *upper* (read‑write) directory and a *workdir* required for internal bookkeeping:

```
lowerdir  := read‑only image layers (e.g., base OS, installed packages)
upperdir  := container‑specific writable layer
workdir   := scratch space for overlayfs
merged    := combined view presented to the container
```

The mount command looks like:

```bash
mount -t overlay overlay \
  -o lowerdir=/var/lib/docker/overlay2/<id>/diff,upperdir=/var/lib/docker/overlay2/<id>/diff,workdir=/var/lib/docker/overlay2/<id>/work \
  /var/lib/docker/overlay2/<id>/merged
```

*Why this is efficient*: Only files that are actually modified are copied up to `upperdir` (copy‑on‑write). Reads are served directly from the appropriate lower layer, so the container sees a complete filesystem without duplicating unchanged data. When the container stops, the `upperdir` can be discarded or committed as a new image layer.

---

## How It Works
Creating a container involves four tightly coupled steps, each exposing a specific kernel interface.

1. **Namespace creation** – The runtime calls `clone(2)` (or `unshare(2)`) with the desired `CLONE_NEW*` flags.  
   Example (creating a isolated PID, mount, and UTS namespace and spawning a shell):

   ```c
   #define _GNU_SOURCE
   #include <sched.h>
   #include <stdio.h>
   #include <stdlib.h>
   #include <unistd.h>
   #include <sys/wait.h>

   static int child_func(void *arg) {
       execv("/bin/bash", (char * const []){"/bin/bash", NULL});
       perror("execv");
       _exit(1);
   }

   int main(void) {
       char *stack = malloc(65536) + 65536;   // grow downwards
       pid_t pid = clone(child_func, stack,
                         CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWUTS |
                         SIGCHLD, NULL);
       if (pid == -1) { perror("clone"); exit(1); }
       waitpid(pid, NULL, 0);
       free(stack - 65536);
       return 0;
   }
   ```

   *Why*: `clone` creates a child process that shares the parent’s memory (if not also using `CLONE_NEWVM`) but gets its own namespace instances. The child’s `execv` then runs the desired program inside those namespaces.

2. **Cgroup creation** – After the child is forked, the runtime adds it to a newly created cgroup directory and writes resource limits. With cgroup v2:

   ```bash
   # Assume $CGROUP_ROOT is /sys/fs/cgroup
   CGROUP=$CGROUP_ROOT/mycontainer
   mkdir -p $CGROUP
   echo "$$" > $CGROUP/cgroup.procs                # attach the shell

   # Limit CPU to 25% (quota = period * 0.25)
   echo 100000 > $CGROUP/cpu.max                 # period = 100ms (default)
   echo 25000  > $CGROUP/cpu.max                 # quota = 25ms per period

   # Limit memory to 200 MiB
   echo $((200*1024*1024)) > $CGROUP/memory.max
   ```

   *Why*: The kernel’s scheduler and memory manager consult these files on every scheduling tick or page‑fault, enforcing the limits without extra overhead.

3. **Filesystem setup** – The runtime prepares a root filesystem, usually via overlayfs, then calls `pivot_root(2)` (or `mount --make-rprivate` + `chdir`) to switch the container’s root view.

   ```bash
   # Prepare directories
   LOWER=/var/lib/myimages/ubuntu/base
   UPPER=/var/lib/mycontainers/container1/upper
   WORK=/var/lib/mycontainers/container1/work
   MERGED=/var/lib/mycontainers/container1/merged

   mkdir -p $UPPER $WORK $MERGED
   mount -t overlay overlay \
     -o lowerdir=$LOWER,upperdir=$UPPER,workdir=$WORK \
     $MERGED

   # Switch root
   cd $MERGED
   pivot_root . .   # move old root to . (now inaccessible)
   umount -l /      # lazy umount of the old root (now hidden)
   exec chroot . /bin/bash
   ```

   *Why*: `pivot_root` atomically exchanges the mount namespace’s root filesystem with the new one, making the old root inaccessible (and eventually unmountable). This guarantees that all subsequent path resolution uses the layered filesystem.

4. **Process execution** – Finally, the runtime `execve`s the target application (e.g., `/bin/bash`) inside the isolated namespaces, cgroup, and root filesystem. All subsequent syscalls (e.g., `open`, `bind`, `clone`) are automatically scoped to the container’s view.

---

## Worked Examples
### Example 1: CPU and Memory Limits via cgroup v2
**Goal**: Run a stress‑ng CPU worker limited to 20 % CPU and 150 MiB memory.

**Step‑by‑step**:

1. Create a cgroup:

   ```bash
   CGROUP=/sys/fs/cgroup/stressdemo
   mkdir -p $CGROUP
   ```

2. Attach the shell (so that child processes inherit the cgroup):

   ```bash
   echo "$$" > $CGROUP/cgroup.procs
   ```

3. Compute CPU quota. The default period is 100 ms = 100 000 µs.  
   Desired fraction = 0.20 → quota = period × fraction = 100 000 × 0.20 = 20 000 µs.

   ```bash
   echo 100000 > $CGROUP/cpu.max          # write period first (kernel expects "max" as "quota period")
   echo 20000 > $CGROUP/cpu.max           # now quota (overwrites previous line)
   ```

   *Note*: Writing `cpu.max` with two numbers sets `<quota> <period>`. The order matters; the kernel reads the line as two integers.

4. Set memory limit:

   ```bash
   echo $((150*1024*1024)) > $CGROUP/memory.max   # 150 MiB in bytes
   ```

5. Launch the workload (it will inherit the cgroup because we wrote the shell’s PID earlier):

   ```bash
   stress-ng --cpu 4 --timeout 30s
   ```

   *Observation*: `top` will show each stress-ng thread consuming roughly 5 % of a CPU (4 threads × 5 % = 20 %). The RSS reported by `ps` will stay near 150 MiB; if it tries to exceed, the OOM killer will terminate the stress-ng process inside the cgroup.

### Example 2: Building a Minimal Container with overlayfs and pivot_root
**Goal**: Start a shell that sees `/etc/hostname` as “container” while the host hostname remains unchanged.

**Preparation** (host):

```bash
# 1. Gather a minimal rootfs (e.g., from Docker's ubuntu:22.04 tarball)
mkdir -p /tmp/rootfs
tar -xpf ubuntu-22.04-rootfs.tar.gz -C /tmp/rootfs

# 2. Create overlay directories
LOWER=/tmp/rootfs
UPPER=/tmp/container/upper
WORK=/tmp/container/work
MERGED=/tmp/container/merged
mkdir -p $UPPER $WORK $MERGED

# 3. Mount overlayfs
mount -t overlay overlay \
  -o lowerdir=$LOWER,upperdir=$UPPER,workdir=$WORK \
  $MERGED
```

**Inside a new namespace** (still on host, but we will enter a fresh UTS namespace):

```bash
# 4. Clone a child with a new UTS namespace
unshare --fork --uts --mount-proc /bin/bash <<'EOF'
   # 5. Switch root via pivot_root
   cd $MERGED
   pivot_root . .          # make $MERGED the new root
   umount -l /             # detach the old root (now hidden)
   # 6. Set a container‑specific hostname
   echo container > /etc/hostname
   hostname -F /etc/hostname
   # 7. Exec a shell
   exec /bin/bash
EOF
```

*Why this works*:  
- `unshare --uts` gives the child its own hostname setting, so changes to `/etc/hostname` do not affect the host.  
- The overlay mount provides a writable upper layer while preserving the read‑only base image.  
- `pivot_root` swaps the mount namespace’s root, ensuring that all subsequent path resolution (including `/etc/hostname`) points to the layered filesystem.  
- The `umount -l /` cleans up the old root to avoid “device busy” errors when later removing the overlay.

---

## Common Mistakes
| Mistake | What’s wrong | Why it matters |
|---------|--------------|----------------|
| **Using `--privileged` or `CAP_SYS_ADMIN` unnecessarily** | Grants the container almost all host capabilities, effectively breaking namespace isolation. | A compromised container can then load kernel modules, modify `/dev/*`, or reconfigure host cgroups, leading to privilege escalation. |
| **Assuming PID‑namespace isolation hides signals** | Sending `SIGKILL` or `SIGSTOP` to PID 1 inside the container still works because these signals are *not* namespaced. | A process inside the container can be killed from the host, breaking expectations of isolation; only signals like `SIGCHLD` are namespaced. |
| **Mounting a bind‑mount without making it `rprivate`** | The bind‑mount propagates mount/unmount events between host and container namespaces. | The container can unintentionally mount or unmount host filesystems (e.g., `umount /` inside container will also unmount the host’s root if the mount is shared). |
| **Neglecting to set `workdir` for overlayfs** | Overlayfs requires a dedicated workdir on the same filesystem as upperdir; omitting it yields `mount: wrong fs type, bad option, bad superblock`. | The container fails to start; debugging is frustrating because the error message is vague. |
| **Leaving cgroup directories after container stops** | The cgroup persists, consuming inodes and potentially holding references to defunct processes. | Over time, the cgroup filesystem can fill up, causing `ENOSPC` when trying to create new cgroups; also makes resource accounting inaccurate. |
| **Using Docker’s `-m` flag with cgroup v1 on a v2‑only system** | Docker translates `-m` to `memory.limit_in_bytes` (v1) which is ignored on unified hierarchy, resulting in no limit. | Users think they limited memory but the container can consume all host RAM, leading to OOM kills of host services. |

---

## Exercises
### Easy
1. **Namespace inspection** – Run `unshare --fork --pid --mount-proc /bin/bash`. Inside the new shell, execute `cat /proc/$$/ns/pid` and compare it with the host’s value. Explain what you see.
2. **Simple cgroup limit** – Create a cgroup `demo` under `/sys/fs/cgroup`, attach your shell, and set `memory.max` to 50 MiB. Run `yes > /dev/null` and observe the OOM kill via `dmesg`.

### Medium
3. **CPU quota calculation** – Starting from a default period of 100 ms, determine the quota needed to limit a task to 12.5 % CPU. Write the appropriate values to `cpu.max` and verify with `htop` that the task’s CPU usage stays near the target.
4. **Overlayfs robustness** – Prepare a lowerdir containing a file `lower.txt` with content “original”. Mount an overlay with an empty upperdir. Inside the merged view, delete `lower.txt`. Then, check the upperdir for a whiteout file. Explain how overlayfs represents deletions.

### Hard
5. **Build a container from scratch** – Using only `unshare`, `mkdir`, `mount` (overlayfs), `pivot_root`, and `execve`, start a shell that:
   - Has its own PID, UTS, mount, and user namespaces (map host UID 1000 to container UID 0).  
   - Is limited to 200 MiB memory and 10 % CPU via cgroup v2.  
   - Has a hostname “builder”.  
   Provide the exact sequence of commands (or a short script) and validate each property with appropriate checks (`ps`, `hostname`, `cat /proc/$$/status`, `cat /sys/fs/cgroup/.../cpu.max`).

6. **Network namespace + veth pair** – Create a network namespace, move one end of a veth pair into it, assign IP 10.0.0.2/24 inside the namespace and 10.0.0.1/24 on the host, and enable ping between them. Show the commands and explain how the netns isolates the container’s network stack.

---

## Linux Connection
### Key Subsystems and Files
| Subsystem | Path / Tool | Typical Use in Containers |
|-----------|-------------|---------------------------|
| Namespaces | `/proc/<pid>/ns/` (e.g., `ns/pid`, `ns/mnt`) | Inspect or enter namespaces with `nsenter -t <pid> -n` (net), `-m` (mnt), `-u` (uts). |
| Cgroups v2 | `/sys/fs/cgroup/` (unified hierarchy) | Create directories, write `cpu.max`, `memory.max`, `pids.max`. |
| Overlayfs | `mount -t overlay` | Combine read‑only image layers with a writable upper layer. |
| Capabilities | `cap_get_proc()`, `capset()` (libcap) / `capsh` | Drop unnecessary capabilities after user‑namespace setup (`CAP_NET_RAW`, `CAP_SYS_CHROOT`, etc.). |
| User namespaces | `/proc/self/uid_map`, `/proc/self/setgroups` | Map host UIDs to container UIDs (enables root‑less containers). |
| Network namespaces | `ip netns add <name>`, `ip link set <dev> netns <ns>` | Isolate network interfaces, ports, routing tables. |
| Utilities | `unshare`, `nsenter`, `runc`, `crun`, `podman`, `docker` | High‑level runtime helpers that perform the steps above automatically. |

### Example Commands (run on a modern Ubuntu 22.04+ host)

```bash
# 1. View the PID namespace of the current shell
readlink /proc/$$/ns/pid
# Output: pid:[4026531836]

# 2. Enter a new network namespace and look at interfaces
sudo ip netns add testns
sudo ip netns exec testns ip link show
# Shows only lo

# 3. Create a cgroup v2 and limit memory to 100MiB
CGROOT=/sys/fs/cgroup
CGROUP=$CGROOT/my_limit
mkdir -p $CGROUP
echo $$ > $CGROUP/cgroup.procs
echo $((100*1024*1024)) > $CGROUP/memory.max

# 4. Verify that a memory‑hungry process is killed
strangecat() { dd if=/dev/zero of=/dev/null bs=1M count=200; }
strangecat   # will be OOM‑killed inside the cgroup
dmesg | grep -i "out of memory" | tail -1

# 5. Drop all capabilities except those needed for a simple server
capsh --drop=all -- -c "echo 'capabilities retained:' && capsh --print"
```

*Why these paths matter*: They are the exact interfaces that container runtimes (runc, crun, dockerd) interact with. Understanding them lets you debug, audit, or build custom containers without relying on a black‑box CLI.

---

## Why This Matters
Containers are not a mystical “black box”; they are a deliberate composition of well‑understood Linux primitives. By mastering **namespaces**, you grasp *how* isolation is achieved at the level of process IDs, mounts, networks, and even time. By mastering **cgroups**, you understand *why* a container cannot starve the host of CPU, memory, or I/O, and you can enforce precise service‑level objectives. Filesystem layering shows *how* images stay immutable and shareable while still giving each container a mutable view, enabling efficient storage and rapid startup.

When you can trace a `docker run` command back to the underlying `clone(2)`, `mount -t overlay`, `cgroup` directory creation, and `pivot_root(2)`, you gain the ability to:

* Diagnose failures that arise from missing namespace flags or mis‑mounted overlays.  
* Harden containers by dropping capabilities, configuring user namespaces, and tightening cgroup limits without relying on opaque defaults.  
* Build specialized runtimes (e.g., for lightweight edge devices or high‑performance HPC) that bypass the overhead of general‑purpose engines while still using the same kernel guarantees.  
* Contribute to or audit container security standards (CIS Docker Benchmark, NIST SP 800‑190) because you know exactly which kernel files control each property.

In short, the concepts in this lesson are the **foundations** of modern cloud infrastructure, DevOps pipelines, and secure application deployment. Knowing them transforms you from a user of container tools into an engineer who can shape, extend, and secure the very mechanisms that make containers possible.
