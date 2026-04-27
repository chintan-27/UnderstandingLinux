---
id: 27
title: "Reliability physics"
part: "II"
supermoduleId: 2
estimatedMinutes: 55
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
# Reliability physics

## Why This Matters

Computers are physical machines. Electrons flow through silicon, light pulses carry data through fiber, and thermodynamics limits every design.

**Reliability physics** sits within Physics and Chemistry of Computing (Supermodule 2). This module covers 5 interconnected topics: electromigration, dielectric breakdown, thermal cycling, aging, failure distributions. Each builds on the previous, forming a coherent picture of how physics and chemistry of computing works at this level.

## Core Concepts

### Electromigration

**Electromigration** is a foundational concept within reliability physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding electromigration allows you to reason about system behavior rather than treating it as a black box.

### Dielectric breakdown

**Dielectric breakdown** is a foundational concept within reliability physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding dielectric breakdown allows you to reason about system behavior rather than treating it as a black box.

### Thermal cycling

**Thermal cycling** is a foundational concept within reliability physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding thermal cycling allows you to reason about system behavior rather than treating it as a black box.

### Aging

**Aging** is a foundational concept within reliability physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding aging allows you to reason about system behavior rather than treating it as a black box.

### Failure distributions

**Failure distributions** is a foundational concept within reliability physics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding failure distributions allows you to reason about system behavior rather than treating it as a black box.

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

- **Electromigration** — understand this deeply and the rest of reliability physics follows naturally.
- **Dielectric breakdown** — understand this deeply and the rest of reliability physics follows naturally.
- **Thermal cycling** — understand this deeply and the rest of reliability physics follows naturally.
- **Aging** — understand this deeply and the rest of reliability physics follows naturally.
- **Failure distributions** — understand this deeply and the rest of reliability physics follows naturally.
- Think in terms of trade-offs: every design choice in physics and chemistry of computing sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Basic electrical quantities**, builds directly on these ideas. Charge and Current extend what you've learned here into basic electrical quantities.
