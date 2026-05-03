---
id: 211
title: "Testing"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A function that passes every unit test can still corrupt data in production. The reason is structural: unit tests verify logic in isolation, but real failures emerge from the interaction of correct-looking components under conditions the developer never exercised — a hot dentry cache that goes cold, 64 threads contending for the same spinlock, a malformed ext4 journal entry that only triggers the recovery path when the filesystem is mounted read-only after an unclean shutdown. Each layer of the testing hierarchy exists because the previous layer cannot see these failure modes, not as a bureaucratic formality.

In the Linux kernel specifically, a regression in `fs/dcache.c` can introduce latency that only surfaces when the page cache is cold and path lookups miss the dentry cache. No unit test catches that. No mock catches that. Only a test that runs the real VFS under real memory pressure does.

---

## Core Concepts

### Unit Testing

A unit test exercises one function with all external dependencies replaced by controlled substitutes. The goal is not coverage for its own sake — it is to enumerate the equivalence classes and boundary conditions of a single piece of logic deterministically.

The word *deterministic* is load-bearing. A test that calls `malloc()` without a controlled allocator, reads from a real file, or depends on wall-clock time is not a unit test in any useful sense — it is an integration test with undefined scope. Non-determinism means a test can pass on one run and fail on the next for reasons unrelated to the logic under test, which destroys the diagnostic value of the test suite.

**What unit tests catch:** Off-by-one errors, incorrect conditional branches, integer overflow in arithmetic, malformed output for specific input classes.

**What unit tests cannot catch:** Anything involving interaction between components — timing, locking, real kernel behavior that a mock approximates incorrectly.

### Integration Testing

Integration tests wire real components together without replacing them with mocks, and verify that their interfaces are compatible. The key word is *real*: mocks are approximations, and the gap between the approximation and the real implementation is where integration bugs live.

Consider the VFS `read()` path. A mock might return data immediately. The real implementation can return `EINTR` if a signal arrives, can block waiting for a page fault to resolve, and updates `atime` on the inode — behavior that changes what the caller must handle. An integration test that calls `read()` against a real tmpfs mount will expose a caller that mishandles `EINTR`; a mock will not.

**What integration tests catch:** ABI mismatches (bytes vs. blocks, signed vs. unsigned counts), unhandled error codes from real implementations, ordering assumptions that the mock satisfies by accident.

### System Testing

System testing runs the complete, unmodified stack — kernel, filesystem, application — against workloads representative of production. Nothing is replaced or stubbed. This is where configuration errors, missing `sysctl` parameters, and emergent behaviors from dozens of interacting components become visible.

A concrete example: a system test for a database running on ext4 might discover that `dirty_expire_centisecs` is set to its default of 3000 (30 seconds), causing 30-second bursts of writeback that the application interprets as I/O stalls. This misconfiguration is invisible to every layer below system testing because it requires the real kernel writeback thread, real dirty page accumulation, and real I/O scheduler behavior to manifest.

### Stress Testing

Stress testing deliberately drives a system past its designed operating point to find the failure mode. The goal is not to verify correctness at normal load — that is what functional testing does. The goal is to answer a specific question: does the system fail *safely* (returning errors, dropping requests, throttling) or *catastrophically* (deadlock, data corruption, kernel panic)?

Many bugs are latent: they require a specific interleaving of events that becomes probable only at high concurrency or sustained duration. A memory leak that accumulates 1 KB per request is invisible at 100 requests/second over a 10-minute test; it fills a 4 GB heap in under an hour at that same rate, or in minutes at 10,000 requests/second. Stress testing makes rare interleavings and slow accumulations common enough to observe.

### Fuzzing

A fuzzer generates large volumes of mutated inputs and feeds them to a target, monitoring for crashes, hangs, sanitizer violations, and assertion failures. Modern coverage-guided fuzzers (AFL++, libFuzzer, honggfuzz) instrument the binary at compile time to track which branches execute, then mutate inputs to maximize coverage of new branches.

The insight behind coverage guidance: purely random inputs saturate easily-reachable branches and make negligible progress toward deep code paths. If a parser requires a 4-byte magic number before reaching any interesting logic, random bytes will almost never produce it. Coverage feedback allows the fuzzer to discover that the magic number `\x7fELF` unlocks new branches, then use inputs containing that prefix as a seed for further mutation — directing exploration toward unexplored paths rather than re-executing known ones.

Fuzzing is especially effective against parsing code — ELF loaders, filesystem image parsers, network protocol handlers — because human testers are systematically poor at anticipating all the ways malformed structure can interact with state machines.

---

## How It Works

### The Testing Pyramid: Cost Amplification

The justification for running tests at multiple layers is economic. Let $C_u$ be the cost to find and fix a bug caught by a unit test, and $C_s$ be the cost to find and fix the same bug first caught in system testing. The ratio $C_s / C_u$ reflects two compounding factors: the time to reproduce a system-level failure is longer (often hours of log analysis vs. seconds of stack trace inspection), and the search space for the root cause is larger (any of $N$ components could be responsible).

Empirically, $C_s / C_u$ falls in the range of $10\times$ to $100\times$ depending on the system's complexity. This asymmetry dictates test scheduling: unit tests run on every commit in $O(\text{seconds})$; integration tests run on every push in $O(\text{minutes})$; system and stress tests run nightly or weekly in $O(\text{hours})$.

### Stress Testing: Modeling Saturation

A resource under load has an arrival rate $\lambda$ (requests per second) and a service rate $\mu$ (requests per second the resource can process). Utilization is:

$$U = \frac{\lambda}{\mu}$$

By the M/M/1 queueing model, mean queue length grows as:

$$L = \frac{U}{1 - U}$$

This is the mathematical reason systems degrade sharply before $U = 1$: at $U = 0.9$, mean queue length is already 9; at $U = 0.95$, it is 19. Stress testing drives $\lambda > \mu$ to observe whether the system fails gracefully. For a filesystem, $\mu$ is bounded by the slower of sequential throughput and random IOPS depending on access pattern:

$$\text{throughput} = \min\!\left(\frac{\text{sequential BW}}{\text{I/O size}},\; \text{IOPS}_{\text{random}}\right)$$

Concretely, using `fio` to probe the saturation point of an ext4 filesystem under concurrent random reads:

```bash
# Vary --numjobs from 1 to 128 to find where latency inflects
fio \
  --name=stress_read \
  --ioengine=libaio \
  --iodepth=64 \
  --rw=randread \
  --bs=4k \
  --size=4G \
  --numjobs=32 \
  --runtime=60 \
  --time_based \
  --group_reporting \
  --filename=/mnt/test/fio_target
```

Watch for `lat (usec): min=..., max=..., avg=...` — a widening gap between `min` and `max` latency under increasing `--numjobs` is the signature of contention on the `ext4_lock_group()` block allocation lock or the dentry cache spinlocks.

### Working Set vs. Cache: The Phase Transition

For a filesystem workload, there is a qualitative phase transition when the working set size $W$ exceeds the page cache size $M$:

- When $W \leq M$: the cache hit ratio $h \approx 1$, and effective read latency is dominated by DRAM access time ($\sim 100\,\text{ns}$)
- When $W > M$: $h < 1$, and mean latency is:

$$\bar{t} = h \cdot t_{\text{cache}} + (1 - h) \cdot t_{\text{disk}}$$

For a rotational disk, $t_{\text{disk}} \approx 10\,\text{ms}$ versus $t_{\text{cache}} \approx 100\,\text{ns}$, a factor of $10^5$. Even a 1% cache miss rate ($h = 0.99$) adds $0.01 \times 10\,\text{ms} = 100\,\mu\text{s}$ of mean latency — a $1000\times$ increase over the cache-resident case. Stress tests that do not vary $W$ relative to $M$ will miss this entirely.

Check page cache occupancy during a stress run:

```bash
# Watch cache, free, and available memory in real time
vmstat -w 1

# Or inspect /proc/meminfo directly
grep -E 'Cached|Buffers|MemFree|MemAvailable' /proc/meminfo

# Drop caches to force cold-cache behavior (requires root)
echo 3 > /proc/sys/vm/drop_caches
```

### Fuzzing: Coverage-Guided Mutation

A coverage-guided fuzzer maintains a corpus $\mathcal{C} = \{i_1, i_2, \ldots, i_n\}$ of inputs that have each demonstrated new branch coverage. Each mutation cycle:

1. Select $i_k \in \mathcal{C}$ (weighted by novelty of coverage it discovered)
2. Apply a mutation: single-byte flip, byte insertion/deletion, arithmetic increment, or splice with $i_j$
3. Execute the target; record the set of branch edges $E$ taken
4. If $E \not\subseteq \bigcup_{i \in \mathcal{C}} E_i$, add
