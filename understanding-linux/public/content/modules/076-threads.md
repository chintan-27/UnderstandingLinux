---
id: 76
title: "Threads"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Why This Matters

A single-threaded process stalls completely the moment it issues a blocking syscall. The CPU doesn't wait with it — the scheduler moves on. Threads let a single process keep work in flight while one execution path is blocked, and they do it without the cost of duplicating the address space that `fork()` implies. But the word "thread" is overloaded: a thread visible to your code may or may not be visible to the kernel, and that distinction determines whether a single `read()` with no data freezes your entire program or just the caller. Get this wrong and you will write programs that silently serialize all their work onto one CPU, or deadlock because a library you're using makes blocking calls you didn't account for.

## Core Concepts

### What a Thread Is

A thread is a schedulable execution context. Each thread owns:
- A **program counter** — which instruction executes next
- A **register file** — the working state of the CPU at this moment
- A **stack** — call frames, return addresses, local variables

Everything else in the process is shared: the virtual address space (`mm_struct` in the kernel), the open file descriptor table, signal disposition table, and code segment. Sharing the address space is what makes inter-thread communication cheap — a pointer in one thread is valid in another — and what makes bugs like data races possible.

### User-Level Threads

User-level threads are invisible to the kernel. A library in user space maintains a run queue of threads, performs its own scheduling decisions, and switches between threads by directly manipulating registers and the stack pointer — no syscall, no privilege-level transition. The kernel schedules the process as a single unit.

**Why context switching is cheap:** The library only needs to save and restore the registers that the calling convention requires the callee to preserve (on x86-64: `rbx`, `rbp`, `r12`–`r15`, `rsp`, plus the return address implicitly on the stack). No trap into kernel mode, no saving of the full machine state. Switching costs on the order of $10$–$50\ \text{ns}$.

**Why blocking breaks everything:** When any user-level thread calls `read()` and no data is available, the kernel has no thread-level granularity — it blocks the process's single kernel-schedulable unit. Every other user-level thread in the process stops, regardless of whether it has runnable work. The library cannot intercept this without either (a) wrapping all syscalls to check if they would block first (`select`/`poll` before every I/O), or (b) using only non-blocking I/O and never calling a blocking syscall directly.

### Kernel-Level Threads

Kernel-level threads are first-class entries in the kernel's scheduler. Each has its own `task_struct`, its own kernel stack, and is independently runnable. The scheduler picks threads — not processes — as its unit of work.

**Why blocking is safe:** When thread A blocks on `read()`, the kernel marks its `task_struct` as `TASK_INTERRUPTIBLE` and picks another runnable thread. Threads B, C, and D in the same process continue to be scheduled normally.

**Why creation and switching cost more:** Every `pthread_create()` is a `clone()` syscall — a trap into the kernel. Every block/wake cycle involves the scheduler. A kernel thread context switch costs $100$–$1000\ \text{ns}$ depending on cache state, versus $10$–$50\ \text{ns}$ for a user-space switch. At high thread counts, this adds up.

### Concurrency Models: N:1, 1:1, M:N

The three models differ in how many user-visible threads map to how many kernel threads:

| Model | Mapping | Blocks on syscall? | True parallelism? | Example |
|---|---|---|---|---|
| **N:1** | N user → 1 kernel | Entire process | No | GNU Pth, early Java green threads |
| **1:1** | 1 user → 1 kernel | One thread | Yes | Linux NPTL, macOS pthreads |
| **M:N** | M user → N kernel (M ≥ N) | One kernel thread | Yes | Solaris LWPs, Go runtime, Windows fibers |

**N:1** eliminates syscall overhead for thread operations but serializes all kernel interactions onto one schedulable unit.

**1:1** pays a syscall per thread operation and allocates a kernel stack (typically $8\ \text{KiB}$, growing under demand) for every thread. Scaling to tens of thousands of threads becomes a memory problem: $10{,}000\ \text{threads} \times 8\ \text{KiB} = 80\ \text{MiB}$ just in kernel stacks.

**M:N** multiplexes M user threads over N kernel threads. When a user thread would block, the runtime reschedules a different user thread onto that kernel thread before the blocking syscall is issued — keeping all N kernel threads busy. The implementation requires the user-space scheduler to intercept every potentially blocking operation, maintain its own run queues, and handle signals and stack growth correctly for threads the kernel doesn't know about. Linux abandoned M:N (via the abandoned NGPT project) in favor of 1:1 NPTL around kernel 2.6, judging the complexity cost higher than the performance gain given improving hardware.

Go implements M:N in user space: goroutines are user-level threads, the Go runtime multiplexes them over `GOMAXPROCS` kernel threads (OS threads), and the runtime's scheduler preempts goroutines at safe points. This is why a Go program with a million goroutines doesn't have a million kernel threads.

## How It Works

### The 1:1 Model: `pthread_create()` → `clone()`

`pthread_create()` in NPTL allocates a new stack in the process's address space, then calls `clone()` with flags that specify which kernel resources to share with the parent `task_struct`:

```c
// What NPTL's pthread_create() does under the hood (simplified)
// See glibc: nptl/pthread_create.c, sysdeps/unix/sysv/linux/clone-internal.c
clone(
    thread_start_routine,   // entry point for new thread
    new_stack_top,          // pre-allocated stack (mmap'd by library)
    CLONE_VM        |       // share mm_struct (same virtual address space)
    CLONE_FS        |       // share fs_struct (cwd, umask)
    CLONE_FILES     |       // share files_struct (fd table)
    CLONE_SIGHAND   |       // share sighand_struct (signal handlers)
    CLONE_THREAD    |       // join thread group, share tgid
    CLONE_SETTLS    |       // set thread-local storage pointer
    CLONE_PARENT_SETTID |   // write new tid to parent's address
    CLONE_CHILD_CLEARTID,   // clear tid on exit (for pthread_join)
    arg
);
```

`CLONE_VM` is the critical flag — it shares `mm_struct` instead of copying it, making this a thread rather than a process. `CLONE_THREAD` puts the new `task_struct` into the same thread group, so `getpid()` returns the same value for all threads while `gettid()` returns distinct values.

The new `task_struct` is identical in kind to a process's `task_struct`. From the scheduler's view, threads and processes are the same type of object — both are `task_struct`s in the run queue.

### Kernel Thread Context Switch

A timer interrupt (typically every $1\ \text{ms}$, i.e., `CONFIG_HZ=1000`) fires, the CPU saves the current register state to the running thread's kernel stack, and the scheduler runs. Linux's Completely Fair Scheduler (CFS) uses a red-black tree keyed on `vruntime` (virtual runtime, in nanoseconds) to select the next thread in $O(\log n)$ time where $n$ is the number of runnable threads.

The scheduler then calls `switch_to()`, which:
1. Saves callee-saved registers of the outgoing thread to its kernel stack
2. Switches the stack pointer to the incoming thread's kernel stack (`task_struct->thread.sp`)
3. Restores the incoming thread's callee-saved registers
4. Returns — which jumps to wherever the incoming thread was when it last yielded

Because threads within a process share `mm_struct`, the CPU's CR3 register (which points to the page table) does **not** change on an intra-process thread switch. This means no TLB flush is required, which is a substantial cost avoided: a full TLB flush on an inter-process switch can cost $1{,}000$–$10{,}000\ \text{ns}$ depending on TLB size and cache state.

$$\text{Switch cost}_{\text{thread}} \approx \text{register save/restore} + \text{scheduler overhead}$$
$$\text{Switch cost}_{\text{process}} \approx \text{register save/restore} + \text{scheduler overhead} + \text{TLB flush} + \text{cache cold-start}$$

### User-Level Thread Context Switch

A user-level library switch manipulates only the registers the calling convention says the callee must preserve — on x86-64, per the System V ABI: `rbx`, `rbp`, `r12`, `r13`, `r14`, `r15`, `rsp`. The return address already on the stack functions as the saved program counter.

```asm
; x86-64 user-space context switch (simplified, as in ucontext or a green-thread lib)
; rdi = pointer to current thread's saved-context struct
; rsi = pointer to next thread's saved-context struct

thread_switch:
    ; Save outgoing thread state
    mov  [rdi + 0x00], rsp
    mov  [rdi + 0x08], rbp
    mov  [rdi + 0x10], rbx
    mov  [rdi + 0x18], r12
    mov  [rdi + 0x20], r13
    mov  [rdi + 0x28], r14
    mov  [rdi + 0x30], r15

    ; Restore incoming thread state
    mov  rsp, [rsi + 0x00]
    mov  rbp, [rsi + 0x08]
    mov  rbx, [rsi + 0x
