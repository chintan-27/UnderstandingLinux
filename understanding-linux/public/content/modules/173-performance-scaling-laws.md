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

## Core Concepts  
Performance scaling laws quantify how the execution time of a workload changes when computational resources (cores, threads, sockets) are increased.  
The starting point is a simple decomposition of the serial execution time \(T_1\) into a *serial* portion that cannot be parallelised (\(T_s\)) and a *parallel* portion that can be divided among \(N\) processing elements (\(T_p\)):  

\[
T_1 = T_s + T_p
\]

Assuming ideal parallel execution (zero overhead, perfect load balance) the parallel portion scales as \(T_p/N\). The execution time on \(N\) processors is therefore  

\[
T(N) = T_s + \frac{T_p}{N}
\]

*Speedup* \(S(N)\) is the ratio of the baseline time to the parallel time:  

\[
S(N) = \frac{T_1}{T(N)} = \frac{T_s + T_p}{T_s + \frac{T_p}{N}}
\]

Introducing the *parallel fraction*  

\[
P = \frac{T_p}{T_s+T_p}\qquad\text{(so }1-P = \frac{T_s}{T_s+T_p}\text{)}
\]

and normalising \(T_1=1\) yields the classic forms below.

### Amdahl’s Law (fixed workload)  
If the problem size stays constant, only the parallel part can be shrunk by adding processors. Substituting the definitions above:

\[
\begin{aligned}
S_{\text{Amdahl}}(N) 
&= \frac{1}{(1-P) + \frac{P}{N}} \\
&= \frac{1}{\text{serial fraction} + \frac{\text{parallel fraction}}{N}}
\end{aligned}
\]

*Why it matters*: as \(N\to\infty\), the term \(\frac{P}{N}\to0\) and the speedup asymptotically approaches \(\frac{1}{1-P}\). No matter how many cores you add, the serial fraction caps the gain.

### Gustafson’s Law (scaled workload)  
Gustafson observed that in practice we increase the problem size to keep the parallel portion busy. Let the *scaled* parallel work be \(P' = P\cdot N\) (i.e., we do \(N\) times more parallel work while keeping the serial work unchanged). The parallel time on \(N\) processors becomes  

\[
T_{\text{scaled}}(N) = T_s + \frac{P\cdot T_1}{N}=T_s + P
\]

Normalising again to \(T_1=1\) gives  

\[
\begin{aligned}
S_{\text{Gustafson}}(N) 
&= \frac{T_s + P\cdot N}{T_s + P} \\
&= N \cdot \frac{P}{(1-P) + \frac{P}{N}}
\end{aligned}
\]

*Why it matters*: when the workload grows with \(N\), the serial fraction becomes a smaller *percentage* of the total work, allowing speedup that scales roughly linearly with \(N\).

---

## How It Works  
The two laws arise from two different *assumptions* about what is held constant when we vary \(N\).

| Assumption | Amdahl | Gustafson |
|------------|--------|-----------|
| **Problem size** | Fixed (same absolute work) | Scales linearly with \(N\) (more work) |
| **Serial work** | Constant absolute time | Constant absolute time (but becomes smaller fraction) |
| **Parallel work** | Divided evenly among cores | Increased proportionally to keep each core busy |

### Derivation details  

1. **Start from the time model**  
   \[
   T(N) = T_s + \frac{T_p}{N} + \underbrace{O_{\text{comm}}(N)}_{\text{optional overhead}}
   \]
   For the pure laws we set \(O_{\text{comm}}=0\).

2. **Amdahl** – keep \(T_1 = T_s+T_p\) constant.  
   Divide numerator and denominator by \(T_1\) and substitute \(P = T_p/T_1\) to obtain the formula above.

3. **Gustafson** – keep *parallel* time per processor constant:  
   \[
   \frac{T_p}{N} = \text{constant} \;\Longrightarrow\; T_p = P\cdot T_1 \cdot N
   \]
   Plug this into \(T(N) = T_s + T_p/N\) and simplify.

4. **Including overhead** (real‑world refinement)  
   A common additive model is  
   \[
   O_{\text{comm}}(N) = \alpha + \beta\,(N-1)
   \]
   where \(\alpha\) is latency (fixed cost per sync) and \(\beta\) is per‑byte transfer cost scaled by message size.  
   The speedup then becomes  
   \[
   S(N) = \frac{T_s+T_p}{T_s + \frac{T_p}{N} + \alpha + \beta(N-1)}
   \]
   This expression shows why adding cores beyond a certain point can *decrease* speedup.

---

## Worked Examples  

### Example 1 – Amdahl’s Law (fixed problem)  
A rendering pipeline has 75 % parallelisable code (\(P=0.75\)) and runs in 20 s on a single core.  
Compute the speedup on 8 cores and the new wall‑clock time.

**Solution**  

\[
\begin{aligned}
S_{\text{Amdahl}}(8) &= \frac{1}{(1-0.75) + \frac{0.75}{8}} \\
&= \frac{1}{0.25 + 0.09375} = \frac{1}{0.34375} \approx 2.91
\end{aligned}
\]

Parallel time:  

\[
T(8) = \frac{T_1}{S}= \frac{20\text{ s}}{2.91}\approx 6.87\text{ s}
\]

*Interpretation*: Even with eight cores the serial 25 % caps the gain at ~2.9×.

---

### Example 2 – Gustafson’s Law (scaled problem)  
A climate model spends 20 % of its time in serial I/O (\(1-P=0.20\)).  
We run it on 16 cores and increase the grid resolution so that the *parallel* work per core stays the same as the original single‑core run.

**Solution**  

\[
\begin{aligned}
S_{\text{Gustafson}}(16) 
&= 16 \times \frac{0.80}{0.20 + \frac{0.80}{16}} \\
&= 16 \times \frac{0.80}{0.20 + 0.05} = 16 \times \frac{0.80}{0.25} \\
&= 16 \times 3.2 = 51.2
\end{aligned}
\]

If the original run took 100 s, the scaled run would finish in  

\[
T_{\text{scaled}} = \frac{T_1 \times (1-P + P)}{S}= \frac{100\text{ s}}{51.2}\approx 1.95\text{ s}
\]

*Interpretation*: By enlarging the problem we keep each core busy, yielding ~51× speedup.

---

### Example 3 – Including Communication Overhead  
Suppose a parallel FFT library has \(P=0.90\), \(\alpha = 0.005\) s (barrier latency) and \(\beta = 0.0002\) s per core (cost of exchanging halo data).  
Calculate speedup on 4, 16, and 64 cores.

**Solution** (using the overhead model)

\[
S(N)=\frac{1}{(1-P)+\frac{P}{N}+\alpha+\beta(N-1)}
\]

| \(N\) | Denominator | \(S(N)\) |
|------|-------------|----------|
| 4    | \(0.1 + 0.225 + 0.005 + 0.0002\times3 = 0.3356\) | \(2.98\) |
| 16   | \(0.1 + 0.05625 + 0.005 + 0.0002\times15 = 0.16925\) | \(5.91\) |
| 64   | \(0.1 + 0.0140625 + 0.005 + 0.0002\times63 = 0.1330625\) | \(7.52\) |

*Interpretation*: Beyond ~16 cores the latency and per‑core exchange cost dominate, limiting returns.

---

## Common Mistakes  

| # | Mistake | Why it’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | Treating \(P\) as a *percentage* (e.g., using 90 instead of 0.90) in the formulas | The derivation assumes a *fraction* of total time; inserting 90 inflates the denominator by a factor of 100 | Speedup values become nonsensical (often < 1) |
| 2 | Assuming Amdahl’s law predicts *linear* scaling when \(P\approx 1\) | Even with \(P=0.99\), the asymptote is \(1/(1-P)=100\); you never exceed that no matter how many cores | Over‑optimistic capacity planning, leading to under‑provisioned systems |
| 3 | Applying Gustafson’s law when the problem size cannot be increased (e.g., fixed‑size database query) | Gustafson’s premise is that you scale the work; if you cannot, the serial fraction stays the same proportionally, and Amdahl is the correct bound | Misleading speedup expectations, wasted effort on adding cores |
| 4 | Ignoring *load imbalance* and treating all cores as equally busy | The model assumes perfect division of \(T_p\); real static scheduling can leave some cores idle while others finish | Measured speedup lower than predicted; need dynamic scheduling or work‑stealing |
| 5 | Using wall‑clock time from `time` command without separating *user* vs *sys* time | Parallel programs may spend extra time in kernel synchronization (futexes, etc.) that appears as sys time, skewing the perceived speedup | Incorrect attribution of overhead to the application algorithm |
| 6 | Forgetting to pin threads/cores, letting the scheduler migrate tasks | Migration incurs cache‑invalidations and extra latency, effectively increasing \(\alpha\) in the overhead model | Observed speedup degrades with core count, especially on NUMA machines |
| 7 | Assuming \(N\) equals the number of *logical* processors (hyper‑threads) without checking sharing of execution resources | Hyper‑threads share pipelines, caches, and bandwidth; the effective \(N\) for compute‑bound work is lower | Overestimation of speedup for HT‑enabled CPUs |

---

## Exercises  

### Easy  
1. A program has 60 % parallelisable code. Using Amdahl’s law, compute the theoretical speedup on 4 and 32 cores.  
2. For the same program, use Gustafson’s law to find the speedup on 4 and 32 cores assuming the workload scales with core count.

### Medium  
3. Derive the number of cores \(N\) required to achieve at least 8× speedup with Amdahl’s law when \(P=0.85\). Show the algebraic steps.  
4. A parallel application measures a speedup of 5.2 on 8 cores. Assuming Amdahl’s law holds, estimate the parallel fraction \(P\).  

### Hard  
5. Extend the speedup model to include a latency term \(\alpha = 0.001\) s and a per‑core bandwidth term \(\beta = 0.00005\) s. For \(P=0.92\), determine the core count \(N\) that maximises speedup (treat \(N\) as continuous, differentiate, solve for \(N\)).  
6. Write a single C program that (a) measures the execution time of a user‑defined workload with `clock_gettime(CLOCK_MONOTONIC, …)`, (b) varies the number of OpenMP threads from 1 to the number of hardware cores, (c) prints the observed speedup, and (d) compares it to the Amdahl prediction using the measured serial fraction from the 1‑thread run.  

---

## Linux Connection  

Linux provides explicit interfaces to control and observe the resources that the scaling laws model.

### Core affinity & placement  

```c
#define _GNU_SOURCE
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    cpu_set_t set;
    CPU_ZERO(&set);
    /* bind to cores 0-3 */
    for (int i = 0; i < 4; ++i) CPU_SET(i, &set);
    if (sched_setaffinity(0, sizeof(set), &set) == -1) {
        perror("sched_setaffinity");
        exit(EXIT_FAILURE);
    }
    /* now do parallel work … */
    return 0;
}
```

*Why*: Prevents the scheduler from migrating threads, removing a source of variability in the effective \(N\) and keeping cache hierarchy stable.

### Shell‑level affinity  

```bash
# Run ./app on cores 4-7 only
taskset -c 4-7 ./app

# Verify placement
ps -o pid,taskset -p $(pgrep -f ./app)
```

### Memory policy (NUMA)  

```bash
# Allocate memory on node 0 and run on node 0 CPUs
numactl --cpunodebind=0 --membind=0 ./app
```

Inspect NUMA statistics:

```bash
numastat -p $(pgrep -f ./app)
```

### Measuring parallel overhead  

`perf` can capture barrier latency and context‑switch costs:

```bash
# Count synchronization events (futexes) and cycles
perf stat -e futex,context-switches,cycles,instructions ./app
```

The `futex` count gives a proxy for \(\alpha\); dividing total futex time by the number of cores yields an estimate of per‑core latency.

### OpenMP affinity  

```bash
export OMP_NUM_THREADS=16
export KMP_AFFINITY=granularity=fine,compact,1,0
./omp_app
```

`KMP_AFFINITY` controls how OpenMP maps threads to cores, directly influencing the effective \(N\) in the scaling equations.

### MPI rank placement  

```bash
# Spread ranks evenly across two sockets
mpirun -np 24 --bind-to core --map-by socket ./mpi_app
```

`--map-by` and `--bind-to` let you enforce the *processor count* \(N\) used in the formulas.

### Verifying the model  

A quick script to collect speedup vs. core count and fit Amdahl’s law:

```bash
#!/usr/bin/env bash
MAX_CORES=$(nproc)
for n in $(seq 1 $MAX_CORES); do
    export OMP_NUM_THREADS=$n
    /usr/bin/time -f "%e" ./omp_app 2>time_$n.txt
done
paste -d, <(seq 1 $MAX_CORES) <(cat time_*.txt) > speedup.csv
# Now fit S = 1/((1-P)+P/n) using e.g. Python's scipy.optimize.curve_fit
```

The resulting fit yields an empirical \(P\) that can be compared to the theoretical fraction obtained from profiling (`perf record -g ./omp_app`).

---

## Why This Matters  

Performance scaling laws are not abstract formulae; they are the *first‑principles* lens through which we judge whether adding more silicon will actually improve a workload’s execution time.  

- **Amdahl’s law** tells us the *hard ceiling* imposed by any serial fraction—whether it be a legacy library call, a global lock, or a sequential I/O stage. Knowing that ceiling guides engineering effort: attack the serial part (e.g., lock‑free algorithms, asynchronous I/O) rather than blindly throwing cores at the problem.  
- **Gustafson’s law** shifts the focus to *problem scaling*: in many HPC and data‑analytics contexts we can increase resolution, ensemble size, or batch length to keep each core busy. Recognising when this is possible lets us size clusters and allocate budgets effectively.  
- **Communication‑overhead extensions** expose the hidden cost of moving data between cores or sockets. On modern NUMA machines the latency term \(\alpha\) and per‑byte term \(\beta\) often dominate beyond a modest core count, explaining why simply enabling Hyper‑Threading can sometimes *decrease* throughput.  
- **Linux‑specific tooling** (taskset, numactl, perf, OpenMP/MPI affinity settings) gives us the knobs to realise the assumptions of the models—fixing core placement, controlling memory locality, and measuring the very quantities (serial fraction, barrier latency, synchronization events) that appear in the equations.  

By internalising these laws, a developer moves from “adding more cores makes it faster” to a disciplined process:  

1. **Profile** to measure \(T_s\) and \(T_p\) (or directly obtain \(P\)).  
2. **Choose** the appropriate scaling model (fixed vs. scaled workload).  
3. **Predict** speedup for a target core count, including overhead terms.  
4. **Validate** with actual runs and affinity‑controlled experiments.  
5. **Iterate**—reduce \(T_s\), improve data locality, or redesign the algorithm to shift work into the parallel domain.  

This loop is the essence of high‑performance software engineering on Linux, and it rests squarely on the solid mathematical foundation laid out by Amdahl and Gustafson.
