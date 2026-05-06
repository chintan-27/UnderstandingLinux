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

## Core Concepts
### Critical Sections and Race Conditions
A **critical section** is any code segment that accesses shared mutable state (variables, files, devices, kernel structures). When two or more threads execute critical sections concurrently, the interleaving of their reads and writes can produce **race conditions**—observable outcomes that depend on the exact timing of scheduling. Formally, if a shared variable *x* is read by thread *T₁* and later written by *T₂*, a race exists when there is an execution where *T₁*’s read occurs after *T₂*’s write but before *T₁*’s subsequent write that depends on the original value. The only way to eliminate races is to enforce **mutual exclusion**: at most one thread may be inside the critical section at any time.

### Mutual Exclusion Primitives
Synchronization primitives provide the hardware‑backed mechanisms to achieve mutual exclusion while also guaranteeing **progress** (if no thread is in the critical section, some thread attempting to enter will eventually succeed) and **bounded waiting** (there is a bound on how many times other threads can enter before a waiting thread gets its turn).

| Primitive | Abstract State | Core Operation(s) | Typical Use |
|-----------|----------------|-------------------|-------------|
| **Mutex (binary lock)** | `{locked, unlocked}` | `lock()` → block until unlocked then set to locked;<br>`unlock()` → set to unlocked and wake a waiter | Protect a single resource |
| **Counting Semaphore** | non‑negative integer *C* | `wait()` → if *C>0* decrement and proceed; else block until *C>0* then decrement<br>`post()` → increment *C* and wake one waiter (if any) | Limit concurrent access to a pool of *N* resources |
| **Condition Variable** | queue of waiting threads + associated predicate | `wait(lock)` → atomically release *lock* and enqueue thread;<br>`signal()` → dequeue and wake one waiter (if any);<br>`broadcast()` → wake all waiters | Block until a condition becomes true; always used with a mutex |
| **Monitor** | mutex + zero or more condition variables | Encapsulates a shared resource; all public methods acquire the mutex implicitly; condition variables provide waiting/signalling | High‑level structuring of concurrent access |
| **Atomic Operation** | single memory word | `fetch_add`, `compare_and_swap`, `load_link/store_conditional` executed as one indivisible transaction (no intervening memory accesses from other cores) | Build locks, semaphores, reference counters, lock‑free data structures |

### Why Hardware Support Is Needed
Software‑only solutions (e.g., Peterson’s algorithm) rely on strict **sequential consistency** and a bounded number of threads; they fail on modern out‑of‑order, multicore CPUs because stores may be delayed and loads may be reordered. Atomic RMW (read‑modify‑write) instructions such as **test-and-set**, **compare-and-swap (CAS)**, and **load-link/store-conditional (LL/SC)** provide a *single* instruction that reads a word, computes a new value, and writes it back, guaranteeing that no other core can observe the intermediate state. Memory‑ordering semantics (acquire/release) then ensure that effects before the acquire become visible after the lock is taken, and effects before the release become visible before the lock is freed.

---

## How It Works
### From Atomic Primitives to Blocking Locks
A naïve spinlock using test‑and‑set:

```c
typedef struct { volatile int flag; } spinlock_t;
static inline void spin_lock(spinlock_t *l) {
    while (__atomic_test_and_set(&l->flag, __ATOMIC_ACQUIRE)) /* spin */ ;
}
static inline void spin_unlock(spinlock_t *l) {
    __atomic_clear(&l->flag, __ATOMIC_RELEASE);
}
```

*Why it works*: `__atomic_test_and_set` atomically reads `flag`, writes 1, and returns the old value. If the old value was 0, the lock was free and we now own it; otherwise we retry. The `__ATOMIC_ACQUIRE` on success prevents subsequent memory accesses from being reordered before the lock acquisition; `__ATOMIC_RELEASE` on unlock prevents prior stores from being reordered after the unlock.

**Cost analysis**. Let *p* be the probability the lock is held by another thread at the instant we test. The expected number of iterations is a geometric series:

$$
E[\text{spins}] = \sum_{k=0}^{\infty} k (1-p)^k p = \frac{1-p}{p}
$$

If each spin costs *Tₛ* cycles, expected wait time is $E[W] = \frac{1-p}{p} Tₛ$. When contention is low (*p* ≪ 1) this is acceptable; when *p* → 1 the waste grows without bound, motivating **blocking** locks that relinquish the CPU.

### Futex‑Based Blocking Mutex (Linux)
Linux provides the **futex** (fast userspace mutex) syscall. A simple robust mutex consists of:

* a 32‑bit integer *state*:
  * 0 = unlocked
  * tid of owning thread (>0) = locked
  * -1 = unlocked with waiters pending
* `lock()`:
  1. Try CAS from 0 to my‑tid (`__atomic_compare_exchange`). Success → owned.
  2. If CAS fails because state ≠ 0, call `futex(state, FUTEX_WAIT, tid, NULL, NULL, 0)`. The kernel puts the thread to sleep **only** if *state* still equals the observed value (prevents lost wake‑up).
* `unlock()`:
  1. Set state to 0.
  2. If state had waiters (detected by checking before the store), wake one with `futex(state, FUTEX_WAKE, 1, NULL, NULL, 0)`.

This yields **O(1)** uncontended acquisition/release and a kernel‑mediated sleep only when needed.

### Semaphores via Futex
A counting semaphore can be built with an atomic integer *cnt*:

```c
int sem_wait(sem_t *s) {
    while (1) {
        int v = __atomic_load_n(&s->cnt, __ATOMIC_ACQUIRE);
        if (v > 0) {
            if (__atomic_compare_exchange_n(&s->cnt, &v, v-1,
                                            false, __ATOMIC_ACQUIRE, __ATOMIC_RELAXED))
                return 0; // acquired
            // else retry
        } else {
            // block via futex
            syscall(SYS_futex, &s->cnt, FUTEX_WAIT, v, NULL, NULL, 0);
        }
    }
}
int sem_post(sem_t *s) {
    int v = __atomic_fetch_add(&s->cnt, 1, __ATOMIC_RELEASE);
    if (v < 0) // there were waiters
        syscall(SYS_futex, &s->cnt, FUTEX_WAKE, 1, NULL, NULL, 0);
    return 0;
}
```

The **memory order** on the increment is *release* so that any writes before `post` become visible to the waiter after it observes the increment.

### Condition Variables
A condition variable couples a mutex with a kernel wait queue. Pseudocode (simplified):

```c
int cond_wait(pthread_cond_t *c, pthread_mutex_t *m) {
    int ret = pthread_mutex_unlock(m); // release mutex
    if (ret) return ret;
    // enqueue on c’s wait queue, block until woken
    ret = syscall(SYS_futex, &c->seq, FUTEX_WAIT, c->seq, NULL, NULL, 0);
    pthread_mutex_lock(m); // reacquire before returning
    return ret;
}
int cond_signal(pthread_cond_t *c) {
    __atomic_fetch_add(&c->seq, 1, __ATOMIC_RELEASE);
    return syscall(SYS_futex, &c->seq, FUTEX_WAKE, 1, NULL, NULL, 0);
}
```

The **seq** counter prevents the lost‑wake‑up problem: a thread checks the sequence number before sleeping; if a signal occurred in the interim, the seq will have changed and the futex call returns immediately.

### Monitors
A monitor is merely a disciplined use of a mutex + condition variables. All public methods implicitly lock the mutex at entry and unlock at exit; condition variables provide the waiting/signalling mechanism. This encapsulation eliminates the common mistake of forgetting to unlock on early returns.

---

## Worked Examples
### Example 1: Bank Transfer with Mutex Lock Ordering (Deadlock Avoidance)
Two accounts *A* and *B* each have a balance and a mutex. To transfer *x* from *A* to *B* we must lock both accounts. Locking in a *consistent global order* (e.g., by address) prevents deadlock.

```c
typedef struct {
    pthread_mutex_t lock;
    long balance;
} account_t;

void transfer(account_t *from, account_t *to, long amount) {
    // impose a total order: lock the lower address first
    pthread_mutex_t *first  = (uintptr_t)from < (uintptr_t)to ? &from->lock : &to->lock;
    pthread_mutex_t *second = (uintptr_t)from < (uintptr_t)to ? &to->lock   : &from->lock;

    pthread_mutex_lock(first);
    pthread_mutex_lock(second);   // now we hold both, no other thread can deadlock

    if (from->balance < amount) {
        pthread_mutex_unlock(second);
        pthread_mutex_unlock(first);
        return; // insufficient funds
    }
    from->balance -= amount;
    to->balance   += amount;

    pthread_mutex_unlock(second);
    pthread_mutex_unlock(first);
}
```

**Step‑by‑step reasoning**:
1. Determine order by comparing pointers—this is deterministic and thread‑independent.
2. Acquire the first mutex; if another thread holds the second mutex, it will block on the first, preventing circular wait.
3. After both locks are held, the critical section accesses both balances atomically relative to other threads.
4. Release locks in reverse order (not strictly required but conventional).

*Why this matters*: Without ordering, two threads could each lock one account and then wait forever for the other, producing a classic deadlock.

### Example 2: Bounded Thread Pool with a Counting Semaphore
A server spawns worker threads that process incoming connections. We limit concurrent processing to **N = 4** using a semaphore initialized to 4.

```c
#define MAX_WORKERS 4
static sem_t worker_sem;

void *worker(void *arg) {
    int conn = *(int *)arg;
    sem_wait(&worker_sem);          // acquire a permit
    /* ---- critical section: handle connection ---- */
    char buf[256];
    ssize_t n = read(conn, buf, sizeof(buf));
    if (n > 0) write(conn, buf, n);
    close(conn);
    /* ---- end critical section ---- */
    sem_post(&worker_sem);          // release permit
    return NULL;
}

int main(void) {
    sem_init(&worker_sem, 0, MAX_WORKERS);
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    /* bind/listen omitted for brevity */
    while (1) {
        int conn = accept(listen_fd, NULL, NULL);
        pthread_t tid;
        pthread_create(&tid, NULL, worker, &conn);
        pthread_detach(tid);
    }
}
```

**Quantitative analysis**: Suppose arrivals follow a Poisson process with rate λ = 10 connections/sec, and each connection service time is exponentially distributed with mean μ⁻¹ = 0.2 sec (i.e., service rate μ = 5/sec). The system is an **M/M/4** queue. Utilization ρ = λ / (c·μ) = 10 / (4·5) = 0.5. The expected number in system L = (ρ·(ρ^c)/(c!·(1-ρ))) / ( Σ_{k=0}^{c-1} ρ^k/k! + (ρ^c)/(c!·(1-ρ)) ) ≈ 0.93. Hence average waiting time Wq = L / λ ≈ 0.093 sec — well below the service time, demonstrating that the semaphore effectively caps latency while preventing overload.

### Example 3: Producer‑Consumer Buffer with Condition Variables
A fixed‑size buffer of *N = 10* items is shared between producer and consumer threads. Two condition variables signal *not_full* and *not_empty*.

```c
#define N 10
typedef struct {
    int buf[N];
    size_t head, tail;      // head = next to consume, tail = next to produce
    size_t count;
    pthread_mutex_t mtx;
    pthread_cond_t not_full;
    pthread_cond_t not_empty;
} buffer_t;

void buf_init(buffer_t *b) {
    b->head = b->tail = b->count = 0;
    pthread_mutex_init(&b->mtx, NULL);
    pthread_cond_init(&b->not_full, NULL);
    pthread_cond_init(&b->not_empty, NULL);
}

void buf_put(buffer_t *b, int item) {
    pthread_mutex_lock(&b->mtx);
    while (b->count == N)               // wait for space
        pthread_cond_wait(&b->not_full, &b->mtx);
    b->buf[b->tail] = item;
    b->tail = (b->tail + 1) % N;
    b->count++;
    pthread_cond_signal(&b->not_empty); // wake a consumer
    pthread_mutex_unlock(&b->mtx);
}

int buf_get(buffer_t *b) {
    pthread_mutex_lock(&b->mtx);
    while (b->count == 0)               // wait for data
        pthread_cond_wait(&b->not_empty, &b->mtx);
    int item = b->buf[b->head];
    b->head = (b->head + 1) % N;
    b->count--;
    pthread_cond_signal(&b->not_full);  // wake a producer
    pthread_mutex_unlock(&b->mtx);
    return item;
}
```

**Why the while‑loops?** A thread may wake spuriously or due to a broadcast; re‑checking the predicate guarantees we only proceed when the condition truly holds. The mutex is held during the check and the state update, ensuring the producer and consumer never see an inconsistent `count`.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Fails |
|---------|--------------|--------------|
| **Unlocking the wrong mutex** (e.g., unlocking a mutex that wasn’t locked by the current thread) | Violates ownership semantics; the internal futex state becomes inconsistent. | Other threads may see the lock as free while it is still held, leading to data races or double‑unlock warnings from lockdep. |
| **Neglecting error returns from `pthread_mutex_lock`/`sem_wait`** | Assuming the call always succeeds. | In robust mutexes, `EOWNERDEAD` signals that the previous owner died while holding the lock; ignoring it leaves the invariants broken. |
| **Using a semaphore as a mutex without checking the initial value** | Initializing a counting semaphore to a value > 1 allows multiple threads to enter the “critical section”. | The intended mutual exclusion is violated; only a binary semaphore (value = 1) provides mutex semantics. |
| **Broadcasting on a condition variable when no waiters exist** | Wasted wake‑ups; each wake‑up incurs a kernel transition. | In high‑frequency producers/consumers, this can add measurable overhead (≈ 1‑2 µs per wake‑up on modern x86). |
| **Waiting on a condition variable without re‑testing the predicate after wake‑up** | Susceptible to spurious wake‑ups or missed signals. | The thread may proceed while the condition is still false, corrupting shared state. |
| **Mixing priority inheritance and priority inversion unaware** | A low‑priority thread holding a mutex can block a high‑priority thread indefinitely if a medium‑priority thread preempts it. | Real‑time systems rely on priority‑inheritance mutexes (`PTHREAD_PRIO_INHERIT`) to bound inversion; using plain mutexes can break deadlines. |
| **Assuming `sem_post` never fails** | `sem_post` can overflow if the semaphore’s value exceeds `SEM_VALUE_MAX`. | Overflow wraps to zero, suddenly allowing more threads than intended, breaking resource limits. |

---

## Exercises
### Easy
1. **Spinlock implementation** – Write a C program that uses `__atomic_test_and_set` to implement a spinlock protecting a shared counter. Compile with `-O2 -pthread` and run with 8 threads each incrementing the counter 1 000 000 times; verify the final value equals 8 000 000.

2. **Binary semaphore from mutex** – Using only a `pthread_mutex_t` and a `pthread_cond_t`, implement `sem_wait`/`sem_post` that behave like a counting semaphore with an initial value of 1 (i.e., a mutex). Test with two threads alternating prints.

### Medium
3. **Futex‑based mutex** – Implement the blocking mutex described in the *How It Works* section using the `futex` syscall (`syscall(SYS_futex, ...)`). Compare its throughput against `pthread_mutex_lock` under varying contention (1, 4, 16 threads) using `perf stat`.

4. **Semaphore limiting file‑descriptor usage** – Write a server that accepts TCP connections but uses a semaphore initialized to 25 to restrict the number of concurrent `read`/`write` operations. Use `netcat` to generate load and observe that no more than 25 sockets are active at once (check with `lsof -p <pid>`).

### Hard
5. **Priority‑inheritance mutex** – Modify the futex‑mutex to support priority inheritance by storing the owner’s priority and, on unlock, boosting any waiting higher‑priority threads. Validate with `chrt -f 99 ./prog` and a low‑priority hog thread; measure the blocking time of the high‑priority thread with `tracepoint:sched:sched_switch`.

6. **Read‑copy‑update (RCU) style list** – Build a lock‑free singly‑linked list where readers traverse without locks and updaters use `synchronize_rcu`‑like grace periods via `call_rcu`. Demonstrate that concurrent readers never see a torn pointer while updaters can replace list nodes safely.

---

## Linux Connection
### Kernel Subsystems that Rely on Synchronization
| Subsystem | Protected Resource | Primitive Used (kernel) | Typical Lock Type |
|-----------|--------------------|--------------------------|-------------------|
| **VFS (Virtual File System)** | Inode metadata (`struct inode`) | `i_rwsem` (read‑write semaphore) | `struct rw_semaphore` |
| **Block I/O** | Request queue (`struct request_queue`) | `__queue_lock` | `spinlock_t` |
| **Networking** | Device transmit queue (`struct net_device`) | `xmit_lock` | `spinlock_t` |
| **Scheduler** | Runqueue (`struct rq`) | `rq->lock` | `raw_spinlock_t` |
| **Memory Management** | Page table entries (`pte_t`) | `pte_lock` (per‑pgdat spinlock) | `spinlock_t` |
| **Timer Wheel** | Timer bases (`struct tvec_base`) | `base->lock` | `spinlock_t` |
| **Futex subsystem** | User‑space futex queues | Internal hash table buckets | `spinlock_t` + `wait_queue_head_t` |

#### Concrete Examples
*Reading the global lock statistics*:
```bash
# Show all held locks in the system (requires root or CAP_SYS_ADMIN)
cat /proc/locks
```
Output lines look like:
```
1: POSIX  ADVISORY  WRITE 3214 08:02:12345 12345678
2: FLOCK  ADVISORY  WRITE 3215 08:02:12346 12345679
```
The first column is the lock type, the second the mode, the third the PID, and the hex numbers are the inode and offset.

*Observing spinlock contention with `perf`*:
```bash
# Record spinlock acquire/release events for 5 seconds
sudo perf record -e lock:spin_lock,lock:spin_unlock -a sleep 5
perf report --stdio | head -20
```
You’ll see samples attributed to functions like `_raw_spin_lock_irqsave` in `kernel/sched/core.c` or `net/core/dev.c`.

*Using `flock` from the shell*:
```bash
# Acquire an exclusive lock on file.txt, block until available
flock -x file.txt
# Inside the locked region you can safely modify the file
echo "$(date)" >> file.txt
# Lock is automatically released when the subshell ends
```
`flock` implements advisory locking via the `fcntl(F_SETLK, ...)` system call; the kernel stores the lock in `struct file_lock` attached to the inode’s `i_flock` list.

*Checking futex usage*:
```bash
# Count futex syscalls per second
sudo perf stat -e sys_enter_futex -a sleep 3
```
Typical output shows tens of thousands of futex calls on a busy desktop, confirming that user‑space mutexes and condition variables heavily rely on this kernel primitive.

---

## Why This Matters
Synchronization is the **linchpin
