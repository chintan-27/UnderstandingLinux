---
id: 162
title: "Linux block layer deep dive"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to Linux Block Layer
The block layer is the kernel’s middleware that translates filesystem‑generated I/O (expressed as `bio` structures) into hardware‑specific commands for block devices. It abstracts device details (sector size, command set, queuing mechanism) while providing:
* **Request allocation and lifecycle management** – requests are allocated from a per‑CPU mempool (`blk_alloc_request`) to avoid sleeping in interrupt context.
* **Request merging** – adjacent bios are combined into a single request to reduce device overhead.
* **I/O scheduling** – the elevator algorithm reorders requests to minimize mechanical latency (seek + rotational delay) or to meet QoS goals.
* **Plugging** – the layer temporarily holds requests to allow more merges before issuing them to the driver, cutting interrupt frequency.
* **Completion handling** – drivers call `blk_complete_request`; the layer wakers any waiting tasks and returns status to the original `bio` submitter.

These mechanisms let the same VFS code work on anything from a 512‑byte floppy to a modern NVMe drive without modification.

### Requests
A `struct request` (defined in `include/linux/blkdev.h`) represents one or more contiguous sectors to be transferred. Key fields:

| Field | Type | Meaning |
|------|------|---------|
| `__sector_t sector` | sector number (LBA) of first sector |
| `unsigned int nr_sectors` | count of 512‑byte sectors (note: drivers may shift for larger logical block size) |
| `enum rq_cmd_type_bits cmd_type` | `REQ_TYPE_READ`, `REQ_TYPE_WRITE`, `REQ_TYPE_DISCARD`, etc. |
| `struct bio *bio` | head of a bio list describing the actual memory pages |
| `struct request_queue *q` | back‑pointer to the queue that owns the request |
| `unsigned int flags` | e.g. `REQ_FLUSH`, `REQ_FUA`, `REQ_NOMERGE` |

Requests are **not** allocated with plain `kmalloc`. The block layer uses a per‑CPU mempool (`blk_alloc_request`) backed by `kmem_cache_alloc` to guarantee availability even under memory pressure and to avoid sleeping while holding spinlocks.

A request describes a *range* of sectors; if the filesystem needs non‑contiguous pages, it builds a chain of `bio` structures, each describing a physically contiguous segment. The block layer links these bios to a single request via `req->bio`.

### Elevators
The elevator’s purpose is to reorder pending requests so that the device head (or NVMe command scheduler) moves monotonically through the logical address space, reducing:

* **Seek time** – proportional to distance between current and target cylinder:  
  \( T_{seek} = k_s \cdot |c_{curr} - c_{next}| \)  
* **Rotational latency** – average half‑rotation for HDDs:  
  \( T_{rot} = \frac{1}{2f_{rpm}} \) (where \( f_{rpm} = \frac{RPM}{60} \) rev/s).

For SSDs, seek/rotational terms are near zero, but elevator still matters for **queue depth** and **write amplification**: sorting writes reduces the number of erase‑block cycles.

Common elevators (implemented in `block/elevator/`):
* **noop** – FIFO, used for devices where host‑side sorting adds no benefit (e.g., intelligent storage controllers).
* **deadline** – guarantees a start time (`read_expire`, `write_expire`) while still sorting by sector; useful for mixed workloads.
* **cfq** (Completely Fair Queuing) – assigns time slices per process/group, aiming for fairness.
* **bfq** (Budget Fair Queuing) – similar to cfq but budgets by number of sectors, giving better IOPS control.
* **mq-deadline** & **kyber** – designed for blk‑mq, minimize locking and target low latency.

The algorithm works as follows (simplified):
1. Insert request into a sorted rb‑tree keyed by `sector`.
2. When dispatching, pick the leftmost node (lowest sector) that has expired its deadline (if any) else the nearest sector to the last dispatched position.
3. After dispatch, update the “last position” pointer; this creates the monotonic scan pattern.

Mathematically, if requests are uniformly distributed over `[0, S]` sectors, the expected seek distance under pure FIFO is \( S/3 \). Sorting reduces it to \( S/4 \) (for deadline) and can approach \( S/6 \) under ideal conditions, cutting seek time by ~33‑50 %.

### Multiqueue Block Layer (blk‑mq)
Traditional single‑queue request allocation required a global spinlock (`queue_lock`). blk‑mq replaces this with:
* **Per‑CPU hardware queues** (`struct blk_mq_hw_ctx`) – each CPU gets its own submission ring, eliminating contention on submission.
* **Shared software queues** (`struct blk_mq_ctx`) – hold requests before they are handed to a hardware queue; still use per‑CPU locks.
* **Elevator delegation** – the elevator works on the software queues; hardware queues are FIFO (or driver‑specific) because the ordering already happened upstream.
* **Completion rings** – each hardware queue has a completion queue where the driver writes status; the kernel polls or receives IRQs to call `blk_complete_request`.

This design scales to millions of IOPS on NVMe because submission and completion are lock‑free per CPU, and the only shared structure is the per‑CPU mempool for requests.

---

## How It Works
### End‑to‑End Path (Read Example)

1. **VFS → generic_make_request**  
   `generic_make_request(bio)` is called by the filesystem (e.g., ext4’s `ext4_readpage`). It checks `bio->bi_opf` (READ/WRITE) and increments `bio->bi_remaining`.

2. **Queue Entry**  
   `blk_queue_enter(q, blk_gfp_mask())` attempts to increment the queue’s usage counter; if the queue is frozen (e.g., due to suspend) the call sleeps.

3. **Request Allocation**  
   `req = blk_get_request(q, bio->bi_opf, __GFP_WAIT);`  
   Pulls a request from the per‑CPU mempool, initializes `req->cmd_type` from the bio op, and attaches the bio chain via `blk_rq_bio_prep(req, bio)`.

4. **Elevator Insertion**  
   If the queue is not plugged, `elv_add_request(q, req, false)` inserts the request into the elevator’s rb‑tree (sorted by sector) and possibly merges with the tail request (`elv_merge`).

5. **Plug & Dispatch**  
   If the queue is plugged (`q->plugged`), the request stays in the queue; otherwise `blk_run_queue_async(q)` kicks the plug:  
   * `blk_flush_plug_list(q)` pulls requests from the software queues, hands them to the appropriate hardware queue (`blk_mq_push_to_hw`), and triggers the driver’s `queue_rq` method (or directly writes to the doorbell register for NVMe).

6. **Driver Execution**  
   The driver (e.g., `nvme`) builds a command from `req->cmd`, `req->sector`, `req->nr_sectors`, and the bio’s page list, writes it to the submission queue, and rings the doorbell.

7. **Completion**  
   Upon interrupt (or completion queue poll), the driver calls `blk_complete_request(req)`. This:
   * Completes the associated bios (`bio_endio(bio)`).
   * Decrements the queue usage counter (`blk_put_queue`).
   * If the request had `REQ_FLUSH` or `REQ_FUA`, issues a flush command before signaling success.

8. **Plug Unplug**  
   If the queue becomes empty, the plug is cleared; subsequent I/O will be dispatched immediately.

### Queueing Theory Insight
Treat the block layer as an M/G/1 queue where:
* Arrival rate λ = I/O requests per second from the filesystem.
* Service time distribution G = device latency (seek + rotational + transfer).  
  For HDD: \( G = T_{seek} + T_{rot} + \frac{N \cdot S}{B} \) where N = nr_sectors, S = sector size (512 B), B = bus bandwidth.
* Utilization ρ = λ·E[G].

Average response time (Little’s Law):  
\( W = \frac{E[G]}{1 - \rho} \) (M/G/1 approximation).  
Elevator reduces E[G] by lowering the seek component; blk‑mq reduces ρ’s variance by allowing parallel service across hardware queues.

---

## Worked Examples
### Example 1: Reading a 4 KB Ext4 File on a SATA SSD
Assumptions:
* Sector size = 512 B → 8 sectors per 4 KB.
* File starts at logical block number 1 024 000 (aligned to 4 KB).
* SSD: negligible seek/rotational latency (~0.02 ms), transfer bandwidth 500 MB/s → transfer time for 8 KB ≈ 0.016 ms.
* Using the `deadline` elevator with default `read_expire = 500 ms`.

**Step‑by‑step**
1. VFS calls `generic_make_request(bio)` where `bio->bi_iter.bi_sector = 1024000`, `bio->bi_iter.bi_size = 4096`.
2. `blk_get_request` allocates `req`; sets `req->cmd_type = REQ_TYPE_READ`, `req->nr_sectors = 8`.
3. `blk_rq_bio_prep` links the bio to `req->bio`.
4. Elevator inserts `req`; since the queue is empty, it becomes the only request.
5. Plug is not set → `blk_run_queue_async` dispatches `req` to hardware queue 0.
6. NVMe driver builds a command: CDW0 = opcode 0x06 (Read), start LBA = 1024000, length = 8 sectors.
7. Device returns data; completion interrupt triggers `blk_complete_request`.
8. `bio_endio` copies data from the bio’s page to the page cache; ext4 unlocks the page and returns to the caller.

**Timing Calculation**  
Total latency ≈ queueing delay (≈0 µs, empty) + dispatch overhead (~2 µs) + device latency (0.02 ms seek + 0.016 ms transfer) ≈ **0.04 ms**.  
If the same read were issued via a traditional single‑queue with a lock, an extra ~5 µs lock acquisition could be observed under load.

### Example 2: Writing a 256 KB File with Writeback
Assumptions:
* Writeback delays actual write until `pdflush` writes dirty pages (default 5 s or when dirty memory exceeds 10 %).
* File occupies sectors 2 048 000 … 2 049 023 (512 sectors).
* Using `cfq` elevator with timeslice = 10 ms per task.

**Step‑by‑step (simplified)**
1. Page fault → ext4 writes data into a page, marks it dirty (`SetPageDirty`).
2. Later, `writeback_single_inode` walks dirty pages, for each page calls `mpage_writepage` → `generic_make_request(bio)` with `WRITE`.
3. `bio` describes a 4 KB chunk (8 sectors). `blk_get_request` allocates request, `cmd_type = REQ_TYPE_WRITE`.
4. Elevator (`cfq`) places request into the task’s queue; if the task has exhausted its timeslice, it waits.
5. When the task’s slice is granted, `elv_dispatch_request` picks the request (sorted by sector) and hands it to the hardware queue.
6. Driver aggregates multiple contiguous requests (if the plug is still active) into a single NVMe write command covering up to 256 KB (max payload).
7. Device writes data to flash; returns completion.
8. `blk_complete_request` wakes the waiting task; writeback decrements the dirty counter.

**Why Writeback Matters**  
If the filesystem issued a synchronous write (`WRITE_SYNC`) for each 4 KB, the elevator would see many small requests, causing more doorbell rings and higher CPU overhead. Writeback lets the block layer merge adjacent writes, reducing the number of commands from 64 (256 KB/4 KB) to as few as 1–4, cutting overhead by >90 %.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Causes Problems |
|---------|--------------|------------------------|
| **Calling `blk_execute_rq` with the queue lock held** | `blk_execute_rq` internally tries to acquire `q->queue_lock` (or its blk‑mq equivalent) to allocate a request. If the lock is already held, you deadlock. | The block layer expects to be called from a context where no queue lock is held (e.g., process context after `blk_queue_enter`). Holding the lock violates this assumption and stalls all I/O on that device. |
| **Omitting `REQ_FLUSH`/`REQ_FUA` for metadata updates** | A request that updates filesystem metadata (inode, journal) without a flush may be reordered before preceding data writes. | On power loss, the storage may report the metadata as persisted while the associated data is still in volatile cache, leading to filesystem corruption. The flush forces the device to write its volatile cache to non‑volatile media before signaling completion. |
| **Confusing `nr_sectors` with byte count** | Setting `req->nr_sectors = buf_len` instead of `buf_len / SECTOR_SIZE`. | The device will interpret the value as a sector count, causing massive overruns (e.g., a 4 KB buffer becomes 4096 sectors ≈ 2 MB) → DMA writes beyond the allocated page, corrupting memory or triggering a page fault. |
| **Reusing a request without clearing `REQ_NOMERGE` flag** | After completing a request, the caller resubmits the same `struct request` without clearing flags set by the previous I/O (e.g., `REQ_NOMERGE` from a discard). | The elevator may treat the new request as non‑mergeable, preventing coalescing with adjacent I/O and increasing latency. Worse, leftover flags can cause the driver to issue unsupported commands (e.g., a discard flag on a read). |
| **Assuming `blk_execute_rq` is asynchronous** | Treating the return value as “request submitted” and freeing the request immediately. | `blk_execute_rq` is synchronous; it waits for completion before returning. Freeing the request while the driver still owns it leads to use‑after‑free and kernel oops. The correct pattern is to allocate, submit, and either wait (`blk_execute_rq`) **or** use the async path (`blk_insert_request`) and complete via a callback. |

---

## Exercises
### Easy
1. **Create a ramdisk block driver using blk‑mq**  
   * Use `blk_mq_alloc_queue` and `blk_mq_init_queue`.  
   * Implement a simple `queue_rx` that copies data from a pre‑allocated memory pool (`vmalloc`) based on `req->sector` and `req->nr_sectors`.  
   * Test with `dd if=/dev/zero of=/dev/ram0 bs=4K count=1024`. Verify throughput with `hdparm -t /dev/ram0`.

### Medium
2. **Implement a FIFO elevator for blk‑mq**  
   * Copy `none_elevator.c` and replace the merge/dispatch logic with a simple FIFO list (`list_add_tail` on insertion, `list_pop_front` on dispatch).  
   * Register it via `elv_register(&elevator_fifo)`.  
   * Run `fio --name=test --rw=randread --bs=4K --size=1G --direct=1 --ioengine=libaio` and compare average latency with the default `mq-deadline` scheduler (`cat /sys/block/sda/queue/scheduler`).  
   * Explain why FIFO yields higher latency on rotational media but similar latency on NVMe.

### Hard
3. **Modify the CFQ scheduler to prioritize real‑time tasks**  
   * Locate `cfq_slice_used` in `block/cfq-iosched.c`.  
   * Add a check: if `task->rt_priority` (from `struct task_struct`) is non‑zero, reduce the slice consumption factor (e.g., give them double the effective timeslice).  
   * Recompile the kernel, boot with the modified CFQ (`echo cfq > /sys/block/sda/queue/scheduler`).  
   * Run a mixed workload: a real‑time priority `fio` process (`chrt -f 99 fio …`) alongside a best‑effort `fio` process. Measure 99th‑percentile latency of the RT process and verify improvement.  
   * Discuss the impact on overall throughput and starvation risks.

---

## Linux Connection
**Source Locations (Linux 6.6+)**
* Core block layer: `block/blk-core.c` – request allocation, plugging, `generic_make_request`.
* Multi‑queue infrastructure: `block/blk-mq.c`, `block/blk-mq.h` – hardware queues, tag allocation, completion paths.
* Elevator implementations: `block/elevator/` – `noop.c`, `deadline.c`, `cfq.c`, `bfq.c`, `mq-deadline.c`, `kyber.c`.
* Request structure: `include/linux/blkdev.h`.
* Bio structure: `include/linux/bio.h`.
* Module parameters (e.g., scheduler selection): `/sys/block/<dev>/queue/scheduler`.

**Tools for Observation and Tuning**
| Tool | Purpose | Example Command |
|------|---------|-----------------|
| `blktrace` / `blkparse` | Trace request issuance and completion | `sudo blktrace -d /dev/sda -o - | blkparse -i -` |
| `iostat -x` | Extended device statistics (await, svctm, %util) | `iostat -x 1` |
| `fio` | Flexible I/O benchmarker with per‑job latency histograms | `fio --name=read --rw=read --bs=4K --direct=1 --size=4G --runtime=30` |
| `perf trace -e block:*` | Kernel tracepoints for block events (issue, complete) | `perf trace -e block:block_rq_issue,block:block_rq_complete` |
| `hdparm -tT` | Cached vs device read speed | `hdparm -tT /dev/sda` |
| `lsblk -o NAME,ROTA,SCHED` | Show rotational flag and current scheduler | `lsblk -o NAME,ROTA,SCHED` |

**Manipulating the I/O Scheduler at Runtime**
```bash
# List available schedulers for a device
cat /sys/block/sda/queue/scheduler

# Switch to kyber (requires kernel ≥4.12)
echo kyber | sudo tee /sys/block/sda/queue/scheduler

# Verify
cat /sys/block/sda/queue/scheduler
```
You can also set per‑queue parameters, e.g.:
```bash
# Increase deadline fifo_expire for reads (default 250 ms)
echo 500 | sudo tee /sys/block/sda/queue/iosched/fifo_expire_read
```

---

## Why This Matters
The block layer is the linchpin that turns abstract file‑system operations into concrete storage transactions. Its design decisions directly affect three cross‑cutting concerns:

1. **Performance** – By merging requests and sorting them via elevators, the layer reduces mechanical seek/rotational latency on HDDs and minimizes doorbell rings and command overhead on NVMe. The multiqueue architecture lets modern storage scale to millions of IOPS without locking bottlenecks, a prerequisite for cloud workloads, databases, and AI training pipelines that demand low latency and high throughput.

2. **Reliability** – Features like flush/fua barriers, writeback throttling, and proper request completion ordering guarantee that the on‑disk state matches the kernel’s expectations even after power loss or driver bugs. Mistakes in these areas (e.g., missing `REQ_FLUSH`) are a common source of silent filesystem corruption.

3. **Resource Efficiency** – Efficient request allocation (per‑CPU mempools), plugging, and lock‑less submission reduce CPU cycles spent in the block layer, leaving more cycles for applications. In containerized environments, where many short‑lived tasks share the same block device, this efficiency translates to higher container density and lower energy consumption.

Understanding the block layer’s internals enables developers to:
* Tune schedulers per workload (e.g., `kyber` for low‑latency interactive tasks, `bfq` for fair desktop I/O).
* Diagnose I/O stalls using `blktrace` and `perf`.
* Build custom block devices (RAM disks, network block devices, cryptographic targets) that integrate cleanly with the VFS.
* Reason about trade‑offs when designing userspace storage systems (SPDK, DPDK) that bypass the kernel block layer.

Mastering this layer is therefore not an academic exercise—it is a practical necessity for anyone who wishes to build, optimize, or troubleshoot storage‑intensive Linux systems.
