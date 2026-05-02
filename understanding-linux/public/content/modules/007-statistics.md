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

Every time Linux reports a CPU usage percentage, a network latency, or a disk throughput number, that number is an estimate derived from a sample. If you don't understand variance, you misread those numbers — you treat noise as signal, conclude a system is broken when it isn't, or miss a real performance regression because your measurement technique was too noisy to detect it. Tools like `perf`, `iostat`, and `ftrace` don't just collect data; they compute statistics over it. Understanding what those statistics *mean* — and what can go wrong — is the difference between debugging a system and guessing at one.

---

## Core Concepts

### Expected Value

The **expected value** $EX$ of a random variable $X$ is its probability-weighted average:

$$EX = \sum_{x} x \cdot \Pr(X = x)$$

For a fair die, $EX = 7/2 = 3.5$ — a value the die never shows, but the right anchor for reasoning about long runs. In systems terms: if a syscall takes 1 µs with probability 0.9 and 100 µs with probability 0.1 (a cache miss), its expected cost is $0.9 \cdot 1 + 0.1 \cdot 100 = 10.9$ µs. The common case dominates probability, but the rare case dominates cost.

### Variance

Variance measures how spread out a distribution is around its mean:

$$VX = E\!\left[(X - EX)^2\right]$$

The computational identity — mean of the square minus square of the mean — is:

$$VX = E(X^2) - (EX)^2$$

This is more than algebraic convenience. It separates two independent contributions to spread: the raw magnitude of $X^2$ and the centering effect of $(EX)^2$. A distribution with all mass at a single point has $E(X^2) = (EX)^2$, so $VX = 0$. A distribution centered at zero has $EX = 0$, so $VX = E(X^2)$ directly — the variance *is* the mean squared value.

Standard deviation $\sigma = \sqrt{VX}$ restores units. If latency is in microseconds, variance is in µs² and standard deviation is in µs — the quantity you can directly compare to the mean.

### Independence and Variance Addition

When $X$ and $Y$ are **independent**:

$$V(X + Y) = VX + VY$$

This works because independence eliminates the covariance term: $V(X+Y) = VX + VY + 2\,\text{Cov}(X,Y)$, and $\text{Cov}(X,Y) = 0$ when $X \perp Y$. When they're *not* independent — high CPU load causing I/O to spike, for instance — the covariance term is nonzero and the additive decomposition breaks. This is exactly why correlating `%iowait` with `%user` in `iostat` output requires more than summing their individual variances.

### Sampling and Estimation

The sample mean $\bar{X} = \frac{1}{n}\sum_{i=1}^n X_i$ estimates $EX$. Its variance:

$$V\bar{X} = \frac{VX}{n}$$

This follows directly from variance addition applied to independent, identically distributed samples: $V\!\left(\frac{1}{n}\sum X_i\right) = \frac{1}{n^2}\cdot n\cdot VX$. The standard error $\sigma/\sqrt{n}$ is what shrinks when you average more measurements. To halve the error, you need four times as many samples — a $\sqrt{n}$ law you will hit repeatedly in benchmarking.

### Confidence Intervals

A 95% confidence interval $[\bar{X} - \delta,\, \bar{X} + \delta]$ is constructed so that, under repeated sampling, 95% of such intervals contain the true mean. The half-width:

$$\delta = z_{0.025} \cdot \frac{\sigma}{\sqrt{n}}$$

where $z_{0.025} \approx 1.96$ for a normal distribution. If you don't know $\sigma$, you substitute the sample standard deviation $s$ and use a $t$-distribution with $n-1$ degrees of freedom — which matters when $n < 30$.

---

## How It Works

### The Shortcut Variance Formula

Expanding from the definition with $\mu = EX$:

$$VX = E\!\left[(X - \mu)^2\right] = E\!\left[X^2 - 2X\mu + \mu^2\right] = E(X^2) - 2\mu \cdot \mu + \mu^2 = E(X^2) - \mu^2$$

**Example — lottery:** Win \$0 with probability 0.98, \$100M with probability 0.02.

$$EX = 0.98 \cdot 0 + 0.02 \cdot 10^8 = 2 \times 10^6$$

$$E(X^2) = 0.98 \cdot 0 + 0.02 \cdot 10^{16} = 2 \times 10^{14}$$

$$VX = 2\times10^{14} - (2\times10^6)^2 = 2\times10^{14} - 4\times10^{12} = 1.96\times10^{14}$$

$$\sigma = \sqrt{1.96\times10^{14}} = 1.4\times10^7$$

The standard deviation is $14M — seven times the mean. The expected value says "buy the ticket"; the standard deviation says "but understand you almost certainly get nothing." Both are true simultaneously, which is exactly the kind of reasoning you need when interpreting tail latency in production systems.

### Variance of the Sample Mean

If latency observations $X_1, \ldots, X_n$ are i.i.d. with mean $\mu$ and variance $\sigma^2$:

$$\bar{X} = \frac{1}{n}\sum_{i=1}^{n} X_i, \qquad V\bar{X} = \frac{\sigma^2}{n}, \qquad \text{SE} = \frac{\sigma}{\sqrt{n}}$$

Running `perf stat` once gives you one sample. Running it ten times and averaging gives you a standard error $\sqrt{10}\approx 3.16\times$ smaller. The variance of the underlying syscall doesn't change — you're just estimating its mean more precisely.

### Hashing: Variance in Expected Probe Count

For a hash table with $m$ slots and $n$ elements, uniform search probability $s_k = 1/n$, the variance of the average successful search time across all possible hash tables is:

$$V_A = \frac{(m-1)(n-1)}{2m^2 n}$$

This is a nontrivial cancellation — terms involving $\sum k^2$, $\sum k$, and constants collapse into three factors. The intuition is exact: $m$ large means fewer collisions per slot, directly reducing spread; $n$ large means more elements contributing to the average, reducing variance through the $1/n$ factor.

For non-uniform search — you look up some keys far more often than others — the general form is:

$$V_A = \frac{m-1}{m^2} \sum_{k=1}^{n} s_k^2 \cdot k(k-1)$$

The $s_k^2$ term is what hurts. If one key has $s_k = 0.9$ and the rest share $0.1$, that one term dominates the sum quadratically. This is the formal statement of why hot-key skew in hash tables degrades performance: it's not just that the hot key is slow, it's that it inflates the variance of *every* lookup's expected cost.

### Simple Regression

Given pairs $(x_i, y_i)$, linear regression finds $\hat{a}, \hat{b}$ minimizing the sum of squared residuals:

$$\sum_{i=1}^{n}(y_i - \hat{a} - \hat{b}\, x_i)^2$$

Setting partial derivatives to zero and solving yields the least-squares estimates:

$$\hat{b} = \frac{\sum_{i=1}^n(x_i - \bar{x})(y_i - \bar{y})}{\sum_{i=1}^n(x_i - \bar{x})^2}, \qquad \hat{a} = \bar{y} - \hat{b}\,\bar{x}$$

The numerator of $\hat{b}$ is the sample covariance (unnormalized); the denominator is the sample variance of $x$ (unnormalized). So $\hat{b} = \hat{\text{Cov}}(x,y) / \hat{V}x$ — the slope is exactly how much $y$ co-varies with $x$, normalized by $x$'s own spread.

In performance analysis, $x$ might be request concurrency and $y$ latency in milliseconds. The slope $\hat{b}$ tells you the marginal latency cost of one additional concurrent request. The residual variance — the variance the linear model does *not* explain — tells you whether you're missing a nonlinear term (e.g., a queuing knee) or a confounding variable.

```python
import numpy as np

# Latency vs. concurrency: synthetic but realistic shape
concurrency = np.array([1, 2, 4, 8, 16, 32], dtype=float)
latency_ms  = np.array([2.1, 2.3, 2.9, 4.5, 8.1, 15.9])

x_bar = concurrency.mean()
y_bar = latency_ms.mean()

b_hat = (np.sum((concurrency - x_bar) * (latency_ms - y_bar)) /
         np.sum((concurrency - x_bar)**2))
a_hat = y_
