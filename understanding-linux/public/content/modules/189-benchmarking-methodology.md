---
id: 189
title: "Benchmarking methodology"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A benchmark that produces a wrong number is worse than no benchmark at all — it creates false confidence. Without proper warmup, you measure cold-cache behavior on a system that runs hot in production. Without noise isolation, your results encode the behavior of unrelated background processes. Without understanding measurement error, you report a 3% performance improvement that is entirely within the noise floor of your instrument.

The core problem: computers are not deterministic. A modern x86 core runs the same instruction stream at different speeds depending on thermal state, branch predictor history, cache contents, NUMA topology, and whether a firmware SMI fired 200 µs ago. Benchmarking methodology is the discipline of controlling or accounting for all of that so your number reflects your code, not your environment.

---

## Core Concepts

### Warmup

Modern systems have multiple layers of state that affect performance: CPU branch predictors, L1/L2/L3 caches, the page cache, JIT compilation caches, memory allocator freelists. When a workload first starts, these are cold and measured latency is higher than steady-state latency. If your benchmark measures this transient, you are benchmarking initialization, not operation.

**Why:** An L1 hit costs ~4 cycles. A main-memory miss costs 200–300 cycles — a 50–75× penalty. At workload start, the working set hasn't been loaded yet; every access faults to DRAM. After sufficient iterations, the hot working set fits in L2/L3 and stays there. The performance regime you care about is the second one. The first is a one-time artifact of startup.

Branch predictor state matters too: the CPU's indirect branch predictor (IBP) and return stack buffer (RSB) need hundreds of branch observations to converge. A loop that branches one way in warmup and another in steady state will produce inflated misprediction counts if you start measuring immediately.

### Noise and Variance

Variance sources that are not your workload:

- **OS scheduler preemption**: time slices are 1–4 ms on a PREEMPT kernel. A single context switch mid-measurement on a 500 µs operation doubles its measured latency.
- **SMI (System Management Interrupts)**: firmware-level interrupts that halt all CPU cores for 10–100 µs. They are invisible to the OS and cannot be masked in ring 3.
- **Memory bandwidth contention**: another process doing DMA or large memcpy saturates the memory bus and adds latency to your cache misses.
- **Thermal throttling**: when a core exceeds its TDP envelope, `intel_pstate` or `amd-pstate` drops the P-state, reducing clock frequency mid-run.
- **Timer interrupt coalescing**: the kernel batches timer interrupts (`CONFIG_HZ` is typically 250 or 1000). Wakeup latency measurements are quantized to $1/\text{HZ}$ seconds unless you use high-resolution timers.

### Isolation

Isolation means removing or controlling extraneous variables. Without it, your benchmark measures a system, not a component. Isolation targets:

- Other processes competing for CPU, LLC (last-level cache), and memory bandwidth
- IRQ affinity (network and storage interrupts landing on the benchmark CPU)
- CPU frequency scaling via the `cpufreq` subsystem
- Hyperthreading siblings sharing execution ports and L1/L2 with your thread
- NUMA: memory allocated on a remote node has higher access latency ($\approx 2\times$ on a two-socket system)

### Representative Workloads

A microbenchmark measuring a hash function in a tight loop will show peak throughput but miss: cache pressure from the real working set, lock contention at real concurrency levels, and branch misprediction from realistic input distributions. The result is precise but answers a different question than you think.

Macrobenchmarks (production traffic replay) answer the right question but are hard to control: you cannot hold concurrency, data size, or access pattern constant across runs. The practical approach is to use microbenchmarks to isolate hypotheses and macrobenchmarks to validate them.

### Measurement Error

Every measurement instrument has error characteristics:

- **Clock resolution**: `CLOCK_MONOTONIC` on most x86 hardware has ~1 ns resolution (TSC-based), but on some ARM platforms it is coarser.
- **Clock overhead**: calling `clock_gettime(2)` itself takes ~20–40 ns via the vDSO path. If you wrap single nanosecond-scale operations, you are measuring the clock, not the operation. The minimum measurable duration is roughly $t_{\min} \approx 10 \times t_{\text{clock}}$.
- **Systematic bias under frequency scaling**: TSC increments at a fixed rate (the nominal max frequency on modern CPUs), but if you use `CLOCK_PROCESS_CPUTIME_ID` and the CPU is throttled, wall time and CPU time diverge in ways that are hard to reason about.

---

## How It Works

### Warmup: Detecting Steady State Programmatically

Run the benchmark in a loop and compute a rolling mean. Let $t_i$ be the latency of iteration $i$, and $\mu_k$ the mean over window $k$ of width $w$:

$$\mu_k = \frac{1}{w} \sum_{i=kw}^{(k+1)w - 1} t_i$$

Warmup ends when the relative change between consecutive windows falls below threshold $\epsilon$:

$$\left| \frac{\mu_k - \mu_{k-1}}{\mu_{k-1}} \right| < \epsilon$$

A typical $\epsilon = 0.01$ (1%). Choose $w$ large enough to smooth per-iteration noise — 100–1000 iterations for sub-millisecond operations. For JIT-compiled runtimes (JVM, V8), warmup may require tens of thousands of iterations before the JIT reaches its final compilation tier.

A minimal C implementation:

```c
#include <time.h>
#include <math.h>
#include <stdbool.h>

#define WINDOW 200
#define EPSILON 0.01

static double now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC_RAW, &ts);
    return ts.tv_sec * 1e9 + ts.tv_nsec;
}

bool warmup_complete(double *window_a, double *window_b, int w) {
    double mu_prev = 0, mu_curr = 0;
    for (int i = 0; i < w; i++) {
        mu_prev += window_a[i];
        mu_curr += window_b[i];
    }
    mu_prev /= w;
    mu_curr /= w;
    return fabs((mu_curr - mu_prev) / mu_prev) < EPSILON;
}
```

### Quantifying Noise: Statistics That Matter

Do not report only the mean. Latency distributions are right-skewed — outliers from scheduler preemption or SMIs inflate the mean without affecting the median. Report:

| Statistic | What It Tells You |
|---|---|
| p50 (median) | Typical operation cost |
| p99 | Near-worst case; what 1 in 100 requests experiences |
| p99.9 | Tail latency; critical for services with fan-out |
| $\sigma / \mu$ (CV) | Relative noise level; > 0.1 means high variance |

The coefficient of variation $CV = \sigma / \mu$ quantifies how noisy your measurement environment is, independent of scale. If $CV > 0.1$, improve isolation before adding more samples — more samples of a noisy process just give you a more precise measurement of the noise.

To detect a true performance difference $\delta$ with significance $\alpha$ and power $1 - \beta$, the required sample count is:

$$n \approx \frac{2\sigma^2 \left(z_{\alpha/2} + z_\beta\right)^2}{\delta^2}$$

For $\alpha = 0.05$, $\beta = 0.20$ (80% power), $z_{\alpha/2} = 1.96$, $z_\beta = 0.84$:

$$n \approx \frac{2\sigma^2 \cdot (2.80)^2}{\delta^2} \approx \frac{15.7 \,\sigma^2}{\delta^2}$$

If your operation has $\sigma = 50\,\text{ns}$ and you want to detect a $\delta = 10\,\text{ns}$ difference, you need $n \approx 393$ samples per configuration. If $\sigma = 500\,\text{ns}$ (high noise), you need $n \approx 39{,}300$.

Collect latency samples into a sorted array and compute percentiles directly:

```c
#include <stdlib.h>
#include <stddef.h>

static int cmp_double(const void *a, const void *b) {
    double x = *(double *)a, y = *(double *)b;
    return (x > y) - (x < y);
}

double percentile(double *samples, size_t n, double p) {
    // samples must be sorted before calling
    // p in [0, 1]
    qsort(samples, n, sizeof(double), cmp_double);
    size_t idx = (size_t)(p * (n - 1));
    return samples[idx];
}
```

### Measurement Overhead

Instrumentation tools have wildly different overhead profiles:

- **`strace`**: uses `ptrace(2)`, which injects a `SIGSTOP`/`SIGCONT` pair around every syscall. The process context-switches to the tracer and back on every traced call. Overhead is 50–100× on syscall-heavy workloads. Never use `strace` to benchmark; use it to understand syscall patterns, then benchmark clean.
- **`perf stat`**: programs hardware performance counters (PMCs) via the `perf_event_open(2)` syscall. The PMCs increment in hardware with no software intervention per event. Overhead is typically < 1% for counting modes. For sampling (`perf record`), overhead scales with sample rate — at 10 kHz it is
