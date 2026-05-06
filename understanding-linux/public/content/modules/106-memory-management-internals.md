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

## Core Concepts
### Pages, Page Size, and the MMU
The Linux memory manager works with the hardware’s notion of a *page*—a contiguous, power‑of‑two‑sized block of physical memory that the MMU can map in a single page‑table entry. On x86_64 the default page size is $P = 4096$ bytes ($2^{12}$).  
Why this size?  
* The MMU uses a fixed‑width page‑table entry (typically 8 bytes). A larger page reduces the number of entries needed to cover a given address range, lowering TL‑B pressure and page‑walk cost.  
* A smaller page increases internal fragmentation for typical allocations (most objects are far smaller than a page) but reduces external fragmentation. The 4 KB size is a compromise that matches the granularity of most disk sectors and the typical stride of file‑system blocks.

Physical memory is divided into **zones** to honor hardware constraints:

| Zone            | Physical range (typical) | Purpose |
|-----------------|--------------------------|---------|
| `ZONE_DMA`      | $[0, 16\text{MB})$       | Addresses usable by legacy DMA devices that can only access the low 16 MB. |
| `ZONE_NORMAL`   | $[16\text{MB}, 896\text{MB})$ | Regular kernel‑mappable memory; all addresses here have a permanent low‑memory mapping in the kernel’s virtual address space. |
| `ZONE_HIGHMEM`  | $[896\text{MB}, \infty)$ | Memory that is not permanently mapped; the kernel must create a temporary kernel virtual address (via `kmap`) before accessing it. |

The exact boundaries are exposed via `/proc/zoneinfo` and are determined at boot from the BIOS‑provided memory map and kernel configuration (`CONFIG_ZONE_DMA`, `CONFIG_HIGHMEM`).

### Buddy Allocator – Power‑of‑Two Splitting
The buddy allocator manages **page frames** (not individual bytes). A request for $n$ pages is satisfied by allocating a block of order $k$ where $2^k \ge n$ and the block size is $S_k = 2^k \cdot P$.  

*Why powers of two?*  
When a block is split, the two halves are **buddies**: they have the same size and their starting addresses differ only in the $k$‑th bit. This property lets the allocator test buddy‑ness with a single XOR and merge in $O(1)$ time.

**Allocation algorithm** (simplified):
1. Compute required order: $k = \lceil\log_2 n\rceil$.  
2. Starting from order $k$, scan the free‑list for that order; if none, try $k+1$, $k+2$, … up to `MAX_ORDER` (typically 10 → 1024 pages).  
3. If a block of order $j>k$ is found, split it repeatedly: each split creates two buddies of order $j-1$; one buddy is used to satisfy the request, the other is inserted into the free‑list of order $j-1$.  
4. On free, compute the block’s order, locate its buddy (address XOR $1<<(order+PAGE_SHIFT)$), and if the buddy is free, merge and repeat.

**Internal fragmentation** bound: worst‑case waste < $S_k - n\cdot P \le (2^k - n)P$. For a request of 3 pages ($n=3$) we allocate order $k=2$ (4 pages) → waste of 1 page (25 %).  

The allocator is **lock‑per‑zone** (`zone->lock`) to allow concurrent allocations from different zones without contention.

### Slab Allocator – Object Caching
The slab allocator sits on top of the buddy system and caches *objects* of a fixed size (e.g., `struct task_struct`, `struct inode`). Its goals:
* Eliminate fragmentation for small allocations.  
* Reduce initialization cost by reusing already‑constructed objects.  
* Provide per‑CPU caches to avoid lock contention on the hot path.

A **cache** (`kmem_cache_t`) is created with:
```c
struct kmem_cache *cache = kmem_cache_create(
    "myobj", sizeof(struct myobj), 0,
    SLAB_HWCACHE_ALIGN, constructor, destructor);
```
* `SLAB_HWCACHE_ALIGN` ensures each object starts on a cache‑line boundary, preventing false sharing.  
* The allocator stores free objects in a **per‑CPU array** (`cpu_slab`). When the array is empty, it pulls a slab (one or more contiguous pages) from the buddy allocator, slices it into objects, and refills the per‑CPU array.

**Why slabs reduce fragmentation:**  
All objects in a slab have identical size, so any free slot can satisfy any allocation request for that size. External fragmentation only occurs at the slab level (whole slabs returned to the buddy system), which is rare because slabs are typically kept alive as long as there is any live object.

### Page Cache – File‑Backed Pages
The page cache caches *pages* that back regular files or block devices. When a file is read, the VFS looks for the page in the radix tree indexed by `struct address_space *mapping` and `pgoff_t index` (page offset within the file). If present, the page is returned; otherwise a new page is allocated, inserted into the radix tree, and the file system’s `readpage` method fills it with data from disk.

**Why cache whole pages?**  
* Disk I/O is performed in sector multiples (typically 512 B) but the OS issues requests in page‑sized chunks to amortize seek/rotational latency and to match the MMU’s granularity.  
* Caching at page granularity lets the VM system reuse the same page for multiple offsets within the same file without extra copying.

The page cache is tightly coupled to the LRU mechanism: each inserted page is placed on the **active LRU list**; if it remains unused, it migrates to the **inactive list** and becomes a reclamation candidate.

### Reclaim – Balancing Free and Used Memory
The kernel defines **watermarks** per zone: `pages_min`, `pages_low`, `pages_high`. When free pages fall below `pages_low`, the background reclaim daemon (`kswapd`) wakes up and attempts to free memory by:
1. **Page cache reclamation:** cleaning dirty pages (`writepage`) and dropping clean pages.  
2. **Slab shrinking:** calling `shrink_slab` callbacks to release unused objects.  
3. **Buddy freeing:** returning completely free pages to the buddy allocator.

If free pages drop below `pages_min`, direct reclaim is invoked from the allocation path (potentially blocking the caller) to avoid OOM. The decision to reclaim versus allocate is guided by the **pressure** metric:
$$
\text{pressure} = \frac{\text{pages\_needed}}{\text{free\_pages + inactive\_clean}}
$$
When pressure exceeds a threshold, reclaim is favoured.

---

## How It Works
### Allocation Path: `kmalloc` → Slab or Buddy
1. **Caller invokes** `kmalloc(size, flags)`.  
2. If `size <= KMALLOC_MAX_CACHE_SIZE` (≈ 1 MB on x86_64) the allocator selects a **size‑indexed cache** (`kmalloc_caches[order]`).  
   * The index is `order = \lfloor\log_2(size)\rfloor` rounded up to the next power‑of‑two object size.  
   * Fast path: `obj = __cache_alloc_node(cache, flags, nid);` which first checks the per‑CPU free array; if empty, it calls `__cache_alloc` to obtain a slab from the buddy allocator.  
3. If `size` exceeds the slab limit, `__get_free_pages(flags, order)` is called, where `order = \lceil\log_2(size/PAGE_SIZE)\rceil`.  
   * The buddy allocator (see Core Concepts) returns a pointer to the first page frame; the caller receives a virtual address via `__va(page_to_pfn(page) << PAGE_SHIFT)`.

**Why two layers?**  
* Small allocations benefit from slab’s object reuse and zero‑initialisation (if `SLAB_POISON` or `SLAB_TYPESAFE_BY_RCU` is set).  
* Large allocations bypass slab overhead and avoid internal fragmentation caused by rounding to the nearest slab size.

### Page Cache Lookup and Insertion
When a process faults on a file-backed VMA:
```c
int handle_mm_fault(struct vm_area_struct *vma,
                    unsigned long address,
                    unsigned int flags)
{
    pgoff_t pgoff = linear_page_index(vma, address);
    struct address_space *mapping = vma->vm_file->f_mapping;
    struct page *page = find_get_page(mapping, pgoff);
    if (!page) {
        page = alloc_page(GFP_HIGHUSER_MOVABLE);
        if (!page) return VM_FAULT_OOM;
        /* Insert into radix tree; may fail if another thread raced */
        if (radix_tree_insert(&mapping->page_tree, pgoff, page)) {
            put_page(page);
            page = find_get_page(mapping, pgoff); /* retry */
        }
        /* Now fill the page */
        mapping->a_ops->readpage(file, page);
    }
    /* Mark page accessed, update LRU */
    mark_page_accessed(page);
    return 0;
}
```
* `find_get_page` searches the radix tree (`O(log N)` with N = number of pages in the mapping, but the tree height is bounded by `PAGE_SHIFT/3 ≈ 2` for typical file sizes, effectively constant).  
* If the page is missing, `alloc_page` obtains a free page from the buddy allocator (potentially triggering reclaim).  
* After I/O completes, the page is **marked accessed**; the VMScan subsystem will later consider moving it between active/inactive LRU lists based on recent reference bits.

### LRU Management – Active/Inactive Lists
Each zone maintains two LRU lists: `active_list` and `inactive_list`. The kernel uses a **reference bit** (`PageReferenced`) set by the hardware on each access (via the accessed flag in the PTE) and cleared periodically by `scan_swap_cache` or `activate_page`.

**Simplified reclamation scan (`shrink_list`):**
```c
unsigned long shrink_list(struct list_head *list,
                          struct scan_control *sc)
{
    unsigned long nr_taken = 0;
    struct page *page;
    while ((page = lru_to_page(&list->next)) && nr_taken < sc->nr_to_scan) {
        if (!trylock_page(page))
            continue;   /* retry later */

        if (PageReferenced(page)) {
            ClearPageReferenced(page);
            /* Move to active list if not already there */
            if (!PageActive(page))
                activate_page(page);
            goto unlock_and_continue;
        }

        /* Page is clean? */
        if (!PageDirty(page)) {
            if (PageAnon(page))
                try_to_free_swap(page);
            else if (PageFile(page))
                try_to_release_page(page, 0);
            /* If page freed, it is removed from LRU */
        }

unlock_and_continue:
        unlock_page(page);
        if (/* page freed */)
            nr_taken++;
    }
    return nr_taken;
}
```
* **Why two lists?**  
  The active list protects recently used pages from premature reclamation. The inactive list holds candidates; only pages that have not been referenced since being placed on the inactive list are reclaimed. This approximates LRU with **O(1)** overhead per page reference (just setting a bit) and a periodic scan.

### Interaction Summary
* Allocation request → slab (if small) or buddy (if large).  
* Slab obtains its backing pages from the buddy allocator.  
* Page cache pages are also allocated via the buddy allocator (or `alloc_page`).  
* Reclaim feeds freed pages back to the buddy allocator, which may then satisfy future slab or allocation requests.  
* The LRU lists govern which cached pages are reclaimed first, balancing performance (cache hits) against memory pressure.

---

## Worked Examples
### Example 1: Buddy Allocation of 16 KB (4 Pages)
**Goal:** Allocate a physically contiguous region of 16 KB using the buddy allocator.

**Step‑by‑step:**
1. Compute required order:  
   $$
   n = \frac{16\text{KB}}{P} = \frac{16384}{4096} = 4 \text{ pages}
   $$
   $$
   k = \lceil\log_2 n\rceil = \lceil\log_2 4\rceil = 2
   $$
   So we need an order‑2 block (size $2^2 \times P = 16\text{KB}$).

2. Call the buddy allocator:
   ```c
   #include <linux/mm.h>
   #include <linux/gfp.h>

   void *alloc_16kb(void)
   {
       /* GFP_KERNEL allows sleeping; may trigger reclaim */
       struct page *page = alloc_pages(GFP_KERNEL, 2); /* order = 2 */
       if (!page)
           return NULL;
       return page_address(page); /* virtual address */
   }
   ```

3. Internally, `alloc_pages`:
   * Checks `zone->free_area[2].free_list`.  
   * If empty, scans higher orders (3, 4 …) until a free block is found.  
   * Suppose order‑4 block (64 pages) is found at PFN 0x1A000.  
   * Splitting:  
     * order‑4 → two order‑3 buddies (PFN 0x1A000, 0x1A200).  
     * Take one order‑3, split → two order‑2 buddies (0x1A000, 0x1A100).  
     * Allocate the first order‑2 buddy (PFN 0x1A000) to the caller; the second order‑2 buddy (0x1A100) is inserted into `free_area[2]`.  
   * The remaining order‑3 buddy (0x1A200) stays in `free_area[3]`.

4. Result: The caller receives a virtual address mapping to PFN 0x1A000‑0x1A003 (four contiguous pages).  
   * If the caller later frees the page with `__free_pages(page, 2)`, the buddy allocator will attempt to merge with its buddy (0x1A100) if it is also free, potentially reforming the order‑3 block.

**Why this matters:**  
Contiguous allocations are required for DMA buffers, large kernel structures (e.g., `vmalloc` fallback), and certain hardware descriptors. Understanding the order calculation lets a developer predict fragmentation behavior and choose appropriate allocation sizes.

### Example 2: Page Cache Hit for a Repeated Read
**Scenario:** A process reads the same 4 KB chunk of a file twice within a short interval.

**First read (page miss):**
1. `sys_read()` → `vfs_read()` → `generic_file_read_iter()`.
2. The VFS computes the page offset: `pgoff = offset / PAGE_SIZE`.
3. Calls `find_get_page(mapping, pgoff)`. The radix tree returns `NULL` because the page is not cached.
4. `alloc_page(GFP_HIGHUSER | __GFP_MOVABLE)` obtains a free page (order 0) from the buddy allocator (possibly triggering reclaim if free pages low).
5. The page is inserted into the radix tree:
   ```c
   if (radix_tree_preload(GFP_KERNEL))
       goto out;
   radix_tree_insert(&mapping->page_tree, pgoff, page);
   radix_tree_preload_end();
   ```
6. The file system’s `readpage` method schedules DMA to fill the page from disk.
7. Upon completion, `end_page_read_io()` marks the page `PG_uptodate` and wakes any waiters.
8. The page is marked accessed (`mark_page_accessed(page)`) and placed on the **active LRU list**.

**Second read (page hit):**
1. Same VFS path reaches `find_get_page(mapping, pgoff)`.  
2. The radix tree returns the cached page struct (same PFN as before).  
3. Since the page is already up‑to‑date, no I/O is issued.  
4. `mark_page_accessed(page)` sets the referenced bit in the page’s PTE (if the page is currently mapped) and increments the page’s `_refcnt`.  
5. Because the page is referenced, the VMScan scanner will keep it on the active list during the next sweep.

**Performance impact:**  
* First read incurs disk latency (≈ 5‑10 ms) plus allocation overhead.  
* Second read serviced from RAM in ≈ 200 ns (cache‑to‑CPU latency).  
* The page cache thus turns a potentially expensive I/O operation into a near‑zero‑cost memory access after the first touch.

### Example 3: LRU List Migration via Page Referencing
**Goal:** Show how a page moves from the inactive list to the active list when accessed, and how it is selected for reclamation when stale.

**Data structures (simplified):**
```c
struct list_head {
    struct list_head *next, *prev;
};
struct page {
    unsigned long flags;          /* PG_active, PG_referenced, etc. */
    struct lru {
        struct list_head list;
    } lru;
    int _refcnt;
    struct address_space *mapping;
    pgoff_t index;
};
```

**Algorithm executed by the VMScan scanner (`shrink_active_list` and `shrink_inactive_list`):**

1. **Scan active list:**  
   For each page `p`:
   * If `PageReferenced(p)` is set → clear the bit, keep `p` on active list (it’s “hot”).  
   * Else → move `p` to the tail of the inactive list (`move_lru(p, LRU_INACTIVE)`).  
   This ages active pages: only those not referenced since the last scan become inactive.

2. **Scan inactive list:**  
   For each page `p`:
   * If `PageReferenced(p)` is set → clear the bit, move `p` back to the active list (`move_lru(p, LRU_ACTIVE)`).  
   * Else → `p` is a reclamation candidate.  
     * If `PageDirty(p)` → attempt synchronous writeback (`writepage`).  
     * If clean or writeback succeeds → `try_to_free_page(p)` → remove from LRU, put page back to buddy allocator (`__free_pages`).  

**Why this approximates LRU:**  
* Each scan approximates a pass over the entire cache.  
* A page that has been accessed at least once between two scans will be found referenced on at least one of the scans and will be promoted to the active list.  
* Only pages that have **zero** references during an entire scan interval are eligible for reclamation, which closely matches “least recently used” when the scan interval is tuned to the workload’s temporal locality.

**Concrete numbers:**  
Assume the scanner runs every `sc->scan_interval = 200 ms` and the inactive list holds 10 000 pages.  
* If a workload touches 2 000 distinct pages per second, each page gets referenced roughly every 0.5 s, i.e., ~2.5 scan intervals.  
* The probability a given page is *not* referenced in a given scan ≈ $e^{-2.5} \approx 0.082$.  
* After two consecutive scans (no reference), probability ≈ $0.082^2 ≈ 0.0067$ → only ~0.7 % of inactive pages become reclamation candidates per cycle, keeping the cache hot for the working set.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Using `GFP_ATOMIC` in process context** | `GFP_ATOMIC` forbids sleeping; if the allocator must wait for reclaim or swap, it will fail, causing allocation errors or subtle bugs. | Use `GFP_KERNEL` (or `GFP_HIGHUSER` for user pages) when the caller may sleep. Reserve `GFP_ATOMIC` for true atomic contexts (interrupt handlers, spinlock-held code). |
| 2 | **Failing to check the return value of `alloc_pages`/`kmem_cache_alloc`** | Assuming success can lead to dereferencing a NULL pointer, triggering an Oops or silent data corruption. | Always test the returned pointer; on failure, either return an error to the user or invoke a fallback (e.g., smaller allocation, `vmalloc`). |
| 3 | **Assuming slab objects are zero‑filled** | The slab allocator only zeroes memory if the cache was created with `SLAB_POISON` or `SLAB_TYPESAFE_BY_RCU`. Otherwise, objects retain previous contents. | Explicitly initialize fields after allocation, or use `kzalloc`/`kmem_cache_zalloc` when zero‑initialisation is required. |
| 4 | **Manipulating `page->lru` without holding the page lock** | The LRU lists are protected by `page_lock`; concurrent manipulation can corrupt list pointers, leading to kernel crashes. | Use `lock_page(page)` before altering `page->lru`; unlock with `unlock_page(page)`. The VMScan helpers (`activate_page`, `deactivate_page`) already handle locking. |
| 5 | **Misplacing high‑memory pages (`__GFP_HIGHMEM`)** | On systems without permanent high‑mem mappings, using `__GFP_HIGHMEM` in a context that cannot call `kmap` (e.g., interrupt) will cause a sleeping atomic allocation → BUG. | Only allocate high‑mem pages when the caller is prepared to temporarily map them (`kmap`) and can sleep. Prefer `GFP_HIGHUSER_MOVABLE` for user‑space page cache allocations. |
| 6 | **Ignoring zone watermarks when allocating large buffers** | Allocating a large order block from `ZONE_NORMAL` when it is low on free pages can trigger direct reclaim, causing latency spikes or OOM. | Check `/proc/zoneinfo` or use `gfp_zone(__GFP_BITS_MASK)` to see which zone the allocator will try; consider splitting the request into smaller chunks or using `vmalloc`
