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

Every system that allocates scarce resources must solve an optimization problem, whether or not it calls it that. The Linux kernel's CPU scheduler must maximize throughput while keeping latency bounded. A compiler's register allocator must minimize memory spills subject to a fixed number of registers. A TCP congestion controller must maximize bandwidth while keeping packet loss below a threshold. When these systems fail — when the scheduler causes jitter, when the allocator thrashes, when TCP oscillates — the failure is usually an optimization gone wrong: the objective function didn't capture the real goal, the algorithm got stuck in a local minimum, or constraints were violated silently. Understanding optimization from first principles means you can read these systems and reason about why they make the choices they do.

## Core Concepts

### Objective Functions

An objective function $f(x)$ is the quantity you are trying to minimize or maximize. The choice of what to optimize *is* the design decision — everything else follows from it.

The Linux CFS scheduler minimizes the spread of virtual runtimes across runnable tasks:

$$\Delta_{\text{vrt}} = \max_i(\text{vruntime}_i) - \min_i(\text{vruntime}_i)$$

That single choice encodes fairness: a task with the smallest `vruntime` always runs next, so no task can accumulate a CPU advantage. The scheduler doesn't directly minimize latency or maximize throughput — those are consequences. It minimizes $\Delta_{\text{vrt}}$ because that quantity is *computable at decision time* from data already in the red-black tree of runnable tasks. Latency is not observable until after the fact.

This constraint — the objective must be measurable at decision time — explains many seemingly indirect design choices throughout the kernel. The OOM killer scores processes via `/proc/$pid/oom_score` using a formula that weights RSS and ancestry rather than "actual harm to the user" because the latter is unmeasurable.

```bash
# See what the OOM killer knows about a running process
cat /proc/$(pgrep firefox | head -1)/oom_score
cat /proc/$(pgrep firefox | head -1)/oom_score_adj
```

### Constraints

A constraint is a condition that every valid solution must satisfy. Constraints come in two forms:

- **Equality constraints**: $g(x) = 0$ — the solution must lie on a surface. Example: the total weight of tasks assigned to CPUs must equal the total number of runnable tasks.
- **Inequality constraints**: $h(x) \leq 0$ — the solution must lie on one side of a boundary. Example: a cgroup's memory usage must not exceed its configured limit.

The **feasible set** is the intersection of all constraints. When the feasible set is empty, the problem is *infeasible* — no solution exists satisfying all constraints simultaneously. The kernel OOM killer is the response to infeasibility: when no allocation strategy can satisfy all memory requests without exceeding physical limits, the kernel resolves infeasibility by forcibly shrinking the constraint set — it kills a process to free memory, making the problem feasible again.

```bash
# Inspect cgroup memory constraints (cgroup v2)
cat /sys/fs/cgroup/system.slice/memory.max
cat /sys/fs/cgroup/system.slice/memory.current

# Trigger a controlled OOM in a memory-limited scope
systemd-run --scope -p MemoryMax=50M stress --vm 1 --vm-bytes 200M
```

### Convexity

A function $f$ is convex if for any two points $x, y$ and any $\lambda \in [0,1]$:

$$f(\lambda x + (1-\lambda)y) \leq \lambda f(x) + (1-\lambda)f(y)$$

The chord between any two points on the graph lies *above or on* the graph. Equivalently, for twice-differentiable $f$, convexity requires $\nabla^2 f(x) \succeq 0$ — the Hessian is positive semidefinite everywhere.

Convexity matters because of one structural consequence: **every local minimum of a convex function is a global minimum**. Gradient descent on a convex function converges to the answer. Greedy algorithms work. You never need to ask "is there something better elsewhere?" because convexity guarantees there isn't.

Non-convexity breaks this guarantee. Compiler register allocation is a graph coloring problem — NP-hard and deeply non-convex. The allocator uses heuristics precisely because the optimization landscape has many local minima and no tractable path to the global one. When you see a system using simulated annealing, genetic algorithms, or random restarts, you're seeing the system acknowledge that its objective is non-convex and local search is unreliable.

### Local vs. Global Minima

A point $x^*$ is a **local minimum** if $f(x^*) \leq f(x)$ for all $x$ in some neighborhood $\|x - x^*\| < \epsilon$. It is a **global minimum** if $f(x^*) \leq f(x)$ for all $x$ in the feasible set.

For convex functions these coincide by definition. For non-convex functions they diverge. The first-order necessary condition for a local minimum is $\nabla f(x^*) = 0$ — a stationary point. But stationary points include saddle points and local maxima, not just minima. Gradient descent stopping at $\nabla f = 0$ doesn't tell you which kind you found.

The practical consequence: a greedy algorithm on a non-convex landscape stops at the first valley it reaches, which may be far from the deepest one. The kernel's `blk-mq` I/O scheduler uses heuristics to batch and reorder requests because the optimal global ordering is NP-hard to find; it accepts a locally good solution fast rather than searching for the global optimum.

## How It Works

### Unconstrained Minimization: Gradient Descent

For a differentiable $f: \mathbb{R}^n \to \mathbb{R}$, the gradient $\nabla f(x)$ points in the direction of steepest increase. Gradient descent steps opposite to it:

$$x_{k+1} = x_k - \alpha \nabla f(x_k)$$

where $\alpha > 0$ is the step size. At convergence, $\nabla f(x^*) = 0$.

The step size $\alpha$ matters precisely. If $\alpha$ is too large relative to the curvature of $f$, the iterate overshoots the minimum and diverges. For a quadratic $f(x) = \frac{1}{2}x^T A x - b^T x$ with $A$ positive definite, convergence is guaranteed when $\alpha < \frac{2}{\lambda_{\max}(A)}$, where $\lambda_{\max}$ is the largest eigenvalue of $A$. High curvature requires small steps; flat regions permit larger ones. Adaptive step sizes (line search, Adam, Adagrad) exist because a single fixed $\alpha$ is rarely optimal across the whole landscape.

**Example**: Minimize $f(x) = x^2 - 4x + 5$. Completing the square: $f(x) = (x-2)^2 + 1$, so the global minimum is $f(2) = 1$.

$$\nabla f(x) = 2x - 4, \qquad x_{k+1} = x_k - \alpha(2x_k - 4) = (1 - 2\alpha)x_k + 4\alpha$$

The update is a linear contraction toward $x = 2$ with rate $(1 - 2\alpha)$. Convergence requires $|1 - 2\alpha| < 1$, i.e., $\alpha \in (0, 1)$. At $\alpha = 0.5$ the method converges in one step; at $\alpha = 1$ it diverges.

```python
def gradient_descent(f_prime, x0, alpha=0.1, steps=50, tol=1e-9):
    x = x0
    for k in range(steps):
        grad = f_prime(x)
        x_new = x - alpha * grad
        if abs(x_new - x) < tol:
            print(f"Converged at step {k}")
            break
        x = x_new
    return x

f_prime = lambda x: 2*x - 4  # gradient of (x-2)^2 + 1

for alpha in [0.1, 0.49, 0.5, 0.99, 1.01]:
    result = gradient_descent(f_prime, x0=10.0, alpha=alpha)
    print(f"alpha={alpha:.2f}  ->  x ≈ {result:.6f}")
```

Run this and observe: at $\alpha = 0.5$ convergence is immediate; at $\alpha = 0.99$ convergence is slow and oscillatory; at $\alpha = 1.01$ it diverges. This is the same instability that makes poorly-tuned control loops in hardware drivers oscillate.

### Constrained Optimization: Lagrange Multipliers

For equality constraints $g(x) = 0$, Lagrange multipliers convert a constrained problem into an unconstrained one. To minimize $f(x)$ subject to $g(x) = 0$, form the Lagrangian:

$$\mathcal{L}(x, \lambda) = f(x) + \lambda g(x)$$

Setting both partial derivatives to zero:

$$\nabla_x \mathcal{L} = \nabla f(x) + \lambda \nabla g(x) = 0$$
$$\nabla_\lambda \mathcal{L} = g(x) = 0$$

The first equation says: at the constrained optimum, $\nabla f$ and $\nabla g$ are parallel — there is no feasible direction that improves $f$. The multiplier $\lambda$ is not just a bookkeeping variable; it equals $-\frac{df^*}{db}$ where $b$ is the right-hand side of the constraint $g(x) = b$. It measures the *sensitivity* of the optimal objective to relaxing the constraint. In resource allocation, $\lambda$ is the shadow
