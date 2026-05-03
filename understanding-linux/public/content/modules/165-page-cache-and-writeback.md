---
id: 165
title: "Page cache and writeback"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every `read(2)` and `write(2)` your program issues goes through the **page cache** — a kernel-managed region of RAM that stands between your process and the block device. The page cache exists because disk latency is measured in milliseconds and RAM latency in nanoseconds; the ratio is roughly $10^6$. Without it, a program reading a 1 MiB file sequentially would issue 256 separate 4 KiB disk reads, each stalling the process while the hardware responds.

The tradeoff is durability. When `write(2)` returns, your data is in RAM, not on disk. The kernel has made an implicit promise: *I will flush this to disk eventually*. If power fails before "eventually" arrives, that data is gone. The writeback system is the machinery that enforces a bound on "eventually" and gives applications the tools to tighten that bound when they need to.

Understanding this system tells you: why writing 4 GiB to disk takes 0.3 seconds but `sync(1)` afterward takes 4 seconds; why a process can suddenly stall mid-`write(2)` with no explanation; and why databases call `fsync(2)` after every committed transaction instead of trusting the OS.

---

## Core Concepts

### The Page Cache

The kernel loads file data into RAM in **page-sized chunks** — 4 KiB on x86-64, determined by `PAGE_SIZE`. When a process reads file offset $O$, the kernel computes the page index $\lfloor O / \text{PAGE\_SIZE} \rfloor$, checks whether that page is already cached, and either returns it immediately or issues a block I/O request to populate it first.

Pages stay cached after the read finishes. The next access — from any process — hits RAM. The cache is not per-process; it is system-wide and file-identity-based (keyed on the inode and offset). Two processes reading the same file share the same physical pages.

The cache is bounded only by available RAM. The kernel reclaims cached pages under memory pressure because file-backed pages are cheap to evict: the authoritative copy is still on disk. This is why `free(1)` reports large `buff/cache` values on a loaded system — the kernel fills idle RAM with cached file data because an empty cache page is strictly worse than a filled one.

```bash
# See current page cache size and dirty page counts
cat /proc/meminfo | grep -E 'Cached|Dirty|Writeback'
```

### Dirty Pages

When a process writes to a file, the kernel locates the target page in the cache, copies data from user space into it, and marks the page **dirty**. `write(2)` then returns. The page's in-memory contents are now newer than what's on disk. That divergence is the dirty state.

The kernel tracks dirty pages per-inode and globally. The global count is what the writeback system monitors to enforce thresholds. Dirty data accumulates until something flushes it: a background timer, memory pressure, or an explicit sync call.

Write-back caching (what Linux uses) defers the disk write. Write-through caching would issue the disk write synchronously inside `write(2)`, eliminating the durability gap at the cost of making `write(2)` as slow as the disk — roughly 100–200 µs for an NVMe, 5–10 ms for a spinning disk. Write-back caching makes `write(2)` take microseconds regardless of disk speed, at the cost of that durability gap.

### Writeback Triggers

The kernel writes dirty pages back to disk in three situations:

1. **Timer expiry** — a page that has been dirty longer than `dirty_expire_centisecs` centiseconds is eligible for writeback. The default is 3000 cs (30 seconds). This is the maximum age of a dirty page under quiescent conditions.
2. **Threshold crossing** — dirty pages exceed `dirty_background_ratio` percent of available memory. The background flusher starts writing without blocking any process.
3. **Hard limit** — dirty pages exceed `dirty_ratio` percent of available memory. `write(2)` itself **blocks** the calling process until the flusher brings the dirty count below the threshold. This is the backpressure mechanism.

The two-threshold design separates "start flushing in the background" from "throttle writers". A process writing a large file will trigger background flushing well before hitting the blocking limit, so the blocking case only occurs if the disk genuinely cannot keep up with the write rate.

### Durability Semantics

The durability gap is the interval between `write(2)` returning and the data reaching stable storage. Applications that need to survive crashes must explicitly close this gap. The options, from weakest to strongest:

| Mechanism | What it guarantees |
|---|---|
| `write(2)` | Data in page cache |
| `msync(MS_ASYNC)` | Writeback scheduled |
| `msync(MS_SYNC)` | Data on disk for mmap'd region |
| `fdatasync(2)` | File data on disk, metadata may not be |
| `fsync(2)` | File data and metadata on disk |
| `O_SYNC` on open | Each `write(2)` equivalent to `write` + `fdatasync` |
| `O_DSYNC` on open | Each `write(2)` equivalent to `write` + `fdatasync` (data only) |

---

## How It Works

### The Write Path

```
Process                  Page Cache              Block Device
   │                         │                        │
   │─── write(2) ───────────►│                        │
   │    copy_from_user()     │ mark page dirty        │
   │◄─── return ─────────────│ update inode dirty     │
   │                         │ list                   │
   │                   (up to 30 seconds)             │
   │                         │                        │
   │              [flusher wakes]                     │
   │                         │─── submit_bio() ──────►│
   │                         │◄─── completion IRQ ────│
   │                         │ mark page clean        │
```

Steps 1–4 happen in the time it takes to copy data through the CPU cache — nanoseconds to low microseconds. Steps 5–6 take as long as the storage device needs — microseconds to milliseconds.

### Dirty Throttling Math

Let $M$ be the amount of memory available for dirty pages (approximately total RAM minus memory locked by processes). The kernel defines two thresholds:

$$D_{\text{bg}} = \frac{\text{dirty\_background\_ratio}}{100} \times M$$

$$D_{\text{block}} = \frac{\text{dirty\_ratio}}{100} \times M$$

With defaults of 10% and 20% on a machine with 16 GiB RAM:

$$D_{\text{bg}} = 0.10 \times 16 \,\text{GiB} = 1.6 \,\text{GiB}$$
$$D_{\text{block}} = 0.20 \times 16 \,\text{GiB} = 3.2 \,\text{GiB}$$

A process writing a large file at 3 GiB/s will cross $D_{\text{bg}}$ in roughly:

$$t_{\text{bg}} = \frac{1.6 \,\text{GiB}}{3 \,\text{GiB/s}} \approx 0.53 \,\text{s}$$

If the disk can sustain 500 MiB/s writeback, dirty data accumulates at $3 \,\text{GiB/s} - 0.5 \,\text{GiB/s} = 2.5 \,\text{GiB/s}$ net. The process hits the blocking threshold $D_{\text{block}}$ approximately:

$$t_{\text{block}} = \frac{D_{\text{block}} - D_{\text{bg}}}{2.5 \,\text{GiB/s}} = \frac{1.6 \,\text{GiB}}{2.5 \,\text{GiB/s}} \approx 0.64 \,\text{s}$$

after background flushing started. This is why writes that seemed instant suddenly stall: the process ran ahead of the disk.

You can use `dirty_bytes` and `dirty_background_bytes` instead of the ratio variants to set absolute limits, which behaves more predictably on machines with large RAM.

```bash
# Check current thresholds
sysctl vm.dirty_ratio vm.dirty_background_ratio \
       vm.dirty_expire_centisecs vm.dirty_writeback_centisecs

# Set an absolute 256 MiB background flush threshold (runtime only)
sysctl -w vm.dirty_background_bytes=$((256 * 1024 * 1024))
```

### Read-Ahead

For sequential access patterns, the kernel speculatively loads pages beyond the requested range. If requests arrive at pages $p$, $p+1$, $p+2$ in order, the kernel infers sequential access and submits a read for pages $[p, p+N]$ where $N$ is the current readahead window size. The window grows with each confirmed sequential hit and shrinks on random access.

The effect: disk I/O for sequential reads runs ahead of the application in a pipeline, so the application finds its pages already warm when it gets to them. This converts random stalls into smooth streaming.

```c
// Advise the kernel about access patterns to tune readahead
posix_fadvise(fd, 0, 0, POSIX_FADV_SEQUENTIAL);  // maximize readahead
posix_fadvise(fd, 0, 0, POSIX_FADV_RANDOM);      // disable readahead
posix_fadvise(fd, offset, len, POSIX_FADV_WILLNEED);  // prefetch now
posix_fadvise(fd, offset, len, POSIX_FADV_DONTNEED);  // drop from cache
```

### `fsync`, `fdatasync`, and What "On Disk" Means

```c
int fd = open("wal.log", O_WRONLY | O_CREAT
