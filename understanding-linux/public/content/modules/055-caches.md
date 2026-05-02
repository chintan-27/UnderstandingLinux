---
id: 55
title: "Caches"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

Every modern processor can execute instructions roughly 100–1000× faster than DRAM can supply data. Without caching, the CPU would stall waiting for memory on nearly every instruction. Caches work because real programs are not random in their memory access patterns — they exhibit two measurable regularities: **temporal locality** (a recently accessed address will likely be accessed again soon) and **spatial locality** (accessing address $A$ makes nearby addresses $A+\delta$ likely to be needed soon). These are empirical observations about how humans write code, not laws. Random-access workloads — hash tables with poor locality, pointer-chasing linked lists — break them badly, and understanding *when* locality fails is as important as knowing *why* caches exploit it.

Get cache behavior wrong in your own code and performance collapses. Get it wrong in a multiprocessor context and you also get *correctness* failures — stale reads that no amount of careful locking will fix if the hardware coherence protocol is misunderstood.

---

## Core Concepts

### Cache Lines (Blocks)

Caches don't store individual bytes — they store *blocks* (cache lines), typically 64 bytes on x86. When you access any byte within a block, the hardware fetches the entire 64-byte block from memory. This is the mechanism by which spatial locality becomes performance: neighboring bytes arrive "for free" on the first miss.

Block size $B$ is a tradeoff. Larger blocks amortize per-miss overhead and exploit dense spatial locality, but they waste memory bandwidth when locality is poor (you fetch 64 bytes, use 4, then miss on the next line) and increase *miss penalty* because more bytes must cross the memory bus to fill a line.

On Linux, you can read the L1 data cache line size directly:

```bash
cat /sys/devices/system/cpu/cpu0/cache/index0/coherency_line_size
# 64
```

### Mapping: Where Does a Block Live in the Cache?

A cache must answer two questions in nanoseconds: (1) is this address currently cached? and (2) if so, where? The answer depends on the *mapping policy*.

**Direct-mapped**: each memory block maps to exactly one cache slot, determined by $(\text{block address}) \bmod (\text{number of blocks in cache})$. Lookup is $O(1)$ — one tag comparison — but two frequently-used addresses that map to the same slot will evict each other on every access (*conflict misses*), even if the rest of the cache is empty.

**Fully associative**: a block can occupy any slot. No conflict misses, but requires comparing every tag simultaneously — hardware-expensive. Practical only for small structures like TLBs.

**Set-associative** (the standard): the cache is divided into $S$ sets, each holding $W$ *ways* (slots). A memory address maps to exactly one set, but can occupy any of the $W$ ways within that set. This bounds tag comparison cost to $W$ comparisons while largely eliminating conflict misses.

Total cache capacity: $C = S \times W \times B$.

Address decomposition for a set-associative cache with block size $B = 2^b$ bytes and $S = 2^s$ sets:

$$\underbrace{\text{tag}}_{(A - s - b) \text{ bits}} \;\Big|\; \underbrace{\text{set index}}_{s \text{ bits}} \;\Big|\; \underbrace{\text{block offset}}_{b \text{ bits}}$$

where $A$ is the address width. The hardware extracts index bits to select a set, then compares the incoming tag against all $W$ ways *in parallel*. A match on a valid tag is a hit; the offset bits then select the requested byte within the block.

### Replacement: Which Block Gets Evicted?

When a miss occurs in a full set, something must go. The choice affects miss rate materially:

- **LRU (Least Recently Used)**: evict the way untouched longest. Optimal for many workloads but requires tracking access order per set — expensive at high associativity ($W \geq 8$). Cost of exact LRU state: $W!$ states per set.
- **Pseudo-LRU**: a tree of bits approximating LRU. Used in many real L1/L2 caches (e.g., x86 L1). Much cheaper, miss rate nearly identical in practice.
- **Random**: pick a victim uniformly at random. Surprisingly competitive with LRU, immune to adversarial access patterns that thrash LRU, and trivially cheap in hardware.
- **FIFO**: evict the oldest-fetched block regardless of recency. Suffers Bélády's anomaly — adding cache capacity can *increase* miss rate.

The OS page replacement problem is structurally identical but the cost of a miss (a page fault) is thousands of cycles — OS software can afford more sophisticated approximations. The Linux kernel's page reclaim uses an *active/inactive list* two-pass approximation to LRU, modified by recency hints from `madvise(2)` and accessed/dirty bits in page table entries.

### Coherence: Correctness Across Multiple Caches

Each core has private L1/L2 caches. If core 0 and core 1 both hold a cached copy of address $X$ and core 1 writes to $X$, core 0's copy is stale. Without a coherence protocol, core 0 will read the old value indefinitely — no mutex will fix this because the stale read happens *below* the locking abstraction.

A coherent memory system guarantees three properties:

1. A read by processor $P$ of address $X$ returns the value of the most recent write to $X$ by $P$, if no other processor has written $X$ since.
2. A read by $P$ of address $X$ returns the value written by processor $Q$ if that write is *sufficiently separated* in time from the read (and no intervening write exists).
3. **Write serialization**: all processors observe writes to the same address in the same total order.

The standard hardware mechanism is a **snooping protocol** such as MESI. Each cache line is in one of four states: **M**odified (dirty, exclusive), **E**xclusive (clean, exclusive), **S**hared (clean, potentially multiple holders), or **I**nvalid. Transitions are triggered by snooping the interconnect:

- A write by core 1 to a line in state S broadcasts an *invalidate* message; all other caches move their copy to state I.
- A subsequent read by core 0 misses (state I), fetches from core 1's cache (which holds the Modified line) or from memory after writeback.

This is invisible to software in the correctness sense — but its *performance* side effects are not invisible, which leads directly to false sharing.

---

## How It Works

### Address Decomposition: A Worked Example

Suppose a 32 KB, 4-way set-associative L1 cache with 64-byte blocks and 64-bit addresses:

$$b = \log_2(64) = 6 \text{ offset bits}$$
$$S = \frac{32768}{4 \times 64} = 128 \text{ sets} \implies s = \log_2(128) = 7 \text{ index bits}$$
$$\text{tag bits} = 64 - 7 - 6 = 51 \text{ bits}$$

For address `0x00007FFF_DEAD1234`:

```
Address (low 20 bits): 0xEAD1234
Binary:   ... 1110 1010 1101 0001 0010 0011 0100

Bits 5:0  (offset)     = 0b11_0100 = 0x34 = 52   → byte 52 within the block
Bits 12:6 (set index)  = 0b000_1001 = 9           → look in set 9
Bits 63:13 (tag)       = remaining upper bits      → compared against 4 ways
```

The hardware checks all 4 way-tags in set 9 simultaneously. If one matches and its valid bit is set: hit, deliver byte 52. Otherwise: miss, fetch the 64-byte block containing `0x...1200`–`0x...123F` from L2 or memory.

### The Cost of a Miss: AMAT

Miss penalty dominates. Average Memory Access Time:

$$\text{AMAT} = t_{\text{hit}} + m \cdot t_{\text{miss}}$$

where $m$ is the miss rate and $t_{\text{miss}}$ is the miss penalty in cycles. For a real hierarchy (L1 → L2 → L3 → DRAM):

$$\text{AMAT} = t_{L1} + m_{L1}(t_{L2} + m_{L2}(t_{L3} + m_{L3} \cdot t_{\text{DRAM}}))$$

With representative numbers — $t_{L1}=4$, $t_{L2}=12$, $t_{L3}=40$, $t_{\text{DRAM}}=200$ cycles, and miss rates $m_{L1}=0.05$, $m_{L2}=0.20$, $m_{L3}=0.50$:

$$\text{AMAT} = 4 + 0.05\bigl(12 + 0.20(40 + 0.50 \times 200)\bigr)$$
$$= 4 + 0.05(12 + 0.20 \times 140) = 4 + 0.05(12 + 28) = 4 + 2 = 6 \text{ cycles}$$

Raising $m_{L1}$ to $0.20$ gives $\text{AMAT} = 4 + 0.20 \times 40 = 12$ cycles — a 2× slowdown from one parameter change. This is why cache miss rate is often more important than raw instruction throughput when optimizing hot loops.

### Cache-Friendly vs. Cache-Hostile Access

Row-major traversal of a row-major array accesses memory sequentially — each 64-byte cache line is loaded once and fully consumed:

```c
// A[N][N] stored row-major: A[i][j] at offset (i*N +
