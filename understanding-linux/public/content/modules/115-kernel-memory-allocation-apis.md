---
id: 115
title: "Kernel memory allocation APIs"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
### Kernel Memory Allocation vs. User‑Space Allocation
The Linux kernel manages its own memory pool because it cannot rely on `malloc()`/`free()` which may invoke the scheduler, page faults, or context switches. Kernel allocation must work in contexts where sleeping is forbidden (e.g., interrupt handlers, softirqs) and must respect strict alignment and contiguity requirements imposed by hardware (DMA, device registers, page tables). Consequently the kernel provides a hierarchy of allocators that trade off latency, fragmentation, and virtual‑vs‑physical contiguity.

### Allocation API Layers
| API | Guarantees | Typical Use | Implementation Sketch |
|-----|------------|-------------|-----------------------|
| `alloc_pages(gfp_t gfp, unsigned int order)` | Physically contiguous **page‑aligned** blocks of size `2^order * PAGE_SIZE` | Low‑level page‑table manipulation, DMA buffers, hugepages | Buddy allocator – see §How It Works |
| `__get_free_pages(gfp_t gfp, unsigned int order)` | Wrapper that returns a virtual address for the pages obtained from `alloc_pages` | Temporary kernel buffers that need physical contiguity but can be accessed via a linear map | Calls `alloc_pages` then `__va(page_to_pfn(p) << PAGE_SHIFT)` |
| `kmalloc(size_t size, gfp_t gfp)` | Physically contiguous memory, size ≤ `PAGE_SIZE - 128` (slab limit) | Small kernel objects, structs, driver state | Slab allocator – obtains from per‑cpu caches; falls back to page allocator |
| `kmem_cache_alloc(struct kmem_cache *cachep, gfp_t gfp)` | Object‑size aligned, cache‑colored to reduce false sharing | Frequently allocated fixed‑size objects (e.g., `task_struct`, `inode`) | Slab allocator – direct cache hit |
| `vmalloc(unsigned long size)` | Virtually contiguous, may be backed by non‑contiguous physical pages | Large buffers that do not need DMA (e.g., kernel modules, vmalloc-backed vmas) | Allocates pages via `alloc_pages`, then builds a contiguous VMAP area using `vmap()` |
| `vzalloc(size)` | Same as `vmalloc()` but zero‑filled | Convenience for large zero‑initialized buffers | Calls `vmalloc()` then `memset` |

> **Why the distinction?**  
> *Physical contiguity* is required when the memory will be accessed by devices that walk page tables (DMA) or when the kernel needs to manipulate page‑table entries directly. *Virtual contiguity* suffices for purely CPU‑accessed data; it allows the kernel to satisfy large requests without suffering from external fragmentation in the page allocator.

### GFP Flags – Allocation Context Modifiers
GFP (get\_free\_pages) flags encode three orthogonal concerns:

1. **Zone modifier** – where the memory may come from (`GFP_DMA`, `GFP_DMA32`, `GFP_HIGHUSER`, `GFP_MOVABLE`).  
2. **Action modifier** – whether the allocator may sleep (`__GFP_WAIT`), invoke direct reclaim (`__GFP_RECLAIM`), or perform I/O (`__GFP_IO`).  
3. **Type modifier** – hints for the slab allocator (`__GFP_ACCOUNT` for memcg, `__GFP_ZERO` for zero‑fill).

Common combinations:
- `GFP_KERNEL` = `__GFP_WAIT | __GFP_IO | __GFP_FS` – may sleep, can trigger reclaim, suitable for process context.
- `GFP_ATOMIC` = `__GFP_HIGH` – **must not sleep**; used in interrupt, softirq, or with locks held.
- `GFP_NOIO` = `__GFP_WAIT` – may sleep but will not trigger I/O, useful when already in I/O path to avoid recursion.
- `GFP_NOWAIT` = `__GFP_ATOMIC | __GFP_NOWARN` – never sleeps, fails immediately if no memory.

> **Why GFP matters:** The allocator’s behavior (sleep vs. fail, reclaim vs. OOM) is a direct function of these flags. Choosing the wrong flag can cause deadlocks (sleeping while holding a spinlock) or spurious OOM kills.

### Allocation Contexts and Constraints
- **Process context** – may sleep → `GFP_KERNEL` acceptable.  
- **Interrupt context** – cannot sleep → `GFP_ATOMIC` or `GFP_NOWAIT`.  
- **Softirq / tasklet** – same as interrupt.  
- **When holding a spinlock** – treat as atomic context.  
- **DMA‑able memory** – need `GFP_DMA` (or `GFP_DMA32` on x86_64) to obtain addresses < 16 MiB (or < 4 GiB).  
- **High‑order allocations** (`order ≥ 1`) – increasingly likely to fail due to external fragmentation; consider `vmalloc` or split into smaller chunks.

## How It Works
### 1. Page Allocator (Buddy System)
The lowest layer manages physical memory in **zones** (ZONE_DMA, ZONE_DMA32, ZONE_NORMAL, ZONE_HIGHORDER). Each zone maintains free lists for pages of order `0 … MAX_ORDER-1` where an order‑`n` block contains `2^n` contiguous pages.

**Allocation algorithm** (`__alloc_pages_nodemask`):
1. Compute desired `order` from size: `order = get_order(size)` where `get_order(x) = ⌈log₂(x / PAGE_SIZE)⌉`.
2. Starting from the requested order, scan the free list of that order in the preferred zone.
3. If a free block is found, possibly split it (buddy splitting) until the exact order is satisfied.
4. If none, try **direct reclaim** (if `__GFP_WAIT` set) – shrink caches, invoke `kswapd`.
5. If still missing, consider **compaction** (migrate pages to create higher‑order free blocks).
6. As a last resort, invoke the OOM killer (if `__GFP_FAIR` set).

**Complexity:** Each split/merge is O(1) amortized; worst‑case scanning of free lists is O(MAX_ORDER) ≈ O(10).

**Mathematical note:** The probability of satisfying an order‑`n` request without reclaim is approximately  
$$P_n ≈ \prod_{k=0}^{n} (1 - f_k)$$  
where `f_k` is the fraction of order‑`k` blocks already allocated. This explains why high‑order allocations fail rapidly under fragmentation.

### 2. Slab Allayer (kmalloc/kmem_cache)
The slab allocator sits on top of the page allocator to eliminate fragmentation for small objects and to provide object caching.

**Key structures**
- `struct kmem_cache` – describes a cache (object size, alignment, constructor/destructor).  
- `struct kmem_cache_cpu` – per‑CPU arrays of free objects (to avoid lock contention).  
- `struct slab` – represents one or more pages holding a set of objects.

**Allocation flow (`kmalloc`):**
1. Determine the appropriate cache index: `size_idx = size_to_index(size)`.  
2. Try to obtain an object from the current CPU’s `kmem_cache_cpu->freelist`. If non‑NULL, pop it (O(1)).  
3. If the per‑CPU list is empty, invoke `__cache_alloc`:
   - Acquire the cache’s lock (or use `__this_cpu_ptr` spinless fast path).  
   - If the slab’s free list is empty, allocate a new slab via `alloc_pages(order)` where `order` is chosen to fit `objects_per_slab * object_size`.  
   - Perform object coloring (offset each slab by `cache->color * sizeof(long)`) to spread objects across cache lines, reducing false sharing.  
   - Return the object to the caller.
4. If allocation fails and `__GFP_WAIT` is set, repeat after reclaim.

**Deallocation (`kfree`)** mirrors the push onto the per‑CPU freelist; when a slab becomes completely empty it is returned to the page allocator via `free_pages`.

**Why slab reduces fragmentation:**  
- Objects are reused from the same slab, so external fragmentation only occurs at the slab level (whole pages).  
- Internal fragmentation is bounded by `sizeof(object) - 1` byte per object (plus coloring offset).

### 3. Vmalloc Interface
`vmalloc()` solves the need for virtually contiguous memory when the request size exceeds what `kmalloc` can provide or when physical contiguity is unnecessary.

**Steps:**
1. Convert size to page count: `npages = DIV_ROUND_UP(size, PAGE_SIZE)`.  
2. Allocate `npages` pages via `alloc_pages(0, gfp)` (order‑0, i.e., single pages).  
3. Reserve a virtual address range in the `VMALLOC_START … VMALLOC_END` region using `__get_vm_area_node`.  
4. Build a contiguous page table mapping: for each allocated page, call `map_vm_area` which inserts a PTE into the kernel’s page tables via `kernel_map_pages`.  
5. Return the start virtual address.

**Cost analysis:**  
- Each page requires one kernel PTE (8 bytes on x86_64).  
- The virtual address space consumed is `npages * PAGE_SIZE`.  
- No external fragmentation in the page allocator because only order‑0 pages are used, but there is **internal fragmentation** due to the vmalloc area’s guard pages and alignment.

**Freeing (`vfree`):**  
- Unmap the PTEs (`unmap_vm_area`).  
- Release the vm area struct.  
- Return each page to the page allocator via `__free_pages`.

## Worked Examples
### Example 1: Allocating a 256‑byte Structure with `kmalloc`
Suppose we need a per‑connection context (`struct conn_ctx`) that is 256 bytes, used in softirq context.

```c
#include <linux/slab.h>
#include <linux/types.h>

struct conn_ctx {
    u32 src_ip;
    u32 dst_ip;
    u16 src_port;
    u16 dst_port;
    atomic_t refcnt;
    char  payload[220];   /* 220 + 4+4+2+2+4 = 256 */
};

/* Called from softirq – must not sleep */
static struct conn_ctx *conn_alloc(void)
{
    /* GFP_ATOMIC | __GFP_NOFAIL would loop until success; we avoid that */
    struct conn_ctx *ctx = kmalloc(sizeof(*ctx), GFP_ATOMIC | __GFP_ZERO);
    if (!ctx) {
        /* In softirq we cannot printk with KERN_ERR that may wake up tasks;
         * use rate‑limited netdev_dbg instead if needed.
         */
        return NULL;
    }
    /* Optional: initialize fields here */
    return ctx;
}

/* Usage */
static void conn_handler(struct sk_buff *skb)
{
    struct conn_ctx *ctx = conn_alloc();
    if (!ctx) {
        /* Drop packet or reuse a pre‑allocated pool */
        kfree_skb(skb);
        return;
    }
    /* Fill ctx … */
    /* When done */
    kfree(ctx);
}
```
**Reasoning:**  
- `sizeof(*ctx) = 256` bytes < `PAGE_SIZE - 128` (on 4 KiB pages) → satisfies `kmalloc` size limit.  
- `GFP_ATOMIC` forbids sleeping; the allocation will either succeed immediately or return `NULL`.  
- `__GFP_ZERO` zeroes the memory, preventing information leaks.  
- The caller checks the return value; in atomic context we cannot sleep, so we must handle failure gracefully.

### Example 2: Allocating a 4 MiB Buffer for a Network Device Ring with `vmalloc`
A driver needs a contiguous virtual buffer for TX descriptors that will be accessed by the CPU only (no DMA).

```c
#include <linux/vmalloc.h>
#include <linux/mm.h>

#define TX_RING_SIZE  (4 * 1024 * 1024)   /* 4 MiB */

static void *tx_ring_alloc(void)
{
    /* We are in module init – process context, can sleep */
    void *buf = vmalloc(TX_RING_SIZE);
    if (!buf) {
        pr_err("%s: vmalloc(%u) failed\n", __func__, TX_RING_SIZE);
        return NULL;
    }
    /* Optional: clear the buffer */
    memset(buf, 0, TX_RING_SIZE);
    return buf;
}

static void tx_ring_free(void *buf)
{
    if (buf)
        vfree(buf);
}

/* Module init */
static int __init mydrv_init(void)
{
    void *ring = tx_ring_alloc();
    if (!ring)
        return -ENOMEM;
    /* Store ring in device structure … */
    return 0;
}
static void __exit mydrv_exit(void)
{
    vfree(ring);
}
module_init(mydrv_init);
module_exit(mydrv_exit);
```
**Step‑by‑step accounting:**  
- `TX_RING_SIZE = 4 MiB = 4096 KiB = 4096 * 1024 bytes`.  
- Number of pages: `npages = 4 MiB / 4 KiB = 1024` pages.  
- `vmalloc` allocates 1024 order‑0 pages (each 4 KiB) → 4 MiB of physical RAM, possibly scattered.  
- It then creates a VMAP area and populates the kernel page table with 1024 PTEs → `1024 * 8 B = 8 KiB` of page‑table overhead.  
- The virtual address returned is guaranteed to be contiguous over the full 4 MiB range, allowing simple pointer arithmetic (`ring + i * desc_size`).

### Example 3: Using `alloc_pages` for a DMA‑Capable Buffer
A RAID controller needs a 64 KiB buffer that must be physically contiguous and DMA‑able (below 16 MiB on legacy ISA).

```c
#include <linux/gfp.h>
#include <linux/pci.h>

#define DMA_BUF_SIZE  (64 * 1024)   /* 64 KiB */

static void *dma_buf_alloc(struct pci_dev *pdev)
{
    unsigned int order = get_order(DMA_BUF_SIZE);   /* 64KiB / 4KiB = 16 pages → order = 4 */
    gfp_t flags = GFP_KERNEL | GFP_DMA;             /* may sleep, require ZONE_DMA */

    struct page *page = alloc_pages(flags, order);
    if (!page)
        return NULL;

    /* Convert struct page to kernel virtual address */
    void *addr = page_address(page);   /* same as __va(page_to_pfn(page) << PAGE_SHIFT) */
    return addr;
}

static void dma_buf_free(void *addr)
{
    struct page *page = virt_to_page(addr);
    unsigned int order = compound_order(page);   /* returns the original order */
    __free_pages(page, order);
}
```
**Derivation of `order`:**  
- `PAGE_SIZE = 2^12 = 4096`.  
- Required size `S = 65536 = 2^16`.  
- `order = log₂(S / PAGE_SIZE) = log₂(2^16 / 2^12) = log₂(2^4) = 4`.  
Thus we allocate `2^4 = 16` contiguous pages → `16 * 4096 = 65536` bytes.

**Why `GFP_DMA`?**  
On x86, `ZONE_DMA` covers the first 16 MiB of physical memory, ensuring the address returned by `page_to_pfn(page) << PAGE_SHIFT` is ≤ 0xFFFFFF, which legacy ISA DMA controllers can address.

## Common Mistakes
| Mistake | What’s Wrong | Why It Breaks |
|---------|--------------|---------------|
| **Using `kmalloc(size > PAGE_SIZE-128, GFP_KERNEL)`** | Requests an object larger than the slab’s maximum size. | The slab allocator will fallback to `__get_free_pages`, but the caller may assume the returned pointer is safe to use with `ksize()` or to hold a lock while sleeping, leading to subtle bugs or wasted memory. |
| **Calling `vmalloc()` in interrupt context** | `vmalloc()` may sleep during page allocator reclaim or while waiting for a vm area lock. | Sleeping while holding a spinlock or in hard‑irq triggers a **BUG: sleeping function called from invalid context** and can lock up the system. |
| **Failing to call `vfree()` on memory allocated with `vmalloc()`** | Leaks vm‑area structures and leaves PTEs populated. | Over time the vmalloc area exhausts its virtual address space (`VMALLOC_END - VMALLOC_START`), causing subsequent `vmalloc()` calls to fail with `ENOMEM` even though physical RAM is free. |
| **Using `GFP_ATOMIC` for a large, high‑order allocation** | High‑order allocations are unlikely to succeed without reclaim; `GFP_ATOMIC` prohibits reclaim. | The allocation will almost always fail, causing driver initialization to abort or runtime packets to be dropped. |
| **Assuming `kmalloc` returns physically contiguous memory for sizes > `PAGE_SIZE`** | For large requests the slab allocator may obtain multiple pages via the buddy system but **does not guarantee** they are physically contiguous as a single chunk (it returns a pointer to the first page, but the caller may not know the exact layout). | If the caller passes the pointer to a device that expects a single DMA‑mappable segment, the device will see only the first page, causing data corruption. |
| **Mixing `kfree()` with `vfree()`** | Passing a `vmalloc()` pointer to `kfree()` (or vice‑versa) corrupts the slab or page allocator freelists. | Results in slab poisoning warnings, double‑free, or use‑after‑free crashes observable via `kasan` or `kmemleak`. |

## Exercises
### Easy
1. **Size‑to‑order conversion** – Write a small kernel module that prints, for sizes from 64 B to 4 MiB, the order required by `get_order(size)`. Verify the output against the formula `order = ⌈log₂(size / PAGE_SIZE)⌉`.  
2. **Slab cache inspection** – Use `slabtop` and `cat /proc/slabinfo` to locate the cache for `struct file`. Report its object size, number of active objects, and memory usage.

### Moderate
3. **Custom kmem_cache** – Implement a kernel module that defines a `kmem_cache` for a 128‑byte structure, allocates 10 000 objects, stresses the cache with random allocations/frees, and then reports cache statistics (`num_active`, `num_allocations`). Compare the fragmentation (`wasted`) against using `kmalloc` directly for the same workload.  
4. **vmalloc overhead measurement** – Allocate a series of buffers sized at 2 MiB, 4 MiB, 8 MiB using `vmalloc()`. After each allocation, read `/proc/vmallocinfo` (or `cat /proc/mallocinfo` if available) to extract the total vmalloc space used and the number of page‑table entries. Plot the overhead (page‑table bytes) vs. buffer size and verify it grows linearly with size / PAGE_SIZE.

### Hard
5. **High‑order allocator stress** – Write a module that repeatedly attempts `alloc_pages(GFP_KERNEL, order)` for `order = 0 … 5` in a loop, recording success/failure rates. Then introduce memory pressure via a user‑space program that allocates and dirties anonymous memory (`mmap` + `touch`). Observe how the success rate for higher orders drops and relate it to the buddy system’s fragmentation formula.  
6. **DMA‑buffer verification** – Allocate a 64 KiB buffer with `alloc_pages(GFP_KERNEL | GFP_DMA, order)` for a PCI device. Map it with `pci_map_single()` and verify that the returned DMA address is ≤ 0xFFFFFF. Then, deliberately allocate with `GFP_KERNEL` only (no `GFP_DMA`) and show that the mapping fails (`pci_map_single` returns `DMA_MAPPING_ERROR`) on a system where ZONE_DMA is exhausted.

## Linux Connection
Real‑world interfaces let you observe and manipulate the kernel’s memory subsystems:

| Interface | Purpose | Example Command |
|-----------|---------|-----------------|
| `/proc/meminfo` | Global memory statistics (total, free, buffers, slab, etc.) | ```bash\ncat /proc/meminfo | grep -E '^(MemTotal|MemFree|Slab|SReclaimable|SUnreclaim)'\n``` |
| `/proc/slabinfo` | Per‑slab cache statistics (objects, size, usage) | ```bash\nslabtop -o   # or\ncat /proc/slabinfo | head -20\n``` |
| `/proc/buddyinfo` | Buddy allocator free‑block counts per zone and order | ```bash\ncat /proc/buddyinfo\n``` |
| `/proc/vmallocinfo` (if `CONFIG_DEBUG_VM_VMACACHE` enabled) | Current vmalloc allocations, sizes, and callers | ```bash\ncat /proc/vmallocinfo\n``` |
| `vmstat -m` | Memory allocator statistics (including slab) | ```bash\nvmstat -m\n``` |
| `perf record -e kmem:kmalloc,kmem:kmem_cache_alloc` | Trace kmalloc/kmem_cache_alloc events | ```bash\nperf record -g -e kmem:kmalloc -e kmem:kmem_cache_alloc sleep 5\nperf report\n``` |
| `debugfs` (if enabled) | `cat /sys/kernel/debug/kmemleak` for leak detection | ```bash\nmount -t debugfs none /sys/kernel/debug\ncat /sys/kernel/debug/kmemleak\n``` |
| `dmesg` | Kernel log – useful for seeing allocation failures (`kmalloc: allocate memory failed`) | ```bash\ndmesg | tail -20\n``` |
| `kdump` / `crash` | Post‑mortem analysis of allocation state | ```bash\ncrash /usr/lib/debug/lib/modules/$(uname -r)/vmlinux /var/crash/*/vmcore\n``` |

**Exercise:** Run the following to see how slab usage changes after loading and unloading a module that does many `kmalloc`/`kfree` cycles:

```bash
# Baseline
cat /proc/slabinfo | grep -E '^kmalloc-[0-9]+' > /tmp/slab_before.txt

# Insert a module that allocates/frees
insmod ./slab_test.ko   # module does 100 000 kmalloc/kfree of 64‑byte objects

# After load
cat /proc/slabinfo | grep -E '^kmalloc-[0-9]+' > /tmp/slab_after.txt

# Show diff
diff -u /tmp/slab_before.txt /tmp/slab_after.txt

# Remove module
rmmod slab_test
```

## Why This Matters
Mastering the kernel’s allocator hierarchy enables you to:

1. **Match allocation API to context** – Choosing `GFP_ATOMIC` vs. `GFP_KERNEL` prevents deadlocks in interrupt handlers; using `vmalloc` for large, CPU‑only buffers avoids unnecessary fragmentation in the buddy allocator.
2. **Predict and control fragmentation** – Understanding the buddy system’s order‑based allocation and the slab layer’s per‑CPU caches lets you size objects and order‑requests to keep external fragmentation low, which is critical for long‑running systems and real‑time workloads.
3. **Tune performance** – Measuring slab cache hit rates (`slabinfo`) or vmalloc page‑table overhead (`vmallocinfo`) guides decisions such as creating a dedicated `kmem_cache` for frequently allocated structures, reducing lock contention and cache misses.
4. **Debug reliably** – Tools like `kmemleak`, `kasan`, and `perf` only give meaningful output when you know which allocator backed the offending pointer; mis‑attributing a `vmalloc` leak to the slab layer wastes time.
5. **Leverage hardware features** – Proper use of `GFP_DMA`/`GFP_DMA32` and `alloc_pages` ensures buffers satisfy device DMA constraints, preventing silent data corruption on legacy or narrow‑bus peripherals
