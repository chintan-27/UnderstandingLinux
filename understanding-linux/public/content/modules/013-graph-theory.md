---
id: 13
title: "Graph theory"
part: "I"
supermoduleId: 1
estimatedMinutes: 55
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
# Graph theory

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Graph theory** sits within Math for Physical Computing (Supermodule 1). This module covers 5 interconnected topics: shortest paths, spanning trees, flows, cuts, routing relevance. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Shortest paths

**Shortest paths** is a foundational concept within graph theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding shortest paths allows you to reason about system behavior rather than treating it as a black box.

### Spanning trees

**Spanning trees** is a foundational concept within graph theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding spanning trees allows you to reason about system behavior rather than treating it as a black box.

### Flows

**Flows** is a foundational concept within graph theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding flows allows you to reason about system behavior rather than treating it as a black box.

### Cuts

**Cuts** is a foundational concept within graph theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding cuts allows you to reason about system behavior rather than treating it as a black box.

### Routing relevance

**Routing relevance** is a foundational concept within graph theory. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding routing relevance allows you to reason about system behavior rather than treating it as a black box.

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

- **Shortest paths** — understand this deeply and the rest of graph theory follows naturally.
- **Spanning trees** — understand this deeply and the rest of graph theory follows naturally.
- **Flows** — understand this deeply and the rest of graph theory follows naturally.
- **Cuts** — understand this deeply and the rest of graph theory follows naturally.
- **Routing relevance** — understand this deeply and the rest of graph theory follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Formal languages and automata math**, builds directly on these ideas. Grammars and Regular languages extend what you've learned here into formal languages and automata math.
