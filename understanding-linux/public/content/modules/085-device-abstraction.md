---
id: 85
title: "Device abstraction"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
### Device Abstraction Fundamentals
Device abstraction decouples the *what* (application request) from the *how* (hardware specifics) by presenting every I/O resource through a uniform set of operations: **open**, **read/write**, **ioctl**, **mmap**, **close**. The kernel isolates hardware details inside *device drivers* and exposes a *device file* (inode) in the VFS namespace (`/dev/*`). This indirection enables the same system call interface to work for a SATA SSD, a USB flash drive, a serial port, or a GPU.

### Block vs. Character Devices – Why the Split Matters
| Property | Block Device | Character Device |
|----------|--------------|------------------|
| **Access granularity** | Fixed‑size blocks (typically 512 B–4 KiB) | Byte stream (no intrinsic size) |
| **Typical hardware** | Disk‑like storage (HDD, SSD, NVMe) | Serial consoles, keyboards, printers, framebuffers |
| **Kernel subsystem** | **Block layer** → request queue → scheduler (CFQ, BFQ, MQ‑Deadline) | **Char layer** → file_operations → no queuing |
| **Caching** | Page cache & buffer cache apply | Generally uncached (data passed straight to driver) |
| **Seek semantics** | Meaningful (`llseek` changes block offset) | Meaningful only if driver implements it (e.g., `tty`) |

The distinction is not arbitrary: block devices benefit from **request aggregation** and **I/O scheduling** because adjacent block reads/writes can be merged, reducing mechanical seek time or SSD internal erase‑block overhead. Character devices lack such locality; merging would corrupt the byte stream, so the kernel forwards each `read`/`write` directly.

### Control Paths: Explicit I/O vs. Memory‑Mapped I/O
*Explicit I/O* uses special CPU instructions (`in`/`out` on x86) that address an **I/O port space** separate from RAM. The CPU must execute a privileged instruction, causing a transition to I/O privilege level (IOPL) and incurring a fixed latency (typically ~1 µs) plus any device‑specific handshake.

*Memory‑Mapped I/O (MMIO)* maps device registers into the processor’s physical address space. The driver accesses them with ordinary load/store instructions, letting the CPU treat them like normal memory. Advantages:
- No special instruction needed → lower overhead.
- Enables use of **prefetch**, **write‑combining**, and **CPU caches** (if the device permits).
- Simpler code: `*(volatile uint32_t *)(base + offset)`.

The choice is dictated by the device’s bus: legacy ISA cards often use port‑mapped I/O; PCI(e) devices expose BARs (Base Address Registers) that are MMIO; some hybrid devices provide both.

## How It Works
### From System Call to Hardware
1. **VFS lookup** – `open("/dev/sda2", O_RDONLY)` resolves the inode via the dentry cache to a `struct block_device` (or `struct cdev` for chars).
2. **File operations dispatch** – The VFS invokes the appropriate `f_op` (`struct block_device_operations` or `struct file_operations`):
   - For block: `generic_make_request` → **request queue**.
   - For char: driver’s `read`/`write` method.
3. **Block layer processing** (if block):
   - Request is packaged as a `struct bio` (or `struct request` in the blk-mq path).
   - The request may be merged with adjacent bios (if sectors are contiguous).
   - The I/O scheduler orders requests according to its algorithm (e.g., BFQ gives time slices per process).
   - The selected request is sent to the device driver via its `queue_rq` (blk-mq) or `make_request_fn` (legacy).
4. **Driver execution**:
   - **MMIO driver**: writes command registers, polls or waits for interrupt.
   - **Port I/O driver**: executes `outb`/`inb` loops.
   - Many drivers use **DMA**: they prepare a descriptor table in RAM, tell the device the physical address via MMIO, then let the device transfer data directly to/from memory, reducing CPU overhead.
5. **Completion** – Device raises an interrupt; the driver’s ISR acknowledges it, updates the bio/request status, and wakes any waiting task via `complete()`.
6. **VFS return** – Data (if any) is copied from kernel buffers to user space; the syscall returns.

### Timing Model for a Block Device
For a rotating HDD, average service time per request can be approximated as:

$$
T_{\text{avg}} = T_{\text{seek}} + T_{\text{rot}} + \frac{L}{B}
$$

where  
- $T_{\text{seek}}$ ≈ mean seek time (manufacturer spec, e.g., 4 ms).  
- $T_{\text{rot}} = \frac{1}{2R}$ with $R$ = rotation speed in rev/s (7200 RPM → $R=120$ rev/s → $T_{\text{rot}}≈4.17$ ms).  
- $L$ = transfer length (bytes).  
- $B$ = sustained bandwidth (bytes/s, e.g., 150 MiB/s ≈ $1.57\times10^8$ B/s).

For an SSD, $T_{\text{seek}}$ and $T_{\text{rot}}$ are negligible; latency is dominated by **internal NAND access** (~50‑100 µs) plus transfer time $L/B_{SSD}$ (where $B_{SSD}$ may be 500 MiB/s).

### MMIO Address Calculation
If a device exposes a BAR of length $size$ mapped at physical address $PA_{base}$, the kernel maps it via `ioremap()` returning a virtual address $VA_{base}$. A register at offset $off$ is accessed as:

$$
\text{reg} = *(volatile uint32_t *)(VA_{base} + off)
```

The kernel must ensure `off < size` and that the mapping is **device‑consistent** (`ioremap_nocache` for non-prefetchable regions, `ioremap_wc` for write‑combining where appropriate).

## Worked Examples
### Example 1: Timing a Sequential Read on an HDD
**Goal**: Estimate time to read 1 GiB sequentially from `/dev/sda` (7200 RPM, 4 ms seek, 150 MiB/s bandwidth).

**Step‑by‑step**:
1. Convert 1 GiB to bytes: $L = 2^{30} = 1\,073\,741\,824$ B.
2. Transfer time: $T_{xfer} = L / B = 1.07\times10^9 / 1.57\times10^8 ≈ 6.82$ s.
3. Assume the drive can stream without additional seeks after the first; total latency ≈ initial seek + rotational latency + transfer:
   $$
   T_{total} ≈ T_{seek} + T_{rot} + T_{xfer}
   ≈ 0.004 + 0.0042 + 6.82 ≈ 6.83\text{ s}
   $$
4. Validate with `hdparm -tT /dev/sda` (timings) or `dd if=/dev/sda of=/dev/null bs=1M count=1024 iflag=direct`.

**C program using O_DIRECT to bypass page cache**:

```c
#define _GNU_SOURCE
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    int fd = open("/dev/sda", O_RDONLY | O_DIRECT);
    if (fd < 0) { perror("open"); return 1; }

    size_t bufsize = 1 << 20;   /* 1 MiB, must be sector‑aligned */
    void *buf;
    if (posix_memalign(&buf, 512, bufsize) != 0) {
        perror("memalign"); close(fd); return 1;
    }

    ssize_t n;
    size_t total = 0;
    while ((n = read(fd, buf, bufsize)) > 0) {
        total += n;
        if (total >= 1ULL << 30) break;
    }
    if (n < 0) perror("read");

    free(buf);
    close(fd);
    printf("Read %zu bytes\n", total);
    return 0;
}
```
*Notes*: `O_DIRECT` forces the kernel to issue requests directly to the device, avoiding double buffering; the buffer must be aligned to the device’s sector size (typically 512 B).

### Example 2: MMIO Access to a UART (16550 Compatible)
**Goal**: Transmit a byte via the UART’s THR (Transmit Holding Register) at offset 0.

**Kernel‑style snippet (for illustration; actual driver would be in a module)**:

```c
#include <linux/io.h>
#include <linux/delay.h>

#define UART_BASE   0x3F8          /* COM1 port base (legacy ISA) */
#define UART_THR    0x0            /* Transmit Holding Register */
#define UART_LSR    0x5            /* Line Status Register */
#define UART_LSR_THRE 0x20         /* THR Empty */

static void uart_putc(char c)
{
    void __iomem *base = ioremap(UART_BASE, 8);
    if (!base) return;

    /* Wait until THR is empty */
    while (!(inb(base + UART_LSR) & UART_LSR_THRE))
        cpu_relax();

    outb(c, base + UART_THR);
    iounmap(base);
}
```
*Explanation*:  
- `ioremap` maps the physical port range into kernel virtual address space (required because legacy ISA ports are not directly MMIO on x86, but the CPU treats them as a special I/O space; the macro `inb/outb` internally uses the appropriate instruction).  
- The loop polls the Line Status Register until the THR empty bit is set, ensuring we don’t overrun the UART’s 1‑byte FIFO.  
- `cpu_relax()` issues a pause instruction to reduce power consumption on SMP.

### Example 3: Creating a Character Device Node with Correct Major/Minor
Suppose a driver registers a char device with major number `240` and wants to provide three minor devices (0‑2).

```bash
# Load the driver (assumes it exported a class "mydev")
sudo modprobe mydev   # creates /dev/mydev[0-2] via udev

# Verify
ls -l /dev/mydev*
# Output example:
# crw-rw---- 1 root dialout 240, 0 Jan  1 12:00 /dev/mydev0
# crw-rw---- 1 root dialout 240, 1 Jan  1 12:00 /dev/mydev1
# crw-rw---- 1 root dialout 240, 2 Jan  1 12:00 /dev/mydev2

# Manual creation (if udev not used):
sudo mknod /dev/mydev0 c 240 0
sudo mknod /dev/mydev1 c 240 1
sudo mknod /dev/mydev2 c 240 2
sudo chmod 660 /dev/mydev[0-2]
sudo chgrp dialout /dev/mydev[0-2]
```
*Why*: The file’s type (`c`) signals a character device; the major/minor pair tells the kernel which `struct cdev` to route operations to.

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Assuming `/dev/sda` is a raw disk and using `read()` without `O_DIRECT`** | Data goes through the page cache; performance measurements include cache effects, not true device latency. | Leads to optimistic benchmark results and misunderstanding of I/O stack overhead. |
| **Using the same major number for two unrelated drivers** | The kernel dispatches based on `<major,minor>` only; the second driver’s `cdev` registration fails with `-EBUSY`. | Device nodes become inaccessible; dmesg shows “cdev add failed”. |
| **Programming a PCIe BAR with `memcpy` instead of `ioread32/iowrite32`** | On some architectures (e.g., ARM, PowerPC) plain accesses may be reordered or not guarantee device ordering. | Causes race conditions, lost interrupts, or hardware lock‑up. |
| **Neglecting to align buffers for DMA** | Many devices require DMA addresses to be page‑aligned (often 4 KiB) and size‑aligned to the transfer granularity. | Misaligned DMA can trigger silent data corruption or device‑reported errors. |
| **Issuing a non‑queued write (`O_SYNC`) to a rotational disk expecting low latency** | `O_SYNC` forces a cache flush after each write, turning every operation into a full rotation + seek. | Severely degrades throughput; appropriate only for metadata that must survive power loss. |
| **Confusing `blkdev_get` with `open` for block devices** | `blkdev_get` bumps the block device’s open count but does **not** provide a file descriptor for data transfer. | Using the returned struct as if it were a file leads to kernel oops or undefined behavior. |

## Exercises
### Easy
1. **List & classify** – Run `ls -l /dev/sd* /dev/tty*` and identify which entries are block (`b`) and which are character (`c`). Explain how the major/minor numbers relate to the device type using `cat /proc/devices`.
2. **Timing a cached read** – Use `dd if=/dev/sda of=/dev/null bs=4K count=1000` and compare with the same command adding `iflag=direct`. Report the difference and relate it to the page cache effect.

### Medium
3. **Measure rotational latency** – On a system with an HDD, run `hdparm -tT /dev/sda` and extract the timing values. Using the formula $$T_{rot}=1/(2R)$$ compute the implied RPM and compare with the drive’s label.
4. **Simple MMIO driver** – Write a kernel module that maps the legacy UART (`0x3F8`) and prints a character to the serial console using `outb`. Use `module_init`/`module_exit` and `ioremap`. Verify output on a physical serial port or a QEMU `-serial stdio`.
5. **Create a ramdisk block device** – Use `modprobe brd rd_size=16384` (16 MiB) to create `/dev/ram0`. Format it with `mkfs.ext4 /dev/ram0`, mount it, and run a workload (e.g., `fio --name=test --filename=/dev/ram0 --rw=read --bs=4K --size=100M --direct=1`). Compare the bandwidth to that of a real SSD.

### Hard
6. **Implement a request‑queue elevator** – In a custom block device driver (based on `rambrk`), replace the default MQ deadline scheduler with a simple FIFO queue. Show how the request latency changes under a random I/O workload (use `fio --randread=1`). Explain why FIFO is worse for rotating media.
7. **DMA alignment test** – Allocate a buffer with `dma_alloc_coherent` in a driver, deliberately misalign it by 1 byte, and attempt a DMA transfer. Capture the kernel error message and explain the hardware constraint that caused the failure.
8. **udev rule creation** – Write a udev rule that symlinks `/dev/my_nvme0` to the NVMe device whose serial number equals `ABCD1234`. Test by plugging/unplugging an NVMe USB‑caddy and verifying the symlink persists.

## Linux Connection
### Subsystems & Filesystems Involved
- **Virtual Filesystem Switch (VFS)** – provides the `inode`, `dentry`, and `file` abstractions; `struct block_device` and `struct cdev` attach to the VFS.
- **Block Layer** – `include/linux/blkdev.h`, `block/blk-core.py`, `block/blk-mq.c`. Manages request queues (`struct request_queue`) and elevator algorithms (`cfq-iosched.py`, `bfq-iosched.c`).
- **SCSI Midlayer** – translates block requests to SCSI commands (`scsi/scsi_host.c`); used by most modern storage (SATA, SAS, NVMe via SCSI translation layer).
- **NVMe Driver** – `drivers/nvme/host/` – uses PCIe MMIO BARs and a command/submission queue pair (admin + I/O queues) with shared memory rings.
- **TTY Subsystem** – `drivers/tty/` – implements character devices for serial consoles, virtual consoles, PTYs.
- **udev** – Userspace daemon (`/usr/lib/udev/udevd`) that reads kernel uevents (`/sys/*/uevent`) and creates/removes device nodes in `/dev` according to rules in `/lib/udev/rules.d/`.
- **sysfs** – Exports device attributes: `/sys/block/sda/queue/` (scheduler, nr_requests), `/sys/class/tty/tty0/` (device-specific files), `/sys/bus/pci/devices/0000:03:00.0/resource` (MMIO BAR addresses).
- **procfs** – `/proc/partitions`, `/proc/diskstats`, `/proc/interrupts` for runtime diagnostics.

### Concrete Commands & Code
```bash
# Show block devices and their scheduler
for dev in /sys/block/*/queue/scheduler; do
    b=$(basename $(dirname $dev))
    echo -n "$b: "; cat $dev
done

# Show UART registers via devmem (requires root)
sudo devmem 0x3F8 32   # read 32‑bit from COM1 base
sudo devmem 0x3F8 8 0x41   # write 'A' to THR

# List character devices with major 240 (example)
grep '240' /proc/devices

# Create a persistent udev rule for a custom device
echo 'SUBSYSTEM=="mem", CHAR, NAME=="mydev0", MODE="0660", GROUP="dialout"' | \
    sudo tee /etc/udev/rules.d/99-mydev.rules
sudo udevadm control --reload
sudo udevadm trigger --subsystem-match=mem

# Verify
ls -l /dev/mydev0
```

### Kernel Source Highlights
- `drivers/base/core.c` – device model (struct device, bus_type).
- `drivers/char/mem.c` – implementation of `/dev/null`, `/dev/zero`, `/dev/full`.
- `block/blk-mq.c` – multi‑queue block layer, request allocation.
- `include/linux/io.h` – `ioremap`, `iowrite32`, `ioread32`.
- `fs/devpts/devpts.c` – pseudoterminal PTY master/slot (character device).

Understanding these components lets you trace a single I/O request from an application’s `read()` system call, through VFS, block/char layer, scheduler, driver, hardware interrupt, and back—providing the foundation for performance tuning, driver development, and systems‑level debugging.

## Why This Matters
Device abstraction is the linchpin that transforms a heterogeneous collection of hardware into a coherent, programmable interface. By mastering the **block/character distinction**, you can choose the right I/O pattern (sequential bulk vs. byte‑stream) and avoid pathological performance bugs. Grasping **explicit vs. memory‑mapped I/O** lets you write drivers that minimize overhead and correctly handle ordering guarantees on modern SMP and weakly‑ordered architectures. The **control‑path timing model** equips you to predict latency, size I/O requests optimally, and select appropriate schedulers (CFQ for fairness, BFQ for low‑latency interactive workloads, MQ‑Deadline for SSDs). 

In Linux, these ideas are not abstract: they appear as tunable sysfs entries (`/sys/block/*/queue/`), as kernel configuration options (`CONFIG_BLK_DEV_INITRD`, `CONFIG_SERIAL_8250`), and as concrete tools (`lsblk`, `udevadm`, `hdparm`, `perf`). Knowing where to look and how to interpret the data turns a vague notion of “the OS talks to hardware” into a precise, actionable skill set—whether you are tuning a database’s I/O profile, debugging a stuck UART, or writing a high‑performance NVMe driver. This deeper understanding compounds as you move into filesystems, networking, and virtualization, where the same principles of abstraction, queuing, and hardware‑software contract recur at every layer.
