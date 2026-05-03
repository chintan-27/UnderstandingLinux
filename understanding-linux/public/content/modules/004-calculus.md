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

Every performance-sensitive Linux subsystem is built on rates of change and accumulated quantities. The kernel's load average is a discrete solution to a continuous decay ODE. TCP's congestion window grows and shrinks according to a piecewise derivative. A PID controller in a motor driver computes a proportional term (the value), a derivative term (how fast it's changing), and an integral term (accumulated error) — get any one wrong and the system oscillates or stalls. Discrete sums and continuous integrals are two sides of the same coin: the kernel computes one where theory gives you the other, and knowing the relationship tells you *why* an approximation is good enough — or dangerously wrong.

---

## Core Concepts

### Limits: Stability at a Boundary

$$\lim_{x \to a} f(x) = L$$

means: for every tolerance $\varepsilon > 0$, there exists $\delta > 0$ such that $|x - a| < \delta \Rightarrow |f(x) - L| < \varepsilon$.

The $\varepsilon$-$\delta$ formulation is not ceremony. It forces a precise question: *does the system behave predictably near a boundary, and how tightly must I constrain the input to guarantee a given output tolerance?* A function with no limit at a point — left and right limits disagree, or the function oscillates infinitely — means the system at that boundary is unpredictable regardless of how carefully you approach it.

The Linux load average approaches but never reaches certain thresholds in a well-behaved system. When utilization approaches 1.0 on a single-core system under a Poisson arrival model, queue length diverges:

$$\lim_{\rho \to 1^-} \mathbb{E}[Q] = \lim_{\rho \to 1^-} \frac{\rho}{1-\rho} = \infty$$

This is not a coincidence — it is the $M/M/1$ queueing result, and it explains why a system at 95% CPU feels far worse than one at 90%.

### Derivatives: Instantaneous Rate of Change

$$f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}$$

You are asking: as the input perturbation $h$ shrinks to zero, what does the output ratio converge to? If the limit exists, the function is differentiable at $x$ and has a well-defined instantaneous rate. If it does not — because the function is discontinuous or has a corner — the derivative is undefined, which has physical meaning: the rate of change is not well-defined at that point.

**Key rules:**

- **Power rule:** $\dfrac{d}{dx} x^n = nx^{n-1}$
- **Chain rule:** $\dfrac{d}{dx} f(g(x)) = f'(g(x)) \cdot g'(x)$ — composed functions like $e^{-\lambda t^2}$ require this; you differentiate the outer function evaluated at the inner, times the derivative of the inner
- **Product rule:** $\dfrac{d}{dx}[f \cdot g] = f'g + fg'$

The chain rule is why exponential decay in the form $e^{-t/\tau}$ has derivative $-\frac{1}{\tau}e^{-t/\tau}$: the outer function is $e^u$ with derivative $e^u$, the inner function is $-t/\tau$ with derivative $-1/\tau$, and the product of those is the result. This is the derivative that determines how fast a thermal sensor reading falls after a CPU goes idle.

### Integrals: Accumulated Change

The definite integral is defined as a limit of Riemann sums — you partition $[a,b]$ into $n$ subintervals of width $\Delta x = (b-a)/n$ and sum:

$$\int_a^b f(x)\, dx = \lim_{n \to \infty} \sum_{k=0}^{n-1} f(a + k\Delta x)\cdot \Delta x$$

This construction is directly what `perf stat` does when it samples hardware counters at intervals and accumulates: it is a left Riemann sum with $\Delta x$ equal to the sampling period. The error of a Riemann sum approximation relative to the true integral is $O(\Delta x)$ for a left/right sum and $O(\Delta x^2)$ for the midpoint rule — this is why higher-frequency sampling gives proportionally more accurate energy accounting.

The **Fundamental Theorem of Calculus** connects the two operations:

$$\frac{d}{dx} \int_a^x f(t)\, dt = f(x)$$

Accumulation and differentiation are inverses. If you integrate the instantaneous power draw $P(t)$ over time, you get total energy consumed. If you then differentiate that accumulated energy with respect to time, you recover the instantaneous power. This is why RAPL energy counters in `/sys/class/powercap/` give you accumulated joules — differentiate numerically between two reads to get watts.

### Finite vs. Continuous Calculus: The Discrete Parallel

Computers are discrete machines, so it is worth making the analogy explicit. Define the **difference operator** $\Delta f(x) = f(x+1) - f(x)$, which plays the role of the derivative $D = d/dx$, and the **summation operator** $\sum$ as the anti-difference, playing the role of $\int$. The correspondence:

| Continuous | Discrete |
|---|---|
| $Df(x) = f'(x)$ | $\Delta f(x) = f(x+1) - f(x)$ |
| $\int f(x)\,dx$ | $\sum f(x)\,\delta x$ |
| $x^n$ | $x^{\underline{n}} = x(x-1)(x-2)\cdots(x-n+1)$ |
| $D(x^n) = nx^{n-1}$ | $\Delta(x^{\underline{m}}) = m \cdot x^{\underline{m-1}}$ |
| $\int_0^n x^m\,dx = \dfrac{n^{m+1}}{m+1}$ | $\displaystyle\sum_{0 \le k < n} k^{\underline{m}} = \dfrac{n^{\underline{m+1}}}{m+1}$ |

The **falling factorial** $x^{\underline{m}}$ is the natural basis for discrete calculus because differences of falling powers obey exactly the same rule as derivatives of ordinary powers. Ordinary powers do not have this property — $\Delta(k^2) \ne 2k$, but $\Delta(k^{\underline{2}}) = 2k^{\underline{1}}$, exactly as expected.

**Why this matters operationally:** when you analyze the time complexity of a loop that iterates over pairs, triples, or $m$-tuples of indices, expressing the count as a falling factorial sum gives you a closed form by mechanical anti-differencing, with no guessing or induction required.

### Partial Derivatives and the Gradient

When a function depends on multiple inputs, a partial derivative holds all but one variable fixed:

$$\frac{\partial f}{\partial x}(x, y) = \lim_{h \to 0} \frac{f(x+h, y) - f(x, y)}{h}$$

The **gradient** is the vector of all partial derivatives:

$$\nabla f = \left(\frac{\partial f}{\partial x_1}, \frac{\partial f}{\partial x_2}, \ldots, \frac{\partial f}{\partial x_n}\right)$$

It points in the direction of steepest increase of $f$. **Gradient descent** steps opposite the gradient to minimize a cost function:

$$x_{k+1} = x_k - \eta \,\nabla f(x_k)$$

where $\eta > 0$ is the step size (learning rate). The reason this works is that $-\nabla f$ is locally the direction of fastest decrease, so a small step in that direction is guaranteed to decrease $f$ — *provided the step is small enough* that the local linear approximation remains valid.

This appears in kernel parameter autotuning (e.g., BBR's bandwidth estimation), NUMA placement optimization, and any ML inference workload you run on Linux hardware.

### Taylor Expansion: Local Polynomial Approximation

Any function smooth enough to be differentiated $n$ times can be approximated near a point $a$ by:

$$f(x) = \sum_{k=0}^{n} \frac{f^{(k)}(a)}{k!}(x-a)^k + R_n(x)$$

where $R_n(x) = O\!\left((x-a)^{n+1}\right)$ is the remainder. Each term corrects the error left by all previous terms — the $k$-th term matches the $k$-th derivative of $f$ at $a$ exactly, and contributes nothing to any lower derivative.

Two practically critical truncations:

$$e^x \approx 1 + x + \frac{x^2}{2} \quad \text{for small } x$$

$$\sin\theta \approx \theta - \frac{\theta^3}{6} \quad \text{for small } \theta$$

The first-order approximation $e^x \approx 1 + x$ is why the Linux kernel's EWMA decay factor $e^{-1/n}$ is sometimes approximated as $1 - 1/n$ for fast fixed-point arithmetic — the relative error is $O(1/n^2)$, acceptable for large $n$.

### Ordinary Differential Equations

An ODE relates a function to its own derivatives. The simplest first-order linear ODE:

$$\frac{dy}{dt} = ky, \quad y(0) = y_0$$

has solution $y(t) = y_0 e^{kt}$. The solution exists and is unique because the ODE specifies the slope of $y$ at every point, and given a starting value you can integrate forward. For $k < 0$:
