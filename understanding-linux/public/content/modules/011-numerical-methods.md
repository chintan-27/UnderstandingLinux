---
id: 11
title: "Numerical methods"
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
# Numerical methods

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Numerical methods** sits within Math for Physical Computing (Supermodule 1). This module covers 4 interconnected topics: approximation, floating-point error, stability, iterative methods. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Approximation

**Approximation** is a foundational concept within numerical methods. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding approximation allows you to reason about system behavior rather than treating it as a black box.

### Floating-point error

**Floating-point error** is a foundational concept within numerical methods. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding floating-point error allows you to reason about system behavior rather than treating it as a black box.

### Stability

**Stability** is a foundational concept within numerical methods. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding stability allows you to reason about system behavior rather than treating it as a black box.

### Iterative methods

**Iterative methods** is a foundational concept within numerical methods. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding iterative methods allows you to reason about system behavior rather than treating it as a black box.

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

- **Approximation** — understand this deeply and the rest of numerical methods follows naturally.
- **Floating-point error** — understand this deeply and the rest of numerical methods follows naturally.
- **Stability** — understand this deeply and the rest of numerical methods follows naturally.
- **Iterative methods** — understand this deeply and the rest of numerical methods follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Queueing theory**, builds directly on these ideas. Arrivals and Service rates extend what you've learned here into queueing theory.
