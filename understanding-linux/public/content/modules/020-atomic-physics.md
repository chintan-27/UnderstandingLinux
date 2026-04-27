---
id: 20
title: "Atomic physics"
part: "II"
supermoduleId: 2
estimatedMinutes: 50
resources:
  - type: book
    title: "The Art of Electronics (Horowitz & Hill)"
    url: "https://artofelectronics.net/"
  - type: video
    title: "MIT 8.02 — Electricity and Magnetism"
    url: "https://ocw.mit.edu/courses/8-02-physics-ii-electricity-and-magnetism-spring-2007/"
  - type: article
    title: "All About Circuits"
    url: "https://www.allaboutcircuits.com/"
---
# Atomic physics

## Why This Matters

Computers are physical machines. Electrons flow through silicon, light pulses carry data through fiber, and thermodynamics limits every design.

**Atomic physics** sits within Physics and Chemistry of Computing (Supermodule 2). This module covers 4 interconnected topics: atomic structure, electron shells, quantization, energy levels. Each builds on the previous, forming a coherent picture of how physics and chemistry of computing works at this level.

## Core Concepts

### Atomic structure

**Atomic structure** is a foundational concept within atomic physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding atomic structure allows you to reason about system behavior rather than treating it as a black box.

### Electron shells

**Electron shells** is a foundational concept within atomic physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding electron shells allows you to reason about system behavior rather than treating it as a black box.

### Quantization

**Quantization** is a foundational concept within atomic physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding quantization allows you to reason about system behavior rather than treating it as a black box.

### Energy levels

**Energy levels** is a foundational concept within atomic physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding energy levels allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```python
# Dimensional analysis example
bandwidth_gbps = 10          # 10 Gbit/s link
packet_size_bytes = 1500     # standard MTU
bits_per_packet = packet_size_bytes * 8
packets_per_sec = (bandwidth_gbps * 1e9) / bits_per_packet
print(f"{packets_per_sec:,.0f} packets/sec at line rate")
```

## Key Insights

- **Atomic structure** — understand this deeply and the rest of atomic physics follows naturally.
- **Electron shells** — understand this deeply and the rest of atomic physics follows naturally.
- **Quantization** — understand this deeply and the rest of atomic physics follows naturally.
- **Energy levels** — understand this deeply and the rest of atomic physics follows naturally.
- Think in terms of trade-offs: every design choice in physics and chemistry of computing sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Quantum mechanics foundations**, builds directly on these ideas. Wavefunctions at an intuitive level and Quantized states extend what you've learned here into quantum mechanics foundations.
