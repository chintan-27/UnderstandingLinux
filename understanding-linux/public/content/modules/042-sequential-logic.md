---
id: 42
title: "Sequential logic"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Core Concepts
Sequential logic differs from combinational logic because its output is a function of both current inputs **and** the internal state stored in memory elements. The state changes only at discrete instants governed by a clock signal, making the circuit **synchronous**.  

A memory element must be bistable: two stable operating points (logic 0 and logic 1) separated by an energy barrier. The simplest bistable is the **SR latch** built from two cross‑coupled NOR (or NAND) gates. Its truth table shows that when S=R=0 the latch holds its previous state (feedback), while S=1,R=0 forces Q=1 and S=0,R=1 forces Q=0. The forbidden input S=R=1 creates a race condition; practical designs avoid it.  

A **flip‑flop** upgrades a latch to be edge‑triggered by inserting a second latch in a master‑slave configuration (or using edge‑sensitive transistor gates). The master latch samples the input when the clock is at one level (e.g., high); the slave latch becomes transparent when the clock switches to the opposite level, thereby transferring the master’s stored value to the output only on the clock edge. This eliminates transparency during the clock high period and enforces a **setup time** \(t_{su}\) (data must be stable before the edge) and a **hold time** \(t_h\) (data must stay stable after the edge). Violating these constraints can induce **metastability**, where the output lingers near an intermediate voltage for an unbounded time before resolving to a logic level. The mean time between failures (MTBF) due to metastability falls exponentially with the resolver time constant τ:  

\[
\text{MTBF} \approx \frac{e^{t_r/\tau}}{T_0 f_{clk} f_{data}}
\]

where \(t_r\) is the resolution time allowed, \(T_0\) a device‑specific constant, \(f_{clk}\) the clock frequency, and \(f_{data}\) the data‑change frequency.  

A **register** is a bank of flip‑flops sharing common control signals (clock, enable, reset, load). A **counter** is a register whose next‑state logic implements a deterministic sequence, most commonly binary up‑counting:  

\[
Q_{i}^{+}= Q_i \oplus \left(\prod_{j=0}^{i-1} \overline{Q_j}\right)
\]

for bit i (LSB i=0). The carry‑propagation chain gives a worst‑case delay of \(t_{pd,\text{counter}} = n \cdot t_{pd,\text{FF}}\) for an n‑bit ripple counter; synchronous counters replace the ripple chain with combinational look‑ahead, reducing delay to \(O(\log n)\).  

## How It Works
### Flip‑Flop Internal Mechanism
Consider a positive‑edge‑triggered D flip‑flop built from two D latches (master M, slave S).  

1. **Clock = 0**: Master latch is enabled (transparent), slave latch is disabled (holds). The master follows the D input: \(Q_M = D\).  
2. **Clock → 1 (rising edge)**: Master latch becomes disabled, capturing the D value present just before the edge. Slave latch becomes enabled, transmitting \(Q_M\) to the output: \(Q = Q_M\).  
3. **Clock = 1**: Master latch remains disabled (holds its captured value); slave latch remains transparent, so the output stays constant until the next edge.  

The **propagation delay** \(t_{pd}\) is the interval from the clock edge to the output changing. The **setup time** \(t_{su}\) is the minimum interval before the edge that D must be stable; the **hold time** \(t_h\) is the minimum interval after the edge that D must remain stable. For reliable operation we require  

\[
t_{clk} \ge t_{pd} + t_{su} + t_h
\]

which yields a maximum clock frequency  

\[
f_{\max} = \frac{1}{t_{pd} + t_{su} + t_h}.
\]

Typical 74HC74 values: \(t_{pd}=15\text{ ns}\), \(t_{su}=5\text{ ns}\), \(t_h=2\text{ ns}\) → \(f_{\max}\approx 40\text{ MHz}\).

### Counter Operation
A **synchronous binary counter** uses identical next‑logic for each bit, enabling parallel update. For a 4‑bit counter (Q3 Q2 Q1 Q0):  

\[
\begin{aligned}
D_0 &= \overline{Q_0} \\
D_1 &= Q_0 \oplus Q_1 \\
D_2 &= (Q_0 \land Q_1) \oplus Q_2 \\
D_3 &= (Q_0 \land Q_1 \land Q_2) \oplus Q_3 .
\end{aligned}
\]

Derivation: the LSB toggles every clock (\(T_0\) flip‑flop). Bit i toggles when all less‑significant bits are 1 (a carry‑in). The term \(\prod_{j=0}^{i-1} Q_j\) is the carry‑in; XOR with the current state yields the toggle.  

If each flip‑flop has \(t_{pd}=12\text{ ns}\) and the look‑ahead carry logic adds \(t_{logic}=4\text{ ns}\), the worst‑case clock‑to‑Q delay is  

\[
t_{pd,\text{counter}} = t_{pd} + t_{logic} = 16\text{ ns},
\]

giving \(f_{\max}\approx 62.5\text{ MHz}\), substantially higher than a ripple counter’s \(4 \times 12\text{ ns}=48\text{ ns}\) limit (~20 MHz).  

### Register Operation
A **parallel‑load register** with active‑high load signal LD and asynchronous reset RST:  

\[
Q^{+} = 
\begin{cases}
0 & \text{if } RST=1 \\
D & \text{if } LD=1 \\
Q & \text{otherwise}
\end{cases}
\]

Implemented with a 2‑to‑1 multiplexer feeding the D input of each flip‑flop, where the select line is LD. When LD=0 the mux feeds back the current Q, achieving a hold. Timing constraints are identical to a plain flip‑flop; the load signal must satisfy its own setup/hold relative to the clock.  

## Worked Examples
### Example 1: Synchronous 4‑Bit Binary Counter (Design & Timing)
**Goal:** Build a counter that counts 0→15→0 with a 50 MHz clock (period \(T=20\text{ ns}\)).  

**Step 1 – Choose flip‑flop:** 74HC74 D‑FF, \(t_{pd}=12\text{ ns}\), \(t_{su}=5\text{ ns}\), \(t_h=2\text{ ns}\).  

**Step 2 – Compute max frequency:** \(f_{\max}=1/(12+5+2)=1/19\text{ ns}\approx 52.6\text{ MHz}\). Our 50 MHz target satisfies the constraint.  

**Step 3 – Derive next‑state equations (as above).**  

**Step 4 – Draw schematic:** Four D‑FFs, each D input driven by the corresponding logic gate network (inverters, ANDs, XORs). Connect all clock pins together; tie reset to ground (inactive).  

**Step 5 – Verify timing:** Worst‑case path: clock edge → FF 0 \(t_{pd}\) → AND gate (for carry to FF 1) → XOR → FF 1 \(t_{pd}\). Assuming 2‑input AND/XOR each 4 ns, total = 12 ns (FF0) + 4 ns (AND) + 4 ns (XOR) + 12 ns (FF1) = 32 ns < 20 ns? Wait, we mis‑aligned. Actually the worst case is the carry propagating through all bits before the next clock edge. For a synchronous design the carry logic is combinational *between* clock edges, so the total combinational delay must be less than the clock period minus setup time:  

\[
t_{\text{comb}} \le T - t_{su} = 20\text{ ns} - 5\text{ ns} = 15\text{ ns}.
\]

Our naive gate count (AND+XOR per stage) yields ~8 ns per stage; for 4 stages the carry chain is 4 × 8 ns = 32 ns > 15 ns, thus we need a **carry‑look‑ahead** structure. Using look‑ahead, the carry for bit i is generated in \(O(\log i)\) gate levels; with 2‑level look‑ahead we achieve ≤ 6 ns, satisfying the constraint.  

**Step 6 – Simulation (C):**  

```c
/* 4-bit synchronous counter simulation */
#include <stdio.h>
int main(void) {
    unsigned char Q = 0;          // Q3..Q0
    const unsigned long long cycles = 20;
    for (unsigned long long t = 0; t < cycles; ++t) {
        printf("t=%2llu: %04b\n", t, Q);
        /* synchronous update on rising edge */
        unsigned char D0 = ! (Q & 0x1);
        unsigned char D1 = ((Q & 0x1) ^ ((Q >> 1) & 0x1));
        unsigned char D2 = (((Q & 0x3) == 0x3) ^ ((Q >> 2) & 0x1));
        unsigned char D3 = (((Q & 0x7) == 0x7) ^ ((Q >> 3) & 0x1));
        Q = (D0) | (D1 << 1) | (D2 << 2) | (D3 << 3);
    }
    return 0;
}
```
The printout shows the expected sequence 0‑15‑0‑… confirming functional correctness.

### Example 2: Parallel‑Load 8‑Bit Register (C + Inline ASM)
**Goal:** Load a byte from memory into a register on a clock edge, then read it back.  

**Step 1 – Define register as an array of flip‑flops (simulated by a volatile uint8_t).**  

**Step 2 – Use `clock_gettime` to generate a software tick; in real hardware the clock would be a hardware signal.**  

**Step 3 – Inline ASM to read the Time‑Stamp Counter (RDTSC) as a high‑resolution clock source for demonstration.**  

```c
#include <stdio.h>
#include <stdint.h>
#include <time.h>
#include <x86intrin.h>   /* for __rdtsc */

volatile uint8_t reg = 0;   /* 8‑bit register */
volatile uint8_t load = 0;  /* load strobe */
volatile uint8_t din  = 0;  /* data input */

/* Simulated rising edge detector */
static uint64_t last_tsc = 0;
static int edge_detected(void) {
    uint64_t now = __rdtsc();
    int edge = (now - last_tsc) > 0 && ((now ^ last_tsc) & 0x80000000ULL);
    last_tsc = now;
    return edge;
}

int main(void) {
    din = 0xA5;               /* data to load */
    for (int i = 0; i < 10; ++i) {
        if (edge_detected()) {   /* on each TSC tick (≈0.3 ns on 3 GHz CPU) */
            if (load) reg = din;  /* parallel load */
            /* else hold */
        }
        printf("load=%d, reg=0x%02x\n", load, reg);
        load = !load;           /* toggle load each iteration */
    }
    return 0;
}
```
Compiling with `-O0 -march=native` shows the register updating only when `load` is high and a rising edge is detected, illustrating the edge‑triggered behavior.

## Common Mistakes
1. **Assuming a latch is edge‑triggered.**  
   *Wrong:* Using an SR latch as a storage element in a synchronous pipeline.  
   *Why:* Latches are transparent when the enable is high, allowing glitches to propagate; flip‑flops isolate changes to clock edges, preventing race conditions.  

2. **Neglecting clock skew in counter design.**  
   *Wrong:* Drawing a ripple counter and assuming all bits change simultaneously.  
   *Why:* In a ripple counter each stage’s clock is the previous stage’s Q, causing cumulative skew; the MSB may toggle several nanoseconds after the LSB, producing glitches on intermediate states.  

3. **Using asynchronous reset without de‑asserting synchronously.**  
   *Wrong:* Asserting reset asynchronously and releasing it near a clock edge.  
   *Why:* If reset is released close to a clock edge, the flip‑flop may enter metastability because the internal latch is switching while the data inputs are changing. Proper design uses **synchronous reset** or asserts reset for at least one full clock period before de‑assertion.  

4. **Overlooking setup/hold times when interfacing to external peripherals.**  
   *Wrong:* Driving data lines directly from a GPIO without considering the peripheral’s \(t_{su}\) / \(t_h\).  
   *Why:* Violations cause intermittent data corruption, especially at high bus speeds; designers must add output delay elements or adjust clock polarity.  

5. **Believing a counter’s modulus is simply \(2^n\) without verifying the reset condition.**  
   *Wrong:* Wiring a 4‑bit binary counter to reset at count 12 and expecting a modulo‑12 counter.  
   *Why:* The reset must be asserted *before* the illegal state appears; otherwise the counter will briefly pass through 12‑15 before resetting, causing unintended output spikes. Proper design uses a **decoder** that detects the target state and asserts reset on the *next* clock edge.  

## Exercises
### Easy
1. **Timing Diagram:** Draw the clock, D, Q, and Q̅ waveforms for a positive‑edge‑triggered D latch given: clock period 20 ns, D changes at 5 ns and 15 ns after each rising edge, \(t_{su}=4\) ns, \(t_h=2\) ns. Mark setup/hold violations.  
2. **Register Reset:** Write a C function that models an 8‑bit register with synchronous reset, clock enable, and parallel load. Provide a short test loop that toggles reset and verify the output.  

### Medium
3. **Modulo‑6 Counter:** Using three JK flip‑flops, derive the excitation table for a modulo‑6 (0‑5) binary counter. Implement the next‑logic with NAND gates only, and draw the gate‑level schematic.  
4. **Shift‑Register Multiplexer:** Design a 4‑bit universal shift‑register (left, right, parallel load, hold) using 4‑bit multiplexers and D flip‑flops. Write the Verilog‑style pseudocode for the next‑state logic.  

### Hard
5. **Lock‑Free Counter:** Implement a per‑CPU atomic counter in C using the Linux `atomic_t` type and the `cmpxchg` instruction. Explain how the algorithm avoids the ABA problem and discuss memory‑ordering barriers (`smp_mb__before_atomic`).  
6. **FIFO Depth Analysis:** A synchronous FIFO is built from a dual‑port RAM of depth D, write pointer W, read pointer R, and flag logic: full = ((W+1) mod D == R), empty = (W == R). Prove that the FIFO can safely hold D‑1 elements without overflow/underflow, and calculate the maximum usable bandwidth given a clock frequency f and a worst‑case read‑latency of L cycles.  

## Linux Connection
The Linux kernel makes extensive use of sequential logic primitives, exposed through well‑documented subsystems and accessible via user‑space tools.

### Timer Subsystem (jiffies & hrtimer)
The core notion of **jiffies** is a tick‑count incremented by a periodic timer interrupt (typically 1 Hz–1000 Hz). It is implemented as an atomic 64‑bit counter (`jiffies_64`).  

```bash
# Show the current jiffies value and the rate at which it increments
grep -E 'jiffies|HZ' /proc/ktime
# Alternatively, read directly via the sysctl interface
sysctl kernel.jiffies
```

High‑resolution timers (`hrtimer`) build on the same principle but use programmable hardware counters (e.g., APIC TSC) to achieve sub‑microsecond resolution.  

```bash
# List available clock sources and the current one
cat /sys/devices/system/clocksource/clocksource0/available_clocksource
cat /sys/devices/system/clocksource/clocksource0/current_clocksource
```

The `timer_list` structure links active timers; its contents can be inspected:

```bash
# Dump the kernel's timer list (expensive on production systems!)
cat /proc/timer_list | head -20
```

### Sequential Counters in the Scheduler
The Completely Fair Scheduler (CFS) uses a **vruntime** counter per task, updated on each timer tick. The unit of vruntime is nanoseconds, derived from `sched_clock()` which reads the TSC and applies a scaling factor.

```bash
# Observe scheduler tick rate
cat /proc/sched_debug | grep -i "cpu#0"
```

### Seqlocks (seqlock_t) – Reader‑Writer Sequential Logic
A seqlock protects readers from writers by using a **sequence counter** that increments on each write start and end. Readers retry if they observe an odd value (indicating a concurrent write). The counter is a simple integer updated atomically.

```c
#include <linux/seqlock.h>
extern seqlock_t xtime_lock;
/* Readers */
unsigned int seq;
do {
    seq = read_seqbegin(&xtime_lock);
    /* ... read xtime ... */
} while (read_seqretry(&xtime_lock, seq));
```

The mechanism can be explored via `perf`:

```bash
# Count seqlock retries system‑wide
perf stat -e atomic:retries sleep 5
```

### Memory‑Barrier Primitives
Sequential logic in SMP systems requires explicit ordering. The kernel provides `smp_mb()`, `smp_rmb()`, `smp_wmb()` which compile to `mfence`, `lfence`, `sfence` on x86.  

```bash
# Show the assembly generated for a memory barrier in a kernel module
objdump -d my_module.ko | grep -A2 -B2 "mfence\|lfence\|sfence"
```

### Practical Exercise: Measuring Clock‑Source Accuracy
```bash
# Measure the TSC frequency using the kernel's reported value
cat /sys/devices/system/clocksource/clocksource0/available_clocksource
# Suppose it says "tsc". Now read the TSC over a known interval:
sudo perf stat -r 5 -e cycles:u sleep 1
```
The reported `cycles:u` count divided by the elapsed seconds gives the TSC frequency, confirming that the hardware counter increments deterministically with each clock pulse—a direct manifestation of sequential logic in the kernel.

## Why This Matters
Sequential logic is the bridge between **continuous physical time** and **discrete computational steps**. Every operating‑system abstraction—timers, schedulers, reference counters, lock‑free data structures—relies on precisely timed state transitions. When these transitions are misunderstood, subtle bugs appear: lost updates, spurious wake‑ups, or worst‑case metastability that can crash a system after days of uptight operation.  

By mastering the causal relationships—how setup/hold times bound the maximum clock frequency, how carry‑look‑ahead reduces worst‑case latency, how atomic primitives enforce ordering—you gain the ability to:

* **Design reliable hardware‑software interfaces** (e.g., driver register accesses that respect peripheral timing).  
* **Debug kernel panics** that trace back to violated timing constraints in interrupt handlers or timer callbacks.  
* **Optimize performance** by selecting the appropriate counter architecture (ripple vs. synchronous) for a given workload, directly influencing throughput of networking stacks or block I/O schedulers.  
* **Verify correctness** of concurrent algorithms using formal reasoning about state transitions, a skill indispensable when contributing to low‑level Linux subsystems.

In short, sequential logic is not a theoretical curiosity; it is the **foundational heartbeat** of the Linux kernel and of any system that aims to turn relentless clock ticks into dependable, predictable computation. Understanding it at the level of first principles transforms you from a user of abstractions into an architect who can shape those abstractions with confidence.
