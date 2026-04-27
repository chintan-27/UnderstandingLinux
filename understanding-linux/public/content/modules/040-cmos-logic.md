---
id: 40
title: "CMOS logic"
part: "IV"
supermoduleId: 4
estimatedMinutes: 60
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
# CMOS logic

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**CMOS logic** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 7 interconnected topics: inverter, NAND, NOR, transistor-level gate design, fanout, delay, dynamic/static power. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Inverter

**Inverter** is a foundational concept within cmos logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding inverter allows you to reason about system behavior rather than treating it as a black box.

### NAND

**NAND** is a foundational concept within cmos logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding NAND allows you to reason about system behavior rather than treating it as a black box.

### NOR

**NOR** is a foundational concept within cmos logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding NOR allows you to reason about system behavior rather than treating it as a black box.

### Transistor-level gate design

**Transistor-level gate design** is a foundational concept within cmos logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding transistor-level gate design allows you to reason about system behavior rather than treating it as a black box.

### Fanout

**Fanout** is a foundational concept within cmos logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding fanout allows you to reason about system behavior rather than treating it as a black box.

### Delay

**Delay** is a foundational concept within cmos logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding delay allows you to reason about system behavior rather than treating it as a black box.

### Dynamic/static power

**Dynamic/static power** is a foundational concept within cmos logic. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding dynamic/static power allows you to reason about system behavior rather than treating it as a black box.

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

- **Inverter** — understand this deeply and the rest of cmos logic follows naturally.
- **NAND** — understand this deeply and the rest of cmos logic follows naturally.
- **NOR** — understand this deeply and the rest of cmos logic follows naturally.
- **Transistor-level gate design** — understand this deeply and the rest of cmos logic follows naturally.
- **Fanout** — understand this deeply and the rest of cmos logic follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Combinational blocks**, builds directly on these ideas. Adders and Multiplexers extend what you've learned here into combinational blocks.
