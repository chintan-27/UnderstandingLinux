---
id: 45
title: "Asynchronous design basics"
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
# Asynchronous design basics

## Why This Matters

Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.

**Asynchronous design basics** sits within Digital Logic and Hardware Design (Supermodule 4). This module covers 3 interconnected topics: handshakes, hazards, synchronization. Each builds on the previous, forming a coherent picture of how digital logic design works at this level.

## Core Concepts

### Handshakes

**Handshakes** is a foundational concept within asynchronous design basics. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding handshakes allows you to reason about system behavior rather than treating it as a black box.

### Hazards

**Hazards** is a foundational concept within asynchronous design basics. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding hazards allows you to reason about system behavior rather than treating it as a black box.

### Synchronization

**Synchronization** is a foundational concept within asynchronous design basics. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding synchronization allows you to reason about system behavior rather than treating it as a black box.

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

- **Handshakes** — understand this deeply and the rest of asynchronous design basics follows naturally.
- **Hazards** — understand this deeply and the rest of asynchronous design basics follows naturally.
- **Synchronization** — understand this deeply and the rest of asynchronous design basics follows naturally.
- Think in terms of trade-offs: every design choice in digital logic design sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Hardware description languages**, builds directly on these ideas. Verilog/VHDL/SystemVerilog concepts and Simulation extend what you've learned here into hardware description languages.
