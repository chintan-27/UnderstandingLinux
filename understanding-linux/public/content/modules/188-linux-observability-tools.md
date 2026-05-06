---
id: 188
title: "Linux observability tools"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Observability vs. Monitoring
Monitoring tells you *that* something happened (e.g., a CPU spike). Observability tells you *why* it happened by exposing the internal state that generated the symptom. In Linux this is achieved through three complementary mechanisms:

1. **Counters (metrics)** – incremental values that summarize discrete events over an interval.  
   *Why*: A counter lets you compute rates (events / second) without storing every occurrence, which is essential for high‑frequency phenomena like CPU cycles or packet drops.

2. **Tracing** – a time‑ordered record of individual events (often with timestamps and context).  
   *Why*: Only a trace can reveal causality, e.g., that a particular `write()` syscall preceded a disk‑I/O stall.

3. **Profiling** – statistical sampling of program counters (e.g., instruction pointer) to infer where time is spent.  
   *Why*: Sampling incurs far lower overhead than tracing every instruction while still providing a unbiased estimate of hot spots.

These pillars map onto Linux subsystems:
- Counters → `perf_event` hardware PMU registers exposed via `/sys/bus/event_source/devices/*/count`.
- Tracing → `tracefs` (mounted at `/sys/kernel/debug/tracing`) with tracepoints, kprobes, and uprobes.
- Profiling → `perf`’s `perf_record` which uses the `PERF_SAMPLE_IP` format.

### Key Definitions (with first‑principles justification)

- **Counter**: A monotonic integer $C(t)$ that increments by 1 each time an event $e$ occurs. The observable rate is $\dot C = \frac{dC}{dt}$. If events are Poisson with mean $\lambda$, the variance of $C$ over interval $T$ is $\lambda T$, showing why averaging over longer $T$ reduces relative error.

- **Tracepoint**: A statically placed probe in kernel code that, when hit, writes a fixed‑size record to a per‑CPU buffer. The record contains a timestamp $TSC$, an ID, and any arguments the developer chose to export. Because the probe is compile‑time, its overhead is deterministic (typically < 200 ns) and can be modeled as $O(1)$ per hit.

- **Kprobe/Uprobe**: Dynamic probes inserted via breakpoint (`int3`) or CPU debug registers. They allow instrumentation of any instruction without recompiling the kernel. The cost includes a trap‑to‑kernel round‑trip (~ 500 ns) plus the handler execution time.

- **Perf Event**: An abstraction over hardware performance monitoring units (PMU) and software counters. The kernel exposes them through the `perf_event_open()` syscall, which returns a file descriptor whose `read()` yields a snapshot of the counter values. The underlying hardware increments the counter each cycle (or per event) and the kernel periodically samples it via an NMI or interrupt, giving a *sampling* rather than a *census* view.

- **Ptrace**: The system call that underlies `strace` and `gdb`. It stops a target process on each signal (e.g., `SIGTRAP` from a syscall entry) and lets the tracer read/write registers and memory. The overhead per stopped event is roughly the cost of a context switch (~ 1–2 µs) plus the ptrace bookkeeping.

---

## How It Works
### Kernel Tracing Foundations
Linux provides two orthogonal tracing mechanisms that can be used independently or together:

1. **Static tracepoints** – defined with `TRACE_EVENT()` macros, compiled into the kernel. They appear under `/sys/kernel/debug/tracing/events/<sys>/<name>/`. Enabling a tracepoint writes a flag that causes the macro to expand to a call to `__tracepoint_<name>()`, which writes to the per‑CPU buffer via `trace_buffer_unlock_commit()`.

2. **Dynamic probes** – implemented via the `kprobe` and `uprobe` frameworks. A kprobe replaces the first byte of the target instruction with a breakpoint (`0xCC`). When hit, the CPU vectors to `int3` handler, which saves registers, invokes the registered handler, then restores the instruction and resumes execution. Uprobes work similarly but use user‑space memory breakpoints via `ptrace(PTRACE_POKEUSER, ...)` or `process_vm_writev()`.

Both mechanisms write to a **ring buffer** (`trace_buf`) that lives in per‑CPU memory to avoid lock contention. The reader (e.g., `trace cat`) consumes from the buffer via a `splice()`‑like interface, guaranteeing lock‑free producers and blocking consumers.

### Perf: From Hardware Counters to Software Abstraction
The `perf` tool sits on top of the `perf_event` subsystem:

```c
/* Simplified perf_event_open() argument structure */
struct perf_event_attr attr = {
    .type           = PERF_TYPE_HARDWARE,
    .size           = sizeof(attr),
    .config         = PERF_COUNT_HW_CPU_CYCLES,   /* or INSTRUCTIONS, CACHE_MISSES */
    .disabled       = 1,
    .exclude_kernel = 1,   /* count only user‑space if desired */
    .pinned         = 0,
    .exclude_hv     = 1,
};
int fd = perf_event_open(&attr, pid, cpu, -1, 0);
```

- When `fd` is opened, the kernel allocates a `perf_event` object and programs the underlying PMU (e.g., Intel’s `IA32_PMC0` MSR) to count the selected event.
- The kernel enables the counter via `perf_event_enable()` (triggered by the ioctl `PERF_EVENT_IOC_ENABLE` or by setting `.disabled=0` at open time).
- The hardware increments the MSR each occurrence; when the counter overflows (typically after $2^{41}$ cycles on modern CPUs), it generates a **performance‑monitoring interrupt (PMI)**. The PMI handler reads the counter value, stores it in a per‑CPU buffer, and optionally takes a snapshot of the instruction pointer (`PERF_SAMPLE_IP`) if sampling is enabled.
- A readers `read(fd, &buf, size)` copies the accumulated samples to user space. The overhead is dominated by the PMI frequency: setting a sample period of $P$ events yields an interrupt rate of $\frac{\text{event rate}}{P}$. Choosing $P$ too small increases overhead; too large reduces statistical accuracy.

### Ftrace: Function Tracing via the Tracefs Interface
Ftrace is activated by writing to tracefs control files:

```bash
# Enable the function tracer (calls __tracefunc_enter/exit on each function)
echo function > /sys/kernel/debug/tracing/current_tracer
# Filter to a specific module or function
echo __do_sys_open > /sys/kernel/debug/tracing/set_ftrace_filter
# Start tracing
echo 1 > /sys/kernel/debug/tracing/tracing_on
# Run workload
./my_program
# Stop tracing
echo 0 > /sys/kernel/debug/tracing/tracing_on
# Dump the trace
cat /sys/kernel/debug/tracing/trace
```

Each traced function entry/exit generates a record:
```
#   _raw_spin_lock_irqsave+0x1a/0x30
#   __do_sys_open+0x45/0x120
```
The timestamp is taken from the local CPU’s TSC (Time Stamp Counter) and converted to nanoseconds using the scaling factor in `/sys/devices/system/clocksource/clocksource0/available_clocksource`. The overhead per function call is roughly the cost of two extra `nop`‑sized branches plus the trace buffer write (≈ 150 ns on a modern Xeon).

### Strace / Ltrace: Syscall and Library Call Tracing via Ptrace
`strace` operates by repeatedly calling `ptrace(PTRACE_SYSCALL, pid, 0, 0)`:

1. Parent stops the child at the next syscall entry (`SIGTRAP`).
2. Parent reads registers (`PTRACE_GETREGS`) to extract syscall number and arguments.
3. Parent optionally prints the syscall name and args.
4. Parent resumes the child with `PTRACE_SYSCALL` again; the child runs until syscall exit, where another `SIGTRAP` occurs.
5. Parent reads the return value (`PTRACE_GETREGS`) and repeats.

The per‑syscall overhead is dominated by two context switches (kernel → tracer → kernel) and the `ptrace` bookkeeping, typically 1–3 µs on an idle system. `ltrace` works the same way but sets breakpoints on PLT entries of shared libraries (`PTRACE_POKETEXT` to insert `int3`), giving insight into library call frequency and arguments.

---

## Worked Examples
### Example 1: Precise CPU Cycle Count with `perf stat`
**Goal**: Measure the average cycles per iteration of a tight loop that increments a 64‑bit counter.

```c
/* loop.c */
#include <stdio.h>
int main(void) {
    volatile unsigned long long i = 0;
    for (i = 0; i < 100'000'000ULL; ++i) {}
    return 0;
}
```

Compile with `-O2 -march=native` to keep the loop:

```bash
gcc -O2 -march=native -o loop loop.c
```

Run `perf stat` requesting the raw cycle counter and the CPU frequency:

```bash
perf stat -e cycles,instructions,cache-misses,ref-cycles ./loop
```

Sample output (run on an Intel Xeon E5‑2680 v4 @ 2.4 GHz):

```
      1,203,456,789 cycles              #  50.1% of total time
        800,123,456 instructions        #  0.66 insn per cycle
          12,345,678 cache-misses       #  1.0% miss rate
      2,400,000,000 ref-cycles          # reference cycles (constant rate)
```

**Derivation**:
- The CPU’s nominal frequency is 2.4 GHz → 1 cycle = $0.4167\text{ ns}$.
- Total time ≈ $\frac{1.203\text{ Gcycles}}{2.4\text{ GHz}} = 0.501\text{ s}$.
- The loop executes 100 M iterations → cycles per iteration ≈ $\frac{1.203\text{ G}}{100\text{ M}} = 12.03$ cycles.
- With `-O2`, the loop body compiles to a single `add $1, %rax` and a `jne`, typically 2 µops; the measured 12 cycles reflects front‑end latency, branch misprediction penalty, and the loop counter dependency chain.

### Example 2: Ftrace Function Graph for Block I/O Latency
**Goal**: Visualize the time spent in the block layer (`blk_account_io_start` → `blk_account_io_done`) for a 4 MiB sequential write.

First, mount tracefs if not already:

```bash
mount -t tracefs nodev /sys/kernel/debug/tracing
```

Enable the function‑graph tracer and filter to the block subsystem:

```bash
echo function_graph > /sys/kernel/debug/tracing/current_tracer
echo blk_* > /sys/kernel/debug/tracing/set_ftrace_filter
echo 1 > /sys/kernel/debug/tracing/tracing_on
```

Run the workload (using `dd` with `oflag=direct` to bypass page cache):

```bash
dd if=/dev/zero of=/mnt/testfile bs=4M count=1 oflag=direct
```

Stop tracing and retrieve the graph:

```bash
echo 0 > /sys/kernel/debug/tracing/tracing_on
cat /sys/kernel/debug/tracing/trace > /tmp/blk_trace.txt
```

A snippet of the formatted output:

```
           0)               |  blk_account_io_start() {
           0)               |    blk_queue_bounce() {
           0)               |      __blk_queue_bounce() {
           0)               |        ...
           0)               |      }
           0)               |    }
           0)               |    blk_update_request() {
           0)               |      ...
           0)               |    }
           0)               |  } /* blk_account_io_start */
           0)               |  blk_account_io_done() {
           0)               |    blk_complete_request() {
           0)               |      ...
           0)               |    }
           0)               |  } /* blk_account_io_done */
           0)               |____
```

Each line is prefixed with the CPU number and a time delta (in microseconds) relative to the previous entry. By subtracting the timestamp at `blk_account_io_start` from that at `blk_account_io_done` we obtain the I/O service time. In this run the average delta was **84 µs**, matching the device’s advertised latency for sequential writes.

**Why this works**: The function‑graph tracer uses a combination of `ftrace` function entry/exit tracepoints and a per‑CPU depth counter to reconstruct call stacks without unwinding the stack at runtime, keeping overhead under 300 ns per function call.

### Example 3: Ltrace of `malloc`/`free` in a Multi‑Threaded Allocator
**Goal**: Count how many allocations each thread performs in a simple benchmark that spawns 4 threads, each allocating 1 M small objects.

Compile with `-g -pthread`:

```bash
gcc -O2 -pthread -o alloc alloc.c
```

Run `ltrace` with `-c` (count) and `-T` (show time spent) while filtering to `malloc` and `free`:

```bash
ltrace -c -T -e malloc,free ./alloc
```

Sample output:

```
        function call  count        time
                     malloc   4,000,000   0.12s
                      free   4,000,000   0.09s
```

The total time spent in `malloc`+`free` is 0.21 s, i.e., **52 ns per allocation** on average (including internal locking). By adding `-f` to follow child threads we can see per‑thread counters, revealing that the allocator’s internal mutex caused ~ 15 ns of contention per operation.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Assuming `perf stat -a` counts only user‑space** | `-a` enables system‑wide mode, counting *both* kernel and user events unless filtered. | If you attribute a high cycle count to your application while the kernel (e.g., interrupt handling) dominates, you’ll mis‑optimize the wrong code. |
| **Using `strace` without `-f` on multithreaded programs** | `strace` follows only the initial thread; other threads are invisible. | Missing syscalls leads to incorrect conclusions about I/O patterns or synchronization bugs. |
| **Treating counter values as additive across CPUs without scaling** | Reading `perf_event_open()` on each CPU yields a per‑CPU counter; summing them without considering CPU frequency differences can distort rates. | On systems with heterogeneous CPUs (big.LITTLE) or frequency scaling, a naïve sum over‑counts slower cores and under‑counts faster ones. |
| **Believing that `ftrace` function tracer adds negligible overhead** | Each traced function incurs a fixed ~ 150 ns penalty plus possible cache effects; on a tight loop this can be 5‑10 % overhead. | Overhead can change the very behavior you’re measuring (e.g., making a spinlock appear slower). |
| **Using `perf record` with a sample period of 1** | Setting the sampling period to the minimum (1 event) forces an interrupt on every event, causing massive overhead and lost events. | The resulting data is skewed; many samples are dropped, and the perturbation can change timing characteristics dramatically. |
| **Confusing tracepoints with kprobes for syscall tracing** | Tracepoints exist only at predefined locations; kprobes can be placed anywhere but are heavier. | Using a tracepoint where none exists leads to silent failure (no data); using a kprobe where a tracepoint suffices adds unnecessary overhead. |

---

## Exercises
### Easy
1. **Baseline Measurement** – Run `perf stat -e cycles,instructions ./bin/true` and report the cycles per invocation. Explain why the number is non‑zero despite the program doing almost nothing.  
2. **Strace Syscall Summary** – Execute `strace -c -f sleep 1` and list the top three syscalls by count. What does this tell you about how `sleep` is implemented?

### Medium
3. **Perf Hotspot Identification** – Write a C program that computes the first 10 million Fibonacci numbers iteratively (using 64‑bit integers). Build with `-O2 -march=native`. Use `perf record -g ./fib` then `perf report` to locate the function consuming the most cycles. Relate the result to the generated assembly.  
4. **Ftrace Block Layer Latency** – Using the function‑graph tracer, measure the average time spent in `blk_account_io_start` → `blk_account_io_done` for a random read workload (`fio --randread=1 --ioengine=libaio --bs=4k --numjobs=4 --runtime=30`). Plot the latency histogram (you can extract timestamps with a simple awk script).  

### Hard
5. **Correlating PMU Samples with Source Lines** – Run `perf record -e cycles:pp -g ./fib` (period‑based sampling with a period of 100 k cycles). Use `perf annotate` to view the annotated source of the hotspot. Explain how the sample period influences the precision of the line‑level attribution and compute the expected confidence interval given the observed sample count.  
6. **Dynamic Probe Overhead Experiment** – Insert a kprobe on `__do_sys_open` that increments a per‑CPU counter each hit. Use `perf stat -e cycles` to measure the overhead of the probe itself by comparing a baseline run (no probe) with the probe active. Derive the probe overhead per event from the difference in total cycles and the number of syscalls observed (via `tracepoint:syscalls:sys_enter_openat`).  

---

## Linux Connection
### Subsystems and Files You’ll Use Daily
| Subsystem | Path / Interface | Typical Use |
|-----------|------------------|-------------|
| **Perf Events** | `/sys/bus/event_source/devices/*` (lists PMU types) <br> `perf_event_open(2)` syscall <br> `/proc/<pid>/perf_event/*` (per‑process event fd) | Low‑overhead hardware counter access; basis of `perf` tool. |
| **Tracefs (Ftrace)** | Mounted at `/sys/kernel/debug/tracing` <br> Events: `/sys/kernel/debug/tracing/events/<sys>/<name>/` <br> Tracing control: `tracing_on`, `current_tracer`, `set_ftrace_filter` | Kernel‑level function tracing, tracepoints, kprobe/uprobe management, latency histograms. |
| **Procfs Process Info** | `/proc/<pid>/stat` (utime, stime, minflt, majflt) <br> `/proc/<pid>/fd/` (open file descriptors) <br> `/proc/<pid>/smaps` (memory layout) | Quick per‑process metrics; often combined with `perf` for correlation. |
| **Debugfs (Kprobes/Uprobes)** | `/sys/kernel/debug/tracing/kprobe_events` <br> `/sys/kernel/debug/tracing/uprobe_events` | Dynamically insert probes without recompiling kernel or modules. |
| **Syscall Tracepoint** | `/sys/kernel/debug/tracing/events/syscalls/sys_enter_*` <br> `/sys/kernel/debug/tracing/events/syscalls/sys_exit_*` | Low‑overhead syscall entry/exit tracing (used by `strace` under the hood when `-f` is not needed). |
| **BPF (Optional Advanced)** | `/sys/fs/bpf/` <br> `bpftrace` or `bcc` tools | User‑definable, safe, in‑kernel programs for custom metrics; can attach to tracepoints, kprobes, uprobes. |

### Ready‑to‑Run Commands
```bash
# 1. List available PMU events on this CPU
ls /sys/bus/event_source/devices/

# 2. Count CPU cycles for a specific PID over 5 seconds
perf stat -e cycles -p $(pidof my_program) sleep 5

# 3. Enable a tracepoint for block I/O completion and watch it live
echo 1 > /sys/kernel/debug/tracing/events/block/block_rq_complete/enable
cat /sys/kernel/debug/tracing/trace_pipe   # consumes live trace

# 4. Attach a kprobe to sys_openat and print a message each hit
echo 'p:myprobe __do_sys_openat dfd=%dx filename=%+sflags=%dx mode=%dx' > \
    /sys/kernel/debug/tracing/kprobe_events
echo 1 > /sys/kernel/debug/tracing/events/kprobes/myprobe/enable
cat /sys/kernel/debug/tracing/trace   # shows formatted arguments

# 5. Use bpftrace to count malloc calls per second (requires root)
bpftrace -e 'tracepoint:libc:malloc { @[comm] = count(); }'
```

These commands demonstrate the real pathways from concept to observable data on a modern Linux distribution.

---

## Why This Matters
Observability turns opaque system behavior into measurable, actionable data. By mastering the three pillars—counters, tracing, and profiling—you can:

* **Quantify** the cost of a micro‑optimization (e.g., replacing a spinlock with a seqlock) using precise cycle counters from `perf`.
* **Diagnose** intermittent latency spikes by correlating function‑graph traces with block I/O latency histograms, revealing whether the kernel or the device is the bottleneck.
* **Validate** performance models: the derived formula $T = \frac{\text{cycles}}{\text{freq}}$ lets you translate raw PMU counts into wall‑clock time, making cross‑architecture comparisons meaningful.
* **Avoid** costly mistakes: knowing the overhead of each tool lets you choose the right sampling period, decide when to use `-f` with `strace`, and recognize when a tracepoint is sufficient versus when a kprobe is needed.
* **Scale** from a single‑core microbenchmark to a production cluster: the same interfaces (`perf_event_open`, tracefs, `/proc/*/stat`) exist on every Linux box, letting you build scripts that collect consistent metrics across environments.

In short, proficiency with Linux observability tools transforms guesswork into engineering. It equips you to prove, not just assert, that a change improves performance, to locate the exact line of code responsible for a stall, and to predict how a system will behave under load before it ever reaches production. This depth is the foundation for advanced work in performance analysis, capacity planning, and reliable systems engineering.
