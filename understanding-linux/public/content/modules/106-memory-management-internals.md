---
id: 106
title: "Memory management internals"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

Every `read()` syscall, every `kmalloc()`, every page fault that silently fixes a missing mapping — all of them flow through the same layered memory management stack. That stack exists because each layer addresses a specific inadequacy of the one below it: raw pages are too coarse for kernel objects, unconstrained allocation fragments physical memory, and without a cache every file read would serialize on disk latency. Understanding the architecture means understanding *why* each layer was added, not just that it exists.

---

## Core Concepts

### Pages: The Unit of Physical Tracking

The MMU translates virtual addresses to physical addresses in fixed-size chunks. The kernel's memory management mirrors this hardware constraint: the page is the smallest unit you can allocate, map, or evict. Everything else is built on top of this granularity.

Each physical page frame is described by a `struct page` in `include/linux/mm_types.h`. On x86-64 with 4 KB pages:

$$\text{page frames} = \frac{\text{RAM}}{2^{12}}$$

For 16 GB of RAM: $\frac{2^{34}}{2^{12}} = 2^{22} = 4{,}194{,}304$ `struct page` objects. Each `struct page` is 64 bytes on x86-64, so the page frame array alone consumes:

$$4{,}194{,}304 \times 64 = 256 \text{ MB}$$

That 256 MB is permanently wired into the kernel — it is the cost of being able to describe all of physical memory. This fixed overhead is called the **mem_map** and is why embedded systems with tight RAM budgets sometimes use NOMMU configurations.

The physical-to-`struct page` mapping is either a flat array (`mem_map`) or a sparse encoding (`CONFIG_SPARSEMEM`) for systems with non-contiguous physical RAM (hotplug memory, NUMA nodes with holes). The conversion macros are `pfn_to_page(pfn)` and `page_to_pfn(page)`.

Architecture-specific page sizes:

| Architecture | Default Page Size |
|---|---|
| x86-32 | 4 KB ($2^{12}$) |
| x86-64 | 4 KB ($2^{12}$) |
| ARM64 | 4 KB, 16 KB, or 64 KB (compile-time) |
| RISC-V | 4 KB ($2^{12}$) |

Huge pages (2 MB on x86-64, using the PDE rather than PTE level) exist specifically to reduce TLB pressure on large working sets. A single 2 MB TLB entry covers what would otherwise require 512 4 KB entries.

### Zones: Encoding Hardware Constraints

The allocator cannot treat all physical RAM as equivalent because hardware imposes real constraints:

- **ISA DMA controllers** can only address 24-bit physical addresses (below 16 MB). If the kernel allocates a DMA buffer above 16 MB for an ISA device, the transfer silently corrupts memory.
- **32-bit kernels** have a 4 GB virtual address space. The kernel portion is typically 1 GB (from `0xC0000000`), leaving 896 MB directly mapped and the remainder (`ZONE_HIGHMEM`) accessible only through temporary mappings via `kmap()`.

Linux encodes these constraints as **zones** within each NUMA node (`struct pglist_data` → `struct zone`):

| Zone | x86-32 Physical Range | x86-64 Physical Range | Purpose |
|---|---|---|---|
| `ZONE_DMA` | 0 – 16 MB | 0 – 16 MB | ISA DMA |
| `ZONE_DMA32` | — | 0 – 4 GB | 32-bit PCI DMA |
| `ZONE_NORMAL` | 16 MB – 896 MB | 4 GB – end | Directly mapped |
| `ZONE_HIGHMEM` | > 896 MB | — (not used) | Temporarily mapped |

On x86-64, `ZONE_HIGHMEM` does not exist: the 64-bit virtual address space is large enough to permanently map all physical RAM. The complexity of `kmap()`/`kunmap()` is an artifact of the 32-bit era that still exists in the source for 32-bit targets.

The allocator applies a **zone watermark** system. Each zone has three watermarks — `WMARK_MIN`, `WMARK_LOW`, and `WMARK_HIGH` — expressed in pages:

- Above `WMARK_HIGH`: allocations proceed freely.
- Between `WMARK_LOW` and `WMARK_HIGH`: `kswapd` is woken to begin background reclaim.
- Below `WMARK_MIN`: direct reclaim is triggered in the allocating process's context (a latency spike for the caller).
- Below a per-zone "min" reserved pool: allocation fails outright (or invokes the OOM killer).

```bash
# Current zone state and watermarks
cat /proc/zoneinfo

# Summary of zone free pages
cat /proc/buddyinfo
```

### The Buddy Allocator: Bounded Fragmentation

The kernel frequently needs physically contiguous pages — DMA buffers that a device will scatter-gather across, slab backing store, huge page mappings. A simple first-fit allocator satisfies this initially but degrades: after enough alloc/free cycles you get many small free regions that cannot satisfy a large contiguous request even when total free memory is ample. This is **external fragmentation**.

The buddy allocator bounds fragmentation by constraining which addresses can form free blocks. A free block at order $n$ starts at an address aligned to $2^n \times \text{PAGE\_SIZE}$, and its buddy is at:

$$\text{buddy\_pfn} = \text{pfn} \oplus 2^n$$

where $\text{pfn}$ is the page frame number. The XOR flips exactly bit $n$, producing the unique partner block of the same size that is adjacent and alignment-compatible for merging.

The allocator maintains 11 free lists (order 0 through 10), per zone, per NUMA node. Order 10 is $2^{10} = 1024$ pages = 4 MB on a 4 KB page system. Allocation at order $n$:

1. If the order-$n$ free list is non-empty, pop one block and return it.
2. Otherwise, find the lowest order $k > n$ with a free block.
3. Split that block repeatedly: each split produces two order-$(k{-}1)$ buddies. One goes onto the order-$(k{-}1)$ free list; the other is split again. Continue until you hold an order-$n$ block.

Freeing a block at order $n$:

1. Compute `buddy_pfn = pfn ^ (1 << n)`.
2. If the buddy is free and at the same order, remove it from the free list and merge: `pfn = min(pfn, buddy_pfn)`, increment order.
3. Repeat from step 1 until the buddy is not free or order 10 is reached.
4. Add the final block to the appropriate free list.

The merge is the critical property: fragmentation cannot accumulate indefinitely. Any time two buddies are both free, they will merge. The worst case is alternating alloc/free of order-0 pages that prevent any merging — but even then, the fragmentation is localized to order 0.

```bash
# See how many blocks are free at each order for each zone
# Format: zone name, then counts for orders 0..10
cat /proc/buddyinfo

# Example output on a 16 GB machine:
# Node 0, zone   Normal   420  180   93   47   22   11    5    2    1    0    1
# Lots of order-0 free (420), few large contiguous blocks — normal fragmentation
```

The kernel tracks **fragmentation index** and can compact memory — migrating movable pages to consolidate free space — triggered by `CONFIG_COMPACTION`. You can trigger it manually:

```bash
echo 1 > /proc/sys/vm/compact_memory
```

### Slab Allocator: Eliminating Per-Object Page Overhead

Even with the buddy allocator, allocating a 4 KB page for a 232-byte `struct inode` wastes:

$$\frac{4096 - 232}{4096} \approx 94\%$$

of that page. Worse, the kernel allocates and frees inodes at high frequency. Returning a page to the buddy allocator on every free — and re-initializing the object's locks, lists, and reference counts on every allocation — is prohibitively expensive.

The **slab allocator** (original design: Bonwick 1994, Sun Solaris) addresses both problems. Its Linux descendants are SLAB (original port), SLUB (default since 2.6.23, `CONFIG_SLUB`), and SLOB (for small embedded targets). The concepts are the same; SLUB simplifies the metadata and eliminates per-slab descriptor overhead.

Structure of a SLUB cache:

- A `struct kmem_cache` describes the object type: size, alignment, constructor/destructor, NUMA policy.
- The cache is backed by **slabs** — groups of one or more contiguous pages from the buddy allocator.
- Each slab is subdivided into fixed-size slots. A free list threads through empty slots using a small integer index (SLUB stores the next-free index in the free slot itself, avoiding a separate free-list pointer per slot).
- Each CPU has a **per-CPU partial slab** it allocates from without taking any lock. Cross-CPU frees go into a per-node list.

The per-CPU path for `kmalloc()` is:

1. Round the size up to the nearest SLUB size class (8, 16, 32, 64, ... bytes).
2. Load the per-CPU slab for that size class.
3. Pop the first free slot from the freelist — no lock, no atomic operation on the hot path.
4. If the per-CPU slab is exhausted, grab a partial slab from the per-node list (lock required), or allocate a new slab from the buddy allocator.

The **object lifetime** insight: when
