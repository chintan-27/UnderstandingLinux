---
id: 138
title: "User-kernel interfaces for drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A driver that only lives in kernel space is structurally useless — it cannot be controlled, queried, or observed by userspace processes. But the interface design decision matters enormously: a poorly chosen mechanism introduces unnecessary syscall overhead, breaks zero-copy data paths, creates races, or exposes kernel internals through an ABI that becomes impossible to change. Linux provides exactly the channels you need, each justified by a failure mode of the others:

- `ioctl` exists because `read`/`write` carry no semantic meaning for control operations — "set baud rate" is not a data stream
- `poll`/`epoll` exist because blocking `read` on a single fd cannot wait on multiple sources simultaneously
- `mmap` exists because copying gigabytes of framebuffer data through `read` would saturate the memory bus
- `netlink` exists because `ioctl` is synchronous and user-initiated — the kernel cannot push events through it
- `sysfs` exists because `/proc` entries are unstructured text with no schema enforcement

Choosing wrong costs real performance. A driver that copies 4 KB of sensor data per `read` call at 10 kHz burns $4096 \times 10000 = 40.96 \text{ MB/s}$ through the copy path alone. The same bandwidth via `mmap` costs zero copy overhead and eliminates the syscall entirely after the initial mapping.

---

## Core Concepts

### `ioctl` — Out-of-Band Device Control

`read` and `write` are semantically overloaded as data streams; they cannot represent "eject disc" or "query hardware version" without encoding a command into the data itself, which is a protocol layering violation. `ioctl` is the escape hatch: one command number, one optional argument (a pointer or scalar), dispatched to the driver's `.unlocked_ioctl` handler.

The critical problem is command number collision. If two unrelated drivers both handle command `0x01`, a process that opens the wrong device and issues that command gets silently wrong behavior — not an error. The structured 32-bit encoding in `<linux/ioctl.h>` solves this:

$$\text{cmd}_{32} = \underbrace{d_{31:30}}_{\text{dir (2 bits)}} \;\Big|\; \underbrace{s_{29:16}}_{\text{size (14 bits)}} \;\Big|\; \underbrace{t_{15:8}}_{\text{type (8 bits)}} \;\Big|\; \underbrace{n_{7:0}}_{\text{nr (8 bits)}}$$

- **type**: one byte magic number identifying the subsystem. `'T'` is `tty`, `'V'` is `video4linux`, `'i'` is `i2c`. Assignments are tracked in `Documentation/userspace-api/ioctl/ioctl-number.rst`.
- **nr**: command sequence number within this type's namespace
- **dir**: data direction — `_IOC_NONE`, `_IOC_READ`, `_IOC_WRITE`, or `_IOC_READ|_IOC_WRITE`. "Read" means kernel→userspace; "write" means userspace→kernel. The naming is from the kernel's perspective.
- **size**: `sizeof` of the associated userspace struct, extracted at runtime via `_IOC_SIZE(cmd)` for pointer validation

The encoding does not enforce semantics at runtime, but it makes namespace collisions require deliberate abuse, and `_IOC_SIZE` lets you reject malformed commands before dereferencing any pointer.

### `read`/`write` — The Stream Model

The natural choice when the device produces or consumes a byte stream: serial ports, pipes, character devices. The driver implements `.read` and `.write` in `file_operations`. The kernel never allows the driver to dereference userspace pointers directly — a user page may be swapped out, may belong to a different mm context entirely, or may be mapped to a malicious address. The correct primitives:

```c
copy_to_user(void __user *to, const void *from, unsigned long n)   /* kernel→user */
copy_from_user(void *to, const void __user *from, unsigned long n) /* user→kernel */
```

Both return the number of bytes *not* copied (zero on success). They handle page faults internally and will return `-EFAULT` semantically when you check the return value. `get_user` / `put_user` are the scalar equivalents for single integers — they expand to architecture-specific assembly that avoids the function call overhead for small types.

### `poll` / `select` / `epoll` — Readiness Without Busy-Waiting

A process waiting for one fd can block in `.read`. A process waiting for *N* fds from different drivers cannot — it would need N threads or busy polling. `poll`/`select`/`epoll` solve this by asking each driver's `.poll` method whether data is available *right now*, and if not, registering the process on the driver's wait queue so it wakes when state changes.

The driver's `.poll` contract has exactly two obligations:

1. Call `poll_wait(filp, &queue, pt)` — registers the calling process on `queue` without sleeping. The `pt` argument is opaque; it belongs to the `poll`/`epoll` infrastructure.
2. Return an instantaneous bitmask: `POLLIN|POLLRDNORM` if data is readable, `POLLOUT|POLLWRNORM` if writable, `POLLERR` on error, `POLLHUP` on hangup.

The kernel then sleeps the process across *all* registered wait queues simultaneously. When any one fires, the kernel re-runs all `.poll` methods to rebuild the ready set. The `epoll` edge-triggered mode (`EPOLLET`) changes semantics: the notification fires exactly once per state transition, not once per ready state — which is why edge-triggered code must drain the fd completely on each wake.

### `mmap` — Zero-Copy Device Memory Access

For framebuffers, DMA ring buffers, and hardware register sets, the per-call cost of `read`/`write` is prohibitive. `mmap` inserts physical pages — device memory, DMA-coherent buffers, or ordinary kernel pages — directly into the process's page table. After the single `mmap(2)` syscall, all access is load/store instructions with no further kernel involvement.

The virtual-to-physical address relationship after mapping:

$$\text{phys}(a) = \text{phys\_base} + (a - \text{vma->vm\_start})$$

where $a$ is any virtual address in the mapped region, $\text{phys\_base}$ is the device's physical base address, and `vma->vm_start` is the start of the userspace mapping. The driver calls `remap_pfn_range` to install these PTEs:

```c
int my_mmap(struct file *filp, struct vm_area_struct *vma)
{
    unsigned long size = vma->vm_end - vma->vm_start;
    unsigned long pfn  = MY_DEVICE_PHYS_BASE >> PAGE_SHIFT;

    /* Prevent caching of device registers */
    vma->vm_page_prot = pgprot_noncached(vma->vm_page_prot);

    return remap_pfn_range(vma, vma->vm_start, pfn, size, vma->vm_page_prot);
}
```

`pgprot_noncached` is mandatory for MMIO regions — without it, the CPU may serve reads from its cache, which never sees the hardware's writes.

### `sysfs` — Structured Attribute Files

`sysfs` (mounted at `/sys`) mirrors the kernel's `kobject` hierarchy as a filesystem. Every device, driver, and bus appears as a directory. Attributes are files whose `.show` and `.store` callbacks read and write a single value. The invariant is **one value per file** — `sysfs` is not a data channel, it is a control/status plane.

```c
static ssize_t speed_show(struct device *dev,
                           struct device_attribute *attr, char *buf)
{
    struct my_dev *priv = dev_get_drvdata(dev);
    return sysfs_emit(buf, "%u\n", priv->speed_hz);
}

static ssize_t speed_store(struct device *dev,
                            struct device_attribute *attr,
                            const char *buf, size_t count)
{
    struct my_dev *priv = dev_get_drvdata(dev);
    unsigned int val;
    if (kstrtouint(buf, 10, &val))
        return -EINVAL;
    priv->speed_hz = val;
    return count;
}

static DEVICE_ATTR_RW(speed);  /* generates dev_attr_speed */
```

`sysfs_emit` is the correct write function since kernel 5.10 — it bounds-checks against `PAGE_SIZE` (the maximum buffer `show` may use) and replaces the older `sprintf(buf, ...)` idiom that could silently overflow.

### `procfs` — Kernel Introspection

`/proc` predates `sysfs` and has no schema. Drivers creating entries under `/proc` can emit arbitrary text. It remains correct for kernel-global diagnostics (`/proc/interrupts`, `/proc/iomem`) but is discouraged for new device drivers. Use `sysfs` for device attributes; use `debugfs` (typically mounted at `/sys/kernel/debug`) for developer-facing diagnostic data that should not be part of the stable ABI.

### `netlink` — Asynchronous Kernel-Initiated Messaging

`ioctl` is synchronous and user-initiated: the kernel cannot call it. When the kernel needs to push an event to userspace — interface link-state change, hotplug event, audit record — it uses `netlink`. Netlink is a `AF_NETLINK` socket family. The kernel sends datagrams; userspace receives them with `recv(2)`.

The networking subsystem uses `NETLINK_ROUTE` for routing table and interface events. `udev` listens on `NETLINK_KOBJECT_UEVENT` for hotplug. The generic `NETLINK_GENERIC` family lets drivers define their own message families without allocating a fixed netlink protocol number.

---
