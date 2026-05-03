---
id: 46
title: "Hardware description languages"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Why This Matters

Every CPU, GPU, and peripheral on your Linux machine was designed in an HDL before a single transistor was fabricated. When you write a device driver, you are writing software that talks to a register map someone defined in Verilog or VHDL. Understanding how that hardware was *specified* tells you why certain register fields are read-only, why a status bit requires a write-1-to-clear sequence, why a DMA descriptor must be cache-line-aligned, and why the datasheet says "wait 3 clock cycles after enabling before reading status." These are not arbitrary API choices — they are direct consequences of the underlying RTL.

A bug caught in simulation costs one engineer-day. The same bug after tape-out costs a silicon respin: six to twelve weeks of fab time and hundreds of thousands of dollars. HDLs exist to make hardware describable, simulatable, and formally verifiable before anything physical exists.

---

## Core Concepts

### HDLs Are Not Programming Languages

A program is a sequence of instructions that a processor executes one at a time. An HDL is a *description of concurrent hardware*. When you write:

```systemverilog
assign y = a & b;
```

you are not scheduling an AND operation — you are declaring that the wire `y` is permanently connected to the AND of wires `a` and `b`. Every `assign` statement in a module is active simultaneously, always. There is no program counter, no instruction fetch, no concept of "this line runs before that line" at the hardware level.

This concurrency is the foundational conceptual shift. A 1000-line Verilog module describes 1000 things happening in parallel. Reading it sequentially, as you would C, produces completely wrong mental models.

### The Three HDLs in Practice

**VHDL** is strongly typed, verbose, and standard in defense, aerospace, and European industry. Its type system catches a class of bugs at compile time that Verilog silently ignores — a 4-bit value assigned to an 8-bit port is a type error in VHDL. The language separates interface (`entity`) from implementation (`architecture`), which enforces a clean boundary that Verilog leaves optional.

**Verilog** is C-like in syntax and historically dominant in North American commercial chip design. Its permissiveness is a liability: implicit net declarations, 4-state logic coerced silently, and `reg` used for both combinational and sequential logic create ambiguity the synthesizer resolves by convention rather than enforcement.

**SystemVerilog** (IEEE 1800) is a superset of Verilog that fixes its worst problems. The `logic` type replaces the ambiguous `reg`/`wire` split. `always_ff`, `always_comb`, and `always_latch` replace the generic `always` block with constructs whose synthesis intent is explicit and tool-checkable. Interfaces bundle related signals. Assertions embed correctness properties directly in the RTL. Industry is converging on SystemVerilog for both design and verification.

### Behavioral vs. Structural Description

**Structural** HDL instantiates submodules and connects them with wires, mirroring a schematic exactly. You specify *how* the circuit is assembled.

**Behavioral** HDL describes *what* the circuit computes and lets the synthesis tool infer the gate-level implementation. A behavioral `always_comb` block with a priority encoder written as a `case` statement will synthesize to a gate network the tool selects based on timing and area constraints.

Both styles produce equivalent netlists for equivalent logic. Behavioral HDL is preferred for complex logic because it lets the synthesizer apply technology-specific optimizations (gate sizing, logic restructuring) that a structural description would prevent.

### Simulation vs. Synthesis

**Simulation** runs HDL as a program to check logical correctness. All language constructs are valid — you can print to the console, read files, and insert arbitrary time delays.

**Synthesis** translates HDL into a netlist of physical gates for a target process node. Only a *synthesizable subset* is valid. The gap between these subsets is a source of real bugs: code that simulates correctly can synthesize to wrong hardware if it uses constructs the synthesizer interprets differently than the simulator does.

The canonical example: `initial` blocks are legal in simulation (set up initial state) and illegal or ignored in synthesis (hardware has no "initial" moment — it powers up to an undefined state unless a reset network drives it to a known value). Relying on `initial` for reset logic is a simulation/synthesis mismatch that passes all tests and ships broken silicon.

### Blocking vs. Non-Blocking Assignments

This distinction causes more bugs than any other single HDL concept.

Inside `always` blocks in SystemVerilog:

- `=` is **blocking**: the left-hand side updates immediately; subsequent lines in the same block see the new value. Execution within the block is sequential.
- `<=` is **non-blocking**: all right-hand sides are evaluated first using *current* values; all left-hand sides update simultaneously at the end of the simulation time step.

**Rule**: use `<=` in `always_ff` (sequential logic), use `=` in `always_comb` (combinational logic). The rule exists because flip-flops in silicon update simultaneously on the clock edge — non-blocking assignment models that. Combinational logic computes a function of its current inputs with no memory — blocking assignment is correct there.

Mixing them incorrectly produces the worst category of HDL bug: a circuit that simulates correctly (because the simulator processes statements in order) but synthesizes to something different (because the synthesizer reads the non-blocking assignments as register boundaries the designer did not intend). The RTL and the gate netlist disagree silently.

---

## How It Works

### Combinational Logic: Continuous Assignment

Consider the Boolean function:

$$y = \bar{a}\bar{b}\bar{c} + a\bar{b}\bar{c} + a\bar{b}c$$

This is sum-of-products form. Each product term maps directly to an AND gate; the OR of the terms maps to an OR gate. In SystemVerilog:

```systemverilog
module sillyfunction (
    input  logic a, b, c,
    output logic y
);
    assign y = (~a & ~b & ~c)
             | ( a & ~b & ~c)
             | ( a & ~b &  c);
endmodule
```

The synthesizer sees three product terms OR'd together. It maps them to NAND-NAND or AND-OR-INVERT logic depending on what the target library provides. The circuit exists permanently and continuously. A glitch on `a` propagates to `y` after the combinational path delay $t_{pd}$, a physical property of the process node — typically $200\,\text{ps}$ to $2\,\text{ns}$ depending on gate type and fanout.

The equivalent VHDL:

```vhdl
library IEEE;
use IEEE.STD_LOGIC_1164.all;

entity sillyfunction is
    port (a, b, c : in  STD_LOGIC;
          y       : out STD_LOGIC);
end;

architecture synth of sillyfunction is
begin
    y <= (not a and not b and not c)
       or (    a and not b and not c)
       or (    a and not b and     c);
end;
```

The `entity`/`architecture` split is not stylistic overhead — it enforces interface/implementation separation. A top-level schematic instantiates the `entity`; the `architecture` can be swapped (e.g., from behavioral to structural) without changing any instantiation that uses it.

### Sequential Logic: Registers and Clocks

A D flip-flop captures `d` on the rising clock edge and holds it at `q` until the next edge. In the time domain: the output is constant between edges, and $q[n] = d[n-1]$ where $n$ indexes clock cycles.

The maximum clock frequency is set by the critical path — the longest combinational delay between any two registers:

$$f_{\max} = \frac{1}{t_{pcq} + t_{pd,\max} + t_{setup}}$$

where $t_{pcq}$ is the clock-to-output delay of the source register, $t_{pd,\max}$ is the worst-case combinational path delay, and $t_{setup}$ is the setup time of the destination register. The synthesizer's timing analysis identifies which path determines $f_{\max}$ and reports it as the critical path.

```systemverilog
module flopr #(parameter WIDTH = 8) (
    input  logic             clk, reset,
    input  logic [WIDTH-1:0] d,
    output logic [WIDTH-1:0] q
);
    always_ff @(posedge clk, posedge reset)
        if (reset) q <= '0;
        else       q <= d;
endmodule
```

`always_ff` is not cosmetic — it is a synthesis directive. The tool will emit an error if this block does not infer flip-flops, catching structural mistakes before simulation. `@(posedge clk, posedge reset)` makes reset asynchronous: `q` goes to zero immediately when `reset` rises, independent of the clock. Synchronous reset would instead be `@(posedge clk)` with `reset` checked inside the block, and `q` would only clear on the next rising clock edge. The choice affects timing closure and reset network fanout, both of which appear in synthesis reports.

### Finite State Machines

A Moore FSM encodes state in registers and computes outputs as a function of state only. The next-state logic and output logic are both combinational; only the state register is sequential.

```systemverilog
typedef enum logic [1:0] {
    S0 = 2'b00,
    S1 = 2'b01,
    S2 = 2'b10
} state_t;

module fsm (
    input  logic clk, reset, in,
    output logic out
);
    state_t state, next;

    // State register
    always_ff @(posedge clk, posedge reset)
        if (reset) state <= S0;
        else       state <= next;

    // Next-state logic (combinational)
    always_comb
        case (state)
            S0: next = in ? S1 : S0;
            S1: next = in ? S1 : S2;
            S2: next = in ? S1 : S0;
            default: next = S
