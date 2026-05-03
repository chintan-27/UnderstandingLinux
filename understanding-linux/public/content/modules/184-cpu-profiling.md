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

## Why This Matters

When a system runs slowly, the bottleneck is almost always confined to a small fraction of the code. The reason is Amdahl's Law: if a function accounts for fraction $f$ of total runtime, the maximum speedup from optimizing it perfectly is $\frac{1}{1-f}$. A function consuming 1% of runtime can never yield more than a 1.01× speedup no matter how cleverly you rewrite it. Profiling tells you which functions have large $f$ — without it, you are optimizing by intuition against an exponential search space.

At scale, the problem compounds differently. A function consuming 0.5% of CPU time on one core consumes $0.005 \times N$ core-seconds per second across $N$ cores. At $N = 1000$, that is 5 full cores burning continuously. Aggregate metrics like average CPU utilization hide this: they cannot distinguish one core at 100% from ten cores at 10%.

## Core Concepts

### Sampling vs. Instrumentation

**Instrumentation** inserts measurement code — counters, timestamps, callbacks — at specific program points. It is complete: every event is recorded. The cost is that each probe adds latency to the code path it measures. If you instrument a function called $10^7$ times per second and each probe costs 50 ns, you add 500 ms/s of artificial load — roughly 50% overhead on a lightly loaded system. The measurement changes the thing being measured.

**Sampling** avoids this by delivering a periodic interrupt and recording where the CPU is at that instant. No code is modified. The tradeoff is statistical: you get a representative picture, not a complete one.

The key property: if a function consumes fraction $f$ of CPU time, it appears in approximately fraction $f$ of samples. The standard error of this estimate for $N$ samples is:

$$\sigma = \sqrt{\frac{f(1-f)}{N}}$$

At $f = 0.30$ and $N = 990$ samples, $\sigma \approx 0.015$, so the estimate is accurate to roughly ±1.5 percentage points at one standard deviation. Increasing $N$ by collecting longer or sampling faster tightens this bound as $\frac{1}{\sqrt{N}}$.

The canonical sample rate is 99 Hz rather than 100 Hz to avoid **lock-step sampling**. If the profiler fires at exactly the same frequency as a periodic kernel activity — a 100 Hz scheduler tick, a 100 Hz timer interrupt — then samples will be systematically biased toward or away from that activity depending on phase. A prime-adjacent rate decorrelates the profiler from any sub-100 Hz periodic event.

### Why Stack Traces Matter

A single instruction pointer tells you *what* was running. The call stack tells you *why*. Without stacks, you might find that `memcpy` consumed 40% of CPU time. That tells you nothing actionable: `memcpy` is called from everywhere. The call stack shows you whether the hot `memcpy` was reached via `compress_block → deflate → memcpy` or via `response_serializer → json_encode → memcpy`. Those are different bugs with different fixes.

Stack trace collection works by walking the chain of saved frame pointers on the stack. Each call frame has the layout:

```
high address
┌─────────────────────┐
│   ...caller frame...│
│   saved rbp  ───────┼──► previous frame
│   return addr       │
│   local variables   │
└─────────────────────┘  ← rbp points here
low address
```

Walking from `rbp` to `rbp` to `rbp` reconstructs the call chain in $O(d)$ time where $d$ is the stack depth — typically under 30 frames for most application code.

Modern compilers omit frame pointers by default (`-fomit-frame-pointer`) to reclaim `rbp` as a general-purpose register. This breaks the frame pointer walk entirely. The kernel then must fall back to DWARF CFI unwinding, which requires debug symbols and is significantly slower, or to hardware Last Branch Record (LBR) unwinding, which is accurate but limited to ~32 frames on Intel CPUs.

### Flame Graphs

A flame graph visualizes a **merged call stack tree**. Each sample contributes one stack trace. After collection, stacks sharing identical prefixes are merged into a single node whose width is proportional to the total number of samples that passed through it.

For a set of folded stacks with sample counts:

```
main;serialize;crc32    310
main;serialize;memcpy    88
main;send;tcp_sendmsg    55
main;idle                47
```

Total $N = 500$. The rendered widths are:

$$\text{width}(\texttt{crc32}) = \frac{310}{500} = 62.0\%$$

$$\text{width}(\texttt{serialize}) = \frac{310 + 88}{500} = 79.6\%$$

$$\text{width}(\texttt{main}) = \frac{500}{500} = 100\%$$

The axes:

- **x-axis**: population of samples. Wider = more samples contained that frame. The x-axis is *not* time and does not represent call order.
- **y-axis**: stack depth. Higher = deeper in the call chain.
- **Top edge**: the leaf frames — functions actually executing on CPU when the sample fired.

Functions at the same level are sorted alphabetically so that identical sub-stacks from different samples always land in the same horizontal position and merge correctly. A wide plateau at the top of a tower is the visual signature of a hot leaf function worth examining.

## How It Works

### The Sampling Interrupt

The kernel's `perf_events` subsystem programs a hardware PMU counter or a `hrtimer` to overflow at the desired frequency. When the interrupt fires, the kernel:

1. Saves the current instruction pointer (`rip`).
2. Walks the call stack via frame pointers or DWARF CFI.
3. Records the resulting stack trace into a per-CPU ring buffer mapped into userspace.
4. Returns from the interrupt; the profiled process resumes transparently.

The ring buffer is a lock-free, power-of-two-sized circular buffer at a page-aligned address. The kernel writes to it; userspace reads from it by polling the `data_head` field in the mapped `perf_event_mmap_page` header — no syscall needed on the read path. The kernel advances `data_head`; userspace advances `data_tail` after consuming records.

If the profiler reads too slowly and the ring buffer fills, samples are dropped. `perf stat` reports this as `lost samples`. The buffer size is set with `-m <pages>` in `perf record`; doubling it halves drop rate at the cost of memory. At 99 Hz across 64 CPUs with average stack depth 20, the raw data rate is roughly:

$$\text{rate} = 99 \times 64 \times 20 \times 8 \approx 1.0 \, \text{MB/s}$$

where 8 bytes is the size of one address entry — manageable for a 16 MiB ring buffer.

### Building a Flame Graph: The Full Pipeline

Install prerequisites (Brendan Gregg's FlameGraph tools):

```bash
git clone https://github.com/brendangregg/FlameGraph
export PATH="$PATH:$(pwd)/FlameGraph"
```

Record, process, and render:

```bash
# Record stack traces at 99 Hz, all CPUs, include kernel frames, 10 seconds
perf record -F 99 -a -g -o perf.data -- sleep 10

# Check for dropped samples
perf report --header-only -i perf.data | grep -i lost

# Decode samples to text (use --no-demangle to preserve C++ names for later processing)
perf script -i perf.data --header > out.stacks

# Collapse: transform perf's verbose per-sample output into
# "semicolon;separated;stack COUNT" lines
stackcollapse-perf.pl out.stacks > out.folded

# Render SVG; --hash colors each function by name hash for
# visual consistency when comparing two profiles
flamegraph.pl --hash --title "production capture" out.folded > out.svg

# Open in browser (Linux desktop)
xdg-open out.svg
```

The intermediate folded format is plain text and worth inspecting:

```bash
# What are the top 10 hottest leaf functions by raw sample count?
awk '{print $NF, $1}' out.folded \
  | awk '{split($2,a,";"); print a[length(a)], $1}' \
  | sort -k2 -rn \
  | head -10
```

### Differential Flame Graphs

To compare two profiles — before and after a code change — use `difffolded.pl`:

```bash
perf record -F 99 -a -g -o before.data -- sleep 10
# deploy change
perf record -F 99 -a -g -o after.data  -- sleep 10

perf script -i before.data | stackcollapse-perf.pl > before.folded
perf script -i after.data  | stackcollapse-perf.pl > after.folded

# Red = regression (more samples after), blue = improvement
difffolded.pl before.folded after.folded | flamegraph.pl --negate > diff.svg
```

The diff flame graph shows only the *delta*, not the absolute profile. A function that is red and wide got substantially hotter; a function that is blue got cooler.

### Off-CPU Footprints

CPU profiling does not show time spent waiting — blocked on I/O, sleeping on a mutex, or waiting in a run queue. But the on-CPU *setup* for those events is visible. If significant CPU time appears in:

- `blk_mq_submit_bio` / `submit_bio` call chains → block I/O submission overhead is measurable; consider batching or using `io_uring`
- `tcp_sendmsg` / `ip_output` chains → the network stack is processing synchronously on your application's CPU; investigate `SO_ZEROCOPY` or interrupt coalescing via `ethtool -C`
- `__pthread_mutex_lock` → the mutex is *uncontended*
