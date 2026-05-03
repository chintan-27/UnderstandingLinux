---
id: 136
title: "Interrupt-driven and DMA-capable drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Module 136: Interrupt-driven and DMA-capable Drivers — Memory Mapping, Coherency, and Completion Paths

## Why This Matters

When a device transfers data directly to RAM, it bypasses the CPU's cache hierarchy entirely. The CPU may read a cache line it dirtied two nanoseconds ago while the device has already overwritten the underlying physical RAM — or the device may read physical RAM that still contains garbage because the CPU never flushed its write-back cache. Either scenario produces silent data corruption: no fault, no warning, just wrong bytes. The corruption is timing-dependent, worsens under load (more cache pressure means more reuse of the dirty lines), and vanishes under `printk` debugging because the added latency forces flushes to happen incidentally.

Getting DMA right requires solving three independent problems simultaneously: handing the device an address it can actually reach on the bus, guaranteeing that the CPU and device agree on memory contents at every transfer boundary, and signaling transfer completion without races. This module covers all three.

---

## Core Concepts

### The Three Kinds of Kernel Addresses

Linux works with three address spaces, and the distinctions are not academic — using the wrong one as a DMA address is a silent correctness bug, not a compile error.

**Physical addresses** are what appears on the memory bus address lines. DMA controllers work exclusively with physical addresses; they sit on the bus and issue read/write cycles directly against physical RAM.

**Logical addresses** are kernel virtual addresses with a *fixed, architecture-defined linear offset* from physical addresses. Memory from `kmalloc` and `__get_free_pages` lives in this range. The conversion is exact:

$$\text{phys} = \text{logical} - \texttt{PAGE\_OFFSET}$$

On 32-bit x86, `PAGE_OFFSET` is `0xC0000000`, so logical address `0xC0001000` maps to physical address `0x1000`. The `__pa()` macro encodes this. Logical addresses exist because of this fixed offset — the kernel can convert them cheaply without a page table walk.

**Kernel virtual addresses** is the superset. It includes logical addresses but also `vmalloc` mappings, `kmap` mappings of high-memory pages, and `ioremap` regions. These have *no guaranteed relationship to physical addresses* — `vmalloc` deliberately scatters physically discontiguous pages into a contiguous virtual range. Calling `__pa()` on a `vmalloc` pointer returns nonsense and will corrupt memory or crash when handed to a device.

The safe rule: never derive a DMA address by arithmetic on a kernel virtual pointer. Use the DMA API exclusively — it knows which kind of address it received.

### Low Memory vs. High Memory

On a 32-bit system, the kernel splits the 32-bit virtual address space. The canonical x86 split reserves 1 GB for the kernel (`0xC0000000`–`0xFFFFFFFF`) and 3 GB for userspace. That 1 GB of kernel virtual space can maintain permanent logical mappings for at most 1 GB of physical RAM — this is the **low memory** zone.

Physical RAM above that boundary — which the CPU can address with PAE extensions, but for which no permanent logical address exists — is **high memory**. Its pages can be temporarily mapped via `kmap()`, but they carry no stable logical address.

The boundary is a kernel configuration parameter (`VMSPLIT` on x86), not a CPU limit. The consequence for DMA: many legacy and embedded DMA controllers have 32-bit address buses and cannot address physical RAM above $2^{32}$ bytes, and on systems where the low-memory ceiling is below 4 GB, even addresses below $2^{32}$ may have no logical address. This is exactly why `GFP_DMA` and `GFP_DMA32` exist as allocation flags — they constrain the allocator to the zones the device's address bus can reach.

On 64-bit kernels the problem largely disappears because `PAGE_OFFSET` is `0xFFFF888000000000` (x86-64 direct map) and the direct map covers all installed RAM, so every physical page has a logical address. But IOMMU remapping can still alter the bus address the device sees (see below).

### Cache Coherency

Write-back caches mean the CPU can hold modified data in L1/L2/L3 indefinitely before writing it to DRAM. DMA transactions read and write DRAM directly. The CPU and device are coherent only if one of the following is true:

1. **Hardware coherency snooping**: The CPU's cache controller observes DMA bus transactions and invalidates or updates affected lines automatically. x86 does this — DMA writes snoop the cache. ARM Cortex-A without a CCI/CCN interconnect does not.
2. **Software-managed coherency**: The driver explicitly flushes (writeback + invalidate) before a device read, and invalidates before a CPU read of device-written data. The Linux DMA API does this for you when you call `dma_map_*` and `dma_unmap_*` with correct direction flags.

The two failure modes have different symptoms:

- **Stale CPU read (device wrote, CPU sees old data)**: Requires cache invalidation before CPU access. Missed if `DMA_FROM_DEVICE` unmap is omitted or premature CPU access occurs before `dma_unmap_single`.
- **Stale device read (CPU wrote, device sees old data)**: Requires cache flush before device access. Missed if `DMA_TO_DEVICE` map is skipped or the buffer is written after `dma_map_single`.

On x86 this is invisible because hardware snoops both cases. On ARM, both bugs are real and produce corrupted transfers under load.

### IOMMU and Bus Addresses

Modern systems include an **IOMMU** (Intel VT-d, AMD-Vi, ARM SMMU) between the PCIe bus and DRAM. The IOMMU maintains a separate page table mapping **bus addresses** (what the device programs into its DMA registers) to physical addresses. The `dma_addr_t` returned by the DMA API is this bus address — it may differ from the physical address by an arbitrary IOMMU mapping.

This matters in three ways:

1. **Security**: The IOMMU confines a device to only the pages the driver has explicitly mapped, preventing a compromised device from reading arbitrary RAM.
2. **Scatter-gather contiguity**: Physically discontiguous pages can be mapped to a contiguous bus address range, letting devices that require contiguous DMA buffers work with fragmented physical memory.
3. **Correctness**: You cannot substitute `virt_to_phys()` for `dma_map_single()` on IOMMU-enabled systems. The physical address is not the bus address.

### Bounce Buffers

When a device's DMA address mask is too small to reach the allocated buffer's physical address, the kernel's DMA layer interposes a **bounce buffer**: a second buffer within the device's addressable range. For `DMA_TO_DEVICE`, the kernel copies the original buffer into the bounce buffer before the transfer. For `DMA_FROM_DEVICE`, it copies from the bounce buffer back to the original after. This is entirely transparent to the driver but adds one full `memcpy` per transfer, which is catastrophic for high-throughput devices (a 10 Gbps NIC moving 1500-byte frames at ~833k packets/second would spend significant CPU time in bounce copies).

The correct fix is to set the device's DMA mask accurately and allocate from the right zone upfront. Bounce buffers are a fallback, not a design target.

### Completion Paths

When a DMA transfer finishes, the device asserts an IRQ line. The CPU's APIC (or GIC on ARM) routes this to a registered interrupt handler. That handler runs with interrupts disabled on the current CPU, in atomic context — it cannot call `schedule()`, cannot take a sleeping mutex, cannot allocate with `GFP_KERNEL`. Its job is minimal: acknowledge the interrupt, record what happened, wake any sleeping waiter.

`struct completion` is the standard primitive for this handoff. It wraps a wait queue and a counter, both protected by a spinlock. `complete()` increments the counter and wakes the queue — safe from IRQ context. `wait_for_completion()` sleeps the calling process until the counter becomes nonzero — safe only from process context.

---

## How It Works

### Setting the DMA Mask

Before allocating anything, declare what address range the device can target. This lets the allocator and bounce-buffer logic make correct decisions:

```c
#include <linux/dma-mapping.h>

/* Device can address 32-bit bus addresses */
if (dma_set_mask_and_coherent(dev, DMA_BIT_MASK(32))) {
    dev_err(dev, "No suitable DMA available\n");
    return -ENODEV;
}

/* For a 64-bit capable device */
if (dma_set_mask_and_coherent(dev, DMA_BIT_MASK(64))) {
    /* fall back to 32-bit */
    if (dma_set_mask_and_coherent(dev, DMA_BIT_MASK(32))) {
        dev_err(dev, "No suitable DMA available\n");
        return -ENODEV;
    }
}
```

`dma_set_mask_and_coherent` sets both the streaming and coherent DMA masks in one call. If you don't call this, the kernel defaults to a 32-bit mask — which silently enables bounce buffers on systems with RAM above 4 GB.

### Coherent DMA Allocation

Coherent (also called consistent) DMA memory is permanently mapped as uncached or write-combining. Every CPU store reaches DRAM immediately; every CPU load fetches from DRAM directly. Cache coherency is therefore guaranteed structurally, not by explicit software flushes:

```c
#include <linux/dma-mapping.h>

struct my_driver {
    void        *ring_cpu;    /* kernel virtual address */
    dma_addr_t   ring_dma;   /* bus address for device registers */
    size_t       ring_size;
};

int init_descriptor_ring(struct my_driver *drv, struct device *dev)
{
    drv->ring_size = 256 * sizeof(struct dma_descriptor);

    drv->ring_cpu = dma_alloc_coherent(dev, drv->ring_
