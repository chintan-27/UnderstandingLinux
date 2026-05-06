---
id: 107
title: "Virtual memory areas"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
### Virtual Memory Areas (VMAs)
A **VMA** (`struct vm_area_struct`) describes a contiguous interval `[vm_start, vm_end)` of a process’s virtual address space that has uniform protection and backing storage.  
- **Why a contiguous interval?** The MMU translates virtual to physical addresses using page tables that are indexed by fixed‑size fields of the virtual address. If protection or backing changed inside a page‑table entry, the hardware would need to consult a per‑page descriptor, which would defeat the purpose of a hierarchical page table. Hence the kernel groups pages with identical attributes into a VMA.  
- **Backing storage** can be:  
  1. **Anonymous memory** – no underlying file; pages are allocated on demand and zero‑filled.  
  2. **File‑backed memory** – pages are sourced from a regular file, a block device, or a special file like `/dev/zero`.  
  3. **Device memory** – e.g., MMIO regions (`VM_IO`) or persistent memory (`VM_PFNMAP`).  

### Memory Descriptor (`mm_struct`)
Each thread group (process) holds a single `mm_struct` that aggregates all its VMAs. Important fields:  

| Field | Meaning |
|-------|---------|
| `mm->mmap` | singly‑linked list of `vm_area_struct` sorted by `vm_start`. |
| `mm->pgd` | pointer to the top‑level page‑global directory (PGD) for this address space. |
| `mm->map_count` | number of VMAs (used for quick checks). |
| `mm->total_vm` | sum of `(vma->vm_end - vma->vm_start) >> PAGE_SHIFT` over all VMAs. |

The `mm_struct` is the anchor for all VMA operations: insertion, deletion, splitting, and merging must keep the list sorted and update `map_count`/`total_vm`.

### VMA Flags
Flags are bits in `vm_flags` that convey both current permissions and future allowances. Key flags (from `<linux/mm.h>`):  

| Flag | Meaning | When set |
|------|---------|----------|
| `VM_READ` | pages may be read | always for readable mappings |
| `VM_WRITE` | pages may be written | required for `PROT_WRITE` |
| `VM_EXEC` | pages may be executed | required for `PROT_EXEC` |
| `VM_SHARED` | changes are visible to all mappings of the same underlying object | set for `MAP_SHARED` |
| `VM_MAYREAD`, `VM_MAYWRITE`, `VM_MAYEXEC` | the VMA may later be upgraded to include the corresponding permission via `mprotect` | copied from `mmap` prot arguments |
| `VM_DENYWRITE` | underlying file cannot be opened for writing while mapped | used for executable text segments |
| `VM_IO` | mapping of device memory; disables caching | set by drivers for MMIO |
| `VM_LOCKED` | pages are resident (mlocked) | set by `mlock` |
| `VM_PFNMAP` | mapping is a raw PFN range (no struct page) | used for `/dev/mem` or hugepage backing |

**Why flags matter:** The page‑fault handler consults `vma->vm_flags` to decide whether a fault is resolvable (e.g., a write fault on a `!VM_WRITE` VMA results in `SIGSEGV`).  

### Page Tables
The kernel builds a **radix tree** of page-table entries (PTEs) that mirrors the virtual address layout. On x86‑64 with 4‑level paging and 4 KiB pages:

- Virtual address layout (bits):  
  ```
  [63:48] sign extension (canonical)
  [47:39] PGD index   (9 bits)
  [38:30] PUD index   (9 bits)
  [29:21] PMD index   (9 bits)
  [20:12] PTE index   (9 bits)
  [11:0]  offset      (12 bits)
  ```
- Number of entries per level: $2^9 = 512$.  
- Size of each table: $512 \times 8\text{ B} = 4\text{ KiB}$ (one page).  

**Translation formula** (simplified, ignoring higher‑half sign extension):  

$$
\begin{aligned}
\text{PGD\_entry} &= \text{pgd}[ \text{pgd\_idx} ] \\
\text{PUD\_entry} &= \text{pud}[ \text{pud\_idx} ] \quad \text{where } \text{pud} = (\text{PGD\_entry} \& \text{PAGE\_MASK}) \\
\text{PMD\_entry} &= \text{pmd}[ \text{pmd\_idx} ] \quad \text{where } \text{pmd} = (\text{PUD\_entry} \& \text{PAGE\_MASK}) \\
\text{PTE\_entry} &= \text{pte}[ \text{pte\_idx} ] \quad \text{where } \text{pte} = (\text{PMD\_entry} \& \text{PAGE\_MASK}) \\
\text{Physical address} &= (\text{PTE\_entry} \& \text{PAGE\_MASK}) + \text{offset}
\end{aligned}
$$

Each level filters out the lower‑order bits via `PAGE_MASK (~0xFFF)`. A missing or non‑present entry triggers a page fault.

## How It Works
### VMA Lifetime
1. **Allocation** – `do_mmap_pgoff()` (called from `sys_mmap`) allocates a `vm_area_struct` via `kmem_cache_alloc(vm_area_cachep, GFP_KERNEL)`.  
2. **Insertion** – the new VMA is linked into `mm->mmap` in address order; `mm->map_count++`.  
3. **Page‑table update** – the kernel walks the VMA range and fills in page‑table entries **lazily**:  
   - For anonymous VMAs (`vm_file == NULL`) it leaves PTEs cleared (not present).  
   - For file‑backed VMAs it inserts **special** PTEs that encode the file offset (`pte_mkspecial`) so that a fault can locate the backing page without consuming RAM until accessed.  
4. **Reference counts** – if `vm_file != NULL`, the file’s `struct file` reference count is incremented; the VMA holds this reference until unmapped.

### Mapping a VMA to a File
When `mmap(fd, offset, length, prot, flags)` is invoked:
- The VMA’s `vm_file` is set to the opened `struct file *` obtained via `fdget`.  
- `vm_pgoff` (page offset within the file) is set to `offset >> PAGE_SHIFT`.  
- `vm_flags` are derived from `prot` and `flags` (`PROT_READ` → `VM_READ`, `MAP_SHARED` → `VM_SHARED`, etc.).  
- The file’s `address_space` operations (`->mmap`) may be called (e.g., for filesystems that need to lock pages).  

### Page‑Fault Handling
A fault on address `addr` follows this path (x86‑64):
1. `do_page_fault()` → `exc_page_fault()` → `handle_mm_fault(vma, address, fault_flags)`.  
2. `handle_mm_fault()` finds the VMA via `find_vma(mm, address)`. If none, `SIGSEGV`.  
3. Checks protection: if `(write && !(vma->vm_flags & VM_WRITE)) → SIGSEGV`.  
4. If the fault is **minor** (page present but not up‑to‑date) → update dirty/access bits, return.  
5. If **major** (page not present):  
   - **Anonymous** (`vma->vm_file == NULL`): allocate a new `struct page` (`alloc_page(GFP_HIGHUSER_MOVABLE)`), clear it, insert into the page table via `pte_mkwrite(pte_mkdirty(mk_pte(page, vma->vm_page_prot)))`.  
   - **File‑backed**: call the file’s `->readpage` (via `page_cache_read`) to fill a page from the backing offset, then insert as above.  
   - On `VM_SHARED` and a write fault, mark the page dirty; on `VM_PRIVATE` copy‑on‑wire: allocate a new page, copy contents, break sharing (`page_move_anon_rmap`).  

The fault handler therefore **materializes** pages only when touched, keeping RAM usage proportional to actual working set.

## Worked Examples
### Example 1: Anonymous Memory Mapping (Step‑by‑step)
Goal: create a private, read‑write anonymous VMA of size 256 KiB at virtual address `0x7ffff7dd0000`.

1. **Invoke `mmap`**  
   ```c
   void *addr = mmap((void *)0x7ffff7dd0000,   // hint
                     256 * 1024,               // length
                     PROT_READ | PROT_WRITE,   // prot
                     MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED,
                     -1,                       // fd ignored
                     0);                       // offset
   ```
2. **Kernel side (do_mmap_pgoff)**  
   - `length` rounded up to PAGE_SIZE multiples: already page‑aligned.  
   - Allocate `vm_area_struct`:  
     ```c
     struct vm_area_struct *vma = kmem_cache_alloc(vm_area_cachep, GFP_KERNEL);
     vma->vm_start = 0x7ffff7dd0000;
     vma->vm_end   = vma->vm_start + 256*1024; // 0x7ffff7de0000
     vma->vm_flags = VM_READ | VM_WRITE | VM_MAYREAD | VM_MAYWRITE;
     vma->vm_file  = NULL;                     // anonymous
     vma->vm_pgoff = 0;
     ```
   - Insert into `mm->mmap`; `mm->map_count++`.  
   - No PTEs are filled yet (lazy).  

3. **First write to offset 0x1000 inside the VMA**  
   - Virtual address = `0x7ffff7dd1000`.  
   - Page‑fault occurs (PTE not present).  
   - `handle_mm_fault` sees `vma->vm_file == NULL` → allocates a zero page, inserts a writable PTE.  
   - Instruction resumes; the write succeeds.  

**Result:** The process now has 256 KiB of anonymous memory backed by physical pages allocated on demand.

### Example 2: File‑Backed Shared Mapping
Goal: map `/tmp/data.bin` (size 64 KiB) shared, read‑only, at `0x7ffff7ff0000`.

1. **Open file**  
   ```c
   int fd = open("/tmp/data.bin", O_RDONLY);
   ```
2. **mmap call**  
   ```c
   void *addr = mmap((void *)0x7ffff7ff0000,
                     64 * 1024,
                     PROT_READ,
                     MAP_SHARED,
                     fd,
                     0);
   ```
3. **Kernel side**  
   - `vma->vm_file = get_file(fd);` (refcount++)  
   - `vma->vm_pgoff = 0;`  
   - `vma->vm_flags = VM_READ | VM_MAYREAD | VM_SHARED;`  
   - Because `MAP_SHARED`, the kernel calls the file’s `->mmap` operation (e.g., `ext4_file_mmap`) which may lock the address space but does **not** allocate pages yet.  
4. **Access**  
   - Reading any byte triggers a minor fault → `page_cache_read` finds the page in the page cache (or reads from disk) and inserts a **read‑only** PTE (`pte_mkclean(pte_mkread(...))`).  
   - Because the mapping is `VM_SHARED`, any subsequent write fault would check `!(vma->vm_flags & VM_WRITE)` → `SIGSEGV`.  

**Result:** Multiple processes mapping the same file share the same physical pages; modifications via `MS_SYNC` or `msync` would be visible to all (if the mapping were also `VM_WRITE`).

## Common Mistakes
### Mistake 1: Assuming a VMA is Writable Without Checking `VM_WRITE`
**What:** Code does `*ptr = value;` after `mmap(..., PROT_READ, ...)`.  
**Why it’s wrong:** The VMA’s `vm_flags` lacks `VM_WRITE`. The page‑fault handler treats a write fault on a non‑writable VMA as a protection violation and sends `SIGSEGV`.  
**Fix:** Either request `PROT_WRITE` at mmap time or use `mprotect(addr, len, PROT_READ|PROT_WRITE)` after verifying the mapping is `VM_MAYWRITE`.

### Mistake 2: Forgetting to Invalidate the Page Cache After a Shared Writable Mapping
**What:** A process writes to a `MAP_SHARED` file‑backed region, then calls `msync(addr, len, MS_ASYNC)` but never marks pages dirty.  
**Why it’s wrong:** The kernel only writes back pages that have the `PG_dirty` flag set. If the fault handler cleared the dirty bit (e.g., due to a `remap_file_pages` mistake), `msync` will skip those pages, leaving on‑disk data stale.  
**Fix:** After writing, ensure `pte_mkdirty` is called (the fault handler does this for `VM_WRITE`+`VM_SHARED`). If manually manipulating PTEs, also call `set_page_dirty(page)`.

### Mistake 3: Using `MAP_FIXED` Without Guarding Against Existing Mappings
**What:** `mmap(addr, len, ..., MAP_FIXED, ...)` where `addr` lies inside an existing stack or heap region.  
**Why it’s wrong:** `MAP_FIXED` **overrides** existing mappings, silently unmapping them. This can corrupt the stack, cause crashes, or leak unmapped regions that the glibc malloc still believes are valid.  
**Fix:** Always probe the target range with `/proc/self/maps` or `find_vma` before using `MAP_FIXED`. Prefer `MAP_FIXED_NOREPLACE` (Linux 4.17+) which returns an error instead of silently unmapping.

## Exercises
### Easy
1. **Anonymous allocation** – Write a C program that calls `mmap` with `MAP_PRIVATE|MAP_ANONYMOUS|MAP_POPULATE` to allocate 4 MiB, writes a pattern to the first page, then uses `mincore` to verify the page is resident.  
2. **File‑backed read‑only** – Open `/usr/bin/ls`, map the first 4 KiB with `MAP_PRIVATE`, `mmap`, then `memcmp` the mapped bytes against the first 4 KiB read via `pread`.  

### Medium
3. **Copy‑on‑Write demo** – Map a file shared read‑only, then use `mprotect` to make it writable on a single page, trigger a write fault, and verify that the underlying file is unchanged (check with `stat` before/after).  
4. **Page‑fault counting** – Install a handler for `SIGSEGV` that increments a counter on `SEGV_MAPERR`. Map a large anonymous region (1 GiB) but touch only every 4 KiB page (stride). Print the fault count and compare to the expected number of touched pages.  

### Hard
5. **Implement a simple malloc using `mmap`** – Allocate memory in multiples of 2 MiB via `mmap(NULL, size, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)`, manage a free list, and implement `malloc`/`free`. Verify correctness with a stress test that allocates and frees random sizes.  
6. **Device memory mapping** – Open `/dev/mem` (as root), map a known PCI BAR (e.g., address `0xfee00000` for the local APIC) with `MAP_SHARED|MAP_IO`, read a register, and print its value. Explain why `VM_IO` is set and why caching is disabled.  

## Linux Connection
### Kernel Subsystems
- **`mm` subsystem** – Manages `mm_struct` and `vm_area_struct`. Core files:  
  - `include/linux/mm_types.h` (definitions of `mm_struct`, `vm_area_struct`).  
  - `mm/mmap.c` (implementation of `do_mmap`, `do_munmap`).  
  - `mm/memory.c` (page‑fault handling: `handle_mm_fault`).  
- **`vm` subsystem** – Provides helper routines for VMAs (though historically part of `mm`):  
  - `include/linux/vmalloc.h` (not to be confused with `vmalloc`).  
  - `mm/vmscan.c` (page reclaim, interacts with VMAs via `isolate_lru_page`).  

### System Calls
| Syscall | Prototype | Purpose |
|---------|-----------|---------|
| `mmap` | `void *mmap(void *addr, size_t length, int prot, int flags, int fd, off_t offset);` | Creates a VMA (anonymous or file‑backed). |
| `munmap` | `int munmap(void *addr, size_t length);` | Removes a VMA (updates `mm->mmap`, frees `vm_area_struct`). |
| `mprotect` | `int mprotect(void *addr, size_t length, int prot);` | Changes `vm_flags` of an existing VMA; may split/merge VMAs. |
| `msync` | `int msync(void *addr, size_t length, int flags);` | Flushes dirty pages of a file‑backed VMA to disk. |
| `mlock` / `munlock` | `int mlock(const void *addr, size_t length);` | Sets/clears `VM_LOCKED`, faulting in pages to keep them resident. |

### Commands to Inspect VMAs
```bash
# Show the current process’s memory map (anonymous, file‑backed, vsyscall, etc.)
$ cat /proc/self/maps
# Example output:
# 00400000-0040b000 r-xp 00000000 08:02 131073 /usr/bin/cat
# 0060a000-0060b000 r--p 0000b000 08:02 131073 /usr/bin/cat
# 0060b000-0060c000 rw-p 0000c000 08:02 131073 /usr/bin/cat
# 7ffeefbff000-7ffeec000000 rw-p 00000000 00:00 0          [stack]
# 7ffff7ffa000-7ffff7ffc000 r-xp 00000000 08:02 262149 /lib/x86_64-linux-gnu/ld-2.31.so
# 7ffff7ffe000-7ffff7fff000 r--p 00002000 08:02 262149 /lib/x86_64-linux-gnu/ld-2.31.so
# 7ffff7fff000-7ffff8000000 rw-p 00003000 08:02 262149 /lib/x86_64-linux-gnu/ld-2.31.so

# Show VMAs of a specific PID (needs ptrace permission)
$ sudo cat /proc/1234/maps

# Display concise summary (address, perms, offset, device, inode, pathname)
$ pmap -x $(pidof bash)

# List all kernel VMA‑related config options (helpful for debugging)
$ grep -E 'CONFIG_MM|CONFIG_VMALLOC' /boot/config-$(uname -r)

# Find where VM_READ is defined in the kernel source
$ grep -r '^#define VM_READ' /usr/src/linux-headers-$(uname -r)/include/
```
The first column of `/proc/<pid>/maps` gives `vm_start-vm_end`; the second column shows permissions (`rwxp` where `p` = private, `s` = shared). The fifth column is the file offset in hex; the last column is the pathname (or `[anon]`, `[stack]`, `[vdso]`, etc.).

## Why This Matters
Understanding VMAs is the key to **predicting and controlling** a program’s memory behavior:

* **Performance:** By knowing which regions are file‑backed versus anonymous, you can tune readahead, use `madvise` (`MADV_SEQUENTIAL`, `MADV_RANDOM`), and avoid unnecessary page faults.  
* **Correctness:** Misinterpreting `VM_SHARED` vs. `VM_PRIVATE` leads to silent data corruption when multiple processes share a file. Proper use of `msync` or `MAP_SYNC` (Linux 4.15+) guarantees durability.  
* **Security:** VMA enforcement (`VM_READ/WRITE/EXEC`) is the foundation of address‑space layout randomization (ASLR) and non‑executable stacks; bypassing these checks via `mprotect` errors is a common exploit vector.  
* **Scalability:** In containers or microservices, many short‑lived processes share the same executable mappings. The kernel’s ability to map the same file read‑only into thousands of `mm_struct`s without duplicating RAM relies entirely on the VMA/file‑backing abstraction.  
* **Kernel Development:** When writing a driver or a filesystem, you must implement the `->mmap` operation correctly: set appropriate `vm_flags`, handle `vm_pgoff`, and optionally insert special PTEs for DMA buffers. A mistaken VMA flag can cause I/O stalls, memory leaks, or kernel oops.

In short, VMAs are the **glue** between the abstract notion of “memory” and the concrete mechanisms of paging, file I/O, and hardware protection. Mastering them lets you write
