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

## Core Concepts
### Platform Devices
A **platform device** is any hardware component that cannot be discovered through a standard bus enumeration mechanism (e.g., PCI, USB). Its existence, memory‑mapped registers, interrupt lines, and sometimes clock resources must be supplied by firmware. The kernel treats these devices as *platform* devices because they are tied to a specific system platform (SoC, board, or ACPI namespace) rather than a generic bus.

*Why?*  
Many SoC peripherals sit at fixed physical addresses and have no configuration registers that the CPU can probe. Without an external description the kernel would have to guess addresses—leading to collisions, missed devices, or incorrect driver binding. Providing a firmware‑based description decouples hardware discovery from the CPU instruction set and allows a single kernel binary to run on many board revisions.

### Device Tree
The **device tree (DT)** is a hierarchical data structure, most commonly delivered as a Flattened Device Tree Blob (FDT) from the bootloader. Each node represents a hardware block and contains properties such as:
- `compatible` – a list of strings used for driver matching
- `reg` – address/size pairs describing memory‑mapped regions
- `interrupts` – interrupt specifier(s)
- `status` – `"okay"` or `"disabled"` (controls whether the node is instantiated)

The DT is interpreted by the kernel’s **of_core** subsystem (`include/linux/of.h`). The tree enables the kernel to:
1. Allocate `struct device_node` objects for each node.
2. Create `struct platform_device` instances via `of_platform_populate`.
3. Match drivers using an `of_match_table` that compares the node’s `compatible` list against driver entries.

*Why a tree?*  
Hardware on a board often contains hierarchical relationships (e.g., a bus controller child nodes for peripherals). A tree naturally expresses parent‑child resource mapping (address translation, clock hierarchies, reset domains) without requiring a flat list.

### ACPI (Advanced Configuration and Power Interface)
**ACPI** supplies a set of firmware tables (mainly DSDT, SSDT, FADT, MADT) that describe:
- Static hardware resources (IO ports, memory ranges, IRQs)
- Power‑management objects (sleep states, processor performance levels)
- Runtime configuration methods (_CRS, _PRS, _SxD, etc.)

On x86 and some ARM platforms the kernel’s **acpi** subsystem (`drivers/acpi/`) parses these tables at early boot, creates `acpi_device` objects, and registers them with the ACPI bus. Drivers bind via an `acpi_driver` structure and the kernel evaluates AML (ACPI Machine Language) methods to obtain resources at runtime.

*Why ACPI?*  
On PCs the firmware cannot rely on a static device tree because hardware can be added/removed (e.g., hot‑plug PCIe). ACPI provides both a static description and a way to query/modify resources after the OS is running, supporting features like PCIe ASPM, thermal zones, and battery management.

### Hardware Description Mechanisms Compared
| Aspect                     | Device Tree                              | ACPI                                      |
|----------------------------|------------------------------------------|-------------------------------------------|
| Primary use case           | Embedded/SoC boards (static hardware)    | PCs, servers (dynamic & power‑managed)   |
| Format                     | Binary FDT (source: .dts)                | Binary AML tables (source: .asl)          |
| Extensibility              | Add new properties; compatible strings   | Define new AML objects (_HID, _CRS, …)    |
| Runtime modification       | Rare (usually read‑only)                 | Frequent via _OSI, _REG, _PSC methods    |
| Kernel subsystem           | `of_core` + `of_platform`                | `acpi_bus` + `acpi_device`                |
| Typical path in sysfs      | `/sys/firmware/devicetree/`              | `/sys/bus/acpi/devices/`                  |
| Typical driver match       | `of_match_table`                         | `acpi_device_id` table                    |

### Enumeration Models
- **Bus‑based enumeration** (PCI, USB): The device itself responds to configuration cycles, revealing vendor/device IDs, class codes, BARs, and interrupts. The kernel builds a device graph by probing the bus.
- **Device‑based enumeration** (platform devices): The firmware supplies a static description; the kernel does **not** probe the hardware for identity. Instead, it matches the description against driver `compatible`/`_HID` strings.

*Why the distinction?*  
Bus‑based devices can self‑identify, making plug‑and‑play possible. Many SoC peripherals lack such intelligence, so the OS must be told where they live and how to talk to them.

---

## How It Works
### Device Tree Flow (Step‑by‑step)
1. **Bootloader loads FDT** into RAM and passes its physical address to the kernel via architecture‑specific boot parameters (e.g., `r0` on ARM, `boot_params` on x86).
2. **Early kernel** (`early_init_dt_scan_memory`) extracts memory layout from the FDT’s `/memory` node.
3. **Unflattening** (`unflatten_device_tree`) converts the blob into a tree of `struct device_node` objects in `.init` memory.
4. **Node validation**: For each node, the kernel checks `status != "disabled"` and, if present, reads `#address-cells` and `#size-cells` to decode the `reg` property.
5. **Platform device creation**: `of_platform_populate` walks the tree; for each node with a `compatible` property it allocates a `struct platform_device`, fills its `dev.of_node`, and populates `resource` entries from `reg` and `interrupts`.
6. **Driver registration**: A platform driver defines an `of_match_table`. When the platform bus registers a device, it calls `of_match_device`; if a match is found, the driver’s `probe` is invoked.
7. **Resource mapping**: Inside `probe`, the driver typically calls:
   ```c
   res = platform_get_resource(dev, IORESOURCE_MEM, 0);
   base = devm_ioremap_resource(&dev->dev, res);
   irq  = platform_get_irq(dev, 0);
   ```
   If the node specifies multiple resources, the driver iterates with increasing indices.
8. **Deferral handling**: If a required dependency (e.g., a clock) is not yet ready, the driver returns `-EPROBE_DEFER`; the core will retry later after the dependency appears.

*Address calculation example*  
If a node has:
```
#address-cells = <2>;
#size-cells    = <1>;
reg = <0x0 0x10000000 0x0 0x1000>;
```
The kernel interprets each address as two 32‑bit cells (high, low). The physical base address is:
$$
\texttt{base} = (\texttt{addr\_high} \ll 32) | \texttt{addr\_low}
               = (0x0 \ll 32) | 0x10000000 = 0x10000000
$$
The size is taken from the size‑cell(s) following the address pair (`0x1000` bytes).

### ACPI Flow (Step‑by‑step)
1. **Early ACPI initialization** (`acpi_boot_init`) locates the RSDP via CPU firmware or ACPI 2.0+ tables, then maps the XSDT/FADT.
2. **Table parsing**: The kernel walks the DSDT and any SSDTs, executing the AML definition block to build a namespace of `ACPI_OBJECT`s (devices, methods, scopes).
3. **Device enumeration**: `acpi_bus_scan` treats each namespace object with a `_HID` (hardware ID) as an `acpi_device`. The device’s resources are extracted from its `_CRS` (current resource settings) using `acpi_get_override`.
4. **Resource decoding**: `_CRS` contains a byte stream of descriptors (e.g., `IO` for port ranges, `IRQ` for interrupts, `Memory32` for MMIO). The kernel converts these into `struct resource` entries.
5. **Driver binding**: An `acpi_driver` provides an `ids` table (`struct acpi_device_id`). When a device is registered, the core compares the device’s `_HID`/`_CID` list; on match, `probe` is called.
6. **Runtime methods**: Drivers may invoke `_REG` (region access) or `_PSC` (power state change) via `acpi_evaluate_object` to affect hardware after the device is bound.

*Interrupt extraction example*  
A `_CRS` package might contain:
```
IRQ (Level, ActiveLow, Shared) {0,0,0,0}   // IRQ 10, level‑triggered, active low, shared
```
The kernel decodes this to `irq = 10`, `trigger = IRQ_LEVEL`, `polarity = IRQ_LOW_ACTIVE`.

---

## Worked Examples
### Example 1: Device Tree Node for a 16550 UART
**Source (`uart.dts`):**
```dts
/* uart.dts */
#include <dt-bindings/interrupt-controller/irq.h>
/ {
    compatible = "simple-bus";
    #address-cells = <1>;
    #size-cells    = <1>;

    uart0: serial@10000000 {
        compatible = "ns16550a";
        reg = <0x10000000 0x1000>;   /* 4 KB MMIO region */
        interrupts = <0 10 4>;        /* IRQ 10, level‑high */
        status = "okay";
    };
};
```
*Compilation and inspection:*
```bash
$ dtc -I dts -O dtb -o uart.dtb uart.dts
$ hexdump -C uart.dtb | head -20   # shows FDT magic 0xd00dfeed
$ ls -l /sys/firmware/devicetree/base/soc/uart0
```
*Kernel side (simplified driver):*
```c
#include <linux/platform_device.h>
#include <linux/of.h>
#include <linux/serial_core.h>

static const struct of_device_id uart_of_match[] = {
    { .compatible = "ns16550a", },
    { /* sentinel */ }
};
MODULE_DEVICE_TABLE(of, uart_of_match);

static int uart_probe(struct platform_device *pdev)
{
    struct resource *res;
    void __iomem *membase;
    int irq, ret;

    res = platform_get_resource(pdev, IORESOURCE_MEM, 0);
    membase = devm_ioremap_resource(&pdev->dev, res);
    if (IS_ERR(membase))
        return PTR_ERR(res);

    irq = platform_get_irq(pdev, 0);
    if (irq < 0)
        return irq;

    /* Register with 8250 core */
    ret = devm_8250_register(&pdev->dev, &(struct uart_8250_port){
        .iobase = membase,
        .irq    = irq,
        .flags  = UPF_BOOT_AUTOCONF,
    });
    return ret;
}

static struct platform_driver uart_driver = {
    .probe  = uart_probe,
    .driver = {
        .name           = "my-uart",
        .of_match_table = uart_of_match,
        .suppress_bind_attrs = true,
    },
};
module_platform_driver(uart_driver);
```
*Why each step matters*:
- `#address-cells`/`#size-cells` tell the kernel how to decode `reg`. If we set them incorrectly, `platform_get_resource` would return a bogus address, causing `ioremap` to fail.
- The interrupt specifier uses three cells (`#interrupt-cells = <2>` is common for ARM GIC; here we used `<0 10 4>` where the first cell is flags, second is IRQ number, third is trigger type). Mis‑matching this leads to `platform_get_irq` returning `-EINVAL`.
- `status = "okay"` is required; otherwise the core skips the node and the driver never probes.

### Example 2: ACPI Table Describing an LPC Controller
**Excerpt from DSDT (ASCII):**
```asl
Scope (\_SB)
{
    Device (LPC)
    {
        Name (_HID, "INT0800")          // Legacy ISA bus
        Name (_UID, 0)
        Method (_CRS, 0, NotSerialized)
        {
            Return (ConcatenateResTemplate (
                // IO range 0x3F8‑0x3FF (8 bytes) for COM1
                IO (Decode16,
                    0x0000,             // Granularity
                    0x000003F8,         // Min
                    0x000003FF,         // Max
                    0x0000,             // Translation offset
                    0x0008),            // Length
                // IRQ 4, edge‑triggered, active high
                IRQ (Level, ActiveHigh, Shared, ) {4}
            ))
        }
    }
}
```
*How the kernel processes it*:
1. `acpi_bus_scan` finds the object with `_HID = "INT0800"` and creates an `acpi_device`.
2. During probe, the driver calls `acpi_get_override(adev, 0, &res)` for each resource index.
3. The AML `_CRS` is executed, returning a byte stream:
   - `IO` descriptor: base = `0x3F8`, length = `8` → `res->start = 0x3F8`, `res->end = 0x03FF`.
   - `IRQ` descriptor: encodes IRQ 4 → `res->start = 4`, `flags = IORESOURCE_IRQ`.
4. The driver typically does:
```c
static int lpc_probe(struct acpi_device *adev)
{
    struct resource res;
    int irq, ret;

    if (acpi_get_override(adev, 0, &res))
        return -ENODEV;
    /* res now holds the IO port range */

    if (acpi_get_override(adev, 1, &res))
        return -ENODEV;
    irq = res.start;   // 4

    /* Request the ports and IRQ */
    if (!devm_request_region(&adev->dev, res.start,
                             resource_size(&res), "lpc-io"))
        return -EBUSY;
    if (devm_request_irq(&adev->dev, irq, lpc_irq_handler,
                         0, "lpc", adev))
        return -EBUSY;

    return 0;
}
```
*Why each step matters*:
- The `_HID` must match the driver’s `acpi_device_id` table exactly (case‑sensitive). A typo like `"int0800"` yields no match.
- The `_CRS` method must return a valid descriptor list; missing a terminating `}` or using wrong `IO` bitwidth (`Decode16` vs `Decode32`) leads to malformed buffers and `acpi_get_override` returning `-EINVAL`.
- Power‑management methods like `_PSC` or `_STA` are optional but often needed for runtime suspend/resume; neglecting them can leave the device in an unintended state after a suspend cycle.

### Example 3: Binding a Driver to a Platform Device (Manual Instantiation)
Sometimes a board lacks a DT node (early bring‑up) but you still want to test a driver. You can instantiate a platform device manually:
```c
/* simple-platform.c */
#include <linux/platform_device.h>
#include <linux/module.h>

static struct resource simple_res[] = {
    [0] = {
        .start  = 0x20000000,
        .end    = 0x20000fff,
        .flags  = IORESOURCE_MEM,
    },
    [1] = {
        .start  = 32,
        .end    = 32,
        .flags  = IORESOURCE_IRQ,
    },
};

static struct platform_device simple_pdev = {
    .name   = "simple-dev",
    .id     = -1,
    .resource = simple_res,
    .num_resources = ARRAY_SIZE(simple_res),
};

static int __init simple_init(void)
{
    return platform_device_register(&simple_pdev);
}
static void __exit simple_exit(void)
{
    platform_device_unregister(&simple_pdev);
}
module_init(simple_init);
module_exit(simple_exit);
MODULE_LICENSE("GPL");
```
A matching driver:
```c
/* simple-drv.c */
#include <linux/platform_device.h>
#include <linux/module.h>

static int simple_probe(struct platform_device *pdev)
{
    struct resource *res;
    void __iomem *base;
    int irq;

    res = platform_get_resource(pdev, IORESOURCE_MEM, 0);
    base = devm_ioremap_resource(&pdev->dev, res);
    if (IS_ERR(base))
        return PTR_ERR(res);

    irq = platform_get_irq(pdev, 0);
    if (irq < 0)
        return irq;

    pr_info("simple: mem @%pa irq%d\n", &res->start, irq);
    return 0;
}

static int simple_remove(struct platform_device *pdev)
{
    return 0;
}

static struct platform_driver simple_driver = {
    .probe  = simple_probe,
    .remove = simple_remove,
    .driver = {
        .name = "simple-dev",
    },
};
module_platform_driver(simple_driver);
```
*Why this works*:  
The manual `platform_device` bypasses the DT/ACPI parsing steps, directly providing `struct resource` entries that the driver expects. This is useful for unit testing or early bring‑
