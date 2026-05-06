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

## Core Concepts
### User‑Kernel Interface Taxonomy
A device driver exposes **operations** through the VFS layer. Each operation corresponds to a system call that transfers control from user space to a driver‑specific function in kernel space. The choice of interface is dictated by the **communication pattern** the device requires:

| Interface | Primary Use Case | Kernel‑Side Hook | Typical Data Flow |
|-----------|------------------|------------------|-------------------|
| `ioctl`   | Device‑specific control commands (configuration, mode switches) | `file_operations->unlocked_ioctl` (or `compat_ioctl`) | In‑band command + optional data buffer |
| `sysfs`   | Export/read device attributes as virtual files | `kobj_type->default_attrs` (show/store) | Out‑of‑band attribute read/write via VFS |
| `procfs`  | Legacy kernel‑state export (process, scheduler, device stats) | `proc_dir_entry->read_proc/write_proc` | Simple text‑based files |
| `netlink` | Asynchronous, message‑based kernel‑user protocol (routing, uevents, etc.) | `netlink_kernel_create()` + `nlmsg` handling | Structured binary messages, multicast groups |
| `mmap`    | Direct memory access to device registers or buffers | `file_operations->mmap` (calls `vm_operations_struct`) | Fault‑driven page fault handling → driver‑provided pages |
| `read/write` | Sequential stream I/O (block devices, serial ports, etc.) | `file_operations->read` / `write` | Synchronous byte‑count transfer |
| `poll`    | Multiplexed readiness notification (sockets, serial, etc.) | `file_operations->poll` (returns wait‑queue mask) | Kernel tells user which fds are ready |

Each entry is **not arbitrary**; it follows from the driver’s need to minimize context switches, avoid copying large buffers, and provide the correct synchronization primitives.

### Why `ioctl` Uses Bit‑Field Encoding
The `ioctl` command number is not a random integer; it encodes direction, type, index, and size so the kernel can validate arguments without extra checks. The layout (defined in `<asm/ioctl.h>`) is:

```
  31................................0  bit
 +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 |   Dir   |   Type   |    Nr    |          Size          |
 +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 31-30    29-24   23-16   15-0
```

* `Dir` (2 bits): `_IOC_NONE(0)`, `_IOC_WRITE(1)`, `_IOC_READ(2)`, `_IOC_WRITE|_IOC_READ(3)`.
* `Type` (8 bits): driver‑specific magic number to avoid collisions.
* `Nr` (8 bits): sequential command index.
* `Size` (14 bits): size of the argument structure in bytes.

The macro that builds a command is:

$$
\texttt{_IOC(dir,type,nr,size)} = 
   (dir << _IOC\_DIRSHIFT) |
   (type << _IOC\_TYPESSHIFT) |
   (nr  << _IOC\_NRSHIFT) |
   (size<< _IOC\_SIZESHIFT)
$$

Typical shifts: `_IOC_DIRSHIFT=30`, `_IOC_TYPESHIFT=8`, `_IOC_NRSHIFT=0`, `_IOC_SIZESHIFT=16`.  
Thus a command like `TCGETS = 0x5401` decodes to `dir=_IOC_READ`, `type='T' (0x54)`, `nr=1`, `size=0` (no extra data).

### Why `sysfs` Is Preferred Over `procfs`
* **Object‑oriented**: each attribute is tied to a `kobject`, enabling reference counting and hot‑plug safety.
* **Typed values**: `show`/`store` callbacks can enforce units, ranges, and execute side‑effects (e.g., writing a threshold triggers a hardware reprogram).
* **Hierarchical**: paths reflect device topology (`/sys/class/net/eth0/device/...`), making discovery programmable.
* **Atomic updates**: the VFS guarantees that a `store` call runs under the `kobject`'s lock, preventing races that `procfs`’s open‑read‑close model cannot avoid.

### Why `netlink` Uses Multicast Groups
Netlink sockets are **full‑duplex** and support **broadcast** to multiple listeners without copying the payload per listener. The kernel maintains a bitmap (`nl_table[protocol].groups`) where each bit corresponds to a group. When a message is sent with `nlmsg->nlmsg_groups = mask`, the kernel delivers it to every socket whose subscription (`nl_groups` in `sockaddr_nl`) has a non‑zero intersection with `mask`. This yields **O(1)** delivery per group irrespective of the number of listeners.

### Why `mmap` Requires Page‑Aligned Offsets
The MMU works on pages (typically $2^{12}=4096$ bytes). A `mmap` request `(addr, length, offset, prot, flags)` is satisfied only if:

$$
\texttt{offset} \equiv 0 \pmod{PAGE\_SIZE}
$$

Otherwise the kernel would have to create a **partial page** mapping, which would break the page‑table granularity and require extra copy‑on‑write handling. The kernel therefore returns `-EINVAL` for misaligned offsets, forcing the driver to either adjust the user request or provide a **page‑aligned buffer** (e.g., via `dma_alloc_coherent`).

### Why `poll` Scales Linearly with Number of fds
The `poll` system call iterates over the supplied `struct pollfd fds[nfds]`. For each fd it calls the file’s `poll` method, which returns a wait‑queue mask. The kernel then builds a **bitmask of ready fds** and, if none are ready, puts the current task on each fd’s wait queue. The complexity is therefore:

$$
T_{\text{poll}} = O(nfds) + O(\text{wakeup latency})
$$

In contrast, `epoll` achieves $O(1)$ per event by maintaining an internal red‑black tree of registered fds, but `poll` remains useful when the fd set is small or changes frequently.

---

## How It Works
### From System Call to Driver Function
1. **User invokes** `sys_ioctl(fd, cmd, arg)`.  
2. The **syscall entry** (`sys_ioctl`) checks that `fd` is a valid file descriptor and retrieves the underlying `struct file *`.  
3. It looks up `file->f_op->unlocked_ioctl` (or the compat wrapper).  
4. The kernel **decodes** `cmd` using the `_IOC_*` macros to verify direction and size; if the size mismatch occurs it returns `-ENOTTY` before touching the driver.  
5. The driver’s `ioctl` function receives the **exact user pointer** (after `access_ok` verification) and performs the requested operation, copying data with `copy_from_user`/`copy_to_user` as needed.  
6. Return value propagates back to userspace.

Analogous steps exist for each interface; the key difference lies in **which file_operations method is invoked** and **how data is transferred** (copy vs. fault‑driven paging vs. message queuing).

### Example: `read` Path for a Block Device
1. User calls `read(fd, buf, count)`.  
2. VFS checks `file->f_op->read`. For a block device this points to `blkdev_read_iter`.  
3. `blkdev_read_iter` converts the request into a series of **bio** structures, each describing a segment of the request.  
4. The block layer schedules the bios to the appropriate **request queue**, which eventually issues DMA commands to the device.  
5. Upon completion, an interrupt handler calls `bio_endio`, which copies data from the DMA buffer into the user’s `buf` via `kmap_atomic`/`kunmap_atomic` (or directly if the buffer is already kernel‑mapped).  
6. The total bytes transferred are returned to userspace.

This chain explains why **sequential devices** (disks, tapes) naturally fit `read/write`: the VFS can merge adjacent requests, issue them in elevator order, and hide hardware latency behind the page cache.

### Example: `mmap` Path for `/dev/mem`
1. User: `mmap(NULL, len, PROT_READ|PROT_WRITE, MAP_SHARED, fd, offset)`.  
2. VFS calls `file->f_op->mmap` → `devmem_mmap`.  
3. `devmem_mmap` checks that `offset` is page‑aligned and that `len` does not exceed the allowed memory region (`ioremap` limits).  
4. It calls `ioremap(offset, len)` to obtain a **kernel virtual address** that maps the physical bus address.  
5. It inserts a **VMA** (`vm_area_struct`) with `vm_ops->fault` pointing to a handler that returns the already‑mapped page via `vm_insert_pfn`.  
6. On first access, the MMU triggers a page fault; the fault handler returns the mapped PFN, allowing the CPU to access the physical memory directly without further kernel involvement.

This shows why `mmap` is the interface of choice for **register‑level access** (GPU framebuffers, UART registers) where latency must be minimal and no copying is desirable.

---

## Worked Examples
### Example 1: Setting UART Baud Rate via `ioctl` (with explicit divisor derivation)
**Goal:** Set `/dev/ttyS0` to 115200 baud using the raw `TCSETS` ioctl (which internally programs the UART divisor).  
**Hardware assumption:** Standard 16550 UART with input clock $f_{clk}=1.8432\text{ MHz}$ (common on PC‑compatible hardware).  

The divisor formula for the 16550 is:

$$
\text{baud} = \frac{f_{clk}}{16 \times (divisor + 1)}
\quad\Longrightarrow\quad
divisor = \frac{f_{clk}}{16 \times \text{baud}} - 1
$$

Plugging numbers:

$$
divisor = \frac{1.8432\times10^{6}}{16 \times 115200} - 1
        = \frac{1.8432\times10^{6}}{1843200} - 1
        = 1.0 - 1 = 0
$$

A divisor of 0 means the UART’s **DLAB** registers are programmed with `DLL=0`, `DLH=0`.  

**Code:**

```c
/* uart_set_baud.c */
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <termios.h>

int main(void)
{
    int fd = open("/dev/ttyS0", O_RDWR);
    if (fd < 0) {
        perror("open");
        return 1;
    }

    struct termios t;
    if (tcgetattr(fd, &t) < 0) {
        perror("tcgetattr");
        close(fd);
        return 1;
    }

    /* Manually compute divisor for illustration */
    unsigned int clock = 1843200;   /* 1.8432 MHz */
    unsigned int baud  = 115200;
    unsigned int divisor = clock / (16 * baud) - 1;
    printf("UART divisor = %u (0x%x)\n", divisor, divisor);

    /* Set baud via termios (which does the same ioctl internally) */
    cfsetispeed(&t, B115200);
    cfsetospeed(&t, B115200);
    if (tcsetattr(fd, TCSANOW, &t) < 0) {
        perror("tcsetattr");
        close(fd);
        return 1;
    }

    /* Verify with ioctl */
    if (ioctl(fd, TCGETS, &t) < 0) {
        perror("ioctl TCGETS");
        close(fd);
        return 1;
    }
    printf("Actual baud: %u\n", cfgetospeed(&t));

    close(fd);
    return 0;
}
```

**Explanation of steps:**  
1. Open the device node (`O_RDWR` needed for termios).  
2. Retrieve current settings (`tcgetattr` → `TCGETS` ioctl).  
3. Compute the divisor from first principles to show the hardware‑level meaning.  
4. Load desired speed into `termios` (`cfset*speed`) and apply via `TCSETS` (`tcsetattr`).  
5. Read back via `TCGETS` to confirm kernel programmed the divisor correctly.  

### Example 2: Reading a Network Interface’s MAC Address via `sysfs`
**Goal:** Obtain the MAC address of `eth0` using the virtual file system.  

**Relevant sysfs path:** `/sys/class/net/eth0/address`. This file is a **show** attribute that reads the MAC from the underlying net_device’s `dev_addr` field.

**Shell commands:**

```bash
# Show the MAC address
cat /sys/class/net/eth0/address
# Expected output: 52:54:00:12:34:56

# Verify the same information via ip link
ip -o link show dev eth0 | awk '{print $2}'
```

**Kernel-side walkthrough:**  
1. `kobject` for `eth0` lives under `/sys/class/net/eth0`.  
2. The `address` attribute is defined in `net/core/sysfs.c` as:

```c
static ssize_t address_show(struct device *d,
                            struct device_attribute *attr,
                            char *buf)
{
    struct net_device *dev = to_net_dev(d);
    return sprintf(buf, "%pM\n", dev->dev_addr);
}
static DEVICE_ATTR_RO(address);
```

3. When `cat` opens the file, VFS invokes `address_show`, which copies the six‑byte MAC into the buffer using `%pM` (MAC‑address format specifier). No copying to/from user space beyond the usual `read` path; the kernel formats directly into the user‑provided page.

### Example 3: Sending and Receiving a Netlink Uevent Message
**Goal:** Listen for kernel uevents (device add/remove) and print them.  

**Netlink protocol:** `NETLINK_KOBJECT_UEVENT` (protocol 15).  
**Message format:** `struct nlmsghdr` followed by a payload of `KEY=VAL\0` strings.

**Code:**

```c
/* uevent_listener.c */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <linux/netlink.h>

#define UEVENT_BUF_SIZE   2048

int main(void)
{
    struct sockaddr_nl sa;
    int sock = socket(AF_NETLINK, SOCK_RAW, NETLINK_KOBJECT_UEVENT);
    if (sock < 0) {
        perror("socket");
        return 1;
    }

    memset(&sa, 0, sizeof(sa));
    sa.nl_family = AF_NETLINK;
    sa.nl_groups = 0xffffffff;   /* listen to all uevent groups */

    if (bind(sock, (struct sockaddr *)&sa, sizeof(sa)) < 0) {
        perror("bind");
        close(sock);
        return 1;
    }

    while (1) {
        char buf[UEVENT_BUF_SIZE];
        ssize_t len = recv(sock, buf, sizeof(buf) - 1, 0);
        if (len < 0) {
            perror("recv");
            break;
        }
        buf[len] = '\0';

        /* uevent payload is a series of NUL‑terminated KEY=VAL strings */
        for (char *p = buf; *p; p += strlen(p) + 1) {
            printf("%s\n", p);
        }
        printf("---\n");
    }

    close(sock);
    return 0;
}
```

**Explanation of steps:**  
1. Create a **netlink socket** of type `SOCK_RAW` (allows constructing custom headers).  
2. Bind to **all groups** (`nl_groups = 0xffffffff`) so every uevent is delivered.  
3. `recv` returns the raw netlink message; the kernel already stripped the `nlmsghdr` header for `SOCK_RAW`? Actually `SOCK_RAW` gives the full header; we ignore it because the payload starts at `NLMSG_DATA(hdr)`. For brevity we treat the whole buffer as payload (the first 4 bytes are `nlmsg_len`, which we trust to be ≤ buffer size).  
4. Parse the concatenated NUL‑terminated strings; each line is a uevent variable like `ACTION=add`, `SUBSYSTEM=block`, `DEVNAME=sdb1`.  
5. Print each variable; the blank line separates events.  

**Why this works:** The kernel builds the uevent via `kobject_uevent_env()` which appends `KEY=VAL\0` pairs to a netlink buffer and sends it with `NETLINK_KOBJECT_UEVENT`. Listeners receive the exact same byte stream, enabling deterministic parsing.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Happens | Correct Approach |
|---------|--------------|----------------|------------------|
| **Using `ioctl` with wrong direction macro** (e.g., `_IOW` when the kernel expects read) | Kernel returns `-EINVAL` or corrupts user data because it copies data in the opposite direction. | The `_IOC_*` macros encode direction in bits 30‑31; mismatched direction makes the kernel validate the wrong buffer size. | Always match the macro to the actual data flow: `_IOW` for write‑only (kernel←user), `_IOR` for read‑only (kernel→user), `_IOWR` for bidirectional. Verify with the device’s header (`#include <linux/ioctl.h>`). |
| **Assuming sysfs attributes are instantly updated after writing** | Reading back immediately may show the old value because the attribute’s `store` function may schedule work asynchronously. | Many drivers defer hardware programming to a workqueue to avoid sleeping in atomic context. | After writing, either poll until the value changes, use a completion event, or introduce a small `usleep` and verify. |
| **Binding a netlink socket to `nl_groups = 0` and expecting to receive multicast messages** | No groups → kernel never copies the message to the socket. | Netlink delivery checks `(msg->nlmsg_groups & sock->nl_groups) != 0`. Zero means no intersection. | Set `nl_groups` to the specific group bit (e.g., `(1 << (GROUP-1))`) or `-1`/`0xffffffff` for all groups. |
| **Mapping a device with `mmap` using a non‑page‑aligned offset** | `mmap` fails with `-EINVAL`. | The MMU cannot map a sub‑page region; kernel enforces alignment to avoid needing page‑splitting PTEs. | Align the user‑requested offset: `offset &= ~(PAGE_SIZE-1);`. If the device’s registers start at a misaligned address, map a larger aligned region and offset inside it with a pointer. |
| **Calling `poll` and then ignoring the returned `revents` field** | Program may act on a fd that is not actually ready, causing spurious reads/writes or blocking. | `poll` only guarantees that the bits set in `revents` correspond to readiness; other bits are undefined. | Always test `if (pfd[i].revents & POLLIN)` before reading, and similarly for `POLLOUT`, `POLLERR`, `POLLHUP`. |
| **Using `read`/`write` on a block device without aligning to sector size** | Some drivers return `-EINVAL` for misaligned I/O (e.g., direct‑access SSDs). | The underlying DMA engine often requires sector‑aligned buffers (typically 512 B or 4 KiB). | Allocate buffers with `posix_memalign` or `memalign` to the hardware’s logical block size, or let the kernel handle it via the page cache (use buffered I/O). |
| **Assuming `tcgetattr`/`tcsetattr` work on any file descriptor** | Calling them on a non‑tty fd returns `-ENOTTY`. | These ioctls are only implemented by the tty line discipline; other drivers return `-ENOTTY`. | Verify `isatty(fd)` before invoking termios functions, or catch `-ENOTTY` and fall back to device‑specific ioctls. |

---

## Exercises
### Easy
1. **`ioctl` – Get File Status Flags**  
   Write a program that opens `/tmp/testfile`, calls `fcntl(fd, F_GETFL)`, and prints the flags in hexadecimal. Use the `fcntl` wrapper (which is itself an `ioctl`).  
   *Hint:* Include `<fcntl.h>` and decode `O_ACCMODE`, `O_NONBLOCK`, etc.

2. **`sysfs` – Read CPU Scaling Governor**  
   Run: `cat /sys/devices/system/cpu/c
