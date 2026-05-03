---
id: 137
title: "Driver concurrency and synchronization"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A driver runs in a shared environment. Your `read()` handler can be interrupted mid-execution by a hardware IRQ whose handler modifies the same data structure. Two processes can call your `write()` simultaneously on a multi-core machine — not interleaved, but truly parallel. Without synchronization, you get silent data corruption: a counter that loses increments, a linked list with a severed pointer, a buffer with half-written state. These bugs are timing-dependent, rarely reproducible under testing, and catastrophic in production.

The kernel gives you a precise toolkit — but the wrong tool in the wrong context doesn't just cause incorrect behavior, it causes deadlocks or panics. The distinction is not stylistic; it's mechanical.

---

## Core Concepts

### The Two Execution Contexts: Process vs. Atomic

Every piece of kernel code runs in one of two contexts. This distinction is the single most important thing to understand before touching any synchronization primitive.

**Process context**: Code running on behalf of a user process — system calls, `read`/`write` handlers, `ioctl`. The current process is suspended here, so the code is permitted to sleep. Sleeping means the scheduler saves the process's state, places it on a wait queue, and switches to another runnable task.

**Atomic context**: Code that cannot sleep. This includes hardirq handlers, softirqs, tasklets, and any code that holds a spinlock. The CPU cannot be yielded. Calling a sleeping function here causes either a deadlock (the CPU spins forever) or a kernel panic, depending on what the scheduler encounters. The `CONFIG_DEBUG_ATOMIC_SLEEP` kernel option enables runtime detection of this mistake.

The reason sleeping is forbidden in atomic context is mechanical: the scheduler requires a process structure (`struct task_struct`) to block — it needs somewhere to save register state and a wait queue to park the task on. An interrupt handler has no associated task to park. There is no `current` in any meaningful sense.

You can check the current context at runtime:

```c
#include <linux/preempt.h>

if (in_interrupt()) {
    /* hardirq or softirq context — cannot sleep */
}

if (in_atomic()) {
    /* spinlock held, or interrupt context — cannot sleep */
}
```

### Race Conditions and Critical Sections

A **race condition** occurs when the correctness of a result depends on the relative timing of two or more concurrent operations. The region of code that must not execute concurrently is a **critical section**.

The canonical example — a non-atomic increment:

```c
counter++;  /* expands to: load counter; add 1; store counter */
```

On SMP, two CPUs can execute this concurrently. Let $v$ be the initial value. Both CPUs load $v$, both compute $v + 1$, both store $v + 1$. The result is $v + 1$ instead of $v + 2$. If this happens $k$ times across $N$ concurrent increments, you observe $N - k$ instead of $N$: a **lost update** of magnitude $k$.

More precisely, if $T$ threads each perform $n$ increments without synchronization, the final value is bounded:

$$\max(n,\, T) \leq \text{result} \leq T \cdot n$$

The lower bound $\max(n, T)$ is the worst case where all but one increment from each thread is lost. You cannot reason about which bound you'll actually hit — it depends on scheduling, cache state, and core count.

### Locks: Semaphores vs. Spinlocks

The choice of lock is determined entirely by context:

| | Semaphore / Mutex | Spinlock |
|---|---|---|
| Can sleep? | Yes | **No** |
| Use in IRQ handler? | No | Yes (with IRQ-safe variant) |
| Contention behavior | Sleeps, yields CPU | Burns CPU in a loop |
| Suitable for | Long critical sections, I/O | Short critical sections, IRQ paths |

**Semaphore**: A counter with two operations. `down()` decrements; if the result would go negative, the calling process sleeps on a wait queue. `up()` increments and wakes one waiter. A binary semaphore (initialized to 1) behaves as a mutex. The kernel's preferred mutex type is `struct mutex`, which is lighter than a semaphore and includes debugging support under `CONFIG_DEBUG_MUTEXES`.

```c
#include <linux/mutex.h>

static DEFINE_MUTEX(my_mutex);

mutex_lock(&my_mutex);
/* critical section — process context only */
mutex_unlock(&my_mutex);
```

**Spinlock**: A single bit. A CPU trying to acquire a held spinlock loops — *spins* — reading the bit until it clears. This burns cycles, so critical sections under spinlocks must be short: ideally a handful of instructions. On a uniprocessor kernel with preemption disabled, acquiring a spinlock reduces to disabling preemption — there is no other CPU to be racing with, and the IRQ path is handled separately.

```c
#include <linux/spinlock.h>

static DEFINE_SPINLOCK(my_lock);

spin_lock(&my_lock);
/* critical section — no sleeping */
spin_unlock(&my_lock);
```

### IRQ-Safe Locking

If a spinlock is acquired in process context *and* in an interrupt handler sharing the same CPU, you have a guaranteed deadlock: process context acquires the lock, an IRQ fires on that same CPU, the IRQ handler tries to acquire the same lock, spins forever — waiting for process context to release a lock that can never be released because the CPU is stuck in the handler.

The solution is to disable IRQs on the local CPU for the duration of the critical section:

```c
unsigned long flags;

spin_lock_irqsave(&my_lock, flags);
/* critical section — IRQs disabled on this CPU */
spin_unlock_irqrestore(&my_lock, flags);
```

`irqsave` saves the current CPU flags register (which encodes the IRQ-enable bit) into `flags` before disabling interrupts. `irqrestore` writes that saved value back — if IRQs were already disabled when you entered, they remain disabled when you leave. This is essential in code paths that can be called from both IRQ-disabled and IRQ-enabled contexts.

Do not use `spin_lock_irq()` (which unconditionally re-enables IRQs on unlock) in a code path that might already have IRQs disabled — it will silently re-enable them when you release, corrupting the caller's interrupt state.

### Atomic Operations

For a single integer variable, you can avoid locks entirely with `atomic_t`, which maps to CPU instructions the hardware guarantees are indivisible — no other CPU observes a partial update.

```c
#include <linux/atomic.h>

atomic_t refcount = ATOMIC_INIT(0);

atomic_inc(&refcount);                        /* indivisible increment */
atomic_dec(&refcount);                        /* indivisible decrement */
int zero = atomic_dec_and_test(&refcount);    /* returns 1 if result == 0 */
int val  = atomic_read(&refcount);            /* barrier-aware read */
```

For 64-bit values, use `atomic64_t` and the corresponding `atomic64_*` operations.

**Critical limitation**: atomicity applies to one variable, one operation. If you need consistency *across* two variables — say, transferring a count from one `atomic_t` to another — `atomic_sub` on the source and `atomic_add` on the destination are two separate atomic operations with a window between them. An observer reading both variables in that window sees an inconsistent state. This requires a real lock.

For bitfields, the kernel provides `set_bit()`, `clear_bit()`, and `test_and_set_bit()`, all of which are atomic and can replace locks for flag bytes:

```c
#include <linux/bitops.h>

unsigned long flags_word = 0;

set_bit(0, &flags_word);               /* atomically set bit 0 */
int was_set = test_and_set_bit(1, &flags_word);  /* returns old value */
```

### Wait Queues and Sleeping

A **wait queue** is a list of sleeping processes waiting for a condition to become true. This is the kernel's mechanism for blocking I/O in drivers.

```c
#include <linux/wait.h>

static DECLARE_WAIT_QUEUE_HEAD(my_queue);
static int data_available = 0;

/* In read() — process context */
int ret = wait_event_interruptible(my_queue, data_available != 0);
if (ret)
    return -ERESTARTSYS;  /* signal interrupted the sleep */

/* In IRQ handler or writer */
data_available = 1;
wake_up_interruptible(&my_queue);
```

`wait_event_interruptible` atomically checks `data_available != 0`; if false, it places the process on `my_queue` and yields the CPU. "Atomically" here means the check and the enqueue happen without a window where a `wake_up` could be missed — the kernel uses an internal spinlock on the wait queue head to close that gap.

The `_interruptible` suffix means a signal (e.g., `SIGINT`) can wake the process early, returning a non-zero value. Your driver must propagate this as `-ERESTARTSYS` so the syscall layer can restart or report the interruption correctly. Using `wait_event` (non-interruptible) makes the process unkillable for the duration — almost never the right choice in a driver.

---

## How It Works

### Spinlock Internals

On x86, `spin_lock()` compiles to an atomic test-and-set loop. The actual instruction sequence for a queued spinlock (the current x86 implementation since Linux 4.2) is more complex, but the primitive is equivalent to:

```asm
.spin:
    lock bts dword ptr [rdi], 0   ; atomically test and set bit 0; old value → CF
    jc   .spin                    ; if bit was already set, spin
```

The `lock` prefix asserts the cache-coherency protocol (MESI) to make the instruction indivisible across all CPUs — on modern x86 this is implemented via cache-line locking, not a bus lock signal. On release, a store with release semantics clears the bit:
