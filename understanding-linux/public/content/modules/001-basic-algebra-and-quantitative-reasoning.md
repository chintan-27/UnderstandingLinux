---
id: 1
title: "Basic algebra and quantitative reasoning"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

When a program slows to a crawl under load, when a filesystem fills unexpectedly, when one kernel data structure makes a system ten thousand times faster than another — the explanation almost always involves exponential or logarithmic relationships. At $n = 10^6$, the difference between $O(n^2)$ and $O(n \log n)$ is the difference between $10^{12}$ operations and $2 \times 10^7$: a factor of 50,000. The Linux kernel indexes virtual memory areas with red-black trees (height $\leq 2\lfloor \log_2(n+1) \rfloor$) precisely because a linear scan of thousands of VMAs on every page fault would be catastrophically slow. Without a working intuition for exponential growth and logarithmic compression, you cannot reason about performance or capacity — you're pattern-matching, not understanding.

## Core Concepts

### Exponents

$b^n$ means multiply $b$ by itself $n$ times. The base and exponent play completely different roles — changing the exponent has a far more violent effect than changing the base:

$$2^{10} = 1{,}024 \qquad 2^{20} = 1{,}048{,}576 \qquad 2^{32} = 4{,}294{,}967{,}296 \qquad 2^{64} = 1.844 \times 10^{19}$$

Doubling the exponent squares the result. A 32-bit address space holds $2^{32} \approx 4.3 \times 10^9$ addresses. A 64-bit space doesn't hold twice as many — it holds $2^{64} / 2^{32} = 2^{32}$ times as many. This is why moving from 32-bit to 64-bit addressing wasn't a modest extension.

The exponent rules follow directly from the definition "repeated multiplication":

$$b^m \cdot b^n = b^{m+n} \qquad \frac{b^m}{b^n} = b^{m-n} \qquad (b^m)^n = b^{mn} \qquad b^0 = 1$$

The last rule isn't a convention: $b^0 = b^{n-n} = b^n / b^n = 1$.

### Logarithms

The logarithm is the inverse of exponentiation. If $b^x = y$, then $\log_b y = x$. Concretely:

$$\log_2 1{,}024 = 10 \qquad \log_2 4{,}294{,}967{,}296 = 32$$

$\log_2 n$ answers: *how many times must I halve $n$ to reach 1?* Binary search on a sorted array of $10^9$ elements takes at most $\lceil \log_2 10^9 \rceil = 30$ comparisons because each comparison eliminates half the remaining candidates. The depth of a balanced binary tree with $n$ leaves is $\lceil \log_2 n \rceil$ — adding a level doubles capacity, so capacity is exponential in depth, and depth is logarithmic in capacity.

The three bases you will encounter:

| Base | Notation | Where you see it |
|------|----------|-----------------|
| 2 | $\lg n$ | Algorithm analysis, binary structures, bit widths |
| $e \approx 2.718$ | $\ln n$ | Calculus, probability, entropy, thermal physics |
| 10 | $\log_{10} n$ | Orders of magnitude, decibels, pH |

They differ by a constant factor derived directly from the change-of-base formula:

$$\log_2 n = \frac{\ln n}{\ln 2} \approx 1.443 \ln n$$

In Big-O notation that constant is absorbed, so $O(\log_2 n) = O(\ln n) = O(\log n)$. This is why algorithm textbooks write $O(\log n)$ without specifying a base.

Log rules, each derived from the corresponding exponent rule:

$$\log_b(xy) = \log_b x + \log_b y \qquad \log_b\frac{x}{y} = \log_b x - \log_b y \qquad \log_b(x^k) = k\log_b x$$

The first rule is why logarithms turn multiplication into addition — and why they appear in information theory, where combining independent probabilities multiplies them but combining independent bit-lengths adds them.

### Scientific Notation and Orders of Magnitude

Scientific notation expresses any number as $a \times 10^n$ where $1 \leq a < 10$. An **order of magnitude** is a factor of 10. This is a tool for fast reasoning when exact numbers are unavailable or misleading.

Memory and I/O latencies span many orders of magnitude:

| Event | Latency | Scientific notation |
|-------|---------|-------------------|
| L1 cache hit | ~1 ns | $10^{-9}$ s |
| L3 cache hit | ~40 ns | $4 \times 10^{-8}$ s |
| DRAM access | ~100 ns | $10^{-7}$ s |
| NVMe SSD read | ~100 µs | $10^{-4}$ s |
| Spinning disk seek | ~5 ms | $5 \times 10^{-3}$ s |
| Network round-trip (LAN) | ~500 µs | $5 \times 10^{-4}$ s |

A disk seek is not "slow compared to L1 cache" — it is six to seven orders of magnitude slower. A workload that causes repeated disk seeks when L1-cached data was achievable isn't somewhat inefficient; it's effectively broken. The number of orders of magnitude between two quantities $a$ and $b$ is $\log_{10}(b/a)$.

### Ratios and Dimensional Analysis

A ratio compares two quantities of the same kind. A rate compares different kinds (bytes/second, instructions/cycle). Dimensional analysis chains unit conversions by treating units as algebraic factors that cancel:

$$512 \text{ MiB} \times \frac{2^{20} \text{ bytes}}{1 \text{ MiB}} \times \frac{8 \text{ bits}}{1 \text{ byte}} = 512 \times 2^{20} \times 8 \text{ bits} = 2^9 \times 2^{20} \times 2^3 \text{ bits} = 2^{32} \text{ bits}$$

If units don't cancel, the formula is wrong. This catches errors before arithmetic begins. The same technique works for throughput estimates: a 1 Gbps link carries

$$10^9 \frac{\text{bits}}{\text{s}} \times \frac{1 \text{ byte}}{8 \text{ bits}} \times \frac{1 \text{ MiB}}{2^{20} \text{ bytes}} \approx 119 \text{ MiB/s}$$

which is why a "gigabit" link does not deliver 1000 MiB/s.

## How It Works

### Exponential Growth vs. Logarithmic Growth

These functions are inverses, and their contrast is extreme:

| $n$ | $\log_2 n$ | $n$ | $2^n$ |
|-----|-----------|-----|-------|
| 1 | 0 | 1 | 2 |
| 16 | 4 | 4 | 16 |
| 1,024 | 10 | 10 | 1,024 |
| 1,048,576 | 20 | 20 | 1,048,576 |
| 4,294,967,296 | 32 | 32 | 4,294,967,296 |

An algorithm running in $O(2^n)$ time is unusable past $n \approx 60$ on any hardware — at 64-bit input size, $2^{64}$ operations at $10^{10}$ operations/second would take over 58 years. An algorithm running in $O(\log n)$ time barely registers when $n$ grows from $10^6$ to $10^{12}$: $\log_2 10^{12} \approx 40$, versus $\log_2 10^6 = 20$. Doubling the problem to $10^{12}$ adds only 20 comparisons.

### Big-O and Asymptotic Dominance

Big-O notation characterizes growth rate by bounding one function by a constant multiple of another above some threshold:

$$f(n) = O(g(n)) \iff \exists\, C > 0,\; n_0 \in \mathbb{N} : |f(n)| \leq C\,|g(n)| \quad \forall\, n \geq n_0$$

The constant $C$ captures implementation differences — cache efficiency, constant factors in the algorithm — but not structural growth behavior. The standard hierarchy from slowest- to fastest-growing:

$$O(1) \subset O(\log n) \subset O(\sqrt{n}) \subset O(n) \subset O(n \log n) \subset O(n^2) \subset O(n^3) \subset O(2^n) \subset O(n!)$$

To verify that $3n^2 + 100n = O(n^2)$, check that the ratio is bounded:

$$\frac{3n^2 + 100n}{n^2} = 3 + \frac{100}{n} \xrightarrow{n \to \infty} 3$$

The ratio converges to 3, so $C = 4$ suffices for all $n \geq 100$. The $100n$ term is asymptotically irrelevant — it matters for small $n$ but not for large $n$, which is precisely the regime Big-O describes.

Little-o is stricter: $f(n) = o(g(n))$ means the ratio goes
