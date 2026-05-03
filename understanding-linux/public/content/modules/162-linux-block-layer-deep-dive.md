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

## Why This Matters

Every `write()` syscall eventually becomes a device transaction, but the path between them is not direct. The block layer exists because device hardware has constraints that software cannot ignore: a spinning disk's read/write head takes 4–8 ms to seek between tracks, and a NVMe SSD's internal parallelism is only exploited when multiple requests are outstanding simultaneously. Without the block layer's batching and reordering, sequential writes from a single process would arrive at the device as individual small transactions, each one waiting for the previous to complete. The throughput difference between serialized 4 KB writes and merged 128 KB writes on the same device can exceed 10×, not because the hardware got faster, but because the access pattern changed.

The block layer is also the point where the kernel can enforce fairness and latency bounds across competing processes. Without it, a `fsync()`-heavy database would starve a background backup. The scheduler's job is to make those tradeoffs explicit and tunable.

---

## Core Concepts

### Requests vs. Bio Structures

The block layer operates on two levels of abstraction with a specific reason for each.

A **bio** (`struct bio`) is the unit the file system creates. It describes a single contiguous transfer: a set of physical memory pages (the scatter-gather list `bi_io_vec`) mapped to a contiguous range of device sectors. The file system knows nothing about device geometry or queue state — it just says "transfer these pages to/from these sectors."

```c
// include/linux/blk_types.h (simplified)
struct bio {
    struct block_device *bi_bdev;
    unsigned int         bi_opf;        // REQ_OP_READ, REQ_OP_WRITE, REQ_SYNC, etc.
    struct bvec_iter     bi_iter;        // bi_iter.bi_sector: start sector
    unsigned short       bi_vcnt;        // number of bio_vecs
    struct bio_vec      *bi_io_vec;      // array of {page, offset, len} tuples
    struct bio          *bi_next;        // for bio chains
};

struct bio_vec {
    struct page *bv_page;
    unsigned int bv_len;
    unsigned int bv_offset;
};
```

A **request** (`struct request`) is what the scheduler and device driver see. The block layer merges multiple bios into a single request when they address adjacent sectors. If bio A covers sectors $[s, s+k)$ and bio B covers $[s+k, s+k+m)$, they merge into one request covering $[s, s+k+m)$, reducing device transactions from 2 to 1. The device never sees individual bios — it sees requests.

```c
// include/linux/blkdev.h (simplified)
struct request {
    struct request_queue *q;
    struct blk_mq_ctx    *mq_ctx;    // per-CPU software queue context
    struct blk_mq_hw_ctx *mq_hctx;  // hardware queue context
    unsigned int          cmd_flags; // REQ_OP_* | modifier flags
    sector_t              __sector;  // start sector of merged request
    unsigned int          __data_len; // total byte count after merges
    struct bio           *bio;       // first bio in the chain
    struct bio           *biotail;   // last bio (for O(1) append)
};
```

The split in abstraction levels is intentional: the file system layer works with bios because it deals with logical page-to-sector mappings. The driver layer works with requests because it needs to know the full extent of a transfer to program DMA. The block layer holds both simultaneously during the merge window.

### I/O Schedulers (Elevators)

An elevator reorders requests to reduce device overhead. The name reflects the core insight: an elevator serving floors 1, 5, 3, 7, 2 in arrival order is slower than one that sweeps 1→3→5→7 and returns. For a rotating disk, each out-of-order seek costs roughly:

$$t_{\text{seek}} \approx \frac{1}{2} \cdot t_{\text{full\_stroke}} + \frac{1}{2} \cdot \frac{1}{2 \cdot \text{RPM} / 60}$$

At 7200 RPM, rotational latency alone is $\frac{1}{2} \times \frac{60}{7200} \approx 4.2\,\text{ms}$. Eliminating unnecessary seeks is the single largest win available at the software level for rotating media.

For SSDs, the seek penalty is near zero, but elevator behavior still matters: deadline enforcement prevents starvation, and controlling queue depth prevents latency spikes caused by device-internal queuing overflow.

| Scheduler | Core Mechanism | Primary Target |
|---|---|---|
| `none` | FIFO pass-through | NVMe with device-internal scheduling |
| `mq-deadline` | Per-direction sorted queues + expiry timers | NVMe, SSD, HDD needing latency bounds |
| `bfq` | Proportional-share budgets per process | Desktop, mixed interactive/background |
| `kyber` | Token buckets per latency class | Low-latency NVMe |
| `cfq` | Per-process time slices (removed in 5.0) | Legacy HDD mixed workloads |

`mq-deadline` maintains two red-black trees (one sorted by sector, one by deadline) for reads and writes separately. It dispatches from the sector-sorted tree to achieve elevator behavior, but switches to the deadline tree when any request's expiry timer fires — guaranteeing bounded worst-case latency at the cost of slightly suboptimal seek patterns.

### The Multiqueue Block Layer (blk-mq)

The original block layer had a single `request_queue` per device protected by a spinlock. On a 1-Gbps spinning disk doing 200 IOPS, that lock was uncontested — CPUs spent microseconds waiting at most. A modern NVMe SSD does $10^6$ IOPS. If each IOPS requires two lock operations (enqueue + dequeue), and each lock operation costs even 100 ns, the lock alone consumes:

$$10^6 \,\text{IOPS} \times 2 \times 100\,\text{ns} = 200\,\text{ms of CPU time per second}$$

That is 20% of a single core doing nothing but lock management, and it serializes all CPUs. blk-mq eliminates the global lock with a two-tier queue architecture:

**Software queues** (`struct blk_mq_ctx`) — one per CPU. Requests are staged here with no cross-CPU synchronization. Each CPU owns its queue entry exclusively until dispatch.

**Hardware queues** (`struct blk_mq_hw_ctx`) — one per device submission queue. Software queues are mapped onto hardware queues; multiple CPUs may share one hardware queue, but the mapping is stable (NUMA-aware) so cross-socket traffic is minimized.

NVMe devices expose up to 65,535 hardware submission queues (`NVMe spec: Section 1.4.1`). blk-mq lets the kernel fill all of them simultaneously from independent CPUs. The throughput ceiling becomes:

$$\text{IOPS}_{\text{max}} = \min\!\left(\text{device IOPS},\; \frac{N_{\text{hw\_queues}} \times \text{queue\_depth}_{\text{hw}}}{\bar{t}_{\text{latency}}}\right)$$

where $\bar{t}_{\text{latency}}$ is mean device service time per request. Increasing hardware queue count or queue depth raises the ceiling only until device IOPS becomes the bottleneck.

---

## How It Works

### Request Lifecycle

```
userspace write()
    ↓
sys_write → VFS → page cache (if buffered) or direct path
    ↓
file system (ext4, xfs, btrfs) — allocates sectors, constructs struct bio
    ↓
submit_bio() — entry point into generic block layer
    ↓
blk-mq software queue (per-CPU, no lock contention)
    ↓
I/O scheduler — merge attempt, insertion into sorted structure
    ↓
blk-mq hardware queue — request dispatched to driver
    ↓
device driver (nvme, scsi, virtio-blk) — DMA setup, command submission
    ↓
hardware completion interrupt → blk_mq_complete_request()
    ↓
bio->bi_end_io() callback → file system / caller notified
```

Three kernel tracepoints instrument the critical transitions:

| Tracepoint | Fires When | Measures |
|---|---|---|
| `block:block_rq_insert` | Request enters scheduler queue | Queue entry time $t_0$ |
| `block:block_rq_issue` | Request dispatched to driver | Scheduler latency $= t_1 - t_0$ |
| `block:block_rq_complete` | Driver signals completion | Device service time $= t_2 - t_1$ |

`iostat`'s `await` metric is the sum:

$$\text{await} = (t_1 - t_0) + (t_2 - t_1) = t_2 - t_0$$

A high `await` with a low `%util` means the scheduler is holding requests unnecessarily — the device is idle but the elevator is queuing. A high `await` with `%util` near 100% means the device is genuinely saturated.

### Merging in Detail

The elevator maintains requests sorted by `__sector` in a red-black tree. When `submit_bio()` delivers a new bio, the elevator performs a tree lookup for adjacency:

- **Back merge**: new bio starts at $s_{\text{new}}$, existing request ends at $s_{\text{end}}$. Merge if $s_{\text{new}} = s_{\text{end}}$.
- **Front merge**: new bio ends at $s_{\text{new\_end}}$, existing request starts at $s_{\text{start}}$. Merge if $s_{\text{new\_end}} = s_{\text{start}}$.

Front merges are more expensive (the request's sector key in the tree must change)
