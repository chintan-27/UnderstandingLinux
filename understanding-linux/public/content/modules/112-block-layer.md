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

## Core Concepts
### Introduction to the Block Layer
The block layer is the kernel subsystem that translates filesystem‑issued I/O requests into device‑specific commands. Unlike character devices, block devices are addressed in fixed‑size units called *sectors* (historically 512 B, nowadays often 4 KiB after internal remapping). The block layer presents a uniform interface to filesystems while handling device‑specific quirks such as native command queuing (NCQ), write caching, and erase‑block alignment for flash.

A *bio* (`struct bio`) is the fundamental descriptor of a block I/O operation. It does **not** contain the data itself; instead it holds pointers to the memory pages that store the data, the target sector on the device, and completion callbacks. The bio is allocated with `bio_alloc(gfp_t gfp_mask, unsigned int nr_iovecs)`, where `nr_iovecs` is the number of `struct bio_vec` entries needed to describe the scatter‑gather list. The kernel then chains one or more bios together when a request spans multiple pages or needs to be split across device boundaries.

A *request queue* (`struct request_queue`) is the per‑device holding area for pending I/O. Each queue is associated with a block device’s `gendisk` and holds a list of `struct request` objects. A request groups one or more bios that are contiguous in sector space and share the same direction (READ or WRITE). The queue is serviced by the device driver’s `request_fn` (or, in the blk‑mq path, by hardware queues and completion interrupts). The elevator algorithm lives inside the queue and determines the order in which requests are dispatched to the driver.

### Bio Structure – Layout and Lifecycle
```c
/* include/linux/bio.h */
struct bio {
    struct bio *bi_next;          /* used by request queue */
    struct block_device *bi_bdev; /* target device */
    unsigned long bi_flags;       /* BIO_UPTODATE, BIO_POOL_NONE, … */
    unsigned int bi_opf;          /* REQ_OP, REQ_PREFLUSH, REQ_SYNC, … */
    unsigned int bi_vcnt;         /* number of bio_vecs */
    unsigned int bi_max_vecs;     /* capacity of bi_io_vec array */
    struct bio_vec *bi_io_vec;    /* scatter‑gather array */
    sector_t bi_sector;           /* first sector of the I/O */
    unsigned int bi_size;         /* total bytes in the bio */
    unsigned int bi_seg_front_size;/* bytes used in first vec */
    unsigned int bi_seg_back_size; /* bytes used in last vec */
    bio_end_io_t *bi_end_io;      /* completion callback */
    void *bi_private;             /* caller‑private data */
    /* … */
};
```
*Why these fields?*  
- `bi_sector` and `bi_size` let the block layer compute the exact device range without consulting the filesystem.  
- `bi_io_vec` enables zero‑copy: the kernel can point directly at the page cache pages that hold file data, avoiding an extra memcpy.  
- `bi_end_io` allows the layer to notify the filesystem (or any caller) when the device signals completion, which is essential for asynchronous I/O and proper error propagation.  
- The `bi_next` singly‑linked list is used by the request queue to link multiple bios that belong to the same request.

A bio’s lifetime follows: allocation → initialization (sector, size, pages) → submission (`submit_bio` or `generic_make_request`) → optional splitting/merging in the queue → execution by the driver → completion callback → `bio_put` (which frees the bio when its reference count drops to zero).

### Request Queue and Request Objects
```c
/* include/linux/blkdev.h */
struct request {
    struct request *queuelist;    /* linked list in the queue */
    struct request_queue *q;      /* back pointer */
    struct bio *bio;              /* head of bio list */
    struct bio *biotail;          /* tail for fast insertion */
    unsigned int __data_len;      /* total bytes */
    unsigned int __sector;        /* sector offset */
    unsigned short cmd_flags;     /* REQ_OP, REQ_SYNC, … */
    unsigned short cmd_type;      /* REQ_TYPE_FS, REQ_TYPE_BLOCK_PC, … */
    /* … */
};
```
When a bio is submitted, the block layer attempts to *merge* it with an existing request:
- **Front merge**: if `bio->bi_sector == req->__sector - bio_sectors(bio)`.
- **Back merge**: if `bio->bi_sector == req->__sector + req->__data_len / SECTOR_SIZE`.
If merging fails, a new `struct request` is allocated from a mempool (`blk_rq_alloc`) and inserted into the queue according to the active elevator algorithm.

### Elevator Algorithm – From First Principles
The elevator (also called the I/O scheduler) seeks to minimize *seek distance* because mechanical hard drives spend the majority of latency moving the head. Assume a simple model:

- Seek time: $T_{\text{seek}}(d) = T_0 + k\sqrt{d}$, where $d$ is the number of cylinders moved, $T_0\approx0.5\text{ms}$, $k\approx0.01\text{ms}/\sqrt{\text{cyl}}$ (empirical fit for a 7200 RPM drive).  
- Rotational latency: $T_{\text{rot}} = \frac{1}{2}\frac{60}{\text{RPM}}$ seconds.  
- Transfer time: $T_{\text{xfer}} = \frac{L}{R}$, where $L$ is transfer length (bytes) and $R$ is sustained transfer rate (bytes/s).

Total service time for a request:  
$$T = T_{\text{seek}}(d) + T_{\text{rot}} + T_{\text{xfer}}.$$

If we service requests in strictly increasing sector number (the classic *elevator* or *SCAN* algorithm), the head moves monotonically across the disk, reversing direction only at the extremes. This guarantees that the total seek distance over a schedule is bounded by the full stroke of the actuator, which is optimal for a single‑direction sweep. More sophisticated schedulers (CFQ, BFQ, deadline) layer additional policies (priority, latency guarantees, queue depth) on top of this basic seek‑reduction principle.

In the *blk-mq* (multi‑queue) framework, the elevator is optional; each hardware queue can have its own scheduler (e.g., `mq-deadline`, `none`, `bfq`). The core idea remains: order requests to minimize mechanical movement or to meet latency targets.

### Plugging and Merging
The block layer may *plug* the queue: temporarily hold incoming requests to allow more merges before kicking the hardware. Plugging is controlled via `blk_start_plug()` / `blk_finish_plug()` and is automatically used by the VFS when issuing a sequence of buffered reads/writes. When the plug is finished, the queue is unplugged, triggering the elevator to dispatch the accumulated requests.

## How It Works
### End‑to‑End Flow (Stack‑Based View)
1. **VFS → Block Layer**  
   - A filesystem operation (e.g., `ext4_file_read_iter`) calls `generic_make_request(struct bio *bio)` after filling the bio with the appropriate pages, sector, and size.  
   - `generic_make_request` checks if a plug exists; if not, it calls `blk_queue_enter(q, BLK_MQ_REQ_RESERVED)` to increment the queue’s usage count and then invokes `submit_bio(bio)`.

2. **Bio Submission**  
   ```c
   void submit_bio(struct bio *bio)
   {
       if (bio->bi_opf & REQ_DISCARD)
           return submit_bio_discard(bio);
       return __submit_bio(bio);
   }
   ```
   `__submit_bio` does:
   - `bio_set_dev(bio, bdev);` (ensures `bi_bdev` points to the correct `block_device`).  
   - Calls `blk_queue_split(q, &bio, gfp_mask)` if the bio exceeds the device’s `max_segments` or `max_segment_size`.  
   - Attempts to merge with existing requests via `ll_back_merge_fn` / `ll_front_merge_fn`.  
   - If merged, updates the request’s `__data_len` and `__sector`; otherwise, allocates a new request with `blk_rq_alloc(q, gfp_mask)` and inserts it using the elevator’s `->dispatch` hook.

3. **Queue Dispatch**  
   - The request queue’s `request_fn` (or the blk-mq hardware queue’s `queue_rq`) is invoked either:
     - Immediately after unplugging (`blk_unplug(q)`), or  
     - Asynchronously by a timer/workqueue when the device signals readiness (interrupt‑driven).  
   - The driver reads the request’s `__sector`, `__data_len`, and `bio` chain, builds the appropriate device command (e.g., ATA READ DMA EXT), and issues it to the hardware.

4. **Completion**  
   - When the hardware signals DMA completion (via interrupt or polling), the driver calls `blk_complete_request(req)`.  
   - This walks the request’s bio list, invoking each bio’s `bi_end_io`.  
   - For a filesystem bio, `bi_end_io` typically updates the page cache, wakes any waiting task (`complete(&bio->bi_private)`), and returns the bio to the slab via `bio_put`.

### Timing Example (HDD)
Assume a 7200 RPM drive:
- $T_{\text{rot}} = \frac{1}{2} \cdot \frac{60}{7200} = 4.166\text{ ms}$.  
- Average seek (one‑third stroke) ≈ 4 ms (typical spec).  
- Transfer rate $R = 150\text{ MiB/s}$.  

For a 4 KiB read ($L = 4096$ B):
$$T_{\text{xfer}} = \frac{4096}{150 \times 2^{20}} \approx 0.026\text{ ms}.$$
Total $T \approx 4 + 4.166 + 0.026 \approx 8.19\text{ ms}$.  
If the elevator can reorder two adjacent 4 KiB requests separated by 100 sectors (≈50 KB), the seek distance drops from ~200 cylinders to ~0, saving roughly 3–4 ms per request.

## Worked Examples
### Example 1: Synchronous 4 KiB Read via `submit_bio`
**Goal:** Read 4 KiB starting at sector 2048 (offset 1 MiB) from `/dev/sda` in kernel space.

```c
#include <linux/bio.h>
#include <linux/blkdev.h>
#include <linux/gfp.h>

static int read_sector(struct block_device *bdev, sector_t sector,
                       size_t len, void *dst)
{
    struct bio *bio;
    int ret;

    /* 1. Allocate a bio with one iovec (single page) */
    bio = bio_alloc(GFP_KERNEL, 1);
    if (!bio)
        return -ENOMEM;

    /* 2. Associate the bio with the target device */
    bio_set_dev(bio, bdev);

    /* 3. Describe the I/O: sector, length, and the destination page */
    bio->bi_sector = sector;
    bio->bi_size = len;                     /* 4096 bytes */
    bio->bi_vcnt = 1;                       /* one vec */
    bio->bi_io_vec[0].bv_page = virt_to_page(dst);
    bio->bi_io_vec[0].bv_offset = offset_in_page(dst);
    bio->bi_io_vec[0].bv_len = len;

    /* 4. Set completion callback (synchronous wait) */
    DECLARE_COMPLETION_ONSTACK(wait);
    bio->bi_end_io = end_io_callback;
    bio->bi_private = &wait;

    /* 5. Submit */
    submit_bio(bio);

    /* 6. Wait for completion */
    wait_for_completion(&wait);
    ret = test_bit(BIO_UPTODATE, &bio->bi_flags) ? 0 : -EIO;

    /* 7. Release */
    bio_put(bio);
    return ret;
}

/* Simple end_io that just signals completion */
static void end_io_callback(struct bio *bio)
{
    complete(bio->bi_private);
}
```
**Explanation of each step**  
- Allocation with `nr_iovecs=1` avoids unnecessary allocation of a vec array.  
- `bio_set_dev` ensures the block layer knows which `request_queue` to use.  
- The `bi_end_io` callback is mandatory; otherwise the bio would never be freed, leaking memory.  
- Using a stack‑allocated `completion` lets us synchronously wait without sleeping in atomic context (the call must be made from a process context).  
- After `bio_put`, the bio’s reference count drops to zero and the slab returns the memory.

### Example 2: Asynchronous Write Using a Bio Chain
**Scenario:** Write a 128 KiB buffer that spans three pages (non‑contiguous in virtual memory) to sector 8192.

```c
static int write_chunk(struct block_device *bdev, sector_t sector,
                       const void *src, size_t len)
{
    struct bio *bio;
    size_t offset = 0;
    int ret = 0;

    while (len) {
        unsigned int bytes = min(len, PAGE_SIZE);
        struct page *page = alloc_page(GFP_KERNEL);
        if (!page) {
            ret = -ENOMEM;
            break;
        }
        copy_to_user_page(VMA_NULL, page, 0, src + offset, bytes);
        /* Build or extend bio */
        if (!bio) {
            bio = bio_alloc(GFP_KERNEL, 1);
            if (!bio) { __free_page(page); ret = -ENOMEM; break; }
            bio_set_dev(bio, bdev);
            bio->bi_sector = sector + offset / SECTOR_SIZE;
            bio->bi_end_io = end_io_callback;
            bio->bi_private = &comp;
        }
        if (!bio_add_page(bio, page, bytes, 0)) {
            /* Bio full – submit and start a new one */
            submit_bio(bio);
            bio_put(bio);
            bio = NULL;
            continue;
        }
        offset += bytes;
        len -= bytes;
    }
    if (bio) {
        submit_bio(bio);
        bio_put(bio);
    }
    wait_for_completion(&comp);
    return ret;
}
```
**Key points**  
- `bio_add_page` attempts to append a vec; if the bio’s `bi_max_vecs` is exceeded, it returns false, forcing submission and allocation of a fresh bio.  
- The sector calculation (`offset / SECTOR_SIZE`) correctly advances the target location as we consume the source buffer.  
- The completion `comp` is shared across all bios in the chain; the final `bio_end_io` signals it once the last bio finishes.  
- This pattern mirrors how the VFS builds a bio chain for a page‑cache writeback.

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Ignoring `bio_alloc` return value** | Assuming allocation always succeeds. | Under memory pressure `bio_alloc` returns `NULL`. Dereferencing it causes an Oops; checking lets you propagate `-ENOMEM` gracefully. |
| **Using `GFP_ATOMIC` for bio allocation in process context** | Allocating with a flag that may sleep when sleeping is prohibited. | If the allocation triggers direct reclaim while holding a spinlock, you can deadlock. Use `GFP_KERNEL` unless you are truly in atomic context (e.g., interrupt handler). |
| **Failing to set `bi_end_io`** | Leaving the callback `NULL`. | When the driver completes the request, it will call a NULL pointer, causing a kernel oops. The bio will also never be freed, leaking memory. |
| **Not checking bio chain limits (`bi_vcnt` vs `bi_max_vecs`)** | Adding more pages than the bio can hold. | The bio’s internal vec array is fixed size at allocation; overflow corrupts adjacent kernel memory, leading to subtle data corruption or crashes. |
| **Submitting a bio without setting `bi_sector` or `bi_size`** | Leaving them at zero. | The block layer will issue a request for sector 0, possibly overwriting the partition table or boot sector, destroying the filesystem. |
| **Calling `submit_bio` from hard‑irq without using `blk_queue_enter`** | Bypassing the queue’s usage count. | If the queue is concurrently being drained, the request may be dropped or the driver may see an invalid state, leading to lost I/O. |
| **Reusing a bio after `bio_put` without re‑initializing** | Assuming the bio is still valid. | `bio_put` may free the bio; accessing its fields after that is a use‑after‑free, causing sporadic crashes. |

## Exercises
### Easy – Minimal Ramdisk Block Device
1. Create a kernel module that registers a 16 MiB ramdisk using `alloc_disk`/`add_disk`.  
2. Allocate a request queue with `blk_init_queue(my_request_fn, &my_lock)`.  
3. Implement `my_request_fn` to:
   - Pull the first request with `blk_fetch_request`.  
   - For each bio in the request, copy data to/from a pre‑allocated RAM buffer (`memcpy` using `bio_kmap_atomic`).  
   - Call `blk_complete_request`.  
4. Test with `dd if=/dev/zero of=/dev/myram bs=4K count=4k`.  
*Learning outcome:* Understand the request‑queue lifecycle and bio manipulation.

### Medium – Implement a Simple Merge‑Aware Elevator
1. Start from the `noop` elevator (`noop-iosched.c`).  
2. Add logic in `noop_merge` to allow back merges only if the resulting request size does not exceed 1 MiB (to avoid overly large requests that could starve other processes).  
3. Recompile the kernel (`make -C /lib/modules/$(uname -r)/build M=$PWD modules`) and load the module (`insmod noop_limit.ko`).  
4. Use `fio` to generate random 4 KiB writes and compare throughput with the stock noop scheduler.  
*Learning outcome:* See how merge policies affect queue depth and latency.

### Hard – Replace the Scheduler with a Latency‑Aware Variant (BFQ‑Lite)
1. Design a scheduler that assigns each active process a time slice based on its recent I/O bandwidth (similar to BFQ’s budgeting).  
2. Implement the `->dispatch` hook to:
   - Select the process with the smallest elapsed time since its last dispatch.  
   - Issue up to N requests from that process’s queue (where N is a configurable quantum).  
3. Plug the scheduler into the block layer by registering it with `elv_register(&my_scheduler_ops)`.  
4. Use `blktrace`/`blkparse` to measure average I/O latency for a mixed workload (sequential read + random write) and compare against `cfq` and `deadline`.  
*Learning outcome:* Grasp the interplay between fairness, latency, and throughput in multi‑queue block devices.

## Linux Connection
### Source Locations
- Core block layer: `~/linux/block/`  
  - `blk-core.h` – public bio and request queue APIs.  
  - `blk-mc.c` – multi‑queue core.  
  - `blk-mq-sched.h` – scheduler interface for blk-mq.  
  - `elv.c` – elevator (legacy) implementation.  
  - `iosched/` – individual schedulers: `cfq-iosched.c`, `deadline-iosched.c`, `noop-iosched.c`, `bfq-iosched.c`.  
- Example driver: `~/linux/drivers/block/rbd.c` (Ceph RADOS block driver) shows real use of `bio_add_page`, `blk_queue_split`, and `blk_complete_request`.

### Useful Tools & Commands
```bash
# 1. Locate block layer sources (assuming kernel tree at /usr/src/linux)
find /usr/src/linux -name 'blk-*.c' -o -name 'elv.c' | head -5

# 2. Examine the request queue of a device
cat /sys/block/sda/queue/scheduler      # shows available schedulers
cat /sys/block/sda/queue/nr_requests   # depth of the queue

# 3. Trace I/O with blktrace (requires root)
sudo blktrace -d /dev/sda -o - | blkparse -i -

# 4. Measure latency with iostat
iostat -xz 1 5

# 5. Use perf to see request issue timestamps
sudo perf record -e block:block_rq_issue -a sleep 10
sudo perf report --stdio | grep block_rq_issue

# 6. Check the size of a bio structure (for memory layout)
sudo grep -r 'struct bio' /usr/src/linux/include/linux/bio.h | head -1
# Then compute with pahole if available:
pahole /usr/src/linux/include/linux/bio.h
```

### Real‑World Manifestation
- When you run `sync`, the VFS issues a series of `REQ_OP_WRITE_FLUSH` bios; the block layer merges them into a single `FLUSH` request to ensure the device’s write cache is flushed.  
- An SSD with NCQ enabled will expose multiple hardware queues (`/sys/block/nvme0n1/queue/`). The blk-mq layer distributes incoming requests across these queues, and the `none` scheduler (default for NVMe) simply passes them through, letting the device’s internal NCQ reorder for optimal latency.  
- On a USB flash drive, the block layer enforces a `max_segments` of 1 because the underlying SCSI/USB stack cannot handle scatter‑gather; consequently each bio must fit in a single page, which influences the choice of `bio_alloc`’s `nr_iovecs` argument.

## Why This Matters
The block layer is the *gatekeeper* between the filesystem’s abstract notion of “read/write a byte range” and the concrete physics of rotating media or flash cells. By mastering its inner workings—how a bio describes memory, how requests are merged and ordered, how the elevator translates sector numbers into reduced seek latency—you gain the ability to:

1. **Diagnose performance bottlenecks**: A high `%util` with low throughput often signals that the elevator is starving the device because of mis‑aligned merges or an overly deep queue. Tools like `blktrace` let you verify whether the scheduler is honoring its ordering promises.  
2. **Tune workloads**: Databases issuing 8 KiB random writes benefit from a `deadline` scheduler that caps latency, whereas streaming backup jobs thrive with `cfq`’s proportional‑share approach. Knowing the underlying mechanics lets you pick the right scheduler or even craft a custom one.  
3. **Develop reliable drivers**: A block driver that mishand
