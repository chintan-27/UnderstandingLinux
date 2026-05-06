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

## Core Concepts
### Driver Concurrency in the Linux Kernel
The Linux kernel is a preemptible, multi-threaded execution environment. Device drivers run concurrently with:
* **Process context** (system calls, kthreads) – may sleep.
* **Interrupt context** (hard IRQs, softirqs, tasklets) – must not sleep.
* **Bottom‑half contexts** (softirq, tasklet, workqueue) – inherit the restrictions of the context that raised them.

A shared resource (hardware register, kernel data structure, DMA buffer) accessed from more than one of these contexts must be protected, otherwise:
* **Data corruption** – concurrent writes produce torn values.
* **Lost updates** – read‑modify‑write races.
* **Deadlock** – circular wait involving locks and interrupt disabling.
* **Priority inversion** – a low‑priority task holds a lock needed by a high‑priority interrupt handler.

The kernel distinguishes **atomic context** (no sleeping allowed) from **sleep context** (may schedule). Holding a spinlock puts the CPU in atomic context because the lock implementation disables preemption and, on SMP, may disable interrupts. A mutex, by contrast, may put the task to sleep and therefore can only be acquired in process context.

### Why Interrupts Must Be Disabled for Spinlocks
A spinlock is implemented with an atomic test‑and‑set on a single word. If an interrupt occurs while the lock is held and the interrupt handler tries to acquire the same lock, the handler would spin forever because the lock owner (the interrupted task) cannot run to release it. The result is a **deadlock** that stalls the CPU and all lower‑priority interrupts.

Therefore, any code that holds a spinlock must execute with local interrupts disabled (or, on UP kernels, with preemption disabled). The kernel provides the combined primitive `spin_lock_irqsave()` which:
1. Saves the current interrupt flag state (`flags`).
2. Disables local interrupts via `local_irq_save(flags)`.
3. Acquires the spinlock.
The matching `spin_unlock_irqrestore()` restores the saved flag state, re‑enabling interrupts only if they were enabled before the critical section.

### Quantitative View of Interrupt Latency
Let:
* $T_{cs}$ – worst‑case time spent in a spinlock‑protected critical section.
* $T_{handler}$ – execution time of the interrupt handler that needs the lock.
* $N$ – number of distinct spinlocks that could be held concurrently by the interrupted context.

The **worst‑case interrupt latency** $\Lambda$ when the interrupt occurs while the highest‑priority lock is held is:
$$
\Lambda = \biggl(\sum_{i=1}^{N} T_{cs}^{(i)}\biggr) + T_{handler}
$$
If $\Lambda$ exceeds the device’s interrupt period, interrupts are lost. This inequality drives the design rule: keep spinlock critical sections short (typically < 5 µs for high‑frequency devices) and avoid nesting many spinlocks.

## How It Works
### Spinlock Implementation (`spinlock_t`)
```c
/* include/linux/spinlock.h */
typedef struct {
    unsigned int slock;
    /* architecture‑specific padding */
} spinlock_t;

/* fast path: atomic cmpxchg */
static inline void __spin_lock(spinlock_t *lock)
{
    while (atomic_cmpxchg(&lock->slock, 0, 1) != 0)
        cpu_relax();          /* pause loop, issue PAUSE on x86 */
}
```
On SMP, `__spin_lock()` may be preceded by `preempt_disable()` (if `CONFIG_PREEMPT=y`) to prevent the holder from being preempted while spinning. The full `spin_lock()` macro expands to:
```c
#define spin_lock(lock)                     \
do {                                        \
    unsigned long __flags;                  \
    spin_lock_irqsave((lock), __flags);     \
} while (0)
```
Thus `spin_lock()` already disables interrupts; the explicit `local_irq_disable()/enable()` pair is rarely needed and is error‑prone.

### Mutex Implementation (`mutex_t`)
```c
/* include/linux/mutex.h */
struct mutex {
    atomic_t count;
    spinlock_t wait_lock;
    struct list_head wait_list;
};
```
Acquisition (`mutex_lock()`) proceeds optimistically:
1. Try to decrement `count` via `atomic_dec_and_mutex_lock()`.
2. If the lock was uncontended (`count` went from 1 to 0), return immediately.
3. If contended, add the current task to `wait_list`, call `schedule()`, and sleep until woken by the unlocker.
Unlocker (`mutex_unlock()`) increments `count` and wakes the first waiter if any.

Because `mutex_lock()` may sleep, it **must not** be called from interrupt context, preempt‑disabled sections, or while holding a spinlock.

### IRQ‑Safe Paths
The canonical way to protect a critical section that may be entered from interrupt context is:
```c
unsigned long flags;
spin_lock_irqsave(&my_lock, flags);
/* critical section – may be accessed from hard IRQ or process context */
spin_unlock_irqrestore(&my_lock, flags);
```
`spin_lock_irqsave()` combines interrupt disabling with lock acquisition, guaranteeing that the critical section runs with local interrupts off, thus safe from concurrent interrupt handlers that also try to take the same lock.

### Sleep Context via `wait_event`
```c
#define wait_event(wq_head, condition)                     \
do {                                                       \
    might_sleep();                                         \
    if (condition)                                         \
        break;                                             \
    __wait_event(wq_head, condition);                      \
} while (0)
```
`__wait_event()`:
1. Sets the task state to `TASK_UNINTERRUPTIBLE` (or `INTERRUPTIBLE` for `_interruptible` variant).
2. Adds the task to the wait queue’s task list.
3. Calls `schedule()`.
4. Upon wakeup, re‑evaluates `condition`; loops if false (spurious wakeup handling).

The macro expands to a statement that can be safely used in process context; using it in atomic context triggers a `might_sleep()` warning (if `CONFIG_DEBUG_SPINLOCK_SLEEP=y`).

## Worked Examples
### Example 1: Protecting a Device Register with a Spinlock
A UART driver exposes a 16‑bit data register at `ioaddr + UART_TX`. Multiple kernel threads may transmit concurrently.

```c
#include <linux/io.h>
#include <linux/spinlock.h>

struct uart_port {
    void __iomem *membase;
    spinlock_t lock;          /* protects tx register */
};

static void uart_putc(struct uart_port *port, unsigned char c)
{
    unsigned long flags;

    /* 1. Save interrupt state, disable IRQs, acquire lock */
    spin_lock_irqsave(&port->lock, flags);

    /* 2. Wait until THRE (transmit holding register empty) */
    while (!(ioread8(port->membase + UART_LSR) & UART_LSR_THRE))
        cpu_relax();          /* spin on hardware status */

    /* 3. Write data */
    iowrite8(c, port->membase + UART_TX);

    /* 4. Release lock and restore IRQ state */
    spin_unlock_irqrestore(&port->lock, flags);
}
```
**Step‑by‑step timing analysis** (typical 115200 baud, 8N1):
* One bit ≈ 8.68 µs; a full character (start+8 data+stop) ≈ 78.1 µs.
* The critical section consists of the LSR poll (worst‑case polling loop) plus the register write.
* Assume the LSR poll may iterate up to 4 times before THRE sets (worst‑case bus latency ≈ 4 µs).
* Register write ≈ 30 ns (MMIO).  
Thus $T_{cs} \approx 4.03\ \mu s$.  
If the UART’s receive interrupt fires every character period (78.1 µs), the worst‑case latency contributed by the lock is $T_{cs} = 4.03\ \mu s$, well below the period, guaranteeing no lost RX interrupts.

### Example 2: Mutex‑Protected Buffer with Sleep
A character device implements a simple FIFO for user‑space reads.

```c
#include <linux/mutex.h>
#include <linux/wait.h>
#include <linux/fs.h>

#define FIFO_SIZE 128

struct fifo_dev {
    char buf[FIFO_SIZE];
    size_t head, tail;
    mutex_t lock;
    wait_queue_head_t read_q;
};

static ssize_t fifo_read(struct file *filp, char __user *ubuf,
                         size_t count, loff_t *ppos)
{
    struct fifo_dev *dev = filp->private_data;
    size_t copied = 0;
    unsigned long ret;

    mutex_lock(&dev->lock);          /* may sleep */
    while (dev->head == dev->tail) { /* empty */
        mutex_unlock(&dev->lock);
        if (filp->f_flags & O_NONBLOCK)
            return -EAGAIN;
        if (wait_event_interruptible(dev->read_q,
                                     dev->head != dev->tail))
            return -ERESTARTSYS;    /* signal */
        mutex_lock(&dev->lock);
    }

    /* copy up to count bytes */
    while (copied < count && dev->head != dev->tail) {
        ret = __put_user(dev->buf[dev->tail], ubuf + copied);
        if (ret)
            break;
        dev->tail = (dev->tail + 1) % FIFO_SIZE;
        copied++;
    }

    mutex_unlock(&dev->lock);
    wake_up_interruptible(&dev->write_q); /* if we have a write queue */
    return copied;
}
```
**Why the mutex is appropriate**: The read operation may block indefinitely waiting for data; blocking requires scheduling, which only a mutex (or semaphore) can provide. A spinlock would cause the CPU to spin while holding the lock, preventing the writer from ever acquiring the lock to fill the buffer → deadlock.

### Example 3: IRQ‑Safe Path in a Network Driver’s RX Handler
The driver receives packets via NIC interrupt; it must update a shared statistics struct.

```c
#include <linux/netdevice.h>
#include <linux/spinlock.h>

struct my_net_priv {
    struct net_device *netdev;
    spinlock_t stats_lock;
    u64 rx_packets;
    u64 rx_bytes;
};

static irqreturn_t my_rx_irq(int irq, void *dev_id)
{
    struct my_net_priv *priv = dev_id;
    struct sk_buff *skb;
    unsigned long flags;

    /* Disable local IRQs, acquire lock – guarantees atomicity w.r.t. softirqs */
    spin_lock_irqsave(&priv->stats_lock, flags);

    while ((skb = __napi_get_frags(priv->napi)) != NULL) {
        priv->rx_packets++;
        priv->rx_bytes += skb->len;
        netif_receive_skb(skb);
    }

    spin_unlock_irqrestore(&priv->stats_lock, flags);
    return IRQ_HANDLED;
}
```
**Reasoning**: The NIC can raise another interrupt while the handler is still processing the previous packet (e.g., high‑rate traffic). Without disabling local interrupts, a nested interrupt could try to acquire `stats_lock` and spin forever because the outer handler is already holding it and cannot run to release it (interrupt context cannot schedule). Disabling IRQs for the duration of the critical section eliminates this race. The critical section is kept short (just a couple of increments) to keep interrupt latency low.

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Causes Problems |
|---|---------|--------------|------------------------|
| 1 | **Calling `mutex_lock()` from interrupt context** | Mutex may sleep; interrupt context cannot schedule. | Results in `BUG: sleeping function called from invalid context` and a kernel oops. |
| 2 | **Using `spin_lock()` without disabling interrupts on SMP** | Spinlock acquisition does *not* automatically disable IRQs; only `spin_lock_irqsave()` does. | If an interrupt occurs while the lock is held and tries to take the same lock, the interrupt handler spins forever → lockup. |
| 3 | **Failing to restore saved interrupt flags (`flags`) on error path** | Early return or `goto out` omits `spin_unlock_irqrestore()`. | Leaves local interrupts disabled permanently, causing lost interrupts and eventual watchdog timeout. |
| 4 | **Lock ordering inversion** (e.g., taking `A` then `B` in one path, `B` then `A` in another) | Creates a circular wait condition. | Under sufficient concurrency, a deadlock occurs; symptoms are processes stuck in `D` state with no CPU usage. |
| 5 | **Using `wait_event()` without re‑checking condition after wakeup** | Assumes wakeup implies condition true. | Spurious wakeups (due to signals or internal wakeups) cause premature exit, leading to lost data or corrupted state. |
| 6 | **Holding a spinlock across a potentially blocking operation** (e.g., `msleep()`, `schedule()`) | Spinlock prohibits sleeping. | The holder never releases the lock while sleeping; any other thread trying to acquire the lock spins forever → soft lockup detected by the watchdog. |
| 7 | **Calling `local_irq_disable()` without a matching `enable()`** | Forgetting to re‑enable on all exit paths. | Same as #3: interrupt starvation, missed timers, network packet loss. |

## Exercises
### Easy – Spinlock Protection
1. Write a simple kernel module that creates a `spinlock_t` protecting a global counter.
2. Export two `/proc` entries: `inc` (increments counter) and `read` (returns current value).
3. Use `spin_lock()` / `spin_unlock()` in the inc handler.
4. Load the module, spawn two user‑space threads that repeatedly write to `/proc/inc` for 10 seconds each, and verify the final count equals 2 × iterations.
```bash
# Build
make -C /lib/modules/$(uname -r)/build M=$PWD modules
# Load
sudo insmod spinlock_counter.ko
# Test
for i in {1..2}; do
    while :; do echo 1 > /proc/inc; done &
done
sleep 10
kill %1 %2
cat /proc/read
```
*Expected*: the count equals the total number of writes (no lost increments).

### Medium – Mutex + Wait Queue
1. Implement a character device with a 64‑byte FIFO.
2. Protect the FIFO with a `mutex`.
3. Use `wait_event_interruptible()` on read when FIFO empty, and wake up writers on space available.
4. Provide a test program that opens `/dev/myfifo`, starts two writer processes (each writing 1 KB) and one reader process that prints received data.
5. Verify no data corruption and that the reader blocks appropriately when empty.
```bash
# After building and inserting the module:
sudo insmod myfifo.ko
# In three terminals:
# Terminal 1 (writer A)
dd if=/dev/zero of=/dev/myfifo bs=64 count=16 &
# Terminal 2 (writer B)
dd if=/dev/zero of=/dev/myfifo bs=64 count=16 &
# Terminal 3 (reader)
cat /dev/myfifo | hexdump -C
```
Check that the output consists of exactly 2 KB of zero bytes, and that the reader does not busy‑wait.

### Hard – Lockless Ring Buffer with Seqlock
1. Design a producer‑consumer ring buffer (size power‑of‑two) using a `seqlock` for the indices.
2. Producer writes data, increments `seq` before and after the write (odd values indicate update in progress).
3. Consumer reads the `seq` spin‑loop until an even value is seen, copies data, then verifies the second `seq` matches the first.
4. Measure interrupt latency: attach the producer to a high‑resolution timer interrupt (`hrtimer`) that fires every 10 µs; consumer runs in a kthread.
5. Use `ftrace` to record the time between interrupt entry and consumer wakeup; ensure the 99th‑percentile latency stays below 15 µs.
```bash
# Enable ftrace function graph
echo function_graph > /sys/kernel/debug/tracing/current_tracer
echo 1 > /sys/kernel/debug/tracing/tracing_on
# Run your module for 30 seconds, then:
cat /sys/kernel/debug/tracing/trace | tail -20
```
*Goal*: demonstrate that lockless design reduces worst‑case latency compared to a spinlock‑protected version.

## Linux Connection
### Real Kernel Subsystems
| Concept | File / Directory | Description |
|---------|------------------|-------------|
| Spinlock API | `include/linux/spinlock.h` / `kernel/locking/spinlock.c` | Defines `spinlock_t`, `spin_lock_*()`, `spin_unlock_*()`, and architecture‑specific fastpaths. |
| Mutex API | `include/linux/mutex.h` / `kernel/locking/mutex.c` | Implements optimistic spinning, wait queues, and priority‑inheritance (via `mutex_lock()` → `rtmutex`). |
| IRQ Control | `include/linux/irqflags.h` | `local_irq_save()`, `local_irq_restore()`, `local_irq_disable()`, `local_irq_enable()`. |
| Wait Queues | `include/linux/wait.h` | `wait_queue_head_t`, `wait_event*()` macros, `__wait_event()`. |
| Seqlock | `include/linux/seqlock.h` | `seqlock_t`, `read_seqbegin()`, `read_seqretry()`. |
| Lock Debugging | `lockdep/` | `CONFIG_LOCKDEP=y` enables lock dependency checking; runtime toggle via `/proc/sys/kernel/lockdep`. |
| Interrupt Statistics | `/proc/interrupts` | Shows per‑IRQ call counts; useful to verify that disabling IRQs in a driver does not starve other interrupt sources. |
| Tracing | `ftrace`, `perf` | `trace-cmd record -p function -g my_driver_module` to see latency of spinlock sections. |

### Commands to Explore the Kernel
```bash
# 1. Look at spinlock implementation for x86_64
grep -A5 "__spin_lock" /usr/src/linux-headers-$(uname -r)/include/linux/spinlock.h

# 2. Check whether lockdep is enabled in the running kernel
cat /boot/config-$(uname -r) | grep CONFIG_LOCKDEP

# 3. Enable lockdep at runtime (if built in)
echo 1 > /proc/sys/kernel/lockdep
# Then run a test that deliberately takes two locks in opposite order;
# dmesg will show a lockdep warning.

# 4. Measure interrupt disable time with ftrace
echo nop > /sys/kernel/debug/tracing/current_tracer   # reset
echo irqsoff > /sys/kernel/debug/tracing/current_tracer
echo 1 > /sys/kernel/debug/tracing/tracing_on
# Trigger your driver’s IRQ-heavy workload...
echo 0 > /sys/kernel/debug/tracing/tracing_on
cat /sys/kernel/debug/tracing/trace | grep -E "IRQSOFF"
```
The `irqsoff` tracer records the maximum time interrupts were disabled; a well‑behaved driver should keep this under a few microseconds for high‑frequency devices.

### Real-World Example: Intel ixgbe Driver
*File*: `drivers/net/ethernet/intel/ixgbe/ixgbe_main.c`
*Relevant snippet*:
```c
static irqreturn_t ixgbe_intr(int irq, void *data)
{
    struct ixgbe_adapter *adapter = data;
    u64 eics;

    /* Disable further interrupts while we process */
    ixgbe_disable_intr(adapter);

    /* Process TX/RX queues – uses spin_lock_irqsave on the queues' lock */
    ixgbe_clean_tx_irq(adapter);
    ixgbe_clean_rx_irq(adapter);

    /* Re-enable */
    ixgbe_enable_intr(adapter);
    return IRQ_HANDLED;
}
```
The driver uses `ixgbe_disable_intr()` (which writes to the NIC’s interrupt mask register) **and** relies on the internal `spin_lock_irqsave()` protecting the Tx/Rx descriptor rings. This pattern ensures that the NIC cannot raise another interrupt while the driver is still touching shared descriptor state, preventing descriptor corruption.

## Why This Matters
Device drivers sit at the boundary between asynchronous hardware and the synchronous execution model of the kernel. If a driver mishandles concurrency:
* **Data Corruption** – Misaligned DMA buffers, torn register writes, or duplicated packets can crash user applications or corrupt filesystems.
* **System Instability** – A stuck spinlock or misused interrupt disable can stall all CPUs, leading to a hard lockup that requires a power cycle.
* **Performance Degradation** – Excessive interrupt disable time increases worst‑case latency, causing dropped packets, audio glitches, or missed sensor samples.
* **Security Risks** – Race conditions may be exploited to gain privileged access or cause denial‑of‑service.

By mastering the primitives—spinlocks for short, atomic updates; mutexes for potentially blocking operations; `wait_event` for sleeping; and disciplined IRQ control—developers can guarantee that:
* Critical sections are bounded and predictable.
* Interrupt latency stays within the hardware’s service window.
* Deadlocks and priority inversions are avoided through correct lock ordering and usage of lockdep.
* The driver scales safely on SMP systems, where multiple CPUs may invoke the same entry point concurrently.

The quantitative formulas for interrupt latency ($\Lambda = \sum T_{cs}^{(i)} + T_{handler}$) and the qualitative rules (keep spinlock sections short, never sleep while holding a spinlock, always restore interrupt flags) are not academic; they directly translate into measurable improvements in throughput, jitter,
