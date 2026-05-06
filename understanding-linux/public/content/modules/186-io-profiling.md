---
id: 186
title: "I/O profiling"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### I/O Profiling Fundamentals
I/O profiling is the quantitative measurement of the time a request spends in each stage of the Linux I/O stack:  
1. **Submission** – process issues a `read()/write()` or `pwritev2()` system call.  
2. **VFS** – generic file‑system layer translates the request to an inode and maps the byte range to logical block numbers.  
3. **Block layer** – the request enters a request queue (`struct request_queue`) where it is merged, sorted, and handed to an **elevator** (I/O scheduler).  
4. **Device driver** – the driver builds DMA descriptors and issues the command to the hardware.  
5. **Device** – the storage medium performs the physical operation.

The total latency \(L\) observed by the application can be decomposed as  
\[
L = L_{\text{seek}} + L_{\text{rot}} + L_{\text{xfer}} + L_{\text{q}} + L_{\text{sw}},
\]  
where \(L_{\text{seek}}\) is arm movement, \(L_{\text{rot}}\) is rotational latency, \(L_{\text{xfer}}\) is data transfer, \(L_{\text{q}}\) is time spent waiting in the request queue, and \(L_{\text{sw}}\) is software overhead (VFS, driver, interrupts). Profiling isolates each term.

### Disk Latency Components
* **Seek time** – time for the actuator to move the head to the target cylinder. Approximated by a square‑root law:  
  \[
  L_{\text{seek}} \approx k \sqrt{\Delta \text{cyl}},
  \]  
  where \(k\) is a drive‑specific constant and \(\Delta \text{cyl}\) is the cylinder distance.  
* **Rotational latency** – average wait for the desired sector to rotate under the head:  
  \[
  L_{\text{rot}} = \frac{0.5 \cdot 60}{\text{RPM}} \; \text{seconds}.
  \]  
  For a 7200 RPM drive, \(L_{\text{rot}} \approx 4.17\) ms.  
* **Transfer time** – time to move the data across the interface:  
  \[
  L_{\text{xfer}} = \frac{\text{size}}{\text{transfer rate}}.
  \]  
  With a SATA III link (600 MB/s) and a 4 KiB request, \(L_{\text{xfer}} \approx 6.7\) µs.  
* **Queueing delay** – derived from **Little’s Law**: \(L_q = \lambda W_q\), where \(\lambda\) is the arrival rate (requests/s) and \(W_q\) is the average waiting time in the queue. Utilization \(U = \lambda S\) (with \(S\) the mean service time) yields the M/M/1 response‑time formula:  
  \[
  R = \frac{S}{1-U}.
  \]  
  As \(U \to 1\), \(R\) diverges, explaining the latency explosion under heavy load.  
* **Software overhead** – measured via `perf stat -e cpu-clock,task-clock` on the block‑layer workload; typically 0.5‑2 µs per request on modern kernels.

### Queueing Theory in the Block Layer
The block layer maintains a **request queue** with depth limited by `/sys/block/<dev>/queue/nr_requests`. When the queue is full, the issuer sleeps (uninterruptible state `D`) until space frees. The scheduler’s **plugging** mechanism delays dispatch to allow more merges; plug timeout is controlled via `/sys/block/<dev>/queue/iosched/*`. Understanding plug/unplug behavior is essential for interpreting observed latency spikes.

### Block Traces
A block trace records each request as it traverses the block layer. The kernel’s **blktrace** infrastructure (tracepoint `block:block_rq_issue` and `block:block_rq_complete`) emits structures:
```c
struct blk_io_trace {
    __u32   magic;        /* 0xC0FF0001 */
    __u32   sequence;     /* increasing per‑cpu */
    __u64   time;         /* nanoseconds since boot */
    __u64   sector;       /* start sector */
    __u32   bytes;        /* transfer size */
    __u16   action;       /* see BLK_TC_* */
    __u16   pid;          /* issuing process */
    __u32   device;       /* major:minor */
    __u32   cdu;          /* control data unit */
    char    pname[16];    /* process name */
};
```
Inter‑event delta gives service time; histogram of `bytes` reveals I/O size distribution; counting overlapping intervals yields instantaneous queue depth.

---

## How It Works
### 1. Data Collection
| Tool | What it captures | Typical invocation |
|------|------------------|--------------------|
| `ioping` | Round‑trip latency of synchronous reads (bypasses page cache if `-C` used) | `ioping -c 100 -C /dev/sda` |
| `fio` | Configurable workload; logs latencies, IOPS, bandwidth via `log_avg_msec` | `fio --name=randread --rw=randread --bs=4k --size=1G --ioengine=libaio --iodepth=32 --runtime=30 --output-format=json` |
| `blktrace` + `blkparse` | Low‑level block‑layer timestamps, sizes, actions | `blktrace -d /dev/sda -o - | blkparse -i - > trace.txt` |
| `perf` | Hardware counters (`cpu-cycles`, `ref-cycles`) and tracepoints (`block:*`) | `perf record -e block:block_rq_issue,block:block_rq_complete -a sleep 30` |
| `/proc/diskstats` | Cumulative fields: reads, writes, sectors, time spent (ms) | `cat /proc/diskstats \| grep sda` |
| `sysfs` | Scheduler, queue depth, rotational flag | `cat /sys/block/sda/queue/scheduler` |

**Why these tools?**  
* `ioping` measures *service time* plus *queueing* because each iteration issues a blocking read; the `-C` flag bypasses the page cache to hit the device directly, isolating hardware latency.  
* `fio` can decouple latency from throughput by varying `--iodepth` and `--bs`, enabling construction of latency‑vs‑load curves.  
* `blktrace` provides the *ground truth* needed to validate higher‑level metrics; its overhead is <1 % for typical workloads when buffered to a ramdisk (`-o /dev/shm/btrace`).  

### 2. Data Analysis
* **Utilization** from `/proc/diskstats`:  
  \[
  U = \frac{\text{time\_spent\_ms}}{\text{interval\_ms}}.
  \]  
  If `time_spent_ms` > `interval_ms` on a multi‑queue device, the value reflects *sum* over hardware queues; divide by `nr_hw_queues` (found in `/sys/block/<dev>/queue/nr_hw_queues`).  
* **Percentile latency**: sort latency samples; the \(p\)‑th percentile is the value at index \(\lceil pN/100\rceil\).  
* **Queue depth over time**: using `blkparse -a d` outputs timestamps and the current depth; compute moving average to detect bursts.  
* **Service time distribution**: subtract `issue` timestamp from `complete` timestamp for each request; fit to an ex‑Gaussian to separate deterministic (seek+rot+transfer) from stochastic (queueing) components.  

### 3. Optimization
* **Scheduler selection** – each elevator implements a different sorting policy:  
  * **CFQ** (Completely Fair Queuing): assigns time slices per process; good for mixed workloads but adds overhead.  
  * **Deadline**: guarantees a start time; uses sorted read/write queues; suitable for latency‑sensitive DBs.  
  * **BFQ** (Budget Fair Queuing): extends CFQ with throughput‑aware budgets; ideal for desktop interactivity.  
  * **mq-deadline / kyber** – multi‑queue aware, designed for NVMe; use `mq-deadline` for high queue depth, `kyber` for low latency.  
  Switch via:  
  ```bash
  echo deadline > /sys/block/sda/queue/scheduler
  ```
* **I/O Nice** – `ionice` maps to internal priority values used by the elevator:  
  * Class 1 (real‑time) → `BLK_IOPRIO_CLASS_RT` (priority 0‑7).  
  * Class 2 (best‑effort) → `BLK_IOPRIO_CLASS_BE` (priority 0‑7, lower number = higher priority).  
  * Class 3 (idle) → `BLK_IOPRIO_CLASS_IDLE`.  
  Example:  
  ```bash
  ionice -c 2 -n 0 -p 1234   # best‑effort, highest priority
  ```  
* **Request alignment** – ensure I/O size and offset are multiples of the page size (`PAGE_SIZE = 4096` on x86_64) and of the drive’s *optimal I/O size* (`/sys/block/sda/queue/optimal_io_size`). Misalignment causes extra read‑modify‑write cycles on SSDs with 4 KiB erase blocks.  
* **Writeback tuning** – adjust `/proc/sys/vm/dirty_background_ratio` and `/proc/sys/vm/dirty_ratio` to control how many dirty pages accumulate before writeback starts, thereby smoothing write bursts.  
* **NCQ/TRIM** – for SATA/NVMe, enable Native Command Queuing (`/sys/block/sda/device/queue_depth`) and periodic `fstrim` to keep the drive’s internal garbage collection efficient.

---

## Worked Examples
### Example 1: Measuring and Analyzing Disk Latency with `ioping`
```bash
# Issue 200 synchronous 4 KiB reads, bypassing page cache
ioping -c 200 -C /dev/sda
```
Sample output:
```
--- /dev/sda (devices: 1) ioping statistics ---
  200 requests completed in 2.12 s, 94.3 iops, 0.37 mb/s
  min/avg/max/mdev = 0.21/4.60/18.3/2.9 ms
```
**Interpretation**  
* **Average latency** \( \bar{L} = 4.60\) ms.  
* **Service time** (device‑only) can be approximated by subtracting the measured queueing component. Using Little’s Law:  
  \[
  U = \lambda \bar{S},\qquad \lambda = \frac{200}{2.12\text{ s}} = 94.3\text{ req/s}.
  \]  
  Solving for \(\bar{S}\) given measured \(U\) from `/proc/diskstats` (say \(U=0.35\)):  
  \[
  \bar{S} = \frac{U}{\lambda} = \frac{0.35}{94.3} \approx 3.71\text{ ms}.
  \]  
  Hence queueing delay \(L_q = \bar{L} - \bar{S} \approx 0.89\) ms.  
* **95th‑percentile** (computed with `awk`):  
  ```bash
  ioping -c 200 -C /dev/sda | awk '/^[0-9]/ {print $1}' | sort -n | awk '{a[NR]=$1} END{print a[int(0.95*NR)]}'
  ```
  Result ≈ 9.1 ms, indicating occasional long queues (likely due to background writeback).  

### Example 2: Capturing and Visualizing Block Traces
```bash
# Record traces to a RAM‑based file to avoid influencing the device under test
blktrace -d /dev/sda -o /dev/shm/sda_blk
# In another terminal, run the workload (e.g., fio random read)
fio --name=randread --rw=randread --bs=4k --size=512M --ioengine=libaio --iodepth=16 --runtime=20
# Stop tracing after workload finishes (Ctrl+C in blktrace terminal)
# Convert binary trace to human‑readable ASCII
blkparse -i /dev/shm/sda_blk.blk trace.* > sda_trace.txt
```
**Key fields in `sda_trace.txt`** (columns: `%d %t %d %d %d %s %a %d %d %d %n`):
| Field | Meaning |
|-------|---------|
| `%d`  | Device major:minor |
| `%t`  | Timestamp (ns) |
| `%d`  | Sector number |
| `%d`  | Bytes transferred |
| `%d`  | Action (`Q`=queue, `M`=merge, `I`=insert, `D`=issue, `C`=complete) |
| `%s`  | Process name |
| `%a`  | Action flags (read/write, sync/async) |
| `%d`  | PID |
| `%d`  | CPU |
| `%d`  | Error |
| `%n`  | Optional comment |

**Deriving queue depth**:  
`blkparse -a d` prints `(timestamp, depth)`. Compute average depth over the interval:
```bash
blkparse -a d -i /dev/shm/sda_blk.blk trace.* | awk '{sum+=$2; cnt++} END{print sum/cnt}'
```
If average depth ≈ 4 while `nr_requests` = 128, the device is under‑utilized; increasing `iodepth` in fio would raise depth and potentially reduce latency if the scheduler is work‑conserving.

### Example 3: Tuning I/O Scheduling with `ionice` and Measuring Impact
```bash
# Start a background fio workload (write‑heavy) at low priority
ionice -c 2 -n 7 -p $(pgrep -f fio) &
# Launch a latency‑sensitive read workload in the foreground
fio --name=latread --rw=randread --bs=4k --size=200M --ioengine=libaio --iodepth=1 \
    --runtime=10 --latency_percentile=1 --output-format=json
```
**Explanation**  
* The background job receives *best‑effort* priority 7 (lowest), so the CFQ (or BFQ) scheduler gives it the smallest time slice.  
* The foreground job inherits the task’s default priority (typically 4).  
* Measure the 99th‑percentile read latency from the JSON output; compare with a run where both jobs use the same priority (e.g., both `-n 4`).  
Typical result: background‑low‑priority reduces foreground latency from ~6.2 ms to ~3.8 ms at the cost of ~15 % lower background throughput, demonstrating the scheduler’s ability to enforce QoS.

---

## Common Mistakes
| Mistake | Why it’s Wrong | Correct Approach |
|---------|----------------|------------------|
| **Treating `%util` from `iostat` as a true utilization metric on multi‑queue devices** | `%util` sums time spent across all hardware queues; a value >100 % does **not** mean saturation, it merely indicates parallelism. | Divide by `nr_hw_queues` (`cat /sys/block/<dev>/queue/nr_hw_queues`) or use `iostat -x -j <device>` (kernel 5.10+) which reports per‑queue utilization. |
| **Assuming `ioping` without `-C` measures raw device latency** | The default uses buffered reads; hits in the page cache report sub‑microsecond latencies, masking the hardware. | Always use `-C` (or `direct=1` in fio) when the goal is to characterize the storage device. |
| **Collecting blktrace on the same disk being traced without isolating the trace buffer** | Writing trace data to the target device adds I/O, inflating latency and skewing results. | Redirect trace output to a ramdisk (`-o /dev/shm/btrace`) or to a separate SSD. |
| **Neglecting to align I/O to the device’s optimal I/O size** | Misaligned reads cause extra internal operations (read‑modify‑write on SSDs, extra sector reads on HDDs), increasing latency and wear. | Check `/sys/block/<dev>/queue/optimal_io_size` and `/sys/block/<dev>/queue/physical_block_size`; size I/O accordingly (e.g., `fio --bs=4k --align=4k`). |
| **Using a single `ionice` class to solve all latency problems** | `ionice` only influences the elevator’s scheduling; it cannot overcome device‑level bottlenecks such as saturated NCQ depth or firmware‑level queuing limits. | First verify device saturation via `/sys/block/<dev>/queue/nr_requests` and `iostat -x`; if saturated, upgrade hardware or reduce workload intensity before applying QoS. |
| **Interpreting raw blktrace timestamps as absolute wall‑clock time without accounting for CPU frequency scaling** | Trace timestamps are derived from `ktime_get_ns()`, which may be affected by `CONFIG_HIG_RES_TIMERS` and `tickless` mode; on systems with aggressive `intel_pstate` scaling, the apparent drift can confuse long‑term trends. | Convert timestamps using `clock_gettime(CLOCK_MONOTONIC)` correlation or simply rely on *differences* (latency, inter‑arrival) which are invariant to frequency scaling. |

---

## Exercises
### Easy
1. **Latency vs. Load** – Run `fio --name=seqread --rw=read --bs=1M --size=4G --ioengine=libaio --iodepth=1 --runtime=20` and record average latency. Repeat with `--iodepth=4,8,16`. Plot latency vs. iodepth and explain the trend using the M/M/1 response‑time formula.  
2. **Scheduler Comparison** – Switch the scheduler of `/dev/sda` to `cfq`, `deadline`, and `bfq` (one at a time). For each, run a 4 KiB random read workload (`fio --rw=randread --bs=4k --iodepth=32 --runtime=30`) and capture the 95th‑percentile latency. Summarize which scheduler yields lowest latency under this load.

### Medium
3. **Block Trace Analysis** – Collect a blktrace of a mixed workload (70 % reads, 30 % writes, 4 KiB, iodepth=8) for 30 seconds. Using `blkparse`, compute:  
   * Average request size.  
   * Read/write ratio.  
   * Queue depth time series (via `-a d`).  
   * Service time distribution (difference between `issue` and `complete`).  
   Present results in a short report with histograms.  
4. **Direct I/O vs. Buffered** – Run `ioping -c 100 /dev/sda` (buffered) and `ioping -c 100 -C /dev/sda` (direct). Compare the mean and variance. Explain why the buffered test shows a bimodal latency distribution.

### Hard
5. **eBPF Latency Profiler** – Write an eBPF program (using `bcc` or `bpftrace`) that attaches to `tracepoint/block/rq_issue` and `tracepoint/block/rq_complete`, computes per‑request latency, and updates a userspace histogram via a BPF map. Run it during a `fio --rw=randread --bs=4k --iodepth=64 --runtime=60` workload and output the latency histogram (percentiles 50, 90, 99, 99.9). Discuss any overhead observed (<2 % CPU).  
6. **Writeback Tuning Impact** – Modify `/proc/sys/vm/dirty_background_ratio` to 5 and `/proc/sys/vm/dirty_ratio` to 15. Run a sustained write workload (`fio --rw=write --bs=4k --size=10G --ioengine=libaio --iodepth=32 --runtime=120`). Measure the average write latency and the frequency of dirty‑page throttling events (via `vmstat -w`). Then revert to default ratios (10, 40) and repeat. Analyze how the change affects latency spikes and overall throughput.

---

## Linux Connection
### Subsystem Flow
1. **Virtual File System (VFS)** – `struct file → f_op → read_iter/write_iter`.  
2. **Block I/O Layer** – `generic_make_request()` → `blk_queue_enter()` → request allocation (`get_request()`).  
3. **Elevator (I/O Scheduler)** – Implemented as `struct elevator_queue` with ops: `->insert_req`, `->dispatch`, `->completed`. Examples:  
   * `cfq-iosched` (`/sys/block/sda/queue/iosched/cfq/...`)  
   * `deadline-iosched`  
   * `bfq-iosched`  
   * `mq-deadline` (multi‑queue aware)  
   * `kyber`  
4. **Request Queue** – `struct request_queue` fields:  
   * `nr_requests` (max depth)  
   * `max_hw_sectors`  
   * `optimal_io_size`  
   * `rotation` (SSD detection)  
5. **Device Driver** – For SATA: `ahci`; for NVMe: `nvme`. Driver builds struct `request` → DMA descriptors → writes to controller registers.  
6. **Hardware** – Rotational media (seek/rot/xfer) vs. solid‑state (NAND latency, program/erase blocks).  

### Concrete Kernel Interfaces
| Interface | Path | Purpose |
|-----------|------|---------|
| Scheduler selection | `/sys/block/<dev>/queue/scheduler` | Write scheduler name (`deadline`, `bfq`, …) |
| Request queue depth | `/sys/block/<dev>/queue/nr_requests` | Tune max queued requests |
| Hardware queue count (NVMe) | `/sys/block/<dev>/queue/nr_hw_queues` | Used to normalize `%util` |
| I/O scheduler tunables | `/sys/block/<dev>/queue/iosched/<sched>/` | e.g., `cfq_quantum`, `fifo_batch` |
| Disk stats | `/proc/diskstats` | Cumulative reads/writes, time spent |
| Tracepoints | `/sys/kernel/debug/tracing/events/block/`
