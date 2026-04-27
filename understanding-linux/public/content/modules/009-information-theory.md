---
id: 9
title: "Information theory"
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
# Information theory

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Information theory** sits within Math for Physical Computing (Supermodule 1). This module covers 6 interconnected topics: entropy, coding, noise, redundancy, channel capacity, compression intuition. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Entropy

**Entropy** is a foundational concept within information theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding entropy allows you to reason about system behavior rather than treating it as a black box.

### Coding

**Coding** is a foundational concept within information theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding coding allows you to reason about system behavior rather than treating it as a black box.

### Noise

**Noise** is a foundational concept within information theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding noise allows you to reason about system behavior rather than treating it as a black box.

### Redundancy

**Redundancy** is a foundational concept within information theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding redundancy allows you to reason about system behavior rather than treating it as a black box.

### Channel capacity

**Channel capacity** is a foundational concept within information theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding channel capacity allows you to reason about system behavior rather than treating it as a black box.

### Compression intuition

**Compression intuition** is a foundational concept within information theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding compression intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Entropy** — understand this deeply and the rest of information theory follows naturally.
- **Coding** — understand this deeply and the rest of information theory follows naturally.
- **Noise** — understand this deeply and the rest of information theory follows naturally.
- **Redundancy** — understand this deeply and the rest of information theory follows naturally.
- **Channel capacity** — understand this deeply and the rest of information theory follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Optimization**, builds directly on these ideas. Constrained optimization and Convexity intuition extend what you've learned here into optimization.
