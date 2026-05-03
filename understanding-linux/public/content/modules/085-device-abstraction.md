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

## Why This Matters

A keyboard, a hard disk, and a GPU are physically nothing alike — yet your C program can `open()`, `read()`, and `write()` all of them using the same five system calls. This uniformity is not accidental: the kernel imposes a rigid interface contract on hardware, and drivers translate between that contract and physical reality. The abstraction is load-bearing. When it breaks — a driver that misreports its block size, an `ioctl` that silently ignores an argument, a character device that blocks forever because nobody drained the receive buffer — the failure propagates upward: corrupted filesystems, unkillable processes, silent data loss. Understanding the abstraction means understanding exactly where the seams are.

## Core Concepts

### The Canonical Device Model

At the hardware level, every device exposes a small set of **registers** the CPU can read and write:

- **Status register**: encodes device state — busy, idle, error condition, interrupt pending.
- **Command register**: receives operation codes — read sector, write sector, reset, seek.
- **Data register**: transfers payload bytes between CPU and device.

The CPU reaches these registers via one of two mechanisms. With **port-mapped I/O (PMIO)**, dedicated x86 instructions address the device by a 16-bit port number — a namespace entirely separate from physical memory. Only the kernel may execute these instructions; attempting them in user space raises a `#GP` fault.

```asm
; x86 port I/O: read one byte from port 0x60 (PS/2 keyboard data register)
in al, 0x60

; write command byte 0xAE (enable keyboard) to port 0x64 (controller command)
mov al, 0xAE
out 0x64, al
```

With **memory-mapped I/O (MMIO)**, the hardware places its registers at specific physical addresses. The firmware (ACPI tables, device tree) tells the OS where. A normal load or store to that address hits the device, not DRAM — the memory controller routes the transaction to the device bus instead. In C, accessing an MMIO register looks like a pointer dereference, but the `volatile` qualifier is mandatory: without it, the compiler may optimize away "redundant" reads of a status register that changes in hardware.

```c
/* Hypothetical UART status register at physical address 0x09000000 (ARM PL011) */
#define UART_BASE   0x09000000UL
#define UART_FR     (*(volatile uint32_t *)(UART_BASE + 0x18))  /* Flag register */
#define UART_DR     (*(volatile uint32_t *)(UART_BASE + 0x00))  /* Data register */
#define UART_FR_TXFF (1u << 5)   /* TX FIFO full */

void uart_putc(char c) {
    while (UART_FR & UART_FR_TXFF)
        ;           /* spin until transmit FIFO has space */
    UART_DR = c;
}
```

MMIO dominates modern hardware because it needs no special ISA support, integrates naturally with virtual memory protection, and lets the cache subsystem apply write-combining to device memory ranges — a meaningful throughput gain for framebuffers and NIC descriptor rings.

### Block vs. Character Devices

Linux divides devices into two fundamental classes based on the shape of their data access.

**Block devices** transfer data in fixed-size chunks and support random access — you can seek to any block. The kernel interposes a **page cache** between the application and the device: a `read()` that hits cached data never reaches hardware. Hard disks, SSDs, NVMe drives, and loop devices are block devices. The consequence of this design is that write ordering becomes non-trivial: data may sit in the page cache for seconds before reaching the disk. A crash in that window loses writes. This is why `fsync(2)` exists — it forces the cache to drain and waits for the device to acknowledge persistence.

**Character devices** stream data with no seeking and no kernel buffering layer. A `read()` on a character device returns whatever bytes are available now, up to the requested count — nothing is held back waiting to fill a block. Keyboards, serial ports, `/dev/urandom`, and `/dev/null` are character devices. The absence of buffering is the point: a terminal driver that buffered keystrokes into 512-byte chunks before delivering them would be unusable.

The distinction determines what kernel optimizations are legal. Because block device requests are seekable and deferrable, the I/O scheduler can reorder them to reduce disk head travel or batch small writes into large ones without violating application semantics. None of that is possible for a character stream where byte order is the data.

### Device Drivers and the Control Path

A **device driver** is a kernel module (or built-in) that registers ownership of one or more major numbers and provides a `file_operations` table — a struct of function pointers that implement the VFS interface for that device. When a user process calls `read()` on `/dev/sda`, the VFS resolves the major number, retrieves the driver's `file_operations`, and calls `fops->read()`. The driver then programs hardware registers or issues DMA commands.

The **control path** for a block read looks like this:

1. User process calls `read(fd, buf, len)` → trap into kernel
2. VFS identifies the inode, checks the page cache
3. Cache miss → VFS submits a `bio` (block I/O descriptor) to the block layer
4. I/O scheduler queues and possibly merges the `bio` with adjacent requests
5. Driver pops the request, programs the device (DMA address, sector number, direction)
6. CPU returns to a different runnable process
7. Device raises an interrupt when the DMA transfer completes
8. Interrupt handler marks the `bio` done, wakes the waiting process
9. VFS copies data from the now-populated page cache into the user buffer

Steps 6–9 are the key efficiency argument for interrupt-driven I/O: the CPU is not idle during the device operation. For NVMe SSDs with latencies around $70\text{–}100\ \mu\text{s}$, interrupt overhead (context save, handler dispatch, wakeup) can consume $5\text{–}20\ \mu\text{s}$ — a non-negligible fraction. This is why NVMe drivers optionally use **polling** (`io_uring` with `IORING_SETUP_IOPOLL`): spin on the completion queue instead of sleeping, eliminating interrupt overhead at the cost of a CPU core.

## How It Works

### Polling vs. Interrupts: The Crossover Point

Busy-wait polling on a status register:

```c
/* Simplified: poll until device signals ready, then read data */
while (device_status_reg & STATUS_BUSY)
    cpu_relax();          /* hint to CPU: we're spinning, avoid power waste */
data = device_data_reg;
```

This wastes CPU cycles proportional to device latency. For a spinning disk with a $5\text{–}10\ \text{ms}$ seek time, polling burns:

$$\text{wasted cycles} = f_{\text{cpu}} \times t_{\text{seek}} = 3 \times 10^9 \times 5 \times 10^{-3} = 1.5 \times 10^7 \text{ cycles}$$

That is indefensible. But for an NVMe SSD completing in $80\ \mu\text{s}$:

$$3 \times 10^9 \times 80 \times 10^{-6} = 2.4 \times 10^5 \text{ cycles}$$

An interrupt round-trip costs roughly $10^4\text{–}10^5$ cycles (APIC delivery, IDT dispatch, handler, scheduler). At high queue depths — thousands of concurrent I/Os — interrupt coalescing and polling become competitive. The Linux `io_uring` subsystem exposes this tradeoff explicitly.

### The Block Layer and Request Queue

A write to a file does not immediately become a hardware command. It lands in the page cache as a dirty page. When the kernel decides to flush (dirty ratio threshold, explicit `sync`, or `fsync`), it creates a `bio` and submits it to the block layer. The **I/O scheduler** (today typically `mq-deadline` or `kyber` for NVMe) may merge adjacent `bio`s — two writes to consecutive sectors become one larger transfer — and reorder them to minimize seek distance or meet latency deadlines.

```bash
# Inspect the I/O scheduler in use for a device
cat /sys/block/sda/queue/scheduler
# [mq-deadline] kyber none

# Check the merged/read/write stats for sda
cat /proc/diskstats | awk '$3 == "sda"'
# Fields include: reads merged, writes merged — evidence the scheduler is working
```

### The Flash Translation Layer

An SSD internally cannot overwrite a page in place. Flash cells must be erased at erase-block granularity — typically 256 KB to 1 MB — before any page in that block can be written. A random 4 KB write that hits an already-written page would require reading the entire erase block, erasing it, modifying one page, and writing all pages back. The **Flash Translation Layer (FTL)** hides this behind the standard block interface by maintaining a logical-to-physical mapping and writing new data to fresh pages (log-structured), updating the map, and deferring erasure to a background **garbage collection** process.

For a 1 TB SSD with 4 KB pages, the number of logical pages is:

$$\frac{2^{40}\ \text{bytes}}{2^{12}\ \text{bytes/page}} = 2^{28} \approx 268 \times 10^6\ \text{entries}$$

A flat per-page map at 4 bytes per entry costs:

$$2^{28} \times 4\ \text{bytes} = 2^{30}\ \text{bytes} = 1\ \text{GB of RAM}$$

That 1 GB lives in the SSD controller's DRAM — not your system RAM — but it is a real constraint on controller cost. Production FTLs use **two-level hybrid mapping**: cold (infrequently written) regions use coarse per-block entries ($\sim$256 KB granularity, $4096\times$ fewer entries), while
