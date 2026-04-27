---
id: 36
title: "Power electronics and regulation"
part: "III"
supermoduleId: 3
estimatedMinutes: 55
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
# Power electronics and regulation

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Power electronics and regulation** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 5 interconnected topics: regulators, power supplies, decoupling, distribution, power integrity. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Regulators

**Regulators** is a foundational concept within power electronics and regulation. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding regulators allows you to reason about system behavior rather than treating it as a black box.

### Power supplies

**Power supplies** is a foundational concept within power electronics and regulation. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding power supplies allows you to reason about system behavior rather than treating it as a black box.

### Decoupling

**Decoupling** is a foundational concept within power electronics and regulation. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding decoupling allows you to reason about system behavior rather than treating it as a black box.

### Distribution

**Distribution** is a foundational concept within power electronics and regulation. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding distribution allows you to reason about system behavior rather than treating it as a black box.

### Power integrity

**Power integrity** is a foundational concept within power electronics and regulation. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding power integrity allows you to reason about system behavior rather than treating it as a black box.

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

- **Regulators** — understand this deeply and the rest of power electronics and regulation follows naturally.
- **Power supplies** — understand this deeply and the rest of power electronics and regulation follows naturally.
- **Decoupling** — understand this deeply and the rest of power electronics and regulation follows naturally.
- **Distribution** — understand this deeply and the rest of power electronics and regulation follows naturally.
- **Power integrity** — understand this deeply and the rest of power electronics and regulation follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Signal integrity**, builds directly on these ideas. Transmission lines and Reflections extend what you've learned here into signal integrity.
