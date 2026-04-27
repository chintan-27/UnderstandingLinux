---
id: 7
title: "Statistics"
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
# Statistics

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Statistics** sits within Math for Physical Computing (Supermodule 1). This module covers 6 interconnected topics: estimation, sampling, confidence intervals, regression, variance analysis, measurement error. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Estimation

**Estimation** is a foundational concept within statistics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding estimation allows you to reason about system behavior rather than treating it as a black box.

### Sampling

**Sampling** is a foundational concept within statistics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding sampling allows you to reason about system behavior rather than treating it as a black box.

### Confidence intervals

**Confidence intervals** is a foundational concept within statistics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding confidence intervals allows you to reason about system behavior rather than treating it as a black box.

### Regression

**Regression** is a foundational concept within statistics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding regression allows you to reason about system behavior rather than treating it as a black box.

### Variance analysis

**Variance analysis** is a foundational concept within statistics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding variance analysis allows you to reason about system behavior rather than treating it as a black box.

### Measurement error

**Measurement error** is a foundational concept within statistics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding measurement error allows you to reason about system behavior rather than treating it as a black box.

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

- **Estimation** — understand this deeply and the rest of statistics follows naturally.
- **Sampling** — understand this deeply and the rest of statistics follows naturally.
- **Confidence intervals** — understand this deeply and the rest of statistics follows naturally.
- **Regression** — understand this deeply and the rest of statistics follows naturally.
- **Variance analysis** — understand this deeply and the rest of statistics follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Discrete mathematics**, builds directly on these ideas. Logic and Proof extend what you've learned here into discrete mathematics.
