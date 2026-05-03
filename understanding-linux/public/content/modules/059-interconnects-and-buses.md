---
id: 59
title: "Interconnects and buses"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

Every instruction your CPU executes eventually touches memory, storage, or a peripheral — and none of those are on the same piece of silicon. When a CPU needs data from RAM, it must traverse a **memory bus**. When it reads from an NVMe SSD, it traverses **PCIe**. When two cores share a cache line, they traverse an **on-chip interconnect**. The bandwidth and latency of these paths determine whether a cache miss costs 4 ns or 400 ns, whether a GPU can feed its shader cores, and whether your NVMe drive hits 7 GB/s or stalls waiting for the bus.

These interconnects are not background detail. They are the reason NUMA exists, why CPU-to-GPU data transfer dominates machine learning latency, why DMA was invented, and why `mmap` into a GPU BAR behaves differently than `mmap` into a file. You cannot reason about memory hierarchy performance without a precise model of what sits between the CPU and everything else.

---

## Core Concepts

### Distance Costs Time: The Tradeoff Triangle

Every interconnect is constrained by the same three-way tradeoff:

$$\text{Bandwidth} = \text{width} \times \text{frequency} \times \eta_{\text{enc}}$$

where $\eta_{\text{enc}}$ is the encoding efficiency — the fraction of raw bits that carry data versus overhead (clock recovery, error correction, framing). PCIe 3.0 uses 8b/10b encoding, so $\eta = 0.8$. PCIe 4.0 and 5.0 switch to 128b/130b, recovering $\eta \approx 0.985$.

Doubling bus width doubles bandwidth but doubles PCB trace count, which increases cost, crosstalk, and board area. Doubling frequency at fixed width also doubles bandwidth, but signal integrity degrades: at high frequencies, impedance mismatches cause **reflections**, and coupling between adjacent traces causes **crosstalk**. These are not abstract concerns — they are why PCIe 5.0 requires more stringent trace routing rules and why consumer motherboards sometimes fail to train PCIe 5.0 links reliably.

The fundamental resolution to the frequency-width tradeoff is to go serial: one lane, very fast, with differential signaling to reject noise. That is PCIe's design philosophy and why it displaced parallel PCI.

### The Memory Bus

The memory bus connects the CPU's memory controller (now on-die for all modern CPUs) to DRAM. Its job is to satisfy LLC misses by fetching **cache lines** — 64 bytes on x86. Memory access cost separates into two independent components:

- **Latency**: time to first byte, dominated by DRAM row activation. A DDR5 CAS latency of CL40 at 4800 MT/s is $40 / (4800 \times 10^6 / 2) \approx 16.7\ \text{ns}$, but the total round-trip including tRCD and other timing parameters pushes real latency to 60–100 ns.
- **Bandwidth**: bytes per second once the burst is flowing. DDR5-4800 with a 64-bit bus delivers $4800 \times 10^6 \times 8\ \text{bytes} = 38.4\ \text{GB/s}$ per channel.

These two components are independently constrained. You can have high bandwidth with high latency (wide burst mode, slow row activation), or low latency with low bandwidth (narrow bus, fast SRAM). Cache design exploits this by keeping hot data in low-latency SRAM and tolerating the high latency of DRAM only on misses.

#### Miss Penalty Arithmetic

With a single-word-wide bus and 4-word cache line, the miss penalty is:

$$P_{\text{miss}} = 1 + (4 \times t_{\text{mem}}) + 4 = 1 + (4 \times 15) + 4 = 65\ \text{cycles}$$

where $1$ cycle sends the address, $t_{\text{mem}} = 15$ cycles per memory access, and $4$ cycles return the data words sequentially.

Widening the bus to 2 words halves the transfer count:

$$P_{\text{miss}} = 1 + (2 \times 15) + (2 \times 1) = 33\ \text{cycles}$$

You still pay the full row activation cost, but you amortize it over a wider transfer. The address transmission cost stays at 1 cycle because you are sending the same address, just more data back.

**Interleaved banks** go further. With $n$ independent memory banks, you pipeline the activations: issue the next bank's activation before the previous one completes. Ideally, if $n \geq t_{\text{mem}}$, you hide all but the first latency:

$$P_{\text{miss, interleaved}} \approx 1 + t_{\text{mem}} + n \cdot t_{\text{xfer}} = 1 + 15 + 4 = 20\ \text{cycles}$$

This is precisely why DDR memory has multiple **banks** and **ranks** — not for capacity, but so the memory controller can issue overlapping activations. Linux's memory controller latency effects become visible when all access patterns map to the same bank (a strided access with stride equal to the bank size serializes everything).

### PCIe: Serial Differential Point-to-Point

PCIe replaced parallel PCI because **clock skew** — the variance in signal arrival time across parallel lanes — scales with frequency and trace length. At 33 MHz with 32 data lines, skew was manageable. At multi-GHz frequencies it becomes the dominant constraint. PCIe eliminates the problem by making each lane independent: skew between lanes is irrelevant because lanes are decoded independently and reassembled in software-transparent link logic.

Each PCIe lane is a **differential pair** in each direction (four wires per lane total). Differential signaling transmits a signal $V$ and its complement $\bar{V}$ simultaneously. The receiver measures $V - \bar{V}$, so common-mode noise (which appears equally on both wires) cancels:

$$V_{\text{received}} = (V + n) - (\bar{V} + n) = V - \bar{V}$$

This allows PCIe to run at frequencies where single-ended signaling would be dominated by noise.

Bandwidth per lane per direction scales with generation:

| Generation | Line rate | Encoding | Effective per-lane |
|------------|-----------|----------|--------------------|
| PCIe 3.0   | 8 GT/s    | 8b/10b   | ~985 MB/s          |
| PCIe 4.0   | 16 GT/s   | 128b/130b| ~1.97 GB/s         |
| PCIe 5.0   | 32 GT/s   | 128b/130b| ~3.94 GB/s         |

An x16 PCIe 5.0 slot: $16 \times 3.94\ \text{GB/s} \approx 63\ \text{GB/s}$ in each direction simultaneously, since PCIe is **full-duplex**. The physical lane count is therefore: $16\ \text{lanes} \times 4\ \text{wires/lane} = 64\ \text{wires}$ — far fewer than the 124 pins on a 32-bit PCI slot, yet orders of magnitude higher bandwidth.

### On-Chip Interconnects: Ring and Mesh

Inside the CPU, cores, LLC slices, the memory controller, and the PCIe root complex must communicate. The interconnect topology determines both latency and throughput at scale.

**Ring bus**: cores and LLC slices are nodes on a loop. A packet traverses $k$ hops to reach a node $k$ positions away. Latency is $O(n)$ in the number of cores — acceptable at 4–8 cores, problematic at 28 because a core may wait 20+ cycles just for the ring traversal before the LLC even begins responding. Intel used ring buses through Broadwell; they remain in client parts (Core i-series) where core counts stay moderate.

**Mesh** (Intel Xeon Scalable "Mesh Architecture", AMD Infinity Fabric): nodes are laid out in a 2D grid. Worst-case hop count scales as $O(\sqrt{n})$ rather than $O(n)$. A 28-core mesh might have maximum 9 hops versus 14 on a ring. The cost is more wiring and more complex routing logic, justified only at high core counts.

AMD's Infinity Fabric extends the mesh concept across dies and sockets. Within a Zen 3 CCD (Core Chiplet Die), cores communicate over fabric running at memory clock. Across CCDs or across sockets in EPYC, fabric traversal adds measurable latency — this is what makes NUMA topology observable in practice.

### System-Level View

```
CPU Core
   │
   ├── L1 I$ + D$ (32–64 KB, SRAM, ~1 ns)
   ├── L2 (256 KB–1 MB, SRAM, ~4 ns)
   │
On-chip ring/mesh interconnect (~5–20 ns cross-chip)
   │
   └── LLC slices (2–4 MB per slice, distributed across mesh nodes)
          │
   Memory Controller (on-die)
          │
   Memory Bus (DDR5, 64-bit wide per channel, ~70–100 ns latency)
          │
          └── DRAM (DIMMs)

PCIe Root Complex (on-die or on-chipset)
   │
   ├── x16: GPU      (~μs round-trip PCIe TLP latency)
   ├── x4:  NVMe SSD (~μs PCIe + ~100 μs flash)
   └── x1:  NIC, audio, etc.
```

---

## How It Works

### Cache Miss: Full Transaction Path

When a core misses in L2, the miss propagates across the on-chip interconnect to the LLC. On a mesh architecture, traversal to a remote LLC slice may already cost 10–20 ns before the LLC lookup begins. An LLC miss then stalls the core until the memory controller completes a DRAM
