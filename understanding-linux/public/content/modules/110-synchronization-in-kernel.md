---
id: 110
title: "Synchronization in kernel"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

When two CPU cores simultaneously modify the same data structure, the result is not merely wrong — it is undefined. One write may partially overwrite the other, leaving a pointer dangling into freed memory. The kernel runs on SMP systems where this happens constantly: interrupt handlers fire while process-context code runs, timers preempt threads mid-operation, and dozens of cores contend on scheduler queues every millisecond. The primitives described here are not safety belts bolted on afterward — they are the precondition for any kernel invariant existing at all.

---

## Core Concepts

### The Race Condition

A race condition occurs when correctness depends on the relative timing of two or more threads of execution. The canonical kernel example is a non-atomic read-modify-write on a reference count:

```c
/* Thread A and Thread B both execute concurrently */
count = count + 1;
```

On x86 this compiles to three instructions:

```asm
mov eax, [count]   ; load
inc eax            ; modify
mov [count], eax   ; store
```

Thread A loads `count = 5`. Before A stores, Thread B also loads `count = 5`. Both store `6`. The final value is `6`, not `7` — one increment lost. In the kernel, `count` is often a reference count: its undercount means `kfree()` is called on memory still referenced, and the next dereference is a use-after-free. The window for this interleaving can be as narrow as a single cycle, which is why it goes undetected in testing and surfaces under production load.

### Critical Sections and Mutual Exclusion

A **critical section** is a sequence of operations that must appear atomic with respect to all other agents operating on the same data. **Mutual exclusion** guarantees that at most one agent executes the critical section at any instant. The width of a critical section matters: a spinlock protecting 200 milliseconds of I/O is a design error; a mutex protecting three pointer assignments is equally wrong in the other direction.

### Atomics

The x86 `LOCK` prefix asserts exclusive ownership of the cache line for the duration of a read-modify-write, making the operation indivisible across cores. The kernel abstracts this as `atomic_t` (32-bit) and `atomic64_t` (64-bit):

```c
atomic_t refcount = ATOMIC_INIT(1);

atomic_inc(&refcount);               /* LOCK XADD, no return value */
atomic_dec_and_test(&refcount);      /* returns true if result == 0 */
int val = atomic_read(&refcount);    /* plain load; no LOCK needed for reads */
```

`atomic_t` operations compile to single locked instructions — zero scheduler involvement, zero cache-line contention beyond the operation itself. Their limitation is scope: they protect exactly one variable. They cannot protect the invariant "pointer P points to a node whose `refcount > 0`" because that involves two variables and a multi-step check.

### Spinlocks

A spinlock achieves mutual exclusion by busy-waiting. A thread that cannot acquire the lock executes a tight poll loop rather than sleeping. This is correct when:

$$T_{\text{critical}} \ll T_{\text{ctx\_switch}}$$

A context switch costs roughly $10^3$–$10^4$ cycles. A spinlock-protected critical section typically costs $10^1$–$10^2$ cycles. Sleeping on contention would cost more than the operation being protected.

The absolute constraint: **a spinlock holder must never sleep or block**. If it sleeps, the CPU is yielded to a thread that may attempt the same lock. On a uniprocessor, that is an immediate deadlock — the sleeping holder never gets rescheduled because the CPU is stuck spinning for it. On SMP, another CPU may eventually release the lock, but the sleeping holder has violated the contract that spinlock critical sections are non-preemptible.

This is why interrupt context must use spinlocks, not mutexes: an interrupt handler cannot sleep by definition — it has no process context to block in.

### Mutexes

A mutex puts a contending thread to sleep rather than spinning. The contender is added to a wait queue, its state is set to `TASK_UNINTERRUPTIBLE`, and `schedule()` is called. When the holder releases the lock, it wakes the first waiter. The cost of a contended acquisition is at minimum two context switches: one to sleep, one to wake.

$$T_{\text{contended\_mutex}} \approx 2 \times T_{\text{ctx\_switch}} \approx 2 \times 10^3\text{–}10^4 \text{ cycles}$$

Use a mutex when the critical section may itself block (file I/O, `copy_from_user()`, memory allocation with `GFP_KERNEL`). Use a spinlock when it cannot. The decision is determined by context, not preference.

### Reader-Writer Locks

Many kernel data structures are read orders of magnitude more often than they are written — the routing table, the file descriptor table, the namespace tree. A plain mutex serializes all readers against each other unnecessarily, since concurrent reads of immutable data are safe.

Reader-writer locks encode the distinction:

- Up to $n$ readers may hold the lock simultaneously (shared mode).
- Exactly 1 writer holds the lock exclusively; all readers block.

If $R$ is the read rate and $W$ is the write rate, the throughput gain over a plain mutex scales roughly as $R / (R + W)$ when $R \gg W$. The failure mode is **writer starvation**: if readers arrive continuously, the writer never acquires exclusive access. Linux's `rwlock_t` does not prevent this; `rwsem` (sleeping reader-writer semaphore) has policies to bound it.

### RCU (Read-Copy-Update)

RCU is the dominant synchronization mechanism for read-mostly kernel data structures. Its core invariant: **readers pay zero synchronization cost**. No locks, no atomics, no memory barriers on the read path. Writers pay instead.

Three operations define RCU:

**Read side** — the reader declares a read-side critical section:
```c
rcu_read_lock();               /* disables preemption; no lock taken */
p = rcu_dereference(gp);       /* issues a data-dependency barrier */
if (p)
    do_something(p->field);
rcu_read_unlock();             /* re-enables preemption */
```

`rcu_dereference()` is not merely a cast — on architectures with weak memory models (Alpha), it emits a load barrier to prevent the CPU from speculating past the pointer load into `p->field`.

**Write side** — the writer modifies a copy, then publishes atomically:
```c
new = kmalloc(sizeof(*new), GFP_KERNEL);
*new = *old;                           /* copy */
new->field = new_value;                /* modify copy */
rcu_assign_pointer(gp, new);           /* atomic pointer publish + write barrier */
synchronize_rcu();                     /* wait for grace period */
kfree(old);                            /* safe: no reader holds old anymore */
```

**Grace period** — `synchronize_rcu()` blocks until every CPU has passed through at least one **quiescent state** — a point where no RCU read-side critical section is active on that CPU (in non-preemptible kernels, any context switch or time in idle suffices). After the grace period, no reader can hold a reference to the old pointer.

The reclaim cost is real but asynchronous. For configurations where blocking is unacceptable, `call_rcu()` registers a callback instead:
```c
call_rcu(&old->rcu_head, my_free_callback);  /* non-blocking; callback runs after grace period */
```

### Memory Barriers

CPUs and compilers reorder memory operations for performance. A store issued by CPU 0 may not be visible to CPU 1 for hundreds of cycles. Memory barriers are not about locking — they are instructions that constrain the *order in which memory operations become globally visible*.

```
wmb()   /* store barrier:  all prior stores visible before any subsequent store */
rmb()   /* load barrier:   all prior loads complete before any subsequent load */
mb()    /* full barrier:   both directions */
smp_wmb(), smp_rmb(), smp_mb()   /* same, but compiled away on uniprocessor */
```

Spinlocks and mutexes imply full barriers in their acquire and release paths — you do not add barriers around locked critical sections. You need explicit barriers only in lockless code: RCU pointer publication, per-CPU variables, and atomic flag protocols.

---

## How It Works

### Spinlock Implementation: Ticket Lock

On x86, the kernel uses queued spinlocks (MCS-based in recent kernels), but the ticket lock is the clearest to reason about. The lock contains two 16-bit counters:

```c
typedef struct {
    union {
        u32 slock;
        struct __raw_tickets {
            u16 owner;   /* the ticket currently being served */
            u16 next;    /* the next ticket to issue */
        } tickets;
    };
} arch_spinlock_t;
```

Acquire: atomically fetch-and-increment `next` to get your ticket, then spin until `owner == your_ticket`. Release: increment `owner`. This gives FIFO fairness — no thread starves, because ticket numbers are assigned in arrival order. The memory footprint is $2 \times 16 = 32$ bits per lock.

```c
spin_lock(&lock);
/* critical section — preemption disabled, interrupts still enabled */
spin_unlock(&lock);
```

If the critical section can be interrupted by an interrupt handler that also acquires the same lock, you must disable local interrupts too. Otherwise, the handler fires mid-critical-section on the same CPU, attempts to acquire the lock the CPU already holds, and spins forever (the holder is preempted by the handler on the same CPU):

```c
unsigned long flags;
spin_lock_irqsave(&lock, flags);     /* disable local IRQs, save EFLAGS */
/* critical section — safe against interrupt context on this CPU */
spin_unlock_irqrestore(&lock, flags);
```

On uniprocessor (`!CONFIG_SMP`) builds, spinlocks compile to pure preemption-disable/enable — there is no other CPU to race with, and interrupts are handled separately.

### Mutex Implementation

```
