---
id: 39
title: "Boolean algebra"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Why This Matters

Every branch instruction a CPU executes is a Boolean decision. Every bitwise mask the Linux kernel applies to flags, every conditional in a compiler's intermediate representation, every logic gate in an ALU — all reduce to the same three operations: AND, OR, NOT. Boolean algebra is the formal system that lets you prove two expressions compute the same function, minimize the gate count of a circuit, and reason about correctness without simulation. Without it, you cannot optimize a conditional expression, verify a hardware description, or understand why `gcc -O2` rewrites your `if` chains. These are not abstract concerns: the kernel's `include/linux/types.h` is full of bitmask operations that only make sense if you understand the underlying algebra.

---

## Core Concepts

### Variables, Literals, and Functional Completeness

A Boolean variable takes values in $\{0, 1\}$. A **literal** is a variable or its complement: $A$ or $\bar{A}$. The three primitive operations are:

- **AND** ($A \cdot B$, written $AB$): $1$ iff both inputs are $1$
- **OR** ($A + B$): $1$ iff at least one input is $1$
- **NOT** ($\bar{A}$): flips $0 \leftrightarrow 1$

These three are **functionally complete**: every function $f: \{0,1\}^n \to \{0,1\}$ is expressible using only AND, OR, NOT. You can verify this constructively — given any truth table, SOP form (below) builds the function mechanically from literals and these operators alone.

In hardware, NAND alone is also functionally complete, which is why most real logic families are built from NAND gates rather than AND/OR/NOT separately.

### Truth Tables as Ground Truth

For $n$ variables there are $2^n$ input combinations, so a truth table has $2^n$ rows and defines the function completely. Two Boolean expressions are equivalent **if and only if** their truth tables are identical — this is the definition of equivalence, not a test for it. Algebraic simplification preserves equivalence only because each theorem has been proven by exhaustive truth table verification at some point.

| $A$ | $B$ | $AB$ | $A + B$ | $\overline{AB}$ | $\bar{A} + \bar{B}$ |
|-----|-----|------|---------|-----------------|----------------------|
| 0   | 0   | 0    | 0       | 1               | 1                    |
| 0   | 1   | 0    | 1       | 1               | 1                    |
| 1   | 0   | 0    | 1       | 1               | 1                    |
| 1   | 1   | 1    | 1       | 0               | 0                    |

The last two columns are identical — that is De Morgan's theorem as a truth table proof.

### Minterms and Canonical SOP Form

A **minterm** for $n$ variables is a product of all $n$ literals (each either true or complemented) that evaluates to $1$ for exactly one input row. For two variables, the four minterms are:

$$m_0 = \bar{A}\bar{B},\quad m_1 = \bar{A}B,\quad m_2 = A\bar{B},\quad m_3 = AB$$

The minterm index is the binary number formed by treating $1$ as the true literal and $0$ as the complemented literal. Minterm $m_5$ for three variables: $5 = 101_2$, so $A\bar{B}C$.

**Canonical sum-of-products (SOP)**: OR together exactly the minterms where the output is $1$:

$$Y = \sum m(i_1, i_2, \ldots)$$

This form is **canonical** — unique for a given function — because each minterm covers exactly one row. It enables mechanical comparison: two functions are identical iff their minterm sets are identical.

### Canonical POS Form

A **maxterm** $M_j$ is a sum of all $n$ literals that evaluates to $0$ for exactly one input row — the dual of a minterm. **Canonical product-of-sums (POS)** ANDs together the maxterms for every row where the output is $0$:

$$Y = \prod M(j_1, j_2, \ldots)$$

SOP covers the $1$s; POS covers the $0$s. They describe the same function. The minterm index and maxterm index for the same row are related: $M_j = \overline{m_j}$, which follows directly from De Morgan.

### Boolean Theorems

Each law is justified by exhaustive verification over $\{0,1\}$. The AND and OR forms are **duals** — swap AND $\leftrightarrow$ OR and $0 \leftrightarrow 1$, and every valid law produces another valid law. This is the **duality principle**, a structural property of the two-element Boolean algebra.

| Law | AND form | OR form |
|-----|----------|---------|
| Identity | $B \cdot 1 = B$ | $B + 0 = B$ |
| Null | $B \cdot 0 = 0$ | $B + 1 = 1$ |
| Idempotency | $BB = B$ | $B + B = B$ |
| Complement | $B\bar{B} = 0$ | $B + \bar{B} = 1$ |
| Involution | $\overline{\overline{B}} = B$ | — |
| Commutativity | $BC = CB$ | $B + C = C + B$ |
| Associativity | $(BC)D = B(CD)$ | $(B+C)+D = B+(C+D)$ |
| Distributivity | $B(C+D) = BC+BD$ | $B+CD = (B+C)(B+D)$ |
| Absorption | $B(B+C) = B$ | $B + BC = B$ |

The OR-distributive law $B + CD = (B+C)(B+D)$ surprises people because it has no analog in ordinary arithmetic. Verify it with a truth table if it seems wrong — it is correct.

### De Morgan's Theorem

$$\overline{AB} = \bar{A} + \bar{B}$$

$$\overline{A + B} = \bar{A} \cdot \bar{B}$$

These are the most practically important theorems because they convert between AND and OR under complementation. The hardware consequence: a NAND gate ($\overline{AB}$) is equivalent to an OR gate with inverted inputs ($\bar{A} + \bar{B}$). A NOR gate ($\overline{A+B}$) is equivalent to an AND gate with inverted inputs ($\bar{A}\bar{B}$).

**Bubble pushing**: in a logic diagram, an inversion bubble can be moved through a gate if you simultaneously flip AND $\leftrightarrow$ OR. This is not a mnemonic trick — it is a direct application of De Morgan. It lets you redraw circuits to align bubble outputs with bubble inputs, eliminating double inversions ($\overline{\overline{X}} = X$) and reducing gate count.

---

## How It Works

### Algebraic Simplification and the Combining Theorem

The central move in Boolean minimization is the **combining theorem**:

$$PA + P\bar{A} = P(A + \bar{A}) = P \cdot 1 = P$$

Two minterms that share all literals except one can be merged, and that variable disappears entirely. This is valid because a variable and its complement are exhaustive: one of them must be $1$, so $P$ is $1$ regardless of $A$.

**Example.** Given:

| $A$ | $B$ | $C$ | $Y$ |
|-----|-----|-----|-----|
| 0   | 0   | 0   | 1   |
| 0   | 0   | 1   | 0   |
| 0   | 1   | 0   | 0   |
| 0   | 1   | 1   | 0   |
| 1   | 0   | 0   | 1   |
| 1   | 0   | 1   | 1   |
| 1   | 1   | 0   | 0   |
| 1   | 1   | 1   | 0   |

Canonical SOP (rows 0, 4, 5):

$$Y = \bar{A}\bar{B}\bar{C} + A\bar{B}\bar{C} + A\bar{B}C$$

Combine $m_0$ and $m_4$ (differ in $A$, both have $\bar{B}\bar{C}$):

$$\bar{A}\bar{B}\bar{C} + A\bar{B}\bar{C} = \bar{B}\bar{C}$$

Combine $m_4$ and $m_5$ (differ in $C$, both have $A\bar{B}$):

$$A\bar{B}\bar{C} + A\bar{B}C = A\bar{B}$$

Minterm 4 was used in both combinations. That is valid: idempotency ($X + X = X$) means you can replicate a term without changing the function. You are not consuming $m_4$; you are expanding it.

Reassemble:

$$Y = \bar{B}\bar{C} + A\bar{B}$$

Factor to verify nothing further reduces: $\bar{B}(\bar{C} + A)$. Neither form dominates the other universally — which is minimal depends on whether you count literals or gate inputs. In two-level SOP, $\bar{B}\bar{C} + A\bar{B}$ is minimal.

### Karnaugh Maps

A **Karnaugh map (K-map)** is a 2D truth table where adjacent cells differ in exactly one variable (Gray code ordering: 00, 01, 11, 10). Adjacency wraps around — the left edge is adjacent to the right edge, top to bottom. This geometric layout makes
