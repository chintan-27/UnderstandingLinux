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

## Why This Matters

Every modern system runs more processes than it has CPU cores. Without a principled scheduling policy, a single CPU-bound process starves everything else — your shell freezes, your audio skips, your network stack stops responding. The scheduler decides which runnable process gets the CPU, for how long, and in what order. The consequences of getting it wrong are concrete: missed deadlines (a video frame drops because the decoder was preempted too late), wasted throughput (a server handles half the requests it could because context switches dominate), or starvation (a background job never finishes because higher-priority work never drains). In real-time systems, the scheduler makes explicit timing guarantees that human safety depends on.

---

## Core Concepts

### The Fundamental Tension: Latency vs. Throughput

**Turnaround time** measures end-to-end job duration:

$$T_{turnaround} = T_{completion} - T_{arrival}$$

**Response time** measures how long until a job first touches the CPU:

$$T_{response} = T_{firstrun} - T_{arrival}$$

These metrics are in direct conflict because of a structural asymmetry: minimizing turnaround time favors running jobs to completion without interruption (so no time is wasted on switching), while minimizing response time demands frequent switching (so no job waits long in the queue). You cannot simultaneously minimize both. Every scheduling policy picks a point in this tradeoff space, and any claim of "best scheduler" is meaningless without specifying which metric matters for the workload.

### Preemption

A **non-preemptive** scheduler lets a running process hold the CPU until it voluntarily yields — by blocking on I/O, calling `sleep()`, or exiting. This is simple to implement but gives CPU-bound processes infinite leverage: one tight loop can hold the CPU indefinitely.

A **preemptive** scheduler uses a hardware timer interrupt — typically the local APIC timer on x86 — to forcibly reclaim the CPU after a fixed **time slice** (quantum). At each timer interrupt, the kernel saves the current process's register state, runs the scheduler, and may context-switch to a different process. The timer interrupt is what makes multiprogramming enforceable: no process can hold the CPU forever by accident or malice, because the hardware takes it back.

The **context switch** itself is not free. Saving and restoring registers is the cheap part. The expensive parts are:
- **TLB flush**: switching address spaces invalidates TLB entries on most architectures (PCID tagging reduces but does not eliminate this cost on x86-64).
- **Cache pollution**: the incoming process has a different working set; its first accesses after a switch are likely L1/L2 cache misses.
- **Pipeline and branch predictor state**: indirect branch predictors track per-process history; a switch effectively poisons them.

This is why time slices cannot be made arbitrarily small. If a context switch costs $t_{cs}$ and the time slice is $q$, the fraction of CPU time wasted on switching is:

$$f_{overhead} = \frac{t_{cs}}{t_{cs} + q}$$

A 1ms time slice with a 10µs context switch wastes about 1% of CPU time on switches. Shrink $q$ to 10µs and you waste 50%.

### Workload Assumptions and Why They Break

Scheduling theory starts with simplifying assumptions: all jobs arrive simultaneously, runtimes are known, jobs are purely CPU-bound. Real workloads break all three. Jobs arrive at arbitrary times; runtimes are unknown and highly variable (a database query might run 1ms or 10 minutes); and processes alternate between CPU bursts and I/O waits. Any scheduler that performs well on textbook workloads but ignores these realities fails in production.

### The Convoy Effect

With a non-preemptive scheduler, a single long CPU-bound job forces every job behind it to wait, regardless of how short those jobs are. This is the **convoy effect**: short jobs pile up behind a long one the way cars pile up behind a truck on a single-lane road. Average turnaround time grows proportionally to the length of the blocking job, not to the average job length — which is why one badly behaved process can degrade a system's apparent responsiveness far beyond what its CPU share would suggest.

### Fairness

A scheduler is **fair** if every runnable process receives CPU time at a rate proportional to its assigned weight. With equal weights, each of $n$ processes should receive $\frac{1}{n}$ of the CPU. Fairness and optimal turnaround are in direct conflict: Shortest Job First, the provably optimal turnaround policy, is maximally unfair — it can starve long jobs indefinitely if short jobs keep arriving.

---

## How It Works

### FIFO / First-Come-First-Served

Run jobs in arrival order, non-preemptively. Performance degrades severely when a long job arrives before short ones.

**Example:** Three jobs arrive at $t = 0$. A runs for 100s, B for 10s, C for 10s.

$$T_{A} = 100, \quad T_{B} = 110, \quad T_{C} = 120$$

$$\bar{T} = \frac{100 + 110 + 120}{3} = 110 \text{ s}$$

Reorder so B arrives first:

$$\bar{T} = \frac{10 + 20 + 120}{3} = 50 \text{ s}$$

Same jobs, same total work, 55% improvement in average turnaround — purely from ordering. This illustrates that FIFO's pathology is not about total work but about which jobs block which others.

### Shortest Job First (SJF)

Run the job with the shortest total runtime first, non-preemptively. Among all non-preemptive policies for jobs that arrive simultaneously, SJF is **provably optimal** for average turnaround time. The proof is by exchange argument: if any longer job $L$ precedes a shorter job $S$ in the schedule, swapping them reduces $T_{turnaround}$ for $S$ by the length of $L$, while increasing $T_{turnaround}$ for $L$ by the length of $S$. Since $len(S) < len(L)$, the net effect is a decrease in average turnaround.

The catch is fundamental: the OS does not know $len(S)$ in advance.

### Shortest Time-to-Completion First (STCF)

The preemptive extension of SJF. Whenever a new job arrives, compare its total runtime to the **remaining** runtime of the currently running job. If the newcomer is shorter, preempt immediately and run the newcomer. STCF is optimal for average turnaround time when jobs arrive at arbitrary times — by the same exchange argument as SJF, but applied to remaining work rather than total work.

**Example:** A arrives at $t=0$ with runtime 100s. B arrives at $t=10$ with runtime 10s. Under STCF:
- A runs from $t=0$ to $t=10$ (10s elapsed, 90s remaining).
- B arrives; $10 < 90$, so preempt A. B runs from $t=10$ to $t=20$.
- A resumes at $t=20$, finishes at $t=110$.

$$T_{turnaround,B} = 20 - 10 = 10 \text{ s}, \quad T_{turnaround,A} = 110 - 0 = 110 \text{ s}$$

$$\bar{T} = \frac{110 + 10}{2} = 60 \text{ s}$$

Compare to naive FIFO (A first): $\bar{T} = \frac{100 + 110}{2} = 105$ s.

### Round Robin (RR)

Cycle through all runnable jobs in order, giving each a fixed time slice $q$ before switching to the next. Every job gets CPU time regularly, regardless of how long it will ultimately run.

With $n$ equal-length jobs and time slice $q$, each job first runs within:

$$T_{response} \leq (n-1) \cdot q$$

RR's cost: it deliberately destroys turnaround time. If all $n$ jobs have length $L$, FIFO finishes the first job at time $L$. RR finishes the first job at time $n \cdot L - (n-1) \cdot q \approx n \cdot L$. RR stretches every job to near-completion time of the last job.

The time slice $q$ is a continuous dial between two failure modes:
- $q \to 0$: response time approaches zero but context-switch overhead $f_{overhead} \to 1$ — the CPU does nothing but switch.
- $q \to \infty$: degenerates to FIFO — perfect turnaround for the first job, terrible response time for everyone else.

The Linux kernel's typical `sched_latency` target (the time within which every runnable process should run once) is 6–24ms, divided by the number of runnable processes to give the per-process slice.

### Incorporating I/O: Overlap

A process blocked on I/O is not using the CPU — it's waiting for a disk seek, a network packet, or a pipe write. A scheduler that understands this runs another process during the wait, achieving **CPU/I/O overlap**: both the CPU and the I/O device are utilized simultaneously.

Concretely: if process A issues a `read()` that takes 10ms to complete, and process B is CPU-bound, a scheduler that gives the CPU to B during A's I/O wait can achieve near-100% CPU utilization. A scheduler that blocks waiting for A wastes 10ms of CPU time unconditionally.

When A's I/O completes, the kernel receives an interrupt, marks A runnable, and reinserts it into the scheduler's queue. Where it gets placed matters: processes that do frequent short I/O bursts tend to use the CPU in short bursts too. Treating them as high-priority "short" jobs improves both their response time and overall CPU utilization — which is the intuition behind MLFQ's priority rules.

### Multi-Level Feedback Queue (MLFQ)

MLFQ solves the problem of unknown job runtimes by inferring them from observed behavior. It maintains $k$ priority queues (typically 3–8) with the rule that higher-priority queues get scheduled first, and processes within a queue are scheduled round-
