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

## Core Concepts
### The Scheduling Problem
A CPU can execute only one instruction stream at a time. When multiple *runnable* threads exist, the kernel must decide which thread receives the next slice of CPU time. The decision influences three competing objectives:

1. **Throughput** – maximize the number of completed jobs per unit time.  
2. **Latency** – minimize the waiting time for interactive or real‑time tasks.  
3. **Fairness** – guarantee that each thread receives a share of CPU proportional to its priority.

If the scheduler ignores any of these, the system either starves low‑priority work, becomes unresponsive, or wastes cycles on context switches. The Linux Completely Fair Scheduler (CFS) solves this by approximating an *ideal multi‑tasking processor*: each runnable thread would receive \(\frac{weight_i}{\sum_j weight_j}\) of the CPU if time could be divided infinitesimally.

### Process States in the Kernel
The kernel tracks a task’s state via the `state` field in `struct task_struct`. Relevant states for scheduling are:

| State                | Macro                     | Meaning                                                                 |
|----------------------|---------------------------|-------------------------------------------------------------------------|
| `TASK_RUNNING`       | `0`                       | Runnable or currently executing; resides in a CPU’s runqueue.           |
| `TASK_INTERRUPTIBLE`| `1 << 0`                  | Sleeping, waiting for an event; can be woken by signals.                |
| `TASK_UNINTERRUPTIBLE`| `1 << 1`                 | Sleeping, waiting for non‑interruptible event (e.g., disk I/O).         |
| `TASK_STOPPED`       | `1 << 4`                  | Stopped by job control or ptrace.                                       |
| `TASK_DEAD`          | `EXIT_ZOMBIE | EXIT_DEAD`   | Terminated; awaiting `wait4`.                                           |

Only `TASK_RUNNING` tasks are considered by the scheduler. Transitions to/from sleeping states occur via waitqueues (`wait_event*`) and are triggered by interrupts or timers.

### Scheduling Entities and Virtual Runtime
CFS does not schedule `task_struct` directly; it schedules **scheduling entities** (`struct sched_entity`). Each task has one embedded entity; thread groups (processes) have a parent entity for the group.

```c
/* include/linux/sched.h */
struct sched_entity {
    struct rb_node   run_node;   /* keyed by vruntime in the RB tree   */
    unsigned long    vruntime;   /* virtual runtime, see below         */
    unsigned long    weight;     /* derived from nice value            */
    unsigned long    load_weight;/* weight * inverse of total weight   */
    /* … other fields for load balancing … */
};
```

A CPU’s runqueue is represented by `struct cfs_rq`:

```c
/* kernel/sched/fair.c */
struct cfs_rq {
    struct rb_root   tasks_timeline; /* RB tree of sched_entity          */
    struct sched_entity *curr;       /* currently running entity         */
    unsigned long    min_vruntime;   /* smallest vruntime in the tree    */
    unsigned long    nr_running;     /* count of runnable entities       */
    /* … load avg, … */
};
```

#### Why Virtual Runtime?
Let a task execute for real time \(\Delta t\). Its contribution to *fair* CPU consumption should be inversely proportional to its priority: a high‑priority (low nice) task should **accumulate** less vruntime for the same \(\Delta t\) than a low‑priority task. Define:

\[
\text{weight}(nice) = 1024 \times \left(\frac{5}{4}\right)^{-nice}
\qquad (-20 \le nice \le 19)
\]

The *ideal* processor would give the task a fraction

\[
\frac{\text{weight}}{\sum_j \text{weight}_j}
\]

of the CPU. If the task actually receives \(\Delta t\), its **virtual runtime** increment is

\[
\Delta \text{vruntime} = \Delta t \times \frac{\text{weight}_0}{\text{weight}}
\quad\text{where}\quad
\text{weight}_0 = 1024 \;(\text{nice}=0)
\]

Thus a task with `nice = -10` (weight ≈ 3121) accumulates vruntime at roughly \(1024/3121 \approx 0.33\)× real time, while `nice = +10` (weight ≈ 317) accumulates at about \(1024/317 \approx 3.23\)× real time. The scheduler always picks the entity with the **smallest** `vruntime`, guaranteeing that over time each task receives CPU proportional to its weight.

### Core Invariants
- **Monotonicity**: `vruntime` never decreases; `min_vruntime` tracks the left‑most node in the RB tree.
- **Bounded lag**: The difference between any task’s `vruntime` and `min_vruntime` is limited by the scheduler’s granularity (`sched_min_granularity_ns`), preventing starvation.
- **O(log n) operations**: Insert (`enqueue_entity`), erase (`dequeue_entity`), and next‑task selection (`pick_next_entity`) are red‑black tree operations.

## How It Works
### Scheduler Entry Points
The scheduler is invoked from three main places:

1. **Timer tick** (`sched_tick()`) – called every `1/HZ` seconds (default 1 ms) to check if the current task has exhausted its slice.
2. **Explicit yield** (`sched_yield()`) – task voluntarily gives up the CPU.
3. **Wakeup path** (`try_to_wake_up()`) – a sleeping task becomes runnable and may preempt the current task.

Each invocation ultimately calls `__schedule()`, which:

1. Calls `pick_next_task()` to select the highest‑priority runnable task.
2. If different from `current`, performs a context switch via `context_switch()`.
3. Sets `need_resched` if preemption is required but cannot be performed immediately (e.g., in interrupt context).

### CFS Core Routines
#### Updating the Current Task
```c
static void update_curr(struct cfs_rq *cfs_rq)
{
    struct sched_entity *curr = cfs_rq->curr;
    unsigned long now = rq_clock_task(rq_of(cfs_rq));
    unsigned long delta_exec = now - curr->exec_start;

    if (unlikely(!delta_exec))
        return;

    curr->exec_start = now;
    /* vruntime increment = delta_exec * weight0 / weight */
    curr->vruntime += calc_delta_fair(delta_exec, curr);
    /* update min_vruntime if needed */
    if (entity_before(curr, &cfs_rq->rb_leftmost))
        cfs_rq->min_vruntime = curr->vruntime;
}
```
`calc_delta_fair()` implements \(\Delta t \times weight_0 / weight\).

#### Enqueue / Dequeue
```c
static void enqueue_entity(struct cfs_rq *cfs_rq, struct sched_entity *se)
{
    /* update the entity's load weight for the new CPU */
    update_load_weight(cfs_rq, se);
    /* place in RB tree keyed by vruntime */
    __enqueue_entity(cfs_rq, se);
    cfs_rq->nr_running++;
    update_min_vruntime(cfs_rq);
}

static void dequeue_entity(struct cfs_rq *cfs_rq, struct sched_entity *se)
{
    __dequeue_entity(cfs_rq, se);
    cfs_rq->nr_running--;
    if (cfs_rq->nr_running)
        update_min_vruntime(cfs_rq);
}
```
Both `__enqueue_entity` and `__dequeue_entity` use `rb_insert` / `rb_erase` on `cfs_rq->tasks_timeline`, guaranteeing \(O(\log n)\).

#### Preemption Check
After each tick, `sched_tick()` calls `entity_tick(cfs_rq, curr)`. If the current task’s `vruntime` exceeds `min_vruntime + sched_latency` (default ~6 ms), `resched_curr(rq)` sets `need_resched`, triggering a preemptive schedule on the next timer interrupt or before returning to user space.

### Multi‑Core Load Balancing
Each CPU has its own `cfs_rq`. The scheduler periodically computes per‑CPU `load_avg` using an exponential decay:

\[
load_{new} = load_{old} \times e^{-\Delta t / \tau} + \Delta \text{runnable}
\]
where \(\tau = sched\_time\_avg\) (default 1000 ms). If a CPU’s load exceeds the average by more than `sched_balance_threshold`, the load balancer migrates tasks from the busiest runqueues to the idle ones via `load_balance()` and `move_one_task()`.

## Worked Examples
### Example 1: VRUNTIME‑Based Selection
Suppose two tasks on the same CPU:

| Task | nice | weight (calc) | weight₀/weight |
|------|------|---------------|----------------|
| A    | -5   | \(1024 \times (5/4)^{5} \approx 3052\) | 0.335 |
| B    | +5   | \(1024 \times (5/4)^{-5} \approx 344\)  | 2.976 |

Both start with `vruntime = 0`. The scheduler runs for 4 ms, then ticks.

- **Task A runs 2 ms**:  
  \(\Delta vruntime_A = 2ms \times 0.335 = 0.67\) ms  
- **Task B runs 2 ms**:  
  \(\Delta vruntime_B = 2ms \times 2.976 = 5.95\) ms  

After the first 4 ms slice, `vruntime_A = 0.67`, `vruntime_B = 5.95`. The RB tree’s leftmost node is A, so the next scheduler tick picks A again. After another 2 ms of A:

- A accumulates another 0.67 ms → `vruntime_A = 1.34`  
- B unchanged → `vruntime_B = 5.95`

Now `vruntime_A` still < `vruntime_B`; A continues until its vruntime catches up. Solve for equal vruntime:

\[
0.335 \times t_A = 2.976 \times t_B \quad\text{with}\quad t_A + t_B = T
\]

The fraction of CPU given to A is  

\[
\frac{t_A}{T} = \frac{weight_A}{weight_A + weight_B}
= \frac{3052}{3052+344} \approx 0.898
\]

Thus A receives ≈ 90 % of the CPU, B ≈ 10 %, exactly matching their weight ratio. This demonstrates how VRUNTIME enforces proportional sharing without explicit time slices.

### Example 2: Load‑Balancing Across Two CPUs
Consider a system with two identical CPUs, each initially idle. Three tasks are spawned:

- T1: nice = 0 (weight = 1024)  
- T2: nice = 0 (weight = 1024)  
- T3: nice = 5 (weight ≈ 344)

All start on CPU 0 via the default fork/exec path. After a short period, the load avg on CPU 0 is:

\[
load_0 = \frac{1024+1024+344}{1024} \approx 2.33
\]

CPU 1 load = 0. The imbalance exceeds `sched_balance_threshold` (default 1.25). The load balancer selects the heaviest task on CPU 0 (either T1 or T2) and migrates it to CPU 1.

After migration:

- CPU 0: T2 (1024) + T3 (344) → load ≈ 1.34  
- CPU 1: T1 (1024) → load = 1.00  

Now the loads differ by < 0.4, below the threshold, and balancer stops. Each CPU now runs tasks with VRUNTIMEs that evolve independently, giving each task its fair share *locally*; global fairness emerges from periodic rebalancing.

## Common Mistakes
| # | Misconception | Why It’s Wrong |
|---|---------------|----------------|
| 1 | *“Nice value directly sets the scheduling priority used by the kernel.”* | Nice influences the **weight** used by CFS, but the kernel also has real‑time priority classes (`SCHED_FIFO`, `SCHED_RR`) that bypass CFS entirely. A task with `nice = 19` can still preempt a `nice = -20` task if it runs under `SCHED_FIFO`. |
| 2 | *“CFS gives each task an equal time slice.”* | CFS allocates **virtual runtime**, not fixed slices. A high‑weight (low nice) task may run longer in real time before its vruntime catches up to a low‑weight task. |
| 3 | *“The vruntime of a task is the actual time it has spent on the CPU.”* | vruntime is **scaled** by the inverse weight (see formula). It represents the *fair* CPU consumption; two tasks with different nice values can have vastly different vruntime for the same real execution time. |
| 4 | *“System load does not affect CFS decisions on a given CPU.”* | While the core vruntime rule is load‑independent, the **load‑balancing** daemon uses per‑CPU load averages to decide when to pull or push tasks. Ignoring this leads to unexpected latency spikes when one CPU becomes overloaded. |
| 5 | *“A task that sleeps a lot gets a ‘bonus’ that lets it hog the CPU when it wakes.”* | CFS does give a small **sleeper bonus** (`sched_feat` `WAKEUP_PREEMPTION`), but it is bounded by `sched_wakeup_granularity_ns` (≈ 0.5 ms) and decays quickly. It cannot be abused to starve other tasks. |

## Exercises
### Easy
1. **Nice‑to‑weight verification**  
   Write a C program that prints its nice value, calls `getpriority(PRIO_PROCESS, 0)`, then computes the corresponding CFS weight using the formula above. Run it at different nice levels (`nice -n 10 ./a.out`) and verify the weight matches the kernel’s `/proc/<pid>/sched` field `weight`.

### Moderate
2. **User‑space CFS simulator**  
   Implement a red‑black tree (use `librbtree` or a simple BST with balancing) that stores entities with fields `{vruntime, weight}`. Provide functions `enqueue`, `dequeue`, `tick(delta_time)` that updates vruntime of the current entity and picks the next one. Feed it a sequence of wake/sleep events with known nice values and compare the simulated schedule to a trace obtained via `perf sched record -e sched:sched_switch -- sleep 5`.

### Hard
3. **Kernel‑module scheduler tracer**  
   Create a loadable kernel module that registers a tracepoint on `sched:sched_update_nr_running` and `sched:sched_switch`. In the callback, extract `curr->se.vruntime` and `cfs_rq->min_vruntime` (available via `tracepoint` args) and log them to a ring buffer. Expose the buffer via a debugfs file. Run a workload with mixed nice values and plot vruntime over time to observe the monotonic property and load‑balancing migrations.

## Linux Connection
### Source Locations
- **Core CFS implementation**: `kernel/sched/fair.c`  
- **Scheduler entry point**: `kernel/sched.c` (`__schedule()`)  
- **Data structures**: `include/linux/sched.h` (`struct sched_entity`, `struct cfs_rq`)  
- **Load‑balancing**: `kernel/sched/fair.c` functions `load_balance()`, `move_one_task()`  

### Tuning Parameters (`sysctl`)
| Parameter | Meaning | Typical Range |
|-----------|---------|---------------|
| `kernel.sched_min_granularity_ns` | Minimum time a task must run before being preempted (vruntime‑granularity) | 500 000 – 5 000 000 ns |
| `kernel.sched_wakeup_granularity_ns` | Minimum vruntime difference for a newly woken task to preempt | 500 000 – 2 000 000 ns |
| `kernel.sched_latency_ns` | Target scheduler latency (period over which vruntime spreads) | 6 000 000 – 20 000 000 ns |
| `kernel.sched_cfs_bandwidth_slice_us` | Bandwidth throttling slice for CFS bandwidth control | 1000 – 30000 µs |

Example: view and temporarily lower latency for more responsive interactive workloads:

```bash
# Show current values
sysctl kernel.sched_min_granularity_ns kernel.sched_latency_ns

# Set a tighter latency (requires root)
sudo sysctl -w kernel.sched_latency_ns=3000000
sudo sysctl -w kernel.sched_min_granularity_ns=1000000
```

### Tools
- **Change scheduling policy/priority**: `chrt`  
  ```bash
  # Run a program under SCHED_FIFO with priority 80
  chrt -f 80 ./realtask
  ```
- **Adjust nice value**: `nice` / `renice`  
  ```bash
  nice -n 10 ./lowprio   # start with nice +10
  renice +5 -p 1234      # increase nice of existing pid
  ```
- **Monitor scheduler state**: `top`, `htop`, `pidstat -r`, `perf sched`  
  ```bash
  # Record context switches and replay a readable trace
  perf sched record -- sleep 10
  perf sched replay
  ```
- **Inspect per‑task CFS fields**: `/proc/<pid>/sched`  
  ```bash
  cat /proc/$$/sched | grep -E 'nr_switches|se.sum_exec_runtime|avg_atom'
  ```
- **Check load averages per CPU**: `mpstat -P ALL 1`  

These commands let you observe the concepts discussed: see how changing nice alters the `weight` field, watch `vruntime` evolve in `/proc/<pid>/sched`, and verify load‑balancing migrations with `perf sched`.

## Why This Matters
Understanding the Linux scheduler is not an academic exercise; it directly impacts the performance characteristics of virtually every software stack:

- **Latency‑sensitive applications** (audio, trading, gaming) depend on the scheduler’s ability to preempt lower‑priority tasks within bounded latency. Knowing how `sched_latency_ns` and `sched_min_granularity_ns` shape that bound lets you tune the kernel to meet hard real‑time constraints without resorting to full‑blown `SCHED_FIFO`.
- **Throughput‑oriented services** (databases, web servers) benefit from fair share guarantees that prevent a single runaway thread from starving others. CFS’s weight‑based vruntime ensures that a batch of nice‑0 workers receives CPU proportional to their count, which can be verified via `perf sched` or `/proc/<pid>/sched`.
- **Container orchestration** (Kubernetes, Docker) relies on the kernel’s ability to enforce CPU quotas via CFS bandwidth control (`cpu.cfs_quota_us`, `cpu.cfs_period_us`). Grasping the underlying vruntime mechanics explains why a container’s throttling appears as smooth latency spikes rather than abrupt pauses.
- **Performance debugging** often reveals that a perceived “CPU bottleneck” is actually a scheduler imbalance: one core overloaded while another idles. Tools like `perf sched` and `mpstat` expose this, and the knowledge of load‑balancing thresholds (`sched_balance_threshold`) guides you to adjust `sched_migration_cost_ns` or enable `sched_autogroup_enabled` for better interactivity.

By mastering the cause‑effect relationships—how nice translates to weight, how weight shapes vruntime increments, how the red‑black tree enforces fair selection, and how load balancers move tasks across CPUs—you gain the ability to **predict**, **measure**, and **tune** system behavior with confidence, turning abstract scheduling theory into concrete, observable outcomes on a running Linux system.
