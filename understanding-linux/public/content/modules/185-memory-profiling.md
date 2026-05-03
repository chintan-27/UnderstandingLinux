---
id: 185
title: "Memory profiling"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A program that runs correctly but slowly is often a memory problem wearing a performance mask. Without understanding how your application allocates memory, which pages it actually touches (its working set), and how that working set interacts with CPU caches and the OS page fault mechanism, you cannot distinguish between a program that is slow because it does too much work and one that is slow because it thrashes memory — burning cycles waiting for data that should already be in cache or RAM. These are fixed by completely different interventions. Misdiagnose the cause and your "optimization" does nothing, or makes things worse.

---

## Core Concepts

### Allocation Patterns

Every call to `malloc` eventually resolves to a kernel request for pages. The allocator (glibc's `ptmalloc2`, or alternatives like `jemalloc`, `tcmalloc`, `mimalloc`) maintains a tiered free-list structure: per-thread caches, per-arena bins, and a top chunk. A request is satisfied from the free list when a bin of the right size class contains a freed chunk. If no chunk fits, the allocator calls into the kernel.

Two patterns dominate real workloads and create distinct pressure profiles:

- **Many small, short-lived allocations**: Each chunk carries allocator metadata (typically 8–16 bytes of header on 64-bit glibc). At high allocation rates, this metadata density pollutes cache lines with bookkeeping data interleaved with your actual objects. Fragmentation accumulates because freed chunks cannot always be coalesced — a 24-byte gap between two live allocations is permanently unusable for anything larger than 24 bytes. The resulting heap layout is a patchwork of live data, metadata, and dead fragments.
- **Few large, long-lived allocations**: Cheaper per-byte and simpler for the allocator, but if the aggregate working set exceeds physical RAM, every evicted page costs a major fault on re-access — a ~1000× latency penalty relative to a cache hit.

The allocation pattern is *causal*: its shape determines allocator behavior, which determines page access patterns, which determines cache and TLB behavior.

### Working Set

The **working set** of a process at time $t$ with window $\tau$ is the set of distinct pages referenced in $[t - \tau,\, t]$. If $P(t')$ is the set of pages accessed at time $t'$:

$$W(t, \tau) = \bigcup_{t' \in [t-\tau,\, t]} P(t')$$

The working set size $|W(t, \tau)|$ is what must reside in RAM for the process to run without thrashing. The memory pressure threshold is:

$$|W(t, \tau)| \times \text{PAGE\_SIZE} \leq \text{RAM}_{\text{available}}$$

On x86-64 Linux, `PAGE_SIZE` is 4096 bytes by default (though Transparent Huge Pages can promote regions to 2 MiB pages). When the inequality is violated, `kswapd` begins evicting pages from the inactive LRU list, and future accesses to those pages generate major faults. Performance degrades catastrophically because each major fault serializes execution against disk I/O latency (~5–10 ms for NVMe, ~100 ms for spinning disk).

### Cache Misses

DRAM latency is approximately 60–100 ns (~200 cycles at 3 GHz). L1 data cache latency is 1–4 ns (~4 cycles). The CPU cannot tolerate waiting 200 cycles for every memory access, so caches exist to exploit the statistical regularity in access patterns. When the CPU requests an address not present in any cache level, it raises a **cache miss** and stalls the pipeline until the line arrives from a slower level.

Miss types differ in whether they are structurally avoidable:

| Type | Cause | Avoidable? |
|---|---|---|
| **Compulsory (cold)** | First-ever access to a cache line | No |
| **Capacity** | Working set exceeds cache size | Only by restructuring data access |
| **Conflict** | Multiple addresses map to the same cache set, evicting each other | Yes — padding, alignment, or access reordering |

A cache line is 64 bytes on all modern x86 processors. Any access to an address in $[\lfloor A/64 \rfloor \times 64,\; \lfloor A/64 \rfloor \times 64 + 63]$ pulls the entire 64-byte line into cache. Struct layout and array stride determine how many useful bytes arrive per cache miss.

### Page Faults

A page fault fires when the CPU's MMU walks the page table for a virtual address and finds either no entry or a not-present entry. The CPU saves state and jumps to the kernel's fault handler (`do_page_fault` in `arch/x86/mm/fault.c`). Two cases matter for performance:

- **Minor fault**: The physical page already exists (e.g., zero-fill-on-demand, or the page is in the page cache and mapped elsewhere). The kernel installs the page table entry and returns. Cost: ~1–10 µs.
- **Major fault**: The physical page must be read from backing storage (swap or a file). The process blocks on I/O. Cost: ~1–100 ms depending on storage.

The ratio of major to minor faults in `/proc/<pid>/stat` fields 9–12 (`minflt`, `cminflt`, `majflt`, `cmajflt`) is one of the first indicators to check when diagnosing memory pressure.

---

## How It Works

### From `malloc` to Physical Memory

```
malloc(256 KB)
   │
   └─► ptmalloc2: no suitable chunk in bins
       └─► mmap(NULL, 262144, PROT_READ|PROT_WRITE,
                MAP_ANON|MAP_PRIVATE, -1, 0)
           └─► kernel: allocates a new VMA entry in mm_struct
               no physical pages assigned; PTEs marked not-present
               └─► first write to any address in range
                   └─► #PF → do_page_fault()
                       └─► handle_mm_fault() → alloc_zeroed_user_highpage()
                           └─► PTE installed; execution resumes
```

The kernel does not assign physical pages at `mmap` time. It creates a `vm_area_struct` (VMA) entry describing the virtual range and its permissions, then returns. Physical allocation is deferred until first access (**demand paging**). This is why `malloc` returning non-NULL does not mean memory is available — it means virtual address space is available.

You can observe this directly:

```bash
# Allocate 1 GB virtually, write only 1 page, observe RSS vs VSZ
cat /proc/$$/status | grep -E 'VmRSS|VmSize'
```

For large anonymous mappings (default threshold: 128 KB in glibc), `ptmalloc2` uses `mmap`; for smaller allocations it extends the heap with `brk`. This distinction matters because `mmap`-based allocations can be returned to the OS immediately on `free`, while `brk`-extended heap memory can only be trimmed from the top.

```c
#include <sys/mman.h>

// Direct anonymous mapping — bypasses allocator entirely
void *buf = mmap(NULL, 1UL << 30,        // 1 GiB
                 PROT_READ | PROT_WRITE,
                 MAP_ANONYMOUS | MAP_PRIVATE,
                 -1, 0);

// Prefault all pages immediately (avoids demand-paging latency spikes)
mmap(NULL, size, PROT_READ | PROT_WRITE,
     MAP_ANONYMOUS | MAP_PRIVATE | MAP_POPULATE,
     -1, 0);
```

`MAP_POPULATE` causes the kernel to prefault all pages during the `mmap` call. Use it when you need deterministic latency and can afford the upfront cost.

### Cache Miss Cost Model

Let $f_i$ be the miss rate at cache level $i$ (fraction of requests to level $i$ that miss), and let $t_i$ be the latency to satisfy a hit at level $i$. The average memory access time (AMAT) is:

$$\text{AMAT} = t_{L1} + f_1\bigl(t_{L2} + f_2\bigl(t_{L3} + f_3 \cdot t_{\text{DRAM}}\bigr)\bigr)$$

For representative x86 values ($t_{L1} = 4$, $t_{L2} = 12$, $t_{L3} = 40$, $t_{\text{DRAM}} = 200$ cycles):

$$\text{AMAT} = 4 + f_1\bigl(12 + f_2(40 + 200 f_3)\bigr)$$

At $f_1 = 0.10$, $f_2 = f_3 = 1.0$ (every L1 miss falls through to DRAM):

$$\text{AMAT} = 4 + 0.1(12 + 252) = 4 + 26.4 = 30.4 \;\text{cycles}$$

A 10% L1 miss rate, combined with a cold L2 and L3, multiplies effective access latency by $30.4 / 4 = 7.6\times$. The multiplier grows steeply: at $f_1 = 0.5$, AMAT $= 4 + 0.5(252) = 130$ cycles — a $32.5\times$ penalty.

This model assumes sequential misses. Out-of-order CPUs can overlap multiple outstanding cache misses (hardware prefetcher + memory-level parallelism), so the wall-clock impact is sometimes less than the per-access model predicts. But for pointer-chasing workloads (linked lists, trees), misses are *dependent* — each miss must resolve before the next address is known — so the model is accurate.

### Spatial and Temporal Locality

Cache performance reduces to two statistical properties of your access stream:

- **Temporal locality**: If address $X$ was accessed at time $t$, the probability of accessing $X$ again is elevated for $t' \in
