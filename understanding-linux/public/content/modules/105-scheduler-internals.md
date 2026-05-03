---
id: 105
title: "Scheduler internals"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

Every core can run exactly one thread at a time. When ten processes are runnable, the scheduler decides which one runs, for how long, and which CPU it runs on. Get this wrong and a `SCHED_FIFO` audio thread misses its deadline and you hear a click; a batch job hogs all cores and your SSH session stalls; a migrated process thrashes its cache and throughput collapses. The scheduler is not just a fairness mechanism — it is the primary determinant of latency, throughput, and real-time correctness on a Linux system.

## Core Concepts

### Preemptive Multitasking and the Tick

Linux uses **preemptive multitasking**: the kernel programs a hardware timer (the local APIC timer on x86, one per core) to fire at a configurable rate — `CONFIG_HZ` ticks per second, typically 250 on servers and 1000 on desktop kernels. On each tick, the timer interrupt fires, the CPU enters kernel mode, and the scheduler's `scheduler_tick()` function runs. If the current process has exhausted its timeslice or a higher-priority process is now runnable, the kernel sets the `TIF_NEED_RESCHED` flag on the current thread. The actual reschedule happens at the next safe preemption point — on return from interrupt, on return from a syscall, or at a `preempt_enable()` call inside the kernel itself.

This is why `CONFIG_PREEMPT_VOLUNTARY` and `CONFIG_PREEMPT` exist as separate options: they control how aggressively the kernel inserts preemption points inside kernel code paths, which directly affects worst-case scheduling latency for real-time workloads.

### I/O-Bound vs. CPU-Bound Processes

A **CPU-bound** process consumes its entire scheduling slice before being preempted. An **I/O-bound** process voluntarily blocks before that — it calls `read()`, the kernel puts it in `TASK_INTERRUPTIBLE` state, removes it from the run queue entirely, and it stops consuming CPU. When the I/O completes, a device driver calls `wake_up()`, the process re-enters the run queue, and CFS gives it a scheduling boost because its `vruntime` has fallen behind the running average while it was sleeping. This is the mechanism that makes your terminal responsive during a compile: the shell is nearly always sleeping on a `read()` syscall, and when you press a key, it wakes and is immediately eligible to run.

### Process Priority

Linux uses two orthogonal priority systems:

- **Nice values**: integers from $-20$ (highest priority) to $+19$ (lowest priority), used by `SCHED_NORMAL`. Nice value affects `vruntime` accumulation rate — it does not assign fixed timeslices.
- **Real-time priority**: integers from $1$ to $99$, used by `SCHED_FIFO` and `SCHED_RR`. Higher number means higher priority. Any runnable real-time task preempts all `SCHED_NORMAL` tasks unconditionally.

The kernel maps nice values to weights. Nice $0$ has weight $1024$. Each nice step of $1$ changes the weight by approximately $\times 1.25$ or $\div 1.25$. This means a process at nice $-1$ receives roughly 25% more CPU than one at nice $0$ when both are runnable simultaneously.

### Scheduler Classes

The scheduler is a chain of **scheduler classes**, each implementing a policy. The kernel walks the chain from highest to lowest priority and runs the first class with a runnable task:

```
stop_sched_class       → used internally (CPU hotplug, stop_machine)
dl_sched_class         → SCHED_DEADLINE (EDF scheduling)
rt_sched_class         → SCHED_FIFO, SCHED_RR
fair_sched_class       → SCHED_NORMAL, SCHED_BATCH (CFS)
idle_sched_class       → SCHED_IDLE (runs only when nothing else will)
```

A single runnable `SCHED_FIFO` task at priority 1 will starve every `SCHED_NORMAL` task on its core indefinitely. This is intentional — real-time guarantees require it — and it is also the most common way to accidentally hang a Linux system.

### The Completely Fair Scheduler (CFS)

CFS models an ideal CPU that gives every runnable process exactly $\frac{1}{n}$ of CPU time (where $n$ is the count of runnable tasks) and runs them all simultaneously. Since real hardware cannot do this, CFS serializes execution while keeping the processes as close as possible to the ideal by always scheduling the one that has fallen furthest behind.

The mechanism is **virtual runtime** (`vruntime`): a per-process counter of CPU time consumed, scaled inversely by priority weight. CFS always picks the process with the smallest `vruntime`. Because high-priority processes accumulate `vruntime` more slowly, they are always near the front of the queue.

### Virtual Runtime

When a process runs for $\Delta t$ nanoseconds of wall-clock time, its `vruntime` advances by:

$$\Delta vruntime = \Delta t \cdot \frac{weight_{nice=0}}{weight_{process}} = \Delta t \cdot \frac{1024}{weight_{process}}$$

For two processes with weights $w_1$ and $w_2$, the ratio of CPU time they receive is:

$$\frac{CPU_1}{CPU_2} = \frac{w_1}{w_2}$$

Because `vruntime` is scaled, both processes advance their `vruntime` at the same rate regardless of their weights, keeping them adjacent in the red-black tree while the actual wall-clock time they consume differs proportionally.

### Run Queues and the Red-Black Tree

Each CPU has one `struct rq`. Inside it, `struct cfs_rq` holds a **red-black tree** keyed on `vruntime`. Insertion and deletion are $O(\log n)$. The leftmost node — the minimum `vruntime` task — is cached in `rb_leftmost`, making `pick_next_task` $O(1)$.

Because each CPU has its own run queue, the scheduler avoids cross-CPU locking on the hot path. Load balancing (migrating tasks between CPUs) is a separate mechanism that runs periodically or when a CPU becomes idle, and it is where NUMA topology, cache affinity, and SMT sibling awareness all interact.

### Real-Time Scheduling Policies

**`SCHED_FIFO`**: No timeslice. The task runs until it blocks, calls `sched_yield()`, or is preempted by a higher-priority real-time task. Two `SCHED_FIFO` tasks at the same priority share a CPU only by explicit yield — there is no time-based preemption between them.

**`SCHED_RR`**: Identical to `SCHED_FIFO` but adds a timeslice (default 100ms, readable at `/proc/sys/kernel/sched_rr_timeslice_ms`). When the slice expires the task moves to the back of its priority queue. Tasks at strictly lower priorities still cannot preempt it.

**`SCHED_DEADLINE`**: Uses Earliest Deadline First (EDF). Each task declares a runtime $r$, deadline $d$, and period $T$: it requests $r$ nanoseconds of CPU every $T$ nanoseconds, and must complete within $d$ of each activation. The kernel performs admission control — if accepting the task would make the schedule infeasible, `sched_setattr()` returns `EBUSY`. This is the correct policy for hard real-time tasks like audio processing.

## How It Works

### The Scheduler Entity and Red-Black Tree

Every task tracked by CFS has a `sched_entity` embedded in `task_struct`:

```c
struct sched_entity {
    struct load_weight   load;       /* weight derived from nice value */
    struct rb_node       run_node;   /* node in the per-CPU red-black tree */
    u64                  vruntime;   /* accumulated virtual runtime, in ns */
    u64                  sum_exec_runtime; /* total wall-clock CPU time consumed */
    /* ... */
};
```

The CFS run queue:

```c
struct cfs_rq {
    struct load_weight   load;           /* aggregate weight of all runnable tasks */
    unsigned int         nr_running;     /* count of runnable tasks */
    u64                  min_vruntime;   /* running minimum; used to place newly woken tasks */
    struct rb_root_cached tasks_timeline; /* red-black tree; _cached tracks leftmost node */
    /* ... */
};
```

`min_vruntime` is key for wake-up fairness: a task that has been sleeping for seconds would have a stale (very small) `vruntime` and, if inserted as-is, would monopolize the CPU until it caught up. Instead, a waking task's `vruntime` is set to $\max(vruntime_{task},\ min\_vruntime - latency\_target)$, bounding how much CPU it can claim on wake-up.

### Picking the Next Task

```c
/* kernel/sched/fair.c (simplified) */
static struct task_struct *pick_next_task_fair(struct rq *rq,
                                               struct task_struct *prev,
                                               struct rq_flags *rf)
{
    struct cfs_rq *cfs_rq = &rq->cfs;
    struct sched_entity *se;

    if (!cfs_rq->nr_running)
        return NULL;

    /* leftmost node is cached — O(1) */
    se = __pick_first_entity(cfs_rq);
    return task_of(se);
}
```

The cost of maintaining $O(1)$ selection is paid at insertion: `enqueue_entity()` does an $O(\log n)$ red-black tree insert. Selection itself only reads the cached pointer.

### Virtual Runtime Weighting: Worked Example

Suppose two processes are runnable: process A at nice $0$ (weight $1024$) and process B at nice $-5$ (weight $3121$). The scheduler grants the CPU for a scheduling period of $\Delta t = 6\text{ ms}$.

Ideal CPU shares:

$$CPU_A
