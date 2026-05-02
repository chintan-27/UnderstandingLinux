---
id: 43
title: "Finite-state machines"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Why This Matters

Every sequential system that must remember *where it is* and *decide what to do next* is a finite-state machine. The MIPS CPU controller, the USB protocol handler, and the Linux kernel's TCP stack all reduce to the same skeleton: a state register, a next-state function, and an output function. Get the encoding or the transition logic wrong and you get metastability, missed edges, or outputs that glitch between clock cycles — bugs that are invisible in simulation and catastrophic in silicon or in a running kernel.

The reason FSMs matter beyond academic exercises: any time you write `if (state == X) do_thing()` in a driver or protocol handler, you are implementing an FSM manually. Understanding the formal model tells you when your ad-hoc version is correct and when it will break under concurrent input.

## Core Concepts

### What an FSM Actually Is

An FSM is defined by five components:

- $S$ — a finite set of states
- $I$ — a set of inputs
- $O$ — a set of outputs
- $\delta: S \times I \rightarrow S$ — the next-state (transition) function
- $\lambda$ — the output function

The **state register** holds the current state, sampled on every clock edge. The two combinational blocks $\delta$ and $\lambda$ are pure logic: no memory, no feedback. This separation is not a style preference — it is what makes the machine formally analyzable and what synthesis tools rely on to infer flip-flops versus gates.

The total number of distinct behaviors an FSM can express is bounded by its state count. An FSM with $N$ states can distinguish at most $N$ equivalence classes of input history. This is the formal reason why a 2-bit state register cannot implement a protocol with more than 4 distinct phases without aliasing states.

### Moore vs. Mealy

In a **Moore machine**, outputs depend only on current state:

$$\lambda: S \rightarrow O$$

In a **Mealy machine**, outputs depend on current state *and* current inputs:

$$\lambda: S \times I \rightarrow O$$

The tradeoff is not just latency. Mealy machines can react in the same clock cycle an input arrives, which means they can often solve the same problem with fewer states — but at a cost. Because Mealy outputs are combinational functions of inputs, any glitch or mid-cycle transition on an input propagates directly to the output before the next clock edge. Moore outputs only change on clock edges because they are functions of the registered state alone, making them inherently glitch-free. For outputs that drive downstream registers, Moore behavior is safer; for outputs that need minimum-latency response, Mealy is necessary.

A Mealy machine with $N$ states is computationally equivalent to a Moore machine, but the Moore version may require up to $N \cdot |I|$ states in the worst case to replicate each Mealy output without the combinational path.

### State Encoding

The same abstract FSM can be encoded multiple ways. The encoding determines which bits change on each transition, which directly determines the complexity of $\delta$.

**Binary encoding** uses $\lceil \log_2 N \rceil$ flip-flops for $N$ states. It is compact but produces more complex next-state logic because multiple bits change on many transitions — the Gray code ordering $00 \to 01 \to 11 \to 10$ is sometimes used to minimize simultaneous bit changes and reduce glitching on outputs that read the state directly.

**One-hot encoding** uses $N$ flip-flops with exactly one bit asserted per state. It uses more registers but the next-state logic is near-trivial: the next-state bit for $S_j$ is the OR of all current-state bits that have a transition to $S_j$ under the relevant input condition. In FPGAs, where flip-flops are abundant and LUT inputs are the scarce resource, one-hot encoding frequently produces faster and smaller designs than binary encoding.

For a divide-by-3 counter with states $S_0, S_1, S_2$:

| State | Binary ($S_1 S_0$) | One-Hot ($S_2 S_1 S_0$) |
|-------|-------------------|------------------------|
| $S_0$ | `00`              | `001`                  |
| $S_1$ | `01`              | `010`                  |
| $S_2$ | `10`              | `100`                  |

With binary encoding, the next-state equations derived from the transition table are:

$$S_1' = S_1 \oplus S_0, \quad S_0' = \overline{S_1} \cdot \overline{S_0}$$

With one-hot encoding, the next-state equations collapse to:

$$S_0' = S_2, \quad S_1' = S_0, \quad S_2' = S_1$$

Each next-state bit is a single wire from a current-state bit — zero logic gates required. The silicon area for the logic block drops to nothing; you only pay for the extra flip-flops.

### Synchronous vs. Asynchronous Reset

The state register must be reset to a known state on power-up. Without this, the machine enters an arbitrary state determined by leakage currents and capacitive charge on the flip-flop nodes — undefined behavior in the most literal sense.

**Synchronous reset**: the reset condition is checked only on the clock edge. The reset signal must be held long enough to be captured — at minimum one full clock period. The advantage is that it is filtered through the clock, so a glitch on `reset` that is shorter than one clock period has no effect.

**Asynchronous reset**: the flip-flop responds to `reset` immediately, independent of the clock. It forces the state to $S_0$ even between clock edges. The risk is that releasing `reset` close to a clock edge can cause metastability — the flip-flop input is changing in the setup/hold window of the very edge that is supposed to capture the post-reset state.

For most synthesized designs, synchronous reset is preferred precisely because it avoids the metastability hazard on reset release. FPGA primitives often support both; the choice propagates into the inferred primitive's reset pin type.

```verilog
// Synchronous reset — reset is only sampled on posedge clk
always_ff @(posedge clk)
    if (reset) state <= S0;
    else        state <= nextstate;

// Asynchronous reset — reset forces state immediately
always_ff @(posedge clk, posedge reset)
    if (reset) state <= S0;
    else        state <= nextstate;
```

## How It Works

### The Three-Block HDL Structure

Every synthesizable FSM description breaks into three independent blocks: state register, next-state logic, output logic. Mixing them is the primary source of synthesis mismatches — where simulation matches intent but the synthesized netlist does not.

```verilog
// SystemVerilog — Moore pattern recognizer
// Recognizes the sequence where input 'a' goes 1 then 0
// y is asserted when S0 is active (post-recognition or reset)
module patternMoore (
    input  logic clk, reset, a,
    output logic y
);
    typedef enum logic [1:0] {S0, S1, S2} statetype;
    statetype state, nextstate;

    // Block 1: state register — the ONLY sequential element
    // Synthesis tool infers flip-flops here and nowhere else
    always_ff @(posedge clk, posedge reset)
        if (reset) state <= S0;
        else        state <= nextstate;

    // Block 2: next-state logic — purely combinational
    // always_comb (not always @(*)) forces tool to check
    // that all outputs are assigned in all branches,
    // preventing unintended latch inference
    always_comb
        case (state)
            S0: nextstate = a ? S1 : S0;
            S1: nextstate = a ? S1 : S2;
            S2: nextstate = a ? S1 : S0;
            default: nextstate = S0;  // handles X/Z states in sim
        endcase

    // Block 3: output logic — depends only on state (Moore)
    // A combinational assign; no clock, no latch
    assign y = (state == S0);
endmodule
```

The `always_ff` block infers flip-flops. The `always_comb` block infers only combinational logic. The `default` branch in the `case` is not defensive padding — it handles the case where synthesis optimizations or power-on transients leave the state register in an encoding that does not correspond to any named state, preventing the machine from locking up in an unreachable state with undefined outputs.

### Why Nonblocking Assignment Is Not Optional

In `always_ff` blocks, use **nonblocking** assignment (`<=`). The distinction is not stylistic — it reflects how real flip-flops work.

Nonblocking assignment evaluates all right-hand sides first, using the values that exist at the start of the time step, then updates all left-hand sides simultaneously. This matches the physical behavior of a bank of flip-flops clocked by the same edge: all inputs are sampled at the same instant.

Blocking assignment (`=`) executes sequentially within the block, writing the left-hand side before the next statement reads it. In a state register this breaks the simultaneous-capture abstraction:

```verilog
// BROKEN — blocking assignment in sequential block
// 'state' is updated before the always block finishes,
// so any subsequent read of 'state' in the same time step
// sees the new value, not the value that existed at the clock edge
always @(posedge clk) begin
    state  = nextstate;   // state updated NOW
    output = state;       // reads the NEW state, not the old one
end

// CORRECT — nonblocking preserves the captured-at-edge semantics
always_ff @(posedge clk) begin
    state  <= nextstate;  // RHS evaluated at clock edge
    output <= state;      // also reads state at the clock edge
end                       // both LHS updates happen after the block
```

The rule is absolute: **combinational blocks use `=`; sequential blocks use `<=`.**

### Working Through the Traffic Light FSM

The traffic light controller has 4 states encoding light colors for two roads (Academic Ave = A, Bravado Blvd
