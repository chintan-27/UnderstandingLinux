---
id: 212
title: "Continuous integration"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A benchmark that produces different numbers across runs tells you nothing about the system under test — it tells you about the conditions of the run. CI exists to make those conditions invariant, so that a measured delta between two commits is attributable to the code change and nothing else. Without it, regressions accumulate invisibly: a change to the memory allocator degrades disk I/O throughput because it alters how the page cache competes with application heap; a scheduler tweak inflates TCP connection latency because `SO_REUSEPORT` hashing now lands connections on a cold CPU. Nobody notices until a user reports it. The automated pipeline closes the gap between "it worked when I wrote it" and "it works at every commit, on every target, with evidence."

---

## Core Concepts

### Reproducibility

A measurement is reproducible if, given the same inputs and environment, it produces the same output within a known tolerance. The tolerance is not zero — it is a bound on variance that you have characterized and accepted.

Sources of non-determinism on Linux that directly corrupt timing measurements:

| Source | Mechanism | Mitigation |
|---|---|---|
| CPU frequency scaling | `cpufreq` driver changes clock rate under thermal/power policy | Set governor to `performance` |
| NUMA topology | Memory accesses crossing a QPI/UPI link add ~40–80 ns latency | Pin process and memory to one NUMA node with `numactl` |
| Kernel timer interrupts | `CONFIG_HZ` (typically 250 or 1000) fires `do_timer()` on whichever CPU happens to be running | Isolate the benchmark CPU with `isolcpus=` kernel parameter |
| Page cache state | First-run reads hit disk; subsequent runs hit cache | `echo 3 > /proc/sys/vm/drop_caches` before each run, or pre-warm deliberately |
| ASLR | Stack, heap, and mmap base addresses change each execution, altering cache line aliasing patterns | `echo 0 > /proc/sys/kernel/randomize_va_space` for benchmarking |
| JIT warmup | JVM, V8, or eBPF JIT produce different code paths before steady state | Discard the first $N$ iterations as warmup |

Reproducibility does not require eliminating all variance. It requires that $\sigma$ — the standard deviation of your measurement — is small enough that a regression of the size you care about is detectable.

### Automation

The value of automation is not speed — it is that the pipeline executes identical steps in identical order on every trigger. A human running tests manually introduces selection bias (which tests? which commit?), procedural drift (the steps change subtly over time without being recorded), and temporal bias (tests only run when something already looks broken). An automated pipeline produces a time-indexed record: every commit has a corresponding artifact, so you can bisect a regression to the exact change that introduced it.

### Artifact Pipelines

An artifact is any output of a build or test step preserved for later analysis: a compiled binary, a `perf.data` file, a latency histogram, a flame graph SVG. The artifact pipeline is the DAG of steps that transforms source code into those outputs. Each step must be deterministic given its inputs, and the pipeline definition must be version-controlled alongside the code. If the pipeline changes without explanation, measurements before and after the change are not comparable — the baseline has silently shifted.

---

## How It Works

### The Pipeline as a Directed Acyclic Graph

A CI pipeline is a DAG where each node is a step and edges represent data dependencies:

```
source code → [build] → binary
                            ↓
               [instrument] → instrumented binary
                                      ↓
                         [run under load] → raw traces
                                                ↓
                                     [aggregate] → metrics
                                                      ↓
                                          [compare to baseline] → pass/fail
```

If any node is non-deterministic, every downstream node inherits that non-determinism. This is why fixing kernel parameters and controlling CPU state are prerequisites, not polish.

### Controlling Variance

The variance in a timing measurement has two components: systematic error (bias) and random error (noise). For CI to detect a regression, the signal must exceed the noise floor. Let $\mu_{\text{before}}$ and $\mu_{\text{after}}$ be the mean latency before and after a change, and let $\sigma$ be the pooled standard deviation of the measurement distribution. A regression is detectable when:

$$\frac{|\mu_{\text{after}} - \mu_{\text{before}}|}{\sigma} > \theta$$

where $\theta$ is your detection threshold. At $\theta = 2$, you accept a ~5% false-positive rate under a normal noise model; at $\theta = 3$, ~0.3%. If $\sigma$ is large relative to the regression you care about, you will miss it. Every environmental control below directly reduces $\sigma$.

```bash
# Fix CPU governor to prevent frequency scaling during the run
for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    echo performance | sudo tee "$gov" > /dev/null
done

# Disable ASLR for the duration of benchmarking
echo 0 | sudo tee /proc/sys/kernel/randomize_va_space

# Disable turbo boost (Intel) — turbo adds variance because
# the CPU can only sustain turbo for short bursts before throttling
echo 1 | sudo tee /sys/devices/system/cpu/intel_pstate/no_turbo

# Drop page cache, dentries, and inodes so cache state is known
echo 3 | sudo tee /proc/sys/vm/drop_caches

# Pin to CPU 2 and disable NUMA cross-node allocation
numactl --cpunodebind=0 --membind=0 taskset -c 2 ./my_benchmark
```

Why CPU 2 rather than CPU 0? On most systems, CPU 0 handles IRQs by default. Pinning to CPU 2 avoids interrupt storms from network or storage I/O contaminating your benchmark's scheduler timeslice.

To verify that frequency scaling is actually suppressed during a run:

```bash
# Read the current operating frequency of CPU 2 while benchmark runs
watch -n 0.1 cat /sys/devices/system/cpu/cpu2/cpufreq/scaling_cur_freq
```

### Artifact Collection with perf

The canonical CI artifact for Linux performance work is a `perf.data` file — a binary record of PMU (Performance Monitoring Unit) samples captured by the kernel's `perf_events` subsystem via the `perf_event_open(2)` syscall. The file records instruction pointer, call chain, and hardware event counts at each sample point.

```bash
# Record CPU cycles at 99 Hz with call graphs, pinned to CPU 2
# 99 Hz avoids harmonic resonance with 100 Hz kernel timer ticks
sudo perf record -F 99 -g --cpu 2 -o artifacts/perf.data -- \
    taskset -c 2 ./my_benchmark --iterations 100000

# Annotated report: shows hottest functions with source/asm interleave
sudo perf report -i artifacts/perf.data --stdio > artifacts/perf_report.txt

# Record specific hardware events: cache misses and branch mispredictions
sudo perf stat -e cycles,instructions,cache-misses,branch-misses \
    -o artifacts/perf_stat.txt -- taskset -c 2 ./my_benchmark

# Generate flame graph (Brendan Gregg's scripts)
sudo perf script -i artifacts/perf.data \
    | stackcollapse-perf.pl \
    | flamegraph.pl > artifacts/flamegraph.svg
```

The flame graph SVG is a CI artifact: a visual record of CPU time distribution, comparable across commits. A new wide tower appearing in the graph is a regression — a call path consuming proportionally more cycles than before. `perf diff` can quantify this directly:

```bash
# Compare two perf.data files — shows functions that regressed or improved
sudo perf diff baseline/perf.data artifacts/perf.data
```

For memory allocation profiling, replace `perf record` with `valgrind --tool=massif` or use `perf mem record` to capture memory access patterns:

```bash
# Record memory load/store samples to identify NUMA or cache effects
sudo perf mem record -o artifacts/perf_mem.data -- taskset -c 2 ./my_benchmark
sudo perf mem report -i artifacts/perf_mem.data --stdio > artifacts/mem_report.txt
```

### Measuring What Matters: Latency Distribution

Do not summarize benchmark results with the mean alone. The mean is dominated by the common case; the tail is where real workloads fail. Collect the full latency distribution and extract percentiles. If your benchmark emits timestamps, compute percentiles from the raw data:

```python
import numpy as np

samples = np.loadtxt("artifacts/latencies_us.txt")

metrics = {
    "latency_p50_us":  float(np.percentile(samples, 50)),
    "latency_p95_us":  float(np.percentile(samples, 95)),
    "latency_p99_us":  float(np.percentile(samples, 99)),
    "latency_p999_us": float(np.percentile(samples, 99.9)),
    "latency_mean_us": float(np.mean(samples)),
    "latency_std_us":  float(np.std(samples)),
}
```

Why $p99$ rather than mean? A mean can be stable while the tail worsens. If 1% of requests take 100× longer than the median, the mean moves by roughly 1%, which is inside your noise floor. The $p99$ moves by 100×, which is not. Tail latency is where users perceive slowness because most interactive systems issue multiple requests per user action — the chance of hitting a tail event grows with fan-out. For $n$ independent requests each with $p99$ latency $L$, the probability that at least one exceeds $L$ is:

$$P(\text{at least one tail hit}) = 1 - (1 - 0.01)^n$$

At $n = 10$ parallel requests, this is $1 - 0.99^{10} \approx 9.6\
