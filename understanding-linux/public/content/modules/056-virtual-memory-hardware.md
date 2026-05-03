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

Every process believes it owns a contiguous private address space — but this illusion is maintained by hardware on every single memory instruction. The MMU translates virtual to physical addresses in hardware; without it, processes would need link-time knowledge of their physical load address, one buggy pointer dereference could corrupt another process's heap, and swapping would require copying entire address spaces rather than individual pages. The page table plus TLB design makes translation cheap enough that the overhead is unmeasurable on most workloads — but understanding the mechanism explains why `mmap`, `fork`, context switches, and swap all behave the way they do.

---

## Core Concepts

### Virtual vs. Physical Addresses

A **virtual address** is the address encoded in a pointer or instruction operand. A **physical address** is what appears on the memory bus and selects a row in a DRAM chip. The MMU, sitting between the CPU pipeline and the L1 cache, translates one to the other on every load and store. The two numbering spaces are completely independent: virtual address `0x400000` in process A maps to a different physical frame than `0x400000` in process B, which is precisely what gives each process private memory.

The kernel itself also uses virtual addresses — it runs with its own page table mappings, occupying the upper portion of every process's virtual address space (above `0xffff800000000000` on x86-64). This is why kernel code can access user memory only through explicit routines like `copy_from_user()`, not by dereferencing a raw user pointer: the user pointer is valid only in the user's address space context.

### Pages and Frames

Virtual and physical memory are divided into fixed-size chunks called **pages** (virtual) and **frames** (physical). The sizes match — always a power of two — so the low-order bits of an address are the **page offset** and pass through translation unchanged. Only the high-order **virtual page number** (VPN) needs translation to a **physical page number** (PPN).

For the default 4 KB page size:

$$\text{offset bits} = \log_2(4096) = 12$$

A 64-bit virtual address is therefore split:

$$\underbrace{[63 \;\ldots\; 12]}_{\text{VPN}} \quad \underbrace{[11 \;\ldots\; 0]}_{\text{offset (12 bits)}}$$

And the physical address is assembled as:

$$\text{PA} = (\text{PPN} \ll 12) \;\big|\; \text{offset}$$

The offset-passthrough property is not an accident: it means the hardware only needs to translate one number (VPN → PPN), not recompute the entire address. It also means that a misaligned access that crosses a page boundary requires *two* translations — a genuine performance cliff that compilers try to avoid.

### Page Table Entries

A **page table** is an array in memory indexed by VPN. Each **page table entry** (PTE) stores the PPN for that virtual page plus status bits that the hardware reads and writes automatically:

| Bit | Hardware behavior |
|-----|-------------------|
| Present (P) | If 0, any access raises a page fault — the PPN field is meaningless |
| Dirty (D) | Set by hardware on any write; cleared by the kernel after writeback |
| Accessed (A) | Set by hardware on any access; used by the kernel's page reclaim (LRU) |
| R/W | If 0, writes raise a protection fault — used to implement copy-on-write |
| U/S | If 0, userspace access raises a fault — protects all kernel mappings |
| NX | If set, instruction fetch raises a fault — enforces W^X |

The kernel does not set the Dirty or Accessed bits; the hardware sets them silently as part of the page table walk. The kernel only reads and clears them. This is how `kswapd` knows which pages are cold without intercepting every memory access.

Each process has its own page table tree. The kernel stores the physical address of the top-level table in `CR3` on x86-64. Switching `CR3` is literally what a context switch means from the MMU's perspective.

### The TLB: Why It Exists and What It Costs

A page table walk requires multiple memory reads (one per level). If every load/store instruction triggered a walk, each instruction would require 4–5 memory accesses. The **translation-lookaside buffer (TLB)** is a small fully-associative cache inside the MMU that stores recently used VPN→PPN translations.

The TLB works because of spatial and temporal locality: if a program accesses byte `0x401234`, the same 4 KB page will almost certainly be accessed again shortly. A typical L1 TLB has 64 entries for data and 64 for instructions; a unified L2 TLB has 1024–2048 entries. Hit rate for most workloads exceeds 99%, meaning the amortized translation cost per access approaches zero.

The critical asymmetry: a TLB **hit** costs ~1 cycle and is fully pipelined. A TLB **miss** on x86-64 triggers a hardware page table walk (the CPU microcode does it, no kernel involvement) costing ~10–30 cycles. A **page fault** (valid bit clear) traps to the kernel costing thousands of cycles before the handler even begins.

On MIPS and RISC-V (without the Sv39/Sv48 hardware walker), a TLB miss traps to the kernel, which walks the page table in software. This makes TLB miss cost explicitly visible and forces kernel developers to keep TLB miss handlers brutally short.

---

## How It Works

### Address Translation Step by Step

On x86-64 with 4-level paging and 4 KB pages, a 48-bit virtual address (bits 63–48 are sign-extended, not translated) is split into five fields:

$$\underbrace{[47..39]}_{\text{PGD index}\ 9\text{b}} \quad \underbrace{[38..30]}_{\text{PUD index}\ 9\text{b}} \quad \underbrace{[29..21]}_{\text{PMD index}\ 9\text{b}} \quad \underbrace{[20..12]}_{\text{PTE index}\ 9\text{b}} \quad \underbrace{[11..0]}_{\text{offset}\ 12\text{b}}$$

For a concrete address:

```
Virtual address: 0x00007fff_ab123456

Bits [47..39] = 0x0ff  → PGD index 255
Bits [38..30] = 0x1ea  → PUD index 490  (7fff >> 21 & 0x1ff, roughly)
Bits [29..21] = 0x158  → PMD index 344
Bits [20..12] = 0x123  → PTE index 291
Bits [11..0]  = 0x456  → offset 1110
```

Translation proceeds:

1. **TLB lookup**: MMU hashes the VPN. Hit → PPN extracted, physical address formed in ~1 cycle. Miss → hardware walker activates.

2. **Page table walk**: Starting from `CR3` (physical address of PGD):
   - Read `PGD[255]` → physical address of PUD
   - Read `PUD[490]` → physical address of PMD
   - Read `PMD[344]` → physical address of PTE page
   - Read `PTE[291]` → PPN + status bits

   Each of these reads goes through the L1/L2 data cache, so in practice a full walk on a warm cache costs ~20–40 cycles, not 4× DRAM latency.

3. **PTE check**: If Present=1, PPN is loaded into TLB and translation completes. If Present=0, the CPU raises exception vector 14 (page fault).

4. **Page fault dispatch**: The CPU pushes `RIP`, `RFLAGS`, `CS`, `SS`, `RSP` onto the kernel stack and jumps to the page fault handler. The faulting virtual address is in `CR2`. Linux's handler is `exc_page_fault()` → `do_page_fault()` → `handle_mm_fault()`, which walks the kernel's VMA tree to decide the response.

### Why Multi-Level Tables Are Necessary

A flat single-level page table for a 48-bit address space with 8-byte PTEs requires:

$$2^{48-12} \times 8 = 2^{36} \times 8 = 512\ \text{GB per process}$$

Unworkable. The multi-level tree solves this because **absent subtrees are not allocated**. A process using 2 MB of stack near `0x7fff...` and 4 MB of code near `0x400000` allocates:

- 1 PGD (always present, 4 KB)
- 2 PUDs (one per region)
- 2 PMDs
- A few PTE pages

Total: tens of kilobytes, not 512 GB. The tree is sparse; only paths to actually mapped virtual pages exist. This is also why the kernel can cheaply check "is this address mapped?" — an absent entry at any level immediately answers no.

The tradeoff is that a full walk now touches 4 cache lines (one per level) instead of one. Huge pages (2 MB or 1 GB) cut this by terminating the walk at PMD or PUD level, improving both TLB reach and walk depth — at the cost of internal fragmentation.

### Copy-on-Write via the R/W Bit

`fork()` does not copy the parent's physical memory. Instead, the kernel:

1. Duplicates the parent's page table tree (cheap — just copying pointers)
2. Marks every PTE in both parent and child as **read-only** (R/W=0), regardless of the original permissions
3. Returns from `fork()`

When either process writes to a page, the hardware raises a protection fault (Present=1 but R/W=0, so it's not a page fault — it's a protection fault, same exception vector, different error code). The kernel's fault handler sees the VMA is writable and the PTE is CoW-marked, allocates a new physical frame, copies the page content, updates the PTE with R/
