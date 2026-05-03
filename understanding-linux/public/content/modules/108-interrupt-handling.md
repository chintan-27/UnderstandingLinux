---
id: 108
title: "Interrupt handling"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

Hardware is slow relative to the CPU by many orders of magnitude. A modern CPU executes instructions at roughly $10^9$ per second; a spinning disk responds in $\sim10$ ms — a ratio of $10^7$. Even a fast NVMe drive sits at $\sim100\ \mu\text{s}$, a factor of $10^5$ slower than a cache hit. If the kernel polled hardware waiting for completion, it would burn CPU cycles doing nothing useful.

Interrupts invert the relationship: the CPU ignores the device until the device signals readiness. But this creates a new problem. While a hard IRQ handler runs on a CPU, that CPU services no other interrupt. If a 1 Gbps NIC receives 64-byte frames back-to-back, it fires roughly:

$$\frac{10^9\ \text{bits/s}}{(64 + 20) \times 8\ \text{bits/frame}} \approx 1{,}488{,}095\ \text{interrupts/s}$$

At that rate, even a $1\ \mu\text{s}$ handler consumes 100% of one CPU. This is why Linux mandates a strict split: the *top half* does only what the hardware requires immediately, and the *bottom half* does everything else, deferred to a context where preemption and scheduling apply normally.

---

## Core Concepts

### Hard IRQ (Top Half)

When a device asserts an interrupt line, the CPU's interrupt controller latches the signal, the CPU finishes its current instruction, saves the full register state onto the kernel stack, and jumps through the interrupt descriptor table to the registered handler. On x86, the `RFLAGS.IF` bit is cleared automatically, masking further interrupts on that CPU.

The hard IRQ handler has exactly three responsibilities:

1. **Acknowledge the interrupt** at the hardware level so the device de-asserts its line. Failing to do this typically locks up the IRQ line permanently.
2. **Drain hardware FIFOs** before they overflow and drop data. A UART receive FIFO is commonly 16 bytes; at 115200 baud that fills in $\approx 1.4\ \text{ms}$.
3. **Schedule deferred work** and return `IRQ_HANDLED` (or `IRQ_WAKE_THREAD` for threaded IRQs).

The handler must not sleep, must not call any function that can block, and should complete in under a few microseconds. The time budget is not arbitrary: every microsecond spent here is a microsecond during which a higher-priority interrupt on this CPU is invisible.

### Bottom Halves: Why Three Mechanisms Exist

The three current bottom-half mechanisms are not redundant — each occupies a distinct point in the tradeoff space between performance, SMP parallelism, and ease of use.

| Mechanism | SMP parallel? | Can sleep? | Complexity | Typical user |
|---|---|---|---|---|
| Softirq | Yes, same type on multiple CPUs | No | High | Networking, timers, block I/O |
| Tasklet | No (per-instance serialized) | No | Low | Device drivers |
| Work queue | Yes (worker threads) | Yes | Low | Anything needing process context |

This module covers softirqs, tasklets, and threaded interrupts. Work queues are covered in Module 109.

### Softirqs

Softirqs are statically allocated at compile time. The full list lives in `include/linux/interrupt.h`:

```c
enum {
    HI_SOFTIRQ = 0,       // high-priority tasklets
    TIMER_SOFTIRQ,        // kernel timers
    NET_TX_SOFTIRQ,       // network transmit
    NET_RX_SOFTIRQ,       // network receive
    BLOCK_SOFTIRQ,        // block layer completions
    IRQ_POLL_SOFTIRQ,     // I/O polling
    TASKLET_SOFTIRQ,      // normal-priority tasklets
    SCHED_SOFTIRQ,        // scheduler load balancing
    HRTIMER_SOFTIRQ,      // high-resolution timers
    RCU_SOFTIRQ,          // RCU callbacks
    NR_SOFTIRQS
};
```

Each is a bit position in a per-CPU 32-bit bitmask. When the kernel wants to defer work, it sets the corresponding bit. When it processes pending softirqs, it iterates the bitmask. The per-CPU nature is critical: no cross-CPU synchronization is needed to raise a softirq on the local CPU.

The defining characteristic of softirqs is that **the same softirq can run simultaneously on two CPUs**. `NET_RX_SOFTIRQ` runs on CPU 0 processing packets from NIC queue 0 while simultaneously running on CPU 1 processing NIC queue 1. This is why the networking stack uses per-CPU `softnet_data` structures — there is no shared state to lock.

Because of this, writing a new softirq requires the author to reason about every shared data structure under concurrent execution. This is why softirqs are not available to driver authors; they require a kernel patch and are reserved for the handful of subsystems where the performance justifies the complexity.

### Tasklets

Tasklets are built on `HI_SOFTIRQ` and `TASKLET_SOFTIRQ`, but add a serialization guarantee via a state machine on `tasklet_struct.state`. The guarantee: **a given tasklet instance will not run on two CPUs simultaneously**. The mechanism is a `TASKLET_STATE_RUN` flag tested with `test_and_set_bit()`. If a second CPU finds the flag set, it re-queues the tasklet on the CPU that is currently running it, so that CPU will run it again after finishing.

This eliminates the need for spinlocks inside the tasklet handler for any state that is private to that tasklet instance. The tradeoff is that a tasklet cannot be SMP-parallel with itself — under sustained load on a multi-queue NIC, a single tasklet becomes a bottleneck because only one CPU can process it at a time. This is the core reason the networking stack uses softirqs directly rather than tasklets.

Note: tasklets are deprecated as of kernel 5.x for new code. The kernel developers recommend threaded IRQs or work queues instead, since tasklets run in atomic context (no sleeping) but offer no SMP scalability advantage over a properly written threaded IRQ. However, tasklets remain in wide use in existing drivers, so understanding them is essential for reading kernel code.

### Threaded Interrupts

A threaded interrupt splits the handler into two functions registered simultaneously:

- A **hard IRQ handler** (`handler`): runs with interrupts off, does only what cannot be deferred — typically reads a status register and returns `IRQ_WAKE_THREAD`.
- A **thread function** (`thread_fn`): runs in a dedicated per-interrupt kernel thread (`irq/N-name`), in full process context, preemptible, able to sleep.

The kernel thread runs at `SCHED_FIFO` priority 50 by default, which places it above normal processes but below the hard IRQ itself. On `PREEMPT_RT` kernels, threaded interrupts are not optional — the RT patch converts nearly all hard IRQs to threaded form so that high-priority real-time tasks can preempt interrupt handling.

You can pass `NULL` for `handler`, in which case the kernel supplies a default that simply returns `IRQ_WAKE_THREAD`. This is appropriate when there is nothing the handler must do atomically.

### The `ksoftirqd` Pressure Valve

Softirqs can re-arm themselves from within their own handler. The network receive path does this explicitly: after processing a batch of packets, if the ring buffer still has data, it raises `NET_RX_SOFTIRQ` again. Without a safety valve, this would starve user-space indefinitely.

The kernel enforces a budget in `__do_softirq()`: it will loop at most `MAX_SOFTIRQ_RESTART` times (10 in current kernels) and for at most $2\ \text{ms}$ (configured by `HZ`). If softirqs are still pending after the budget expires, it wakes `ksoftirqd`, the per-CPU kernel thread for softirq processing. `ksoftirqd` runs as a normal `SCHED_OTHER` task, so the scheduler can interleave it fairly with user processes.

The result is a bounded latency guarantee: user-space is never frozen for more than roughly the duration of one scheduler timeslice waiting for softirq processing to yield.

---

## How It Works

### Softirq Execution Loop

`__do_softirq()` in `kernel/softirq.c` runs pending softirqs. The logic, simplified:

```c
// kernel/softirq.c (simplified)
asmlinkage __visible void __softirq_entry __do_softirq(void)
{
    unsigned long  end = jiffies + MAX_SOFTIRQ_TIME;  // ~2 ms budget
    int            max_restart = MAX_SOFTIRQ_RESTART; // 10 iterations
    u32            pending;

    pending = local_softirq_pending();

restart:
    /* Clear before processing: new raises during handling will be caught
     * on the next iteration rather than causing an infinite loop here. */
    set_softirq_pending(0);
    local_irq_enable();   // re-enable IRQs while processing bottom halves

    struct softirq_action *h = softirq_vec;
    while (pending) {
        if (pending & 1)
            h->action(h);
        h++;
        pending >>= 1;
    }

    local_irq_disable();
    pending = local_softirq_pending();

    if (pending) {
        if (time_before(jiffies, end) && --max_restart)
            goto restart;
        wakeup_softirqd();   // hand off to ksoftirqd
    }
}
```

The bitmask scan is $O(N)$ where $N = \texttt{NR\_SOFTIRQS} = 10$, independent of the number of pending events or how many times a given softirq fired. This is intentional: the bitmask collapses multiple raises of the same softirq into a single execution, which is appropriate for networking (process
