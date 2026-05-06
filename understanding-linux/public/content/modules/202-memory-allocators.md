---
id: 202
title: "Memory allocators"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Memory Allocator Fundamentals
A user‑space memory allocator sits between the program and the kernel’s page‑level memory manager. The kernel hands out memory in page‑sized chunks (typically 4 KiB via `brk`/`sbrk` or `mmap`). Fine‑grained allocations (e.g., `sizeof(int)` bytes) would incur a system call per object if we asked the kernel directly, which is prohibitively expensive. The allocator therefore **pre‑allocates** large regions from the kernel and sub‑divides them, reducing syscall overhead and enabling O(1) or O(log n) allocation paths for common sizes.

### Heap vs. Other Memory Regions
* **Heap** – the region managed by `malloc`/`free`, grows upward via `brk` or is populated with `mmap`‑ed segments for large requests (> MMAP_THRESHOLD, default 128 KiB in glibc).  
* **Stack** – managed automatically by the compiler, not relevant to `malloc`.  
* **Static/Global** – allocated at load time, lifetime equals program lifetime.

### Chunk Layout (glibc ptmalloc2)
Each allocated block is preceded by a **chunk header** that enables the allocator to coalesce free chunks and locate neighbours. For a chunk of user‑size `s` (rounded up to alignment `A`):

```
struct malloc_chunk {
    INTERNAL_SIZE_T      prev_size;  /* Size of previous chunk (if free). */
    INTERNAL_SIZE_T      size;       /* Size in bytes, including overhead. */
    struct malloc_chunk* fd;         /* Double links -- used only if free. */
    struct malloc_chunk* bk;
};
```

*The low 3 bits of `size` encode flags:*  
- `PREV_INUSE` (bit 0) – whether the previous chunk is in use.  
- `IS_MMAPPED` (bit 1) – if the chunk was obtained via `mmap`.  
- `NON_MAIN_ARENA` (bit 2) – for per‑thread arenas.

Thus the **overhead** per chunk is `2 * sizeof(size_t)` on 64‑bit systems (16 bytes). The usable payload is `chunk->size - overhead`, rounded up to a multiple of `A` (typically 16 bytes on x86‑64).

### Why Alignment Matters
Modern CPUs load/store most efficiently when addresses are multiples of their natural word size (8 bytes) or cache line size (64 bytes). Misaligned accesses can cause:
* Extra CPU cycles (split loads/stores).
* Alignment faults on some architectures (e.g., ARMv7 strict alignment).
* False sharing in multicore scenarios.

The allocator therefore rounds the request up to `ALIGN = 2 * sizeof(size_t)` (16 bytes) and may add padding to satisfy stricter alignment required by types like `double` (8 bytes) or `__m128` (16 bytes).

### Fragmentation – Root Causes
* **Internal fragmentation** – unusable slack inside a chunk because the allocator can only hand out sizes that are multiples of the alignment or bin size.  
  \[
  \text{internal\_frag} = \text{chunk\_size} - (\text{requested\_size} + \text{overhead})
  \]
* **External fragmentation** – free memory is split into many small, non‑contiguous chunks, preventing satisfaction of a large request even though total free memory suffices. It arises when allocation/deallocation patterns create a jagged free‑list.

The allocator mitigates external fragmentation via:
* **Coalescing** adjacent free chunks on `free`.
* **Binning** (fastbins, smallbins, unsorted bin) to keep similar‑sized chunks together.
* **Tcache** (thread‑local cache) to reduce contention and keep recently freed chunks hot.

## How It Works
### Allocation Request Flow (ptmalloc2 with tcache)
1. **User request** for `n` bytes.  
2. **Round up**: `req = ALIGN_UP(n + overhead, ALIGN)`.  
3. **Check tcache**: if `req` ≤ `TCACHE_MAX_BYTES` (default 2 KiB) and the corresponding tcache bin is non‑empty, pop the chunk, clear `PREV_INUSE` flag of the chunk, and return the user pointer.  
   *Why tcache?* Eliminates lock contention on the main arena’s bins and improves locality.
4. **If tcache miss**, acquire the arena lock (main or per‑thread arena) and inspect bins in order:
   * **Fastbins** (sizes 16, 24, 32, …, 80 bytes) – LIFO, no coalescing.  
   * **Smallbins** (sizes ≤ `SMALLBIN_WIDTH` = 64 bytes) – FIFO, chunks are kept sorted by address for easy coalescing.  
   * **Unsorted bin** – placeholder for recently freed chunks; scanned first to possibly satisfy the request without further binning.  
   * **Large bins** – indexed by size, use a tree (rbtree) for O(log n) search.
5. **If a suitable chunk is found**, it may be **split**:
   * Let `chunk_size` be the size of the located free chunk.  
   * If `chunk_size - req ≥ MINSIZE` (the smallest chunk that can hold a header, i.e., `2 * SIZE_SZ`), create a remainder chunk:
     ```
     remainder = chunk + req
     remainder->size = chunk_size - req
     remainder->prev_size = req
     set PREV_INUSE flag of remainder
     ```
   * Mark the allocated chunk’s `size` with `PREV_INUSE` set and clear the `IS_MMAPPED` flag.
6. **If no fit**, invoke **morecore** (`sbrk` or `mmap`) to obtain additional memory from the kernel, then repeat the search.
7. **Return** pointer to `chunk + 2 * SIZE_SZ` (skip header).

### Free Operation Flow
1. **User passes pointer** `p`. Convert to chunk: `chunk = mem2chunk(p)`.  
2. **Check tcache**: if enabled and bin not full, push chunk onto tcache bin; increment count.  
3. **Else**, lock arena and:
   * **Check adjacency**: if previous chunk is free (`!prev_inuse(chunk)`), coalesce backward:
     ```
     prev_chunk = chunk - chunk->prev_size
     new_size = prev_chunk->size + chunk->size
     unlink(prev_chunk); unlink(chunk);
     chunk = prev_chunk; chunk->size = new_size;
     ```
   * **Check next chunk**: if next chunk is free (`!nextinuse(chunk)`), coalesce forward similarly.
   * **Place resulting chunk** into appropriate bin (unsorted bin first, then possibly moved to small/large bins during consolidation).
4. **Release lock**.

### Complexity Summary
| Step | Average‑case | Worst‑case |
|------|--------------|------------|
| tcache hit | **O(1)** | **O(1)** |
| arena lock + bin search | **O(1)** for fast/small bins (fixed number) | **O(log n)** for large bins (tree) |
| splitting / coalescing | **O(1)** (constant number of checks) | **O(1)** |

The design guarantees that the common case (small allocations) is constant‑time and lock‑free thanks to tcache.

## Worked Examples
### Example 1: Chunk Splitting and Internal Fragmentation
Assume a 64‑bit glibc with `SIZE_T = 8`, `ALIGN = 16`, overhead = 16 bytes.

*Request:* `malloc(24)`  
1. `n + overhead = 24 + 16 = 40` → round up to multiple of 16 → `req = 48` bytes.  
2. Suppose the allocator finds a free chunk of size `chunk_size = 80` bytes (header + 64 bytes payload).  
3. Since `chunk_size - req = 80 - 48 = 32 ≥ MINSIZE (16)`, we split:
   * Allocated chunk: size = 48 bytes (`prev_size` of next chunk = 48).  
   * Remainder chunk: size = 32 bytes (header + 16 bytes payload).  
4. **Internal fragmentation** = `req - (n + overhead) = 48 - 40 = 8` bytes (padding to satisfy alignment).  
5. **Remaining free memory** after allocation = 32 bytes (usable for another request ≤ 16 bytes after overhead).

### Example 2: Tcache Hit Avoiding Arena Lock
Thread‑local tcache bin for size 32 bytes holds up to 7 entries (default `TCACHE_COUNT`).

Sequence:
```c
void *a = malloc(24);   // req=48, goes to unsorted bin (miss tcache)
void *b = malloc(24);   // tcache for 48‑byte chunks empty, unsorted bin provides
free(a);                // a (48‑byte) placed in tcache bin[48]
void *c = malloc(24);   // tcache hit: pop a, no arena lock
printf("%p %p %p\n", a, b, c); // a and c may be same address
```
*Why faster?* The second `malloc(24)` after the free avoids acquiring the global arena lock, eliminating a potential context switch and cache‑line bounce.

### Example 3: External Fragmentation Demonstration
Consider a heap with the following free chunks (sizes include overhead):
| Addr (hex) | Size | State |
|------------|------|-------|
| 0x602000   | 64   | free |
| 0x602040   | 128  | free |
| 0x6020c0   | 64   | free |
| 0x602100   | 256  | allocated |

A program requests 150 bytes (`req = 160` after rounding). The allocator scans bins:
* No fast/small bin fits (max smallbin ≤ 64).  
* Unsorted bin contains the three free chunks but none ≥ 160 individually.  
* It must **coalesce**: adjacent free chunks 0x602000+0x602040 = 192 bytes (still not adjacent to 0x6020c0 because 0x6020c0 is separated by the allocated 256‑byte chunk).  
* After freeing the allocated 256‑byte chunk, the three free chunks become contiguous → 64+128+64 = 256 bytes, satisfying the request.

This illustrates how external fragmentation arises from **non‑contiguous free regions** and why coalescing on `free` is essential.

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Using memory after `free` (use‑after‑free)** | The pointer still points to a chunk that may have been reallocated or returned to the kernel. | Leads to data corruption, crashes, or exploitable security vulnerabilities (e.g., heap spraying). |
| **Double `free` on the same pointer** | The allocator’s internal bookkeeping (fd/bk pointers, tcache counts) gets corrupted. | Can cause arbitrary memory write via unlink attacks or abort the program via heap consistency checks. |
| **Mismatched allocation/deallocation (e.g., `malloc` + `delete`)** | C++ `delete` expects objects allocated with `new` (which may call constructors/destructors and use a different allocator). | Invokes undefined behavior; destructors may run on uninitialized memory, causing resource leaks or crashes. |
| **Assuming `malloc` returns zero‑filled memory** | The allocator only guarantees suitably aligned storage; contents are indeterminate. | Reading uninitialized values yields nondeterministic results; security‑sensitive code may leak kernel stack data. |
| **Neglecting alignment requirements for SIMD types** | Allocating `float[4]` with `malloc(16)` may return a pointer only 8‑byte aligned on some implementations. | SIMD load/store instructions (`movaps`) fault on misaligned addresses, causing SIGSEGV. |
| **Ignoring `errno` after `malloc` failure** | `malloc` returns `NULL` and sets `errno` to `ENOMEM` on failure. | Programs that skip the check may dereference `NULL`, leading to segmentation faults that are harder to diagnose without checking `errno`. |
| **Failing to consider the `mmap` threshold** | Large requests (> MMAP_THRESHOLD) are allocated via `mmap` and returned to the kernel with `munmap` on `free`. | Frequent large allocations/deallocations can increase system call overhead and fragment the virtual address space. |

## Exercises
### Easy
1. **Allocation/Deallocation Logging**  
   Write a C program that interposes on `malloc` and `free` (using `LD_PRELOAD` or weak symbols) to print the requested size, returned address, and timestamp for each call. Run it with a simple test workload and verify that the log matches expectations.

2. **Valgrind Leak Check**  
   Compile a program that deliberately leaks memory (e.g., loses a pointer after `malloc`). Run `valgrind --leak-check=full ./prog` and interpret the output. Fix the leak and re‑run to confirm no errors.

### Medium
3. **Segregated Fit Allocator**  
   Implement a simple memory allocator that manages a fixed‑size heap (e.g., 64 KiB obtained via `mmap`). Use power‑of‑two sized free lists (8, 16, 32, 64, 128, 256, 512, 1024 bytes). Provide `my_malloc(size)` and `my_free(ptr)` with splitting and coalescing. Test with a benchmark that allocates/frees random sizes and compare fragmentation to glibc’s `malloc` (using `mallinfo`).

4. **Tcache Statistics**  
   Write a program that fills tcache bins (e.g., repeatedly allocate and free 32‑byte blocks) then calls `malloc_info(0, stdout)` to dump internal stats. Observe the `tcache` section and explain how the counts change after each operation.

### Hard
5. **Buddy System Implementation**  
   Code a buddy allocator that obtains memory from the kernel via `mmap` in 1 MiB chunks. Implement allocation, splitting, coalescing, and a simple test harness that measures external fragmentation under a realistic allocation pattern (e.g., alternating 64‑byte and 128‑byte blocks). Compare results to the segregated fit allocator from Exercise 3.

6. **Kernel Slab Inspector**  
   Using `/proc/slabinfo` and the `slabtop` command, write a script that periodically samples slab cache usage for `kmalloc‑64`, `kmalloc‑128`, etc., and plots the growth over time while a user‑space allocator is under load. Correlate spikes in slab usage with `mmap`‑based large allocations in your program.

## Linux Connection
### Glibc’s Ptmalloc2 and Tcache
* The default allocator in GNU glibc (`malloc.c`) is **ptmalloc2**, a thread‑per‑arena variant of Doug Lea’s dlmalloc.  
* Each arena contains bins (fast, small, unsorted, large). Threads acquire an arena from a cache; if contention is high, additional arenas are created (`narenas`).  
* **tcache** (introduced glibc 2.26) provides per‑thread, lock‑free caches for small sizes (`TCACHE_MAX_BYTES = 2 KB` by default).  

### Inspecting Allocator State
```bash
# Show memory mappings of the current process (heap, anon mmap regions)
cat /proc/self/maps | grep -E 'heap|anon'

# Detailed heap layout (including size, permissions)
pmap -x $$

# Dump malloc internal statistics (requires glibc with malloc_info)
env MALLOC_MMAP_THRESHOLD_=131072 ./a.out  # run program then:
malloc_info 0 > /tmp/malloc_info.txt
grep -A2 'tcache' /tmp/malloc_info.txt
```

### Kernel Slab Allocator (for kernel objects)
* The kernel uses the **SLAB** (now **SLUB**) allocator for frequent kernel objects (e.g., `task_struct`, `inode`).  
* Caches are visible via `/proc/slabinfo`.  
* Tools: `slabtop` (top‑like view), `vmstat -m` (memory allocator stats), `sysctl vm.stat` (e.g., `vm.stat` fields).

```bash
# Observe slab usage for kmalloc-64 and kmalloc-128 while running a memory‑intensive workload
watch -n 1 "grep -E 'kmalloc-64|kmalloc-128' /proc/slabinfo"

# Real‑time slab activity
slabtop -o -s | head -20
```

### Tuning Glibc Malloc
Environment variables affect behavior:
| Variable | Effect |
|----------|--------|
| `MALLOC_MMAP_THRESHOLD_=` | Size above which `malloc` uses `mmap` instead of `brk`. |
| `MALLOC_TRIM_THRESHOLD_=` | Minimum free memory (top‑most) to trigger `malloc_trim`. |
| `MALLOC_MMAP_MAX_=` | Maximum number of `mmap`‑ed chunks allowed. |
| `TCACHE_COUNT=` | Number of entries per tcache bin (default 7). |
| `TCACHE_MAX_BYTES=` | Upper bound for tcache‑cached size. |

Example:
```bash
# Reduce tcache to 2 entries per bin to increase lock contention (for testing)
TCACHE_COUNT=2 ./my_program
```

### Connecting to Kernel Page Faults
When `malloc` needs more memory via `brk`, the kernel expands the process’s **break** and may trigger a **page fault** on first touch. You can observe this with:
```bash
# Count minor/major faults during a run
/usr/bin/time -v ./my_program  # look at "Major (requiring I/O) page faults" and "Minor (reclaiming) page faults"
```
A high minor fault rate indicates many freshly‑allocated pages being touched for the first time.

## Why This Matters
Understanding the inner workings of memory allocators lets you **predict and control** the cost of every allocation and deallocation call. By recognizing how alignment, binning, tcache, and coalescing interact, you can:

* **Eliminate hidden latency spikes** caused by arena locks or `mmap`/`munmap` system calls.  
* **Diagnose fragmentation‑induced OOM** conditions before they crash long‑running services.  
* **Tune environment variables** (`MALLOC_MMAP_THRESHOLD_`, `TCACHE_COUNT`) to match your workload’s allocation profile, reducing syscall overhead by up to 30 % in allocation‑heavy benchmarks.  
* **Write safer code**: knowing the exact layout of chunks and the guarantees (or lack thereof) of `malloc` empowers you to avoid use‑after‑free, double free, and misaligned SIMD accesses.  
* **Interpret kernel‑level tools**: when you see a slab cache growing in `/proc/slabinfo`, you can trace it back to specific user‑space allocation patterns that eventually trigger `mmap`‑ed large chunks.  

In essence, the allocator is the bridge between the **page‑granular view** the kernel offers and the **byte‑granular view** programs need. Mastering its mechanisms transforms you from a programmer who merely calls `malloc` into a systems engineer who shapes memory usage to achieve predictable performance, robust reliability, and optimal resource utilization.
