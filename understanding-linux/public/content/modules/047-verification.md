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

A digital design that simulates correctly can still fail in silicon. Timing violations cause flip-flops to capture metastable values. Logic errors that no test exercised remain hidden until a rare input combination triggers them in production. Formal verification exists because exhaustive simulation is computationally intractable — a 64-bit adder has $2^{128}$ possible input combinations, and at $10^9$ tests per second that requires $\approx 1.08 \times 10^{19}$ years, roughly $8 \times 10^8$ times the age of the universe. Each verification technique closes a distinct gap: testbenches find bugs on exercised paths, assertions catch invariant violations the instant they occur, formal methods prove properties over all reachable states, and static timing analysis guarantees your pipeline closes at the target frequency. Omit any one of these and you are shipping a circuit that is merely untested, not correct.

## Core Concepts

### Testbenches

A testbench is non-synthesizable HDL that wraps the design under test (DUT), drives inputs, and checks outputs. Its power is limited by its coverage: every input you never generate is a bug you cannot find. A **self-checking testbench** computes expected outputs by an independent reference model and compares automatically — it does not ask a human to interpret waveforms. The reference model is the verification oracle; if it has the same bug as the DUT, the testbench proves nothing.

### Assertions

An assertion is a Boolean property that must hold at a specific point in time. When it fails in simulation, the tool flags the exact cycle where the invariant broke, rather than letting a corrupted value propagate silently for hundreds of cycles before a downstream error surfaces. Assertions also serve as the logical backbone of formal verification: the same `assert property` statement a simulator evaluates sample-by-sample is what a formal tool attempts to prove holds for every reachable state.

### Formal Verification

Formal verification replaces sampling with proof. A **model checker** builds a state transition graph of the circuit and either proves an assertion holds in every reachable state, or produces a concrete **counterexample trace** — a sequence of inputs that drives the design into the violating state. This is categorically stronger than simulation because it covers states no human would think to exercise. The limitation is state space explosion: a circuit with $n$ flip-flops has up to $2^n$ reachable states. **Bounded model checking (BMC)** sidesteps this by proving properties hold for all input sequences of length $\leq k$ clock cycles — complete for bugs that manifest quickly, incomplete for liveness properties.

### Timing Analysis

Static timing analysis (STA) determines whether every path in a synchronous circuit satisfies setup and hold constraints at every flip-flop, at every process/voltage/temperature (PVT) corner, without running simulation. It operates on the timing netlist produced after synthesis and place-and-route. STA cannot lie to you the way simulation can — there is no test vector to miss. What it cannot check is functional correctness; it only checks that the correct value, whatever it is, arrives on time.

## How It Works

### Setup and Hold Time Analysis

Consider the standard pipeline stage: register R1 drives combinational logic feeding register R2, both clocked by the same clock.

```
CLK ──┬─────────────────────┐
      │                     │
    [R1] ──[combo logic]── [R2]
```

The clock period $T_c$ must be long enough for data to propagate from R1's output to R2's input and settle before R2's setup window closes:

$$T_c \geq t_{pcq} + t_{pd} + t_{setup}$$

where:
- $t_{pcq}$ — clock-to-Q **propagation** delay of R1: how long after the clock edge before R1's output is guaranteed valid
- $t_{pd}$ — worst-case propagation delay through the combinational logic (the critical path)
- $t_{setup}$ — setup time of R2: how long before the clock edge that R2's input must be stable

Rearranging to expose the timing budget for combinational logic:

$$t_{pd} \leq T_c - t_{pcq} - t_{setup}$$

**Worked example** (Harris & Harris, *Digital Design and Computer Architecture*, §3.5): $t_{pcq} = 80\,\text{ps}$, three gate stages at $40\,\text{ps}$ each, $t_{setup} = 50\,\text{ps}$:

$$T_c \geq 80 + (3 \times 40) + 50 = 250\,\text{ps}$$

$$f_{max} = \frac{1}{T_c} = \frac{1}{250 \times 10^{-12}} = 4\,\text{GHz}$$

The **hold constraint** governs the fastest path. Data must not arrive at R2 before R2's hold window closes — otherwise the new value races in and overwrites what R2 was still sampling:

$$t_{ccq} + t_{cd} \geq t_{hold}$$

where $t_{ccq}$ is the clock-to-Q **contamination** (earliest) delay of R1 and $t_{cd}$ is the contamination delay through the fastest combinational path. This inequality has a critical asymmetry with the setup constraint: **slowing the clock does not help**. Lowering $f_c$ increases $T_c$ but does not change $t_{ccq}$ or $t_{cd}$. The fix is to slow down the fast path by inserting buffer gates, which increases $t_{cd}$.

### Critical Path vs. Short Path

The critical path is the longest combinational path — it determines $f_{max}$. The short path is the fastest — it determines hold safety.

```
Input A ──[AND]──[AND]──[OR]── R2   ← critical path: 2t_AND + t_OR
Input B ──[AND]────────────── R2    ← short path:    t_AND
```

For the critical path: $t_{pd} = 2t_{pd,AND} + t_{pd,OR}$

For the short path: $t_{cd} = t_{cd,AND}$

If the hold constraint is violated on the short path, inserting a buffer ($t_{buf}$) on that path increases $t_{cd}$ to $t_{cd,AND} + t_{buf}$, resolving the violation without touching the clock frequency.

### Self-Checking Testbench in SystemVerilog

The `!==` operator performs a four-state exact comparison: `X` and `Z` are distinct from `0` and `1`. Using `!=` instead allows an uninitialized output `X` to compare equal to an expected value when the expression evaluates using two-state logic reduction — a silent false pass.

```systemverilog
module testbench;
  logic a, b, y;
  integer errors = 0;

  and_gate dut(.a(a), .b(b), .y(y));

  // Reference model: pure function, independent of DUT implementation
  function automatic logic ref_and(logic p, logic q);
    return p & q;
  endfunction

  initial begin
    for (int i = 0; i < 4; i++) begin
      {a, b} = i[1:0];
      #10;
      if (y !== ref_and(a, b)) begin
        $display("FAIL @%0t: a=%b b=%b expected %b got %b",
                 $time, a, b, ref_and(a, b), y);
        errors++;
      end
    end

    $display(errors ? "%0d FAILURES" : "ALL TESTS PASSED", errors);
    $finish;
  end
endmodule
```

The reference model (`ref_and`) is independently written. For a real DUT this would be a C model, a golden RTL, or a transaction-accurate model. The loop over `i` generates all $2^2 = 4$ input combinations exhaustively — affordable for 2 inputs, impractical beyond $\approx 20$ inputs without constrained random generation.

### Concurrent Assertions in SystemVerilog

An **immediate assertion** fires once at a specific simulation time. A **concurrent assertion** is sampled on every clock edge throughout the simulation and describes a temporal sequence — something no stimulus loop can express compactly.

```systemverilog
// Immediate assertion: checked once in procedural context
assert (output_valid || !input_ready)
  else $fatal(1, "Protocol violation: ready asserted without valid");

// Concurrent assertion: evaluated on every posedge of clk
// "if req is high, grant must arrive within 1 to 3 cycles"
property req_grant_p;
  @(posedge clk) disable iff (rst)
    req |-> ##[1:3] grant;
endproperty

assert property (req_grant_p)
  else $error("Grant latency violation at %0t", $time);

// "grant never asserted without a preceding req"
property no_spurious_grant_p;
  @(posedge clk) disable iff (rst)
    grant |-> $past(req, 1) || $past(req, 2) || $past(req, 3);
endproperty

assert property (no_spurious_grant_p)
  else $error("Spurious grant at %0t", $time);
```

`|->` is the **overlapping implication**: if the antecedent holds on cycle $n$, the consequent must hold starting from cycle $n$. `|=>` shifts the consequent to cycle $n+1$. `##[1:3]` matches a delay of 1, 2, or 3 clock cycles. `disable iff (rst)` suppresses the assertion during reset so reset itself does not generate false violations.

### Formal Verification: Bounded Model Checking

BMC unrolls the circuit $k$ times and encodes the reachability question as a Boolean satisfiability (SAT) problem. If the SAT solver finds a satisfying assignment, that assignment is a counterexample. If it finds none, no bug exists within $k$ cycles.

```
State 0 ──Transition──► State 1 ──Transition──► ... ──► State k
                                                              │
                                                     ¬P holds here?
