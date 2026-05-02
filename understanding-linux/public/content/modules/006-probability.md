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

Every time the kernel picks an ephemeral port, a hash table distributes keys, or a load balancer assigns connections, the behavior is governed by probability distributions — and the difference between a system that *works* and one you can *prove* works under load is precisely whether you have quantified that behavior. Without variance, you cannot bound worst-case hash table degradation. Without Bayes, you cannot correctly update a belief from noisy sensor data. Without independence, you cannot decompose a complex system into analyzable parts.

---

## Core Concepts

### Sample Space and Random Variables

A **sample space** $\Omega$ is the set of all possible outcomes. A **random variable** $X : \Omega \to \mathbb{R}$ assigns a real number to each outcome. The probability of an event $R$ is:

$$\Pr(R) = \sum_{\omega \,:\, R(\omega) \text{ is true}} \Pr(\omega)$$

This is a weighted sum — the weights are probabilities, the terms are indicator values. The machinery never goes beyond this.

### Expected Value

The **expected value** is the probability-weighted average of all values $X$ can take:

$$EX = \sum_{\omega \in \Omega} X(\omega) \cdot \Pr(\omega) = \sum_{x} x \cdot \Pr(X = x)$$

The critical property is **linearity**: for any random variables $X$, $Y$ and constants $a$, $b$:

$$E(aX + bY) = a \cdot EX + b \cdot EY$$

This holds *regardless of whether $X$ and $Y$ are independent*. That is what makes it powerful. For two fair dice with sum $S = S_1 + S_2$, since $ES_1 = ES_2 = 7/2$, linearity gives $ES = 7$ directly — no enumeration of all 36 outcomes required.

### Variance

Expectation tells you where the distribution is centered. **Variance** tells you how far values typically stray from that center:

$$VX = E\!\left[(X - EX)^2\right]$$

Expanding the square and applying linearity yields the computational form:

$$VX = E(X^2) - (EX)^2$$

*The variance is the mean of the square minus the square of the mean.* Memorize this identity — it eliminates the need to center the variable before computing.

Unlike expectation, variance is **not** linear in general. For independent $X$ and $Y$:

$$V(X + Y) = VX + VY$$

but if $X$ and $Y$ are correlated, a covariance cross-term appears. The independence condition is what makes variance of sums tractable in system analysis.

### Independence

Random variables $X$ and $Y$ are **independent** if:

$$\Pr(X = x \;\text{and}\; Y = y) = \Pr(X = x) \cdot \Pr(Y = y) \quad \text{for all } x, y$$

Consequences that are used constantly in system analysis:

$$E(XY) = (EX)(EY) \qquad \text{(only under independence)}$$
$$V(X + Y) = VX + VY \qquad \text{(only under independence)}$$

The second equation is the reason you can analyze a pipeline of $n$ independent i.i.d. components with variance $\sigma^2$ each: the total variance is $n\sigma^2$, so the standard deviation of the sum grows as $\sqrt{n}$, not $n$. Averaging $n$ independent measurements reduces noise by a factor of $\sqrt{n}$ — this is why sampling and replication work.

### Probability Generating Functions

The **probability generating function** (PGF) of a non-negative integer-valued random variable $X$ is:

$$P(z) = \sum_{k \geq 0} \Pr(X = k) \cdot z^k = E(z^X)$$

The entire distribution is encoded in a single function. The coefficient of $z^k$ is exactly $\Pr(X = k)$. Mean and variance are recovered from derivatives evaluated at $z = 1$:

$$EX = P'(1), \qquad VX = P''(1) + P'(1) - \bigl[P'(1)\bigr]^2$$

The key structural fact: if $X$ and $Y$ are independent,

$$P_{X+Y}(z) = P_X(z) \cdot P_Y(z)$$

Convolution of distributions — the hard operation — becomes polynomial multiplication. This is why PGFs are the right tool for analyzing sums of independent discrete random variables, such as the total number of collisions in a hash table across all slots.

### Binomial Distribution

Repeat an independent Bernoulli trial $n$ times, each succeeding with probability $p$ and failing with probability $q = 1 - p$. The count of successes $K$ is:

$$\Pr(K = k) = \binom{n}{k} p^k q^{n-k}$$

The PGF is $(q + pz)^n$ — this follows directly from the binomial theorem and the independence of trials. Differentiating:

$$EK = np, \qquad VK = npq$$

Note that variance is maximized at $p = 1/2$ (maximum uncertainty) and collapses to zero at $p \in \{0, 1\}$ (no uncertainty). This is not a coincidence — it reflects the fact that $pq = p(1-p)$ is the variance of a single Bernoulli trial, and the $n$ trials multiply it linearly.

### Conditional Probability and Bayes' Theorem

The **conditional probability** of $A$ given that $B$ has occurred is defined as:

$$\Pr(A \mid B) = \frac{\Pr(A \cap B)}{\Pr(B)}$$

This is a definition, not a theorem. It rescales the probability measure to the subspace where $B$ is true.

**Bayes' theorem** rearranges this to update a prior belief about a cause $A$ after observing evidence $B$:

$$\Pr(A \mid B) = \frac{\Pr(B \mid A) \cdot \Pr(A)}{\Pr(B)}$$

The denominator expands via the law of total probability:

$$\Pr(B) = \Pr(B \mid A)\Pr(A) + \Pr(B \mid \neg A)\Pr(\neg A)$$

The interpretation: $\Pr(A)$ is your prior belief, $\Pr(B \mid A)$ is the likelihood of the evidence under that hypothesis, and $\Pr(A \mid B)$ is the posterior — your updated belief. Every spam filter, intrusion detection classifier, and Kalman filter is executing this update.

---

## How It Works

### Variance of Independent Sums: Derivation

Let $X$ and $Y$ be independent. Then:

$$V(X+Y) = E\!\left[(X+Y)^2\right] - \left[E(X+Y)\right]^2$$

Expand both terms:

$$= E(X^2) + 2E(XY) + E(Y^2) - (EX)^2 - 2(EX)(EY) - (EY)^2$$

Independence gives $E(XY) = (EX)(EY)$, so the cross terms cancel:

$$= \bigl[E(X^2) - (EX)^2\bigr] + \bigl[E(Y^2) - (EY)^2\bigr] = VX + VY$$

The cancellation is exact and depends entirely on independence. If $X$ and $Y$ are correlated, the cross terms leave a covariance residual $2\,\text{Cov}(X,Y)$.

### Hash Tables: Expected Probes and Variance via PGFs

Insert $n$ keys into a hash table with $m$ slots, assuming uniform independent hashing. For an **unsuccessful search**, you are counting how many keys land in a given slot — this is exactly a binomial with parameters $n$ and $p = 1/m$. The PGF of the probe count is:

$$P(z) = \left(\frac{m-1+z}{m}\right)^n = \left(1 - \frac{1}{m} + \frac{z}{m}\right)^n$$

From $EK = np$ and $VK = npq$:

$$E[\text{probes}] = \frac{n}{m} = \alpha \qquad \text{(load factor)}$$

$$V[\text{probes}] = \frac{n(m-1)}{m^2} = \alpha \cdot \frac{m-1}{m} \approx \alpha \quad \text{for large } m$$

For a **successful search**, the variance of the average probe count is:

$$V_A = \frac{(m-1)(n-1)}{2m^2 n}$$

This closed form arises from massive cancellation in the generating function algebra — a result that would be extraordinarily tedious to obtain by direct combinatorial argument. The PGF framework converts it into differentiation of a product of polynomials.

The practical consequence: at $\alpha = 0.75$ (a typical load factor for open-addressing hash tables), variance is approximately $0.75$, meaning the standard deviation of probe count is less than one. The distribution is tightly concentrated around its mean — but only because the hashing is independent and uniform. Correlated or adversarially chosen keys destroy this guarantee by violating the independence assumption.

### Bayes in Practice: Spam Filter

Let $S$ = "email is spam" and $W$ = "email contains the word 'lottery'". Given:

- $\Pr(S) = 0.40$ (prior: 40% of mail is spam)
- $\Pr(W \mid S) = 0.80$ (80% of spam contains this word)
- $\Pr(W \mid \neg S) = 0.05$ (5% of legitimate mail does)

Applying Bayes:

$$\Pr(S
