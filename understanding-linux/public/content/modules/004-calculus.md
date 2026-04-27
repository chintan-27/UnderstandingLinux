---
id: 4
title: "Calculus"
part: "I"
supermoduleId: 1
estimatedMinutes: 60
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
# Calculus

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Calculus** sits within Math for Physical Computing (Supermodule 1). This module covers 7 interconnected topics: limits, derivatives, integrals, partial derivatives, multivariable calculus, Taylor expansion, ordinary differential equations. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Limits

**Limits** is a foundational concept within calculus. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding limits allows you to reason about system behavior rather than treating it as a black box.

### Derivatives

**Derivatives** is a foundational concept within calculus. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding derivatives allows you to reason about system behavior rather than treating it as a black box.

### Integrals

**Integrals** is a foundational concept within calculus. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding integrals allows you to reason about system behavior rather than treating it as a black box.

### Partial derivatives

**Partial derivatives** is a foundational concept within calculus. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding partial derivatives allows you to reason about system behavior rather than treating it as a black box.

### Multivariable calculus

**Multivariable calculus** is a foundational concept within calculus. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding multivariable calculus allows you to reason about system behavior rather than treating it as a black box.

### Taylor expansion

**Taylor expansion** is a foundational concept within calculus. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding Taylor expansion allows you to reason about system behavior rather than treating it as a black box.

### Ordinary differential equations

**Ordinary differential equations** is a foundational concept within calculus. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding ordinary differential equations allows you to reason about system behavior rather than treating it as a black box.

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

- **Limits** — understand this deeply and the rest of calculus follows naturally.
- **Derivatives** — understand this deeply and the rest of calculus follows naturally.
- **Integrals** — understand this deeply and the rest of calculus follows naturally.
- **Partial derivatives** — understand this deeply and the rest of calculus follows naturally.
- **Multivariable calculus** — understand this deeply and the rest of calculus follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Linear algebra**, builds directly on these ideas. Vectors and Matrices extend what you've learned here into linear algebra.
