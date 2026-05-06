---
id: 44
title: "Synchronous design"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Core Concepts
### Synchronous Design
Synchronous design relies on **edge‑triggered storage elements** (flip‑flops) that sample their inputs only at well‑defined instants of a periodic clock signal. Between two successive clock edges the combinational logic may change arbitrarily; the flip‑flops hide this activity and present a stable value to the next stage.  
*Why this matters:* By restricting state changes to clock edges we eliminate **race conditions** that would otherwise require hand‑shaking protocols. The system’s behavior becomes a deterministic function of the clock, which simplifies timing analysis and verification.

### Clock Domains
A **clock domain** is a maximal set of sequential elements that share the same clock source (including its phase and frequency). All signals that travel entirely within a domain experience the same clock‑edge timing, so intra‑domain paths can be verified with static timing analysis (STA).  
When a signal leaves one domain and enters another, the relative phase between the two clocks is unknown; the crossing must be handled by a **synchronizer** (usually a chain of two flip‑flops) to reduce the probability of metastability to an acceptable level. The mean time between failures (MTBF) of a synchronizer is  

$$
\text{MTBF} = \frac{e^{\frac{t_w}{\tau}}}{T_0 \cdot f_{data} \cdot f_{clk}}
$$

where \(t_w\) is the available resolution time, \(\tau\) the metastability time constant, \(T_0\) a technology‑dependent constant, \(f_{data}\) the data‑change frequency, and \(f_{clk}\) the clock frequency.

### Metastability
A flip‑flop is a bistable circuit. If the data input changes within the **setup‑hold window** around a clock edge, the circuit may be driven into a metastable state where the output lingers at an intermediate voltage before resolving to either logic‑0 or logic‑1. The resolution time follows an exponential distribution:

$$
P\{t_{res} > t\} = e^{-t/\tau}
$$

with \(\tau\) typically on the order of picoseconds for modern CMOS. The longer we allow the output to settle (by adding extra synchronizer stages), the lower the failure probability.

### Reset Strategies
* **Synchronous reset** – The reset signal is fed into the flip‑flop’s synchronous input (often via an AND gate with the data path) and is sampled on the clock edge. This guarantees that reset removal never violates setup/hold, but the reset latency is at least one clock period.  
* **Asynchronous reset** – The reset pin directly forces the flip‑flop output to a known value, independent of the clock. De‑assertion, however, must be synchronized to the clock; otherwise a reset released near a clock edge can induce metastability. A common practice is to **synchronize the de‑assertion** with a two‑flip‑flop reset synchronizer.

Both strategies must be chosen based on latency tolerance and the risk of reset‑induced metastability.

## How It Works
### Timing Budgets
Consider a launch flip‑flop **FF1**, a combinational block with propagation delay \(t_{pd}\), and a capture flip‑flop **FF2**.

1. **Launch edge** at time \(t=0\) (clock edge at FF1).  
2. After FF1’s clock‑to‑Q delay \(t_{pcq}\), the new data appears at FF1’s output.  
3. The data traverses the combinational logic, arriving at FF2’s input after \(t_{pd}\).  
4. FF2 will capture the data on the next clock edge at time \(T_c\) (the clock period).  

For correct capture the data must be stable **before** the setup window of FF2 closes:

$$
t_{pcq} + t_{pd} \le T_c - t_{setup} - t_{skew}
$$

where \(t_{skew}\) accounts for the difference in clock arrival times at FF1 and FF2 (positive skew means the clock arrives later at FF2). Rearranging gives the **setup constraint**:

$$
\boxed{T_c \ge t_{pcq} + t_{pd} + t_{setup} + t_{skew}} \tag{1}
$$

The **hold constraint** ensures that the new data does not overwrite the previous capture too early:

$$
t_{pcq} + t_{pd} \ge t_{hold} + t_{skew}
\quad\Longrightarrow\quad
\boxed{t_{hold} \le t_{pcq} + t_{pd} - t_{skew}} \tag{2}
$$

If (2) is violated, a hold‑time failure occurs regardless of clock frequency; the fix is to add delay (e.g., buffer insertion) in the data path.

### Clock Frequency
From (1) the maximum usable frequency is

$$
f_{max} = \frac{1}{T_c^{min}} = \frac{1}{t_{pcq} + t_{pd} + t_{setup} + t_{skew}} .
$$

Clock **jitter** (\(\sigma_{jitter}\)) effectively reduces the available period; designers often substitute \(T_c \rightarrow T_c - \sigma_{jitter}\) in (1) for a safety margin.

## Worked Examples
### Example 1 – Minimum Clock Period
Given:  
\(t_{pcq}=2\text{ ns}\) , \(t_{pd}=5\text{ ns}\) , \(t_{setup}=1\text{ ns}\) , \(t_{skew}=0.5\text{ ns}\).

Apply (1):

$$
\begin{aligned}
T_c^{min} &= 2 + 5 + 1 + 0.5 \\
          &= 8.5\text{ ns}.
\end{aligned}
$$

Thus the system must be clocked at **≤ 117.6 MHz** (since \(f = 1/T_c\)).

### Example 2 – Maximum Operating Frequency with Hold Check
Given:  
\(T_c = 10\text{ ns}\) , \(t_{pcq}=2\text{ ns}\) , \(t_{setup}=1\text{ ns}\) , assume \(t_{skew}=0\) and \(t_{hold}=0.5\text{ ns}\).

First compute the allowable combinational delay from (1):

$$
t_{pd}^{max} = T_c - t_{pcq} - t_{setup} - t_{skew}
              = 10 - 2 - 1 - 0 = 7\text{ ns}.
\]

Now verify hold using (2):

$$
t_{hold}^{max} = t_{pcq} + t_{pd} - t_{skew}
               = 2 + 7 - 0 = 9\text{ ns} \gg 0.5\text{ ns},
$$

so the hold constraint is easily satisfied. The maximum frequency is

$$
f_{max} = \frac{1}{10\text{ ns}} = 100\text{ MHz}.
$$

### Example 3 – Impact of Clock Skew
Suppose the same parameters as Example 1 but the clock arrives **0.3 ns later** at FF2 (\(t_{skew}=+0.3\text{ ns}\)). Then

$$
T_c^{min}=2+5+1+0.3=8.3\text{ ns}\;(≈120.5\text{ MHz}).
\]

If the skew were **‑0.3 ns** (clock early at FF2), the bound tightens to \(8.8\text{ ns}\) (≈113.6 MHz), illustrating how skew directly shifts the feasible frequency window.

## Common Mistakes
| # | Mistake | Why It’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Neglecting clock jitter** in the period budget | Jitter reduces the effective usable interval; treating \(T_c\) as deterministic yields optimistic frequency estimates. | Sporadic setup violations → silent data corruption, especially at high frequencies. |
| 2 | **Using an asynchronous reset without a de‑assertion synchronizer** | Reset release can occur arbitrarily close to a clock edge, violating the flip‑flop’s recovery/removal time and inducing metastability. | System may power‑up correctly but lock up sporadically after reset de‑assertion. |
| 3 | **Assuming a single‑cycle path for all logic** | Some functional blocks (e.g., multipliers, barrel shifters) inherently require multiple clock cycles; forcing them into one cycle inflates \(t_{pd}\) beyond the budget. | Timing closure fails; designers resort to unsafe clock gating or voltage over‑scaling. |
| 4 | **Crossing clock domains with a single flip‑flop** | A single FF cannot sufficiently reduce metastability; the MTBF may be unacceptably low for the required operation time. | Field failures manifest as rare glitches that are hard to reproduce. |
| 5 | **Over‑looking hold time when tightening the clock** | Reducing \(T_c\) to increase frequency does not affect hold; hold depends only on data path delays. | Hold violations appear after frequency scaling, necessitating redesign. |

Each mistake stems from ignoring a **first‑principles timing constraint** (setup, hold, metastability, or domain crossing) and leads to unreliable silicon.

## Exercises
### Easy
1. A design has \(t_{pcq}=1.2\text{ ns}\), \(t_{pd}=3.8\text{ ns}\), \(t_{setup}=0.8\text{ ns}\), and \(t_{skew}=0.2\text{ ns}\).  
   Compute the minimum clock period \(T_c^{min}\) and the corresponding maximum frequency.

### Medium
2. Given \(T_c = 12\text{ ns}\), \(t_{pcq}=1.5\text{ ns}\), \(t_{setup}=0.9\text{ ns}\), \(t_{skew}=0.1\text{ ns}\), and a required hold time \(t_{hold}=0.4\text{ ns}\).  
   Determine the maximum allowable combinational delay \(t_{pd}^{max}\) that satisfies both setup and hold.

### Hard
3. You must transfer a 1‑bit signal from a 125 MHz domain to a 100 MHz domain.  
   * (a) Design a two‑flip‑flop synchronizer and compute its MTBF assuming \(\tau = 50\text{ ps}\), \(T_0 = 1\times10^{-12}\text{ s}\), \(f_{data}=125\text{ MHz}\), \(f_{clk}=100\text{ MHz}\), and a available resolution time \(t_w = 2\text{ ns}\).  
   * (b) If the system must run for 10 years without a metastailure, what is the minimum \(t_w\) required?  

### Challenge
4. A processor core runs at 2 GHz with a clock‑to‑Q delay of 30 ps, setup of 40 ps, and negligible skew.  
   * (a) What is the maximum combinational delay permissible per pipeline stage?  
   * (b) If a particular ALU operation needs 250 ps of combinational delay, how many pipeline stages are required to meet the timing budget, assuming ideal stage balancing?  

## Linux Connection
Linux’s time‑keeping and interrupt subsystems are built on synchronous‑design principles at the hardware‑software boundary.

### Clock Sources and HRTimers
The kernel abstracts hardware timers through the **clocksource** framework (`include/linux/clocksource.h`). Each clocksource provides a free‑running counter that is read atomically; the counter value is derived from a **synchronous hardware incrementer** (e.g., the TSC on x86, ARM’s CNTVCT). The kernel converts the raw count to nanoseconds using a fixed‑point multiplier (`mult` and `shift`) – a direct application of the formula  

$$
\text{nsec} = \frac{(\text{cycles} \times \text{mult})}{2^{\text{shift}}} .
\]

*Real file:* `arch/x86/include/asm/msr.h` (RDTSC) and `kernel/time/clocksource.c`.

**Shell command to view the current clocksource and its rating:**

```bash
cat /sys/devices/system/clocksource/clocksource0/available_clocksource
cat /sys/devices/system/clocksource/clocksource0/current_clocksource
```

### High‑Resolution Timers (hrtimers)
`hrtimer` (`kernel/time/hrtimer.c`) implements per‑CPU timer bases that are programmed into the hardware comparator (e.g., APIC timer on x86). The timer interrupt handler runs in a **hard interrupt context**, which is synchronous to the CPU’s local APIC clock. The hr timer’s callback is executed after the hardware compare‑match event, guaranteeing sub‑microsecond latency.

*Example: measuring a short interval with `clock_gettime` (CLOCK_MONOTONIC):*

```c
/* measure_latency.c */
#include <stdio.h>
#include <time.h>
#include <unistd.h>

int main(void) {
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    /* a tiny busy‑wait */
    for (volatile int i = 0; i < 1000; ++i) ;
    clock_gettime(CLOCK_MONOTONIC, &end);
    double elapsed = (end.tv_sec - start.tv_sec) +
                     1e-9 * (end.tv_nsec - start.tv_nsec);
    printf("Elapsed: %.3f µs\n", elapsed * 1e6);
    return 0;
}
```

Compile and run:

```bash
gcc -O2 -o measure_latency measure_latency.c
./measure_latency
```

### Synchronizing Access to Shared Data
The Linux kernel uses **futexes** (`fs/futex.c`) as the primitive behind `pthread_mutex_lock/unlock`. A futex operation consists of:

1. An atomic userspace test (e.g., `cmpxchg`).  
2. If the test fails, the task executes a system call (`futex(FUTEX_WAIT)`) that puts it to sleep **synchronously** with the kernel scheduler’s tick (or hrtimer‑based timeout).  

*Kernel source:* `kernel/futex.c`, `include/linux/futex.h`.

**Shell command to inspect futex usage of a process:**

```bash
# Replace 1234 with the target PID
cat /proc/1234/wchan   # shows if the task is waiting on a futex
perf trace -p 1234 -e sys_exit:futex
```

### Real‑World Subsystem: Networking Stack
The NIC driver’s **TX ring** is populated by the driver in sync with the NIC’s internal descriptor clock (often derived from the PCIe reference clock). The driver updates the producer index using a **memory‑mapped register**; the NIC consumes descriptors on its own synchronous clock. If the driver writes faster than the NIC can consume, the ring overruns—a classic **producer‑consumer** synchronous design issue. The driver must therefore respect the NIC’s reported `tx_ring->count` and use `netif_tx_lock` (a spinlock) to serialize accesses, ensuring that the producer and consumer stay within the same clock domain of the descriptor ring.

*File:* `drivers/net/ethernet/vendor/device.c` (look for `netdev_tx_queue`).

**Command to view TX ring statistics:**

```bash
ethtool -S eth0 | grep tx_queue
```

### Takeaway
Linux synchronizes software actions to hardware clocks whenever deterministic timing is required—whether it’s reading a cycle counter, programming a hardware comparator, or coordinating descriptor rings. The same setup/hold, metastability, and clock‑domain concepts that govern FPGA/ASIC design also govern the kernel’s interaction with silicon.

## Why This Matters
Synchronous design is not an academic abstraction; it is the **foundation of reliable, predictable digital systems**. By anchoring every state transition to a clock edge we:

* **Eliminate race conditions** that would otherwise demand complex handshaking or arbitration.  
* **Enable static timing analysis**, allowing designers to certify timing closure before silicon is fabricated.  
* **Bound metastability** to quantifiable probabilities, letting us size synchronizers for MTBF targets that exceed product lifetimes.  
* **Provide a clear interface** between software and hardware: the kernel reads synchronous counters, programs synchronous timers, and coordinates DMA descriptors—all of which rely on the same setup/hold principles.

In domains where a single glitch can have catastrophic consequences—financial trading platforms, medical imaging equipment, avionics, automotive control units—predictable timing is a **non‑functional requirement** that directly maps to safety certifications (DO‑178C, ISO 26262, IEC 61508). Mastery of synchronous design lets engineers:

* Size clock periods and pipeline stages to meet throughput goals while preserving timing margins.  
* Design robust clock‑domain crossing circuits that keep system MTBF in the centuries.  
* Choose reset strategies that avoid power‑up glitches without sacrificing boot time.  
* Interact confidently with Linux’s time‑keeping, interrupt, and synchronization subsystems, knowing that the underlying hardware obeys the same timing laws.

Thus, a deep grasp of synchronous design transforms a theoretical concept into a practical lever for building **fast, correct, and safe** systems that Linux—and the applications that run on it—can depend on.
