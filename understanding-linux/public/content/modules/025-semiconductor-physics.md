---
id: 25
title: "Semiconductor physics"
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
# Semiconductor physics

## Why This Matters

Computers are physical machines. Electrons flow through silicon, light pulses carry data through fiber, and thermodynamics limits every design.

**Semiconductor physics** sits within Physics and Chemistry of Computing (Supermodule 2). This module covers 6 interconnected topics: intrinsic/extrinsic semiconductors, doping, drift, diffusion, p-n junctions, depletion regions. Each builds on the previous, forming a coherent picture of how physics and chemistry of computing works at this level.

## Core Concepts

### Intrinsic/extrinsic semiconductors

**Intrinsic/extrinsic semiconductors** is a foundational concept within semiconductor physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding intrinsic/extrinsic semiconductors allows you to reason about system behavior rather than treating it as a black box.

### Doping

**Doping** is a foundational concept within semiconductor physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding doping allows you to reason about system behavior rather than treating it as a black box.

### Drift

**Drift** is a foundational concept within semiconductor physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding drift allows you to reason about system behavior rather than treating it as a black box.

### Diffusion

**Diffusion** is a foundational concept within semiconductor physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding diffusion allows you to reason about system behavior rather than treating it as a black box.

### P-n junctions

**P-n junctions** is a foundational concept within semiconductor physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding p-n junctions allows you to reason about system behavior rather than treating it as a black box.

### Depletion regions

**Depletion regions** is a foundational concept within semiconductor physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding depletion regions allows you to reason about system behavior rather than treating it as a black box.

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

- **Intrinsic/extrinsic semiconductors** — understand this deeply and the rest of semiconductor physics follows naturally.
- **Doping** — understand this deeply and the rest of semiconductor physics follows naturally.
- **Drift** — understand this deeply and the rest of semiconductor physics follows naturally.
- **Diffusion** — understand this deeply and the rest of semiconductor physics follows naturally.
- **P-n junctions** — understand this deeply and the rest of semiconductor physics follows naturally.
- Think in terms of trade-offs: every design choice in physics and chemistry of computing sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Semiconductor manufacturing**, builds directly on these ideas. Silicon purification and Ingot growth extend what you've learned here into semiconductor manufacturing.
