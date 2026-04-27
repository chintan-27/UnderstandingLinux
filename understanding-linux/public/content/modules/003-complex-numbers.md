---
id: 3
title: "Complex numbers"
part: "I"
supermoduleId: 1
estimatedMinutes: 50
resources:
  - type: book
    title: "Art of Problem Solving"
    url: "https://artofproblemsolving.com/"
  - type: article
    title: "Khan Academy"
    url: "https://www.khanacademy.org/math"
  - type: article
    title: "Better Explained"
    url: "https://betterexplained.com/"
---
# Complex numbers

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Complex numbers** sits within Math for Physical Computing (Supermodule 1). This module covers 4 interconnected topics: real/imaginary parts, Euler’s formula, phasors, impedance intuition. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Real/imaginary parts

**Real/imaginary parts** is a foundational concept within complex numbers. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding real/imaginary parts allows you to reason about system behavior rather than treating it as a black box.

### Euler’s formula

**Euler’s formula** is a foundational concept within complex numbers. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding Euler’s formula allows you to reason about system behavior rather than treating it as a black box.

### Phasors

**Phasors** is a foundational concept within complex numbers. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding phasors allows you to reason about system behavior rather than treating it as a black box.

### Impedance intuition

**Impedance intuition** is a foundational concept within complex numbers. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding impedance intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Real/imaginary parts** — understand this deeply and the rest of complex numbers follows naturally.
- **Euler’s formula** — understand this deeply and the rest of complex numbers follows naturally.
- **Phasors** — understand this deeply and the rest of complex numbers follows naturally.
- **Impedance intuition** — understand this deeply and the rest of complex numbers follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Calculus**, builds directly on these ideas. Limits and Derivatives extend what you've learned here into calculus.
