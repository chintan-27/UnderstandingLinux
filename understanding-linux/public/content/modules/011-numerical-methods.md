---
id: 11
title: "Numerical methods"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every number your program stores is a lie. Floating-point arithmetic operates on a finite subset of the reals, so every operation introduces rounding error, and those errors compound. Without understanding approximation and stability, you write code that silently returns wrong answers — not crashes, not exceptions, just subtly incorrect results that pass most tests. The Linux kernel contains carefully chosen approximations: integer square roots in `lib/int_sqrt.c`, fixed-point exponentials in the scheduler's load-average calculation (`kernel/sched/loadavg.c`), Newton-Raphson reciprocals in some hardware math libraries. These choices exist because the authors understood *which errors are acceptable and why*, and encoded that understanding explicitly.

---

## Core Concepts

### Approximation and Error

Every practical computation replaces an exact value with a tractable one. Two measurements matter:

**Absolute error** is the raw difference:

$$\text{abs\_err}(x, \hat{x}) = |x - \hat{x}|$$

**Relative error** normalizes by the true value:

$$\text{rel\_err}(x, \hat{x}) = \frac{|x - \hat{x}|}{|x|}$$

Use absolute error when you care about a fixed-scale tolerance (a sensor reading within $\pm 0.01$ volts). Use relative error when you care about significant figures — which is almost always the right question in floating-point work, because IEEE 754 represents numbers with a fixed number of *significant* bits, not a fixed number of decimal places after the point.

When approximating $H_n$ (the $n$-th harmonic number):

$$H_n = \ln n + \gamma + \frac{1}{2n} - \sum_{k=1}^{m} \frac{B_{2k}}{2k \cdot n^{2k}} + R_m$$

the remainder $R_m$ has a known bound. You stop adding terms when $|R_m|$ drops below your target precision. The critical discipline: never approximate without a bound on what you are discarding.

### Big-O as a Precision Budget

$O(f(n))$ in numerical work is not algorithm analysis — it is a calculus for tracking accumulated error. Writing:

$$H_n = \ln n + \gamma + \frac{1}{2n} + O(n^{-2})$$

asserts that the omitted terms are bounded by $C \cdot n^{-2}$ for some fixed $C$. This lets you propagate errors through chains of operations without losing the bound. Two rules that appear constantly:

$$e^{O(f(n))} = 1 + O(f(n)) \quad \text{when } f(n) = O(1)$$

$$\ln(1 + O(f(n))) = O(f(n)) \quad \text{when } f(n) \prec 1$$

The reason these are useful: you can substitute approximations into larger expressions and immediately read off the order of the resulting error, without expanding every term.

### Floating-Point Representation

IEEE 754 double precision encodes:

$$x = (-1)^s \cdot 1.m \cdot 2^e$$

where $s$ is 1 sign bit, $m$ is a 52-bit mantissa (the leading 1 is implicit), and $e$ is an 11-bit biased exponent (bias = 1023). The spacing between adjacent representable values near $x$ is $|x| \cdot 2^{-52}$, so **machine epsilon** is:

$$\varepsilon_{\text{mach}} = 2^{-52} \approx 2.22 \times 10^{-16}$$

This is the worst-case relative rounding error for a single operation. Every `+`, `-`, `*`, `/` on a correctly rounded IEEE 754 implementation produces a result with relative error at most $\frac{1}{2}\varepsilon_{\text{mach}}$.

You can verify the mantissa width directly:

```python
import struct, math

x = 1.0
# The next representable double above 1.0
eps = 0.0
p = 1.0
while 1.0 + p != 1.0:
    eps = p
    p /= 2.0
print(f"machine epsilon: {eps:.2e}")   # 2.22e-16
print(f"2^-52 =          {2**-52:.2e}")
```

Single precision (`float` in C) uses a 23-bit mantissa, giving $\varepsilon_{\text{mach}} = 2^{-23} \approx 1.19 \times 10^{-7}$. This matters when you use `float` for performance and wonder why your answers are wrong at the seventh digit.

### Numerical Stability

An algorithm is **numerically stable** if rounding errors in the input (and at each step) produce output errors that are small relative to the problem's inherent sensitivity. Instability means rounding errors are amplified by the algorithm itself — not the problem, the *algorithm*.

**Catastrophic cancellation** is the most common instability: subtracting two nearly equal numbers. Each input may be accurate to 15 significant digits, but if they agree in the first 14, the result has only 1 significant digit.

$$f(x) = \sqrt{x+1} - \sqrt{x}$$

As $x \to \infty$, both terms approach $\sqrt{x}$ and you lose all precision in their difference. The fix: rationalize to eliminate the subtraction:

$$f(x) = \frac{(\sqrt{x+1} - \sqrt{x})(\sqrt{x+1} + \sqrt{x})}{\sqrt{x+1} + \sqrt{x}} = \frac{1}{\sqrt{x+1} + \sqrt{x}}$$

Now for large $x$, $f(x) \approx \frac{1}{2\sqrt{x}}$, and there is no cancellation. Same mathematical function, completely different numerical behavior — the reformulation is numerically stable because addition of nearly equal numbers is benign; subtraction is not.

A second classic: evaluating $e^x - 1$ near $x = 0$. Use `expm1(x)` from `<math.h>`, which computes this directly without cancellation. Similarly, $\ln(1+x)$ near $x = 0$ should use `log1p(x)`. These are in the C standard library precisely because the naive forms are unstable.

### Iterative Methods

When no closed form exists, you iterate. **Newton-Raphson** finds roots of $f(x) = 0$ by linearizing $f$ at the current guess:

$$x_{n+1} = x_n - \frac{f(x_n)}{f'(x_n)}$$

Near a simple root, convergence is **quadratic**: if the error at step $n$ is $\delta_n$, then $\delta_{n+1} \approx C \delta_n^2$. The number of correct decimal digits roughly doubles each iteration. Starting from a guess with 1 correct digit, you reach 15 (double precision) in about 4 iterations.

For $\sqrt{a}$, solve $f(x) = x^2 - a = 0$, giving $f'(x) = 2x$:

$$x_{n+1} = \frac{1}{2}\left(x_n + \frac{a}{x_n}\right)$$

This is the Babylonian method. The derivation via Newton-Raphson explains *why* it converges quadratically, which the historical algorithm statement does not.

---

## How It Works

### Euler-Maclaurin and Controlled Approximation

The Euler-Maclaurin formula connects discrete sums to integrals with explicit error terms. For smooth $f$:

$$\sum_{k=a}^{b} f(k) = \int_a^b f(x)\,dx + \frac{f(a)+f(b)}{2} + \sum_{k=1}^{m} \frac{B_{2k}}{(2k)!}\left[f^{(2k-1)}(b) - f^{(2k-1)}(a)\right] + R_m$$

where $B_{2k}$ are Bernoulli numbers ($B_2 = \frac{1}{6}$, $B_4 = -\frac{1}{30}$, ...). Applying this to $f(k) = 1/k$ with $a=1$, $b=n$ yields the asymptotic expansion for $H_n$.

The practical point: the remainder $R_m$ satisfies

$$|R_m| \leq \frac{2}{(2\pi)^{2m}} \int_a^b |f^{(2m)}(x)|\,dx$$

so you can compute how many correction terms you need before writing a single line of code. This is the mathematical backbone of numerical integration: you are not guessing at precision, you are purchasing it at a known rate.

Note that the Euler-Maclaurin series is typically asymptotic — adding more terms eventually makes things *worse* because the Bernoulli numbers grow faster than factorials can suppress them. The optimal truncation point depends on $n$.

### Floating-Point Error Accumulation

Summing $n$ floating-point numbers naively:

```python
def naive_sum(values):
    total = 0.0
    for x in values:
        total += x
    return total
```

Each addition introduces relative error up to $\frac{1}{2}\varepsilon_{\text{mach}}$, and the errors accumulate. After $n$ additions, the absolute error is bounded by roughly:

$$\text{error} \leq n \cdot \varepsilon_{\text{mach}} \cdot \max_i |x_i|$$

For $n = 10^6$ and values of order 1, the error is $\sim 10^6 \times 2.2 \times 10^{-16} \approx 2.2 \times 10^{-10}$ — you have lost 6 decimal digits compared to a single operation.

**Kahan compensated summation** tracks the
