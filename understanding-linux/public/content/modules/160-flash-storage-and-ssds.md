---
id: 160
title: "Flash storage and SSDs"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A rotational disk punishes random I/O because the head must physically move to the target cylinder before any data transfer begins — seek latency of 5–15 ms dominates. Flash removes mechanical seek entirely, but substitutes a different constraint set: cells cannot be overwritten directly, erasure operates on regions orders of magnitude larger than a single write, and every erase degrades the cell's oxide irreversibly. The firmware layer that hides this from the OS (the FTL) is not cosmetic — without it, a naive driver would wear out a localized region of cells in hours under a logging workload, then stall completely when free space ran out. Understanding the FTL tells you why SSDs exhibit write cliffs, why a full SSD is slower than a half-full one, why TRIM exists, and why the geometry the OS sees is a fiction.

---

## Core Concepts

### NAND Flash: Cells, Pages, and Blocks

Flash stores data by trapping electrons in a floating-gate transistor. The floating gate is electrically isolated; charge placed there persists without power. The cell type determines how many discrete charge levels are distinguished:

| Type | Bits/cell | Endurance (P/E cycles) | Relative speed |
|------|-----------|------------------------|----------------|
| SLC  | 1         | ~100,000               | fastest        |
| MLC  | 2         | ~10,000                | moderate       |
| TLC  | 3         | ~1,000–3,000           | slower         |
| QLC  | 4         | ~100–1,000             | slowest        |

More bits per cell means the sense amplifier must distinguish finer voltage levels, which increases read/program time and reduces noise margin — hence the endurance tradeoff.

Physical organization imposes the asymmetric granularity that drives everything else:

- **Page**: 4 KB–16 KB. The unit of read and program.
- **Block**: 128–512 pages (512 KB–8 MB). The unit of erase.

A page can be programmed once after its containing block is erased. Partial overwrite of a page is not possible — the erase operation applies high voltage (~20 V) across the entire block simultaneously to clear the floating gates. There is no finer erase granularity in the hardware.

### Why You Cannot Overwrite In Place

When you write a page, Fowler-Nordheim tunneling injects electrons through the oxide into the floating gate. Reversing this requires removing those electrons, which demands applying a large field across the block — the erase pulse. This is a physical property of the oxide barrier, not an arbitrary design choice. The consequence: updating a single 4 KB page within a 4 MB block requires:

1. Read all valid pages from the block into a DRAM buffer.
2. Modify the target page in the buffer.
3. Erase the entire block ($\approx 1.5$–$10$ ms).
4. Program all pages back.

The FTL exists primarily to avoid this **read-modify-write** cycle on every update. It does so by always writing to a fresh page and recording the new location in a mapping table.

### Wear Leveling

Each erase cycle slightly damages the tunnel oxide. After enough cycles, the oxide leaks charge and the cell can no longer reliably hold a value. Endurance limits are roughly:

$$N_{\text{erase}} \approx 10^3 \text{ (TLC/QLC)} \quad\text{to}\quad 10^5 \text{ (SLC)}$$

Without wear leveling, a block holding a frequently rewritten file (a journal, a database WAL) would exhaust its $N_{\text{erase}}$ budget while most of the drive remains nearly new. Wear leveling forces the FTL to distribute erase cycles.

**Dynamic wear leveling**: When a new write needs a free block, select the one with the lowest erase count. This protects against hot blocks that are frequently written.

**Static wear leveling**: Periodically migrate cold data (data that has not changed in a long time) off low-erase-count blocks so those blocks become available to absorb writes. Without static leveling, a file written once and never touched again permanently occupies a young block, preventing dynamic leveling from using it. Static leveling is costlier — it generates writes with no corresponding host I/O — but is required for correct lifetime distribution.

The firmware tracks per-block erase counts. The maximum erase count differential the FTL tolerates before forcing a migration is a tunable design parameter.

### Garbage Collection

Out-of-place writes mean blocks accumulate **stale pages**: pages that once held valid data for an LBA, but whose LBA has since been remapped to a newer physical page. Stale pages occupy physical space but contribute nothing to usable capacity. Garbage collection (GC) reclaims them:

1. Select a **victim block** — typically the one with the highest ratio of stale to valid pages.
2. Copy the block's valid pages to a free page in a clean block.
3. Update the L2P map entries for those pages.
4. Erase the victim block and return it to the free pool.

Every valid page copied in step 2 is a write the host did not request. This is **write amplification**:

$$\text{WAF} = \frac{\text{bytes physically written to NAND}}{\text{bytes written by host}}$$

$\text{WAF} = 1.0$ is ideal (every host write maps to exactly one physical write). Under sustained random writes on a nearly full drive, WAF can reach 10 or higher because GC is copying many valid pages to free just one block per cycle. You can estimate the real NAND write rate from the host write rate:

$$\dot{W}_{\text{NAND}} = \text{WAF} \times \dot{W}_{\text{host}}$$

Modern NVMe drives expose WAF-related counters via SMART. The ratio of `Data Units Written` (host) to `NAND Bytes Written` (physical) is the effective WAF over the drive's lifetime.

### Flash Translation Layer (FTL)

The FTL is firmware executing on the SSD's embedded processor (typically an ARM core). It presents a standard block device interface to the host — LBAs, 512-byte or 4096-byte sectors — while the physical layout is completely decoupled from it.

**Logical-to-physical (L2P) mapping**: The core data structure is a table mapping each LBA to a physical page address. On a 1 TB drive with 4 KB pages, the table has $1\text{ TB} / 4\text{ KB} = 2.68 \times 10^8$ entries. At 4 bytes per entry, the table consumes about 1 GB of DRAM on the controller. The FTL keeps the hot portion of this table in DRAM and pages the rest from a reserved area of NAND — a miss in the DRAM-resident portion adds a NAND read before the actual data read.

**Out-of-place writes**: A host write to LBA $L$ results in:

```
find free page P_new
program(P_new, data)
L2P[L] = P_new
mark P_old as stale
```

The OS's notion of "overwriting LBA 512" is, physically, a write to a new location followed by a pointer update.

**Bad block management**: Blocks that fail a program or erase operation are marked bad and excluded from the L2P mapping. A factory bad block table and a runtime bad block table are maintained in reserved NAND space.

---

## How It Works

### The Write Path in Detail

```
Host:   write(LBA=0x200, 4 KB)

FTL:
  1. Consult L2P: LBA 0x200 → P_old (physical page 0x1A3F)
  2. Select free page P_new from write buffer block
  3. Program P_new ← host data
  4. Update L2P: LBA 0x200 → P_new
  5. Mark P_old stale in block metadata
  6. If free page count < GC threshold:
       trigger background GC
```

No erase occurs during a normal write. Erase happens asynchronously in GC, unless the free pool is exhausted, at which point GC runs synchronously and blocks foreground I/O — this is the source of write latency spikes.

### Over-Provisioning

SSDs expose less capacity than the NAND physically contains. This reserved space — **over-provisioning (OP)** — is permanently available to the FTL as a free block reservoir and GC workspace:

$$\text{OP\%} = \frac{C_{\text{raw}} - C_{\text{user}}}{C_{\text{user}}} \times 100$$

A 1 TB consumer SSD might have $C_{\text{raw}} = 1.07$ TB of NAND, giving $\text{OP} \approx 7\%$. Enterprise SSDs typically use 25–28% OP to sustain low write latency under heavy mixed workloads. The performance difference is not marketing — larger OP means GC has more victim candidates and a larger free pool, keeping WAF lower and avoiding synchronous GC more of the time.

When the user fills the drive, the logical free space the OS sees shrinks, but the physical free pool available to GC also shrinks because the FTL cannot use pages that hold valid host data. The effective OP at 95% logical fullness is essentially zero, which forces high-WAF GC for every write.

### Write Cliff

Under sustained random 4 KB writes on a drive at high logical utilization:

```
Phase 1 — SLC write cache and OP buffer available:
    Throughput:  1–3 GB/s (NVMe PCIe 4.0)
    Write latency: 50–200 µs
    WAF: ~1.0

Phase 2 — cache and OP exhausted, GC in-band:
    Throughput:  100–400 MB/s
    Write latency: 1–10 ms (GC erase blocking foreground I/O)
    WAF: 5–15x
```

The SLC write cache is a portion of TLC/QLC cells programmed in single-level mode (one bit per cell) for speed. When the SLC cache fills faster than the controller can fold it into TLC/QLC storage, writes bypass the cache and
