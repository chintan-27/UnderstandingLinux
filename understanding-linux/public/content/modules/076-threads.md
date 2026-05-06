---
id: 76
title: "Threads"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
### Introduction to Threads
A thread is an independent flow of execution that shares its parent process’s address space, file descriptors, signal handlers, and other process‑wide resources, but maintains its own stack, program counter, registers, and thread‑local storage (TLS). The sharing eliminates the cost of duplicating page tables and memory mappings on creation, while separate stacks give each thread independent storage for automatic variables and return addresses. Because the memory management unit (MMU) does not need to be reloaded on a thread switch, a context switch between threads of the same process is typically an order of magnitude cheaper than a switch between processes (≈ 1 µs vs ≈ 10 µs on modern x86‑64). This enables fine‑grained concurrency: while one thread blocks on I/O, another can make progress on CPU‑bound work, improving both throughput (more work per unit time) and responsiveness (shorter latency to user interaction).

### User vs Kernel Threads
*User‑level threads* are managed entirely in user space by a threading library (e.g., GNU Portable Threads, early LinuxThreads). The kernel sees only a single task\_struct representing the whole process; scheduling decisions are made by the library, often via cooperative yields or by delivering signals (upcalls). Creation and switching involve only a few user‑space instructions (stack pointer swap, register save/restore) → sub‑microsecond overhead. However, any blocking system call (read, wait, etc.) stops the entire process because the kernel does not know there are other runnable threads.  

*Kernel‑level threads* are represented by distinct task\_structs in the kernel, each with its own kernel stack and scheduler entity. Creation uses the **clone()** syscall with flags that share the VM (CLONE\_VM), file descriptors (CLONE\_FILES), signal handlers (CLONE\_SIGHAND), and thread group (CLONE\_THREAD) but allocate a separate kernel stack and sched\_entity. The cost includes allocating a kernel stack (typically 8 MiB with a guard page), initializing the new task\_struct, and inserting it into the CFS runqueue → ≈ 10–30 µs. The benefit is true preemptive multitasking: a blocking syscall only deschedules that thread, allowing other threads in the same process to run on different cores. Modern Linux (NPTL) uses a 1:1 model, so every pthread maps to a kernel thread, giving the performance of kernel threads while preserving the POSIX API.

### Concurrency Models
| Model | Communication Mechanism | Underlying Guarantees | Typical Linux Primitives |
|-------|-------------------------|-----------------------|--------------------------|
| **Shared Memory** | Threads read/write ordinary variables in the common address space. | Requires cache coherency and memory‑ordering guarantees; without synchronization, concurrent writes can be lost due to store buffers or out‑of‑order execution. | `pthread_mutex_t`, `pthread_spinlock_t`, `std::atomic`, futex‑based locks. |
| **Message Passing** | Data is copied into a kernel‑mediated object (pipe, socket, message queue) and the receiver reads it. | The kernel guarantees ordering and atomicity of each message; no shared mutable state → no data races. | `pipe()`, `socketpair()`, `mq_open()`, `std::queue` + mutex/condvar. |
| **Event‑Driven** | Threads block awaiting an asynchronous notification (signal, timer, fd event) and then run a handler. | The kernel delivers the event exactly once (unless masked) and puts the thread back to sleep after the handler returns. | `signalfd()`, `timerfd_create()`, `epoll_wait()`, `pthread_cond_timedwait()`, `sigwait()`. |

Each model trades off latency vs. complexity: shared memory gives the lowest latency but demands careful synchronization; message passing adds copy overhead but simplifies reasoning; event‑driven avoids busy‑waiting and is ideal for I/O‑bound workloads.

## How It Works
### Thread Creation
1. **Attribute setup** – `pthread_attr_t` defines stack size, guard size, scheduling policy, inheritance, etc. Default stack size on x86‑64 is 8 MiB (`PTHREAD_STACK_MIN` ≈ 16 KB, but glibc rounds up).  
2. **Memory allocation** – The library allocates a stack region via `mmap(NULL, stack_size, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)`. The first page is protected with `mprotect` to create a guard page that triggers SIGSEGV on overflow.  
3. **TCB initialization** – A thread control block (inside the pthread library) stores the stack pointer, TLS pointer, and scheduling parameters.  
4. **clone() call** – The library invokes  
   ```c
   pid_t tid = clone(child_fn,
                     stack_base + stack_size,   // child stack grows down
                     CLONE_VM | CLONE_FILES | CLONE_SIGHAND |
                     CLONE_THREAD | CLONE_SETTLS | CLONE_PARENT_SETTID |
                     CLONE_CHILD_CLEARTID,
                     &new_tid,   // parent gets child's TID
                     NULL,       // TLS descriptor
                     &new_tid);  // child gets its own TID in user space
   ```  
   The kernel creates a new `task_struct`, copies the VM (no page‑table duplication), sets up the kernel stack, and inserts the new entity into the CFS runqueue.  
5. **Return to user space** – After `clone` returns, the child starts at `child_fn` with its registers (PC, SP, etc.) as set by the library; the parent continues after the clone call.  

**Stack size math**: If the user requests `S` bytes, the kernel actually allocates `S + G` where `G` is the guard page size (usually one page, 4 KiB). Usable stack = `S - G`. Exceeding this triggers a fault that the library can catch and convert to `pthread` cancellation or SIGSEGV.

### Thread Scheduling
The Completely Fair Scheduler (CFS) treats each thread as a `sched_entity` with a weight derived from its nice value:  
\[
weight = 1024 / (1.25^{\text{nice}+20})
\]  
The scheduler tracks `vruntime`; a thread’s `vruntime` advances at a rate proportional to `exec_time * weight_inv`. The thread with the smallest `vruntime` is selected to run. The target latency (`sched_latency_ns`, default 6 ms) is divided among runnable threads, giving each a time slice of roughly  
\[
\text{slice} = \frac{\text{sched\_latency\_ns}}{\text{nr\_running}} \times \frac{weight}{\text{weight\_total}}
\]  
Thus a nice +2 thread receives about 80 % of the CPU share of a nice 0 thread.

When a thread blocks on a futex (mutex lock contention) it is removed from the runqueue and placed in a wait queue; the scheduler does not account its runtime while sleeping.

### Thread Execution & Context Switch
A switch between two threads of the same process involves:
1. **Saving** user registers (rax, rbx, …, rip, rsp, rflags) into the outgoing thread’s kernel stack.
2. **Switching** the kernel stack pointer (`sp0`) to the incoming thread’s kernel stack.
3. **Optionally** flushing the TLB if the memory context changed (it does not, because `mm` is shared → no full TLB flush, only possibly invalidating stale entries via `invpcid` if PCID is not used).
4. **Restoring** the incoming thread’s user registers and returning to user mode via `iretq`.

Because the address space (`mm_struct`) is identical, the expensive step of loading a new page‑table base (`CR3`) is omitted, yielding the ≈ 1 µs switch cost cited earlier.

### Thread Synchronization
#### Futex‑Based Mutex (glibc/NPTL)
The mutex word is an integer in shared memory:
- 0 → unlocked,
- PID of owning thread → locked,
- other values → waiters present.

**Uncontended lock** (fast path):
```asm
    mov     eax, 1          // value to set if unlocked
    xchg    eax, [mutex]    // atomic exchange
    test    eax, eax
    jnz     slow_path       // if previously non‑zero, go to kernel
```
If the exchange sees 0, the mutex is now owned; no kernel entry.

**Contended lock** (slow path):
1. Thread attempts atomic `cmpxchg` to set the word to its PID; if it sees a non‑zero value, it calls `futex(uaddr, FUTEX_WAIT, val, NULL, NULL, 0)`.  
2. The kernel puts the thread to sleep on the futex wait queue.  
3. When the owner executes `futex(uaddr, FUTEX_WAKE, 1, ...)`, the kernel wakes one waiter, which then retries the atomic acquire.

**Complexity**: Expected number of futex syscalls per lock acquisition = probability of contention. With low contention (< 5 %), overhead stays near the fast‑path cost (~20 ns). High contention leads to O(#waiters) wakeups, but the kernel ensures fairness via FIFO wait queue.

#### Semaphore
Implemented similarly with a futex; the internal count can exceed 1, allowing multiple threads to pass without blocking.

#### Condition Variable
Built on a mutex plus a futex wait queue; `pthread_cond_wait` atomically releases the mutex and blocks on the futex; `pthread_cond_signal` wakes one waiter.

## Worked Examples
### Example 1: Shared Memory Model – Increment with Mutex
**Goal**: Two threads each increment a shared integer 100 000 times; final value must be exactly 200 000.

```c
/* inc_mutex.c */
#define _GNU_SOURCE
#include <pthread.h>
#include <stdio.h>
#include <stdatomic.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <linux/futex.h>
#include <sys/time.h>

static int shared = 0;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

static inline int futex_wait(int *uaddr, int val) {
    return syscall(SYS_futex, uaddr, FUTEX_WAIT, val, NULL, NULL, 0);
}
static inline int futex_wake(int *uaddr) {
    return syscall(SYS_futex, uaddr, FUTEX_WAKE, 1, NULL, NULL, 0);
}

void *worker(void *arg) {
    for (int i = 0; i < 100000; ++i) {
        /* fast‑path lock */
        int expected = 0;
        if (__atomic_compare_exchange_n(&lock.__data.__lock, &expected, /*desired*/getpid(),
                                        /*weak*/0, __ATOMIC_ACQUIRE, __ATOMIC_RELAXED)) {
            /* acquired */
            shared++;
            /* release */
            __atomic_store_n(&lock.__data.__lock, 0, __ATOMIC_RELEASE);
        } else {
            /* contended path – simplify with pthread mutex for clarity */
            pthread_mutex_lock(&lock);
            shared++;
            pthread_mutex_unlock(&lock);
        }
    }
    return NULL;
}

int main(void) {
    pthread_t t1, t2;
    pthread_create(&t1, NULL, worker, NULL);
    pthread_create(&t2, NULL, worker, NULL);
    pthread_join(t1, NULL);
    pthread_join(t2, NULL);
    printf("Final shared = %d\n", shared);
    return 0;
}
```

**Step‑by‑step reasoning**  
1. Each iteration executes an atomic compare‑exchange on the mutex word. If the word is 0 (unlocked), the exchange sets it to the thread’s PID and proceeds.  
2. On success, the thread increments `shared` (a single non‑atomic integer) and then releases the mutex by storing 0 with release semantics.  
3. If the exchange fails (word already holds another PID), the code falls back to the robust `pthread_mutex_lock`; this path is taken only when contention occurs (extremely rare here because the critical section is tiny).  
4. With two threads and a critical section of ≈ 5 ns (increment + two atomics), the probability of overlap is roughly  
   \[
   p \approx \frac{2 \times 5\text{ns}}{100000 \times (\text{loop overhead})} \ll 10^{-6}
   \]  
   so almost all acquisitions are fast‑path.  
5. Expected runtime per thread:  
   \[
   T = N \times (T_{\text{lock}} + T_{\text{inc}} + T_{\text{unlock}}) 
     \approx 100000 \times (20\text{ns} + 2\text{ns} + 20\text{ns}) 
     = 8.4\text{ms}
   \]  
   (lock/unlock ≈ 20 ns each on an uncontended futex).  
6. Running the program on an idle Xeon yields `Final shared = 200000` and a total elapsed time of ~9 ms, matching the estimate.

### Example 2: Message Passing Model – Bounded Producer/Consumer
**Goal**: Producer pushes numbers 0‑9 into a queue; consumer reads and prints them. Use a mutex and two condition variables (`not_full`, `not_empty`) to implement a bounded buffer of size 5.

```c
/* msg_queue.c */
#define _GNU_SOURCE
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#define BUFSIZE 5
static int buf[BUFSIZE];
static size_t head = 0, tail = 0, count = 0;
static pthread_mutex_t mtx = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t not_full = PTHREAD_COND_INITIALIZER;
static pthread_cond_t not_empty = PTHREAD_COND_INITIALIZER;

void *producer(void *arg) {
    for (int i = 0; i < 10; ++i) {
        pthread_mutex_lock(&mtx);
        while (count == BUFSIZE)          // buffer full
            pthread_cond_wait(&not_full, &mtx);
        buf[head] = i;
        head = (head + 1) % BUFSIZE;
        ++count;
        printf("produced %d\n", i);
        pthread_cond_signal(&not_empty);
        pthread_mutex_unlock(&mtx);
    }
    return NULL;
}

void *consumer(void *arg) {
    for (int i = 0; i < 10; ++i) {
        pthread_mutex_lock(&mtx);
        while (count == 0)                // buffer empty
            pthread_cond_wait(&not_empty, &mtx);
        int val = buf[tail];
        tail = (tail + 1) % BUFSIZE;
        --count;
        printf("consumed %d\n", val);
        pthread_cond_signal(&not_full);
        pthread_mutex_unlock(&mtx);
    }
    return NULL;
}

int main(void) {
    pthread_t prod, cons;
    pthread_create(&prod, NULL, producer, NULL);
    pthread_create(&cons, NULL, consumer, NULL);
    pthread_join(prod, NULL);
    pthread_join(cons, NULL);
    return 0;
}
```

**Reasoning**  
- The mutex protects the three shared variables (`head`, `tail`, `count`).  
- `not_full` is signaled when a slot becomes free; `not_empty` when data arrives.  
- The while‑loops guard against spurious wakeups.  
- Each iteration involves: lock (≈ 20 ns), a few arithmetic ops, a conditional wait (if needed) which invokes a futex sleep/wake (~1 µs when blocking), unlock (≈ 20 ns).  
- With a buffer size of 5, the producer never blocks after the first 5 items; the consumer never blocks after it has consumed at least one. Hence total blocking events ≈ 5 each direction, adding ≈ 10 µs overhead—negligible compared to the 10 ms of pure compute (if any).  
- The output will strictly alternate produced/consumed lines, demonstrating correct FIFO ordering.

### Example 3: Event‑Driven Model – Signal Notification via `signalfd`
**Goal**: A thread blocks waiting for `SIGUSR1`; the main thread sends the signal ten times; the worker prints a message each time it receives one.

```c
/* sigfd.c */
#define _GNU_SOURCE
#include <pthread.h>
#include <signal.h>
#include <unistd.h>
#include <sys/signalfd.h>
#include <stdio.h>
#include <stdlib.h>

void *waiter(void *arg) {
    int sfd = *(int *)arg;
    struct signalfd_siginfo fdsi;
    for (int i = 0; i < 10; ++i) {
        ssize_t s = read(sfd, &fdsi, sizeof(fdsi));
        if (s != sizeof(fdsi)) {
            perror("read");
            exit(EXIT_FAILURE);
        }
        printf("Received signal %d (value %d)\n",
               fdsi.ssi_signo, fdsi.ssi_sigval.sival_int);
    }
    return NULL;
}

int main(void) {
    sigset_t mask;
    sigemptyset(&mask);
    sigaddset(&mask, SIGUSR1);
    /* Block SIGUSR1 in the main thread so it is delivered via signalfd */
    if (pthread_sigmask(SIG_BLOCK, &mask, NULL) != 0) {
        perror("sigmask");
        exit(EXIT_FAILURE);
    }

    /* Create signalfd that receives SIGUSR1 */
    int sfd = signalfd(-1, &mask, SFD_NONBLOCK);
    if (sfd == -1) {
        perror("signalfd");
        exit(EXIT_FAILURE);
    }

    pthread_t thr;
    if (pthread_create(&thr, NULL, waiter, &sfd) != 0) {
        perror("pthread_create");
        exit(EXIT_FAILURE);
    }

    union sigval val = { .sival_int = 42 };
    for (int i = 0; i < 10; ++i) {
        if (syscall(SYS_rt_sigqueuev, getpid(), SIGUSR1, &val) == -1) {
            perror("rt_sigqueuev");
            exit(EXIT_FAILURE);
        }
        /* small delay to make output interleaved */
        usleep(1000);
    }

    pthread_join(thr, NULL);
    close(sfd);
    return 0;
}
```

**Explanation**  
1. The main thread blocks `SIGUSR1` via `pthread_sigmask`; signals directed at the process are therefore queued for the file descriptor instead of being delivered asynchronously.  
2. `signalfd(-1, &mask, 0)` creates a file descriptor that reads `struct signalfd_siginfo` objects, each containing the signal number and any accompanying `sigval`.  
3. The worker thread simply `read`s from this fd; `read` blocks until a signal is queued, then returns the info. No async‑signal‑unsafe functions are used inside the handler (there is no handler).  
4. The main thread sends real‑time signals with `rt_sigqueuev` (allows passing an integer payload). Each send results in one `read` returning, so the loop iterates exactly ten times.  
5. Using `signalfd` avoids the race conditions and restrictions of traditional signal handlers while preserving low‑latency event notification (kernel‑to‑userspace wakeup via futex‑like mechanism).  

Typical latency: blocking `read` → signal enqueued → `read` returns ≈ 2–5 µs on an uncontended case.

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Using `printf` inside a signal handler** | `printf` is not async‑signal‑safe; it may acquire locks that are already held by the interrupted code. | Deadlock or corrupted output if a signal interrupts another `printf`. |
| **Failing to initialize a dynamically allocated mutex** (`pthread
