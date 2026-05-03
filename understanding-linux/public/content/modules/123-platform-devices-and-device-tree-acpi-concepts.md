---
id: 123
title: "Platform devices and device tree / ACPI concepts"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When a kernel boots, it must know what hardware exists before any driver can run. On a PCI bus, this is solved automatically — the bus protocol lets the CPU query each slot and enumerate devices at runtime. But a vast class of hardware, particularly embedded SoC peripherals (UARTs, I2C controllers, GPIO banks, timers) and legacy PC devices, sits at fixed memory-mapped addresses with no self-identification mechanism. If the kernel has no external description of this hardware, it cannot find it, cannot assign resources to it, and no driver can bind to it.

Device Tree and ACPI are the two dominant solutions: structured, machine-readable descriptions of hardware topology, resources, and relationships that the kernel reads at boot time to construct a software model of the machine before the first driver probe runs.

---

## Core Concepts

### The Enumerable vs. Non-Enumerable Hardware Problem

PCI, PCIe, and USB define protocols where the host controller can query "who is there?" and each device responds with a vendor ID, device class, and resource requirements. The kernel's bus driver walks the bus, reads these responses, and builds a device list dynamically — no prior knowledge required.

Embedded peripherals have no such protocol. A UART controller baked into an ARM SoC sits at address `0xFF010000` because the chip designer hardwired it there in the address decoder logic. No bus transaction reveals this. Someone must tell the kernel — and that "someone" is either Device Tree or ACPI.

### Platform Devices

Linux models non-enumerable hardware as *platform devices* — a kernel abstraction defined in `include/linux/platform_device.h`. A platform device carries:

- A name string (used for driver matching)
- A list of `struct resource` entries: memory-mapped register ranges (`IORESOURCE_MEM`), IRQ lines (`IORESOURCE_IRQ`), DMA channels
- Optional driver-specific data via `platform_data`

The *platform bus* (`drivers/base/platform.c`) is a virtual bus with one job: host these declarations and match them against registered platform drivers. It has no physical counterpart; it exists solely so non-enumerable devices can participate in the driver model.

### Device Tree

Device Tree originated in OpenFirmware (used by Sun and Apple hardware). Linux adopted it for ARM after the "ARM mess" — by 2011, the ARM tree contained hundreds of board-specific `.c` files encoding hardware descriptions directly in kernel source. These files were untestable, duplicative, and required a kernel recompile per board variant. Linus Torvalds publicly called the situation embarrassing. The solution was to move hardware descriptions out of the kernel into a separate binary blob loaded by the bootloader.

A Device Tree describes:
- CPU topology and ISA
- Physical memory ranges
- Every peripheral: bus address, size, interrupt line, clock source, power domain, and parent-child relationships between nodes

It is compiled from human-readable `.dts` (Device Tree Source) files and `.dtsi` (Device Tree Source Include) files into a binary `.dtb` (Device Tree Blob) by the Device Tree Compiler (`dtc`). The bootloader loads the DTB into RAM and passes its physical address to the kernel in a register before jumping to the kernel entry point.

**Device Tree is pure data.** The kernel interprets it; the firmware contributes no executable logic.

### ACPI

Advanced Configuration and Power Interface serves the same enumeration purpose on x86/x86-64 systems and increasingly on ARM servers (via ACPI for ARM, standardized through SBBR). ACPI defines:

- **Tables** stored in firmware flash, mapped into the physical address space by the firmware, and located by the kernel via the RSDP pointer: `DSDT` (Differentiated System Description Table), `SSDT` (Secondary), `MADT` (interrupt routing), `SRAT` (NUMA topology), `MCFG` (PCIe config space mapping), and others.
- **AML (ACPI Machine Language)**: a bytecode language interpreted by ACPICA, an in-kernel VM (`drivers/acpi/acpica/`). AML allows firmware to express hardware-control logic — powering on a device, toggling a GPIO, reading a thermal sensor — that runs inside the kernel's address space.

This is the critical distinction: **Device Tree is data the kernel acts on; ACPI contains code the kernel executes.** This gives firmware vendors flexibility but also means firmware bugs can cause kernel crashes and security issues. The tradeoff is real and intentional.

### Address Spaces and Resource Mapping

Peripheral registers live in the physical address space. On x86, two address spaces exist:

- **Memory-mapped I/O (MMIO)**: registers appear at physical addresses in the main address space, accessed with normal load/store instructions.
- **Port I/O (PIO)**: a separate 16-bit address space accessed via `IN`/`OUT` instructions. The 8259 PIC, for example, lives at port `0x20`.

ARM has no port I/O space — everything is memory-mapped. This is why ARM code never uses `inb()`/`outb()`.

Both Device Tree and ACPI must express which address space a resource inhabits. The kernel must then call `ioremap()` to map physical MMIO addresses into kernel virtual address space before a driver can dereference them. Without `ioremap()`, accessing a physical peripheral address from kernel code is undefined behavior — the MMU has no mapping for it.

The virtual address a driver receives from `ioremap()` is unrelated to the physical address:

$$v_{\text{mapped}} = \texttt{ioremap}(p_{\text{phys}},\ \text{size})$$

The driver must use `readl()`/`writel()` (or `ioread32()`/`iowrite32()`) on the returned virtual address, never raw pointer dereferences, to respect memory barriers and architecture-specific I/O semantics.

---

## How It Works

### Device Tree Source: Structure and Syntax

A `.dts` file uses a C-like syntax to express a tree of *nodes*, each representing a hardware component. Nodes have *properties* (key-value pairs) and *child nodes*. Property values are arrays of 32-bit big-endian cells (`<...>`), byte strings (`[hex]`), or quoted strings.

```dts
/ {
    compatible = "vendor,my-board";
    #address-cells = <1>;
    #size-cells = <1>;

    memory@80000000 {
        device_type = "memory";
        reg = <0x80000000 0x40000000>;  /* 1 GiB at 0x80000000 */
    };

    apb_clk: clock@0 {
        compatible = "fixed-clock";
        #clock-cells = <0>;
        clock-frequency = <24000000>;   /* 24 MHz */
    };

    uart0: serial@ff010000 {
        compatible = "ns16550a";
        reg = <0xff010000 0x1000>;      /* register base and size */
        interrupts = <0 23 4>;          /* GIC SPI 23, level-high (type 4) */
        clocks = <&apb_clk>;
        clock-names = "baudclk";
        status = "okay";
    };

    uart1: serial@ff011000 {
        compatible = "ns16550a";
        reg = <0xff011000 0x1000>;
        interrupts = <0 24 4>;
        clocks = <&apb_clk>;
        status = "disabled";            /* kernel will not instantiate this */
    };
};
```

The `reg` property encodes `(address, size)` pairs. How many 32-bit cells encode each component is controlled by `#address-cells` and `#size-cells` in the *parent* node — not the node itself. This is why you must read the parent to interpret a child's `reg`. When the address space requires 64-bit values, two cells encode each component:

```dts
/* Parent has: #address-cells = <2>; #size-cells = <2>; */
some-device@100000000 {
    reg = <0x00000001 0x00000000  0x00000000 0x00001000>;
};
```

The physical address and size are reconstructed as:

$$\text{addr} = (\texttt{cell}_0 \ll 32) \mid \texttt{cell}_1 = 0x100000000$$

$$\text{size} = (\texttt{cell}_2 \ll 32) \mid \texttt{cell}_3 = 0x1000$$

The `compatible` property is a priority-ordered list of strings. The kernel tries each in order, binding the first driver that matches. This lets a driver support an exact chip (`vendor,uart-v2`) while falling back to a generic one (`ns16550a`) — the specificity ordering is intentional:

```dts
compatible = "vendor,my-uart-v2", "ns16550a";
```

### Compiling, Decompiling, and Inspecting a DTB

```bash
# Install dtc (Debian/Ubuntu)
apt install device-tree-compiler

# Compile DTS to DTB (-@ preserves symbols for overlay support)
dtc -I dts -O dtb -@ -o my-board.dtb my-board.dts

# Decompile a DTB back to readable DTS (useful for reverse-engineering firmware blobs)
dtc -I dtb -O dts -o decoded.dts /boot/dtbs/$(uname -r)/broadcom/bcm2711-rpi-4-b.dtb

# Inspect the live device tree on a running DT-based system
ls /sys/firmware/devicetree/base/
# Each node is a directory; each property is a file
cat /sys/firmware/devicetree/base/compatible
xxd /sys/firmware/devicetree/base/memory@80000000/reg

# Find all nodes with a given compatible string in the live tree
grep -r "ns16550a" /sys/firmware/devicetree/base/ 2>/dev/null

# On a running system, see which platform devices were instantiated from DT
ls /sys/bus/platform/devices/

# Check if a specific device was matched to a driver
cat /sys/bus/platform/devices/ff010000.serial/uevent
```

The path `/sys/firmware/device
