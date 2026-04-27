---
id: 39
title: "Boolean algebra"
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
# Boolean algebra

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**Boolean algebra** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 5 interconnected topics: truth tables, simplification, canonical forms, De Morgan, minimization. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Truth tables

**Truth tables** is a foundational concept within boolean algebra. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding truth tables allows you to reason about system behavior rather than treating it as a black box.

### Simplification

**Simplification** is a foundational concept within boolean algebra. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding simplification allows you to reason about system behavior rather than treating it as a black box.

### Canonical forms

**Canonical forms** is a foundational concept within boolean algebra. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding canonical forms allows you to reason about system behavior rather than treating it as a black box.

### De Morgan

**De Morgan** is a foundational concept within boolean algebra. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding De Morgan allows you to reason about system behavior rather than treating it as a black box.

### Minimization

**Minimization** is a foundational concept within boolean algebra. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding minimization allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```
// De Morgan's Laws
// NOT(A AND B) = (NOT A) OR (NOT B)
// NOT(A OR B)  = (NOT A) AND (NOT B)

// Truth table for NAND (universal gate):
// A | B | A NAND B
// 0 | 0 |    1
// 0 | 1 |    1
// 1 | 0 |    1
// 1 | 1 |    0
```

## Key Insights

- **Truth tables** — understand this deeply and the rest of boolean algebra follows naturally.
- **Simplification** — understand this deeply and the rest of boolean algebra follows naturally.
- **Canonical forms** — understand this deeply and the rest of boolean algebra follows naturally.
- **De Morgan** — understand this deeply and the rest of boolean algebra follows naturally.
- **Minimization** — understand this deeply and the rest of boolean algebra follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **CMOS logic**, builds directly on these ideas. Inverter and NAND extend what you've learned here into cmos logic.
