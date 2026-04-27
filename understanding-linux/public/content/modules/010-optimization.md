---
id: 10
title: "Optimization"
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
# Optimization

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Optimization** sits within Math for Physical Computing (Supermodule 1). This module covers 4 interconnected topics: constrained optimization, convexity intuition, objective functions, local vs global minima. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Constrained optimization

**Constrained optimization** is a foundational concept within optimization. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding constrained optimization allows you to reason about system behavior rather than treating it as a black box.

### Convexity intuition

**Convexity intuition** is a foundational concept within optimization. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding convexity intuition allows you to reason about system behavior rather than treating it as a black box.

### Objective functions

**Objective functions** is a foundational concept within optimization. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding objective functions allows you to reason about system behavior rather than treating it as a black box.

### Local vs global minima

**Local vs global minima** is a foundational concept within optimization. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding local vs global minima allows you to reason about system behavior rather than treating it as a black box.

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

- **Constrained optimization** — understand this deeply and the rest of optimization follows naturally.
- **Convexity intuition** — understand this deeply and the rest of optimization follows naturally.
- **Objective functions** — understand this deeply and the rest of optimization follows naturally.
- **Local vs global minima** — understand this deeply and the rest of optimization follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Numerical methods**, builds directly on these ideas. Approximation and Floating-point error extend what you've learned here into numerical methods.
