---
id: 113
title: "Character device infrastructure"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

When a process calls `read()` on `/dev/ttyS0`, the kernel executes the same `sys_read` entry point it uses for a regular file on ext4. The divergence happens exactly once: the VFS checks the inode's `i_fop` pointer and dispatches to whatever `file_operations` table the owning driver registered. This single indirection is why `/dev/ttyS0`, `/dev/urandom`, and `/proc/cpuinfo` all behave like files to userspace despite having nothing to do with storage.

Without this layer, each new device class would require modifying the VFS itself. Instead, a driver author writes six or seven functions, registers a table of pointers, and the entire POSIX I/O interface — `open`, `read`, `write`, `lseek`, `ioctl`, `mmap`, `poll` — becomes available to userspace automatically, with the driver only implementing the operations it actually supports.

## Core Concepts

### Device Nodes

A device node is an inode whose type bits are `S_IFCHR` (character) or `S_IFBLK` (block), and whose `i_rdev` field holds a `dev_t` — a 32-bit value encoding a major and minor number. The node holds no data. When the VFS opens it, it calls `chrdev_open()` (for character devices), which looks up the major number in `cdev_map` (a `kobj_map` structure defined in `fs/char_dev.c`), finds the registered `cdev`, and installs the driver's `file_operations` pointer into the `struct file` being created.

Major and minor numbers are each 12 bits wide:

$$\text{dev\_t} = (\text{major} \ll 20) \mid \text{minor}$$

which is why `MAJOR(dev)` is `(dev >> 20)` and `MINOR(dev)` masks the low 20 bits. The historical 8-bit limit (255 majors, 255 minors) was lifted in kernel 2.6 by widening `dev_t` from 16 to 32 bits.

You can inspect the live major/minor assignments:

```bash
cat /proc/devices          # shows registered char and block majors
ls -l /dev/ttyS0           # crw-rw---- 1 root dialout 4, 64 ...
                           #                            ^  ^
                           #                          major minor
stat --format="%t %T" /dev/ttyS0   # hex major, hex minor
```

The device node itself is created either by `udev` (responding to `uevent` netlink messages from the kernel) or manually with `mknod`. The node is just a name; deleting it does not unregister the driver.

### The `file_operations` Struct

`struct file_operations` (defined in `<linux/fs.h>`) is the contract between a driver and the VFS. Every field is a function pointer; unimplemented operations are left `NULL`. The VFS checks for `NULL` before calling: a `NULL` `llseek` causes the VFS to return `-ESPIPE` for pipes or use `default_llseek` for regular files, depending on context — but for character devices you almost always want to set `.llseek = no_llseek` explicitly to prevent userspace from accidentally advancing an offset that means nothing to your hardware.

The fields most relevant to character drivers:

```c
struct file_operations {
    struct module *owner;
    loff_t  (*llseek)  (struct file *, loff_t, int);
    ssize_t (*read)    (struct file *, char __user *, size_t, loff_t *);
    ssize_t (*write)   (struct file *, const char __user *, size_t, loff_t *);
    long    (*unlocked_ioctl)(struct file *, unsigned int, unsigned long);
    long    (*compat_ioctl)  (struct file *, unsigned int, unsigned long);
    int     (*mmap)    (struct file *, struct vm_area_struct *);
    int     (*open)    (struct inode *, struct file *);
    int     (*release) (struct inode *, struct file *);
    __poll_t (*poll)   (struct file *, struct poll_table_struct *);
    /* ... */
};
```

`.owner = THIS_MODULE` is not optional in practice: it holds a reference to your module so the kernel refuses to `rmmod` it while an open file description exists, preventing a use-after-free on the function pointers themselves.

`compat_ioctl` exists because on a 64-bit kernel running a 32-bit process, pointer sizes differ. If your ioctl passes structs containing pointers, you need `compat_ioctl` to fix up the layout. Omitting it silently breaks 32-bit userspace on 64-bit systems — a common source of hard-to-diagnose failures.

### ioctl: Out-of-Band Control

`read()` and `write()` are byte streams. They cannot express "set baud rate to 115200" or "query hardware serial number" without inventing an in-band encoding that userspace and kernel must agree on — fragile and unversioned. `ioctl()` provides a typed, numbered command space instead.

The 32-bit request code is structured as:

$$\underbrace{[31:30]}_{\text{dir (2)}} \underbrace{[29:16]}_{\text{size (14)}} \underbrace{[15:8]}_{\text{type (8)}} \underbrace{[7:0]}_{\text{nr (8)}}$$

The **size** field (14 bits, max $2^{14}-1 = 16383$ bytes) lets the kernel call `access_ok()` on the user pointer *before* dispatching to the driver. This is the concrete reason ioctl exists as a distinct syscall rather than a `write()` convention: the kernel can validate the pointer using only the request code, without trusting anything the driver says.

The **type** byte (called a "magic number" in documentation) namespaces commands. Assignments are listed in `Documentation/userspace-api/ioctl/ioctl-number.rst` to prevent collisions between drivers.

Building request codes:

```c
#define MYDEV_MAGIC 'k'                             /* chosen from ioctl-number.rst */

#define MYDEV_RESET   _IO  (MYDEV_MAGIC, 0)         /* no argument */
#define MYDEV_GETVAL  _IOR (MYDEV_MAGIC, 1, int)    /* kernel → user: int */
#define MYDEV_SETVAL  _IOW (MYDEV_MAGIC, 2, int)    /* user → kernel: int */
#define MYDEV_SWAP    _IOWR(MYDEV_MAGIC, 3, int)    /* bidirectional */
```

At compile time, `_IOR(MYDEV_MAGIC, 1, int)` expands to:

$$((\_IOC\_READ) \ll 30) \mid (\texttt{sizeof(int)} \ll 16) \mid ({\texttt{'k'}}) \ll 8) \mid 1$$

which for a 64-bit kernel where `sizeof(int) = 4` gives `0x80046b01`. You can verify:

```bash
python3 -c "
import ctypes, fcntl
IOC_READ = 2
val = (IOC_READ << 30) | (4 << 16) | (ord('k') << 8) | 1
print(hex(val))   # 0x80046b01
"
```

## How It Works

### Registration

A driver claims a range of character devices through one of two paths:

```c
/* Static: you already know you want major 240 */
int register_chrdev_region(dev_t first, unsigned int count, const char *name);

/* Dynamic: let the kernel pick an unused major */
int alloc_chrdev_region(dev_t *dev, unsigned baseminor,
                        unsigned count, const char *name);
```

Always prefer `alloc_chrdev_region`. Static major numbers require coordination across the entire kernel tree (see `Documentation/admin-guide/devices.txt`); dynamic allocation avoids collisions and works correctly in any deployment.

After allocation, the driver initializes a `cdev` and makes it live:

```c
static struct cdev my_cdev;
static dev_t       my_devno;   /* filled by alloc_chrdev_region */

/* In module_init: */
alloc_chrdev_region(&my_devno, 0, 1, "mydev");
cdev_init(&my_cdev, &my_fops);
my_cdev.owner = THIS_MODULE;
cdev_add(&my_cdev, my_devno, 1);   /* device is live after this line */

/* In module_exit: */
cdev_del(&my_cdev);
unregister_chrdev_region(my_devno, 1);
```

The ordering matters: `cdev_add` makes the device immediately openable. Any class/device creation for udev (`class_create`, `device_create`) must happen *before* `cdev_add` if you want udev to have created the `/dev` node before userspace can race to open it — though in practice the race window is tiny and most drivers don't bother.

### The `file_operations` Table in Practice

```c
#include <linux/fs.h>
#include <linux/uaccess.h>

#define BUF_SIZE 4096
static char kernel_buf[BUF_SIZE];

static ssize_t my_read(struct file *file, char __user *buf,
                       size_t count, loff_t *offset)
{
    size_t available = BUF_SIZE - *offset;

    if (*offset >= BUF_SIZE)
        return 0;                      /* EOF */

    count = min(count, available);     /* clamp to what remains */

    if (copy_to_user(buf, kernel_buf + *offset, count))
        return -EFAULT;

    *offset += count;
    return count;
