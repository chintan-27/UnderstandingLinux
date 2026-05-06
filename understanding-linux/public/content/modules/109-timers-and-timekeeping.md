---
id: 109
title: "Timers and timekeeping"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
### Jiffies: the kernel’s tick counter
The Linux kernel measures time in **jiffies**, a unit defined as the interval between two successive timer interrupts.  
If the timer interrupt frequency is **HZ** interrupts per second, then  

\[
\text{1 jiffy} = \frac{1}{\text{HZ}} \text{ seconds}
\]

and the global variable `jiffies` holds the count of ticks since boot:

\[
\text{jiffies}(t) = \left\lfloor \frac{t}{\text{TICK}} \right\rfloor
\quad\text{where}\quad
\text{TICK} = \frac{1}{\text{HZ}}.
\]

*Why a fixed‑frequency interrupt?*  
A periodic interrupt gives the scheduler a predictable time slice to pre‑empt tasks, update load averages, and drive periodic work (e.g., accounting, timeout handling). The tick rate must be high enough to give fine‑grained pre‑emption but low enough to avoid excessive interrupt overhead. Historically `HZ = 100` (10 ms tick) was chosen for early PCs; modern kernels allow `HZ = 250`, `1000`, or even **tickless** operation where the interrupt is programmed only when needed.

### HZ and tick rate
`HZ` is a compile‑time constant defined in `include/linux/param.h`. The kernel programs the hardware timer (PIT, HPET, or local APIC timer) to generate an interrupt every `TICK` seconds.  

When the kernel is **tickless** (`CONFIG_NO_HZ_FULL`), the periodic interrupt is disabled for idle CPUs; the next interrupt is programmed based on the earliest pending timer (`timer_expires`). This reduces wake‑ups and saves power while preserving the semantics of `jiffies` (which is still incremented only when the interrupt fires).

### Clock sources
The kernel abstracts the underlying hardware clock with the **clocksource** framework (`include/linux/clocksource.h`). A clocksource provides a monotonic, free‑running counter and a rating (stability, resolution). The kernel selects the highest‑rated source that is available on the platform:

| Clocksource | Typical resolution | Remarks |
|-------------|--------------------|---------|
| **TSC** (Time Stamp Counter) | ≈1 cycle (sub‑ns on modern CPUs) | Fast, per‑CPU; may drift if not invariant (`constant_tsc` flag). |
| **HPET** | ≈100 ns | Fixed‑frequency, stable across cores, higher latency to read. |
| **PIT / ACPI PM Timer** | ≈1 µs | Legacy, used as fallback. |
| **KVM clock** (virtual) | Paravirtualized | Used inside VMs. |

The chosen clocksource feeds both the **tick** (via `clocksource_register_hz`) and the **high‑resolution timers** (`hrtimer`) subsystem.

---

## How It Works
### Timer interrupt handling flow
1. **Hardware interrupt** → APIC delivers interrupt vector to the CPU.  
2. Entry via `interrupt()` → `do_IRQ()` → generic IRQ handler.  
3. For the timer vector, the handler is `tick_handle_periodic()` (tick‑based) or `tick_handle_oneshot()` (tickless).  
4. The handler:
   - Increments `jiffies` (`__this_cpu_add(jiffies, 1)`).  
   - Updates scheduler statistics (`update_process_times()`).  
   - Executes pending **softirqs** (`TIMER_SOFTIRQ`).  
   - Reprograms the next interrupt (if not in oneshot mode).  

*Why increment `jiffies` here?*  
The interrupt is the only guaranteed moment when the kernel can safely update a global tick counter without races; doing so elsewhere would require disabling pre‑emption or using atomic operations with higher overhead.

### Software timer implementation
Two layers exist:

| Layer | API | Typical use |
|-------|-----|-------------|
| **Legacy timers** (`struct timer_list`) | `init_timer()`, `add_timer()`, `del_timer()` | Coarse‑grained, expires on the next tick. |
| **High‑resolution timers** (`struct hrtimer`) | `hrtimer_init()`, `hrtimer_start()`, `hrtimer_cancel()` | Sub‑tick precision (nanoseconds) using the clocksource directly. |

A `timer_list` expires when `jiffies >= timer->expires`. The kernel stores timers in a **hashed wheel** (`tvec_base.vecs`) to achieve O(1) insertion and O(1) expiry search per tick.

*Why a hashed wheel?*  
With `HZ` ticks per second, each bucket represents a time interval. Inserting a timer computes its bucket index as `(expires & ((1<<TVR_BITS)-1))` for the first level, cascading to higher levels for longer intervals. This avoids scanning all timers on each tick.

### Timekeeping architecture
```
hardware clocksource  -->  tick (jiffies)  -->  scheduler, timekeeping
                           |
                           v
                     hrtimer (high‑res)  -->  device drivers, POSIX clocks
```
The **timekeeping** subsystem (`kernel/time/timekeeping.c`) maintains:
- `xtime_nsec`: wall‑clock time (CLOCK_REALTIME) in nanoseconds.
- `monotonic_time_nsec`: CLOCK_MONOTONIC.
- Adjustments via NTP (`ntp_tick_length()`).

---

## Worked Examples
### Example 1: Legacy timer expiring in 2 seconds
```c
/* timer_example.c */
#include <linux/module.h>
#include <linux/timer.h>
#include <linux/jiffies.h>

static struct timer_list my_timer;

static void my_timer_func(unsigned long data)
{
    pr_info("timer expired at jiffies=%lu (%.3f s)\n",
            jiffies, (double)jiffies / HZ);
}

static int __init timer_init(void)
{
    pr_info("loading timer module (HZ=%d)\n", HZ);

    init_timer(&my_timer);
    my_timer.function = my_timer_func;
    my_timer.expires = jiffies + 2 * HZ;   /* 2 seconds */
    add_timer(&my_timer);
    return 0;
}

static void __exit timer_exit(void)
{
    del_timer(&my_timer);
    pr_info("timer module unloaded\n");
}

module_init(timer_init);
module_exit(timer_exit);
MODULE_LICENSE("GPL");
```
**Explanation**  
- `jiffies + 2*HZ` computes the absolute expiry tick.  
- When the timer interrupt fires, `my_timer_func` runs in softirq context, prints the current `jiffies` and converts to seconds using the known `HZ`.  
- Build with `make -C /lib/modules/$(uname -r)/build M=$PWD modules` and insert via `insmod timer_example.ko`.  
- Check output: `dmesg | tail`.

### Example 2: Measuring elapsed time with jiffies (avoiding wrap‑around)
```c
/* jiffies_measure.c */
#include <linux/module.h>
#include <linux/jiffies.h>
#include <linux/delay.h>

static int __init measure_init(void)
{
    unsigned long start, end, elapsed;
    start = jiffies;               /* read once, atomic on this CPU */
    msleep(13);                    /* sleep ~13 ms */
    end = jiffies;
    /* Handle possible wrap‑around (unsigned subtraction works) */
    elapsed = end - start;
    pr_info("elapsed=%lu jiffies = %.3f ms\n",
            elapsed, (double)elapsed * 1000 / HZ);
    return 0;
}

static void __exit measure_exit(void) { }

module_init(measure_init);
module_exit(measure_exit);
MODULE_LICENSE("GPL");
```
**Why the subtraction works**  
`jiffies` is an `unsigned long`. If it wraps from `MAX_UINT` to `0`, the expression `end - start` (modulo 2^N) still yields the correct interval as long as the interval is less than `2^(N-1)` ticks – true for any realistic measurement (<~24 days on 32‑bit kernels with `HZ=1000`).

### Example 3: High‑resolution timing with TSC (invariant, synchronized)
```c
/* tsc_measure.c */
#include <linux/module.h>
#include <linux/tsc.h>
#include <linux/kernel.h>

static int __init tsc_init(void)
{
    unsigned long long start, end, cycles;
    uint32_t lo, hi;

    /* rdtsc is serialized via mfence on x86 */
    asm volatile ("mfence\n\t"
                  "rdtsc\n\t"
                  : "=a"(lo), "=d"(hi));
    start = ((unsigned long long)hi << 32) | lo;

    /* Busy‑wait ~500 ns using ndelay */
    ndelay(500);

    asm volatile ("rdtsc\n\t"
                  "mfence\n\t"
                  : "=a"(lo), "=d"(hi));
    end = ((unsigned long long)hi << 32) | lo;

    cycles = end - start;
    pr_info("TSC elapsed=%llu cycles = %.3f ns\n",
            cycles,
            (double)cycles / tsc_khz * 1e3);   /* tsc_khz set by boot */
    return 0;
}

static void __exit tsc_exit(void) { }

module_init(tsc_init);
module_exit(tsc_exit);
MODULE_LICENSE("GPL");
```
**Notes**  
- `tsc_khz` is exported from `arch/x86/kernel/tsc.c` after calibration against the PIT/HPET.  
- The `mfence` instructions serialize execution to prevent out‑of‑order `rdtsc`.  
- On CPUs with `constant_tsc` and `nonstop_tsc` flags, the TSC ticks at a fixed rate regardless of P‑state changes, making it suitable for wall‑clock measurements after conversion.

---

## Common Mistakes
| Mistake | What’s wrong | Why it matters |
|---------|--------------|----------------|
| **Assuming `jiffies` never wraps** | Treating `jiffies2 - jiffies1` as always positive without considering unsigned overflow. | On 32‑bit kernels with `HZ=1000`, wrap occurs every ~49.7 days; a long‑running measurement could report a huge negative interval, causing timeouts to fire incorrectly. |
| **Using jiffies for sub‑tick intervals** | Measuring delays shorter than `1/HZ` with `jiffies`. | The timer interrupt may not fire between start and end, yielding zero measured jiffies and giving a false impression of instantaneous execution. |
| **Ignoring tickless mode** | Expecting a periodic interrupt every `TICK` seconds on all CPUs. | In `CONFIG_NO_HZ_FULL`, idle CPUs suppress periodic ticks; code that relies on `jiffies` incrementing in a tight loop may stall until the next programmed event. |
| **Assuming TSC is synchronized across cores** | Reading TSC on CPU 0 and CPU 1 and subtracting without correction. | Unless the TSC is marked `constant_tsc` and `nonstop_tsc`, each core may have a different offset or drift, leading to bogus measurements. Use `rdtscp` + `cpuid` to serialize and read the per‑core TSC offset via `cpu_hw_clock`. |
| **Failing to protect timer list updates** | Modifying `timer_list.expires` while the timer is pending without `del_timer()` first. | The timer may fire twice or not at all, causing use‑after‑free or missed events. The core expects the timer to be either inactive or queued; changing `expires` while queued corrupts the hash‑wheel buckets. |

---

## Exercises
### Easy
1. **Print current jiffies and convert to seconds**  
   Write a kernel module that, on load, prints `jiffies` and the corresponding time in seconds with three decimal places.  
   *Hint:* use `pr_info("%lu jiffies = %.3f s\n", jiffies, (double)jiffies / HZ);`.

2. **Read the TSC frequency from sysfs**  
   Run `cat /sys/devices/system/clocksource/clocksource0/available_clocksource` and `cat /sys/devices/system/clocksource/clocksource0/tsc` (if present) to verify the kernel selected TSC and its kHz value.

### Medium
3. **Create a high‑resolution hrtimer that fires after 750 ns**  
   - Use `hrtimer_init(&timer, CLOCK_MONOTONIC, HRTIMER_MODE_REL);`  
   - Set the interval with `ktime_set(0, 750);`.  
   - In the callback, print the current `ktime_get_ns()` and the number of cycles elapsed since the callback was armed (read TSC inside the callback).  
   - Verify that the callback executes roughly once per microsecond by watching `dmesg` while the module is loaded.

4. **Measure context‑switch latency using `tracepoints`**  
   - Enable the `sched_switch` tracepoint: `echo 1 > /sys/kernel/debug/tracing/events/sched/sched_switch/enable`.  
   - Record a short trace with `trace-cmd record -e sched_switch sleep 0.1`.  
   - Extract the timestamp difference between successive switches of the same task and report the average latency in microseconds.

### Hard
5. **Implement a drift‑compensated clocksource reader**  
   - Write a module that reads the TSC every second (using a legacy timer) and compares it to `jiffies * (1e9/HZ)`.  
   - Compute a linear correction factor (slope) via least‑squares over N samples and apply it to future TSC‑based timestamps to achieve < 100 ppm error relative to `ktime_get_ns()`.  
   - Output the corrected time via a proc file (`/proc/my_tsc_time`).  
   - Discuss why this is necessary even on `constant_tsc` CPUs (e.g., VMs, power‑state transitions).

---

## Linux Connection
The timekeeping subsystem is woven throughout the kernel:

| Subsystem | File / Interface | Role |
|-----------|------------------|------|
| **Timer API** | `include/linux/timer.h`, `kernel/time/timer.c` | `struct timer_list`, `add_timer()`, `mod_timer()`. |
| **High‑resolution timers** | `include/linux/hrtimer.h`, `kernel/time/hrtimer.c` | `struct hrtimer`, `hrtimer_start()`, `hrtimer_cancel()`. |
| **Clocksource framework** | `include/linux/clocksource.h`, `drivers/clocksource/` | Registration, rating, fallback logic. |
| **Tick handling** | `kernel/time/tick-common.c`, `arch/x86/kernel/timeconst.h` | `tick_handle_periodic()`, `tick_handle_oneshot()`, `setup_per_cpu_areas()`. |
| **Timekeeping** | `kernel/time/timekeeping.c` | `xtime`, `wall_to_monotonic`, NTP adjustments. |
| **Procfs interfaces** | `/proc/timer_list` (active timers), `/proc/jiffies` (deprecated but present), `/sys/devices/system/clocksource/` | Debugging and observability. |
| **Tools** | `perf stat -e cycles,instructions`, `ftrace`, `trace-cmd`, `hwlatdetect` | Measure hardware latency, validate TSC invariance, verify tickless behavior. |

**Example shell session** (run on a recent Ubuntu kernel):
```bash
# 1. Verify HZ from the running kernel
grep CONFIG_HZ= /boot/config-$(uname -r)   # e.g., CONFIG_HZ=250

# 2. List available clock sources
cat /sys/devices/system/clocksource/available_clocksource
# → tsc hpet acpi_pm

# 3. See which source is currently used
cat /sys/devices/system/clocksource/clocksource0/current_clocksource
# → tsc

# 4. Read the TSC frequency (kHz) as calculated by the kernel
cat /sys/devices/system/clocksource/clocksource0/tsc
# → 3500000   (3.5 GHz)

# 5. Examine active timers (helps debug leaky timers)
cat /proc/timer_list | head -20
```
These commands expose the very concepts discussed: the compile‑time `HZ`, the selected clocksource, its frequency, and the kernel’s internal timer data structures.

---

## Why This Matters
Accurate timekeeping is the linchpin of virtually every kernel subsystem:

- **Scheduler** – determines pre‑emption points, load‑averaging, and runtime accounting; errors manifest as unfair CPU starvation or inflated latency metrics.  
- **Device drivers** – rely on timeouts (e.g., USB, networking) to detect hardware stalls; a mis‑calibrated timer causes spurious resets or missed deadlines.  
- **Real‑time applications** – need sub‑microsecond guarantees; they use `clock_gettime(CLOCK_MONOTONIC, …)` or `hrtimer` directly, trusting the kernel’s conversion from hardware cycles to nanoseconds.  
- **Virtualization & containers** – expose paravirtualized clocks (kvmclock, pvclock) that must stay in sync with the host’s timekeeper; drift leads to incorrect timestamps in logs and broken distributed systems.  
- **Power management** – tickless operation reduces wake‑ups; understanding how the kernel programs the next interrupt enables developers to design low‑power drivers that cooperate with the idle subsystem.

By mastering the **jiffies ↔ HZ ↔ clocksource** relationship, knowing when to use legacy timers versus hrtimers, and being able to observe and correct timing via `/sys`, `/proc`, and tracing tools, you gain the ability to:

1. Diagnose latency spikes that stem from timer mis‑configuration.  
2. Write drivers and kernel modules that respect the kernel’s timekeeping contracts (no accidental use of jiffies for high‑res delays, proper locking of timer lists).  
3. Tune systems for specific workloads (e.g., increase `HZ` for low‑latency trading, enable `NO_HZ_FULL` for power‑sensitive embedded boards).  

In short, timers and timekeeping are not abstract concepts; they are concrete, observable, and tunable parts of the Linux kernel that directly affect performance, correctness, and power efficiency. Understanding them from first principles lets you build systems that are both *fast* and *reliable*.
