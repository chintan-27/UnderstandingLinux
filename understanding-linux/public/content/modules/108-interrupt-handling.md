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

## Core Concepts
### Interrupt Fundamentals
An interrupt is a hardware‑generated signal that forces the CPU to transfer control from its current instruction stream to a predefined entry point in the kernel. The signal originates on an **interrupt request line (IRQ)** managed by an interrupt controller (legacy PIC, modern APIC, or ARM GIC). Each line carries a **vector** that indexes the **Interrupt Descriptor Table (IDT)**; the IDT entry points to a kernel routine (the *interrupt handler* or *ISR*).

Why this matters: the CPU must react within a bounded time (interrupt latency) to avoid data loss or device timeout. Therefore the kernel keeps the hard‑IRQ path as short as possible and defers non‑critical work to *bottom halves* that run with interrupts enabled.

### Hard IRQ vs. SoftIRQ
- **Hard IRQ** – executes with **local interrupts disabled** (`IF = 0`). The handler must be atomic, may not sleep, and runs on a dedicated IRQ stack (typically 4–8 KB per CPU).  
- **SoftIRQ** – a kernel mechanism that runs **with interrupts enabled** (`IF = 1`). It is invoked after the hard IRQ handler returns, allowing the system to re‑enable interrupts quickly while still processing deferred work. SoftIRQs are statically allocated (up to `NR_SOFTIRQS = 10`) and are processed per‑CPU, preventing re‑entrancy on the same softIRQ type.

Why separate them? If a device needs to service a long operation (e.g., DMA completion) while still responding to further interrupts, keeping interrupts disabled would raise latency unbounded. SoftIRQs allow the kernel to re‑enable interrupts almost immediately, then schedule the heavy work later.

### Tasklets and Threaded Interrupts
- **Tasklet** – a type of softIRQ that guarantees **serialization on a given CPU** (only one tasklet of the same type runs at a time). Implemented via `struct tasklet_struct` and the `TASKLET_SOFTIRQ` softIRQ. Tasklets are used when the deferred work must not run concurrently on the same CPU but may run in parallel on different CPUs.  
- **Threaded Interrupt** – when a handler needs to sleep (e.g., allocate memory, wait for a USB transfer), the kernel splits the work: a minimal *hard* handler runs with interrupts disabled and returns `IRQ_WAKE_THREAD`; the kernel then wakes a dedicated kernel thread that executes the *threaded* handler with normal process context (can block, take mutexes, etc.). Requested with `request_threaded_irq()` and the `IRQF_ONESHOT` flag.

### Interrupt Context vs. Process Context
| Property | Interrupt Context (hard IRQ) | Interrupt Context (softIRQ/tasklet) | Process Context |
|----------|------------------------------|--------------------------------------|-----------------|
| Interrupts enabled? | No (`IF=0`) | Yes (`IF=1`) | Yes |
| May sleep? | **No** (would deadlock) | **No** (still atomic) | **Yes** |
| Stack size | Limited (IRQ stack) | Limited (softIRQ stack) | Normal task stack (~8 KB) |
| Locking primitives allowed | Spinlocks only (`spin_lock_irqsave`) | Spinlocks only | Mutexes, semaphores, sleeping locks |
| Typical use | Device I/O, acknowledge IRQ | Packet processing, timers, block I/O completion | File system, user‑space syscalls |

The kernel enforces these rules at compile time (e.g., `might_sleep()` warnings) and runtime (`preempt_count()` debugging).

### Bottom‑Half Execution Flow
1. Hard IRQ handler runs (interrupts off).  
2. If it schedules work → raises a softIRQ (`raise_softirq(vec)`) or wakes a threaded handler.  
3. Hard handler returns → `irq_exit()` checks `softirq_pending()`; if set, invokes `do_softirq()`.  
4. `do_softirq()` processes all pending softIRQs with interrupts enabled.  
5. After softIRQs finish, the kernel may reschedule a task if `need_resched()` is set.

This design caps hard‑IRQ latency to the time spent in the hard handler plus the time to acknowledge the IRQ, typically a few microseconds.

### Quantitative Latency Model
Let  
- $T_{ack}$ = time to acknowledge the IRQ (≈ 0.5 µs)  
- $T_{hard}$ = execution time of the hard handler  
- $T_{soft}$ = worst‑case time spent in softIRQ processing before interrupts are re‑enabled again  

Maximum interrupt latency (time from IRQ assertion to first instruction of user code after handling) is  
$$
L_{max}=T_{ack}+T_{hard}+T_{soft}
$$
If $T_{hard}>10\ \mu\text{s}$ on a 1 kHz interrupt source, the CPU spends > 1 % of its time in hard context, which can noticeably affect real‑time tasks.

---

## How It Works
### Step‑by‑Step Kernel Path
1. **Device asserts IRQ line** → APIC delivers vector *v* to CPU.  
2. CPU uses IDT[v] → jumps to `common_interrupt()` (assembly entry).  
3. Entry saves registers (`pt_regs`) on the **IRQ stack**, disables further interrupts (`cli`), and acknowledges the PIC/APIC (`EOI`).  
4. Calls `do_IRQ(unsigned int irq, struct pt_regs *regs)`:  
   - Retrieves `irq_desc[irq]` (descriptor with chip, action list).  
   - Invokes chip’s `->irq_ack()` and `->irq_mask_ack()` if needed.  
   - Executes each `action->handler` (hard IRQ handler) with `action->dev_id`.  
5. If a handler returns `IRQ_WAKE_THREAD`, the core sets `IRQTF_RUNTHREAD` and wakes the associated thread via `wake_up_process(thread)`.  
6. After all handlers, `irq_exit()`:  
   - Increments `preempt_count` to re‑enable interrupts.  
   - Checks `softirq_pending`; if nonzero, invokes `invoke_softirq()`.  
7. `invoke_softirq()` runs the softIRQ dispatcher: for each pending vector, calls its registered `action` with interrupts enabled.  
8. SoftIRQ actions may include tasklets (`tasklet_hi_softirq`, `tasklet_softirq`) or custom softIRQs (e.g., `NET_TX_SOFTIRQ`, `RCU_SOFTIRQ`).  
9. Control returns to the interrupted context (kernel or user) with `iretq`.

### Key Kernel Structures (C)
```c
/* irq_desc.h – per‑IRQ descriptor */
struct irq_desc {
    unsigned int            irq;
    struct irq_chip        *chip;
    void                   *handler_data;
    struct irqaction       *action;   /* linked list of handlers */
    unsigned long          status;
    unsigned int           depth;     /* disable nesting */
    bool                   threads_oneshot;
    struct thread          *thread;   /* for threaded IRQ */
    /* ... */
};

/* irqaction – one handler in the list */
struct irqaction {
    irq_handler_t          handler;
    unsigned long          flags;     /* IRQF_* */
    void                   *dev_id;
    struct irqaction      *next;
    /* ... */
};

/* softirq_action – registration */
struct softirq_action {
    void    (*action)(struct softirq_action *);
};
```

### Enabling/Disabling Interrupts (inline asm)
```c
unsigned long flags;
local_irq_save(flags);   /* pushes EFLAGS, clears IF */
    /* critical section */
local_irq_restore(flags);/* restores IF */
```
The saved `flags` contain the original IF bit; restoring it re‑enables interrupts only if they were enabled before.

### Requesting an IRQ
```c
/* hard‑IRQ only */
int ret = request_irq(IRQ_NUM, my_hard_handler,
                      IRQF_SHARED, "mydrv", &my_dev);

/* threaded IRQ */
int ret = request_threaded_irq(IRQ_NUM,
                               my_hard_handler,   /* can be NULL */
                               my_thread_fn,
                               IRQF_ONESHOT,      /* thread runs once per IRQ */
                               "mydrv", &my_dev);
```
`IRQF_ONESHOT` tells the core not to re‑enable the IRQ line until the thread finishes, preventing interrupt storms when the handler sleeps.

### SoftIRQ Registration (kernel built‑in)
```c
static void my_softirq_func(struct softirq_action *dummy)
{
    pr_info("my softirq executed\n");
    /* ... work ... */
}

static struct softirq_action my_softirq = {
    .action = my_softirq_func,
};

/* early init */
static int __init my_init(void)
{
    open_softirq(MY_SOFTIRQ_VEC, my_softirq_func);
    return 0;
}
module_init(my_init);
```
(`open_softirq` is a helper; modern kernels use `register_softirq()` via `softirq_vec`.)

### Tasklet Example
```c
DECLARE_TASKLET(my_tasklet, my_tasklet_func, (unsigned long)&my_data);

void my_tasklet_func(unsigned long data)
{
    struct my_data *d = (struct my_data *)data;
    /* process d */
}

/* from hard IRQ */
void my_hard_handler(int irq, void *dev_id)
{
    /* minimal work */
    tasklet_schedule(&my_tasklet);
    return IRQ_HANDLED;
}
```

---

## Worked Examples
### Example 1: Timer Interrupt (IRQ0) – Latency Calculation
- **Hardware**: PIT/Programmable Interval Timer, 100 Hz tick (`HZ=100`).  
- **Handler**: `tick_handler()` updates `jiffies`, does profile tick, returns `IRQ_HANDLED`.  
- Measured $T_{hard}=3.2\ \mu\text{s}$ (includes `update_process_times()` and `tick_nohz_stop_sched_tick()`).  
- $T_{ack}=0.5\ \mu\text{s}$, $T_{soft}=0$ (timer softIRQ is `TIMER_SOFTIRQ` but runs later; we ignore for latency).  

$$
L_{max}=0.5+3.2=3.7\ \mu\text{s}
$$
CPU utilization due to timer:  
$$
U = \frac{T_{hard}\times \text{rate}}{1\text{s}}=
\frac{3.2\ \mu\text{s}\times100}{1\text{s}}=0.032\%
$$
Thus the timer adds negligible load while guaranteeing sub‑10 µs latency.

### Example 2: Keyboard Interrupt – Defer to Tasklet
**Hardware**: AT keyboard controller on IRQ1 (i8042).  
**Hard handler** (`i8042_interrupt`):
```c
irqreturn_t i8042_interrupt(int irq, void *dev_id)
{
    u8 sc = inb(0x60);          /* read scancode */
    if (sc & 0x80) {
        /* key release – ignore for simplicity */
    } else {
        /* enqueue scancode for later processing */
        keyboard_tasklet_data.sc = sc & 0x7F;
        tasklet_schedule(&keyboard_tasklet);
    }
    return IRQ_HANDLED;
}
```
**Tasklet** (`keyboard_tasklet`):
```c
static void keyboard_tasklet_func(unsigned long data)
{
    struct kb_data *d = (struct kb_data *)data;
    /* translate scancode → keycode, push to input layer */
    input_event(d->dev, EV_KEY, d->sc, 1);
    input_sync(d->dev);
}
```
**Why defer?** Scancode to keycode conversion may involve looking up keymaps, which can sleep (if using loadable keymap modules). Keeping it in a tasklet avoids sleeping in interrupt context while still processing the key promptly (typically < 20 µs after the IRQ).

### Example 3: USB Endpoint Interrupt – Threaded IRQ
**Device**: USB 2.0 bulk endpoint, IRQ allocated by the USB core.  
**Hard handler** (`usb_hcd_irq`):
```c
static irqreturn_t usb_hcd_irq(int irq, void *ptr)
{
    struct usb_hcd *hcd = ptr;
    u32 status = readl(&hcd->regs->intr_status);
    if (status & USB_INTR) {
        /* acknowledge */
        writel(status & USB_INTR, &hcd->regs->intr_status);
        /* wake the USB thread */
        return IRQ_WAKE_THREAD;
    }
    return IRQ_NONE;
}
```
**Threaded handler** (`usb_hcd_thread`):
```c
static int usb_hcd_thread(int irq, void *ptr)
{
    struct usb_hcd *hcd = ptr;
    while (!kthread_should_stop()) {
        wait_event_interruptible(hcd->wait,
                                 atomic_read(&hcd->intr_pending));
        /* process completed URBs, giveback to core */
        usb_hcd_giveback_urb(hcd, GFP_ATOMIC);
    }
    return 0;
}
```
**Request**:
```c
request_threaded_irq(hcd->irq,
                     usb_hcd_irq,
                     usb_hcd_thread,
                     IRQF_ONESHOT,
                     "usb-hcd", hcd);
```
The hard handler does only register I/O (< 1 µs) and returns `IRQ_WAKE_THREAD`. The thread, running in process context, can safely call `usb_hcd_giveback_urb()` which may allocate memory and take mutexes. This keeps USB latency low (< 5 µs) while allowing lengthy completions.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Breaks the System |
|---------|--------------|--------------------------|
| **Calling `msleep()` or allocating memory with `GFP_KERNEL` in a hard IRQ** | These functions may sleep. | With interrupts disabled, the scheduler cannot run; the system deadlocks or triggers a BUG (“scheduling while atomic”). |
| **Using a mutex (`mutex_lock`) in interrupt context** | Mutexes may cause the task to sleep. | Same deadlock as above; also corrupts lockdep state, leading to false positives. |
| **Failing to check `dev_id` in a shared IRQ handler** | The handler runs for *any* device on that line. | Without distinguishing devices, you may ignore or mishandle the actual source, causing lost events or spurious interrupts. |
| **Neglecting to return `IRQ_WAKE_THREAD` when the handler sleeps** | The core assumes the hard handler finished work. | The IRQ line stays disabled (if `IRQF_ONESHOT` not set) → interrupt storm; or the thread never wakes → device hangs. |
| **Using `tasklet_schedule()` from a hard handler that already holds a spinlock** | Tasklet may run on the same CPU and try to acquire the same lock. | Leads to deadlock because tasklet runs with interrupts enabled but the lock is held; the CPU spins forever. |
| **Not issuing an End‑Of‑Interrupt (EOI) to the APIC** | The interrupt line remains asserted. | The CPU will continuously retrap the same vector, locking up the system (“stuck IRQ”). |
| **Assuming `local_irq_save()` restores interrupts even if they were disabled before** | The macro only restores the saved state; if interrupts were already off, they stay off. | If code incorrectly assumes they are now on, subsequent code may run with interrupts off, raising latency. |
| **Calling `printk()` with a format string that dereferences a user pointer** | `printk()` may call `vsnprintf()` which can fault. | In interrupt context, a page fault triggers a double fault → kernel oops. |

---

## Exercises
### Easy
1. **Create a simple hard‑IRQ handler** for the parallel port data register (IRQ 7 on legacy x86).  
   - Write a module that requests IRQ 7, toggles the LED on pin 2 each interrupt, and prints a message with `printk(KERN_INFO "parport IRQ %d\n", irq)`.  
   - Verify with `cat /proc/interrupts` before and after loading/unloading.  
2. **Read `/proc/softirqs`** and report the count of `TIMER_SOFTIRQ` and `NET_TX_SOFTIRQ` after generating network traffic (`ping -c 100 localhost`).  

### Moderate
3. **Modify the parallel‑port handler** to defer the LED toggle to a tasklet.  
   - In the hard handler, just record the timestamp (`ktime_get_now()`) and call `tasklet_schedule(&my_tasklet)`.  
   - In the tasklet, toggle the LED and compute the delta between the timestamp and the current time; print the latency.  
   - Run a loop that toggles the port via `outb` from userspace (using `ioperm`) and observe the latency distribution.  
4. **Implement a threaded IRQ** for a GPIO line using the `gpio‑keys` driver (or libgpiod).  
   - Request the IRQ with `request_threaded_irq()`, hard handler returns `IRQ_WAKE_THREAD`.  
   - In the thread, read the GPIO value, increment a counter exposed via `/sys/kernel/debug/gpio_threaded/count`.  
   - Stress test by toggling the GPIO with a userspace loop and verify the counter matches the number of toggles.

### Hard
5. **Measure worst‑case interrupt latency** with `cyclictest` (from the `rt-tests` package).  
   - Configure a periodic timer interrupt (e.g., `hrtimer`) at 1 kHz.  
   - Run `cyclictest -l1000 -m -S -i200 -h400 -q` and record the maximum latency.  
   - Explain how adding a long softIRQ (e.g., a busy loop of 10 µs) changes the observed maximum.  
6. **Implement a custom softIRQ** that processes a ring‑buffer of network packets.  
   - Register the softIRQ with `open_softirq(NET_RX_SOFTIRQ+1, my_softirq_func)`.  
   - From the NIC driver’s hard IRQ, push packets onto a per‑CPU buffer and raise the softIRQ.  
   - In the softIRQ, drain the buffer and deliver packets to the stack via `netif_receive_skb()`.  
   - Benchmark throughput with `iperf3` and compare to the default NAPI path.  

---

## Linux Connection
### Subsystems & Files
| Concept | Kernel Subsystem | Source Files | Typical Paths / Interfaces |
|---------|------------------|--------------|----------------------------|
| IRQ descriptor core | `genirq` | `kernel/irq/manage.c`, `kernel/irq/chip.c` | `/proc/interrupts`, `/sys/kernel/irq/*/spurious`, `/sys/kernel/irq/*/trigger` |
| Hard‑IRQ handling | `arch/x86/kernel/irq.c` (x86 example) | `do_IRQ()`, `handle_IRQ_event()` | N/A |
| SoftIRQ | `kernel/softirq.c` | `raise_softirq()`, `do_softirq()` | `/proc/
