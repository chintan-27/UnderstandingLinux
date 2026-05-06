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

## Core Concepts
### Random Variables
A **random variable** \(X\) is a measurable function \(X:\Omega\to\mathbb{R}\) from a probability space \((\Omega,\mathcal{F},\mathbb{P})\) to the real line. Measurability means that for every Borel set \(B\subseteq\mathbb{R}\), the pre‑image \(X^{-1}(B)\in\mathcal{F}\); this guarantees that probabilities \(\mathbb{P}(X\in B)\) are well‑defined.  

- **Discrete**: \(\Omega\) is countable; \(X\) takes values in a set \(\{x_i\}\) with probability mass function (pmf) \(p_X(x_i)=\mathbb{P}(X=x_i)\).  
- **Continuous**: \(\Omega\) is uncountable; \(X\) admits a probability density function (pdf) \(f_X(x)\) such that \(\mathbb{P}(a\le X\le b)=\int_a^b f_X(x)\,dx\). The pdf satisfies \(f_X(x)\ge0\) and \(\int_{-\infty}^{\infty}f_X(x)\,dx=1\).

The distinction matters because expectations and variances are computed by sums for discrete variables and integrals for continuous ones.

### Expectation
The **expectation** (or mean) of \(X\) is the Lebesgue integral  
\[
\mathbb{E}[X]=\int_{\Omega} X(\omega)\,d\mathbb{P}(\omega)
           =\begin{cases}
                \sum_i x_i\,p_X(x_i) & \text{discrete}\\[4pt]
                \int_{-\infty}^{\infty} x\,f_X(x)\,dx & \text{continuous}
            \end{cases}
\]
Linearity follows directly from the integral: \(\mathbb{E}[aX+bY]=a\mathbb{E}[X]+b\mathbb{E}[Y]\) for constants \(a,b\).  
Expectation is the *center of mass* of the distribution; it is the point where the probability‑weighted moments balance.

### Variance
The **variance** measures dispersion around the mean:
\[
\operatorname{Var}(X)=\mathbb{E}\!\big[(X-\mathbb{E}[X])^2\big]
                    =\mathbb{E}[X^2]-\big(\mathbb{E}[X]\big)^2 .
\]
The second equality is obtained by expanding the square and using linearity of expectation.  
For a discrete variable,
\[
\operatorname{Var}(X)=\sum_i (x_i-\mu)^2 p_X(x_i),\qquad \mu=\mathbb{E}[X],
\]
and for a continuous variable the sum becomes an integral. Variance is always non‑negative; \(\operatorname{Var}(X)=0\) iff \(X\) is almost surely constant.

### Distributions
A **distribution** completely describes the law of a random variable. Common families:

| Distribution | Support | PMF/PDF | Mean | Variance |
|--------------|---------|---------|------|----------|
| Bernoulli(\(p\)) | \(\{0,1\}\) | \(p_X(1)=p,\;p_X(0)=1-p\) | \(p\) | \(p(1-p)\) |
| Binomial(\(n,p\)) | \(\{0,\dots,n\}\) | \(\displaystyle p_X(k)=\binom{n}{k}p^k(1-p)^{n-k}\) | \(np\) | \(np(1-p)\) |
| Poisson(\(\lambda\)) | \(\{0,1,2,\dots\}\) | \(\displaystyle p_X(k)=\frac{e^{-\lambda}\lambda^k}{k!}\) | \(\lambda\) | \(\lambda\) |
| Uniform(\(a,b\)) | \([a,b]\) | \(f_X(x)=\frac{1}{b-a}\) | \(\frac{a+b}{2}\) | \(\frac{(b-a)^2}{12}\) |
| Normal(\(\mu,\sigma^2\)) | \(\mathbb{R}\) | \(f_X(x)=\frac{1}{\sqrt{2\pi\sigma^2}}e^{-(x-\mu)^2/(2\sigma^2)}\) | \(\mu\) | \(\sigma^2\) |

Each distribution arises from a specific modeling assumption (e.g., Bernoulli for a single yes/no trial, Binomial for \(n\) independent Bernoulli trials, Poisson for rare events in a fixed interval).

### Independence
Two random variables \(X,Y\) are **independent** iff their joint distribution factorises:
\[
\mathbb{P}(X\in A,\,Y\in B)=\mathbb{P}(X\in A)\,\mathbb{P}(Y\in B)
\quad\forall A,B\in\mathcal{B}(\mathbb{R}).
\]
Equivalently, for discrete variables \(p_{X,Y}(x,y)=p_X(x)p_Y(y)\); for continuous variables \(f_{X,Y}(x,y)=f_X(x)f_Y(y)\).  
Independence implies \(\mathbb{E}[XY]=\mathbb{E}[X]\mathbb{E}[Y]\) and \(\operatorname{Var}(X+Y)=\operatorname{Var}(X)+\operatorname{Var}(Y)\) because the covariance term vanishes.

### Conditional Probability
Given an event \(B\) with \(\mathbb{P}(B)>0\), the conditional probability of \(A\) is
\[
\mathbb{P}(A\mid B)=\frac{\mathbb{P}(A\cap B)}{\mathbb{P}(B)} .
\]
For random variables, the conditional distribution of \(X\) given \(Y=y\) is defined (when it exists) by
\[
f_{X\mid Y}(x\mid y)=\frac{f_{X,Y}(x,y)}{f_Y(y)} .
\]
Conditional expectation \(\mathbb{E}[X\mid Y]\) is a random variable that is the best predictor of \(X\) in the mean‑square sense given the information in \(Y\).

### Bayes’ Theorem
Starting from the definition of conditional probability for both orders,
\[
\mathbb{P}(A\mid B)=\frac{\mathbb{P}(A\cap B)}{\mathbb{P}(B)},
\qquad
\mathbb{P}(B\mid A)=\frac{\mathbb{P}(A\cap B)}{\mathbb{P}(A)},
\]
we solve for \(\mathbb{P}(A\cap B)\) in the second expression and substitute:
\[
\boxed{\;\mathbb{P}(A\mid B)=\frac{\mathbb{P}(B\mid A)\,\mathbb{P}(A)}{\mathbb{P}(B)}\;}
\]
The denominator can be expanded via the law of total probability:
\[
\mathbb{P}(B)=\sum_i \mathbb{P}(B\mid A_i)\,\mathbb{P}(A_i)
\]
when \(\{A_i\}\) partitions the sample space.

---

## How It Works
### Linear Expectation and Variance of Sums
For any random variables \(X_1,\dots,X_n\) and constants \(a_i\),
\[
\mathbb{E}\!\Big[\sum_{i=1}^n a_i X_i\Big]=\sum_{i=1}^n a_i\,\mathbb{E}[X_i].
\]
Proof: linearity of the integral (or sum) follows directly from the definition.

The variance of a sum expands to
\[
\operatorname{Var}\!\Big[\sum_{i=1}^n X_i\Big]
   =\sum_{i=1}^n \operatorname{Var}(X_i)
    +2\sum_{1\le i<j\le n}\!\operatorname{Cov}(X_i,X_j),
\]
where \(\operatorname{Cov}(X_i,X_j)=\mathbb{E}[X_iX_j]-\mathbb{E}[X_i]\mathbb{E}[X_j]\).  
If the variables are independent, all covariances vanish and the variance reduces to the sum of individual variances—a key simplification used in many algorithms (e.g., estimating error of Monte‑Carlo averages).

### Law of Total Probability and Conditional Expectation
For any partition \(\{B_j\}\) of \(\Omega\) with \(\mathbb{P}(B_j)>0\),
\[
\mathbb{E}[X]=\sum_j \mathbb{E}[X\mid B_j]\,\mathbb{P}(B_j).
\]
This is obtained by writing \(\mathbb{E}[X]=\int X\,d\mathbb{P}\) and splitting the integral over each \(B_j\).  
It underlies algorithms that condition on observed data (e.g., Expectation‑Maximization).

### From Bayes to Naïve Bayes Classification
If we model features \(X_1,\dots,X_d\) as conditionally independent given class \(C\),
\[
\mathbb{P}(C\mid \mathbf{x})\propto \mathbb{P}(C)\prod_{i=1}^d \mathbb{P}(X_i=x_i\mid C).
\]
The independence assumption yields a computationally cheap classifier that works surprisingly well for text and network traffic.

---

## Worked Examples
### Example 1: Expectation of a Discrete Variable
Let \(X\) take values \(\{1,2,3\}\) with probabilities \(\{0.2,0.3,0.5\}\).

**Step‑by‑step**  
1. Write the definition: \(\displaystyle \mathbb{E}[X]=\sum_{x} x\,p_X(x)\).  
2. Plug in each term:  
   - \(1\times0.2 = 0.2\)  
   - \(2\times0.3 = 0.6\)  
   - \(3\times0.5 = 1.5\)  
3. Sum: \(0.2+0.6+1.5 = 2.3\).  

\[
\boxed{\mathbb{E}[X]=2.3}
\]

### Example 2: Variance of the Same Variable
Using \(\mu=\mathbb{E}[X]=2.3\).

**Step‑by‑step**  
1. Compute squared deviations:  
   - \((1-2.3)^2 = (-1.3)^2 = 1.69\)  
   - \((2-2.3)^2 = (-0.3)^2 = 0.09\)  
   - \((3-2.3)^2 = (0.7)^2 = 0.49\)  
2. Weight by probabilities:  
   - \(1.69\times0.2 = 0.338\)  
   - \(0.09\times0.3 = 0.027\)  
   - \(0.49\times0.5 = 0.245\)  
3. Sum: \(0.338+0.027+0.245 = 0.610\).  

\[
\boxed{\operatorname{Var}(X)=0.61}
\]

(Notice the alternative formula \(\mathbb{E}[X^2]-\mu^2\) gives the same result: \(\mathbb{E}[X^2]=1^2\cdot0.2+2^2\cdot0.3+3^2\cdot0.5=0.2+1.2+4.5=5.9\); then \(5.9-2.3^2=5.9-5.29=0.61\).)

### Example 3: Bayes’ Theorem with Numbers
Given: \(\mathbb{P}(A)=0.4\), \(\mathbb{P}(B)=0.6\), \(\mathbb{P}(B\mid A)=0.8\).

**Step‑by‑step**  
1. Compute numerator: \(\mathbb{P}(B\mid A)\mathbb{P}(A)=0.8\times0.4=0.32\).  
2. Divide by \(\mathbb{P}(B)\): \(0.32/0.6 = 0.533\overline{3}\).  

\[
\boxed{\mathbb{P}(A\mid B)=0.533\text{ (approximately)}}
\]

If we wanted to verify via the law of total probability, we would need \(\mathbb{P}(B\mid A^c)\); assuming \(\mathbb{P}(B\mid A^c)=0.5\) gives \(\mathbb{P}(B)=0.8\cdot0.4+0.5\cdot0.6=0.32+0.30=0.62\), which would slightly change the result—highlighting the importance of knowing the full partition.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Treating \(\mathbb{E}[X^2]\) as \((\mathbb{E}[X])^2\)** | Only true when \(X\) is constant; generally \(\mathbb{E}[X^2]\ge(\mathbb{E}[X])^2\) by Jensen’s inequality (variance ≥ 0). | Compute \(\mathbb{E}[X^2]\) directly from the distribution, or use \(\operatorname{Var}(X)=\mathbb{E}[X^2]-(\mathbb{E}[X])^2\). |
| 2 | **Assuming pairwise independence ⇒ mutual independence** | Pairwise independence does not guarantee that the joint distribution factorises; counter‑example: three binary variables where each pair is independent but the triple is not. | Verify the full joint factorisation or use known constructions (e.g., mutual independence requires all \(2^n\) joint probabilities to equal the product of marginals). |
| 3 | **Using the pdf value as a probability** | For continuous variables, \(f_X(x)\) is a density; \(\mathbb{P}(X=x)=0\). Probabilities are obtained by integrating over intervals. | To find \(\mathbb{P}(a\le X\le b)\), integrate \(f_X\) from \(a\) to \(b\). Use the pdf only for expectation or likelihood calculations. |
| 4 | **Applying Bayes’ theorem without checking \(\mathbb{P}(B)>0\)** | The formula involves division by \(\mathbb{P}(B)\); if \(\mathbb{P}(B)=0\) the conditional probability is undefined (or defined via limits). | Ensure the conditioning event has positive probability; if it may be zero, work with regular conditional probabilities or use limiting arguments. |
| 5 | **Ignoring covariance when summing variances** | \(\operatorname{Var}(X+Y)=\operatorname{Var}(X)+\operatorname{Var}(Y)+2\operatorname{Cov}(X,Y)\). Assuming independence when it does not hold underestimates variance. | Compute covariance (or correlation) explicitly, or verify independence via joint distribution before dropping the term. |

---

## Exercises
1. **Easy** – Let \(X\sim\text{Bernoulli}(p=0.7)\). Compute \(\mathbb{E}[X]\) and \(\operatorname{Var}(X)\).  
2. **Medium** – Suppose \(X\) and \(Y\) are independent with \(\mathbb{E}[X]=3,\ \operatorname{Var}(X)=2\) and \(\mathbb{E}[Y]=-1,\ \operatorname{Var}(Y)=5\). Find \(\mathbb{E}[2X-3Y]\) and \(\operatorname{Var}(2X-3Y)\).  
3. **Hard** – A system generates packets according to a Poisson process with rate \(\lambda=2\) packets/ms. Each packet is dropped independently with probability \(p=0.1\). Let \(N\) be the number of packets arriving in a 10 ms interval and \(D\) the number of dropped packets.  
   a) Determine the distribution of \(N\).  
   b) Determine the distribution of \(D\) (hint: use thinning of a Poisson process).  
   c) Compute \(\mathbb{E}[D]\) and \(\operatorname{Var}(D)\).  

---

## Linux Connection
Probability is not just abstract; it is baked into the kernel, utilities, and security subsystems.

### Random Number Generation
- **`/dev/random`** and **`/dev/urandom`** provide access to the kernel’s entropy pool.  
  - `/dev/random` blocks when the estimated entropy falls below the requested number of bits.  
  - `/dev/urandom` never blocks; it re‑seeds a CSPRNG (ChaCha20) when entropy is low.  

```bash
# Check current available entropy (in bits)
cat /proc/sys/kernel/random/entropy_avail

# Pull 256 bits of non‑blocking random data
dd if=/dev/urandom bs=32 count=1 of=urandom.bin status=none
hexdump -C urandom.bin
```

- The **`getrandom(2)`** syscall (available since Linux 3.17) lets a program request random bytes without dealing with device files:

```c
#include <sys/random.h>
#include <unistd.h>
#include <stdio.h>

int main(void) {
    unsigned char buf[16];
    ssize_t n = getrandom(buf, sizeof(buf), 0);
    if (n == -1) {
        perror("getrandom");
        return 1;
    }
    for (size_t i = 0; i < n; ++i)
        printf("%02x", buf[i]);
    putchar('\n');
    return 0;
}
```

Compile with `gcc -Wall -O2 getrand.c -o getrand`.

### Probabilistic Algorithms in Userspace
- **`shuf`** implements Fisher–Yates shuffle to produce a uniform random permutation.  
- **`awk`** can compute sample moments from data collected via `/dev/urandom`:

```bash
# Generate 10 000 uniform floats in [0,1) and compute sample mean
awk 'BEGIN { s=0; for(i=1;i<=10000;i++) s+=rand(); print s/10000 }'
```

- **`rngtest`** (from `rng-tools`) applies statistical tests (FIPS 140‑2) to verify that a source behaves like a true RNG:

```bash
rngtest < /dev/urandom
```

### Probability in Kernel Subsystems
| Subsystem | Probabilistic Mechanism | Example |
|-----------|------------------------|---------|
| **CFS Scheduler** | Uses a *virtual runtime* (`vruntime`) that is updated proportionally to the slice of CPU time; tasks with lower `vruntime` are more likely to be selected, approximating *weighted fair queuing* — a stochastic priority system. | `cat /proc/sched_debug` shows per‑task `vruntime`. |
| **Network Stack (Random Early Detection – RED)** | Packet drop probability is a function of average queue length; early random dropping mitigates TCP global synchronization. | `sysctl -n net.ipv4.tcp_available_congestion_control` shows `reno`, `cubic`; RED can be enabled via `tc qdisc add dev eth0 root handle 1: red ...`. |
| **Memory Overcommit** | The kernel allows `malloc` to succeed beyond physical RAM, relying on the probability that not all allocated pages will be touched. Overcommit ratio is tunable via `/proc/sys/vm/overcommit_memory` and `/proc/sys/vm/overcommit_ratio`. | `cat /proc/sys/vm/overcommit_memory` (0 = heuristic, 1 = always, 2 = never). |
| **Filesystem Journaling (ext4)** | When committing a transaction, ext4 may probabilistically delay flushing metadata to batch writes, reducing I/O at the small risk of increased data loss on power failure. | Controlled by `/sys/fs/ext4/<dev>/commit_interval`. |

### Practical Exercise: Estimating Entropy via Compression
A rough entropy estimator: compress a sample and compare size.

```bash
# 1 MiB of urandom
dd if=/dev/urandom of=rand.bin bs=1M count=1 status=none
# Compress with gzip (level 1)
gzip -1 -c rand.bin > rand.gz
# Ratio close to 1 indicates high entropy
orig=$(stat -c%s rand.bin)
comp=$(stat -c%s rand.gz)
echo "Compression ratio: $comp/$orig = $(awk "BEGIN {printf \"%.3f\", $comp/$orig}")"
```

If the ratio is significantly < 1, the source may be biased or low‑entropy.

---

## Why This Matters
Probability gives us a **principled language for uncertainty** that appears at every layer of a Linux system:

- **Correctness**: Randomized algorithms (e.g., hash tables, Bloom filters, probabilistic counters) rely on provable bounds that hold *in expectation* or with high probability. Misunderstanding variance or independence leads to under‑provisioned hash tables and unexpected collisions.  
- **Performance**: The CFS scheduler’s virtual runtime, TCP’s RED, and the overcommit heuristic all trade off deterministic guarantees for *average‑case* efficiency. Knowing how expectations and variances compose lets you tune sysctls (`vm.overcommit_ratio`, `net.core.rmem_max`) to hit target latency or throughput goals.  
- **Security**: Cryptographic primitives demand entropy that is *indistinguishable* from uniform. The distinction between `/dev/random` (blocking, entropy‑estimating) and `/dev/urandom` (non‑blocking, CSPRNG‑driven) is rooted in the probability of guessing internal state; misusing them can weaken key generation or nonce creation.  
- **Observability**: Tools like `perf`, `eBPF`, and `ftrace` often rely on statistical sampling. Interpreting their output requires grasping concepts such as confidence intervals, the law of large numbers, and the effect of sample variance on measurement error.  

By mastering the formal definitions (random variable, expectation, variance, independence, Bayes) and seeing how they manifest in concrete Linux mechanisms—device files, syscalls, scheduler metrics, and network queuing—you acquire the mental toolkit to **design, analyse, and troubleshoot** systems where randomness is not a nuisance but a fundamental resource. This bridges theory and practice, turning abstract probability into actionable insight for performance tuning, capacity planning, and secure system administration.
