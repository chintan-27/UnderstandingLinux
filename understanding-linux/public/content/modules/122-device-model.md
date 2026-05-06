---
id: 122
title: "Device model"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
The Linux device model is not a loose collection of conventions; it is a **core object hierarchy** built on top of `struct kobject`. Every hardware entity that the kernel wishes to manage is represented as a `kobject` whose lifetime is governed by reference counting, whose attributes appear in **sysfs**, and whose relationships (parent/child) reflect the physical/topological bus hierarchy. This unification allows a single generic mechanisms—hotplug, power management, device‑release, and uevent generation—to work for wildly different busses (PCI, USB, I²C, platform, …) without duplicating code.

### Kobject foundations
```c
/* include/linux/kobject.h */
struct kobject {
    const char *name;
    struct list_head entry;          /* hooks into a kset */
    struct kset *kset;
    struct kobj_type *ktype;         /* provides show/store sysfs ops */
    struct dentry *dentry;           /* sysfs directory */
    unsigned int state_initialized:1;
    unsigned int state_in_sysfs:1;
    unsigned int state_add_uevent_sent:1;
    unsigned int state_remove_uevent_sent:1;
    unsigned int uevent_suppress:1;
    atomic_t refcnt;                 /* lifetime management */
};
```
*Why reference counting?* A device may be accessed from multiple contexts (driver probe, sysfs reads, uevent handlers). The `kobject_get/kobject_put` pair guarantees the underlying memory is freed only when the last user drops its reference.

### Bus type
```c
/* include/linux/device.h */
struct bus_type {
    const char *name;
    const char *dev_name;            /* default naming scheme */
    struct device *dev_root;         /* dummy parent for devices on this bus */
    struct kset *devices;            /* all devices discovered on the bus */
    struct kset *drivers;            /* all drivers registered for the bus */
    int (*match)(struct device *dev, struct device_driver *drv);
    int (*uevent)(struct device *dev, struct kobj_uevent_env *env);
    int (*probe)(struct device *dev);
    int (*remove)(struct device *dev);
    void (*shutdown)(struct device *dev);
    int (*online)(struct device *dev);
    int (*offline)(struct device *dev);
    int (*suspend)(struct device *dev, pm_message_t state);
    int (*resume)(struct device *dev);
    const struct dev_pm_ops *pm;     /* power‑management callbacks */
};
```
*Why a match function?* The kernel cannot probe every driver against every device naïvely (O(N·M)). The match callback lets the bus quickly reject incompatible pairs, often by comparing vendor/device IDs, compatible strings, or device‑tree nodes.

### Device
```c
struct device {
    struct device *parent;           /* hierarchical parent (bus or another device) */
    struct device_private *p;        /* opaque, used internally */
    struct kobject kobj;             /* embeds the kobject – makes device a kobject */
    const char *init_name;           /* initial name used for kobject registration */
    const struct bus_type *bus;      /* bus this device belongs to */
    struct device_driver *driver;    /* bound driver, if any */
    void (*release)(struct device *dev); /* called when refcount hits zero */
    /* ... power‑management, iommu, mutex, etc. ... */
};
```
*Why embed `kobject`?* By making `device` a `kobject`, we get sysfs directories (`/sys/<bus>/devices/<name>`) for free, and we can reuse the generic kobject reference‑counting and uevent machinery.

### Driver
```c
struct device_driver {
    const char *name;
    const struct bus_type *bus;
    struct module *owner;
    const char *mod_name;            /* used for module reference counting */
    bool suppress_bind_attrs;        /* hide sysfs bind/unbind if true */
    const struct of_device_id *of_match_table;
    const struct acpi_device_id *acpi_match_table;
    const struct i2c_device_id *id_table;   /* bus‑specific match tables */
    const struct usb_device_id *usb_id_table;
    int (*probe)(struct device *dev);
    int (*remove)(struct device *dev);
    void (*shutdown)(struct device *dev);
    int (*suspend)(struct device *dev, pm_message_t state);
    int (*resume)(struct device *dev);
    const struct dev_pm_ops *pm;
};
```
*Why separate `probe` from `match`?* `match` decides *if* a driver can handle a device; `probe` performs the actual initialization (resource allocation, register mapping, irq request). Keeping them distinct lets the core walk the driver list, invoke `match` cheaply, and only call the expensive `probe` once a suitable driver is found.

### Class
```c
struct class {
    const char *name;
    struct module *owner;
    struct class_attribute *class_attrs;   /* sysfs files under /sys/class/<class> */
    struct device_attribute *dev_attrs;    /* default attrs for each device */
    struct bin_attribute *dev_bin_attrs;
    struct kset *devices;                  /* all devices bound to this class */
    const struct dev_pm_ops *pm;
};
```
*Why classes?* They provide a **policy‑agnostic view** of devices that share a user‑visible characteristic (e.g., all block devices appear under `/sys/class/block`). Userspace tools like `udev` and `lsblk` rely on this flat namespace rather than digging through the bus‑specific tree.

---

## How It Works
### 1. Registration flow
When a driver calls `platform_driver_register(&my_driver)` (or the generic `driver_register`), the core does:

1. **Add driver to bus’s driver kset** – `kset_add(&driver->kobj, bus->drivers)`.
2. **Create a kobject** for the driver (name = `driver->name`) and link it under `/sys/bus/<bus>/drivers/<name>`.
3. **Attempt to bind existing devices**: for each `device` in `bus->devices`, invoke `bus->match(device, driver)`. On success, call `driver->probe(device)`. If probe returns 0, the driver’s reference count is incremented and the device’s `driver` pointer is set.

### 2. Device addition
`device_register(dev)` (or the helper `platform_device_register`) performs:

1. `kobject_init_and_add(&dev->kobj, &ktype, parent_kobj, "%s", dev->init_name);`  
   This creates a sysfs directory under the parent’s directory (usually `/sys/devices` or a bus‑specific directory).
2. **Add to bus’s device kset**: `kset_add(&dev->kobj, bus->devices)`.
3. **Uevent generation**: `kobject_uevent(&dev->kobj, KOBJ_ADD);`  
   This sends a netlink message to udev, containing environment variables like `DEVTYPE`, `SUBSYSTEM`, `DRIVER`, and any bus‑specific attrs added via `device->bus->uevent`.
4. **Driver match attempt**: the core walks `bus->drivers` and invokes `bus->match` for each driver. If a match succeeds, `driver->probe(dev)` is called.

### 3. Reference counting and release
Each successful `kobject_get` increments `kobj.refcnt`. When the last user calls `kobject_put`, the refcnt drops to zero and the ktype’s `release` callback is invoked. For a `device`, the release callback ultimately calls `device_release(struct device *dev)` which:
- Calls `dev->release(dev)` if set (driver‑specific cleanup).
- Frees the `struct device` allocated by the caller.

*Why mandatory?* Forgetting to set `.release` leaves the allocated `struct device` leaking because the kobject never reaches zero; the kernel will warn with “kobject: tried to free initrd” style messages.

### 4. Hotplug removal
`device_del(dev)` executes:
1. `kobject_uevent(&dev->kobj, KOBJ_REMOVE);` – tells udev the device is disappearing.
2. `device_unregister(dev)` → `device_release_driver(dev)` (calls driver->remove if bound) → `kset_remove(&dev->kobj, bus->devices)` → `kobject_put(&dev->kobj)`.
If the device was bound to a driver, the driver’s `remove` method is invoked **before** the kobject is put, giving the driver a chance to release resources (iounmap, free irq, disable clocks).

### 5. Sysfs attribute creation
Attributes are defined via the `DEVICE_ATTR macro`:
```c
#define DEVICE_ATTR(_attr, _mode, _show, _store) \
    struct device_attribute dev_attr_##_attr = __ATTR(_attr, _mode, _show, _store)
```
where `__ATTR` expands to:
```c
#define __ATTR(_name, _mode, _show, _store) \
    { .attr = { .name = __stringify(_name), .mode = _mode }, \
      .show = _show, .store = _store }
```
The core links each `device_attribute` into the device’s `ktype->default_attrs` list, which creates a regular file under the device’s sysfs directory. Reading/writing the file invokes the corresponding `show`/`store` callback, enabling runtime configuration without ioctl.

---

## Worked Examples
### Example 1 – Minimal Platform Driver
```c
/* file: myplat.c */
#include <linux/module.h>
#include <linux/platform_device.h>

static int myplat_probe(struct platform_device *pdev)
{
    dev_info(&pdev->dev, "myplat: probed %s\n", pdev->name);
    /* Example: map a resource */
    struct resource *res = platform_get_resource(pdev, IORESOURCE_MEM, 0);
    if (!res)
        return -ENODEV;
    /* devm_* variants auto‑release on detach */
    void __iomem *base = devm_ioremap_resource(&pdev->dev, res);
    if (IS_ERR(base))
        return PTR_ERR(base);
    /* store base in driver data if needed */
    platform_set_drvdata(pdev, base);
    return 0;
}

static int myplat_remove(struct platform_device *pdev)
{
    dev_info(&pdev->dev, "myplat: removed %s\n", pdev->name);
    return 0;
}

/* Optional: match via device tree */
static const struct of_device_id myplat_of_match[] = {
    { .compatible = "vendor,myplat-1.0", },
    { }
};
MODULE_DEVICE_TABLE(of, myplat_of_match);

static struct platform_driver myplat_driver = {
    .probe  = myplat_probe,
    .remove = myplat_remove,
    .driver = {
        .name           = "myplat",
        .owner          = THIS_MODULE,
        .of_match_table = myplat_of_match,
    },
};

module_platform_driver(myplat_driver);
MODULE_LICENSE("GPL");
MODULE_AUTHOR("Student");
MODULE_DESCRIPTION("Minimal platform driver example");
```
**Step‑by‑step reasoning**
1. `module_platform_driver` expands to `platform_driver_register(&myplat_driver)` on init and `platform_driver_unregister` on exit.
2. Registration adds the driver to `/sys/bus/platform/drivers/myplat`.
3. When a platform device with compatible string `"vendor,myplat-1.0"` is instantiated (by board code or DT), the platform bus’s `match` compares the device’s `of_compatible` with the driver’s table → success.
4. The core calls `myplat_probe`. It:
   - Retrieves the first MEM resource (`platform_get_resource`).
   - Maps it with `devm_ioremap_resource` (automatically unmapped on detach).
   - Stores the pointer via `platform_set_drvdata` for later use.
   - Returns 0 → driver remains bound.
5. On removal (`platform_device_unregister` or hotplug), `myplat_remove` is called; the devm‑managed iounmap happens automatically.

### Example 2 – Adding a Sysfs Attribute to a Device Class
Suppose we want a class `"myclass"` that exports a read‑only attribute `"serial"` containing a UUID.

```c
/* file: myclass.c */
#include <linux/module.h>
#include <linux/device.h>
#include <linux/slab.h>

static ssize_t serial_show(struct device *dev,
                           struct device_attribute *attr, char *buf)
{
    const char *serial = dev_get_drvdata(dev);
    return sprintf(buf, "%s\n", serial ? serial : "");
}
static DEVICE_ATTR_RO(serial);

static struct class *myclass;

static int __init myclass_init(void)
{
    myclass = class_create(THIS_MODULE, "myclass");
    if (IS_ERR(myclass))
        return PTR_ERR(myclass);

    /* create the attribute file under /sys/class/myclass/ */
    if (class_create_file(myclass, &dev_attr_serial)) {
        class_destroy(myclass);
        return -ENODEV;
    }
    pr_info("myclass: created with serial attribute\n");
    return 0;
}
static void __exit myclass_exit(void)
{
    class_remove_file(myclass, &dev_attr_serial);
    class_destroy(myclass);
}
module_init(myclass_init);
module_exit(myclass_exit);
MODULE_LICENSE("GPL");
```
**Usage**
```bash
# after insmod myclass.ko
# create a device bound to the class
echo mydev > /sys/class/myclass/uevent   # triggers uevent, causes device_add
# the core creates /sys/class/myclass/mydev/
cat /sys/class/myclass/mydev/serial
# (empty until we set drvdata)
echo -n "1234-abcd-efgh" > /sys/class/myclass/mydev/serial  # fails: RO attr
# To set drvdata from a driver:
dev_set_drvdata(mydev, "1234-abcd-efgh");
cat /sys/class/myclass/mydev/serial
# => 1234-abcd-efgh
```
*Why `class_create_file`?* It walks the class’s `kset` and creates a sysfs file for each existing device; future devices automatically get the file via the class’s default attributes.

### Example 3 – Reading/Writing a Device Attribute via Sysfs
Assume a platform device `myplat` exposes an RW attribute `"debug"` that toggles a flag.

```c
/* in myplat driver */
static ssize_t debug_show(struct device *dev,
                          struct device_attribute *attr, char *buf)
{
    struct myplat_data *pd = dev_get_drvdata(dev);
    return sprintf(buf, "%d\n", pd->debug);
}
static ssize_t debug_store(struct device *dev,
                           struct device_attribute *attr,
                           const char *buf, size_t count)
{
    struct myplat_data *pd = dev_get_drvdata(dev);
    unsigned long val;
    if (kstrtoul(buf, 0, &val))
        return -EINVAL;
    pd->debug = !!val;
    dev_info(dev, "debug set to %d\n", pd->debug);
    return count;
}
static DEVICE_ATTR_RW(debug);
```
**Shell interaction**
```bash
# locate the device under the platform bus
find /sys/bus/platform/devices -name myplat -type d
# suppose it returns /sys/bus/platform/devices/0.0.auto/myplat
cd /sys/bus/platform/devices/0.0.auto/myplat
cat debug        # reads current value (0)
echo 1 > debug   # writes, triggers debug_store
cat debug        # now reads 1
```
*Why `devm_*` helpers?* They tie resource lifetimes to the device’s reference count, preventing leaks when the device is removed or the driver unbound.

---

## Common Mistakes
| # | Mistake | What’s wrong | Why it matters |
|---|---------|--------------|----------------|
| 1 | **Omitting `.release` in `struct device`** | The `kobject` never reaches a refcount of zero when the device is unregistered. | Leaks the `struct device` allocation; kernel emits `kobject: tried to free initrd` warnings and can exhaust memory over time. |
| 2 | **Registering a device on the wrong bus** (e.g., calling `platform_device_register` but filling `dev->bus = &pci_bus_type`) | The platform bus’s `match` never sees the device because the bus pointer mismatch; the driver’s probe is never invoked. | Device appears in `/sys/devices` but remains unbound; users see no device node and assume hardware is broken. |
| 3 | **Failing to check the return value of `device_register`** | If registration fails (e.g., duplicate name), the caller continues as if success and later dereferences a half‑initialized `device`. | Leads to null‑pointer dereference or use‑after‑free when the core later tries to remove the non‑existent device. |
| 4 | **Using plain `kmalloc` for device‑private data instead of `devm_kmalloc`** | The allocated memory is not automatically freed on device detach. | On driver unload or hot‑remove, the memory leaks; worse, if the driver later re‑probes the same device, it may dereference stale pointers. |
| 5 | **Calling `kobject_uevent_env` without adding required vars (`SUBSYSTEM`, `DEVTYPE`)** | Udev receives an incomplete event and may not create the expected node or apply rules. | Result: `/dev` node missing, `udevadm info` shows empty properties, breaking userspace reliance on the node. |

---

## Exercises
### Easy – Miscellaneous Character Device
1. Write a module that registers a misc device via `misc_register(&my_misc)`.  
2. Implement `open`, `release`, and `read` (return a fixed string).  
3. Verify appearance in `/dev/mychar` and `/sys/class/misc/mychar/`.  
4. Use `dmesg` to see probe/remove messages.

### Medium – Platform Driver with Sysfs Attribute
1. Create a platform driver that manages a simple register (use an integer variable).  
2. Export a RW sysfs attribute `"control"` under `/sys/bus/platform/devices/<name>/control`.  
3. `show` returns the variable’s decimal value; `store` parses an integer and writes it.  
4. Load the module, echo values to the attribute, and read them back to confirm persistence.  
5. Unload the module and confirm the attribute disappears.

### Hard – Dynamic Device + Hotplug + Udev Rule
1. Write a module that, on load, **allocates and registers a platform device** using `platform_device_alloc`/`platform_device_add`.  
2. Implement a matching platform driver that, on probe, creates a **character device** (`cdev_add`) and creates a symlink in `/dev` via a **udev rule** you write to `/etc/udev/rules.d/99-mydev.rules`.  
3. The rule should:  
   ```
   SUBSYSTEM=="mem", KERNEL=="mydev", SYMMEM+="mydev", MODE=="0660", GROUP=="users"
   ```  
   (adjust to match your device’s subsystem).  
4. Unregister the platform device on module exit and verify that the symlink disappears automatically.  
5. Test hotplug by repeatedly allocating/deallocating the device via a sysfs trigger (e.g., echoing the device name to `/sys/bus/platform/devices/add` if your kernel supports it, or simply rerunning the init/exit cycle).  

*Evaluation criteria:* correct reference handling, no leaks (checked via `cat /proc/meminfo` or `kmemleak`), attribute accessible, udev rule fires, symlink appears/disappeas as expected.

---

## Linux Connection
The device model underlies every major kernel subsystem. Below are concrete examples showing where the abstractions appear in the running system.

### Platform Bus
```bash
# List all platform devices
ls /sys/bus/platform/devices
# Example output: 20980000.uart  3f201000.gpio  soc:audio
# Show driver bound to a specific device
basename $(readlink -f /sys/bus/platform/devices/20980000.uart/driver)
# => uart-pl011
```
*Real subsystem*: `drivers/platform/` (e.g., `drivers/platform/arm/versatile/pb.c`).

### USB Bus
```bash
# Tree view of USB topology
lsusb -t
# /sys/bus/usb/devices/ shows each port as a numbered directory
ls -l /sys/bus/usb/devices/
# Each device directory contains idVendor, idProduct, bcdDevice, etc.
cat /sys/bus/usb/devices/1-1/idVendor
# => 0424 (example)
# Bound driver
ls -l /sys/bus/usb/devices/1-1/driver
# -> ../../../../bus/usb/drivers/hub
```
*Real subsystem*: `drivers/usb/core/` (`usb_register_dev`, `usb_match_id`).

### PCI Bus
```bash
# Verbose lspci showing kernel driver in use
lspci -k -s 00:1f.2
# Output includes:
#   Kernel driver in use: ahci
#   Kernel modules: ahci, ahci_platform
# Sysfs view
ls /sys/bus/pci/devices/0000:00:1f.2/
# Contains: class, vendor, device, driver, uevent
cat /sys/bus/pci/devices/0000:00:1f.2/uevent
# PCI_SLOT_NAME=0000:00:1f.2
# PCI_CLASS=010601
# ID_VENDOR=8086
# ID_DEVICE=8d02
```
*
