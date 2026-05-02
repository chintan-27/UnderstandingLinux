---
id: 12
title: "Queueing theory"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every Linux system is a collection of queues. Network packets wait in the NIC ring buffer. Disk I/O requests pile up in the block layer. CPU-bound processes sit in the run queue. When you ignore queueing theory, you build systems that appear fine at 40% load and collapse at 70% — not because you ran out of resources, but because queue depth explodes nonlinearly as utilization approaches 1. The math lets you predict *where* a system breaks before it breaks, size buffers correctly, identify the true bottleneck in a pipeline, and explain why doubling CPU speed sometimes does nothing for latency.

---

## Core Concepts

### Arrivals and the Arrival Rate $\lambda$

Work arrives at a system at average rate $\lambda$ (requests per second, packets per second, syscalls per second). In the Poisson arrival model, the number of arrivals in any fixed interval is independent of other intervals. This approximates real workloads well when arrivals come from many independent sources — HTTP requests from distinct clients, disk I/O from unrelated processes, interrupts from uncoordinated devices.

The Poisson assumption matters because it makes the system analytically tractable. Its key consequence: inter-arrival times are exponentially distributed with mean $1/\lambda$. If arrivals are bursty or correlated (flash crowds, synchronized cron jobs), the Poisson model underestimates queue depth — the real system will be worse than the model predicts.

### Service Rate $\mu$ and Service Time $S$

A server — a CPU core, a disk, a thread pool worker — completes work at rate $\mu$. The average service time per request is:

$$S = \frac{1}{\mu}$$

Service time is how long the server is *occupied* with your request. It excludes waiting. A disk with 5ms average seek time has $\mu = 200$ I/O operations per second, $S = 5\text{ ms}$ — but a request sitting behind nine others waits far longer than 5ms.

### Utilization $\rho$

$$\rho = \frac{\lambda}{\mu} = \lambda \cdot S$$

Utilization is the fraction of time the server is busy. For a stable queue, $\rho < 1$. When $\rho \geq 1$, arrivals outpace completions and the queue grows without bound — the server cannot drain work as fast as it arrives, ever.

**The nonlinear trap:** utilization does not feel dangerous until it is. The system at $\rho = 0.5$ and the system at $\rho = 0.9$ are consuming similar fractions of nominal capacity, but their queue behaviors are orders of magnitude apart. This is not an operational observation — it follows directly from the $\frac{1}{1-\rho}$ term in the response time formula.

### Throughput $X$

$$X = \min(\lambda, \mu)$$

When $\lambda < \mu$, every arriving request is eventually served and $X = \lambda$. When $\lambda \geq \mu$, the server saturates and $X$ is capped at $\mu$ regardless of how fast requests arrive. Throughput measures useful work the system produces; utilization measures how close you are to the ceiling that caps it.

### Little's Law

**Little's Law** requires no assumptions about arrival distributions, service time distributions, or scheduling policy. For any stable system in steady state:

$$N = X \cdot R$$

Where:
- $N$ = average number of requests in the system (queued + in service)
- $X$ = throughput (completions per second)
- $R$ = average response time (seconds per request)

This is exact, not an approximation. If you measure two of these quantities with `ss`, `iostat`, or application metrics, you know the third. If your monitoring gives you $N$ from queue depth and $X$ from request rate, $R = N / X$ is your average latency — without ever instrumenting the latency directly.

### Response Time

**Response time** $R$ is total time a request spends in the system: queuing time $W$ plus service time $S$:

$$R = W + S$$

What you observe as "latency" in `strace` timing, `perf`, or application logs is $R$, not $S$. When users report high latency on a system that isn't CPU-saturated, the explanation is usually $W$ — time spent in a queue before any service begins.

### The M/M/1 Queue

Poisson arrivals (M), exponential service times (M), single server (1). This is the baseline model for any single-resource bottleneck:

$$R = \frac{S}{1 - \rho}$$

$$N = \frac{\rho}{1 - \rho}$$

The $\frac{1}{1-\rho}$ factor is the entire story of capacity planning. As $\rho \to 1$, both response time and queue depth diverge to infinity. This is not a pathological edge case — it is what the equations predict for *any* system fitting this model, including your disk, your NIC, your database connection pool.

### Bottleneck Analysis

In a pipeline of stages, each stage $i$ has service demand $S_i$ (average time per request spent at stage $i$). System throughput is bounded by the slowest stage:

$$X \leq \frac{1}{\max_i(S_i)}$$

Utilization at stage $i$ under offered load $\lambda$ is $\rho_i = \lambda \cdot S_i$. The stage where $\rho_i$ is highest is the bottleneck. Improving any other stage does not increase system throughput — this is Amdahl's Law expressed through queueing rather than parallelism.

---

## How It Works

### The Latency Cliff

The M/M/1 response time formula $R = S / (1 - \rho)$ is a hyperbola in $\rho$. Small changes near $\rho = 1$ cause large changes in latency:

| $\rho$ | $R / S$ |
|--------|---------|
| 0.10   | 1.11    |
| 0.50   | 2.00    |
| 0.80   | 5.00    |
| 0.90   | 10.00   |
| 0.95   | 20.00   |
| 0.99   | 100.00  |

A disk with $S = 5\text{ ms}$ service time at $\rho = 0.80$ delivers $R = 25\text{ ms}$ average response time. At $\rho = 0.95$ — only 15 percentage points higher utilization — $R = 100\text{ ms}$. The disk is doing the same work per request; the extra 75ms is pure waiting. This is why capacity planning targets $\rho \leq 0.70$–$0.80$ as a *ceiling*, not a warning threshold.

### Queue Depth and Memory Pressure

From Little's Law and the M/M/1 result, average queue depth (including the request in service):

$$N = \frac{\rho}{1 - \rho}$$

At $\rho = 0.50$: $N = 1$. At $\rho = 0.90$: $N = 9$. At $\rho = 0.99$: $N = 99$.

Queue depth is not just an abstract number — it directly determines buffer memory consumption. The Linux block layer maintains a per-device request queue. The default queue depth for NVMe devices is 1023 (visible in `/sys/block/nvme0n1/queue/nr_requests`). If your storage utilization is chronically above 90%, that queue is routinely 10–100 entries deep. Each entry in the block layer's `struct request` is roughly 400–500 bytes, but more critically, the *data* those requests reference stays pinned in memory until completion. Queue depth × average request size = pinned memory. At $\rho = 0.99$ with 128KB requests and queue depth 99, you are pinning ~12MB per device just in in-flight I/O.

### Multi-Server Queues: M/M/c

With $c$ parallel servers (thread pool workers, CPU cores handling interrupts, parallel disk paths), effective per-server utilization is:

$$\rho = \frac{\lambda}{c \mu}$$

The system is stable when $\rho < 1$. Adding servers shifts the saturation point but does not eliminate the latency cliff — it relocates it. The M/M/c response time formula is more complex than M/M/1, but the same $\frac{1}{1-\rho}$ divergence applies.

Concrete example: an NGINX worker pool with $c = 4$ workers, mean request service time $S = 20\text{ ms}$, $\mu = 50\text{ req/s per worker}$.

At $\lambda = 150\text{ req/s}$:

$$\rho = \frac{150}{4 \times 50} = \frac{150}{200} = 0.75$$

At $\lambda = 190\text{ req/s}$:

$$\rho = \frac{190}{200} = 0.95$$

The M/M/1 approximation gives $R/S \approx 20$ at $\rho = 0.95$ — so average response time is approximately $20 \times 20\text{ ms} = 400\text{ ms}$ versus $4 \times 20\text{ ms} = 80\text{ ms}$ at $\rho = 0.75$. A 27% increase in traffic produced a 5× increase in latency.

### Bottleneck Analysis: A Complete Example

Consider a request pipeline with three measured service demands:

| Subsystem | $S_i$ (ms) | $\rho_i$ at $\lambda = 100\text{ req/s}$ |
|-----------|-----------|------------------------------------------|
| CPU       | 2         | 0.20                                     |
| Disk      | 8         | 0.80                                     |
| Network   | 1         | 0.10                                     |

Total response time without queueing: $S_{\text{total}} = 11\text{ ms}
