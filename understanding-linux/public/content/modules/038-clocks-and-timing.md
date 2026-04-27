---
id: 38
title: "Clocks and timing"
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
# Clocks and timing

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Clocks and timing** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 5 interconnected topics: oscillators, PLL intuition, skew, jitter, timing closure relevance. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Oscillators

**Oscillators** is a foundational concept within clocks and timing. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding oscillators allows you to reason about system behavior rather than treating it as a black box.

### PLL intuition

**PLL intuition** is a foundational concept within clocks and timing. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding PLL intuition allows you to reason about system behavior rather than treating it as a black box.

### Skew

**Skew** is a foundational concept within clocks and timing. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding skew allows you to reason about system behavior rather than treating it as a black box.

### Jitter

**Jitter** is a foundational concept within clocks and timing. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding jitter allows you to reason about system behavior rather than treating it as a black box.

### Timing closure relevance

**Timing closure relevance** is a foundational concept within clocks and timing. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding timing closure relevance allows you to reason about system behavior rather than treating it as a black box.

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

- **Oscillators** — understand this deeply and the rest of clocks and timing follows naturally.
- **PLL intuition** — understand this deeply and the rest of clocks and timing follows naturally.
- **Skew** — understand this deeply and the rest of clocks and timing follows naturally.
- **Jitter** — understand this deeply and the rest of clocks and timing follows naturally.
- **Timing closure relevance** — understand this deeply and the rest of clocks and timing follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Boolean algebra**, builds directly on these ideas. Truth tables and Simplification extend what you've learned here into boolean algebra.
