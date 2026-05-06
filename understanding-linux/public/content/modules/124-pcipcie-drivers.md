---
id: 124
title: "PCI/PCIe drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### PCI/PCIe Bus Fundamentals
PCI is a **shared parallel bus** with a multiplexed address/data phase (AD[31:0]) and a command/byte‑enable phase (C/BE[3:0]). Every transaction consists of an address phase followed by one or more data phases. PCIe replaces this with **point‑to‑point serial lanes**; each lane transmits serialized 8‑bit/10‑bit (Gen1/2) or 128‑bit/130‑bit (Gen3+) symbols at a raw rate of 2.5 GT/s, 5 GT/s, 8 GT/s, or 16 GT/s per lane. The shift to serial eliminates clock skew, allows higher aggregate bandwidth, and introduces **link training** and **lane reversal** to tolerate board‑level skew.

### Why a Configuration Space Exists
The bus lacks any plug‑and‑play mechanism for the CPU to discover what is attached. A **fixed‑size 256‑byte configuration space** per device (accessible via I/O ports 0xCF8/0xCFC or memory‑mapped ECAM) holds immutable identifiers (vendor, device) and programmable registers (BARs, interrupt line, command/status). By reading this space the OS can **enumerate** devices without firmware assistance, enabling hot‑plug and heterogeneous topologies.

### Key Registers and Their Meaning
| Offset | Width | Name | Purpose |
|--------|-------|------|---------|
| 0x00   | 16    | Vendor ID | Assigned by PCI‑SIG; identifies manufacturer |
| 0x02   | 16    | Device ID | Assigned by vendor; identifies the specific product |
| 0x08   | 8     | Revision ID | Silicon revision |
| 0x09   | 24    | Class Code | Base‑class, sub‑class, prog‑if (e.g., 0x020000 = Ethernet) |
| 0x0C   | 8     | Cache Line Size | Legacy; must be 0x00 or 0x08 for modern systems |
| 0x0D   | 8     | Latency Timer | Legacy PCI only |
| 0x0E   | 16    | Header Type | Bit 7 = multifunction device; bits 0‑6 = layout type |
| 0x10‑0x24 | 32×6 | BARs | Base Address Registers; map memory/I/O |
| 0x34   | 8     | Capabilities Pointer | Offset to first capability structure |
| 0x3C   | 8     | Interrupt Line | Legacy IRQ routed to PIC/APIC |
| 0x3D   | 8     | Interrupt Pin | Which legacy INTx# the device uses |
| 0x40+  | variable | Capabilities | PCI Power Management, MSI, MSI‑X, PCI Express, etc. |

### Base Address Register (BAR) Mechanics
A BAR is **write‑once‑read‑any**: writing all 1’s yields a mask that reveals the required size.  
Let **mask** = `~ (value_read_after_writing_0xFFFFFFFF)`.  
The **size** = `mask + 1`, and must be a power‑of‑two.  
The **base** is programmed by writing the desired address (aligned to size) back into the BAR.  
Example: a 64‑KB BAR returns mask `0xFFFF0000` → size `0x10000`.

### PCIe Link Bandwidth Formula
For a link with **L** lanes, raw data rate **R** (GT/s) and encoding efficiency **η**:
$$
\text{Bandwidth} = L \times R \times \eta \quad \text{[bits/s]}
$$
- Gen1: η = 8/10 = 0.8 → 2.5 GT/s × 0.8 = 2.0 Gb/s per lane  
- Gen2: η = 8/10 = 0.8 → 5.0 GT/s × 0.8 = 4.0 Gb/s per lane  
- Gen3: η = 128/130 ≈ 0.9846 → 8.0 GT/s × 0.9846 ≈ 7.88 Gb/s per lane  
- Gen4: η = 128/130 → 16.0 GT/s × 0.9846 ≈ 15.75 Gb/s per lane  

A x16 Gen3 link thus delivers ≈ 16 × 7.88 Gb/s ≈ 126 Gb/s ≈ 15.75 GB/s.

### Interrupt Routing Legacy vs. MSI/MSI‑X
- **Legacy INTx#**: Each device asserts one of four open‑drain lines; the APIC routes the line to an IRQ number via the **IRQ routing table** (written by BIOS). Sharing causes latency and makes isolation difficult.  
- **Message Signaled Interrupt (MSI)**: The device writes a DWORD to a reserved memory address; the write triggers an APIC interrupt. Eliminates sharing and reduces latency (single store vs. asserted line).  
- **MSI‑X**: Extends MSI with a table of up to 2048 entries, each capable of independent vectors and masking, enabling per‑function scaling.

## How It Works
### Enumeration – From Power‑On to Device Tree
1. **Host Controller Initialization** – The PCIe root complex performs link training (detect lane count, speed) and exposes its own config space at bus 0, device 0, function 0.  
2. **Bus Scan** – Kernel walks the device/function number space (bus 0‑255, device 0‑31, function 0‑7) reading the vendor ID at offset 0x0. A return of `0xFFFF` indicates no device.  
3. **Header Type Interpretation** – If header type & 0x7F = 0x00 (standard) or 0x01 (PCI‑to‑PCI bridge) or 0x02 (CardBus). For bridges, the **secondary bus number** (offset 0x18) and **subordinate bus number** (offset 0x1A) are read to recursively scan downstream buses.  
4. **Device Initialization** – For each discovered device:
   - Read command register (offset 0x4); clear *Interrupt Disable*, *SERR*, etc.  
   - Enable *Memory Space* and *I/O Space* bits if BARs will be used.  
   - Enable *Bus Master* bit (DMA) if the device will initiate transactions.  
   - Assign a **PCI device structure** (`struct pci_dev`) and link it into the global device list.  

This process is **O(B·D·F)** where B ≤ 256, D ≤ 32, F ≤ 8 – in practice a few hundred reads.

### Memory and I/O Mapping
CPU accesses to a BAR go through the MMU; the physical address must be **mapped into kernel virtual space** (`ioremap`/`pci_iomap`). The size derived from the BAR mask determines the length of the mapping.  
If the BAR flags bit 0 = 0 → **memory space**; if bit 0 = 1 → **I/O space** (legacy x86 I/O ports, accessed via `in/out` or `pci_iomap` with `IORESOURCE_IO`).  

### DMA Setup
To let a device read/write host memory:
1. Allocate a buffer with `dma_alloc_coherent` (for streaming) or `kmalloc` + `dma_map_single`.  
2. Obtain the **DMA address** (physical) returned by the allocator/mapper.  
3. Write that address into the device’s DMA registers (often via BAR).  
4. Ensure the device’s **bus master** bit is set; otherwise the transaction will be aborted.  
5. After device signals completion (interrupt or polling), unmap/free the buffer.

### Interrupt Flow (MSI‑X Example)
1. During probe, allocate MSI‑X vectors: `pci_alloc_irq_vectors(dev, n, n, PCI_IRQ_MSIX)`.  
2. For each vector `i`:
   - Retrieve address/data from the MSI‑X table via `pci_irq_vector(dev, i)`.  
   - Call `request_irq(vector, handler, 0, dev->name, dev)`.  
3. In the ISR (`handler`), read the device’s status register to determine cause, clear the interrupt (often by writing a 1 to a clear‑bit), and process the event (e.g., pull a packet from a ring buffer).  
4. On removal, `free_irq` for each vector, then `pci_free_irq_vectors`.

## Worked Examples
### Example 1: Enumerating Devices and Computing BAR Size
```c
/* probe function of a simple PCI driver */
static int example_probe(struct pci_dev *dev,
                         const struct pci_device_id *id)
{
    int ret;
    u32 mask, size;
    resource_size_t bar_start, bar_len;

    /* Enable the device (turns on memory/i/o bus mastering as needed) */
    ret = pci_enable_device(dev);
    if (ret)
        return ret;

    /* Read BAR0 (assumed to be a memory BAR) */
    bar_start = pci_resource_start(dev, 0);
    bar_len   = pci_resource_len(dev, 0);

    /* Verify size by writing all 1s and reading back (illustrative) */
    pci_write_config_dword(dev, PCI_BASE_ADDRESS_0, 0xFFFFFFFF);
    mask = pci_read_config_dword(dev, PCI_BASE_ADDRESS_0);
    size = (~mask) + 1;          /* power‑of‑two size */
    pr_info("dev %04x:%04x BAR0: base=%pa size=%#x (derived size=%#x)\n",
            dev->vendor, dev->device,
            &bar_start, bar_len, size);

    /* Restore original BAR0 value */
    pci_write_config_dword(dev, PCI_BASE_ADDRESS_0,
                           pci_resource_start(dev, 0));

    /* Enable bus mastering if we will do DMA */
    pci_set_master(dev);

    return 0;
}
```
**Explanation**  
- `pci_enable_device` wakes the function from D0unset, sets the command register, and allocates resources.  
- `pci_resource_start/len` retrieve the values already negotiated by the core (after BAR fixing).  
- The write‑read‑back loop demonstrates the **size discovery** algorithm; in production the core already performed it, but the math is shown for clarity.  
- `pci_set_master` sets bit 2 of the command register, allowing the device to issue memory transactions.

### Example 2: MSI‑X Interrupt Allocation and Handling
```c
static irqreturn_t example_msix_isr(int irq, void *dev_id)
{
    struct example_dev *ed = dev_id;
    u32 status;

    /* Read status from the device's memory-mapped registers */
    status = readl(ed->mmio_base + EXAMPLE_REG_STATUS);

    if (status & EXAMPLE_STATUS_PACKET_RX) {
        /* Acknowledge by writing 1 to clear */
        writel(status | EXAMPLE_STATUS_PACKET_RX,
               ed->mmio_base + EXAMPLE_REG_STATUS);
        /* Process packet (e.g., pull from rx ring) */
        example_rx_packet(ed);
    }
    return IRQ_HANDLED;
}

static int example_msix_setup(struct pci_dev *dev,
                              struct example_dev *ed)
{
    int vectors, i, ret;

    /* Request 4 MSI‑X vectors */
    vectors = pci_alloc_irq_vectors(dev, 4, 4, PCI_IRQ_MSIX);
    if (vectors < 0)
        return vectors;

    for (i = 0; i < vectors; ++i) {
        ret = request_irq(pci_irq_vector(dev, i),
                          example_msix_isr, 0,
                          "example-msix", ed);
        if (ret) {
            while (i--)
                free_irq(pci_irq_vector(dev, i), ed);
            pci_free_irq_vectors(dev);
            return ret;
        }
        /* Optional: set per‑vector affinity */
        irq_set_affinity_hint(pci_irq_vector(dev, i),
                              cpumask_of_node(numa_node_id()));
    }
    ed->msix_vectors = vectors;
    return 0;
}
```
**Why this works**  
- Each MSI‑X vector is an independent memory write; the APIC delivers it to a CPU without sharing.  
- `request_irq` binds the vector to our ISR; the device need only write the appropriate address/data pair (programmed via the MSI‑X table).  
- Affinity hints allow load‑balancing across cores, reducing interrupt latency.

### Example 3: DMA Transfer Using a Coherent Buffer
```c
static int example_dma_test(struct pci_dev *dev,
                            struct example_dev *ed)
{
    dma_addr_t dma_handle;
    void *cpu_addr;
    size_t len = 4096;
    int ret;

    /* Allocate a coherent buffer (device‑visible, CPU‑cached) */
    cpu_addr = dma_alloc_coherent(&dev->dev, len,
                                  &dma_handle, GFP_KERNEL);
    if (!cpu_addr)
        return -ENOMEM;

    /* Assume the device has a DMA address register at offset 0x10 */
    writel(lower_32_bits(dma_handle), ed->mmio_base + EXAMPLE_REG_DMA_ADDR_LO);
    writel(upper_32_bits(dma_handle), ed->mmio_base + EXAMPLE_REG_DMA_ADDR_HI);
    writel(len, ed->mmio_base + EXAMPLE_REG_DMA_LEN);

    /* Kick off the transfer */
    writel(EXAMPLE_CTRL_START, ed->mmio_base + EXAMPLE_REG_CONTROL);

    /* Poll for completion (real driver would wait on interrupt) */
    while (!(readl(ed->mmio_base + EXAMPLE_REG_STATUS) &
             EXAMPLE_STATUS_DMA_DONE))
        cpu_relax();

    /* Verify data */
    pr_info("DMA buffer first 16 bytes: %*ph\n", 16, cpu_addr);

    dma_free_coherent(&dev->dev, len, cpu_addr, dma_handle);
    return 0;
}
```
**Notes**  
- `dma_alloc_coherent` returns a kernel virtual address (`cpu_addr`) and the corresponding **DMA address** (`dma_handle`) that the device will use.  
- The buffer is **cache‑coherent** on architectures that require it (x86_64 is coherent, but the API is portable).  
- After transfer, `dma_free_coherent` releases both mappings.

## Common Mistakes
| Mistake | What’s Wrong | Why It Fails |
|---------|--------------|--------------|
| Forgetting `pci_enable_device` | Device left in D3cold, BARs disabled, bus mastering cleared. | Any MMIO read/write returns all‑ones; DMA transactions are silently dropped, causing device time‑outs. |
| Using `ioremap` on a BAR that is I/O space | `ioremap` expects a memory-mapped address; I/O BARs need `in/out` or `pci_iomap` with `IORESOURCE_IO`. | On x86 the I/O ports are not memory‑mapped; the driver will read garbage or trigger a protection fault. |
| Mis‑calculating BAR size by ignoring the mask’s leading zeros | Assuming size = `readl(bar)` instead of `~readl(bar)+1`. | Over‑ or under‑allocating leads to buffer overruns or missed register accesses, causing silent data corruption. |
| Sharing an INTx line without checking the IRQ routing table | Assuming the BIOS‑assigned IRQ is unique. | Multiple devices asserting the same line cause lost interrupts; the kernel may see spurious interrupts and storm the CPU. |
| Not masking MSI‑X vectors before freeing them | Leaving vectors active while tearing down the driver. | Pending MSI writes can fire after `free_irq`, invoking a handler that accesses freed memory → use‑after‑free crash. |
| Using `dma_map_single` on a stack buffer without `dma_sync_single_for_cpu` | Assuming the CPU sees the latest data after device writes. | On systems with non‑coherent DMA (e.g., some ARM), the CPU cache may retain stale values, leading to incorrect data processing. |
| Performing config‑space accesses with `outl/inl` while holding a spinlock that may sleep | Config accesses via ports 0xCF8/0xCFC may require a delay on some platforms. | Sleeping while holding a spinlock can deadlock the kernel on preempt‑rt or cause scheduling bugs. |
| Assuming all devices implement MSI‑X | Trying to allocate MSI‑X vectors on a legacy-only device. | `pci_alloc_irq_vectors` returns `-EINVAL`; if unchecked, the driver proceeds with no interrupts, leaving the device unusable. |

## Exercises
### Easy
1. **List all PCI devices** – Write a kernel module that iterates over `pci_dev` using `pci_for_each_dev` and prints vendor ID, device ID, class code, and the size of BAR0 (using `pci_resource_len`).  
2. **Toggle bus mastering** – Using `setpci` from userspace, enable the bus master bit on a chosen device (`setpci -s <bus:dev.func> COMMAND.w=0x0004`) and verify with `lspci -vv` that the “Bus master” flag is set.

### Medium
3. **BAR‑size verification** – In a driver, for each BAR, write `0xFFFFFFFF`, read back, compute the mask and size, then restore the original value. Print a warning if any BAR reports size = 0 (indicating a mis‑configured device).  
4. **Simple MMIO register toggle** – Map BAR0 of a UART‑like PCI device (e.g., a 16550 compatible), write to its transmitter holding register, and poll the line status register until the transmitter is ready. Send the character ‘A’ and verify it appears on a serial console.

### Hard
5. **MSI‑X multi‑vector driver** – Allocate 4 MSI‑X vectors, assign each to a different NAPI‑style polling loop that processes a distinct ring buffer (RX, TX, completion, error). Provide a sysfs attribute that shows the packet count per vector.  
6. **DMA stress test** – Allocate a 2 MiB coherent buffer
