---
id: 41
title: "Combinational blocks"
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
# Combinational blocks

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**Combinational blocks** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 7 interconnected topics: adders, multiplexers, decoders, encoders, comparators, shifters, ALU pieces. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Adders

**Adders** is a foundational concept within combinational blocks. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding adders allows you to reason about system behavior rather than treating it as a black box.

### Multiplexers

**Multiplexers** is a foundational concept within combinational blocks. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding multiplexers allows you to reason about system behavior rather than treating it as a black box.

### Decoders

**Decoders** is a foundational concept within combinational blocks. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding decoders allows you to reason about system behavior rather than treating it as a black box.

### Encoders

**Encoders** is a foundational concept within combinational blocks. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding encoders allows you to reason about system behavior rather than treating it as a black box.

### Comparators

**Comparators** is a foundational concept within combinational blocks. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding comparators allows you to reason about system behavior rather than treating it as a black box.

### Shifters

**Shifters** is a foundational concept within combinational blocks. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding shifters allows you to reason about system behavior rather than treating it as a black box.

### ALU pieces

**ALU pieces** is a foundational concept within combinational blocks. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding ALU pieces allows you to reason about system behavior rather than treating it as a black box.

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

- **Adders** — understand this deeply and the rest of combinational blocks follows naturally.
- **Multiplexers** — understand this deeply and the rest of combinational blocks follows naturally.
- **Decoders** — understand this deeply and the rest of combinational blocks follows naturally.
- **Encoders** — understand this deeply and the rest of combinational blocks follows naturally.
- **Comparators** — understand this deeply and the rest of combinational blocks follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Sequential logic**, builds directly on these ideas. Latches and Flip-flops extend what you've learned here into sequential logic.
