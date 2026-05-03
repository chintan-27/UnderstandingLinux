---
id: 6
title: "Probability"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every time the Linux kernel picks an ephemeral port, salts a hash table, schedules a process with jitter, or generates a cryptographic key, it is relying on probability with *predictable long-run structure*. Without a formal model of random variables, you cannot reason about whether your hash function resists collision attacks, whether your load balancer will saturate one CPU, or whether `/dev/urandom` is supplying entropy with the right distribution. The math here is operational: a kernel developer who does not understand variance will write hash tables that perform fine on average but catastrophically on adversarial input — exactly the kind of attack CVE-2011-4868 exploited against the Linux network stack's hash seed.

---

## Core Concepts

### Sample Space and Probability

A **probability space** consists of a sample space $\Omega$ of elementary outcomes, each with probability $\Pr(\omega) \geq 0$, normalized so:

$$\sum_{\omega \in \Omega} \Pr(\omega) = 1$$

The probability of a compound event $A \subseteq \Omega$ is $\Pr(A) = \sum_{\omega \in A} \Pr(\omega)$. Every other construct — random variables, expectations, generating functions — is a function defined on this space.

### Random Variables

A **random variable** $X$ is a function $X : \Omega \to \mathbb{R}$. The randomness is in $\omega$; $X$ is a deterministic measurement of the outcome. When we write $\Pr(X = x)$, we mean:

$$\Pr(X = x) = \sum_{\substack{\omega \in \Omega \\ X(\omega) = x}} \Pr(\omega)$$

This distinction matters when you compose random variables — for instance, the number of hash collisions in a bucket is a function of which keys were inserted, not a primitive quantity.

### Expected Value

The **expected value** of $X$ is:

$$EX = \sum_{\omega \in \Omega} X(\omega) \cdot \Pr(\omega) = \sum_{x} x \cdot \Pr(X = x)$$

Expectation is **linear**: $E(aX + bY) = aEX + bEY$ for any constants $a, b$ and *any* $X, Y$, regardless of dependence. Independence is not required. This is what makes expectation so broadly useful — you can decompose a complicated quantity into a sum of simple indicator variables and take expectations termwise.

For example, the expected number of hash collisions is the sum over all key pairs of the probability that pair collides. Each term is simple; independence of the pairs is not assumed.

### Variance

Expectation tells you the center; **variance** tells you the spread. Two distributions with the same mean can have radically different tail behavior.

$$VX = E\left[(X - EX)^2\right]$$

The computationally useful form — *mean of the square minus square of the mean* — follows by expanding and applying linearity:

$$VX = E(X^2) - (EX)^2$$

The **standard deviation** $\sigma_X = \sqrt{VX}$ is in the same units as $X$. When the standard deviation is large relative to the mean, the average is a poor predictor of any individual outcome. This is precisely the situation with hash table bucket depths under adversarial input.

### Independence

$X$ and $Y$ are **independent** if and only if:

$$\Pr(X = x \text{ and } Y = y) = \Pr(X = x) \cdot \Pr(Y = y) \quad \text{for all } x, y$$

Independence gives two payoffs that do *not* hold in general:

- $E(XY) = (EX)(EY)$
- $V(X + Y) = VX + VY$

The second means variance is additive for independent variables. Averaging $n$ independent, identically distributed variables with variance $\sigma^2$ gives a result with variance $\sigma^2/n$ — uncertainty shrinks as $1/\sqrt{n}$. This is why taking multiple timing samples and averaging them reduces measurement noise in `perf`.

### Conditional Probability and Bayes' Theorem

The **conditional probability** of $A$ given $B$:

$$\Pr(A \mid B) = \frac{\Pr(A \cap B)}{\Pr(B)}$$

This is not a belief update by convention — it is the only definition consistent with probability being a ratio of favorable to total outcomes when you restrict attention to the world where $B$ has occurred.

**Bayes' theorem** follows immediately by symmetry of $\Pr(A \cap B)$:

$$\Pr(A \mid B) = \frac{\Pr(B \mid A) \cdot \Pr(A)}{\Pr(B)}$$

You observe $B$ (evidence); you want $\Pr(A \mid B)$ (posterior); you know $\Pr(B \mid A)$ (likelihood) and $\Pr(A)$ (prior). The denominator $\Pr(B) = \Pr(B \mid A)\Pr(A) + \Pr(B \mid \neg A)\Pr(\neg A)$ normalizes. This structure underlies kernel intrusion detection heuristics and packet classification: observed traffic patterns are evidence; the inference target is "is this a scan?"

### The Binomial Distribution

$n$ independent trials, each succeeding with probability $p$, produce a count $X$ with:

$$\Pr(X = k) = \binom{n}{k} p^k (1-p)^{n-k}, \quad 0 \leq k \leq n$$

$$EX = np, \qquad VX = np(1-p)$$

The variance is maximized at $p = 1/2$ — fair coin flips are the most unpredictable binary process. At $p = 1/m$ with large $m$ (sparse events), the binomial approximates a **Poisson distribution** with mean $\lambda = np$, which governs rare-event counts: interrupts per millisecond, TCP retransmissions per second, hash bucket collisions with a good hash function.

### Probability Generating Functions

The **probability generating function (pgf)** of a non-negative integer-valued random variable $X$ is:

$$P(z) = E(z^X) = \sum_{k \geq 0} \Pr(X = k) \cdot z^k$$

The coefficients encode the distribution. Derivatives at $z = 1$ recover moments:

$$EX = P'(1), \qquad VX = P''(1) + P'(1) - [P'(1)]^2$$

The central payoff: if $X$ and $Y$ are independent, then:

$$P_{X+Y}(z) = P_X(z) \cdot P_Y(z)$$

Multiplication of pgfs corresponds to addition of independent random variables. This is the generating-function proof that binomial variances add, and it underlies the analysis of hash chains, coupon-collector problems, and occupancy distributions.

---

## How It Works

### Variance: The Computational Shortcut Derived

The formula $VX = E(X^2) - (EX)^2$ is not an approximation — it follows directly from expanding the definition:

$$VX = E\left[(X - EX)^2\right] = E\left[X^2 - 2X \cdot EX + (EX)^2\right]$$

$$= E(X^2) - 2(EX)(EX) + (EX)^2 = E(X^2) - (EX)^2$$

**Example.** $X = 0$ with probability $0.98$, $X = 100$ with probability $0.02$:

$$EX = 0.98 \cdot 0 + 0.02 \cdot 100 = 2$$

$$E(X^2) = 0.98 \cdot 0 + 0.02 \cdot 10000 = 200$$

$$VX = 200 - 4 = 196, \qquad \sigma_X = 14$$

The standard deviation is seven times the mean. Any system dimensioned for the average will be overwhelmed 2% of the time — which, at kernel interrupt rates, is millions of events per second.

### Why Independence Makes Variance Additive

For arbitrary $X$ and $Y$:

$$V(X + Y) = E\left[(X+Y)^2\right] - (E(X+Y))^2$$

$$= E(X^2) + 2E(XY) + E(Y^2) - (EX)^2 - 2(EX)(EY) - (EY)^2$$

$$= VX + VY + 2\underbrace{\left[E(XY) - (EX)(EY)\right]}_{\text{Cov}(X,Y)}$$

When $X \perp Y$, $E(XY) = (EX)(EY)$, so $\text{Cov}(X,Y) = 0$ and $V(X+Y) = VX + VY$.

When $X$ and $Y$ are *not* independent — for example, two hash probes into the same table where one collision increases the probability of another — the covariance term is nonzero and the simple additive formula breaks down. Ignoring this is a common source of incorrect load estimates.

### The Binomial Distribution via PGFs

A single Bernoulli trial has pgf $H(z) = (1-p) + pz$. For $n$ independent trials, independence makes the pgf a product:

$$P(z) = H(z)^n = \left[(1-p) + pz\right]^n = \sum_{k=0}^{n} \binom{n}{k} p^k (1-p)^{n-k} z^k$$

The binomial probabilities appear as coefficients — no separate derivation needed. Differentiating:

$$P'(z) = np\left[(1-p) + pz\right]^{n-1} \implies EX = P'(1) = np$$
