---
id: 23
title: "Materials science"
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
# Materials science

## Why This Matters

Computers are physical machines. Electrons flow through silicon, light pulses carry data through fiber, and thermodynamics limits every design.

**Materials science** sits within Physics and Chemistry of Computing (Supermodule 2). This module covers 6 interconnected topics: crystal structures, defects, grain boundaries, stress, diffusion, phase behavior. Each builds on the previous, forming a coherent picture of how physics and chemistry of computing works at this level.

## Core Concepts

### Crystal structures

**Crystal structures** is a foundational concept within materials science. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding crystal structures allows you to reason about system behavior rather than treating it as a black box.

### Defects

**Defects** is a foundational concept within materials science. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding defects allows you to reason about system behavior rather than treating it as a black box.

### Grain boundaries

**Grain boundaries** is a foundational concept within materials science. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding grain boundaries allows you to reason about system behavior rather than treating it as a black box.

### Stress

**Stress** is a foundational concept within materials science. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding stress allows you to reason about system behavior rather than treating it as a black box.

### Diffusion

**Diffusion** is a foundational concept within materials science. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding diffusion allows you to reason about system behavior rather than treating it as a black box.

### Phase behavior

**Phase behavior** is a foundational concept within materials science. This concept appears throughout physics and chemistry of computing and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding phase behavior allows you to reason about system behavior rather than treating it as a black box.

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

- **Crystal structures** — understand this deeply and the rest of materials science follows naturally.
- **Defects** — understand this deeply and the rest of materials science follows naturally.
- **Grain boundaries** — understand this deeply and the rest of materials science follows naturally.
- **Stress** — understand this deeply and the rest of materials science follows naturally.
- **Diffusion** — understand this deeply and the rest of materials science follows naturally.
- Think in terms of trade-offs: every design choice in physics and chemistry of computing sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Solid-state physics**, builds directly on these ideas. Bands and Band gaps extend what you've learned here into solid-state physics.
