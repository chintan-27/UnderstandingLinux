---
id: 31
title: "Capacitors and inductors"
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
# Capacitors and inductors

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Capacitors and inductors** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 4 interconnected topics: storage, transients, RC/RL/RLC behavior, resonance intuition. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Storage

**Storage** is a foundational concept within capacitors and inductors. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding storage allows you to reason about system behavior rather than treating it as a black box.

### Transients

**Transients** is a foundational concept within capacitors and inductors. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding transients allows you to reason about system behavior rather than treating it as a black box.

### RC/RL/RLC behavior

**RC/RL/RLC behavior** is a foundational concept within capacitors and inductors. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding RC/RL/RLC behavior allows you to reason about system behavior rather than treating it as a black box.

### Resonance intuition

**Resonance intuition** is a foundational concept within capacitors and inductors. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding resonance intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Storage** — understand this deeply and the rest of capacitors and inductors follows naturally.
- **Transients** — understand this deeply and the rest of capacitors and inductors follows naturally.
- **RC/RL/RLC behavior** — understand this deeply and the rest of capacitors and inductors follows naturally.
- **Resonance intuition** — understand this deeply and the rest of capacitors and inductors follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Analog signals**, builds directly on these ideas. Waveforms and Frequency domain extend what you've learned here into analog signals.
