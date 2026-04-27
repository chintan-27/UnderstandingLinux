---
id: 2
title: "Trigonometry"
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
# Trigonometry

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Trigonometry** sits within Math for Physical Computing (Supermodule 1). This module covers 6 interconnected topics: sinusoids, phase, frequency, amplitude, polar form, oscillations. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Sinusoids

**Sinusoids** is a foundational concept within trigonometry. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding sinusoids allows you to reason about system behavior rather than treating it as a black box.

### Phase

**Phase** is a foundational concept within trigonometry. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding phase allows you to reason about system behavior rather than treating it as a black box.

### Frequency

**Frequency** is a foundational concept within trigonometry. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding frequency allows you to reason about system behavior rather than treating it as a black box.

### Amplitude

**Amplitude** is a foundational concept within trigonometry. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding amplitude allows you to reason about system behavior rather than treating it as a black box.

### Polar form

**Polar form** is a foundational concept within trigonometry. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding polar form allows you to reason about system behavior rather than treating it as a black box.

### Oscillations

**Oscillations** is a foundational concept within trigonometry. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding oscillations allows you to reason about system behavior rather than treating it as a black box.

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

- **Sinusoids** — understand this deeply and the rest of trigonometry follows naturally.
- **Phase** — understand this deeply and the rest of trigonometry follows naturally.
- **Frequency** — understand this deeply and the rest of trigonometry follows naturally.
- **Amplitude** — understand this deeply and the rest of trigonometry follows naturally.
- **Polar form** — understand this deeply and the rest of trigonometry follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Complex numbers**, builds directly on these ideas. Real/imaginary parts and Euler’s formula extend what you've learned here into complex numbers.
