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

## Core Concepts
### Memory Profiling
Memory profiling is the quantitative observation of how a process’s virtual address space is mapped to physical resources over time. It captures allocation size, lifetime, reuse patterns, and the cost of moving data between hardware levels (registers → cache → main memory → swap). The goal is to answer *why* a program exhibits a particular memory‑related latency or bandwidth behavior, not merely *that* it does.

### Key Terminology (with causal links)
- **Virtual address space (VAS)** – the set of addresses a process can generate, implemented by the MMU via page tables. Each VAS entry is either *present* (mapped to a RAM frame) or *absent* (triggers a page fault).  
- **Resident Set Size (RSS)** – the number of frames currently held in RAM for a given VAS. RSS changes only when the kernel faults in or evicts pages.  
- **Anonymous memory** – pages without a backing file; they are created by `brk`, `mmap(MAP_ANONYMOUS)`, or stack growth. Their content is zero‑filled on first write (copy‑on‑write zero page).  
- **File‑backed memory** – pages mapped from a regular file or block device (e.g., executable text, libraries, `mmap` of a data file). Clean pages can be reclaimed without swap; dirty pages must be written back.  
- **Working set** – the subset of a process’s VAS that is actively used within a time window *W*. If the working set exceeds available RAM, the fault rate rises sharply (the “knee” of the fault‑vs‑memory curve).  
- **Cache hierarchy** – L1d/L1i (typically 32‑64 KB, 4‑cycle latency), L2 (256 KB‑2 MB, ~12 cycles), L3 (several MB‑tens of MB, ~30‑40 cycles). A miss at level *i* incurs the latency of the next level plus any bus transfer time.  
- **Translation Lookaside Buffer (TLB)** – caches recent virtual‑to‑physical translations. A TLB miss costs ~10‑30 cycles plus a page‑table walk (often 2‑4 memory accesses).  

### Allocation Patterns and Their Origins
- **Working set size (WSS)** can be estimated from the stack distance algorithm: the probability that a reference is to a page accessed *k* distinct pages ago. Under the Independent Reference Model, the miss ratio for a cache of *C* pages is  
  $$M(C) = \sum_{k=C+1}^{\infty} p_k,$$  
  where $p_k$ is the probability the reuse distance exceeds *k*.  
- **Cache misses** arise when the working set exceeds the cache capacity *or* when access patterns cause conflict misses (multiple addresses map to the same cache set).  
- **Page faults** occur on a present‑bit‑zero entry. The kernel must locate or allocate a physical frame, possibly initiate I/O from swap or a file, update the page table, and retry the instruction. The latency is dominated by the slowest involved storage (typically swap on SSD ≈ 100 µs, HDD ≈ 10 ms).  

## How It Works
### Memory Allocation in Linux
1. **Small allocations (< 128 KB)** – `glibc`’s `ptmalloc2` maintains per‑thread arenas with bins of free chunks. When a bin is empty, it calls `brk()` (or `sbrk()`) to extend the heap, which updates the process’s *break* and creates a new VMA (virtual memory area) backed by anonymous pages.  
2. **Large allocations (≥ MMAP_THRESHOLD, default 128 KB)** – `malloc` directly invokes `mmap(NULL, length, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)`. This creates a VMA that is *not* part of the heap; each page is fault‑in on first touch.  
3. **Free** – `ptmalloc2` returns chunks to the appropriate bin; if the top chunk becomes large enough, it may release memory back to the kernel via `madvise(addr, length, MADV_DONTNEED)`, which turns the pages into *lazy* zero‑filled pages (they stay in the VMA but are not resident until next fault).  

The **cost** of an allocation is therefore:  
$$T_{alloc} = T_{bin\_search} + T_{brk/mmap} + T_{page\_fault\_if\_lazy}$$  
where $T_{brk/mmap}$ is a few hundred nanoseconds (system call overhead) and $T_{page\_fault\_if\_lazy}$ is zero unless the kernel overcommits and lazily allocates.

### Paging, Swapping, and Page Replacement
- **Demand paging**: a page is loaded only on fault. The fault handler executes:  
  1. Find the VMA covering the faulting address.  
  2. If the VMA is anonymous, allocate a free frame (or swap‑in if the page was previously swapped out).  
  3. If the VMA is file‑backed, read the page from the filesystem (or page cache).  
  4. Update the page table entry, set present/dirty bits, and invalidate the TLB entry (via `invlpg`).  
- **Swap** is a special block device. When RAM is low, the kernel selects victim pages via an approximation of LRU (the **active/inactive** list scheme). The cost of swapping out a dirty anonymous page is:  
  $$T_{swap\_out} = T_{seek} + T_{rot\_latency} + \frac{P}{B}$$  
  where $P$ is page size (4 KiB) and $B$ is device bandwidth.  
- **Page cache** caches clean file‑backed pages; dirty pages are written back via `pdflush` or `writeback` threads. This decouples file I/O from process execution, allowing overlapping of computation and disk latency.

### Cache Management and Its Interaction with the VM Subsystem
The CPU cache is *physically* indexed (or virtually indexed with tags). When the OS changes a page’s physical frame (e.g., during swap‑in/out), any cached lines belonging to that page become **invalid** if the cache uses physical tags; otherwise they may cause **alias** problems. Modern CPUs use **physically indexed, physically tagged (PIPT)** caches to avoid this, but the OS still must flush or invalidate lines when changing page attributes (e.g., turning a page from writable to read‑only via `mprotect`).  

The **average memory access time (AMAT)** for a two‑level cache is:  
$$\text{AMAT} = t_{L1} + m_{L1}\bigl(t_{L2} + m_{L2}t_{mem}\bigr)$$  
where $m_{L1}$ and $m_{L2}$ are miss rates, and $t_{mem}$ is main‑memory access latency (~100 ns). A high page‑fault rate inflates $t_{mem}$ dramatically because the effective memory access now includes disk latency.

## Worked Examples
### Example 1: Measuring Allocation Overhead and Fragmentation
**Goal:** Quantify the extra memory consumed by `ptmalloc2` metadata and internal fragmentation for a workload of many small allocations.  

**Step‑by‑step:**
1. Allocate *N* = 1 000 000 objects of size 16 bytes each via `malloc`.  
2. After each allocation, read `/proc/self/statm` to obtain RSS (in pages).  
3. After all allocations, free half of them (randomly) and measure RSS again.  
4. Compute expected usage:  
   $$ \text{Expected RSS}_{\text{alloc}} = \frac{N \times 16\text{B}}{4096\text{B}} \approx 3.9\text{ pages} $$  
   Any excess indicates allocator overhead (metadata, alignment, fragmentation).  

**C code (run with `gcc -O2 -o alloc_test alloc_test.c`):**
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

static size_t read_rss(void)
{
    FILE *f = fopen("/proc/self/statm", "r");
    unsigned long size, resident, share, text, lib, data, dt;
    fscanf(f, "%lu %lu %lu %lu %lu %lu %lu", &size, &resident, &share,
           &text, &lib, &data, &dt);
    fclose(f);
    return resident * sysconf(_SC_PAGESIZE);
}

int main(void)
{
    const size_t N = 1'000'000;
    void **ptrs = malloc(N * sizeof(void*));
    for (size_t i = 0; i < N; ++i)
        ptrs[i] = malloc(16);

    printf("RSS after alloc: %zu bytes\n", read_rss());

    /* free random half */
    for (size_t i = 0; i < N; ++i)
        if (rand() & 1) { free(ptrs[i]); ptrs[i] = NULL; }

    printf("RSS after partial free: %zu bytes\n", read_rss());
    free(ptrs);
    return 0;
}
```
**Interpretation:** On a typical x86‑64 glibc 2.31 run, RSS after allocation is ~12 MiB → ~3 MiB of metadata/fragmentation (≈75 % overhead). After freeing half, RSS drops only to ~9 MiB, showing that freed chunks remain in the allocator’s bins and are not returned to the kernel unless `MADV_DONTNEED` is used.

### Example 2: Cache‑Miss Measurement and Penalty Estimation
**Goal:** Determine the L1‑miss rate for a tight loop that walks a large array and translate that into stall cycles.  

**Procedure:**  
1. Allocate an array of *N* = 256 MiB of `int` (stride = 1).  
2. Touch every element with a read‑only loop.  
3. Run `perf stat -e L1-dcache-loads,L1-dcache-load-misses,cpu cycles ./a.out`.  

**Sample output (fictional but realistic):**  
```
   2,147,483,648      L1-dcache-loads  
        16,777,216      L1-dcache-load-misses  
   3,421,098,765      cpu cycles
```
**Calculations:**  
- L1‑miss rate $m = \frac{16,777,216}{2,147,483,648} = 0.0078125$ (≈0.78 %).  
- Assume L1 hit time $t_{L1}=4$ cycles, L2 hit time $t_{L2}=12$ cycles, main‑memory latency $t_{mem}=100$ ns ≈ 300 cycles @ 3 GHz.  
- AMAT:  
  $$\text{AMAT} = 4 + 0.0078125\,(12 + 0.0\,(300)) \approx 4.094\text{ cycles}$$  
  (Here we ignore L2 misses because the workload fits in L2; if L2 misses were present we would add a second term.)  
- Extra stall cycles due to misses: $0.0078125 \times 12 \approx 0.094$ cycles per load, negligible for this stride‑1 case.  

If we instead used a stride of 4096 bytes (one page per access), the L1‑miss rate would approach 100 % and the AMAT would jump to ≈ 12 cycles (L2) or higher if L2 also missed, demonstrating how access pattern drives cache performance.

**Code (stride‑1 version):**
```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#define ARRAY_SZ (256UL*1024*1024/sizeof(int)) // 256 MiB

int main(void)
{
    int *a = malloc(ARRAY_SZ * sizeof(int));
    if (!a) return 1;
    for (size_t i = 0; i < ARRAY_SZ; ++i)
        a[i] = i;          // touch each element
    free(a);
    return 0;
}
```
Compile: `gcc -O3 -march=native -o stride1 stride1.c && perf stat -e L1-dcache-loads,L1-dcache-load-misses,cycles ./stride1`

### Example 3: Page‑Fault Latency Measurement
**Goal:** Measure the average cost of a page fault that brings in an anonymous page from swap.  

**Steps:**  
1. Create a 2 GiB anonymous mapping with `mmap`.  
2. Touch each page once to fault it in (ensuring pages are resident).  
3. Use `swapon` to enable a swap file, then `madvise(addr, length, MADV_DONTNEED)` to evict pages to swap.  
4. Touch the pages again; each touch now triggers a fault that reads from swap.  
5. Use `/proc/vmstat` fields `pgpgin` and `pgpgout` to count pages swapped in/out, and `pswpin`/`pswout` for swap‑in/out events.  
6. Measure wall‑clock time with `clock_gettime(CLOCK_MONOTONIC, …)` around the second touch loop.  

**Code:**
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <time.h>

static unsigned long long read_vmstat(const char *name)
{
    FILE *f = fopen("/proc/vmstat", "r");
    char line[256];
    unsigned long long val = 0;
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, name, strlen(name)) == 0 &&
            sscanf(line + strlen(name), "%llu", &val) == 1)
            break;
    }
    fclose(f);
    return val;
}

int main(void)
{
    const size_t GB = 1024UL*1024*1024;
    const size_t len = 2*GB;               // 2 GiB mapping
    void *addr = mmap(NULL, len, PROT_READ|PROT_WRITE,
                      MAP_PRIVATE|MAP_ANONYMOUS, -1, 0);
    if (addr == MAP_FAILED) { perror("mmap"); return 1; }

    /* First touch – allocate resident pages */
    for (size_t i = 0; i < len; i += 4096)
        *(volatile char *)(addr + i) = 0;

    /* Enable swap (assume /swapfile exists and is 4GiB) */
    system("swapon /swapfile");

    /* Evict to swap */
    madvise(addr, len, MADV_DONTNEED);

    unsigned long long pgpin_before = read_vmstat("pgpgin");

    struct timespec ts0, ts1;
    clock_gettime(CLOCK_MONOTONIC, &ts0);
    /* Second touch – fault in from swap */
    for (size_t i = 0; i < len; i += 4096)
        *(volatile char *)(addr + i) = 0;
    clock_gettime(CLOCK_MONOTONIC, &ts1);
    unsigned long long pgpin_after = read_vmstat("pgpgin");

    double elapsed = (ts1.tv_sec - ts0.tv_sec) +
                     (ts1.tv_nsec - ts0.tv_nsec) * 1e-9;
    unsigned long long pages faulted = (pgpin_after - pgpin_before);
    double latency_per_fault = elapsed / pages_faulted;

    printf("Faulted %llu pages in %.3f s → %.3f µs per fault\n",
           pages_faulted, elapsed, latency_per_fault*1e6);

    munmap(addr, len);
    return 0;
}
```
**Typical result on an NVMe swap:** ~25 µs per fault (≈ 250 × the cost of a DRAM access). This illustrates why minimizing fault rates is critical for latency‑sensitive workloads.

## Common Mistakes
| # | Mistake | Why It’s Wrong (Root Cause) | Correct Approach |
|---|---------|----------------------------|------------------|
| 1 | **Assuming `malloc` returns zero‑filled memory** | `malloc` obtains raw anonymous pages; the kernel only zero‑fills on the *first write* (copy‑on‑zero page). Reading before writing yields undefined data, not zeros. | Either `memset` after allocation, or use `calloc` which guarantees zero‑fill via the kernel’s zero page. |
| 2 | **Ignoring overcommit and `ENOMEM` from `mmap`** | Linux may overcommit anonymous memory; `mmap` never fails due to lack of RAM, but a later page fault can be killed by the OOM killer. Relying on `malloc` returning `NULL` to detect OOM is unreliable. | Check `/proc/sys/vm/overcommit_memory`, prefer `malloc` + `memset` to fault pages early, or use `mlock`/`MCL_FUTURE` to reserve RAM upfront, and handle `SIGSEGV`/`SIGBUS` from OOM. |
| 3 | **Using `madvise(DONTNEED)` to free memory and expecting immediate RSS drop** | `MADV_DONTNEED` only marks pages as *lazy*; they remain in the VMA and are re‑allocated on next fault. The kernel may keep them cached if clean. | After `MADV_DONTNEED`, also call `malloc_trim(0)` (glibc) or `mmap` with `MAP_PRIVATE|MAP_ANONYMOUS|MAP_POPULATE` to force actual page relinquishment, or use `malloc` + `free` and rely on the allocator returning pages to the kernel via `MADV_DONTNEED` only when the top chunk is large enough. |
| 4 | **Believing that a high cache‑miss rate always means poor algorithm** | Conflict misses can stem from aliasing (e.g., two arrays whose strides map to the same cache set) rather than asymptotic complexity. | Change data layout (padding, struct splitting) or use cache‑blocking/tiling; measure with `perf record -e cache-misses,cache-references` to distinguish capacity vs conflict misses. |
| 5 | **Neglecting TLB pressure when using huge numbers of small mappings** | Each `mmap` creates a VMA; many small VMAs increase the size of the VMA list and the number of page‑table entries, causing more TLB misses and slower page‑table walks. | Consolidate mappings (e.g., use a single large `mmap` and manage sub‑offsets manually), or use `MAP_HUGETLB` / `transparent hugepages` to reduce page‑table depth. |
| 6 | **Treating swap as uniformly slow** | Modern NVMe swap can approach DRAM latency (≈ 20‑30 µs) and is still faster than a synchronous filesystem write. The cost depends on device bandwidth, queue depth, and whether pages are clean or dirty. | Benchmark your specific swap device with `swapon -s` and `dd if=/dev/zero of=/swapfile bs=1M count=4096 oflag=direct` to measure latency, then decide whether to enable swap or rely on memory pressure alerts. |

## Exercises
### Exercise 1 – Easy: Quantify Allocator Overhead
Write a program that:
1. Allocates *N* = 10 000 blocks of 64 bytes via `malloc`.
2. After each block, reads `/proc/self/statm` and records RSS.
3. Computes average RSS per allocated object and compares it to the theoretical 64 B / 4 KiB = 0.0156 pages.
4. Prints the overhead factor (measured / theoretical).  
*Deliverable:* Source code, a short explanation of observed overhead, and a hypothesis about why it occurs (e.g., bin metadata, alignment).

### Exercise 2 – Medium: Cache‑Blocking Impact on Matrix Multiply
Implement a naive `C = A * B` (square matrices, dimension *N* = 1024) using double‑precision floats.  
1. Run it baseline and capture `perf stat -e L1-dcache-loads,L1-dcache-load-misses,L2-loads,L2-load-misses,cycles`.  
2. Rewrite the inner loops using cache blocking (tile size *T* = 64).  
3. Measure again.  
*Deliverable:* Speed‑up factor, change in miss rates at each level, and a short analysis of how block size trades off between temporal reuse and capacity misses.

### Exercise 3 – Hard: Measuring and Reducing Page‑Fault Latency in a Swap‑Backed Workload
1. Create a 4 GiB anonymous array, touch it once to fault in pages.  
2. Enable a swap file on an SSD, then evict half the array to swap using `madvise(DONTNEED)`.  
3. Launch *M* = 8 threads that randomly access the array (uniform distribution).  
4. Using `perf record -e page-faults,minor-faults,major-faults -g ./a.out`, collect fault counts and latency via `perf stat`.  
5. Experiment with:  
   - Increasing swap I/O depth (`echo 128 > /sys/block/<device>/queue/nr_requests`).  
   - Using `mlock` on the hot subset to keep it resident.  
   - Changing the swappiness value (`/proc/sys/vm/swappiness`).  
*Deliverable:* A report showing fault latency before/after each tweak, with explanation of how each knob influences the swap‑in path (I/O scheduler, writeback, readahead). Include the exact commands used and any observed trade‑offs (e.g., increased memory pressure vs reduced latency).

## Linux Connection
### Subsystems
| Subsystem | Role in Memory Profiling | Key Interfaces |
|-----------|--------------------------|----------------|
| **Slab Allocator** (`kmem_cache`) | Manages kernel object allocations (e.g., `task_struct`, `vm_area_struct`). Fragmentation here can increase kernel memory usage visible via `/proc/meminfo` (`Slab`). | `/proc/slabinfo`, `slabinfo` command, `kmemleak` detector. |
| **Page Cache** | C
