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

## Core Concepts
### Why Synchronization Is Necessary in the Linux Kernel
Modern SMP kernels allow multiple CPUs to execute instructions concurrently. Shared kernel data—such as process descriptors, file‑system inodes, network buffers, or scheduler run‑queues—can be accessed by more than one CPU at the same time. Without coordination, two CPUs may interleave reads and writes to the same memory location, producing a **race condition**. The result can be:
* **Data corruption** (e.g., a reference count decremented twice)
* **Lost updates** (e.g., a counter incremented but the increment overwritten)
* **Invariant violation** (e.g., a list whose `next` pointer points to freed memory)

The kernel must therefore enforce **mutual exclusion** for critical sections and provide **memory ordering guarantees** so that updates become visible to other CPUs in a predictable order.

### Fundamental Properties Every Synchronization Primitive Must Provide
1. **Atomicity** – the acquisition and release of the lock appear as a single indivisible step to other CPUs.
2. **Progress** – if no thread holds the lock, a thread attempting to acquire it will eventually succeed.
3. **Bounded Waiting** – there is a limit on how many times other threads can pass before a waiting thread acquires the lock (prevents starvation).
4. **Memory Ordering** – the primitive must issue the appropriate memory barriers so that stores inside the critical section become visible before the lock is released, and loads after acquisition see all prior releases.

These properties are derived from the **sequential consistency** model that the kernel assumes for correctness‑critical code. On weakly ordered architectures (ARM, PowerPC) explicit barriers are required; on x86 the hardware already provides strong ordering, but the kernel still inserts barriers for portability and to document intent.

### Classification of Kernel Synchronization Mechanisms
| Mechanism | Typical Hold Time | Sleeping? | Primary Use Case |
|-----------|-------------------|-----------|------------------|
| **Spinlock** | < ≈ 10 µs (critical section must be short) | No (busy‑wait) | Interrupt handlers, low‑level scheduler, per‑CPU data |
| **Mutex** | Arbitrarily long | Yes (puts task to sleep) | VFS inodes, file objects, device drivers that may block |
| **RW‑Semaphore** | Readers: short; Writers: potentially long | Yes (readers may sleep if writer holds) | Data structures with many reads, few writes (e.g., directory inodes) |
| **RCU** | Read‑side: zero‑cost (no atomic ops) | No (readers never block) | Read‑mostly structures: routing tables, pid namespaces, VFS dentry cache |
| **Atomics** | Single‑word operations | No | Reference counters, per‑CPU counters, seq‑locks |
| **Memory Barriers** | N/A (ordering primitive) | No | Ensuring proper visibility of data published via lock‑free schemes |

The choice hinges on **contention probability**, **critical section length**, and **whether the context may sleep** (e.g., process context vs. hard interrupt).

## How It Works
### Spinlocks – Busy‑Waiting with Hardware Assistance
A spinlock is implemented as an atomic variable that holds a ticket-based queue (since kernel 4.1) to guarantee FIFO fairness and reduce cache‑line bouncing.

```c
/* arch/x86/include/asm/spinlock.h */
typedef struct {
    volatile unsigned int slock;
} raw_spinlock_t;

/* ticket lock fields */
typedef struct {
    unsigned int head;  /* next ticket to be served */
    unsigned int tail;  /* next ticket to allocate */
} arch_spinlock_t;
```

**Acquisition** (`raw_spinlock`):
1. Atomically fetch‑and‑increment `tail` → obtains my ticket.
2. Spin (typically `pause` on x86, `yield` on ARM) until `head == my_ticket`.
3. Issue an **acquire barrier** (`smp_rmb()`) so that subsequent loads see the effects of the critical section.

**Release**:
1. Increment `head` (store‑release) → wake the next waiter.
2. Issue a **release barrier** (`smp_mb()`) so that all stores inside the critical section become visible before the lock is considered free.

*Why ticket?*  
A naïve test‑and‑set lock causes **cache‑line ping‑pong** when many CPUs spin on the same word. The ticket lock separates the *allocation* (`tail`) from the *service* (`head`) field, allowing each CPU to spin on a different cache line after it has obtained its ticket, reducing contention.

*Expected spin cost*:  
Assume `N` threads, each critical section lasts `T_cs`, and the lock is held with probability `p = (N·T_cs) / (T_cs + T_think)`. The expected number of iterations before acquiring the lock is roughly `1/(1-p)`. For `N=8`, `T_cs=200 ns`, `T_think=5 µs`, we get `p≈0.03` → ~1.03 spins – negligible. If `T_think` drops to `500 ns`, `p≈0.24` → ~1.32 spins.

### Mutexes – Sleeping Lock with Wait Queue
A mutex (`struct mutex`) consists of:
* an **atomic lock count** (`owner` field – 0 = unlocked, -1 = locked, >0 = number of waiters)
* a **wait queue** (`wait_list`) of sleeping tasks.

```c
/* include/linux/mutex.h */
struct mutex {
    atomic_t owner;
    struct mutex_waiter *wait_list;
    /* ... lockdep fields ... */
};
```

**Locking algorithm** (`mutex_lock`):
1. Try to atomically decrement `owner` from 0 to -1 (`cmpxchg`). If succeeds → acquired, issue acquire barrier, return.
2. If `owner` != 0, prepare to sleep:
   * Increment `owner` (negative value encodes waiters).
   * Add current task to `wait_list`.
   * Call `schedule()` → puts task to sleep.
3. Upon wake, re‑acquire via step 1.

**Unlocking** (`mutex_unlock`):
1. Increment `owner` (release barrier).
2. If the new value < 0 (there are waiters), wake the first task on `wait_list`.

*Why sleep?*  
Spinning wastes CPU cycles and can increase latency for real‑time tasks. In a preemptible kernel, putting a task to sleep allows the scheduler to run other work, reducing energy consumption and improving throughput. The cost of a context switch (~5‑10 µs on x86) is justified when the expected hold time exceeds this threshold.

### Read‑Write Semaphores – Optimizing Reader‑Heavy Workloads
A rw‑semaphore (`struct rw_semaphore`) maintains:
* **owner counter** (`int`) – positive = number of active readers, -1 = writer holding, -N = N-1 waiters.
* **wait queues** for readers and writers.

**Reader acquisition** (`down_read`):
1. Atomically increment `owner`. If result > 0 → we are a reader, acquire, issue acquire barrier.
2. If increment makes `owner` == 0 (meaning a writer was waiting), we must sleep: decrement `owner`, enqueue on reader wait queue, schedule.

**Writer acquisition** (`down_write`):
1. Try to atomically set `owner` to -1 (from 0). If succeeds → we have exclusive access, issue acquire barrier.
2. Otherwise, decrement `owner` (more negative) to record a waiter, enqueue on writer wait queue, schedule.

**Release** (`up_read`/`up_write`):
* Reader: decrement `owner`. If result == 0 and there are waiting writers, wake one writer.
* Writer: set `owner` to 0 (release barrier), then wake all waiting readers first (reader‑preference) or a single writer depending on configuration.

*Why reader‑preference?*  
In many workloads (e.g., directory lookups) reads vastly outnumber writes. Allowing concurrent readers maximizes throughput while still guaranteeing writer progress. The implementation avoids the *writer starvation* problem by granting writers priority when they are queued: new readers see `owner` < 0 and go to sleep.

### RCU – Lock‑Free Reads with Grace‑Period Based Reclamation
RCU splits updates into two phases:
1. **Publish** a new version via an atomic pointer store (with release barrier).
2. **Reclaim** the old version after a *grace period* – a time interval during which every CPU has executed a context switch, ensuring all pre‑existing RCU read‑side critical sections have ended.

**Read side**:
```c
rcu_read_lock();   /* preempt_disable(); */
rcu_read_unlock(); /* preempt_enable(); */
```
On preemptible kernels, these simply disable and re‑enable preemption; on non‑preemptible kernels they compile to nothing. The key guarantee: **while preemption is disabled, the CPU cannot be context‑switched**, therefore any RCU read‑side critical section that started before a grace period began must finish before the grace period ends.

**Update side**:
```c
void rcu_assign_pointer(struct foo **p, struct foo *v)
{
    smp_store_release(p, v);   /* release barrier */
}
```
Reclamation is performed via `call_rcu()` which registers a callback to be invoked after a grace period:
```c
call_rcu(&old->rcu_head, callback_free_foo);
```

*Why does this work?*  
On any CPU, the maximum time between two successive context switches is bounded by the **scheduler tick** (`CONFIG_HZ`). If we wait for a period longer than the longest possible pre‑disable interval (a few jiffies), we are guaranteed that every CPU has exited any RCU read‑side region that was active at the start of the wait. This allows safe `kfree()` of the old data without locking readers.

*Cost*:  
Read‑side overhead is just two integer operations (`preempt_count` inc/dec) – effectively zero on non‑preemptible kernels. Write‑side incurs a memory barrier and the latency of a grace period (typically 1‑10 ms depending on `CONFIG_RCU_BOOST` and CPU load).

### Atomics – Single‑Word Operations with Defined Ordering
The kernel provides `atomic_t` (usually a signed `int`) with operations that map to a single CPU instruction with appropriate memory ordering semantics:
* `atomic_read(v)` → `LOAD` (acquire)
* `atomic_set(v, i)` → `STORE` (release)
* `atomic_add(return, v, i)` → `FETCH_ADD` (acquire+release)
* `atomic_cmpxchg(v, old, new)` → `COMPARE_AND_SWAP` (full barrier)

On weakly ordered architectures each macro expands to `__asm__ __volatile__` with `:"+m"(*v): : "memory"` or explicit `smp_mb__before_atomic()` / `smp_mb__after_atomic()` calls. The resulting instruction sequence guarantees that the operation appears atomic to all observers and that preceding/following memory accesses are not reordered across it (per the kernel’s memory‑ordering model).

*Example – reference counting*:  
```c
static inline void get_object(struct kobject *kobj)
{
    atomic_inc(&kobj->refcount);   /* acquire */
}
static inline void put_object(struct kobject *kobj)
{
    if (atomic_dec_and_test(&kobj->refcount))   /* release + test */
        kobject_release(kobj);
}
```
`atomic_dec_and_test()` performs a decrement and returns true if the result is zero, all with a release barrier so that any stores to the object’s fields become visible before the memory is freed.

### Memory Barriers – Enforcing Ordering on Weakly Consistent Hardware
The kernel supplies a hierarchy of barriers, each a macro that inserts the appropriate `mfence`/`dmb`/`dsb`/`sync` instruction (or a compiler barrier if the architecture is strongly ordered).

| Barrier | Effect | Typical Use |
|---------|--------|-------------|
| `smp_mb()` | Full barrier: prevents reordering of any load/store across it | Publishing a pointer after initializing the pointed‑to object |
| `smp_rmb()` | Read‑memory barrier: prevents later loads from moving before earlier loads | Consuming data produced by another CPU |
| `smp_wmb()` | Write‑memory barrier: prevents later stores from moving before earlier stores | Preparing a descriptor ring for NIC DMA |
| `smp_read_barrier_depends()` | Data‑dependency barrier (alpha, ia64) | Following a pointer load before dereferencing |
| `smp_store_release(p, v)` | Equivalent to `smp_wmb(); *p = v;` | Storing a pointer with release semantics |
| `smp_load_acquire(p)` | Equivalent to `smp_rmb(); return *p;` | Loading a pointer with acquire semantics |

*Why needed?*  
Consider a producer‑consumer ring buffer:
```c
/* producer */
desc[idx].addr = dma_addr;   /* store data */
desc[idx].len  = length;
smp_wmb();                   /* ensure stores visible before idx update */
desc[idx].idx = idx;         /* publish */
```
Without the `smp_wmb()`, a weakly ordered CPU could make the `idx` update visible before the `addr`/`len` stores, causing the consumer to read uninitialized or stale data.

## Worked Examples
### Example 1 – Spinlock Protecting a Per‑CPU Counter (Real Numbers)
**Scenario**: A network driver maintains per‑CPU packet counters. Each CPU increments its counter in the interrupt handler (hard IRQ context). The interrupt rate is 100 kpps per CPU, each increment takes ~30 ns.

**Data structure**:
```c
struct drv_stats {
    raw_spinlock_t lock;   /* actually we could use per‑cpu, but illustrate lock */
    u64 packets;
};
DEFINE_SPINLOCK(drv_stats.lock);
```

**Interrupt handler**:
```c
irqreturn_t drv_interrupt(int irq, void *dev_id)
{
    struct drv_stats *s = dev_id;

    spin_lock(&s->lock);
    s->packets++;                     /* ~30 ns */
    spin_unlock(&s->lock);
    return IRQ_HANDLED;
}
```

**Analysis**:
* Critical section length `T_cs = 30 ns`.
* Assume `N = 4` CPUs, interrupt rate λ = 100 kpps → inter‑arrival time `T_think = 1/(λ) = 10 µs`.
* Utilization per CPU `U = λ·T_cs = 100e3·30e-9 = 0.003` (0.3 %).
* Probability lock is held by another CPU at arrival `p ≈ N·U = 0.012`.
* Expected number of spin iterations ≈ `1/(1-p) ≈ 1.012`.  
  Expected wasted time ≈ `p·T_cs/(1-p) ≈ 0.36 ns` – negligible.

If we mistakenly used a mutex:
* Mutex acquire would invoke `schedule()` → context switch ~6 µs, dwarfing the 30 ns work → **100× slowdown**.

### Example 2 – Mutex Guarding a VFS Inode During File Write
**Scenario**: Multiple threads write to the same regular file. The VFS layer protects the inode’s `i_mutex` (a mutex) while updating `i_size` and modifying page cache.

**Relevant kernel code snippet** (`fs/read_write.c`):
```c
ssize_t vfs_write(struct file *file, const char __user *buf,
                  size_t count, loff_t *pos)
{
    struct inode *inode = file_inode(file);
    loff_t pos = *pos;
    ssize_t ret;

    mutex_lock(&inode->i_mutex);          /* acquire */
    /* ... update i_size, copy from user, mark pages dirty ... */
    mutex_unlock(&inode->i_mutex);        /* release */
    *pos = pos + ret;
    return ret;
}
```

**Step‑by‑step**:
1. Thread A enters `vfs_write`, calls `mutex_lock(&inode->i_mutex)`.
   * `atomic_cmpxchg(&inode->i_owner.count, 0, -1)` succeeds → A owns mutex.
   * Acquire barrier ensures any prior stores (e.g., page table updates) are visible.
2. Thread B attempts the same lock while A holds it:
   * `cmpxchg` sees `-1` → fails.
   * B increments wait count (`owner` becomes -2), enqueues itself, calls `schedule()`.
   * Scheduler switches to another task; B consumes no CPU.
3. A finishes critical section, calls `mutex_unlock`:
   * `atomic_inc(&inode->i_owner.count)` → from -1 to 0 (release barrier).
   * Since new value = 0 and wait count < 0, wakes the first waiter (B).
4. B is scheduled, re‑tries the `cmpxchg`, now sees 0 → acquires lock, proceeds.

**Why mutex?**  
The critical section may involve page fault handling, disk I/O, or copying large buffers—operations that can take milliseconds. Sleeping avoids wasting CPU cycles and allows other unrelated work to progress.

### Example 3 – RW‑Semaphore Protecting an Inode’s Directory Cache
**Scenario**: A directory (`struct dentry`) is frequently looked up (read) and occasionally modified (create/unlink). The Linux VFS uses `dentry->d_lockref` (a lockref) and the inode’s `i_rwsem` (a rw‑semaphore) for directory modifications.

**Simplified usage** (`fs/namei.c`):
```c
int lookup_one_len(const char *name, struct dentry *base, struct dentry **res)
{
    struct dentry *dentry;
    int ret;

    down_read(&base->d_inode->i_rwsem);   /* acquire read lock */
    /* ... traverse hash table, find or allocate dentry ... */
    up_read(&base->d_inode->i_rwsem);     /* release */
    return ret;
}
```

**Writer side** (`vfs_mkdir`):
```c
int vfs_mkdir(struct inode *dir, struct dentry *dentry, umode_t mode)
{
    int error;

    down_write(&dir->i_rwsem);            /* exclusive */
    /* ... update dir->i_size, add new dentry to dir's hash ... */
    up_write(&dir->i_rwsem);              /* release */
    return error;
}
```

**Mathematical justification**:
* Let `λ_r` be lookup rate (10⁵ /s) and `λ_w` be create/unlink rate (10² /s).
* Average read hold time `T_r ≈ 200 ns` (hash lookup). Write hold time `T_w ≈ 10 µs` (directory update).
* Utilization by readers: `U_r = λ_r·T_r = 0.02`.
* Utilization by writers: `U_w = λ_w·T_w = 0.001`.
* Probability a arriving reader finds writer active ≈ `U_w = 0.001` → negligible; readers almost never block.
* Probability a arriving writer finds any reader active ≈ `1 - (1-U_r)^{N}` ≈ `N·U_r` for small `U_r`. With 8 CPUs, ≈ 0.128 → ~12% chance writer waits; acceptable given infrequent writes.

Thus rw‑semaphore yields near‑zero read latency while still guaranteeing writer progress.

### Example 4 – RCU Updating a Routing Table Entry
**Scenario**: The kernel’s IPv4 routing table (`struct rt_hash_bucket`) is a hash of `struct rtable`. Lookups happen in the fast path of packet output (net/ipv4/route.c) and must be lock‑free.

**Read path** (`fib_lookup`):
```c
rcu_read_lock();
for (h = rht->buckets[hash]; h; h = rcu_dereference(h->next)) {
    if (h->dst == dst && h->src == src) {
        rcu_read_unlock();
        return h;
    }
}
rcu_read_unlock();
return NULL;
```

**Update path** (`rtu_insert`):
```c
struct rtable *new = kmalloc(...);
 /* fill new */
hlist_rcu_init(&new->hash);
hlist_add_head_rcu(&new->hash, &bucket->first);
```
The `hlist_add_head_rcu()` macro expands to:
```c
void hlist_add_head_rcu(struct hlist_node *n, struct hlist_head *h)
{
    n->next = h->first;
    smp_store_release(&h->first, n);
}
```
The `smp_store_release` ensures that all fields of `new` are visible before the pointer to `new` becomes visible to readers.

**Grace period** after deletion:
```c
hlist_del_rcu(&old->hash);   /* removes from list, smp_wmb() */
call_rcu(&old->rcu_head, rtable_rcu_callback);
```
`call_rcu()` schedules the callback after a grace period. On a typical system with `CONFIG_HZ=250`, the grace period is ~5‑10 ms; the callback then calls `kfree(old)`.

**Why no lock?**  
Readers incur only the overhead of `rcu_read_lock/unlock` (preempt disable/enable) and a few pointer reads with `smp_load_acquire` semantics. The update side pays the cost of a grace period, but updates are infrequent compared to lookups (routing table changes are rare). This yields excellent scalability for the networking fast path.

### Example 5 – Atomic Reference Counting in a Kobject
**Scenario**: A `kobject` represents a sysfs object. Its lifetime is managed by a reference count.

**Definition** (`include/linux/kobject.h`):
```c
struct kobject {
    const char *name;
    struct list_head entry;
    struct kobject *parent;
    struct kset *kset;
    struct kobj_type *ktype;
    struct sysfs
