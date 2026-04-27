---
id: 30
title: "Network analysis"
part: "III"
supermoduleId: 3
estimatedMinutes: 50
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
# Network analysis

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Network analysis** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 4 interconnected topics: nodal analysis, mesh analysis, equivalent circuits, Thévenin/Norton. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Nodal analysis

**Nodal analysis** is a foundational concept within network analysis. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding nodal analysis allows you to reason about system behavior rather than treating it as a black box.

### Mesh analysis

**Mesh analysis** is a foundational concept within network analysis. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding mesh analysis allows you to reason about system behavior rather than treating it as a black box.

### Equivalent circuits

**Equivalent circuits** is a foundational concept within network analysis. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding equivalent circuits allows you to reason about system behavior rather than treating it as a black box.

### Thévenin/Norton

**Thévenin/Norton** is a foundational concept within network analysis. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding Thévenin/Norton allows you to reason about system behavior rather than treating it as a black box.

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

- **Nodal analysis** — understand this deeply and the rest of network analysis follows naturally.
- **Mesh analysis** — understand this deeply and the rest of network analysis follows naturally.
- **Equivalent circuits** — understand this deeply and the rest of network analysis follows naturally.
- **Thévenin/Norton** — understand this deeply and the rest of network analysis follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Capacitors and inductors**, builds directly on these ideas. Storage and Transients extend what you've learned here into capacitors and inductors.
