---
id: 47
title: "Verification"
part: "IV"
supermoduleId: 4
estimatedMinutes: 50
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
# Verification

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**Verification** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 4 interconnected topics: testbenches, assertions, formal verification basics, timing analysis. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Testbenches

**Testbenches** is a foundational concept within verification. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding testbenches allows you to reason about system behavior rather than treating it as a black box.

### Assertions

**Assertions** is a foundational concept within verification. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding assertions allows you to reason about system behavior rather than treating it as a black box.

### Formal verification basics

**Formal verification basics** is a foundational concept within verification. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding formal verification basics allows you to reason about system behavior rather than treating it as a black box.

### Timing analysis

**Timing analysis** is a foundational concept within verification. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding timing analysis allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```
// Circuit timing example
// Setup time (tsu): data must be stable BEFORE clock edge
// Hold time (th):   data must be stable AFTER clock edge
// Clock-to-Q (tcq): delay from clock edge to output change
//
// Max frequency = 1 / (tcq + t_combinational + tsu)
```

## Key Insights

- **Testbenches** — understand this deeply and the rest of verification follows naturally.
- **Assertions** — understand this deeply and the rest of verification follows naturally.
- **Formal verification basics** — understand this deeply and the rest of verification follows naturally.
- **Timing analysis** — understand this deeply and the rest of verification follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **FPGA and ASIC workflows**, builds directly on these ideas. Synthesis and Place-and-route extend what you've learned here into fpga and asic workflows.
