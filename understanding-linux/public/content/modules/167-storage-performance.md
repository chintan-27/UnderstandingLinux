---
id: 167
title: "Storage performance"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When an application writes to disk slowly, the problem is almost never the raw device speed — it's a mismatch between how software issues I/O and what the hardware can exploit. A database calling `fsync()` after every row insert, a backup tool maintaining queue depth 1, or a filesystem mounted without `noatime` can each reduce a 500 MB/s NVMe drive to spinning-disk performance. Without a precise vocabulary — IOPS, throughput, queue depth, latency distributions — you cannot distinguish a saturated device from a misconfigured queue from a pathological fsync pattern. Storage problems diagnosed incorrectly get "fixed" by buying faster hardware, which often changes nothing because the bottleneck was never the device.

---

## Core Concepts

### IOPS: The Rate of Operations

IOPS counts discrete read/write requests completed per second, independent of their size. It is the correct metric for random-access workloads — databases, VM images, mail servers — where the bottleneck is operation *initiation*, not data transfer. On spinning media, each random seek costs a full rotational latency plus seek time; on NAND flash, each random read requires a page-granularity lookup in the FTL (Flash Translation Layer) plus a cell read. Either way, you pay per operation, not per byte.

$$\text{IOPS} = \frac{\text{operations completed}}{\Delta t \text{ (seconds)}}$$

A common trap: quoting IOPS without specifying queue depth and I/O size makes the number meaningless. A device rated at 1,000,000 IOPS achieves that at queue depth 128 with 4 KB reads. At queue depth 1 with 4 KB reads, the same device might deliver 15,000 IOPS.

### Throughput: The Rate of Data Transfer

Throughput (bandwidth) measures bytes moved per second and is the right metric for sequential workloads: log streaming, backups, video encoding. The relationship to IOPS is exact:

$$\text{Throughput} = \text{IOPS} \times \text{block size (bytes)}$$

This is a hard constraint. A device IOPS-limited at 100,000 ops/s with 4 KB I/Os is throughput-capped at:

$$100{,}000 \times 4096 = 409{,}600{,}000 \text{ B/s} \approx 391 \text{ MiB/s}$$

To increase throughput beyond that ceiling, you must either increase block size (shift the workload toward fewer, larger I/Os) or increase the IOPS ceiling (deeper queues, better hardware). Sequential workloads naturally use larger effective block sizes because the page cache coalesces adjacent pages into single large I/Os via readahead.

### Queue Depth: Concurrency in the I/O Path

Queue depth is the number of I/O requests submitted to the device but not yet completed. Modern NVMe controllers contain multiple flash channels (typically 8–16), each operating independently. If you submit one request and wait, you use one channel while the rest sit idle. Queue depth is the mechanism by which software exposes that parallelism.

The relationship between queue depth, throughput, and latency is governed by Little's Law from queueing theory:

$$N = \lambda \times W$$

where $N$ is mean requests in flight (queue depth in use), $\lambda$ is arrival rate (IOPS), and $W$ is mean sojourn time (latency). Rearranging:

$$\lambda = \frac{N}{W}$$

If a device's service time per request is $W_s = 100\ \mu\text{s}$, then at queue depth 1 you get $\lambda = 1 / 0.0001 = 10{,}000$ IOPS. At queue depth 32 — if the device has sufficient internal parallelism — service time stays near $100\ \mu\text{s}$ and you get $\lambda = 32 / 0.0001 = 320{,}000$ IOPS. Once you exceed the device's internal parallelism, additional requests queue behind active ones: $W$ rises proportionally, $\lambda$ stops increasing, and you've only added latency.

Typical NVMe scaling with 4 KB random reads:

| Queue Depth | Random 4K Read IOPS | Mean Latency |
|---|---|---|
| 1 | ~15,000 | ~65 µs |
| 4 | ~60,000 | ~65 µs |
| 32 | ~400,000 | ~80 µs |
| 128 | ~700,000 | ~180 µs |
| 256 | ~700,000 | ~360 µs |

Beyond ~128, latency climbs with no IOPS gain: the device is saturated and requests wait in the submission queue.

### fsync Cost: The Price of Durability

`fsync(2)` forces all dirty data and metadata for a file descriptor to stable storage before returning. The sequence is:

1. The kernel writes back all dirty pages for the file from the page cache to the block layer.
2. It issues a `REQ_PREFLUSH` or FUA (Force Unit Access) command to flush the device's write-back cache.
3. The device drains its DRAM write buffer to NAND or magnetic media.
4. A completion interrupt fires and `fsync` returns.

Steps 2–3 are why fsync is expensive: on spinning disk with 7200 RPM, rotational latency alone is $\frac{1}{7200} \times \frac{1}{2} \approx 4.2 \text{ ms}$ average, and a full sync can cost 10–30 ms. On NVMe with a capacitor-backed write cache, a single fsync may cost 50–200 µs.

The problem is rate, not individual cost. If fsync costs $200\ \mu\text{s}$ per call, the maximum throughput of single-threaded serial fsyncs is:

$$\frac{1}{200 \times 10^{-6}} = 5{,}000 \text{ fsyncs/s}$$

A workload requiring 10,000 durable writes/s cannot be satisfied regardless of device speed: the bottleneck is the serialization of `fsync` calls. The solution is either batching (one fsync covering $N$ writes) or using `O_DSYNC` for per-write data durability without the metadata barrier overhead.

### Latency Distributions: Why Averages Lie

Mean latency hides the behavior that determines application SLOs. NAND flash garbage collection, write amplification, power-management state transitions (APST on NVMe), and error recovery create latency outliers that can be $100\times$ the median. A device delivering mean 300 µs with 99.9th-percentile 50 ms looks fine in aggregate; the outliers cause application timeouts.

The tail-latency problem compounds with fan-out. If a storage operation has probability $p = 0.001$ of hitting a GC pause, and one user request fans out to $n = 1000$ storage operations:

$$P(\text{at least one outlier}) = 1 - (1-p)^n \approx 1 - e^{-np}$$

$$= 1 - e^{-1} \approx 0.632$$

63% of user requests hit a tail event. This is why latency histograms and percentiles (p99, p999) are required for any storage characterization, and why tools like `fio` and `bpftrace` expose them explicitly.

---

## How It Works in Linux

### The Linux I/O Stack

A storage request passes through these layers in order:

```
Application (read/write/io_uring)
      ↓
VFS (virtual filesystem interface)
      ↓
Filesystem (ext4, XFS, btrfs) — journaling, extent allocation
      ↓
Page cache — writeback batching, readahead
      ↓
Block layer — I/O scheduler (mq-deadline, kyber, none)
      ↓
Device driver (nvme, sd, virtio-blk)
      ↓
Hardware
```

Each layer adds latency and opportunity for optimization. The I/O scheduler at `/sys/block/<dev>/queue/scheduler` controls queuing policy. For NVMe, the correct scheduler is usually `none` (no reordering needed since there's no seek penalty) or `mq-deadline` for latency-sensitive mixed workloads.

```bash
# Check current scheduler
cat /sys/block/nvme0n1/queue/scheduler

# Set to none (passthrough) for NVMe
echo none | sudo tee /sys/block/nvme0n1/queue/scheduler

# Check queue depth limit exposed to the kernel
cat /sys/block/nvme0n1/queue/nr_requests

# NVMe-specific: how many hardware queues are mapped
ls /sys/block/nvme0n1/mq/
```

### Measuring with fio

`fio` is the standard tool for controlled storage benchmarking. Always specify `iodepth`, `bs` (block size), `rw` (access pattern), and `ioengine`.

```bash
# Random 4K read at queue depth 1 — establishes baseline IOPS
fio --name=rand_read_qd1 \
    --filename=/dev/nvme0n1 \
    --rw=randread \
    --bs=4k \
    --iodepth=1 \
    --numjobs=1 \
    --runtime=30 \
    --time_based \
    --ioengine=libaio \
    --direct=1 \
    --lat_percentiles=1 \
    --percentile_list=50:95:99:99.9

# Same test at queue depth 32 — observe IOPS increase
fio --name=rand_read_qd32 \
    --filename=/dev/nvme0n1 \
    --rw=randread \
    --bs=4k \
    --iodepth=32 \
    --numjobs=1 \
    --runtime=30 \
    --time_based \
    --ioengine=libaio \
    --direct=1 \
    --
