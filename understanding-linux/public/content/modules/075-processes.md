---
id: 75
title: "Processes"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
### Process Definition
A **process** is the OS abstraction of a program in execution. It consists of:
- An **address space** (private virtual memory region) containing code, data, stack, and heap.
- A set of **kernel resources**: file descriptors, signal handlers, credentials (UID/GID), timers, and IPC objects.
- A **processor context**: the values of CPU registers (PC, SP, general‑purpose registers) at the last interruption point.

The OS must isolate these components so that a fault in one process cannot corrupt another’s memory or resources. This isolation is the primary reason the OS creates a **process control block (PCB)** for each process: the PCB is the kernel’s single source of truth for the above items, enabling fast context switches and correct resource accounting.

### Why the PCB Exists
When the scheduler decides to run a different task, it must:
1. Save the current CPU state into the old task’s PCB.
2. Load the new task’s CPU state from its PCB.
3. Update any hardware structures (e.g., page table base register) that depend on the task’s address space.

If the PCB did not exist, the kernel would need to scatter this information across many data structures, increasing the cost of a context switch and making correct restoration error‑prone. The PCB therefore reduces context‑switch overhead to **O(1)** with respect to the number of processes.

### Minimal PCB Fields (Linux `task_struct`)
```c
/* Simplified excerpt from include/linux/sched.h */
struct task_struct {
    long   state;          /* -1 unrunnable, 0 runnable, >0 stopped */
    pid_t  pid;            /* process identifier */
    pid_t  tgid;           /* thread group identifier (PID for traditional processes) */
    struct mm_struct *mm;  /* pointer to address space */
    struct files_struct *files; /* open file table */
    struct sighand_struct *sighand; /* signal handlers */
    struct sigpending pending;    /* queued signals */
    unsigned long  nvcsw, nivcsw; /* voluntary/involuntary context switches */
    /* … many more fields for accounting, scheduling, security … */
};
```
The size of `task_struct` on x86_64 is ≈ 1.7 KB; the kernel allocates one per process from a slab cache, keeping allocation overhead low.

### Process Lifecycle (First‑Principles View)
A process moves through states because the **scheduler** and **event‑waiting mechanisms** change the conditions under which the CPU may execute it:

| State   | Kernel Condition                                          | Triggering Event                              |
|---------|-----------------------------------------------------------|-----------------------------------------------|
| **Running** | `state == TASK_RUNNING` and the CPU is executing this `task_struct`. | Scheduler picks it from the runqueue. |
| **Ready**   | `state == TASK_RUNNING` but not currently executing (waiting for CPU). | Scheduler places it on a runqueue; no I/O block. |
| **Blocked** | `state` is one of `TASK_INTERRUPTIBLE`, `TASK_UNINTERRUPTIBLE`. | Process executes a blocking syscall (e.g., `read`, `waitpid`) or takes a page fault that requires I/O. |
| **Zombie**  | `state == EXIT_ZOMBIE` (a special value). | Process has called `exit()` but its parent has not yet performed `wait()`/`waitpid()` to retrieve the exit status. |
| **Dead**    | `task_struct` freed after parent reaps it. | Parent successfully waits; kernel releases the PCB and associated memory. |

Note that **Ready** and **Running** are both represented by `TASK_RUNNING`; the distinction is purely scheduling‑policy based.

---

## How It Works
### Scheduler and Context Switch Mechanics
The Linux scheduler (CFS – Completely Fair Scheduler) maintains per‑CPU **runqueues** (`struct rq`). Each runqueue holds a red‑black tree of `task_struct`s ordered by virtual runtime (`vruntime`). The scheduler picks the leftmost node (smallest `vruntime`) as the next task.

A context switch from `prev` to `next` involves:
1. **Saving** `prev`’s registers: `switch_to(prev, next)` (in `entry.S`/`switch_to_asm.S`).
2. **Updating** the memory management unit (MMU): load `next->mm->pgd` into `CR3`.
3. **Restoring** `next`’s registers and returning to user mode via `ret_from_fork` or `ret_from_sys_call`.

The total time can be modeled as:
$$
T_{cs} = T_{save} + T_{load} + T_{mmu} + T_{overhead}
$$
where:
- $T_{save}, T_{load}$ ≈ 200–300 ns each (register spill/fill).
- $T_{mmu}$ (TLB flush + CR3 load) ≈ 50–100 ns on modern CPUs (often avoided via PCID).
- $T_{overhead}$ (locking, runqueue updates) ≈ 100–200 ns.

Thus a typical switch costs **0.5–1 µs**, which is why high‑frequency switching (e.g., thousands of threads) can become a bottleneck.

### Wait Queues and Blocking
When a process executes a blocking syscall, the kernel:
1. Changes its `state` to `TASK_INTERRUPTIBLE` (or `UNINTERRUPTIBLE` for non‑interruptible waits).
2. Places the `task_struct` on a **wait queue** (`wait_queue_head_t`) associated with the event (e.g., a socket receive buffer).
3. Calls `schedule()` to pick another task.

When the event occurs (e.g., data arrives), the interrupt handler or bottom half:
1. Walks the wait queue.
2. For each waiting task, sets `state = TASK_RUNNING` and wakes it via `try_to_wake_up()`.
3. The scheduler may preempt the current task if the woken task has higher priority.

### Zombie Creation and Reaping
A process calls `exit()` → `do_exit()`:
1. Sets `task_struct->exit_state = EXIT_ZOMBIE`.
2. Notifies its parent via `SIGCHLD` (unless `SA_NOCLDWAIT` is set).
3. Releases mm, files, etc., but **keeps** the `task_struct` so the parent can retrieve `exit_code` and usage statistics via `wait4()`/`waitpid()`.

If the parent never calls `wait*()`, the zombie remains until **init** (PID 1) adopts it when the original parent terminates (orphan reaping). This prevents resource leaks: the zombie consumes only the PCB (~1.7 KB) and a few accounting fields.

### Exec and Memory Image Replacement
`execve()` does **not** create a new process; it transforms the existing one:
1. Releases the current `mm_struct` (address space) via `mmput()`.
2. Allocates a new `mm_struct`, loads the new executable’s ELF segments, sets up stack, argv, envp.
3. Resets signal dispositions to default (unless `SA_NOCLDWAIT` etc.).
4. Sets `task_struct->pid` unchanged, `tgid` unchanged, but updates `task_struct->comm` to the new binary name.

Because the PID stays the same, `getpid()` returns the same value before and after `exec`, a useful property for daemons that preserve their PID across restarts.

---

## Worked Examples
### Example 1: Fork → Exec → Wait (Step‑by‑step with Numbers)
```c
/* fork_exec_wait.c */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/wait.h>
#include <errno.h>

int main(void) {
    pid_t pid = fork();                     /* 1. Kernel copies task_struct, assigns new PID */
    if (pid == -1) {
        perror("fork");
        exit(EXIT_FAILURE);
    }

    if (pid == 0) {                         /* Child */
        printf("[child] pid=%d, ppid=%d\n", getpid(), getppid());
        /* Replace child's memory with /bin/true */
        execlp("true", "true", (char *)NULL);
        /* If execlp fails */
        perror("execlp");
        _exit(EXIT_FAILURE);               /* Use _exit to avoid flushing stdio twice */
    } else {                                /* Parent */
        int status;
        pid_t w = waitpid(pid, &status, 0); /* 2. Parent blocks until child changes state */
        if (w == -1) {
            perror("waitpid");
            exit(EXIT_FAILURE);
        }
        if (WIFEXITED(status))
            printf("[parent] child %d exited with status %d\n", w, WEXITSTATUS(status));
        else
            printf("[parent] child %d terminated abnormally\n", w);
    }
    return 0;
}
```
**Explanation**
1. `fork()` creates a *copy‑on‑write* (COW) duplicate of the parent’s `task_struct` and `mm_struct`. The child gets a new `pid` (e.g., 4242) while `tgid` equals the parent’s PID (e.g., 4240). No physical memory is copied yet.
2. In the child, `execlp("true", …)` triggers `execve()`:
   - The child’s old `mm` is freed (`mmput`), releasing its pages.
   - A fresh `mm` is allocated; the ELF loader maps `/bin/true` (≈ 30 KB) into the new address space.
   - The child’s `pid` remains 4242; `comm` becomes `"true"`.
3. The parent calls `waitpid(pid, &status, 0)`. The kernel puts the parent on a wait queue for the child’s exit event. When the child calls `_exit()`, the kernel:
   - Sets child’s `exit_state = EXIT_ZOMBIE`.
   - Sends `SIGCHLD` to the parent.
   - Wakes the parent from the wait queue, copies the child’s exit code into `status`, and returns the child’s PID.
4. After `waitpid` returns, the zombie is reaped; the child’s `task_struct` is freed, releasing its PCB.

**Timing numbers (typical x86_64, Linux 6.6)**
- `fork()` (COW): ~ 5 µs (mostly allocating a new `task_struct` and duplicating VMAs).
- `execve()` of a small static binary: ~ 15 µs (memory allocation, ELF parsing, page table setup).
- `waitpid()` when child already exited: ~ 0.5 µs (just reading the exit status).
- Total for the sequence: ≈ 25 µs, dominated by the exec.

### Example 2: Zombie Creation and Orphan Reaping
```c
/* zombie.c */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>

int main(void) {
    pid_t pid = fork();
    if (pid == -1) { perror("fork"); exit(1); }

    if (pid == 0) {          /* Child */
        printf("[child] pid=%d exiting\n", getpid());
        _exit(0);            /* Immediate exit → zombie */
    }

    /* Parent does NOT wait; sleeps to let child become zombie */
    sleep(5);
    system("ps -o pid,ppid,stat,comm -C true"); /* Show any zombie true? none */
    system("ps -o pid,ppid,stat,comm --ppid $$"); /* Show our children */
    /* Now parent exits; child becomes orphan */
    printf("[parent] exiting, child will be reaped by init\n");
    return 0;                /* Parent terminates */
}
```
**What you’ll see**
- After the `sleep(5)`, running `ps -o pid,ppid,stat,comm --ppid <parent-pid>` shows a line like:
  ```
  4243 4240 Z true
  ```
  `STAT` = `Z` (zombie), `PPID` still points to the parent (4240).
- When the parent exits, `init` (PID 1) adopts the child; a subsequent `ps` shows the child’s `PPID` changed to `1` and then disappears as `init` immediately waits.

**Why this matters:** A long‑running server that forks children but never waits will accumulate zombies, slowly consuming kernel memory (≈ 1.7 KB per zombie). In a system with a low `pid_max` (default 32768), this can eventually exhaust PID space and prevent new processes from being created.

---

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence | Fix |
|---------|----------------|-------------|-----|
| **Assuming `fork()` returns the same PID in parent and child** | `fork()` returns **0** to the child and the child’s PID to the parent (or -1 on error). The PID is *different* by design so each process can be uniquely identified. | Code that uses the return value to decide “I am the child” but then calls `getpid()` expecting the parent’s PID will get the wrong number, leading to incorrect logging or signaling. | Always test `pid == 0` for child, `pid > 0` for parent. Use `getpid()` and `getppid()` when needed. |
| **Calling `exit()` instead of `_exit()` in a child after `fork()`** | `exit()` runs user‑level `atexit` handlers and flushes stdio buffers *twice* (once in parent, once in child) because the stdio state is duplicated at fork. This can produce duplicate output or corrupted files. | Duplicate log lines, garbled binary files, or incomplete data if buffers are flushed after the file has been closed by the parent. | In the child, use `_exit(status)` (or `exit()` only if you are sure no stdio duplication matters). |
| **Neglecting to check `EINTR` from `waitpid()`** | A signal handler may interrupt `waitpid()`, causing it to return -1 with `errno == EINTR`. Treating this as a fatal error leads to premature termination. | Daemons or shells may exit unexpectedly after receiving a benign signal (e.g., `SIGWINCH`). | Loop: `while ((pid = waitpid(-1, &status, 0)) == -1 && errno == EINTR) ;` |
| **Believing that threads share *nothing* with the parent process** | Threads share the *same* `mm_struct`, file descriptor table, and signal dispositions, but they have **separate** `task_struct`s and kernel stacks. Assuming they have independent file descriptors leads to bugs when one thread `close`s a descriptor used by another. | Race conditions, EBADF errors, or leaking file descriptors. | Use thread‑safe APIs (`pthread_mutex`) or perform `dup()` if a private copy is needed. |
| **Using `system()` without understanding its fork/exec/wait semantics** | `system()` internally does `fork()`; in the child it runs `/bin/sh -c command`. If the command itself forks, you now have **three** levels of processes, and any `SIGCHLD` handling becomes confusing. | Signals may be delivered to the wrong process; zombies may accumulate if the shell does not reap its children. | For precise control, use explicit `fork()`/`execve()`/`waitpid()` instead of `system()`. |

---

## Exercises
### Easy
1. **PID Printing** – Write a program that forks once, then both parent and child print their PID, PPID, and the return value of `fork()`. Verify the output matches expectations.  
2. **Zombie Observation** – Create a program that forks a child which immediately `_exit`s, while the parent sleeps for 10 seconds. In another terminal, run `watch -n 1 'ps -o pid,ppid,stat,comm --ppid <parent-pid>'` and observe the zombie state.

### Medium
3. **Explicit Wait** – Modify the zombie program so the parent uses a loop with `waitpid(-1, &status, WNOHANG)` to reap children as soon as they exit, eliminating the sleep. Print each child’s exit status as it is reaped.  
4. **Execve with Arguments** – Write a program that forks, then in the child calls `execve("/bin/ls", (char*[]){"ls","-l","/tmp",NULL}, environ)`. Ensure the parent waits and prints the child’s exit code. Confirm that the output is an `ls -l /tmp` listing.

### Hard
5. **Simple Pipeline** – Implement a minimal shell feature: read two commands (e.g., `ls | grep .c`). Use `pipe()`, `fork()`, `dup2()`, and `execvp()` to create two child processes connected by a pipe. The parent must wait for both children and report their exit statuses.  
6. **Signal‑Safe Reaping** – Write a program that installs a `SIGCHLD` handler which calls `waitpid(-1, &status, WNOHANG)` in a loop until no more children remain. The main loop forks a child every second that runs `sleep 5`. Verify that no zombies accumulate even under high fork rates (use `ps -ejH` to check).  
7. **Memory Overhead Calculation** – Using the size of `task_struct` (obtain via `sizeof(struct task_struct)` in a kernel module or via `grep -r task_struct /usr/include/linux/`), compute how much RAM would be consumed by 10 000 zombie processes. Compare this to the total RAM on your system and discuss whether zombie accumulation is a realistic denial‑of‑service vector.

---

## Linux Connection
### Kernel Subsystems
| Subsystem | Role in Process Management | Key Data Structures |
|-----------|---------------------------|---------------------|
| **Scheduler (CFS)** | Selects next RUNNING task, updates `vruntime`, maintains per‑CPU runqueues. | `struct rq`, `struct sched_entity` (embedded in `task_struct`). |
| **Memory Management** | Manages each process’s address space (`mm_struct`), handles page faults, COW on fork. | `struct mm_struct`, `struct vm_area_struct`. |
| **File Descriptor Table** | Tracks open files; shared across threads via `files_struct`. | `struct files_struct`, `struct file`. |
| **Signal Handling** | Delivers asynchronous events; maintains pending and blocked signal sets. | `struct sighand_struct`, `struct sigpending`. |
| **Ptracing & Debugging** | Allows one process to observe/control another (used by `gdb`, `strace`). | `struct ptrace_regs`, `ptrace_stop()`. |
| **Namespaces & Cgroups** | Isolation layers that modify perceived PIDs, network, mounts, and resource limits. | `struct nsproxy`, `struct css_set`. |

### Observable Filesystem: `/proc`
Each process appears as a directory `/proc/<pid>/`. Useful files:
- `/proc/<pid>/status` – human‑readable state (`Umask`, `Uid`, `Gid`, `State`, `VmSize`, `voluntary_ctxt_switches`, `nonvoluntary_ctxt_switches`).
- `/proc/<pid>/task/` – sub‑directory for each thread (each with its own `status`).
- `/proc/<pid>/fd/` – symbolic links to open file descriptors.
- `/proc/<pid>/maps` – memory mapping list (address ranges, permissions, offset, device, inode).
- `/proc/<pid>/exe` – symlink to the executed binary.
- `/proc/<pid>/cgroup` – cgroup memberships.
- `/proc/<pid>/ns/` – symlinks for each namespace (pid, net, mnt, etc.).

**Example commands**
```bash
# Show process state and memory usage
cat /proc/$$/status | grep -E '^(Name|State|VmSize|voluntary_ctxt_switches|nonvoluntary_ctxt_switches)'

# List all file descriptors for the current shell
ls -l /proc/$$/fd/

# View memory map of a running process (replace 1234 with a PID)
cat /proc/1234/maps | head -20

# Find all zombie processes
ps -eo pid,ppid,stat,comm | awk '$3=="Z" {print $0}'
```

### System Calls (with man‑section references)
| Syscall | Purpose | Typical Use |
|---------|---------|-------------|
| `fork(2)` | Create child process (COW). | Process creation. |
| `clone(2)` | Low‑level thread/process creation with flags (`CLONE_VM`, `CLONE_FILES`, `CLONE_SIGHAND`, …). | Implementing threads or custom sandboxing. |
| `execve(2)` | Replace image. | Launching a new program. |
| `waitpid(2)` | Reap a specific child or any child. | Preventing zombies. |
| `exit(2)` / `_exit(2)` | Terminate process. | Normal termination vs. signal‑handler safe exit. |
| `getpid(2)`, `getppid(2)` | Retrieve IDs. | Logging, debugging. |
| `setpgid(2)`, `setsid(2)` | Process group / session control. | Job control in shells. |
| `kill(2)` | Send signal. | Terminating or notifying processes. |
| `ptrace(2)` | Trace and control another process. | Debuggers, strace. |
| `prlimit(2)` | Get/set resource limits (RLIMIT_NOFILE, RLIMIT_AS, …). | Preventing resource exhaustion. |

**Runable illustration**
```bash
# 1. Start a long‑running child in background
sleep 300 &                     # jobs -l shows its PID
CHILD=$!

# 2. Observe its state via /proc
watch -n 1 "cat /proc/$CHILD/status | grep -E 'State|VmSize|voluntary_ctxt_switches'"

# 3. Send SIGTERM, watch transition to zombie then reaped
kill -TERM $CHILD
sleep 2
cat /proc/$CHILD/status | grep State   # should show 'Z' (zombie) briefly then disappear

# 4. Clean up
wait $CHILD 2>/dev/null; echo "Child exited with $?"
```

---

## Why This Matters
Understanding processes is not academic trivia; it is the foundation for **resource isolation, security, and performance** in any non‑trivial software.

1. **Isolation** – The private address space guaranteed by the `mm_struct` prevents one buggy program from corrupting another’s data. This is why containers, sandboxers (e.g., Firejail, gVisor), and virtual machines rely on the same process‑creation primitives, augmenting them with namespaces and cgroups.

2. **Correct Resource Accounting** – The kernel tracks CPU time (`utime`, `stime`), memory (`VmRSS`, `VmSize`), and I/O per‑process via fields in `task_struct`. Tools like `top`, `htop`, and `ps` derive their metrics directly from these fields. Misinterpreting these numbers leads to mis‑diagnosed performance bottlenecks.

3. **Concurrency Primitives** – Processes provide the strongest isolation baseline; threads share memory for efficiency but inherit the same scheduling and synchronization primitives (futexes, signal handling). Knowing the process model clarifies why a multithreaded program can still suffer from priority inversion or why a fork‑heavy server (e.g., traditional Apache prefork) must carefully reap children to avoid zombie exhaustion.

4. **System‑Level Observability** – The `/proc` pseudo‑filesystem and syscalls like `getrusage()` expose the PCB’s internals. Debuggers, profilers (e.g., `perf`), and tracing frameworks (eBPF) all hook into the same data structures to give you real‑time insight into scheduling decisions, context‑switch costs, and resource usage.

5. **Reliability** – Proper use of `waitpid()`/`wait4()` eliminates zombie accumulation, which can exhaust the PID table and block legitimate process creation. Signal‑safe reaping (`SIGCHLD` handler with `WNOHANG`) is a pattern that appears in production daemons, shells, and supervision systems (e.g., `systemd`, `runit`).

6. **Performance** – Context‑switch overhead, though small per event (~0.5–1 µs), scales with the number of runnable threads. Understanding the scheduler’s `vruntime` fairness model helps you tune `nice` values, `SCHED_FIFO`/`SCHED_RR` priorities, or isolate real‑time workloads via cgroups to avoid starvation.

By mastering the mechanics—how the PCB is built, how the scheduler picks the next task, how `
