---
id: 121
title: "Driver fundamentals"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Hardware enumeration and driver binding solve a concrete resource-ownership problem: when a PCI device appears on the bus, something must claim its BARs, install an IRQ handler, and present a coherent interface to the rest of the kernel — without racing against another driver attempting the same thing, without leaking those resources if initialization fails halfway through, and without requiring a reboot when the device disappears. The Linux device model enforces this through a single ownership discipline: the bus subsystem owns devices, drivers declare what they can handle, and the kernel mediates the binding. This is why you can `rmmod` a driver while the hardware stays powered, reload it, and have the device reappear in `/dev` — the binding is dynamic by design, not a boot-time coincidence.

Without the bus–device–driver triangle, every subsystem (PCI, USB, I²C, platform) would need its own hotplug logic, its own power management callbacks, and its own sysfs representation. The unification means that suspend/resume, uevent generation, and driver rebinding work identically whether you are writing a GPU driver or an I²C temperature sensor driver.

---

## Core Concepts

### What a Driver Actually Is

A driver is a set of function pointers registered with a bus subsystem. It is not a process, not a thread, and not a file — it has no execution context of its own. When the kernel needs to initialize a device, it calls into those function pointers directly, running in whatever context triggered the bind (a kworker thread for hotplug, or the thread calling `insmod` for a driver loaded against already-enumerated hardware).

At the C level, every driver ultimately embeds a `struct device_driver`:

```c
struct device_driver {
    const char              *name;
    struct bus_type         *bus;
    int  (*probe)  (struct device *dev);
    void (*remove) (struct device *dev);
    int  (*suspend)(struct device *dev, pm_message_t state);
    int  (*resume) (struct device *dev);
    const struct attribute_group **groups;  /* sysfs attributes */
    /* ... */
};
```

Bus-specific drivers (PCI, USB, platform) wrap this in a larger structure. `struct pci_driver` contains a `struct device_driver` as its `driver` field and adds PCI-specific fields like `id_table` and an `err_handler`. The bus layer calls the generic `device_driver` callbacks; the PCI layer installs wrapper callbacks that translate between the generic `struct device *` and the bus-specific `struct pci_dev *`.

### The Bus–Device–Driver Triangle

Every `struct device` has a pointer to a `struct bus_type`. Every `struct device_driver` has a pointer to the same `struct bus_type`. The bus type owns two lists — `klist_devices` and `klist_drivers` — and a `.match` function pointer.

The matching protocol is strictly bidirectional:

- When a new device is registered via `device_register()`, the bus calls `driver_match_device(drv, dev)` for every driver already on `klist_drivers`.
- When a new driver is registered via `driver_register()`, the bus calls `driver_match_device(drv, dev)` for every device already on `klist_devices`.

This bidirectionality is why driver load order does not matter. If you `modprobe e1000e` before the NIC is enumerated, the driver sits idle on `klist_drivers`. When PCI enumeration later calls `pci_device_add()`, the bus finds the driver and triggers probe. The converse — hardware present before driver loads — works identically.

```
Bus
 ├── klist_devices  →  [dev A] [dev B] [dev C]
 └── klist_drivers  →  [drv X] [drv Y]

device_register(dev C):
    for each drv in klist_drivers:
        if bus.match(drv, dev C): __device_attach(drv, dev C) → probe()

driver_register(drv Y):
    for each dev in klist_devices:
        if bus.match(drv Y, dev): __device_attach(drv Y, dev) → probe()
```

The complexity of a full scan on each register event is $O(d \cdot r)$ where $d$ is the number of devices and $r$ is the number of registered drivers on that bus. For PCI this is bounded and fast; for USB with hundreds of interface drivers the table-walk cost is why `MODULE_DEVICE_TABLE` exists — `udev` resolves the match in userspace before asking the kernel to load anything.

### Device IDs and Matching

A PCI driver declares its supported hardware as an array of `struct pci_device_id`, terminated by a zeroed sentinel:

```c
static const struct pci_device_id my_ids[] = {
    { PCI_DEVICE(0x10de, 0x1234) },          /* exact vendor+device match */
    { PCI_DEVICE_CLASS(PCI_CLASS_NETWORK_ETHERNET, 0xffff00) }, /* class match */
    { 0 }
};
MODULE_DEVICE_TABLE(pci, my_ids);
```

`MODULE_DEVICE_TABLE` embeds the table in the `.modinfo` ELF section of the `.ko` file. The tool `depmod` reads every installed module's `.modinfo` and writes `/lib/modules/$(uname -r)/modules.alias`, mapping device ID patterns to module names. When `udev` receives a kernel hotplug uevent containing `MODALIAS=pci:v000010DEd00001234...`, it runs `modprobe` with that alias, which consults `modules.alias` and loads the right module — without any hardcoded device–driver mapping.

You can inspect this pipeline directly:

```bash
# See the modalias the kernel assigned to a PCI device
cat /sys/bus/pci/devices/0000:01:00.0/modalias

# See what module that alias resolves to
modprobe --resolve-alias $(cat /sys/bus/pci/devices/0000:01:00.0/modalias)

# Dump the device ID table embedded in a module
modinfo -F alias e1000e

# See the full alias map for all installed modules
grep e1000e /lib/modules/$(uname -r)/modules.alias
```

The `pci_bus_match()` function computes the match by ANDing each field in the candidate `pci_device_id` entry with a mask derived from which fields are non-zero. For a `PCI_DEVICE()` entry, vendor and device must match exactly; all other fields are wildcarded. For a class match entry, the class code is masked against the provided mask before comparison:

$$\text{match} = \bigl((\text{dev.class} \;\&\; \text{id.class\_mask}) = \text{id.class}\bigr) \;\land\; \ldots$$

### Probing

Probe is the point of no return. Once `probe()` returns 0, the kernel marks the device as bound and will not call any other driver's probe for this device until `remove()` is called. Inside probe, you must either complete all initialization successfully or undo every partially completed step — the kernel will not clean up for you.

The canonical probe structure uses a goto-chain to unwind in reverse order:

```c
static int my_probe(struct pci_dev *pdev, const struct pci_device_id *id)
{
    struct my_priv *priv;
    int err;

    /* Step 1: enable the device — powers BARs and enables bus mastering path */
    err = pci_enable_device(pdev);
    if (err)
        return err;                      /* nothing to undo yet */

    /* Step 2: claim ownership of all BARs registered for this device */
    err = pci_request_regions(pdev, "my_driver");
    if (err)
        goto err_disable;

    /* Step 3: map BAR 0 into kernel virtual address space */
    void __iomem *base = pci_iomap(pdev, 0, 0);
    if (!base) { err = -ENOMEM; goto err_release; }

    /* Step 4: allocate driver-private state */
    priv = kzalloc(sizeof(*priv), GFP_KERNEL);
    if (!priv) { err = -ENOMEM; goto err_unmap; }

    priv->base = base;
    pci_set_drvdata(pdev, priv);
    return 0;

err_unmap:
    pci_iounmap(pdev, base);
err_release:
    pci_release_regions(pdev);
err_disable:
    pci_disable_device(pdev);
    return err;
}
```

Every `goto err_*` label undoes exactly one step. This pattern is not stylistic — it is a contract with the kernel that resources are never leaked across a failed probe.

### Resources and Ownership

Hardware resources are tracked in a kernel-global tree of `struct resource` nodes. Each node records a physical address range (or IRQ number, or DMA channel), a name, flags, and parent/child/sibling pointers. The tree enforces exclusivity: `request_mem_region(start, len, name)` fails with `NULL` if any overlapping region is already claimed.

A PCI device's BARs are physical address windows into the device's register space. BAR 0 of a typical device might occupy $2^{20}$ bytes (1 MiB) of physical address space starting at some address assigned by the PCI host controller during enumeration. The kernel maps this into virtual address space with `pci_iomap()`, and the resulting `void __iomem *` pointer must only be accessed with `ioread32()`/`iowrite32()` and friends — never with plain pointer dereferences — because the mapping may be non-cacheable and the compiler must not reorder or coalesce accesses across it.

The virtual address returned by `pci_iomap(pdev, bar, len)` is:

$$V_{\text{base}} = \text{ioremap}(P_{\text{BAR}}, \text{len})$$

where $P_{\text{BAR}}$ is the physical base address the PCI host controller assigned to that
