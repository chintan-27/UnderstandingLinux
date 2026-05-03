---
id: 82
title: "Deadlocks and liveness"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Why This Matters

A concurrent system that never makes progress is worse than a slow one — it's broken in a way that can be invisible until production. Deadlock happens when threads wait on each other in a cycle, each holding a resource the other needs, so none can proceed. Starvation is subtler: a thread is perpetually denied a resource not because of a cycle, but because other threads keep winning. Both are liveness failures — the system is alive in the sense that processes exist, but dead in the sense that useful work has stopped.

The Linux kernel itself acquires locks in rigid, documented orders across filesystems, memory management, and drivers. `mm/rmap.c` acquires the anon VMA lock before the page lock. `fs/inode.c` acquires the inode lock before the directory lock. Violating these orders causes deadlocks that silently hang production machines — often under specific workloads that never appeared in testing.

---

## Core Concepts

### The Four Conditions for Deadlock

Coffman et al. (1971) showed that deadlock requires all four of these conditions simultaneously:

1. **Mutual Exclusion** — at least one resource is non-shareable: only one thread holds it at a time.
2. **Hold-and-Wait** — a thread holds at least one resource while blocked waiting to acquire another.
3. **No Preemption** — resources are released only voluntarily; the OS cannot forcibly reclaim them.
4. **Circular Wait** — a cycle exists in the wait-for graph: $T_1$ waits for a resource held by $T_2$, which waits for a resource held by $T_1$ (generalizes to any cycle of length $n \geq 2$).

Eliminating *any one* condition makes deadlock impossible. Every prevention strategy targets exactly one of them, and each has a cost.

### Deadlock Prevention

**Breaking circular wait** is the most practical approach. Impose a global total ordering on all lock types — assign each lock an integer rank. Enforce the invariant: a thread may only acquire lock $L_j$ while holding $L_i$ if $\text{rank}(L_i) < \text{rank}(L_j)$. If every thread respects this, the wait-for graph is a DAG, and a DAG has no cycles.

The Linux kernel documents its lock ordering in `Documentation/locking/lockdep-design.rst`. The `lockdep` validator enforces it at runtime by tracking acquisition sequences and flagging inversions.

**Breaking hold-and-wait** means acquiring all needed locks atomically before doing any real work. In practice this requires knowing all needed locks in advance, which is often impossible in layered code. It also collapses concurrent acquisition into a serial bottleneck.

**Breaking no-preemption** means using `trylock`: if a thread fails to acquire a lock it needs, it releases all locks it currently holds and retries. This is safe but introduces the risk of livelock.

### Deadlock Avoidance vs. Prevention

*Prevention* changes code structure so one Coffman condition cannot hold. *Avoidance* checks at runtime whether granting a request would move the system into an unsafe state, and blocks the request if so. Dijkstra's Banker's Algorithm is the canonical example: the OS tracks each process's maximum resource claim and current allocation, and only grants requests that leave at least one safe execution sequence to completion.

Avoidance is rarely used in general-purpose kernels because it requires knowing maximum resource demands in advance. In a kernel driver, you cannot predict how many locks a filesystem path will need before executing it.

### Starvation and Fairness

Starvation is a liveness failure without a cycle. A lock policy is *unfair* if it provides no upper bound on wait time — a perpetually busy resource can legally keep the same thread waiting forever. A priority-based mutex where high-priority threads always preempt is the clearest example: a low-priority thread may wait forever even though no deadlock exists and every individual lock acquisition completes quickly.

A lock is *fair* if every waiting thread is granted the resource in bounded time. The bound is typically $O(n)$ where $n$ is the number of waiters: no thread waits longer than all other current waiters ahead of it. Ticket locks achieve this by serializing acquisition in arrival order.

Fairness costs throughput: a fair lock cannot let a thread that already holds cache-hot data re-acquire immediately, even when that would be faster. This is a deliberate tradeoff, not a bug.

---

## How It Works

### The Circular-Wait Example

Two threads, two locks, opposite acquisition order — the classic deadlock:

```c
// Thread 1: acquires L1 then L2
pthread_mutex_lock(&L1);
pthread_mutex_lock(&L2);   // blocks if T2 holds L2
/* ... work ... */
pthread_mutex_unlock(&L2);
pthread_mutex_unlock(&L1);

// Thread 2: acquires L2 then L1
pthread_mutex_lock(&L2);
pthread_mutex_lock(&L1);   // blocks if T1 holds L1
/* ... work ... */
pthread_mutex_unlock(&L1);
pthread_mutex_unlock(&L2);
```

When both threads execute past their first `lock()` call simultaneously, the wait-for graph contains a cycle:

$$T_1 \xrightarrow{\text{waits for}} L_2 \xrightarrow{\text{held by}} T_2 \xrightarrow{\text{waits for}} L_1 \xrightarrow{\text{held by}} T_1$$

Fix: enforce a total order. Assign $\text{rank}(L_1) = 1$, $\text{rank}(L_2) = 2$. Rewrite Thread 2 to acquire `L1` before `L2`. The cycle cannot form because no thread ever waits for a lower-ranked lock while holding a higher-ranked one.

### Encapsulation Hides the Order

Lock-ordering bugs are hardest to see when locking is internal to a library:

```c
// Both functions acquire locks internally — the caller cannot see the order
vector_add_all(v1, v2);   // acquires lock(v1), then lock(v2)
vector_add_all(v2, v1);   // acquires lock(v2), then lock(v1) — deadlock
```

The caller cannot enforce a consistent acquisition order without knowing implementation details. The only robust solutions are: expose the lock order in the API contract, use lock-rank annotations that tools can verify, or redesign so the operation does not require holding two locks simultaneously. This tension between encapsulation and lock ordering is why kernel subsystems document their lock hierarchies explicitly rather than relying on convention.

### Breaking Hold-and-Wait with a Prevention Lock

Serialize all multi-lock acquisitions behind a single meta-lock:

```c
pthread_mutex_t prevention = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t L1          = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t L2          = PTHREAD_MUTEX_INITIALIZER;

void do_work(void) {
    pthread_mutex_lock(&prevention);  // only one thread acquires locks at a time
    pthread_mutex_lock(&L1);
    pthread_mutex_lock(&L2);
    pthread_mutex_unlock(&prevention);  // release meta-lock; hold L1 and L2

    /* ... work ... */

    pthread_mutex_unlock(&L2);
    pthread_mutex_unlock(&L1);
}
```

This works because no thread holds one real lock while blocked on another — the hold-and-wait condition cannot arise. The cost is total serialization of lock *acquisition* globally. Every thread that needs any two locks queues behind `prevention`, even if their lock sets are disjoint. This is acceptable only when the critical section is long relative to the acquisition phase.

### Breaking No-Preemption with trylock

```c
#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>

/* Returns 0 holding both la and lb, never blocks indefinitely. */
int acquire_two(pthread_mutex_t *la, pthread_mutex_t *lb) {
    while (1) {
        pthread_mutex_lock(la);
        if (pthread_mutex_trylock(lb) == 0)
            return 0;               // success: hold both

        pthread_mutex_unlock(la);   // release everything and retry

        /* Random exponential backoff: reduces livelock probability.
           Expected wait before round k: E[wait] = (rand_max / 2) * k microseconds. */
        usleep(rand() % (1 << (attempts % 8)) * 10);
    }
}
```

`trylock` returns immediately with `EBUSY` if the lock is unavailable, so the thread never blocks while holding `la`. This eliminates hold-and-wait. The risk is **livelock**: two threads repeatedly acquire one lock and fail on the other in lockstep. Randomized backoff breaks the symmetry. For $n$ threads competing, the expected number of retries before one succeeds is $O(n)$ with good backoff, versus potentially unbounded without it.

### Ticket Lock: Enforcing Fairness

A spinlock hands the lock to whoever checks `turn` next — under contention, a thread that runs frequently will win more often than one that is descheduled. A ticket lock fixes this by issuing sequence numbers:

```c
#include <stdatomic.h>

typedef struct {
    atomic_int ticket;   /* next ticket to issue */
    atomic_int turn;     /* ticket currently being served */
} ticket_lock_t;

void ticket_lock(ticket_lock_t *lk) {
    int my_turn = atomic_fetch_add_explicit(&lk->ticket, 1, memory_order_relaxed);
    while (atomic_load_explicit(&lk->turn, memory_order_acquire) != my_turn)
        ; /* spin — replace with pause/yield in production */
}

void ticket_unlock(ticket_lock_t *lk) {
    /* No RMW needed: only the lock holder writes turn */
    atomic_fetch_add_explicit(&lk->turn, 1, memory_order_release);
}
```

Correctness argument: `ticket` is incremented atomically, so no two threads receive the same `my_turn`. `turn` increases strictly monotonically. Thread $i$ with ticket $t_i$ waits until exactly
