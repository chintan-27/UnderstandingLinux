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

Every CPU, memory controller, and peripheral you interact with through Linux was designed in an HDL before a single transistor was placed on silicon. Hardware is parallel by nature: on every rising clock edge, thousands of flip-flops update simultaneously, combinational logic settles across multiple fan-out paths, and there is no program counter serializing the work. A conventional programming language cannot express this — it assumes sequential execution by definition.

The cost of discovering a hardware bug post-fabrication is what makes HDLs non-negotiable. Intel's Pentium FDIV bug (1994) stemmed from five missing entries in a lookup table used by the floating-point divider. The SRT division algorithm requires a table of $1066$ entries; the omission caused relative errors as large as $\approx 6.1 \times 10^{-5}$ in specific operand ranges. Intel's recall cost exceeded \$475 million. A directed simulation testbench covering those operand pairs would have caught it. HDLs exist so that "simulate before you fabricate" is not just a slogan but an engineering discipline with tooling.

---

## Core Concepts

### What an HDL Actually Is

An HDL is a *concurrent* description language. When you write:

```systemverilog
assign y = a & b;
```

you are not scheduling an operation — you are declaring a wire named `y` whose voltage is physically determined by the AND of `a` and `b` at every instant. The simulator reflects this with an **event-driven** execution model: when `a` transitions from 0 to 1, the simulator enqueues an event, re-evaluates every expression sensitive to `a`, and propagates changes until the event queue is empty (quiescence). The number of re-evaluation passes in a single simulation time step is called the **delta cycle count**. Combinational feedback loops that never quiesce produce a simulation error — and would oscillate destructively in real silicon.

The three dominant HDLs:

- **Verilog (IEEE 1364)**: C-like syntax, permissive typing. The foundation.
- **SystemVerilog (IEEE 1800)**: a strict superset of Verilog. Adds `logic`, `always_ff`/`always_comb` process qualifiers, interfaces, packed structs, and a full object-oriented verification layer (classes, randomization, coverage). Dominant in current industry.
- **VHDL (IEEE 1076)**: Ada-derived, strongly typed, verbose. Still required in defense/aerospace contracts and on many European FPGA tool flows.

The distinction between Verilog and SystemVerilog matters when you read open-source IP cores on sites like OpenCores or in the Linux kernel's FPGA subsystem drivers — many are written in Verilog 2001 and will fail to parse under strict SystemVerilog mode.

### Modules: The Unit of Abstraction

A **module** declares an interface and an implementation. The synthesis tool treats the interface as a black box when compiling the parent — it only needs to know port widths and directions, not internal logic, to route wires. This is the hardware analog of a separately-compiled translation unit with a header.

```systemverilog
// Combinational majority function: y=1 when at least two of a,b,c are 1
module majority(input  logic a, b, c,
                output logic y);
  assign y = (a & b) | (b & c) | (a & c);
endmodule
```

The Boolean expression implements a sum-of-products: $y = ab + bc + ac$. Any synthesis tool will recognize this as three 2-input ANDs feeding a 3-input OR — six transistors per gate in CMOS, eighteen transistors total for a naive implementation before optimization.

### The `logic` Type and Its Four Values

SystemVerilog's `logic` type encodes four signal states: `0`, `1`, `x` (unknown), and `z` (high impedance). This is not a simulation convenience — it models real physical conditions:

| Value | Physical meaning | When it appears |
|-------|-----------------|-----------------|
| `0` | Logic low, $V \approx 0\,\text{V}$ | Normal driven low |
| `1` | Logic high, $V \approx V_{DD}$ | Normal driven high |
| `x` | Voltage unknown to simulator | Uninitialized register, contention between drivers |
| `z` | Wire disconnected from any driver | Tristate output disabled, unconnected input |

`x` propagates conservatively: `1 & x = x`, `0 & x = 0`, `1 | x = 1`, `0 | x = x`. This means simulation will flag incorrect behavior when uninitialized state reaches outputs, rather than silently producing `0` or `1` as some languages do by defaulting uninitialized values.

`z` models tristate buses — the physical mechanism used in memory buses and older CPU front-side buses where multiple devices share a wire:

```systemverilog
module tristate #(parameter W = 8)
                (input  logic [W-1:0] a,
                 input  logic         en,
                 output tri   [W-1:0] y);   // tri, not logic: multiple drivers permitted
  assign y = en ? a : {W{1'bz}};
endmodule
```

The `tri` net type instructs the compiler that multiple module instances may drive `y` simultaneously. If two enabled drivers place conflicting values on the same `tri` net, the simulator resolves the contention to `x` — the correct answer, because the real wire would see a short between $V_{DD}$ and GND.

### Sequential Logic and the Clock Domain

Combinational logic is memoryless: its output is a pure function of current inputs. Sequential logic stores state in flip-flops, which sample their `d` input on the active clock edge and hold the result until the next edge. Every digital system is partitioned into **clock domains** — groups of flip-flops sharing a clock source. Signals crossing between domains require synchronization circuits (two-flop synchronizers or FIFOs) to prevent **metastability**, a condition where a flip-flop's output settles to an indeterminate voltage between `0` and `1`.

The canonical D flip-flop with synchronous reset:

```systemverilog
always_ff @(posedge clk)
  if (reset) q <= '0;
  else       q <= d;
```

`always_ff` is a SystemVerilog process qualifier — it asserts to the synthesis tool and linter that this block must infer only flip-flop elements, and it causes a compile error if the block accidentally infers latches (which `always @(*)` silently permits).

The **nonblocking assignment** `<=` is what makes this correct. In a time step containing a `posedge clk` event, the simulator:
1. Evaluates *all* right-hand sides of `<=` assignments using the *current* (pre-clock-edge) signal values
2. Schedules all left-hand side updates for the end of the time step
3. Applies all updates simultaneously

This means a shift register written as:

```systemverilog
always_ff @(posedge clk) begin
  a <= in;
  b <= a;
  c <= b;
end
```

correctly shifts data one stage per clock, because `b` is assigned the *old* value of `a`, not the value `a` just received. If `=` (blocking) were used instead, `b` would see `a`'s new value in the same time step, making all three registers capture `in` simultaneously — a fundamentally different circuit.

### Blocking vs. Nonblocking: The Rule

| Assignment | Operator | Evaluation | Correct use |
|---|---|---|---|
| Blocking | `=` | Immediate, in program order | Combinational `always_comb` blocks |
| Nonblocking | `<=` | Deferred to end-of-time-step | Clocked `always_ff` blocks |

The rule is absolute: never use `=` in `always_ff`, never use `<=` in `always_comb`. Mixing them produces a simulation–synthesis mismatch: the simulator will produce one result (following the `=`/`<=` scheduling rules) while the synthesized gate netlist implements different behavior.

### Timing and Setup/Hold Constraints

A synthesized circuit's maximum clock frequency is set by its **critical path** — the longest combinational delay from any flip-flop output to any flip-flop input. If the propagation delay along the critical path is $t_{pd}$, the flip-flop setup time is $t_{setup}$, and the clock-to-Q delay is $t_{cq}$, then the minimum clock period is:

$$T_{min} = t_{cq} + t_{pd} + t_{setup}$$

$$f_{max} = \frac{1}{T_{min}}$$

A modern 7nm process cell library might have $t_{cq} \approx 50\,\text{ps}$, $t_{setup} \approx 30\,\text{ps}$, and a 16-bit adder critical path of $t_{pd} \approx 120\,\text{ps}$, giving $f_{max} \approx 5\,\text{GHz}$ for that path in isolation. Static timing analysis (STA) tools such as OpenSTA or Cadence Tempus compute this for every path in a design automatically.

---

## How It Works

### The Synthesis Pipeline

$$\text{HDL source} \xrightarrow{\text{parse + elaborate}} \text{AST} \xrightarrow{\text{optimization}} \text{generic netlist} \xrightarrow{\text{tech-map}} \text{GDSII or FPGA bitstream}$$

Each stage:

1. **Parsing**: syntax validation, builds an AST. Parameters are not yet resolved.
2. **Elaboration**: parameter substitution, generate-block unrolling, hierarchy flattening. A `#(WIDTH=32)` instantiation becomes a literal 32-bit circuit.
3. **Optimization**: Boolean minimization (Espresso algorithm or BDD-based), constant propagation, dead-code elimination.
4. **Technology mapping**: replaces abstract AND/OR/NOT gates with cells from a **standard cell library** (ASIC) or 4-to-6 input LUTs (FPGA). This step is what makes the same HDL produce different silicon
