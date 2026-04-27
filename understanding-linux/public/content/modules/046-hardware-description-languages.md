---
id: 46
title: "Hardware description languages"
part: "IV"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design (Morris Mano)"
    url: "https://www.pearson.com/en-us/subject-catalog/p/digital-design/P200000003282"
  - type: article
    title: "Nandland — FPGA & Verilog Tutorials"
    url: "https://nandland.com/"
  - type: video
    title: "Ben Eater — Building an 8-bit Computer"
    url: "https://www.youtube.com/c/BenEater"
---
# Hardware description languages

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**Hardware description languages** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 3 interconnected topics: Verilog/VHDL/SystemVerilog concepts, simulation, synthesis. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Verilog/VHDL/SystemVerilog concepts

**Verilog/VHDL/SystemVerilog concepts** is a foundational concept within hardware description languages. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding Verilog/VHDL/SystemVerilog concepts allows you to reason about system behavior rather than treating it as a black box.

### Simulation

**Simulation** is a foundational concept within hardware description languages. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding simulation allows you to reason about system behavior rather than treating it as a black box.

### Synthesis

**Synthesis** is a foundational concept within hardware description languages. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding synthesis allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```verilog
// Simple D flip-flop in Verilog
module dff (
  input  wire clk,
  input  wire rst_n,
  input  wire d,
  output reg  q
);
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n)
      q <= 1'b0;
    else
      q <= d;
  end
endmodule
```

## Key Insights

- **Verilog/VHDL/SystemVerilog concepts** — understand this deeply and the rest of hardware description languages follows naturally.
- **Simulation** — understand this deeply and the rest of hardware description languages follows naturally.
- **Synthesis** — understand this deeply and the rest of hardware description languages follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Verification**, builds directly on these ideas. Testbenches and Assertions extend what you've learned here into verification.
