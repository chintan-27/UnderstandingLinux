---
id: 42
title: "Sequential logic"
part: "IV"
supermoduleId: 4
estimatedMinutes: 55
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
# Sequential logic

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**Sequential logic** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 5 interconnected topics: latches, flip-flops, registers, counters, memory elements. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Latches

**Latches** is a foundational concept within sequential logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding latches allows you to reason about system behavior rather than treating it as a black box.

### Flip-flops

**Flip-flops** is a foundational concept within sequential logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding flip-flops allows you to reason about system behavior rather than treating it as a black box.

### Registers

**Registers** is a foundational concept within sequential logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding registers allows you to reason about system behavior rather than treating it as a black box.

### Counters

**Counters** is a foundational concept within sequential logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding counters allows you to reason about system behavior rather than treating it as a black box.

### Memory elements

**Memory elements** is a foundational concept within sequential logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding memory elements allows you to reason about system behavior rather than treating it as a black box.

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

- **Latches** — understand this deeply and the rest of sequential logic follows naturally.
- **Flip-flops** — understand this deeply and the rest of sequential logic follows naturally.
- **Registers** — understand this deeply and the rest of sequential logic follows naturally.
- **Counters** — understand this deeply and the rest of sequential logic follows naturally.
- **Memory elements** — understand this deeply and the rest of sequential logic follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Finite-state machines**, builds directly on these ideas. State encoding and Transition logic extend what you've learned here into finite-state machines.
