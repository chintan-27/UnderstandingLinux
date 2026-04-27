---
id: 24
title: "Solid-state physics"
part: "II"
supermoduleId: 2
estimatedMinutes: 60
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
# Solid-state physics

## Why This Matters

Computers are physical machines. Electrons flow through silicon, light pulses carry data through fiber, and thermodynamics limits every design.

**Solid-state physics** sits within Physics and Chemistry of Computing (Supermodule 2). This module covers 7 interconnected topics: bands, band gaps, Fermi level, carriers, mobility, recombination, scattering. Each builds on the previous, forming a coherent picture of how physics and chemistry of computing works at this level.

## Core Concepts

### Bands

**Bands** is a foundational concept within solid-state physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding bands allows you to reason about system behavior rather than treating it as a black box.

### Band gaps

**Band gaps** is a foundational concept within solid-state physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding band gaps allows you to reason about system behavior rather than treating it as a black box.

### Fermi level

**Fermi level** is a foundational concept within solid-state physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding Fermi level allows you to reason about system behavior rather than treating it as a black box.

### Carriers

**Carriers** is a foundational concept within solid-state physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding carriers allows you to reason about system behavior rather than treating it as a black box.

### Mobility

**Mobility** is a foundational concept within solid-state physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding mobility allows you to reason about system behavior rather than treating it as a black box.

### Recombination

**Recombination** is a foundational concept within solid-state physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding recombination allows you to reason about system behavior rather than treating it as a black box.

### Scattering

**Scattering** is a foundational concept within solid-state physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding scattering allows you to reason about system behavior rather than treating it as a black box.

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

- **Bands** — understand this deeply and the rest of solid-state physics follows naturally.
- **Band gaps** — understand this deeply and the rest of solid-state physics follows naturally.
- **Fermi level** — understand this deeply and the rest of solid-state physics follows naturally.
- **Carriers** — understand this deeply and the rest of solid-state physics follows naturally.
- **Mobility** — understand this deeply and the rest of solid-state physics follows naturally.
- Think in terms of trade-offs: every design choice in physics and chemistry of computing sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Semiconductor physics**, builds directly on these ideas. Intrinsic/extrinsic semiconductors and Doping extend what you've learned here into semiconductor physics.
