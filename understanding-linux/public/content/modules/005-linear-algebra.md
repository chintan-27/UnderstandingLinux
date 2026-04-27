---
id: 5
title: "Linear algebra"
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
# Linear algebra

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Linear algebra** sits within Math for Physical Computing (Supermodule 1). This module covers 7 interconnected topics: vectors, matrices, linear transformations, rank, eigenvalues, diagonalization, orthogonality. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Vectors

**Vectors** is a foundational concept within linear algebra. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding vectors allows you to reason about system behavior rather than treating it as a black box.

### Matrices

**Matrices** is a foundational concept within linear algebra. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding matrices allows you to reason about system behavior rather than treating it as a black box.

### Linear transformations

**Linear transformations** is a foundational concept within linear algebra. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding linear transformations allows you to reason about system behavior rather than treating it as a black box.

### Rank

**Rank** is a foundational concept within linear algebra. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding rank allows you to reason about system behavior rather than treating it as a black box.

### Eigenvalues

**Eigenvalues** is a foundational concept within linear algebra. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding eigenvalues allows you to reason about system behavior rather than treating it as a black box.

### Diagonalization

**Diagonalization** is a foundational concept within linear algebra. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding diagonalization allows you to reason about system behavior rather than treating it as a black box.

### Orthogonality

**Orthogonality** is a foundational concept within linear algebra. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding orthogonality allows you to reason about system behavior rather than treating it as a black box.

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

- **Vectors** — understand this deeply and the rest of linear algebra follows naturally.
- **Matrices** — understand this deeply and the rest of linear algebra follows naturally.
- **Linear transformations** — understand this deeply and the rest of linear algebra follows naturally.
- **Rank** — understand this deeply and the rest of linear algebra follows naturally.
- **Eigenvalues** — understand this deeply and the rest of linear algebra follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Probability**, builds directly on these ideas. Random variables and Expectation extend what you've learned here into probability.
