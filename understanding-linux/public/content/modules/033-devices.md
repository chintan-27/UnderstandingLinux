---
id: 33
title: "Devices"
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
# Devices

## Why This Matters

Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.

**Devices** sits within Electricity, Electronics, and Signals (Supermodule 3). This module covers 8 interconnected topics: resistors, capacitors, inductors, diodes, BJTs, MOSFETs, sensors, oscillators. Each builds on the previous, forming a coherent picture of how circuits and analog electronics works at this level.

## Core Concepts

### Resistors

**Resistors** is a foundational concept within devices. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding resistors allows you to reason about system behavior rather than treating it as a black box.

### Capacitors

**Capacitors** is a foundational concept within devices. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding capacitors allows you to reason about system behavior rather than treating it as a black box.

### Inductors

**Inductors** is a foundational concept within devices. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding inductors allows you to reason about system behavior rather than treating it as a black box.

### Diodes

**Diodes** is a foundational concept within devices. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding diodes allows you to reason about system behavior rather than treating it as a black box.

### BJTs

**BJTs** is a foundational concept within devices. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding BJTs allows you to reason about system behavior rather than treating it as a black box.

### MOSFETs

**MOSFETs** is a foundational concept within devices. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding MOSFETs allows you to reason about system behavior rather than treating it as a black box.

### Sensors

**Sensors** is a foundational concept within devices. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding sensors allows you to reason about system behavior rather than treating it as a black box.

### Oscillators

**Oscillators** is a foundational concept within devices. At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints. In practice, understanding oscillators allows you to reason about system behavior rather than treating it as a black box.

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

- **Resistors** — understand this deeply and the rest of devices follows naturally.
- **Capacitors** — understand this deeply and the rest of devices follows naturally.
- **Inductors** — understand this deeply and the rest of devices follows naturally.
- **Diodes** — understand this deeply and the rest of devices follows naturally.
- **BJTs** — understand this deeply and the rest of devices follows naturally.
- Think in terms of trade-offs: every design choice in circuits and analog electronics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Amplifiers and analog basics**, builds directly on these ideas. Gain and Biasing extend what you've learned here into amplifiers and analog basics.
