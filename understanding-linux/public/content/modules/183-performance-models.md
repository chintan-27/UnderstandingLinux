---
id: 183
title: "Performance models"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When a system slows down, you need a vocabulary precise enough to diagnose *why*. Without it, you guess — adding CPUs when the bottleneck is disk I/O, tuning caches when the real problem is lock contention, or declaring a system "slow" when it is actually saturated only during 200ms bursts. The performance model built from latency, throughput, utilization, service time, and queueing theory gives you a causal framework: measure what the system is doing, predict what happens as load grows, identify exactly which resource is the constraint before touching a single tunable.

---

## Core Concepts

### Latency

Latency is time elapsed between two defined events. The word alone is meaningless — you must specify the start and end points. "Disk latency" could mean time in the block layer queue, time from `submit_bio()` to completion interrupt, or the full round-trip from application `write()` to `fsync()` return. Each of those measurements can differ by an order of magnitude on the same hardware under the same load.

Latency decomposes additively. A web request's server-side latency is:

$$T_{\text{total}} = T_{\text{accept}} + T_{\text{read\_request}} + T_{\text{handler}} + T_{\text{write\_response}}$$

Each term is independently measurable with `strace -T` or eBPF. When you decompose latency this way, you stop asking "why is the app slow?" and start asking "which term grew?".

### Throughput

Throughput is work completed per unit time. It is the output rate of a system *under a specific load at a specific utilization*. The critical distinction: throughput is a measurement of what the system *did*, not what it *can do*. Maximum sustainable throughput — the throughput at which latency begins to unboundedly increase — is a property of the system. You find it by increasing load until the M/M/1 curve bends upward sharply (see below).

Throughput and latency are orthogonal axes. High throughput with high latency means a large queue is draining efficiently. Low throughput with low latency means load is light. High latency with low throughput means you have a different problem: likely serialization or a broken fast path, not saturation.

### Utilization

Utilization $U$ is the fraction of time a resource is busy:

$$U = \frac{\text{busy time}}{\text{elapsed time}}$$

A CPU that spent 700ms executing threads out of a 1000ms window has $U = 0.7$. This is measurable directly from `/proc/stat` (see below).

Utilization matters because **queue length grows nonlinearly as $U \to 1$**. The reason is probabilistic: even if average load is below capacity, variance in arrival times and service times creates moments where the arrival rate temporarily exceeds service rate. At low $U$, the system drains these bursts quickly. Near $U = 1$, it cannot drain them faster than they arrive, so the queue grows without bound. This is not a property of bad hardware or bad software — it is a consequence of the math of random processes.

### Service Time

Service time $S$ is the time a resource spends processing one request *when it is the only request being processed* — pure work time, with nothing queued ahead of it. Service time is a property of the resource and request type; it does not change with load in the ideal case (no interference from thermal throttling, bus contention, etc.).

What changes with load is wait time $W$: the time a request sits in queue before service begins. The caller observes response time $R$:

$$R = W + S$$

At low utilization, $W \approx 0$ and $R \approx S$. As $U \to 1$, $W$ dominates and $R \gg S$. If you are seeing high latency, the first question is: is $R$ tracking $S$ (a service time problem — hardware degradation, code regression) or has $W$ grown large (a queueing problem — saturation)?

### Queueing

A queue forms whenever instantaneous arrival rate exceeds instantaneous service capacity. This can happen even when *average* utilization is 50%, because arrivals are not perfectly spaced. The Poisson process — the standard model for independent random arrivals — produces bursts even at modest average rates. This is why a disk that handles 500 IOPS just fine at steady state can exhibit milliseconds of latency during a burst of 600 IOPS lasting 100ms.

---

## How It Works

### Little's Law

Little's Law holds for any stable system in steady state, with no assumptions about arrival or service distributions:

$$L = \lambda W$$

- $L$ = mean number of requests in the system (queued + in service)
- $\lambda$ = mean arrival rate (requests/second)
- $W$ = mean time a request spends in the system

This is a measurement identity. Given any two of the three quantities, you get the third. If `avgqu-sz` from `iostat` reports $L = 8$ and you know $\lambda = 400$ IOPS, then $W = L / \lambda = 8/400 = 20\text{ms}$ average time per I/O in the system. If your baseline $S$ is 1ms, something is very wrong.

You can apply Little's Law to any subsystem with a defined boundary: a thread pool (workers in flight = arrival rate × average task duration), a TCP socket buffer, a database connection pool.

### Utilization Law

From the operational laws of queueing theory:

$$U = \lambda \cdot S$$

This is not a model — it is an algebraic identity that holds for any single-server resource. If requests arrive at $\lambda = 2000/\text{s}$ and each requires $S = 0.3\text{ms} = 3 \times 10^{-4}\text{s}$ of service:

$$U = 2000 \times 3 \times 10^{-4} = 0.6$$

To find the maximum throughput $\lambda_{\max}$ before saturation ($U = 1$):

$$\lambda_{\max} = \frac{1}{S}$$

A resource with $S = 0.3\text{ms}$ can sustain at most $\approx 3333$ requests/second. Any load model that projects arrival rates near or above this threshold will produce unbounded queue growth in the M/M/1 approximation.

### The M/M/1 Queue

**M/M/1** (Kendall notation): Poisson arrivals, exponential service times, one server, infinite queue capacity. It is an approximation — real systems have non-exponential service times and finite queues — but it is the right approximation for building intuition and detecting saturation.

Mean response time:

$$R = \frac{S}{1 - U}$$

Mean queue length (including the request in service):

$$L = \frac{U}{1 - U}$$

The $\frac{1}{1-U}$ factor is the queueing multiplier. Expanding the table from the draft with the queue wait contribution explicit:

| $U$ | $R / S$ | $W / S$ (wait fraction) |
|---|---|---|
| 0.50 | 2 | 1 |
| 0.80 | 5 | 4 |
| 0.90 | 10 | 9 |
| 0.95 | 20 | 19 |
| 0.99 | 100 | 99 |

At $U = 0.99$, 99% of observed response time is queue wait. Optimizing service time at this utilization achieves almost nothing — you must reduce $U$ by reducing $\lambda$ or increasing throughput capacity (more parallelism, faster hardware).

The response time curve is hyperbolic:

$$\lim_{U \to 1} R = \infty$$

There is no finite response time at 100% utilization under stochastic load. Systems that appear to sustain 100% utilization without queue growth are either not processing random workloads or are dropping requests.

### Saturation and the Knee of the Curve

The "knee" — where $R$ begins rising steeply — occurs around $U \approx 0.7\text{–}0.8$ for most real systems. This is tighter than the M/M/1 model suggests for two reasons:

1. **Service time variance**: Real service times are not exponential. Higher variance (e.g., disk seeks with rotational latency) shifts the knee left. The M/M/G/1 model (general service distribution) gives $R = S/(1-U) \cdot \frac{1 + C_s^2}{2}$ where $C_s^2$ is the squared coefficient of variation of service time. For a disk with $C_s^2 > 1$, latency rises faster than the basic M/M/1 formula predicts.

2. **Scheduling overhead**: At high utilization, the scheduler itself consumes cycles, and lock contention in the I/O path increases. These reduce effective service capacity, making the real $\lambda_{\max}$ lower than $1/S$.

For latency-sensitive workloads, treat sustained $U > 0.70$ as a warning and $U > 0.85$ as a problem.

### Nonlinear Scalability: The USL

The Universal Scalability Law (Neil Gunther) models system throughput $X(N)$ as a function of parallel workers $N$:

$$X(N) = \frac{N}{1 + \sigma(N-1) + \kappa N(N-1)}$$

- $\sigma$ = **contention coefficient**: serialized sections that only one worker can execute at a time (Amdahl's Law is the $\kappa=0$ case)
- $\kappa$ = **coherency coefficient**: cost of coordinating shared state across all pairs of workers — grows as $O(N^2)$

The throughput peak occurs at:

$$N_{\max} = \left\lfloor \sqrt{\frac{1-\sigma}{\kappa}} \right\rfloor$$

Beyond $N_{\max}$, throughput *decreases* as $N$ increases. For a system with $\sigma = 0.05$ and $\kappa = 0.01$:

$$N_{\max} = \left\
