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

## Why This Matters

Every process believes it owns the entire address space — `0x0` to `0xFFFFFFFFFFFFFFFF` on a 64-bit system. This fiction is load-bearing: without it, shared libraries would require per-process physical copies, sparse allocations would waste RAM proportional to the gap between first and last byte touched, and security boundaries between processes would depend entirely on software discipline rather than hardware enforcement. Virtual Memory Areas (VMAs) are the kernel's mechanism for making this fiction coherent.

The key insight is that a VMA is a *promise*, not an allocation. When you call `mmap(2)` or `malloc(3)` (which eventually calls `brk(2)` or `mmap(2)`), the kernel records *what* should exist at a range of addresses — its permissions, its backing source, its behavior on fault — but allocates no physical RAM. Physical pages enter the picture only when the CPU attempts to translate a virtual address and finds no valid page table entry. At that point the kernel must either satisfy the fault by wiring in a page, or deliver `SIGSEGV` because the address falls outside any VMA. Miss a VMA during fault handling, miscalculate permission bits, or fail to merge adjacent compatible regions, and you get either a spurious segfault or, worse, a privilege escalation.

---

## Core Concepts

### The Memory Descriptor (`mm_struct`)

Every process has exactly one `mm_struct`, anchored at `task_struct->mm`. It is the root of the entire virtual address space. Threads created with `CLONE_VM` share the *same* `mm_struct` — this is not a kernel implementation detail but the definition of "thread" in Linux: two `task_struct`s whose `->mm` pointers are identical. There is no separate thread type.

```c
struct mm_struct {
    struct vm_area_struct   *mmap;        /* linked list of VMAs, sorted by vm_start */
    struct rb_root           mm_rb;       /* red-black tree of the same VMAs */
    pgd_t                   *pgd;         /* page global directory — root of page tables */
    atomic_t                 mm_users;    /* processes/threads sharing this mm */
    atomic_t                 mm_count;    /* references including kernel-internal users */
    unsigned long            total_vm;    /* total pages mapped */
    unsigned long            locked_vm;   /* pages pinned with mlock */
    unsigned long            pinned_vm;   /* pages pinned via get_user_pages */
    /* ... */
};
```

`mm_users` and `mm_count` serve different purposes. `mm_users` counts entities that use the address space (threads, and transiently the kernel during `execve`). `mm_count` counts *references to the struct itself*, including cases where the kernel holds a pointer after the last user has exited (e.g., a kernel thread inspecting a dying process's maps). The struct is freed only when `mm_count` drops to zero.

When `fork()` is called without `CLONE_VM`, `copy_mm()` allocates a fresh `mm_struct` from the `mm_cachep` slab cache, then calls `dup_mmap()` to clone every VMA and rebuild the page tables with copy-on-write (COW) semantics. With `CLONE_VM`, it increments `mm_users` and copies the pointer — no page table duplication at all.

### Virtual Memory Areas (`vm_area_struct`)

A VMA represents a *contiguous, homogeneous* region of virtual address space: same permissions, same backing source, same fault behavior. Contiguity here means contiguous in *virtual* address space; the underlying physical pages are typically scattered.

```c
struct vm_area_struct {
    unsigned long                       vm_start;      /* first byte address (inclusive) */
    unsigned long                       vm_end;        /* first byte address beyond region (exclusive) */
    struct vm_area_struct              *vm_next;       /* linked list, ascending vm_start */
    struct vm_area_struct              *vm_prev;       /* doubly-linked since 3.x */
    struct rb_node                      vm_rb;         /* node in mm->mm_rb */
    pgprot_t                            vm_page_prot;  /* hardware PTE protection bits */
    unsigned long                       vm_flags;      /* VM_READ, VM_WRITE, VM_EXEC, ... */
    struct file                        *vm_file;       /* backing file, or NULL for anonymous */
    unsigned long                       vm_pgoff;      /* offset into vm_file, in pages */
    const struct vm_operations_struct  *vm_ops;        /* fault, open, close callbacks */
    /* ... */
};
```

Region size in bytes:

$$\text{size} = \texttt{vm\_end} - \texttt{vm\_start}$$

Number of pages spanned (where $P = \texttt{PAGE\_SIZE} = 4096$ on x86-64):

$$n_{\text{pages}} = \frac{\texttt{vm\_end} - \texttt{vm\_start}}{P}$$

The virtual page number (VPN) of `vm_start`:

$$\text{VPN} = \frac{\texttt{vm\_start}}{P} = \texttt{vm\_start} \gg 12$$

`vm_pgoff` records the mapping's offset into the backing file, in units of pages. For a file-backed mapping starting at byte offset $B$ in the file, $\texttt{vm\_pgoff} = B / P$. The file offset corresponding to a virtual address $V$ within such a mapping is:

$$\text{file\_offset} = (\texttt{vm\_pgoff} + \frac{V - \texttt{vm\_start}}{P}) \times P$$

This is the formula the page fault handler uses to know which byte of a file to read when satisfying a demand fault.

### Anonymous vs. File-Backed Mappings

**Anonymous mapping**: `vm_file` is `NULL`. No file backs the pages. The heap (`brk` region), thread stacks, and `mmap(MAP_ANONYMOUS)` buffers are all anonymous. Before a page is written for the first time, the kernel maps every virtual page in the region to a single shared physical page — the *zero page* — marked read-only. The first write faults, the fault handler detects the COW situation, allocates a real zeroed page, and rewires the PTE. This means allocating a 1 GB anonymous mapping consumes essentially zero physical RAM until you touch it.

**File-backed mapping**: `vm_file` points to a `struct file`. On fault, the kernel calls through `vm_ops->fault` to read the relevant page from the page cache (or from disk if it isn't cached yet). If `MAP_SHARED` is set, writes go directly back to the page cache and are eventually flushed to disk. If `MAP_PRIVATE`, the first write triggers COW: the kernel copies the page cache page into a new anonymous page, remaps the PTE, and the process now owns a private copy that will never be written back.

The physical RAM savings from shared file-backed mappings are concrete. If `libc-2.38.so` has a 1,820 KB text segment and 400 processes link against it:

$$\text{naive cost} = 1820 \text{ KB} \times 400 = 728{,}000 \text{ KB} \approx 711 \text{ MB}$$

$$\text{actual cost} = 1820 \text{ KB} \times 1 = 1820 \text{ KB}$$

The shared mapping achieves this because all 400 processes have VMAs whose `vm_file` and `vm_pgoff` point to the same inode and offset, so the fault handler returns the same physical page frames to all of them.

### VMA Flags and Permissions

`vm_flags` encodes *behavior*, not just hardware protection:

| Flag | Meaning |
|------|---------|
| `VM_READ` | Readable |
| `VM_WRITE` | Writable |
| `VM_EXEC` | Executable |
| `VM_SHARED` | Writes propagate back to the file (MAP_SHARED) |
| `VM_MAYWRITE` | `mprotect` is allowed to add `VM_WRITE` |
| `VM_GROWSDOWN` | Region extends downward on fault (stack) |
| `VM_GROWSUP` | Region extends upward on fault (some arches) |
| `VM_LOCKED` | Pages are pinned via `mlock(2)` — not swappable |
| `VM_IO` | Maps device I/O registers — do not swap, do not core dump |
| `VM_DONTCOPY` | Do not copy this VMA on `fork` |
| `VM_DONTEXPAND` | `mremap` may not enlarge this VMA |
| `VM_ACCOUNT` | Count pages against the process's committed memory limit |

`VM_MAYWRITE` is a separate flag because `mprotect(PROT_WRITE)` must be refused on a VMA that was originally created without write permission if the underlying file object does not permit it. The split between `VM_WRITE` (currently writable) and `VM_MAYWRITE` (allowed to become writable) enforces this.

`vm_page_prot` is derived from `vm_flags` by `vm_get_page_prot()` and encodes the architecture-specific bits that end up in each PTE. The distinction matters: `vm_flags` is the canonical source of truth; `vm_page_prot` is a cached translation of it into hardware terms.

### The Dual Data Structure: List and Red-Black Tree

Every VMA is simultaneously a node in two data structures hanging off `mm_struct`:

- **`mmap` (linked list)**: Sorted ascending by `vm_start`. Used for sequential iteration — `fork`'s `dup_mmap`, `/proc/pid/maps` generation, memory compaction.
- **`mm_rb` (red-black tree)**: Balanced BST keyed on `vm_start`. Used for point lookup: given a faulting virtual address, find the containing VMA in $O(\log n)$.

The reason for the redundancy is that the two access patterns have incompatible performance profiles. Sequential iteration over $n$ VMAs costs $O(n)$ on a list and $O(n)$ on
