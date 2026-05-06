---
id: 58
title: "Memory technologies"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### Memory Technologies – From Transistors to System‑Level Trade‑offs
| Technology | Storage Cell | Volatility | Typical Use | Key Parameters |
|------------|--------------|------------|-------------|----------------|
| **SRAM**   | 6‑T CMOS latch (two cross‑coupled inverters + two access transistors) | Volatile (needs power) | L1/L2/L3 cache, register files | Access time ~0.5‑2 ns, standby power ≈ 10‑30 µW/bit, density ≈ 1 transistor/bit |
| **DRAM**   | 1T1C (one MOSFET + one storage capacitor) | Volatile (requires periodic refresh) | Main memory (DIMM) | Access time ≈ 50‑100 ns, refresh interval = 64 ms, energy/access ≈ 1‑2 nJ/bit, density ≈ 1 transistor+capacitor/bit |
| **ROM**    | Mask‑programmed transistors (or fuse/anti‑fuse) | Non‑volatile | Firmware, bootloaders | Read latency comparable to SRAM, write impossible after manufacture |
| **Flash (NAND)** | Floating‑gate MOSFET trapped charge | Non‑volatile, block‑erasable | SSDs, USB sticks, embedded storage | Page size ≈ 4‑16 KB, block size ≈ 256 KB‑4 MB, erase‑before‑write, endurance ≈ 10⁴‑10⁶ cycles, read latency ≈ 25‑50 µs, write latency ≈ 200‑500 µs |
| **Persistent Memory (PMEM)** | DDR‑like DRAM cells with additional backup (e.g., Intel Optium 3D XPoint) | Non‑volatile, byte‑addressable | Storage‑class memory, NVMM filesystems | Load latency ≈ 100‑150 ns (≈ 2× DRAM), bandwidth ≈ 10‑25 GB/s, endurance ≈ 10⁷‑10⁸ writes, cache‑line granularity |

#### Why SRAM Is Fast but Costly
The 6‑T latch holds a stable voltage without needing to recharge a capacitor. Both inverters are always powered, so a read is a simple voltage‑sense operation; no charge redistribution occurs. The downside is six transistors per bit → low density and static (leakage) power even when idle.

#### Why DRAM Needs Refresh
A DRAM cell stores charge on a capacitor. Leakage currents (sub‑threshold, junction) discharge the capacitor with a time constant τ ≈ t<sub>RET</sub> (retention time). If the voltage falls below the sense‑amplifier threshold, the bit is lost. Refresh restores the charge by reading and rewriting each row. The refresh period *t*<sub>REF</sub> is set by the worst‑case τ across all cells (typically 64 ms for DDR4). The refresh command (REF) activates an entire row, consuming *t*<sub>RFC</sub> ≈ 350 ns during which no data transfer can happen.

#### Flash’s Erase‑Before‑Write Constraint
Floating‑gate cells store electrons on an insulated gate. To change the threshold voltage, electrons must be removed (erase) by applying a high voltage to the whole block, which forces tunneling through the oxide for all cells simultaneously. Consequently, a single bit cannot be flipped; the entire erase block must be cleared before any page within it can be programmed. This yields asymmetric latency (read ≪ program ≪ erase) and wear mechanisms (oxide degradation) that limit endurance.

#### Persistent Memory’s Dual Nature
PMEM retains the DRAM‑like cell architecture (fast sense‑amplifier read) but adds a material phase‑change or memristive storage layer that does not rely on charge. Writes modify the resistance state directly, allowing byte‑addressable updates without an erase step. Because the storage medium is non‑volatile, data survives power loss, yet the access path still goes through the memory controller, yielding latencies only slightly higher than DRAM.

### Memory Hierarchy – Principles and Mathematics
The hierarchy exploits **temporal locality** (recently accessed items are likely to be reused) and **spatial locality** (nearby items are likely to be accessed). Each level *i* is characterized by:
- Access latency *t*<sub>i</sub>
- Hit rate *h*<sub>i</sub> (probability that a request is satisfied at level *i*)
- Miss penalty *m*<sub>i</sub> = latency to fetch from lower level + any transfer time

For a two‑level hierarchy (L1 cache → main memory) the **Average Memory Access Time (AMAT)** is:

$$
\text{AMAT}=t_{L1}+ (1-h_{L1})\big(t_{mem}+ (1-h_{mem})t_{disk}\big)
$$

If we ignore disk (assume main memory always hits on miss), this reduces to:

$$
\text{AMAT}=t_{L1}+(1-h_{L1})t_{mem}
\]

**Inclusion property** (common in Intel caches): every line present in L1 is also present in L2 and L3. This simplifies coherence but wastes capacity. **Exclusive** hierarchies (e.g., some AMD designs) avoid duplication but require more complex coherence protocols.

**Replacement policies** aim to approximate the optimal Belady algorithm (evict the line whose next use is farthest). Practical approximations:
- **LRU** (Least Recently Used) – exact for fully associative caches, O(log N) with counters.
- **Pseudo‑LRU** – tree‑based bits, O(1) per access, used in set‑associative caches.
- **Random** – trivial, used when complexity must be minimized.

---

## How It Works
### 1. SRAM Operation – From Transistor Dynamics to Timing
A 6‑T SRAM cell stores a logical ‘0’ or ‘1’ as the voltage difference between two nodes *Q* and \(\bar{Q}\). When the word line (WL) rises, the two access transistors connect the bit lines (BL, \(\bar{BL}\)) to the cell. A sense amplifier detects the tiny voltage differential (≈ 10‑20 mV) and amplifies it to full rail. Because the cell is a bistable latch, no charge needs to be moved; the energy per access is mainly the charging/discharging of the bit line capacitance (*C*<sub>BL</sub>):

$$
E_{\text{access}} \approx \frac{1}{2}C_{BL}V_{DD}^2
$$

With *C*<sub>BL</sub>≈ 30 fF, *V*<sub>DD</sub>=1 V → *E*≈ 15 fF·V²≈ 15 fJ per access (dominated by line capacitance, not the cell itself).

### 2. DRAM Refresh – Quantifying Bandwidth Loss
Consider an 8 Gb DDR4 DIMM organized as 8 Gb / (8 bits) = 1 G words, 8 192 rows per bank, 8 banks. Refresh must hit each row once every *t*<sub>REF</sub>=64 ms.

- Time per row refresh: *t*<sub>RFC</sub> (refresh cycle time) ≈ 350 ns.
- Fraction of time spent refreshing:

$$
f_{\text{refresh}} = \frac{t_{RFC}}{t_{REF}/\text{rows}} = \frac{350\text{ ns}}{64\text{ ms}/8192} \approx \frac{350\text{ ns}}{7.8125\ \mu s} \approx 0.045 \;(4.5\%)
$$

Thus ~4‑5 % of the raw memory bandwidth is unavailable for user traffic. The effective bandwidth is:

$$
B_{\text{eff}} = B_{\text{raw}} (1-f_{\text{refresh}})
$$

If raw DDR4‑3200 provides 25.6 GB/s, the usable bandwidth ≈ 24.4 GB/s.

### 3. Cache Miss Penalty Derivation
When L1 misses, the request goes to L2. If L2 also misses, we go to main memory. Assume:
- L1 hit time *t*<sub>L1</sub>=4 ns
- L2 hit time *t*<sub>L2</sub>=12 ns
- Main memory latency *t*<sub>mem</sub>=100 ns
- L1 hit rate *h*<sub>L1</sub>=0.95
- L2 hit rate *h*<sub>L2|L1miss</sub>=0.80 (i.e., 20 % of L1 misses go to memory)

The AMAT expands to:

$$
\begin{aligned}
\text{AMAT} &= t_{L1} + (1-h_{L1})\big[t_{L2} + (1-h_{L2|L1miss})t_{mem}\big] \\
&= 4\text{ ns} + 0.05\big[12\text{ ns} + 0.20\times100\text{ ns}\big] \\
&= 4\text{ ns} + 0.05\big[12\text{ ns} + 20\text{ ns}\big] \\
&= 4\text{ ns} + 0.05\times32\text{ ns} \\
&= 4\text{ ns} + 1.6\text{ ns} = 5.6\text{ ns}
\end{aligned}
$$

If we ignored L2, the naïve estimate would be 4 ns + 0.05×100 ns = 9 ns – a 60 % overestimation. This illustrates why modeling each level matters.

### 4. Flash Write Amplification
Write amplification factor (WAF) = (bytes written to flash) / (bytes intended by host). For a sequential workload with page size *P* and block size *B*:

$$
\text{WAF} = \frac{B}{P}
$$

Example: *P* = 4 KB, *B* = 256 KB → WAF = 64. Host writing 1 GB results in 64 GB of internal NAND writes, significantly impacting endurance.

### 5. Persistent Memory Access Path
A load from PMEM follows the same route as a DRAM load: CPU → memory controller → DIMM. The extra latency comes from the higher internal *t*<sub>RC</sub> (row cycle) of the storage material (≈ 120 ns vs. 50 ns for DRAM). However, because PMEM is byte‑addressable, the CPU can issue a normal load/store without an extra software layer (unlike block‑based SSDs).

---

## Worked Examples
### Example 1: Two‑Level Cache AMAT Calculation
**Scenario**  
- L1: 32 KB, 4‑way, hit time 4 ns, hit rate 96 %  
- L2: 256 KB, 8‑way, hit time 12 ns, hit rate (given L1 miss) 70 %  
- Main memory: 100 ns  

**Solution**  
\[
\begin{aligned}
\text{AMAT} &= t_{L1} + (1-h_{L1})\big[t_{L2} + (1-h_{L2|L1miss})t_{mem}\big] \\
&= 4 + (0.04)\big[12 + (0.30)\times100\big] \\
&= 4 + 0.04\big[12 + 30\big] \\
&= 4 + 0.04\times42 \\
&= 4 + 1.68 = 5.68\text{ ns}
\end{aligned}
\]

If the system runs at 3 GHz (cycle = 0.333 ns), the AMAT corresponds to ≈ 17 CPU cycles.

### Example 2: DRAM Refresh Bandwidth Overhead
**Given**  
- DDR4‑2933, 8 Gb per rank, 2 ranks per DIMM → 16 Gb total = 2 GB  
- t<sub>REF</sub> = 64 ms, rows per bank = 2³¹⁴? (Assume 2 ¹⁴ = 16384 rows per bank for 8 Gb)  
- t<sub>RFC</sub> = 300 ns  

**Compute**  
Refresh rows per second = (rows per rank × ranks) / t<sub>REF</sub> = (16384 × 2) / 0.064 s ≈ 512 k rows/s.  
Time spent refreshing per second = rows/s × t<sub>RFC</sub> = 512 000 × 300 ns ≈ 0.154 s → 15.4 % of each second.

Effective bandwidth = raw bandwidth × (1 − 0.154). Raw DDR4‑2933 ≈ 23.4 GB/s → usable ≈ 19.8 GB/s.

### Example 3: Flash Wear Estimation
**Given**  
- SSD: 1 TB, NAND page = 16 KB, block = 256 pages → block size = 4 MB  
- Endurance: 3 000 program/erase (P/E) cycles per block  
- Workload: random 4 KB writes, 100 GB/day  

**Steps**  
1. WAF for random 4 KB writes ≈ block/page = 256 (each write forces an erase of a 4 MB block).  
2. Effective NAND writes per day = 100 GB × 256 = 25.6 TB/day.  
3. Total writable NAND capacity = 1 TB × (block size / page size) × P/E cycles = 1 TB × 256 × 3000 ≈ 768 TB.  
4. Lifetime = 768 TB / 25.6 TB/day ≈ 30 days.  

This stark result shows why random small writes are disastrous for SSDs without wear‑leveling and why log‑structured or buffered writes are essential.

### Example 4: Persistent Memory vs. DRAM Latency
**Measurement** (using `rdtsc` around a `mov` from a PMEM mmap region):
```c
#include <x86intrin.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>

int main() {
    int fd = open("/dev/pmem0", O_RDWR);
    void *addr = mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0);
    unsigned long long start = __rdtsc();
    volatile char val = *((char*)addr);   // load
    unsigned long long end = __rdtsc();
    printf("Load latency ≈ %llu cycles\n", end-start);
    munmap(addr, 4096);
    close(fd);
    return 0;
}
```
On a Xeon Scalable platform the loop yields ~ 300 cycles (~ 100 ns at 3 GHz), versus ~ 150 cycles (~ 50 ns) for a DRAM mmap of anonymous memory. The extra ~ 50 ns reflects the higher internal latency of the storage medium, not software overhead.

---

## Common Mistakes
| # | Misconception | Why It’s Wrong |
|---|----------------|----------------|
| 1 | **“SRAM consumes no static power.”** | Even when idle, the six transistors leak sub‑threshold current; leakage dominates static power in deep‑sub‑micron nodes. |
| 2 | **“DRAM refresh is just a background task that costs nothing.”** | Refresh occupies the command bus for *t*<sub>RFC</sub> per row, stealing bandwidth; at 64 ms interval it can consume > 10 % of bandwidth on high‑density modules. |
| 3 | **“ROM can be rewritten like flash.”** | Mask‑ROM is permanently set during semiconductor fabrication; only programmable ROMs (PROM, EPROM, EEPROM) allow writes, and they still have limited endurance. |
| 4 | **“Flash memory can be written byte‑wise like RAM.”** | Flash cells require block erasure before any page can be programmed; attempting a byte write triggers an internal erase‑modify‑write cycle, causing wear and unpredictable latency. |
| 5 | **“Persistent memory is just DRAM with a battery backup.”** | PMEM stores data in a non‑volatile material (e.g., 3D XPoint) that retains state without power; a battery-backed DRAM loses data if the battery fails and still needs refresh. |
| 6 | **“Higher cache levels are always faster.”** | Latency increases with level size; however, miss penalty dominates performance, so a larger L3 can reduce AMAT despite higher *t*<sub>L3</sub>. |
| 7 | **“Write‑back caches always improve performance.”** | Write‑back reduces traffic but complicates coherence and can increase latency on a miss if dirty lines must be written back before being replaced. |
| 8 | **“All memory hierarchies are inclusive.”** | Some designs (e.g., AMD Zen) use exclusive or non‑inclusive policies to increase effective capacity; assuming inclusivity can mispredict cache‑size requirements. |

---

## Exercises
### 1. Refresh Overhead (Easy → Medium)
*Derive* the fraction of memory bandwidth lost to refresh for a DDR5‑4800 module with:
- t<sub>REF</sub> = 32 ms  
- rows per bank = 32 K  
- t<sub>RFC</sub> = 260 ns  

*Compute* the effective bandwidth if the raw rate is 38.4 GB/s.

### 2. Cache Hierarchy Simulation (Medium)
Write a Python program that simulates a 2‑level cache (L1: 4‑way 32 KB, L2: 8‑way 256 KB) using the **Pseudo‑LRU** replacement policy. Feed it a trace of 1 M memory accesses generated by a simple stride pattern (stride = 64 B, array size = 8 MB). Report:
- L1 hit rate  
- L2 hit rate (given L1 miss)  
- AMAT using the latencies from Example 1.  

*Hint*: Represent each set as a list of tags and a 3‑bit P‑LRU vector.

### 3. Flash Wear Leveling Algorithm (Hard)
Implement a simple **greedy wear‑leveling** allocator in C:
- Maintain an array `erase_counts[NBLOCKS]`.  
- For each write request of size *P* (page), select the block with the smallest erase count, increment its count, and simulate an erase (reset count to 0 after reaching `MAX_ERASE`).  
- Test with a workload of 10⁶ random 4 KB writes on a 256‑block flash (block = 256 KB).  
Output the maximum erase count observed and compare it to the ideal uniform wear (total writes / NBLOCKS).  

### 4. Measuring Memory Bandwidth on Linux (Medium)
Run the **STREAM** benchmark (available via `apt-get install stream`) on your system and record the `Triad` bandwidth. Then, using `perf`, measure the number of `L1-dcache-load-misses` and `LLC-load-misses` during the same run. Correlate the miss rates with the observed bandwidth reduction.

### 5. Persistent Memory Programming (Hard)
Create a file on a pmem filesystem (`/mnt/pmem0/testfile`) using `mkfs.fs dax`. Write a C program that:
1. Memory‑maps the file with `mmap`.  
2. Writes a 64‑byte pattern using `_mm_clwb` (cache line write back) followed by `_mm_sfence`.  
3. Reads back the pattern and verifies it after a power‑cycle simulation (i.e., after `msync` and `munmap`).  

Explain why the flush/fence instructions are required for persistence.

---

## Linux Connection
### Subsystems and Interfaces
| Subsystem | Role | Key Files / Commands |
|-----------|------|----------------------|
| **Buddy Allocator** | Manages physical pages (order‑0 … order‑MAX) | `/proc/buddyinfo` (`cat /proc/buddyinfo`) |
| **SLAB / SLUB Allocator** | Cache‑allocates kernel objects (e.g., `task_struct`, `inode`) | `/proc/slabinfo` |
| **Page Cache** | Caches file-backed pages; backs `mmap` of regular files | `vmstat -v`, `grep -E '^(pgpgin|pgpgout)' /proc/vmstat` |
| **Swap Subsystem** | Swaps anonymous pages to swap storage | `swapon --show`, `cat /proc/swaps` |
| **tmpfs** | RAM‑based filesystem (uses page cache, swap as backing) | `mount | grep tmpfs` |
| **DAX (Direct Access)** | Enables mmap of pmem files without page cache involvement | `mount
