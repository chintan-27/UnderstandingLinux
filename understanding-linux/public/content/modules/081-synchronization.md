---
id: 81
title: "Synchronization"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Why This Matters

When two threads share a memory location and at least one writes to it, you have a **data race** — and the C and C++ standards declare the behavior undefined, meaning the compiler is free to assume it cannot happen and optimize accordingly. This isn't a theoretical concern: the Linux kernel manages shared structures that multiple CPUs touch simultaneously. A missed increment to a reference count in the page cache causes a memory leak that only manifests under load. A race on a file descriptor table corrupts `struct files_struct`, producing wrong file offsets or use-after-free on close. A lost wakeup on a condition variable deadlocks a thread with no distinguishable stack trace. The reason these bugs are catastrophic is structural: modern CPUs execute instructions out of order, write buffers delay stores, and compilers eliminate or reorder memory accesses when they believe it's safe. None of that is visible in your source code.

---

## Core Concepts

### The Critical Section Problem

A **critical section** is a sequence of instructions that must execute as if atomic — no other thread may observe intermediate state. The hardware does not provide this automatically. Even `counter++` compiles to three instructions:

```asm
mov eax, [counter]   ; load
add eax, 1           ; increment
mov [counter], eax   ; store
```

Two threads interleaving these steps lose one increment with probability proportional to how close their scheduling windows overlap. With $N$ threads each executing $k$ increments, the expected final value without synchronization is less than $Nk$ — how much less depends on the scheduler and hardware, which is why the bug is intermittent.

Three correctness properties are required of any solution:

- **Mutual exclusion**: at most one thread in the critical section at a time
- **Progress**: if no thread is in the critical section and some want to enter, one eventually does — the lock cannot deadlock on its own
- **Bounded waiting**: if thread $T$ requests entry, there exists an upper bound on how many times other threads enter before $T$ does

### Locks (Mutexes)

A **mutex** protects a critical section by ensuring only one thread holds it at a time. The lock has exactly two states — held and not held. A thread calling `lock()` either acquires it immediately or blocks; `unlock()` transfers ownership (or marks the lock free if no threads are waiting).

The critical distinction between mutex implementations is what the waiting thread does:

- **Spinlock**: burns CPU in a tight loop checking the flag. Cost: $O(\text{wait time} \times \text{CPU frequency})$ wasted cycles. Benefit: zero context-switch overhead, which dominates for critical sections shorter than a few hundred nanoseconds.
- **Sleeping mutex**: descends into the OS on contention (`futex(FUTEX_WAIT, ...)` on Linux), yielding the CPU. Cost: $\approx 1$–$10\ \mu\text{s}$ for the round-trip through the kernel. Benefit: doesn't waste CPU while waiting.

POSIX `pthread_mutex_t` is a sleeping mutex with a brief adaptive spin phase in glibc's implementation.

### Semaphores

A **semaphore** wraps an integer count $s$ with two atomic operations:

$$\text{P}(s): \quad s \leftarrow s - 1 \quad \text{(block if } s < 0 \text{ after decrement)}$$
$$\text{V}(s): \quad s \leftarrow s + 1 \quad \text{(wake one waiter if } s \leq 0 \text{ before increment)}$$

The modern POSIX names are `sem_wait()` and `sem_post()`. The initial value determines the semantics:

| Initial value | Behavior |
|---|---|
| $1$ | Binary semaphore — equivalent to a mutex |
| $N > 1$ | Counting semaphore — allows up to $N$ concurrent holders |
| $0$ | Signaling — first waiter blocks until another thread posts |

A semaphore initialized to $0$ is the correct tool for "thread A must complete step X before thread B starts step Y" — not a mutex, which wouldn't block the acquirer.

### Condition Variables

A **condition variable** lets a thread sleep until some predicate over shared state becomes true. It always pairs with a mutex, and the pairing is not optional. The operations are:

- `wait(cond, mutex)`: **atomically** releases the mutex and descends into sleep; on wakeup, reacquires the mutex before returning
- `signal(cond)`: wakes one sleeping thread
- `broadcast(cond)`: wakes all sleeping threads

The atomicity of "release and sleep" is the entire point. Without it, a signal sent between the predicate check and the sleep is permanently lost — the thread sleeps waiting for a condition that is already true and nobody will re-signal.

### Monitors

A **monitor** packages shared data, its mutex, and its condition variables into a single object whose methods acquire the lock on entry and release it on exit. The programmer cannot forget — the language enforces the protocol. Java's `synchronized` implements this. Linux kernel code achieves the same effect with explicit lock/unlock pairs and naming conventions (`spinlock_t` embedded in the struct it protects, documented in the same header).

### Atomics

**Atomic operations** are hardware instructions that perform a read-modify-write cycle indivisibly — no other core can observe intermediate state, and no store-buffer reordering can split them. The key primitives:

- `test-and-set`: writes 1, returns old value
- `fetch-and-add`: adds a value, returns old value; used directly for lock-free counters
- `compare-and-swap` (CAS): conditional store — only writes if current value matches expected

These are the substrate from which locks are built. C11 exposes them via `<stdatomic.h>`; the kernel uses its own `atomic_t` wrappers in `include/linux/atomic.h`.

---

## How It Works

### Implementing a Spinlock with Test-and-Set

```c
#include <stdatomic.h>

typedef struct {
    atomic_int flag;  // 0 = free, 1 = held
} spinlock_t;

void spin_lock(spinlock_t *l) {
    int expected = 0;
    // atomic_compare_exchange_strong: if flag == 0, set to 1 and return true
    while (!atomic_compare_exchange_strong(&l->flag, &expected, 1))
        expected = 0;  // reset: CAS writes the found value into expected on failure
}

void spin_unlock(spinlock_t *l) {
    atomic_store(&l->flag, 0);
}
```

A plain `test-and-set` loop (`while (test_and_set(&l->flag) == 1)`) hammers the cache line with write attempts from every waiting core, generating coherence traffic proportional to $O(N^2)$ where $N$ is the number of spinning threads. A ticket lock or MCS lock reduces this to $O(N)$ by having each waiter spin on a distinct cache line.

### Why Condition Variables Need a Mutex

The broken pattern:

```c
// BROKEN
while (queue_empty())
    sleep();   // signal can arrive between the check and this call
```

Thread A checks `queue_empty()`, finds it true, and is preempted. Thread B enqueues an item and calls `signal()` — nobody is sleeping yet, so the signal is lost. Thread A resumes, calls `sleep()`, and waits forever.

The fix requires the check and the sleep to be atomic with respect to the signaler. The mutex provides this: the signaler must acquire the same mutex to modify the queue, so it cannot run between A's check and A's sleep.

```c
pthread_mutex_lock(&m);
while (queue_empty())
    pthread_cond_wait(&c, &m);   // atomically: releases m, sleeps
                                  // on wakeup: reacquires m
int item = dequeue();
pthread_mutex_unlock(&m);
```

**Always use `while`, not `if`.** POSIX explicitly permits **spurious wakeups** — the OS may wake a thread for reasons unrelated to any `signal()` call (e.g., signal delivery, hardware interrupt handling). The while loop re-evaluates the predicate and returns to sleep if the condition is not actually true.

### Producer-Consumer with Two Condition Variables

Using a single condition variable causes a subtle liveness failure: a consumer might wake another consumer (which finds the queue empty and sleeps again) instead of the producer (which could fill it). Two condition variables — one per direction — eliminate the ambiguity:

```c
#include <pthread.h>
#include <assert.h>

#define MAX 16

pthread_cond_t  not_full  = PTHREAD_COND_INITIALIZER;
pthread_cond_t  not_empty = PTHREAD_COND_INITIALIZER;
pthread_mutex_t m         = PTHREAD_MUTEX_INITIALIZER;

int buffer[MAX];
int fill = 0, use = 0, count = 0;

void producer(int item) {
    pthread_mutex_lock(&m);
    while (count == MAX)
        pthread_cond_wait(&not_full, &m);
    buffer[fill] = item;
    fill = (fill + 1) % MAX;
    count++;
    pthread_cond_signal(&not_empty);   // wake a consumer, not a producer
    pthread_mutex_unlock(&m);
}

int consumer(void) {
    pthread_mutex_lock(&m);
    while (count == 0)
        pthread_cond_wait(&not_empty, &m);
    int item = buffer[use];
    use = (use + 1) % MAX;
    count--;
    pthread_cond_signal(&not_full);    // wake a producer, not a consumer
    pthread_mutex_unlock(&m);
    return item;
}
```

### Covering Conditions

When you cannot know which waiting thread should be woken — as in a memory allocator where thread A waits for 4 KB and thread B waits for 64 KB — `signal()` might wake the wrong one. `broadcast()` wakes all waiters; each re-checks its own predicate and sleeps again if unsatisfied.

```c
void mem_free(void *ptr, size_t size) {
    pthread_mutex_lock(&m);
    bytes_free += size
