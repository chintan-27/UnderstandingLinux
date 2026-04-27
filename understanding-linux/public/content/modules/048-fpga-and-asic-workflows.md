---
id: 48
title: "FPGA and ASIC workflows"
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
# FPGA and ASIC workflows

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**FPGA and ASIC workflows** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 4 interconnected topics: synthesis, place-and-route, timing closure, constraints. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Synthesis

**Synthesis** is a foundational concept within fpga and asic workflows. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding synthesis allows you to reason about system behavior rather than treating it as a black box.

### Place-and-route

**Place-and-route** is a foundational concept within fpga and asic workflows. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding place-and-route allows you to reason about system behavior rather than treating it as a black box.

### Timing closure

**Timing closure** is a foundational concept within fpga and asic workflows. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding timing closure allows you to reason about system behavior rather than treating it as a black box.

### Constraints

**Constraints** is a foundational concept within fpga and asic workflows. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding constraints allows you to reason about system behavior rather than treating it as a black box.

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

- **Synthesis** — understand this deeply and the rest of fpga and asic workflows follows naturally.
- **Place-and-route** — understand this deeply and the rest of fpga and asic workflows follows naturally.
- **Timing closure** — understand this deeply and the rest of fpga and asic workflows follows naturally.
- **Constraints** — understand this deeply and the rest of fpga and asic workflows follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Machine organization**, builds directly on these ideas. Datapath and Control extend what you've learned here into machine organization.
