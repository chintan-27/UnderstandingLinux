---
id: 115
title: "Kernel memory allocation APIs"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

User-space programs call `malloc()` and forget about it — the kernel handles the complexity. But *kernel code is that complexity*. When a driver needs a DMA buffer, when a filesystem allocates an inode, when a network stack builds a packet — each happens in a different execution context with different constraints. Code running in an interrupt handler cannot sleep; code allocating DMA buffers needs physically contiguous memory below a hardware-visible address boundary. Using the wrong allocator, or the wrong flags, doesn't produce a compile error — it produces a deadlock, a machine check, or silent memory corruption.

---

## Core Concepts

### Physical vs. Virtual Contiguity

The CPU accesses memory through the MMU, which translates virtual addresses to physical addresses via page tables. *Virtual contiguity* means addresses are sequential in the kernel's virtual address space — the underlying physical frames can be scattered anywhere in RAM. *Physical contiguity* means the physical frames are also sequential.

Most kernel code doesn't care about physical layout — the MMU hides it. But hardware devices performing DMA bypass the MMU entirely and address RAM directly using physical (or bus) addresses. A network card issuing a DMA transfer cannot follow a page table. It needs a physically contiguous buffer, or it needs a hardware IOMMU to perform the scatter-gather mapping on its behalf. When no IOMMU is present, the allocator must provide physical contiguity — which is why `kmalloc()` and `vmalloc()` are not interchangeable.

### kmalloc: Physically Contiguous Allocation

`kmalloc()` guarantees both physical and virtual contiguity. It is backed by the *slab allocator* (or SLUB, the default since 2.6.23), which maintains per-CPU caches of fixed-size objects: 8, 16, 32, 64, 128 bytes, continuing up to `KMALLOC_MAX_CACHE_SIZE` (typically 8 KiB; larger requests fall through to the page allocator up to `KMALLOC_MAX_SIZE`). Requests are rounded up to the nearest cache size — you receive at least what you asked for.

Because `kmalloc()` returns physically contiguous memory, the result can be handed to a DMA-capable device after translating the kernel virtual address to a bus address via `dma_map_single()`.

### vmalloc: Virtually Contiguous Allocation

`vmalloc()` allocates memory that is contiguous only in virtual address space. It calls the page allocator (`alloc_page()`) repeatedly for individual pages — which may be physically scattered — then maps them into a contiguous range of the *vmalloc area* (`VMALLOC_START` to `VMALLOC_END`) by inserting PTEs into the kernel page tables.

This makes `vmalloc()` suitable for large allocations where physical contiguity is unnecessary — loading a kernel module (`kernel/module/main.c` uses `vmalloc()` for module text and data), or allocating large firmware buffers. It is wrong for DMA. Each `vmalloc()` call modifies kernel page tables and, on multi-core systems, must TLB-flush other CPUs via IPI — overhead `kmalloc()` never pays.

### GFP Flags: Encoding Execution Context

Every allocation call takes a `gfp_t` flags argument. GFP stands for *Get Free Pages*, the low-level page allocator all higher-level allocators ultimately call. GFP flags encode two orthogonal concerns:

1. **Reclaim behavior** — is the allocator allowed to sleep, initiate I/O, call into a filesystem?
2. **Zone selection** — which physical address range should the pages come from?

*Type flags* (`GFP_KERNEL`, `GFP_ATOMIC`, etc.) are composites of lower-level *modifier flags* (`__GFP_RECLAIM`, `__GFP_IO`, `__GFP_FS`, `__GFP_HIGH`, etc.). Callers use type flags; the modifier flags are an implementation detail visible in `include/linux/gfp.h`.

The practical decision reduces to one question asked before every allocation:

> **Can this code path block right now?**
>
> - Yes → `GFP_KERNEL`
> - No  → `GFP_ATOMIC`

### Allocation Zones

The kernel partitions physical RAM into zones at boot time based on the memory map provided by firmware:

| Zone | Typical range (x86-64) | Purpose |
|---|---|---|
| `ZONE_DMA` | 0 – 16 MiB | Legacy ISA DMA; 24-bit address bus devices |
| `ZONE_DMA32` | 16 MiB – 4 GiB | 32-bit PCI DMA |
| `ZONE_NORMAL` | 4 GiB+ | Directly mapped kernel memory; general use |
| `ZONE_HIGHMEM` | above direct-map ceiling | 32-bit kernels only; not present on x86-64 |

The allocator tries the preferred zone first, falling back toward higher zones under memory pressure according to the zone fallback list in `mm/page_alloc.c`.

---

## How It Works

### The kmalloc and kfree Signatures

```c
#include <linux/slab.h>

void *kmalloc(size_t size, gfp_t flags);
void *kzalloc(size_t size, gfp_t flags);   /* kmalloc + memset zero */
void *krealloc(const void *p, size_t new_size, gfp_t flags);
void  kfree(const void *ptr);
```

A typical allocation in process context (a syscall handler or kernel thread):

```c
struct my_request *req = kmalloc(sizeof(*req), GFP_KERNEL);
if (!req)
    return -ENOMEM;

req->id = 42;
/* ... */
kfree(req);
```

`sizeof(*req)` rather than `sizeof(struct my_request)` is idiomatic: it stays correct if the type of `req` changes.

### GFP Flags in Detail

```c
/* Defined in include/linux/gfp.h */

GFP_KERNEL   /* Process context, may sleep, may do I/O and FS calls.
                Expands to: __GFP_RECLAIM | __GFP_IO | __GFP_FS       */

GFP_ATOMIC   /* Non-sleeping. For interrupt handlers, softirqs,
                tasklets, or code holding a spinlock.
                Draws from per-cpu emergency reserves.
                Expands to: __GFP_HIGH                                 */

GFP_NOIO     /* May sleep and reclaim pages, but must not initiate
                block I/O. Use in block layer code to avoid re-entrant
                I/O submission.
                Expands to: __GFP_RECLAIM                              */

GFP_NOFS     /* May sleep, may not call into a filesystem. Use inside
                filesystem code (e.g., in writeback paths) to prevent
                re-entrant VFS calls.
                Expands to: __GFP_RECLAIM | __GFP_IO                   */

GFP_NOWAIT   /* Like GFP_ATOMIC but without the emergency reserve;
                fail immediately if the fast path misses.              */

GFP_DMA      /* Zone modifier: allocate from ZONE_DMA (≤16 MiB).
                Compose with a type flag:
                kmalloc(64, GFP_ATOMIC | GFP_DMA);                    */

GFP_DMA32    /* Zone modifier: allocate from ZONE_DMA32 (≤4 GiB).
                Needed for 32-bit PCI devices on 64-bit kernels.       */
```

### Why GFP_ATOMIC Exists: The Reclaim Recursion Problem

Memory reclaim is not a simple subroutine. To free a page, the kernel may need to write it to a swap device — which requires submitting a bio, which requires allocating a `struct request`, which requires memory. If an interrupt handler triggers this chain while reclaim is already in progress, the kernel deadlocks on its own locks.

`GFP_ATOMIC` exits this recursion by never entering it: no reclaim, no I/O, no waiting. The allocator checks per-cpu caches and the free list. If no memory is immediately available it returns `NULL`. The caller is responsible for handling `NULL` gracefully — dropping the packet, returning `-ENOMEM`, etc. Silently ignoring a `NULL` return from `GFP_ATOMIC` is a latent bug that manifests as a null pointer dereference under memory pressure.

The emergency reserve backing `GFP_ATOMIC` is sized at boot; you can inspect it:

```bash
cat /proc/sys/vm/min_free_kbytes
```

This is the floor the page allocator maintains for atomic allocations system-wide.

### Size Rounding in the Slab/SLUB Allocator

SLUB caches sizes at powers of two (for `kmalloc` caches). A request of size $r$ is served by the smallest cache of size $c$ where $c \geq r$:

$$c = 2^{\lceil \log_2 r \rceil}$$

Internal fragmentation for a single allocation:

$$\text{waste} = c - r = 2^{\lceil \log_2 r \rceil} - r$$

In the worst case — requesting $2^{k} + 1$ bytes, receiving $2^{k+1}$ bytes — waste approaches $2^k - 1$, just under 50% of the allocated size. For a frequently allocated struct where this matters, `kmem_cache_create()` builds a dedicated slab cache sized exactly to the object, packing as many objects per page as possible and eliminating inter-object padding waste.

The number of objects per slab page of order $n$ for object size $s$ is:

$$\text{objects per slab} = \left\lfloor \frac{2^n \cdot \text{PAGE\_SIZE}}{s} \right\rfloor$$

Inspect active slab caches at runtime:

```bash
# Summary of all caches: name, active objs, obj
