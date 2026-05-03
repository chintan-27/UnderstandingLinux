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

## Why This Matters

A program that runs correctly can still run **2–3× slower** depending on which DIMM slot holds its data relative to the executing core. On a 2-socket server, a cache line fetched from the remote socket crosses an inter-socket interconnect (Intel UPI, AMD Infinity Fabric) and costs roughly 140 ns instead of 80 ns — a 75% latency penalty per access. For bandwidth-bound workloads, the penalty compounds: the interconnect is a shared, narrower pipe, so aggregate remote bandwidth is a fraction of local bandwidth even when latency is tolerable. The kernel's memory allocator and the thread scheduler operate independently by default, so a thread silently migrates to a different socket while all its data remains on the original one. There is no warning, no error, no correctness failure — just silent throughput collapse.

---

## Core Concepts

### What "Non-Uniform" Means

In a single-socket machine every core shares one memory controller and one set of DIMMs, so all RAM is equidistant. In a multi-socket machine each socket has its own memory controller. A core on socket 0 accessing an address whose physical page is attached to socket 1's controller must:

1. Detect a miss at every local cache level (L1 → L2 → L3 — all on-chip, fast)
2. Emit the request over the inter-socket interconnect
3. Wait for socket 1's controller to read from its DRAM and return the cache line

The instruction set is oblivious to this. A `mov rax, [rcx]` executes identically regardless of where the physical page lives — only the stall duration differs.

### NUMA Nodes

The OS groups the hardware into **NUMA nodes**. Each node is one socket containing:

- A set of CPU cores (with private L1/L2 and shared L3)
- One memory controller
- The DIMMs attached to that controller

The kernel discovers this topology at boot from the ACPI **SRAT** (System Resource Affinity Table), which maps physical address ranges to nodes. Each range is owned by exactly one node; the entire physical address space is the union of all ranges.

### The Distance Matrix

Not all remote accesses are equally expensive. The kernel models inter-node cost as a symmetric matrix $D$ where the diagonal $d_{ii} = 10$ by convention (local), and $d_{ij} > 10$ for $i \neq j$. On a 2-node system:

$$D = \begin{pmatrix} 10 & 21 \\ 21 & 10 \end{pmatrix}$$

On a 4-node system where some pairs are two hops apart:

$$D = \begin{pmatrix} 10 & 21 & 21 & 31 \\ 21 & 10 & 31 & 21 \\ 21 & 31 & 10 & 21 \\ 31 & 21 & 21 & 10 \end{pmatrix}$$

The ratio $d_{ij}/10$ is a dimensionless proxy for relative latency. Node placement algorithms weight these values when deciding where to allocate pages — a page accessed by node 3 should not be placed on node 0 if node 1 is closer.

### Remote Access Cost (Quantified)

On a typical dual-socket Intel Xeon:

$$\text{Local DRAM latency} \approx 80\ \text{ns}$$
$$\text{Remote DRAM latency} \approx 140\ \text{ns}$$
$$\text{Overhead} = \frac{140 - 80}{80} = 75\%$$

For a streaming workload touching $N$ bytes, if a fraction $f$ of accesses are remote:

$$T_{\text{effective}} = N \cdot \left[(1-f)\cdot t_{\text{local}} + f \cdot t_{\text{remote}}\right]$$

Even $f = 0.2$ inflates effective memory time by $0.2 \times 0.75 = 15\%$. At $f = 0.8$, the workload is effectively memory-bandwidth-starved.

### First-Touch Allocation

Linux uses **demand paging**: `mmap` and `malloc` reserve virtual address space but allocate no physical pages. The physical page is allocated when the virtual address is **first written**, at page-fault time. The kernel places the new page on the NUMA node of the CPU that took the fault.

```c
// Thread pinned to CPU 4 (node 1) initializes the buffer:
char *buf = malloc(1 << 20);  // No physical pages allocated yet
buf[0] = 0;                   // Page fault → page placed on node 1

// Thread on CPU 0 (node 0) now does all the real work:
for (size_t i = 0; i < (1 << 20); i++)
    sum += buf[i];            // Every access is remote: node 0 → node 1
```

The page is not automatically moved just because a different thread accesses it. This is the **first-touch trap**: whichever thread initializes memory — often a startup or initialization thread, not the worker — permanently determines the page's home until explicit migration.

### Linux Memory Policies

Linux exposes NUMA placement control through two syscalls:

- `set_mempolicy(2)` — sets the default policy for future allocations in the calling thread
- `mbind(2)` — sets the policy for a specific virtual address range (VMA)

```c
#include <numaif.h>

// Bind all future allocations in this thread to node 0
unsigned long nodemask = 1UL << 0;
set_mempolicy(MPOL_BIND, &nodemask, sizeof(nodemask) * 8);

// Interleave a specific shared mapping across nodes 0 and 1
unsigned long mask = (1UL << 0) | (1UL << 1);
mbind(ptr, length, MPOL_INTERLEAVE, &mask, sizeof(mask) * 8, 0);
```

| Policy | Behavior |
|---|---|
| `MPOL_DEFAULT` | Allocate on the node of the faulting CPU |
| `MPOL_BIND` | Allocate **only** on specified nodes; return `ENOMEM` if unavailable |
| `MPOL_PREFERRED` | Try the specified node; fall back to others on pressure |
| `MPOL_INTERLEAVE` | Round-robin pages across specified nodes |

`MPOL_INTERLEAVE` does not improve latency for a single thread — it averages it. Its value is when many threads on different nodes all need the same data structure: spreading pages prevents one node's memory controller from becoming the bottleneck.

### AutoNUMA (NUMA Balancing)

When you cannot predict access patterns at allocation time, Linux's **NUMA Balancing** subsystem (`CONFIG_NUMA_BALANCING`, enabled by default in most distributions) automatically migrates pages toward the nodes that use them. The mechanism:

1. The kernel periodically scans process page tables and **clears the Present bit** on a sample of pages, making them temporarily inaccessible
2. When the thread next touches one of those pages, a minor fault fires
3. The kernel records which CPU (and therefore which node) took the fault
4. If a page is faulted from a node other than where it resides, and this pattern is consistent, the kernel calls `migrate_pages()` to move it

The cost is real: the unmapping and re-faulting adds noise to latency-sensitive workloads. The scan rate is controlled via `/proc/sys/kernel/numa_balancing_scan_period_min_ms` and related knobs. For workloads with stable, predictable access patterns, disabling NUMA balancing (`echo 0 > /proc/sys/kernel/numa_balancing`) and using explicit `numactl` placement is often preferable.

### Transparent Huge Pages and NUMA

A 2 MB THP must be physically contiguous and reside entirely within a single NUMA node — it cannot straddle two nodes' physical address ranges. Under memory pressure on the local node, the kernel may either:

- Fall back to 4 KB pages (losing THP's TLB benefits), or
- Allocate the 2 MB page from a remote node (paying the NUMA penalty on every access)

The page size vs. locality tradeoff is not obvious. A remote THP access pays both the NUMA penalty and the THP allocation cost if migration is later needed, since migrating a 2 MB page is $512\times$ more expensive than migrating a 4 KB page in terms of data moved:

$$\text{Migration cost} \propto \text{page size} = 2\ \text{MiB} = 512 \times 4\ \text{KiB}$$

---

## Linux Connection

### Inspecting Topology

```bash
# Full topology: nodes, CPUs per node, memory sizes, distance matrix
numactl --hardware

# Same data from sysfs — scriptable
cat /sys/devices/system/node/node0/cpulist
cat /sys/devices/system/node/node0/meminfo
cat /sys/devices/system/node/node0/distance   # distance to all nodes from node 0

# NUMA distance matrix (all nodes)
numactl --hardware | grep -A 10 "node distances"

# Physical CPU topology (socket/core/thread layout)
lscpu --extended
```

```bash
# Example sysfs distance file on a 2-node system (node 0's perspective):
# 10 21
```

### Observing Per-Node Memory Usage

```bash
# Per-node allocation stats (hits = local allocs, misses = remote allocs)
numastat

# Per-process NUMA stats (requires process PID)
numastat -p <pid>

# Detailed per-node memory breakdown
cat /sys/devices/system/node/node0/meminfo

# Check where a process's pages actually live right now
cat /proc/<pid>/numa_maps | head -20
# Format: <vaddr> <policy> ... N0=<pages_on_node0> N1=<pages_on_node1>
```

`/proc/<pid>/numa_maps` is the most direct answer to "where is this process's memory actually living?" — it shows
