---
id: 18
title: "Thermodynamics"
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
# Thermodynamics

## Why This Matters

Computers are physical machines. Electrons flow through silicon, light pulses carry data through fiber, and thermodynamics limits every design.

**Thermodynamics** sits within Physics and Chemistry of Computing (Supermodule 2). This module covers 6 interconnected topics: temperature, heat, entropy, energy transfer, dissipation, cooling relevance. Each builds on the previous, forming a coherent picture of how physics and chemistry of computing works at this level.

## Core Concepts

### Temperature

**Temperature** is a foundational concept within thermodynamics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding temperature allows you to reason about system behavior rather than treating it as a black box.

### Heat

**Heat** is a foundational concept within thermodynamics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding heat allows you to reason about system behavior rather than treating it as a black box.

### Entropy

**Entropy** is a foundational concept within thermodynamics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding entropy allows you to reason about system behavior rather than treating it as a black box.

### Energy transfer

**Energy transfer** is a foundational concept within thermodynamics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding energy transfer allows you to reason about system behavior rather than treating it as a black box.

### Dissipation

**Dissipation** is a foundational concept within thermodynamics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding dissipation allows you to reason about system behavior rather than treating it as a black box.

### Cooling relevance

**Cooling relevance** is a foundational concept within thermodynamics. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding cooling relevance allows you to reason about system behavior rather than treating it as a black box.

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

- **Temperature** — understand this deeply and the rest of thermodynamics follows naturally.
- **Heat** — understand this deeply and the rest of thermodynamics follows naturally.
- **Entropy** — understand this deeply and the rest of thermodynamics follows naturally.
- **Energy transfer** — understand this deeply and the rest of thermodynamics follows naturally.
- **Dissipation** — understand this deeply and the rest of thermodynamics follows naturally.
- Think in terms of trade-offs: every design choice in physics and chemistry of computing sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Statistical mechanics intuition**, builds directly on these ideas. Distributions and Thermal occupancy extend what you've learned here into statistical mechanics intuition.
