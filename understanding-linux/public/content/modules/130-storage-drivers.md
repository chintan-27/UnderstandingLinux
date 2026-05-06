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

## Core Concepts
### Storage Driver Fundamentals
A storage driver translates generic I/O requests from the VFS (Virtual File System) into device‑specific commands that move data between host memory and the storage medium. The translation must preserve ordering, enforce access controls, and hide hardware details such as sector size, command encoding, and error recovery. In Linux this translation occurs in two layers:
* the **SCSI transport layer** (for SCSI, ATAPI, USB‑mass‑storage, NVMe‑passthrough) which builds a CDB (Command Descriptor Block) and handles status/ sense data, and
* the **block layer** which aggregates requests into *bio* structures, schedules them via an I/O scheduler, and issues them to the device driver through a request queue.

### SATA vs. NVMe: Electrical and Protocol Differences
| Property | SATA (SATA III) | NVMe (PCIe 3.0 x4) |
|----------|----------------|-------------------|
| Physical link | Single‑ended differential pair, 6 Gb/s raw | PCIe lanes, each 8 GT/s raw (128b/130b encoding) |
| Effective bandwidth | $6\text{ Gb/s}\times\frac{8}{10}=4.8\text{ Gb/s}=600\text{ MB/s}$ | $4\times 8\text{ GT/s}\times\frac{128}{130}\approx3.94\text{ GB/s}$ |
| Command set | ATA/ATAPI (register‑based, legacy) | NVMe command set (queue‑based, MSI-X, split completion) |
| Queue depth | 1 (legacy) or up to 32 with NCQ | Up to 65 535 per I/O submission/completion pair |
| Typical latency (idle) | 0.1 ms (SSD) – 5 ms (HDD) | 0.02 ms (SSD) – 0.1 ms (NVMe SSD) |

NVMe’s advantage stems from:
* **Parallelism:** Multiple submission/completion queues allow the host to keep the device saturated.
* **Reduced overhead:** Register‑less command submission via doorbell registers and memory‑mapped I/O eliminates port I/O delays.
* **PCIe bandwidth:** Scales with lane count and generation, whereas SATA is capped at 6 Gb/s.

### SCSI Layer and Command Structure
The SCSI layer presents a device‑agnostic interface:
* **Logical Unit Number (LUN)** distinguishes multiple devices on a target.
* **Opcode** selects the CDB (e.g., 0x28 = READ(10), 0x2A = WRITE(10)).
* **Logical Block Address (LBA)** indexes the first block; the device multiplies LBA by the block size to obtain a byte offset.
* **Transfer Length** specifies number of blocks (often in units of the block size).

A minimal CDB for READ(10) (10‑byte CDB) is:
```
byte 0: opcode = 0x28
byte 1: LUN (bits 5‑3) | reserved
bytes 2‑5: MSB‑first LBA
byte 6: reserved
bytes 7‑8: MSB‑first transfer length
byte 9: control
```
The driver must convert the host’s LBA and transfer length into big‑endian fields before DMA submission.

### Block Interface Mechanics
The block layer works with **sectors** (historically 512 B) but exports a **logical block size** via `BLKSSZGET`. I/O is expressed as a **bio** (vector of pages) attached to a **request**. The request queue (`struct request_queue`) holds requests; the elevator algorithm (e.g., `mq-deadline`) sorts them to minimize seek/rotation cost. When the driver finishes a request, it calls `blk_complete_request()`, which wakes any waiting bio and notifies the VFS.

## How It Works
### From VFS to Device
1. **VFS** receives `read(fd, buf, count)` → calls `generic_file_read_iter()`.
2. **Address space** (`struct address_space`) looks up pages via `find_get_pages()`; missing pages trigger `readpage()`.
3. **Readpage** invokes the block device’s `->readpage()` (usually `blkdev_readpage()`), which creates a **bio** describing the page range.
4. **Bio submission**: `submit_bio()` puts the bio into the request queue of the block device (`/sys/block/sda/queue`).
5. **Scheduler**: The elevator merges adjacent bios, sorts by sector number, and dispatches them to the low‑level driver via `blk_mq_make_request()`.
6. **Device driver**: For SCSI devices, `scsi_queue_insert()` builds a CDB, maps the bio’s pages with `sg_alloc_table()`, and issues the command via the host adapter (e.g., `libsas`, `ahci`, `nvme`).  
   For NVMe, the driver writes a command into an I/O submission queue (SQ) and updates the doorbell register; completion is signaled via an interrupt or polling.
7. **DMA**: The device transfers data directly to/from the mapped pages; upon completion it writes a status byte and optionally a sense buffer.
8. **Completion**: The block layer calls `bio_endio()`; the VFS copies data from the page cache to user space and returns from the syscall.

### Quantitative Model
For a sequential read of size $S$ bytes on a device with:
* **Transfer bandwidth** $B$ (bytes/s),
* **Per‑command overhead** $T_{o}$ (seconds for command submission/completion),
* **Rotational latency** $T_{r}$ (only for HDDs, $T_{r} = \frac{1}{2}\frac{60}{\text{RPM}}$),
* **Queue depth** $Q$ (number of outstanding commands),

the expected latency $L$ for a single I/O of size $x$ is:
$$
L(x) = T_{o} + \frac{x}{B} + T_{r}
$$
If the device can pipeline $Q$ commands, the effective throughput approaches:
$$
\text{Throughput} \approx \frac{Q \, B}{1 + \frac{Q \, T_{o} B}{S}} \quad\text{(for large }S\text{)}
$$
For an SSD ($T_{r}=0$, $T_{o}\approx 10\,\mu s$, $B=3.5\text{ GB/s}$) with $Q=32$ and $S=4\text{ KiB}$:
$$
L \approx 10\mu s + \frac{4096}{3.5\times10^{9}} \approx 10\mu s + 1.17\mu s \approx 11.2\mu s
$$
$$
\text{IOPS} \approx \frac{Q}{L} \approx \frac{32}{11.2\mu s} \approx 2.86\text{ MIOPS}
$$
which matches measured NVMe performance.

## Worked Examples
### Example 1: Reading a 2 MiB File from a SATA SSD
Assumptions:
* Filesystem block size = 4 KiB (typical ext4).
* Underlying device logical block size = 512 B (ATA sector).
* SATA SSD: $B = 500\text{ MB/s}$, $T_{o}=15\mu s$, no rotational latency.
* File occupies LBA range `0x10000`–`0x11FFF` (2 MiB = 4096 sectors).

**Step‑by‑step:**
1. VFS reads the file’s inode → finds extent covering those blocks.
2. `ext4_file_read_iter()` builds a `struct iovec` pointing to user buffer.
3. For each 4 KiB page, `ext4_readpage()` creates a bio describing 8 sectors (since 4 KiB / 512 B = 8).
4. Bio is submitted to `/dev/sda` queue; the block layer merges consecutive bios into a single request of 4096 sectors.
5. SCSI driver (via libata) builds a READ(10) CDB:
   * opcode = 0x28
   * LUN = 0
   * LBA = 0x10000
   * Transfer length = 0x1000 (4096 sectors)
6. The AHCI controller DMA‑transfers the data directly into the page cache pages.
7. Upon completion, the block layer calls `bio_endio()` for each bio; VFS copies data to user space via `copy_to_user()`.
8. **Timing**: Transfer time = $2\text{ MiB} / 500\text{ MB/s} = 4.096\text{ ms}$. Overhead = $T_{o}=15\mu s$. Total ≈ $4.11\text{ ms}$.

### Example 2: Writing 256 KiB to an NVMe Drive via `libnvme`
Assumptions:
* NVMe PCIe 3.0 x4, $B=3.5\text{ GB/s}$, $T_{o}=5\mu s$.
* Logical block size = 4 KiB (NVMe namespace formatted with `lbaf=0`).
* Write size = 256 KiB = 64 blocks.

**Procedure using `nvme-cli` (or custom code):**
1. Open `/dev/nvme0n1` with `O_RDWR`.
2. Allocate a DMA‑able buffer (via `posix_memalign` to 4 KiB boundary) and fill it.
3. Build an NVMe I/O command:
   * Opcode = 0x01 (Write)
   * NSID = 1 (from `nvme id-ctrl /dev/nvme0n1`)
   * MPTR = pointer to PRP list (two PRP entries suffice for ≤256 KiB)
   * PRP1 = buffer address (page‑aligned)
   * PRP2 = buffer address + page size (if >4 KiB)
   * SLBA = starting LBA (e.g., 0)
   * Length = 64‑1 (NVMe length field is 0‑based)
4. Submit command via `ioctl(fd, NVME_IOCTL_SUBMIT_IO, &cmd)` (or via libnvme’s `nvme_submit_io()`).
5. Wait for completion: either poll the completion queue doorbell or block on an eventfd.
6. On success, the device returns status = 0; any non‑zero status requires checking the completion queue entry’s `status` field for specific errors (e.g., write‑protect, namespace not ready).

**Timing**: Transfer time = $256\text{ KiB} / 3.5\text{ GB/s} = 71.7\mu s$. Adding $T_{o}=5\mu s$ gives ≈ $77\mu s$ per 256 KiB write, yielding ~13 k IOPS for this size (limited by command overhead). Larger transfers amortize $T_{o}$ and approach the bandwidth limit.

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Assuming all devices accept the same CDB length** | SCSI defines variable-length CDBs (6, 10, 12, 16 bytes); ATAPI translates some but not all; NVMe uses a fixed 64‑byte command structure. | Sending a 10‑byte CDB to an NVMe device via passthrough results in an “invalid field in command” error; the I/O fails. |
| **Neglecting queue depth when estimating IOPS** | IOPS ≈ $Q / L$ only if the device can keep $Q$ commands in flight. HDDs have $Q≈1$ due to mechanical constraints; SSDs scale with $Q$ until internal parallelism saturates. | Over‑provisioning a benchmark with $Q=128$ on a SATA HDD predicts impossible IOPS, leading to misleading performance claims. |
| **Using `O_DIRECT` without aligning buffers to the device’s I/O size** | `O_DIRECT` bypasses the page cache but requires user buffers to be aligned to the device’s `minimum_io_size` (often 4 KiB) and sized in multiples of that. | Misaligned buffers cause `EINVAL`; the kernel falls back to buffered I/O, defeating the purpose and adding latency. |
| **Treating LBA as a byte offset** | LBA counts blocks; the byte offset is `LBA × block_size`. Assuming 1‑byte per LBA off‑by‑factor errors corrupt addressing. | Reading/writing at wrong locations, causing data corruption or silent reads of unrelated sectors. |
| **Believing that `hdparm -Tt` measures sustained bandwidth** | `hdparm -Tt` performs cached reads from RAM and a single‑shot device read; it ignores queueing, command overhead, and real workload patterns. | Results overestimate achievable throughput for random or deep‑queue workloads, leading to capacity planning errors. |

## Exercises
### Easy
1. **Device size query** – Write a C program that opens `/dev/sda`, calls `ioctl(fd, BLKGETSIZE64, &size)` and prints the size in GiB.  
   *Hint:* Include `<linux/fs.h>` and `<sys/ioctl.h>`.  
2. **Logical block size** – Use `ioctl(fd, BLKSSZGET, &blksz)` to obtain the block size of `/dev/nvme0n1` and verify it matches the value shown by `lsblk -o NAME,PHY-SEC,LOG-SEC`.

### Medium
3. **SCSI passthrough read** – Using the Linux `sg` utilities (`sg_inq`, `sg_read`), read 64 KiB starting at LBA 0 from `/dev/sda` and compare the hash (`sha256sum`) with a copy made via `dd if=/dev/sda of=tmp bs=64K count=1`.  
   *Explain* each field of the `sg_io_hdr` structure you set.  
4. **NVMe write latency measurement** – Write a program that submits a 4 KiB NVMe write via `nvme_submit_io()` (libnvme) and records the time between submission and completion using `clock_gettime(CLOCK_MONOTONIC)`. Repeat 10 000 times and report average latency and IOPS.

### Hard
5. **Block‑device driver skeleton** – Implement a minimal ram‑based block driver (`rbd.c`) that registers a `struct gendisk` with a 64 MiB capacity, handles requests in `rbd_make_request()` by copying data from a RAM buffer, and exposes the device as `/dev/rbd0`.  
   *Show* the module’s `init()` and `exit()` functions, and how to trigger I/O with `fio --filename=/dev/rbd0 --rw=read --bs=4k --size=1M`.  
6. **I/O scheduler analysis** – Write a script that cycles through the available schedulers (`noop`, `deadline`, `cfq`, `mq-deadline`, `kyber`) on `/dev/sda`, runs a 4 KiB random write workload with `fio` for 30 s, and plots the average latency vs. scheduler.  
   *Explain* why the observed differences arise from each algorithm’s sorting/merging policy.

## Linux Connection
### Subsystems and Files
| Subsystem | Kernel Path | Key Header | Primary Interface |
|-----------|------------|------------|-------------------|
| SCSI transport | `drivers/scsi/` | `<scsi/scsi.h>` | `struct scsi_cmnd`, `scsi_queue_command()` |
| ATA (SATA) | `drivers/ata/` | `<linux/libata.h>` | `struct ata_queued_cmd`, `ata_qc_issue()` |
| NVMe | `drivers/nvme/` | `<linux/nvme.h>` | `struct nvme_command`, `nvme_submit_sync_cmd()` |
| Block layer | `drivers/block/` | `<linux/blkdev.h>` | `struct request_queue`, `blk_queue_make_request()` |
| Virtual File System (VFS) | `fs/` | `<linux/fs.h>` | `generic_file_read_iter()`, `generic_file_write_iter()` |
| I/O schedulers | `block/` | `<linux/elevator.h>` | `struct elevator_ops` (e.g., `mq_deadline_ops`) |

### Exposing Device Information via sysfs
```bash
# Show scheduler options and current choice for sda
cat /sys/block/sda/queue/scheduler
# Output: [mq-deadline] none
```
```bash
# View SCSI device details
ls -l /sys/class/scsi_device/0\:0\:0\:0/
# cat model, rev, vendor
```
```bash
# NVMe namespace info
nvme list
# Example output:
# Node             SN                   Model                                    Namespace Usage                      Format           FW Rev
# ---------------- -------------------- ------------------------ -------------------------- -------------------------- ---------------- --------
# /dev/nvme0n1     SXYZ1234567890       Samsung SSD 970 EVO Plus 1TB            1           1.00  TB /   1.00  TB    512   B +  0   B   1B2QEXM7
```

### Runnable Shell Commands
```bash
# 1. List block devices with rotation flag (0 = SSD, 1 = HDD)
lsblk -o NAME,SIZE,ROTA,TA,MOUNTPOINT
```
```bash
# 2. Query ATA identify data (SATA)
sudo hdparm -I /dev/sda | grep -E 'Nominal Media Rotation Rate|Device Model'
```
```bash
# 3. Issue an SCSI INQUIRY via sg
sudo sg_inq /dev/sda
```
```bash
# 4. Perform a buffered read with progress and measure throughput
sudo dd if=/dev/sda of=/dev/null bs=4M count=1024 status=progress
```
```bash
# 5. Run an fio random write test against an NVMe device
sudo fio --filename=/dev/nvme0n1 --name=rwtest \
        --rw=randwrite --bs=4k --size=1G --numjobs=4 \
        --group_reporting --direct=1 --ioengine=libaio \
        --runtime=60 --time_based
```
```bash
# 6. Measure per‑request latency using blktrace (kernel tracing)
sudo blktrace -d /dev/sda -o - | blkparse -i -
```
Each line shows timestamps for request issue (`Q`), completion (`C`), and the associated sector range.

### Connecting Theory to Code
* **Request size calculation** – In a block driver, the number of sectors is `req->__data_len / SECTOR_SIZE`.  
  Example snippet:
  ```c
  unsigned int sectors = blk_rq_sectors(req);
  sector_t start_blk = blk_rq_pos(req);
  ```
* **NVMe command submission (kernel)** –  
  ```c
  struct nvme_command cmd = {
      .rw.opcode = nvme_cmd_write,
      .rw.nsid   = cpu_to_le32(ns->head->nsid),
      .rw.slba   = cpu_to_le64(start_lba),
      .rw.length = cpu_to_le16(nblocks - 1),
      .rw.addr   = cpu_to_le64(dma_addr),
  };
  nvme_submit_sync_cmd(ns->queue, &cmd, buf, length, 0);
  ```
* **SCSI CDB construction (kernel)** –  
  ```c
  unsigned char *cdb = scsi_cmd->cmnd;
  cdb[0] = 0x28;                     /* READ(10) */
  cdb[1] = (lun & 7) << 5;           /* LUN */
  cdb[2] = (lba >> 24) & 0xff;
  cdb[3] = (lba >> 16) & 0xff;
  cdb[4] = (lba >>  8) & 0xff;
  cdb[5] =  lba        & 0xff;
  cdb[6] = 0;
  cdb[7] = (len >> 8) & 0xff;
  cdb[8] =  len       & 0xff;
  cdb[9] = 0;
  ```

## Why This Matters
Understanding the precise path from a `read()` syscall to the electrical signals on a SATA or NVMe link lets you:
* **Predict performance** – By knowing $T_{o}$, $B$, and queue depth limits you can size I/O workloads, choose appropriate block sizes, and decide whether to use `O_DIRECT` or asynchronous I/O.
* **Diagnose bottlenecks** – Tools like `iostat`, `blktrace`, and `nvme-cli` expose where time is spent (controller overhead vs. data transfer vs. queueing). Recognizing that a saturated NVMe queue shows low latency but high CPU usage, while a stalled SATA queue shows high service time, directs you to the correct tuning knob (e.g., raising `ncq_depth` vs. upgrading the controller).
* **Write correct low‑level code** – Whether you are developing a userspace benchmark, a container runtime that binds block devices, or a kernel module that emulates a storage target, you must respect alignment, command formats, and completion semantics; ignoring them leads to silent data corruption or sp
