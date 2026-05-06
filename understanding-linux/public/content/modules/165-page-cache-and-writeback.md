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

## Core Concepts
The page cache is the kernel’s unified cache for file‑backed pages. It lives in ordinary RAM; a “cached” page is simply a page frame that the page allocator has backed with the contents of a file. Because the same physical page can be mapped by many processes, the cache enables zero‑copy I/O via `mmap` and eliminates redundant disk reads.

*Clean vs. dirty* – A page is **clean** when its contents match the on‑disk version; it becomes **dirty** the moment the CPU stores to any byte in the page. The kernel tracks dirtiness via the `PG_dirty` flag in `struct page`. Only dirty pages must be written back; clean pages can be reclaimed or reused at zero cost.

*Why cache?*  
Disk latency dominates memory latency: a typical SSD read ≈ 100 µs, HDD ≈ 5 ms, whereas a RAM access ≈ 100 ns. If a workload exhibits temporal locality (re‑reading the same file region), caching reduces the average I/O time from  
$$T_{\text{disk}} = L_{\text{disk}} + \frac{S}{B_{\text{disk}}}$$  
to  
$$T_{\text{cache}} = L_{\text{RAM}} + \frac{S}{B_{\text{RAM}}}$$  
where \(L\) is latency, \(S\) transfer size, and \(B\) bandwidth. For a 4 KiB page, \(T_{\text{disk}}\) ≈ 5 ms vs. \(T_{\text{cache}}\) ≈ 0.1 µs → a ~50 000× speed‑up.

*Writeback* – The kernel does **not** write dirty pages immediately; doing so would serialize every store with disk latency. Instead, it lets dirty pages accumulate up to a throttling threshold and then writes them in the background, amortizing the cost over many stores. The writeback daemon (`wb_workqueue`) selects dirty pages based on age and amount, issues `writepage` callbacks to the filesystem, and clears `PG_dirty` after successful write‑back.

## How It Works
### Page Fault → Cache Population
1. A thread faults on a virtual address that is file‑backed (via `mmap` or `read`).  
2. The fault handler (`handle_mm_fault`) calls `find_get_page` on the file’s `address_space`.  
3. If the page is present, its reference count is incremented and the page is returned – a **cache hit**.  
4. If absent, `page_cache_alloc` grabs a free page, `submit_bio` issues a read request to the block layer, and upon completion the page is marked `PG_uptodate` and inserted into the radix tree of the `address_space`. The fault is then resolved by mapping the page into the faulting VMA.

### Dirtying and Writeback Triggers
*Dirtying* – Any store that sets a dirty PTE causes the architecture‑specific `set_pte_at` to call `pte_dirty`, which ultimately marks the page with `PG_dirty` via `__set_page_dirty_nobuffers`. The page stays in the cache; the VMA remains writable.

*Background writeback* – The kernel evaluates two ratios (see §Linux Connection):
```
dirty_bytes   = totalram * dirty_ratio / 100
dirty_bg_bytes = totalram * dirty_background_ratio / 100
```
When `dirty_bytes` exceeds `dirty_bg_bytes`, the wb_workqueue is awakened. It scans the global dirty list, selects pages older than `dirty_expire_centisecs` (default 30 s) or when the amount of dirty data exceeds `dirty_bytes`, and invokes the filesystem’s `writepage` operation. After successful I/O, `PG_dirty` is cleared and the page may be reclaimed.

*Consistency guarantees* –  
- `msync(addr, len, MS_SYNC)` forces the kernel to wait for I/O completion before returning, providing a **sync** barrier.  
- `fsync(fd)` walks the file’s `address_space` and issues `writepage` for every dirty page, then waits for the underlying device to flush its cache (via `blk_flush_device`).  
- Without explicit sync, the kernel only guarantees that dirty pages will be written back **eventually**; a power loss can lose the last few seconds of modifications.

## Worked Examples
### Example 1 – Page Cache Hit (measured latency)
```bash
# Prepare a 1 MiB file filled with zeros
dd if=/dev/zero of=file bs=1M count=1 oflag=sync
# Map it read‑only
c=$(mmap -p r file 0 $((1*1024*1024)) 2>/dev/null; echo $?)
# Touch every page to force a fault (first access)
for ((i=0;i<$((1*1024*1024/4096));i++)); do
    printf "\x00" | dd of=$c bs=1 seek=$((i*4096)) count=1 conv=notrunc 2>/dev/null
done
# Now read the whole mapping; all pages are already cached
time dd if=$c of=/dev/null bs=64k count=16 2>&1 | grep real
```
**Reasoning**  
- First loop faults each 4 KiB page → each incurs a disk read (≈ 5 ms).  
- Second `dd` finds all pages resident → each page is served from RAM (≈ 100 ns).  
- Expected speed‑up ≈ 5 ms / 0.1 µs = 50 000×; the `time` output shows a sub‑millisecond real time for the second pass versus several seconds for the first.

### Example 2 – Page Cache Miss (bypassing cache)
```bash
# Direct I/O bypasses the page cache
time dd if=file of=/dev/null bs=4k count=256 iflag=direct 2>&1 | grep real
# Cached read for comparison
time dd if=file of=/dev/null bs=4k count=256 2>&1 | grep real
```
**Reasoning**  
- `iflag=direct` issues `O_DIRECT`, which bypasses the page cache and forces a synchronous read from the device.  
- The cached read benefits from the page cache (≈ 0.1 ms total) while the direct I/O shows the raw device latency (~ 120 ms for 256 × 4 KiB on an HDD). The ratio demonstrates the cache’s effect.

### Example 3 – Writeback Triggered by `sync`
```bash
# Create a 10 MiB file, mmap it writably
dd if=/dev/zero of=file bs=1M count=10
c=$(mmap -p rw file 0 $((10*1024*1024)) 2>/dev/null; echo $?)

# Dirty every page (write a byte)
for ((i=0;i<$((10*1024*1024/4096));i++)); do
    printf "\xFF" | dd of=$c bs=1 seek=$((i*4096)) count=1 conv=notrunc 2>/dev/null
done

# Observe dirty pages rise
watch -n 0.5 "grep -E 'Dirty|Writeback' /proc/vmstat"

# Force writeback
time sync
```
**Reasoning**  
- After the dirtying loop, `/proc/vmstat` shows `Dirty` ≈ 10 MiB.  
- The background wb_workqueue would eventually clean them, but `sync` invokes `sys_sync`, which walks all `address_space` structures and waits for each `writepage` to finish.  
- The `time` output reflects the actual device bandwidth: for an SSD (~ 500 MiB/s) the 10 MiB writeback takes ≈ 20 ms, visible in the `real` field.

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **The page cache is a separate memory pool** | The page cache consists of ordinary page frames allocated by the buddy allocator; there is no distinct reserve. | “Cached” pages are simply page frames whose `mapping` points to an `address_space`. They can be reclaimed like any other page. |
| **Dirty pages are flushed immediately on `msync`** | `msync(addr,len,MS_ASYNC)` only sets the `PG_writeback` flag and returns; actual I/O proceeds asynchronously. Only `MS_SYNC` waits for completion. | Use `MS_SYNC` (or `fsync`) when you need a durability guarantee before returning to user space. |
| **Writeback is a synchronous, blocking operation** | The wb_workqueue runs in kernel threads; it dirty‑pages accumulate until thresholds are met, then writes in batches. | Applications must explicitly call `sync`, `fsync`, `fdatasync`, or `msync(...,MS_SYNC)` if they require ordering relative to other syscalls. |
| **Buffer cache and page cache are distinct** | Historically Linux had separate caches; since 2.4 they are unified under the page cache. | All file‑backed pages (including those accessed via `read`/`write` that use temporary kernel buffers) reside in the same page cache. |
| **Writing via `write()` bypasses the page cache** | `write()` copies data from user space into a kernel‑allocated page cache page (unless `O_DIRECT` is set). | Only `O_DIRECT` or raw block devices avoid the page cache; normal `write()` populates it. |

## Exercises
### Easy – Observe cache statistics
```bash
# Show dirty/writeback before and after a file copy
echo 3 > /proc/sys/vm/drop_caches   # clear caches
grep -E 'Dirty|Writeback' /proc/vmstat
cp largefile /tmp/copy
grep -E 'Dirty|Writeback' /proc/vmstat
```
*Goal*: See `Dirty` rise during the copy and fall after the background writeback completes.

### Medium – Measure writeback latency with `msync`
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <time.h>
#include <errno.h>

int main(int argc, char *argv[]) {
    if (argc != 2) { fprintf(stderr,"Usage: %s <file>\n",argv[0]); exit(1); }
    int fd = open(argv[1], O_RDWR);
    struct stat st; fstat(fd,&st);
    void *addr = mmap(NULL, st.st_size, PROT_READ|PROT_WRITE, MAP_SHARED, fd,0);
    if (addr==MAP_FAILED) { perror("mmap"); exit(1); }

    // Dirty the first MiB
    memset(addr, 0xFF, 1<<20);

    struct timespec ts0, ts1;
    clock_gettime(CLOCK_MONOTONIC,&ts0);
    msync(addr, 1<<20, MS_SYNC);   // wait for writeback
    clock_gettime(CLOCK_MONOTONIC,&ts1);
    double elapsed = (ts1.tv_sec-ts0.tv_sec)+(ts1.tv_sec-ts0.tv_sec)*1e-9+(ts1.tv_nsec-ts0.tv_nsec)*1e-9;
    printf("msync of 1 MiB took %.3f ms\n", elapsed*1000);
    munmap(addr,st.st_size);
    close(fd);
    return 0;
}
```
*Goal*: Compile (`gcc -O2 -Wall msync_latency.c -o msync_latency`) and run on a file on an SSD vs. HDD to see the impact of device latency.

### Hard – Trace writeback with eBPF
```bash
# Install bpftrace if not present
sudo apt-get install -y bpftrace
# One‑liner to log latency of each writeback
sudo bpftrace -e '
tracepoint:writeback:writeback_dirty_page {
    @ns[comm] = hist((args->latency_ns));
}
'
# Dirty a file via mmap, then watch the histogram appear.
```
*Goal*: Observe the distribution of writeback latency (typically a few hundred µs on SSD, several ms on HDD) and correlate with workload dirty‑rate.

## Linux Connection
### Core Subsystems
- **mm/page_cache.c** – Functions like `find_get_page`, `page_cache_alloc`, `add_to_page_cache_lru`.  
- **mm/page-writeback.c** – The wb_workqueue, `wb_writeback`, `balance_dirty_pages_ratelimited`.  
- **include/linux/mm.h** – Definitions of `struct address_space`, `struct address_space_operations` (`.writepage`).  
- **fs/inode.c** – `sync_inode` which walks `i_mapping->private_list` to flush dirty pages.  

### Tunable Parameters (via /proc/sys/vm/)
| File | Meaning | Typical default |
|------|---------|-----------------|
| `dirty_ratio` | Percentage of total RAM that can be dirty before forced writeback | `20` |
| `dirty_background_ratio` | Percentage triggering background writeback | `10` |
| `dirty_expire_centisecs` | Age after which a dirty page is eligible for immediate writeback | `3000` (30 s) |
| `dirty_writeback_centisecs` | Interval the wb_workqueue wakes to examine dirty state | `500` (5 s) |

**Example adjustments**
```bash
# Increase aggressive writeback for a latency‑sensitive workload
sysctl -w vm.dirty_ratio=5
sysctl -w vm.dirty_background_ratio=2
# Observe faster dirty‑page clearance:
watch -n 0.5 "grep -E 'Dirty|Writeback' /proc/vmstat"
```

### Toolchain for Observation
- **`cat /proc/vmstat`** – fields `pgpgin`, `pgpgout`, `pgsteal`, `pgscan_kswapd`, `pgscan_direct`, `Dirty`, `Writeback`.  
- **`vmstat 1`** – shows `si`/`so` (swap in/out) and `bi`/`bo` (block in/out) – useful to see when writeback spikes disk I/O.  
- **`iostat -x 1`** – per‑device await, %util; high %util during writeback indicates I/O bound.  
- **`perf record -e syscalls:sys_enter_sync,syscalls:sys_enter_fsync -g sleep 10`** – counts sync calls.  
- **`tracepoint:writeback:writeback_dirty_page`** (via `bpftrace` or `trace-cmd`) – gives per‑page latency.

### Demonstration: Forcing Immediate Writeback
```bash
# Make a 100 MiB file, map it, dirty it, then force sync via fdatasync
dd if=/dev/zero of=sync_test bs=1M count=100
fd=$(open sync_test O_RDWR)
mmap_addr=$(mmap -p rw sync_test 0 $((100*1024*1024)))
# Dirty every 4th page (to keep CPU work low)
for ((i=0;i<$((100*1024*1024/4096));i+=4)); do
    printf "\x00" | dd of=$mmap_addr bs=1 seek=$((i*4096)) count=1
done
# Measure time to flush via fdatasync
time (fdatasync $fd) 2>&1 | grep real
```
On an NVMe (~ 2 GiB/s) the 100 MiB flush should be ≈ 50 ms; on a SATA HDD (~ 150 MiB/s) ≈ 650 ms, illustrating the impact of the underlying device on writeback latency.

## Why This Matters
Understanding the page cache and writeback is not academic; it directly shapes observable system behavior:

*Performance* – A warm page cache turns disk‑bound workloads into memory‑bound ones, cutting latency by orders of magnitude. Mis‑estimating cache effectiveness leads to over‑provisioned storage or under‑utilized CPU.

*Consistency & Durability* – Applications that rely on implicit writeback risk data loss on power loss or kernel panic. Knowing when to issue `fsync`, `fdatasync`, or `msync(...,MS_SYNC)` is essential for databases, VM images, and log files.

*Resource Pressure* – The dirty‑ratio thresholds dictate how much memory can be devoted to caching versus reclaim. Setting them too high stalls reclaim and can trigger OOM; setting too low causes incessant writeback, wasting I/O bandwidth and increasing tail latency.

*Observability* – The kernel exposes a rich set of counters (`/proc/vmstat`, tracepoints) and tunables (`sysctl`). Mastery of these lets administrators diagnose stalls, tune for SSD vs. HDD, and validate that application‑level durability calls actually hit the storage layer.

In short, the page cache is the linchpin that bridges the CPU’s nanosecond world with the millisecond world of persistent storage. By grasping its mechanics, limits, and knobs, you can design software that is both fast and reliable—exactly what high‑performance Linux systems demand.
