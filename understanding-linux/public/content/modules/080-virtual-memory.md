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

## Core Concepts
### Address Translation Fundamentals
A CPU generates a **virtual address (VA)**. The Memory Management Unit (MMU) translates it to a **physical address (PA)** using a page table. The translation splits the VA into a **virtual page number (VPN)** and a **page offset**:

$$
\text{VPN} = \text{VA} \gg \text{OFFSET\_BITS}, \qquad
\text{OFFSET} = \text{VA} \,\&\, (2^{\text{OFFSET\_BITS}}-1)
$$

For the common 4 KiB page size, `OFFSET_BITS = 12`. The MMU then forms the PA:

$$
\text{PA} = (\text{PPN} \ll \text{OFFSET\_BITS}) \;|\; \text{OFFSET}
$$

where **PPN** is the physical page number stored in the page‑table entry (PTE). If the PTE’s *present* bit is clear, the MMU raises a **page‑fault exception**, transferring control to the OS.

### Why Virtual Memory Exists
1. **Isolation & Protection** – Each process gets its own page table; the MMU checks protection bits (read/write/execute, user/supervisor) on every access, preventing one process from corrupting another's memory or the kernel.
2. **Efficient Physical Memory Use** – Only pages that are actively used need reside in RAM. Infrequently used pages can be swapped to secondary storage, letting the sum of virtual address spaces exceed physical RAM.
3. **Address‑Space Expansion** – A 32‑bit process can address $2^{32}$ B even if the machine has only 256 MiB RAM; a 64‑bit process can theoretically address $2^{64}$ B, limited only by the OS’s implementation.
4. **Sharing & Copy‑on‑Write** – Identical physical pages can be mapped into multiple address spaces (e.g., shared libraries, forked processes) with appropriate protection bits, saving memory.

### Page‑Table Hierarchy (x86‑64 Example)
Modern CPUs use multi‑level page tables to keep each level manageable. With 4 KiB pages and a 48‑bit canonical VA, the VPN is divided into four 9‑bit indexes:

```
[47:39] PGD index   → Page‑Global Directory
[38:30] PUD index   → Page‑Upper Directory
[29:21] PMD index   → Page‑Middle Directory
[20:12] PTE index   → Page Table Entry
[11:0]  OFFSET
```

Each level contains $2^9 = 512$ entries. A single page‑table walk may require up to four memory reads; the **Translation Lookaside Buffer (TLB)** caches recent translations to avoid this cost.

### Protection & Fault Handling
- **Present (P)** – Indicates the page resides in RAM.
- **Read/Write (RW)** – If clear, writes trigger a protection‑fault.
- **User/Supervisor (US)** – Enforces privilege‑level checks.
- **Accessed (A)** and **Dirty (D)** – Set by the MMU; used by the OS for page‑replacement algorithms (e.g., LRU approximated via clock).

When a fault occurs, the OS examines the faulting address, the error code (which tells whether it was a missing‑present, protection, or reserved‑bit fault), and decides:
- If the page is **not present** but resides in swap or a file, it **pages in** the content.
- If the protection is violated, it may send **SIGSEGV** to the process.
- If the address is unmapped entirely, it also sends **SIGSEGV**.

### Copy‑on‑Write (CoW)
After a `fork()`, the parent and child initially share the same physical pages. The kernel marks those pages **read‑only** (clears the RW bit) in both page tables. On the first write attempt by either process, a protection fault occurs; the OS:
1. Allocates a new free physical page.
2. Copies the contents of the shared page into the new page.
3. Updates the faulting process’s PTE to point to the new page, sets RW=1, and leaves the original page read‑only for the other process.
Thus, memory is duplicated only when actually needed.

### Memory‑Mapped Files (`mmap`)
`mmap()` creates a **vm_area_struct** that describes a range of virtual addresses backed by a file (or anonymous memory). On first access to a page in that range:
- If the page is clean and present, the MMU translates normally.
- If the page is not present, the page‑fault handler looks up the corresponding file offset, reads the page into the **page cache** (if not already there), inserts it into a free frame, updates the PTE, and retries the instruction.
Writes to a `MAP_PRIVATE` mapping trigger CoW; writes to a `MAP_SHARED` mapping update the page cache and are eventually written back to disk via the kernel’s writeback mechanism.

---

## How It Works
### Step‑by‑Step Translation (with TLB)
1. **CPU** issues VA.
2. **MMU** checks the **TLB** (content‑addressable memory).  
   - *TLB hit*: PA formed immediately; access proceeds.  
   - *TLB miss*: proceed to page‑table walk.
3. **Page‑Table Walk** (hardware‑assisted on x86‑64):
   - Read PGD entry → if not present → fault.
   - Read PUD entry → …
   - Read PMD entry → …
   - Read PTE entry → yields PPN and flags.
4. **Present‑bit check**:
   - **P=1**: Form PA using the formula above; check RW/US flags; if ok, complete the memory access.
   - **P=0** or flag violation: raise a page‑fault exception to the OS.
5. **TLB Update**: On successful translation, the MMU inserts the (VPN→PPN) pair into the TLB (often replacing an LRU entry).

### Page‑Fault Service Routine (Linux)
```c
/* Pseudocode of do_page_fault() */
unsigned long address = faulting_vaddr;
struct vm_area_struct *vma = find_vma(current->mm, address);
if (!vma || address < vma->vm_start)
    goto segfault;

/* Determine fault type from error code */
if (error_code & PF_PROT)   /* protection fault */
    goto handle_protection;
if (!(error_code & PF_PRESENT)) { /* not present */
    if (vma->vm_flags & VM_SHARED) {   /* file‑backed */
        ret = fault_in_mm_vma(vma, address);
    } else {                           /* anonymous */
        ret = do_anonymous_page(vma, address);
    }
    if (ret) goto oom;
    /* success: retry instruction */
    return;
}
segfault:
    force_sig(SIGSEGV);
```
- **Anonymous fault** (`do_anonymous_page`): allocate a free frame (via `alloc_pages`), zero‑fill it, insert the PTE, set accessed/dirty bits.
- **File‑backed fault** (`fault_in_mm_vma`): locate the page in the **page cache**; if missing, perform synchronous read from the backing file into a frame, then insert the PTE.
- The handler updates the PTE’s **present**, **dirty**, and **accessed** bits, invalidates the old TLB entry (via `invlpg` or flush range), and returns to faulting instruction.

### Copy‑on‑Write Fault Handler (simplified)
```c
static int handle_cow_fault(struct vm_area_struct *vma,
                            unsigned long address,
                            unsigned int error_code)
{
    struct page *old_page = vm_normal_page(vma, address);
    struct page *new_page = alloc_page(GFP_HIGHUSER_MOVABLE);
    copy_user_highpage(new_page, old_page, address, vma);
    /* Install new PTE */
    set_pte_at(vma->vm_mm, address,
               pte_mkwrite(pte_mkdirty(mk_pte(new_page, vma->vm_page_prot))),
               false);
    /* Mark old page as still referenced by other vmas */
    put_page(old_page);
    return 0;   /* retry instruction */
}
```
The handler allocates a fresh page, copies the content, marks the new PTE writable, and leaves the original page read‑only for any other vmas that still map it.

### Performance Numbers (illustrative)
- **TLB hit latency**: ~1 cycle.
- **TLB miss + page‑table walk** (4 levels, each RAM read ≈ 100 ns): ≈ 400 ns.
- **Page fault (minor, page in cache)**: ≈ 5 µs (mostly software overhead).
- **Page fault (major, disk I/O)**: ≈ 5–10 ms (depends on SSD/HDD).

These numbers explain why a high TLB hit rate (> 99 %) is critical for performance.

---

## Worked Examples
### Example 1: Virtual‑to‑Physical Translation
Assume:
- Page size = 4 KiB → `OFFSET_BITS = 12`.
- Process virtual address space: 16 pages (0‑15) → VPN fits in 4 bits.
- Physical memory: 8 frames (0‑7).
- Page table (as in draft) stored in an array `pte[16]`.

**Given VA = 0x1000**  
1. Extract VPN:  
   $$ \text{VPN} = 0x1000 \gg 12 = 0x1 = 1_{dec} $$  
2. Extract offset:  
   $$ \text{OFFSET} = 0x1000 \,\&\, 0xFFF = 0x0 $$  
3. Look up `pte[1]`:  
   `{ virtual_page_number:1, physical_page_number:1, present_bit:1, modified_bit:0 }`  
4. Since `present_bit = 1`, compute PA:  
   $$ \text{PA} = (1 \ll 12) \;|\; 0x0 = 0x1000 $$  
   The virtual address maps to the same‑valued physical address because PPN = VPN in this example.

**Given VA = 0xF000** (the last page)  
1. VPN = 0xF000 >> 12 = 0xF = 15.  
2. OFFSET = 0xF000 & 0xFFF = 0x0.  
3. `pte[15]` has `physical_page_number = -1` (represented as all‑bits‑1) and `present_bit = 0`.  
4. Present bit = 0 → **page fault**.  

### Example 2: Page‑Fault Handling (Major Fault)
Suppose the process faults on VA = 0x2A000 (decimal 174080).  
- Page size = 4 KiB → VPN = 0x2A000 >> 12 = 0x2A = 42.  
- Assume physical memory is fully allocated; the OS selects a victim frame using **clock algorithm**, finds frame PPN = 23 whose dirty bit = 0 (clean).  
- The page belongs to a swapped‑out region; the swap slot holds the page’s contents.  
Steps:
1. **Victim selection**: PPN = 23, no write‑back needed.  
2. **Read from swap**: Issue a disk read (≈ 8 ms) to fill frame 23.  
3. **Update PTE**:  
   - Set `physical_page_number = 23`.  
   - Set `present_bit = 1`.  
   - Clear `modified_bit` (dirty) until a write occurs.  
   - Set `accessed_bit = 0` (will be set on first access).  
4. **Invalidate TLB** for VPN = 42 (`invlpg`).  
5. **Retry instruction**: MMU walks the table again, finds present=1, forms PA = (23 << 12) | offset.  
   Offset = 0x2A000 & 0xFFF = 0x0 → PA = 0x23000.  

Thus the fault resolves to physical address 0x23000 after ~8 ms of disk latency plus ~2 µs of software overhead.

### Example 3: Copy‑on‑Write After `fork()`
1. Parent process has a page at VPN = 10 mapped to PPN = 7, PTE = `{present=1, RW=1, US=1}`.  
2. `fork()` creates child; kernel copies the parent’s `mm_struct` but **does not copy** the page frame. Instead, it sets both parent and child PTEs for VPN = 10 to `{present=1, RW=0, US=1, PPN=7}` (read‑only).  
3. Child attempts to write to an address within that page (e.g., `*(int*)(0xA000+4) = 0xdeadbeef`).  
   - MMU sees RW=0 → protection fault.  
   - Fault handler detects COW (vma flag `VM_COW` or checks if page count > 1).  
   - Allocates new frame PPN = 14, copies contents from PPN = 7 to PPN = 14.  
   - Updates child’s PTE for VPN = 10 to `{present=1, RW=1, US=1, PPN=14}`.  
   - Leaves parent’s PTE unchanged (still read‑only, PPN = 7).  
4. After the fault, the child writes to its private copy (PPN = 14) while the parent continues to see the original data (PPN = 7).  

---

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **Believing the page table stores a mapping for every byte** | A page table entry covers an entire page (typically 4 KiB). Storing per‑byte mappings would explode memory consumption (2⁶⁴ entries for a 64‑bit VA). | The table maps **virtual page numbers** to **physical page numbers**; the offset is added directly by the MMU. |
| **Assuming a TLB miss always triggers a page‑fault** | A TLB miss only means the translation is not cached; the MMU still walks the page tables. A fault occurs only if the page is not present or protection is violated. | TLB miss → page‑table walk → (present & ok) → translation → TLB fill; fault only on missing present or protection violation. |
| **Thinking copy‑on‑write duplicates memory at fork time** | Duplicating all pages would waste time and memory; the whole point of CoW is to defer copying until a write actually occurs. | At fork, pages are shared read‑only; a fault on write triggers allocation and copy of *only* the faulted page. |
| **Assuming `mmap()` reads the whole file into RAM immediately** | `mmap()` creates a *lazy* mapping; pages are faulted in on demand. Reading the whole file upfront would defeat the purpose of memory‑mapped I/O for large files. | Fault handler pages in the requested page from the file (or page cache) when first accessed. |
| **Believing increasing swap size always improves performance** | If the workload’s working set fits in RAM, extra swap is unused. Excessive swapping (thrashing) severely degrades performance because disk latency is orders of magnitude higher than RAM. | Swap is useful only when the active memory demand exceeds RAM; performance depends on **swap‑in/out rate**, not just swap size. |
| **Confusing the “present” bit with page validity** | A page can be present but still invalid (e.g., reserved bits set, or the page belongs to a different VMA with incompatible permissions). The OS also uses accessed/dirty bits for replacement. | The MMU checks **present** *and* **access control bits** (RW, US). The OS may additionally reject a page based on VMA flags or reserved‑bit checks during the fault handler. |
| **Thinking each process has a completely separate physical memory** | Physical RAM is shared; page tables merely dictate *which* physical frames a process may use. Two processes can map the same frame (e.g., shared libraries, tmpfs). | The **physical address space** is global; page tables provide per‑process *views* into it. Sharing is achieved by mapping the same PPN into multiple address spaces. |

---

## Exercises
### 1. Simple Page‑Table Lookup (Easy)
Write a C program that:
- Defines `struct pte { uint64_t ppn:40; uint8_t present:1; uint8_t rw:1; uint8_t us:1; uint8_t dirty:1; uint8_t accessed:1; };` (packed, 64 bits).
- Initializes an array `pte table[16]` with arbitrary PPNs and present bits.
- Reads a hexadecimal virtual address from stdin, extracts VPN and offset (assume 4 KiB pages), looks up the entry, and prints:
  - The physical address if present.
  - “Page fault!” otherwise.
- Bonus: Count and report the number of TLB hits if you simulate a 4‑entry fully‑associative TLB (LRU replacement).

```c
/* skeleton */
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PAGE_SHIFT 12
#define PAGE_MASK  ((1UL << PAGE_SHIFT) - 1)

typedef struct {
    uint64_t ppn : 40;
    uint8_t present : 1;
    uint8_t rw : 1;
    uint8_t us : 1;
    uint8_t dirty : 1;
    uint8_t accessed : 1;
} __attribute__((packed)) pte_t;

int main(void) {
    pte_t table[16] = { /* fill with dummy data */ };
    char line[64];
    if (!fgets(line, sizeof(line), stdin)) return 0;
    unsigned long va = strtoul(line, NULL, 16);
    unsigned long vpn = va >> PAGE_SHIFT;
    unsigned long offset = va & PAGE_MASK;
    pte_t *pte = &table[vpn];
    if (pte->present) {
        unsigned long pa = (pte->ppn << PAGE_SHIFT) | offset;
        printf("PA = 0x%lx\n", pa);
    } else {
        printf("Page fault!\n");
    }
    return 0;
}
```

### 2. Page‑Fault Simulation with FIFO Replacement (Medium)
Simulate a system with:
- 8 physical frames.
- A reference string of virtual page numbers (e.g., `1 2 3 2 4 5 3 2 5 2 4 1 4 3 5 2`).
- Initially all frames invalid (present=0).

Implement in C or Python:
- On each reference, check if the page is present in any frame (simulate a TLB hit if desired).
- If present, increment a hit counter.
- If not present, increment a fault counter, select the victim frame using FIFO, load the page (set present), and update the queue.
- After processing the string, report hit/miss ratios and the final frame contents.
- Discuss how the algorithm would change if the reference string exhibited locality.

### 3. Copy‑on‑Write Fork Simulation (Hard)
Create a program that:
- Uses `fork()` to create a child.
- Before the fork, allocate a page‑aligned buffer with `memalign(sysconf(_SC_PAGESIZE), PAGE_SIZE)` and fill it with a known pattern.
- After `fork()`, both parent and child attempt to write to different offsets within the buffer.
- Use `mlock()` to prevent swapping, then inspect the buffer contents in each process to verify that:
  - The original pattern is unchanged in the process that did **not** write to that offset.
  - Each process sees its own writes reflected.
- Optionally, use `/proc/self/pagemap` (requires root) to print the PPN before and after the write, demonstrating that a new physical page was allocated for the writing process
