---
id: 168
title: "Threads and shared memory"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When two threads share memory and at least one writes, correctness depends on the *order* of memory operations — and the CPU, compiler, and OS scheduler all reorder them independently. A mutex is not just a "flag": it is a contract with the hardware that forces store-buffer flushes and cache-coherence actions. Without that contract, a reference count can reach zero twice, a `malloc` freelist can be corrupted, or a kernel data structure can be read half-initialized. These bugs are timing-dependent and often disappear under a debugger because `ptrace` stops all threads simultaneously, eliminating the interleaving that caused the failure.

---

## Core Concepts

### Threads and Shared Address Space

A process owns a virtual address space. Threads are independent execution contexts *within* that space. They share the heap, BSS, data segment, and file descriptor table, but each thread has its own stack (default 8 MB on Linux, set in `pthread_attr_setstacksize`) and its own copy of the CPU register file. The kernel schedules threads as `task_struct` entries — Linux makes no architectural distinction between a thread and a process at the scheduler level; `clone(2)` with `CLONE_VM` is what makes a thread share its parent's address space rather than copy it.

### Race Condition

A race condition occurs when the result depends on the interleaving of non-atomic operations on shared state. Speed is irrelevant — what matters is that an operation that appears single-step in C compiles to multiple machine instructions with no atomicity guarantee between them.

A counter increment:

```c
counter++;
```

compiles to three instructions:

```asm
mov eax, [counter]   ; load  (read)
inc eax              ; modify (ALU)
mov [counter], eax   ; store (write)
```

With two threads, both can execute the load before either executes the store. Let $v$ be the initial value. Both threads read $v$, compute $v+1$, and write $v+1$. The net effect of two increments is $+1$, not $+2$. This **lost update** scales: with $N$ threads each doing $k$ increments, the final value can be anywhere in $[k, Nk]$.

### Critical Section

A critical section is a code region that accesses shared mutable state and must execute under mutual exclusion. The three properties required for a correct solution (Dijkstra, 1965):

- **Mutual exclusion**: at most one thread inside at any moment
- **Progress**: if no thread is inside and threads want to enter, one must be chosen in finite time (the decision cannot be deferred indefinitely)
- **Bounded waiting**: a thread waiting to enter must succeed after a finite number of other threads have entered — no indefinite starvation

Progress and bounded waiting are distinct. A lock that randomly grants access forever satisfies progress but not bounded waiting.

### Atomicity and Memory Ordering

Two separable problems are both called "synchronization":

1. **Mutual exclusion** — prevent concurrent execution of a region
2. **Memory visibility** — ensure writes in one thread are seen by another in the intended order

Modern CPUs write into store buffers before committing to the L1 cache. A core can read its own uncommitted stores (store-forwarding) but other cores cannot. x86 has Total Store Order (TSO): stores from one core appear to all other cores in program order, but loads can bypass stores to *different* addresses. ARM and RISC-V are weakly ordered: all reorderings are possible unless fenced. A lock implementation that is correct on x86 can silently fail on ARM if it omits the correct barrier instructions.

The C11/C++11 memory model exposes this via `_Atomic` and `memory_order` parameters. At the POSIX level, `pthread_mutex_lock/unlock` implicitly issue the necessary barriers. The barrier cost on x86 is a `MFENCE` or a locked instruction (`LOCK XCHG`), which drains the store buffer — this is measurable overhead, typically $50$–$200$ ns per operation.

### Mutex

A mutex has two states: locked and unlocked. On Linux, `pthread_mutex_t` is implemented using a **futex** (fast userspace mutex, `futex(2)`). The fast path — no contention — is entirely in userspace: a single atomic compare-and-swap on a 32-bit integer in the mutex struct. The kernel is invoked only when a thread must block, which issues `futex(FUTEX_WAIT)` to deschedule the thread, and when a thread unlocks with waiters, which issues `futex(FUTEX_WAKE)`.

The lock/unlock pair establishes a **happens-before** edge: every memory operation in thread A before `unlock()` is visible to thread B after it successfully acquires the same mutex. This is a guarantee about *all* memory, not just the memory explicitly protected by the lock.

### Deadlock

Deadlock requires four conditions simultaneously (Coffman, 1971): mutual exclusion, hold-and-wait, no preemption, and circular wait. In practice, circular wait is the one you prevent. If two threads must acquire locks $L_1$ and $L_2$, always acquire them in the same global order — e.g., by lock address:

```c
if (L1 < L2) { lock(L1); lock(L2); }
else          { lock(L2); lock(L1); }
```

The circular dependency for two threads and two locks:

$$T_A \xrightarrow{\text{holds}} L_1 \xrightarrow{\text{needed by}} T_B \xrightarrow{\text{holds}} L_2 \xrightarrow{\text{needed by}} T_A$$

Breaking any single arrow (by imposing a consistent acquisition order) eliminates the cycle.

---

## How It Works

### The Hardware Primitive: Compare-And-Swap

All portable synchronization ultimately rests on an atomic read-modify-write instruction. The most general is **compare-and-swap (CAS)**:

```c
// What the CPU executes as one indivisible unit:
bool CAS(int *addr, int expected, int new_val) {
    if (*addr == expected) { *addr = new_val; return true; }
    return false;
}
```

On x86 this is `CMPXCHG` with a `LOCK` prefix. "Atomic" here is enforced by the MESI cache-coherence protocol: the cache line containing `addr` is held in Exclusive state for the duration of the instruction, preventing any other core from reading or writing it. There is no global bus lock on modern CPUs — coherence is per-cache-line.

GCC/Clang expose CAS via builtins:

```c
// Returns true if the swap happened
__atomic_compare_exchange_n(ptr, &expected, desired,
                             /*weak=*/false,
                             __ATOMIC_SEQ_CST, __ATOMIC_SEQ_CST);
```

### Building a Spinlock from CAS

```c
#include <stdatomic.h>

typedef struct {
    atomic_int locked;
} spinlock_t;

void spin_lock(spinlock_t *lk) {
    int zero;
    do {
        zero = 0;
    } while (!atomic_compare_exchange_weak_explicit(
                 &lk->locked, &zero, 1,
                 memory_order_acquire, memory_order_relaxed));
}

void spin_unlock(spinlock_t *lk) {
    atomic_store_explicit(&lk->locked, 0, memory_order_release);
}
```

`memory_order_acquire` on lock prevents the compiler and CPU from moving loads/stores from inside the critical section to before the lock. `memory_order_release` on unlock prevents them from moving *after* the store that clears the flag. Without these barriers, the CPU is free to speculatively execute the body before the lock is confirmed.

A spinlock is appropriate when:
- The critical section completes in $\lesssim 1\,\mu\text{s}$ (shorter than a context switch, which costs $\sim 1$–$10\,\mu\text{s}$ depending on the scheduler tick and TLB state)
- The waiting thread is pinned to a dedicated CPU (busy-waiting on a shared core wastes the timeslice that the lock-holder needs)

For all other cases, use a sleeping lock (mutex).

### False Sharing

Threads do not transfer individual bytes between caches — the granularity is a **cache line**, 64 bytes on all current x86, ARM, and RISC-V server CPUs. If two threads write to distinct variables that share a cache line, each write causes the other core's copy of that line to be invalidated via MESI, forcing a reload even though the threads never logically share data.

If thread 0 writes `a` (bytes 0–7) and thread 1 writes `b` (bytes 8–15), and both live on the same cache line:

$$\text{line} = \bigl[\underbrace{a}_{[0,8)}\;\underbrace{b}_{[8,16)}\;\underbrace{\cdots}_{[16,64)}\bigr]$$

Every write by thread 0 transitions the line to Modified on core 0, invalidating core 1's copy. Thread 1's next access misses, fetches the line, transitions it to Modified on core 1, invalidating core 0. The line bounces between cores. At $\sim 60$–$100$ ns per remote cache miss, a tight loop can run slower than the single-threaded baseline.

Fix: align hot per-thread fields to their own cache line.

```c
struct per_thread_counter {
    long value;
    char _pad[64 - sizeof(long)];
} __attribute__((aligned(64)));

struct per_thread_counter counters[MAX_THREADS];
```

You can verify alignment at compile time:

```c
_Static_assert(sizeof(struct per_thread_counter) == 64,
               "counter must be exactly one cache line");
```

### Condition Variables

A mutex enforces mutual exclusion but cannot express "block until some predicate is true." A **condition variable** solves this. The critical property of `pthread_cond_wait`: it atomically releases the mutex *and* registers the thread as a waiter before any other thread can call `pthread_cond_signal`. This closes the
