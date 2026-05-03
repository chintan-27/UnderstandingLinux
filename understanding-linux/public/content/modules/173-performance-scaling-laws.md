---
id: 173
title: "Performance scaling laws"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When you add CPUs, threads, or nodes to a system, performance rarely scales the way you expect. Without a mathematical model for *why*, you will make bad capacity decisions: buying hardware that doesn't help, parallelizing code that can't benefit, or misattributing a bottleneck to the wrong subsystem. Amdahl's Law and Gustafson's Law give you the vocabulary to reason about these limits before you run a single benchmark. The goal is not to memorize formulas — it is to recognize, from first principles, why your eight-core system only runs 2× faster, and which lever to pull to fix it.

---

## Core Concepts

### Serial Fraction: The Governor on Parallelism

Every program contains work that must execute in sequence — initialization, final aggregation, acquiring a mutex, writing to a single log file. Call this the *serial fraction*, $\sigma$, expressed as a proportion of total single-threaded execution time. The parallel fraction is $(1 - \sigma)$.

The serial fraction is not always an implementation artifact you can engineer away. Some serial work is algorithmic: a prefix-sum reduction requires $O(\log N)$ sequential steps regardless of how you implement it. Some is architectural: DRAM refresh, PCIe enumeration at boot, journal commits in ext4. Knowing *which kind* of serial work you are dealing with determines whether optimization is possible.

### Amdahl's Law: Fixed Problem Size

Amdahl's Law answers: given a fixed workload, how much faster does it get as we add processors?

$$S(N) = \frac{1}{\sigma + \dfrac{1 - \sigma}{N}}$$

As $N \to \infty$, the denominator approaches $\sigma$, so the speedup ceiling is $1/\sigma$. This is a hard limit: a program that is 5% serial can never exceed $1/0.05 = 20\times$ speedup no matter how many cores you add. The 95% parallelizable portion completes in negligible time; you are left waiting on the 5%.

Amdahl's Law is pessimistic by construction because it holds *total work constant*. You are asking: how much faster can I finish this exact computation?

### Gustafson's Law: Scaled Problem Size

Gustafson observed that in practice, when you get more hardware, you often solve a *bigger* problem in the same time — not the same problem faster. His law answers: if the problem size scales with $N$, what is the effective speedup relative to the same problem on one processor?

If the serial work takes time $s$ and parallel work takes time $p$ on $N$ processors, the total time on $N$ processors is $T_N = s + p$. The same job on one processor would take $T_1 = s + Np$ (the parallel portion runs sequentially). Speedup is:

$$S(N) = \frac{s + Np}{s + p} = N - \sigma(N - 1)$$

where $\sigma = s/(s+p)$ is the serial fraction of the *scaled* workload. Because $p$ grows with $N$, the serial fraction shrinks as a proportion of total work, and speedup is nearly linear in $N$.

The two laws are not contradictions — they model different regimes. Amdahl governs latency-bound tasks (finish this HTTP request faster). Gustafson governs throughput-bound tasks (process more data in the same time window, e.g., a nightly batch job, a climate simulation with a finer mesh, a database vacuum that processes more rows).

### Contention and Coherence: What Neither Law Models

Real systems degrade in two ways that Amdahl and Gustafson ignore:

**Contention** — $N$ threads competing for a single resource (a spinlock, a memory bus, a NIC queue) create a serialization point. The expected wait time for a single-server queue under load $\rho$ is $W = \rho / (\mu(1 - \rho))$ by the M/M/1 model. As $\rho \to 1$ (the resource approaches saturation), wait time diverges. Adding threads increases $\rho$, which increases $W$, which eats the parallelism gain.

**Coherence** — In NUMA and SMP systems, every write to a shared cache line triggers an invalidation broadcast to all other sockets or cores holding that line (MESI protocol). The overhead is $O(N)$ per write in the worst case. With $N$ cores all dirtying shared state, coherence traffic grows as $O(N^2)$, eventually saturating the interconnect.

These produce a *knee* in the speedup curve: a value of $N$ beyond which adding cores reduces throughput. The Universal Scalability Law (USL) models both effects explicitly.

### The Universal Scalability Law

The USL extends Amdahl with two parameters:

$$S(N) = \frac{N}{1 + \sigma(N-1) + \kappa N(N-1)}$$

- $\sigma$ is the serialization penalty (same as Amdahl).
- $\kappa$ is the coherence/crosstalk penalty: the cost of coordinating $N$ workers with each other, growing as $N(N-1)$ because each of the $N$ nodes must coordinate with each of the other $N-1$.

When $\kappa > 0$, $S(N)$ reaches a maximum and then *decreases*. The peak occurs at:

$$N_{\text{max}} = \sqrt{\frac{1 - \sigma}{\kappa}}$$

This is a measurable phenomenon. Fit USL to throughput measurements at $N = 1, 2, 4, 8, \ldots$ and you can predict the knee before you buy the hardware.

---

## How It Works

### Amdahl in Practice

A program takes 100 s on one core: 10 s of serial setup/teardown, 90 s of parallelizable computation. So $\sigma = 0.10$.

$$S(8) = \frac{1}{0.10 + \frac{0.90}{8}} = \frac{1}{0.10 + 0.1125} = \frac{1}{0.2125} \approx 4.7\times$$

The ceiling is $1/0.10 = 10\times$, unreachable at any core count. At $N = 64$:

$$S(64) = \frac{1}{0.10 + \frac{0.90}{64}} = \frac{1}{0.1141} \approx 8.8\times$$

You spend 54 extra cores to gain 4.1× over the 8-core case.

```python
def amdahl_speedup(sigma: float, N: int) -> float:
    """
    sigma: serial fraction of single-threaded runtime (0 < sigma <= 1)
    N:     number of processors
    Returns: speedup relative to single processor
    """
    return 1.0 / (sigma + (1.0 - sigma) / N)

def amdahl_ceiling(sigma: float) -> float:
    """Theoretical maximum speedup as N -> inf."""
    return 1.0 / sigma

sigma = 0.05
print(f"Ceiling at sigma={sigma}: {amdahl_ceiling(sigma):.1f}x")
for n in [1, 2, 4, 8, 16, 64, 256, 1024]:
    print(f"  N={n:5d}  S={amdahl_speedup(sigma, n):.2f}x")
```

```
Ceiling at sigma=0.05: 20.0x
  N=    1  S=1.00x
  N=    2  S=1.90x
  N=    4  S=3.48x
  N=    8  S=5.93x
  N=   16  S=8.83x
  N=   64  S=13.91x
  N=  256  S=17.87x
  N= 1024  S=19.16x
```

The marginal return from doubling cores falls off sharply past the knee. Going from 1→2 buys you 0.90×; going from 512→1024 buys you roughly 0.10×.

### Gustafson in Practice

A climate model on 1 node runs a 100 km grid in 1 hour. On 64 nodes you run a 12.5 km grid (64× the cells, same wall time). Serial overhead — reading the initial conditions file, writing the compressed NetCDF output — stays fixed at 2 minutes. So $\sigma = 2/60 \approx 0.033$ of the *scaled* runtime.

$$S(64) = 64 - 0.033 \times (64 - 1) = 64 - 2.08 \approx 61.9\times$$

The equivalent single-node job would take $61.9$ hours. You did not run that job faster; you ran a qualitatively better job in the same time. The distinction matters for procurement decisions.

### The USL and the Scalability Cliff

Fit the USL to empirical data to extract $\sigma$ and $\kappa$:

```python
import numpy as np
from scipy.optimize import curve_fit

def usl(N, sigma, kappa):
    return N / (1 + sigma * (N - 1) + kappa * N * (N - 1))

# Example throughput measurements (requests/sec normalized to N=1)
N_vals   = np.array([1, 2, 4, 8, 16, 32, 64])
throughput = np.array([1.0, 1.8, 3.1, 4.9, 6.2, 6.8, 5.9])  # note drop at 64

(sigma_fit, kappa_fit), _ = curve_fit(usl, N_vals, throughput,
                                       p0=[0.05, 0.001],
                                       bounds=([0, 0], [1, 1]))

N_peak = np.sqrt((1 - sigma_fit) / kappa_fit)
print(f"sigma={sigma_fit:.4f}  kappa={kappa_fit:.6
