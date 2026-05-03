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

When you write a sorting algorithm, choose a data structure, or read kernel source code, you are constantly making implicit bets about how things scale. The Linux kernel's `CFS` scheduler stores runnable tasks in a red-black tree (`kernel/sched/fair.c`) precisely because red-black tree operations run in $O(\log n)$ time — with millions of tasks, $\log_2(10^6) \approx 20$ comparisons per insertion is acceptable; $O(n)$ linear scan is not. The `ext4` directory index uses an HTree (essentially a B-tree variant) for the same reason. These are not style choices. They are load-bearing algorithmic decisions, and you cannot evaluate or challenge them without a rigorous language for comparing growth rates.

---

## Core Concepts

### The ≺ Relation (Asymptotic Dominance)

We write $f(n) \prec g(n)$ to mean $g$ grows strictly faster than $f$:

$$f(n) \prec g(n) \iff \lim_{n \to \infty} \frac{f(n)}{g(n)} = 0$$

This is a statement about **eventual behavior**, not behavior at any specific $n$. The relationship is absolute: no constant factor or finite head start can reverse it. If $f \prec g$, then for all sufficiently large $n$, $g$ wins — permanently.

For monomials, the rule is exact:

$$n^\alpha \prec n^\beta \iff \alpha < \beta$$

### The Asymptotic Hierarchy

$$1 \prec \log \log n \prec \log n \prec n^\epsilon \prec n^c \prec n^{\log n} \prec c^n \prec n^n \prec c^{c^n}$$

where $0 < \epsilon < 1 < c$ are arbitrary constants. The most important counterintuitive consequence: $\log n \prec n^\epsilon$ for **any** $\epsilon > 0$, no matter how small. The crossover point may be astronomically large — for $\log n$ vs. $n^{0.0001}$, it is around $n = 10^{43000}$ — but the inequality is unconditionally true for all sufficiently large $n$. Asymptotic reasoning requires you to think past any finite threshold.

The $n^{\log n}$ entry is less familiar but appears in algorithms like the naive matrix multiplication improvement: $n^{\log n}$ grows faster than any polynomial but slower than any exponential, because $\log n \to \infty$ while remaining $o(n)$.

### Big-O, Big-Ω, and Big-Θ

These notations encode the $\prec$ relation into bounds rather than exact comparisons:

| Notation | Meaning | Formal Definition |
|---|---|---|
| $f = O(g)$ | $f$ grows no faster than $g$ | $\exists\, c > 0,\, n_0 : f(n) \le c \cdot g(n)\ \forall\, n > n_0$ |
| $f = \Omega(g)$ | $f$ grows no slower than $g$ | $g = O(f)$ |
| $f = \Theta(g)$ | $f$ and $g$ grow at the same rate | $f = O(g)$ and $f = \Omega(g)$ |

$O$ is an **upper** bound, not a tight one. Any $O(n)$ algorithm is also trivially $O(n^2)$, $O(n^3)$, and $O(2^n)$. When someone says "the algorithm is $O(n^2)$", they are asserting an upper bound; whether it is tight requires showing $\Omega(n^2)$ separately to get $\Theta(n^2)$.

The little-o analogue of $O$ is $o$: $f = o(g)$ means $f \prec g$ strictly, i.e., $\lim_{n\to\infty} f(n)/g(n) = 0$. So $n = o(n^2)$ but $n \ne o(n)$.

### Why Constant Factors Vanish (and Why That is Sometimes Wrong)

If $f(n) = 10^9 \cdot n$ and $g(n) = n^2$, then $f \prec g$ because:

$$\lim_{n \to \infty} \frac{10^9 \cdot n}{n^2} = \lim_{n \to \infty} \frac{10^9}{n} = 0$$

The crossover is at $n = 10^9$. Below that threshold, $f$ is faster despite having worse asymptotic class. Asymptotic analysis is correct about scalability but says nothing about performance at small $n$. The Linux kernel routinely uses $O(n)$ structures (linear arrays, linked lists) for small fixed-size collections — e.g., the per-CPU run queues for `SCHED_FIFO` tasks, where $n$ is bounded — precisely because cache locality dominates at small $n$, making the theoretically inferior structure faster in practice.

---

## How It Works

### Placing a Function in the Hierarchy

Suppose a measured running time fits $T(n) = 3n^2 \log n + 500n$. To classify it:

**Step 1: Find the dominant term.**

$$\lim_{n \to \infty} \frac{500n}{3n^2 \log n} = \lim_{n \to \infty} \frac{500}{3n \log n} = 0$$

The $500n$ term is dominated and drops. The function behaves like $n^2 \log n$ asymptotically.

**Step 2: Locate $n^2 \log n$ in the hierarchy.**

$n^2 \log n$ is not a pure power, so it does not sit exactly at any $n^c$ tier. Compare it against $n^{2+\epsilon}$ for arbitrary $\epsilon > 0$:

$$\lim_{n \to \infty} \frac{n^2 \log n}{n^{2+\epsilon}} = \lim_{n \to \infty} \frac{\log n}{n^\epsilon} = 0$$

So $n^2 \log n \prec n^{2+\epsilon}$ for any $\epsilon > 0$, but $n^2 \prec n^2 \log n$ (since $\log n \to \infty$). It inhabits the gap between $n^2$ and $n^{2+\epsilon}$, which $\Theta$ notation cannot express as a single power. A valid tight bound is $\Theta(n^2 \log n)$; a valid but loose upper bound is $O(n^{2.001})$.

### Solving Recurrences: The Master Theorem

Many divide-and-conquer runtimes are defined recursively. The general form is:

$$T(n) = a\, T\!\left(\frac{n}{b}\right) + f(n), \quad a \ge 1,\ b > 1$$

The Master Theorem compares $f(n)$ against the **branching cost** $n^{\log_b a}$, which is the total work across all recursive calls if the divide step were free:

| Case | Condition | Result |
|---|---|---|
| 1 | $f(n) = O\!\left(n^{\log_b a - \epsilon}\right)$ | $T(n) = \Theta\!\left(n^{\log_b a}\right)$ — recursion dominates |
| 2 | $f(n) = \Theta\!\left(n^{\log_b a}\right)$ | $T(n) = \Theta\!\left(n^{\log_b a} \log n\right)$ — costs balance |
| 3 | $f(n) = \Omega\!\left(n^{\log_b a + \epsilon}\right)$ | $T(n) = \Theta(f(n))$ — top-level work dominates |

**Merge sort:** $a = 2$, $b = 2$, $f(n) = n$. Then $\log_b a = \log_2 2 = 1$, $f(n) = \Theta(n^1)$. Case 2:

$$T(n) = \Theta(n \log n)$$

**Binary search:** $a = 1$, $b = 2$, $f(n) = 1$. Then $\log_2 1 = 0$, $f(n) = \Theta(n^0) = \Theta(1)$. Case 2:

$$T(n) = \Theta(\log n)$$

**Karatsuba multiplication:** $a = 3$, $b = 2$, $f(n) = n$. Then $\log_2 3 \approx 1.585$, $f(n) = O(n^{1.585 - \epsilon})$. Case 1:

$$T(n) = \Theta\!\left(n^{\log_2 3}\right) \approx \Theta\!\left(n^{1.585}\right)$$

This is why Karatsuba beats the $\Theta(n^2)$ schoolbook algorithm for large integers — the kernel uses it internally in `lib/math/` for big number operations.

### Verifying Asymptotic Claims with Limits

To prove $\log n \prec n^{0.0001}$, apply L'Hôpital's rule (differentiating with respect to $n$, treating $\log$ as $\ln$ — the base only changes the result by a constant factor):

$$\lim_{n \to \infty} \frac{\ln n}{n^{0.0001}} \xrightarrow{\text{L'H}} \lim_{n \to \infty} \frac{1/n}{0.0001 \cdot n^{-0.9999
