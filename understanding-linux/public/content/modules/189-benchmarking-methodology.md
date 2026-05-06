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

## Core Concepts
### Introduction to Benchmarking Methodology
Benchmarking is the controlled measurement of a system’s observable performance characteristics under defined workloads. Unlike casual profiling, a benchmark must produce repeatable, comparable data that can be used to infer causality between configuration changes and performance outcomes. The discipline rests on three pillars: **repeatability** (identical setup yields identical results), **representativeness** (the workload mirrors real‑world usage), and **isolation** (extraneous influences are eliminated or quantified).

### Key Concepts in Benchmarking
* **Warmup** – Modern CPUs, JVMs, and databases employ adaptive optimizations (e.g., branch prediction, JIT compilation, buffer pool priming). Running a workload until these mechanisms reach a steady state removes transients that would otherwise dominate early measurements. Warmup length is often determined empirically by monitoring a metric (e.g., IPC) until its variance falls below a threshold.  
* **Noise** – Sources include OS scheduler jitter, interrupt handling, background daemons, and hardware non‑determinism (e.g., Turbo Boost, C‑state transitions). Noise inflates variance and can bias estimators if not accounted for. Quantifying noise enables the use of statistical techniques (confidence intervals, outlier rejection) to separate signal from perturbation.  
* **Isolation** – Achieved by pinning processes to specific cores (`taskset` or `cset shield`), disabling frequency scaling (`cpupower set -g performance`), isolating IRQs (`/proc/irq/*/smp_affinity`), and turning off unrelated services. In a container or VM, isolation also means limiting CPU/shares, memory, and I/O quotas so that the benchmark does not compete for shared resources.  
* **Representative Workloads** – A workload must capture the statistical properties (arrival rate, size distribution, think time) of the target scenario. For a web server, this often means a Poisson arrival process with a Pareto‑distributed object size. Using synthetic but statistically matched loads ensures that bottlenecks identified in the benchmark are those that would appear in production.  
* **Measurement Error** – Arises from instrumentation overhead (e.g., `perf` sampling period), limited resolution of clocks (`clock_gettime(CLOCK_MONOTONIC)`), and sampling bias. The error can be modeled as an additive term $\epsilon$ with known variance; increasing sample size reduces the standard error of the mean as $\sigma/\sqrt{n}$.  

## How It Works
### Benchmarking Process
1. **Define Goals and Metrics** – Choose quantities that directly reflect the system’s purpose: throughput (requests/sec), latency (response time), utilization (%CPU, %MEM), or tail latency (99th‑percentile). Each metric must be tied to a decision (e.g., “if 99th‑percentile latency > 10 ms, add more workers”).  
2. **Select Tool and Methodology** – The tool must be capable of generating the desired workload pattern and measuring the metric with sufficient fidelity. For network‑bound services, a traffic generator like `wrk2` allows specifying a precise request rate and connection think time; for CPU‑bound code, `perf stat` provides hardware counter readings with low overhead (<1 %).  
3. **Prepare the System** –  
   * Disable frequency scaling: `echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor`.  
   * Isolate cores: `cset shield --cpu 2-3 --kthread on`.  
   * Bind IRQs to isolated cores: `echo 2 > /proc/irq/*/smp_affinity`.  
   * Drop caches before each run (if measuring cold‑start behavior): `echo 3 > /proc/sys/vm/drop_caches`.  
   * Warm up: run the benchmark for a predetermined time (e.g., 30 s) and discard the data.  
4. **Execute and Collect** – Run the benchmark N times (typically N ≥ 30) to obtain a sample distribution. Record raw timestamps or counter values; avoid post‑processing that could introduce bias (e.g., never average latencies directly—use the distribution).  
5. **Analyze** – Compute descriptive statistics (mean, median, variance). Fit a distribution (often log‑normal for latency) and extract tail metrics. Use confidence intervals:  
   $$
   \text{CI}_{95\%} = \bar{x} \pm t_{N-1,0.025}\,\frac{s}{\sqrt{N}}
   $$
   where $\bar{x}$ is the sample mean, $s$ the sample standard deviation, and $t$ the Student‑t quantile. If the CI of two configurations does not overlap, the difference is statistically significant at the 5 % level.  

### Example: Benchmarking a Web Server with `wrk2`
```bash
# Pin the benchmarking tool to cores 4-5, leave 0-3 for the server
cset shield --cpu 4-5 --kthread on
taskset -c 4-5 wrk2 -t2 -c200 -d60s -R1000 --latency \
    http://127.0.0.1:8080/
```
* `-t2` – 2 threads generating load.  
* `-c200` – 200 persistent HTTP connections (simulates keep‑alive).  
* `-d60s` – run for 60 seconds after warmup.  
* `-R1000` – maintain a constant request rate of 1000 req/s (Poisson arrivals).  
* `--latency` – collect HdrHistogram output for percentile latency.  

The server under test should be isolated similarly (`cset shield --cpu 0-3`). The benchmark reports:
* **Throughput** = completed requests / test duration (should approximate 1000 req/s if the server can keep up).  
* **Mean latency** = $\frac{1}{N}\sum_{i=1}^{N} L_i$.  
* **99th‑percentile latency** = value $L_{p}$ such that 99 % of observations are ≤ $L_{p}$.  

If the measured throughput falls short, the bottleneck is likely CPU saturation, lock contention, or insufficient thread pool size; the latency histogram reveals whether occasional GC pauses or TCP retransmits are inflating the tail.

## Worked Examples
### Example 1: Benchmarking a Random‑Read Disk Workload with `fio`
Objective: measure 4 KiB random read IOPS and average latency on an NVMe device.

**Step‑by‑step**
1. **Isolate the device** – prevent other I/O:
   ```bash
   echo 1000 > /proc/sys/vm/drop_caches   # clean page cache
   ```
2. **Bind fio to a specific CPU** (to avoid scheduler noise):
   ```bash
   taskset -c 6 fio --name=randread \
       --filename=/dev/nvme0n1 \
       --ioengine=libaio \
       --direct=1 \
       --bs=4k \
       --rw=randread \
       --size=10G \
       --numjobs=4 \
       --runtime=30s \
       --time_based \
       --group_reporting \
       --output-format=json
   ```
   * `--direct=1` bypasses the page cache, ensuring we measure device latency.  
   * `--numjobs=4` creates four concurrent queues, matching the device’s typical queue depth.  
   * `--runtime=30s` with `--time_based` discards the first few seconds as warmup (fio automatically performs a ramp‑up period).  

3. **Interpret JSON output** (excerpt):
   ```json
   {
     "read": {
       "iops": 420000,
       "bw": 1680.0,
       "lat_ns": {
         "mean": 2380,
         "percentile": [99.0: 5200, 99.9: 12000]
       }
     }
   }
   ```
   * **IOPS** = 420 k read operations per second.  
   * **Bandwidth** = IOPS × 4 KiB ≈ 1.68 GiB/s.  
   * **Mean latency** = 2.38 µs (derived from `lat_ns.mean / 1000`).  
   * **99th‑percentile latency** = 5.2 µs, indicating a tight tail; any significant increase would suggest queue saturation or firmware throttling.  

4. **Statistical confidence** – repeat the run 5 times, compute mean IOPS = 418 k, sample std dev = 6 k, 95 % CI:
   $$
   418k \pm t_{4,0.025}\frac{6k}{\sqrt{5}} \approx 418k \pm 7.5k
   $$

### Example 2: Benchmarking a CPU‑Bound Matrix Multiply with `perf`
Objective: quantify cycles per floating‑point operation (FLOP) for a dense GEMM (C = A·B) using OpenBLAS.

**Step‑by‑step**
1. **Build the test binary** (linked against OpenBLAS, compiled with `-O3 -march=native`):
   ```c
   /* gemm.c */
   #include <cblas.h>
   int main() {
       const int N = 4096;
       double *A = aligned_alloc(64, N*N*sizeof(double));
       double *B = aligned_alloc(64, N*N*sizeof(double));
       double *C = aligned_alloc(64, N*N*sizeof(double));
       /* initialize A,B with random values */
       cblas_dgemm(CblasRowMajor, CblasNoTrans, CblasNoTrans,
                   N, N, N, 1.0, A, N, B, N, 0.0, C, N);
       return 0;
   }
   ```
2. **Run with perf stat**, isolating the CPU and disabling turbo:
   ```bash
   echo 1 > /sys/devices/system/cpu/intel_pstate/no_turbo
   cset shield --cpu 2 --kthread on
   taskset -c 2 perf stat -e cycles,instructions,cache-references,cache-misses \
       ./gemm
   ```
3. **Sample output**:
   ```
   12,345,678,901 cycles
   24,691,357,802 instructions
   1,234,567 cache-references
   98,765 cache-misses
   ```
4. **Derive metrics**  
   * **Instructions per cycle (IPC)** = $24.69\text{G} / 12.35\text{G} \approx 2.0$.  
   * **Cache miss rate** = $98.765k / 1.234M \approx 8\%$.  
   * **FLOPs per cycle** – each `dgemm` performs $2N^3$ FLOPs ≈ $2 \times 4096^3 = 137.4$ GFLOP.  
     Total cycles = 12.35 G → FLOP/cycle = $137.4\text{GFLOP} / 12.35\text{Gcycle} \approx 11.1$ FLOP/cycle.  
     Theoretical peak for the CPU (AVX2, 2 FLOP per cycle per port × 2 ports × 3.0 GHz) ≈ 12 FLOP/cycle, indicating ~92 % of peak achieved.  

5. **Why the numbers matter** – If IPC were far below 2.0, we would suspect front‑end stalls (branch misprediction, instruction cache misses). A high cache‑miss rate would point to blocking factor sub‑optimality in the BLAS kernel.

### Example 3: Benchmarking Network Throughput with `netperf` and TCP Segmentation Offload (TSO)
Objective: measure achievable TCP throughput between two hosts and verify the impact of TSO.

**Step‑by‑step**
1. **Configure the NIC** (assuming `eth0`):
   ```bash
   # Disable TSO to see the software cost
   ethtool -K eth0 tso off gso off gro off
   ```
2. **Run netperf server on host B**:
   ```bash
   netserver -L 127.0.0.1   # bind to localhost for loopback test, or omit for external
   ```
3. **Run netperf client on host A**, isolating a core:
   ```bash
   taskset -c 4 netperf -H hostB -t TCP_STREAM -l 30 \
       -- -m 1460   # set MSS to typical Ethernet payload
   ```
4. **Results (with TSO enabled)**:
   ```
   Recv   Send    Send                          Utilization
   Socket  Socket  Message  Elapsed              Send   Recv
   Bytes  Bytes   Size     Time     Throughput   %CPU   %CPU
   870,000,000 870,000,000 1460 30.00  23.20 MB/s  2.1%   2.0%
   ```
   * Throughput ≈ 23.2 MB/s ≈ 185 Mbps (far below 1 Gbps link).  
   * CPU utilization low → the bottleneck is the NIC’s segmentation offload being disabled; each 1460‑byte segment incurs a separate interrupt and TX queue operation.  

5. **Re‑enable TSO** (`ethtool -K eth0 tso on`) and repeat:
   ```
   Throughput: 94.8 MB/s ≈ 758 Mbps, CPU 4.5%
   ```
   * The jump shows that TSO allows the NIC to aggregate many packets into a single large DMA transaction, reducing per‑packet overhead.  
   * The residual gap to line rate (≈24 % loss) can be attributed to TCP slow‑start, ACK delay, and interrupt moderation; further tuning (e.g., increasing TX ring size) would close it.

## Common Mistakes
### Mistake 1: Using Warmup Duration Based on Wall‑Clock Time Only
*What’s wrong*: Setting a fixed warm‑up period (e.g., “run for 10 s”) without checking whether the system has reached a steady state.  
*Why it matters*: Many subsystems (e.g., JVM JIT, database buffer pool) exhibit exponential convergence; a fixed time may stop too early (biased high latency) or waste time (lower throughput).  
*Correct approach*: Monitor an observable that stabilizes (IPC, cache‑miss rate, or queue length) and stop warmup when its coefficient of variation falls below a threshold (e.g., 1 % over a sliding window of 5 s).  

### Mistake 2: Reporting Mean Latency Without Percentiles
*What’s wrong*: Publishing only average response time.  
*Why it matters*: Latency distributions are often heavy‑tailed; the mean can hide severe outliers that violate SLAs.  
*Correct approach*: Always report at least the 50th, 90th, 95th, and 99th percentiles, preferably using a histogram log‑scale (e.g., HdrHistogram) to capture the full shape.  

### Mistake 3: Ignoring CPU Frequency Scaling During Measurement
*What’s wrong*: Leaving `intel_pstate` or `acpi_cpufreq` in “powersave” mode while benchmarking.  
*Why it matters*: The CPU may dynamically lower frequency mid‑run, causing apparent performance degradation that is purely a power‑management artifact, not a software regression.  
*Correct approach*: Pin the governor to `performance` (`echo performance > /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor`) or disable turbo (`echo 1 > /sys/devices/system/cpu/intel_pstate/no_turbo`) and verify with `cat /proc/cpuinfo | grep MHz` that the frequency stays constant.  

## Exercises
### Exercise 1 (Easy): Measuring Context‑Switch Overhead
1. Write a simple ping‑pong program using `pipe()` and two processes that exchange a single byte repeatedly.  
2. Run it with `taskset -c 0,1` to bind each process to a distinct core.  
3. Use `perf stat -e context-switches,cpu-migrations` to count switches over a 10‑second run.  
4. Compute the average time per switch:  
   $$
   t_{cs} = \frac{\text{elapsed time}}{\#\text{switches}}
   $$  
5. Repeat with the processes bound to the *same* core and discuss the difference.

### Exercise 2 (Intermediate): Storage Latency Under Queue Depth Sweep
1. Using `fio`, generate random 4 KiB reads on an SSD with queue depths `{1,2,4,8,16,32,64}`.  
   ```bash
   fio --name=qdepth --filename=/dev/nvme0n1 --ioengine=libaio \
       --direct=1 --bs=4k --rw=randread --size=5G \
       --numjobs=1 --iodepth=<QD> --runtime=20s --time_based
   ```
2. For each QD, record mean latency and IOPS.  
3. Plot latency vs. QD (expect a “hockey‑stick” shape).  
4. Explain the observed minimum latency point in terms of the device’s internal parallelism and the operating system’s interrupt coalescing.

### Exercise 3 (Advanced): Isolating Noise in a Multi‑Tenant VM
1. Launch two identical QEMU/KVM virtual machines on the same host, each with 2 vCPUs and 2 GiB RAM.  
2. In VM‑A, run a CPU‑bound benchmark (e.g., `sysbench --test=cpu --cpu-max-prime=2000000 run`).  
3. In VM‑B, generate background network traffic using `iperf3 -c <host> -t 60 -P 10`.  
4. Pin the vCPUs of each VM to distinct host cores (`virvcpuattach`).  
5. Measure the benchmark’s throughput in VM‑A with and without the background traffic, using `perf stat` inside the VM.  
6. Quantify the noise introduced by the co‑tenant and discuss mitigation strategies (CPU pinning, cache allocation technology, or Intel QoS).  

## Linux Connection
Linux exposes a rich set of interfaces for precise performance measurement and control. Below are the most relevant subsystems, their typical paths, and example commands.

| Subsystem | Interface | Purpose | Example Command |
|-----------|-----------|---------|-----------------|
| CPU frequency scaling | `/sys/devices/system/cpu/cpu*/cpufreq/` | Read/set governor, min/max freq | `cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` |
| CPU affinity & isolation | `taskset`, `cset shield`, `/proc/*/status` (Cpus_allowed list) | Pin threads/processes to specific cores | `taskset -c 2-3 ./bench` |
| Interrupt affinity | `/proc/irq/*/smp_affinity` | Distribute IRQ load across cores | `echo 4 > /proc/irq/30/smp_affinity` |
| Memory & paging stats | `/proc/vmstat`, `/proc/zoneinfo` | Monitor page faults, swapping, slab usage | `grep pgmajfault /proc/vmstat` |
| Block I/O statistics | `/sys/block/*/stat`, `iostat -x 1` | Per‑device read/write IOPS, bandwidth, await time | `iostat -x /dev/nvme0n1 1` |
| Network stack stats | `/proc/net/dev`, `ethtool -S eth0` | Packet counts, errors, offload status | `ethtool -S eth0` |
| Hardware performance counters | `perf_event_open` syscall, wrapper `perf` | Count cycles, instructions, cache events, branch misses | `perf stat -e cycles,instructions,cache-references,cache-misses ./a.out` |
| Tracing & BPF | `ftrace` (`/sys/kernel/debug/tracing/`), `bpftrace`, `eBPF` | Dynamic instrumentation with negligible overhead | `bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%s\n", comm); }'` |
| Control groups (cgroups v2) | `/sys/fs/cgroup/` | Limit CPU, memory, I/O per workload | `echo 50000 > /sys/fs/cgroup/cpu.max` (50 ms per 100 ms period) |
| Transparent Huge Pages | `/sys/kernel/mm/transparent_hugepage/enabled` | Influence THP latency vs. throughput trade‑off | `echo never > /sys/kernel/mm/transparent_hugepage/enabled` |

**Illustrative workflow – measuring kernel‑mode overhead of a system call:**

```bash
# 1. Enable raw syscall tracepoints
echo 1 > /sys/kernel/debug/tracing/events/syscalls/sys_enter_read/enable
echo 1 > /sys/kernel/debug/tracing/events/syscalls/sys_exit_read/enable

# 2. Start tracing (buffer in /sys/kernel/debug/tracing/trace_pipe)
cat /sys/kernel/debug/tracing/trace_pipe &
TRACE_PID=$!

# 3. Run the workload (e.g., dd reading from /dev/zero)
dd if=/dev/zero of=/dev/null bs=64K count=10000 &
WORK_PID=$!

# 4. After a few seconds, stop tracing and workload
kill -INT $TRACE_PID
kill $WORK_PID

# 5. Parse timestamps to compute average syscall latency:
#    each line contains: <timestamp> sys_enter_read: ...   ... sys_exit_read: ...
#    subtract entry from exit timestamps, average over all samples.
```

This method yields sub‑microsecond syscall latency with virtually no perturbation because the tracing infrastructure uses per‑CPU ring buffers and lock‑less writes.

## Why This Matters
Benchmarking transforms anecdotal performance impressions into actionable, quantifiable evidence. By rigorously defining workloads, isolating sources of variability, and applying statistical analysis, we can answer questions that directly affect product decisions:

* **Capacity planning** – Throughput and latency measurements let us predict how many requests a service will sustain under peak load, informing hardware provisioning or autoscaling thresholds.  
* **Regression detection** – A automated CI benchmark that flags a >5 % regression in 99th‑percentile latency catches performance bugs before they reach production.  
* **Cost‑efficiency tuning** – Identifying that a database spends 30 % of cycles on lock contention enables targeted changes (e.g., finer‑grained locking or sharding) that reduce required core count and thus operational expense.  
* **Resource isolation validation** – Demonstrating that a noisy neighbor in a shared cloud VM degrades latency by X % justifies investment in cache allocation technologies or dedicated hosts.  
* **Energy‑performance trade‑offs** – Measuring performance per watt (throughput / power draw via `powercap` or RAPL counters) guides decisions about frequency scaling, turbo boost, and workload placement.

In Linux, the observability tools (`perf`, `eBPF`, `/proc`, `sysfs`) are mature enough to collect the data needed for these analyses with sub‑microsecond overhead and minimal intrusion. Mastering benchmarking methodology therefore equips engineers to harness the full potential of the Linux stack—from the silicon up to the user‑visible service—ensuring systems meet the stringent performance, scalability, and reliability demands of modern workloads.
