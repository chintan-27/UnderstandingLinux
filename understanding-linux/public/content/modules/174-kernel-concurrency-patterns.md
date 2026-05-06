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

## Core Concepts
Kernel concurrency patterns are the synchronized primitives that allow the Linux kernel to safely share data among preemptible tasks, interrupt handlers, and multiple CPUs without sacrificing scalability.  
The kernel must guarantee **correctness** (no data races, no use‑after‑free) while keeping **overhead low** as the core count grows.  
Four patterns solve complementary sub‑problems:

* **RCU (Read‑Copy‑Update)** – lets readers traverse data structures without acquiring a lock, deferring reclamation until a grace period passes.  
* **Lock hierarchies** – impose a global partial order on lock acquisition to eliminate circular wait, the necessary condition for deadlock.  
* **Per‑CPU data** – replicates a variable per core, turning shared updates into local operations and removing cache‑line bouncing.  
* **Interrupt concurrency** – structures the handling of asynchronous hardware events so that nested or simultaneous interrupts cannot corrupt shared state.

Each pattern is grounded in the kernel’s memory model (release/acquire barriers) and scheduling semantics (preemption, tick, quiescent states).

## How It Works
### RCU Mechanism
Readers must see a **consistent snapshot** of a pointer‑protected object.  
A writer cannot simply `*ptr = new` because a concurrent reader might dereference the old pointer after the writer has freed the old object.  
RCU solves this by separating **update** from **reclamation**:

1. Writer allocates a new version `new`.  
2. Writer publishes it with `rcu_assign_pointer(ptr, new)`, which includes a **store‑release** barrier so that the new object’s fields become visible before the pointer update.  
3. Existing readers continue to access the old version because they loaded the pointer with an **acquire** barrier (`rcu_dereference`).  
4. Reclamation occurs only after a **grace period**: a time interval in which every CPU has passed through a *quiescent state* (e.g., executed `schedule()`, exited interrupt context, or entered user mode).  
   The kernel tracks quiescent states via the RCU core (`rcu_core.c`). When all CPUs report a quiescent state, any pre‑existing readers are guaranteed to have finished.  

Mathematically, if the system has `N` CPUs and the average time a CPU spends outside a quiescent state is `T_q`, the expected grace period `G` is bounded by  

$$
G \le \max_i T_{q,i} + \text{scheduler\_latency}.
$$

In practice, on a tickless kernel the grace period is usually a few milliseconds.

**Key primitives**

```c
/* acquire/release read-side critical section */
void rcu_read_lock(void);
void rcu_read_unlock(void);

/* publish a new pointer (store‑release) */
void rcu_assign_pointer(struct rcu_head __rcu *ptr, void *val);

/* fetch pointer with acquire barrier */
#define rcu_dereference(ptr) \
        ({ typeof(ptr) _ptr = (ptr); \
           smp_load_acquire(&_ptr); _ptr; })

/* wait for a grace period */
void synchronize_rcu(void);

/* defer reclamation */
void call_rcu(struct rcu_head *head, void (*func)(struct rcu_head *rcu));
```

### Lock Hierarchies
A deadlock requires four conditions (Coffman): mutual exclusion, hold‑and‑wait, no preemption, circular wait.  
Lock hierarchies attack **circular wait** by enforcing a global order `≺` on lock acquisition: if a thread holds lock `L_i` it may only subsequently acquire locks `L_j` where `L_i ≺ L_j`.  

The kernel’s lock validator (**lockdep**) maintains a directed graph of acquired locks.  
If a thread tries to acquire `L_j` while already holding `L_i` and an edge `L_j → L_i` already exists, lockdep reports a potential deadlock.

Mathematically, the lock graph must be **acyclic**; lockdep detects cycles online.

**Implementation notes**

* Each `struct lock_class_key` identifies a lock type.  
* `mutex_lock()` acquires the underlying `raw_spinlock_t` after acquiring the lock class via `__mutex_lock_common()`.  
* The lockdep annotation `LOCK_DEPENDENCY(class, dep)` adds an edge.

```c
/* Example lock hierarchy:  i2c_adapter_lock ≺ i2c_client_lock */
static struct lock_class_key i2c_adapter_key;
static struct lock_class_key i2c_client_key;

/* early boot registration */
static void __init i2c_lock_init(void)
{
    lockdep_set_class(&i2c_adapter_lock, &i2c_adapter_key);
    lockdep_set_class(&i2c_client_lock,   &i2c_client_key);
    lockdep_set_subclass(&i2c_client_key, 0, &i2c_adapter_key);
}
```

### Per‑CPU Data
When a variable is updated frequently but read rarely (or read locally), placing a separate instance on each CPU eliminates **cache‑line ping‑pong**.  

The kernel places all per‑CPU variables in a contiguous per‑CPU area (`__percpu` section).  
For CPU `c`, the address of a variable `var` is  

$$
\text{addr}(var, c) = \text{base}_\text{percpu} + \text{offset}(var) + c \times \text{size}(var).
```

Access is performed with `__this_cpu_ptr(var)` (or the typed variants `__this_cpu_read`, `__this_cpu_write`).  
These macros compile to a simple `mov` with a per‑cpu base register (`%gs` or `%fs` on x86) – **no atomic instruction** is needed for per‑CPU writes because each CPU touches its own copy.

Read‑side aggregation (e.g., summing counters) must explicitly iterate over all CPUs:

```c
unsigned long sum = 0;
for_each_possible_cpu(cpu)
    sum += __cpucounter_read(counter, cpu);
```

### Interrupt Concurrency
An interrupt can arrive on any CPU at any time.  
The kernel distinguishes:

* **Hard interrupt context** – runs with interrupts disabled on the local CPU (`local_irq_disable()`).  
* **Threaded interrupt handler** – a normal kernel thread woken by the IRQ core, allowing sleeping and preemption.  
* **Softirq / tasklet** – bottom‑half mechanisms that run with interrupts enabled but with preemption disabled (`local_bh_disable()`).  

The IRQ core (`kernel/irq/manage.c`) processes an interrupt as follows:

1. Hardware asserts IRQ line → interrupt controller → CPU.  
2. CPU jumps to `common_interrupt()` (entry in `idtentry.S`).  
3. `handle_irq()` descends the IRQ descriptor chain, invoking the chip’s `irq_ack`, `irq_mask`, and the handler.  
4. If the handler is threaded (`IRQF_ONESHOT`), the core wakes the associated thread; otherwise it runs the handler directly with hardirqs disabled.  
5. After the hard handler returns, any pending softirqs are raised (`raise_softirq_irqoff()`).  
6. Finally, `exit_idle()` restores interrupts and may schedule a softirqd/ksoftirqd thread to process them.

**Key interfaces**

```c
/* request a threaded IRQ */
int request_threaded_irq(unsigned int irq,
                         irq_handler_t handler,
                         irq_handler_t thread_fn,
                         unsigned long flags,
                         const char *devname,
                         void *dev_id);

/* disable/enable local IRQs (save flags) */
unsigned long local_irq_save(void);
void local_irq_restore(unsigned long flags);

/* bottom‑half */
void raise_softirq(unsigned int nr);
```

The concurrency guarantee: **hardirq handlers never sleep** and run with local IRQs disabled, preventing nested hardirqs on the same CPU; **softirqs run with BH disabled**, preventing re‑entry of the same softirq type; **threaded handlers may sleep**, relying on normal scheduler locking.

## Worked Examples
### Example 1: RCU‑Protected Global Pointer
**Goal:** Replace a global `struct sysinfo *sysinfo_ptr` without blocking readers.

```c
/* sysinfo.h */
struct sysinfo {
    unsigned long totalram;
    unsigned long freeram;
    /* … */
};

/* sysinfo.c */
#include <linux/rcupdate.h>
#include <linux/slab.h>

static struct sysinfo __rcu *sysinfo_ptr;

/* Writer: called under some external lock (e.g., sysinfo_lock) */
void update_sysinfo(unsigned long totalram, unsigned long freeram)
{
    struct sysinfo *new = kmalloc(sizeof(*new), GFP_KERNEL);
    if (!new)
        return;
    new->totalram = totalram;
    new->freeram  = freeram;
    /* publish – store‑release */
    rcu_assign_pointer(sysinfo_ptr, new);
}

/* Reader: can be invoked from any context, even hardirq */
unsigned long get_totalram(void)
{
    struct sysinfo *s;
    unsigned long val;

    rcu_read_lock();                     /* acquire read-side */
    s = rcu_dereference(sysinfo_ptr);    /* load‑acquire */
    val = s ? s->totalram : 0;
    rcu_read_unlock();                   /* release */
    return val;
}

/* Reclaimer: after updating, wait for grace period then free old */
void update_and_reclaim(unsigned long totalram, unsigned long freeram)
{
    struct sysinfo *old;

    old = rcu_dereference(sysinfo_ptr);
    if (old) {
        update_sysinfo(totalram, freeram);
        synchronize_rcu();               /* block until all pre‑existing readers done */
        kfree_rcu(old, rcu);             /* or call_rcu(&old->rcu, kfree) */
    }
}
```
**Why it works:**  
* The writer’s `rcu_assign_pointer` includes a `smp_store_release()`; readers’ `rcu_dereference` includes `smp_load_acquire()`. This creates a **happens‑before** edge from the writer’s stores to the new object’s fields to the reader’s load of the pointer.  
* `synchronize_rcu()` invokes the RCU core, which waits until each CPU has reported a quiescent state (e.g., has called `schedule()` or exited interrupt context). Only then can the old memory be safely reclaimed.  

**Numbers:** On a 4‑core Xeon with `CONFIG_NO_HZ_FULL`, a typical grace period after a single `update_sysinfo()` is ~1.2 ms (dominated by the longest time a CPU spends in kernel mode without touching the scheduler).  

### Example 2: Lock Hierarchy to Prevent Deadlock
**Scenario:** Two subsystems – block device queue (`blk_queue_lock`) and I/O scheduler (`iosched_lock`) – must both be held when issuing a flush.

```c
/* blk-lockdep.c */
#include <linux/lockdep.h>

static struct lock_class_key blk_queue_key;
static struct lock_class_key iosched_key;

/* early init */
static int __init blk_lockdep_init(void)
{
    lockdep_set_class(&blk_queue_lock, &blk_queue_key);
    lockdep_set_class(&iosched_lock,   &iosched_key);
    /* enforce: blk_queue_lock must be taken before iosched_lock */
    lockdep_set_subclass(&iosched_key, 0, &blk_queue_key);
    return 0;
}
module_init(blk_lockdep_init);

/* flush path */
void blk_flush_queue(struct request_queue *q)
{
    mutex_lock(&q->queue_lock);          /* blk_queue_lock */
    mutex_lock(&q->iosched_lock);        /* iosched_lock – allowed */
    /* … issue flush … */
    mutex_unlock(&q->iosched_lock);
    mutex_unlock(&q->queue_lock);
}

/* Violating order – lockdep will splat */
void bad_path(void)
{
    mutex_lock(&q->iosched_lock);
    mutex_lock(&q->queue_lock);   /* <-- lockdep detects cycle */
    /* … */
    mutex_unlock(&q->queue_lock);
    mutex_unlock(&q->iosched_lock);
}
```
**Why it works:**  
Lockdep builds a graph where an edge `A → B` means “while holding A, thread may acquire B”. The graph must stay acyclic. By registering the subclass relation, we add an edge `blk_queue_key → iosched_key`. If code tries to acquire `iosched_lock` first, then `blk_queue_lock`, lockdep sees a reverse edge `iosched_key → blk_queue_key`, forming a cycle and prints a warning with stack traces.

### Example 3: Per‑CPU Counter for Network Packets
**Goal:** Count packets received per interface with minimal overhead.

```c
/* netdev_pcpu.c */
#include <linux/percpu.h>
#include <linux/netdevice.h>

struct rx_stats {
    u64 packets;
    u64 bytes;
};

/* one instance per CPU */
DEFINE_PER_CPU(struct rx_stats, rx_stats_percpu);

/* NIC interrupt handler (hardirq) */
static irq_return_t napi_poll(int irq, void *dev_id)
{
    struct net_device *dev = dev_id;
    struct rx_stats *s = this_cpu_ptr(&rx_stats_percpu);

    /* process packets … */
    s->packets += num_pkts;
    s->bytes   += num_bytes;

    return IRQ_HANDLED;
}

/* ethtool -S shows cumulative stats */
static int get_ethtool_stats(struct net_device *dev,
                             struct ethtool_stats *stats, u64 *data)
{
    int cpu;
    u64 p = 0, b = 0;

    for_each_possible_cpu(cpu) {
        struct rx_stats *s = per_cpu_ptr(&rx_stats_percpu, cpu);
        p += s->packets;
        b += s->bytes;
    }
    data[0] = p;
    data[1] = b;
    return 2;
}
```
**Why it works:**  
* Each CPU updates its own copy via `this_cpu_ptr()`, which compiles to a `mov` with a per‑cpu base (`%gs:offset`). No `lock` prefix, no cache line invalidation on other CPUs.  
* The reader sums across CPUs; this is infrequent (ethtool) so the overhead is acceptable.  

**Performance:** On an Intel Xeon E5‑2680 v4, a per‑CPU increment costs ~3 ns, whereas an atomic `inc` on a shared `atomic64_t` costs ~20 ns due to cache line ownership transfers.

### Example 4: Threaded IRQ Handler for a GPIO Button
**Goal:** Debounce a button without blocking the hardirq context.

```c
/* gpio_button.c */
#include <linux/interrupt.h>
#include <linux/gpio/consumer.h>

static struct gpio_desc *button_gpio;
static struct work_struct debounce_work;

static void debounce_work_func(struct work_struct *work)
{
    /* read GPIO after bounce settled */
    if (gpiod_get_value(button_gpio))
        pr_info("Button pressed\n");
    else
        pr_info("Button released\n");
}
DECLARE_WORK(debounce_work, debounce_work_func);

static irq_return_t thread_fn(int irq, void *dev_id)
{
    /* schedule bottom half; we can sleep here */
    schedule_work(&debounce_work);
    return IRQ_HANDLED;   /* tell core we handled it */
}

static irq_return_t hard_fn(int irq, void *dev_id)
{
    /* mask the line until thread finishes – prevents storm */
    disable_irq_nosync(irq);
    return IRQ_WAKE_THREAD;   /* wake threaded handler */
}

static int __init gpio_button_init(void)
{
    int irq, ret;

    button_gpio = gpiod_get(&pdev->dev, "button", GPIOD_IN);
    if (IS_ERR(button_gpio))
        return PTR_ERR(button_gpio);

    irq = gpiod_to_irq(button_gpio);
    ret = request_threaded_irq(irq, hard_fn, thread_fn,
                               IRQF_ONESHOT, "gpio-button", NULL);
    if (ret)
        gpiod_put(button_gpio);
    return ret;
}
module_init(gpio_button_init);
```
**Why it works:**  
* The hardirq (`hard_fn`) runs with local IRQs disabled, merely disables the IRQ line and returns `IRQ_WAKE_THREAD`.  
* The threaded handler (`thread_fn`) runs in process context, may sleep (`schedule_work`) and performs the relatively long debounce work.  
* `IRQF_ONESHOT` tells the IRQ core not to re‑enable the line until the thread returns, preventing interrupt storms.  

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Breaks |
|---|---------|--------------|---------------|
| 1 | **RCU read side without `rcu_dereference`** | Directly accessing `ptr->field` after loading `ptr` with a plain load. | Missing acquire barrier → possible **out‑of‑order** read where the pointer update is seen but the new object’s fields are still stale, leading to use‑of‑uninitialized or corrupted data. |
| 2 | **Acquiring locks in opposite order in different modules** | Module A: `lock_A(); lock_B();` Module B: `lock_B(); lock_A();`. | Creates a **lockdep cycle**; under load the kernel will eventually deadlock, evidenced by a lockdep splat and a hung system. |
| 3 | **Assuming per‑CPU variable is safe to read without preemption disabling** | Using `__this_cpu_read(var)` while the task may be migrated mid‑read. | The read may fetch a value from CPU X, then the task moves to CPU Y and continues using the stale value, breaking invariants that rely on a *consistent* per‑CPU snapshot (e.g., summing counters). |
| 4 | **Calling `spin_lock_irqsave()` when interrupts already disabled** | Nesting `local_irq_disable(); spin_lock_irqsave(&lock, flags); … spin_unlock_irqrestore(&lock, flags); local_irq_enable();`. | The inner `spin_lock_irqsave` saves flags (which already have IF=0), then restores them, **re‑enabling interrupts prematurely** and potentially allowing an interrupt to interrupt a critical section. |
| 5 | **Freeing RCU‑protected object without waiting for a grace period** | `kfree(ptr);` immediately after `rcu_assign_pointer(ptr, NULL);`. | Readers that loaded the old pointer before the NULL store may still be accessing the memory; freeing it causes **use‑after‑free** and kernel oops. |
| 6 | **Using a workqueue from hardirq context** | `schedule_work(&work);` inside a non‑threaded IRQ handler with `IRQF_DISABLED`. | Workqueue worker may acquire a mutex that is also taken by the hardirq (e.g., a spinlock), leading to **deadlock** because the worker cannot run until the hardirq finishes, but the hardirq waits for the worker. |
| 7 | **Missing `smp_mb__after_spinlock()`** | After releasing a spinlock, accessing shared data without a barrier. | On weakly ordered architectures (ARM, PowerPC), stores inside the critical section may not be globally visible before the lock release, causing other CPUs to see stale data. |

## Exercises
### Easy – RCU Singleton
*Implement a lazily‑initialized, RCU‑protected global pointer to a `struct config` that is allocated on first read and never freed.*  
Steps:  
1. Declare `static struct config __rcu *config_ptr;`.  
2. In `get_config()`, use `rcu_read_lock()/rcu_dereference()`; if `NULL`, drop the read lock, allocate with `kmalloc()`, publish via `rcu_assign_pointer()`, then re‑acquire the read lock to return the pointer.  
3. Verify with `rcu_trace` or by checking that concurrent readers never see a partially initialized struct (use `smp_mb()` after field initialization).  

*Command to test:*  
```bash
# Build as a module
make -C /lib/modules/$(uname -r)/build M=$PWD modules
sudo insmod rcu_singleton.ko
sudo dmesg | tail -20   # look for init messages
sudo rmmod rcu_singleton
```

### Medium – Lock Hierarchy Checker
*Write a small kernel module that registers two lock classes (`net_tx_lock`, `net_rx_lock`) and enforces `net_tx_lock ≺ net_rx_lock` via lockdep.*  
* Then deliberately violate the order in a second function and observe the lockdep warning in `dmesg`.  
* Provide a `Makefile` and a `Kconfig` entry so the module can be toggled.*  

### Hard – Per‑CPU Load Average
*Design a per‑CPU counter that tracks the number of `schedule()` invocations per
