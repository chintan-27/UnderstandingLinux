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

Every resource in a computer — a CPU core, a disk, a network interface, a lock — can serve only one request at a time. When requests arrive faster than they can be served, they queue. The relationship between arrival rate, service rate, and latency is nonlinear: a server at 90% utilization does not behave like a slightly busier version of one at 50% — it behaves like a different system. Without a quantitative model, you will misread the numbers Linux gives you, because the numbers are right but your mental model of what they imply is wrong.

## Core Concepts

### Arrivals and the Poisson Process

Requests arrive at rate $\lambda$ (arrivals per second). In the M/M/1 model, arrivals follow a **Poisson process**: inter-arrival times are exponentially distributed with mean $1/\lambda$, and the count of arrivals in any interval $t$ is:

$$P(N(t) = k) = \frac{(\lambda t)^k e^{-\lambda t}}{k!}$$

This is not merely a convenient assumption. When a large number of independent sources each contribute rarely and without coordinating, the aggregate arrival process converges to Poisson by a superposition argument. Network packets from thousands of independent flows, syscalls from unrelated processes, and async disk I/O from unrelated threads all fit this regime. The assumption breaks when sources synchronize — a thundering herd after a cache miss, or a cron job firing on every host simultaneously.

### Service Rate and Service Time

A server processes requests at rate $\mu$ completions per second, so the mean service time is $1/\mu$. In M/M/1, service times are exponentially distributed, which gives the **memoryless property**: $P(T > s + t \mid T > s) = P(T > t)$. Knowing a request has already been in service for $s$ seconds tells you nothing about how much longer it will take. This collapses the state of the system to a single number — the queue length — which is what makes M/M/1 analytically tractable.

### Utilization

$$\rho = \frac{\lambda}{\mu}$$

$\rho$ is the fraction of time the server is busy. Stability requires $\rho < 1$. When $\rho \geq 1$, the queue grows without bound: the server is always behind and never catches up. This is a phase transition, not a gradual degradation. A system at $\rho = 0.99$ will collapse under any transient spike because transient spikes always exist.

### Little's Law

$$L = \lambda W$$

- $L$ = mean number of requests in the system (queue + in service)
- $\lambda$ = arrival rate
- $W$ = mean time a request spends in the system

This is a conservation law. It requires no assumptions about arrival distribution, service distribution, number of servers, or scheduling policy — only that the system is stable (inputs equal outputs over time). Its power is that it connects an operator-visible metric ($L$, the queue depth you read from a tool) to a user-visible metric ($W$, the latency your application measures), via something you can instrument ($\lambda$, the arrival rate). If your run queue length averages 4 and your arrival rate is 400 processes/second, mean scheduling latency is $W = L/\lambda = 10\text{ ms}$.

### The Bottleneck Law

In a pipeline of resources, throughput is capped by the resource with the highest demand:

$$X \leq \min_i \left(\frac{1}{D_i}\right)$$

where $D_i$ is the **service demand** at resource $i$ — the total time resource $i$ spends per completed job, equal to (visits to $i$) $\times$ (mean service time per visit). The bottleneck is not necessarily the busiest-looking resource; it is the one whose demand $D_i$ is largest. Optimizing any other resource cannot raise $X$ above $1/D_{\text{bottleneck}}$.

## How It Works

### M/M/1 Steady-State Results

For a single server with Poisson arrivals and exponential service:

$$L = \frac{\rho}{1-\rho}, \qquad W = \frac{1/\mu}{1-\rho} = \frac{1}{\mu - \lambda}$$

$$L_q = \frac{\rho^2}{1-\rho}, \qquad W_q = \frac{\rho}{\mu - \lambda}$$

The relationship $W = W_q + 1/\mu$ is exact: mean sojourn time equals mean wait in queue plus mean service time.

The nonlinearity is in $W$:

| $\rho$ | $W$ (units of $1/\mu$) | Increase from $\rho = 0.5$ |
|--------|------------------------|---------------------------|
| 0.50   | 2.0                    | —                         |
| 0.75   | 4.0                    | ×2                        |
| 0.90   | 10.0                   | ×5                        |
| 0.95   | 20.0                   | ×10                       |
| 0.99   | 100.0                  | ×50                       |

Going from 50% to 90% utilization — a change that sounds modest — multiplies mean latency by five. The curve is convex and accelerating. A system running at 90% that absorbs a 10% traffic spike hits $\rho = 0.99$ and its latency increases tenfold, not by 10%.

### Simulating the Hockey Stick

```python
import numpy as np
import matplotlib.pyplot as plt

mu = 1.0
rho = np.linspace(0.01, 0.999, 2000)

W_mm1 = 1.0 / (mu - rho * mu)          # M/M/1: W = 1/(mu - lambda)
W_md1 = (1.0 / mu) * (1 - rho / 2) / (1 - rho)  # M/D/1: deterministic service

fig, ax = plt.subplots()
ax.plot(rho, W_mm1, label='M/M/1 (exponential service)')
ax.plot(rho, W_md1, label='M/D/1 (deterministic service)', linestyle='--')
ax.axvline(0.80, color='red', linestyle=':', label='ρ=0.80')
ax.set_xlabel('Utilization ρ')
ax.set_ylabel('Mean sojourn time W (× 1/μ)')
ax.set_ylim(0, 50)
ax.legend()
plt.tight_layout()
plt.show()
```

M/D/1 (deterministic service time, as with a fixed-size packet on a wire) produces exactly half the queueing delay of M/M/1 at the same utilization. This is why reducing service time variance — not just mean service time — matters: $W_q^{M/D/1} = W_q^{M/M/1}/2$. Variability in service time directly inflates the queue.

### M/M/c: Multiple Servers

With $c$ identical servers, per-server utilization is $\rho = \lambda/(c\mu)$, and the system can serve up to $c$ requests simultaneously. The mean queue wait is:

$$W_q = \frac{C(c, \lambda/\mu)}{c\mu - \lambda} \cdot \frac{1}{1}$$

where $C(c, \lambda/\mu)$ is the **Erlang C formula** — the probability that an arriving request finds all $c$ servers busy. Adding a second server does not halve latency uniformly; it moves the blowup point to $\rho = 1$ for $c$ servers combined, but Erlang C means the gain is sharpest at high utilization, where it matters most.

### Worked Example: Disk Subsystem

A disk handles $\mu = 200$ IOPS. Your application drives $\lambda = 160$ IOPS.

$$\rho = \frac{160}{200} = 0.80$$

$$W = \frac{1}{\mu - \lambda} = \frac{1}{200 - 160} = 25\text{ ms}, \qquad W_q = W - \frac{1}{\mu} = 25 - 5 = 20\text{ ms}$$

A batch job adds 20 IOPS, bringing $\lambda$ to 180:

$$\rho = 0.90, \qquad W = \frac{1}{200 - 180} = 50\text{ ms}$$

A 12.5% increase in load doubled latency. The disk's service time ($1/\mu = 5\text{ ms}$) is unchanged. The entire increase came from queueing. This is why "the disk is only at 90%" is not reassuring — it means you are on the steep part of the curve.

## Linux Connection

### CPU Run Queue: `vmstat`, `/proc/schedstat`

The kernel run queue holds threads that are runnable but not yet scheduled. Its length is the $L$ in Little's Law for the CPU subsystem.

```bash
# 'r' column: threads waiting + running on CPU
# if r > number of logical CPUs, threads are waiting
vmstat 1 5
```

```
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 6  0      0 2048000  45000 900000    0    0     0   120 1200 2400 40 10 50  0  0
```

Here `r=6` on a 4-core machine means $\rho > 1$: the CPU subsystem is overloaded. The two excess threads are queued. Apply Little's Law: if $\lambda = 1200$ context switches/second (the `cs` field), and $L = 6$, then $W = L/\lambda = 5\text{ ms}$ average scheduling
