---
id: 171
title: "NUMA"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to NUMA
NUMA (Non‑Uniform Memory Access) arises when the physical distance between a core and a memory module affects access latency and bandwidth. In a scalable multiprocessor, each socket (or die) integrates a memory controller that owns a *local* memory bank. Accesses to that bank travel only on‑die or across a short on‑package interconnect, yielding low latency (≈ 80‑120 ns on modern Xeon). Accesses to memory attached to a different socket must traverse one or more hops through the inter‑socket fabric (Intel UPI, AMD Infinity Fabric, or CCIX), adding per‑hop latency (≈ 30‑50 ns) and potentially contending for bandwidth. Thus the average memory access time (AMAT) becomes a function of node distance:

\[
\text{AMAT}=t_{\text{local}} + \sum_{i=1}^{h} t_{\text{hop},i} + t_{\text{remote}}
\]

where *h* is the number of interconnect hops and \(t_{\text{remote}}\) is the remote node’s memory controller service time.

### Locality
Programs exhibit **spatial locality** (nearby addresses are accessed together) and **temporal locality** (the same address is reused soon). In NUMA, exploiting locality reduces the *probability* of a remote request because data likely resides in the same node that generated the reference. The benefit is two‑fold:
1. Fewer remote hops → lower latency.
2. Better utilization of the local memory controller’s bandwidth, leaving remote links for other traffic.

### Remote Memory Access
When a core issues a load/store to an address whose home node ≠ its own socket, the request follows this path:
1. Core → local memory controller (LMC).
2. LMC checks its directory; if the line is remote, it forwards a **coherence request** over the interconnect.
3. Remote node’s memory controller (RMC) services the request, obtains the data from its DRAM, and returns it (possibly after a cache‑to‑cache transfer if the line is dirty in another core’s cache).
4. Data travels back to the requesting core’s LMC and then to the core.

Each hop adds a fixed pipeline latency and consumes link bandwidth. The total cost can be expressed as:

\[
L_{\text{remote}} = L_{\text{LMC}} + h \cdot (L_{\text{link}} + L_{\text{router}}) + L_{\text{RMC}} + L_{\text{return}}
\]

Typical values on a 2‑socket Xeon Scalable platform: \(L_{\text{LMC}}≈30\) ns, \(L_{\text{link}}≈10\) ns, \(L_{\text{router}}≈5\) ns, \(L_{\text{RMC}}≈30\) ns, giving ≈ 110 ns for one‑hop remote access versus ≈ 70 ns for local.

### Placement
*Placement* is the OS/hardware policy that decides **where** a page of memory is allocated (which node) and **where** a thread runs (which core). The objective is to minimize the expected remote‑access probability:

\[
P_{\text{remote}} = 1 - \sum_{n} \bigl( \frac{\text{pages}_n}{\text{total pages}} \cdot \frac{\text{threads}_n}{\text{total threads}} \bigr)
\]

Effective placement drives \(P_{\text{remote}}\) toward zero, maximizing local bandwidth and minimizing latency. Linux provides three mechanisms:
* **Task affinity** (`sched_setaffinity`, `numactl --cpunodebind`) binds threads to cores/nodes.
* **Memory policy** (`mbind`, `set_mempol`, `numactl --membind`) dictates on which node pages are allocated.
* **First‑touch policy** (default): the page is allocated on the node where it is first written.

---

## How It Works
### Memory Node Mapping
The physical address space is divided into equal‑sized *nodes*. Given a node size \(S\) (usually a power of two), the node ID for an address \(A\) is:

\[
\text{node}(A) = \left\lfloor \frac{A}{S} \right\rfloor \bmod N
\]

where \(N\) is the number of nodes. On Linux, the node size can be read from `/sys/devices/system/node/node0/meminfo` (look for `MemTotal`). For a 2‑node system with 64 GiB total RAM, each node is 32 GiB → \(S = 2^{35}\) bytes, shift = 35.

### Step‑by‑Step Access (Local)
1. **Address translation** – MMU walks page tables → yields physical address \(P\).
2. **Node check** – Memory controller extracts node ID via the shift above; if node = local node, proceed.
3. **Row activation** – MC issues RAS/CAS to the local DIMM.
4. **Data transfer** – 64‑byte cache line moved from DRAM to MC’s read return buffer, then across the core‑to‑MC internal bus (≈ 10 ns).
5. **Core receives data** – Load completes.

Latency ≈ \(t_{\text{RAS}} + t_{\text{CAS}} + t_{\text{bus}}\) ≈ 70‑90 ns.

### Step‑by‑Step Access (Remote, 1‑hop)
Steps 1‑2 as above, but node ID ≠ local node → MC forwards request:
3. **Interconnect packet** – MC creates a *ReadReq* flit (source node ID, target node ID, address). Sent over UPI/IF link.
4. **Link traversal** – Each hop incurs serializer/deserializer (SerDes) latency + pipeline ≈ 10‑15 ns.
5. **Remote MC** – Remote node’s MC receives packet, checks its directory, activates local row, reads data.
6. **Return packet** – Data (or forward‑ed cached copy) packed into a *ReadResp* flit and sent back.
7. **Local MC** – Receives response, forwards to core.
8. **Core** – Completes load.

Total latency = local MC overhead + (hops × link latency) + remote MC overhead + return path. With one hop, this is typically 100‑130 ns; two hops (e.g., 4‑socket ring) can exceed 200 ns.

### Coherence Considerations
If the line is **Modified** in another core’s cache on the remote node, the remote MC must first issue an *Invalidate* to that core, wait for the *Data* response, then send the data to the requester. This adds a **cache‑to‑cache transfer** latency (~30‑50 ns) but avoids a DRAM round‑trip.

---

## Worked Examples
### Example 1: Local Memory Access – Timing
Assume a Xeon Gold 6230 (2.1 GHz, 2 sockets, each socket = a NUMA node). Node size = 16 GiB (shift = 34).  
We allocate an array `a[1024]` on node 0 and bind the thread to node 0.

```c
#define _GNU_SOURCE
#include <numa.h>
#include <stdio.h>
#include <stdint.h>
#include <x86intrin.h>

int main() {
    if (numa_available() < 0) return 1;
    // Allocate on node 0
    void *ptr = numa_alloc_onnode(1024 * sizeof(int), 0);
    if (!ptr) return 1;
    int *a = ptr;

    // Warm‑up
    for (int i = 0; i < 1024; ++i) a[i] = i;

    uint64_t t0 = __rdtsc();
    volatile int sink = a[512];   // single load
    uint64_t t1 = __rdtsc();
    printf("Load cycles: %lu\n", t1 - t0);
    numa_free(ptr, 1024 * sizeof(int));
    return 0;
}
```

*Why this works*:  
- `numa_alloc_onnode` calls `mbind` with `MPOL_BIND` → pages allocated on node 0.  
- `numactl --cpunodebind=0 --membind=0 ./a.out` (or the program’s own bind) guarantees the thread runs on node 0.  
- The load hits the local MC; measured cycles ≈ 150‑180 cycles (≈ 70‑85 ns at 2.1 GHz), matching the local latency model.

### Example 2: Remote Memory Access – Timing
Same binary, but we bind the thread to node 0 while allocating on node 1:

```bash
numactl --cpunodebind=0 --membind=1 ./a.out
```

**Expected result**: Load cycles ≈ 260‑300 cycles (≈ 120‑140 ns).  
Derivation:  
- Local MC overhead ≈ 30 ns.  
- One UPI hop: link ≈ 10 ns + router ≈ 5 ns each way → 30 ns round‑trip.  
- Remote MC service ≈ 30 ns.  
- Total ≈ 120 ns → 250 cycles.

If we run on a 4‑socket ring and place the thread on socket 0, memory on socket 2 (two hops), latency roughly doubles: ≈ 460 cycles (~ 220 ns).

### Example 3: Placement Impact on Page Faults
We allocate a large buffer, touch it in a round‑robin fashion, and compare NUMA‑aware vs. ignorant placement.

```c
#include <numa.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#define SIZE (1024UL*1024*1024) // 1 GiB

int main() {
    // Ignorant allocation (default first‑touch on node where thread runs)
    void *ptr1 = malloc(SIZE);
    // NUMA‑aware allocation: spread evenly across nodes
    void *ptr2 = numa_alloc_interleaved(SIZE);

    // Touch every page
    for (size_t i = 0; i < SIZE; i += sysconf(_SC_PAGESIZE)) {
        ((char *)ptr1)[i] = 0;
        ((char *)ptr2)[i] = 0;
    }

    // Show numa stats
    system("numastat -c");
    free(ptr1);
    numa_free(ptr2, SIZE);
    return 0;
}
```

Compile and run:

```bash
gcc -O2 -lnuma placement.c -o placement
numactl --interleave=all ./placement   # forces interleaved placement for malloc as well
```

**Observation**:  
- With default placement, `numastat` shows a high `numa_hit` on the node where the thread runs and elevated `numa_miss` on other nodes → more remote traffic.  
- With interleaved allocation, hits are evenly distributed, reducing `numa_miss` by ~50 % and lowering overall latency (measured via `perf stat -e cycles,instructions`).

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Hurts Performance |
|---|---|---|
| **Using plain `malloc` for large buffers on NUMA systems** | `malloc` follows the *first‑touch* policy: pages are allocated on the node where the thread first writes. If the allocating thread later migrates (or other threads touch the buffer), pages may end up remote. | Causes a high proportion of remote accesses → increased latency and saturated inter‑socket links. |
| **Assuming `numactl --membind=0` alone binds memory** | `--membind` only affects *future* allocations; existing memory (e.g., static data, libraries) remains where it was placed. | Leads to a mix of local and remote pages, unpredictably varying latency. |
| **Ignoring the kernel’s `zone_reclaim_mode`** | The kernel may reclaim clean pages from a node when it’s low on free memory, potentially moving them to another node. | Can cause unexpected remote accesses after a memory‑pressure event; workloads that expect stable placement see jitter. |
| **Binding threads to cores but forgetting to bind memory** | Thread affinity (`taskset`/`sched_setaffinity`) does not change where pages live. | Threads may run locally but still fetch data from remote nodes, wasting the affinity effort. |
| **Using huge pages without specifying a node** | Transparent Huge Pages (THP) are allocated on the node of the faulting thread; if the thread migrates, the huge page may become remote. | Huge pages reduce TLB misses but increase remote penalty when misplaced. |
| **Over‑subscribing a node (more threads than cores)** | Exceeding core count causes scheduler to time‑share cores, increasing cache contention and possibly forcing migrations. | More context switches → higher chance of remote page faults and degraded memory bandwidth utilization. |
| **Neglecting NUMA‑aware schedulers (e.g., `sched_numa_balancing`)** | The balancer may move tasks to improve cache locality but can inadvertently increase remote memory traffic if not tuned. | Blind reliance on the balancer can worsen performance for memory‑intensive workloads. |

---

## Exercises
### Easy
1. **Local vs remote latency measurement**  
   Write a C program that allocates two buffers: one with `numa_alloc_onnode(0)`, the other with `numa_alloc_onnode(1)`. Bind the thread to node 0, repeatedly read a random element from each buffer, and use `rdtsc` to compute average cycles. Report the ratio.

2. **Numastat observation**  
   Run `numastat` before and after executing a memory‑intensive workload (e.g., `stress-ng --vm 2 --vm-bytes 2G`). Identify which `numa_*` counters changed and explain what they indicate about remote traffic.

### Medium
3. **Placement policy experiment**  
   Implement a program that allocates a 512 MiB buffer using three policies: default (`malloc`), `MPOL_BIND` to node 0, and `MPOL_INTERLEAVE`. For each policy, touch the buffer sequentially and measure elapsed time with `clock_gettime(CLOCK_MONOTONIC)`. Run the test with the thread bound to each node (`numactl --cpunodebind=X`) and discuss the results.

4. **False sharing across NUMA nodes**  
   Create an array of 64‑byte structs, each containing an `int counter`. Have `N` threads (where `N` = number of cores) each increment its own counter. First, allocate the array with default placement; second, allocate with `numa_alloc_onnode` per thread. Measure throughput (increments per second). Explain any difference.

### Hard
5. **NUMA‑aware memory allocator benchmark**  
   Develop a simple slab allocator that obtains memory via `numa_alloc_onnode` and serves objects of a fixed size. Compare its allocation/deallocation latency and fragmentation against `jemalloc` and `tcmalloc` on a 2‑socket system under a multi‑threaded allocation workload (e.g., 16 threads repeatedly allocating/freeing 64‑byte objects). Use `perf` to record cache‑miss and remote‑access metrics (`offcore_response.all_data_rd.l3_miss.local_dram` etc.).

6. **Kernel tuning impact**  
   On a test machine, set `/proc/sys/kernel/numa_balancing` to 0 and 1, and `/proc/sys/vm/zone_reclaim_mode` to 0, 1, 2. Run a memory‑bandwidth benchmark (e.g., `stream`) under each configuration. Plot bandwidth vs. configuration and provide a rationale for the observed changes.

All exercises should be runnable on a modern x86_64 Linux machine with `numactl`, `libnuma-dev`, and build tools installed.

---

## Linux Connection
### Subsystems and Files
* **`/sys/devices/system/node/`** – one directory per NUMA node (`node0`, `node1`, …). Each contains:
  * `meminfo` – total/free memory on that node.
  * `distance` – latency matrix (in cycles) between nodes.
  * `cpumask` – CPUs belonging to the node.
* **`/proc/<pid>/numa_maps`** – per‑process page placement showing which node backs each virtual address range.
* **`/sys/kernel/mm/transparent_hugepage/`** – controls THP behavior (enabled/defrag).
* **`/proc/sys/kernel/numa_balancing`** – enables/disables automatic NUMA balancing.
* **`/proc/sys/vm/zone_reclaim_mode** – controls reclaim clean pages from a node when low on free memory.

### Core Tools
| Tool | Purpose | Example Usage |
|------|---------|---------------|
| `numactl` | Policy enforcement for CPU and memory binding | `numactl --cpunodebind=1 --membind=0 ./myapp` |
| `lscpu` | Overview of topology (sockets, cores, threads, node layout) | `lscpu | grep -i numa` |
| `lstopo` (hwloc) | Graphical/textual topology showing caches, sockets, NUMA nodes | `lstopo-no-graphics` |
| `numastat` | Global and per‑process NUMA statistics (hits, misses, foreign) | `numastat -p $(pidof mysqld)` |
| `set_mempol` / `mbind` (via `libnuma`) | Fine‑grained memory policy per VMA | `mbind(addr, len, MPOL_BIND, nodemask, maxnode, 0)` |
| `get_mempol` | Query current policy of an address | `get_mempol(&policy, &nodemask, maxnode, addr, 0)` |
| `migrate_pages` | Move pages of a process to another node (requires CAP_SYS_NICE) | `migrate_pages(pid, 0, 1, &old_nodemask, &new_nodemask)` |
| `perf` | Hardware counters for remote/local memory accesses | `perf stat -e offcore_response.all_data_rd.l3_miss.local_dram,offcore_response.all_data_rd.l3_miss.remote_dram ./app` |
| `vcgencmd` (ARM) or `pcm` (Intel) | Low‑latency bandwidth/latenchy measurements | `pcm` |

### Runnable Shell Commands
```bash
# 1. Show NUMA topology
lscpu | grep -i numa
# Output example:
# NUMA node(s):        2
# NUMA node0 CPU(s):   0-7
# NUMA node1 CPU(s):   8-15

# 2. Display memory per node
cat /sys/devices/system/node/node0/meminfo
cat /sys/devices/system/node/node1/meminfo

# 3. Run a program bound to node 1 for CPU, node 0 for memory
numactl --cpunodebind=1 --membind=0 ./latency_test

# 4. Flush and show NUMA stats before/after a workload
numastat > before.txt
stress-ng --vm 4 --vm-bytes 1G --timeout 10s
numastat > after.txt
diff -u before.txt after.txt

# 5. Bind a running process to a specific node (requires its PID)
pid=$(pidof mylongrun)
numactl --pid=$pid --cpunodebind=0 --membind=0 true   # rebinds via /proc/pid/set_*
# Equivalent using taskset + mbind:
taskset -c 0-7 numactl --membind=0 --pid=$pid true

# 6. Allocate huge page on a specific node (requires hugetlbfs mount)
mkdir -p /mnt/huge
mount -t hugetlbfs nodev /mnt/huge
echo 2 > /proc/sys/vm/nr_hugepages   # reserve 2 huge pages globally
# Allocate on node 1:
dd if=/dev/zero of=/mnt/huge/hugefile bs=2M count=1 oflag=direct conv=fdatasync \
  && echo "File created" && \
  numactl --membind=1 -- cp /mnt/huge/hugefile /mnt/huge/hugefile.copy
# Verify placement:
cat /proc/$(pidof dd)/numa_maps | grep hugefile
```

### Kernel‑Aware Programming Snippets
```c
/* Bind current thread to node 2's CPUs */
cpu_set_t set;
CPU_ZERO(&set);
for (int c = numa_node_to_cpus(2, NULL); c < numa_node_to_cpus(2, NULL)+8; ++c)
    CPU_SET(c, &set);
sched_setaffinity(0, sizeof(set), &set);

/* Allocate 4 MiB on node 1 using libnuma */
void *buf = numa_alloc_onnode(4*1024*1024, 1);
if (!buf) perror("numa_alloc_onnode");

/* Set policy of an existing VMA to interleave */
unsigned long nodemask = NUMA_NO_NODE; /* special value for interleave */
if (mbind(buf, 4*1024*1024, MPOL_INTERLEAVE, &nodemask, 1, 0) < 0)
    perror("mbind");

/* Retrieve current policy */
int policy;
unsigned long mask[NUMA_NO_NODE/ (8*sizeof(unsigned long))];
if (get_mempol(&policy, mask, sizeof(mask), buf, 0) < 0)
    perror("get_mempol");
```

---

## Why This Matters
NUMA is not an academic curiosity; it is the dominant memory architecture in every modern server, workstation, and many high‑end desktops. Ignoring its non‑uniform nature leads to:
* **Unpredictable latency spikes** – remote accesses can double or triple load‑to‑use latency, causing tail‑latency violations in latency‑sensitive services (databases, financial trading, real‑time analytics).
* **Under‑utilized bandwidth** – inter‑socket links become saturated while local memory controllers sit idle, limiting scalable performance of memory‑bound workloads (scientific simulations, machine‑learning training, in‑memory analytics).
* **Inefficient power usage** – unnecessary data movement across links consumes extra energy, raising operational costs in data centers.
* **Complex debugging** – performance problems appear only under certain core/memory affinities, making them hard to reproduce without NUMA‑aware tooling.

By mastering the concepts presented—*how node distance translates into latency, how placement policies shape traffic, and how Linux exposes and controls these mechanisms*—you gain the ability to:
* **Design data structures** that align with node boundaries (e.g., per‑node hash tables, node‑local work queues).
* **Tune the OS and runtime** (via `numactl`, `mbind`, `sysctl`) to match the workload’s access pattern.
* **Leverage hardware counters** (`perf`, `pcm`) to verify that optimizations actually reduce remote traffic.
* **Build portable, high‑performance software** that scales from a laptop to a 4‑socket Xeon
