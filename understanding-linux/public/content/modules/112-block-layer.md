---
id: 112
title: "Block layer"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

The block layer solves a specific mechanical problem: a disk head moving randomly between sectors costs roughly $10\text{ms}$ per seek. At that rate, 100 random requests take ~1 second in seek time alone, regardless of how fast the disk actually reads. The block layer exists to transform random access patterns into sequential ones, merge adjacent requests so the hardware sees fewer operations, and prevent any single workload from monopolizing the device. Every subsystem that does disk I/O — `ext4`, `xfs`, swap, `O_DIRECT` — submits to the same queue and benefits from the same scheduling decisions.

On SSDs, seek time is negligible, but request coalescing still reduces command overhead and improves write amplification. The block layer remains relevant even when the mechanical justification disappears.

---

## Core Concepts

### Sectors, Blocks, and the Unit of Transfer

Hardware exposes storage as a flat array of **sectors**. Traditional drives use 512-byte sectors; drives manufactured after ~2011 use 4096-byte physical sectors, sometimes presenting a 512-byte logical interface for compatibility (512e). The kernel's block layer operates in **logical blocks** — the filesystem's allocation unit, always a power-of-two multiple of the sector size. A 4096-byte block on a 512-byte-sector disk spans exactly 8 sectors.

A file's data is located at a series of logical block addresses (LBAs). Whether those blocks become one I/O request or several depends on whether their LBAs are contiguous. If `ext4` allocates blocks 200–202 and 800 for a file, the block layer will issue one request for sectors covering blocks 200–202 and a separate request for block 800 — no scheduler merges non-adjacent LBAs.

Check what logical and physical sector sizes a device reports:

```bash
blockdev --getss /dev/sda    # logical sector size (typically 512)
blockdev --getpbsz /dev/sda  # physical sector size (typically 4096)
```

### The `bio` Structure: Describing One I/O Operation

The `bio` is the unit of currency between the VFS and the block layer. Before `bio` existed, the kernel used `buffer_head` — one struct per disk block per page. A 128KB read split across 32 blocks generated 32 `buffer_head` structs that had to be issued, tracked, and reassembled individually. `bio` replaces all of that with a single descriptor that can reference multiple non-contiguous physical pages through a **scatter-gather list**.

The key fields (from `include/linux/blk_types.h`):

```c
struct bio {
    sector_t            bi_iter.bi_sector;  /* starting LBA on disk */
    struct block_device *bi_bdev;           /* target device */
    unsigned int        bi_iter.bi_size;    /* bytes remaining */
    unsigned short      bi_vcnt;            /* number of bio_vecs */
    struct bio_vec     *bi_io_vec;          /* scatter-gather segments */
    bio_end_io_t       *bi_end_io;          /* completion callback */
    void               *bi_private;         /* caller's context pointer */
};
```

Each segment is a `bio_vec`:

```c
struct bio_vec {
    struct page  *bv_page;    /* physical page frame */
    unsigned int  bv_len;     /* byte count in this segment */
    unsigned int  bv_offset;  /* byte offset within the page */
};
```

A `bio` with `bi_vcnt = 3` might reference pages at physical addresses `0x1a3000`, `0x7f1000`, and `0x204000` — scattered across physical memory — yet describe a logically contiguous range on disk. The DMA controller walks the `bio_vec` array and writes each segment to its physical address directly, which is why `bio` tracks physical pages rather than virtual addresses. Virtual addresses are process-specific and meaningless to a DMA engine; physical addresses are not.

Memory spanned by one `bio`:

$$\text{max bytes} = \text{bi\_vcnt} \times \text{PAGE\_SIZE} = N \times 4096$$

In practice `bi_vcnt` is capped by `BIO_MAX_VECS` (256 in recent kernels), so one `bio` can describe up to $256 \times 4096 = 1\text{MB}$ of data across scattered pages.

### Requests and the Request Queue

A `bio` describes what to transfer. A `request` is what the block layer actually hands to a driver. One `request` may contain multiple `bio` structures when they target contiguous or adjacent sectors — the scheduler folds them together. The `request_queue` is the per-device data structure that holds all pending requests and carries the scheduler's state.

Submitting a `bio` calls `submit_bio()`, which calls into `generic_make_request()`, which invokes the queue's `make_request_fn`. From that point the scheduler owns the `bio`.

```c
/* kernel internal — not called from userspace, but visible in driver code */
void submit_bio(struct bio *bio);
```

### I/O Schedulers (Elevators)

The scheduler is called an elevator because it sweeps in one direction rather than reversing for every request. Its two responsibilities:

**Merging**: A new request targeting sectors $[s, s+n]$ can be appended to an existing request ending at sector $s$ (back merge) or prepended to one starting at $s+n$ (front merge). Merging reduces the number of commands the driver issues and keeps DMA transfers large.

**Sorting**: Requests that cannot be merged are inserted into the queue at their sorted sector position. If the head is sweeping from sector 0 upward, new requests slot in ahead of the head's current position or behind it — the scheduler tracks which direction the sweep is moving.

**The Linus Elevator** maintains a single sorted queue. Its failure mode is starvation: a steady stream of requests to sectors near 500 will prevent a request to sector 50,000 from ever being reached. Additionally, since writes are fire-and-forget (the submitting process does not block) while reads are synchronous (the process sleeps until completion), a write-heavy workload can keep the sorted queue full near sectors the writer cares about, starving reads indefinitely.

**The Deadline Scheduler** fixes starvation by running three structures simultaneously:

- A **sorted queue** (same as the Linus Elevator) for merge efficiency
- A **read FIFO queue** ordered by submission time, deadline = **5ms**
- A **write FIFO queue** ordered by submission time, deadline = **500ms**

The scheduler dispatches from the sorted queue normally, but before each dispatch it checks the FIFO heads. If the oldest read has been waiting more than 5ms, it is dispatched immediately, regardless of sector order. The read deadline is 100× tighter than the write deadline because a process is sleeping on the read; no process is waiting on the write.

**The Anticipatory Scheduler** addresses a different inefficiency in Deadline. After servicing a read from sector $r$, Deadline immediately returns to the sorted queue, which may dispatch a write at sector $r'$ far from $r$. If the application that issued the read is about to issue another read at sector $r + \delta$ (common in sequential workloads), the head will seek from $r$ to $r'$ and back — two seeks for one read. The Anticipatory scheduler introduces a wait of a few milliseconds after each read, holding the head in place. If a nearby read arrives within the window, the seek is avoided. If not, the penalty is bounded by the wait time. The tradeoff is explicit: accept up to ~6ms of added latency per read in exchange for eliminating pairs of seeks that each cost ~10ms.

On modern kernels (5.x+), the dominant scheduler for SSDs and NVMe is **mq-deadline** or **none** (no reordering), exposed through the multi-queue block layer (`blk-mq`). The anticipatory scheduler was removed in 2.6.33.

Check and change the scheduler for a device:

```bash
cat /sys/block/sda/queue/scheduler
# Output: mq-deadline [kyber] none

echo mq-deadline > /sys/block/sda/queue/scheduler
```

Tune the deadline read/write expiry times (in milliseconds):

```bash
cat /sys/block/sda/queue/iosched/read_expire   # default: 500
cat /sys/block/sda/queue/iosched/write_expire  # default: 5000
```

---

## How It Works

### The Path of a Read Request

```
read(2) syscall
  → VFS → filesystem read handler (e.g., ext4_readpages)
  → block map lookup: logical file offset → LBA
  → bio allocation and population (bi_sector, bi_io_vec filled)
  → submit_bio()
  → generic_make_request()
  → elevator: attempt back/front merge, else sorted insert
  → driver dispatch_fn: pull from queue, issue to hardware
  → DMA transfer; interrupt fires on completion
  → interrupt handler: bio_endio() → wake up waiting process
```

At step 5, the merge attempt is $O(\log n)$ in queue depth using a red-black tree keyed on sector number. The tree allows the scheduler to find the nearest queued request in logarithmic time, which matters when the queue depth is in the hundreds.

### Seek Cost and Why Sorting Helps

For a spinning disk, the dominant latency is seek time, not transfer time. The transfer rate for a modern HDD is ~150MB/s, so a 4KB block transfers in:

$$t_{\text{transfer}} = \frac{4096 \text{ B}}{150 \times 10^6 \text{ B/s}} \approx 27\,\mu\text{s}$$

A full-stroke seek takes ~10ms — roughly **370× longer** than the transfer itself. Rotational latency adds another ~4ms on average (half a revolution at 7200 RPM: $\frac{60}{7200} \times \frac{1}{2} \approx 4.2\text{ms}$). The total service time for a random 4KB read is dominated by positioning:

$$t_{\text{random}} \approx t_{\text{seek}} + t_{\text{rotation}} + t_{\text{transfer
