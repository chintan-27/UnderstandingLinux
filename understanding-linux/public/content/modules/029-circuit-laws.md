---
id: 29
title: "Circuit laws"
part: "III"
supermoduleId: 3
estimatedMinutes: 40
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
# Circuit laws

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Circuit laws** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 2 interconnected topics: Ohm’s law, Kirchhoff’s current and voltage laws. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Ohm’s law

**Ohm’s law** is a foundational concept within circuit laws. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding Ohm’s law allows you to reason about system behavior rather than treating it as a black box.

### Kirchhoff’s current and voltage laws

**Kirchhoff’s current and voltage laws** is a foundational concept within circuit laws. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding Kirchhoff’s current and voltage laws allows you to reason about system behavior rather than treating it as a black box.

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

- **Ohm’s law** — understand this deeply and the rest of circuit laws follows naturally.
- **Kirchhoff’s current and voltage laws** — understand this deeply and the rest of circuit laws follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Network analysis**, builds directly on these ideas. Nodal analysis and Mesh analysis extend what you've learned here into network analysis.
