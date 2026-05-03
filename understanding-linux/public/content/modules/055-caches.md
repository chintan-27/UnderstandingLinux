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

Every modern CPU can execute instructions in nanoseconds, but DRAM takes 50–100 ns to respond to a random read. At a 3 GHz clock, that 100 ns penalty is **300 wasted cycles per miss**. Caches exist because programs are not random: they exhibit *locality*, and the cache hierarchy is the hardware mechanism that converts that statistical regularity into performance. Misconfigure your data structures to fight the cache and you can easily see 10× slowdowns — not from an algorithmic complexity change, but from the memory subsystem refusing to cooperate.

---

## Core Concepts

### Locality: Why Caches Work at All

Two properties of real programs make caches effective:

**Temporal locality**: a recently-accessed location will likely be accessed again soon. A loop counter read and written on every iteration is the canonical example. The cache keeps it hot so subsequent accesses cost ~4 cycles (L1 latency) instead of ~300.

**Spatial locality**: accessing address $A$ predicts that addresses near $A$ will be accessed soon. The cache exploits this by fetching a full *cache line* — 64 bytes on all modern x86 processors — on every miss, not just the word that was requested. If your program then touches the next word in sequence, it's already in cache.

These two properties hold because programs contain loops (temporal) and operate on contiguous data structures like arrays and structs (spatial). A program that accessed memory in a truly random order — say, pointer-chasing through a shuffled linked list spanning gigabytes — would derive almost no benefit from a cache, and its performance would reflect raw DRAM latency at every step. This is why linked list traversal is genuinely slower than array traversal at scale, even when both are $O(n)$.

### Cache Mapping: Where Can a Block Live?

A cache holds far fewer blocks than DRAM. The hardware must determine which cache location a given memory block *can* occupy, and then whether it currently *does* occupy it. There are three strategies:

**Direct-mapped**: each memory block maps to exactly one cache slot, determined by `block_address mod num_slots`. A lookup requires checking exactly one slot — fast, simple hardware. The cost: two frequently-used blocks can map to the same slot and evict each other on alternating accesses (*thrashing*). There is no way to keep both resident simultaneously.

**Fully associative**: a block can go in any slot. This eliminates conflict misses entirely, but finding a block requires comparing every tag in parallel. The hardware cost scales badly with size; in practice, fully associative structures are limited to small tables like TLBs (32–1024 entries).

**Set-associative** ($n$-way): the cache is partitioned into $S$ sets, each holding $n$ ways. A block maps to exactly one set (via `block_address mod S`) but can occupy any of the $n$ ways within that set. Modern L1 caches are typically 4–8-way; L3 caches are often 16-way. Increasing $n$ reduces conflict misses with diminishing returns: going from 1-way (direct-mapped) to 2-way captures most of the gain; going from 8-way to 16-way provides very little additional benefit for typical workloads.

For a cache with $S$ sets and 64-byte blocks ($2^6$ bytes), the set index for a block at byte address $a$ is:

$$\text{set} = \left\lfloor \frac{a}{64} \right\rfloor \bmod S$$

Within that set, all $n$ tags are compared in parallel — the width of the set is the hardware cost you pay.

### Replacement Policy: What Gets Evicted?

When a set is full and a new block arrives, the hardware must choose a victim. The oracle policy would evict whichever block will be reused furthest in the future (Bélády's algorithm), but that requires knowledge of future accesses. Hardware must approximate it:

**LRU (Least Recently Used)**: evict the block accessed longest ago. Performs well for workloads with clear temporal reuse. Exact LRU requires $\log_2(n!)$ bits of ordering state per set — at $n = 16$, that is $\lceil \log_2(16!) \rceil = 44$ bits per set, plus update logic on every access. Most hardware implements *pseudo-LRU*: a binary tree of bits that approximates LRU with $n - 1$ bits per set, accepting occasional wrong evictions in exchange for simpler update logic.

**Random**: select a victim uniformly at random. Counterintuitively competitive with LRU at $n \geq 4$, because conflict patterns that would systematically defeat LRU don't systematically defeat random. Simpler hardware, no pathological cases.

**RRIP (Re-Reference Interval Prediction)**: each line is tagged with a predicted re-reference distance (2 bits in the basic form). New lines are inserted with a "distant" prediction; lines that hit have their prediction promoted to "near". Eviction targets the line with the most distant prediction. Intel uses a variant (SRRIP/DRRIP) in L3 caches to resist cache-unfriendly scan patterns that would pollute an LRU cache.

### Cache Coherence: The Multiprocessor Problem

Each core in a modern CPU has a private L1 and L2 cache. This means multiple cores can simultaneously hold a copy of the same cache line. Without a coherence mechanism, a write by one core would be invisible to others, causing silent data corruption: two cores both reading a "current" value that disagree.

A coherent memory system enforces two invariants:

1. **Single-writer / multiple-reader**: at any instant, a line is either writable by exactly one core, or readable by any number of cores — not both.
2. **Write serialization**: if two cores write to the same location, all other cores observe those writes in the same order.

The standard mechanism is **MESI** (a state machine per cache line):

| State | Meaning |
|---|---|
| **M**odified | Line is dirty; only this cache has it; memory is stale |
| **E**xclusive | Line is clean; only this cache has it; memory matches |
| **S**hared | Line is clean; multiple caches may have it; memory matches |
| **I**nvalid | Line is not present or has been invalidated |

When a core in state S or I wants to *write*, it issues an **invalidate** transaction on the interconnect. Every other cache holding that line transitions to I before the requesting core's write proceeds. This serializes writes through the interconnect and prevents two cores from believing they have write authority simultaneously.

**False sharing** is the coherence tax on adjacent data. Two cores writing to different variables $x$ and $y$ — independent, no logical sharing — but $x$ and $y$ happen to sit in the same 64-byte line. The coherence protocol sees one unit: that line. It bounces ownership between cores on every write, serializing what should be parallel updates. The program is correct; it is simply paying the full coherence round-trip (~40–100 ns on a NUMA system) for every write to either variable.

---

## How It Works

### Address Decomposition

For a physically-addressed cache with $2^s$ sets and $2^b$-byte blocks, a physical address is decomposed into three fields:

$$\underbrace{\text{tag}}_{(w - s - b) \text{ bits}} \;\|\; \underbrace{\text{set index}}_{s \text{ bits}} \;\|\; \underbrace{\text{block offset}}_{b \text{ bits}}$$

For a concrete 32-bit address with a 4-way set-associative cache of 256 sets ($s = 8$) and 64-byte lines ($b = 6$):

$$\underbrace{[31:14]}_{\text{tag, }18\text{ bits}} \;\|\; \underbrace{[13:6]}_{\text{set index, }8\text{ bits}} \;\|\; \underbrace{[5:0]}_{\text{block offset, }6\text{ bits}}$$

```
Physical address (32 bits):
 31             14 | 13          6 | 5           0
 [    tag        ] [ set index   ] [   offset    ]
      18 bits            8 bits          6 bits
```

The total cache capacity is:

$$\text{capacity} = 2^s \times n \times 2^b = 256 \times 4 \times 64 = 65536 \text{ bytes} = 64 \text{ KiB}$$

This matches a typical L1 data cache size. On a lookup, hardware uses the 8-bit set index to address the set's tag array, reads all 4 tags simultaneously, and XORs each with the address's tag field — a hit is a zero result combined with a valid bit.

The reason the block offset occupies the *low* bits and the tag the *high* bits is not arbitrary: it ensures that spatially adjacent addresses (differing only in low bits) map to the *same* set, maximizing spatial prefetch utility. If the set index used high bits, sequential addresses would spray across the whole cache.

### Conflict Miss Demonstration

A direct-mapped cache with $2^k$ sets maps address $a$ to set $\lfloor a/64 \rfloor \bmod 2^k$. Two arrays whose base addresses differ by a multiple of the cache size will have every corresponding element map to the *same* set — guaranteed thrashing:

```c
// Assume L1 data cache: direct-mapped, 32 KiB, 64-byte lines
// = 512 sets. Two arrays 32 KiB apart alias to the same sets.
#define N 4096
double A[N], B[N];   // sizeof(double) * 4096 = 32 KiB each
                     // If &A[0] and &B[0] differ by 32 KiB,
                     // A[i] and B[i] map to the same cache set.

for (int i = 0; i < N; i++) {
    A[i] = A[i] * B[i];
    // Access A[i]: load A[i]'s line into set k, evicting B[i]'s line
    // Access B[i]: miss — load B[i]'s line into set k, evicting A[i]'s line
    //
