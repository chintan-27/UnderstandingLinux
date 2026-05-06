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

## Core Concepts
A device driver is the kernel’s *structured* interface to a piece of hardware. Its purpose is threefold:

1. **Abstraction** – hide hardware‑specific details behind a uniform kernel API (e.g., `file_operations` for character devices, `struct scsi_host_template` for SCSI, `struct net_device_ops` for network).  
2. **Resource management** – claim, configure, and release the hardware’s limited resources (memory regions, IRQ lines, DMA channels) in a way that prevents collisions with other drivers.  
3. **Lifecycle handling** – react to hot‑plug events, power state changes, and module unload while preserving system invariants.

### Why a driver is necessary
Without a driver, the kernel would have to know the exact register layout, timing constraints, and interrupt behavior of every possible device. That would make the kernel monolithic, fragile, and unable to support new hardware without recompilation. A driver isolates this variability in a loadable module, letting the core kernel stay small and stable.

### Device identification
* **PCI** – each device exposes a 256‑byte configuration space. The first 4 bytes contain:
  - `vendor_id` (16 bits, bits 0‑15)  
  - `device_id` (16 bits, bits 16‑31)  
  The pair `(vendor_id, device_id)` is a 32‑bit identifier used by the kernel’s PCI core to match a `struct pci_device_id` table against the device.  
  Example: Intel 82579LM Gigabit Ethernet → `vendor_id=0x8086`, `device_id=0x1502`.

* **USB** – devices present a series of descriptors. The first two bytes of the device descriptor are `idVendor` and `idProduct` (both 16 bits). The kernel matches these against the `id_table` in a `struct usb_driver`.

* **Platform** – devices are described in the device tree or ACPI; the kernel uses a `struct of_device_id` or `struct acpi_device_id` containing a `compatible` string and, optionally, a `type` field.

### Resources and their allocation
| Resource | Typical source | Kernel representation | Allocation API |
|----------|----------------|-----------------------|----------------|
| Memory-mapped I/O (MMIO) | PCI BAR, platform `reg` property | `struct resource` (start, end, flags) | `pci_iomap()`, `devm_ioremap_resource()` |
| Interrupt line | PCI `Interrupt Line`, platform `interrupts` | `unsigned int irq` | `request_irq()`, `devm_request_irq()` |
| DMA channel | PCI `DMA` capability, platform `dma-ranges` | `dma_addr_t` (bus address) | `dma_set_mask()`, `dma_alloc_coherent()` |

**BAR size calculation** – a BAR writes a pattern of all‑1s, reads back the complement; the size is `~(value) + 1`. For example, if a BAR returns `0xFFFFF000`, the size is `0x1000` (4 KB).

### Driver lifecycle (simplified)
1. **Module init** (`module_init`) – allocate driver‑wide structures, register with a bus type (`pci_register_driver`, `usb_register`, `platform_driver_register`).  
2. **Device enumeration** – bus scans hardware, creates a `struct device`.  
3. **Matching** – bus core compares device’s IDs with driver’s `id_table`; on match calls `probe(struct device *dev)`.  
4. **Probe** – driver claims resources, maps MMIO, requests IRQ, creates kernel objects (e.g., `cdev_add`, `netdev_register`).  
5. **Normal operation** – driver handles I/O via file operations, interrupt handlers, or workqueues.  
6. **Remove** (`remove`/`disconnect`) – undo all probe steps: free IRQ (`free_irq`), unmap MMIO (`iounmap`), delete kernel objects, release memory (`dma_free_coherent`).  
7. **Module exit** (`module_exit`) – unregister from bus type, clean global resources.

---

## How It Works
### Step‑by‑step from module load to device operation
1. **Loading** – `modprobe` triggers `sys_init_module()` → kernel copies the ELF image into module space, resolves symbols, runs the module’s `init` function.  
2. **Registration** – the init function calls a bus‑specific register API (e.g., `pci_register_driver(&my_pci_driver)`). This links the driver’s `struct pci_driver` into the PCI core’s driver list and adds a `probe` callback.  
3. **Device discovery** – the PCI core walks the config space of every PCI bus/function (via `pci_scan_bus`). For each device it reads `vendor_id` and `device_id`, creates a `struct pci_dev`, and attempts to match against all registered drivers. Matching is O(N × M) but limited by small tables; the kernel uses a radix tree for speed.  
4. **Probe invocation** – if a match is found, the core calls `driver->probe(pci_dev)`. The probe must:
   - Enable the device: `pci_enable_device(dev)` (sets the command register’s I/O and memory enable bits, checks for broken BARs).  
   - Query BARs: `pci_resource_start(dev, bar)`, `pci_resource_len(dev, bar)`.  
   - Request memory regions: `devm_request_mem_region(&dev->dev, start, len, name)`.  
   - Map MMIO: `ioaddr = devm_ioremap_resource(&dev->dev, &res)`.  
   - Allocate DMA mask if needed: `dma_set_mask_and_coherent(&dev->dev, DMA_BIT_MASK(64))`.  
   - Request IRQ: `ret = devm_request_irq(&dev->dev, dev->irq, my_isr, IRQF_SHARED, name, dev)`.  
   - Register kernel objects (e.g., `cdev_init(&my_cdev, &fops); cdev_add(&my_cdev, devt, 1);`).  
   - Return 0 on success; any negative error aborts binding and triggers rollback.  
5. **Binding** – on successful probe, the core sets `dev->driver = driver` and increments the driver’s usage count. The device appears in sysfs under `/sys/bus/pci/devices/<bus>:<slot>.<func>/`.  
6. **Operation** – user space opens the device node (`/dev/mydev`). The VFS routes `read()`/`write()` to the driver’s `file_operations`. Interrupts arrive via the registered ISR; the ISR typically schedules a workqueue or tasklet to do heavy processing because sleeping is forbidden in interrupt context.  
7. **Removal** – hot‑unload or `rmmod` calls the driver’s `remove` callback, which performs the inverse of probe steps, then the core decrements the usage count and frees the `struct device`.

### Why each step matters
- **Enabling the device** ensures the processor can actually generate memory/I/O transactions to the device; forgetting this leads to silent failures.  
- **Resource reservation (`request_mem_region`)** prevents two drivers from mapping the same physical address, which would cause memory corruption.  
- **Mapping with `ioremap`** creates a virtual address that respects CPU cache attributes (e.g., strong ordering for device memory). Direct use of the physical address would bypass the MMU and break on architectures with strict alignment requirements.  
- **IRQ sharing flags** (`IRQF_SHARED`) let multiple devices use the same line; the kernel checks the shared handler’s return value (`IRQ_HANDLED` vs `IRQ_NONE`) to know whether to invoke the next handler.  
- **DMA mask** tells the kernel whether the device can address the full RAM; a 32‑bit mask on a system with >4 GB RAM forces the kernel to use bounce buffers, impacting performance.

---

## Worked Examples
### Example 1: Simple character driver (“memdev”)
This driver exposes a single read‑only memory region that returns an incrementing counter on each read. It demonstrates dynamic major/minor allocation, `cdev` usage, and proper cleanup.

```c
/* memdev.c – loadable character driver */
#include <linux/module.h>
#include <linux/fs.h>
#include <linux/cdev.h>
#include <linux/uaccess.h>
#include <linux/mutex.h>

#define MEMDEV_NAME "memdev"
#define MEMDEV_SIZE 4096   /* 4 KiB buffer */

static dev_t devt;          /* major:minor */
static struct cdev memdev_cdev;
static uint8_t *memdev_buf;
static unsigned long memdev_counter;
static DEFINE_MUTEX(memdev_lock);

/* ---- file operations ---- */
static ssize_t memdev_read(struct file *filp,
                           char __user *buf,
                           size_t count,
                           loff_t *ppos)
{
    size_t n;
    size_t offset = *ppos;

    mutex_lock(&memdev_lock);
    if (offset >= MEMDEV_SIZE) {
        mutex_unlock(&memdev_lock);
        return 0;   /* EOF */
    }
    n = min(count, MEMDEV_SIZE - offset);
    if (copy_to_user(buf, memdev_buf + offset, n)) {
        mutex_unlock(&memdev_lock);
        return -EFAULT;
    }
    *ppos += n;
    /* increment the whole buffer on each read to show state change */
    memdev_counter++;
    memset(memdev_buf, (uint8_t)(memdev_counter & 0xFF), MEMDEV_SIZE);
    mutex_unlock(&memdev_lock);
    return n;
}

static const struct file_operations memdev_fops = {
    .owner   = THIS_MODULE,
    .read    = memdev_read,
    .llseek  = no_llseek,
};

/* ---- module init/exit ---- */
static int __init memdev_init(void)
{
    int ret;

    /* allocate dynamic major */
    ret = alloc_chrdev_region(&devt, 0, 1, MEMDEV_NAME);
    if (ret < 0) {
        pr_err("alloc_chrdev_region failed\n");
        return ret;
    }
    pr_info("memdev: major %d, minor %d\n", MAJOR(devt), MINOR(devt));

    cdev_init(&memdev_cdev, &memdev_fops);
    memdev_cdev.owner = THIS_MODULE;
    ret = cdev_add(&memdev_cdev, devt, 1);
    if (ret) {
        pr_err("cdev_add failed\n");
        unregister_chrdev_region(devt, 1);
        return ret;
    }

    memdev_buf = kmemdup(memdev_buf, MEMDEV_SIZE, GFP_KERNEL);
    if (!memdev_buf) {
        cdev_del(&memdev_cdev);
        unregister_chrdev_region(devt, 1);
        return -ENOMEM;
    }
    /* initialise buffer */
    memdev_counter = 0;
    memset(memdev_buf, 0, MEMDEV_SIZE);

    return 0;
}

static void __exit memdev_exit(void)
{
    kfree(memdev_buf);
    cdev_del(&memdev_cdev);
    unregister_chrdev_region(devt, 1);
    pr_info("memdev: unloaded\n");
}

module_init(memdev_init);
module_exit(memdev_exit);
MODULE_LICENSE("GPL");
MODULE_AUTHOR("Student");
MODULE_DESCRIPTION("Simple counter character driver");
```

**Step‑by‑step explanation**
1. `alloc_chrdev_region(&devt,0,1,…)` asks the kernel for a free major number; the returned `devt` encodes major in the high 20 bits and minor in the low 12 bits (`devt = (major<<20) | minor`).  
2. `cdev_init()` fills a `struct cdev` with the supplied `file_operations`.  
3. `cdev_add()` links the cdev to the device number and makes it visible in `/sys/class/`.  
4. The buffer is allocated with `kmalloc` (here `kmemdup` for zero‑init). All memory is managed manually; in real drivers you’d use devm_* variants tied to the device’s lifetime.  
5. On each `read`, we copy `n` bytes from the buffer to user space with `copy_to_user`, update `ppos`, and then mutate the whole buffer to demonstrate stateful behavior.  
6. `module_exit` reverses every allocation in the exact opposite order to avoid use‑after‑free.

**Run it**
```bash
# Build (assumes kernel headers installed)
make -C /lib/modules/$(uname -r)/build M=$PWD modules

# Load
sudo insmod memdev.ko
# Check major number
grep memdev /proc/devices   # e.g., 250 memdev

# Create device node (udev would do this automatically)
sudo mknod /dev/memdev c 250 0

# Read a few bytes
sudo dd if=/dev/memdev bs=1 count=16 | hexdump -C
# Subsequent reads will show different values because the driver mutates the buffer
```

### Example 2: Minimal PCI driver for a dummy device
We’ll use QEMU’s `virtio-pci` as a stand‑in; the driver reads the device’s vendor/device ID, enables BAR0, maps it, and toggles a fake LED by writing to offset 0x0.

```c
/* dummy_pci.c – PCI driver example */
#include <linux/module.h>
#include <linux/pci.h>
#include <linux/io.h>

#define DRIVER_NAME "dummy_pci"

static const struct pci_device_id dummy_pci_ids[] = {
    { PCI_DEVICE(0x1af4, 0x1050), },   /* virtio-pci device */
    { 0, }
};
MODULE_DEVICE_TABLE(pci, dummy_pci_ids);

static int dummy_pci_probe(struct pci_dev *pdev,
                           const struct pci_device_id *ent)
{
    int retval;
    resource_size_t bar0_start, bar0_len;
    void __iomem *bar0_addr;

    dev_info(&pdev->dev, "Found %s (vendor %04x, device %04x)\n",
             pci_name(pdev), pdev->vendor, pdev->device);

    /* 1. Enable the device (turn on memory and bus master bits) */
    retval = pci_enable_device(pdev);
    if (retval) {
        dev_err(&pdev->dev, "pci_enable_device failed: %d\n", retval);
        return retval;
    }

    /* 2. Ask for BAR0 resources */
    bar0_start = pci_resource_start(pdev, 0);
    bar0_len   = pci_resource_len(pdev, 0);
    if (!bar0_len) {
        dev_err(&pdev->dev, "BAR0 zero size\n");
        retval = -ENODEV;
        goto err_disable;
    }

    /* 3. Reserve the region to prevent other drivers from grabbing it */
    retval = devm_request_mem_region(&pdev->dev,
                                     bar0_start, bar0_len, DRIVER_NAME);
    if (retval) {
        dev_err(&pdev->dev, "request_mem_region failed: %d\n", retval);
        goto err_disable;
    }

    /* 4. Map BAR0 into kernel virtual space */
    bar0_addr = devm_ioremap_resource(&pdev->dev,
                                      &pdev->resource[0]);
    if (IS_ERR(bar0_addr)) {
        retval = PTR_ERR(bar0_addr);
        dev_err(&pdev->dev, "ioremap failed: %pe\n", &pdev->resource[0]);
        goto err_disable;
    }

    /* 5. Example: toggle a fake LED at offset 0x0 */
    iowrite32(0x1, bar0_addr + 0x0);   /* turn on */
    /* In a real driver you would read back status, set up queues, etc. */

    dev_info(&pdev->dev, "BAR0 mapped at %pa, size %#zx\n",
             &bar0_start, bar0_len);
    return 0;

err_disable:
    pci_disable_device(pdev);
    return retval;
}

static void dummy_pci_remove(struct pci_dev *pdev)
{
    dev_info(&pdev->dev, "Removing %s\n", pci_name(pdev));
    /* No explicit cleanup needed – devm_* functions auto‑release on remove */
}

static struct pci_driver dummy_pci_driver = {
    .name     = DRIVER_NAME,
    .id_table = dummy_pci_ids,
    .probe    = dummy_pci_probe,
    .remove   = dummy_pci_remove,
};

module_pci_driver(dummy_pci_driver);
MODULE_LICENSE("GPL");
MODULE_AUTHOR("Student");
MODULE_DESCRIPTION("Minimal PCI driver example");
```

**Explanation of each probe step**
| Step | Reason |
|------|--------|
| `pci_enable_device()` | Sets the PCI_COMMAND register’s `IO_EN` and `MEM_EN` bits; also checks for broken BARs and enables bus mastering if needed. Without this, the device will not respond to MMIO or DMA. |
| `pci_resource_start/len()` | Reads the BAR values already fixed by firmware/BIOS; the kernel does **not** reprogram BARs here (that’s done by `pci_alloc_irq_vectors` or `pci_alloc_irq` for MSI). |
| `devm_request_mem_region()` | Inserts the range into the global `/proc/iomem` tree; prevents another driver from claiming the same physical addresses. |
| `devm_ioremap_resource()` | Calls `ioremap()` which sets the appropriate page protection (`_PAGE_DEVICE`) and returns a kernel virtual address. On some architectures (e.g., ARM) this also ensures strong ordering. |
| `iowrite32()` | Writes a 32‑bit value to the device register. The macro expands to `__raw_writel()` which issues a store with the correct memory barrier for the architecture. |
| `devm_*` variants | Bind the lifetime of the allocated resource to the `struct device`; when `remove` is called, the kernel automatically releases memory, unmaps iomap, and disables the device. This eliminates a large class of leaks. |

**Testing on QEMU**
```bash
# Start QEMU with a virtio-pci device (uses the same IDs as above)
qemu-system-x86_64 -enable-kvm \
    -device virtio-pci-pci,bus=pcie.0 \
    -nographic -serial mon:stdio

# In another terminal, build and load the driver
make -C /lib/modules/$(uname -r)/build M=$PWD modules
sudo insmod dummy_pci.ko
dmesg | tail -20   # should show probe messages

# Unload
sudo rmmod dummy_pci
dmesg | tail -5
```

---

## Common Mistakes
| Mistake | What’s wrong | Why it breaks |
|---------|--------------|----------------|
| **Using `kmalloc` without a matching `kfree` in `remove`** | Memory allocated in `probe` is never freed. | The leaked RAM accumulates each time the driver is loaded/unloaded, eventually exhausting low‑memory zones and causing `malloc` failures in other kernel subsystems. |
| **Calling `request_irq` with `IRQF_DISABLED`** | Forces the IRQ line to stay disabled while the handler runs. | On SMP systems this degrades interrupt latency for all devices sharing the line and can cause lock‑up if the handler sleeps (which it must not). |
| **Accessing user‑space buffers directly (`memcpy` from `buf`)** | Bypasses `copy_to_user`/`copy_from_user`. | On architectures with separate user/kernel address spaces (most), this triggers a page fault that the kernel cannot handle, leading to an oops. |
| **Failing to set a DMA mask (`dma_set_mask`) before allocating coherent memory** | The device may receive addresses it cannot decode (e.g., a 32‑bit device getting a 4 GB+ address). | Results in silent DMA corruption or device hangs; the kernel may print “DMAR: DRHD: handling fault” on Intel VT‑d. |
| **Not checking the return value of `pci_enable_device`** | Assuming the device is always usable. | Some platforms have mis‑wired BARs or disabled devices in BIOS; the driver will then try to map invalid addresses, causing a kernel page fault. |
| **Using `spin_lock` instead of `spin_lock_irqsave` in interrupt context** | Does not disable local interrupts while holding the lock. | If the same IRQ occurs again while the lock is held, you get deadlock (the second handler spins forever). |
| **Sleeping (e.g., `msleep`) inside an ISR or with `spinlock` held** | The scheduler may be invoked while interrupts are disabled or from atomic context. | Leads to “BUG: scheduling while atomic” warnings and can crash the system. |
| **Hard‑coding major numbers** | `register_chrdev_region(major, 1, …)` with a fixed major. | If another driver already uses that major, registration fails and the module won’t load; also makes the driver non‑portable across kernels. |
| **Neglecting to call `pci_set_drvdata` / `pci_get_drvdata`** | Storing driver‑specific data in a global variable instead of per‑device. | On SMP or hot‑plug scenarios, data gets clobbered between multiple instances of the same device type. |

---

## Exercises
### 1. Easy – Hello‑World module
*Write a loadable module that prints “Hello, world!” on load and “Goodbye!” on unload using `pr_info`. Use `module_init` and `module_exit`. Verify with `d
