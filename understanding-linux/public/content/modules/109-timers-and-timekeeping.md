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

## Why This Matters

Every scheduler decision, network timeout, filesystem flush, and animation frame depends on the kernel knowing *when* things happen. Two distinct problems must be solved: tracking the passage of time with sufficient resolution, and firing callbacks at future moments with acceptable accuracy. Linux solves these with layered mechanisms — coarse jiffy-based timers for legacy and low-resolution work, high-resolution timers (`hrtimer`) for precision, and hardware clocksources that feed them both. Understanding the layering tells you *which* mechanism to use, why certain APIs forbid sleeping, and why `NO_HZ` changes the semantics of `jiffies`.

---

## Core Concepts

### The Timer Interrupt and HZ

The kernel programs a hardware timer (the PIT, LAPIC timer, or equivalent) to fire a periodic interrupt — the *tick*. Each tick increments `jiffies` and invokes the scheduler's `scheduler_tick()`, giving it a chance to preempt the running process. The compile-time constant `HZ` is the number of ticks per second — typically 250 on desktop kernels, 100 on server kernels optimized for throughput, and 1000 on low-latency configurations. The tradeoff is direct: higher `HZ` reduces worst-case timer latency but the interrupt overhead itself consumes CPU cycles that would otherwise run userspace.

The smallest time unit the tick-based system can express is one jiffy:

$$t_{\text{jiffy}} = \frac{1}{\text{HZ}} \text{ seconds}$$

At `HZ=250`, one jiffy is 4 ms. A process that calls `msleep(1)` on such a kernel sleeps for the *next* tick boundary — up to 4 ms later, not 1 ms. This is not a bug; it is the advertised resolution of the jiffy layer.

Check the configured `HZ` on a running system:

```bash
grep "^CONFIG_HZ=" /boot/config-$(uname -r)
# or, at runtime via the vDSO-exported value:
getconf CLK_TCK
```

### Jiffies

`jiffies` is a global `unsigned long` incremented once per tick. System uptime in seconds is:

$$\text{uptime} = \frac{\text{jiffies}}{\text{HZ}}$$

Because `jiffies` is unsigned, it wraps. On a 32-bit kernel at `HZ=1000`, overflow occurs after:

$$t_{\text{overflow}} = \frac{2^{32}}{\text{HZ}} = \frac{4{,}294{,}967{,}296}{1000} \approx 49.7 \text{ days}$$

On 64-bit kernels, `jiffies` occupies 64 bits, making overflow irrelevant in practice:

$$t_{\text{overflow}} = \frac{2^{64}}{1000} \approx 5.85 \times 10^{8} \text{ years}$$

### jiffies\_64 and Atomic Reads

On 32-bit architectures, a 64-bit load is not atomic — two 32-bit reads can be interrupted between them, producing a torn value. Linux therefore maintains a `jiffies_64` variable and makes `jiffies` a preprocessor alias to its lower 32 bits. Correct 64-bit reads require the seqlock `jiffies_lock`:

```c
u64 j = get_jiffies_64();   /* uses xtime_lock seqlock internally */
```

Directly reading `jiffies` on 32-bit is fine because it is a naturally aligned 32-bit word — the single load is atomic by the architecture's memory model.

### Tickless (NO\_HZ) Mode

A fixed-rate tick wakes the CPU on every jiffy regardless of whether any work is pending, burning power and polluting the CPU's cache state. `NO_HZ_IDLE` (enabled by default since Linux 3.10) suppresses the tick when the CPU is idle, reprogramming the hardware one-shot timer to fire only at the next pending timer deadline. On a CPU that idles for 200 ms, this eliminates $200 \times \text{HZ} / 1000$ spurious interrupts.

The consequence: `jiffies` does *not* advance while idle. When the CPU wakes, the timer interrupt handler calls `tick_do_update_jiffies64()` to catchup all missed ticks at once. Code that busy-polls `jiffies` expecting it to tick forward will spin indefinitely on an idle core — use `schedule_timeout()` or an `hrtimer` instead.

`NO_HZ_FULL` goes further, also suppressing the tick on CPUs running exactly one userspace task, targeting HPC and real-time workloads. Verify the mode:

```bash
cat /sys/devices/system/cpu/cpu0/cpuidle/state*/name
grep "^CONFIG_NO_HZ" /boot/config-$(uname -r)
```

### Clocksources

A *clocksource* abstracts hardware counters — TSC, HPET, ACPI PM timer, `jiffies` itself as a fallback — into a monotonically increasing counter at a known frequency. The kernel selects the highest-rated available clocksource and uses it as the reference for both wall time and `hrtimer` expiry.

Raw hardware counts are converted to nanoseconds using precomputed fixed-point multiplier/shift pairs to avoid floating-point:

$$t_{\text{ns}} = \frac{\text{count} \times \text{mult}}{2^{\text{shift}}}$$

The kernel solves for `mult` and `shift` given the hardware frequency $f_{\text{hw}}$ such that the expression is exact at full counter range. This avoids `do_div` (slow) and floating-point (unavailable in kernel context).

Inspect registered clocksources and the active one:

```bash
cat /sys/devices/system/clocksource/clocksource0/available_clocksource
cat /sys/devices/system/clocksource/clocksource0/current_clocksource
# force a different one (testing only):
echo hpet > /sys/devices/system/clocksource/clocksource0/current_clocksource
```

On x86, TSC is preferred when it is *invariant* (constant frequency regardless of CPU power state). A non-invariant TSC drifts as the CPU frequency changes, which is why older machines fall back to HPET or PM timer.

### High-Resolution Timers (hrtimer)

Jiffy-based timers have a minimum granularity of $1/\text{HZ}$ seconds and fire only at tick boundaries. `hrtimer`s bypass the tick entirely: they program the underlying hardware one-shot timer directly, achieving nanosecond-resolution expiry bounded only by hardware latency and interrupt delivery delay.

`hrtimer`s are stored in a per-CPU red-black tree keyed by expiration time. This gives:

- Insertion: $O(\log n)$
- Next-expiry lookup: $O(1)$ — always the leftmost node, cached in `hrtimer_cpu_base.next_timer`

When the system is in `NO_HZ` idle mode, the kernel reads the leftmost `hrtimer` expiry from this tree to decide how long to sleep before reprogramming the hardware timer.

### Wall Time and the Timekeeper

The kernel's authoritative wall clock is maintained by the *timekeeper* subsystem (`kernel/time/timekeeping.c`). It stores `xtime_sec` (seconds since the Unix epoch) and a nanosecond offset accumulated from the clocksource. This replaces the historical `xtime` global documented in older references — do not use `xtime` directly; it no longer exists as a public symbol.

`CLOCK_REALTIME` is this wall clock — it can jump backward when NTP steps the time. `CLOCK_MONOTONIC` is wall time minus the time spent suspended — it never jumps but includes NTP slewing. `CLOCK_BOOTTIME` adds suspended time and is the right choice for measuring elapsed intervals across suspend/resume.

---

## How It Works

### Using Jiffies for Timeouts

```c
unsigned long deadline = jiffies + msecs_to_jiffies(500);  /* 500 ms */

do_some_work();

if (time_before(jiffies, deadline)) {
    /* completed within deadline */
} else {
    /* timed out */
}
```

**Never use raw `<` or `>` to compare jiffies values.** The correct macros from `<linux/jiffies.h>` use signed arithmetic on the difference:

```c
#define time_after(a, b)    ((long)(b) - (long)(a) < 0)
#define time_before(a, b)   time_after(b, a)
```

Why signed? Suppose `jiffies` just wrapped: `a = 5`, `b = 0xFFFFFFFC`. A naive `a > b` is false — 5 is numerically less than 0xFFFFFFFC. But `(long)b - (long)a = -7`, which is negative, so `time_after(a, b)` is true — `a` *is* temporally after `b`. The wrap is handled correctly because the two values are within `LONG_MAX` jiffies of each other, which holds for any reasonable timeout.

Use `msecs_to_jiffies()` and `usecs_to_jiffies()` rather than computing `n * HZ / 1000` by hand — the helpers round correctly and handle edge cases.

### Kernel Timer API (Low Resolution)

```c
#include <linux/timer.h>

struct timer_list my_timer;

/* Initialize — third argument is flags (0 for basic use) */
timer_setup(&my_timer, my_callback, 0);

/* Arm for 1 second from now */
mod_timer(&my_timer, jiffies + HZ);

/* Callback runs in softirq context */
static void my_callback(struct timer_list *t)
{
    /* Cannot sleep. Cannot acquire a mutex. Must be fast. */
    pr_info("timer fired at jiffies=%lu\n", jiffies);
    /* Re-arm if periodic: */
    mod_timer(t, jiffies
