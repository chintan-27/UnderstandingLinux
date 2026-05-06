---
id: 55
title: "Caches"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### Memory Hierarchy and the Role of a Cache  
Modern processors execute instructions far faster than DRAM can supply them. The latency gap (≈100 ns for DRAM vs ≈1 ns for L1) is bridged by inserting small, fast storage levels—caches—between the core and main memory. A cache stores *copies* of recently used memory lines so that the core can satisfy a request without going to DRAM.

The effectiveness of a cache hinges on the **principle of locality**:

* **Temporal locality** – a location that is accessed now is likely to be accessed again soon.  
* **Spatial locality** – locations near a recently accessed address are likely to be accessed soon.

If a program exhibits strong locality, a small cache can capture a large fraction of references, reducing the average memory‑access time.

### Cache Organization  
A cache is divided into **sets**; each set contains **W** ways (cache lines).  
For a cache of total size **C** bytes, line size **B** bytes, and associativity **W**:

\[
\text{Number of sets } S = \frac{C}{B \times W}
\]

An address is split into three fields:

| Field   | Width (bits) | Purpose |
|---------|--------------|---------|
| **Offset** | \(\log_2 B\) | selects a byte inside a line |
| **Index**  | \(\log_2 S\) | selects a set |
| **Tag**    | `addr_width - Index - Offset` | identifies which memory block occupies the line |

*Direct‑mapped* → \(W = 1\) (one way per set).  
*Fully associative* → \(S = 1\) (all lines in one set, index width = 0).  
*Set‑associative* → \(1 < W < \frac{C}{B}\) (typical L1/L2 caches are 4‑way or 8‑way).

### Hit, Miss, and Replacement  
On a memory request the cache controller:

1. Extracts index → selects a set.  
2. Compares the tag of the request with the tags of all ways in that set.  
3. If any tag matches → **hit**; data is returned from the matching way.  
4. If no tag matches → **miss**; a line must be fetched from the next level.

If the selected set is full (all ways valid) a **replacement policy** chooses which victim to evict. Common policies:

| Policy | Decision rule | Approx. hardware cost |
|--------|---------------|-----------------------|
| **FIFO** | evict the line that arrived earliest | simple queue |
| **LRU**  | evict the line used least recently | requires ordering bits (≈\(\log_2 W!\) bits per set) |
| **Pseudo‑LRU** | approximates LRU with a binary tree | 1 bit per tree node (≈\(W-1\) bits) |
| **Random** | evict a randomly chosen way | trivial |
| **NRU (Not Recently Used)** | evict a line with use‑bit = 0; periodic clearing | 1 use‑bit per way |

### Write Policies and Coherence  
When a store hits, the cache can either:

* **Write‑through** – propagate the store to the next level immediately (higher bandwidth, simpler coherence).  
* **Write‑back** – modify the line only in the cache; mark it *dirty*; write back to lower level on eviction (reduces traffic, needs dirty bit).

In a multiprocessor each core has its own L1/L2 caches. To keep a *single* view of memory, the caches must stay **coherent**. The dominant hardware scheme is **MESI** (Modified, Exclusive, Shared, Invalid). Each line carries a 2‑bit state; bus‑snooping or a directory tracks state transitions on every read/write request, issuing invalidations or updates as needed.

---

## How It Works
### Cache Lookup – Step‑by‑step
Assume a 32‑bit byte‑addressable processor, L1 data cache: 32 KB, 4‑way, 64‑byte line.

1. **Calculate parameters**  

\[
B = 64\text{ B} \Rightarrow \text{offset} = \log_2 64 = 6\text{ bits}
\]  
\[
C = 32\text{ KiB} = 32 \times 2^{10} = 2^{15}\text{ B}
\]  
\[
W = 4 \Rightarrow S = \frac{C}{B \times W} = \frac{2^{15}}{2^{6} \times 4}= \frac{2^{15}}{2^{8}} = 2^{7}=128\text{ sets}
\]  
\[
\text{index} = \log_2 S = 7\text{ bits}
\]  
\[
\text{tag} = 32 - (\text{index}+\text{offset}) = 32 - (7+6) = 19\text{ bits}
\]

2. **Extract fields from address A**  

\[
\text{offset}= A[5:0] \\
\text{index}= A[12:6] \\
\text{tag}= A[31:13]
\]

3. **Set selection** – use index to address the 128‑set array.  
4. **Tag compare** – parallel comparators check tag against each of the 4 ways.  
5. **Hit detection** – if any comparator asserts, the corresponding way’s data is multiplexed to the core; the LRU state for that set is updated (the accessed way becomes most‑recent).  
6. **Miss handling** – if no match:  

   * Allocate a victim way according to the replacement policy.  
   * If the victim is dirty, schedule a write‑back to the next level.  
   * Issue a read request to L2/main memory for the missing 64‑byte line.  
   * When the line returns, place it in the victim way, set its tag, mark it valid (and clean if read‑only).  
   * Forward the requested byte(s) to the core (critical‑word‑first or full‑line depending on design).  

7. **Write handling** – on a store hit:  

   * Write‑through: update data way and forward to next level.  
   * Write‑back: update data way, set dirty bit, leave lower level unchanged until eviction.  

   On a store miss with write‑allocate: treat as a read miss (fetch line), then perform the store as a hit; with no‑write‑allocate: send the store straight to the next level, leaving cache unchanged.

### Coherence Actions (MESI Snooping)
* **Processor read** – if line is in Modified/Owned state in another cache, that cache supplies the data and both transition to Shared; otherwise data comes from memory and requester becomes Shared (or Exclusive if no other cached copy).  
* **Processor write** – if line is Modified/Exclusive locally, proceed; else issue a Bus Upgrade (or Read‑Invalidate) transaction, causing all other caches to invalidate their copies, then transition local line to Modified.  

These transactions occur on the interconnect bus (or point‑to‑point links with a directory), adding latency but preserving a single memory view.

---

## Worked Examples
### Example 1 – Direct‑Mapped Cache Hit
**Cache parameters**: 16 KB size, 4 KB block size, direct‑mapped (\(W=1\)).  

\[
S = \frac{C}{B}= \frac{16\text{ KiB}}{4\text{ KiB}} = 4\text{ sets}
\]  
\[
\text{offset} = \log_2 4096 = 12\text{ bits},\quad
\text{index}= \log_2 4 = 2\text{ bits},\quad
\text{tag}= 32-(12+2)=18\text{ bits}
\]

**Address to test**: `0x00001000` (decimal 4096).  

*Binary*: `0000 0000 0000 0001 0000 0000 0000 0000`  
- offset[11:0] = `0x000`  
- index[13:12] = `01` (set 1)  
- tag[31:14] = `0x00004`  

Assume the cache line for set 1 currently holds tag `0x00004` and is valid. The tag comparator matches → **hit**.  

**Latency**: L1 hit time ≈ 1 cycle. No miss penalty incurred.

### Example 2 – Same Cache, Miss
**Address**: `0x00003000` (decimal 12288).  

- offset = `0x000`  
- index = `11` binary → set 3 (since 12 KB / 4 KB = 3)  
- tag = `0x00000`  

Set 3 currently holds tag `0x00001` (different). No match → **miss**.  

**Miss penalty** (typical L2 latency ≈ 12 cycles, main‑memory ≈ 100 cycles). Assume the line is not in L2, so we go to memory:

\[
\text{AMAT}= t_{\text{hit}} + \text{miss\_rate}\times t_{\text{miss}}
\]

If this reference is the only one, miss_rate = 1:

\[
\text{AMAT}= 1 + 1 \times 100 = 101\text{ cycles}
\]

If we had a 95 % hit rate, AMAT ≈ \(1 + 0.05 \times 100 = 6\) cycles, showing the impact of locality.

### Example 3 – 4‑Way Set‑Associative Cache, LRU Replacement
**Cache**: 32 KB, 64 B line, 4‑way → \(S = 32\text{KiB} / (64\times4) = 128\) sets (as derived earlier).  

**Reference stream** (byte addresses):  

| Ref | Address | Index (hex) | Tag (hex) |
|-----|---------|-------------|-----------|
| 1   | 0x00001000 | 0x20 | 0x00000 |
| 2   | 0x00001040 | 0x20 | 0x00000 (same line, different offset) |
| 3   | 0x00002000 | 0x40 | 0x00000 |
| 4   | 0x00003000 | 0x60 | 0x00000 |
| 5   | 0x00001080 | 0x20 | 0x00000 (same set as refs 1‑2) |

**State before ref 5** (LRU order per set, most‑recent first):  

*Set 0x20*: ways = [ref 2 (MRU), ref 1]  
*Set 0x40*: [ref 3]  
*Set 0x60*: [ref 4]

**Processing ref 5**  

1. Index = 0x20 → look at set 0x20.  
2. Tag compare finds a match in way holding ref 2 → **hit**.  
3. LRU update: move ref 5’s way to MRU position → new order = [ref 5, ref 2, ref 1].  

No replacement needed.  

If ref 5 had been to a *new* tag (e.g., 0x000010C0) the set would be full; LRU would evict the *least‑recently used* way, which is ref 1 (the oldest). The victim line would be written back if dirty, then the new line installed in that way.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Understanding |
|---|---------|----------------|-----------------------|
| 1 | **Assuming cache size = data storage only** (ignoring tag, valid, dirty bits) | The total silicon area includes metadata; a 32 KB 4‑way cache with 64‑B lines needs \(S \times W \times (\text{tag}+2)\) bits ≈ 3 KB extra. | Compute **effective storage** = data + overhead; use formulas to size tag RAM correctly. |
| 2 | **Believing LRU always yields the lowest miss rate** | LRU approximates optimal (Belady) but can be worse for certain access patterns (e.g., sequential scans with associativity > 1). | Understand workload‑dependent performance; consider **pseudo‑LRU** or **random** for lower hardware cost when LRU’s benefit is marginal. |
| 3 | **Treating physical and virtual addresses interchangeably for cache indexing** | Many L1 caches are **VIPT** (virtually indexed, physically tagged); using the wrong bits can cause synonyms or aliasing problems. | Verify indexing scheme: if page size > cache size × associativity, VIPT works; otherwise OS must page‑color or use physically indexed caches. |
| 4 | **Ignoring write policy effects on coherence traffic** | Write‑through generates a bus transaction per store, saturating bandwidth; write‑back reduces traffic but requires invalidation on shared lines. | Choose policy based on workload: read‑dominant → write‑back; write‑heavy, low‑sharing → write‑through. |
| 5 | **Assuming cache coherence is free** | Each coherence transaction incurs latency and bandwidth; false sharing can dominate performance in parallel code. | Align data structures to cache‑line boundaries, pad to avoid false sharing, and use tools like `perf` to measure cache‑miss and coherence‑traffic events. |

---

## Exercises
### Easy  
1. **Parameter calculation** – A 64 KB, 8‑way set‑associative cache has 32‑byte lines. Compute the number of sets, index width, offset width, and tag width for a 64‑bit address.  

   *Solution*:  
   \[
   S = \frac{64\text{ KiB}}{32\text{ B} \times 8}= \frac{2^{16}}{2^{5}\times 2^{3}} = 2^{8}=256\text{ sets}
   \]  
   \[
   \text{offset}= \log_2 32 =5\text{ bits},\;
   \text{index}= \log_2 256 =8\text{ bits},\;
   \text{tag}=64-(5+8)=51\text{ bits}
   \]

### Medium  
2. **Trace‑driven simulation** – Write a C program that simulates a direct‑mapped 8 KB cache with 16‑byte lines. Given a memory‑trace file (hex addresses, one per line), compute hit‑rate and average memory‑access time assuming hit time = 1 cycle, miss penalty = 100 cycles.  

   *Hints*:  
   - Extract index = (addr >> 4) & 0x3F (since 8 KB/16 B = 512 sets → 9 bits? Wait recalc: 8 KB = 8192 B; lines = 8192/16 = 512 → index bits = 9).  
   - Keep an array of tags (`uint64_t tag[512]`), initialize to an invalid value (e.g., `~0ULL`).  
   - On each access, compare tag; on miss, load new tag and increment miss counter.  

### Hard  
3. **Design a configurable cache simulator** – Implement a simulator that accepts parameters (size, associativity, line size, replacement policy) and a trace file, then outputs:  
   - Hit‑rate per level (L1, L2) if you simulate a hierarchy.  
   - Traffic breakdown (reads, writes, write‑backs).  
   - Optional: MESI state transitions for a two‑core system (you can generate synthetic shared‑read/write patterns).  

   *Evaluation*: Run the simulator on the `ladder` and `loop` traces from the **Cache Lab** (CMU 15‑213) and compare results to a reference simulator (e.g., `dineroIV`).  

4. **Linux kernel cache inspection** – Write a shell script that prints, for each logical CPU, the size, line size, and associativity of its data and instruction caches (L1, L2, L3) by reading the appropriate sysfs files.  

   *Expected output format*:  
   ```
   CPU0: L1d=32K (8-way, 64B), L1i=32K (8-way, 64B), L2=256K (8-way, 64B), L3=8192K (16-way, 64B)
   CPU1: …
   ```

   *Bonus*: Add a `perf stat -e cache-references,cache-misses, LLC-loads, LLC-stores` run of a user‑provided binary and report the miss ratio.

---

## Linux Connection
Linux exposes the hardware caches through **sysfs** and provides tools to measure their behavior.  

### Sysfs layout (x86, ARM, etc.)  
Each logical CPU has a directory tree under `/sys/devices/system/cpu/<cpu>/cache/index*/`. The `index*` directories are ordered from the innermost cache outward (index 0 = L1 data or instruction depending on the `type` file).  

Key files (read‑only, unless noted):

| File | Meaning |
|------|---------|
| `size` | Human‑readable size (e.g., `32K`) |
| `number_of_sets` | Integer |
| `ways_of_associativity` | Integer (0 → fully associative) |
| `shared_cpu_list` | CPUs that share this cache (useful for identifying core vs. socket sharing) |
| `type` | `"Data"`, `"Instruction"`, or `"Unified"` |
| `level` | Cache level (`1`, `2`, `3`…) |
| `coherency_line_size` | Line size in bytes (usually 64) |

#### Example Commands
```bash
# Show L1 data cache size for CPU0
cat /sys/devices/system/cpu/cpu0/cache/index0/size
# => 32K

# Show associativity and line size for L2 on all CPUs
for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    echo -n "${cpu##*/}: "
    cat $cpu/cache/index1/ways_of_associativity
    echo -n "‑way, "
    cat $cpu/cache/index1/coherency_line_size
    echo "B line"
done
```

### Tools for Measuring Cache Behavior
| Tool | What it measures | Typical invocation |
|------|------------------|--------------------|
| `perf` | Hardware performance counters (cache‑references, cache‑misses, branch‑misses, etc.) | `perf stat -e cache-references,cache-misses,cycles,instructions ./myprog` |
| `likwid-perfctr` (LIKWID) | Pre‑defined metric groups (e.g., `L2CACHE`, `L3CACHE`, `MEM`) | `likwid-perfctr -g L2CACHE ./myprog` |
| `numactl` + `vmstat` | NUMA‑aware memory placement (relevant when caches are shared across sockets) | `numactl --cpunodebind=0 --membind=0 ./myprog` |
| `x86info` / `cpuid` | Low‑level CPUID leaf decoding (cache parameters) | `x86info -c` |
| `hwloc` (`lstopo`) | Visual topology showing caches, cores, sockets | `lstopo-no-graphics` |

### Kernel Subsystems that Interact with Caches
| Subsystem | Role |
|-----------|------|
| `arch/x86/kernel/cpu/cache.c` (or architecture‑specific equivalents) | Early boot detection of cache hierarchies, populates sysfs files. |
| `mm/page_alloc.c` (page allocator) | Uses **page coloring** to reduce cache aliasing when VIPT caches are used. |
| `mm/vmscan.c` (page reclaim) | Tries to keep clean pages in the cache to avoid write‑back stalls during memory pressure. |
| `kernel/sched/core.c` (scheduler) | Attempts to schedule related threads on cores that share a cache (cache‑aware load balancing). |
| `fs/buffer.c` (block layer buffer cache) | Implements the **page cache**, a software cache for file data that sits atop the hardware caches. |

#### Runnable Example – Measuring L1 miss rate with `perf`
```bash
# Compile a simple tight loop that walks a large array
cat > miss_test.c <<'EOF'
#include <stdlib.h>
#include <stdio.h>
#define SIZE (100*1024*1024) // 100 MB
int main(void) {
    unsigned char *buf = malloc(SIZE);
    for (size_t i=0; i<SIZE; i+=64)   // stride = one cache line
        buf[i] = 1;
    free(buf);
    return 0;
}
EOF
gcc -O2 -march=native miss_test.c -o miss_test

# Run perf, collecting L1‑d cache misses and references
perf stat -e dcache-loads,dcache-load-misses ./miss_test
```
Typical output (on a modern Xeon):
```
       1,562,345,678      dcache-loads
         123,456,789      dcache-load-misses
            7.90% of all dcache-loads
```
The miss ratio (~8 %) reflects the stride‑64 access pattern (one load per cache line, no reuse).

---

## Why This Matters
Understanding caches is not an academic exercise; it is the **foundation for performance engineering** across the stack:

* **Algorithm design** – Loop tiling, blocking, and cache‑oblivious algorithms are derived directly from the cache‑size, line‑size, and associativity formulas. Knowing whether your data fits in L1, L2, or LLC dictates whether you optimize for temporal reuse or bandwidth.  
* **System software** – The kernel’s page‑allocator, slab allocator, and scheduler all make decisions based on cache topology to minimize false sharing and maximize cache‑resident data.  
* **Multiprocessor scalability** – Coherence protocols (MESI, MOESIF, etc.) add latency that grows with sharer count. Recognizing when a data structure is *shared* versus *private* lets you align locks, use per‑CPU data, or employ RCU to avoid unnecessary coherence traffic.  
* **Power & energy** – Each cache access consumes far less energy than a DRAM access. Reducing miss rate translates directly into lower dynamic power, a critical factor in data‑centers and mobile devices.  
* **Diagnostics & tuning** – Tools like
