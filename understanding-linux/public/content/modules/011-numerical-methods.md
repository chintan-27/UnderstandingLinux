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

Every number your computer stores is a rounded approximation of the true value. This is not a bug; it is a fundamental consequence of representing real numbers in finite binary storage. When you ignore this, errors compound in ways that are invisible until they are catastrophic: a navigation system drifts, a physics simulation diverges, a financial calculation silently accumulates rounding noise into meaningful money. The Linux kernel handles these concerns directly — computing scheduler weights as fixed-point fractions, approximating `jiffies`-to-nanoseconds conversions with integer arithmetic, and using iterative Newton steps inside `__ieee754_sqrt`. Understanding how approximations behave — how errors grow, shrink, or stay bounded — separates code that works once from code that works under all inputs.

---

## Core Concepts

### Absolute vs. Relative Error

Given a true value $v$ and an approximation $\hat{v}$:

$$\text{absolute error} = |v - \hat{v}|$$

$$\text{relative error} = \frac{|v - \hat{v}|}{|v|}$$

Absolute error measures displacement on the number line. Relative error measures the fraction of the answer that is wrong — equivalently, it counts how many significant figures are correct. They are not interchangeable, and choosing the wrong one causes you to misdiagnose your own accuracy.

When computing the millionth prime $p_{10^6} \approx 15{,}631{,}363$ from an asymptotic formula, the absolute error may be in the thousands while the relative error is $10^{-4}$. Whether that is acceptable depends entirely on what you are doing with the result. A scheduler computing a CPU weight from a relative formula tolerates large absolute magnitudes; a protocol computing a checksum does not tolerate any absolute error at all.

### Big-O as an Error Budget

$O(f(n))$ means "bounded in magnitude by $C \cdot f(n)$ for some constant $C$ and all sufficiently large $n$." In the context of approximation, the $O$ term is not a placeholder — it is an *error budget*. When Concrete Mathematics writes:

$$H_n = \ln n + \gamma + \frac{1}{2n} - \sum_{k=1}^{m} \frac{B_{2k}}{2k \cdot n^{2k}} + O\!\left(n^{-2m-2}\right)$$

the $O(n^{-2m-2})$ term is the remainder after truncating at $m$ Bernoulli correction terms. You choose $m$ based on how much accuracy you need, then include exactly enough terms. Carrying fewer introduces uncontrolled error; carrying more is wasted computation — and for asymptotic series, actively harmful (see below).

### Floating-Point Representation

A 64-bit IEEE 754 double stores:

$$x = (-1)^s \cdot (1 + m) \cdot 2^{e - 1023}$$

where $s \in \{0,1\}$ is the sign bit, $m$ is a 52-bit fractional mantissa $m \in [0, 1)$, and $e$ is an 11-bit biased exponent. Three consequences follow directly from this layout:

**1. Density is not uniform.** The interval $[2^k, 2^{k+1})$ contains exactly $2^{52}$ representable values regardless of $k$. The gap between adjacent doubles near $x = 1$ is $\epsilon_{\text{mach}} = 2^{-52} \approx 2.2 \times 10^{-16}$; near $x = 10^{15}$ it is $2^{-52} \cdot 2^{50} = 2^{-2} = 0.25$. Adding $0.1$ to $10^{15}$ in double precision changes nothing.

**2. Every operation rounds.** Each `+`, `-`, `*`, `/` introduces a relative rounding error of at most $\frac{1}{2}\epsilon_{\text{mach}}$. One operation is harmless; a chain of $n$ operations accumulates error that can grow as $O(n \epsilon_{\text{mach}})$ in the best case and exponentially in the worst.

**3. Machine epsilon is measurable.** The smallest $\epsilon$ such that $1.0 + \epsilon \neq 1.0$ in floating-point arithmetic is $\epsilon_{\text{mach}} = 2^{-52}$. This is not the smallest representable positive number (that is $2^{-1074}$ for subnormals); it is the precision of the significand.

The memory layout of a double, reading from MSB to LSB:

```
bit 63   : sign (1 bit)
bits 62–52: exponent, biased by 1023 (11 bits)
bits 51–0 : mantissa fraction (52 bits)
```

You can inspect any double's bit pattern directly:

```c
#include <stdio.h>
#include <stdint.h>
#include <string.h>

void print_double_bits(double x) {
    uint64_t bits;
    memcpy(&bits, &x, 8);   // strict-aliasing–safe byte copy
    printf("sign=%llu  exp=%llu  mantissa=%llu\n",
           (bits >> 63) & 0x1,
           (bits >> 52) & 0x7FF,
           bits & 0x000FFFFFFFFFFFFFULL);
}

int main(void) {
    print_double_bits(1.0);
    print_double_bits(0.1);   // not exactly representable
    print_double_bits(1e15);
    return 0;
}
```

```bash
gcc -o bits bits.c && ./bits
```

For `0.1`, the mantissa bits will not be all zeros — that alone tells you `0.1` is irrational in base 2.

### Catastrophic Cancellation

When two nearly equal floating-point numbers are subtracted, their leading significant bits cancel exactly, and what remains is dominated by rounding noise from earlier operations. The relative error of the *result* can be orders of magnitude larger than the relative error of either *operand*.

Concretely: if $a$ and $b$ each have relative error $\epsilon_{\text{mach}}$, then $a - b$ has absolute error $\approx 2\epsilon_{\text{mach}} \cdot |a|$, but the relative error of $a - b$ is:

$$\frac{2\epsilon_{\text{mach}} \cdot |a|}{|a - b|}$$

When $|a - b| \ll |a|$, this ratio is enormous. For $a = b$ in floating-point, it is infinite — the result is zero with 100% relative error.

The remedy is algebraic reformulation to avoid the subtraction. $\sqrt{x+1} - \sqrt{x}$ cancels catastrophically for large $x$; multiplying and dividing by the conjugate gives the equivalent $\frac{1}{\sqrt{x+1} + \sqrt{x}}$, which is a sum of nearly equal numbers rather than a difference — no cancellation occurs.

### Numerical Stability

An algorithm is *numerically stable* if rounding errors introduced at each step do not amplify through subsequent steps. Stability is a property of the *algorithm*, not the *problem*. The same linear system $Ax = b$ can be solved stably (LU decomposition with partial pivoting) or unstably (Gaussian elimination without pivoting, which can multiply errors by a factor exponential in matrix size for adversarial inputs).

The *condition number* $\kappa(A) = \|A\| \cdot \|A^{-1}\|$ measures the problem's inherent sensitivity: a relative perturbation $\delta$ in $b$ causes a relative change of at most $\kappa(A) \cdot \delta$ in $x$. If $\kappa(A) = 10^{12}$, you lose 12 decimal digits of accuracy regardless of algorithm. No stable algorithm can recover information the problem itself destroyed.

The relationship between condition number, algorithm stability, and achievable accuracy:

$$\text{digits lost} \approx \log_{10}(\kappa) + \log_{10}(\text{amplification factor of algorithm})$$

For a well-conditioned problem ($\kappa \approx 1$) with a stable algorithm, you lose almost nothing. For an ill-conditioned problem with an unstable algorithm, the result may be pure noise.

### Iterative Methods and Convergence

When no closed form exists, construct a sequence $x_0, x_1, x_2, \ldots$ converging to the true answer. Newton's method for $f(x) = 0$:

$$x_{n+1} = x_n - \frac{f(x_n)}{f'(x_n)}$$

Near a simple root where $f'$ does not vanish, this converges *quadratically*:

$$|e_{n+1}| \leq C \cdot |e_n|^2, \qquad C = \frac{|f''(x^*)|}{2|f'(x^*)|}$$

Each step roughly doubles the number of correct digits. Starting with 1 correct digit: after 5 Newton steps you have $\sim 2^5 = 32$ correct digits — more than double precision can represent. This is why `libm` implementations use a polynomial approximation to get within $2^{-10}$, then apply one or two Newton steps to reach full precision rather than iterating from scratch.

Contrast with *linear* convergence where $|e_{n+1}| \leq r \cdot |e_n|$ for fixed $r < 1$. To gain 16 decimal digits from a method with $r = 0.5$ requires $\log_2(10^{16}) \approx 53$ iterations. Newton needs 4–5. The cost per iteration must be weighed against convergence rate, but for smooth functions Newton's $O(\log(1/\epsilon))$ iterations is almost always worth it.

---

## How It Works

### Euler's Summation Formula and Controlled Approximation

$H_n = \sum_{k=1}^{n}
