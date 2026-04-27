---
id: 43
title: "Finite-state machines"
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
# Finite-state machines

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**Finite-state machines** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 3 interconnected topics: state encoding, transition logic, control design. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### State encoding

**State encoding** is a foundational concept within finite-state machines. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding state encoding allows you to reason about system behavior rather than treating it as a black box.

### Transition logic

**Transition logic** is a foundational concept within finite-state machines. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding transition logic allows you to reason about system behavior rather than treating it as a black box.

### Control design

**Control design** is a foundational concept within finite-state machines. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding control design allows you to reason about system behavior rather than treating it as a black box.

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

- **State encoding** — understand this deeply and the rest of finite-state machines follows naturally.
- **Transition logic** — understand this deeply and the rest of finite-state machines follows naturally.
- **Control design** — understand this deeply and the rest of finite-state machines follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Synchronous design**, builds directly on these ideas. Setup/hold and Clock domains extend what you've learned here into synchronous design.
