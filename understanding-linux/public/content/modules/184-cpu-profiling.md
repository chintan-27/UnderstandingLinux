---
id: 184
title: "CPU profiling"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to CPU Profiling
CPU profiling measures **where** the CPU spends its cycles, not just how long a program runs. The goal is to attribute *CPU time* to specific instructions, functions, or code paths so that optimization effort can be directed at the true bottlenecks.  
On a preemptive multitasking system, the kernel periodically interrupts each running task (via a timer interrupt or hardware performance counter) and records the **instruction pointer (IP)** at that instant. The IP, together with a user‑space or kernel unwind library, yields a **call stack** that represents the active execution context. By aggregating many such snapshots, we obtain a statistical estimate of the fraction of time spent in each routine.

### Sampling vs. Instrumentation
| Aspect | Sampling | Instrumentation |
|--------|----------|-----------------|
| **Intrusiveness** | No code modification; relies on hardware/OS interrupts. | Requires inserting probes (e.g., `-pg`, `-finstrument-functions`, eBPF uprobes) that execute extra instructions at each probe point. |
| **Overhead** | ≈ ( sample‑cost × sample‑rate ). Typical cost: 5‑10 µs per sample on x86‑64 with `perf_event_open`. | Overhead scales with number of probed sites; can reach > 10 % if every function is instrumented. |
| **Granularity** | Temporal resolution limited by sampling interval; spatial resolution limited by unwind accuracy. | Can capture exact entry/exit counts, latency distributions, or custom metrics. |
| **Use‑case** | Quick discovery of hot paths, low‑effort baseline. | Detailed analysis when you need precise counts, e.g., lock‑acquisition latency, malloc size distribution. |

The kernel’s **perf_event** subsystem implements sampling via the `perf_event_open` syscall. By configuring a *sample period* (in CPU cycles or time), the kernel delivers a `perf_event_mmap` page filled with `perf_sample` records each time the counter overflows.

### Flame Graphs
A flame graph is a **stack‑aggregated, time‑weighted** visualization:

* Each unique call stack observed in a sample becomes a **frame**.
* Frames are placed horizontally; the width of a frame = Σ (samples containing that frame) × (sample weight).  
  If each sample represents a fixed time Δt, then width ∝ total time spent in that function (including all children).
* Stacks are **merged** by collapsing identical adjacent frames, then sorted alphabetically to produce a deterministic ordering.
* The final image is a series of **rectangles** stacked vertically; the bottom rectangle represents the root (usually `start_thread` or `kernel_thread`).  

Mathematically, let  
\(S\) be the set of all samples,  
\(w_i\) the weight of sample *i* (usually Δt), and  
\(f(s, j)\) the *j*‑th function in the stack of sample *s*.  

The total attributed time to function *f* is  

\[
T_f = \sum_{s\in S} w_i \; \mathbf{1}\{ \exists j: f(s,j)=f\}
\]

The flame graph’s horizontal axis is proportional to \(T_f\).  

---

## How It Works
### CPU Profiling Mechanism (perf_event)
1. **Enable a hardware counter** (e.g., CPU cycles) or a software timer (e.g., `PERF_COUNT_SW_CPU_CLOCK`).  
2. **Set sample period** \(P\) (in units of the counter). When the counter reaches zero, the kernel generates a **sample** and reloads the period.  
3. **Collect sample data**: IP, CPU‑mode (user/kernel), TID/PID, optionally call‑chain (via frame‑pointer unwind or DWARF).  
4. **Write to a ring buffer** (mmap’ed `perf_event_mmap` page) for low‑latency transfer to user space.  
5. **User‑space consumer** reads records, aggregates call‑chains, and feeds them to a flame‑graph generator.

Key data structures (kernel‑side, simplified):

```c
/* include/linux/perf_event.h */
struct perf_event_attr {
    __u32 type;          /* PERF_TYPE_HARDWARE, PERF_TYPE_SOFTWARE, ... */
    __u32 size;          /* sizeof(struct perf_event_attr) */
    __u64 config;        /* event ID (e.g., PERF_COUNT_HW_CPU_CYCLES) */
    __u64 sample_period; /* period in counter units */
    __u64 sample_type;   /* bits: PERF_SAMPLE_IP, PERF_SAMPLE_CALLCHAIN, ... */
    __u64 read_format;   /* format of read() results */
    /* ... */
};
```

User‑space setup (minimal example):

```c
#define _GNU_SOURCE
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/perf_event.h>
#include <sys/syscall.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

static long perf_event_open(struct perf_event_attr *hw_event, pid_t pid,
                            int cpu, int group_fd, unsigned long flags)
{
    return syscall(__NR_perf_event_open, hw_event, pid, cpu,
                   group_fd, flags);
}

int main(void)
{
    struct perf_event_attr pe;
    memset(&pe, 0, sizeof(pe));
    pe.type = PERF_TYPE_HARDWARE;
    pe.config = PERF_COUNT_HW_CPU_CYCLES;   /* count CPU cycles */
    pe.sample_period = 4000000;             /* ~10ms @ 4GHz */
    pe.sample_type = PERF_SAMPLE_IP | PERF_SAMPLE_CALLCHAIN;
    pe.disabled = 1;                        /* start disabled */
    pe.exclude_kernel = 1;                  /* user‑only samples */
    pe.exclude_hv = 1;

    int fd = perf_event_open(&pe, 0, -1, -1, 0);
    if (fd == -1) {
        perror("perf_event_open");
        exit(EXIT_FAILURE);
    }

    ioctl(fd, PERF_EVENT_IOC_ENABLE, 0);
    /* … run workload … */
    ioctl(fd, PERF_EVENT_IOC_DISABLE, 0);
    close(fd);
    return 0;
}
```

The above program yields a stream of samples; each sample’s `callchain` contains a series of instruction pointers that can be resolved to symbols via `/proc/<pid>/maps` and `libdwfl` or `elfutils`.

### Flame Graph Generation
Given a list of samples with weight \(w_i\) and call‑chain \(C_i = [f_{i,0}, f_{i,1}, …, f_{i,n_i}]\) (root → leaf), the algorithm:

1. **Convert each sample to a line**: `f_{i,0};f_{i,1};…;f_{i,n_i} w_i`  
2. **Collapse identical lines**: sum weights for identical stacks → `stack_collapse.pl` output.  
3. **Sort lines lexicographically** (so that similar stacks share prefixes).  
4. **Generate SVG**: each distinct prefix gets a rectangle whose width = accumulated weight of all lines sharing that prefix; height = uniform (e.g., 1 pixel per stack depth).  

The Perl script `flamegraph.pl` from Brendan Gregg implements exactly this; it expects collapsed stacks as input.

---

## Worked Examples
### Example 1: Tight Loop – Quantifying Samples
**Program** (`busy.c`):

```c
#include <stdio.h>
#include <unistd.h>

int main(void) {
    volatile unsigned long cnt = 0;
    while (1) {
        cnt++;               /* prevent optimization */
    }
}
```

Compile: `gcc -O2 -march=native -o busy busy.c`

Assume:
* CPU frequency \(f_{cpu} = 3.0\,\text{GHz}\).
* Loop body ≈ 4 cycles (increment + branch).  
  → Iteration time \(t_{iter} = \frac{4}{3\times10^9} \approx 1.33\text{ ns}\).

If we run for \(T = 30\text{ s}\):
* Total iterations \(N_{iter} = \frac{T}{t_{iter}} \approx 2.25\times10^{10}\).

**Sampling configuration**:  
`perf record -F 99 -a -g -- ./busy`  
* Frequency \(F = 99\) Hz → sampling interval \(\Delta t = \frac{1}{F} \approx 10.10\text{ ms}\).  
* Expected number of samples:  

\[
N_{samples} = \frac{T}{\Delta t} \approx \frac{30}{0.0101} \approx 2970.
\]

Because the loop consumes **100 %** of CPU time, every sample’s IP will fall inside the loop (or its prologue/epilogue). The flame graph will show a single wide box for `main` (or the loop label) with width ≈ 30 s.

**Verification**:  

```bash
perf record -F 99 -a -g -- ./busy &
sleep 30
kill %1
perf script | stackcollapse-perf.pl | flamegraph.pl > busy.svg
```

Open `busy.svg`; you should see a single rectangle spanning the full width.

### Example 2: Lock Contention – Measuring Wait Time
**Program** (`lock.c`):

```c
#include <pthread.h>
#include <stdio.h>
#include <unistd.h>

pthread_mutex_t m = PTHREAD_MUTEX_INITIALIZER;
volatile int work = 0;

void *thr(void *arg) {
    while (1) {
        pthread_mutex_lock(&m);   /* acquire */
        work++;                   /* critical section */
        pthread_mutex_unlock(&m); /* release */
        /* spin to increase wait time */
        for (volatile int i=0; i<1000; ++i) ;
    }
    return NULL;
}

int main(void) {
    pthread_t t[4];
    for (int i=0; i<4; ++i) pthread_create(&t[i], NULL, thr, NULL);
    for (int i=0; i<4; ++i) pthread_join(t[i], NULL);
    return 0;
}
```

Compile with `-pthread -O2`.

**Profiling plan**:  
We want to capture time spent **inside** `pthread_mutex_lock` (the kernel futex wait) vs. the critical section.

```bash
perf record -e cycles:u -g -- ./lock   # user‑mode cycles only
sleep 10
kill %1
perf script | stackcollapse-perf.pl | flamegraph.pl > lock.svg
```

**Reasoning**:  
* Suppose each thread spends 70 % of its time spinning after release (the `for` loop) and 30 % blocked in the futex wait.  
* With 4 threads, total CPU time = 4 × (100 % user) = 4 core‑seconds per wall‑second.  
* The futex wait is a **blocking** state; the CPU is not executing user code, so `perf` samples **only** when the thread is running. Consequently, the measured *user* CPU time will show ~70 % in the spin loop and ~30 % in the lock acquisition path (the few instructions before the syscall).  

If we instead sample **all** CPU cycles (`-e cycles`) the kernel will also capture time spent in the kernel while the thread is blocked (if the kernel accounts for those cycles as “CPU time”). In practice, the kernel does **not** charge blocked time to the process, so the flame graph still reflects only the runnable portion. To see the blocking time we must sample **wall‑clock** via a software timer:

```bash
perf record -e task-clock:u -g -- ./lock   # task-clock counts time the task is scheduled in
```

`task-clock` increments while the task is on‑runqueue, i.e., includes time spent sleeping in the kernel (as the scheduler still accounts it). The resulting flame graph will show a wide box for `futex_wait_queue_me` (or `__futex_waite`) representing the wait time.

### Example 3: malloc() Overhead – Counting Allocations
**Program** (`malloc.c`):

```c
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>

#define N 10000000

int main(void) {
    for (size_t i=0; i<N; ++i) {
        void *p = malloc(64);
        if (!p) return 1;
        free(p);
    }
    return 0;
}
```

Compile: `gcc -O2 -o malloc malloc.c`

**Profiling**:  
We want to attribute time to the `malloc` and `free` functions themselves, not the loop overhead.

```bash
perf record -e cycles:u -g -- ./malloc
perf script | stackcollapse-perf.pl | flamegraph.pl > malloc.svg
```

**Estimation**:  
Assume `malloc(64)` + `free` takes ~150 ns on a modern glibc with tcache. Loop overhead (increment, branch) ~2 ns.  
Total time per iteration ≈ 152 ns → for \(N=10^7\) → **1.52 s** of CPU time.  

If we sample at 499 Hz (≈2 ms interval), expected samples:  

\[
N_{samples} = \frac{1.52\text{ s}}{0.002\text{ s}} \approx 760.
\]

Since the loop is tight, ~70 % of those samples will hit inside `malloc`/`free`, producing a wide rectangle for those symbols.

---

## Common Mistakes
| Mistake | Why It’s Wrong | How to Avoid |
|---------|----------------|--------------|
| **Flame‑graph width = call count** | Width reflects *time* (∑ Δt per sample), not invocation frequency. A function called rarely but taking a long time per call can dominate the graph. | Always pair flame‑graph analysis with a **count‑based** profile (e.g., `perf record -e instructions -g`) if you need call‑frequency information. |
| **Ignoring sampling overhead** | Each sample costs ~5‑10 µs (kernel entry, unwind, copy to ring buffer). At 4 kHz this adds ~2‑4 % overhead; at 100 kHz it can exceed 20 % and distort the very behavior you measure. | Choose a sample period that keeps overhead < 2 % for your workload: `overhead ≈ sample_cost × sample_rate`. Measure with `perf stat -e task-clock,context-switches,cpu-migrations`. |
| **Optimizing for CPU time while ignoring latency‑sensitive stalls** | A program may spend little CPU time but be stuck waiting for I/O, locks, or memory bandwidth; optimizing the CPU hotspot yields negligible wall‑clock improvement. | Use **wall‑clock** profilers (`perf record -e task-clock`) or trace blocking events (`perf trace -e sched:sched_switch`) to identify wait‑time hotspots. |
| **Mixing user and kernel samples without separation** | Kernel functions (e.g., `__do_softirq`) appear in the same graph as user code, making it hard to tell whether time is spent in the application or in the kernel handling interrupts/network. | Separate with `-e cycles:u` (user-only) and `-e cycles:k` (kernel-only) or use `perf record -g --all-user` / `--all-kernel`. |
| **Assuming a flat profile means no bottlenecks** | If the workload is I/O‑bound, CPU samples may be spread thinly across many idle loops, hiding the fact that the thread spends most of its time blocked. | Complement CPU profiling with **idle‑time** metrics (`vmstat`, `iostat`, `perf stat -e cpu-clock,task-clock`). |

---

## Exercises
### Easy – Baseline Flame Graph
1. Write a simple C program that computes the sum of an array (`for (i=0;i<N;++i) sum+=a[i];`).  
2. Compile with `-O2 -march=native`.  
3. Run `perf record -F 99 -a -g -- ./sum`.  
4. Generate a flame graph (`perf script | stackcollapse-perf.pl | flamegraph.pl > sum.svg`).  
5. Identify the widest box and verify it corresponds to the loop body.  

*Goal*: Observe end‑to‑end workflow and confirm that width scales with loop iterations.

### Medium – Lock Contention Detection
1. Use the `lock.c` program from Worked Example 2.  
2. Profile with both **user‑cycles** (`-e cycles:u`) and **task‑clock** (`-e task-clock:u`).  
3. Produce two flame graphs: `lock_user.svg` and `lock_task.svg`.  
4. Explain why `lock_user.svg` shows most time in the spin loop while `lock_task.svg` highlights the futex wait.  
5. (Optional) Vary the spin‑loop length and observe the shift in the flame graph.

*Goal*: Distinguish between CPU‑time and wait‑time profiling.

### Hard – eBPF‑Based Allocation Latency
1. Write an eBPF program (using `bpftool` or `bpftrace`) that timestamps entry and exit of `malloc` and `free` via USDT probes or uprobes on `glibc`.  
2. Accumulate a histogram of allocation latency (in µs).  
3. Run the histogram while executing `malloc.c` (from Worked Example 3).  
4. Produce a flame graph of the **average latency** per call site by attaching the latency as a weight to each sample (e.g., `perf record -e cycles:u -g -- ./malloc` then post‑process each sample’s latency from the eBPF map).  
5. Discuss how the resulting graph differs from a plain CPU‑time flame graph.

*Goal*: Combine sampling with custom latency metrics to pinpoint not just *where* time is spent but *how expensive* each operation is.

---

## Linux Connection
### Subsystems & Files
| Subsystem | Purpose | Relevant Files / Interfaces |
|-----------|---------|------------------------------|
| **perf_events** | Hardware‑ and software‑based sampling via `perf_event_open` syscall. | `/proc/sys/kernel/perf_event_paranoid` (restricts unprivileged access), `/sys/devices/cpu/rdpmc`, `/usr/include/linux/perf_event.h`. |
| **ftrace** | Kernel function tracing, tracepoints, and dynamic events. | Mounted at `/sys/kernel/debug/tracing/`; key files: `tracing_on`, `current_tracer`, `set_ftrace_filter`, `trace`. |
| **eBPF** | Programmable, low‑overhead probing of kernel and user space (via BPF syscall). | `/sys/fs/bpf/`, `bpftool`, `libbpf`. |
| **procfs** | Exposes per‑process memory maps, stack, and CPU usage needed for symbol resolution. | `/proc/<pid>/maps`, `/proc/<pid>/stat`, `/proc/<pid>/stack`. |
| **ELF utilities** | Symbol lookup, unwind info. | `readelf -Ws`, `addr2line`, `libdwfl` (from elfutils). |

### Commands (runnable blocks)

**1. Record a system‑wide CPU‑cycle profile at 4 kHz with callchains**

```bash
# Requires CAP_SYS_ADMIN or relaxed perf_event_paranoid
echo -1 > /proc/sys/kernel/perf_event_paranoid   # allow all users (temporary)
perf record -F 4000 -a -g -- sleep 30
perf script | stackcollapse-perf.pl | flamegraph.pl > system.svg
```

**2. Profile only user‑space cycles of a specific PID**

```bash
perf record -F 4000 -p $(pidof myapp) -g -- sleep 10
perf report -i perf.data --stdio | grep -E "\->"
```

**3. Use ftrace to trace kernel function entries/exits (e.g., mutex lock)**

```bash
echo function > /sys/kernel/debug/tracing/current_tracer
echo __mutex_lock > /sys/kernel/debug/tracing/set_ftrace_filter
echo 1 > /sys/kernel/debug/tracing/tracing_on
# run workload …
echo 0 > /sys/kernel/debug/tracing/tracing_on
cat /sys/kernel/debug/tracing/trace > mutex_trace.txt
```

**4. eBPF uprobe to count malloc latency (bpftrace one‑liner)**

```bash
bpftrace -e '
  uprobe:/lib/x86_64-linux-gnu/libc.so.6:malloc {
    @start[pid] = nsecs;
  }
  uretprobe:/lib/x86_64-linux-gnu/libc.so.6:malloc {
    @latency[pid] = hist(nsecs - @start[pid]);
    delete(@start[pid]);
  }
'
```

**5. Generate a flame graph from perf data with weighted samples (custom weight from eBPF map)**  
*(illustrative; actual implementation requires a small C/Python reader)*

```bash
# Assume we have a CSV: ip,weight
awk -F, '{printf "%s %s\n", $2, $1}' weights.csv > weighted.folded
flamegraph.pl weighted.folded > weighted.svg
```

These commands demonstrate the concrete paths through which the concepts appear on a modern Linux distribution (Ubuntu 22.04+, Fedora 38+, Arch).

---

## Why This Matters
CPU profiling turns an opaque “slow program” into a **map of expensive code paths** that can be acted upon. By mastering sampling theory—understanding the relationship between sample interval, expected count, and statistical error—you can choose a configuration that yields trustworthy data without perturbing the system. Flame graphs then translate those samples into an intuitive visual hierarchy, instantly revealing whether time is lost in a tight loop, a blocking lock, a memory allocator, or deep in the kernel.

On Linux, the `perf` subsystem, ftrace, and eBPF give you a **graduated toolbox**:

* **Perf** for low‑overhead, system‑wide sampling and hardware‑counter metrics.  
* **Ftrace** for deterministic kernel tracing when you need to see every entry/exit of a specific function.  
* **eBPF** for custom metrics (latency, histograms, bespoke counters) that can be attached to both user and kernel probes with negligible overhead.

When you combine these tools with a solid grasp of the underlying mathematics—e.g., computing the confidence interval of a sampled estimate \(\sigma = \sqrt{p(1-p)/N}\) for a function’s true CPU‑time fraction \(p\)—you move from anecdotal optimization to **quantitative performance engineering**. This skill compounds: you can reason about scaling behavior, predict the impact of architectural changes, and verify that optimizations actually reduce latency or increase throughput under realistic loads. In production services, where every millisecond translates to cost and user satisfaction, the ability to locate and eliminate true bottlenecks is indispensable. The lessons and exercises above equip you to do exactly that on the Linux platform you will encounter in real‑world systems.
