---
id: 161
title: "RAID and redundancy"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### RAID Fundamentals
RAID (Redundant Array of Independent Disks) combines multiple physical block devices into a single logical block device to improve **performance**, **capacity**, or **fault tolerance**. The improvement stems from two orthogonal techniques:

* **Striping** – distributes consecutive logical blocks across different disks so that multiple disks can service I/O requests in parallel.  
* **Redundancy** – stores extra information (mirrored copies or parity) that enables reconstruction of data after a disk failure.

From first principles, consider a single disk with sustained transfer rate \(R\) (bytes/s) and random I/O latency \(L\). If we stripe a file of size \(S\) evenly across \(N\) disks, each disk transfers \(S/N\) bytes, giving an ideal transfer time  
\[
T_{\text{stripe}} = \frac{S/N}{R} = \frac{S}{N R},
\]  
i.e., an \(N\)-fold increase in bandwidth for large sequential transfers. For random I/O, the latency is dominated by the slowest disk in the set; however, with proper load‑balancing (e.g., round‑robin request scheduling) the average latency can approach \(L/N\) when the workload is uniformly distributed.

Redundancy adds a cost: extra disks are used for parity or mirrors, reducing usable capacity. The trade‑off is quantified by the **storage efficiency** \(\eta = \frac{\text{usable capacity}}{\text{raw capacity}}\). For mirroring (\(\eta = 1/N\)), for single‑parity RAID (\(\eta = (N-1)/N\)), and for double‑parity RAID (\(\eta = (N-2)/N\)).

### Striping
Striping splits the logical address space into **chunks** (also called strips) of size \(C\) bytes. Logical block number \(LBN\) maps to physical disk \(d\) and offset within that disk as:
\[
d = \left\lfloor \frac{LBN}{C} \right\rfloor \bmod N,\qquad
\text{offset} = (LBN \bmod C) \times \text{sector size}.
\]
If \(C\) is too small, the overhead of issuing many small I/Os dominates; if too large, the benefit of parallelism diminishes because a single large I/O may be serviced by only one disk. Choosing \(C\) to match the typical I/O size of the workload (e.g., 4 KB for databases, 256 KB for video streaming) minimizes **write amplification** and maximizes throughput.

### Mirroring
Mirroring maintains an exact copy of each logical block on two or more disks. A write must be issued to **all** mirrors; a read can be serviced by any mirror, enabling read‑load balancing. If one mirror fails, the logical device continues operating with the remaining mirrors (degraded mode). The write penalty is a factor of \(N\) (each logical write becomes \(N\) physical writes), while the read bandwidth can scale up to \(N\times\) for read‑heavy workloads.

### Parity
Parity provides redundancy with less storage overhead than mirroring. For a set of \(N\) data disks, a single parity block \(P\) is computed as the bitwise XOR of the corresponding data blocks:
\[
P = D_0 \oplus D_1 \oplus \dots \oplus D_{N-1}.
\]
Because \(A \oplus A = 0\) and \(A \oplus 0 = A\), the loss of any single data disk \(D_i\) can be recovered by:
\[
D_i = P \oplus \bigoplus_{j\neq i} D_j.
\]
Thus a single parity disk protects against any one disk failure. Write operations, however, incur a **read‑modify‑write (RMW)** penalty: to update a data block, the controller must read the old data and old parity, compute the new parity, then write the new data and new parity—four I/Os for a small random write. For large sequential writes that align with stripe boundaries, the controller can compute parity on the fly and avoid reads, reducing the penalty to two I/Os (write data + write parity).

## How It Works
### Data Layout and Mapping
The Linux **md** (multiple device) driver implements RAID personalities as separate kernel modules (e.g., `raid0`, `raid1`, `raid456`, `raid10`). Each personality defines:

* **Chunk size** (`stride` in sysfs) – the strip size \(C\).
* **Layout** – the pattern that maps logical chunks to physical disks and determines which disk holds parity for a given stripe.
* **Sync algorithm** – how reconstruction (resync) proceeds after a failure or when adding a spare.

When a block I/O request arrives at `/dev/mdX`, the md driver:
1. Translates the request’s sector number to a **stripe index** and **chunk offset** using the formulas above.
2. Routes the sub‑requests to the appropriate underlying block devices (`/dev/sdY1`, etc.).
3. For RAID 4/5/6, invokes the XOR‑based parity calculation in the `raid456` module; for RAID 1, duplicates writes; for RAID 0, simply strips.

### Write Path Example – RAID 5 Small Random Write
Assume a 4‑disk RAID 5 array with chunk size \(C = 64\text{ KiB}\). A random write of 4 KiB at logical sector \(S\) targets disk \(d_0\) (data) and parity disk \(d_p\). The steps are:

1. **Read old data** from \(d_0\) at the target chunk (1 I/O).  
2. **Read old parity** from \(d_p\) (1 I/O).  
3. Compute \(\Delta = \text{new data} \oplus \text{old data}\).  
4. Compute \(\text{new parity} = \text{old parity} \oplus \Delta\).  
5. **Write new data** to \(d_0\) (1 I/O).  
6. **Write new parity** to \(d_p\) (1 I/O).

Total: 4 I/Os → write amplification factor of 4 versus a single disk. The penalty diminishes for writes that span an entire stripe (size \(N \times C\)) because the controller can read the whole stripe, compute parity from the new data alone, and write back data + parity (2 I/Os).

### Read Path Example – RAID 5 Degraded Mode
If disk \(d_f\) fails, a read request for a chunk residing on \(d_f\) triggers:
1. Read all **other** data chunks in the same stripe (N‑1 I/Os).  
2. Read the parity chunk (1 I/O).  
3. XOR them together to reconstruct the missing chunk.  
Thus a read suffers an **N‑fold** increase in I/O count (read penalty) but the array remains online.

### Reconstruction (Resync)
When a spare is activated or a failed disk is replaced, the md driver rebuilds missing data by scanning **all** surviving disks in parallel, computing missing blocks via XOR (RAID 5/6) or copying from mirrors (RAID 1). The rebuild bandwidth is limited by the slowest participating disk and the background I/O throttling set via `/sys/block/mdX/md/sync_speed_min` and `sync_speed_max`.

## Worked Examples
### Example 1: RAID 0 Striping – Throughput and Capacity
*Given*: 6 disks, each 2 TB raw, sequential read speed 200 MiB/s per disk, chunk size 256 KiB.  
*Goal*: Effective read bandwidth and usable capacity for a 10 GiB file.

**Capacity**: RAID 0 uses all disks →  
\[
C_{\text{usable}} = 6 \times 2\text{ TB} = 12\text{ TB}.
\]

**Bandwidth**: Ideal sequential read scales linearly with disk count:  
\[
B_{\text{ideal}} = 6 \times 200\text{ MiB/s} = 1.2\text{ GiB/s}.
\]

**Number of strips** for the file:  
\[
\text{strips} = \frac{10\text{ GiB}}{256\text{ KiB}} = \frac{10 \times 2^{30}}{2^{18}} = 10 \times 2^{12} = 40960.
\]  
Each disk receives \(\frac{40960}{6} \approx 6827\) strips (the remainder is distributed evenly by the md driver).

**Time to read the file**:  
\[
T = \frac{10\text{ GiB}}{1.2\text{ GiB/s}} \approx 8.33\text{ s}.
\]

### Example 2: RAID 1 Mirroring – Write Penalty and Read Load‑Balancing
*Given*: 3‑way mirror, each disk 1 TB, random write IOPS per disk 150 IOPS, random read IOPS per disk 200 IOPS.  
*Goal*: Sustainable random write IOPS and read IOPS for the array.

**Write IOPS**: Each logical write must be issued to all three mirrors →  
\[
\text{IOPS}_{\text{write}} = \frac{150}{3} = 50\text{ IOPS}.
\]

**Read IOPS**: With perfect load‑balancing, reads can be served by any mirror; the md driver uses a round‑robin queue, giving:  
\[
\text{IOPS}_{\text{read}} = 3 \times 200 = 600\text{ IOPS}.
\]  
If the workload is skewed (e.g., all reads target the same logical block), the effective read IOPS may be lower due to contention on a single disk; the md driver mitigates this by allowing **read‑balance policies** (`--readpolicy` in `mdadm`).

### Example 3: RAID 5 Parity Reconstruction – Algebra Derivation
*Given*: 5‑disk RAID 5, chunk size 4 KiB. Data chunks (in hex) for a stripe:  
\[
D_0 = 0xA3,\; D_1 = 0x5F,\; D_2 = 0x7C,\; D_3 = 0x1E.
\]  
Parity chunk \(P\) is stored on disk 4.

**Compute parity**:  
\[
P = D_0 \oplus D_1 \oplus D_2 \oplus D_3.
\]  
Stepwise:  
\(0xA3 \oplus 0x5F = 0xFC\) (since \(A3_{16}=1010\,0011_2\), \(5F_{16}=0101\,1111_2\) → XOR = \(1111\,1100_2 = 0xFC\)).  
\(0xFC \oplus 0x7C = 0x80\) (\(1111\,1100 \oplus 0111\,1100 = 1000\,0000\)).  
\(0x80 \oplus 0x1E = 0x9E\) (\(1000\,0000 \oplus 0001\,1110 = 1001\,1110\)).  
Thus \(P = 0x9E\).

**Failure scenario**: Disk 2 (\(D_2\)) fails. To reconstruct:  
\[
D_2 = P \oplus D_0 \oplus D_1 \oplus D_3.
\]  
Compute \(P \oplus D_0 = 0x9E \oplus 0xA3 = 0x3D\).  
\(0x3D \oplus 0x5F = 0x62\).  
\(0x62 \oplus 0x1E = 0x7C\) → recovered \(D_2\), matching the original.

## Common Mistakes
| # | Mistake | Why It’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Assuming RAID eliminates the need for backups** | RAID protects against *disk failure* only; it does not guard against *controller bugs, power loss, software corruption, ransomware, or simultaneous multiple‑disk failures*. | Data loss can still occur; off‑site or snapshot‑based backups remain essential. |
| 2 | **Ignoring the write penalty of RAID 5/6 for small random writes** | Small writes trigger a read‑modify‑write cycle (4 I/Os for RAID 5, 6 I/Os for RAID 6). Treating them as free leads to over‑provisioned expectations. | Observed write latency spikes, degraded throughput, and possible I/O scheduler starvation. |
| 3 | **Using mismatched disk sizes without accounting for capacity loss** | mdadm will create an array using the *smallest* disk’s size for each member; extra space on larger disks is wasted unless a separate RAID 10 or LVM layer is used. | Unexpectedly low usable capacity and inefficient spend. |
| 4 | **Setting chunk size far from the workload I/O size** | If chunk size ≪ typical I/O, each logical I/O becomes many small physical I/Os, increasing overhead; if chunk size ≫ typical I/O, parallelism is lost because a single I/O may occupy only one disk. | Sub‑optimal throughput and increased latency. |
| 5 | **Neglecting to monitor rebuild impact** | During reconstruction, all surviving disks handle both normal I/O and rebuild I/O, often tripling their load. If the array is already near saturation, rebuild can stall or cause timeouts. | Prolonged rebuild windows, increased risk of a second failure, and possible array offline. |
| 6 | **Using `mdadm --grow` to change RAID level without data backup** | Growing (e.g., RAID 5 → RAID 6) reshapes data layout in‑place; power loss or kernel crash mid‑operation can leave the array inconsistent. | Corrupted filesystem, requiring recovery from backup. |

## Exercises
### Easy
1. **Capacity & Strip Count** – A RAID 0 array has 8 disks of 4 TB each, chunk size 512 KB. Compute usable capacity and the number of strips needed to store 64 GB of data.  
2. **Mirror Space** – A RAID 1 array with 5 disks of 2 TB each stores a 3 TB database. How much space is used on each disk?  

### Medium
3. **RAID 5 Write Penalty** – For a 6‑disk RAID 5 array with 256 KiB chunk size, a workload performs 4 KiB random writes at 10 KB/s per disk (raw). Calculate the effective random write IOPS the array can sustain, assuming each disk can do 150 IOPS.  
4. **Degraded Read Overhead** – In a 4‑disk RAID 5, a failed disk forces reads of its chunks to use the parity block. If a sequential read stream reads 1 GiB, how many extra I/Os are incurred compared to a healthy array? Show the calculation.  

### Hard
5. **Rebuild Time Estimate** – A RAID 6 array has 10 disks, each 6 TB, with a sustained rebuild speed limited to 150 MiB/s per disk (due to background throttling). Estimate the minimum time to rebuild a single failed disk, assuming optimal parallelism and no foreground I/O.  
6. **Mixed Workload Throughput** – Consider a RAID 10 array (4 disks, 2‑way mirror + stripe) with each disk delivering 250 MiB/s sequential read and 200 MiB/s sequential write. Derive the expected sequential read and write bandwidth for the array, assuming perfect load‑balancing and no write penalty.  
7. **Chunk Size Optimization** – A database issues 8 KiB random reads and 16 KiB sequential writes. For a 4‑disk RAID 5, determine the chunk size (choose among 4 KiB, 8 KiB, 16 KiB, 32 KiB) that minimizes the sum of read amplification (read I/Os per logical read) and write amplification (write I/Os per logical write). Show your reasoning.  

## Linux Connection
The Linux kernel’s **md** (multiple device) subsystem provides software RAID. Key components:

* **Personality modules** – `raid0`, `raid1`, `raid456`, `raid10`. Loaded automatically when needed.  
* **mdadm** – user‑space tool to create, manage, monitor, and assemble arrays.  
* **sysfs** – each md device appears under `/sys/block/mdX/md/` with attributes like `array_size`, `chunk_size`, `degraded`, `sync_speed_min/max`.  
* **procfs** – `/proc/mdstat` shows real‑time status, rebuild progress, and active devices.  
* **Device‑mapper target** – `dm-raid` offers similar functionality via LVM; useful when stacking with LVM or cryptsetup.

### Common mdadm Commands (runnable in bash)
```bash
# 1. Create a RAID 0 array with 4 partitions, 256 KiB chunk
mdadm --create --verbose /dev/md0 \
      --level=0 --raid-devices=4 \
      --chunk=256 \
      /dev/sda1 /dev/sdb1 /dev/sdc1 /dev/sdd1

# 2. Create a RAID 1 array with 2 disks, write‑mostly on sda
mdadm --create --verbose /dev/md1 \
      --level=1 --raid-devices=2 \
      --write-mostly /dev/sda1 \
      /dev/sdb1

# 3. Create a RAID 5 array with 5 disks, 512 KiB chunk, spare
mdadm --create --verbose /dev/md2 \
      --level=5 --raid-devices=5 \
      --spare-devices=1 --chunk=512 \
      /dev/sd{a,b,c,d,e}1

# 4. Add a hot‑spare to an existing array
mdadm /dev/md2 --add /dev/sdf1

# 5. Simulate a disk failure (for testing)
mdadm /dev/md2 --fail /dev/sdc1

# 6. Remove the failed device
mdadm /dev/md2 --remove /dev/sdc1

# 7. Check status and rebuild progress
cat /proc/mdstat
# or watch -n 1 cat /proc/mdstat

# 8. Adjust rebuild speed limits (in KiB/s)
echo 50000 > /sys/block/md2/md/sync_speed_min   # 50 MiB/s min
echo 200000 > /sys/block/md2/md/sync_speed_max # 200 MiB/s max

# 9. Grow a RAID 5 to RAID 6 (requires free space on all devices)
mdadm --grow /dev/md2 --level=6 --backup-file=/root/raid5to6.bak

# 10. Assemble all arrays found via superblocks at boot
mdadm --assemble --scan
```

### Monitoring & Logging
* **udev rules** (`/lib/udev/rules.d/64-md-raid.rules`) automatically create symlinks like `/dev/md/array_name`.  
* **email alerts** – add `MAILADDR admin@example.com` to `/etc/mdadm/mdadm.conf` and enable the `mdadm` daemon (`systemctl enable mdadm`).  
* **systemd integration** – `mdmonitor.service` watches `/proc/mdstat` and triggers `mdadm --monitor` for failure notifications.

### Performance Tuning
* **I/O scheduler** – for SSDs, `mq-deadline` or `none` often yields better latency than `cfq`. Set per‑device:  
  ```bash
  echo none > /sys/block/sda/queue/scheduler
  ```
* **Read‑balance policy** – for RAID 1, choose `readpolicy` to favor the fastest disk:  
  ```bash
  mdadm --grow /dev/md1 --readpolicy=1   # 0=round-robin, 1=first device
  ```
* **Stripe cache** – for RAID 4/5/6, the kernel caches full‑stripe writes to avoid RMW:  
  ```bash
  echo 256 > /sys/block/md2/md/stripe_cache_size   # number of 4 KiB pages
  ```

These tools and tunables let administrators match RAID behavior to workload characteristics, monitor health, and react to failures without needing a hardware RAID controller.

## Why This Matters
RAID sits at the intersection of **performance engineering** and **fault tolerance**—two pillars of reliable systems. By mastering how striping, mirroring, and parity interact at the level of block mappings, I/O amplification, and rebuild dynamics, you can:

* **Size arrays correctly**: predict usable capacity and I/O bandwidth before purchasing disks, avoiding over‑ or under‑provisioning.  
* **Tune for workloads**: pick RAID level, chunk size, and read‑write policies that match the I/O pattern (random DB access vs. sequential video ingest) to achieve optimal latency and throughput.  
* **Plan for failures**: estimate rebuild windows, set appropriate throttle limits, and maintain hot spares so that a single disk failure never turns into an outage.  
* **Avoid costly misconceptions**: recognize that RAID is not a substitute for backups, understand the write penalty of parity RAID, and know when to migrate to erasure coding or distributed storage systems.  

In Linux, the `md` subsystem and `mdadm` expose these concepts through concrete interfaces (`/proc/mdstat`, sysfs attributes, and command‑line options) that let you observe, control, and debug RAID behavior in real time. When you can translate the abstract formulas of striping and parity into actual shell commands and kernel tunables, you move from memorizing RAID levels to **designing storage solutions that meet strict SLAs for throughput, latency, and durability**—a skill that is indispensable for systems engineers, DevOps practitioners, and anyone building scalable infrastructure.
