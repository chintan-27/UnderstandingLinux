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

## Core Concepts
### Multiprocessor Taxonomy and Interconnects
A multiprocessor system couples *N* processing cores via an interconnect that determines how memory references travel. The three classic classifications are:

| Class | Memory Access | Typical Interconnect | Scalability Limitation |
|-------|---------------|----------------------|------------------------|
| UMA (Uniform Memory Access) | All cores see identical latency & bandwidth to any address | Shared bus, crossbar, or early mesh | Bus contention limits *O(N)* bandwidth |
| NUMA (Non‑Uniform Memory Access) | Each core has *local* memory with low latency; remote memory incurs higher latency & lower bandwidth | Point‑to‑point links (Intel QPI/UPI, AMD Infinity Fabric), hierarchical mesh | Remote‑access penalty grows with hop count |
| COMA (Cache‑Only Memory Architecture) | Main memory is distributed as caches; no backing DRAM per node | Same as NUMA but requires coherence to maintain a global view | Directory size scales with total cache capacity |

The choice of interconnect directly influences **latency** (*L*) and **bandwidth** (*B*) seen by a core. For a simple bus, the effective bandwidth per core is *B/N* because every transaction occupies the bus; a crossbar can provide *B* per port, scaling linearly with *N* until the switch fabric saturates.

### Why Private Caches Create a Coherence Problem
Each core typically possesses a private L1 (and often L2) cache to reduce average memory‑access time:
\[
\text{AMAT}= \underbrace{t_{hit}}_{\text{cache hit}} + m \cdot t_{miss},
\]
where *m* is the miss rate. When two cores cache the same memory line, a write by one core leaves the other with a **stale copy** unless the system propagates the update or invalidates the other copy.  

**Coherence** requires two properties:

1. **Write Propagation (or Invalidation)** – After a write, any subsequent read of that address must return the written value.
2. **Write Serialization** – Writes to the same location must appear in a single total order to all observers.

If either property fails, programs observing shared data can see impossible values (e.g., a read‑modify‑write loop diverging).

### Snooping vs. Directory‑Based Coherence: First‑Principle Rationale
Both approaches solve the same problem but trade **communication overhead** against **state storage**.

* **Snooping** – Every core watches a *shared broadcast medium* (bus or equivalent). On a write, the core issues a *BusRdX* (read‑exclusive) transaction; all snoopers check their caches and, if they hold the line, either supply data (if in Shared state) or invalidate (if in Modified/Exclusive).  
  *Why it works*: The broadcast guarantees that **all** cores see the request, so the invalidation/replacement is guaranteed to reach every possible holder.  
  *Cost*: Each coherence transaction generates *O(N)* bus traffic, limiting scalability.

* **Directory‑Based** – A *directory* (often distributed in hardware) records, for each memory block, the set of cores that may hold a copy (a *sharer vector*). On a write, the requesting core sends a message to the directory; the directory then sends point‑to‑point invalidations only to the current sharers.  
  *Why it works*: The directory knows **exactly** who might have a stale copy, so it can target invalidations without broadcasting to uninterested cores.  
  *Cost*: Storage grows as *O(M·S)* where *M* is the number of memory blocks and *S* is the directory entry size (typically a few bits per core). The protocol incurs extra latency for the directory round‑trip but scales to hundreds of cores.

### NUMA: Quantifying the Non‑Uniformity
Let *Lₗ* be the latency to access local memory and *Lᵣ* the latency to remote memory ( *Lᵣ* > *Lₗ* ). If a fraction *p* of a program’s memory references go to remote nodes, the **average memory‑access time** is:
\[
\text{AMAT}_{\text{NUMA}} = (1-p)\,L_{L} + p\,L_{R}.
\]
Because *Lᵣ* can be 2–3× *Lₗ* on modern Xeon/EPYC sockets, even a modest *p* = 0.2 can increase AMAT by 20‑40 %. Moreover, remote traffic consumes inter‑socket link bandwidth, which can become saturated before local bandwidth is exhausted.

### Inter‑Socket Behavior: Beyond Simple Latency
When a core modifies a cache line that is shared across sockets, the coherence protocol triggers **cross‑socket traffic**:

* **Read‑Ownership (BusRdX)** – transfers the line in Modified state to the requester, invalidating all other copies.
* **Read‑Shared (BusRd)** – supplies data if the line is clean in another socket; otherwise triggers a memory read.
* **Write‑Back** – occurs when a Modified line is evicted; the data must be sent to the home node (or directly to a requester).

These transfers consume **inter‑socket link bandwidth** (*Bₗₐₙₖ*). If many cores repeatedly invalidate the same line (false sharing), the effective bandwidth per core can drop dramatically, turning a compute‑bound problem into a **coherence‑bound** one.

---

## How It Works
### MESI Snooping Protocol – Step‑by‑Step
The MESI (Modified, Exclusive, Shared, Invalid) protocol uses four states per cache line. Below is the state‑transition table for a write‑invalidate snooping bus (signals in **bold**):

| Current State | CPU Action | Bus Signal | New State | Action Taken |
|---------------|------------|------------|-----------|--------------|
| **M** (Modified) | Local write | — | M | Write locally; no bus traffic |
| **E** (Exclusive) | Local write | — | M | Write locally; line becomes Modified |
| **S** (Shared) | Local write | **BusRdX** | M | Invalidate all other caches (they see BusRdX and go to I); acquire ownership |
| **I** (Invalid) | Local read miss | **BusRd** | S/E | If another cache has line in E/S, it supplies data (S); else memory supplies (E). |
| **I** (Invalid) | Local write miss | **BusRdX** | M | Invalidate all others; acquire line from memory or another cache (if any has it in E/S). |

**Why the BusRdX is necessary**: A write requires exclusive ownership because any other cached copy would become stale. The BusRdX signal tells every snooper: “I intend to write; if you have this line, either give me the latest data (if you are in E/S) or invalidate your copy.” The bus guarantees that *all* cores observe the signal, thus satisfying write propagation.

### Directory‑Based Protocol – Step‑by‑Step (Hierarchical Directory)
Assume a *sparse directory* where each memory block has a *home node* (the node where the memory physically resides) and a sharer bit‑vector.

1. **Read Miss (CPU i)** → sends *ReadReq* to home node *H*.  
2. **Directory at H** checks sharer vector:  
   - If vector = 0 (no sharers): returns data from memory, sets bit *i*.  
   - If vector ≠ 0: forwards data from the owner (if any) or memory, adds *i* to vector, returns data.  
3. **Write Miss (CPU i)** → sends *ReadExReq* to *H*.  
4. **Directory** sends *Invalidate* to each current sharer *j* (from vector).  
5. Each sharer *j* replies with *InvAck* after invalidating its cache line (state → I).  
6. After all *InvAcks* received, directory grants *ReadExResp* (data if needed) to *i*, sets vector = {i}, marks line as *Modified* in the directory state.  
7. CPU *i* performs the write locally.

**Why point‑to‑point invalidations scale**: The number of messages per write is *2·|S| + 2* (request + response per sharer + request/response to directory). If the average sharer count |S| ≪ *N*, the protocol avoids the *O(N)* broadcast cost of snooping.

### Quantitative Comparison
For a system with *N* cores and average sharer count *s*:

| Protocol | Messages per Write | Bandwidth per Write (flits) | Storage Overhead |
|----------|-------------------|----------------------------|------------------|
| Snooping (bus) | 1 broadcast + up to *N‑1* invalidations (implicit) | ≈ *C* (where *C* = cache line size) + arbitration overhead | None (states per line) |
| Directory | 2 (sReq + sResp) + 2·*s* (inval + ack) + 2 (grant + data) | ≈ (2 + 4·*s*)·*C* | *S* bits per line (sharer vector) + state bits |

When *s* ≪ *N/2*, directory wins; when *s* ≈ *N* (e.g., widely shared read‑only data), snooping may be cheaper because the directory must still send many invalidations.

---

## Worked Examples
### Example 1: MESI Snooping with Two Cores (P0, P1)
Assume cache line size = 64 B, initial address 0x1000 contains value 0. Both cores have the line in **Exclusive** (E) state after a private read.

| Step | Action (CPU) | Bus Signal | P0 State | P1 State | Memory Value | Comments |
|------|--------------|------------|----------|----------|--------------|----------|
| 0 | – | – | E | E | 0 | Both have clean exclusive copies. |
| 1 | P0 writes 0x1000 ← 5 | **BusRdX** | M | I | 0 (stale) | P1 sees BusRdX, invalidates (I). P0 becomes Modified. |
| 2 | P1 reads 0x1000 | **BusRd** | M | S | 5 | P0 intervenes, supplies data (5) and drops to Shared. |
| 3 | P1 writes 0x1000 ← 9 | **BusRdX** | I | M | 5 (stale) | P0 sees BusRdX, invalidates (I). P1 becomes Modified. |
| 4 | P0 reads 0x1000 | **BusRd** | S | M | 9 | P1 supplies data (9), drops to Shared. |

*Timing*: Assume each bus transaction occupies 1 bus cycle and the bus can transfer one 64‑B line per cycle. The sequence took **4 cycles**; note that each write induced a bus transaction, even though the core could have completed the write locally after acquiring ownership.

### Example 2: Directory‑Based Protocol with Four Nodes (N0–N3)
Memory block 0x2000 resides in node N0 (home). Directory entry: *sharer_vec* = 0b0000, *state* = *Uncached*. All cores start with the line invalid.

| Step | Action (CPU) | Message | Directory Update | Sharer Vec | Owner Node | Comments |
|------|--------------|---------|------------------|------------|------------|----------|
| 0 | N2 read miss | ReadReq → N0 | state←Shared, vec←0010 (bit 2 set) | 0010 | N0 (memory) | N0 supplies data from memory. |
| 1 | N3 read miss | ReadReq → N0 | vec←1010 (bits 2 & 3) | 1010 | N0 | N0 supplies data; N2 & N3 now Shared. |
| 2 | N1 write miss | ReadExReq → N0 | Send Inv to N2,N3; wait for Ack | — | — | N0 awaits invalidations. |
| 3 | N2 invalidate | Inv from N0 | N2 sends InvAck | — | — | N2 state→I. |
| 4 | N3 invalidate | Inv from N0 | N3 sends InvAck | — | — | N3 state→I. |
| 5 | N0 receives both Ack | — | state←Modified, vec←0100 (bit 1) | 0100 | N1 (owner) | N0 forwards latest data (if any) to N1. |
| 6 | N1 writes locally | — | — | 0100 | N1 | N1 now holds Modified copy. |
| 7 | N0 read miss | ReadReq → N0 | Owner N1 supplies data; state←Shared, vec←0011 (bits 0 & 1) | 0011 | N0 (memory) | N0 now Shared; N1 remains Shared. |

*Latency*: Assume each hop (core→local controller→interconnect→remote controller) adds 50 ns, and the interconnect latency per hop is 100 ns. A read miss that goes to home node and returns costs roughly 2 × (50 + 100 + 50) = 400 ns. A write miss adds invalidation rounds: two invokes (N0→N2, N0→N3) + two acks = 4 × (50 + 100 + 50) = 800 ns, plus the data forward (another 400 ns) → ~1.2 µs total. This demonstrates why directory protocols trade latency for scalability.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Understanding |
|---|---------|----------------|-----------------------|
| 1 | **“Cache coherence is free; hardware handles it automatically.”** | Coherence consumes bandwidth and latency; excessive invalidations can saturate interconnects and stall cores. | Quantify coherence traffic (messages per write) and measure with hardware counters (e.g., `OFFCORE_RESPONSE`). |
| 2 | **“False sharing only matters if the same variable is written.”** | Even read‑only sharing can cause unnecessary invalidations when a core evicts a line due to capacity pressure, forcing a refetch. | Align data to cache‑line boundaries and pad structures; use `pthread_getspecific` or per‑thread buffers to avoid shared lines. |
| 3 | **“Directory protocols eliminate all broadcast traffic.”** | They still need broadcast for *directory misses* (e.g., when a block has never been cached) and for *eviction‑writebacks* that may need to update the home node. | Recognize that directory traffic scales with sharer count, not core count, but is not zero. |
| 4 | **“NUMA performance penalty is only about latency; bandwidth is irrelevant.”** | Remote accesses also consume limited inter‑socket bandwidth; saturating this bandwidth hurts all remote traffic, increasing effective latency. | Use `numastat` and `perf stat -e offcore_response.all_data_rd.l3_miss.remote_dram` to detect bandwidth saturation. |
| 5 | **“All cores see the same cache line size, so padding to 64 B is enough.”** | Some architectures have non‑power‑of‑two line sizes (e.g., 128 B on certain IBM Power chips) or split‑line L1 caches. | Query `cpuid` or `lscpu --caches` to obtain actual line size per cache level. |
| 6 | **“Increasing the number of cores always improves parallel speed‑up.”** | Beyond a point, coherence overhead (invalidations, directory lookups) grows faster than useful work, leading to negative scaling. | Apply the universal scalability law: \(S(N) = \frac{N}{1 + \alpha(N-1) + \beta N(N-1)}\) where α is contention and β is coherency delay. |

---

## Exercises
### 1. Easy – Detect False Sharing
**Goal**: Observe performance degradation when two threads increment adjacent counters that share a cache line.

```c
/* false_sharing.c */
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <unistd.h>

#define NITER 100000000L
#define PAD 64   /* cache line size */

struct counter {
    volatile uint64_t value;
    uint8_t pad[PAD - sizeof(uint64_t)];
};

struct counter c1, c2;   /* placed adjacently by compiler */

void *inc(void *arg) {
    struct counter *c = arg;
    for (uint64_t i = 0; i < NITER; ++i)
        c->value++;       /* non‑atomic for simplicity */
    return NULL;
}

int main(void) {
    pthread_t t1, t2;
    pthread_create(&t1, NULL, inc, &c1);
    pthread_create(&t2, NULL, inc, &c2);
    pthread_join(t1, NULL);
    pthread_join(t2, NULL);
    printf("c1=%lu c2=%lu\n", c1.value, c2.value);
    return 0;
}
```
*Compile*: `gcc -O2 -march=native -pthread false_sharing.c -o false_sharing`  
*Run*: `./false_sharing` and time with `time`.  
*Experiment*: Change `PAD` to 0 (no padding) and observe the slowdown due to false sharing. Verify with `perf stat -e cache-misses,cache-references ./false_sharing`.

### 2. Medium – Simulate a Snooping Bus in Software
Implement a simple lock‑step simulator where each core maintains a cache line state (M/E/S/I) and communicates via a shared message queue representing the bus.

*Requirements*:
- Use POSIX message queues (`mq_open`, `mq_send`, `mq_receive`).
- Each core thread issues random reads/writes to a shared address space.
- On a write, the core sends a `BUS_RDX` message; all other threads, upon receiving it, check their local state and invalidate if needed.
- Track and print the total number of bus transactions per operation.
- Verify that after any sequence, all cores that hold the line report the same value (or Invalid).

*Hint*: Use a struct `{enum {RD,RDX,DATA} type; uint64_t addr; uint64_t data;}` for messages.

### 3. Hard – Build a User‑Level Directory Coordination Library
Create a library that mimics a sparse directory using `mmap`ed shared memory and Linux futexes for synchronization.

*Steps*:
1. Allocate a shared memory region (`shmget`/`mmap`) containing an array of directory entries: each entry holds a 64‑bit sharer bitmap (supports up to 64 cores) and a 2‑bit state field.
2. Provide functions:
   - `dir_read(core_id, addr)` → returns value, updates sharer bitmap, handles state transitions.
   - `dir_write(core_id, addr, value)` → sends invalidation futex calls to all cores indicated in the bitmap, waits for acknowledgments via futex, then updates the line.
3. Use `pthread_barrier` to synchronize start of a parallel workload (e.g., parallel matrix multiply) that accesses a shared buffer through the directory API.
4. Compare performance against a baseline using plain `mmap` without coherence (i.e., each core gets a private copy) and against Linux’s native NUMA allocation (`numa_alloc_onnode`).  
   Measure with `clock_gettime(CLOCK_MONOTONIC, ...)` and collect hardware counters via `perf`.

*Deliverable*: A short report (<2 pages) showing scalability trends as core count increases from 2 to 64 (simulate by spawning that many threads) and discuss where the directory overhead overtakes the gains.

---

## Linux Connection
### Subsystems and Files Relevant to Multiprocessor Behavior
| Subsystem | Path / Interface | What It Exposes | Typical Use |
|-----------|------------------|-----------------|-------------|
| CPU topology | `/sys/devices/system/cpu/cpu<N>/cache/index<*>/shared_cpu_map` | Bitmask of cores sharing each cache level (L1, L2, L3) | Determine false‑sharing risk |
| NUMA nodes | `/sys/devices/system/node/node<N>/` | `meminfo`, `cpulist`, `distance` (latency matrix) | Identify local vs. remote memory |
| Memory allocator | `libnuma` (`numa.h`) | `numa_alloc_onnode`, `numa_free`, `numa_move_page` | Allocate/free memory on a specific node |
| Process NUMA placement | `/proc/<pid>/numa_maps` | Per‑vma page location (node) and hint | Verify where a program’s pages reside |
| Kernel tracing | `/sys/kernel/debug/tracing` (trace events) | `mem_page_alloc`, `mm_page_pgret`, `x86_mce` | Observe page migration and memory errors |
| Performance counters | `perf` | `OFFCORE_RESPONSE`, `LLC_LOAD_MISSES.REMOTE_HIT`, `CYCLE_ACTIVITY.STALLS_L3_MISS` | Measure coherence and remote‑access penalties |

### Concrete Commands
```bash
# 1. Show CPU cache topology (shared L3 across sockets)
lscpu --caches

# 2. List NUMA nodes and their memory
numactl --hardware

# 3. View distance matrix (latency in cycles) between nodes
cat /sys/devices/system/node/node0/distance   # row for node0
# Example output:
# 0  10  20
# 10 0   15
# 20 15 0

# 4. Allocate a 1 GiB buffer on node 1 and touch it
numactl --membind=1 -- cpulist=0-3 \
    dd if=/dev/zero of=/tmp/numa_test bs=1M count=1
