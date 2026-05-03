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

When Linux's CFS scheduler calculates a task's virtual runtime, it uses integer logarithms. When the kernel decides how many levels a radix tree needs to map a 48-bit virtual address space with 4 KiB pages, it divides exponents. When you read `/proc/meminfo` and see `MemTotal` disagree with your DIMM specs, understanding orders of magnitude tells you where the gap comes from. These operations are not background knowledge — they are the arithmetic the kernel actually performs.

---

## Core Concepts

### Exponentiation: Repeated Multiplication

$b^n$ means $b$ multiplied by itself $n$ times. The rules follow from that definition alone:

$$b^m \cdot b^n = b^{m+n}$$
$$\frac{b^m}{b^n} = b^{m-n}$$
$$(b^m)^n = b^{mn}$$
$$b^0 = 1 \quad (b \neq 0)$$

The last rule is not a convention: $b^0 = b^{n-n} = b^n / b^n = 1$. It falls out of the division rule when $m = n$.

### Logarithms: The Inverse Operation

If $b^x = y$, then $\log_b y = x$. The logarithm answers: *what exponent on $b$ produces $y$?* Because it inverts exponentiation, every exponent law has a direct logarithm counterpart:

$$\log_b(xy) = \log_b x + \log_b y$$
$$\log_b\!\left(\frac{x}{y}\right) = \log_b x - \log_b y$$
$$\log_b(x^n) = n \log_b x$$

The **change of base** formula:

$$\log_b x = \frac{\log_k x}{\log_k b}$$

This shows that any two logarithms differ only by a constant factor. Changing from base 2 to base 10 multiplies every value by $1/\log_{10} 2 \approx 3.32$. The *shape* of the function does not change, only its vertical scale. This is why $O(\log_2 n)$ and $O(\log_{10} n)$ are the same complexity class.

### Orders of Magnitude

The order of magnitude of $n$ is $\lfloor \log_{10} n \rfloor$ — the exponent when the number is written in scientific notation $m \times 10^e$ with $1 \leq m < 10$.

| Value | Scientific notation | Order of magnitude |
|---|---|---|
| 1,024 | $1.024 \times 10^3$ | 3 |
| 1,048,576 | $1.049 \times 10^6$ | 6 |
| $2^{32}$ | $4.295 \times 10^9$ | 9 |
| $2^{64}$ | $1.845 \times 10^{19}$ | 19 |

When two quantities differ by six or more orders of magnitude, the smaller is typically negligible in system-level calculations. An L1 cache hit takes roughly 1 ns; a network round-trip to a nearby datacenter takes roughly 500 µs. That is $5 \times 10^5$ — five orders of magnitude. No amount of software optimization in the fast path closes a gap that large if the slow path is hit frequently.

### Ratios and Dimensional Analysis

Units behave as algebraic factors and must cancel correctly. Keeping them explicit catches reasoning errors:

$$\frac{8 \text{ GiB}}{64 \text{ bytes/entry}} = \frac{8 \times 2^{30} \text{ bytes}}{64 \text{ bytes/entry}} = \frac{2^{33}}{2^6} \text{ entries} = 2^{27} \text{ entries}$$

If your units do not cancel to the expected type, the formula is wrong. This is not optional bookkeeping — it is the error-detection mechanism.

### Inequalities

Inequalities obey the same arithmetic rules as equations with one critical exception: **multiplying or dividing both sides by a negative number reverses the direction.**

$$-2x < 6 \implies x > -3$$

This matters when reasoning about two's-complement signed integers, where the most significant bit carries a negative weight.

---

## How It Works

### Why Logarithms Appear in Algorithm Analysis

Binary search on a sorted array of $n$ elements takes at most $\lceil \log_2 n \rceil$ comparisons. The causal argument: each comparison eliminates at least half the remaining candidates. After $k$ comparisons, at most $n / 2^k$ candidates remain. The search terminates when that count reaches 1:

$$\frac{n}{2^k} = 1 \implies 2^k = n \implies k = \log_2 n$$

The logarithm emerges because the inverse of "halve repeatedly" is "how many doublings reach $n$?" The same structure appears wherever a branching factor $b$ governs tree depth: a B-tree with branching factor $b$ storing $n$ keys has height $\lceil \log_b n \rceil$. Ext4 and XFS use tree structures with large branching factors specifically to keep height — and therefore I/O operations — small even for very large directories.

### The 10-Bit Rule

Because $2^{10} = 1024 \approx 10^3$, every 10 bits of address space multiplies capacity by roughly 1000. This follows directly from:

$$\log_{10}(2^{10}) = 10 \log_{10} 2 \approx 10 \times 0.30103 = 3.0103$$

Adding 10 bits adds approximately 3 orders of magnitude. The x86-64 architecture uses 48-bit virtual addresses (the remaining 16 bits are reserved and sign-extended):

| Address bits | Addressable space |
|---|---|
| 32 | $2^{32} \approx 4.3 \times 10^9 \approx 4 \text{ GiB}$ |
| 40 | $2^{40} \approx 1.1 \times 10^{12} \approx 1 \text{ TiB}$ |
| 48 | $2^{48} \approx 2.8 \times 10^{14} \approx 256 \text{ TiB}$ |
| 64 | $2^{64} \approx 1.8 \times 10^{19} \approx 16 \text{ EiB}$ |

The jump from 32-bit to 64-bit is not "twice as much address space." It is a factor of $2^{32} \approx 4.3 \times 10^9$ — over four billion times larger. The phrase "64-bit is bigger" is true but useless without the magnitude.

### Page Table Depth from First Principles

On x86-64 with 4 KiB pages, a virtual address is split into five fields. Each page table level is indexed by 9 bits, and the page offset consumes 12 bits:

$$9 + 9 + 9 + 9 + 12 = 48 \text{ bits}$$

Each 9-bit index addresses $2^9 = 512$ entries. Four levels are needed because:

$$\left\lceil \frac{48 - 12}{9} \right\rceil = \left\lceil \frac{36}{9} \right\rceil = 4$$

This is logarithm arithmetic: how many 512-way branch levels span a 36-bit index space? $\log_{512}(2^{36}) = 36/9 = 4$. The kernel's `mm/pgtable.h` uses `PTRS_PER_PGD`, `PTRS_PER_PUD`, etc., each set to 512, because of exactly this decomposition.

### Big-O Notation

Big-O captures the asymptotic growth rate of a function, discarding constant factors and lower-order terms. Formally:

$$f(n) = O(g(n)) \iff \exists\, C > 0,\, n_0 \in \mathbb{N} : |f(n)| \leq C \cdot |g(n)| \quad \forall\, n \geq n_0$$

The "=" is intentionally asymmetric — it means "belongs to the set of functions bounded above by a constant multiple of $g$." Therefore $n = O(n^2)$ is true, but $n^2 = O(n)$ is false.

Common complexity classes ordered by growth rate:

$$O(1) \subset O(\log n) \subset O(\sqrt{n}) \subset O(n) \subset O(n \log n) \subset O(n^2) \subset O(2^n)$$

To compare two functions rigorously, compute the limit of their ratio:

$$\lim_{n \to \infty} \frac{\log_2 n}{\sqrt{n}}$$

Apply L'Hôpital's rule (differentiating numerator and denominator with respect to $n$):

$$\lim_{n \to \infty} \frac{1/(n \ln 2)}{1/(2\sqrt{n})} = \lim_{n \to \infty} \frac{2\sqrt{n}}{n \ln 2} = \lim_{n \to \infty} \frac{2}{(\ln 2)\sqrt{n}} = 0$$

The limit is 0, so $\log_2 n$ grows strictly slower than $\sqrt{n}$.

```python
import math

for n in [100, 10_000, 1_000_000, 10**9]:
    log_n  = math.log2(n)
    sqrt_n = math.sqrt(n)
    ratio  = log_n / sqrt_n
    print(f"n={n:>12,}  log2={log_n:8
