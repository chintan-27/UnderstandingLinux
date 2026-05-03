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

## Why This Matters

When a NIC fires an interrupt, the CPU halts whatever it was doing, disables interrupts on that core, and jumps to the interrupt handler. Every instruction executed there is time the system cannot respond to other interrupts — including the timer interrupt that drives scheduling. If the handler does full TCP/IP processing for a packet, and the card is receiving at 10 Gbps, the system stops responding to keyboard input, watchdog timers, and every other interrupt source for the duration. The interrupt line itself may back up.

The split model exists to bound this latency. The top half does only what *must* happen immediately — acknowledge the hardware, snapshot volatile registers, DMA-copy incoming data — then raises a flag and returns. The bottom half processes that data later, with interrupts re-enabled, without holding up the interrupt line. The difference between "later" and "now" is not about time; it is about whether the CPU is inside an interrupt handler or not.

Without this split, a driver taking a sleeping lock from interrupt context would deadlock if the lock was already held by a preempted task on the same CPU. The task can never run to release the lock because the interrupt handler never returns.

---

## Core Concepts

### Top Half vs. Bottom Half

The top half runs in *interrupt context*: interrupts are disabled on the local CPU, there is no current process (`current` is meaningless), and the kernel stack is limited (typically 8 KB on x86-64). The bottom half runs with interrupts re-enabled, in a context that is either still interrupt-like (softirq, tasklet) or fully process-like (workqueue).

The names come from early Unix, which literally divided interrupt service routines into an upper half (immediate) and a lower half (deferred). The modern kernel has three distinct mechanisms for the lower half, each with different constraints and costs.

### Softirqs

Softirqs are a statically allocated table, defined in `include/linux/interrupt.h`. The full list as of Linux 6.x:

```c
enum {
    HI_SOFTIRQ = 0,       /* high-priority tasklets */
    TIMER_SOFTIRQ,        /* timer wheel processing */
    NET_TX_SOFTIRQ,       /* network transmit */
    NET_RX_SOFTIRQ,       /* network receive */
    BLOCK_SOFTIRQ,        /* block layer completions */
    IRQ_POLL_SOFTIRQ,     /* IRQ polling */
    TASKLET_SOFTIRQ,      /* normal tasklets */
    SCHED_SOFTIRQ,        /* scheduler rebalancing */
    HRTIMER_SOFTIRQ,      /* high-resolution timers */
    RCU_SOFTIRQ,          /* RCU callbacks */
    NR_SOFTIRQS
};
```

You cannot add new softirq types at runtime or from a module. The table is fixed at compile time because the execution model assumes the list is short — the pending state fits in a single 32-bit bitmask, and iteration is $O(N)$ over at most `NR_SOFTIRQS` entries.

A softirq handler may run on multiple CPUs simultaneously for the *same* softirq type. `NET_RX_SOFTIRQ` can be executing on cores 0, 2, and 5 at the same moment for three different incoming packets. This makes softirqs fast but requires the handler to be fully reentrant. The networking stack handles this via per-CPU `softnet_data` structures — each CPU processes its own receive queue independently, so no locks are needed for the common case. Writing a correct softirq handler outside of core kernel subsystems is genuinely difficult and unnecessary; tasklets exist specifically to avoid it.

### Tasklets

Tasklets are implemented on top of softirqs — they consume the `HI_SOFTIRQ` and `TASKLET_SOFTIRQ` slots — and add one critical guarantee: **a given tasklet instance will not run on more than one CPU at a time**. This is enforced by an atomic `TASKLET_STATE_RUN` flag in the tasklet's state word. If CPU 1 tries to run a tasklet that CPU 0 is already executing, CPU 1 requeues it rather than running it concurrently.

The consequence: you do not need to protect tasklet-internal state against concurrent execution. You *do* need to protect shared state accessed from both the tasklet and process-context code (use `spin_lock_bh()` / `spin_unlock_bh()`, which disables softirqs rather than hard interrupts).

```c
struct tasklet_struct {
    struct tasklet_struct *next;  /* next in per-CPU pending list */
    unsigned long         state;  /* TASKLET_STATE_SCHED | TASKLET_STATE_RUN */
    atomic_t              count;  /* 0 = enabled; nonzero = disabled */
    void (*func)(unsigned long);  /* handler */
    unsigned long         data;   /* opaque argument to handler */
};
```

The `count` field is a disable depth: `tasklet_disable()` increments it, `tasklet_enable()` decrements it. A tasklet with `count > 0` will not execute even if scheduled. This is useful when tearing down a device: disable the tasklet, then safely free its data structures.

### Workqueues

Workqueues defer work into `kworker` kernel threads. Because `kworker` is a real process, the work function runs in *process context* — it has a `current`, a full kernel stack, and can call any function that is legal from process context, including `schedule()`, `mutex_lock()`, `msleep()`, and `kmalloc(GFP_KERNEL)`.

The fundamental reason softirqs and tasklets cannot sleep: sleeping means calling `schedule()`, which switches to another task. The scheduler assumes the outgoing context is a task with a `task_struct`. An interrupt context has no such structure. Calling `schedule()` from interrupt context corrupts the scheduler's state — the kernel will either BUG or silently mismanage the CPU.

The cost of a workqueue is a full context switch: saving registers, switching address-space-related state, waking the `kworker` thread if it was sleeping. On a modern out-of-order CPU this is on the order of $1$–$10\,\mu s$ depending on cache state. For a driver handling $10^3$ interrupts per second, the overhead is:

$$10^3 \;\text{interrupts/s} \times 5\,\mu\text{s/switch} = 5\,\text{ms/s} = 0.5\%\;\text{CPU}$$

Irrelevant. For `NET_RX_SOFTIRQ` handling $10^6$ packets per second:

$$10^6 \times 5\,\mu\text{s} = 5\,\text{s of CPU time per second}$$

Not feasible. The choice between tasklet and workqueue is usually decided by this one arithmetic check.

---

## How It Works

### Softirq Execution Flow

Pending softirqs are tracked in a per-CPU 32-bit word, `__softirq_pending`, stored in `irq_cpustat_t`. Raising softirq $n$ sets bit $n$:

$$\text{pending} \mathrel{|}= (1 \ll n)$$

The kernel drains pending softirqs at three points:
1. On the return path from any hardware interrupt (in `irq_exit()`).
2. Wherever `local_bh_enable()` re-enables bottom halves after they were explicitly disabled.
3. In the `ksoftirqd/N` thread, which is woken when softirqs keep re-raising themselves faster than `__do_softirq()` can drain them.

The loop in `__do_softirq()` (kernel/softirq.c) reads and clears the pending word, then processes each set bit in order of bit position — which is why `HI_SOFTIRQ = 0` gives it genuine priority over `TASKLET_SOFTIRQ = 6`. If handlers raise new softirqs during the loop, `__do_softirq()` will repeat — but at most `MAX_SOFTIRQ_RESTART` (10) times before handing off to `ksoftirqd`. This cap exists to prevent the softirq loop from starving user-space tasks when, for example, a saturated NIC continuously re-raises `NET_RX_SOFTIRQ`.

### Tasklet Lifecycle

Scheduling a tasklet from the interrupt handler (top half):

```c
/* Step 1: define and initialize (at driver probe time) */
static void my_tasklet_handler(unsigned long data)
{
    struct my_device *dev = (struct my_device *)data;
    process_received_data(dev);
}

struct my_device {
    struct tasklet_struct tasklet;
    /* ... */
};

/* In probe: */
tasklet_init(&dev->tasklet, my_tasklet_handler, (unsigned long)dev);

/* Step 2: schedule from IRQ handler */
static irqreturn_t my_irq_handler(int irq, void *dev_id)
{
    struct my_device *dev = dev_id;
    snapshot_hardware_registers(dev);   /* must happen now */
    tasklet_schedule(&dev->tasklet);    /* everything else: deferred */
    return IRQ_HANDLED;
}
```

`tasklet_schedule()` is atomic-safe to call from interrupt context. Internally it tests-and-sets `TASKLET_STATE_SCHED` — if the bit was already set, the function returns immediately without double-queueing the tasklet. This means if the top half fires twice before the bottom half runs, the handler still executes only once (with the data from the second interrupt potentially overwriting the first). Driver authors must design around this: buffer data in a ring, not in a single field that `tasklet_schedule()` silently deduplicates.

When `TASKLET_SOFTIRQ` fires, `tasklet_action()` (kernel/softirq.c) processes the per-CPU list:

```
for each tasklet in per-CPU tasklet_vec:
    if atomic test-and-set TASKLET_STATE_RUN fails:
        → another CPU is running this tasklet; requeue on that CPU, skip
    if tasklet->count != 0:
        → disabled; clear TASK
