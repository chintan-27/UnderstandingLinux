---
id: 1
title: "Basic algebra and quantitative reasoning"
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
# Basic algebra and quantitative reasoning

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Basic algebra and quantitative reasoning** sits within Math for Physical Computing (Supermodule 1). This module covers 9 interconnected topics: equations, inequalities, exponents, logarithms, scientific notation, ratios, dimensional analysis, unit conversion, orders of magnitude. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Equations

**Equations** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding equations allows you to reason about system behavior rather than treating it as a black box.

### Inequalities

**Inequalities** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding inequalities allows you to reason about system behavior rather than treating it as a black box.

### Exponents

**Exponents** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding exponents allows you to reason about system behavior rather than treating it as a black box.

### Logarithms

**Logarithms** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding logarithms allows you to reason about system behavior rather than treating it as a black box.

### Scientific notation

**Scientific notation** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding scientific notation allows you to reason about system behavior rather than treating it as a black box.

### Ratios

**Ratios** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding ratios allows you to reason about system behavior rather than treating it as a black box.

### Dimensional analysis

**Dimensional analysis** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding dimensional analysis allows you to reason about system behavior rather than treating it as a black box.

### Unit conversion

**Unit conversion** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding unit conversion allows you to reason about system behavior rather than treating it as a black box.

### Orders of magnitude

**Orders of magnitude** is a foundational concept within basic algebra and quantitative reasoning. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding orders of magnitude allows you to reason about system behavior rather than treating it as a black box.

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

- **Equations** — understand this deeply and the rest of basic algebra and quantitative reasoning follows naturally.
- **Inequalities** — understand this deeply and the rest of basic algebra and quantitative reasoning follows naturally.
- **Exponents** — understand this deeply and the rest of basic algebra and quantitative reasoning follows naturally.
- **Logarithms** — understand this deeply and the rest of basic algebra and quantitative reasoning follows naturally.
- **Scientific notation** — understand this deeply and the rest of basic algebra and quantitative reasoning follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Trigonometry**, builds directly on these ideas. Sinusoids and Phase extend what you've learned here into trigonometry.
