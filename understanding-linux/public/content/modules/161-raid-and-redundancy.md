---
id: 161
title: "RAID and redundancy"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A disk does not ask permission before failing. The question is not whether a disk in your array will fail but whether you have structured your storage so that failure is a recoverable event rather than a catastrophe. RAID answers that question — but the answer depends entirely on which RAID level you choose, because each level makes a different bet about the ratio of reads to writes, the acceptable capacity overhead, and how many simultaneous failures you can tolerate.

RAID also exposes a non-obvious tradeoff: the same mechanism that provides fault tolerance (parity) can make write performance *worse* than a single disk. Getting RAID wrong does not just waste money — it can create a storage bottleneck that no amount of CPU or memory can compensate for.

---

## Core Concepts

### Striping (RAID 0)

Striping partitions the logical address space into fixed-size *strips* and maps consecutive strips to successive disks. One strip per disk at the same logical offset forms a *stripe*. A 64 KB write to a 4-disk array with a 16 KB strip size is decomposed into four 16 KB writes dispatched to four disks simultaneously — each disk sees one quarter of the I/O, and all four complete in parallel.

Ideal sequential throughput scales linearly:

$$\text{Throughput}_{\text{RAID0}} = N \times \text{Throughput}_{\text{single}}$$

The linearity breaks in practice because the bottleneck shifts to the interconnect (SAS expander, PCIe lanes, SATA controller) before it reaches $N$ disks. The other hard constraint: zero fault tolerance. A stripe spans all $N$ disks, so any single disk failure makes every file whose strips touched that disk unrecoverable. Array survival probability over time $t$, given per-disk failure probability $p(t)$:

$$P(\text{survive}) = (1 - p)^N$$

For $N = 4$ and $p = 0.02$ (a modest 2% annual failure rate), $P(\text{survive}) \approx 0.92$. That sounds acceptable until you realize you are running this array for multiple years across a fleet of machines.

Use RAID 0 only when the data is reproducible (scratch space, build caches) or is continuously backed up at a higher layer.

### Mirroring (RAID 1)

Every write is committed to all $N$ mirrors before the controller acknowledges it to the application. The write is only as fast as the *slowest* disk in the mirror set. The read path is the inverse: any mirror can serve a read, so the controller can round-robin or serve from whichever disk has its head nearest (on spinning media), yielding:

$$\text{Read throughput} \approx N \times \text{Throughput}_{\text{single}}$$

Write throughput stays at single-disk throughput; write *latency* can decrease slightly if the controller issues to both disks simultaneously and takes the first completion. Capacity efficiency is $1/N$ — two disks to store one disk's worth of data.

The array survives as long as at least one mirror remains intact. During degraded operation (one failed disk), every read falls on the single surviving disk, which also must service the rebuild I/O for the replacement. This is when the second disk failure — which is now significantly more likely due to rebuild stress — would be catastrophic.

### Parity (RAID 5 / RAID 6)

Parity-based RAID recovers the capacity efficiency lost by mirroring while still tolerating failures. The mechanism is XOR. For data blocks $D_1, D_2, \ldots, D_{N-1}$ across $N-1$ data disks, a parity block $P$ satisfies:

$$P = D_1 \oplus D_2 \oplus \cdots \oplus D_{N-1}$$

XOR is its own inverse, so any single missing term is recoverable from the rest:

$$D_k = P \oplus \bigoplus_{i \neq k} D_i$$

RAID 5 distributes parity strips across all disks in a rotating pattern so that no single disk is the dedicated parity disk (which would otherwise serialize all parity writes onto one device). RAID 6 computes two independent parity symbols per stripe — conventionally called $P$ and $Q$ — using XOR for $P$ and a Galois Field $\text{GF}(2^8)$ multiplication for $Q$. This tolerates any two simultaneous disk failures at the cost of one additional disk of capacity and more compute per write.

Capacity efficiency for RAID 5 with $N$ total disks (1 parity disk equivalent distributed):

$$\text{Efficiency}_{\text{RAID5}} = \frac{N-1}{N}$$

For RAID 6:

$$\text{Efficiency}_{\text{RAID6}} = \frac{N-2}{N}$$

At $N = 6$: RAID 5 gives 83.3% efficiency with 1-disk fault tolerance; RAID 6 gives 66.7% with 2-disk fault tolerance.

### The Read-Modify-Write Penalty

Full-stripe writes are cheap: the controller has all $N-1$ data strips and can compute $P$ from scratch, then write all strips in one parallel operation — zero extra reads. Partial writes (the common case for random I/O) are not:

1. **Read** the old data strip $D_{\text{old}}$ from its disk
2. **Read** the old parity strip $P_{\text{old}}$ from its disk
3. Compute: $P_{\text{new}} = D_{\text{old}} \oplus D_{\text{new}} \oplus P_{\text{old}}$
4. **Write** $D_{\text{new}}$ and **write** $P_{\text{new}}$

One logical write costs 2 reads + 2 writes = 4 physical disk I/Os. This is the *RAID 5 write penalty*. The formula $P_{\text{new}} = D_{\text{old}} \oplus D_{\text{new}} \oplus P_{\text{old}}$ works because $D_{\text{old}} \oplus D_{\text{new}}$ is the *diff* — the bits that changed — and XOR-ing the diff into the old parity updates it without touching any other data disk. This is why you only need 2 disk reads rather than reading every data strip in the stripe.

RAID 6 partial writes cost 6 disk I/Os (read old data, read $P$, read $Q$, write new data, write $P_{\text{new}}$, write $Q_{\text{new}}$).

---

## How It Works

### XOR Parity in Detail

Three data disks, one byte each:

```
D1 = 0b10110011  (0xB3)
D2 = 0b01101100  (0x6C)
D3 = 0b11001010  (0xCA)
```

Parity computation, column by column:

```
D1:  1 0 1 1 0 0 1 1
D2:  0 1 1 0 1 1 0 0
D3:  1 1 0 0 1 0 1 0
     ---------------
P:   0 0 0 1 0 1 0 1  = 0b00010101 (0x15)
```

D2 fails. Reconstruct using the XOR-inverse property ($A \oplus A = 0$, $A \oplus 0 = A$):

```
D2_recovered = D1 XOR D3 XOR P
             = 0b10110011
               XOR 0b11001010
               XOR 0b00010101
             = 0b01101100  ✓ (0x6C)
```

Why it works: substituting $P = D1 \oplus D2 \oplus D3$ into the recovery expression gives $D1 \oplus D3 \oplus D1 \oplus D2 \oplus D3$. The $D1$ pair and the $D3$ pair each cancel to zero, leaving $D2$.

### Capacity and I/O Rate Calculations

Given an application issuing $W$ random writes per second to a RAID 5 array, each write generates 4 disk I/Os:

$$\text{Disk IOPS}_{\text{RAID5}} = 4W$$

For RAID 10 (mirrored stripes), each write goes to 2 mirrors:

$$\text{Disk IOPS}_{\text{RAID10}} = 2W$$

If your disk array sustains 12,000 IOPS and you need 4,000 application write IOPS:
- RAID 5 requires $4 \times 4000 = 16{,}000$ disk IOPS — **exceeds capacity, array saturates**
- RAID 10 requires $2 \times 4000 = 8{,}000$ disk IOPS — feasible, with 4,000 IOPS headroom

This arithmetic is why database engineers choose RAID 10 over RAID 5 even at 50% capacity efficiency.

### Strip Size and Parallelism

For application I/O of size $S$ bytes and strip size $s$ bytes on an $N$-disk array, the number of disks participating in that I/O:

$$d = \min\!\left(N,\, \left\lceil \frac{S}{s} \right\rceil\right)$$

Parallelism is fully utilized only when $S \geq N \cdot s$. A 4-disk array with 64 KB strips requires a 256 KB sequential I/O to use all four disks simultaneously.

Consequences of mistuned strip size:

- **$s \gg S$**: Every I/O lands on one disk. RAID 0 and RAID 5 deliver no throughput benefit over a single disk; RAID 5 still pays the parity overhead.
- **$s \ll S$**: Small strip size means many stripes per I/O, increasing metadata overhead and, on RAID 5, multiplying the number of parity strips that must be updated per write.

The optimal strip size for sequential workloads is typically the largest
