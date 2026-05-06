---
id: 77
title: "Scheduling"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
### Scheduling Fundamentals
In an operating system the **scheduler** decides which runnable thread obtains the CPU next.  
A thread is *runnable* when it is not blocked on I/O, a lock, or waiting for a timer.  
The scheduler’s decision is guided by a **policy** that optimizes a combination of:

* **Throughput** – number of completed jobs per unit time.  
* **Turnaround time** – $T_{turn} = T_{completion} - T_{arrival}$.  
* **Waiting time** – $T_{wait} = T_{turn} - T_{burst}$.  
* **Response time** – $T_{resp} = T_{first\_run} - T_{arrival}$ (important for interactive workloads).  
* **Fairness** – often quantified by Jain’s fairness index  
  $$
  J = \frac{(\sum_{i=1}^n x_i)^2}{n \sum_{i=1}^n x_i^2},
  $$  
  where $x_i$ is the CPU time received by process $i$; $J=1$ denotes perfect fairness.

A policy must balance these metrics; improving one often degrades another (e.g., minimizing response time with a tiny quantum can increase context‑switch overhead and hurt throughput).

### Preemptive vs. Non‑preemptive
* **Non‑preemptive** (FIFO, Shortest Job First) – a running thread keeps the CPU until it blocks or finishes.  
* **Preemptive** (RR, MLFQ, CFS) – the scheduler can interrupt a thread after a time slice or when a higher‑priority thread becomes runnable. Preemption is essential for responsiveness but incurs **context‑switch overhead** $C_{cs}$ (typically 2–10 µs on x86‑64).

### Core Policies
| Policy | Decision Rule | Preemptive? | Typical Use |
|--------|---------------|-------------|--------------|
| FIFO (FCFS) | Earliest arrival → head of ready queue | No | Batch systems |
| RR | Circular queue, fixed quantum $q$ | Yes | Time‑sharing |
| MLFQ | Multiple queues with decreasing priority; threads move down after exhausting quantum, age‑based boost | Yes | General‑purpose OS |
| CFS (Linux) | Virtual runtime $vruntime$; picks thread with smallest $vruntime$ | Yes (via timer tick) | Default Linux scheduler |

## How It Works
### Scheduler Invocation Points
The scheduler runs on three events:
1. **Timer interrupt** – periodic tick (default $HZ=250$ → 4 ms) checks if current thread exceeded its slice.  
2. **Blocking syscall** – e.g., `read()`, `mutex_lock()` when the resource is unavailable.  
3. **Wakeup** – I/O completion, timer expiry, or `pthread_cond_signal()` puts a thread back on the runqueue.

At each point the scheduler executes `schedule()` (found in `kernel/sched/core.c`).

### Data Structures
* **runqueue (`struct rq`)** – per‑CPU structure containing:
  * `curr` – pointer to currently running task.
  * `cfs` – pointer to the CFS red‑black tree root.
  * `nr_running` – count of runnable tasks.
* **task struct (`struct task_struct`)** – holds:
  * `pid`, `state`, `prio`, `static_prio`, `normal_prio`.
  * `se` (`struct sched_entity`) – CFS fields: `vruntime`, `sum_exec_runtime`, `load_weight`.
  * `rt` (`struct sched_rt_entity`) – real‑time fields for SCHED_FIFO/RR.

### Context Switch Mechanism
When `schedule()` selects a new `next` task:
1. **Save** registers of `curr` onto its kernel stack (`switch_to` assembly).  
2. **Update** `curr->state` and `next->state` to `TASK_RUNNING`.  
3. **Load** `next`’s registers and switch the page table if needed (`switch_mm`).  
4. **Perform** any required lazy FPU state restore.  

The total latency from timer interrupt to first instruction of `next$ is:
$$
L_{sched} = L_{tick} + L_{schedule} + C_{cs},
$$
where $L_{tick}$ is interrupt latency (~10 µs) and $L_{schedule}$ is the time to traverse the rbtree ($O(\log n)$).

### CFS Core Idea (Derivation)
CFS aims to allocate CPU proportionally to **weight** $w_i$ (derived from nice value).  
Each task accumulates **virtual runtime**:
$$
vruntime_i(t) = \int_0^t \frac{w_{tot}}{w_i}\, dt,
$$
where $w_{tot} = \sum_j w_j$.  
The scheduler picks the task with minimal $vruntime$, guaranteeing that over any interval $\Delta t$:
$$
\frac{\Delta t_i}{\Delta t} \approx \frac{w_i}{w_{tot}}.
$$
Thus, a nice‑+5 task ($w\approx 0.707$) receives roughly 70 % of the CPU of a nice‑0 task.

## Worked Examples
### Example 1: FIFO with Overhead
Three jobs arrive at $t=0$:  
| P | $C_{burst}$ (ms) |
|---|-----------------|
| P1| 6 |
| P2| 4 |
| P3| 5 |

Assume context‑switch cost $C_{cs}=0.2$ ms (negligible for FIFO).  
Schedule:  
* P1 runs $0\rightarrow6$ → ends at 6.  
* Switch → P2 runs $6\rightarrow10$ → ends at 10.  
* Switch → P3 runs $10\rightarrow15$ → ends at 15.

Metrics:  
* Turnaround: $T_{turn}^{P1}=6$, $P2=10$, $P3=15$.  
* Average waiting: $(0+6+10)/3 = 5.33$ ms.  
* Throughput: $3/15 = 0.2$ jobs/ms.

### Example 2: Round‑Robin (q=2 ms) with Overhead
Same jobs; $C_{cs}=0.2$ ms.  
Gantt chart (including switch time):
```
0-2   P1
2-2.2 cs
2.2-4.2 P2
4.2-4.4 cs
4.4-6.4 P3
6.4-6.6 cs
6.6-8.6 P1 (rem 2)
8.6-8.8 cs
8.8-10.8 P2 (rem 0) → finishes
10.8-11.0 cs
11.0-13.0 P1 (rem 0) → finishes
13.0-13.2 cs
13.2-15.2 P3 (rem 1) → continues
15.2-15.4 cs
15.4-17.4 P3 (finishes)
```
Completion times: P1=13.0 ms, P2=10.8 ms, P3=17.4 ms.  
Average waiting = $[(13-6)+(10.8-4)+(17.4-5)]/3 = 6.8$ ms.  
Throughput = $3/17.4 ≈ 0.172$ jobs/ms – lower than FIFO due to quantum + switch overhead.

### Example 3: MLFQ with Aging (3 Queues)
Quantums: Q0=5 ms, Q1=10 ms, Q2=∞ (FCFS).  
Aging boost every 50 ms: any job waiting >50 ms moves to Q0.  

Jobs:  
* A: arrival 0, burst 30 ms  
* B: arrival 10, burst 8 ms  
* C: arrival 20, burst 4 ms  

Timeline (simplified):
| Time | Running | Queue |
|------|---------|-------|
|0-5   | A       | Q0 (5/30 used) |
|5-10  | A       | Q1 (now 15/30 left) |
|10-15 | B arrives → Q0 (runs 5/8) |
|15-20 | B → Q1 (remaining 3/8) |
|20-25 | C arrives → Q0 (runs 4/4) → **C finishes at 24** |
|25-30 | A (still Q1) runs 5/15 left |
|30-35 | A → Q2 (FCFS) runs remaining 10/15 |
|35-40 | B → Q2 runs remaining 3/8 |
|40-45 | A finishes at 45 |
|45-48 | B finishes at 48 |

Aging never triggered because no job waited >50 ms.  
Result shows how short jobs (C) preempt longer ones despite arriving later.

## Common Mistakes
### Mistake 1: Assuming Burst Time Is Known
*What’s wrong:* Many textbook algorithms (SJF, SRTF) require exact $C_{burst}$.  
*Why it matters:* In real systems burst time is only estimable via past behavior (e.g., exponential averaging). Using a stale estimate can cause severe starvation or poor response.  
*Correct approach:* Use the estimator  
$$
\tau_{n+1} = \alpha \cdot t_n + (1-\alpha)\tau_n,
$$  
with $0<\alpha\le1$, where $t_n$ is the measured burst of the $n$th CPU burst.

### Mistake 2: Ignoring Priority Inversion in Real‑Time Policies
*What’s wrong:* Assuming a high‑priority SCHED_FIFO task will never be blocked by a lower‑priority task holding a mutex.  
*Why it matters:* Without priority‑inheritance or priority‑ceiling protocols, a medium‑priority task can preempt the holder, causing the high‑priority task to miss its deadline (classic Mars Pathfinder incident).  
*Linux fix:* `pi_mutex` (or `pthread_mutexattr_setprotocol(&attr, PTHREAD_PRIO_INHERIT)`) temporarily raises the holder’s priority to the waiter’s.

### Mistake 3: Treating Time Slice as the Only Knob for RR
*What’s wrong:* Believing that decreasing $q$ always improves response.  
*Why it matters:* Context‑switch overhead $C_{cs}$ scales with $1/q$. Effective CPU utilization becomes  
$$
U = \frac{q}{q + C_{cs}}.
$$  
If $q \ll C_{cs}$, utilization collapses.  
*Correct rule:* Choose $q$ such that $q \ge 5\!-\!10 \times C_{cs}$ for a target utilization > 80 %.

## Exercises
### Easy – FIFO Simulator
Write a C program that reads `n` lines `<pid> <arrival> <burst>` from stdin, simulates non‑preemptive FIFO, and prints each process’s start, finish, waiting, and turnaround times.  
*Hint:* sort by arrival time before scheduling.

### Medium – RR with Metrics
Extend the FIFO simulator to implement preemptive RR. Accept a quantum $q$ as a command‑line argument. Compute average waiting, turnaround, and response times. Validate against the hand‑calculated Example 2.

### Hard – MLFQ with Aging
Implement a three‑level MLFQ scheduler (quanta 8, 16, ∞) with aging boost every 100 ms. The simulator should accept a list of processes and output a Gantt chart (timestamp → pid).  
*Bonus:* Calculate Jain’s fairness index for the CPU shares received.

### Challenge – Analyze CFS vruntime
Given a set of nice values $-20 … +19$, derive the weight mapping used by Linux:  
$$
w = 1024 \times 1.25^{-\text{nice}}.
$$  
Write a program that, for a 1‑second interval, computes the expected CPU share of each nice level and verifies that the sum equals 100 %.

## Linux Connection
### Scheduling Subsystems
Linux maintains **scheduling classes** (`struct sched_class`) registered in the kernel:
* `stop_sched_class` (for stop/migration tasks) – highest priority.  
* `dl_sched_class` (SCHED_DEADLINE, EDF).  
* `rt_sched_class` (SCHED_FIFO, SCHED_RR).  
* `fair_sched_class` (CFS, SCHED_OTHER, SCHED_BATCH, SCHED_IDLE).  
* `idle_sched_class` (the idle task).

The class with the highest priority that has a runnable task wins.

### Inspecting the Scheduler
* **Per‑CPU runqueue stats**:  
  ```bash
  cat /proc/sched_debug   # shows nr_running, load, latency stats per CPU
  ```
* **CFS vruntime of a task**:  
  ```bash
  cat /proc/<pid>/sched   # contains se.vruntime, sum_exec_runtime, etc.
  ```
* **Real‑time bandwidth**:  
  ```bash
  sysctl kernel.sched_rt_runtime_us   # runtime allocated to RT tasks per period
  sysctl kernel.sched_rt_period_us
  ```

### Changing Priorities
* **Nice value** (affects CFS weight):  
  ```bash
  nice -n 10 ./cpu_bound_program    # start with nice +10
  renice 5 -p 1234                  # change existing pid 1234 to nice 5
  ```
* **Real‑time priority** (SCHED_FIFO/RR):  
  ```bash
  chrt -f 80 ./rt_program           # FIFO with priority 80 (1‑99)
  chrt -r 50 ./rr_program           # RR with priority 50
  ```
* **CFS bandwidth control** (cgroups v2):  
  ```bash
  # Create a sub‑slice with half the CPU of the parent
  echo 5000 > /sys/fs/cgroup/cpu.max   # 50 000 µs / 100 000 µs period
  echo $$ > /sys/fs/cgroup/user.slice/user-1000.slice/myapp/cgroup.procs
  ```

### Observing Context‑Switch Overhead
```bash
perf stat -e context-switches,cpu-migrations -a sleep 10
```
The output gives the number of switches; dividing total runtime by switch count yields an empirical $C_{cs}$.

### Deadline Scheduler (SCHED_DEADLINE)
```bash
# Allocate 20 ms runtime every 50 ms period to a task
chrt -d 20000 50000 ./deadline_app
```
Useful for audio/video pipelines where latency bounds are strict.

## Why This Matters
Understanding scheduling is not an academic exercise; it directly determines how **latency‑sensitive** workloads (audio, trading, robotics) behave under load, how **throughput‑oriented** batch jobs share a cluster, and how **fairness** is enforced in multi‑tenant environments such as containers or virtual machines.  

When you can:
* Derive the expected waiting time from a policy’s quantum and context‑switch cost,
* Predict how a nice value translates into a CPU share via the CFS weight formula,
* Observe real‑time bandwidth limits with `chrt` or cgroup `cpu.max`,
* Diagnose priority inversion with `pi_mutex` diagnostics,
* Choose the appropriate scheduling class (SCHED_FIFO for hard real‑time, SCHED_DEADLINE for guaranteed bandwidth, CFS for general purpose),

you gain the ability to **design systems that meet stringent service‑level objectives**, avoid surprises like missed deadlines or starvation, and optimize resource utilization across heterogeneous workloads. This knowledge forms the foundation for advanced topics such as **real‑time networking**, **container orchestration schedulers**, and **multiprocessor load balancers**, all of which rely on the same core principles explored here.
