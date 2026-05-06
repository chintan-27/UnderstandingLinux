---
id: 170
title: "Cache coherence"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Why Cache Coherence Exists
In a symmetric multiprocessor (SMP) system each core has its own private L1/L2 cache backed by a coherent memory subsystem. Without a coherence protocol, two cores could simultaneously hold different values for the same memory address, breaking the **sequential consistency** model that most programming languages (C/C++, Rust, Java) assume. The protocol must guarantee that after a store becomes visible to any core, all later loads observe that store (or a later one). This requirement leads to a finite‑state machine that tracks, per cache line, whether the line is **exclusively owned**, **shared read‑only**, or **invalid**.

### MESI States – First‑Principle Derivation
Consider a single cache line *L* that can be held by *n* cores. Define three propositions:
- **M** (Modified): *L* is dirty in exactly one cache and not present elsewhere.
- **E** (Exclusive): *L* is clean in exactly one cache and not present elsewhere.
- **S** (Shared): *L* is clean and may be present in any number (≥1) of caches.
- **I** (Invalid): the cached copy is stale and must not be used.

From the definition of *exclusivity* we obtain the invariant:
\[
\#(\text{caches holding L in state } \{M,E\}) \le 1.
\]
If a core wishes to write to *L*, it must first ensure it holds the line in a state that permits exclusive write access (M or E). If another core already holds *L* in S, the writer must obtain exclusive ownership by sending an **Invalidate** transaction, forcing all other copies to I. Conversely, a core may only keep a line in S if it knows that no other core has the line in M/E (otherwise a silent overwrite would occur). These invariants give rise to the MESI transition table shown later.

### False Sharing – Quantitative View
Let the cache line size be \(C\) bytes (typically 64). Suppose two unrelated variables *a* and *b* are placed at offsets \(\delta_a\) and \(\delta_b\) within the same line, with \(|\delta_a-\delta_b| < C\). If core 0 repeatedly writes *a* and core 1 repeatedly writes *b*, each write incurs a coherence transaction because the line’s state toggles between M/E (owner) and I in the other core. The **traffic per iteration** is:
\[
T_{\text{fs}} = 2 \times (\text{BusLatency} + \text{DataTransfer}),
\]
where the factor 2 accounts for the invalidate‑fetch pair. If the variables were padded to separate lines (\(|\delta_a-\delta_b| \ge C\)), each core could operate on its own line with zero inter‑core traffic, reducing \(T_{\text{fs}}\) to zero. Hence false sharing is a problem of **poor spatial locality** relative to the coherence granule.

### Cache Line Bouncing – Mechanism
When a single variable *x* resides in a line and two cores repeatedly execute:
```
core0: x = v0;
core1: x = v1;
core0: x = v2;
...
```
Each write forces the line into the Modified state in the writer’s cache and sends an **Invalidate** to the other core. The other core, on its next read, must issue a **ReadExclusive** (or Read + Invalidate) to obtain ownership, causing the line to bounce. The ping‑pong cost per pair of stores is:
\[
T_{\text{bounce}} = 2 \times (\text{ReadExclusiveLatency} + \text{DataTransfer}) + 2 \times (\text{InvalidateLatency}).
\]
If the inter‑core latency is \(L_{cc}\) and the data transfer per line is \(C/B\) (where B is bus bandwidth), the overhead scales linearly with the number of iterations.

---

## How It Works
### MESI Protocol – Transaction Types
| Transaction | Initiator | Meaning |
|-------------|-----------|---------|
| **BusRd**   | Core      | Request a clean copy (for read). |
| **BusRdX**  | Core      | Request exclusive ownership (for write). |
| **Invalidate**| Core   | Notify others to drop shared copies. |
| **WriteBack**| Core    | Evict a dirty line to memory. |

### State Transition Table (Core‑centric)
| Current State | BusRd (other) | BusRdX (other) | Local Read | Local Write |
|---------------|---------------|----------------|------------|-------------|
| **M**         | Supply data, →S | Supply data, →I | Hit (M)    | Hit (M)     |
| **E**         | Supply data, →S | Assert dirty? →I (then supply) | Hit (E) | →M |
| **S**         | Supply data, stay S | Assert dirty? →I (then supply) | Hit (S) | →M (via BusRdX) |
| **I**         | Fetch from mem or owner →S/E | Fetch from mem or owner →M | Miss → load (S/E) | Miss → BusRdX →M |

*Why each transition?*  
- **BusRd** from another core forces the holder to supply the most recent value; if the holder is Modified it must write‑back before supplying, leaving the line Shared in both caches.  
- **BusRdX** demands exclusive ownership; any Shared or Modified holder must invalidate (or write‑back then invalidate) to respect the single‑writer rule.  
- **Local Write** in E can upgrade to M silently because no other core holds a copy; in S or I the core must first obtain exclusive rights via BusRdX.

### Performance Model – AMAT with Coherence Overhead
The average memory access time for a core executing a mix of reads (\(r\)) and writes (\(w\)) is:
\[
\text{AMAT}=t_{\text{hit}} + r\cdot p_{\text{miss}}^{R}\cdot t_{\text{miss}}^{R} + w\cdot p_{\text{miss}}^{W}\cdot t_{\text{miss}}^{W},
\]
where each miss penalty now includes coherence latency:
\[
t_{\text{miss}}^{R}= t_{\text{bus}} + t_{\text{transfer}} + \underbrace{t_{\text{invalidate}}}_{\text{if line in M elsewhere}},
\]
\[
t_{\text{miss}}^{W}= t_{\text{bus}} + t_{\text{transfer}} + \underbrace{t_{\text{invalidate}}}_{\text{owner}\to\text{I}} + \underbrace{t_{\text{writeback}}}_{\text{if owner dirty}}.
\]
If the probability that a line is remotely Modified is \(p_M\), the write miss penalty grows by \(p_M \cdot (t_{\text{writeback}}+t_{\text{invalidate}})\). Reducing \(p_M\) (by improving data locality or using private data) directly lowers AMAT.

---

## Worked Examples
### Example 1: MESI Transfer – Detailed Timing
Assume:
- L1 hit time \(t_{\text{hit}} = 1\) ns.
- Bus latency (request→grant) \(t_{\text{bus}} = 50\) ns.
- 64‑byte line transferred at 16 GB/s ⇒ \(t_{\text{transfer}} = 64\text{ B} / (16\text{ GB/s}) = 4\) ns.
- Invalidate latency \(t_{\text{inv}} = 20\) ns.
- Write‑back latency (dirty line to memory) \(t_{\text{wb}} = 30\) ns.

**Scenario:** Two cores, P1 and P2, share line *L* initially in **Shared (S)** in both caches.

| Step | Action | State Change | Bus Transaction | Time (ns) |
|------|--------|--------------|-----------------|-----------|
| 0    | Initial | P1:S, P2:S | – | 0 |
| 1    | P1 writes *x* | P1:M, P2:I (P2 invalidated) | **BusRdX** from P1 → memory supplies line, P2 sees Invalidate | \(t_{\text{bus}}+t_{\text{transfer}} = 54\) |
| 2    | P2 reads *x* | P2:S, P1:M (supplies data) | **BusRd** from P2 → P1 supplies data, both →S | \(t_{\text{bus}}+t_{\text{transfer}}+t_{\text{inv}} = 50+4+20 = 74\) |
| 3    | P1 writes *x* again | P1:M, P2:I | **BusRdX** from P1 (same as step 1) | 54 ns |

**Total for two write‑read cycles:** \(2 \times (54+74) = 256\) ns.  
If the line were **Exclusive** in P1 initially (no other sharer), step 1 would be a silent **E→M** transition (0 ns), cutting the first write cost to zero.

### Example 2: False Sharing – Numerical Impact
```c
/* false_sharing.c */
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <unistd.h>
#include <x86intrin.h>   /* for _mm_clflush */

#define ITER 100'000'000UL
#define PAD 64   /* cache line size */

struct { int counter; char pad[PAD - sizeof(int)]; } shared[2];
/* shared[0] and shared[1] are guaranteed to be in different lines */

void *worker(void *arg) {
    int id = (intptr_t)arg;
    for (size_t i = 0; i < ITER; ++i) {
        __atomic_add_fetch(&shared[id].counter, 1, __ATOMIC_RELAXED);
    }
    return NULL;
}

int main(void) {
    pthread_t t0, t1;
    pthread_create(&t0, NULL, worker, (void*)0);
    pthread_create(&t1, NULL, worker, (void*)1);
    pthread_join(t0, NULL);
    pthread_join(t1, NULL);
    printf("counters: %d %d\n", shared[0].counter, shared[1].counter);
}
```
If we **remove** the padding (`struct { int counter; } shared[2];`), both `counter`s fall into the same 64‑byte line. On a 2‑core Xeon (L3 latency ≈ 40 ns, bus ≈ 100 ns), each `__atomic_add_fetch` triggers a **BusRdX** + invalidate pair ≈ 150 ns. With `ITER = 10⁸`, the serialized time ≈ 30 s. With padding, each core works on its own line → only local L1 hits (≈1 ns per atomic) → total ≈ 0.2 s. The slowdown factor is > 100×, directly attributable to false sharing.

### Example 3: Cache Line Bouncing – Step‑by‑Step
```c
/* bounce.c */
#include <pthread.h>
#include <stdatomic.h>
#include <unistd.h>

atomic_int x = ATOMIC_VAR_INIT(0);
#define ITER 50'000'000UL

void *inc(void *arg) {
    for (size_t i = 0; i < ITER; ++i) {
        atomic_fetch_add_explicit(&x, 1, memory_order_relaxed);
    }
    return NULL;
}

int main(void) {
    pthread_t a, b;
    pthread_create(&a, NULL, inc, NULL);
    pthread_create(&b, NULL, inc, NULL);
    pthread_join(a, NULL);
    pthread_join(b, NULL);
    printf("final x = %d\n", atomic_load_explicit(&x, memory_order_relaxed));
}
```
Each `fetch_add` issues a **BusRdX** (to gain ownership) followed by an **Invalidate** to the other core. Assuming:
- BusRdX latency = 80 ns (request + data transfer),
- Invalidate latency = 20 ns,
- Core can issue next instruction after the invalidate completes (store buffer drains).

Time per increment ≈ 100 ns → total ≈ 10 s for 10⁸ increments on two cores. If the variable were thread‑local (each core had its own copy), the operation would be a plain register increment (~0.5 ns) → total ≈ 0.05 s, a 200× slowdown purely from bouncing.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Using `volatile` for inter‑thread communication** | `volatile` only prevents compiler reordering; it does **not** emit memory barriers or guarantee atomicity. | On x86, a volatile load/store may still be reordered w.r.t. other atoms by the CPU store buffer, leading to lost updates or stale reads. Correct solution: use C11 `_Atomic` or compiler intrinsics with explicit memory_order. |
| **Assuming a lock makes data private** | A lock protects the *critical section* but data accessed **outside** the lock (e.g., per‑iteration temporaries) can still cause false sharing if they share a cache line with lock variables. | The lock variable’s line bounces on each lock/unlock, adding overhead even when the protected data is disjoint. Fix: align lock to its own cache line (`alignas(64) pthread_mutex_t m;`). |
| **Padding structures incorrectly** | Adding padding after a field does not guarantee the next field starts on a new line if the compiler inserts tail‑padding or the struct is part of an array. | Example: `struct { char a[3]; char pad[61]; int b; } arr[N];` still places `b` of element *i* and `a` of element *i+1* in the same line due to array stride. Correct: compute stride (`sizeof(struct)`) and ensure it is a multiple of line size, or use `alignas(64)` on the whole struct. |
| **Over‑using memory fences (`mfence`) inside tight loops** | Each fence serializes the store buffer, destroying the CPU’s ability to hide latency. | In a producer‑consumer ring buffer, placing `mfence` after every store adds ~30 ns per operation, turning a ~1 ns operation into a tens‑of‑nanoseconds one. Use release/acquire semantics (`atomic_store_explicit(..., memory_order_release)`) which compile to cheaper `lfence`/`sfence` on x86 or no fence at all when hardware guarantees ordering. |
| **Ignoring NUMA effects** | Assuming all memory accesses have uniform latency; on NUMA nodes remote memory can be 2‑3× slower. | A thread that allocates memory on node 0 but runs on node 1 will incur remote latency for every cache miss, amplifying coherence traffic. Remedy: bind threads to nodes (`numactl --cpunodebind=0 --membind=0 ./prog`) or use first‑touch allocation (`malloc` + touch) to allocate local memory. |

Each mistake stems from a misunderstanding of the **hardware contract** (coherence, ordering, locality). Recognizing the underlying cause prevents superficial fixes.

---

## Exercises
### Easy
1. **Cache line size detection** – Write a C program that prints the L1 data cache line size using `sysconf(_SC_LEVEL1_DCACHE_LINESIZE)` and verifies it by measuring the stride at which two adjacent array accesses incur equal latency (use `rdtsc` loop).  
2. **Alignment verification** – Allocate two structures with `aligned_alloc(64, sizeof(struct))` and confirm, via `uintptr_t addr % 64 == 0`, that they start on cache‑line boundaries.  

### Medium
3. **False sharing benchmark** – Implement the `false_sharing.c` example above. Run it twice: (a) without padding, (b) with 64‑byte padding. Use `time` or `clock_gettime` to report elapsed seconds. Compute the speedup and relate it to the coherence traffic formula derived earlier.  
4. **Perf‑based coherence counter** – On a Linux machine with `perf` installed, run:  
   ```bash
   perf stat -e cache-misses,cache-references,bus-cycles -r 5 ./false_sharing_no_pad
   perf stat -e cache-misses,cache-references,bus-cycles -r 5 ./false_sharing_pad
   ```  
   Explain how the `bus-cycles` counter reflects the extra traffic caused by false sharing.

### Hard
5. **MESI simulator** – Write a single‑threaded C program that simulates the MESI finite‑state machine for two cores processing a trace of reads/writes (provided as a file). The simulator should output the number of BusRd, BusRdX, Invalidate, and WriteBack transactions. Validate the output against a known trace (e.g., the worked example).  
6. **Kernel‑level cache line flush** – Create a loadable kernel module that exports a syscall (`sys_flush_line(void *addr)`) which executes the `clflush` instruction on the supplied address. Use the module to flush a user‑space buffer and measure the impact on subsequent access latency with `rdtsc`. (Note: require root and `CONFIG_X86`.)  
7. **NUMA‑aware false sharing experiment** – On a dual‑socket machine, bind two threads to different sockets using `pthread_setaffinity_np`. Run the false sharing benchmark with and without padding, and compare the bus‑traffic increase when the shared line resides in remote memory versus local memory (use `numastat` or `perf` offcore events).  

---

## Linux Connection
### Where Coherence Lives in the Kernel
* The **hardware** implements MESI (or variants like MOESI) – the kernel does **not** run a software coherence protocol.  
* Linux provides architecture‑specific helpers that expose the underlying cache hierarchy and allow software to issue cache‑maintenance instructions:
  * `arch/x86/include/asm/msr.h` – MSR interfaces for reading cache configuration.
  * `arch/x86/kernel/cpu/cache.c` – Functions like `x86_cpu_init_apicid()`, `detect_cache_sizes()`, and macros for `clflush`, `wbnoinvd`.
  * The **sysfs** hierarchy under `/sys/devices/system/cpu/cpu*/cache/index*/` exposes:
    * `size` – cache size in KB.
    * `ways` – associativity.
    * `line_size` – coherency line size (always 64 B on x86_64).
    * `shared_cpu_map` – bitmap of cores sharing this cache (useful for detecting private vs shared L1/L2).

### Runnable Commands
```bash
# Show L1d line size for each core
for c in /sys/devices/system/cpu/cpu[0-9]*; do
    echo -n "CPU${c#*/cpu}: ";
    cat $c/cache/index0/line_size;
done

# Display cache hierarchy (requires lstopo from hwloc)
lstopo-no-graphics --of txt

# Measure cache miss rate while running a false‑sharing binary
perf stat -e cache-misses,cache-references,instructions,uops_retired.all ./false_sharing_no_pad 2>&1 | grep -E 'cache-(misses|references)'

# Flush a specific cache line from user space (x86)
#include <x86intrin.h>
void flush_line(void *p) {
    _mm_clflush(p);   // emits clflush instruction
}
```
*Example usage in a test program*:
```c
#include <stdio.h>
#include <x86intrin.h>
#include <unistd.h>

int main(void) {
    int arr[1024];
    flush_line(&arr[0]);          // ensure line not in cache
    usleep(10);                   // small delay
    unsigned long long t0 = __rdtscp(&aux);
    int x = arr[0];               // load → miss → fill line
    unsigned long long t1 = __rdtscp(&aux);
    printf("Load latency ≈ %d cycles\n", (int)(t1 - t0));
    return 0;
}
```
Compile with: `gcc -O2 -march=native -latomic test_flush.c -o test_flush`.

### Kernel Tunables Related to Coherency
* `/proc/sys/vm/drop_caches` – dropping clean caches does **not** affect coherence state but can be used to clear polluted lines for benchmarking.
* `kernel.nmi_watchdog` – disabling the watchdog reduces spurious coherence traffic from periodic NMIs on some platforms.
* `intel_idle.max_cstate` – deeper C‑states may flush caches; adjusting can change coherence overhead for idle‑heavy workloads.

---

## Why This Matters
Modern server CPUs now ship with **32‑64 cores per socket**, each core equipped with private L1/L2 caches sharing a unified L3. As core count rises, the probability that two unrelated threads touch the same cache line grows quadratically with the number of active threads if data is not carefully laid out. Every unnecessary coherence transaction consumes **finite bus bandwidth**, adds latency, and stalls the store buffer, directly inflating the **AMAT** formula we derived.  

*False sharing* turns embarrassingly parallel workloads into serial‑bound ones, often with slowdowns of **10‑100×**. *Cache line bouncing* turns a simple increment into a prolonged ping‑pong that can saturate the memory subsystem and increase energy consumption.  

Understanding the **MESI state machine** lets developers:
- Reason about when a write will be silent (E→M) versus expensive (I→M via BusRdX).
- Arrange data so that each core works on **exclusive** lines (`alignas(64)`, per‑CPU allocation, or thread‑local storage).
- Choose the correct memory‑ordering semantics (`memory_order_release/acquire`) instead of heavy fences, letting the hardware’s store buffer hide latency.
- Leverage Linux tooling (`perf`, `likwid`, `numactl`, `sysfs`) to **measure** and **verify** that coherence overhead is minimized in production builds.  

In short,
