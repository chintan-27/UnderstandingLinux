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

## Why This Matters

A system that appears healthy can be silently hemorrhaging performance — CPUs stalled waiting on memory, disks saturated while processes queue, kernel functions called millions of times per second burning cycles you cannot account for. Without observability tools, you can see that a service is slow but cannot locate *where* the time goes. The tools in this module form a hierarchy from coarse (system-wide counters sampled every second) to surgical (tracing every call to a specific kernel function with nanosecond timestamps). Choosing the wrong layer wastes time; choosing no layer means guessing at root causes.

---

## Core Concepts

### The Observability Stack

Every tool operates at a specific depth. The depth determines what the tool can see, what it cannot see, and what it costs to run it.

| Layer | Tools | What it sees | Overhead |
|---|---|---|---|
| Counters (polled) | `ps`, `top`, `vmstat`, `iostat`, `sar` | Pre-aggregated kernel statistics | Negligible |
| Sampling | `perf record` | Statistical snapshots of CPU instruction pointer + callchain | Low (~1%) |
| Tracing (static) | `strace`, `ltrace`, `perf trace` | Every syscall or library call | High for `strace` |
| Tracing (dynamic) | `perf`, `ftrace`, `eBPF` | Arbitrary kernel/user functions via kprobes/uprobes | Tunable |

Start at the top. Counter tools answer "is there a problem?" Tracing tools answer "exactly where is the problem?" Jumping straight to `strace` on a busy process is how you make a slow process slower.

### Counters vs. Tracing

**Counters** are maintained continuously by the kernel, independent of whether anyone is reading them. The scheduler increments `utime` and `stime` in the `task_struct` on every context switch. The block layer updates `iostats` on every I/O completion. Reading `/proc/stat` or `/proc/diskstats` costs a memory read — it does not trigger any measurement. Tool overhead scales with *read frequency*, not with system activity.

**Tracing** instruments a code path. When a kprobe fires on `vfs_read()`, the CPU must: take a breakpoint trap, save registers, execute the handler, restore state, and resume. Every traced event consumes CPU proportional to *how often that event fires*. Tracing `vfs_read()` on a file server handling 100k IOPS adds real overhead. Tracing `mount()` on the same server is essentially free because `mount()` fires a handful of times per day. The cost is not in the tool — it is in the event rate.

### Sampling and the Nyquist Constraint

`perf record -F 99` works by sending `SIGPERF` to the CPU at a fixed rate via a hardware performance counter overflow. On each interrupt, the kernel records the current instruction pointer and unwinds the call stack into a ring buffer. This is statistical sampling: a function consuming 10% of CPU time will appear in approximately 10% of samples.

This creates a fundamental blind spot. If a function has a latency of $T_f$ and you sample at frequency $F$, the expected number of samples capturing one invocation is:

$$E[\text{samples per call}] = F \times T_f$$

For $T_f = 50\,\mu s$ and $F = 99\,\text{Hz}$:

$$E = 99 \times 50 \times 10^{-6} \approx 0.005 \text{ samples per call}$$

You will miss the vast majority of invocations. Sampling answers *where time accumulates across many calls*, not *that a specific event occurred*. For the latter, use tracing.

The kernel self-protects against excessive sampling overhead by capping the rate. The cap is tunable but enforced:

```bash
sysctl kernel.perf_event_max_sample_rate   # default: 100000
```

The implicit model is:

$$\text{overhead} \approx \frac{F \times C_{\text{sample}}}{f_{\text{CPU}}} \times 100\%$$

where $C_{\text{sample}}$ is the cycle cost of one sample collection (typically 1000–5000 cycles) and $f_{\text{CPU}}$ is clock frequency. At 100 kHz sampling on a 3 GHz CPU with $C_{\text{sample}} = 3000$ cycles, overhead is roughly 10% — the upper bound the kernel tries to avoid crossing.

### kprobes, uprobes, and USDT

These are the hook mechanisms that all dynamic tracers use as their event sources.

**kprobes** work by patching a kernel instruction with a breakpoint (`int3` on x86). When the CPU hits it, the trap handler calls your registered handler before (kprobe) or after (kretprobe) the function executes. The kernel restores the original instruction from a saved copy. Any non-inlined kernel function is a valid target. Inlined functions disappear at compile time and cannot be probed this way.

**uprobes** apply the same mechanism to user-space binaries. The kernel patches the target process's page (triggering copy-on-write if the page is shared), inserting an `int3`. This is why uprobes affect only processes that execute the patched code — other processes sharing the library are not affected until they also hit the probe point.

**USDT** (Userland Statically Defined Tracing) probes are compiled into the binary as `nop` instructions at designated probe sites, with ELF notes (`.note.stapsdt` section) describing their locations and argument types. At runtime they are NOPs — zero overhead when disabled. When a tracer activates a USDT probe, it patches the NOP to an `int3` via the uprobe mechanism. The advantage over raw uprobes is stability: USDT probe names are part of a library's API contract and do not break across recompilations that shift instruction offsets.

```bash
# List USDT probes in libc
readelf -n /lib/x86_64-linux-gnu/libc.so.6 | grep -A3 stapsdt | head -40

# List USDT probes via perf
perf list | grep sdt
```

`perf`, `ftrace`, and `eBPF` all consume these three hook types as event sources. They are the substrate — the tools above them differ in how they process and aggregate the resulting data.

---

## How It Works

### `ps` and `top`: Reading /proc

`ps` and `top` are `/proc` parsers. For a process with PID 1234, the relevant files are:

```bash
/proc/1234/stat       # 52 space-separated fields: PID, state, ppid, CPU ticks, ...
/proc/1234/statm      # 7 fields: size, resident, shared, text, lib, data, dirty (in pages)
/proc/1234/status     # Human-readable superset of stat/statm
/proc/1234/fd/        # Symlinks to open file descriptors
/proc/1234/maps       # Virtual memory areas with permissions and backing files
/proc/1234/smaps      # Per-VMA memory stats including PSS, swap usage
```

`top` computes CPU percentage by reading `/proc/PID/stat` twice, separated by its refresh interval $\Delta t$, then computing:

$$\%\text{CPU} = \frac{(\Delta\text{utime} + \Delta\text{stime}) \times 100}{\Delta\text{total\_ticks}}$$

where `utime` (field 14) and `stime` (field 15) are in scheduler ticks (typically $10\,ms$ each on `HZ=100` kernels), and `total_ticks` is the elapsed time in the same units across all CPUs.

```bash
# Read raw stat fields for the current shell
cat /proc/$$/stat

# Extract utime and stime directly
awk '{print "utime="$14, "stime="$15, "ticks"}' /proc/$$/stat

# Compute ticks-per-second on this kernel
getconf CLK_TCK
```

The per-CPU accounting happens in `account_user_time()` and `account_system_time()` in `kernel/sched/cputime.c`. What `top` shows as "CPU%" is already aggregated — it tells you a process is consuming CPU, not *which CPU code path* it is executing. That requires sampling.

### `vmstat`: Memory and CPU Pressure

`vmstat` reads from `/proc/vmstat` (per-event VM counters) and `/proc/stat` (CPU aggregates). Its value is in the combination: CPU saturation and memory pressure often co-occur and must be read together.

```bash
vmstat 1 5          # 1-second intervals, 5 samples
```

```
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2  0      0 1823456  94332 3412780    0    0     1    12   47  102  5  2 93  0  0
 4  0      0 1820100  94332 3412780    0    0     0     0  312  841 18  4 78  0  0
```

Key columns and their causal interpretations:

- **`r`**: Run queue length — processes in `TASK_RUNNING` state waiting for a CPU. If $r > \text{nCPU}$ consistently, you have CPU saturation. The excess $r - \text{nCPU}$ processes are waiting, not running.
- **`b`**: Processes in uninterruptible sleep (`TASK_UNINTERRUPTIBLE`), typically blocked on I/O or a kernel lock. A persistently non-zero `b` with high `wa` points to I/O saturation.
- **`si`/`so`**: Swap-in and swap-out pages per second. `so > 0` means the kernel is evicting anonymous pages to the swap device because the working set exceeds physical RAM — this is the transition from memory pressure to memory thrashing.
- **`cs`**: Context switches per second, sourced from `/proc/stat` field `ctxt
