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

Every sequential system that must remember *where it is* in order to decide *what to do next* is a finite-state machine. The alternative — ad-hoc flags, global booleans, and implicit ordering assumptions — produces control logic that is untestable by construction: you cannot enumerate the states because you never defined them. CPUs use FSMs to sequence instruction execution stages. TCP uses them to enforce legal connection lifecycles. The Linux kernel uses them to govern process scheduling, USB enumeration, and block device request queues. When a system hangs or corrupts state under a timing edge case, the root cause is almost always a transition that was never explicitly defined.

---

## Core Concepts

### State: Compressed History

A state encodes the minimum information about the past required to produce correct future outputs. Everything irrelevant is discarded. For a traffic light controller, the relevant history is not every car that passed — it is only the current phase. That compression is the FSM's power: instead of unbounded history, you have $n$ bits.

A machine with $n$ state bits represents at most $2^n$ distinct states. If your design needs $k$ states, you need at least $\lceil \log_2 k \rceil$ flip-flops.

### State Encoding: Binary vs. One-Hot

**Binary encoding** uses $\lceil \log_2 k \rceil$ bits for $k$ states. Compact, but next-state logic requires Boolean minimization — the decoder is implicit in the logic equations.

**One-hot encoding** uses $k$ bits for $k$ states, exactly one bit high at a time. Next-state equations become trivial to read from the state diagram, and the combinational logic is shallower (fewer gate levels), which increases maximum clock frequency. The tradeoff is $k$ flip-flops versus $\lceil \log_2 k \rceil$. In FPGAs with abundant registers and routing constraints on logic, one-hot usually wins.

For the divide-by-3 counter with states $\{S_0, S_1, S_2\}$:

| State | Binary ($S_1 S_0$) | One-Hot ($b_2 b_1 b_0$) |
|-------|-------------------|------------------------|
| $S_0$ | `00`              | `001`                  |
| $S_1$ | `01`              | `010`                  |
| $S_2$ | `10`              | `100`                  |

With binary encoding, next-state logic requires a K-map. With one-hot, each next-state bit equals the current-state bit of the predecessor state — the equations are direct:

$$S_0' = b_2, \quad S_1' = b_0, \quad S_2' = b_1$$

No minimization needed because each state bit is driven by exactly one predecessor.

### Transition Logic: The Next-State and Output Functions

The next-state function $\delta$ and output function $\lambda$ fully define machine behavior:

$$\delta: S \times I \rightarrow S \qquad \lambda: S \rightarrow O \text{ (Moore)} \qquad \lambda: S \times I \rightarrow O \text{ (Mealy)}$$

**Moore machine:** output depends only on current state, so it is stable for the entire clock period. Downstream logic can sample it without worrying about intra-cycle glitches.

**Mealy machine:** output depends on both state and input. This gives one-cycle latency advantage — the machine can respond in the same cycle the input arrives — but the output is only valid while inputs are stable. If an input glitches mid-cycle, the Mealy output glitches with it.

The latency difference matters: in a Moore machine asserting $Y$ after recognizing a sequence, $Y$ arrives one cycle after the final input. In the equivalent Mealy machine, $Y$ arrives in the same cycle as the final input. For high-throughput pipelines this is significant.

### The Three-Block Structure

Every synthesizable FSM separates into exactly three blocks:

1. **State register** — synchronous; updates on the clock edge
2. **Next-state logic** — combinational; computes $\delta(s, i)$
3. **Output logic** — combinational; computes $\lambda(s)$ or $\lambda(s, i)$

Mixing sequential and combinational logic into one block causes synthesis tools to infer unintended latches (when `always_comb` has incomplete sensitivity or missing `default`) or causes simulation to diverge from hardware behavior. The three-block split makes the boundary between registered and combinational state explicit.

---

## How It Works

### The Divide-by-3 Counter

This FSM cycles $S_0 \to S_1 \to S_2 \to S_0$ and asserts $Y = 1$ only in $S_0$. It divides a clock by 3: $Y$ pulses at $f_{clk}/3$.

**State transition table (binary encoding):**

| $S_1 S_0$ | $S_1' S_0'$ | $Y$ |
|-----------|-------------|-----|
| `00` ($S_0$) | `01` ($S_1$) | 1 |
| `01` ($S_1$) | `10` ($S_2$) | 0 |
| `10` ($S_2$) | `00` ($S_0$) | 0 |
| `11` (illegal) | `00` ($S_0$) | 0 |

From the table, Boolean minimization gives:

$$S_1' = S_0, \qquad S_0' = \overline{S_1} \cdot \overline{S_0}$$

Verify: `00` → $S_1' = 0$, $S_0' = 1$ → `01` ✓. `01` → $S_1' = 1$, $S_0' = 0$ → `10` ✓. `10` → $S_1' = 0$, $S_0' = 0$ → `00` ✓.

**SystemVerilog (three-block style):**

```verilog
module divby3 (
    input  logic clk,
    input  logic reset,
    output logic y
);
    typedef enum logic [1:0] {S0 = 2'b00,
                               S1 = 2'b01,
                               S2 = 2'b10} statetype;
    statetype state, nextstate;

    // Block 1: State register
    always_ff @(posedge clk, posedge reset)
        if (reset) state <= S0;
        else       state <= nextstate;

    // Block 2: Next-state logic (combinational)
    always_comb
        case (state)
            S0:      nextstate = S1;
            S1:      nextstate = S2;
            S2:      nextstate = S0;
            default: nextstate = S0;  // handles illegal state 2'b11
        endcase

    // Block 3: Output logic (Moore)
    assign y = (state == S0);
endmodule
```

The `default` branch is not defensive boilerplate — it is the recovery path for power-on state. At startup, flip-flops can reset to any value depending on silicon process variation and board conditions. Without `default`, the FSM can enter `2'b11` and loop there forever because no valid transition exists. With it, any illegal state converges to $S_0$ on the next clock edge.

### Pattern Recognizer: Moore vs. Mealy Latency

FSM detects serial sequence `1, 0, 1` on input $a$ and asserts $Y$.

**Moore state diagram:**

```
RESET → S0 --(a=1)--> S1 --(a=0)--> S2 --(a=1)--> S3 [Y=1]
              (a=0)↩      (a=1)↩            (a=0)→S0
```

$Y$ is tied to $S3$: it arrives one cycle after the final `1`.

**Mealy version eliminates $S3$:** $Y$ is asserted combinationally in $S2$ when $a = 1$, so it arrives in the same cycle as the final `1`. The machine needs only three states instead of four.

```verilog
// Mealy output block — note: output is combinational, not registered
always_comb begin
    y = 1'b0;
    case (state)
        S2: y = (a == 1'b1);  // asserted this cycle if input completes pattern
        default: y = 1'b0;
    endcase
end
```

The Mealy output $y$ is valid only while $a$ is stable. If $a$ glitches high and low within the same clock cycle, $y$ glitches too. For a Moore machine, $y$ cannot glitch within a cycle because it derives from registered state only.

### Why Nonblocking Assignment Is Not Optional

In hardware, all flip-flops in a register stage sample their $D$ inputs simultaneously at the clock edge, then drive their $Q$ outputs simultaneously. Blocking assignment `=` in an `always_ff` block breaks this model by causing immediate in-order evaluation.

```verilog
// WRONG: blocking assignment in sequential block
always_ff @(posedge clk) begin
    state = nextstate;   // state updated immediately in simulation
    q     = state;       // reads the NEW state — models a wire, not a register
end

// CORRECT: nonblocking
always_ff @(posedge clk) begin
    state <= nextstate;
    q     <= state;      // reads state value from BEFORE this clock edge
end
```

The nonblocking `<=` schedules all right-hand side evaluations before any left-hand side updates. This matches the physical behavior of a master-slave flip-flop: the master samples on the clock edge while the slave is still driving the old value.

If you use blocking assignment in a shift register, each stage reads the already-updated output of the previous stage rather than its pre-clock value — the "register" becomes transparent, and $n$ stages of delay collapse to zero.

---

## Linux Connection

### Process Lifecycle FSM

The Linux process scheduler models every task as an
