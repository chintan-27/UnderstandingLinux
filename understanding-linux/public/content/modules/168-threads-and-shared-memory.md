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

## Core Concepts
### Threads as Lightweight Execution Contexts
A thread is a unit of execution that shares the virtual address space, file descriptors, and signal handlers of its parent process, but maintains its own stack, thread‑local storage (TLS), scheduler entity, and CPU registers. The kernel schedules threads independently, enabling true parallelism on SMP systems. Sharing the address space eliminates the cost of inter‑process message passing; however, it also means that any write to a memory location is visible to all threads unless hardware‑enforced ordering or explicit synchronization prevents it.

### From Race Conditions to Critical Sections
A **race condition** occurs when two or more threads perform overlapping read‑modify‑write operations on the same memory location without atomicity guarantees. Consider the C statement `x++;` compiled to:
```
mov    eax, DWORD PTR [x]
add    eax, 1
mov    DWORD PTR [x], eax
```
If Thread A loads `x` while Thread B stores a new value, the final value may reflect only one of the increments. The **critical section** is the minimal code region that must appear atomic to other threads protecting the shared datum. Correctness requires that no two threads be inside their critical sections for the same shared object simultaneously.

### Synchronization Primitives from First Principles
* **Mutex (mutual exclusion)** – a binary flag that threads acquire before entering a critical section and release after leaving. Implementations rely on an atomic test‑and‑set operation (e.g., `xchg` or `cmpxchg`) followed by a blocking wait if the flag is already set. In Linux NPTL, the fast path uses a futex (`FUTEX_WAIT` / `FUTEX_WAKE`) to avoid kernel entry when uncontended.
* **Condition Variable** – a queue of threads waiting for a predicate to become true. It couples a mutex with a wait‑set: a thread releases the mutex, blocks on the futex, and is woken when another thread signals the predicate and possibly broadcasts. Spurious wakeups are permitted by POSIX; therefore the wait must always be inside a re‑evaluation loop:
  ```c
  pthread_mutex_lock(&m);
  while (!predicate) pthread_cond_wait(&c, &m);
  /* use shared state */
  pthread_mutex_unlock(&m);
  ```

### Memory Ordering and Cache Coherency
Modern CPUs store data in private L1/L2 caches. When a core modifies a cache line, the MESI protocol ensures other cores’ copies are invalidated or updated. However, the **visibility** of a store to another thread is not guaranteed until the store drains the store buffer and the cache line transitions to the **Shared** state. Without explicit barriers, a thread may observe stale values. The Linux kernel provides memory barriers (`mb()`, `rmb()`, `wmb()`) and C11 atomics (`memory_order_acquire/release`) that insert the necessary fence instructions (`mfence`, `lfence`, `sfence`) to enforce ordering.

## How It Works
### Thread Creation and Stack Layout
The `pthread_create` wrapper invokes the `clone` syscall with flags `CLONE_VM | CLONE_FS | CLONE_FILES | CLONE_SIGHAND | CLONE_THREAD | CLONE_SYSVSEM | CLONE_SETTLS | CLONE_PARENT_SETTID | CLONE_CHILD_CLEARTID`. The kernel allocates a new `task_struct`, duplicates the mm_struct (shared VM), and sets up a new stack at `clone_child_tls`. The TLS block (`%fs` or `%gs` on x86_64) holds the thread‑specific pointer (`pthread_self`). The initial stack frame contains the return address, the argument pointer, and a guard page to detect overflow.

```c
#include <pthread.h>
#include <unistd.h>
#include <sys/syscall.h>

static void *thread_start(void *arg) {
    pid_t tid = syscall(SYS_gettid);
    return (void *)(uintptr_t)tid;
}

int main(void) {
    pthread_t th;
    pthread_create(&th, NULL, thread_start, NULL);
    void *retval;
    pthread_join(th, &retval);
    printf("Thread tid=%ld\n", (long)retval);
    return 0;
}
```
Compile with `gcc -std=c11 -pthread -o thread_demo thread_demo.c`.

### Mutex Implementation via Futex
A simplified mutex consists of an integer state: `0` = unlocked, `1` = locked, `2` = locked with waiters. The uncontended lock path:
```c
/* try to set state from 0 to 1 atomically */
if (atomic_compare_exchange_strong(&state, &expected, 1))
    return;   /* acquired */
```
If the compare‑exchange fails because `state != 0`, the thread executes:
```c
futex(&state, FUTEX_WAIT, 1, NULL);   /* kernel puts thread to sleep */
```
Unlock:
```c
if (atomic_fetch_sub(&state, 1) == 1)   /* was 1 → 0 */
    return;   /* no waiters */
atomic_store(&state, 0);
futex(&state, FUTEX_WAKE, 1, NULL);   /* wake one waiter */
```
Thus, the mutex incurs no system call in the uncontended case, dramatically reducing overhead.

### Condition Variable Mechanics
A condition variable stores a pointer to a futex word and a broadcast counter. `pthread_cond_wait` does:
1. Unlock the associated mutex.
2. Add the thread to the wait queue (store thread ID in the futex word).
3. Block via `futex(&word, FUTEX_WAIT, expected, NULL)`.
Upon `pthread_cond_signal`, one waiter is woken; `pthread_cond_broadcast` wakes all. After waking, the thread reacquires the mutex before returning to the caller. The wait loop guards against spurious wakeups and missed signals.

### Cache Coherency and False Sharing
If two threads frequently modify different variables that reside on the same 64‑byte cache line, each write causes the line to bounce between cores, degrading performance. This is **false sharing**. Padding to isolate hot fields avoids the ping‑pong:
```c
struct counter {
    std::atomic<int> val;
    char pad[60];   /* ensure next object starts on a new line */
};
```
The cost of a cache line transfer can be approximated by the latency of an inter‑core request (~30‑100 ns on modern Xeon). If a critical section holds the line for `T_hold` and there are `N` threads, the probability of collision is roughly `1 - (1 - T_hold/T_cycle)^{N-1}` where `T_cycle` is the average time between accesses.

## Worked Examples
### Example 1: Atomic Increment vs. Mutex Protected Increment
We measure the time to increment a shared integer `10⁷` times using two threads.

**Unsynchronized version (illustrates race):**
```c
#include <pthread.h>
#include <stdio.h>
#include <stdatomic.h>

volatile int x = 0;   /* note: not atomic */
void *inc(void *) {
    for (int i = 0; i < 5'000'000; ++i) x++;   /* non‑atomic */
    return NULL;
}
int main(void) {
    pthread_t t[2];
    for (int i = 0; i < 2; ++i) pthread_create(&t[i], NULL, inc, NULL);
    for (int i = 0; i < 2; ++i) pthread_join(t[i], NULL);
    printf("x = %d\n", x);
    return 0;
}
```
Typical output on a 4‑core machine: `x` varies between 5,000,000 and 10,000,000 because overlapping read‑modify‑writes lose updates.

**Mutex protected version:**
```c
#include <pthread.h>
#include <stdio.h>

int x = 0;
pthread_mutex_t m = PTHREAD_MUTEX_INITIALIZER;

void *inc(void *) {
    for (int i = 0; i < 5'000'000; ++i) {
        pthread_mutex_lock(&m);
        x++;
        pthread_mutex_unlock(&m);
    }
    return NULL;
}
```
With a uncontended mutex, each iteration costs roughly:
- atomic test‑and‑set (~5 ns)
- futex fast‑path (no syscall) (~20 ns)
- unlock atomic dec + wake check (~5 ns)
Total ≈ 30 ns per increment → 0.15 s for 5 M iterations. Empirical measurement with `clock_gettime(CLOCK_MONOTONIC)` yields ~0.18 s, confirming the model.

**Atomic version (C11):**
```c
#include <stdatomic.h>
#include <pthread.h>
#include <stdio.h>

atomic_int x = ATOMIC_VAR_INIT(0);
void *inc(void *) {
    for (int i = 0; i < 5'000'000; ++i)
        atomic_fetch_add_explicit(&x, 1, memory_order_relaxed);
    return NULL;
}
```
Here each iteration is a single `lock xadd` instruction (~5 ns). Two threads complete in ~0.025 s, showing the advantage of hardware‑level atomicity when the operation is simple.

### Example 2: Producer‑Consumer with Bounded Buffer and Timing Analysis
We implement a buffer of size `B = 1024` using a mutex and two condition variables (`not_full`, `not_empty`). The producer generates integers at a rate `λ_p` items/s; the consumer removes at `λ_c`. The system reaches steady state when `λ_p = λ_c`. The average number of items in the buffer is given by the birth‑death process:
$$
L = \frac{\rho}{1-\rho}, \quad \rho = \frac{\lambda}{\mu}
$$
where `λ` is the effective arrival rate and `μ` the service rate (both limited by the critical section duration `T_cs`). If `T_cs = 200 ns` (mutex lock/unlock + buffer index update), the maximum throughput per thread is `1/T_cs ≈ 5 Mops`. With two threads, the theoretical max is 5 Mops/s; exceeding this causes queue buildup and increased latency due to contention.

**Code:**
```c
#define _POSIX_C_SOURCE 200809L
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <time.h>

#define BUF_SIZE 1024
static int buf[BUF_SIZE];
static size_t in = 0, out = 0, cnt = 0;

static pthread_mutex_t mx = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t not_full = PTHREAD_COND_INITIALIZER;
static pthread_cond_t not_empty = PTHREAD_COND_INITIALIZER;

static volatile int stop = 0;

void *producer(void *arg) {
    (void)arg;
    unsigned int seed = time(NULL) ^ pthread_self();
    while (!stop) {
        int item = rand_r(&seed);
        pthread_mutex_lock(&mx);
        while (cnt == BUF_SIZE) pthread_cond_wait(&not_full, &mx);
        buf[in] = item;
        in = (in + 1) % BUF_SIZE;
        ++cnt;
        pthread_cond_signal(&not_empty);
        pthread_mutex_unlock(&mx);
        /* simulate work */
        nanosleep(&(struct timespec){0, 50L}, NULL);
    }
    return NULL;
}

void *consumer(void *arg) {
    (void)arg;
    while (!stop) {
        pthread_mutex_lock(&mx);
        while (cnt == 0) pthread_cond_wait(&not_empty, &mx);
        int item = buf[out];
        out = (out + 1) % BUF_SIZE;
        --cnt;
        pthread_cond_signal(&not_full);
        pthread_mutex_unlock(&mx);
        printf("%d\n", item);
        nanosleep(&(struct timespec){0, 80L}, NULL);
    }
    return NULL;
}

int main(void) {
    pthread_t p, c;
    pthread_create(&p, NULL, producer, NULL);
    pthread_create(&c, NULL, consumer, NULL);
    sleep(5);   /* run for 5 seconds */
    stop = 1;
    pthread_join(p, NULL);
    pthread_join(c, NULL);
    return 0;
}
```
Compile: `gcc -std=c11 -pthread -O2 -o pc pc.c`.  
Run: `./pc | pv -q > /dev/null` to measure throughput with `pv`. Adjust the nanosleep delays to observe the transition from under‑utilized to saturated buffer.

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Locking a non‑recursive mutex twice in the same thread** | POSIX mutexes are *default* non‑recursive; the second `pthread_mutex_lock` will block forever because the owner is already the calling thread. | Deadlock, CPU spin if using `PTHREAD_MUTEX_ERRORCHECK` returns `EDEADLK`. |
| **Using `pthread_cond_wait` without a while‑loop re‑check** | POSIX permits spurious wakeups; a thread may return from wait while the predicate is still false. | Consuming uninitialized data or prematurely exiting, leading to corrupted state or infinite loops. |
| **Assuming `x++` is atomic** | The operation compiles to load‑add‑store; interleaving loses updates. | Lost increments, non‑deterministic final values. |
| **Failing to unlock on error paths** | If a function returns early after locking, the mutex stays locked. | Other threads block indefinitely → deadlock. |
| **Neglecting memory barriers when implementing lock‑free code** | Without acquire/release semantics, a thread may see a stale pointer or stale data after acquiring a lock. | Subtle data corruption that appears only under specific scheduling or on weak‑ordering CPUs (ARM, POWER). |
| **Using `pthread_cancel` without cleanup handlers** | Cancellation can occur at any cancellation point; allocated resources (memory, file descriptors) are not released automatically. | Resource leaks, locked mutexes left held, inconsistent state. |
| **Placing hot fields on the same cache line (false sharing)** | Each write forces the line to migrate between cores, serializing what should be parallel work. | Scalability stalls; adding threads does not improve throughput. |

## Exercises
### Easy
1. **Mutex‑protected counter** – Write a program that spawns `N` threads (user‑specified via command line). Each thread increments a shared counter `M` times using a `pthread_mutex_t`. Verify that the final value equals `N·M`. Use `clock_gettime` to report elapsed time and compute operations per second.  
   *Goal:* Understand basic locking overhead.

2. **Error‑checking wrapper** – Implement a macro `PHT_CALL(fn)` that invokes a pthread function, checks its return code, and on failure prints `fn: %s\n` with `strerror(errno)` before calling `exit(EXIT_FAILURE)`. Apply it to all pthread calls in Exercise 1.  
   *Goal:* Instill disciplined error handling.

### Medium
3. **Producer‑Consumer with semaphores** – Replace the mutex/condvar solution in Worked Example 2 with a counting semaphore for empty slots (`sem_empty`) and a counting semaphore for filled slots (`sem_full`), plus a mutex for the buffer indices. Use `sem_init`, `sem_wait`, `sem_post`.  
   *Goal:* Learn semaphore semantics and avoid condition‑variable pitfalls.

4. **Read‑Write lock** – Build a simple readers‑writer lock using a mutex, a condition variable, and a reader count. Writers must have exclusive access; readers may proceed concurrently when no writer is active. Test with a workload where readers outnumber writers 10:1 and measure throughput.  
   *Goal:* Explore lock variants and fairness considerations.

### Hard
5. **Lock‑free stack** – Implement a singly‑linked stack where `push` and `pop` use `atomic_compare_exchange_weak` on a `std::atomic<Node*> top`. Apply the ABA‑mitigation technique of a double‑width counter (pointer + tag) using `uint128_t` via `__int128` on x86_64 or `pthread_mutex`‑protected fallback if unavailable. Validate correctness under heavy contention with `N` threads each performing 1M mixed push/pop ops.  
   *Goal:* Master atomic primitives, memory ordering, and the ABA problem.

6. **False‑sharing detection** – Create an array of `N` counters, each padded to either 0 bytes or 64 bytes. Launch `N` threads each incrementing its own counter 10M times. Measure execution time for both padded and unpadded versions on a machine with known cache line size (run `getconf LEVEL1_DCACHE_LINESIZE`). Report the slowdown factor.  
   *Goal:* Connect hardware layout to software performance.

## Linux Connection
### Thread Management Subsystems
* **NPTL (Native POSIX Thread Library)** – The glibc implementation of `pthread*` that relies on the `clone` syscall and futexes for synchronization.  
* **`/proc/<pid>/task/`** – Directory containing a subdirectory for each thread (identified by its thread ID, obtainable via `syscall(SYS_gettid)`). Each subdirectory holds `status`, `cmdline`, and `fd/` links useful for introspection.  
* **`futex` syscall** – Fast userspace mutexes; exposed indirectly via glibc but can be invoked directly for custom synchronization.  
* **`perf`** – Tool to measure hardware events; `perf stat -e cache-misses,cache-references,cycles,instructions ./a.out` reveals the impact of false sharing or lock contention.

### Shared Memory Facilities
| Mechanism | API | Typical Use | Example Command |
|-----------|-----|-------------|-----------------|
| **POSIX shm** | `shm_open`, `ftruncate`, `mmap`, `munmap`, `shm_unlink` | Preferred for mmap‑style shared regions; survives `fork`. | ```bash\nshm_fd=$(shm_open /myshm O_CREAT|O_RDWR 0600)\nftruncate $shm_fd 4096\nmmapped=$(mmap -p $shm_fd 0 4096 PROT_READ|PROT_WRITE MAP_SHARED)\n# write via $mmapped\nmunmap $mmapped 4096\nshm_unlink /myshm\n``` |
| **System V shm** | `shmget`, `shmat`, `shmdt`, `shmctl` | Legacy IPC; useful when interacting with older tools like `ipcs`. | ```bash\nshmid=$(shmget -u 0666 4096)   # create 4 KB segment\naddr=$(shmat $shmid 0)        # attach\n# read/write via $addr\nshmdt $addr\nshmctl $shmid IPC_RMID       # delete\n``` |
| **tmpfs mount** | `mount -t tmpfs -o size=64M tmpfs /mnt/mytmp` | Filesystem‑backed shared memory; appears as regular files. | ```bash\nmkdir -p /mnt/mytmp\nmount -t tmpfs -o size=64M tmpfs /mnt/mytmp\n# create files under /mnt/mytmp\numount /mnt/mytmp\n``` |

### Demonstration: Measuring Mutex Overhead with `perf`
```bash
# compile a tight mutex loop
gcc -O2 -pthread -o mutex_loop mutex_loop.c
# run perf to count uncontended lock/unlock cycles
perf stat -e cycles,instructions,cache-references,cache-misses ./mutex_loop 10000000
```
Typical output on an Intel Xeon shows ~30 cycles per lock pair, confirming the fast‑path futex cost.

## Why This Matters
Threads and shared memory are the primitives that let software exploit the parallel hardware inside every modern server, desktop, and even smartphone. Mastery of them yields measurable gains:

* **Scalability:** Amdahl’s law shows that the speedup `S(N) = 1 / ((1‑p) + p/N)`, where `p` is the fraction of time spent in parallelizable work. If synchronization introduces a serial overhead `T_sync` per operation, the effective parallel fraction shrinks: `p_eff = T_work / (T_work + T_sync)`. Reducing `T_sync` from a heavyweight mutex (~200 ns) to a futex‑based uncontended lock (~30 ns) can raise `p_eff` from 0.6 to 0.9, turning a 2× speedup on 4 cores into a 3.5× speedup.
* **Energy Efficiency:** Fewer cache line transfers mean lower DRAM bandwidth and less power wasted on coherence traffic. In data‑centers, a 10 % reduction in coherence traffic can translate to megawatts saved at scale.
* **Correctness as Performance:** Proper use of condition variables eliminates busy‑waiting, which would otherwise spin CPU cycles uselessly. A well‑designed producer‑consumer pair with blocking waits can achieve near‑zero CPU usage when idle, whereas a naïve spin loop wastes 100 % of a core.
* **Portability to Linux‑Specific Optimizations:** Knowing that NPTL uses futexes lets you choose `pthread_mutex_trylock` for adaptive spinning, or `pthread_cond_timedwait` to bound latency. Understanding `/proc/<pid>/task/` enables runtime monitoring tools that detect thread‑starvation or runaway stack growth without external profilers.

In short, the concepts in this lesson are not academic abstractions; they are the levers that turn a correct program into a fast, scalable, and efficient Linux application. Master them, and you will be able to reason about contention, design lock‑free data structures when needed, and wield the kernel’s threading interfaces with confidence.
