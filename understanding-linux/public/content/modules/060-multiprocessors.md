---
id: 60
title: "Multiprocessors"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

When a single processor reads a memory location, the answer is unambiguous. Add a second processor with its own cache, and the same physical address now has multiple live copies — one per L1 cache that loaded it. The moment any core writes, those copies diverge. Without a protocol to manage this, two threads can read the same address and see different values indefinitely. This failure is not theoretical and not rare: it is the default behavior of unsynchronized shared memory, and every SMP kernel, every lock implementation, and every atomic operation exists specifically to fight it.

Beyond coherence, memory access time is non-uniform on multi-socket hardware. A thread on socket 1 accessing memory physically attached to socket 0 crosses an inter-socket interconnect on every miss. That latency penalty is silent, produces no errors, and can cut memory-bound throughput by 30–50%. Understanding NUMA is not optional for anyone writing or tuning software on server hardware.

---

## Core Concepts

### Private Caches Create the Coherence Problem

Each core has its own L1 (and usually L2) cache. When core 0 loads address `0x1000`, the line is fetched into core 0's L1. When core 1 loads the same address, it gets its own copy in its own L1. Both caches hold the data; neither knows the other exists. This is the fundamental problem: the coherence invariant — *at any point, all processors agree on the value of every memory location* — is already broken the moment one copy is modified without notifying the other.

Private caches exist because shared caches serialize access: if every core competed for a single L1, the cache itself would become the bottleneck. The coherence problem is therefore not a design flaw; it is the direct consequence of a necessary performance trade-off.

### Write Serialization

Coherence requires more than eventual visibility — it requires **order**. If P1 writes value `A` and then P2 writes value `B` to the same address, every observer must see the writes in the same sequence. Without a total order on writes to each address, P3 could permanently hold `A` while P4 permanently holds `B`. The two processors would disagree about the current value of the location, and no amount of waiting would resolve it.

Write serialization is the guarantee that this cannot happen. On x86, it is enforced by the cache coherence protocol plus the Total Store Order (TSO) memory model. On ARM, which has a weaker memory model, explicit barrier instructions are required to achieve the same effect.

### MESI: The Standard Coherence Protocol

The dominant mechanism for snooping-based coherence is the **MESI** state machine. Every cache line carries one of four states:

| State | Meaning |
|---|---|
| **M**odified | Dirty; this cache holds the only valid copy. Memory is stale. |
| **E**xclusive | Clean; this cache holds the only copy. Memory is current. |
| **S**hared | Clean; other caches may also hold this line. |
| **I**nvalid | This cache line is unusable and must be fetched before use. |

Each cache **snoops** the interconnect — it monitors all transactions from all other caches. When core 0 issues a write, it broadcasts an invalidation. Every other cache holding that line transitions to Invalid. The next read from any of those caches misses and fetches the updated value from core 0 (or from memory after core 0 writes back). The invalidation happens *before* the write is considered globally visible on strongly-ordered architectures; this is what makes the protocol correct rather than merely eventually consistent.

The E state exists as an optimization: a line in E can be promoted to M on a write without a bus transaction, because no invalidations are needed — no other cache holds a copy. Without E, every write to a freshly loaded private line would require a broadcast.

### Migration and Replication

MESI gives coherent caches two useful behaviors automatically:

- **Migration**: A thread moved to a different core still accesses its data correctly. The first access on the new core misses and pulls the line to the new cache; subsequent accesses are local. The hardware handles relocation transparently.
- **Replication**: Multiple cores reading the same read-only data each hold a local copy in state S. Read bandwidth scales linearly with the number of readers; no core needs to wait for another.

Both properties depend entirely on the coherence protocol being correct. If the protocol drops an invalidation, migration silently returns stale data. This is why hardware vendors invest enormous verification effort in coherence implementations.

### NUMA: Non-Uniform Memory Access

On a single-socket machine, every DRAM access travels the same path: core → L3 → memory controller → DRAM. On a multi-socket machine, each socket has its own memory controller and its own directly attached DRAM. Accessing local DRAM might cost $L_{\text{local}} \approx 80\text{ ns}$. Accessing memory on a remote socket requires crossing the inter-socket fabric — Intel Ultra Path Interconnect (UPI), AMD Infinity Fabric — adding another 40–80 ns. The system presents a single flat virtual address space, but access time depends on which socket owns the physical page.

The NUMA topology is not hidden from software. The kernel, the allocator, and the scheduler can all observe and exploit it — but only if they are configured to do so.

---

## How It Works

### MESI State Transitions in Detail

Consider two cores sharing an interconnect, both starting with a cache line at address `X` in state Invalid.

```
1. Core 0 reads X:
   Transaction: BusRd(X)
   Memory responds with data.
   Core 0: I → E   (no other cache has it; exclusive ownership)

2. Core 1 reads X:
   Transaction: BusRd(X)
   Core 0 snoops the transaction: E → S   (must downgrade; now shared)
   Memory (or core 0) supplies data.
   Core 1: I → S

3. Core 0 writes X:
   Transaction: BusRdX(X)   (read-exclusive upgrade)
   Core 1 snoops: S → I     (invalidated before write completes)
   Core 0: S → M
   Core 1's next read will miss; it fetches core 0's modified value.
```

Step 3 is the critical one. The BusRdX is a **read-for-ownership** transaction: it simultaneously fetches the line (if needed) and invalidates all other copies. The invalidation acknowledgment from core 1 must arrive before core 0's write is considered globally visible. This sequencing is what makes the protocol linearizable.

If many cores hold a line in S and one wants to write, it must collect invalidation acknowledgments from all of them. This is the **invalidation storm** that can occur with high-fan-out sharing, and it is why lock implementations try to minimize the number of cores spinning on the same cache line.

### False Sharing: When Coherence Hurts Performance

MESI operates at **cache line granularity** — 64 bytes on x86. Two logically independent variables that happen to occupy the same cache line will trigger coherence traffic on every write to either variable, even though no actual data sharing occurs.

```c
/* Pathological false sharing: both counters fit in one 64-byte line */
struct {
    long counter_a;  /* written only by core 0 */
    long counter_b;  /* written only by core 1 */
} counters;
```

Core 0 writes `counter_a` → line: Modified on core 0, Invalid on core 1.  
Core 1 writes `counter_b` → must fetch the line from core 0 first, then: Modified on core 1, Invalid on core 0.  
Every write by either core forces a cross-core cache line transfer, even though the cores are writing to disjoint bytes within that line.

The cost is not just an invalidation message; it is a full cache line transfer (64 bytes) across the interconnect for each write, plus the latency of the round trip. Under contention, this can serialize what should be independent operations.

The fix is to place the variables on separate cache lines:

```c
#include <stddef.h>

/* Manual padding */
struct {
    long counter_a;
    char _pad[64 - sizeof(long)];
    long counter_b;
} counters;

/* Or use the kernel macro, which handles architecture differences */
#include <linux/cache.h>

struct {
    long counter_a ____cacheline_aligned_in_smp;
    long counter_b ____cacheline_aligned_in_smp;
} counters;
```

`____cacheline_aligned_in_smp` expands to `__attribute__((aligned(64)))` on SMP builds and to nothing on UP builds, keeping the structure compact when coherence is not an issue.

The address of `counter_b` after padding is:

$$\text{addr}(\texttt{counter\_b}) = \text{addr}(\texttt{counter\_a}) + 64$$

which guarantees they occupy different cache lines since $64 \equiv 0 \pmod{64}$.

### NUMA Access Cost Model

Let $L_{\text{local}}$ be the latency to local memory and $L_{\text{remote}}$ be the latency across the inter-socket interconnect. The **NUMA factor** is:

$$r = \frac{L_{\text{remote}}}{L_{\text{local}}}$$

On a two-socket Intel Xeon system, typical values are $L_{\text{local}} \approx 80\text{ ns}$, $L_{\text{remote}} \approx 140\text{ ns}$, giving $r \approx 1.75$.

For a workload where fraction $f$ of memory accesses are remote:

$$L_{\text{avg}} = (1 - f) \cdot L_{\text{local}} + f \cdot L_{\text{remote}} = L_{\text{local}}\bigl(1 + f(r - 1)\bigr)$$

At $f = 0.5$, $r = 1.75$:

$$L_{\text{avg}} = L_{\text{local}} \cdot (1 + 0.5 \times 0.75) = 1.375 \cdot L_{\text{local}}$$

A 37.5% latency increase with no code changes, no error messages, and no indication in strace or top. For a work
