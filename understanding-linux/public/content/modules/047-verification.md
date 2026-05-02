---
id: 47
title: "Verification"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Why This Matters

Hardware that ships broken stays broken. You cannot patch a CPU the way you patch an OS — a timing violation baked into silicon will corrupt every computation that processor ever performs, silently, at a rate that varies with temperature and supply voltage. Verification is the discipline that prevents this. Testbenches exercise logic against known-good outputs. Assertions encode invariants that must hold at every clock cycle. Formal verification mathematically proves correctness over all possible inputs, not just the ones you thought to test. Static timing analysis proves signals settle before registers sample them. Each layer catches a different class of failure; omitting any one of them leaves a gap that will eventually manifest as a field return or a silent data corruption bug.

## Core Concepts

### Testbenches

A testbench is a simulation wrapper around your design-under-test (DUT). It is never synthesized — it exists only to drive signals and check outputs. The critical discipline is **coverage**: which input states and transitions have actually been exercised? A testbench that only tests the happy path is not a testbench; it is documentation that happens to run. Useful testbenches exercise reset behavior (is state actually cleared?), back-to-back transactions (does the pipeline stall correctly?), maximum-value inputs (do carry bits propagate?), and constrained-random inputs (does the design survive sequences you didn't anticipate?).

```systemverilog
module adder_tb;
    logic [3:0] a, b;
    logic [4:0] sum;

    // Instantiate DUT — ports connected by name to avoid positional errors
    adder dut(.a(a), .b(b), .sum(sum));

    initial begin
        // Zero + zero: verify reset state doesn't corrupt output
        a = 4'b0000; b = 4'b0000; #10;
        assert(sum == 5'd0) else $fatal(1, "0+0 = %0d, expected 0", sum);

        // Max + 1: forces carry into bit 4 — the most common overflow bug
        a = 4'b1111; b = 4'b0001; #10;
        assert(sum == 5'd16) else $fatal(1, "15+1 = %0d, expected 16", sum);

        // Max + max: sum must be 30, not 14 (truncation bug)
        a = 4'b1111; b = 4'b1111; #10;
        assert(sum == 5'd30) else $fatal(1, "15+15 = %0d, expected 30", sum);

        $display("All tests passed");
        $finish;
    end
endmodule
```

The `$fatal(1, ...)` form (SystemVerilog 2012) terminates simulation immediately with exit code 1, which lets CI pipelines detect failures automatically.

### Assertions

An assertion states a condition that *must* hold. The distinction between a testbench check and an assertion is semantic: the testbench says "did this output match this expected value on this run?"; the assertion says "this invariant must never be violated, for any input, ever." That distinction matters because a buggy circuit that consistently produces wrong outputs will pass a weak testbench and fail every assertion that encodes what correct behavior actually means.

**Immediate assertions** are procedural — they fire at one instant in simulation time:

```systemverilog
assert(sum < 32) else $error("Sum overflowed 5-bit result");
```

**Concurrent assertions** are sampled on a clock edge and can express temporal properties — relationships between signals across multiple cycles. This is where most of the expressive power lives:

```systemverilog
// If req rises, ack must be asserted within 1 to 4 clock cycles.
// ##[1:4] means "between 1 and 4 steps later" in SVA sequence syntax.
property req_ack_within_4;
    @(posedge clk) disable iff (!rst_n)
    req |-> ##[1:4] ack;
endproperty

REQ_ACK: assert property (req_ack_within_4)
    else $error("ACK not received within 4 cycles after REQ at time %0t", $time);
```

The `disable iff (!rst_n)` clause suppresses the assertion during reset — without it, the checker fires spuriously every reset cycle, creating noise that causes engineers to disable assertions entirely. Label the assertion (`REQ_ACK:`) so the waveform viewer and log files identify it unambiguously.

### Formal Verification Basics

Simulation tests a finite set of input sequences. Formal verification proves properties over *all* possible input sequences by treating the circuit as a mathematical object rather than something to execute. The underlying engine is typically a SAT solver (for bounded model checking) or a BDD-based model checker (for full reachability). The trade-off is fundamental: formal methods are exhaustive but their cost scales exponentially with state-space size — the **state explosion problem**.

The formal model of a sequential circuit is a state machine defined by:
- A state space $S$ (all possible flip-flop assignments)
- An initial state $s_0$ (the reset state)
- A transition function $\delta: S \times I \to S$ where $I$ is the input space
- A property $P: S \to \{0,1\}$

Formal verification asks: does $P(s) = 1$ for every $s$ reachable from $s_0$ under any finite input sequence? If the tool finds a state where $P(s) = 0$, it returns a **counterexample** — a concrete input sequence that reaches the failing state. This is more useful than a failing simulation because the counterexample is the *shortest possible* path to failure.

**Bounded model checking (BMC)** limits the search to paths of length $\leq k$. This is tractable for large designs but only proves absence of bugs reachable within $k$ steps — it is not a full proof unless $k$ exceeds the diameter of the reachability graph.

In practice: run formal tools on individual blocks (arbiters, FIFOs, protocol checkers) where the state space is small enough to be exhaustive, and use simulation for system-level integration.

### Timing Analysis

Every flip-flop has an **aperture window** around the clock edge during which its input must be stable. Specifically:
- **Setup time** $t_{su}$: input must be stable at least $t_{su}$ before the clock edge
- **Hold time** $t_h$: input must remain stable at least $t_h$ after the clock edge

If the input changes inside this window, the flip-flop may enter a **metastable state** — an analog condition where the output is neither a valid 0 nor a valid 1, and the time to resolve is unbounded (exponentially distributed). This is not a design defect you can simulate away; it is a physical consequence of violating the aperture.

The **setup constraint** bounds the minimum clock period $T_c$. For a register-to-register path through combinational logic:

$$T_c \geq t_{pcq} + t_{pd} + t_{su}$$

Where:
- $t_{pcq}$ = clock-to-Q propagation delay of the source register (time from clock edge until output is valid)
- $t_{pd}$ = worst-case propagation delay through the combinational logic on this path
- $t_{su}$ = setup time of the destination register

The **hold constraint** is independent of clock period — it constrains the *minimum* delay through the combinational path:

$$t_{ccq} + t_{cd} \geq t_h$$

Where $t_{ccq}$ is the clock-to-Q contamination delay (the *earliest* the output can change after the clock edge) and $t_{cd}$ is the contamination delay of the combinational path (the earliest the output can change after the input changes). Violating hold time means the new cycle's data propagates through combinational logic and corrupts the flip-flop's input *before* it has safely captured the previous cycle's value — the register samples a mixture of two values. Hold violations cannot be fixed by slowing the clock; they require adding intentional delay (buffer insertion) on the short path.

## How It Works

### Propagation vs. Contamination Delay

Every gate has two delay figures, not one. The **propagation delay** $t_{pd}$ is the time until the output is *guaranteed* to have reached its final value — it is the worst-case bound used for setup analysis. The **contamination delay** $t_{cd}$ is the time until the output *might first change* from its previous value — it is the best-case bound used for hold analysis.

For gates in series on the critical path:

$$t_{pd,\text{total}} = \sum_{i \in \text{critical path}} t_{pd,i}$$

For gates in series on the shortest path:

$$t_{cd,\text{total}} = \sum_{i \in \text{short path}} t_{cd,i}$$

The two analyses are independent and must both pass. A path can satisfy setup and violate hold. It can satisfy hold and violate setup. Both must hold simultaneously.

### Worked Timing Example

Consider a pipeline register on a Cyclone IV FPGA. The timing parameters below come from the Cyclone IV Device Handbook (Altera/Intel, Table 1-8):

| Parameter | Value |
|-----------|-------|
| $t_{pcq}$ | 199 ps |
| $t_{su}$ | 76 ps |
| $t_h$ | 0 ps |
| $t_{pd}$ per logic element (LE) | 381 ps |
| $t_{wire}$ per inter-LE routing segment | 246 ps |

If the critical path traverses 3 LEs and 2 routing segments:

$$t_{pd,\text{total}} = 3 \times 381\,\text{ps} + 2 \times 246\,\text{ps} = 1143 + 492 = 1635\,\text{ps}$$

$$T_c \geq 199 + 1635 + 76 = 1910\,\text{ps}$$

$$f_{max} = \frac{1}{1910 \times 10^{-12}} \approx 523\,\text{MHz}$$

Adding one LE to the critical path increases $t_{pd,\text{total}}
