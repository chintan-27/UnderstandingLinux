---
id: 37
title: "Signal integrity"
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
# Signal integrity

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Signal integrity** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 5 interconnected topics: transmission lines, reflections, crosstalk, grounding, EMI/EMC. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Transmission lines

**Transmission lines** is a foundational concept within signal integrity. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding transmission lines allows you to reason about system behavior rather than treating it as a black box.

### Reflections

**Reflections** is a foundational concept within signal integrity. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding reflections allows you to reason about system behavior rather than treating it as a black box.

### Crosstalk

**Crosstalk** is a foundational concept within signal integrity. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding crosstalk allows you to reason about system behavior rather than treating it as a black box.

### Grounding

**Grounding** is a foundational concept within signal integrity. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding grounding allows you to reason about system behavior rather than treating it as a black box.

### EMI/EMC

**EMI/EMC** is a foundational concept within signal integrity. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding EMI/EMC allows you to reason about system behavior rather than treating it as a black box.

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

- **Transmission lines** — understand this deeply and the rest of signal integrity follows naturally.
- **Reflections** — understand this deeply and the rest of signal integrity follows naturally.
- **Crosstalk** — understand this deeply and the rest of signal integrity follows naturally.
- **Grounding** — understand this deeply and the rest of signal integrity follows naturally.
- **EMI/EMC** — understand this deeply and the rest of signal integrity follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Clocks and timing**, builds directly on these ideas. Oscillators and PLL intuition extend what you've learned here into clocks and timing.
