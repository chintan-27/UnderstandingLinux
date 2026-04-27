---
id: 12
title: "Queueing theory"
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
# Queueing theory

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Queueing theory** sits within Math for Physical Computing (Supermodule 1). This module covers 6 interconnected topics: arrivals, service rates, utilization, latency, throughput, bottleneck modeling. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Arrivals

**Arrivals** is a foundational concept within queueing theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding arrivals allows you to reason about system behavior rather than treating it as a black box.

### Service rates

**Service rates** is a foundational concept within queueing theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding service rates allows you to reason about system behavior rather than treating it as a black box.

### Utilization

**Utilization** is a foundational concept within queueing theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding utilization allows you to reason about system behavior rather than treating it as a black box.

### Latency

**Latency** is a foundational concept within queueing theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding latency allows you to reason about system behavior rather than treating it as a black box.

### Throughput

**Throughput** is a foundational concept within queueing theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding throughput allows you to reason about system behavior rather than treating it as a black box.

### Bottleneck modeling

**Bottleneck modeling** is a foundational concept within queueing theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding bottleneck modeling allows you to reason about system behavior rather than treating it as a black box.

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

- **Arrivals** — understand this deeply and the rest of queueing theory follows naturally.
- **Service rates** — understand this deeply and the rest of queueing theory follows naturally.
- **Utilization** — understand this deeply and the rest of queueing theory follows naturally.
- **Latency** — understand this deeply and the rest of queueing theory follows naturally.
- **Throughput** — understand this deeply and the rest of queueing theory follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Graph theory**, builds directly on these ideas. Shortest paths and Spanning trees extend what you've learned here into graph theory.
