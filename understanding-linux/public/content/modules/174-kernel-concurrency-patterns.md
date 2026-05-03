---
id: 174
title: "Kernel concurrency patterns"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

The kernel runs on multiple CPUs simultaneously, handles hardware interrupts at any moment, and must protect shared data structures accessed by dozens of execution contexts at once. The failure modes are not crashes — they are silent data corruption: a CPU reads a half-updated linked list node, an interrupt fires while a spinlock is held and tries to re-acquire it on the same CPU (deadlock), or two CPUs race on a counter whose increment compiles to three instructions. These bugs are load-dependent and non-deterministic; they vanish under a debugger and appear in production under peak traffic.

The kernel's concurrency primitives exist because there is no single correct tool. A mutex is wrong in interrupt context. A spinlock is wrong if you might sleep. A global atomic counter is correct but slow when you have 128 CPUs all hammering the same cache line. The design question is always: *which contexts can race, and what can each context afford to do?*

---

## Core Concepts

### Execution Contexts Determine What You Can Do

Every concurrency decision starts by identifying which execution contexts can touch your data:

| Context | Can sleep? | Can be preempted? | Example |
|---|---|---|---|
| Process context | Yes | Yes (unless preempt disabled) | syscall, kernel thread |
| Hard IRQ | No | No | NIC receive ISR |
| Softirq | No | No | TCP receive processing |
| Tasklet | No | No | driver deferred work |

The critical asymmetry: a hard IRQ can interrupt process context **on the same CPU** between any two instructions. A mutex in the interrupted code holds a sleeping lock; the ISR cannot sleep to wait for it. Trying to acquire that mutex from the ISR deadlocks the CPU — not the thread, the entire CPU. This is why the rule "use a mutex unless you're in interrupt context" is wrong. You must ask whether *any writer or reader of this data can be called from interrupt context*, even transitively.

### RCU: Read-Copy-Update

RCU is correct for data structures where reads vastly outnumber writes and readers can tolerate seeing a slightly stale version. The routing table, the dcache, network protocol stacks, and the task list all qualify. The design constraint that makes RCU work: **writers never modify data in place**. They modify a private copy, then atomically swing a pointer. Readers dereference the pointer inside an RCU read-side critical section, which guarantees the object they are reading cannot be freed until after they leave that section.

The writer's sequence:

1. Allocate a new copy of the protected structure.
2. Modify the copy.
3. `rcu_assign_pointer()` — atomically replace the published pointer, with a store-release barrier.
4. `synchronize_rcu()` or `call_rcu()` — wait (or register a callback) until every CPU has passed through a **quiescent state**, proving no CPU holds a reference to the old version.
5. Free the old version.

A **quiescent state** is any point where a CPU cannot be inside an RCU read-side critical section: a context switch, an idle loop entry, or a return to user space. The grace period ends when every CPU online at the start of the grace period has passed through at least one quiescent state.

The read path cost is nearly zero: `rcu_read_lock()` / `rcu_read_unlock()` disable preemption (in `CONFIG_PREEMPT` kernels, they also track nesting) but issue no atomic instructions and touch no shared cache lines.

### Lock Hierarchies and Lockdep

Deadlock from lock ordering is not a race condition — it is a design defect. If any code path acquires lock A then lock B, and any other path acquires B then A, you have a potential deadlock. The kernel prevents this by treating lock acquisition order as a global invariant: there must be a total order $L_1 < L_2 < \cdots < L_n$ such that every code path acquires locks in non-decreasing order. Enforcing this requires discipline, not automation.

`lockdep` is the kernel's runtime validator for this invariant. It instruments every lock acquisition and builds a directed graph of "lock X was held when lock Y was acquired." If it detects a cycle, it prints a full dependency chain to the kernel log and optionally panics. Lockdep is enabled by `CONFIG_PROVE_LOCKING` and active in all major distro debug kernels. A lockdep splat looks like:

```
[ INFO: possible circular locking dependency detected ]
task/1234 is trying to acquire lock:
  (&b->lock){+.+.}, at: foo_b_lock+0x12/0x30
but task is already holding lock:
  (&a->lock){+.+.}, at: foo_a_lock+0x8/0x20
which lock already depends on the new lock.
```

The graph edge `a → b` means "a was held when b was acquired." A cycle in this graph is a potential deadlock.

### Per-CPU Data

False sharing occurs when two CPUs repeatedly write to distinct variables that happen to occupy the same cache line ($64$ bytes on x86). Even though the writes are logically independent, the cache coherence protocol forces the line to bounce between CPUs' L1 caches. The effective cost of a write to a shared cache line under contention scales roughly as $O(n)$ in the number of competing CPUs — each writer must acquire exclusive ownership of the line.

Per-CPU data eliminates this by giving each CPU a private instance of the variable, padded and aligned so no two CPUs share a cache line. The global value is only the sum:

$$\text{total} = \sum_{i=0}^{n_{\text{cpu}}-1} \text{counter}[i]$$

This sum is computed lazily (e.g., when userspace reads `/proc/net/dev`), not on every increment. The hot-path write becomes a non-atomic store to a local cache line — no coherency traffic at all.

The required discipline: you must not be preempted while accessing your CPU's instance. If you read `this_cpu_ptr(&x)` and then the scheduler migrates you to CPU 3, you are now modifying CPU 0's data from CPU 3, which races with CPU 0 doing the same. Access per-CPU data only with preemption disabled (which `__this_cpu_*` operations enforce implicitly via `preempt_disable()`).

### Spinlocks vs. Mutexes: The Decision Rule

Use a **spinlock** when:
- You may be called from interrupt context, or
- The critical section is short enough that spinning is cheaper than sleeping and waking.

Use a **mutex** when:
- You are always in process context, and
- The critical section may block (e.g., memory allocation, I/O).

When data is shared between process context and a hard IRQ handler, the correct primitive is `spin_lock_irqsave()` / `spin_unlock_irqrestore()`. This acquires the spinlock *and* disables interrupts on the local CPU, preventing the IRQ from firing and attempting to acquire the same lock. The "save" variant preserves the previous IRQ enable state in a `flags` variable, which is mandatory if your function might be called with IRQs already disabled.

---

## How It Works

### RCU Grace Period Mechanics

```
Time →

CPU 0: [rcu_read_lock...rcu_dereference(old_ptr)...rcu_read_unlock] [context-switch ← quiescent]
                                                                              ↑
CPU 1:                [copy][modify][rcu_assign_pointer(new)]  [synchronize_rcu()─────────────→ returns] [kfree(old)]
                                                                 blocks here until
                                                                 CPU 0 context-switches
```

`synchronize_rcu()` blocks the calling thread. `call_rcu(&old->rcu_head, free_fn)` is the non-blocking variant: it enqueues a callback on the RCU callback list; `free_fn` is called after the grace period completes, from softirq context.

```c
/* Reader — in process or interrupt context */
rcu_read_lock();
struct route_entry *r = rcu_dereference(routing_table);
/* rcu_dereference expands to READ_ONCE + compiler barrier (+ smp_read_barrier_depends on alpha) */
forward_packet(r->nexthop);
rcu_read_unlock();

/* Writer — process context only (synchronize_rcu may sleep) */
struct route_entry *new_r = kmalloc(sizeof(*new_r), GFP_KERNEL);
if (!new_r)
    return -ENOMEM;
*new_r = *old_r;                            /* copy */
new_r->nexthop = new_nexthop;               /* modify copy */
rcu_assign_pointer(routing_table, new_r);   /* smp_store_release + compiler barrier */
synchronize_rcu();                          /* wait for grace period */
kfree(old_r);
```

Omitting `rcu_dereference()` and using a plain pointer dereference instead is a real bug: on architectures with weak memory ordering (ARM, PowerPC), the CPU can speculate loads of fields before the pointer load completes, reading garbage from the new allocation. `sparse` with `__rcu` annotations and the kernel's `CONFIG_SPARSE_RCU_POINTER` check will flag missing `rcu_dereference()` calls at compile time.

### Dcache RCU-Walk

Path lookup (`/usr/bin/python`) requires resolving three dentry objects. Pre-RCU, the VFS took a reference count on each dentry (`d_count` increment), which is an atomic operation on a cache line shared across CPUs. At $10^6$ lookups/second on 32 CPUs, this produced significant coherency traffic.

The RCU-walk (`fs/namei.c`, `link_path_walk()`) holds `rcu_read_lock()` for the entire walk and validates each dentry's sequence number (`d_seq`, a seqlock) instead of incrementing `d_count`. If any dentry is renamed, deleted, or unmounted during the walk, the sequence number check fails and the code falls back to the ref-walk. On a hot cache with no concurrent modifications — the common case — no atomic operations occur during the walk at all.

### Per-CPU Counters: Concrete
