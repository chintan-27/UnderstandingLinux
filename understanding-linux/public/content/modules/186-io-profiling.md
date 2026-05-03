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

## Module 186: I/O Profiling — Disk Latency, Queueing, and Block Traces

## Why This Matters

A database query that should take 2ms takes 800ms intermittently, and nothing in application code explains it. The actual cause is usually one of three things: a saturated I/O queue ($T_{queue}$ dominating total latency), a device pathology (head thrash, NAND wear leveling stall, write-back cache operating without its battery so firmware silently downgrades to write-through), or a filesystem serialization point (journal commits, extent tree locks). Each has a different fix. Conflating queue saturation with device slowness leads to replacing disks that are fine; conflating device latency with application latency leads to tuning thread pools while the disk queue depth sits at 128.

This module gives you the measurement layer: how to decompose latency into its components, where each component lives in the kernel, and which tools expose which parts.

---

## Core Concepts

### Latency Decomposition

Total I/O latency as seen by an application is:

$$T_{total} = T_{queue} + T_{service}$$

- $T_{queue}$: time the request spends in the kernel block layer queue before the device driver accepts it. This is a software artifact — it exists because the block scheduler is holding the request, reordering it for locality, or the device's hardware queue is full.
- $T_{service}$: time the device itself spends — on-device cache lookup, seek (rotational) or erase-block management (NAND), and transfer.

The distinction matters because the fixes are opposite: high $T_{queue}$ calls for reducing queue depth (fewer concurrent writers, tuned `nr_requests`, or switching to a pass-through scheduler like `none` or `mq-deadline`). High $T_{service}$ calls for a faster or less-loaded device.

`iostat` reports `await` = $T_{total}$ and used to report `svctm` ≈ $T_{service}$, but `svctm` was removed from modern `sysstat` because it was computed, not measured, and gave wrong answers for parallel-capable devices (NVMe with 32+ hardware queues, hardware RAID). Block tracing is the only reliable way to measure both components directly.

### Write-Back vs. Write-Through Caches

Physical disks and RAID controllers contain a small DRAM write cache. In **write-back** mode, the device signals completion when data reaches DRAM, not persistent media. The firmware later flushes to platters or NAND. This makes $T_{service}$ for writes appear very low (often < 100 μs) — the device is lying about durability.

This is safe on production hardware where the cache is backed by a capacitor or battery (BBU — battery-backed unit). When the BBU fails or is absent, firmware typically degrades to **write-through** automatically and silently. Every write now pays full media latency. If your write `await` suddenly triples overnight without any workload change, check:

```bash
# For a hardware RAID controller (MegaRAID example)
sudo MegaCli -AdpBbuCmd -GetBbuStatus -aALL | grep -E "Battery State|Charging Status"

# For mdadm software RAID with a write-intent bitmap
cat /sys/block/md0/md/sync_action
cat /proc/mdstat
```

**Write-through** caches complete only after data reaches persistent storage. Every write pays the full media cost. Safer but slower.

Cache hits return in under 100 μs. Misses pay full media cost. This is why average latency metrics are dangerous: a workload with 99% cache hit rate can show 200 μs average but 80 ms p99 — and the p99 is what application timeouts see.

### Latency Reference Table

The range spans roughly four orders of magnitude:

| Event | Latency | Scaled (NVMe cache hit = 1 s) |
|---|---|---|
| NVMe on-device cache hit | ~50–100 μs | 1 s |
| NVMe random read (4K) | ~100–200 μs | 2–4 s |
| NVMe sequential read (large) | ~500–1000 μs | 5–10 s |
| SATA SSD random read | ~200–500 μs | 4–10 s |
| 7,200 RPM rotational sequential | ~1–3 ms | 10–30 s |
| 7,200 RPM rotational random | ~5–12 ms | 1–2 min |
| Rotational under queue saturation | > 20 ms | > 3 min |

When profiling, if your median is 200 μs but p99 is 80 ms, you are not looking at a device problem — that 400× gap is the signature of queue saturation or lock contention, not slower media. Histograms, not averages, reveal this.

### Queue Saturation and Little's Law

The Linux block layer (implemented in `block/blk-core.c`, schedulers in `block/mq-deadline.c`, `block/bfq-iosched.c`, etc.) sits between the filesystem and device drivers. It accepts requests, optionally reorders and merges them, and dispatches to the driver's hardware dispatch queue.

When the arrival rate $\lambda$ exceeds the drain rate $\mu$, queue depth grows without bound. Little's Law gives the average number of requests in the system at steady state:

$$L = \lambda \cdot W$$

where $W$ is the average time a request spends in the system ($T_{total}$). At saturation $\lambda \to \mu$, utilization $\rho = \lambda / \mu \to 1$, and for an M/M/1 queue model the mean wait time is:

$$W = \frac{T_{service}}{1 - \rho}$$

This is the queueing knee: at $\rho = 0.5$, $W = 2 \cdot T_{service}$. At $\rho = 0.9$, $W = 10 \cdot T_{service}$. At $\rho = 0.94$ (which `iostat` would show as 94% `%util`), $W \approx 17 \cdot T_{service}$. A device with 1 ms service time at 94% utilization has 17 ms average total latency — not because the disk is slow, but because queuing theory is unforgiving near saturation.

The queue depth limit for a device is controlled by:

```bash
cat /sys/block/sda/queue/nr_requests      # software queue depth (scheduler queue)
cat /sys/block/sda/queue/max_hw_sectors_kb
cat /sys/block/nvme0n1/queue/nr_requests  # NVMe often 1023 or 2047
```

Reducing `nr_requests` on a saturated spinning disk can reduce tail latency at the cost of throughput — the scheduler has fewer requests to reorder for sequential access.

### The Block I/O Lifecycle and Tracepoints

Every I/O request passes through defined states. The kernel exposes these as tracepoints under `block:`:

```
Application read()/write() or direct I/O
          |
          v
  [block:block_bio_queue]       ← BIO submitted to block layer
          |
  (plug/unplug, bio splitting)
          |
          v
  [block:block_rq_insert]       ← request enters I/O scheduler queue
          |
  (scheduler: merge, reorder, deadline enforcement)
          |
          v
  [block:block_rq_issue]        ← request dispatched to device driver
          |
  (device: cache lookup, seek/erase, transfer)
          |
          v
  [block:block_rq_complete]     ← driver signals completion via interrupt
```

$$T_{queue} = t_{\text{issue}} - t_{\text{insert}}$$
$$T_{service} = t_{\text{complete}} - t_{\text{issue}}$$

One critical detail: when `blk_mq` is used with a single hardware queue submission path and plugging is disabled, `block_rq_insert` may not fire — the request goes directly to `block_rq_issue`. If you trace only `block_rq_issue` → `block_rq_complete`, you measure $T_{service}$ but miss $T_{queue}$ entirely. This is a common gap in naive BPF scripts.

---

## Tools and How to Use Them

### iostat: Aggregate Metrics

```bash
iostat -x 1
```

```
Device  r/s    w/s    rkB/s   wkB/s   aqu-sz  await  r_await  w_await  %util
sda     0.00   1509   0.00    23776   0.02    0.60   0.00     0.60     94.00
nvme0n1 412.0  308.0  51500   9856    1.83    2.91   1.12     5.88     100.00
```

- `aqu-sz`: average number of requests in the queue + in service. If `aqu-sz` is consistently > 1 on a single-queue device, you are queueing. On NVMe with 32 hardware queues, `aqu-sz` of 32 is expected and healthy.
- `await`: $T_{total}$ in ms. This is the number your application experiences.
- `r_await` vs `w_await`: writes are often faster than reads on write-back cached devices. If `w_await` suddenly matches `r_await`, suspect a BBU failure.
- `%util`: fraction of 1-second intervals where the device had ≥ 1 request outstanding. Meaningless as a saturation indicator for NVMe — a device with 32 parallel queues shows 100% `%util` at 3% of its actual throughput capacity. Use `aqu-sz` and `await` instead.

For the `sda` row above: 94% `%util` with `aqu-sz` of only 0.02 means the device is busy but not queue-saturated. The 0.60 ms `await` is close to actual
