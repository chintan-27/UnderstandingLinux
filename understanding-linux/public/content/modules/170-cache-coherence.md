---
id: 170
title: "Cache coherence"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Modern CPUs operate on caches that are 10–100× faster than DRAM. On a multi-core machine, each core maintains private L1 and L2 caches that may simultaneously hold copies of the same physical address. The coherence protocol resolves disagreements between those copies — but its resolution mechanism has a cost structure that determines whether your parallel program scales or regresses. A program with no data races, no bugs, and correct synchronization can run 10× slower than its single-threaded equivalent purely because of how the hardware enforces coherence across cache lines. This is not a corner case; it is the dominant bottleneck in many real parallel workloads.

---

## Core Concepts

### Cache Lines

The unit of transfer between memory hierarchy levels is not a byte — it is a **cache line**, 64 bytes on all current x86 processors. When a core reads a single `uint64_t`, the hardware fetches the entire 64-byte block containing it. The cache line address is computed by masking the low-order bits:

$$\text{line address} = \text{addr} \mathbin{\&} \sim(\text{line\_size} - 1)$$

For a 64-byte line, `line_size - 1 = 0x3F`, so the mask zeroes bits 0–5. Two addresses whose upper 58 bits are identical map to the same cache line. This is a hardware constraint, not a software one — the coherence protocol operates exclusively on line addresses, with no visibility into which bytes within a line were written.

### MESI Coherence States

Each cache line in each core's private cache carries a 2-bit state tag. The canonical protocol is **MESI**:

| State | Meaning | Implication |
|-------|---------|-------------|
| **M**odified | Sole valid copy; dirty (differs from memory) | Must write back before eviction |
| **E**xclusive | Sole valid copy; clean (matches memory) | Can transition to M silently on write |
| **S**hared | One of multiple valid read-only copies | Cannot write without first issuing RFO |
| **I**nvalid | Stale; not usable | Must fetch from memory or another cache |

The protocol invariant: **if any cache holds a line in M, all other caches must hold I for that line.** If any cache holds E, all others hold I. Multiple caches may simultaneously hold S, but no cache may hold M or E at the same time as any other cache holds anything but I.

These states exist *per cache line, per core*. A 32 KB L1 cache with 64-byte lines has 512 lines, each tracked independently.

### False Sharing

False sharing occurs when two cores write to different variables that happen to reside on the same cache line. The hardware has no mechanism to distinguish "this write touched byte 0–7" from "this write touched byte 8–15." From the coherence protocol's perspective, any write to any byte in a line is a write to the entire line, which requires invalidating all other copies. The result is coherence traffic — and the associated latency — for variables that are logically unrelated.

This is distinct from a data race. Both threads can hold a mutex, access completely separate variables, and execute correctly. The performance still collapses.

### Cache Line Bouncing

When a line in state M is repeatedly claimed by alternating cores — each one forcing the previous owner to write back or forward the line before acquiring ownership — the line never stabilizes in any cache. Every iteration of the loop pays full miss latency instead of L1 hit latency.

On NUMA systems, this is worse. If Core 0 is on socket 0 and Core 1 is on socket 1, each ownership transfer crosses the inter-socket interconnect (QPI/UPI), paying remote-node latency of approximately 40–100 ns instead of the ~4 ns L1 hit. The line physically travels between sockets on every write.

---

## How It Works

### MESI Transition Sequence

Trace the state machine for two cores sharing an interconnect, operating on address `X`:

1. **Core 0 reads X.** Line is in RAM, not in any cache. Core 0 fetches it; no other cache has a copy. State on Core 0: **E**.
2. **Core 1 reads X.** Core 0 snoops the read request, downgrades its copy from E → **S**. Core 1 receives the line: **S**. Both cores now hold S.
3. **Core 0 writes to X.** Core 0 cannot write a line in state S — it must first acquire exclusive ownership. It broadcasts a **Read For Ownership (RFO)**. Core 1 receives the snoop, transitions its copy from S → **I**. Core 0 transitions from S → **M**.
4. **Core 1 reads X again.** Core 1's line is **I** — unusable. It issues a read. Core 0 must write back its dirty line (or forward it directly via cache-to-cache transfer), then both cores transition: Core 0: M → **S**, Core 1: I → **S**.

The RFO in step 3 is the expensive operation. In a loop where two threads alternate writes, every iteration executes an RFO, paying the full round-trip latency of the interconnect. If both threads are hammering the same line simultaneously, neither makes progress without stalling.

The RFO round-trip latency between two cores on the same socket is roughly:

$$L_{\text{rfo}} \approx 40\text{–}60 \text{ cycles (same socket)}, \quad 200\text{–}400 \text{ cycles (cross-socket)}$$

### False Sharing: Code Example

```c
#include <stdint.h>
#include <pthread.h>
#include <stdio.h>

#define ITERATIONS 100000000UL

/* BAD: counter_a and counter_b share one 64-byte cache line.
   sizeof(uint64_t) * 2 = 16 bytes. Both fit trivially. */
struct shared_bad {
    volatile uint64_t counter_a;   /* written exclusively by thread 0 */
    volatile uint64_t counter_b;   /* written exclusively by thread 1 */
} bad;

/* GOOD: each counter occupies its own cache line.
   Pad to 64 bytes total so the next field starts on a new line. */
struct alignas_line {
    volatile uint64_t value;
    uint8_t           _pad[64 - sizeof(uint64_t)];  /* 56 bytes */
};

struct {
    struct alignas_line a;   /* cache line 0 */
    struct alignas_line b;   /* cache line 1 */
} good;

static_assert(sizeof(struct alignas_line) == 64,
              "padding calculation wrong");

void *thread0_bad(void *arg) {
    for (uint64_t i = 0; i < ITERATIONS; i++) bad.counter_a++;
    return NULL;
}
void *thread1_bad(void *arg) {
    for (uint64_t i = 0; i < ITERATIONS; i++) bad.counter_b++;
    return NULL;
}
void *thread0_good(void *arg) {
    for (uint64_t i = 0; i < ITERATIONS; i++) good.a.value++;
    return NULL;
}
void *thread1_good(void *arg) {
    for (uint64_t i = 0; i < ITERATIONS; i++) good.b.value++;
    return NULL;
}
```

In the bad case, every increment by thread 0 invalidates thread 1's copy and vice versa. In the good case, the two lines are independent — each core holds its line in state M continuously and never issues an RFO.

An alternative when you control alignment at declaration time:

```c
/* GCC/Clang: force struct to start at a 64-byte boundary */
struct counter {
    volatile uint64_t value;
} __attribute__((aligned(64)));

/* In an array: each element is its own cache line */
struct counter per_thread_counters[NUM_THREADS];
```

Without `aligned(64)`, `sizeof(struct counter) == 8`, and consecutive array elements are packed 8 per cache line. With `aligned(64)`, each element occupies a full line.

### Quantifying the Overhead

The effective time per iteration when false sharing is active:

$$T_{\text{iter}} = T_{\text{compute}} + \frac{N_{\text{rfo}}}{N_{\text{iter}}} \cdot L_{\text{rfo}}$$

where $N_{\text{rfo}} / N_{\text{iter}}$ approaches 1 when every iteration triggers an invalidation (the common false-sharing case). For a core running at 3 GHz, with $L_{\text{rfo}} = 60$ cycles (same-socket RFO) and $T_{\text{compute}} = 1$ cycle per increment:

$$T_{\text{iter}} = 1 + 60 = 61 \text{ cycles}, \quad \text{slowdown} \approx 61\times$$

For cross-socket ($L_{\text{rfo}} = 300$ cycles):

$$T_{\text{iter}} = 1 + 300 = 301 \text{ cycles}, \quad \text{slowdown} \approx 301\times$$

This is why false sharing in tight loops is catastrophic, not merely unfortunate.

### Memory Layout Arithmetic

Given a struct with two `uint64_t` fields and a 64-byte cache line, the line occupancy is:

$$\text{fields per line} = \left\lfloor \frac{64}{\text{sizeof}(\text{uint64\_t})} \right\rfloor = \left\lfloor \frac{64}{8} \right\rfloor = 8$$

Eight `uint64_t` counters fit in a single cache line. An array `uint64_t counters[8]` has all elements sharing one line. Any two threads writing to different indices collide. Padding each element to 64 bytes:

$$\text{required padding} = 64 - \text{sizeof}(\text{field}) = 64 - 8 = 56 \text{ bytes}$$

Total struct size becomes $64 \
