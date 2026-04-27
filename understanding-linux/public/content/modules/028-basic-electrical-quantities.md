---
id: 28
title: "Basic electrical quantities"
part: "III"
supermoduleId: 3
estimatedMinutes: 60
resources:
  - type: book
    title: "The Art of Electronics (Horowitz & Hill)"
    url: "https://artofelectronics.net/"
  - type: article
    title: "All About Circuits — Textbook"
    url: "https://www.allaboutcircuits.com/textbook/"
  - type: video
    title: "EEVblog — Electronics Engineering"
    url: "https://www.youtube.com/user/EEVblog"
---
# Basic electrical quantities

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Basic electrical quantities** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 6 interconnected topics: charge, current, voltage, resistance, power, energy. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Charge

**Charge** is a foundational concept within basic electrical quantities. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding charge allows you to reason about system behavior rather than treating it as a black box.

### Current

**Current** is a foundational concept within basic electrical quantities. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding current allows you to reason about system behavior rather than treating it as a black box.

### Voltage

**Voltage** is a foundational concept within basic electrical quantities. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding voltage allows you to reason about system behavior rather than treating it as a black box.

### Resistance

**Resistance** is a foundational concept within basic electrical quantities. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding resistance allows you to reason about system behavior rather than treating it as a black box.

### Power

**Power** is a foundational concept within basic electrical quantities. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding power allows you to reason about system behavior rather than treating it as a black box.

### Energy

**Energy** is a foundational concept within basic electrical quantities. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding energy allows you to reason about system behavior rather than treating it as a black box.

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

- **Charge** — understand this deeply and the rest of basic electrical quantities follows naturally.
- **Current** — understand this deeply and the rest of basic electrical quantities follows naturally.
- **Voltage** — understand this deeply and the rest of basic electrical quantities follows naturally.
- **Resistance** — understand this deeply and the rest of basic electrical quantities follows naturally.
- **Power** — understand this deeply and the rest of basic electrical quantities follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Circuit laws**, builds directly on these ideas. Ohm’s law and Kirchhoff’s current and voltage laws extend what you've learned here into circuit laws.
