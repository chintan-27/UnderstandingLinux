---
id: 56
title: "Virtual memory hardware"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

Every process believes it owns the entire virtual address space. Your shell thinks `0x7fff...` is its stack; so does every other process running simultaneously. This works because the CPU never puts a virtual address on the memory bus — the MMU intercepts every load and store and rewrites the address before DRAM sees it. Without this hardware translation, process isolation is structurally impossible: there is no software trick that prevents one process from overwriting another's memory if they share a flat physical address space.

Two other consequences follow directly. First, a process can reference addresses that have no physical backing yet — the OS allocates frames lazily, on first access, which is why `malloc(1GB)` returns instantly even on a machine with 512 MB free. Second, the kernel can revoke access to a page by clearing one bit in a PTE; the hardware enforces this on every subsequent access with no cooperation from userspace.

---

## Core Concepts

### Virtual vs. Physical Addresses

A **virtual address** is what the CPU's instruction stream produces. A **physical address** is what the memory controller consumes. The MMU sits between the two and performs the translation on every memory reference — instruction fetches included. Programs are compiled against virtual addresses; the OS decides where things land in physical memory at runtime, independently per process.

### Pages and Frames

Virtual address space is divided into **pages**; physical RAM is divided into **frames**. They are always the same size. On x86-64 the default is 4 KB ($2^{12}$ bytes); 2 MB and 1 GB "huge pages" are also supported via the same PTE mechanism with a flag bit.

The fixed granularity serves two purposes. First, it bounds the mapping structure: tracking individual bytes in a 64-bit address space ($2^{64}$ bytes) is not feasible, but tracking 4 KB pages ($2^{52}$ entries maximum) is at least finite — and multi-level trees make it practical. Second, 4 KB matches the granularity of disk I/O well enough that a page fault (fetching a missing page from swap) reads exactly one unit of work.

### Page Table Entries

A **page table entry (PTE)** encodes one VPN→PFN mapping plus hardware-enforced metadata. On x86-64 each PTE is 8 bytes:

```
 63      52 51       12 11  9  8  7  6  5  4  3  2  1  0
┌──────────┬───────────┬────┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
│ ignored  │    PFN    │ ign│ G│ PS│ D│ A│PCD│PWT│U│ W│ P│
└──────────┴───────────┴────┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
P   = Present (valid bit)
W   = Writable
U   = User-accessible (cleared = kernel only)
A   = Accessed (set by hardware on any read)
D   = Dirty (set by hardware on any write)
PS  = Page size (set in PMD/PUD to map a 2 MB or 1 GB huge page)
G   = Global (don't flush this TLB entry on CR3 reload)
```

The kernel reads the Dirty and Accessed bits to implement page replacement and `msync()`. It clears them periodically; the hardware sets them again on access, allowing the kernel to detect which pages are actively used.

In the Linux kernel source, the C type for a PTE on x86-64 is:

```c
typedef struct { pteval_t pte; } pte_t;   // arch/x86/include/asm/pgtable_types.h
typedef u64 pteval_t;
```

Helpers like `pte_present()`, `pte_dirty()`, and `pte_wrprotect()` manipulate specific bits without exposing the raw bit positions to architecture-independent code.

### The TLB

A page table lookup requires a memory read before the data access itself. Without caching, every load or store would cost at minimum two memory accesses. The **TLB** (Translation-Lookaside Buffer) is a small, fully-associative on-chip cache of recent VPN→PFN translations. A hit costs roughly 1 clock cycle; a miss triggers a page table walk costing 4 memory reads on x86-64 (one per level).

The TLB works because programs exhibit spatial and temporal locality: a tight loop touches the same handful of pages repeatedly. TLB hit rates routinely exceed 99%. If a program's working set spans more pages than the TLB can hold simultaneously (typically 1,000–4,000 entries for L1 dTLB + L2 TLB on modern Intel), performance degrades sharply — this is **TLB thrashing**, and it shows up in `perf stat` as high `dTLB-load-misses`.

---

## How It Works

### Address Decomposition

With 4 KB pages the page offset is $\log_2(4096) = 12$ bits. On a 32-bit system:

$$\underbrace{b_{31} \ldots b_{12}}_{\text{VPN (20 bits)}} \;\Big|\; \underbrace{b_{11} \ldots b_0}_{\text{offset (12 bits)}}$$

The physical address concatenates the looked-up PFN with the original offset (unchanged because page and frame are the same size):

$$\text{PA} = (\text{PFN} \ll 12) \;\Big|\; (\text{VA} \;\&\; \texttt{0xFFF})$$

On x86-64 with a 48-bit virtual address space (bits 63:48 must be sign-extended copies of bit 47), a four-level walk uses:

$$\underbrace{b_{47:39}}_{\text{PGD index (9 bits)}} \underbrace{b_{38:30}}_{\text{PUD index (9 bits)}} \underbrace{b_{29:21}}_{\text{PMD index (9 bits)}} \underbrace{b_{20:12}}_{\text{PTE index (9 bits)}} \underbrace{b_{11:0}}_{\text{offset (12 bits)}}$$

Each 9-bit index selects one of $2^9 = 512$ entries in a 4 KB table (512 × 8 bytes = 4096 bytes exactly — one table fits in one frame). This is not a coincidence; it is why the four-level design was chosen.

### Multi-Level Page Tables

A flat page table for a 32-bit address space requires $2^{20}$ entries at 4 bytes each = **4 MB per process**. For a 64-bit space with 48-bit addressing and 4 KB pages, that would be $2^{36}$ entries — 512 GB of page table per process, which is obviously untenable.

A four-level tree allocates only the nodes that correspond to mapped regions. A process that maps only its code, heap, and stack touches perhaps a few hundred PTEs total. The rest of the tree simply does not exist. Memory cost scales with mapped footprint, not with address space size.

The hardware walks the tree autonomously on a TLB miss (x86-64's **hardware page table walker**). Each step reads a table entry that gives the physical base address of the next level's table, then adds the appropriate index:

```
PA_pgd  = CR3 & ~0xFFF                    # CR3 holds PGD physical base
PA_pud  = (pgd_entry & ~0xFFF) + PUD_idx * 8
PA_pmd  = (pud_entry & ~0xFFF) + PMD_idx * 8
PA_pte  = (pmd_entry & ~0xFFF) + PTE_idx * 8
PA_data = (pte_entry & ~0xFFF) + offset
```

All five of those values are physical addresses — the walker bypasses the TLB and reads from physical memory directly.

### TLB Operation

```
CPU issues virtual address VA
    │
    ▼
TLB lookup (tag = ASID:VPN)
    ├── HIT  → extract PFN, form PA, proceed (~1 cycle)
    └── MISS
          │
          ▼
        Hardware page table walk (x86) / software trap (MIPS)
          │
          ├── PTE.P = 1 → load PTE into TLB, retry original access
          └── PTE.P = 0 → #PF exception → OS page fault handler
                              ├── VA not in any VMA → SIGSEGV
                              └── VA valid → allocate frame, fill page,
                                            set PTE.P=1, iret, retry
```

On MIPS, TLB misses trap to a kernel handler that reads the page table in software and writes the TLB entry with `tlbwr`. This gives the OS complete control over the TLB format at the cost of trap overhead on every miss. x86 avoids the trap but requires the hardware walker to understand the exact PTE format — which is why x86 PTEs have a fixed structure while MIPS PTEs can be whatever the kernel wants.

### Page Fault Handling in the Linux Kernel

The x86-64 page fault handler entry point is `exc_page_fault()` in `arch/x86/mm/fault.c`. The faulting virtual address is in `CR2`; the error code indicates whether the fault was caused by a protection violation or a missing page.

The handler calls into `handle_mm_fault()` (architecture-independent, in `mm/memory.c`), which:

1. Walks the process's VMA tree (`find_vma()`) to verify the address is legitimately mapped.
2. Dispatches to `do_anonymous_page()`, `do_fault()` (file-backed), or `do_swap_page()` depending on the VMA type and PTE state.
3. Calls `alloc_zeroed_user_highpage_movable()` or `swapin_readahead()` to obtain a frame.
4. Updates the PTE with `
