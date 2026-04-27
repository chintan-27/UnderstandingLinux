---
id: 34
title: "Amplifiers and analog basics"
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
# Amplifiers and analog basics

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Amplifiers and analog basics** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 5 interconnected topics: gain, biasing, small-signal thinking, comparators, op-amp intuition. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Gain

**Gain** is a foundational concept within amplifiers and analog basics. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding gain allows you to reason about system behavior rather than treating it as a black box.

### Biasing

**Biasing** is a foundational concept within amplifiers and analog basics. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding biasing allows you to reason about system behavior rather than treating it as a black box.

### Small-signal thinking

**Small-signal thinking** is a foundational concept within amplifiers and analog basics. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding small-signal thinking allows you to reason about system behavior rather than treating it as a black box.

### Comparators

**Comparators** is a foundational concept within amplifiers and analog basics. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding comparators allows you to reason about system behavior rather than treating it as a black box.

### Op-amp intuition

**Op-amp intuition** is a foundational concept within amplifiers and analog basics. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding op-amp intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Gain** — understand this deeply and the rest of amplifiers and analog basics follows naturally.
- **Biasing** — understand this deeply and the rest of amplifiers and analog basics follows naturally.
- **Small-signal thinking** — understand this deeply and the rest of amplifiers and analog basics follows naturally.
- **Comparators** — understand this deeply and the rest of amplifiers and analog basics follows naturally.
- **Op-amp intuition** — understand this deeply and the rest of amplifiers and analog basics follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Noise**, builds directly on these ideas. Thermal noise and Shot noise extend what you've learned here into noise.
