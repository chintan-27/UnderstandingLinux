---
id: 6
title: "Probability"
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
# Probability

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Probability** sits within Math for Physical Computing (Supermodule 1). This module covers 7 interconnected topics: random variables, expectation, variance, distributions, independence, conditional probability, Bayes. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Random variables

**Random variables** is a foundational concept within probability. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding random variables allows you to reason about system behavior rather than treating it as a black box.

### Expectation

**Expectation** is a foundational concept within probability. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding expectation allows you to reason about system behavior rather than treating it as a black box.

### Variance

**Variance** is a foundational concept within probability. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding variance allows you to reason about system behavior rather than treating it as a black box.

### Distributions

**Distributions** is a foundational concept within probability. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding distributions allows you to reason about system behavior rather than treating it as a black box.

### Independence

**Independence** is a foundational concept within probability. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding independence allows you to reason about system behavior rather than treating it as a black box.

### Conditional probability

**Conditional probability** is a foundational concept within probability. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding conditional probability allows you to reason about system behavior rather than treating it as a black box.

### Bayes

**Bayes** is a foundational concept within probability. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding Bayes allows you to reason about system behavior rather than treating it as a black box.

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

- **Random variables** — understand this deeply and the rest of probability follows naturally.
- **Expectation** — understand this deeply and the rest of probability follows naturally.
- **Variance** — understand this deeply and the rest of probability follows naturally.
- **Distributions** — understand this deeply and the rest of probability follows naturally.
- **Independence** — understand this deeply and the rest of probability follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Statistics**, builds directly on these ideas. Estimation and Sampling extend what you've learned here into statistics.
