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

## Core Concepts
### Storage Stack Fundamentals
In Linux a storage request travels through several layers before reaching the device hardware:

1. **VFS (Virtual File System)** – translates pathname operations to inode operations and allocates a *struct bio* for each I/O.
2. **Page Cache** – buffers read/write requests; dirty pages are marked for writeback.
3. **Block Layer** – aggregates bios into requests, performs merging, plugging, and scheduling.
4. **Elevator Scheduler** – orders requests to minimize seek/rotational latency (e.g., *mq-deadline*, *bfq*, *none*).
5. **Device Driver** – converts a request into hardware-specific commands (ATA, NVMe, SCSI) and places them on the controller’s submission queue.
6. **Device** – executes the command, reports completion via an interrupt or polling.

Each layer adds overhead, but the dominant performance factors are **service time** (time the device spends executing the command) and **wait time** (time spent in queues). Understanding the chain lets us attribute latency to the correct source and tune the appropriate knob.

### IOPS, Throughput, and Block Size
*IOPS* (Input/Output Operations Per Second) counts completed I/O operations regardless of size. *Throughput* measures bytes transferred per second. They are linked by the average *block size* \(B\) (bytes per operation):

\[
\text{Throughput} = \text{IOPS} \times B
\]

Derivation: If a device completes \(N\) operations in one second, each moving \(B\) bytes, total bytes moved = \(N \times B\). Throughput is therefore \(N \times B\) bytes/s.

**Why block size matters:**  
- Larger \(B\) reduces the number of operations needed to move a given amount of data, raising throughput for a fixed IOPS ceiling.  
- However, many devices have an internal parallelism limit (e.g., NVMe queues, SSD parallel die). Beyond a certain \(B\) the device cannot issue more operations per second, so IOPS drops and throughput plateaus.  
- For HDDs, larger \(B\) reduces seek‑amortization overhead but increases transfer time; the optimal \(B\) balances rotational latency vs. transfer latency.

### Latency Components and Queue Depth
Latency observed by an application (\(L\)) decomposes as:

\[
L = L_{\text{queue}} + L_{\text{service}}
\]

- **\(L_{\text{service}}\)** – intrinsic device latency (seek + rotational + transfer for HDD; command processing + NAND access for SSD).  
- **\(L_{\text{queue}}\)** – waiting time for a request to reach the front of the device’s internal queue.

Queue depth (\(Q\)) is the number of outstanding requests the device can accept. Higher \(Q\) can hide service latency by keeping the device busy, but only up to the point where the device’s internal resources are saturated. Beyond that, additional requests increase \(L_{\text{queue}}\) without improving throughput—a classic *M/G/1* queueing effect.

Using Little’s Law (\(L = \lambda W\)), where \(\lambda\) is the arrival rate (IOPS) and \(W\) is average time in system, we can solve for the maximum sustainable IOPS given a target latency \(L_{\max}\):

\[
\text{IOPS}_{\max} = \frac{Q}{L_{\text{service}} + L_{\text{overhead}}}
\]

If \(L_{\text{service}}\) is 0.1 ms and the device can accept \(Q=32\) requests, the theoretical IOPS ceiling is \(32 / 0.0001 = 320{,}000\) IOPS, assuming zero queuing overhead.

### Fsync, Flushes, and Data Integrity
`fsync(fd)` forces the kernel to:

1. **Writeback** all dirty pages belonging to the file’s mapping (via `writepage` → block layer).
2. **Issue a cache flush** to the storage device (`blkdev_issue_flush`).  
   - For SATA: sends a *FLUSH CACHE EXT* command.  
   - For NVMe: writes an *NVMe Admin Flush* command, which guarantees that data in the volatile write buffer is committed to non‑volatile media.
3. **Wait** for the device to signal completion before returning to userspace.

If the device has a volatile write cache enabled, step 2 can dominate latency (often tens of milliseconds). `fdatasync(fd)` skips updating metadata (size, timestamps) and can be cheaper when only data integrity is required.

Latency distributions matter because storage devices exhibit **tail latency**: a small fraction of I/Os take much longer due to internal garbage collection, wear leveling, or power‑loss protection. Understanding the distribution (e.g., 99th‑percentile latency) is essential for latency‑sensitive workloads (databases, real‑time streaming).

---

## How It Works
### Linux Block I/O Path in Detail
When an application calls `write(fd, buf, len)`:

1. **VFS** looks up the inode, checks page cache. If the page is present and writable, it updates the page and marks it dirty. No block I/O occurs yet.
2. If the page is not cached or the write exceeds page boundaries, the VFS allocates a new page, copies user data via `copy_from_user`, and marks the page dirty.
3. **Writeback Trigger** – either via:
   - **Explicit sync** (`fsync`, `fdatasync`, `sync` syscalls) → `sync_page_range()`.
   - **Periodic background flush** (`/proc/sys/vm/dirty_expire_centisecs`, `dirty_writeback_centisecs`) → `wb_workfn()`.
4. `sync_page_range()` walks the dirty pages, builds a *bio* for each contiguous segment, and calls `submit_bio()`.
5. **Block Layer**:
   - **Request Allocation** – `blk_get_request()` obtains a request struct from the device’s request queue.
   - **Merging** – adjacent bios are merged if they are contiguous and the scheduler allows it (`blk_attempt_plug_merge`).
   - **Plugging** – the block layer may temporarily defer submission to accumulate more requests (`blk_start_plug`).
   - **Scheduler** – the elevator (`mq-deadline` by default) sorts requests by sector, issuing them to the driver.
   - **Dispatch** – `blk_mq_dispatch_rq_list()` hands the request to the hardware queue.
6. **Device Driver** – for NVMe, `nvme_setup_cmd()` builds an admin or I/O command, places it in the submission queue, and triggers a doorbell write.
7. **Completion** – the device writes completion entries to the completion queue; the driver’s interrupt handler (or polling loop) invokes `blk_mq_complete_request()`, which wakes any waiting bio and ultimately calls `end_io()` to wake the original task.

### Asynchronous I/O Alternatives
- **`io_uring`** (setup via `io_uring_queue_init`) bypasses the traditional `submit_bio` path: the application prepares *sqe* (submission queue entries) in userspace, the kernel polls or receives IRQs, and completions appear in the *cqe* ring without extra context switches. This reduces overhead especially for high‑IOPS, low‑latency workloads.
- **Direct I/O** (`O_DIRECT`) bypasses the page cache, causing each `read`/`write` to allocate a bio immediately and go straight to the block layer. Useful for databases that manage their own caching.

### Mathematical Model of Queue Depth vs. Latency
Assume a device with deterministic service time \(S\) (seconds per operation) and a FIFO queue. Utilization \(\rho = \lambda S\). Average waiting time in an M/D/1 queue is:

\[
W_q = \frac{\rho S}{2(1-\rho)}
\]

Total latency \(L = S + W_q\). Solving for \(\lambda\) given a latency target \(L_{\text{target}}\) yields:

\[
\lambda = \frac{2(1-\rho)}{S(1+\rho)} \quad \text{with}\quad \rho = \lambda S
\]

This transcendental equation can be solved numerically; the key insight is that as \(\rho \to 1\), latency blows up. Therefore, to keep latency low we must keep utilization well below 1, which often means limiting queue depth or increasing service speed (e.g., using a faster SSD).

---

## Worked Examples
### Example 1: Throughput from IOPS and Block Size
A SSD advertises **150 000 IOPS** with a **4 KB** page size.  

**Step‑by‑step:**
1. Convert block size to bytes: \(B = 4\text{ KiB} = 4 \times 2^{10} = 4096\) bytes.
2. Apply the formula:  
   \[
   \text{Throughput} = 150\,000 \times 4096 = 614\,400\,000\text{ B/s}
   \]
3. Convert to MiB/s:  
   \[
   \frac{614\,400\,000}{2^{20}} \approx 586\text{ MiB/s}
   \]

**Interpretation:** The device can sustain roughly **586 MiB/s** if every I/O is exactly 4 KB. Larger I/O sizes (e.g., 128 KB) would increase throughput proportionally until the internal bandwidth limit (often ~3–4 GiB/s for NVMe) is reached.

### Example 2: Latency vs. Queue Depth
An NVMe drive has a measured service time \(S = 0.08\) ms (80 µs) per 4 KB random read. We want to keep average latency ≤ 0.5 ms.

**Step‑by‑step:**
1. Express utilization: \(\rho = \lambda S\).  
2. Use M/D/1 waiting‑time formula:  
   \[
   L = S + \frac{\rho S}{2(1-\rho)}
   \]
3. Set \(L = 0.5\) ms, solve for \(\rho\):  
   \[
   0.5 = 0.08 + \frac{0.08\rho}{2(1-\rho)} \;\Longrightarrow\; \rho \approx 0.62
   \]
4. Compute max IOPS:  
   \[
   \lambda_{\max} = \frac{\rho}{S} = \frac{0.62}{0.08\text{ ms}} = 7\,750\text{ IOPS}
   \]
5. Determine required queue depth to achieve this IOPS without exceeding the device’s internal limit (assume max internal queue = 64):  
   \[
   Q = \lambda_{\max} \times (S + L_{\text{target}}) = 7\,750 \times 0.58\text{ ms} \approx 4.5
   \]
   So a queue depth of **~5** is sufficient; raising Q beyond this yields diminishing returns and may increase tail latency due to internal scheduling overhead.

### Example 3: Measuring `fsync` Cost on Different Devices
**Setup:**  
```bash
# Create a 1 GiB test file
dd if=/dev/zero of=/mnt/testfile bs=1M count=1024 oflag=direct
# Warm page cache
dd if=/mnt/testfile of=/dev/null bs=1M iflag=direct
```
**Timing the flush:**  
```bash
# Time a single fsync after writing 4 KB
{
  echo -n "data" > /mnt/testfile
  time -p fdatasync /mnt/testfile
} 2>&1 | grep real
```
Typical results (on a modern SATA SSD with write cache enabled):  
- `real 0.02s` (20 ms) for `fdatasync`.  
- Disabling the write cache (`hdparm -W0 /dev/sda`) drops the time to ~0.2 ms, demonstrating that the dominant cost is the cache flush, not the actual NAND programming.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Understanding |
|---|---------|----------------|-----------------------|
| 1 | **“Higher IOPS always means higher throughput.”** | Throughput also depends on block size; a device may hit its IOPS ceiling while transferring tiny blocks, leaving bandwidth unused. | Compute throughput as \(IOPS \times B\). If the device’s bandwidth limit is lower than this product, IOPS will drop as block size grows. |
| 2 | **“Increasing queue depth reduces latency.”** | Latency falls only while the device is under‑utilized. Beyond the knee of the utilization curve, extra depth adds queueing delay (M/G/1 effect). | Monitor utilization (`iostat -x %util`). Keep it < 60 % for low‑latency targets; otherwise latency will rise. |
| 3 | **`fsync` cost is the same on all storage.** | The cost is dominated by the device’s volatile write cache flush. Devices without a write cache (or with cache disabled) have much lower `fsync` latency. | Check `/sys/block/sdX/queue/rotational` (0 for SSD) and `hdparm -I /dev/sdX` to see write‑cache status. Measure with `time fdatasync`. |
| 4 | **“Sequential throughput = random IOPS × block size.”** | Sequential transfers benefit from internal pipelining and larger burst sizes; random IOPS includes command overhead and may be limited by queue depth. | Use `fio --rw=read --bs=128k --direct=1` to measure sequential bandwidth, and compare with random 4 KB test. |
| 5 | **Misaligned I/O causes no penalty on SSDs.** | Many SSDs internally expose a 4 KB erase block; a misaligned write triggers a read‑modify‑write (RMW) cycle, doubling amplification and increasing latency. | Ensure `fdisk -l` shows `Alignment offset` = 0, or use `parted -a optimal`. Use `iotop -o` to spot processes issuing unaligned I/O. |

---

## Exercises
### Easy
1. **Throughput Calculation** – A HDD can sustain 180 IOPS with an average transfer size of 64 KB. What is its maximum sequential throughput in MiB/s? Show each step.

2. **Unit Conversion** – Convert 3.2 GiB/s to MB/s (decimal) and to MiB/s (binary). Explain why the two differ.

### Medium
3. **Queue‑Depth Latency Trade‑off** – An SSD reports a service time of 0.12 ms for random 4 KB reads. Using the M/D/1 model, compute the maximum IOPS that keeps average latency ≤ 1 ms. What queue depth corresponds to this IOPS if the device can hold up to 32 outstanding requests?

4. **Fsync Overhead Measurement** – Write a short C program that opens a file, writes 4 KB, calls `fdatasync`, and records the elapsed time with `clock_gettime(CLOCK_MONOTONIC)`. Run it on:
   - a) a SATA SSD with write cache enabled,
   - b) the same SSD with write cache disabled via `hdparm -W0`.  
   Report the two latencies and discuss the difference.

### Hard
5. **Designing a fio Experiment** – Create a `fio` job file that:
   - tests random 4 KB reads/writes,
   - varies `--iodepth` from 1 to 64 in powers of two,
   - measures both `lat_ns` (mean, 99th percentile) and `bw`,
   - runs for 30 seconds per depth,
   - stores results in JSON format.  
   Explain how you would interpret the output to pick the optimal iodepth for a latency‑sensitive OLTP workload.

6. **Analyzing Tail Latency with bpftrace** – Run the following one‑liner to capture block I/O completion latency on `/dev/nvme0n1`:
   ```bash
   sudo bpftrace -e 'tracepoint:block:block_rq_complete { @lat[args->bytes] = hist(args->nsecs); }'
   ```
   Execute a mixed workload (e.g., `fio --rw=randrw --bs=4k --iodepth=16 --runtime=30`) and describe what the histogram reveals about the device’s internal behavior (e.g., garbage collection spikes). Propose a kernel tunable or mount option that could mitigate the observed tail.

---

## Linux Connection
### Subsystems and Tunables
| Subsystem | Path / Interface | Purpose | Example Tuning |
|-----------|------------------|---------|----------------|
| **Block Layer Queue** | `/sys/block/<dev>/queue/` | Controls request merging, scheduler, and hardware queue depth. | `echo 128 > /sys/block/sda/queue/nr_requests` – increase max queued requests. |
| **I/O Scheduler** | Same directory, file `scheduler` | Chooses elevator algorithm. | `echo deadline > /sys/block/sda/queue/scheduler` – latency‑oriented scheduler. |
| **Read‑Ahead** | `/sys/block/<dev>/queue/read_ahead_kb` | Pages prefetched on sequential reads. | `echo 256 > /sys/block/sda/queue/read_ahead_kb` – double read‑ahead for streaming workloads. |
| **Writeback** | `/proc/sys/vm/{dirty_ratio,dirty_background_ratio,dirty_expire_centisecs,dirty_writeback_centisecs}` | Controls when dirty pages are flushed to disk. | `echo 10 > /proc/sys/vm/dirty_ratio` – start writeback earlier for latency‑sensitive apps. |
| **NVMe Specific** | `/sys/class/nvme/nvme0/` | Queue depth, interrupt coalescing, APST (power state). | `echo 4 > /sys/module/nvme/parameters/max_qdepth` – limit queues per controller. |
| **fsync / fdatasync** | System calls (`glibc`) → VFS → `sync_page_range` → `blkdev_issue_flush`. | Guarantees data is on non‑volatile media. | No direct tunable; observe via `/sys/block/<dev>/queue/iosched/*flush*`. |

### Concrete Commands
```bash
# 1. Show current scheduler and queue depth
cat /sys/block/sda/queue/scheduler
cat /sys/block/sda/queue/nr_requests

# 2. Switch to mq-deadline (default for many SSDs)
echo mq-deadline > /sys/block/sda/queue/scheduler

# 3. Increase hardware queue depth (requires kernel >=4.19 with MQ)
echo 256 > /sys/block/sda/queue/nr_requests

# 4. Adjust writeback to reduce fsync stall
sudo sysctl -w vm.dirty_ratio=5
sudo sysctl -w vm.dirty_background_ratio=2

# 5. Measure device utilization and latency with iostat (every 1 sec)
iostat -x -d 1

# 6. Trace block I/O completion latency with bpftrace (see Exercise 6)
sudo bpftrace -e 'tracepoint:block:block_rq_complete { @lat[args->bytes] = hist(args->nsecs); }'

# 7. Use perf to sample block request issuance
sudo perf record -e block:block_rq_issue -a -- sleep 10
sudo perf report

# 8. Enable O_DIRECT test with dd (bypasses page cache)
dd if=/dev/zero of=/mnt/testfile bs=1M count=1024 oflag=direct
```

### Code Snippet: Submitting an I/O Ring Entry with `io_uring`
```c
#define _GNU_SOURCE
#include <liburing.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    struct io_uring ring;
    int fd = open("/mnt/testfile", O_RDWR | O_DIRECT);
    if (fd < 0) { perror("open"); return 1; }

    if (io_uring_queue_init(32, &ring, 0)) {
        perror("io_uring_queue_init"); return 1;
    }

    /* Prepare a 4KB write */
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    if (!sqe) { fprintf(stderr, "sqe get failed\n"); return 1; }
    char *buf; posix_memalign((void**)&buf, 4096, 4096);
    memset(buf, 0xAA, 4096);
    io_uring_prep_write_fixed(sqe, fd, buf, 4096, 0, 0, 0);
    /* Provide a buffer group for fixed‑file I/O */
    static const struct iovec iv = { .buf = buf, .iov_len = 4096 };
    io_uring_register_buffers(&ring, &iv, 1);

    io_uring_submit(&ring);

    /* Wait for completion */
    struct io_uring_cqe *cqe;
    if (io_uring_wait_cqe(&ring, &cqe) < 0) { perror("wait_cqe"); return 1; }
    if (cqe->res < 0) { fprintf(stderr, "write error: %s\n", strerror(-cqe->res)); }
    io_uring_put_cqe(&ring, cqe);

    io_uring_queue_exit(&ring);
    close(fd);
    free(buf);
    return 0;
}
```
Compile with: `gcc -o iouring_write iouring_write.c -luring`.

This example shows how an application can bypass the traditional `submit_bio` path, reducing syscall overhead and allowing the kernel to poll the completion queue—critical for achieving sub‑microsecond latencies on high‑performance NVMe devices.

---

## Why This Matters
Understanding the storage stack from first principles lets you:

1. **Predict Performance** – By modeling service time, queue depth, and block size you can forecast IOPS, throughput, and latency before buying hardware.
2. **Choose the Right Device** – A database journal needs low‑latency `fsync`; a video archive needs high sequential bandwidth. The same SSD may be optimal for one and disastrous for the other if its write‑cache flush cost is high.
3. **Tune the OS Correctly** – Adjusting scheduler, queue depth, and writeback parameters moves the operating point of the I/O curve to match your workload’s latency‑throughput trade‑off.
4. **Avoid Hidden Costs** – Recognizing when a device’s internal garbage collection, wear leveling, or volatile cache flush dominates latency prevents mis‑attributing stalls to application code.
5. **Leverage Modern Linux Features** – Tools like `io_uring`, `bpftrace`, and `perf` expose
