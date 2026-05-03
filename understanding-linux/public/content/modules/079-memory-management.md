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

## Why This Matters

Without virtual memory, process isolation is impossible: any bug or malicious code can overwrite any address. Without demand paging, a process must be fully resident before it runs, making the runnable-process count a direct function of RAM size. When these mechanisms are tuned poorly or misunderstood, the symptoms — OOM kills, swap thrashing, mysterious `SIGSEGV`s, `mmap` failures — look like application bugs but are actually policy decisions made in `mm/`. Every `malloc`, every page fault, every line in `/proc/meminfo` is a direct consequence of the design decisions covered here.

---

## Core Concepts

### Physical vs. Virtual Memory

The CPU issues *virtual* addresses. The MMU translates them to *physical* addresses using tables maintained by the OS. Each process has its own translation table, so the same virtual address in two processes maps to different physical frames — that's the isolation guarantee. Process A cannot read process B's memory not because of runtime checks but because there is no mapping from A's virtual addresses to B's physical frames.

### Base and Bounds: The Naive Approach

The simplest scheme uses two hardware registers per process: a base (where the process's memory starts in physical RAM) and a bounds (how large the allocation is). Translation is:

$$\text{physical} = \text{virtual} + \text{base}$$

Any access where $\text{virtual} \geq \text{bounds}$ raises a hardware fault. This is $O(1)$ and cheap, but forces the entire address space into one contiguous physical allocation. The stack and heap grow toward each other; you must pre-reserve the gap between them or the process can't grow. Context switching requires saving two registers but also finding a new contiguous physical region — which gets harder as memory fills up.

### Segmentation

Segmentation generalizes base/bounds by giving each *logical region* (code, heap, stack) its own register pair. The top bits of the virtual address select the segment; the remaining bits are the intra-segment offset:

$$\text{physical} = \text{base}[\text{seg}] + \text{offset}, \quad \text{fault if } \text{offset} \geq \text{bounds}[\text{seg}]$$

This lets heap and stack grow independently without pre-allocating the gap. Read-only code segments can be shared between processes (shared libraries rely on exactly this). The fatal problem: physical memory must hold variable-sized segments. After repeated allocation and deallocation, free memory fragments into non-contiguous islands — *external fragmentation*.

### External Fragmentation

Suppose free memory consists of two 10-byte regions at non-adjacent addresses. You cannot satisfy a single 15-byte request despite having 20 free bytes total. The free space exists; it just has the wrong shape. This is unavoidable with variable-size allocation because freed regions don't naturally coalesce to useful sizes. Compaction (moving live segments to consolidate free space) requires updating every pointer in every running process — prohibitively expensive without hardware indirection.

### Paging

Paging eliminates external fragmentation by making all allocation units the same size. Both virtual and physical memory are divided into fixed-size chunks: **pages** (virtual) and **frames** (physical). Every free frame is interchangeable, so the "wrong shape" problem disappears entirely.

A virtual address splits at a fixed bit boundary:

$$\text{virtual address} = \underbrace{\text{VPN}}_{\text{virtual page number}} \;\|\; \underbrace{\text{offset}}_{\text{within page}}$$

The OS maintains a **page table** — an array indexed by VPN — mapping each VPN to a physical frame number (PFN). Translation:

$$\text{physical address} = \underbrace{\text{PFN}}_{\text{page table[VPN]}} \;\|\; \text{offset}$$

The offset passes through unchanged. The page size must be a power of two precisely so that this split is a single bit-field boundary, making the hardware translator a lookup plus a concatenation rather than a multiply-and-add.

### Demand Paging

A process doesn't need all its pages resident to run. *Demand paging* defers loading a page until the first access. The page table entry (PTE) has a **present bit**; when it's clear, the hardware raises a **page fault** rather than completing the access. The OS handler allocates a frame, reads the page from its backing store (the executable, an `mmap`'d file, or swap), writes the PFN into the PTE, sets the present bit, and re-executes the faulting instruction. The process never observes the fault — it just experiences a slow memory access.

This is why large programs start quickly: `exec` sets up page table mappings pointing at the ELF file on disk but loads nothing. The first access to each page triggers a fault; only touched pages ever consume RAM.

---

## How It Works

### Address Translation Through the Page Table

For a 32-bit virtual address space with 4 KB pages:

- Page size $= 2^{12}$ bytes $\Rightarrow$ 12-bit offset field
- VPN width $= 32 - 12 = 20$ bits $\Rightarrow 2^{20} = 1{,}048{,}576$ entries per page table
- At 4 bytes per PTE: $2^{20} \times 4 = 4\,\text{MB}$ per process just for the page table

With 500 processes, that's 2 GB of kernel memory consumed by page tables alone — before any user data. This cost motivates multi-level page tables (covered in the next module): a two-level table on x86 only allocates the second-level tables for VPN ranges that are actually used, reducing typical overhead to a few KB per process.

The **MMU** performs translation on every memory access. Without caching, each access would require at least one additional memory read (the PTE lookup), doubling memory latency. The **TLB** (Translation Lookaside Buffer) is a small, fully-associative cache of recent VPN→PFN mappings. A TLB hit costs ~1 cycle; a TLB miss triggers a hardware or software page table walk costing ~10–100 cycles depending on cache state. TLB reach (entries × page size) determines what working set fits without thrashing the TLB.

### Walking Through One Access

```
Virtual address: 0x00403A7C   (32-bit process, 4 KB pages)

Binary:
  0000 0000 0100 0000 0011  |  1010 0111 1100
  [------- VPN: 20 bits ---]  [-- offset: 12 bits --]

VPN    = 0x00403 = 1027
offset = 0xA7C   = 2684

page_table[1027] → PFN = 0x2B1   (from OS-managed table)

Physical address = (PFN << 12) | offset
                 = (0x2B1 << 12) | 0xA7C
                 = 0x002B1000   | 0xA7C
                 = 0x002B1A7C
```

The shift is just concatenation: PFN occupies bits $[31:12]$, offset occupies bits $[11:0]$. No arithmetic — that's the point of fixed-size pages.

### Page Table Entry Layout (x86 32-bit)

```
 31                12 11    9  8   7   6  5  4    3    2   1  0
[  physical frame #  | AVL  | G | PS | D | A |PCD|PWT|U/S|R/W| P]
```

| Bit | Name | Set by | Meaning |
|---|---|---|---|
| 0 | P (Present) | OS | 0 → page fault on any access |
| 1 | R/W | OS | 0 → write raises fault (used for CoW) |
| 2 | U/S | OS | 0 → kernel-only; user access faults |
| 5 | A (Accessed) | Hardware | Set on any read or write; used by LRU approximation |
| 6 | D (Dirty) | Hardware | Set on write; OS checks before eviction to decide if writeback needed |
| 9–11 | AVL | OS | Available for OS use (Linux uses some bits for swap entry encoding) |

The Dirty bit is why evicting a clean page is free (no writeback needed) while evicting a dirty page requires a disk write. The OS page reclaim code (`mm/vmscan.c`) checks D before reclaiming a frame, which is why write-heavy workloads increase swap I/O disproportionately.

### Demand Paging and the Page Fault Handler

On x86, when P=0 (or a permission violation occurs), the CPU raises interrupt vector 14 (`#PF`), pushes an error code onto the kernel stack, and stores the faulting virtual address in `CR2`. The Linux handler path:

```
arch/x86/mm/fault.c: exc_page_fault()
  → handle_page_fault()
    → do_user_addr_fault()       ← user-space faults
      → find_vma()               ← is this address mapped at all?
      → handle_mm_fault()        ← core fault resolution
        → __handle_mm_fault()
          → handle_pte_fault()   ← what kind of fault is this?
```

```c
/*
 * Simplified reconstruction of do_user_addr_fault logic
 * (arch/x86/mm/fault.c + mm/memory.c)
 */
unsigned long address = read_cr2();   /* faulting VA */

struct vm_area_struct *vma = find_vma(current->mm, address);

/* No VMA covers this address, or address is below vma->vm_start */
if (!vma || vma->vm_start > address) {
    force_sig_fault(SIGSEGV, SEGV_MAPERR, (void __user *)address);
    return;
}

/* Write to a read-only mapping (catches CoW before permission check) */
if ((error_code & X86_PF_WRITE) && !(vma->vm_flags & VM_WRITE)) {
    force_sig_fault(SIGSEGV, SEGV_ACCERR
