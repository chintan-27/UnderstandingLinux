---
id: 8
title: "Discrete mathematics"
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
# Discrete mathematics

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Discrete mathematics** sits within Math for Physical Computing (Supermodule 1). This module covers 10 interconnected topics: logic, proof, induction, sets, relations, functions, combinatorics, graphs, trees, recurrences. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Logic

**Logic** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding logic allows you to reason about system behavior rather than treating it as a black box.

### Proof

**Proof** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding proof allows you to reason about system behavior rather than treating it as a black box.

### Induction

**Induction** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding induction allows you to reason about system behavior rather than treating it as a black box.

### Sets

**Sets** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding sets allows you to reason about system behavior rather than treating it as a black box.

### Relations

**Relations** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding relations allows you to reason about system behavior rather than treating it as a black box.

### Functions

**Functions** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding functions allows you to reason about system behavior rather than treating it as a black box.

### Combinatorics

**Combinatorics** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding combinatorics allows you to reason about system behavior rather than treating it as a black box.

### Graphs

**Graphs** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding graphs allows you to reason about system behavior rather than treating it as a black box.

### Trees

**Trees** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding trees allows you to reason about system behavior rather than treating it as a black box.

### Recurrences

**Recurrences** is a foundational concept within discrete mathematics. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding recurrences allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```python
import math

# How many bits to represent N values?
N = 1_000_000
bits_needed = math.ceil(math.log2(N))  # 20 bits
print(f"{N} values need {bits_needed} bits")

# Powers of 2 vs powers of 10
for k in [10, 20, 30, 40]:
    print(f"2^{k} = {2**k:>15,}  ≈ 10^{k*0.301:.0f}")
```

## Key Insights

- **Logic** — understand this deeply and the rest of discrete mathematics follows naturally.
- **Proof** — understand this deeply and the rest of discrete mathematics follows naturally.
- **Induction** — understand this deeply and the rest of discrete mathematics follows naturally.
- **Sets** — understand this deeply and the rest of discrete mathematics follows naturally.
- **Relations** — understand this deeply and the rest of discrete mathematics follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Information theory**, builds directly on these ideas. Entropy and Coding extend what you've learned here into information theory.
