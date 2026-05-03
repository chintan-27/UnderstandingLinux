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

Every piece of state in a running Linux system exists because a physical circuit can hold a value over time. The CPU register file that holds your local variables, the L1 cache returning data in 4 cycles, the pipeline registers separating fetch from decode from execute — all of these are built from one primitive: a feedback loop around a gate that creates two stable states. When the kernel schedules a process, the hardware saves register state to memory; when it reschedules, it restores it. That save/restore is only meaningful because the destination — a flip-flop, an SRAM cell — reliably holds a bit across arbitrary time. Understanding sequential logic means understanding *where state lives* and *what physical constraints govern when it can change*.

---

## Combinational vs. Sequential Logic

Combinational logic computes an instantaneous function: $\text{out}(t) = f(\text{in}(t))$. Remove the input, the output collapses. Sequential logic adds a state variable $s$ such that:

$$\text{out}(t) = f(\text{in}(t),\, s(t)), \qquad s(t+1) = g(\text{in}(t),\, s(t))$$

State requires feedback — routing an output back to an input so the circuit can "remember" a previous condition. Every memory element in a CPU, from a single flip-flop to a megabyte of L1 cache, is a physical realization of this feedback.

---

## The SR Latch

Two cross-coupled NOR gates. Each gate's output is the other gate's input. The truth table has a forbidden region, which is what makes the topology useful:

| $S$ | $R$ | $Q$ | $\overline{Q}$ |
|-----|-----|-----|-----------------|
| 0   | 0   | hold | hold           |
| 1   | 0   | 1   | 0               |
| 0   | 1   | 0   | 1               |
| 1   | 1   | — | — (forbidden)  |

**Why two stable states exist:** The circuit satisfies the fixed-point equation

$$Q = \overline{R + \overline{S + Q}}$$

This has exactly two self-consistent solutions when $S = R = 0$: $Q = 1$ or $Q = 0$. Physically, the gate outputs reinforce each other — if $Q = 1$, it drives $\overline{Q} = 0$, which drives $Q = 1$. The loop is self-sustaining.

**Why $S = R = 1$ is forbidden:** Both NOR gates are forced to output 0, so $Q = \overline{Q} = 0$, violating the complementary invariant. When $S$ and $R$ are released simultaneously, both gates race to determine which stable state wins. The outcome depends on transistor mismatch and noise — it is nondeterministic, and the circuit may enter **metastability**, resolving to a valid logic level only after an unbounded delay.

---

## The D Latch (Level-Sensitive)

The SR latch requires careful management of two inputs to avoid the forbidden state. The D latch collapses them: $S = D$, $R = \overline{D}$, gated by an enable signal $\text{CLK}$:

- $\text{CLK} = 1$: latch is **transparent** — $Q$ tracks $D$ continuously
- $\text{CLK} = 0$: latch is **opaque** — $Q$ holds its last value

**Why level-sensitivity is a problem:** If $D$ glitches (transitions spuriously due to combinational hazards) while $\text{CLK} = 1$, each glitch propagates to $Q$. In a pipeline stage, this means $Q$ can change dozens of times during a single clock phase, making it impossible to define a stable "computed value." Synchronous design requires that state updates happen at one precise moment per cycle — which the D latch cannot guarantee.

---

## The D Flip-Flop (Edge-Triggered)

Built from two D latches in **master-slave** configuration:

```
D ──[Master Latch]──[Slave Latch]── Q
         CLK̄               CLK
```

- **Master**: transparent when $\text{CLK} = 0$, opaque when $\text{CLK} = 1$
- **Slave**: opaque when $\text{CLK} = 0$, transparent when $\text{CLK} = 1$

**Why this achieves edge-triggering:** When $\text{CLK} = 0$, Master tracks $D$ and Slave is locked — $Q$ cannot change. When $\text{CLK}$ rises, Master locks (freezing whatever $D$ was just before the edge) and Slave opens (propagating that frozen value to $Q$). $Q$ therefore changes exactly once per cycle, at the rising edge, regardless of how many times $D$ changed while the clock was low. There is never a moment when *both* latches are transparent simultaneously, so no combinational path from $D$ to $Q$ exists except across a clock edge.

```
CLK:    ______|‾‾‾‾‾‾|______
Master: transparent |opaque| transparent
Slave:  opaque      |transp| opaque

D changes freely here; Q is frozen.
         ↑ At rising edge: Master locks, Slave opens, Q = D_captured
```

---

## Setup Time, Hold Time, and Metastability

Edge-triggering has physical constraints. The internal nodes of the master latch need time to settle to valid logic levels before the clock edge commits them:

- **Setup time** $t_{su}$: $D$ must be stable for at least $t_{su}$ *before* the clock edge. If violated, the master latch's internal nodes are still transitioning when the clock locks them.
- **Hold time** $t_h$: $D$ must remain stable for at least $t_h$ *after* the clock edge. If violated, the slave latch's input is disturbed before it becomes opaque.
- **Clock-to-Q delay** $t_{pcq}$: time from the clock edge until $Q$ is valid at the output.

**Timing constraint for a combinational path** between two flip-flops FF1 and FF2, with combinational delay $t_{pd}$:

$$t_{pcq} + t_{pd} + t_{su} \leq T_{\text{clk}}$$

Rearranging for the minimum clock period:

$$T_{\text{clk}} \geq t_{pcq} + t_{pd} + t_{su}$$

The **critical path** — the longest combinational delay in the design — sets the maximum clock frequency $f_{\text{max}} = 1 / T_{\text{clk,min}}$.

**Hold time constraint** (independent of clock period):

$$t_{pcq} + t_{pd,\text{min}} \geq t_h$$

This bounds the *minimum* combinational delay. A path that is too fast can cause FF2's input to change before $t_h$ has elapsed. Hold violations cannot be fixed by slowing the clock — they require adding buffer delays on the offending path.

**Metastability:** If setup or hold is violated, the flip-flop's internal differential pair resolves neither to 0 nor 1 for an indeterminate time $T_{\text{resolve}}$. The probability that it remains unresolved after waiting time $t$ decays exponentially:

$$P(\text{unresolved after } t) \propto e^{-t/\tau}$$

where $\tau$ is a device parameter on the order of tens of picoseconds. This is the central challenge in **clock domain crossing**: an input asynchronous to the local clock can arrive at any phase, and a synchronizer (two cascaded flip-flops) buys resolution time at the cost of two cycles of latency. The kernel's device drivers deal with this whenever they receive an interrupt from hardware on a different clock domain.

---

## Registers

A register is $N$ flip-flops sharing a common clock and reset line. All $N$ bits update simultaneously at the clock edge, so the register presents an atomically consistent value on the cycle after it is written.

**Why SRAM, not flip-flops, for register files:** A 32-entry, 32-bit register file built from flip-flops would require $32 \times 32 = 1024$ flip-flops. Each flip-flop is roughly 20–40 transistors in a standard cell library. An SRAM bit cell is 6 transistors. The register file therefore uses 6T SRAM cells with a decoder and bitline sense amplifiers. The tradeoff: SRAM is slightly slower (bitline must charge/discharge) but far smaller.

**Address decoding:** A 5-bit register address selects 1 of 32 rows. The decoder is a $5 \to 32$ one-hot demultiplexer; only one wordline goes high. Read latency is dominated by the RC delay of the bitline:

$$t_{\text{read}} \approx R_{\text{bitline}} \cdot C_{\text{bitline}} \cdot N_{\text{cells}}$$

This is why a deeper register file (more entries) is slower, and why out-of-order CPUs with large physical register files (e.g., 256 entries in modern x86) spend significant effort on register file access time.

---

## Counters

A counter is a register whose next-state logic computes $Q + 1$. For an $n$-bit ripple counter, bit $k$ toggles when all bits $0 \ldots k-1$ are 1:

$$T_k = Q_0 \cdot Q_1 \cdots Q_{k-1}$$

The propagation delay of a ripple counter grows linearly: the carry must ripple through $n$ toggle gates before the output is valid, giving worst-case delay $n \cdot t_{pd,\text{gate}}$. This is why ripple counters cannot be clocked at high frequency for large $n$.

A **synchronous counter** computes all carry bits in parallel using a carry-lookahead adder, limiting delay to $O(\log n)$ gate levels. All flip-flops see the same clock edge; no ripple.

**The program counter (PC)
