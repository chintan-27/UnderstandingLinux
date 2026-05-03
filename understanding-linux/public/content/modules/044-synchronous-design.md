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

## Why This Matters

Every flip-flop in a synchronous system makes an implicit promise: given a stable input for $t_{setup}$ before the clock edge and $t_{hold}$ after it, the output will be a valid logic level within $t_{pcq}$. The entire edifice of digital design — pipelining, caching, out-of-order execution — rests on that promise being kept everywhere, simultaneously, on every cycle. When it isn't, the flip-flop doesn't output a wrong bit; it outputs a voltage stuck between logic thresholds, which propagates through subsequent gates as an indeterminate value. No exception handler catches this. The CPU may decode a garbage instruction, corrupt a cache line, or latch a bad address into the MMU. The synchronous design discipline exists to make timing violations *impossible by construction*, not merely unlikely.

This matters beyond ASIC design. Linux kernel drivers for USB controllers, PCIe devices, and network interfaces all cross clock domain boundaries in hardware they rely on. When those crossings are handled incorrectly, the result is not a software bug — it is a hardware non-determinism that manifests as random crashes, data corruption, or silent wrong results that survive reboots.

---

## Core Concepts

### The Aperture: Setup and Hold Time

A D flip-flop samples $D$ on the rising clock edge. But the transistor network implementing the master-slave latch requires the input to be stable *before* the edge so the master stage has time to charge its internal nodes to a valid level, and *after* the edge so the slave stage can latch a stable value before the master gate closes. These constraints are:

- **Setup time** $t_{su}$: $D$ must be stable for at least $t_{su}$ before the clock edge.
- **Hold time** $t_h$: $D$ must remain stable for at least $t_h$ after the clock edge.

Together they define the **aperture window** $[-t_{su},\, +t_h]$ centered on the clock edge, during which $D$ must not transition.

The flip-flop's output timing is characterized by two parameters:

- **Clock-to-Q propagation delay** $t_{pcq}$: the *maximum* time from clock edge to valid $Q$. Used for setup analysis — it bounds how late $Q$ can arrive.
- **Clock-to-Q contamination delay** $t_{ccq}$: the *minimum* time from clock edge before $Q$ begins to change. Used for hold analysis — it bounds how early $Q$ can corrupt a downstream input.

These four numbers — $t_{su}$, $t_h$, $t_{pcq}$, $t_{ccq}$ — appear in every flip-flop datasheet and every static timing analysis (STA) report. Everything else in synchronous timing is derived from them.

### Setup Time Violations: Maximum Frequency

In a register-to-register path, $F_1$ drives combinational logic with propagation delay $t_{pd}$, whose output feeds $F_2$. The data launched by $F_1$ at clock edge $i$ must arrive at $F_2$'s input and be stable before clock edge $i+1$. This gives the **setup constraint**:

$$T_c \geq t_{pcq} + t_{pd} + t_{su}$$

where $T_c = 1/f_c$ is the clock period. The maximum operating frequency is therefore:

$$f_{max} = \frac{1}{t_{pcq} + t_{pd} + t_{su}}$$

A setup violation means $F_2$'s input is still transitioning when the clock edge arrives. Because the input hasn't reached a valid logic level, the master latch captures an indeterminate voltage. The result is metastability (see below) or a captured wrong value — not a predictable error.

Setup violations are fixed by: reducing $t_{pd}$ (faster gates, shorter wires, pipeline insertion), increasing $T_c$ (lower clock frequency), or using flip-flops with smaller $t_{pcq}$ and $t_{su}$.

### Hold Time Violations: The Dangerous One

The hold constraint governs the *shortest* path from $F_1$ to $F_2$, not the longest. After $F_1$ launches new data, $F_2$ must not see that new data until it has finished capturing the old value. The constraint is:

$$t_{ccq} + t_{cd} \geq t_h$$

where $t_{cd}$ is the **contamination delay** of the combinational path — the minimum time for a change at the path's input to reach its output. This constraint is **independent of clock frequency**: it depends only on how fast the shortest path can propagate a change, regardless of $T_c$.

The dangerous case is a direct flip-flop-to-flip-flop connection with no intervening logic ($t_{cd} = 0$). Then the constraint reduces to $t_{ccq} \geq t_h$, which may fail because $t_{ccq}$ is a small, technology-limited number. The canonical fix is **buffer insertion** on the short path: a buffer adds contamination delay without being on the critical (long) path, so it fixes the hold violation without degrading $f_{max}$.

Hold violations cannot be fixed by slowing the clock. This is why they are more dangerous in silicon: they survive tape-out and manifest as functional failures at any frequency.

### Metastability

When $D$ transitions inside the aperture window, the cross-coupled inverters inside the flip-flop's latch are driven to a symmetric unstable equilibrium — both nodes at approximately $V_{DD}/2$. This is the **metastable state**. The circuit will resolve to 0 or 1 as noise or asymmetry breaks the symmetry, but the time to resolve follows an exponential distribution: the probability of remaining metastable for longer than time $t_r$ decays as $e^{-t_r/\tau}$, where $\tau$ is a technology-dependent time constant (typically 20–200 ps in modern CMOS).

The mean time between failures (MTBF) for a synchronizer is:

$$MTBF = \frac{e^{t_r / \tau}}{T_c \cdot f_{in} \cdot C}$$

where $t_r$ is the resolution time available before the metastable output is sampled by the next stage, $f_{in}$ is the rate of input transitions, and $C$ is a flip-flop-specific constant. The numerator grows exponentially with $t_r$; the denominator grows linearly with $f_{in}$. Consequently:

- Adding one extra synchronization stage (one more $T_c$ of resolution time) multiplies MTBF by $e^{T_c/\tau}$ — an exponential improvement.
- Running the input faster ($f_{in}$) degrades MTBF only linearly.
- Metastability cannot be eliminated, but MTBF can be made to exceed the age of the universe for practical parameters.

A critical implication: you cannot detect metastability in software, and you cannot "check" whether a flip-flop resolved correctly after the fact. The only defense is architectural — giving the flip-flop enough time to resolve before its output is used.

### Clock Domains and Synchronizers

A **clock domain** is a set of flip-flops all driven by the same clock signal (or phase-aligned copies of it). When data crosses from domain A (clock $\phi_A$) to domain B (clock $\phi_B$), the standard setup and hold constraints do not apply — $\phi_B$'s edges are asynchronous to the moment $F_A$ changes its output, so $F_B$ may sample $D$ anywhere in its aperture window.

The standard remedy is a **two-flip-flop synchronizer**: the signal passes through $FF_1$ then $FF_2$, both clocked by $\phi_B$.

```
Domain A          Domain B
─────────    ┌──────────────────────────┐
  FF_A ────▶ │ FF_1 ────▶ FF_2 ────▶ Logic │
             └──────────────────────────┘
                    clocked by φ_B
```

$FF_1$ may go metastable. It then has a full period $T_B$ to resolve before $FF_2$ samples it. $FF_2$ samples a (now valid) 0 or 1 and presents it to the rest of the domain. The MTBF equation above applies with $t_r = T_B - t_{su} - t_{pcq}$.

For multi-bit CDC, a two-flop synchronizer is insufficient: the bits of a bus may be sampled by $FF_1$ across different cycles. Solutions include:

- **Gray coding**: encode multi-bit counters so adjacent values differ by only one bit; a synchronizer error then produces the previous or next value, not an arbitrary one.
- **Handshake protocols**: assert a "valid" signal, synchronize it, and only read the data bus after the synchronized acknowledge returns.
- **Asynchronous FIFOs**: use Gray-coded read/write pointers, each synchronized into the opposite domain.

### Reset Strategies

**Synchronous reset**: The reset signal is sampled on the clock edge, like any data input. The flip-flop's $D$ input is muxed: if `reset` is asserted, $D$ is forced to 0; otherwise $D$ is the real input. This means reset only takes effect one clock cycle after assertion, which is predictable and easy to time-analyze. It also means the clock must be running for reset to work.

**Asynchronous reset**: An asynchronous reset input on the flip-flop drives a direct path to the latch, independent of the clock. The flip-flop enters the reset state immediately upon assertion, regardless of clock state. This is essential at power-up, before the PLL or clock tree is stable.

The hazard is **reset release** (deassertion). If `reset` goes low near a clock edge, different flip-flops in the design may see the deassertion on different cycles — a partial reset of the state machine. Worse, any flip-flop that sees the deassertion inside its aperture goes metastable *simultaneously with every other flip-flop in the design*.

The standard discipline is **asynchronous assert, synchronous deassert**:

1. Assert reset asynchronously (immediate, clock-independent).
2. Deassert reset through a synchronizer: feed
