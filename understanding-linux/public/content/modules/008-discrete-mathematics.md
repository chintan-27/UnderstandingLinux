---
id: 8
title: "Discrete mathematics"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

When you write a sorting algorithm or design a kernel data structure, the question is never "does this work?" but "does this scale?" A hash table lookup that takes $O(1)$ time handles ten million entries as easily as ten. A naive search taking $O(n^2)$ time grinds to a halt. Without a precise vocabulary for comparing growth rates, you cannot reason about whether your red-black tree insertion, your page fault handler, or your network packet classifier will hold up under load — you can only guess. Asymptotic notation gives that vocabulary mathematical teeth: it lets you *prove* that one approach dominates another, independent of hardware, constants, or compiler flags.

---

## Core Concepts

### The ≺ Relation (Grows Slower Than)

We write $f(n) \prec g(n)$ to mean $f$ grows strictly slower than $g$:

$$f(n) \prec g(n) \iff \lim_{n \to \infty} \frac{f(n)}{g(n)} = 0$$

This is an ordering on *function growth rates*, not on values at any particular $n$. It satisfies transitivity: if $f \prec g$ and $g \prec h$, then $f \prec h$. It is not symmetric — that asymmetry is the whole point.

### The Growth Hierarchy

From *Concrete Mathematics*, with $0 < \epsilon < 1 < c$:

$$1 \prec \log \log n \prec \log n \prec n^\epsilon \prec n^c \prec n^{\log n} \prec c^n \prec n^n \prec c^{c^n}$$

Each entry eventually dominates everything to its left. "Eventually" does real work in that sentence: for power functions,

$$n^\alpha \prec n^\beta \iff \alpha < \beta$$

so $n^{0.001} \prec n^{0.002}$, even though for any $n$ you can name this century, $n^{0.001}$ is barely distinguishable from 1. The hierarchy describes behavior as $n \to \infty$, and infinity is not a large integer — it is a different regime entirely. This is why you cannot settle hierarchy questions by benchmarking.

### Big-O, Big-Θ, and Big-Ω

The $\prec$ relation is the strict form. The full family:

| Notation | Formal definition | Corresponds to |
|---|---|---|
| $f = O(g)$ | $\exists\, c, n_0 : f(n) \leq c\, g(n)\ \forall n > n_0$ | $f \preceq g$ |
| $f = \Omega(g)$ | $\exists\, c, n_0 : f(n) \geq c\, g(n)\ \forall n > n_0$ | $f \succeq g$ |
| $f = \Theta(g)$ | $f = O(g)$ and $f = \Omega(g)$ | $f \asymp g$ |
| $f = o(g)$ | $\lim_{n\to\infty} f(n)/g(n) = 0$ | $f \prec g$ |

These are *set* memberships, not equations. Writing $f = O(g)$ is conventional shorthand for "$f$ belongs to the class of functions eventually bounded above by a constant multiple of $g$." The notation abuses the equals sign; you can write $n = O(n^2)$ and $2n = O(n^2)$ but you cannot conclude $n = 2n$.

### Why Logarithm Beats Any Fractional Power — But Nothing Beats Exponential

$\log n \prec n^\epsilon$ for any $\epsilon > 0$, however small. This follows from L'Hôpital's rule:

$$\lim_{n \to \infty} \frac{\log n}{n^\epsilon} = \lim_{n \to \infty} \frac{1/n}{\epsilon\, n^{\epsilon - 1}} = \lim_{n \to \infty} \frac{1}{\epsilon\, n^\epsilon} = 0$$

The *reason* is that differentiation reduces the exponent of $n^\epsilon$ by 1 but kills $\log n$ outright — the polynomial always has "more room to grow." Conversely, $c^n \succ n^k$ for all fixed $k$ because exponentials compound multiplicatively at every step while polynomials add only a power.

---

## How It Works

### Ranking by Taking Limits

To compare $f$ and $g$, compute $\lim_{n\to\infty} f(n)/g(n)$:

- Limit is $0$: $f \prec g$
- Limit is $\infty$: $f \succ g$
- Limit is a positive constant: $f \asymp g$

**Example — $n \log n$ vs. $n^{1.5}$:**

$$\lim_{n \to \infty} \frac{n \log n}{n^{1.5}} = \lim_{n \to \infty} \frac{\log n}{n^{0.5}} = 0$$

So $n \log n \prec n^{1.5}$. The reason is that $\log n \prec n^{0.5}$ by the result above (set $\epsilon = 0.5$). This is why merge sort ($\Theta(n \log n)$) and an $O(n^{1.5})$ algorithm are not interchangeable at scale.

**Example — locating $n^{\log n}$ in the hierarchy:**

Rewrite using the identity $n = e^{\ln n}$:

$$n^{\log n} = e^{(\ln n)^2}$$

Compare against $c^n = e^{n \ln c}$:

$$\lim_{n \to \infty} \frac{e^{(\ln n)^2}}{e^{n \ln c}} = \lim_{n \to \infty} e^{(\ln n)^2 - n \ln c} = 0$$

because $(\ln n)^2 - n \ln c \to -\infty$. So $n^{\log n}$ is superpolynomial but subexponential — it sits between the polynomial regime and the true exponential regime, which is why it appears in the hierarchy between $n^c$ and $c^n$.

### Recurrences and the Master Theorem

Many recursive algorithms satisfy the recurrence

$$T(n) = a \cdot T\!\left(\frac{n}{b}\right) + f(n)$$

where $a \geq 1$ is the number of recursive calls, $b > 1$ is the factor by which the input shrinks, and $f(n)$ is the cost of the work done outside the recursive calls. The critical exponent is $\log_b a$ — the rate at which the number of subproblems grows relative to the shrinkage per level. Compare $f(n)$ against $n^{\log_b a}$:

| Case | Condition | Result | Dominant factor |
|---|---|---|---|
| 1 | $f(n) \prec n^{\log_b a}$ | $T(n) = \Theta(n^{\log_b a})$ | Leaf count |
| 2 | $f(n) \asymp n^{\log_b a}$ | $T(n) = \Theta(n^{\log_b a} \log n)$ | All levels equal |
| 3 | $f(n) \succ n^{\log_b a}$ | $T(n) = \Theta(f(n))$ | Root work |

The intuition: at each level of recursion, you have $a^k$ subproblems of size $n/b^k$. The total work at level $k$ is $a^k \cdot f(n/b^k)$. If this grows with depth (case 1), the leaves dominate; if it shrinks (case 3), the root dominates; if it stays constant (case 2), all $\log_b n$ levels contribute equally, producing the extra $\log n$ factor.

**Merge sort:** $T(n) = 2T(n/2) + n$, so $a = 2$, $b = 2$, $n^{\log_2 2} = n$, $f(n) = n$. Case 2 applies:

$$T(n) = \Theta(n \log n)$$

**Binary search:** $T(n) = T(n/2) + 1$, so $a = 1$, $b = 2$, $n^{\log_2 1} = n^0 = 1$, $f(n) = 1$. Case 2 again:

$$T(n) = \Theta(\log n)$$

**Strassen matrix multiplication:** $T(n) = 7T(n/2) + n^2$. Here $n^{\log_2 7} \approx n^{2.807}$ and $f(n) = n^2 \prec n^{2.807}$, so case 1:

$$T(n) = \Theta(n^{\log_2 7}) \approx \Theta(n^{2.807})$$

This is why Strassen beats the naive $\Theta(n^3)$: reducing the number of recursive multiplications from 8 to 7 changes $\log_b a$ from 3 to $\approx 2.807$, and that difference in the exponent compounds over $\log n$ levels.

### Empirical Verification

Big-O discards constants, but the *ratio* $T(n) / g(n)$ converges to a constant when $T(n) = \Theta(g(n))$. You can check this directly:

```python
import math

def count_steps(n):
    """Simulate O(n log n) work: outer loop runs ceil(log2(n
