---
id: 7
title: "Statistics"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every time Linux reports a CPU load average, a disk latency percentile, or a network throughput estimate, it is making a statistical claim about a process it can only partially observe. Without variance analysis, you cannot tell whether two benchmark runs differ because of a real performance difference or random noise. Without understanding estimation error, you will misread `/proc` data, draw false conclusions from `perf stat`, and write kernel patches that appear to improve performance but are actually measuring measurement artifacts. The math here is not decoration — it is the difference between knowing something and thinking you know something.

---

## Core Concepts

### Random Variables and Expected Value

A random variable $X$ is a function from a sample space to $\mathbb{R}$. Its **expected value** is the probability-weighted average:

$$EX = \sum_{x} x \cdot \Pr(X = x)$$

$E$ is **linear**: $E(aX + bY) = a\,EX + b\,EY$ for any constants $a, b$, regardless of whether $X$ and $Y$ are independent. This is not a special case — it holds always. Independence is only required when you want to factor products: $E(XY) = (EX)(EY)$ iff $X \perp Y$.

### Variance: The Spread of a Distribution

$$VX = E\left[(X - EX)^2\right]$$

Expanding via linearity of $E$ gives the computationally useful identity:

$$VX = E(X^2) - (EX)^2$$

"Mean of the square minus square of the mean." This matters because it decomposes variance into two expectations you can often compute separately or accumulate in a single pass over data, without first computing the mean.

The **standard deviation** $\sigma = \sqrt{VX}$ has the same units as $X$, which is why it appears in confidence intervals rather than variance.

### Independence and Variance Addition

If $X \perp Y$:

$$V(X + Y) = VX + VY$$

*Why:* $V(X+Y) = E[(X+Y)^2] - (E[X+Y])^2$. Expanding and using $E(XY) = (EX)(EY)$ under independence collapses the cross terms. When they are not independent, the cross terms survive as $2\,\text{Cov}(X,Y)$.

The practical consequence: averaging $n$ i.i.d. measurements each with variance $\sigma^2$ yields a sample mean with variance $\sigma^2/n$. Doubling your sample size shrinks the standard error by $1/\sqrt{2}$, not $1/2$. This is why going from 4 to 16 benchmark runs halves your uncertainty, not from 4 to 8.

### Estimation and Sampling

An **estimator** is a function of your sample that approximates a population parameter. Quality dimensions:

- **Bias**: $\text{Bias}(\hat\theta) = E\hat\theta - \theta$. Bias cannot be reduced by collecting more data. It is a property of your estimator's structure, not your sample size.
- **Variance**: fluctuation across different samples. Reducible by increasing $n$.
- **MSE** (mean squared error): $\text{MSE}(\hat\theta) = \text{Bias}^2 + V\hat\theta$. The full cost of using an estimator.

The sample mean $\bar{X} = \frac{1}{n}\sum_{i=1}^n X_i$ is unbiased for $EX$, with variance $\sigma^2/n$ under i.i.d. sampling.

The sample variance $s^2 = \frac{1}{n-1}\sum_{i=1}^n (X_i - \bar{X})^2$ divides by $n-1$, not $n$, because $\bar{X}$ is computed from the same data — one degree of freedom is consumed. Dividing by $n$ gives a biased estimator that systematically underestimates $\sigma^2$.

### Measurement Error

$$x_\text{measured} = x_\text{true} + \epsilon_\text{systematic} + \epsilon_\text{random}$$

- **Systematic error** (bias): a consistent offset. Averaging more samples does not help — you are averaging toward the wrong value.
- **Random error**: zero-mean noise, reducible by averaging.

In systems work, clock resolution, context-switch jitter, CPU frequency scaling, and cache thermal state all introduce *structured* error that does not average away cleanly. A benchmark that reports 10 ns latency on a system with 4 ns clock resolution is reporting noise, not signal.

---

## How It Works

### The Variance Computation in Detail

Starting from the definition:

$$VX = E\left[(X - \mu)^2\right] = E\left[X^2 - 2\mu X + \mu^2\right] = E(X^2) - 2\mu^2 + \mu^2 = E(X^2) - \mu^2$$

**Example — fair die:** $EX = 7/2$ and:

$$E(X^2) = \frac{1}{6}(1 + 4 + 9 + 16 + 25 + 36) = \frac{91}{6}$$

$$VX = \frac{91}{6} - \left(\frac{7}{2}\right)^2 = \frac{91}{6} - \frac{49}{4} = \frac{182 - 147}{12} = \frac{35}{12}$$

Standard deviation $\sigma \approx 1.708$. On a hardware performance counter, this is the kind of spread you would see if syscall latency were uniformly distributed over a 6-value range.

### Variance of a Sum — The Covariance Term

For arbitrary $X, Y$:

$$V(X + Y) = VX + VY + 2\,\text{Cov}(X, Y)$$

where $\text{Cov}(X,Y) = E(XY) - (EX)(EY)$.

In systems: CPU time and wall-clock time measured on the same benchmark run are positively correlated. If you form a metric like $T_\text{wall} - T_\text{cpu}$ to measure I/O wait, the variance is:

$$V(T_\text{wall} - T_\text{cpu}) = V T_\text{wall} + V T_\text{cpu} - 2\,\text{Cov}(T_\text{wall}, T_\text{cpu})$$

The covariance term *reduces* variance here, because when the CPU is slow, wall time also tends to be slow. Ignoring this and treating them as independent *overestimates* the noise in your I/O wait estimate.

### Hashing: A Concrete Variance Analysis

The *Concrete Mathematics* analysis of hash table probes gives a clean model for why variance matters in performance analysis. With $n$ keys inserted into a table of $m$ slots using linear probing, the variance of average successful search time is:

$$V_A = \frac{m-1}{m^2} \sum_{k=1}^{n} s_k^2\, k(k-1)$$

where $s_k$ is the probability that a random lookup targets the $k$-th inserted key. For uniform access ($s_k = 1/n$):

$$V_A = \frac{(m-1)(n-1)}{2m^2 n}$$

*Why does non-uniform access increase variance?* The $s_k^2$ weighting means that high-probability keys contribute quadratically to variance. A single key accessed with probability $p \gg 1/n$ dominates the sum. This is exactly the hot-key problem in kernel hash tables (e.g., the dentry cache).

```python
def hash_probe_variance(m, n, s=None):
    """
    Variance of average successful search time under linear probing.
    m: number of slots, n: number of keys
    s: search probabilities s_k (uniform if None)
    """
    if s is None:
        s = [1.0 / n] * n
    assert abs(sum(s) - 1.0) < 1e-9, "probabilities must sum to 1"

    total = sum(s[k-1]**2 * k * (k - 1) for k in range(1, n + 1))
    return ((m - 1) / m**2) * total

m, n = 10, 100
va_uniform  = hash_probe_variance(m, n)
va_formula  = (m - 1) * (n - 1) / (2 * m**2 * n)

# Hot-key: first key accessed 50% of the time
s_hot = [0.5] + [0.5 / (n - 1)] * (n - 1)
va_hot = hash_probe_variance(m, n, s_hot)

print(f"uniform (pgf):      {va_uniform:.6f}")
print(f"uniform (formula):  {va_formula:.6f}")
print(f"hot-key:            {va_hot:.6f}")
print(f"variance ratio:     {va_hot / va_uniform:.1f}x")
```

### Confidence Intervals from First Principles

Given $n$ i.i.d. samples, by the Central Limit Theorem:

$$\frac{\bar{X} - \mu}{\sigma / \sqrt{n}} \xrightarrow{d} \mathcal{N}(0,1)$$

A 95% confidence interval for $\mu$:

$$\bar{X} \pm 1.96 \cdot \frac{\sigma}{\sqrt{n}}$$

**Critical interpretation:** this does *not* mean there is a 95% chance $\mu$ lies in this specific interval. $\mu$ is a fixed unknown. The interval is random — it is a function of your sample. The correct reading: if you ran this sampling procedure repeatedly, 95% of the resulting intervals would contain $\mu$.

In practice $\sigma$ is unknown;
