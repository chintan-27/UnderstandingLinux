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

## Module 202: Memory Allocators — malloc Internals, Arenas, Fragmentation, and tcache

## Why This Matters

Every `malloc()` call goes to a userspace allocator, not the kernel. If it went to the kernel directly, a tight loop allocating 8-byte nodes for a linked list would issue a system call per node — roughly 100–300 ns of kernel-crossing overhead each, versus ~5 ns for a tcache hit. The allocator exists to amortize that cost: it acquires memory from the kernel in bulk and subdivides it internally.

The design decisions that make this fast — lock-free thread-local caches, no coalescing in fast paths, arena sharding — are also what make allocator behavior surprising in production. A server's RSS grows past its working set because freed memory pools in per-thread caches the OS cannot see. `free()` does not return memory to the OS because the allocator is holding it for reuse. A tcache poisoning attack works because `free()` to the tcache skips every integrity check. These are not edge cases; they are direct consequences of how the allocator is designed.

---

## Core Concepts

### The Allocator's Contract with the Kernel

`malloc()` is a libc function. The kernel provides two interfaces for acquiring anonymous memory:

- `brk(2)` / `sbrk(2)`: moves the program break — the end of the data segment — upward, extending a single contiguous heap region. Cheap but inflexible: you cannot punch holes in the middle.
- `mmap(2)` with `MAP_ANONYMOUS | MAP_PRIVATE`: maps a new region anywhere in the address space. More flexible, required for large allocations and for additional arenas (which cannot use the `brk` heap).

glibc's threshold for switching from `brk` to `mmap` for individual allocations is 128 KB by default (`M_MMAP_THRESHOLD` in `mallopt(3)`). Below that threshold, allocations come from the subdivided `brk` heap or existing arenas. Above it, each allocation gets its own `mmap` region that `free()` can `munmap` immediately.

```c
// The two kernel interfaces the allocator uses
void *sbrk(intptr_t increment);          // extend brk heap; returns old break
void *mmap(void *addr, size_t length,    // new anonymous region
           int prot, int flags,
           int fd, off_t offset);
int   munmap(void *addr, size_t length); // return mmap region to OS
```

### Chunk Layout: Where the Metadata Lives

Every allocation is wrapped in a **chunk**. The chunk header is stored in the bytes *immediately before* the pointer `malloc()` returns. On a 64-bit system:

```
  higher address
  ┌──────────────────────────┐  ← chunk start (what the allocator tracks)
  │  prev_size   (8 bytes)   │  ← size of previous chunk; valid only if prev is free
  ├──────────────────────────┤
  │  size | flags (8 bytes)  │  ← chunk size (always a multiple of 16) + 3 flag bits
  ├──────────────────────────┤  ← malloc() returns THIS address
  │  user data               │
  │  ...                     │
  └──────────────────────────┘
  lower address
```

The three flag bits packed into the low bits of the `size` field (possible because size is always 16-byte aligned, so bits 0–2 are always zero in the raw size):

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | `PREV_INUSE` | Previous (lower) chunk is currently allocated |
| 1 | `IS_MMAPPED` | This chunk was obtained via `mmap`, not the brk heap |
| 2 | `NON_MAIN_ARENA` | This chunk belongs to a non-main arena |

To extract the true size, mask off those bits:

$$\text{true\_size} = \text{size\_field} \;\&\; \sim 0x7$$

The minimum chunk size on 64-bit is 32 bytes (16 bytes of header + at minimum 16 bytes of usable space, padded to alignment). A `malloc(1)` returns 16 bytes of usable space, not 1. The chunk occupies 32 bytes total. That is internal fragmentation baked into the design.

The corresponding glibc struct (simplified from `malloc/malloc.c`):

```c
struct malloc_chunk {
    size_t prev_size;   /* size of previous chunk, if it's free */
    size_t size;        /* size of this chunk + flag bits */

    /* These fields only exist in FREE chunks; in allocated chunks
       this space is part of the user data region */
    struct malloc_chunk *fd;   /* forward pointer (free list) */
    struct malloc_chunk *bk;   /* back pointer (free list) */

    /* Large bins only */
    struct malloc_chunk *fd_nextsize;
    struct malloc_chunk *bk_nextsize;
};
```

Writing past the end of your allocation overwrites `prev_size` of the next chunk. Writing before your pointer overwrites your own chunk's `size` field. Both are exploitable.

### Bins: Free Lists Organized by Size Class

When a chunk is freed (and not placed in the tcache), it goes into a **bin** — a free list inside the arena. The bin determines how quickly the allocator can find a reusable chunk.

| Bin type     | Size range (64-bit)  | Structure            | Notes |
|--------------|----------------------|----------------------|-------|
| Fast bins    | 32–160 bytes         | Singly-linked, LIFO  | No coalescing; 10 bins |
| Small bins   | 32–504 bytes         | Doubly-linked, FIFO  | 62 bins, exact-size match |
| Large bins   | ≥ 512 bytes          | Doubly-linked, sorted by size | 63 bins, best-fit within bin |
| Unsorted bin | Any size             | Doubly-linked        | Staging area; chunks sorted on next malloc |

Fast bins are deliberately kept uncoalesced. Adjacent free chunks that would otherwise merge stay separate, keeping the fast-bin operation O(1) with no neighbor inspection. The cost is that a sequence of `malloc(24); free(); malloc(24); free()` cycles creates a pool of reusable 24-byte chunks that never merge into something larger — correct for workloads with uniform small allocations, pathological for workloads that later need larger ones.

The unsorted bin is a single FIFO that catches chunks coming from `_int_free()`. On the next `_int_malloc()` call, chunks in the unsorted bin are inspected one by one: exact-size matches are returned immediately; others are sorted into the appropriate small or large bin. This batches the sort cost.

### Arenas: Sharding the Heap to Reduce Lock Contention

The entire bin data structure is protected by a mutex. With one heap and $N$ threads all calling `malloc()`, throughput is serialized — one thread holds the lock while all others spin. The solution is **arenas**: independent heap regions, each with its own bins, top chunk, and mutex.

glibc creates at most $8 \times N_{cpu}$ arenas (tunable via `MALLOC_ARENA_MAX`). Each arena is either:
- The **main arena**: backed by the `brk` heap (one per process, always exists)
- A **non-main arena**: backed by one or more `mmap` regions

When a thread calls `malloc()`, it tries to lock its last-used arena. If that arena is contended, it tries other arenas round-robin. If all are contended and the arena count is below the limit, it creates a new one via `mmap`.

The `mmap`-backed non-main arenas come in fixed-size chunks of `HEAP_MAX_SIZE` (64 MB on 64-bit). Within that mapped region, the arena grows its top chunk as needed. Unlike the main arena, a non-main arena *can* release its backing `mmap` region when entirely freed.

The arena structure lives at the base of its own heap region. Its definition in glibc (`malloc/arena.c`):

```c
struct malloc_state {
    mutex_t mutex;                      /* arena lock */
    int flags;
    mfastbinptr fastbinsY[NFASTBINS];   /* 10 fast bin heads */
    mchunkptr top;                      /* top chunk (wilderness) */
    mchunkptr last_remainder;
    mchunkptr bins[NBINS * 2 - 2];      /* small, large, unsorted bins */
    unsigned int binmap[BINMAPSIZE];    /* bitmap for non-empty bins */
    struct malloc_state *next;          /* linked list of all arenas */
    struct malloc_state *next_free;
    size_t attached_threads;
    size_t system_mem;                  /* bytes obtained from OS */
    size_t max_system_mem;
};
```

### tcache: Per-Thread Allocation Without Locks

Introduced in glibc 2.26 (2017), the **tcache** (thread-local cache) is a per-thread array checked *before* any arena. It requires no mutex because it is private to one thread.

Each thread has a `tcache_perthread_struct` allocated on its heap at thread initialization:

```c
typedef struct tcache_entry {
    struct tcache_entry *next;   /* singly-linked free list */
    struct tcache_perthread_struct *key;  /* added in glibc 2.29: double-free detection */
} tcache_entry;

typedef struct tcache_perthread_struct {
    uint16_t counts[TCACHE_MAX_BINS];    /* entries in each bin; max 7 */
    tcache_entry *entries[TCACHE_MAX_BINS]; /* heads of free lists */
} tcache_perthread_struct;
```

There are 64 size classes, covering request sizes 24 through 1032 bytes in steps of 16. Each bin holds at most 7 entries (tunable via `MALLOC_TCACHE_COUNT`). The lookup from request size to bin index:
