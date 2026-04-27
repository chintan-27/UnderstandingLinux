---
id: 35
title: "Noise"
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
# Noise

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Noise** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 5 interconnected topics: thermal noise, shot noise, SNR, interference, jitter. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Thermal noise

**Thermal noise** is a foundational concept within noise. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding thermal noise allows you to reason about system behavior rather than treating it as a black box.

### Shot noise

**Shot noise** is a foundational concept within noise. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding shot noise allows you to reason about system behavior rather than treating it as a black box.

### SNR

**SNR** is a foundational concept within noise. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding SNR allows you to reason about system behavior rather than treating it as a black box.

### Interference

**Interference** is a foundational concept within noise. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding interference allows you to reason about system behavior rather than treating it as a black box.

### Jitter

**Jitter** is a foundational concept within noise. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding jitter allows you to reason about system behavior rather than treating it as a black box.

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

- **Thermal noise** — understand this deeply and the rest of noise follows naturally.
- **Shot noise** — understand this deeply and the rest of noise follows naturally.
- **SNR** — understand this deeply and the rest of noise follows naturally.
- **Interference** — understand this deeply and the rest of noise follows naturally.
- **Jitter** — understand this deeply and the rest of noise follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Power electronics and regulation**, builds directly on these ideas. Regulators and Power supplies extend what you've learned here into power electronics and regulation.
