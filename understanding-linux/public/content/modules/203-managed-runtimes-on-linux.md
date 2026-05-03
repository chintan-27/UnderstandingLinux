---
id: 203
title: "Managed runtimes on Linux"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Managed runtimes — the JVM, .NET CLR, and Go's runtime — translate language-level abstractions into Linux syscalls. When a JVM heap expansion stalls, when a Go goroutine scheduler spins on a kernel thread, or when the OOM killer terminates a .NET process that looked healthy from inside the runtime, the failure is always at the Linux interface. A developer reading only heap dumps will miss the anonymous paging event that caused a 10-second GC pause. An operator reading only `free` output will misread 200 MB of reported free memory as safe when the JVM has 8 GB of committed-but-unresidented heap that will page-fault under load. The gap between runtime-visible memory and kernel-visible memory is where production incidents live.

---

## Core Concepts

### Virtual vs. Physical Memory — The Commitment Gap

When a runtime calls `mmap`, Linux does not back the allocation with physical DRAM under the default overcommit policy (`vm.overcommit_memory = 0`). The kernel records the virtual address range in the process's VMA list and returns immediately. Physical pages are allocated on first write, each triggering a **minor page fault** handled by `handle_mm_fault()` in `mm/memory.c`. The cost of that fault — TLB miss, page table walk, physical frame allocation — is paid once per 4 KB page, but it is paid at the worst possible time: inside an allocation hot path.

This creates a commitment gap. A JVM configured with `-Xmx4g` has 4 GB of virtual address space mapped but may have only 400 MB resident. That gap is not free memory — it is deferred physical allocation. If every committed page is touched before the system has enough physical frames, the OOM killer fires. The kernel tracks this exposure in `/proc/meminfo` as `Committed_AS` versus `CommitLimit`:

$$\text{CommitLimit} = \text{SwapTotal} + \text{MemTotal} \times \texttt{vm.overcommit\_ratio} / 100$$

When `Committed_AS > CommitLimit`, new `mmap` calls with swap reservation begin failing even if RAM appears available.

### Anonymous Memory, Swap, and Why Runtimes Disable It

Heap memory is **anonymous**: it has no backing file, so it cannot be discarded under pressure — it must be written to a swap device first. For a JVM heap whose working set spans gigabytes, reclaiming even a single GC generation's worth of pages means the kernel must write hundreds of megabytes to disk before a single frame is freed. A GC pause that the collector expects to take 50 ms can extend to 30 seconds while the kernel services swap I/O.

This is why large JVM and .NET deployments commonly set `vm.swappiness=0` or disable swap entirely:

```bash
# Disable swap for the current session
swapoff -a

# Permanent (add to /etc/sysctl.d/99-runtime.conf):
vm.swappiness = 0
```

With swap disabled, the OOM killer fires instead. A hard kill is preferable to a swap-induced pause storm because it produces a visible event (OOM log entry, process exit) rather than a silent degradation that persists for minutes.

### The Page Cache Competes for the Same Frames

Linux fills idle RAM with filesystem cache. When a managed runtime and the page cache compete for physical frames, the kernel arbitrates via `vm.swappiness`. Counterintuitively, the default value of 60 means the kernel will begin swapping anonymous heap pages *before* it fully reclaims page cache, because the cache reclaim cost is lower (clean file pages are simply discarded; dirty anonymous pages must be written to swap). If your JVM is swapping while `cached` in `/proc/meminfo` is nonzero, `vm.swappiness` is the lever:

```bash
# Current reclaim tendency
sysctl vm.swappiness

# Read page cache vs. anonymous reclaim pressure live
cat /proc/vmstat | grep -E 'pgswap|pgmajfault|pgscan'
```

### Managed Threads vs. Kernel Threads

Every Linux OS thread requires a `task_struct` (~7 KB), a kernel stack (8 KB default, set by `THREAD_SIZE`; overridable with `ulimit -s`), and a set of page table entries. Runtimes differ fundamentally in how many OS threads they create:

- **JVM (HotSpot)**: Each Java thread is a 1:1 POSIX thread, created via `clone(CLONE_VM | CLONE_FS | CLONE_FILES | CLONE_SIGHAND | CLONE_THREAD | CLONE_SETTLS | ...)`. A 500-thread JVM creates 500+ kernel-scheduled entities. `ps -eLf | grep java | wc -l` reflects reality.

- **Go**: M:N scheduling. Goroutines are user-space coroutines multiplexed over OS threads (`GOMAXPROCS` of them by default). The kernel sees at most `GOMAXPROCS + a handful of system threads` — typically 8–16 on a 16-core machine regardless of goroutine count. `ps -eLf | grep mygobin` will show far fewer threads than the application has concurrent goroutines.

- **.NET**: The CLR thread pool manages OS thread reuse. `async`/`await` continuations can resume on any pool thread, reducing thread count relative to concurrent operations, but each pool thread is still a kernel thread.

Thread stack memory compounds quickly. For a JVM with 500 threads, kernel stacks alone consume $500 \times 8\,\text{KB} = 4\,\text{MB}$ of unswappable kernel memory, plus $500 \times 1\,\text{MB}$ of default user-space stack virtual address space (though most is uncommitted). The virtual overhead is:

$$V_{\text{stacks}} = N_{\text{threads}} \times \texttt{-Xss} \quad \text{(default 512 KB–1 MB per thread on Linux)}$$

This is why `-Xss256k` is a common JVM tuning knob in thread-heavy applications.

### Stop-the-World Pauses Are Visible as Kernel Events

JVM stop-the-world (STW) pauses suspend all application threads at safepoints. HotSpot delivers safepoint requests via a combination of memory page protection (`mprotect` making the safepoint polling page non-readable) and `pthread_kill(tid, SIGPWR)` for threads that must be interrupted asynchronously. From the kernel's view during STW:

1. All JVM threads enter `TASK_INTERRUPTIBLE` or are spinning on the safepoint check.
2. CPU utilization for the process drops to near zero across all threads simultaneously.
3. The GC thread(s) run alone.

This signature is directly observable:

```bash
# Watch per-thread CPU utilization; STW appears as all threads going idle together
pidstat -t -p <jvm_pid> 1

# Confirm safepoint-related signals
perf trace -e signal:signal_deliver -p <jvm_pid> 2>&1 | grep -i sigpwr
```

---

## How It Works

### Memory Lifecycle for a JVM Heap

When you launch `java -Xms512m -Xmx4g`, HotSpot calls `mmap` for the maximum heap size upfront (with G1GC and ZGC the details differ, but the principle holds):

```c
// Simplified — actual call in os_linux.cpp uses MAP_NORESERVE to skip swap reservation
void *heap = mmap(NULL,
                  4ULL << 30,          // 4 GiB
                  PROT_READ | PROT_WRITE,
                  MAP_ANONYMOUS | MAP_PRIVATE | MAP_NORESERVE,
                  -1, 0);
// heap is a valid VA range; no physical pages allocated yet
```

`MAP_NORESERVE` tells the kernel not to charge swap space for this mapping. The JVM is betting that not all 4 GB will be simultaneously resident. The VMA entry is visible immediately:

```bash
# Confirm the mapping exists before any heap use
cat /proc/<pid>/maps | grep -E 'heap|[0-9a-f]{12}'

# smaps gives per-region residency
cat /proc/<pid>/smaps | awk '/^Size/{v+=$2} /^Rss/{r+=$2} END{printf "Virtual: %d kB\nRSS: %d kB\n", v, r}'
```

The first Java object allocated in a new heap page faults the kernel into `handle_mm_fault()`. For a fresh 4 GB heap, as the JVM warms up, you can watch RSS climb in real time:

```bash
while true; do
  awk '/VmRSS/{print $2}' /proc/<pid>/status
  sleep 0.5
done
```

The **resident set fraction** at any moment is:

$$\rho = \frac{\text{VmRSS}}{\text{VmSize}}, \quad \rho \in (0,\, 1]$$

A cold JVM may have $\rho \approx 0.05$. Under full load, $\rho \to 1$ for the active heap region. If $\rho \to 1$ system-wide across all processes and physical memory is exhausted, the kernel invokes the OOM killer. The OOM score for process $i$ is computed in `mm/oom_kill.c` as approximately:

$$\text{oom\_score}_i = \left\lfloor \frac{\text{RSS}_i + \text{swap}_i}{\text{MemTotal}} \times 1000 \right\rfloor + \texttt{oom\_score\_adj}_i$$

where `oom_score_adj` is in $[-1000, +1000]$. Setting `oom_score_adj = -1000` makes a process unkillable by the OOM killer; `+1000` makes it the first target.

```bash
# Protect a critical process from OOM kill
echo -500 > /proc/<pid>/oom_score_adj

# View current scores for all JVMs
for pid in $(pgrep java); do
  printf "PID %s
