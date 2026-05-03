---
id: 61
title: "Accelerators"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

Modern workloads — neural network training, video encoding, cryptography, physics simulation — require computation rates that a general-purpose CPU cannot deliver at acceptable power and cost. A CPU spends most of its die area on caches, branch predictors, and out-of-order machinery to make *one thread* fast. An accelerator like a GPU inverts this tradeoff: it sacrifices single-thread latency for massive parallelism, running thousands of arithmetic units on regular, predictable data.

The offload pipeline exists to solve three problems simultaneously: the bus becomes a bottleneck if data moves too slowly; correctness breaks if the CPU reads results before the GPU writes them; security breaks if userspace can issue DMA transfers into arbitrary physical memory. Understanding how the kernel handles each of these is the point of this module.

---

## Core Concepts

### The Fundamental Asymmetry: Latency vs. Throughput

A CPU minimizes *latency* — the time from issuing one instruction to getting its result — via deep pipelines, out-of-order execution, and large caches. A GPU maximizes *throughput* by having thousands of hardware threads: when one warp stalls on a memory fetch, the scheduler issues another warp with ready operands. The GPU never eliminates memory latency; it hides it behind other work.

This hiding mechanism only works when:
1. The problem has enough parallelism to keep thousands of threads in flight simultaneously.
2. Memory accesses are regular enough to *coalesce* — adjacent threads reading adjacent addresses — so the memory controller can serve them in a single wide transaction instead of separate requests.
3. The cost of *moving data* across the interconnect is small relative to compute time. A 4 GB tensor at PCIe 4.0 x16 speeds takes $\frac{4 \times 10^9}{32 \times 10^9} = 125\ \text{ms}$ to transfer. If the compute takes 10 ms, the kernel is dominated by transfer and the GPU offers no benefit.

### The Offload Model

The CPU is the *host*; the accelerator is the *device*. The host cannot execute device code directly — it submits *command buffers* to a queue that the device's command processor reads independently. This decoupling is intentional: the GPU's command processor runs at its own clock, on its own microcontroller, with no obligation to synchronize with the CPU between commands.

The host then either:
- **Waits synchronously** by spinning or sleeping on a fence value (wastes CPU cycles but is simple to reason about), or
- **Continues asynchronously** and synchronizes later via a fence, event, or interrupt (requires careful ordering).

Choosing the wrong synchronization strategy is the most common source of correctness bugs in GPU code.

### DMA: Transferring Data Without the CPU

Direct Memory Access (DMA) lets a device read from or write to main memory without routing bytes through the CPU's registers. The CPU programs a DMA transfer by writing to memory-mapped device registers:

```c
/* Simplified DMA programming sequence */
writel(src_phys_addr,  dev->mmio + DMA_SRC_ADDR);
writel(dst_phys_addr,  dev->mmio + DMA_DST_ADDR);
writel(byte_count,     dev->mmio + DMA_LENGTH);
writel(DMA_DIR_TO_DEV, dev->mmio + DMA_CONTROL);
writel(DMA_START,      dev->mmio + DMA_CONTROL);
/* CPU is now free; device raises IRQ when done */
```

Without DMA, each transferred byte requires a CPU `load` followed by a CPU `store`. At a 16-byte cache line, that is $\frac{4 \times 10^9}{16} = 2.5 \times 10^8$ load/store pairs per 4 GB tensor — the CPU becomes the bottleneck, not the memory bus.

**Why physical addresses?** The DMA controller is a hardware state machine with no OS context; it cannot resolve virtual addresses. It operates on *physical* bus addresses. This forces the OS to *pin* target pages — lock them in physical memory — before programming the controller. If a page were swapped out mid-transfer, the device would corrupt whatever process happened to land at that physical address.

In Linux, `get_user_pages_fast()` pins userspace pages, and `dma_map_page()` / `dma_map_sg()` obtain the bus address the device actually uses. These are not the same as physical addresses on systems with an IOMMU.

### IOMMU: Protection for DMA

A DMA-capable device is a *bus master* — without restriction, it can read or write any physical address, bypassing all MMU-enforced process isolation. A compromised PCIe device could exfiltrate `/etc/shadow` directly from RAM. The IOMMU sits between the PCIe bus and the memory controller and enforces a page-table mapping for *I/O Virtual Addresses* (IOVAs). The device sees sanitized IOVAs; the IOMMU translates them to physical addresses and raises a fault on unmapped accesses.

This is precisely the MMU/process isolation model, applied to devices instead of processes.

On x86, the Intel VT-d or AMD-Vi IOMMU is controlled via ACPI DMAR tables. Linux exposes this through the `iommu` subsystem; you can inspect it:

```bash
# Show IOMMU groups — devices in the same group share an address space
ls /sys/kernel/iommu_groups/

# Show which IOMMU driver is active
dmesg | grep -i iommu | head -20

# See IOMMU mappings for a specific device (requires root)
cat /sys/bus/pci/devices/0000:01:00.0/iommu_group/type
```

For GPU passthrough to a VM, every device in an IOMMU group must be passed through together — devices in the same group can DMA into each other's address space, so isolating one while leaving another exposed to the host defeats the protection.

---

## How It Works

### The GPU Execution Pipeline

Consider computing a matrix multiplication on a GPU:

1. **Allocate device memory** — the driver calls into the kernel's DRM subsystem (`drivers/gpu/drm/`), which requests a VRAM region from the GPU's memory manager (GEM — Graphics Execution Manager) and returns an opaque handle.
2. **Pin and map host buffer** — the kernel pins the source pages with `dma_map_sg()`, obtaining IOVAs the GPU's DMA engine can use.
3. **DMA host → device** — the GPU's copy engine transfers the tensor from pinned host RAM into VRAM. The PCIe controller packetizes this into TLPs (Transaction Layer Packets).
4. **Submit a kernel dispatch** — the CPU writes a command into the GPU's *ring buffer* describing the shader program address, grid dimensions, and operand addresses. The GPU's command processor polls this ring.
5. **GPU dispatches warps** — the command processor schedules warps onto shader multiprocessors; each warp executes the same instruction on 32 (NVIDIA) or 64 (AMD) threads in lockstep.
6. **DMA device → host** — results move back via another DMA transfer.
7. **Signal completion** — the GPU writes a *fence value* to a pre-agreed memory location and optionally raises an MSI-X interrupt.

The ring buffer is a lockless single-producer (CPU) / single-consumer (GPU command processor) structure. Its occupancy is:

$$\text{available} = (\mathtt{write\_ptr} - \mathtt{read\_ptr}) \bmod N$$

The CPU advances `write_ptr` after enqueuing; the GPU advances `read_ptr` after consuming. The buffer is full when:

$$(\mathtt{write\_ptr} + 1) \bmod N = \mathtt{read\_ptr}$$

At that point the CPU must stall — this is the backpressure mechanism that prevents the CPU from overrunning the GPU's command queue.

### DMA Scatter-Gather

A userspace buffer rarely occupies contiguous physical pages — the kernel's page allocator works in 4 KB units and places them wherever free. The OS describes a logically contiguous buffer in discontiguous physical memory using a *scatter-gather list*:

```c
/* From include/linux/dma-mapping.h conceptually;
   actual sg_table wraps an array of these */
struct scatterlist {
    unsigned long page_link;  /* encodes struct page * and flags */
    unsigned int  offset;     /* offset within the page */
    unsigned int  length;     /* bytes in this segment */
    dma_addr_t    dma_address;/* bus address after dma_map_sg() */
    unsigned int  dma_length;
};
```

The DMA controller walks this list, fetching each physically discontiguous chunk and presenting a contiguous byte stream to the device. This matters because without scatter-gather, every DMA transfer would require a physically contiguous allocation — `alloc_pages(GFP_KERNEL, order)` with high order fails frequently on a fragmented system.

Linux maps scatter-gather lists for a device with:

```c
int nents = dma_map_sg(dev, sgl, nents, DMA_TO_DEVICE);
/* nents may be smaller than input — IOMMU can merge adjacent entries */
```

The IOMMU can merge adjacent scatter-gather entries that map to physically adjacent pages, reducing the number of IOMMU TLB entries consumed — this is why `dma_map_sg()` may return fewer entries than it received.

### PCIe Bandwidth and the Roofline Model

PCIe 4.0 x16 delivers approximately $32\ \text{GB/s}$ in each direction (the raw link rate is $64\ \text{GT/s}$; 128b/130b encoding gives $\approx 98.5\%$ efficiency, then subtract protocol overhead). A computation only benefits from GPU offload when arithmetic intensity is high enough that compute time dominates transfer time.

Define *arithmetic intensity*:

$$I = \frac{\text{FLOPs}}{\text{bytes transferred to/from device}}$$

The *roofline model* bounds attainable performance:

$$\text{Perf} = \min\!\left(P_{\text{peak}},\ I \times B_{\text{bw}}\right)$$

where $P_{\text{
