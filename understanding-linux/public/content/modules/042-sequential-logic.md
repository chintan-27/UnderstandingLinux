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

## Why This Matters

Every value your CPU holds — a loop counter, a memory address, a flag in `RFLAGS` — exists physically as a collection of bistable circuits forced into one of exactly two stable states. Without sequential logic, computation collapses to pure combinational logic: circuits that transform inputs to outputs with no memory of prior state. The moment you need a result to persist across a clock edge — which is every instruction in every real processor — you need sequential elements.

The Linux kernel's `jiffies` counter, the program counter advancing through your code, the dirty bit in a page table entry: all of these ultimately rest on the physics of cross-coupled transistors. Understanding sequential logic tells you *why* registers are faster than cache, *why* metastability is a real hardware failure mode, and *why* the CPU pipeline imposes the timing constraints it does.

---

## Core Concepts

### Bistability: Two Stable States and One Unstable One

A bistable element has two stable DC operating points separated by an unstable equilibrium. Perturb it toward either side and positive feedback drives it fully into that state. The unstable middle point — metastability — exists but is transient: thermal noise, transistor mismatch, or any small asymmetry causes the circuit to resolve, though the resolution time is unbounded in theory (and statistically distributed in practice).

This is not an abstraction imposed by software. It is a consequence of the circuit's transfer characteristic having three fixed points: two stable ($Q=0$, $Q=1$) and one unstable. All digital memory — from a single flip-flop to gigabytes of SRAM cache — is a hierarchy of bistable elements.

### The SR Latch: Feedback Creates Memory

The SR latch is built from two cross-coupled NOR gates. There is no clock — it is asynchronous, responding immediately to input changes.

```
S ──┬── NOR ──┬── Q
    │    ↑    │
    │    │    │
    └────┘    │
              │
Q̄ ──┬── NOR ──┴── Q̄
    │    ↑
    │    │
R ──┴────┘
```

The feedback is the mechanism: once $Q$ is driven high, it holds the lower NOR gate's output low ($\bar{Q}=0$), which feeds back to keep the upper NOR gate's output high — even after $S$ returns to 0. The circuit stores state because its output is one of its own inputs.

| S | R | $Q_{next}$ | Meaning   |
|---|---|-----------|-----------|
| 1 | 0 | 1         | Set       |
| 0 | 1 | 0         | Reset     |
| 0 | 0 | $Q$       | Hold      |
| 1 | 1 | invalid   | Forbidden |

The $S=R=1$ case forces both NOR outputs to 0, making $Q = \bar{Q} = 0$ — a violation of their complementary relationship. Worse, when both inputs simultaneously return to 0, the final state depends on which gate wins the race, which depends on manufacturing variation, temperature, and noise. The forbidden state is forbidden because its *exit* is nondeterministic.

### The D Latch: Collapsing Two Inputs to One

The D latch enforces $R = \bar{S}$ via a single inverter, replacing $S$ and $R$ with a single data input $D$ and an enable input $CLK$. This eliminates the forbidden state entirely.

When $CLK=1$ (transparent): $Q$ tracks $D$ continuously.  
When $CLK=0$ (opaque): $Q$ holds its last value regardless of $D$.

Transparency is the latch's weakness. In a pipeline stage, if a combinational path is long enough that its output is still changing while $CLK$ is high, that change propagates directly through the latch into the next stage — breaking the stage boundary. A latch does not isolate; it merely gates.

### The D Flip-Flop: Edge-Triggered Isolation

A D flip-flop fixes the transparency problem by triggering exactly once per clock cycle, at a clock *edge* rather than during a level. The standard implementation is a master-slave cascade of two D latches with complementary enables:

```
        CLK=0: transparent     CLK=1: transparent
        CLK=1: opaque          CLK=0: opaque
             │                       │
D ──── [Master Latch] ──── [Slave Latch] ──── Q
              ↑                       ↑
             CLK̄                     CLK
```

When $CLK=0$: Master tracks $D$; Slave is opaque, holding $Q$ stable.  
When $CLK$ rises: Master closes instantly (capturing $D$); Slave opens, propagating the captured value to $Q$.

The output $Q$ changes exactly once per cycle, and only at the rising edge:

$$Q[n+1] = D \big|_{t = t_{\text{rise}}}$$

Two timing constraints govern correct operation:

- **Setup time** $t_{su}$: $D$ must be stable for at least $t_{su}$ *before* the clock edge. Violation means the master latch may capture an intermediate voltage.
- **Hold time** $t_h$: $D$ must remain stable for at least $t_h$ *after* the clock edge. Violation means the captured value can be corrupted while the master is still closing.

Violating either constraint causes **metastability**: the flip-flop output settles to neither 0 nor 1 for an unpredictable duration. The probability of remaining metastable decays exponentially with time:

$$P(\text{metastable after time } \tau) \propto e^{-\tau / \tau_c}$$

where $\tau_c$ is a process-dependent time constant (typically tens of picoseconds). This is why synchronizer circuits in real hardware add deliberate latency after a crossing between clock domains — they are buying resolution time.

### Pipeline Timing Constraints

The critical path through a pipeline stage must satisfy:

$$t_{\text{clk}} \geq t_{pcq} + t_{pd} + t_{su}$$

where:
- $t_{pcq}$ = propagation delay from clock edge to valid $Q$ output (flip-flop output delay)
- $t_{pd}$ = worst-case combinational logic delay between flip-flops
- $t_{su}$ = setup time of the receiving flip-flop

The maximum clock frequency is therefore bounded by the longest combinational path:

$$f_{\text{max}} = \frac{1}{t_{pcq} + t_{pd,\text{max}} + t_{su}}$$

Pipeline design is the art of partitioning $t_{pd,\text{max}}$ across stages so that no single stage dominates. When Linux reports a CPU at 3.6 GHz, that frequency is constrained by the longest path in the entire processor meeting this inequality.

There is also a minimum cycle time constraint from hold time. For correct operation:

$$t_{pd,\text{min}} \geq t_h - t_{ccq}$$

where $t_{ccq}$ is the contamination delay (earliest time $Q$ can change after the clock edge). If $t_{pd,\text{min}}$ is too small — which can happen with short paths when clock skew is present — the receiving flip-flop's hold time is violated and the pipeline corrupts data even at low frequencies.

### Registers: N Flip-Flops, One Clock

A register is $N$ D flip-flops sharing a clock signal, storing an $N$-bit value. The general-purpose registers in x86-64 (`rax`, `rbx`, etc.) are physically a small SRAM register file — an array of 6T SRAM cells with dedicated read and write ports, not discrete flip-flops. The reason registers are faster than L1 cache is structural: fewer cells means shorter bitlines, smaller row decoders, and a shorter critical path through the address logic.

A 64-bit register stores 8 bytes. The x86-64 register file contains 16 general-purpose registers plus control registers, segment registers, and the 16 YMM/ZMM vector registers — each a wider parallel array of the same basic cell.

### Counters: Registered Adders

A counter is a register whose next state is its current state incremented by a constant. The $N$-bit binary counter:

$$Q[n+1] = (Q[n] + 1) \bmod 2^N$$

requires a combinational adder feeding back into the flip-flop D inputs. The carry chain through this adder is often the critical path in the timing analysis, since carry propagation through an $N$-bit ripple adder is $O(N)$.

A practical implication: exhaustively cycling a 32-bit counter to verify its MSB transition from 0 to 1 requires $2^{31} \approx 2.1 \times 10^9$ clock pulses. At 1 GHz this takes over 2 seconds — which is why hardware designers add **scan chains**: a serial shift register threading through all flip-flops, allowing arbitrary state to be injected or extracted without running the circuit through its normal sequence.

### SRAM Cells: Area-Optimized Bistability

An SRAM cell stores one bit using six transistors: two cross-coupled CMOS inverters (the bistable element, identical in function to an SR latch) and two pass transistors controlled by the wordline.

```
         VDD         VDD
          │           │
         [P1]        [P2]
          │           │
BL ──[N3]─┤─────────┤─[N4]── BL̄
          │           │
         [N1]        [N2]
          │           │
         GND         GND
          ↑           ↑
         WL asserted to read/write
```

- **Read**: Assert WL, sense the differential voltage on BL and BL̄ via a sense amplifier.
- **Write**: Drive BL/BL̄ to the desired value, assert WL, forcing the cell to flip.

The six-transistor cell retains state as long as power is applied — no refresh needed. Compare to DRAM:

$$\text{SRAM: } 6T \approx 0.1\text
