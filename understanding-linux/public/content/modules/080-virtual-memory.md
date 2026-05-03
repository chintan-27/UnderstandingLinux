---
id: 80
title: "Virtual memory"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Why This Matters

Every process on a Linux system believes it owns the entire address space. This is not a convenience abstraction — it is a hard requirement for security and correctness. Without it, a process could forge a pointer into another process's memory, `fork()` would require copying every physical page immediately, shared libraries would need a separate physical copy per process, and address-space layout randomization (ASLR) would be impossible. The entire Unix security model — process isolation, privilege separation, `setuid` binaries — rests on the guarantee that one process cannot read or write another's memory without an explicit, kernel-mediated channel. Virtual memory provides that guarantee through hardware-enforced translation.

---

## Core Concepts

### Address Spaces

A process's **address space** is the set of virtual addresses it is permitted to use, defined by the kernel's set of **VMAs (Virtual Memory Areas)** for that process. These are not physical RAM locations. The process observes a clean layout — code near the bottom, heap growing upward, stack growing down from near the top of user space — regardless of where the physical bytes actually live or whether they exist in RAM at all. Two processes can each have a stack at virtual address `0x7fff_ffff_f000` and those addresses refer to completely different physical frames.

The split between user space and kernel space on x86-64 is fixed by the canonical address requirement: user addresses use bits 0–47 with bit 47 = 0 (range `0x0000_0000_0000_0000` to `0x0000_7fff_ffff_ffff`), kernel addresses have bit 47 = 1 sign-extended (range `0xffff_8000_0000_0000` to `0xffff_ffff_ffff_ffff`). The kernel's mappings are present in every process's page tables — inaccessible to user mode via the U/S bit — so that syscall entry and interrupt delivery do not require switching page tables on every kernel entry (though see KPTI below).

### Address Translation

Every memory reference — instruction fetch, data load, data store — uses a virtual address. Before reaching the memory bus, the MMU converts it to a physical address using a **page table** the OS loaded into a hardware register (`CR3` on x86-64). The OS constructs and owns the page tables; the MMU reads them but cannot be directed by user code. A process that tries to build its own translation table has nowhere to install it — writing `CR3` is a privileged instruction. Protection is therefore a consequence of who controls the translation rules, not of any separate mechanism.

### Base and Bounds: The Simplest Translator

The earliest hardware approach uses two registers per CPU: a **base** register holding the physical start of the process's allocation and a **bounds** register holding its size. Translation is:

$$\text{physical} = \text{virtual} + \text{base}, \quad \text{valid iff} \quad \text{virtual} < \text{bounds}$$

A process with $\text{base} = 32768$ accessing virtual address $100$ reaches physical address $32868$. Fast, simple, zero external fragmentation — but the entire address space must occupy one contiguous physical region. Growing the heap requires moving the entire allocation or finding a larger contiguous hole. This does not scale once memory becomes fragmented.

### Segmentation

Segmentation gives each logical region (code, data, heap, stack) its own (base, bounds, permissions) triple, called a **segment descriptor**. The MMU selects the descriptor using either high-order virtual address bits or an explicit **segment register** (CS, DS, SS, ES on x86). A virtual address is a (segment, offset) pair:

$$\text{physical} = \text{base}[\text{seg}] + \text{offset}, \quad \text{valid iff} \quad \text{offset} < \text{bounds}[\text{seg}]$$

This lets the heap and stack live in non-adjacent physical memory. x86-64 in 64-bit mode makes all segment bases zero (FS and GS are exceptions, used for thread-local storage), so segmentation is vestigial on modern Linux. The term **segmentation fault** survives because the concept carried over: any access outside a valid region fires the same class of fault.

### Paging

Paging replaces variable-sized segments with fixed-size **pages** (4 KB on x86-64 by default). Physical RAM is divided into equally-sized **frames**. The OS maintains a **page table** per process: an array indexed by **virtual page number (VPN)** storing the corresponding **physical frame number (PFN)**. Every virtual address decomposes as:

$$\text{VPN} = \left\lfloor \frac{\text{virtual address}}{4096} \right\rfloor, \qquad \text{offset} = \text{virtual address} \bmod 4096$$

$$\text{physical address} = (\text{PFN} \times 4096) \,+\, \text{offset}$$

Equivalently, using bitwise operations on a 4 KB page (12-bit offset):

$$\text{physical} = (\text{PFN} \ll 12) \mid (\text{virtual} \,\&\, \texttt{0xFFF})$$

The offset passes through unchanged; only the VPN is translated. Because any free frame can back any virtual page, external fragmentation disappears. The cost is that the page table itself consumes memory — a flat page table for a 48-bit address space with 4 KB pages requires $2^{36}$ entries, which at 8 bytes each is 512 GiB. Multi-level tables (see below) solve this.

### TLBs: Making Paging Fast

A page table walk on x86-64 requires **four sequential DRAM reads**. At ~100 ns per DRAM access, every instruction fetch would carry 400 ns of overhead — reducing a 3 GHz CPU to an effective rate of roughly $\frac{1}{400 \times 10^{-9}} = 2.5 \text{ million instructions/sec}$, a 1000× slowdown. The **Translation Lookaside Buffer (TLB)** is a fully-associative cache inside the MMU that stores recent VPN→PFN mappings. A TLB hit resolves in 1–2 CPU cycles. Because programs exhibit strong locality, TLB hit rates above 99% are typical, making the amortized translation cost negligible.

A TLB miss on x86-64 is handled entirely by hardware: the MMU walks the four-level page table autonomously (a **hardware page table walker**), updates the TLB, and retries the access transparently. On architectures with a **software-managed TLB** (MIPS, some RISC-V configurations), a miss raises an exception and the kernel inserts the mapping. The kernel's TLB miss handler must itself not cause TLB misses on its own code and data — requiring those pages to be **wired** (always present, never evicted from the TLB).

Any write to `CR3` (context switch, `execve`) or any `invlpg` instruction flushes relevant TLB entries. On multi-core systems, changing a mapping in one CPU's page table requires sending **inter-processor interrupts (IPIs)** to flush the TLB on all CPUs that might hold stale entries — a **TLB shootdown**. High-frequency `mmap`/`munmap` on large regions is expensive partly for this reason.

### Copy-on-Write (COW)

When `fork()` is called, the kernel copies the parent's page table structure but does not copy physical pages. Instead, it marks every writable PTE in both parent and child as **read-only**, while leaving both tables pointing at the same physical frames. The reference count on each shared frame is incremented in the kernel's `struct page`.

When either process writes to a shared page:
1. The MMU raises a protection fault (write to a read-only page).
2. The kernel's fault handler (`do_wp_page()` in `mm/memory.c`) checks the PTE and sees the COW condition: the page is write-protected but the VMA is writable.
3. If the frame's reference count is 1 (no other process shares it), the page is simply made writable — no copy needed.
4. Otherwise, a new frame is allocated, the page content is copied, the faulting process's PTE is updated to point to the new frame and marked writable, the old frame's reference count is decremented, and execution resumes.

The cost of `fork()` is therefore proportional to the size of the page table structure (which is proportional to the number of distinct mappings, not the amount of virtual memory), not to the amount of allocated memory. A process with 1 GB of heap forks cheaply as long as it doesn't immediately dirty all 1 GB.

### `mmap`: Mapping Files and Anonymous Memory

`mmap()` creates a new VMA in the calling process's address space. It does not immediately allocate physical pages. On first access, the MMU finds no present PTE and raises a **page fault**. The kernel's fault handler (`__handle_mm_fault()`) checks which VMA contains the faulting address, determines what backs it (a file, swap, zero-fill), allocates a frame, populates it, installs the PTE, and returns. The process never sees the fault — execution resumes at the faulting instruction, which now succeeds.

For file-backed mappings, the kernel uses the **page cache**: if the file's page is already in the page cache (because another process read it), the PTE is installed pointing to that cached frame — no I/O occurs. Multiple processes mapping the same file share physical frames through the page cache, with no explicit coordination needed from user space. This is how shared libraries work: `libc.so` is mapped into hundreds of processes, all pointing at the same physical text pages.

---

## How It Works

### Virtual Address Splitting (x86-64, 4-level paging)

On x86-64 with 4 KB pages, a valid user virtual address is 48 bits wide, split across five fields:

$$\underbrace{[47:39]}_{\text{PML4 (9 bits)}} \; \underbrace{[38:30]}_{\text{PDPT (9 bits)}} \; \underbrace{[29:21]}_{\text{PD (9 bits)}} \; \underbrace{[20:12]}_{\text{PT (9 bits)}} \;
