---
id: 116
title: "Workqueues and deferred execution"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
### Why Deferred Execution Is Needed
In the Linux kernel, hard‑irq handlers run with interrupts disabled and must complete quickly.  
Softirqs and tasklets run with **local BH disabled** (or with interrupts enabled but still in atomic context) and **may not sleep**—calling `mutex_lock()`, `kmalloc(..., GFP_KERNEL)`, or any routine that can schedule is illegal and will trigger a `BUG()` or corrupt state.  
Many subsystem operations (e.g., allocating buffers for a completed I/O, flushing a filesystem journal, updating timers) legitimately need to sleep.  
Therefore the kernel provides a mechanism that **defers work to process context**, where the scheduler may put the task to sleep and later resume it.

### Workqueue versus Other Bottom Halves
| Mechanism | Context | Can Sleep? | Typical Use |
|-----------|---------|------------|-------------|
| Hardirq   | IRQ disabled | No | Minimal hardware acknowledgement |
| Softirq   | BH disabled, may run with interrupts enabled | No | Network packet processing, block layer completion |
| Tasklet   | Like softirq but serialized per‑CPU | No | Deferring simple, non‑sleeping work |
| **Workqueue** | **Process context (kworker thread)** | **Yes** | Anything that may block: I/O completion, filesystem sync, driver firmware load |

A workqueue is essentially a **producer‑consumer queue** where producers (any kernel code that may be in atomic context) push `work_struct` items, and consumer threads (`kworker/*`) pop and execute them in process context.

### Core Data Structures
```c
/* workqueue.h */
struct workqueue_struct {
    const char *name;                /* debug name */
    struct mutex lock;               /* protects wq->list and worker pool */
    struct list_head list;           /* pending work items */
    struct worker_pool *pool;        /* pool of kworker threads */
    unsigned int flags;              /* WQ_MEM_RECLAIM, WQ_HIGHPRI, … */
};

struct work_struct {
    atomic_long_t flags;             /* WORK_STRUCT_PENDING, WORK_STRUCT_DELAYED, … */
    struct list_head entry;          /* links into wq->list */
    work_func_t func;                /* pointer to handler */
    void *data;                      /* argument passed to func */
};
```
*On a 64‑bit kernel:*  
`sizeof(struct work_struct) = 2*ptr + atomic_long + list_head = 2*8 + 8 + 2*8 = 40` bytes (typically rounded to 48 by alignment).  
If *N* work items are pending, memory consumption ≈ **N × 48 B**.

### Key Guarantees
1. **No duplicate execution** – `queue_work()` atomically tests‑and‑sets the `WORK_STRUCT_PENDING` flag; if already set the call returns `0` and the work is not re‑queued.  
2. **FIFO order per queue** – `list_add_tail()` preserves insertion order; workers always `list_first_entry()` the head.  
3. **Wake‑on‑insert** – after linking the work, the worker pool is woken via `wake_up_process()` (or `wake_up_interruptible()` on the wait queue embedded in the pool).  

---

## How It Works
### Step‑by‑step Life Cycle of a Work Item
1. **Preparation** (usually in init or interrupt context)  
   ```c
   INIT_WORK(&work, handler_func, data);
   ```
   This zeroes `flags`, sets `func` and `data`, and leaves `entry` unlinked.

2. **Queuing** (`queue_work(wq, &work)`)  
   ```c
   static bool queue_work(struct workqueue_struct *wq,
                          struct work_struct *work)
   {
       unsigned long flags;
       bool ret = false;

       spin_lock_irqsave(&wq->lock->lock, flags);
       if (!test_and_set_bit(WORK_STRUCT_PENDING_BIT,
                             &work->flags)) {
           list_add_tail(&work->entry, &wq->list);
           ret = true;
           wake_up_worker(wq);   /* wakes a kworker if idle */
       }
       spin_unlock_irqrestore(&wq->lock->flags, flags);
       return ret;
   }
   ```
   *Why the spinlock?* The pending flag and the list must be updated atomically; a sleeping lock would violate atomic context constraints.

3. **Worker Scheduling**  
   Each `workqueue_struct` owns a `worker_pool`. The pool maintains a set of idle `kworker/*` threads. When `wake_up_worker()` runs, it selects an idle thread and calls `wake_up_process(thread)`. If no idle thread exists and `wq->flags & WQ_UNBOUND` is set, a new kworker may be created (subject to `wq->max_active`).

4. **Execution** (inside `worker_thread()`)  
   ```c
   static int worker_thread(void *__wq)
   {
       struct workqueue_struct *wq = __wq;
       struct work_struct *work;

       while (!kthread_should_stop()) {
           wait_event_freezable(wq->worker_pending,
                                !list_empty(&wq->list) ||
                                kthread_should_stop());

           spin_lock_irq(&wq->lock->lock);
           if (list_empty(&wq->list)) {
               spin_unlock_irq(&wq->lock->lock);
               continue;
           }
           work = list_first_entry(&wq->list,
                                   struct work_struct, entry);
           list_del_init(&work->entry);
           /* clear pending flag before executing – allows requeue */
           clear_bit(WORK_STRUCT_PENDING_BIT, &work->flags);
           spin_unlock_irq(&wq->lock->lock);

           work->func(work->data);   /* may sleep */
       }
       return 0;
   }
   ```
   The worker reacquires the lock only to pull the next item; the actual handler runs **without** the lock held, permitting it to schedule.

5. **Completion**  
   After `func` returns, the worker loops back to wait for more work. If the work item needs to be re‑queued (e.g., a timer restart), the handler itself may call `queue_work()` again.

### Latency Model (first‑principles)
Let  

* `L_lock` = worst‑case time to acquire `wq->lock` (bounded by the longest critical section that holds the lock, typically a few microseconds).  
* `C_i` = execution time of the *i‑th* pending work item ahead of the new one.  
* `S` = scheduler latency: maximum time from `wake_up_worker()` to the kworker actually running (bounded by the CFS timeslice, `sysctl_sched_latency`, default 6 ms).  

The **worst‑case latency** from `queue_work()` to the start of `func` is  

$$
L_{\text{wc}} = L_{\text{lock}} + \sum_{i=1}^{n-1} C_i + S .
$$

If the workqueue is **unbounded** (`WQ_UNBOUND`) and has `max_active = 1`, the sum reduces to the execution time of the currently running item (if any).  
For a **bounded** high‑pri queue (`WQ_HIGHPRI`) with `max_active = N`, the sum is bounded by `(N‑1)·C_max`.

---

## Worked Examples
### Example 1: Creating a High‑Priority, Unbound Workqueue
```c
#include <linux/workqueue.h>

static struct workqueue_struct *hi_wq;

static int __init workqueue_init(void)
{
    hi_wq = alloc_workqueue("hi_wq",
                            WQ_HIGHPRI | WQ_UNBOUND,
                            1);          /* max_active = 1 */
    if (!hi_wq)
        return -ENOMEM;
    pr_info("High‑pri workqueue created (max_active=1)\n");
    return 0;
}
module_init(workqueue_init);
```
*Why `WQ_UNBOUND`?* It allows the workqueue to spread its workers across all CPUs, reducing contention on a single CPU’s kworker set.  
*Why `WQ_HIGHPRI`?* Workers receive a higher nice level (`-20`), decreasing scheduler latency `S`.

### Example 2: Queuing a Sleeping Work Item from Interrupt Context
```c
/* fictitious network driver */
static void rx_complete(struct net_device *dev)
{
    struct sk_buff *skb = ...;   /* obtained from hardware */

    /* Allocate a buffer that may sleep */
    struct work_struct *rx_work = kmalloc(sizeof(*rx_work), GFP_ATOMIC);
    if (!rx_work) {
        dev_kfree_skb(skb);
        return;
    }
    INIT_WORK(rx_work, process_rx_skb, skb);

    /* queue_work may be called with IRQs disabled */
    if (!queue_work(rx_wq, rx_work))
        kfree(rx_work);   /* already pending – free to avoid leak */
}
static void process_rx_skb(struct work_struct *work)
{
    struct sk_buff *skb = work->data;
    /* This may sleep: e.g., wait for a mutex, allocate with GFP_KERNEL */
    mutex_lock(&skb->lock);
    /* … process packet … */
    mutex_unlock(&skb->lock);
    kfree(skb);
    kfree(work);
}
```
*Key points*  
- The work is allocated with `GFP_ATOMIC` because we are in hard irq.  
- The handler uses `GFP_KERNEL` implicitly via `mutex_lock()`; this is legal because it runs in process context.  
- The `if (!queue_work(...))` guard prevents double‑queuing and leaks.

### Example 3: Flushing and Destroying a Workqueue
```c
static void __exit workqueue_exit(void)
{
    /* Wait for all currently queued work to finish */
    flush_workqueue(hi_wq);
    /* Ensure no new work can be queued */
    destroy_workqueue(hi_wq);
    pr_info("Workqueue destroyed\n");
}
module_exit(workqueue_exit);
```
`flush_workqueue()` sleeps until the worker pool’s list is empty **and** all executing work items have returned.  
`destroy_workqueue()` then removes the worker threads and frees the `workqueue_struct`.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Calling `queue_work()` from a context that may sleep** (e.g., holding a mutex) | The internal `spin_lock_irqsave()` will be called while sleeping → deadlock or `BUG()`. | Prepare the work *before* acquiring the mutex, or use `schedule_work()` which internally checks for safety. |
| 2 | **Failing to clear the pending flag before re‑queuing** | If the handler re‑queues the same `work_struct` without clearing `WORK_STRUCT_PENDING`, `queue_work()` will see the flag set and drop the new request, causing lost work. | After executing the handler, the worker already cleared the flag (`clear_bit`). If you re‑queue from within the handler, call `__queue_work()` or re‑initialize the work (`INIT_WORK`) first. |
| 3 | **Using a single `work_struct` for multiple concurrent submissions** | The structure contains only one `list_head`; linking it twice corrupts the list → list‑poisoning, kernel oops. | Allocate a distinct `work_struct` per submission (e.g., from a mempool or `kmalloc`) or use `cancel_work_sync()` to ensure the previous instance finished before reuse. |
| 4 | **Assuming FIFO fairness across CPUs in an unbound queue** | Unbound queues distribute work to the *idle* CPU’s kworker; if all workers are busy, newly queued work may land on any CPU, breaking strict FIFO. | Use a **bound** queue (`WQ_UNBOUND` not set) with `max_active = 1` if strict ordering is required, or sequence work via a mutex inside the handler. |
| 5 | **Neglecting to check the return value of `queue_work()`** | Discarding the return value hides the case where the work was already pending, leading to resource leaks (e.g., double‑allocation). | Always test the return; if `0`, clean up any resources you allocated for the work. |

---

## Exercises
### Easy
1. **Create a workqueue** with `alloc_workqueue("test_wq", WQ_MEM_RECLAIM, 2)`.  
   Write a module that queues a simple work item printing `"hello"` via `pr_info()`. Verify with `dmesg`.  

2. **Measure latency**  
   Insert a tracepoint (`trace_printk`) just before `queue_work()` and at the start of the handler.  
   Run a loop that queues 1000 items with a 1 ms `udelay()` between queues.  
   Compute average delta from the timestamps (you can use `ftrace` or `perf script`).  

### Medium
3. **Implement a bounded high‑pri workqueue** (`WQ_HIGHPRI | WQ_UNBOUND`, `max_active = 4`).  
   From a softirq context (e.g., `net_rx_action`), queue a job that allocates a page with `alloc_page(GFP_KERNEL)`.  
   Verify that the allocation never fails due to sleeping in atomic context (check `dmesg` for `BUG:` messages).  

4. **Prevent double‑queue**  
   Modify the work item’s handler to re‑queue itself after completing work (e.g., a periodic timer).  
   Use `cancel_work_sync(&work)` before re‑initializing to ensure no pending instance remains.  
   Show that the work runs at a stable period (use `ktime_get()` timestamps).  

### Hard
5. **Design a work‑stealing pool**  
   Instead of the default per‑CPU worker threads, create a custom `worker_pool` that stores idle workers in a global lock‑free stack.  
   Implement `queue_work()` that pops a worker from the stack if available, otherwise falls back to the default mechanism.  
   Benchmark against the stock workqueue using `cyclictest` to compare latency under load.  

6. **Debug a deadlock**  
   Intentionally hold a mutex while calling `queue_work()` on a workqueue that also tries to acquire the same mutex in its handler.  
   Use `echo 1 > /proc/sys/kernel/debug_lockdep_ttbl` and `dmesg` to capture lockdep warnings.  
   Explain the observed stack trace and how to fix it (e.g., defer the mutex acquisition to the worker).  

---

## Linux Connection
The workqueue API is used throughout the kernel; here are concrete subsystems where you can observe it in action.

### 1. Block I/O Completion (`blk_complete_request`)
```c
/* drivers/block/blk-core.c */
static void blk_complete_request(struct request *req)
{
    /* ... */
    queue_work(blk_complete_wq, &req->complete_work);
}
```
*What you can see:*  
```bash
$ grep -r blk_complete_wq /usr/src/linux-source-*/drivers/block/
```
shows the workqueue definition, and `cat /proc/<pid>/wchan` for a process waiting on block I/O will often display `flush_work`.

### 2. Filesystem Journaling (`ext4_journal_commit`)
```c
/* fs/ext4/journal.c */
static void ext4_journal_commit(struct journal_head *jh)
{
    queue_work(ext4_journal_wq, &jh->commit_work);
}
```
You can watch the journal workqueue with:
```bash
$ cat /sys/kernel/debug/workqueue/ext4_journal_wq/*/pending   # if DEBUG_WQ enabled
```
(requires `CONFIG_DEBUG_WQ=y`).

### 3. Network Device TX Timeout (`netdev_tx_timeout`)
```c
/* net/core/dev.c */
static void netdev_tx_timeout(struct net_device *dev)
{
    schedule_work(&dev->tx_timeout_work);
}
```
`schedule_work()` uses the **system default** `system_wq` (a global, unbound, high‑pri workqueue).  
Inspect its activity:
```bash
$ cat /proc/sys/kernel/workqueue_nr_active   # approximate number of active workers
$ watch -n 1 cat /proc/sys/kernel/workqueue_nr_active
```

### 4. Power Management (`pm_runtime_get_sync`)
```c
/* drivers/base/power/runtime.c */
static int pm_runtime_get_sync(struct device *dev)
{
    /* ... */
    queue_work(pm_wq, &dev->power_work);
}
```
The `pm_wq` workqueue is visible via:
```bash
$ ls /sys/devices/*/power/workqueue   # symlinks to the pm_wq for each device
```

### 5. User‑Space Tool: `inotifywait` (uses workqueues indirectly)
`inotifywait` blocks on `read()` from `/dev/inotify`; the kernel’s inotify implementation queues work to deliver events:
```bash
$ inotifywait -m /tmp &
$ while true; do touch /tmp/foo; sleep 0.1; done
```
Check the workqueue that backs the inotify fd:
```bash
$ cat /proc/$(pidof inotifywait)/status | grep Voluntary_ctxt_switches
```
A high count indicates frequent workqueue wake‑ups.

### 6. Kernel Tracing Example
Enable workqueue tracepoints and observe them:
```bash
# Requires CONFIG_TRACING=y and CONFIG_TRACEPOINTS=y
$ echo 1 > /sys/kernel/debug/tracing/events/workqueue/workqueue_queue_work/enable
$ echo 1 > /sys/kernel/debug/tracing/events/workqueue/workqueue_execute_start/enable
$ cat /sys/kernel/debug/tracing/trace
```
You will see lines like:
```
workqueue_queue_work: work=0xffff9c8000000000 func=0xffffffff810a1230
workqueue_execute_start: work=0xffff9c8000000000 func=0xffffffff810a1230
```
These let you measure the exact latency between queuing and execution.

---

## Why This Matters
Understanding workqueues is not merely academic; it is the gateway to writing kernel code that **safely bridges atomic and sleeping contexts**.  

*Correctly using workqueues* eliminates a major class of bugs: attempting to sleep while holding a spinlock or in an interrupt handler, which would otherwise trigger `LOCKDEP` splats, `BUG()` messages, or silent data corruption.  

*Performance‑wise* they give you deterministic latency bounds (the formula derived above) that you can tune via queue flags (`WQ_HIGHPRI`, `WQ_UNBOUND`, `max_active`). This enables real‑time‑oriented subsystems (e.g., block I/O, networking) to meet strict deadlines without resorting to busy‑waiting.  

*From a system‑observability standpoint* the workqueue infrastructure exposes rich tracepoints and `/proc`/`sysfs` knobs (`/sys/kernel/debug/workqueue/*`, `/proc/sched_debug`, `perf` events) that let administrators spot stalled I/O, back‑logged timers, or misbehaving drivers before they impact user‑visible latency.  

Finally, the pattern of **producer‑consumer queue → dedicated worker threads** is replicated in user‑space frameworks (thread pools, async runtimes, `io_uring` submission/completion rings). Mastering the kernel’s implementation gives you a mental model that transfers directly to high‑performance applications.  

By internalising the mechanics—locking, flag atomics, worker scheduling, and latency analysis—you gain the ability to design kernel features that are both **correct** (no illegal sleeps) and **efficient** (minimal latency, optimal CPU utilization). This is why the workqueue abstraction remains a cornerstone of Linux kernel development, decades after its introduction.
