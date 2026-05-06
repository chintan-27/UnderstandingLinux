---
id: 104
title: "Process and task model"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
### Process vs. Task
A **process** is an instance of a program in execution: it owns a private address space (`mm_struct`), file descriptor table (`files_struct`), filesystem context (`fs_struct`), pending signals (`signal_struct`), and one or more **scheduling entities**.  
A **task** is the kernel’s internal representation of a schedulable unit. In Linux a task is always represented by a `task_struct`; a process may contain multiple tasks when threads are present (each thread has its own `task_struct` but shares the same `mm_struct`, `files_struct`, etc.).  

### The `task_struct`
Defined in `include/linux/sched.h`, the `task_struct` is ~1.7 KB on a 32‑bit build and grows on 64‑bit due to pointer widening. Key fields (with justification) include:

| Field | Type | Purpose | Why needed |
|-------|------|---------|------------|
| `long volatile state` | `long` | Task execution state (`TASK_RUNNING`, `TASK_INTERRUPTIBLE`, …) | Scheduler must know whether to consider the task for CPU allocation. |
| `struct pid *pid` | `struct pid *` | Global PID (visible in the initial PID namespace) | Provides a stable, system‑wide identifier for `kill`, `waitpid`, etc. |
| `struct pid *tgid` | `struct pid *` | Thread group ID (same for all threads of a process) | Enables `getpid()` to return the same value for all threads. |
| `struct mm_struct *mm` | `struct mm_struct *` | User virtual address space | Allows memory management (page faults, `brk`, `mmap`) to be per‑process. |
| `struct files_struct *files` | `struct files_struct *` | Open file descriptor table | Descriptor table is shared across threads; copy‑on‑write at `fork`. |
| `struct fs_struct *fs` | `struct fs_struct *` | Working directory and root filesystem | Needed for path resolution; inherited unless changed via `chroot`. |
| `struct signal_struct *signal` | `struct signal_struct *` | Shared pending signals | Signals are delivered to the thread group; each thread may have its own handlers. |
| `struct sched_entity se` (CFS) / `struct sched_rt_entity rt` (real‑time) | Embedded | Scheduling metadata | The scheduler’s decision logic operates on these structures. |
| `struct nsproxy *nsproxy` | `struct nsproxy *` | Pointer to namespace objects (mnt, pid, uts, ipc, cgroup, user, net) | Enables per‑task view of system resources. |
| `unsigned long flags` | `unsigned long` | Per‑task flags (`PF_KTHREAD`, `PF_FORKNOEXEC`, …) | Allows the kernel to modify behavior without extra branches. |

The size comes from the sum of these structures plus padding for alignment. On a 64‑bit kernel the same logical layout occupies roughly 3 KB.

### Scheduling Entities
The Linux scheduler distinguishes two classes:

* **Completely Fair Scheduler (CFS)** – used for `SCHED_NORMAL`, `SCHED_BATCH`, `SCHED_IDLE`. Each task has a `struct sched_entity` containing `vruntime` (virtual runtime). The scheduler picks the task with the smallest `vruntime`.  
* **Real‑time (RT) schedulers** – `SCHED_FIFO` and `SCHED_RR` use `struct sched_rt_entity` with a simple priority queue; time slices are not used for FIFO, RR uses a fixed timeslice (`sched_rr_timeslice_ms`).

The scheduler’s decision function (`pick_next_task`) is O(log N) due to the red‑black tree used for CFS.

### PID Model
Each task has a `struct pid` that may be looked up via a global PID namespace (`struct pid_namespace`). The kernel allocates PIDs with an IDR (integer radix tree) to avoid linear scans. The maximum PID is exposed via `/proc/sys/kernel/pid_max` (default 32768, can be raised to 4194303).  

When a new PID namespace is created (`clone(CLONE_NEWPID)`), the namespace gets its own IDR, so PID 1 inside the namespace can refer to a different global task. The relationship is hierarchical: a task’s `pid->numbers[level].nr` gives the PID visible at that namespace level.

### Namespaces Relation
A task’s `nsproxy` points to a set of namespace objects:

* `struct mnt_namespace *mnt_ns` – mount points (filesystem view).  
* `struct pid_namespace *pid_ns` – PID numbering.  
* `struct uts_namespace *uts_ns` – hostname and domain name.  
* `struct ipc_namespace *ipc_ns` – System V IPC, POSIX message queues.  
* `struct cgroup_namespace *cgroup_ns` – cgroup root view.  
* `struct user_namespace *user_ns` – UID/GID mapping, capabilities.  
* `struct net_namespace *net_ns` – network stack (interfaces, routing, iptables).  

Changing any of these via `unshare(2)` or `setns(2)` gives the task an isolated view without affecting other tasks unless they share the same namespace pointer.

---

## How It Works
### 1. Task Creation (`fork`)
1. **Allocate `task_struct`** – `alloc_task_struct_node()` obtains memory from the slab cache (`task_struct_cachep`).  
2. **Copy‑on‑Write memory** – `copy_mm()` duplicates the `mm_struct` but marks all VMAs as read‑only; page‑fault handler later copies pages on write.  
3. **File descriptor table** – `copy_files()` increments the refcount of each `struct file`; the underlying file offset is **shared**, so a write in either parent or child advances the same offset.  
4. **Filesystem context** – `copy_fs()` shares `fs_struct` unless `CLONE_FS` is cleared.  
5. **Signal handlers** – `copy_signal()` shares `struct sighand_struct` (handlers) but gives the child its own `signal_struct` (pending signals).  
6. **Scheduler entity** – `sched_fork()` initializes `se.vruntime` to the parent’s `vruntime` (so the child starts “fair”).  
7. **Namespaces** – `copy_namespaces()` increments the refcount of each namespace pointed to by `nsproxy`; `CLONE_NEW*` flags cause new namespaces to be allocated and attached.  
8. **Put on runqueue** – `wake_up_new_task()` activates the task via `activate_task()`, which enqueues it on the appropriate CPU’s runqueue (`cfs_rq` or `rt_rq`).  

### 2. Scheduling Decision
For CFS, the **virtual runtime** increment for a time slice Δt is:

$$\Delta vruntime = \frac{\Delta t \cdot weight_{\text{load}}}{weight_{\text{task}}}$$

where `weight_task = nice_to_weight[task->static_prio - MAX_RT_PRIO]` and `weight_load = sum of weights of all runnable tasks on the CPU`.  

The scheduler aims for a **target latency** (`sched_latency`, default 6 ms). The effective timeslice for a task is:

$$\text{slice} = \min\left(\frac{weight_{\text{task}}}{weight_{\text{load}}} \times \text{sched\_latency},\; \text{sched\_min\_granularity}\right)$$

If a task’s `vruntime` exceeds the smallest `vruntime` by more than `sched_walk_granularity`, it is preempted.

For **SCHED_FIFO**, the scheduler runs the highest‑priority runnable task until it blocks, yields (`sched_yield()`), or a higher‑priority task becomes runnable. No timeslice accounting occurs.

### 3. Context Switch Cost
A typical switch involves:

* Saving/restoring registers (~30 ns).  
* Flushing TLB entries for the old address space (if `mm` changes) – ~150 ns.  
* Updating scheduler structures – ~200 ns.  

Measured on an Intel Xeon E5‑2680 v3, `perf sched latency` reports an average **0.9 µs** per switch.

---

## Worked Examples
### Example 1: `fork` + `exec` with Detailed Reasoning
```c
/* fork_exec.c */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/wait.h>

int main(void)
{
    pid_t pid = fork();                 /* 1. allocate task_struct, copy-on-write mm */
    if (pid == -1) {                    /* error */
        perror("fork");
        exit(EXIT_FAILURE);
    }

    if (pid == 0) {                     /* child */
        /* Child's mm is COW; any write triggers a page fault and a copy. */
        printf("[CHILD] pid=%d, ppid=%d\n", getpid(), getppid());
        /* Replace child's image with /bin/date */
        execl("/bin/date", "date", (char *)NULL);
        /* If execl fails */
        perror("execl");
        exit(EXIT_FAILURE);
    } else {                            /* parent */
        int status;
        /* waitpid reap child; returns child's pid */
        pid_t w = waitpid(pid, &status, 0);
        if (w == -1) {
            perror("waitpid");
            exit(EXIT_FAILURE);
        }
        if (WIFEXITED(status))
            printf("[PARENT] child %d exited with status %d\n",
                   pid, WEXITSTATUS(status));
        else
            printf("[PARENT] child %d terminated by signal %d\n",
                   pid, WTERMSIG(status));
    }
    return 0;
}
```
**Step‑by‑step numbers (typical run):**  

* Parent PID before `fork`: 4242.  
* `fork` returns child PID 4243 to parent, 0 to child.  
* Child’s `mm` initially points to the same `pgd` as parent; after the first write to the stack (for `printf`), a page‑fault copies the page (≈4 KB).  
* `execl` releases the old `mm`, allocates a new one via `load_elf_binary()`, and populates it with the ELF segments of `/bin/date`.  
* Parent’s `waitpid` returns 4243 and collects the exit status (0 for success).

### Example 2: Real‑time FIFO Scheduling
```c
/* fifo_prio.c */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sched.h>
#include <errno.h>

int main(void)
{
    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        exit(EXIT_FAILURE);
    }

    if (pid == 0) {                     /* child: real‑time FIFO, priority 50 */
        struct sched_param param = { .sched_priority = 50 };
        if (sched_setscheduler(0, SCHED_FIFO, &param) == -1) {
            perror("sched_setscheduler");
            exit(EXIT_FAILURE);
        }
        /* Run until killed */
        for (;;) {
            puts("[RT-CHILD] working");
            usleep(200000);            /* yield 200 ms */
        }
    } else {                            /* parent: normal SCHED_OTHER */
        /* Lower the child's priority to show preemption */
        struct sched_param param = { .sched_priority = 10 };
        if (sched_setscheduler(pid, SCHED_FIFO, &param) == -1) {
            perror("sched_setscheduler child");
            /* continue anyway */
        }
        waitpid(pid, NULL, 0);
    }
    return 0;
}
```
**Why this works:**  

* `SCHED_FIFO` places the task in a run‑list ordered by static priority; the scheduler picks the highest‑priority runnable task and keeps it running until it blocks or voluntarily yields.  
* The child’s priority 50 (> parent’s 10) guarantees it will run first. After the parent lowers the child's priority to 10, the scheduler will preempt the child as soon as another task (e.g., a background `bash` shell) becomes runnable, demonstrating strict priority ordering.  

**Running:**  
```bash
$ sudo ./fifo_prio   # needs CAP_SYS_NICE (root) to raise priority
[RT-CHILD] working
[RT-CHILD] working
...
```
(The parent will exit after the child is killed via `Ctrl‑C`.)

### Example 3: PID Namespace Isolation
```bash
$ unshare --pid --fork --mount-proc bash   # create new PID ns, mount proc inside
$ echo $$                                 # PID 1 inside the namespace
1
$ ps -eo pid,ppid,comm | head -5
  PID  PPID COMMAND
    1     0 bash
    2     1 ps
    3     2 ps
    4     3 ps
```
Inside the namespace, the first process (`bash`) gets PID 1, even though its global PID (visible from the initial namespace) might be 3421. The `--mount-proc` flag mounts a fresh `proc` filesystem so that `ps` reflects the namespace’s view.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Matters |
|---|---------|--------------|----------------|
| 1 | **Assuming file offsets are independent after `fork`** | The child inherits the *same* `struct file*`; the file offset is shared. A write in either process advances the same offset, causing interleaved data. | Leads to corrupted output when parent and child both write to the same log file without coordination. Use `open()` with `O_APPEND` or duplicate the descriptor (`dup2`) if independent offsets are needed. |
| 2 | **Calling `sched_setscheduler` without required capabilities** | The call fails with `EPERM` unless the process has `CAP_SYS_NICE` (typically root). | Developers testing real‑time policies on an unprivileged user see silent failures; the program continues with `SCHED_OTHER`, missing latency guarantees. |
| 3 | **Thinking PID values are globally unique across namespaces** | PID namespaces allocate their own IDR; PID 1 in a child namespace can coexist with PID 1 in the parent namespace. | When debugging containerized apps, assuming a PID from `ps` inside a container maps directly to a host PID leads to incorrect signals (`kill`) or `ptrace` attempts. |
| 4 | **Neglecting to reset signal handlers after `exec`** | `exec` preserves dispositions *except* for those set to `SIG_IGN`. Handlers set to `SIG_DFL` or custom are reset to default. | A program that installs a handler for `SIGINT` and then `exec`s a child expecting the handler to persist will see the child terminate on `Ctrl‑C` instead of handling it gracefully. |
| 5 | **Using `pthread_create` and then calling `fork` without `pthread_atfork`** | After `fork` only the calling thread exists in the child; mutexes locked at the moment of fork remain locked, causing deadlock. | Multithreaded daemons that `fork` for worker processes hang intermittently because internal locks (e.g., `malloc` lock) are held. The fix is to register handlers with `pthread_atfork` to unlock mutexes in the child before exec. |

---

## Exercises
### Easy
1. **Fork‑wait loop** – Write a program that creates **N** child processes (N supplied as argv[1]), each child prints its PID, PPID, and a random number, then exits. The parent waits for all children using `waitpid(-1, &status, 0)` and reports how many exited normally vs. by signal.  
   *Goal:* Reinforce `fork`, `waitpid`, and status decoding.

### Medium
2. **CPU‑bound priority test** – Create two child processes. Child A runs with `SCHED_FIFO` priority 10, child B with priority 5. Both execute a tight loop that increments a counter for 5 seconds (use `clock_gettime(CLOCK_MONOTONIC, …)`). The parent records the final counters and prints the ratio. Explain why the higher‑priority process gets more cycles.  
   *Goal:* Observe real‑time preemption and quantify scheduling effect.

3. **File‑offset sharing demonstration** – Open a file for writing, `fork`, have parent write `"AAAA"` and child write `"BBBB"` each using `write(fd, …, 4)` without `O_APPEND`. Examine the resulting file contents and explain the interleaving.  
   *Goal:* See shared offset effect.

### Hard
4. **PID namespace init** – Write a program that:  
   * Calls `unshare(CLONE_NEWPID | CLONE_NEWNS, 0)`.  
   * Inside the child, mounts a fresh `proc` (`mount("proc", "/proc", "proc", 0, NULL)`).  
   * Executes `/bin/bash`.  
   From a separate terminal, run `ps -ef` in the host namespace and verify that the PID of the child’s bash is **not** 1, while inside the namespace `ps` shows PID 1.  
   *Goal:* Practice namespace creation, proc mounting, and cross‑namespace PID visibility.

5. **Latency measurement with `perf`** – Run a CPU‑bound loop (e.g., `while(1) asm volatile("");`) for 10 seconds under `SCHED_OTHER` and under `SCHED_FIFO` priority 1. Use `perf stat -e task-clock,context-switches,cpu-migrations -p <pid>` to collect context‑switch counts. Compute the average time between switches and discuss the impact of the scheduling policy on latency.  
   *Goal:* Apply profiling tools to quantify scheduling behavior.

---

## Linux Connection
### Subsystems & Source Files
| Concept | Kernel Subsystem | Primary Source | Relevant Files |
|---------|------------------|----------------|----------------|
| Task structure | Scheduler / Process management | `include/linux/sched.h` | `struct task_struct` definition |
| Scheduler (CFS) | Kernel scheduler | `kernel/sched/fair.c` | `enque_task_fair`, `pick_next_task_fair`, `update_curr` |
| Real‑time scheduler | Kernel scheduler | `kernel/sched/rt.c` | `enque_task_rt`, `pick_next_task_rt` |
| PID namespaces | PID namespace implementation | `kernel/pid_namespace.c` | `alloc_pid`, `pid_ns_release_*` |
| Namespaces (general) | Namespace core | `include/linux/nsproxy.h` | `struct nsproxy`, `copy_namespaces`, `unshare` |
| /proc filesystem | Process info export | `fs/proc/` | `array.c` (shows `task_struct` fields), `base.c` |
| System call wrappers | Glibc / kernel interface | `arch/x86/entry/syscalls/syscall_64.tbl` | `__NR_fork`, `__NR_execve`, `__NR_sched_setscheduler` |

### Concrete Commands
```bash
# 1. View a task’s status fields
cat /proc/$$/status   # shows State, Pid, PPid, Uid, Gid, VmSize, voluntary_ctxt_switches, etc.

# 2. Examine scheduler statistics for current CPU
cat /proc/sched_debug   # contains cfs_rq stats, nr_running, load_avg, etc.

# 3. Change scheduling policy of a running program (needs root)
sudo chrt -f 50 <pid>          # set existing <pid> to SCHED_FIFO priority 50
sudo chrt -r -p 10 $$         # set current shell to SCHED_RR priority 10

# 4. List all namespaces a process belongs to
ls -l /proc/$$/ns/            # symlinks to mnt, pid, uts, ipc, cgroup, user, net

# 5. Create a new mount namespace and inspect mounts
unshare --mount --propagation unchanged bash
mount | head -5               # shows only mounts visible in this ns

# 6. Measure context‑switch rate
pid=$(pgrep -f "cpu_bound_loop")
perf stat -e context-switches -p $pid sleep 5
```

### Math in the Kernel
* **Load‑balanced weight calculation** (CFS):  
  $$
  weight = \frac{1024}{2^{\frac{(nice-20)}{5}}}
  $$  
  (`nice_to_weight` table in `kernel/sched/fair.c`).

* **Target latency vs. number of runnable tasks**:  
  If `nr_running` > `sched_latency / sched_min_granularity`, the slice is clamped to `sched_min_granularity` (default 0.75 ms). This prevents excessive timeslicing when many tasks compete.

* **PID allocation wrap‑around**:  
  With `pid_max = M`, the kernel uses an IDR; after allocating `M` PIDs, the next allocation scans from the start, skipping any still‑in‑use IDs. Complexity is amortized O(1).

---

## Why This Matters
Understanding the Linux process and task model is not academic; it directly shapes how you build, debug, and optimize systems:

* **Performance tuning** – Knowing how `vruntime` and timeslice formulas work lets you predict the impact of `nice` values or real‑time priorities on latency‑sensitive workloads (audio processing, HFT, robotics).  
* **Container security** – Namespaces provide the isolation that underpins Docker, Podman, and Kubernetes. Misunderstanding PID or mount namespaces leads to escapes or unintended resource sharing.  
* **Reliability** – Correct handling of shared file descriptors, signal inheritance, and `exec` semantics prevents subtle bugs like lost log lines or zombie accumulation.  
* **Observability** – Tools such as `perf`, `bpftrace`, and `/proc` expose the very structures discussed (`task_struct`, `sched_entity`, `pid`). Being able to read those outputs turns raw numbers into actionable insight.  
* **Systems programming** – When you write daemons, schedulers, or hypervis
