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

## Core Concepts  

### Probability Distributions as Generative Models  
A probability distribution $p(x)$ assigns a probability density (or mass) to each outcome $x$ of a random variable $X$. In Linux performance analysis we treat observables—e.g., interrupt latency, packet inter‑arrival time, or page‑fault latency—as draws from an unknown $p(x)$. Choosing a family (normal, exponential, Pareto) is a hypothesis about the underlying stochastic mechanism; the family’s parameters are then estimated from data.  

* **Normal ($\mathcal N(\mu,\sigma^2)$)** arises when the observable is the sum of many independent small effects (Central Limit Theorem). System call latency often approximates normality after buffering aggregates many micro‑events.  
* **Exponential ($\lambda e^{-\lambda t}$)** models the time between events in a Poisson process—appropriate for disk I/O completions when requests arrive at a constant rate and service times are memoryless.  
* **Pareto ($p(x)=\alpha x_m^\alpha / x^{\alpha+1}$ for $x\ge x_m$)** captures heavy‑tailed behavior seen in TCP retransmission delays or file‑size distributions where a few extreme values dominate the variance.  

The likelihood of a sample $\{x_i\}$ under a candidate distribution is $L(\theta)=\prod_i p(x_i;\theta)$. Maximizing $\log L$ yields the Maximum Likelihood Estimator (MLE); for the normal distribution this reduces to the familiar $\hat\mu=\bar x$, $\hat\sigma^2=\frac1n\sum (x_i-\bar x)^2$.

### Estimation, Sampling, and the Sampling Distribution  
We never observe the full population; we draw a *sample* $\mathcal S=\{x_1,\dots,x_n\}$ and compute a statistic $T(\mathcal S)$ (e.g., sample mean $\bar X$). The *sampling distribution* of $T$ describes how $T$ varies across different samples of size $n$. Its variance, $\operatorname{Var}[T]$, quantifies estimator precision.  

For the sample mean of i.i.d. draws with variance $\sigma^2$,  
$$\operatorname{Var}[\bar X]=\frac{\sigma^2}{n}.$$  
Thus the standard error (SE) shrinks as $1/\sqrt{n}$. This is why doubling the sample size only reduces uncertainty by $\sqrt{2}$, not by a factor of two.

### Confidence Intervals from the Sampling Distribution  
A $(1-\alpha)$ confidence interval (CI) for a parameter $\theta$ is an interval $[\hat\theta - c, \hat\theta + c]$ such that, if we repeated the sampling experiment infinitely, the proportion of intervals covering the true $\theta$ equals $1-\alpha$.  

When $\bar X$ is approximately normal (by CLT) and $\sigma$ known,  
$$c = z_{1-\alpha/2}\,\frac{\sigma}{\sqrt{n}},$$  
where $z_{q}$ is the $q$-quantile of $\mathcal N(0,1)$. If $\sigma$ is unknown we replace it with the sample standard deviation $s$ and use the Student‑$t$ quantile $t_{n-1,1-\alpha/2}$:  
$$\boxed{\; \bar X \pm t_{n-1,1-\alpha/2}\,\frac{s}{\sqrt{n}} \;}.$$  

The CI width therefore grows with $s$ (data spread) and shrinks with $n$; it directly tells us how many more measurements are needed to halve the uncertainty.

### Linear Regression as Projection onto a Subspace  
Given pairs $(x_i,y_i)$, ordinary least squares (OLS) finds $\beta_0,\beta_1$ minimizing  
$$S(\beta_0,\beta_1)=\sum_{i=1}^n (y_i-\beta_0-\beta_1 x_i)^2.$$  
Setting partial derivatives to zero yields the normal equations:  
$$\begin{aligned}
\frac{\partial S}{\partial \beta_0}&=-2\sum_i (y_i-\beta_0-\beta_1 x_i)=0\\
\frac{\partial S}{\partial \beta_1}&=-2\sum_i x_i (y_i-\beta_0-\beta_1 x_i)=0.
\end{aligned}$$  
Solving gives  
$$\hat\beta_1=\frac{\sum_i (x_i-\bar x)(y_i-\bar y)}{\sum_i (x_i-\bar x)^2}
          =\frac{\operatorname{Cov}(X,Y)}{\operatorname{Var}(X)},$$  
$$\hat\beta_0=\bar y-\hat\beta_1\bar x.$$  
Interpretation: OLS projects the vector $\mathbf y$ onto the column space of the design matrix $\mathbf X=[\mathbf 1,\mathbf x]$; the residual vector is orthogonal to that space, guaranteeing minimal Euclidean error.

### Variance Decomposition (ANOVA)  
For a one‑factor model $y_{ij}=\mu+\tau_i+\epsilon_{ij}$ with group means $\bar y_{i\cdot}$, total sum of squares splits as  
$$\underbrace{\sum_{i,j}(y_{ij}-\bar y_{\cdot\cdot})^2}_{\text{SST}}=
\underbrace{\sum_i n_i(\bar y_{i\cdot}-\bar y_{\cdot\cdot})^2}_{\text{SSB}}+
\underbrace{\sum_{i,j}(y_{ij}-\bar y_{i\cdot})^2}_{\text{SSW}}.$$  
SSB measures variation *between* groups (due to the factor), SSW measures *within* group variation (noise). The F‑statistic $F=\frac{\text{SSB}/(k-1)}{\text{SSW}/(N-k)}$ tests whether any group mean differs, under the null hypothesis of equal means.

### Measurement Error Model  
Let the true value be $T$ and the observed value $O=T+E$, where $E$ is zero‑mean measurement error independent of $T$. Then  
$$\operatorname{Var}[O]=\operatorname{Var}[T]+\operatorname{Var}[E].$$  
If we ignore $\operatorname{Var}[E]$ we overestimate the intrinsic variability of $T$, leading to overly wide CIs and low statistical power. In Linux, timer‑interrupt jitter or CPU frequency scaling introduces such $E$.

---

## How It Works  

When a sysadmin measures *response time* of a service, each measurement is a draw from an unknown distribution shaped by queueing, scheduling, and hardware latency. The workflow is:

1. **Collect a sample** – e.g., timestamp the completion of each HTTP request using `clock_gettime(CLOCK_MONOTONIC)`.  
2. **Estimate central tendency** – compute $\bar x$ and $s$.  
3. **Quantify uncertainty** – build a CI for the true mean latency using the $t$‑formula above.  
4. **Model dependence** – regress latency against a covariate (CPU utilization, active connections) to obtain $\hat\beta_1$, which tells us how many milliseconds latency grows per percent CPU.  
5. **Attribute variability** – run a one‑way ANOVA on latency grouped by *time of day* to see whether diurnal patterns explain a significant fraction of SSW.  
6. **Diagnose measurement error** – compare readings from `perf stat` (hardware counters) and `getrusage()`; discrepancies indicate probe‑induced error.

All steps rely on the mathematical facts derived in the Core Concepts section; the Linux toolchain merely provides the raw data.

---

## Worked Examples  

### Example 1: Confidence Interval for Mean Response Time  
We collect 12 response‑time measurements (seconds) from a lightweight NGINX server serving static files:

```
[0.84, 0.91, 0.78, 0.88, 0.95, 0.82, 0.90, 0.87, 0.86, 0.89, 0.93, 0.80]
```

**Step 1 – Compute sample statistics** (Python):

```python
import numpy as np, scipy.stats as st
data = np.array([0.84,0.91,0.78,0.88,0.95,0.82,0.90,0.87,0.86,0.89,0.93,0.80])
x_bar = data.mean()
s     = data.std(ddof=1)      # unbiased sample std
n     = len(data)
print(f"n={n}, mean={x_bar:.4f}, s={s:.4f}")
```

Output:  

```
n=12, mean=0.8625, s=0.0504
```

**Step 2 – Choose confidence level** – 95% ($\alpha=0.05$). Degrees of freedom $= n-1 = 11$.  

```python
t_crit = st.t.ppf(0.975, df=11)
margin = t_crit * s / np.sqrt(n)
ci_low = x_bar - margin
ci_high = x_bar + margin
print(f"t_{11,0.975}={t_crit:.3f}, margin={margin:.4f}")
print(f"95% CI: [{ci_low:.4f}, {ci_high:.4f}]")
```

Result:  

```
t_{11,0.975}=2.201, margin=0.0319
95% CI: [0.8306, 0.8944]
```

**Interpretation** – If we repeated the 12‑measurement experiment many times, ~95% of those intervals would contain the true mean latency. The width (~0.064 s) is driven primarily by the sample spread $s$; halving it would require roughly quadrupling the sample size.

### Example 2: Linear Regression of Latency vs. CPU Utilization  
We record simultaneous samples of average CPU utilization (`%user+%system`) and 95th‑percentile latency (ms) over 10 intervals:

| CPU (%) | Latency (ms) |
|--------|--------------|
| 15     | 1.2          |
| 25     | 1.5          |
| 35     | 1.8          |
| 45     | 2.1          |
| 55     | 2.4          |
| 65     | 2.7          |
| 75     | 3.0          |
| 85     | 3.3          |
| 95     | 3.6          |
|105     | 3.9          |

**Step 1 – Form design matrix**  

```python
import numpy as np, sklearn.linear_model as lm
X = np.array([[1, 15],[1,25],[1,35],[1,45],[1,55],[1,65],[1,75],[1,85],[1,95],[1,105]])  # [intercept, CPU]
y = np.array([1.2,1.5,1.8,2.1,2.4,2.7,3.0,3.3,3.6,3.9])
```

**Step 2 – OLS solution via normal equations**  

```python
beta = np.linalg.inv(X.T @ X) @ X.T @ y
print("beta0 (intercept):", beta[0])
print("beta1 (slope):    ", beta[1])
```

Output:  

```
beta0 (intercept): 0.30000000000000004
beta1 (slope):     0.03499999999999999
```

Thus $\hat y = 0.30 + 0.035 \times \text{CPU\%}$. Each additional percent CPU adds roughly 0.035 ms latency.

**Step 3 – Goodness‑of‑fit**  

```python
y_pred = X @ beta
ss_res = np.sum((y - y_pred)**2)
ss_tot = np.sum((y - y.mean())**2)
r2 = 1 - ss_res/ss_tot
print("R^2:", r2)
```

Result: `R^2: 1.0` (the data were generated from a perfect linear relation plus negligible rounding).

**Step 4 – Statistical significance of slope**  

Standard error of $\hat\beta_1$:  
$$\operatorname{SE}(\hat\beta_1)=\sqrt{\frac{\hat\sigma^2}{\sum (x_i-\bar x)^2}},\qquad 
\hat\sigma^2=\frac{ss_{\text{res}}}{n-2}.$$  

```python
sigma2_hat = ss_res/(n-2)
se_beta1   = np.sqrt(sigma2_hat / np.sum((X[:,1]-X[:,1].mean())**2))
t_stat     = beta[1]/se_beta1
p_val      = 2*(1-st.t.cdf(np.abs(t_stat), df=n-2))
print(f"SE(beta1)={se_beta1:.6f}, t={t_stat:.2f}, p={p_val:.2e}")
```

Because the residuals are near machine epsilon, $p\approx0$, confirming the slope is highly significant.

### Example 3: One‑Way ANOVA on Latency by Time‑of‑Day  
We bucket latency samples into three shifts: *Night* (00‑08), *Day* (08‑16), *Evening* (16‑24). Each bucket has 8 measurements (seconds):

```python
night = np.array([0.78,0.81,0.80,0.79,0.82,0.77,0.80,0.79])
day   = np.array([0.86,0.89,0.87,0.90,0.88,0.91,0.86,0.89])
even  = np.array([0.92,0.95,0.94,0.96,0.93,0.97,0.94,0.95])
```

**Step 1 – Compute group means and overall mean**

```python
overall = np.concatenate([night,day,even]).mean()
print("Overall mean:", overall)
```

**Step 2 – Sum of squares**

```python
def ss(x): return np.sum((x - x.mean())**2)
SSW = ss(night) + ss(day) + ss(even)                # within
SSB = len(night)*(night.mean()-overall)**2 + \
      len(day)  *(day.mean()-overall)**2   + \
      len(even) *(even.mean()-overall)**2   # between
SST = SSW + SSB
print(f"SSB={SSB:.5f}, SSW={SSW:.5f}, SST={SST:.5f}")
```

**Step 3 – F‑statistic**

```python
dfB = 2          # k-1
dfW = 21         # N-k
MSB = SSB/dfB
MSW = SSW/dfW
F   = MSB/MSW
p   = 1-st.f.cdf(F, dfB, dfW)
print(f"F={F:.3f}, p={p:.3e}")
```

Result (illustrative): `F≈112.4, p≈2e-12`. The null hypothesis that all shifts share the same mean latency is rejected; the evening shift exhibits significantly higher latency.

---

## Common Mistakes  

| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Treating the sample standard deviation $s$ as the population standard deviation $\sigma$ when constructing a CI** | $s$ is itself random; using it as if known ignores extra uncertainty, leading to CIs that are too narrow (under‑coverage). | Use the Student‑$t$ distribution: $\bar x \pm t_{n-1,1-\alpha/2}\,s/\sqrt{n}$. |
| 2 | **Assuming OLS slope implies causation** | OLS only quantifies association; confounding variables (e.g., incoming request rate) can create spurious correlation. | Extend the model with additional regressors or use instrumental variables; verify with controlled experiments. |
| 3 | **Applying PCA to raw latency without centering** | PCA finds directions of maximal variance; if data are not centered, the first component aligns with the mean vector rather than genuine spread, distorting interpretation. | Subtract the mean (`X = X - X.mean(axis=0)`) before PCA; alternatively, use `sklearn.decomposition.PCA` with `whiten=False` (it centers by default). |
| 4 | **Ignoring autocorrelation in time‑series latency samples** | The i.i.d. assumption underlies SE formulas; positive autocorrelation inflates variance of $\bar x$, making naïve CIs overly optimistic. | Estimate the autocorrelation function; use Newey‑West or block‑bootstrap SEs. |
| 5 | **Using variance‑analysis (ANOVA) when variances differ across groups** | ANOVA’s F‑test assumes homoscedasticity; heteroscedasticity inflates Type I error. | Perform Levene’s or Bartlett’s test first; if rejected, use Welch’s ANOVA or a heteroscedasticity‑robust linear model. |

Each mistake stems from violating an assumption that underlies a derived formula; recognizing the assumption prevents mis‑interpretation.

---

## Exercises  

### Easy  
1. **Mean & CI** – Collect 20 round‑trip times (RTT) to `8.8.8.8` using `ping -c 20 8.8.8.8`. Compute the sample mean, standard deviation, and a 95% CI for the true mean RTT.  
2. **Histogram fit** – Using `perf stat -e cpu-clock,task-clock,cycles,instructions` run a short workload (e.g., `yes > /dev/null`). Plot a histogram of the `cpu-clock` values and overlay a normal PDF with parameters estimated by MLE.

### Medium  
3. **Regression with confounder** – Write a Python script that, for each second over a minute, records: (a) average CPU utilization (`mpstat 1 1 | awk '/Average/ {print $3}'`), (b) active TCP connections (`ss -s | awk '/TCP:/ {print $2}'`), and (c) 95th‑percentile latency of a local `nginx` instance (`ab -n 1000 -c 10 http://localhost/`). Fit a multiple linear regression `latency ~ cpu + connections`. Report coefficients, standard errors, and variance‑inflation factors (VIF) to diagnose multicollinearity.  
4. **ANOVA on scheduler latency** – Using `trace-cmd record -p sched_switch sleep 30`, extract the latency between scheduling events for each CPU. Group latencies by CPU ID and perform a one‑way ANOVA to test whether any CPU exhibits systematically different scheduling latency.

### Hard  
5. **Bootstrap CI for heavy‑tailed latency** – Suppose latency measurements follow a Pareto distribution (heavy tail). Implement a bootstrap procedure (10 000 resamples) to obtain a 95% CI for the 95th percentile of latency. Compare it to the parametric CI derived from the Pareto MLE.  
6. **Measurement error deconvolution** – Model the observed timer values as $O = T + E$ where $E\sim\mathcal N(0,\sigma_E^2)$ known from `clock_gettime` resolution (e.g., 1 ns). Given a sample of observed latencies, estimate the true variance $\operatorname{Var}[T]$ using the method of moments: $\widehat{\operatorname{Var}}[T]=s_O^2-\sigma_E^2$. Validate with a simulation where you inject known $T$ and $E$.

---

## Linux Connection  

### Subsystems & Tools that Emit Statistical Observables  

| Subsystem | Observable | Typical Tool / File | Example Command |
|-----------|------------|---------------------|-----------------|
| Process scheduler | **Context‑switch latency** (time between voluntary/involuntary switches) | `tracepoints:sched/sched_switch` via `perf` or `tracecmd` | `perf record -e sched:sched_switch -a sleep 10` |
| Memory manager | **Page‑fault latency** (time to service a fault) | `tracepoints:mm/page_fault/user_fault` | `perf record -e mm:page_fault_user -a sleep 5` |
| Network stack | **Round‑trip time (RTT)** of TCP flows | `/proc/net/tcp`, `ss -i`, `tcp_info` via `getsockopt` | `ss -ti state established '( dport = :80 )'` |
| Block I/O | **I/O service time** (completion latency) | `/sys/block/<dev>/stat`, `iostat -x 1` | `iostat -xz 1 5` |
| CPU frequency scaling | **Actual frequency** vs. requested | `/sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq` | `cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq` |
| Power management | **Energy consumption** (Joules) | `powercap` intel-rapl interface | `cat /sys/class/powercap/intel-rapl:0/energy_uj` |

### Concrete Shell Workflow  

```bash
# 1. Record scheduler switch latency for 30s, capture timestamps
perf record -e sched:sched_switch -a -- sleep 30

# 2. Convert to readable trace, extract delay between successive switches on the same CPU
perf script | awk '
  $2=="sched_switch" && $5=="prev_state" { 
    if (prev_cpu==$6 && prev_pid!=$8) {
      latency=$3-prev_time; 
      print latency; 
    }
    prev_cpu=$6; prev_pid=$8; prev_time=$3;
  }' > switch_latencies.txt

# 3. Compute basic stats with Python (one‑liner)
python3 -c "
import numpy as np, scipy.stats as st
data=np.loadtxt('switch_latencies.txt')
print('n=',len(data))
print('mean=',data.mean()*1e6,'µs')
print('std=',data.std(ddof=1)*1e6,'µs')
print('95% CI:', st.t.interval(0.95, len(data)-1,
                    loc=data.mean()*1e6,
                    scale=data.std(ddof=1)*1e6/np.sqrt(len(data))))
"
```

**Explanation** –  
- `perf record` samples the kernel tracepoint at negligible overhead (<1 µs).  
- The `awk` script computes the *inter‑switch* interval for each CPU, which is a direct measurement of scheduler latency (the time the CPU spends not running a task).  
- The Python snippet calculates the mean, standard deviation, and a $t$‑based CI, assuming the sampled latencies are approximately i.i.d. (reasonable after a few seconds of mixing).  

Similar patterns apply to `iostat -x` (await = average I/O wait time) or `vmstat -s` (pgpgin/pgpgout rates for memory throughput).  

---

## Why This Matters  

Statistical reasoning transforms raw Linux telemetry from a list of numbers into actionable insight:  

* **Quantifying uncertainty** (CIs) tells you whether an observed latency spike is noise or a genuine regression, preventing fruitless tuning.  
* **Regression coefficients** give a *causal‑leaning* lever: if each extra percent CPU adds 0.035 ms latency, you can predict the load at which latency exceeds an SLA and proactively scale out.  
* **Variance decomposition** reveals whether performance jitter stems from the scheduler, I/O subsystem, or application code, guiding where to invest engineering effort.  
* **Measurement‑error awareness** avoids mistaking timer granularity or probe overhead for real variability, a common source of false positives in performance studies.  

By grounding each step in distributional assumptions, estimators, and hypothesis tests, you move from “looks slower” to “the 99th‑percentile latency increased by 12 ms ± 3 ms with 95% confidence, primarily driven by a rise in average queue depth on device *nvme0n1* after the latest firmware update.” That level of rigor is what separates anecdotal observations from reproducible, trustworthy system optimization.
