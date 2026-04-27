---
id: 44
title: "Synchronous design"
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
# Synchronous design

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**Synchronous design** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 4 interconnected topics: setup/hold, clock domains, metastability, reset strategies. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Setup/hold

**Setup/hold** is a foundational concept within synchronous design. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding setup/hold allows you to reason about system behavior rather than treating it as a black box.

### Clock domains

**Clock domains** is a foundational concept within synchronous design. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding clock domains allows you to reason about system behavior rather than treating it as a black box.

### Metastability

**Metastability** is a foundational concept within synchronous design. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding metastability allows you to reason about system behavior rather than treating it as a black box.

### Reset strategies

**Reset strategies** is a foundational concept within synchronous design. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding reset strategies allows you to reason about system behavior rather than treating it as a black box.

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

- **Setup/hold** — understand this deeply and the rest of synchronous design follows naturally.
- **Clock domains** — understand this deeply and the rest of synchronous design follows naturally.
- **Metastability** — understand this deeply and the rest of synchronous design follows naturally.
- **Reset strategies** — understand this deeply and the rest of synchronous design follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Asynchronous design basics**, builds directly on these ideas. Handshakes and Hazards extend what you've learned here into asynchronous design basics.
