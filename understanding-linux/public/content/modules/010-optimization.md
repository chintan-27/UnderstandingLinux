---
id: 10
title: "Optimization"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

The Linux kernel's CFS scheduler maintains a red-black tree of runnable tasks ordered by virtual runtime. Its objective is to minimize the maximum deviation from perfectly fair CPU sharing — a precise mathematical goal. When it selects the next task, it picks the leftmost node: the process with the smallest accumulated $v_{runtime}$. That selection policy *is* an optimization algorithm, running thousands of times per second, on every core, without ever calling it that.

Every non-trivial kernel policy is an optimization problem in disguise: page replacement minimizes future fault rate given a fixed memory budget; the TCP congestion window maximizes throughput subject to a loss-rate constraint; the I/O scheduler minimizes seek distance subject to deadline constraints. The math below is not background reading — it is a description of what the kernel is already doing.

---

## Core Concepts

### Objective Functions

An **objective function** $f(\mathbf{x})$ maps a configuration vector to a scalar score. The discipline is naming it precisely before writing any code, because the choice of objective determines everything downstream.

$$f(\mathbf{x}) : \mathbb{R}^n \to \mathbb{R}$$

CFS uses virtual runtime as its objective. For a process $i$ with weight $w_i$ derived from its nice value, the virtual runtime accumulates as:

$$v_i = \frac{\Delta t_i}{w_i}$$

where $\Delta t_i$ is wall-clock CPU time consumed. Scheduling picks $\arg\min_i v_i$ — literally gradient descent on a priority queue. The weight mapping from nice value $n$ is:

$$w(n) = \frac{1024}{1.25^n}$$

so each nice-level step changes weight by 25%, meaning a one-unit nice increase doubles the virtual runtime increment for equal wall time. That factor of 1.25 is not arbitrary — it produces approximately equal perceived latency across the nice range.

---

### Constraints

A **constrained optimization** problem has the form:

$$\min_{\mathbf{x}} f(\mathbf{x}) \quad \text{subject to} \quad g_i(\mathbf{x}) \leq 0, \quad h_j(\mathbf{x}) = 0$$

Inequality constraints ($g_i \leq 0$) bound the feasible region. Equality constraints ($h_j = 0$) pin the solution to a lower-dimensional surface.

In the memory allocator, the hard constraint is:

$$\sum_{i} \text{allocated}_i \leq \text{MemTotal}$$

This is enforced in the kernel via the `vm.overcommit_memory` sysctl. With `overcommit_memory=2`, the constraint becomes:

$$\text{committed} \leq \text{MemTotal} + \text{SwapTotal} \times \text{overcommit\_ratio}$$

Violating this constraint does not produce a mathematical error — it produces an OOM kill. The optimizer (the allocator) fails when it ignores the constraint boundary.

---

### Convexity

A function $f$ is **convex** if for all $x, y$ in its domain and all $\lambda \in [0,1]$:

$$f(\lambda x + (1-\lambda)y) \leq \lambda f(x) + (1-\lambda)f(y)$$

The operationally important consequence: **on a convex function over a convex feasible region, every local minimum is a global minimum**. Any descent algorithm is therefore *correct*, not merely heuristic. This is why convexity matters — it is the condition under which you can trust your optimizer.

Non-convex problems have no such guarantee. Cache eviction policy optimization is non-convex because the hit rate as a function of eviction decisions has multiple local optima depending on the access pattern. Kernel developers work around this with heuristics (LRU, CLOCK, ARC) precisely because the true optimum is intractable.

---

### Local vs. Global Minima

A **local minimum** $\mathbf{x}^*$ satisfies $f(\mathbf{x}^*) \leq f(\mathbf{x})$ for all $\mathbf{x}$ in some open ball $B(\mathbf{x}^*, \epsilon)$. A **global minimum** satisfies it over the entire feasible region.

The implication for systems code: if your tuning algorithm converges, you need to know which kind of minimum it found. A TCP congestion control algorithm that hill-climbs on throughput may converge to a local optimum that is stable but suboptimal — CUBIC and BBR differ precisely in their assumptions about the shape of the throughput landscape and where descent will terminate.

For convex $f$: local minimum $\Rightarrow$ global minimum.
For non-convex $f$: convergence $\not\Rightarrow$ correctness.

---

## How It Works

### Gradient Descent

For differentiable $f$, the gradient $\nabla f(\mathbf{x})$ points in the direction of steepest *increase* in $f$. The update rule steps opposite to it:

$$\mathbf{x}_{k+1} = \mathbf{x}_k - \alpha \nabla f(\mathbf{x}_k)$$

The learning rate $\alpha$ determines step size. For a quadratic $f(x) = x^2$, the update becomes:

$$x_{k+1} = x_k - \alpha \cdot 2x_k = x_k(1 - 2\alpha)$$

This is a geometric series. It converges to $x^* = 0$ exactly when $|1 - 2\alpha| < 1$, i.e., $\alpha \in (0, 1)$. The convergence rate per step is $|1 - 2\alpha|$ — minimized at $\alpha = 0.5$, where the series collapses in one step. For $\alpha > 1$, the iterates diverge. This is not tuning intuition; it follows directly from the recurrence.

After $k$ steps starting at $x_0$:

$$x_k = x_0 (1 - 2\alpha)^k$$

The number of steps to reach $|x_k| < \epsilon$ is:

$$k > \frac{\ln(\epsilon / |x_0|)}{\ln|1 - 2\alpha|}$$

```python
def gradient_descent(grad, x0, alpha=0.1, tol=1e-9, max_iter=10000):
    x = x0
    for k in range(max_iter):
        g = grad(x)
        x_new = x - alpha * g
        if abs(x_new - x) < tol:
            return x_new, k
        x = x_new
    return x, max_iter

# f(x) = x^2, grad = 2x. Optimal alpha = 0.5 converges in 1 step.
for alpha in [0.1, 0.5, 0.9, 1.1]:
    result, steps = gradient_descent(lambda x: 2*x, x0=10.0, alpha=alpha)
    print(f"alpha={alpha}: converged to {result:.2e} in {steps} steps")
```

The `alpha=1.1` case diverges — the loop hits `max_iter`. This is the overshoot condition made concrete.

---

### Constrained Optimization: Lagrange Multipliers

For an equality constraint $g(\mathbf{x}) = 0$, form the **Lagrangian**:

$$\mathcal{L}(\mathbf{x}, \lambda) = f(\mathbf{x}) + \lambda \cdot g(\mathbf{x})$$

The necessary condition $\nabla \mathcal{L} = 0$ gives:

$$\nabla f(\mathbf{x}^*) = -\lambda \nabla g(\mathbf{x}^*)$$

This says the gradients are parallel at the optimum: any infinitesimal move that reduces $f$ also violates $g$. You are at the boundary, and the constraint is active.

Concrete example: allocate CPU time $x_i \geq 0$ to $n$ processes to minimize total weighted latency $\sum w_i / x_i$ subject to $\sum x_i = C$ (total CPU capacity). The Lagrangian is:

$$\mathcal{L} = \sum_{i=1}^n \frac{w_i}{x_i} + \lambda\left(\sum_{i=1}^n x_i - C\right)$$

Setting $\partial \mathcal{L}/\partial x_i = 0$:

$$-\frac{w_i}{x_i^2} + \lambda = 0 \implies x_i^* = \sqrt{\frac{w_i}{\lambda}}$$

Using the constraint $\sum x_i^* = C$:

$$x_i^* = C \cdot \frac{\sqrt{w_i}}{\sum_j \sqrt{w_j}}$$

Higher-weight processes get more CPU, but the allocation scales as $\sqrt{w_i}$, not $w_i$. This is a quantitatively different policy than proportional allocation — and it is optimal under the stated objective.

---

### Convexity Verification: The Hessian

For a scalar function, $f''(x) \geq 0$ everywhere confirms convexity. For multivariate $f$, the **Hessian** must be positive semi-definite (all eigenvalues $\geq 0$):

$$H_{ij} = \frac{\partial^2 f}{\partial x_i \partial x_j}$$

Numerically, approximate the Hessian using the four-point finite difference formula:

$$H_{ij} \approx \frac{f(\mathbf{x}+\mathbf{e}_i+\mathbf{e}_j) - f(\mathbf{x}+\mathbf{e}_i-\mathbf{e}_j) - f(\mathbf{x}-\mathbf{e}_i+\mathbf{e}_j) + f(\mathbf{x
