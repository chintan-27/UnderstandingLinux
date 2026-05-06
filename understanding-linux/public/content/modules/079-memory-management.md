---
id: 79
title: "Memory management"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
### Introduction to Memory Management
Memory management in an operating system mediates between the limited physical RAM and the unbounded memory demands of processes. Its core duty is to provide each process with a *virtual address space* that appears contiguous and private, while mapping those virtual pages to physical frames (or swap) on demand. The indirection enables protection, sharing, and over‑commitment without requiring processes to manage hardware directly.

### Virtual Memory
Virtual memory decouples the *size* of a process’s address space from the *amount* of RAM installed. If a process references a virtual page that is not resident, a page fault triggers the kernel to bring the required page from backing storage (usually swap or a memory‑mapped file) into a free frame.  

**Why it matters:**  
- **Capacity:** The sum of all virtual address spaces can vastly exceed physical RAM (e.g., 3 GB process on a 512 MB machine).  
- **Isolation:** Faults in one process cannot corrupt another’s memory because each has its own page table.  
- **Efficiency:** Infrequently used pages can be evicted, keeping active working sets resident.

Mathematically, let $P$ be the page size (typically $2^{12}=4096$ B). If a process has a virtual address space of $V$ bytes, the number of virtual pages is  
$$N_{vp} = \left\lceil\frac{V}{P}\right\rceil.$$  
The kernel must store a mapping for each $N_{vp}$ in its page tables.

### Segmentation
Segmentation splits a process’s address space into logical units (code, data, stack, heap, shared libraries) each with its own base and length. A virtual address becomes a pair $\langle s, o\rangle$ where $s$ selects a segment and $o$ is an offset within it. The hardware (or software) checks $o < \text{limit}_s$ before forming the linear address $\text{base}_s + o$.

**Why combine with paging?**  
Pure segmentation suffers from external fragmentation because segments are variable‑sized. By paging each segment, we retain the protection and sharing benefits of segmentation while allocating memory in fixed‑size frames, eliminating external fragmentation.

### Paging
Paging divides both virtual and physical address spaces into fixed‑size pages/frames. A virtual address $\mathit{va}$ is split into a page number $\mathit{pn}$ and an offset $\mathit{off}$:
$$\mathit{va} = (\mathit{pn} \times P) + \mathit{off},\quad 0 \le \mathit{off} < P.$$
The page table translates $\mathit{pn}$ to a frame number $\mathit{fn}$; the physical address is $(\mathit{fn} \times P) + \mathit{off}$.

**Why fixed size?**  
Fixed‑size frames allow the kernel to manage free memory with simple data structures (e.g., a buddy system) and eliminate external fragmentation. Internal fragmentation remains, bounded by at most $P-1$ bytes per allocation.

### Fragmentation
- **Internal fragmentation:** Waste inside a allocated page because the request size $r$ may be less than $P$. Expected waste for uniformly distributed requests in $[1,P]$ is  
  $$E[\text{waste}] = \frac{1}{P}\int_{0}^{P} (P - r)\,dr = \frac{P}{2}.$$
- **External fragmentation:** Free memory broken into non‑contiguous chunks larger than a page but unusable for a large contiguous allocation. Pure paging eliminates this; segmentation + paging can still suffer if segments are not page‑aligned or if the allocator fails to coalesce freed frames.

## How It Works
### Page Table Mechanics
Each process holds a `struct mm_struct` describing its memory layout. The page table is a multi‑level radix tree; on x86‑64 with 4 KB pages and a 4‑level table, each level uses 9 bits (since $2^9=512$ entries). The virtual address layout is:

| Bits | 63‑48 | 47‑39 | 38‑30 | 29‑21 | 20‑12 | 11‑0 |
|------|-------|-------|-------|-------|-------|------|
| Field| Sign‑ext | PGD | PUD | PMD | PTE | Offset |

A page‑table entry (PTE) is 8 bytes, containing the frame number, permission bits, and flags (present, dirty, accessed, etc.).  

When a virtual address is accessed:
1. The MMU walks the hierarchy using the indices.  
2. If any intermediate entry is missing → **page fault**.  
3. If the PTE is present but not writable and a write occurs → **protection fault**.  
4. If present and permissions match → physical address formed and the access proceeds.

### Page Fault Handling
The kernel’s `do_page_fault()` (in `arch/x86/mm/fault.c`) performs:
- Verify the faulting address lies within a `vm_area_struct` (VMA).  
- Check permissions against the VMA’s `vm_flags`.  
- If the page is anonymous (no backing file), allocate a zero‑filled page via the **buddy allocator** (`alloc_pages`).  
- If the page is file‑backed, perform **readahead** and read the page from the page cache or disk.  
- Insert the new PTE, update the TLBs (`flush_tlb_single`), and resume the instruction.

### Replacement Algorithms
When no free frame exists, the kernel selects a victim page to evict. Linux uses an approximation of LRU via two active/inactive lists:
- **Active list:** Recently referenced pages.  
- **Inactive list:** Candidates for reclamation.  

The kernel periodically moves pages from active to inactive if they have not been accessed (`PG_referenced` cleared). Victim selection prefers inactive clean pages; dirty pages are written back first (via `writepage`).  

**Why not true LRU?**  
Exact LRU requires per‑reference timestamps, which is prohibitively expensive. The two‑list scheme approximates LRU with O(1) overhead per reference.

### Swap and Page Cache
Anonymous pages that are evicted go to swap swap slots (`swap_entry_t`). File‑backed pages may be discarded if clean; otherwise they are written back to the originating filesystem. The page cache (`struct address_space`) backs both file I/O and anonymous memory, enabling efficient reuse.

## Worked Examples
### Example 1: Page Replacement (FIFO)
Assume a system with **4 frames**, page size $P=4096$ B, and the reference string:  
`1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5`.

We track frames as an ordered queue (FIFO).  

| Ref | Frames (front→rear) | Fault? | Action |
|-----|---------------------|--------|--------|
| 1   | [1]                 | Yes    | Load 1 |
| 2   | [1,2]               | Yes    | Load 2 |
| 3   | [1,2,3]             | Yes    | Load 3 |
| 4   | [1,2,3,4]           | Yes    | Load 4 |
| 1   | [1,2,3,4]           | No     | Hit |
| 2   | [1,2,3,4]           | No     | Hit |
| 5   | [2,3,4,5]           | Yes    | Evict 1, load 5 |
| 1   | [3,4,5,1]           | Yes    | Evict 2, load 1 |
| 2   | [4,5,1,2]           | Yes    | Evict 3, load 2 |
| 3   | [5,1,2,3]           | Yes    | Evict 4, load 3 |
| 4   | [1,2,3,4]           | Yes    | Evict 5, load 4 |
| 5   | [2,3,4,5]           | Yes    | Evict 1, load 5 |

Total faults = 9.  
**Why FIFO performs poorly:** It discards pages based solely on load order, ignoring recent use; a page that is loaded early but still heavily used may be evicted, causing unnecessary faults.

### Example 2: Segmentation with Paging (x86‑64)
Consider a process with two segments:
- **Code segment:** base = $0x00400000$, limit = $0x00020000$ (128 KB).  
- **Data segment:** base = $0x00600000$, limit = $0x00010000$ (64 KB).

Assume page size $P=4096$.  
To translate virtual address $\mathit{va}=0x00401030$:
1. Identify segment: $0x00401030 < \text{code base} + \text{code limit} = 0x00420000$ → code segment.  
2. Compute offset within segment: $o = \mathit{va} - \text{code base} = 0x1030$.  
3. Page number: $\mathit{pn} = \left\lfloor\frac{o}{P}\right\rfloor = \left\lfloor\frac{0x1030}{0x1000}\right\rfloor = 1$.  
4. Offset in page: $\mathit{off} = o \bmod P = 0x30$.  
5. Suppose the page table maps code page 1 to frame $0x7f3$.  
Physical address = $(0x7f3 \times 0x1000) + 0x30 = 0x7f3030$.

**Why the two‑step?**  
Segmentation provides protection bases and limits; paging provides fine‑grained allocation and sharing. The MMU effectively does:  
$$\text{phys} = (\text{PT}[\text{segment}] [\mathit{pn}] \times P) + (\mathit{va} \bmod P).$$

### Example 3: Fragmentation Calculation
A system has 16 KB RAM, page size $P=4$ KB → 4 frames.  
Suppose three processes request:
- P1: 6 KB → needs $\lceil6/4\rceil=2$ pages (8 KB allocated, internal waste 2 KB).  
- P2: 5 KB → needs 2 pages (8 KB allocated, waste 3 KB).  
- P3: 4 KB → needs 1 page (4 KB allocated, waste 0 KB).

Total allocated frames = $2+2+1=5$, but only 4 frames exist → one request must be delayed or swapped.  
If instead P1 and P2 each allocated exactly their request using a **variable‑size allocator** (e.g., slab), they would consume 6 KB+5 KB=11 KB, leaving 5 KB free, sufficient for P3’s 4 KB with only 1 KB internal waste.  

**Why paging exacerbates internal fragmentation:** Allocation granularity is fixed to $P$; any request not a multiple of $P$ wastes up to $P-1$ bytes. The expected waste per allocation is $P/2$ (see formula above).

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|------------------------|
| **Assuming virtual address space size equals physical memory usage** | Virtual memory can be larger (via swap) or smaller (if pages are not allocated). A process may reserve terabytes of virtual memory while only using a few megabytes of RAM. | Virtual address space = potential mapping; resident set size (RSS) = actual frames in RAM. |
| **Thinking `malloc` always obtains physical pages immediately** | `malloc` (via `brk`/`mmap`) only reserves virtual address space; physical pages are allocated on first touch (lazy allocation). | Use `posix_memalign` or `mmap(MAP_POPULATE)` to force early allocation if needed. |
| **Believing FIFO is optimal for page replacement** | FIFO suffers from Belady’s anomaly: increasing frame count can increase faults (as shown in Example 1). | Approximate LRU (active/inactive lists) or more sophisticated algorithms (e.g., ARC) avoid this pathology. |
| **Confusing segmentation faults with page faults** | A segmentation fault (`SIGSEGV`) is raised when the MMU detects an invalid virtual address (outside any VMA or lacking permission). A page fault is a *transparent* mechanism that may bring a page in; it only becomes a fault if the page cannot be satisfied. | Not all page faults lead to `SIGSEGV`; many are resolved silently. |
| **Assuming swap is just “slow RAM”** | Swap resides on block devices; its latency is orders of magnitude higher than RAM, and swapping thrashes can severely degrade performance. The kernel prefers to reclaim clean page cache pages before swapping anonymous pages. | Monitor swap usage via `vmstat` or `/proc/meminfo`; high swap-in rates indicate memory pressure. |
| **Neglecting to check return values of `mmap`/`brk`** | These calls can fail (return `MAP_FAILED` or `-1`) due to RLIMIT_AS, insufficient virtual address space, or kernel restrictions. Ignoring the error leads to silent memory corruption. | Always test the return; use `errno` to diagnose (`ENOMEM`, `EINVAL`, `EPERM`). |

## Exercises
### Easy
1. **Page count:** A process requests 13 KB of memory with page size 4 KB. How many pages are allocated, and what is the maximum internal fragmentation?  
2. **Address translation:** Given a 64‑bit virtual address `0x00007ffff7a2c010` and a 4‑level page table (9‑bit indices per level, 12‑bit offset), extract the page‑table indices (PGD, PUD, PMD, PTE) and the offset. Show your work.

### Medium
3. **FIFO simulation:** Write a C program that reads a reference string from stdin and simulates FIFO page replacement for a configurable number of frames. Output the total number of page faults.  
4. **Segment limits:** Using `gcc -nostdlib -static -o seg seg.c` where `seg.c` defines two arrays placed in separate sections via `__attribute__((section(".code")))` and `__attribute__((section(".data")))`, run `readelf -a seg` and verify the VMA limits shown in `/proc/<pid>/maps` match the section sizes.

### Hard
5. **Buddy allocator implementation:** Implement a minimal buddy system that manages a 64 KB heap (powers‑of‑two block sizes from 64 B to 64 KB). Provide `buddy_alloc(size)` and `buddy_free(ptr, size)` functions, and test with a sequence of allocations/frees that causes splitting and coalescing.  
6. **LRU approximation:** Modify the kernel’s `mm/vmscan.c` (in a lab VM) to replace the active/inactive LRU lists with a simple aging algorithm that shifts a 8‑bit counter right on each timer tick and references a page to set the high bit. Measure page‑fault rate before and after using a workload like `stress-ng --vm 4 --vm-bytes 200M`. Explain any observed differences.

## Linux Connection
### Kernel Subsystems
- **mm/** – core memory management (`mm/init.c`, `mm/page_alloc.c` for the buddy allocator, `mm/mmap.c` for `mmap` handling).  
- **vmalloc/** – allocates virtually contiguous but possibly non‑physically contiguous memory (used for kernel modules, `ioremap`).  
- **slab/** – object caching (`slab.h`, `kmem_cache_alloc`).  
- **swap/** – manages swap storage (`swapfile.c`, `swap_state`).  

### Key Data Structures
```c
/* mm/types.h */
struct mm_struct {
    struct vm_area_struct *mmap;   /* list of VMAs */
    pgd_t *pgd;                    /* top-level page directory */
    atomic_t mm_users;             /* reference count */
    /* ... */
};

struct vm_area_struct {
    unsigned long vm_start;        /* inclusive */
    unsigned long vm_end;          /* exclusive */
    unsigned long vm_flags;        /* VM_READ, VM_WRITE, VM_EXEC, etc. */
    struct file *vm_file;          /* backing file, if any */
    /* ... */
};

struct page {
    unsigned long flags;           /* PG_lru, PG_locked, PG_referenced, etc. */
    atomic_t _refcount;            /* usage count */
    /* ... */
};
```
### System Calls
| Call | Purpose | Typical Use |
|------|---------|-------------|
| `brk(void *addr)` | Move the program break (end of heap) | `malloc` impl for small allocations |
| `sbrk(intptr_t incr)` | Increment/decrement break | Legacy heap growth |
| `mmap(void *addr, size_t len, int prot, int flags, int fd, off_t off)` | Create a VMA, optionally backed by a file or anonymous | Large allocations, shared memory, file mapping |
| `munmap(void *addr, size_t len)` | Remove a VMA | Free memory returned by `mmap` |
| `mprotect(void *addr, size_t len, int prot)` | Change protection bits of a VMA | Implement `PROT_NONE` guard pages |
| `madvise(void *addr, size_t len, int advice)` | Give kernel hints about future access | `MADV_WILLNEED`, `MADV_DONTNEED`, `MADV_RANDOM` |

### Concrete Commands
```bash
# Show memory layout of the current shell
$ cat /proc/self/maps
00400000-0040b000 r-xp 00000000 08:01 123456 /bin/bash
0060a000-0060b000 r--p 0000a000 08:01 123456 /bin/bash
0060b000-00618000 rw-p 0000b000 08:01 123456 /bin/bash
7ffeefbff000-7ffeec000000 rw-p 00000000 00:00 0          [stack]

# Resident set size (RSS) and swap usage
$ grep -E 'VmRSS|VmSwap' /proc/self/status
VmRSS:    12345 kB
VmSwap:       0 kB

# Inspect page table entries for a process (requires root)
$ sudo cat /proc/$$/pagemap | xxd -g8 | head -4
# each 8‑byte entry encodes frame number in bits 0‑54

# Use pmap to see a process’s memory map in a friendly format
$ pmap -x $$
```

### Example: Using `mmap` to Allocate a File‑Backed Buffer
```c
#define _GNU_SOURCE
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>

int main(void) {
    int fd = open("/tmp/testfile", O_RDWR | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) { perror("open"); exit(1); }
    if (ftruncate(fd, 4096) == -1) { perror("ftruncate"); exit(1); }

    void *addr = mmap(NULL, 4096, PROT_READ | PROT_WRITE,
                      MAP_SHARED, fd, 0);
    if (addr == MAP_FAILED) { perror("mmap"); exit(1); }
    /* Write to the mapped region */
    memcpy(addr, "Hello, mmap!\n", 13);
    msync(addr, 4096, MS_SYNC);   /* push to disk */
    munmap(addr, 4096);
    close(fd);
    return 0;
}
```
Compile with `gcc -Wall -O2 mmap_example.c -o mmap_example` and run; then verify the file contents with `cat /tmp/testfile`.

## Why This Matters
Memory management is the linchpin that lets an operating system appear to give each program unlimited, private memory while actually sharing a finite hardware resource. Understanding the *why* behind each mechanism—address translation, page faults, replacement policies, and fragmentation—enables you to:

1. **Diagnose performance problems**: high page‑fault rates, excessive swap, or unexpected `SIGSEGV` become tractable when you know which kernel subsystem (page allocator, reclaim, VMA manager) is responsible.  
2. **Design efficient data structures**: aligning allocations to page size, using `mmap` with `MAP_POPULATE` for deterministic latency, or preferring `slab` caches for frequent small objects reduces internal fragmentation and allocation overhead.  
3. **Write safer systems code**: checking returns from `brk`, `mmap`, and `madvise` prevents silent memory corruption; using `mlock` or `MADV_WILLNEED` can guarantee real‑time response where needed.  
4. **Tune Linux kernel parameters**: adjusting `vm.swappiness`, `vm.min_free_kbytes`, or `zone_reclaim_mode` lets you balance latency versus throughput for workloads ranging from databases to containers.  
5. **Leverage advanced features**: copy‑on‑write (COW) for `fork()`, transparent huge pages (THP) for reducing TLB pressure, and `userfaultfd` for intercepting page faults in user space—each builds on the foundations covered here.

By mastering these concepts, you move from treating memory as an opaque resource to shaping it deliberately, yielding programs that are faster, more predictable, and easier to debug. This depth is exactly what separates a casual Linux user from a proficient systems programmer.
