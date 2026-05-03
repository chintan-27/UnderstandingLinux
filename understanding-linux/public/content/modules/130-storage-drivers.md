---
id: 130
title: "Storage drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every file read, database write, and swap page ejection passes through the block I/O subsystem. Unlike character devices — where a slow driver inconveniences one process — a poorly designed block driver degrades the entire system: the scheduler starves, the page cache thrashes, and throughput collapses. The block layer exists because storage devices have three properties that byte streams do not: seeks are expensive and hardware-measurable, batching requests yields nonlinear throughput gains, and the device itself can reorder operations more efficiently than the issuing CPU. Without this layer, every filesystem would independently implement request merging, DMA alignment, and elevator scheduling — and none would interoperate.

## Core Concepts

### Block Devices vs. Character Devices

A character device exposes a sequential byte stream; the kernel forwards each `read()`/`write()` call to the driver in order. A block device exposes a randomly addressable array of fixed-size blocks, and the kernel is explicitly permitted to **reorder, merge, and delay** requests before dispatching them. That permission is the entire reason block I/O can be fast: ten 4 KB reads to adjacent sectors become one 40 KB request; a write to sector 1000 is held until a write to sector 999 arrives so both cross the disk head in one pass.

The kernel enforces the distinction structurally. Character drivers register with `cdev_add()`; block drivers allocate a `request_queue` and register a disk with `add_disk()`. The queue is not a courtesy abstraction — it is the mechanism through which the I/O scheduler sees and manipulates every pending operation.

### The Sector as the Fundamental Unit

The block layer uses 512-byte logical sectors as its fixed unit, encoded in `sector_t` (a `u64` typedef). Physical hardware may use 4096-byte sectors internally — the translation is the driver's responsibility, not the filesystem's. This matters for alignment: a write that crosses a physical sector boundary forces a read-modify-write cycle on the device, doubling latency.

The maximum addressable space with 512-byte logical sectors:

$$\text{max} = 2^{64} \times 512 = 2^{64} \times 2^9 = 2^{73} \text{ bytes} \approx 9.4 \text{ ZB}$$

Query a real device's logical and physical sector sizes:

```bash
blockdev --getss /dev/sda    # logical sector size (almost always 512)
blockdev --getpbsz /dev/sda  # physical sector size (often 4096 on modern drives)
```

If those values differ, the device is operating in **512e** (512-byte emulation) mode. Misaligned partition starts — a relic of MBR tools that assumed 63-sector tracks — cause every write to trigger a physical read-modify-write. You can verify partition alignment with:

```bash
parted /dev/sda unit s print   # check that partition starts are multiples of 8
```

A start sector that is not a multiple of $\frac{4096}{512} = 8$ is misaligned.

### The `bio` Structure: The Unit of I/O

When the kernel needs to move data between pages and disk, it constructs a `struct bio`. A `bio` is a **scatter-gather descriptor**: a contiguous range of sectors on disk, mapped to potentially non-contiguous pages in physical memory. Each memory segment is a `bio_vec`:

```c
struct bio_vec {
    struct page   *bv_page;    /* physical page */
    unsigned int   bv_len;     /* bytes from this page */
    unsigned int   bv_offset;  /* byte offset within the page */
};

struct bio {
    struct block_device  *bi_bdev;
    sector_t              bi_iter.bi_sector;   /* starting sector */
    struct bio_vec       *bi_io_vec;           /* segment array */
    unsigned short        bi_vcnt;             /* number of segments */
    unsigned int          bi_opf;              /* REQ_OP_READ / REQ_OP_WRITE / ... */
    bio_end_io_t         *bi_end_io;           /* completion callback */
    void                 *bi_private;
    /* ... */
};
```

The scatter-gather design exists because the VM allocator cannot guarantee that $N$ pages requested at different times are physically contiguous, but the device's DMA engine is perfectly capable of walking a list of (physical address, length) pairs. The `bio_vec` array *is* that list. A driver that copies data instead of programming DMA with the `bio_vec` directly is leaving hardware capability on the table and doing unnecessary work.

The total byte count of a `bio` with $n$ segments is:

$$\text{total} = \sum_{i=0}^{n-1} \texttt{bi\_io\_vec}[i]\texttt{.bv\_len}$$

You can inspect the `bio` path in kernel source at `block/bio.c` and `include/linux/bio.h`.

### Request Queues and the Multi-Queue Block Layer

In the legacy single-queue model (removed in kernel 5.0), one `request_queue` serialized all I/O through a single lock — a design that made sense when one spinning disk could sustain ~100 IOPS but becomes a bottleneck when an NVMe device can sustain 1,000,000+ IOPS across 16 CPU cores.

The modern **multi-queue block layer** (`blk-mq`, introduced in 3.13, mandatory from 5.0) maps per-CPU software staging queues to one or more hardware dispatch queues. The driver advertises how many hardware queues it supports; `blk-mq` assigns staging queues to hardware queues, eliminating cross-CPU lock contention for queue insertion:

```
CPU 0 → sw_queue[0] ─┐
CPU 1 → sw_queue[1] ─┤→ hw_queue[0] → NVMe submission queue 0
CPU 2 → sw_queue[2] ─┘
CPU 3 → sw_queue[3] ─┐
CPU 4 → sw_queue[4] ─┤→ hw_queue[1] → NVMe submission queue 1
CPU 5 → sw_queue[5] ─┘
```

For spinning disks (one hardware queue, order matters), `blk-mq` still applies an I/O scheduler — today either `mq-deadline` or `bfq` — on the software queues before merge into the single hardware queue. For NVMe (many hardware queues, order irrelevant), the scheduler is typically `none`, because reordering adds latency with no seek benefit.

Inspect and change the scheduler at runtime:

```bash
cat /sys/block/sda/queue/scheduler      # e.g., [mq-deadline] bfq none
cat /sys/block/nvme0n1/queue/scheduler  # e.g., [none] mq-deadline bfq
echo mq-deadline > /sys/block/sda/queue/scheduler
```

### SCSI, SATA, and NVMe: The Hardware Stack

These three names describe different layers and should not be conflated:

**SCSI** is a *command set and protocol*. It defines opcodes: `READ(10)` is `0x28`, `WRITE(16)` is `0x8A`, `INQUIRY` is `0x12`. The kernel's **SCSI mid-layer** (`drivers/scsi/`) presents a uniform command interface upward to filesystems and downward to host bus adapters (HBAs). Every device that appears under `/dev/sd*` is being driven through this mid-layer, regardless of its physical interface.

**SATA** is a *physical and electrical interface* — differential signaling at 1.5, 3, or 6 Gb/s over a seven-pin connector. SATA devices speak the ATA command set natively, but Linux routes them through **`libata`** (`drivers/ata/`), which translates ATA commands to and from SCSI commands. This translation is why `hdparm` (ATA-native tool) and `smartctl -d scsi` (SCSI path) can both query the same drive, and why a SATA SSD appears as `/dev/sda` alongside a real SCSI disk.

**NVMe** is a *protocol designed for PCIe-attached flash*. It has no SCSI translation layer. The host writes a submission queue entry (SQE) — a 64-byte structure containing the opcode, namespace ID, LBA range, and PRP/SGL pointer for DMA — directly into a memory region shared with the controller, then rings a doorbell register over PCIe. The controller DMAs the data and writes a completion queue entry (CQE). The round trip is: doorbell write → PCIe TLP → controller fetch → DMA → CQE → MSI-X interrupt. The elimination of SCSI translation and the per-CPU queue model are why NVMe latency is lower even on the same NAND flash:

| Interface  | Typical Latency | Max Queue Depth      | Protocol Path              |
|------------|-----------------|----------------------|----------------------------|
| SATA HDD   | 5–10 ms         | 32 (NCQ)             | ATA → libata → SCSI mid    |
| SATA SSD   | 50–100 µs       | 32 (NCQ)             | ATA → libata → SCSI mid    |
| NVMe SSD   | 20–100 µs       | 65535 × 65535 queues | NVMe driver → PCIe direct  |

The queue depth difference is architectural. SATA Native Command Queuing (NCQ) is implemented inside the ATA command set and exposes a single queue of 32 slots. NVMe exposes up to $2^{16} - 1 = 65535$ independent queue pairs, each with up to 65535 entries — a total outstanding command capacity of $65535^2 \approx 4.3 \times 10^9$ commands, orders of magnitude beyond any current workload, but the point is the per-core parallelism, not the raw depth.

Confirm how Linux sees your devices:

```bash
lsscsi -g           # lists all SCSI-layer devices with generic device nodes
nvme list           # NVMe devices and nam
