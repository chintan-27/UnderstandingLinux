---
id: 166
title: "Memory-mapped files"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Memory Mapping Fundamentals
A memory‑mapped file establishes a **bilateral** relationship between a range of a process’s virtual address space and a set of pages belonging to a file (or to anonymous memory). The kernel does **not** copy data; it inserts page‑table entries (PTEs) that point directly to the page‑cache frames backing the file. Consequently, each load/store to the mapped region triggers the normal paging mechanism: if the PTE is valid, the access proceeds at memory speed; if the PTE is invalid (present‑bit cleared), a **page fault** invokes the fault handler, which looks up the corresponding page in the page cache, allocates a frame if necessary, updates the PTE, and resumes the instruction.

### File‑backed vs. Anonymous Mappings
*File‑backed* mappings (`MAP_SHARED` or `MAP_PRIVATE` without `MAP_ANONYMOUS`) have their pages tied to an `address_space` object associated with the file’s inode. Changes to a `MAP_SHARED` region are visible to all processes mapping the same file and are eventually written back through the page‑cache writeback mechanism. `MAP_PRIVATE` creates a **copy‑on‑write** (COW) view: the first write to a page triggers allocation of a new private frame, copying the original contents; the original file page remains untouched.

*Anonymous* mappings (`MAP_ANONYMOUS`) are not attached to any file; the kernel supplies frames from the zero‑filled page pool (or swap) and treats them as private unless `MAP_SHARED` is also set (rare, used for SysV shared memory emulation).

### Protection and Flags
The `prot` argument is a bitwise OR of `PROT_READ`, `PROT_WRITE`, `PROT_EXEC`, `PROT_NONE`. The kernel checks these against the file’s open mode and the mapping type; a mismatch results in `EACCES`. The `flags` argument controls sharing (`MAP_SHARED` vs `MAP_PRIVATE`), visibility (`MAP_FIXED` – **dangerous**, forces address), and special behavior (`MAP_ANONYMOUS`, `MAP_POPULATE`, `MAP_NONBLOCK`, `MAP_STACK`, `MAP_HUGETLB`, `MAP_SYNC`).  

**Why alignment matters:** The kernel requires `offset` and `addr` (if `MAP_FIXED` is not set) to be page‑aligned (`PAGE_SIZE = 2^{12}` bytes on x86_64). If they are not, the call fails with `EINVAL`. Internally, the kernel rounds the requested `length` up to a whole number of pages:
$$
\text{pages} = \left\lceil\frac{\text{length}}{\text{PAGE\_SIZE}}\right\rceil
$$
and allocates that many page‑cache frames (or anonymous frames).

### Interaction with the Page Cache and Swap
When a fault occurs on a file‑backed mapping, the fault handler first consults the **radix tree** backing the file’s `address_space`. If the page is present, its frame is used; otherwise, the page is read from the underlying filesystem into a freshly allocated frame (potentially triggering readahead). For anonymous mappings, the handler allocates a zeroed frame; if the system is under memory pressure, the frame may be swapped out later, and a subsequent fault will read it from swap.

`msync` does **not** guarantee that data is on permanent storage unless `MS_SYNC` is used; it merely initiates writeback to the page cache. Actual persistence requires either `MS_SYNC` (synchronous wait for writeback completion) followed by `fsync` on the underlying file descriptor, or reliance on the kernel’s periodic writeback daemon (pdflush/writeback).  

---

## How It Works
### The `mmap` System Call – Kernel Path
```c
void *mmap(void *addr, size_t length, int prot, int flags,
           int fd, off_t offset);
```
1. **Parameter validation** – check `prot` compatibility with `fd`’s open mode, ensure `offset` and `length` are non‑negative, verify `offset` is page‑aligned.
2. **Find or allocate VMA** – the kernel searches the process’s `vm_area_struct` list for a suitable region. If `addr` is `NULL` and `MAP_FIXED` is not set, it selects an unused gap that satisfies the protection and sharing constraints.
3. **Insert VMA** – a new `vm_area_struct` is linked into the mmap list, initialized with:
   * `vm_start` = chosen start address,
   * `vm_end`   = `vm_start + length`,
   * `vm_flags` = derived from `prot` and `flags`,
   * `vm_file`  = pointer to the file’s `struct file` (or `NULL` for anonymous),
   * `vm_pgoff` = `offset >> PAGE_SHIFT`.
4. **Page‑table preparation** – no PTEs are installed yet; they are created on first fault (lazy allocation). If `MAP_POPULATE` is set, the kernel walks the range and calls `handle_mm_fault` for each page to fault them in upfront.
5. **Return** – the start address is returned to user space.

### Page Fault Handling (Simplified)
When an access triggers a page fault (`#PF`), the CPU pushes an error code and transfers control to `do_page_fault`. The handler:
* Checks whether the fault address lies within a VMA (`find_vma`).
* Verifies protection (`vm_flags` vs fault type – read/write/exec).
* If the fault is **minor** (page present in page cache or swap):
  * Locates the page via `page_cache_lookup` (radix tree) or swap cache.
  * Increments the page’s reference count, inserts a PTE with appropriate bits (`_PAGE_PRESENT`, `_PAGE_RW` if write allowed, etc.).
* If the fault is **major** (page not in cache):
  * For file‑backed: initiates read from the block device via `mpage_readpage`; the filesystem may perform readahead.
  * For anonymous: allocates a zeroed page (`alloc_zeroed_user_highpage`).
* Updates the PTE, flushes the TLB if needed, and returns to user space.

### `msync` – Synchronizing Mapped Pages
```c
int msync(void *addr, size_t length, int flags);
```
* The kernel walks the VMA(s) covering `[addr, addr+length)`.
* For each page, if the page is **dirty** (`PageDirty`) and the mapping is `MAP_SHARED`, it triggers writeback:
  * `MS_ASYNC` – schedules writeback via `mark_page_accessed` and returns immediately.
  * `MS_SYNC` – calls `sync_page` and waits for the I/O to complete (`wait_on_page_writeback`).
* `MS_INVALIDATE` discards cached clean pages (forces reload on next fault).
* Note: `msync` on a `MAP_PRIVATE` mapping only writes back private dirty pages if they have been **explicitly** made shared with `MS_SYNC|MS_INVALIDATE`; otherwise, the kernel ignores dirty private pages because they are not meant to propagate to the backing file.

### `munmap` – Removing a Mapping
```c
int munmap(void *addr, size_t length);
```
* Locates the VMA(s) covering the range.
* For each page:
  * If the page is dirty and the mapping is `MAP_SHARED`, attempts to writeback (similar to `msync` with `MS_SYNC`).
  * Decrements the page’s reference count; if it reaches zero, the page is freed back to the page cache (or swap).
* Removes the VMA from the mmap list and merges adjacent free VMAs if possible.
* No guarantee that data is on disk unless `msync` was called beforehand with `MS_SYNC`.

---

## Worked Examples
### Example 1 – Mapping a Regular File (Read‑Only, Shared)
**Goal:** Map `example.txt` (size 12 345 bytes), print its contents, ensure any kernel‑initiated writes are flushed, then unmap.

**Details:**  
* Page size on x86_64: $PAGE\_SIZE = 2^{12} = 4096$ bytes.  
* Required pages: $\left\lceil\frac{12345}{4096}\right\rceil = 4$ pages (covering bytes 0‑16383).  
* The kernel will fault in pages on demand; the first access to byte 0 triggers a fault for page 0 (bytes 0‑4095).

**Code:**
```c
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>

int main(void) {
    const char *path = "example.txt";
    int fd = open(path, O_RDONLY);
    if (fd < 0) {
        perror("open");
        exit(EXIT_FAILURE);
    }

    struct stat sb;
    if (fstat(fd, &sb) == -1) {
        perror("fstat");
        close(fd);
        exit(EXIT_FAILURE);
    }
    if (sb.st_size == 0) {
        fprintf(stderr, "file is empty\n");
        close(fd);
        exit(EXIT_FAILURE);
    }

    /* Length rounded up to whole pages for mmap (kernel does this internally) */
    void *addr = mmap(NULL, sb.st_size,
                      PROT_READ, MAP_SHARED, fd, 0);
    if (addr == MAP_FAILED) {
        perror("mmap");
        close(fd);
        exit(EXIT_FAILURE);
    }
    /* fd can be closed now; the mapping holds a reference to the file */
    close(fd);

    /* Access the mapped region – triggers page faults as needed */
    printf("File contents (%zu bytes):\n%s\n", sb.st_size, (char *)addr);

    /* Ensure any dirty pages are written back (though we only read) */
    if (msync(addr, sb.st_size, MS_SYNC) == -1) {
        perror("msync");
        munmap(addr, sb.st_size);
        exit(EXIT_FAILURE);
    }

    if (munmap(addr, sb.st_size) == -1) {
        perror("munmap");
        exit(EXIT_FAILURE);
    }
    return 0;
}
```
**Step‑by‑step reasoning:**
1. `open` obtains a file descriptor; `fstat` yields `st_size = 12345`.
2. `mmap` with `addr = NULL` lets the kernel choose an address; `prot = PROT_READ`, `flags = MAP_SHARED`. The kernel creates a VMA covering `[chosen, chosen+12345)`.
3. First `printf` reads the first byte; the MMU finds the PTE not present → page fault → fault handler looks up page 0 in the page cache (miss) → reads 4096 bytes from disk into a frame, inserts a PTE with `_PAGE_PRESENT|_PAGE_RW` (write allowed despite `PROT_READ` because the kernel may later need to update the page’s dirty bit; the VMA’s `vm_flags` enforce read‑only at fault time).
4. Subsequent bytes within the same page hit the cached frame → no further faults until we cross into page 1, etc.
5. `msync(..., MS_SYNC)` walks the VMA, finds no dirty pages (we only read), but still issues a `sync_page` call that returns instantly; the call demonstrates the correct usage pattern.
6. `munmap` removes the VMA, drops page references, and merges the freed region.

### Example 2 – Anonymous Mapping with Lazy Allocation and Explicit Population
**Goal:** Allocate 2 MiB of anonymous memory, touch every page to force allocation, then measure the page‑fault rate before and after touching.

**Details:**  
* Requested length: $2\text{MiB} = 2\times2^{20}=2097152$ bytes.  
* Pages needed: $\frac{2097152}{4096}=512$ pages.  
* Using `MAP_PRIVATE|MAP_ANONYMOUS` guarantees a private copy‑on‑write view; no backing file.

**Code:**
```c
#define _GNU_SOURCE         /* for memfd_create if needed */
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <unistd.h>
#include <errno.h>
#include <inttypes.h>
#include <time.h>

static inline uint64_t rdtsc(void) {
    uint32_t lo, hi;
    __asm__ __volatile__ ("rdtsc" : "=a"(lo), "=d"(hi));
    return ((uint64_t)hi << 32) | lo;
}

int main(void) {
    const size_t length = 2 * 1024 * 1024;   /* 2 MiB */
    void *addr = mmap(NULL, length,
                      PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (addr == MAP_FAILED) {
        perror("mmap");
        exit(EXIT_FAILURE);
    }

    /* Measure fault rate for the first touch (cold) */
    uint64_t start = rdtsc();
    volatile char *p = addr;
    for (size_t i = 0; i < length; i += 4096) {
        p[i] = 0;   /* touch each page */
    }
    uint64_t end = rdtsc();
    double elapsed = (end - start) / 2.4e9;   /* assume 2.4 GHz CPU */
    printf("Time to fault in %zu pages: %.3f s\n",
           length / 4096, elapsed);

    /* Now the pages are resident; touch again to show no fault cost */
    start = rdtsc();
    for (size_t i = 0; i < length; i += 4096) {
        p[i] = 1;
    }
    end = rdtsc();
    elapsed = (end - start) / 2.4e9;
    printf("Time to re‑touch resident pages: %.3f s\n", elapsed);

    if (munmap(addr, length) == -1) {
        perror("munmap");
        exit(EXIT_FAILURE);
    }
    return 0;
}
```
**Explanation:**
* The first loop triggers a **major** fault for each page because the anonymous VMA has no backing storage; the kernel allocates a zeroed page, inserts a PTE, and accounts the fault as `majflt` (visible via `/proc/self/stat` or `perf stat -e page-faults`).
* After faulting, the second loop merely writes to already‑present pages; the cost is only the memory‑access latency (~1 ns per byte) plus store buffer overhead, yielding a dramatically smaller elapsed time.
* The program demonstrates the difference between lazy allocation (`MAP_POPULATE` omitted) and eager population (could add `MAP_POPULATE` to fault in all pages upfront).

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Using a non‑page‑aligned `offset`** | The kernel returns `EINVAL` because the underlying page cache works on page granularity; misaligned offsets would require splitting a page, which the VMA cannot represent. | Always round `offset` down to a multiple of `PAGE_SIZE` and adjust `addr`/`length` accordingly. |
| 2 | **Assuming `msync` guarantees data is on disk** | `msync` only initiates writeback to the page cache; data may linger in dirty buffers until the flush daemon runs. A power loss before flush loses data. | Use `msync(addr, len, MS_SYNC)` **followed by** `fsync(fd)` on the underlying file descriptor, or rely on `O_SYNC`/`O_DSYS` when opening the file. |
| 3 | **Expecting `MAP_PRIVATE` changes to propagate to the file** | `MAP_PRIVATE` creates a copy‑on‑write view; modifications are allocated to new private frames and never written back. | Use `MAP_SHARED` if you need the file to reflect changes, or explicitly `msync` with `MS_SYNC|MS_INVALIDATE` after copying data back via `write()`/`pwrite()`. |
| 4 | **Leaking the file descriptor after `mmap`** | Although the VMA holds a reference to the file’s `struct file`, leaving the descriptor open wastes a kernel resource and can confuse programs that rely on `fd` limits. | Close the descriptor immediately after a successful `mmap` (except when you need it for `msync`/`fsync` that requires the fd). |
| 5 | **Mapping a file opened with `O_APPEND`** | The kernel rejects the mapping with `EINVAL` because append mode interferes with the file’s notion of current offset; the VMA expects a stable offset. | Open without `O_APPEND`; if you need append‑style writes, use `pwrite()` with explicit offsets or `lseek()` before each write. |
| 6 | **Accessing beyond the mapped length** | Results in a `SIGSEGV` (segmentation fault) because the VMA ends at `vm_start+length`; any address beyond triggers a fault that the kernel cannot resolve (no VMA). | Always track the mapped size; use `mincore()` or `/proc/self/pagemap` to verify residency if needed. |
| 7 | **Calling `msync` on an anonymous mapping** | Anonymous pages have no backing store; the kernel treats the call as a no‑pot (returns `0`) but gives a false sense of durability. | Do not rely on `msync` for anonymously allocated memory; use `malloc`/`free` or `mmap`/`munmap` with explicit swap controls (`swapon`/`swapoff`) if needed. |

---

## Exercises
### Easy – Basic Mapping and Printing
1. **Objective:** Map a file `numbers.txt` (containing one integer per line) and print the sum of the first 10 integers.  
2. **Steps:**  
   * Open the file, `fstat` to obtain size.  
   * `mmap` with `PROT_READ`, `MAP_SHARED`.  
   * Iterate over the mapped bytes, parse integers until 10 numbers are summed.  
   * `msync` (optional) and `munmap`.  
3. **Deliverable:** C program that compiles with `gcc -Wall -Wextra -O2 summap.c -o summap`.

### Medium – Copy‑on‑Write Detection
1. **Objective:** Verify that `MAP_PRIVATE` yields a private copy after a write.  
2. **Steps:**  
   * Create a file `seed.bin` filled with the byte `0xAA` (size 4 KiB).  
   * Map it twice: once `MAP_SHARED`, once `MAP_PRIVATE`.  
   * Write `0x55` to the first byte of each mapping.  
   * Use `munmap`, then `pread` the original file to check its content.  
   * Expected: the file still contains `0xAA` at offset 0; the shared mapping’s change is visible via a second `pread` after `msync`.  
3. **Deliverable:** Program that prints the file’s content before and after, demonstrating COW.

### Hard – User‑Level Page Fault Counter
1. **Objective:** Build a tool that counts minor and major page faults incurred while accessing a large memory‑mapped region, using `perf_event_open` or reading `/proc/self/stat`.  
2. **Steps:**  
   * Allocate an anonymous mapping of size `N * PAGE_SIZE` (e.g., N = 10 000).  
   * Before touching, read `majflt` and `minflt` from `/proc/self/stat`.  
   * Sequentially touch every page (write a byte).  
   * After touching, read the counters again and report the delta.  
   * Repeat with `MAP_POPULATE` to see the fault count drop to zero.  
3. **Deliverable:** C program that uses `syscall(SYS_perf_event_open, ...)` to attach a hardware‑independent software tracepoint for page faults, or simply parses `/proc/self/stat`. Include a Makefile and a brief explanation of the observed numbers.

---

## Linux Connection
### Kernel Subsystems Involved
| Subsystem | Role in `mmap` | Key Data Structures |
|-----------|----------------|----------------------|
| **VFS (Virtual File System)** | Provides the `struct file` and `address_space` for the backing inode. | `struct file->f_mapping`, `struct address_space` (holds `i_mmap` rb tree of VMAs). |
| **Page Cache** | Stores file‑backed pages; satisfies faults without disk I/O when possible. | Radix tree (`address_space->i_pages`) indexed by `pgoff`. |
| **VM Area Struct (`vm_area_struct`)** | Represents each contiguous memory‑mapped region in a process. | Fields: `vm_start`, `vm_end`, `vm_flags`, `vm_file`, `vm_pgoff`, `vm_ops`. |
| **Swap Cache** | Holds anonymous pages that have been swapped out. | `struct swap_info_struct`, `struct swap_cluster_info`. |
| **TLB & Page‑Table Management** | Architecture‑specific insertion/deletion of PTEs on fault and unmap. | `pgd_t`, `pud_t`, `pmd_t`, `pte_t` (x86_64). |
| **Writeback System** | Flushes dirty page‑cache pages to disk (pdflush, wb_workfn). | `struct writeback_control`, `wb_completion`. |

### Observing Mappings with Standard Tools
```bash
# Show the memory map of the current shell (includes stack, heap, vdso, etc.)
cat /proc/self/maps

# Detailed info: RSS, PSS, shared/clean/dirty counts
cat /proc/self/smaps | grep -A 20 '^/'

# List all file‑backed mappings for a process ID
sudo cat /proc/<pid>/maps | grep -v '\[heap\]\|\[stack\]'

# Use pmap (from procps-ng) for a formatted view
pmap -x <pid>

# Trace page faults in real time (requires root or perf sudo)
sudo perf trace -e sys_enter_mmap,sys_exit_mmap -p <pid>

# Count minor/major faults for a running program
pidstat -p <pid> -r  # shows minflt/majflt columns

# Inspect the page‑cache state of a specific file (requires root)
sudo cat /proc/<pid>/pagemap | \
  awk '{printf "%08x %08x\n", strtonum("0x"substr($1,0,8)), strtonum("0x"substr($1,9,8))}' \
  | grep $(printf "%08x" $((offset/PAGE_SIZE)))   # simplified; real use needs offset calculations
```

### Manipulating Behavior
* **Advise the kernel about future access:**  
  ```c
  madvise(addr, length, MADV_WILLNEED);   /* prefetch into page cache */
  madvise(addr, length, MADV_RANDOM);     /* hint random access */
  madvise(addr, length, MADV_SEQUENT
