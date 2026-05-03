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

## Why This Matters

PCI solves a specific, concrete problem: before it, drivers had to know at compile time where their device's registers lived. IRQ lines were assigned by physical jumpers. Adding two cards that both wanted IRQ 5 meant one of them didn't work. PCI replaces this with a **configuration space** — a standardized register file that firmware fills in at power-on — so the OS can discover what hardware exists, how much address space it needs, and which interrupt it will use, entirely at runtime. Every abstraction in the Linux PCI stack (`pci_dev`, `pci_request_regions`, MSI, DMA mapping) exists to manage one of these three resources: address space, interrupts, and DMA reachability.

---

## Core Concepts

### Geographic Addressing and the BDF Tuple

Every PCI function is addressed by a **domain:bus:device.function** (DBDF) tuple. Bits matter:

- **Bus**: 8 bits → 256 buses per domain
- **Device**: 5 bits → 32 slots per bus
- **Function**: 3 bits → 8 functions per physical device

$$\text{max functions per domain} = 2^8 \times 2^5 \times 2^3 = 65{,}536$$

This is *geographic* addressing — it encodes topology, not identity. Two identical NICs in different slots have the same Vendor/Device IDs but different BDF tuples. The kernel binds drivers by identity (Vendor ID + Device ID from configuration space) but routes configuration-space accesses by geography (BDF). A multi-function device — say, a card with an Ethernet controller and a management engine — uses function numbers 0 and 1 at the same bus:device, so both share one physical PCIe slot but appear as independent `pci_dev` structures to the kernel.

### Configuration Space

Each PCI function exposes a **256-byte** (PCI) or **4096-byte** (PCIe) configuration space. It is not memory-mapped into the normal address space on x86 — it is accessed through the legacy `CF8h/CFCh` port pair (CONFIG_ADDRESS / CONFIG_DATA) on PCI, or through MMIO via the **ECAM** (Enhanced Configuration Access Mechanism) region that PCIe firmware advertises in ACPI. The kernel abstracts both with `pci_read_config_{byte,word,dword}()`.

The first 64 bytes are a standardized header (Type 0 for endpoints):

```
Offset  Size  Field
0x00    2     Vendor ID         — 0xFFFF means no device present
0x02    2     Device ID
0x04    2     Command           — enables Bus Master, Memory/IO Space
0x06    2     Status            — capabilities pointer valid, error bits
0x08    1     Revision ID
0x09    3     Class code        — [class, subclass, prog-if]
0x0C    1     Cache line size
0x0E    1     Header type       — bit 7: multi-function
0x10    4     BAR0
0x14    4     BAR1
0x18    4     BAR2
0x1C    4     BAR3
0x20    4     BAR4
0x24    4     BAR5
0x2C    2     Subsystem Vendor ID
0x2E    2     Subsystem ID
0x34    1     Capabilities pointer — offset into config space, linked list
0x3C    1     Interrupt line    — BIOS-assigned IRQ (legacy, unreliable)
0x3D    1     Interrupt pin     — INTA#=1, INTB#=2, INTC#=3, INTD#=4
```

The **Command register** (offset `0x04`) is critical: bit 1 (Memory Space Enable) allows the device's BARs to respond to MMIO accesses; bit 2 (Bus Master Enable) allows the device to initiate DMA. Both are 0 at reset. `pci_enable_device()` sets Memory Space Enable; `pci_set_master()` sets Bus Master Enable. Forgetting `pci_set_master()` is a common reason DMA silently does nothing.

The **Capabilities pointer** (offset `0x34`) is the head of a linked list of optional capability structures in configuration space (offsets 0x40–0xFF for PCI, up to 0xFFF for PCIe). MSI, MSI-X, PCIe link parameters, and power management all live here.

### Base Address Registers (BARs)

A BAR is the device's way of declaring a resource requirement. The firmware (or the kernel, via `pci_assign_resource()`) satisfies it by allocating a physical address range and writing it back. The device then decodes that range and responds to accesses within it.

**The sizing protocol** exploits the fact that the low bits of a BAR are hardwired:

1. Save the current BAR value.
2. Write `0xFFFFFFFF`.
3. Read back the value.
4. The device returns 0s in the bits it uses for the base address (since it decodes those) and 1s everywhere else.
5. Mask off the type bits (low 4 bits for memory BARs), invert, and add 1:

$$\text{size} = \sim(\text{readback} \;\&\; \texttt{0xFFFFFFF0}) + 1$$

A readback of `0xFFFF0000` means the device ignores the low 16 bits:

$$\text{size} = \sim\texttt{0xFFFF0000} + 1 = \texttt{0x0000FFFF} + 1 = 65{,}536 = 64\text{ KiB}$$

The size is always a power of two, and the assigned base address must be naturally aligned to that size (otherwise the device's address decode logic — which is just masking — would select the wrong range).

BAR bit 0 encodes type:
- **Bit 0 = 0**: Memory BAR. Bits 2:1 encode width: `00` = 32-bit, `10` = 64-bit (consumes two consecutive BARs). Bit 3: prefetchable (reads have no side effects, so the CPU can speculatively fetch).
- **Bit 0 = 1**: I/O port BAR. Avoid in new drivers — I/O port access is slow (serializes the CPU pipeline) and PCIe devices increasingly don't implement it.

A 64-bit BAR occupies two 32-bit slots (e.g., BAR0+BAR1). The high 32 bits of the physical address live in BAR1. This is why a device can have fewer than 6 usable BARs even though 6 register slots exist.

### PCI Interrupts: Legacy vs. MSI vs. MSI-X

**Legacy INTx**: Four physical wires (INTA#–INTD#) are shared among all devices on a bus. They are level-triggered and active-low: the device pulls the line low to assert an interrupt and releases it only when the driver acknowledges the condition in the device's own registers. Because the line is shared, every device sharing it sees its interrupt handler called when any one asserts — the handler must check whether its device is actually the source. This wastes CPU time and breaks cleanly with shared IRQs under high load.

**MSI (Message Signaled Interrupts)**: Instead of a wire, the device *writes* a specific 32-bit data value to a specific memory address. That address is the LAPIC (Local APIC) memory-mapped register that triggers an interrupt on a specific CPU with a specific vector. Firmware writes the target address and data into the device's MSI capability structure in configuration space:

```
MSI Capability (example offsets, relative to capability pointer):
  +0x00  2   Capability ID (0x05)
  +0x02  2   Message Control — enables MSI, encodes vector count
  +0x04  4   Message Address (low)  — LAPIC address, usually 0xFEExxxxx
  +0x08  4   Message Address (high) — for 64-bit MSI
  +0x0C  2   Message Data           — vector + delivery mode
```

No shared lines, no routing ambiguity. The interrupt is edge-triggered, so no "who asserted this?" problem.

**MSI-X**: Up to 2048 independent vectors, each with its own address+data pair stored in a per-device **MSI-X table** that lives in a BAR (not in configuration space). A separate **MSI-X PBA** (Pending Bit Array), also in BAR space, tracks which vectors have pending interrupts. MSI-X is the foundation of multi-queue I/O: an NVMe SSD with 32 queues can assign one MSI-X vector per queue and pin each vector to a different CPU, keeping interrupt processing local to the core that submitted the I/O.

The kernel preference order when a driver calls `pci_alloc_irq_vectors()`:

$$\text{MSI-X} \succ \text{MSI} \succ \text{legacy INTx}$$

### DMA and Address Spaces

DMA lets the device access host RAM directly — the CPU is not in the path. The device uses the memory bus with **physical addresses**, which on x86 without an IOMMU are the same as bus addresses. On systems with an **IOMMU** (Intel VT-d, AMD-Vi), the IOMMU interposes between the device and the memory bus and translates device-visible **I/O Virtual Addresses (IOVA)** to physical addresses. This means:

| Address type | Who uses it | How to get it |
|---|---|---|
| Kernel virtual | CPU, kernel code | `kmalloc()`, `vmalloc()` |
| Physical | Memory controller | `virt_to_phys()` / `__pa()` |
| DMA (bus/IOVA) | The device | `dma_map_single()` |

On IOMMU-enabled systems, DMA address ≠ physical address. Passing a physical address directly to a device on such a system produces silent memory corruption or a fault. Always use `dma_map_single()` / `dma_map_sg()` — they return a
