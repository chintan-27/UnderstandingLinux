---
id: 32
title: "Analog signals"
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
# Analog signals

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Analog signals** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 4 interconnected topics: waveforms, frequency domain, bandwidth, filtering basics. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Waveforms

**Waveforms** is a foundational concept within analog signals. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding waveforms allows you to reason about system behavior rather than treating it as a black box.

### Frequency domain

**Frequency domain** is a foundational concept within analog signals. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding frequency domain allows you to reason about system behavior rather than treating it as a black box.

### Bandwidth

**Bandwidth** is a foundational concept within analog signals. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding bandwidth allows you to reason about system behavior rather than treating it as a black box.

### Filtering basics

**Filtering basics** is a foundational concept within analog signals. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding filtering basics allows you to reason about system behavior rather than treating it as a black box.

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

- **Waveforms** — understand this deeply and the rest of analog signals follows naturally.
- **Frequency domain** — understand this deeply and the rest of analog signals follows naturally.
- **Bandwidth** — understand this deeply and the rest of analog signals follows naturally.
- **Filtering basics** — understand this deeply and the rest of analog signals follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Devices**, builds directly on these ideas. Resistors and Capacitors extend what you've learned here into devices.
