---
id: 15
title: "Logic and formal methods"
part: "I"
supermoduleId: 1
estimatedMinutes: 50
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
# Logic and formal methods

## Why This Matters

Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.

**Logic and formal methods** sits within Math for Physical Computing (Supermodule 1). This module covers 4 interconnected topics: propositional logic, predicate logic, SAT/SMT intuition, model checking basics. Each builds on the previous, forming a coherent picture of how mathematics works at this level.

## Core Concepts

### Propositional logic

**Propositional logic** is a foundational concept within logic and formal methods. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding propositional logic allows you to reason about system behavior rather than treating it as a black box.

### Predicate logic

**Predicate logic** is a foundational concept within logic and formal methods. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding predicate logic allows you to reason about system behavior rather than treating it as a black box.

### SAT/SMT intuition

**SAT/SMT intuition** is a foundational concept within logic and formal methods. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding SAT/SMT intuition allows you to reason about system behavior rather than treating it as a black box.

### Model checking basics

**Model checking basics** is a foundational concept within logic and formal methods. This concept appears throughout mathematics and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities. In practice, understanding model checking basics allows you to reason about system behavior rather than treating it as a black box.

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

- **Propositional logic** — understand this deeply and the rest of logic and formal methods follows naturally.
- **Predicate logic** — understand this deeply and the rest of logic and formal methods follows naturally.
- **SAT/SMT intuition** — understand this deeply and the rest of logic and formal methods follows naturally.
- **Model checking basics** — understand this deeply and the rest of logic and formal methods follows naturally.
- Think in terms of trade-offs: every design choice in mathematics sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Classical mechanics basics**, builds directly on these ideas. Force and Energy extend what you've learned here into classical mechanics basics.
