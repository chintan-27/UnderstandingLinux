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

## Core Concepts
### Introduction to Queueing Theory
Queueing theory studies stochastic systems where entities (jobs, packets, I/O requests) arrive, wait for service, and depart. In Linux, every resource that serializes access—CPU cores, disk blocks, network interfaces—forms a queue. Understanding the transient and steady‑state behavior of these queues lets us predict latency, size buffers correctly, and avoid overload.

### Key Concepts
* **Arrival process** – characterized by rate $\lambda$ (jobs / s) and inter‑arrival distribution. Poisson arrivals ($\text{Exp}(\lambda)$) are common because many independent event sources superpose to a memoryless process.
* **Service process** – rate $\mu$ (jobs / s) per server; service time distribution may be exponential (M), general (G), or deterministic (D).
* **Utilization** $\rho = \frac{\lambda}{c\mu}$ for $c$ identical servers. $\rho<1$ is necessary for a stationary distribution; $\rho\ge1$ makes the queue explode.
* **Little’s Law** – $L = \lambda W$, where $L$ is the mean number of jobs in the system and $W$ the mean sojourn time. Holds for any stable queue irrespective of arrival/service distributions.
* **Waiting time in queue** $W_q$ versus **sojourn time** $W = W_q + 1/\mu$.
* **Bottleneck** – the resource with the highest $\rho$; it dictates system throughput and dominates latency.

### Causal Explanation
When a job arrives, it finds the system in some state $n$ (number of jobs present). If $n<c$ (servers idle), it starts service immediately; otherwise it joins the tail. The probability flux balance between states yields the steady‑state distribution. For an $M/M/1$ queue the balance equations are  

$$
\lambda p_n = \mu p_{n+1},\quad n\ge0,
$$

giving $p_n = (1-\rho)\rho^n$. The mean number in system follows from the geometric series:

$$
L = \sum_{n=0}^\infty n p_n = \frac{\rho}{1-\rho}.
\]

Applying Little’s Law yields the mean sojourn time

$$
W = \frac{L}{\lambda}= \frac{1}{\mu-\lambda}.
\]

Thus latency grows hyperbolically as $\lambda\to\mu$: a 10 % increase in utilization near saturation can double $W$. The same principle underlies multi‑server queues, where the effective service capacity is $c\mu$.

## How It Works
### Mathematical Modeling
Queueing models are continuous‑time Markov chains (CTMC) when arrivals and services are memoryless. The state is the number of jobs $n$. Transition rates:

* $n \to n+1$ at rate $\lambda$ (arrival),
* $n \to n-1$ at rate $\min(n,c)\mu$ (service completions).

Solving the global balance equations yields the stationary distribution $\pi_n$. For $M/M/c$:

$$
\pi_0 = \left[\sum_{k=0}^{c-1}\frac{(c\rho)^k}{k!} + \frac{(c\rho)^c}{c!\,(1-\rho)}\right]^{-1},
\qquad
\pi_n = 
\begin{cases}
\frac{(c\rho)^n}{k!}\pi_0, & n<c\\[4pt]
\frac{(c\rho)^n}{c!\,c^{\,n-c}}\pi_0, & n\ge c
\end{cases}
$$

where $\rho=\lambda/(c\mu)$. Mean number in queue:

$$
L_q = \frac{(c\rho)^c\,\rho}{c!\,(1-\rho)^2}\,\pi_0,
\quad
W_q = \frac{L_q}{\lambda}.
\]

For $M/G/1$ the Pollaczek‑Khinchine (P‑K) formula gives

$$
W_q = \frac{\lambda\,\mathbb{E}[S^2]}{2(1-\rho)},
$$

with $S$ the service time; variability ($\mathbb{E}[S^2]$) directly inflates waiting time.

### Example Derivation (M/M/1)
Given $\lambda=10$ req/s, $\mu=15$ req/s:

1. Compute utilization: $\rho=\lambda/\mu = 10/15 = 2/3 \approx 0.667$.
2. Mean number in system: $L = \rho/(1-\rho) = (2/3)/(1/3)=2$.
3. Mean sojourn time: $W = L/\lambda = 2/10 = 0.2$ s.
4. Waiting time in queue: $W_q = W - 1/\mu = 0.2 - 1/15 \approx 0.133$ s.

The earlier draft’s latency formula $1/(\mu-\lambda)$ equals $W$, not $W_q$.

## Worked Examples
### Example 1: Single‑Server Queue (M/M/1)
*Parameters*: $\lambda=5$ req/s, $\mu=10$ req/s.  

**Step‑by‑step**

1. Utilization: $\rho = 5/10 = 0.5$.
2. $L = \rho/(1-\rho) = 0.5/0.5 = 1$.
3. $W = L/\lambda = 1/5 = 0.2$ s.
4. $W_q = W - 1/\mu = 0.2 - 0.1 = 0.1$ s.
5. Probability of waiting > $t$: $P(W_q>t) = \rho\,e^{-(c\mu-\lambda)t}$ for $M/M/1$ reduces to $\rho e^{-(\mu-\lambda)t}$. For $t=0.5$ s: $0.5 e^{-5\times0.5}=0.5 e^{-2.5}\approx0.041$.

```python
import math

lam, mu = 5.0, 10.0
rho = lam / mu
L = rho / (1 - rho)
W = L / lam
Wq = W - 1.0 / mu
print(f"ρ={rho:.3f}, L={L:.3f}, W={W:.3f}s, Wq={Wq:.3f}s")
```

### Example 2: Multi‑Server Queue (M/M/c)
*Parameters*: $c=5$ servers, each $\mu=10$ req/s, $\lambda=20$ req/s.

1. Total service capacity $c\mu = 50$ req/s → $\rho = 20/50 = 0.4$.
2. Compute $\pi_0$:
   $$
   \pi_0 = \Bigg[\sum_{k=0}^{4}\frac{(c\rho)^k}{k!} + \frac{(c\rho)^5}{5!\,(1-\rho)}\Bigg]^{-1}
   =\Bigg[\sum_{k=0}^{4}\frac{(2)^k}{k!} + \frac{2^5}{120\,(0.6)}\Bigg]^{-1}
   \approx 0.135.
   $$
3. $L_q = \frac{(c\rho)^c\,\rho}{c!\,(1-\rho)^2}\,\pi_0
   = \frac{2^5 \times 0.4}{120 \times 0.6^2}\times0.135 \approx 0.025$.
4. $W_q = L_q/\lambda = 0.025/20 = 0.00125$ s (1.25 ms).
5. Mean number in system $L = L_q + c\rho = 0.025 + 5\times0.4 = 2.025$.
6. Mean sojourn $W = L/\lambda = 2.025/20 = 0.101$ s.

```python
import math

lam, mu, c = 20.0, 10.0, 5
rho = lam / (c * mu)
# compute pi0
sum_term = sum((c * rho) ** k / math.factorial(k) for k in range(c))
extra_term = (c * rho) ** c / (math.factorial(c) * (1 - rho))
pi0 = 1.0 / (sum_term + extra_term)
Lq = ((c * rho) ** c * rho) / (math.factorial(c) * (1 - rho) ** 2) * pi0
Wq = Lq / lam
L = Lq + c * rho
W = L / lam
print(f"ρ={rho:.3f}, π0={pi0:.5f}, Lq={Lq:.5f}, Wq={Wq:.6f}s, L={L:.3f}, W={W:.3f}s")
```

### Example 3: M/G/1 with Deterministic Service
*Parameters*: $\lambda=8$ req/s, deterministic service time $S=0.08$ s → $\mu=1/S=12.5$ req/s, $\rho=\lambda/\mu=0.64$. For deterministic $S$, $\mathbb{E}[S^2]=S^2=0.0064$ s².

Using P‑K:

$$
W_q = \frac{\lambda\,\mathbb{E}[S^2]}{2(1-\rho)}
     = \frac{8 \times 0.0064}{2 \times 0.36}
     = \frac{0.0512}{0.72}
     \approx 0.0711\text{ s}=71.1\text{ ms}.
$$

Mean sojourn $W = W_q + \mathbb{E}[S] = 0.0711 + 0.08 = 0.151$ s.

```python
lam = 8.0
S = 0.08
mu = 1.0 / S
rho = lam / mu
Wq = lam * S**2 / (2 * (1 - rho))
W = Wq + S
print(f"ρ={rho:.3f}, Wq={Wq*1000:.1f}ms, W={W*1000:.1f}ms")
```

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---|---|---|
| **Assuming $W = 1/(\mu-\lambda)$ is the queueing delay** | This expression is the *sojourn* time $W$ for $M/M/1$; queueing delay excludes the service time $1/\mu$. | Underestimates latency when reporting “waiting time”. |
| **Treating utilization > 1 as “stable but slow”** | If $\rho\ge1$, the birth‑death chain has no stationary distribution; the queue length diverges to infinity with probability 1. | System will eventually saturate, dropped requests, or unstable OS behavior (e.g., runaway load average). |
| **Ignoring service‑time variability** | The P‑K formula shows $W_q\propto\mathbb{E}[S^2]$; two systems with same $\mu$ but different variance can have wildly different latency. | Over‑provisioning based on mean service time leads to SLA violations. |
| **Using Little’s Law on a non‑stationary interval** | Little’s Law requires ergodicity (time averages = ensemble averages). Applying it during a transient burst yields misleading $L$ or $W$. | Incorrect capacity planning; e.g., using short‑term spikes to size a pool. |
| **Believing adding a server always cuts latency proportionally** | In $M/M/c$, latency improves sharply only while $\rho$ is moderate; once $\rho\ll1$, $W_q\approx0$ and extra servers give diminishing returns. | Wasteful spending on over‑provisioned tiers. |

## Exercises
### Easy
1. Compute $\rho$, $L$, $W$, and $W_q$ for an $M/M/1$ queue with $\lambda=4$ req/s, $\mu=8$ req/s. Verify Little’s Law.
2. For an $M/M/3$ system where each server serves at $\mu=12$ req/s and $\lambda=30$ req/s, find utilization and the probability an arriving job finds all servers busy ($P_{wait}$).

### Medium
3. An $M/G/1$ queue receives Poisson arrivals at $\lambda=6$ req/s. Service time is hyperexponential: with probability 0.7 it takes 0.05 s, with probability 0.3 it takes 0.2 s. Calculate $\rho$, $\mathbb{E}[S]$, $\mathbb{E}[S^2]$, and $W_q$ using the P‑K formula.
4. Derive the waiting‑time distribution tail $P(W_q>t)$ for an $M/M/2$ queue and evaluate it for $t=0.05$s given $\lambda=8$, $\mu=6$.

### Hard
5. Model a Linux CFS run‑queue as an $M/M/1$ with state‑dependent service rate: the effective service rate decreases linearly with the number of runnable tasks, $\mu_n = \mu_0/(1+\alpha n)$. Write the balance equations, solve for $\pi_n$ numerically (e.g., via Python), and plot $L$ vs. arrival rate for $\alpha=0.05$, $\mu_0=100$ tasks/s.
6. Using the `tc` command, create a hierarchical token bucket (HTB) qdisc on `eth0` with a parent rate of 100 Mbps and two child classes: 60 Mbps (ceil 80 Mbps) and 40 Mbps (ceil 60 Mbps). Show how the child classes behave as $M/M/1$ queues under a background UDP traffic generator (`iperf3 -c server -u -b 120M -t 30`). Measure queuing delay with `tc -s qdisc show dev eth0` and relate the observed delay to the theoretical $W_q$ from the M/M/1 formula.

## Linux Connection
### CPU Scheduler (CFS)
* **Structure** – Each CPU maintains a red‑black tree of `struct sched_entity` keyed by `vruntime`. The tree is effectively a *priority queue* where the smallest `vruntime` runs next.
* **Queueing view** – Tasks arrive (wake up) with rate $\lambda$; the scheduler provides service at rate $\mu\approx\frac{1}{\text{timeslice}}$. The virtual runtime ensures *fair* proportional sharing, which can be modeled as a processor‑sharing (PS) queue: $W = \frac{1}{\mu(1-\rho)}$.
* **Tools** –  
  ```bash
  # Per‑CPU runqueue length
  cat /proc/schedstat   # fields: cpuX: running, waiting, ...
  # Current load average (empirical estimate of ρ)
  uptime
  # Per‑task vruntime and wait time
  perf stat -e sched:sched_switch -a sleep 5
  ```
* **Sysctl knobs** – `kernel.sched_min_granularity_ns`, `kernel.sched_wakeup_granularity_ns` affect the effective service rate.

### Block I/O Scheduler
* **Queue** – Each block device has a request queue (`struct request_queue`). The scheduler (e.g., `bfq`, `deadline`, `none`) orders pending `struct request` items.
* **Metrics** –  
  ```bash
  # Average queue size and await time (ms)
  iostat -x 1
  # Per‑device stats from sysfs
  cat /sys/block/sda/queue/nr_requests   # max queue depth
  cat /sys/block/sda/queue/rq_affinity   # skew handling
  ```
* **Model** – The device can be approximated as an $M/G/1$ where service time distribution depends on seek distance and rotational latency; the scheduler shapes the distribution to reduce variance.

### Network Stack (TX/RX Queues & qdiscs)
* **Transmission queue** – Each NIC has a hardware tx ring (`netdev_queue`). The kernel packets first go through a *queueing discipline* (qdisc) like `pfifo_fast`, `htb`, `fq_codel`.
* **Example – measuring queuing delay**  
  ```bash
  # Show current qdisc and stats
  tc -s qdisc show dev eth0
  # Send traffic and observe backlog
  iperf3 -c remote -u -b 150M -t 10 &
  sleep 2
  tc -s qdisc show dev eth0   # look at backlog and delay fields
  kill %1
  ```
* **Model** – The qdisc often implements a *packet‑level* $M/M/1$ or $M/G/1$; `fq_codel` targets a standing queue delay of ~5 ms by adjusting drop probability based on measured sojourn time.

### Memory Reclaim (kswapd)
* **Concept** – When free memory falls below `watermark[low]`, the kswapd daemon scans pages, effectively serving a queue of reclaimable pages with service rate depending on scan speed and I/O latency.
* **Tuning** –  
  ```bash
  sysctl vm.min_free_kbytes
  sysctl vm.vfs_cache_pressure
  ```

These concrete interfaces let you observe the theoretical quantities ($\lambda$, $\mu$, $\rho$, $W_q$) directly on a running system.

## Why This Matters
Queueing theory transforms vague performance intuition into precise, predictive models. By exposing the *why* behind latency growth—non‑linear dependence on utilization, the amplifying role of variability, and the limits imposed by service capacity—you can:

* **Dimension resources** correctly: choose the number of CPU cores, I/O queue depths, or NIC tx rings so that $\rho$ stays in the low‑latency region (e.g., $\rho<0.7$).
* **Diagnose bottlenecks**: a rising run‑queue length in `/proc/schedstat` or increasing `await` in `iostat` directly signals that $\lambda$ approaches $\mu$ for that subsystem.
* **Tune schedulers and qdiscs**: adjusting `kernel.sched_min_granularity_ns` or the `htb` ceil changes the effective service rate $\mu$, moving the operating point on the $W_q(\rho)$ curve.
* **Plan for bursty workloads**: using the P‑K formula you can provision extra service capacity or increase buffer sizes to absorb variance without violating SLA latency targets.
* **Validate changes**: Little’s Law offers a quick sanity check—if measured $L$ and $\lambda$ disagree with expected $W$, either the system is non‑stationary or the model assumptions are violated, prompting deeper investigation.

Mastering these concepts lets you move from reactive “it’s slow” firefighting to proactive, quantitative performance engineering—a skill that separates competent Linux administrators from experts who can guarantee latency‑critical services under load.
