---
id: 154
title: "Performance engineering for networking"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

At 10 Gbps with 64-byte packets, the wire delivers roughly $\frac{10 \times 10^9}{(64 + 20) \times 8} \approx 14.88$ million packets per second — one packet every 67 ns. A single `memcpy()` of 64 bytes costs approximately 10–20 ns on a modern core, but that cost scales with cache pressure: when your working set exceeds L3, you're paying DRAM latency of ~60–80 ns *per copy*. At line rate, two copies per packet means the memory subsystem is your bottleneck before the NIC or the application does any real work.

This module explains how Linux breaks that bottleneck: by eliminating copies, batching interrupt costs across multiple packets, distributing flows across cores in hardware and software, and pinning the entire processing pipeline to minimize cache coherency traffic.

---

## Core Concepts

### Zero-Copy: Eliminating the Data Path Tax

The standard `read()`/`write()` or `recv()`/`send()` path copies data at least twice across the kernel–userspace boundary:

```
NIC DMA → kernel socket buffer → userspace buffer   (receive)
userspace buffer → kernel socket buffer → NIC DMA   (send)
```

Each crossing flushes cache lines. The CPU must load data into registers just to store it somewhere else.

Zero-copy works by never moving bytes at all. The kernel instead manipulates *page table entries*: it maps the physical page containing the data into the target address space. The data stays in place; only the virtual→physical mapping changes. For this to work on the receive side, the NIC must DMA into a pinned page that can later be mapped into userspace. On the send side, the kernel passes the physical page address directly to the NIC's scatter-gather DMA engine.

Three Linux primitives realize different points on this spectrum:

- **`sendfile()`** — eliminates the userspace round-trip for file-to-socket transfers; data moves from page cache to NIC DMA without ever entering userspace.
- **`splice()`** — moves pages between kernel file descriptors using pipe buffers as a staging area; no copy, just reference transfer.
- **`mmap()` + DMA** — maps NIC receive buffers directly into userspace. The NIC writes the packet; userspace reads it from the same physical memory. Used by DPDK's UIO/VFIO drivers and `AF_XDP`.

### Batching: Amortizing Per-Packet Overhead

Processing $n$ packets individually costs:

$$C_{\text{total}} = n \cdot (C_{\text{irq}} + C_{\text{skb\_alloc}} + C_{\text{stack}} + C_{\text{copy}})$$

Processing them in a batch of $k$ amortizes the interrupt cost and improves instruction cache utilization because the same code paths run repeatedly on warm caches:

$$C_{\text{total}} = \frac{n}{k} \cdot C_{\text{irq}} + n \cdot (C_{\text{skb\_alloc}} + C_{\text{stack}} + C_{\text{copy}})$$

The interrupt cost $C_{\text{irq}}$ includes the full context switch, IRQ handler dispatch, and re-enabling the interrupt line — on the order of 1–5 µs. Paying that cost 14.88 million times per second per CPU is impossible; paying it $14.88 \times 10^6 / k$ times is not.

This is why NAPI exists. After the first interrupt signals packet arrival, the driver disables the interrupt and schedules a poll. The kernel polls the NIC ring buffer, processing up to `netdev_budget` packets before yielding. The interrupt is not re-enabled until the ring is drained or the budget is exhausted, preventing interrupt storms under load.

### RSS: Hardware Flow Distribution

With a single receive queue, every packet interrupt goes to one CPU. That CPU's softirq load grows linearly with packet rate; all other CPUs sit idle on the networking path.

RSS solves this in hardware. The NIC computes a Toeplitz hash over the packet's 4-tuple and uses the result to select one of $N$ hardware receive queues. Each queue has its own MSI-X interrupt vector, each vector pinned to a different CPU. The hash is deterministic per flow, so all packets of a given TCP connection land on the same CPU — the TCP reassembly state and socket buffers stay in one core's L1/L2 cache.

### RPS and RFS: Software Distribution

RSS requires a multi-queue NIC. RPS (Receive Packet Steering) replicates RSS in software for single-queue NICs. The kernel computes `jhash` over the 4-tuple, selects a target CPU from a configurable bitmask, and delivers the packet to that CPU's backlog queue via IPI. The same flow-stickiness guarantee holds.

RPS gets packets to the right CPU for softirq processing, but the application thread may be running on yet another CPU. RFS (Receive Flow Steering) closes that gap: the kernel tracks, per flow, which CPU last called `recv()` on the socket. Packets are steered there, so softirq processing and the application's cache state are co-located. The flow table is stored in `/proc/sys/net/core/rps_sock_flow_entries` entries and per-queue in `rps_flow_cnt`.

### CPU Affinity: Preventing Cache Bouncing

Consider what happens when three components run on three different CPUs:

1. IRQ handler on CPU 0 fills `sk_buff` into the socket receive queue
2. softirq on CPU 1 processes the TCP stack, updating `tcp_sock`
3. Application thread on CPU 2 calls `recv()`, reads from the socket buffer

Each handoff requires cache line ownership transfer via MESI protocol. On a multi-socket system, cross-NUMA transfers cost ~100 ns per cache line — comparable to a DRAM access. Pinning all three to the same physical core (or at minimum the same NUMA node) eliminates this entirely.

### Latency vs. Throughput: The Unavoidable Tradeoff

Batching increases throughput by spreading fixed costs over more work units, but a packet waits in the ring buffer until the batch fills or the poll budget triggers:

$$\text{throughput} = \frac{k}{T_{\text{batch}}}$$

$$\text{latency} = T_{\text{queue}} + T_{\text{process}}$$

where $T_{\text{queue}} \propto k / \lambda$ for arrival rate $\lambda$. Doubling batch size $k$ can halve interrupt overhead while doubling worst-case queuing latency. High-frequency trading systems set `netdev_budget` to 1 and disable Nagle; video streaming servers set it to 1024. There is no universal optimum.

---

## How It Works

### The `sendfile()` Path

```
Standard send():                      sendfile():
  disk → page cache                     disk → page cache
  page cache → kernel socket buffer     kernel builds scatter-gather descriptor
  kernel socket buffer → userspace      NIC DMA engine reads from page cache
  userspace → kernel socket buffer      (no userspace involvement)
  kernel socket buffer → NIC DMA
```

With `sendfile()`, the CPU touches payload bytes exactly once (on the initial read from disk into the page cache). Thereafter, the kernel hands the NIC a scatter-gather list of `{physical_page, offset, length}` tuples. The NIC DMA engine fetches the data autonomously.

```c
#include <sys/sendfile.h>
#include <sys/stat.h>
#include <fcntl.h>

int file_fd = open("/var/data/payload.bin", O_RDONLY);
struct stat st;
fstat(file_fd, &st);

off_t offset = 0;
// Kernel passes page cache pages directly to NIC scatter-gather DMA.
// CPU never loads payload bytes into registers.
ssize_t sent = sendfile(sock_fd, file_fd, &offset, st.st_size);
```

This requires the NIC to support scatter-gather DMA. Verify:

```bash
ethtool -k eth0 | grep scatter-gather
# scatter-gather: on
```

If scatter-gather is off, `sendfile()` still avoids the userspace copy but must linearize the data in a kernel buffer first — still one copy instead of two, but not zero.

For receive-side zero-copy at scale, `AF_XDP` bypasses the kernel networking stack entirely. The application allocates a `UMEM` region (a pinned memory pool), and the NIC DMA-writes packets directly into it:

```c
// Allocate and register UMEM with the kernel
struct xsk_umem *umem;
void *bufs;
posix_memalign(&bufs, getpagesize(), NUM_FRAMES * FRAME_SIZE);
xsk_umem__create(&umem, bufs, NUM_FRAMES * FRAME_SIZE, &fq, &cq, NULL);

// The NIC DMA-writes packets into bufs[]; no sk_buff, no copy.
```

### NAPI Polling and Budget

The NAPI poll loop in `net/core/dev.c` bounds softirq CPU time:

```c
// Simplified from net/core/dev.c
int napi_poll(struct napi_struct *napi, int budget) {
    int work = napi->poll(napi, budget);   // driver-specific: fills skb ring
    if (work < budget) {
        // Ring drained before budget exhausted.
        // Safe to re-enable the MSI-X interrupt.
        napi_complete_done(napi, work);
        // Interrupt re-armed here. Next packet arrival triggers IRQ again.
    }
    // If work == budget, ring may still have packets.
    // Scheduler re-queues napi without enabling the interrupt.
    // No IRQ storm possible regardless of packet rate.
    return work;
}
```

When `work == budget`, the NIC interrupt remains disabled, and the kernel re-queues the NAPI instance for the next softirq run. This is why a saturated NIC never fires more than one interrupt per poll cycle — the interrupt is disabled for the duration of polling.

Tune the budget:

```bash
