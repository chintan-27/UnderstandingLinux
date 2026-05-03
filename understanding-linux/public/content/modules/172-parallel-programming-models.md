---
id: 172
title: "Parallel programming models"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A single-threaded program waiting on a network response burns CPU time doing nothing. On a 32-core machine, that waste multiplies. But the failure modes of parallelism are just as real: threads that spend most of their time blocked on a single lock serialize work back toward single-threaded performance; an event loop whose handler blocks stalls every other pending connection; a work queue that feeds only one core while thirty sit idle. Each parallel programming model exists as a direct answer to one of these failure modes. Knowing which failure mode a model addresses is the only reliable way to choose between them.

## Core Concepts

### Threads

A thread is a kernel-scheduled unit of execution with its own stack and register file, sharing its process's virtual address space, file descriptor table, and heap with sibling threads. The kernel schedules threads — `struct task_struct` in Linux represents both processes and threads; a thread is a task with `CLONE_VM | CLONE_FILES | CLONE_SIGHAND` set at creation time, meaning no separate page table or fd table is allocated.

Thread creation is not free. `pthread_create` calls `clone(2)`, which allocates a kernel stack (~16 KB), a `task_struct`, and maps a user stack (8 MB virtual by default, `ulimit -s` to inspect). For work finer-grained than ~10 µs, creation overhead dominates execution time. Thread pools fix this by blocking idle threads on a condition variable and reusing them across tasks, paying creation cost once.

Amdahl's Law gives the hard ceiling on parallel speedup. If fraction $s$ of execution is irreducibly serial, speedup across $P$ processors is:

$$S(P) = \frac{1}{s + \frac{1-s}{P}}$$

As $P \to \infty$, $S \to \frac{1}{s}$. A program with 5% serial work — a single global lock touched on every iteration, for example — caps at $20\times$ speedup regardless of how many cores you add. The serial fraction is almost always larger than it appears; lock acquisition time, cache-coherence traffic, and barrier synchronization all count.

Gustafson's Law offers a different framing: if you scale the *problem size* with $P$, the serial fraction's relative weight shrinks. For workloads where more hardware means handling more data (not the same data faster), Gustafson is the more relevant bound:

$$S_G(P) = P - s(P - 1)$$

### Event Loops

An event loop is a single thread iterating over ready I/O events. It is correct precisely *because* it is single-threaded: only one handler executes at a time, so shared state requires no locking. The constraint that preserves this correctness is absolute: **no handler may block**. A handler that calls `read(2)` on a blocking fd stalls the entire loop — every other registered fd waits behind it.

The model scales in *I/O concurrency*, not parallelism. One thread can sustain $10^5$ simultaneous TCP connections because it never sleeps waiting for one of them — it waits for *any* of them and handles whichever is ready. Throughput is bounded by handler CPU time, not connection count, as long as handlers stay non-blocking.

### Async I/O

Non-blocking I/O (`O_NONBLOCK`) means: return `EAGAIN` immediately if no data is ready. Async I/O means: start the operation kernel-side and deliver a completion event when it finishes. These are mechanically different. With `O_NONBLOCK` + `epoll`, the kernel tells you "this fd is readable," then you call `read(2)` and do the I/O yourself in the syscall. With `io_uring`, you tell the kernel "read 4096 bytes from this fd into this buffer," and the kernel delivers a completion entry containing the result — the data transfer happened without your thread being scheduled.

The practical consequence: `epoll` still serializes I/O operations through the calling thread; `io_uring` can pipeline hundreds of I/O operations through kernel threads or hardware queues while your thread does other work or sleeps.

### Work Stealing

A work-stealing scheduler gives each thread a double-ended queue (deque) of tasks. The owner pushes and pops from one end (the "head"); thieves steal from the other end (the "tail"). This asymmetry is deliberate: the owner's fast path touches only local memory with no synchronization. Stealing — the rare case — requires a compare-and-swap on the tail pointer, and contention between thieves is bounded by available parallelism, not total task count.

The expected number of steals for a computation with $T_1$ total work and $T_\infty$ critical-path length on $P$ processors is $O(P \cdot T_\infty)$. Critically, this bound does not depend on $T_1$ — a deep graph with little parallelism generates few steals, a wide graph with abundant parallelism generates at most $P \cdot T_\infty$. The scheduler adapts to graph shape without programmer intervention.

Work stealing achieves near-optimal makespan. The expected runtime on $P$ processors satisfies:

$$T_P \leq \frac{T_1}{P} + O(T_\infty)$$

The first term is the parallelism-limited floor; the second is the overhead from scheduling the critical path. When $T_1 / T_\infty \gg P$ (plenty of parallelism), $T_P \approx T_1 / P$ — linear speedup.

### Task Models

A task graph explicitly encodes dependencies: task B has a directed edge from task A meaning B cannot begin until A completes. This is strictly more expressive than raw threads (which carry no implied ordering without explicit synchronization) and more analyzable than callbacks (whose dependency structure is implicit in call order). Runtimes like OpenMP, Intel TBB, and Go's scheduler compile a task graph into actual thread usage at runtime. The programmer states *what depends on what*; the runtime decides *which thread runs what when*.

## How It Works

### Thread Synchronization and the Cost of Locks

A `pthread_mutex_t` is a futex under the hood. In the uncontended case, locking is a userspace CAS — roughly 10–30 ns, one or two cache lines touched. When a second thread contends, the loser calls `futex(FUTEX_WAIT)`, which deschedules the thread and adds it to a kernel wait queue. Wake-up requires `futex(FUTEX_WAKE)` from the unlocker. The round-trip is 200–500 ns minimum — one cache miss on the mutex word plus two context switches in the worst case.

High-contention locks do not just add latency — they serialize parallel work. Every thread waiting on a lock is doing zero useful work. If your lock is held for 100 ns and $P = 16$ threads are trying to acquire it, throughput through that critical section is $\frac{1}{100\,\text{ns}} = 10^7$ operations/second regardless of core count. That is your actual parallelism budget for that resource.

```c
#include <pthread.h>
#include <stdio.h>

pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
long counter = 0;

void *increment(void *arg) {
    for (int i = 0; i < 1000000; i++) {
        pthread_mutex_lock(&lock);
        counter++;              /* critical section: 1 addition + 2 futex ops under contention */
        pthread_mutex_unlock(&lock);
    }
    return NULL;
}
```

For a single integer, an atomic read-modify-write eliminates the lock entirely. The processor issues a `LOCK XADD` (x86) or `LDADD` (AArch64) — a single bus-locked instruction that is atomic across cores:

```c
#include <stdatomic.h>

atomic_long counter = 0;

void *increment(void *arg) {
    for (int i = 0; i < 1000000; i++)
        atomic_fetch_add_explicit(&counter, 1, memory_order_relaxed);
    return NULL;
}
```

`memory_order_relaxed` is correct here because we do not need ordering relative to other operations — only atomicity of the increment itself. Using `memory_order_seq_cst` (the default) adds a full memory barrier, doubling or tripling the cost for no benefit when ordering is not required.

### The Event Loop Mechanism

Linux's `epoll` interface scales to large fd sets because it avoids the $O(n)$ scan that `select` and `poll` require. Internally, `epoll` maintains a red-black tree of watched fds and a linked list of ready events. `epoll_wait` returns only ready events — its cost is $O(\text{ready events})$, not $O(\text{watched fds})$. Adding or removing a watched fd is $O(\log n)$ via `epoll_ctl`.

```c
#include <sys/epoll.h>
#include <fcntl.h>
#include <unistd.h>

int epfd = epoll_create1(EPOLL_CLOEXEC);

/* Set fd non-blocking — mandatory; a blocking read in the handler defeats the model */
int flags = fcntl(sockfd, F_GETFL, 0);
fcntl(sockfd, F_SETFL, flags | O_NONBLOCK);

struct epoll_event ev = {
    .events  = EPOLLIN | EPOLLET,   /* edge-triggered: fire once per state change */
    .data.fd = sockfd
};
epoll_ctl(epfd, EPOLL_CTL_ADD, sockfd, &ev);

struct epoll_event events[64];
for (;;) {
    int n = epoll_wait(epfd, events, 64, -1);  /* -1 = no timeout */
    for (int i = 0; i < n; i++) {
        /* With EPOLLET, must drain fd completely — partial read leaves no further event */
        handle_ready(events[i].data.fd);
    }
}
```

`EPOLLET` (edge-triggered) fires once when state *changes* from unready to ready. Level-triggered (default) fires on every `epoll_wait` call while the fd remains ready. Edge-triggered is more efficient but requires draining the
