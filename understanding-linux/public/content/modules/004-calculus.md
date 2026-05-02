---
id: 4
title: "Calculus"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

A CPU scheduler decides how long each process runs. A congestion controller decides how fast to push packets. A thermal regulator decides when to throttle a core. All three are feedback systems: the current state determines how the state changes next. Calculus is the formal language for describing that relationship. Without derivatives, "rate of change" is undefined. Without integrals, you cannot accumulate a quantity over time. Without differential equations, you cannot model a system that responds to itself — which means CFS, CUBIC, and `thermald` are all special cases of ODE dynamics running on silicon.

---

## Core Concepts

### Limits

A limit asks: what value does $f(x)$ approach as $x$ approaches $a$, independent of whether $f(a)$ exists?

$$\lim_{x \to a} f(x) = L$$

This matters because the derivative — and therefore every rate-of-change quantity in systems work — is *defined as a limit*. Without it, "instantaneous rate" is a category error. The limit is not about the value at the point; it is about behavior in every punctured neighborhood around it.

### Derivatives

$$f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}$$

You are asking: for an infinitesimally small perturbation $h$ to the input, how much does the output move, per unit of $h$? The answer is itself a function — it gives you the slope at every point simultaneously.

The power rule is the most-used result in applied work:

$$\frac{d}{dx} x^n = n x^{n-1}$$

The chain rule handles composition, which appears constantly when one system's output feeds another's input:

$$\frac{d}{dx} f(g(x)) = f'(g(x)) \cdot g'(x)$$

### Integrals

The definite integral is the limit of a Riemann sum:

$$\int_a^b f(x)\, dx = \lim_{n \to \infty} \sum_{k=0}^{n-1} f(x_k)\,\Delta x, \quad \Delta x = \frac{b-a}{n}$$

It accumulates $f(x)\,dx$ — a product of *rate* and *interval width* — over the whole domain. Total CPU time consumed, total bytes transferred, total energy dissipated: all are integrals.

The **Fundamental Theorem of Calculus** is why computing antiderivatives solves the area problem:

$$\frac{d}{dx}\int_a^x f(t)\,dt = f(x)$$

Differentiation undoes integration. If you know an antiderivative $F$ with $F' = f$, then $\int_a^b f(x)\,dx = F(b) - F(a)$.

### Partial Derivatives

For $f(x_1, x_2, \ldots, x_n)$, the partial derivative with respect to $x_i$ holds all other inputs fixed:

$$\frac{\partial f}{\partial x_i} = \lim_{h \to 0} \frac{f(\ldots, x_i + h, \ldots) - f(\ldots, x_i, \ldots)}{h}$$

The gradient $\nabla f = \left(\frac{\partial f}{\partial x_1}, \ldots, \frac{\partial f}{\partial x_n}\right)$ points in the direction of steepest increase. Gradient descent moves opposite to $\nabla f$ to minimize $f$, which is how any system with multiple tunable parameters finds an optimum. Knowing which partial derivative is large tells you which input is worth tuning.

### Taylor Expansion

Any sufficiently smooth $f$ can be approximated near $a$ by a polynomial that matches $f$ and all its derivatives at that point:

$$f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!}(x-a)^n$$

Each term corrects the residual error left by all previous terms. Truncating after the linear term gives:

$$f(x) \approx f(a) + f'(a)(x-a), \quad \text{error} = O\!\left((x-a)^2\right)$$

This is *linear approximation*, and it is why control systems can use simple proportional feedback: for small deviations from setpoint, every smooth system looks linear. The $O((x-a)^2)$ bound tells you exactly how fast that approximation breaks down.

### Ordinary Differential Equations (ODEs)

An ODE relates a function to its own derivatives. The simplest feedback case:

$$\frac{dy}{dt} = k \cdot y, \quad y(0) = y_0 \implies y(t) = y_0 e^{kt}$$

When $k < 0$, this is exponential decay — the basis of TCP's multiplicative decrease and CPU frequency scaling cooldown. When $k > 0$, it is exponential growth — unchecked queue buildup, thermal runaway. The sign of $k$ determines stability. More realistic systems add damping:

$$\frac{d^2y}{dt^2} + 2\zeta\omega_n \frac{dy}{dt} + \omega_n^2 y = 0$$

This is the damped harmonic oscillator. $\zeta < 1$ gives oscillation (underdamped), $\zeta = 1$ gives the fastest non-oscillatory return to equilibrium (critically damped), $\zeta > 1$ gives sluggish return (overdamped). PID tuning is the engineering problem of choosing $\zeta$.

---

## How It Works

### The Finite Calculus Parallel

Standard calculus is built on limits over the reals. Finite calculus is built on differences over integers — exactly what hardware counters and discrete schedulers produce. The structures are exactly parallel:

| Continuous | Finite (Discrete) |
|---|---|
| Derivative $Df$ | Difference $\Delta f(x) = f(x+1) - f(x)$ |
| Antiderivative $\int$ | Antidifference $\sum$ |
| $\frac{d}{dx} x^n = n x^{n-1}$ | $\Delta x^{\underline{m}} = m\, x^{\underline{m-1}}$ |
| $\int_0^n x^m\,dx = \frac{n^{m+1}}{m+1}$ | $\sum_{0 \le k < n} k^{\underline{m}} = \frac{n^{\underline{m+1}}}{m+1}$ |
| $\int x^{-1}\,dx = \ln x$ | $\sum x^{\underline{-1}}\,\delta x = H_x$ |

The **falling factorial** $x^{\underline{m}} = x(x-1)(x-2)\cdots(x-m+1)$ is the discrete analog of $x^m$. It plays the same role in discrete sums that $x^m$ plays in continuous integrals — and the formulas are identical in structure, with no approximation required.

The **harmonic number** $H_x = \sum_{k=1}^{x} \frac{1}{k}$ is the discrete analog of $\ln x$. They differ by the Euler–Mascheroni constant:

$$H_n = \ln n + \gamma + O\!\left(\frac{1}{n}\right), \quad \gamma \approx 0.5772$$

This is not coincidental. The integral $\int_1^n \frac{1}{x}\,dx = \ln n$ approximates the sum $\sum_{k=1}^{n} \frac{1}{k}$; the constant $\gamma$ is the accumulated error of that approximation.

### Computing a Closed-Form Sum via Finite Calculus

To evaluate $\sum_{k=0}^{n-1} k^2$ exactly, convert to falling factorials first:

$$k^2 = k(k-1) + k = k^{\underline{2}} + k^{\underline{1}}$$

Apply the antidifference formula $\sum_{0 \le k < n} k^{\underline{m}} = \frac{n^{\underline{m+1}}}{m+1}$:

$$\sum_{k=0}^{n-1} k^2 = \frac{n^{\underline{3}}}{3} + \frac{n^{\underline{2}}}{2} = \frac{n(n-1)(n-2)}{3} + \frac{n(n-1)}{2}$$

Factor:

$$= \frac{n(n-1)}{6}\bigl[2(n-2) + 3\bigr] = \frac{n(n-1)(2n-1)}{6}$$

This is the classical formula, derived without induction, without guessing, purely by the discrete antidifference mechanism. The technique generalizes to any polynomial sum — express in falling factorials, apply the rule, expand.

### Taylor Expansion: Numerical Approximation

To approximate $\sqrt{1 + \epsilon}$ for small $\epsilon$, expand $(1+\epsilon)^{1/2}$ around $\epsilon = 0$. The $n$-th derivative of $(1+\epsilon)^{1/2}$ at $\epsilon = 0$ gives coefficients via the generalized binomial theorem:

$$\sqrt{1+\epsilon} = 1 + \frac{1}{2}\epsilon - \frac{1}{8}\epsilon^2 + \frac{1}{16}\epsilon^3 - \cdots$$

The error after $N$ terms is $O(\epsilon^N)$. For $|\epsilon| \ll 1$ this converges fast; for $|\epsilon| \approx 1$ many terms are needed and a different expansion point $a \ne 0$ would be preferable.

```python
import math
from itertools import accumulate

def sqrt_taylor_coeffs(n_terms: int) -> list[float]:
