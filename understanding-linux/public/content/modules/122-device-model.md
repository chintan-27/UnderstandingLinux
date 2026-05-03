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

## Why This Matters

Before kernel 2.6, each bus subsystem — PCI, USB, platform — maintained its own device lists, its own reference counting, and its own hotplug logic independently. The consequence was concrete: power management required touching dozens of uncoordinated codepaths, removing a device could race with a driver mid-access because nothing serialized teardown, and userspace had no way to enumerate hardware topology without bus-specific tools. The device model solves all three by providing a single object tree with unified reference counting, a bus-owned match/probe protocol, and a sysfs projection of the entire tree. The payoff is that `udev`, `systemd-udevd`, and power management all operate against one interface regardless of bus type.

## Core Concepts

### Kobjects: The Atomic Unit

Every object in the device model — buses, devices, drivers, classes — embeds a `struct kobject`. The kobject provides exactly three things:

- A **reference count** (`struct kref`), so the kernel knows the precise moment it is safe to free memory.
- A **name**, which becomes the directory name in sysfs.
- A **parent pointer**, which determines where in the sysfs tree that directory appears.

C has no inheritance, so the device model uses embedding: the bus-specific structure wraps the generic one, and `container_of` recovers the outer pointer from the inner one. This is not a workaround — it is the intentional design.

```c
struct kobject {
    const char       *name;
    struct list_head  entry;
    struct kobject   *parent;
    struct kset      *kset;
    struct kobj_type *ktype;
    struct kref       kref;   /* atomic reference count */
    /* ... */
};
```

Reference management uses `kobject_get` and `kobject_put`. When the count reaches zero, `kobj->ktype->release(kobj)` is called — this is the **only** safe place to free the enclosing structure. The reason is that between the moment the count hits zero and the moment `release` runs, no other path holds a reference, so no other path can be reading the structure. Calling `kfree` directly on a `struct device` bypasses this guarantee entirely and is a bug.

The reference count is an `atomic_t` internally, so concurrent `get`/`put` from interrupt context is safe without additional locking.

$$\text{refcount}(t) = 1 + \sum_{i} \text{get}_i(t) - \sum_{j} \text{put}_j(t)$$

The initial value is 1 (set by `kobject_init`). When $\text{refcount}$ reaches $0$, `release` fires and the object is gone permanently. Any subsequent `kobject_get` on a zero-count kobject is a use-after-free.

### Buses

A bus is represented by `struct bus_type`. Its primary job is not hardware description but **matching logic**: given a device and a driver, does this driver support this device? Each bus implements `.match` because the answer is bus-specific:

- PCI: compares vendor ID, device ID, and class code against the driver's `id_table`.
- USB: compares interface class, subclass, and protocol codes.
- Platform: compares the `compatible` string from the device tree or the `name` field.

```c
struct bus_type {
    const char   *name;
    int (*match)(struct device *dev, struct device_driver *drv);
    int (*probe)(struct device *dev);
    int (*remove)(struct device *dev);
    int (*suspend)(struct device *dev, pm_message_t state);
    int (*resume)(struct device *dev);
    /* ... */
};
```

The bus maintains two lists: registered devices and registered drivers. When either list changes — a device is detected or a driver module is loaded — the bus walks the opposite list calling `.match` until a pair succeeds or all possibilities are exhausted. This is why `modprobe e1000e` can bind to an already-present PCI device without any reboot or re-enumeration.

### Devices

`struct device` represents one piece of hardware or a logical abstraction of one. Every bus-specific hardware structure embeds it:

| Bus-specific type | Embeds |
|---|---|
| `struct pci_dev` | `struct device dev` |
| `struct usb_interface` | `struct device dev` |
| `struct platform_device` | `struct device dev` |

```c
struct device {
    struct device        *parent;
    struct kobject        kobj;
    const char           *init_name;
    struct bus_type      *bus;
    struct device_driver *driver;     /* bound driver, or NULL */
    void                 *driver_data;
    struct dev_pm_info    power;
    /* ... */
};
```

The `parent` pointer is what creates the device topology. A USB mass storage interface's parent is the `struct usb_device`; that device's parent is the hub port's `struct usb_device`; the root hub's parent is the `struct pci_dev` for the host controller. This chain is exactly what sysfs reflects as nested directories under `/sys/devices/`.

### Drivers

`struct device_driver` describes capabilities and provides the callbacks the core invokes during binding, unbinding, and power transitions.

```c
struct device_driver {
    const char           *name;
    struct bus_type      *bus;
    struct module        *owner;
    int (*probe)(struct device *dev);
    void (*remove)(struct device *dev);
    int (*suspend)(struct device *dev, pm_message_t state);
    int (*resume)(struct device *dev);
    /* ... */
};
```

When `.match` returns success, the core calls the driver's `.probe`. Probe either claims the device (returns `0`) or refuses it (returns a negative `errno`). Claiming means the driver initializes hardware and stores any per-device state in `dev->driver_data` — this is an untyped `void *` the driver casts to its own structure. The device is then added to the driver's internal list of bound devices, which is precisely what makes `rmmod` safe: the driver core refuses to unload any driver whose bound-device list is nonempty.

### Classes

A class groups devices by **function**, not by connection topology. A USB mouse and a PS/2 mouse are both `input` class devices. An Intel NIC and a USB Ethernet dongle are both `net` class devices. This matters because userspace and kernel subsystems that want "all network interfaces" or "all block devices" should not need to traverse bus topology.

```c
struct class {
    const char      *name;
    struct module   *owner;
    int (*dev_uevent)(struct device *dev, struct kobj_uevent_env *env);
    void (*dev_release)(struct device *dev);
    /* ... */
};
```

Classes create their own subtree under `/sys/class/`. The entries there are symlinks back into `/sys/devices/`, not copies — the canonical location of a device is always under `/sys/devices/`.

## How It Works

### The Bind Sequence

When a new PCI device is detected during enumeration (or at boot), the sequence is:

1. The PCI subsystem allocates a `struct pci_dev`, fills in bus/slot/function address, vendor ID, device ID, BAR resource maps, and IRQ routing.
2. It calls `device_register(&pci_dev->dev)`, which assigns a kobject name, creates the sysfs directory, and adds the device to the PCI bus's device list.
3. `device_register` fires the match loop: the bus iterates all registered `pci_driver` entries, calling `pci_bus_match` for each.
4. `pci_bus_match` calls `pci_match_device`, which walks the driver's `id_table` — an array of `struct pci_device_id` terminated by a zero entry — looking for a matching `{vendor, device, subvendor, subdevice, class, class_mask}` tuple.
5. On a match, the core calls `pci_device_probe`:

```c
static int pci_device_probe(struct device *dev)
{
    struct pci_dev    *pci_dev = to_pci_dev(dev);           /* container_of */
    struct pci_driver *drv     = to_pci_driver(dev->driver);
    const struct pci_device_id *id;

    get_device(dev);   /* bump refcount before handing to driver */

    id = pci_match_device(drv, pci_dev);
    error = drv->probe(pci_dev, id);

    if (error)
        put_device(dev);   /* driver refused; drop the bump */

    return error;
}
```

6. If `drv->probe` returns `0`, `dev->driver` is set and a symlink from the driver's sysfs directory to the device appears.
7. If `drv->probe` returns an error (e.g., `-ENODEV`, `-ENOMEM`), the core continues iterating. The device remains in the bus list unbound, waiting for a future `modprobe` to load a matching driver.

### The Unbind and Teardown Sequence

Unbind is the reverse and is where reference counting matters most. When a device is hot-removed (e.g., a USB stick pulled out):

1. The bus calls `device_release_driver`, which calls `drv->remove(dev)`.
2. `remove` must undo everything `probe` did: free DMA buffers, release IRQs, stop hardware DMA. If it misses anything, the subsequent `put_device` will drop the refcount but the underlying memory may still be in use.
3. `dev->driver` is cleared and the device is removed from the driver's bound list.
4. `device_del` removes the sysfs entries and unlinks the device from the bus list.
5. `put_device` decrements the kobject refcount. If nothing else holds a reference, `release` fires and the `struct pci_dev` (or `struct usb_device`, etc.) is freed.

The reason the refcount may not reach zero immediately after step 5 is that sysfs file descriptors, open character device handles, or other kernel paths may hold references. The object survives until all of them call `put_device`. This is why driver `remove`
