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

## Why This Matters

Every program you run exists inside a process. The process abstraction gives each program the illusion that it owns the entire machine — its own CPU, its own memory, its own file descriptors — while the OS quietly multiplexes real hardware across hundreds of competing programs. Understanding processes is a prerequisite for reasoning about crashes, performance degradation under load, shell internals, and what the kernel is actually doing on your behalf. Without this model, systems behavior looks like magic.

---

## Core Concepts

### The Process Is Not the Program

A program is a static artifact: an ELF binary on disk. A process is that binary instantiated in memory, with a program counter pointing at the next instruction to execute, a stack managing call frames, a heap for dynamic allocation, and a table of open file descriptors. Two invocations of the same binary produce two independent processes with separate address spaces and separate state. The OS manages processes, not programs. When you type `grep` twice simultaneously, there is one binary but two processes.

### Virtual Address Space Layout

Each process sees a private, flat 64-bit address space. The hardware MMU translates every load and store from virtual to physical addresses; the OS controls the translation tables. If a process addresses a virtual page with no valid mapping, the MMU raises a fault and the kernel kills the process with `SIGSEGV`. This is the mechanism that makes processes isolated: they cannot address each other's memory without explicit OS cooperation (shared memory, `ptrace`, etc.).

The canonical layout on x86-64 Linux:

```
High addresses (0xFFFFFFFFFFFFFFFF)
  ┌──────────────────────────────┐
  │  Kernel space (not mapped    │  ← user code cannot access
  │  in user page tables)        │
  ├──────────────────────────────┤  ← 0xFFFF800000000000
  │  Stack (grows downward ↓)    │  ← starts near 0x7FFF...
  │  (argv, env, frames)         │
  ├──────────────────────────────┤
  │  Memory-mapped region        │  ← mmap, shared libs (.so)
  ├──────────────────────────────┤
  │  Heap (grows upward ↑)       │  ← brk/sbrk, malloc
  ├──────────────────────────────┤
  │  BSS (uninit static data)    │
  ├──────────────────────────────┤
  │  Data (init static data)     │
  ├──────────────────────────────┤
  │  Text (instructions, r-x)    │  ← starts near 0x400000
Low addresses (0x0000000000000000)
```

A process's virtual memory map is readable at runtime:

```bash
cat /proc/$$/maps
```

Each line describes one region: its virtual address range, permissions (`r`, `w`, `x`, `p`/`s`), offset into the backing file, and the file name if file-backed. The kernel represents each region internally as a `vm_area_struct` (`include/linux/mm_types.h`).

Given a virtual address $v$, the MMU computes the physical address as:

$$p = \text{PFN}(v) \cdot \text{PAGE\_SIZE} + (v \bmod \text{PAGE\_SIZE})$$

where $\text{PFN}(v)$ is the page frame number looked up in the page table and $\text{PAGE\_SIZE}$ is $4096$ bytes ($2^{12}$) on x86-64. The offset within a page occupies the low $12$ bits of the virtual address; the remaining bits index into the four-level page table (PGD → PUD → PMD → PTE).

### Process State Machine

The OS tracks each process through a state machine. The states and the conditions that drive transitions between them:

| State | Meaning | What causes entry |
|---|---|---|
| **Running** | On a CPU, executing instructions | Scheduler picks it from the run queue |
| **Ready** | Eligible to run, waiting for CPU | `fork()`, I/O completes, woken from sleep |
| **Blocked** (Sleeping) | Waiting for an event; cannot use CPU even if idle | Process calls a blocking syscall (`read`, `wait`, `futex`) |
| **Zombie** | Exited; PCB kept for parent to collect exit status | `exit()` or return from `main()` |
| **Stopped** | Execution suspended by `SIGSTOP` or ptrace | `SIGSTOP`, `SIGTSTP`, debugger attach |

The transition **Blocked → Ready** is triggered externally — by an interrupt handler that signals I/O completion, a timer expiry, or another process calling `pthread_mutex_unlock`. A blocked process does not poll and consumes zero CPU. This is not a courtesy; it is a hard guarantee from the scheduler. The cost of a blocking syscall is purely context-switch overhead plus the event latency.

You can observe state transitions live:

```bash
# 'S' = sleeping (blocked), 'R' = running/runnable, 'Z' = zombie, 'T' = stopped
ps -eo pid,stat,comm | head -30

# Watch state of a specific pid
watch -n 0.5 'cat /proc/<pid>/status | grep -E "^(State|Pid)"'
```

The `State:` field in `/proc/<pid>/status` directly exposes the kernel's `task_state` field.

### The Process Control Block

The kernel represents every process with a `task_struct` (defined in `include/linux/sched.h`). This is the Linux PCB. It is large (over 700 fields in recent kernels), but the conceptually critical fields are:

```c
struct task_struct {
    volatile long           state;       // TASK_RUNNING, TASK_INTERRUPTIBLE, etc.
    pid_t                   pid;
    pid_t                   tgid;        // thread group ID (== pid for single-threaded)
    struct task_struct     *parent;
    struct mm_struct       *mm;          // virtual memory descriptor (NULL for kthreads)
    struct files_struct    *files;       // open file descriptor table
    struct thread_struct    thread;      // arch-specific register state (saved on switch)
    int                     exit_code;   // packed exit status
    // ... hundreds more
};
```

All `task_struct` instances are linked in a circular doubly-linked list. The kernel macro `for_each_process(p)` walks it. You can read many fields directly:

```bash
# PID, parent PID, VM size, resident set size, thread count
cat /proc/<pid>/status

# Kernel stack size, scheduling policy, priority
cat /proc/<pid>/sched
```

### Time Sharing and Preemption

The scheduler runs on a hardware timer interrupt — typically every $1\,\text{ms}$ on Linux (CONFIG_HZ=1000). On each interrupt the kernel's interrupt handler runs in kernel mode, saves the current process's full register file into its `thread_struct`, and decides whether to preempt. If the current process has consumed its time quantum or a higher-priority process is now ready, the scheduler calls `context_switch()` in `kernel/sched/core.c`, which restores the next process's registers and returns to user mode in a different process.

The cost of a context switch is not just saving/restoring registers. It includes:

- **TLB flush** (or ASID tag update on architectures that support it) — the virtual-to-physical mappings are now different
- **Cache pollution** — the new process's working set is cold in L1/L2/L3
- **Pipeline flush** — branch predictor state is process-specific

On modern hardware a context switch costs on the order of $1$–$10\,\mu\text{s}$, but the cache effects can impose costs that persist for milliseconds.

If $n$ processes share one CPU equally and each context switch costs $t_{cs}$, the fraction of CPU time doing actual work is:

$$\eta = \frac{T_q}{T_q + t_{cs}}$$

where $T_q$ is the time quantum. With $T_q = 10\,\text{ms}$ and $t_{cs} = 5\,\mu\text{s}$:

$$\eta = \frac{10}{10 + 0.005} \approx 99.95\%$$

Context switch overhead is small in isolation. The cache effects at high concurrency are the real cost.

---

## How It Works

### Process Creation via `fork()` and `exec()`

`fork()` creates a new process by duplicating the calling process. The kernel allocates a new `task_struct`, copies the parent's `mm_struct` descriptors, duplicates the file descriptor table (incrementing reference counts on open files), and assigns a new PID. The child's address space is not immediately copied — Linux uses **copy-on-write (COW)**: the child's page table entries point at the parent's physical pages, marked read-only. The first write to any shared page triggers a fault, at which point the kernel copies that single page and remaps it writable. This makes `fork()` fast when followed by `exec()`.

`exec()` (the family: `execl`, `execv`, `execve`, etc.) replaces the calling process's address space with a new program. The kernel reads the ELF header, maps the new text and data segments, sets up a fresh stack with `argc`/`argv`/`envp`, and transfers control to the new entry point. The PID does not change. Open file descriptors survive `exec()` unless marked `O_CLOEXEC`.

The shell uses fork-exec for every external command:

```c
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>

int main(void) {
    pid_t pid = fork();

    if (pid < 0) {
        perror("fork");
        return 1;
    }

    if (pid == 0) {
        /* Child: pid == 0 here.
         * exec replaces this process image entirely.
         * If exec returns, it failed. */
        execl("/bin/ls", "ls", "-l", NULL);
        perror("execl");   /* only reached on failure */
        _exit(1
