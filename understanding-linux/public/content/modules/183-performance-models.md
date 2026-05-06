---
id: 183
title: "Performance models"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Performance Models as Stochastic Abstractions
A performance model reduces a computer system to a stochastic process that captures how work arrives, how long it takes to service, and how many parallel servers exist. The abstraction is useful because the exact hardware details (cache hierarchy, pipeline depth, interrupt latency) are often irrelevant for *aggregate* metrics such as average latency or system utilization; those metrics depend primarily on the *flow* of work through the system.

### Fundamental Quantities
* **Arrival rate** \( \lambda \) – average number of requests arriving per unit time (requests / s).  
* **Service rate** \( \mu \) – average number of requests a single server can complete per unit time when busy.  
* **Utilization** \( \rho = \frac{\lambda}{c\mu} \) – fraction of time the \(c\) servers are busy; stability requires \( \rho < 1 \).  
* **Service time** \( S \) – random variable for the time a server spends on one request; its mean is \( \mathbb{E}[S]=1/\mu \).  
* **Waiting time** \( W_q \) – time a request spends in queue before service begins.  
* **Response time** (latency) \( W = W_q + \mathbb{E}[S] \).  
* **Throughput** \( X \) – long‑run average rate of completed requests; for a stable system \( X = \lambda \).  
* **Mean number in system** \( L \) – average number of requests (queued + in service).  

**Little’s Law** connects these quantities in a model‑independent way:
\[
L = \lambda W \qquad\text{(units: requests)}.
\]
Derivation: count arrivals over a long interval \(T\); total time spent in system by all requests is \( \int_0^T L(t)dt \approx LT\); divide by \(T\) gives average number, which equals arrival rate times average time per request.

### Queueing System Components
1. **Arrival Process** – characterizes the randomness of request inter‑arrival times. Common choices: Poisson (exponential inter‑arrival), deterministic, Markov‑modulated, or general renewal.  
2. **Service Time Distribution** – describes how long each request occupies a server. Exponential (memoryless) yields tractable birth‑death chains; deterministic or general distributions require more advanced analysis.  
3. **Number of Servers** \(c\) – degree of parallelism (e.g., CPU cores, disk spindles, network interfaces).  

### Kendall’s Notation
A queueing system is denoted \(A/S/c\) where:
* \(A\) – arrival process (M = Poisson/Markovian, G = general, D = deterministic).  
* \(S\) – service time distribution (same symbols).  
* \(c\) – integer number of identical servers.  

Examples:  
* **M/M/1** – Poisson arrivals, exponential service, single server.  
* **M/M/c** – Poisson arrivals, exponential service, \(c\) servers.  
* **G/G/1** – general arrival and service, single server (requires approximation or simulation).

---

## How It Works
### Deriving M/M/1 Metrics from First Principles
For an M/M/1 queue the underlying continuous‑time Markov chain has states \(n = 0,1,2,\dots\) representing the number of jobs in the system. Transition rates:
* From \(n\) to \(n+1\) (arrival): \( \lambda \).  
* From \(n\) to \(n-1\) (service completion): \( \mu \) for \(n\ge 1\).

**Balance equations** in steady state:
\[
\lambda p_n = \mu p_{n+1},\qquad n\ge0.
\]
Iterating gives
\[
p_n = \left(\frac{\lambda}{\mu}\right)^n p_0 = \rho^n p_0.
\]
Normalization \(\sum_{n=0}^\infty p_n = 1\) yields
\[
p_0 = 1-\rho,\qquad p_n = (1-\rho)\rho^n.
\]

**Mean number in system**:
\[
L = \sum_{n=0}^\infty n p_n = \frac{\rho}{1-\rho}.
\]
*Derivation*: use the geometric series identity \(\sum n\rho^n = \rho/(1-\rho)^2\) and multiply by \((1-\rho)\).

**Apply Little’s Law** to obtain mean response time:
\[
W = \frac{L}{\lambda}= \frac{\rho/(1-\rho)}{\lambda}= \frac{1}{\mu-\lambda}.
\]
Thus latency grows hyperbolically as \(\lambda\) approaches \(\mu\).

**Throughput** in steady state equals the effective arrival rate, which for a stable M/M/1 is simply \(\lambda\) (the server is never forced to reject jobs). If \(\lambda\ge\mu\) the chain has no stationary distribution and the queue length diverges.

**Utilization** is the probability the server is busy:
\[
U = 1-p_0 = \rho = \frac{\lambda}{\mu}.
\]

### Extending to M/M/c (Multi‑Server)
For \(c\) identical servers the birth‑death rates are:
* Arrival: \( \lambda \) (independent of state).  
* Service: \( n\mu \) for \( n\le c\); \( c\mu \) for \( n>c\) (all servers busy).

Solving yields the stationary distribution:
\[
p_n = 
\begin{cases}
\displaystyle \frac{(\lambda/\mu)^n}{n!}\,p_0, & n\le c,\\[6pt]
\displaystyle \frac{(\lambda/\mu)^n}{c!\,c^{\,n-c}}\,p_0, & n>c,
\end{cases}
\]
where \(p_0\) is fixed by normalization.  

**Probability that an arriving job must wait** (all servers busy) is the *Erlang C* formula:
\[
P_{\text{wait}} = 
\frac{\dfrac{(c\rho)^c}{c!}\dfrac{1}{1-\rho}}
{\displaystyle\sum_{k=0}^{c-1}\frac{(c\rho)^k}{k!} \;+\; \dfrac{(c\rho)^c}{c!}\dfrac{1}{1-\rho}}.
\]
Mean waiting time in queue:
\[
W_q = \frac{P_{\text{wait}}}{c\mu-\lambda}.
\]
Mean response time:
\[
W = W_q + \frac{1}{\mu}.
\]
Utilization per server: \( \rho = \lambda/(c\mu) \). Stability condition remains \( \rho < 1 \).

---

## Worked Examples
### Example 1: M/M/1 Server
*Given*: \( \lambda = 2\;\text{req/s},\; \mu = 3\;\text{req/s}\).

1. Utilization: \( \rho = \lambda/\mu = 2/3 \approx 0.6667\).  
2. Mean number in system: \( L = \rho/(1-\rho) = (2/3)/(1/3)=2\).  
3. Mean response time (latency): \( W = L/\lambda = 2/2 = 1\;\text{s}\) (equivalently \(1/(\mu-\lambda)=1/(3-2)=1\)).  
4. Throughput (stable): \( X = \lambda = 2\;\text{req/s}\).  
5. Server utilization: \( U = \rho = 0.6667\) (66.7 %).  

*Interpretation*: With the server busy two‑thirds of the time, the average job spends one second total (including waiting).

### Example 2: M/M/3 Server Approaching Saturation
*Given*: 3 servers, each \( \mu = 2\;\text{req/s}\); total service capacity \(c\mu = 6\;\text{req/s}\). Arrival \( \lambda = 6\;\text{req/s}\) → \( \rho = \lambda/(c\mu)=1\).

Because \( \rho =1\), the denominator \(c\mu-\lambda\) in the waiting‑time formula vanishes, implying \(W_q\to\infty\) and the queue length diverges. The system is **unstable**; any positive fluctuation in arrivals causes backlog to grow without bound.

*What if \( \lambda = 5.5\;\text{req/s}\)?*  
\( \rho = 5.5/6 = 0.9167\).  
Compute \(P_{\text{wait}}\) using Erlang C (values omitted for brevity; result ≈0.73).  
\(W_q = P_{\text{wait}}/(c\mu-\lambda) = 0.73/(6-5.5)=0.73/0.5 = 1.46\;\text{s}\).  
Mean response time \(W = W_q + 1/\mu = 1.46 + 0.5 = 1.96\;\text{s}\).  
Utilization per server \(U = \rho = 0.9167\) (91.7 %).  

Notice how a modest increase in load from 0.667 to 0.917 more than triples latency.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Assuming M/M/1 formulas apply to any service time distribution** | The M/M/1 derivation relies on the memoryless property of the exponential service time. General distributions introduce variability that increases waiting time (see Pollaczek‑Khinchine formula). | Use the appropriate formula: for M/G/1, \(W = \frac{\lambda \mathbb{E}[S^2]}{2(1-\rho)} + \mathbb{E}[S]\). Measure or estimate the second moment of service time. |
| 2 | **Ignoring burstiness in the arrival process** | Poisson assumptions lead to under‑estimation of queue length when arrivals are correlated (e.g., web traffic exhibits self‑similarity). | Model arrivals as a Markov‑Modulated Poisson Process (MMPP) or use empirical inter‑arrival data; simulate or apply heavy‑traffic approximations. |
| 3 | **Operating near 100 % utilization is acceptable** | As \( \rho\to1\), the waiting time grows like \(1/(1-\rho)\) (M/M/1) or even worse for general systems. Small increases in load cause disproportionate latency spikes. | Keep utilization below a design threshold (e.g., 70‑80 % for interactive services) and provision headroom for bursts. |
| 4 | **Confusing throughput with offered load** | Throughput cannot exceed service capacity; if offered load \( \lambda > c\mu\) the system discards or queued jobs grow indefinitely. | Measure *completed* requests per second; if it plateaus while offered load rises, the system is saturated. |
| 5 | **Using average latency to size resources for latency‑critical tails** | Average latency hides the distribution; a system with low mean but high variance may violate tail‑latency SLAs. | Compute percentile latencies (e.g., 99th‑percentile) using the appropriate transform (Laplace transform of waiting‑time distribution) or simulation. |

---

## Exercises
### Easy (M/M/1)
1. A disk subsystem receives read requests at \( \lambda = 4\;\text{req/s}\). Each request takes an average of \( \mathbb{E}[S] = 0.18\;\text{s}\) to service (so \( \mu = 5.55\;\text{req/s}\)).  
   *Compute*: utilization, mean number of pending requests, average latency, and throughput.

### Medium (M/M/c)
2. A web server farm has \(c = 4\) identical workers. Each worker can process \( \mu = 8\;\text{req/s}\). Incoming HTTP requests arrive at \( \lambda = 24\;\text{req/s}\).  
   *a)* Verify stability.  
   *b)* Compute server utilization \( \rho\).  
   *c)* Using the Erlang C formula, find the probability that an arriving request must wait.  
   *d)* Determine the mean waiting time in queue and mean response time.  
   *(Show intermediate steps; you may keep expressions symbolic before plugging numbers.)*

### Hard (Approximation / Simulation)
3. Consider a G/G/1 queue where inter‑arrival times are hyperexponential with squared coefficient of variation \(C_a^2 = 2\) and service times are deterministic (\(C_s^2 = 0\)). The mean arrival rate is \( \lambda = 3\;\text{req/s}\) and mean service time is \( \mathbb{E}[S]=0.2\;\text{s}\) (\( \mu = 5\;\text{req/s}\)).  
   *Apply Kingman’s approximation* for the mean waiting time in queue:
   \[
   W_q \approx \left(\frac{C_a^2 + C_s^2}{2}\right) \frac{\rho}{\mu(1-\rho)}.
   \]
   *Compute* the approximate \(W_q\) and total response time \(W\).  
   *Then* validate the approximation by writing a short Python script that simulates 10⁶ arrivals using numpy’s random generators and reports empirical mean latency. Include the script in a ```python block.

---

## Linux Connection
Performance models become actionable when you can measure the underlying quantities on a running Linux system. Below are concrete subsystems, virtual files, and toolchains that map directly to the model parameters.

### 1. Observing CPU Utilization (the ρ term)
```bash
# /proc/stat provides cumulative jiffies for each CPU state
cat /proc/stat
# Example line: cpu  1234567 890 234567 987654321 12345 6789 0 0
# fields: user, nice, system, idle, iowait, irq, softirq, steal
```
Compute instantaneous utilization over an interval Δt:
```bash
#!/usr/bin/env bash
interval=1
read -r user nice system idle iowait irq softirq steal < <(grep '^cpu ' /proc/stat | awk '{print $2,$3,$4,$5,$6,$7,$8,$9}')
sleep $interval
read -r user2 nice2 system2 idle2 iowait2 irq2 softirq2 steal2 < <(grep '^cpu ' /proc/stat | awk '{print $2,$3,$4,$5,$6,$7,$8,$9}')
# active time = (user+nice+system+irq+softirq+steal)
active1=$((user+nice+system+irq+softirq+steal))
active2=$((user2+nice2+system2+irq2+softirq2+steal2))
idle1=$((idle+iowait))
idle2=$((idle2+iowait2))
total1=$((active1+idle1))
total2=$((active2+idle2))
util=$(((active2-active1)*100/(total2-total1)))
echo "CPU utilization over ${interval}s: $util%"
```
Save as `cpu_util.sh`, make executable, and run to see a per‑second utilization estimate that corresponds to \( \rho = \lambda/(c\mu) \) for the CPU subsystem.

### 2. Measuring Service Time of a System Call
The `perf` subsystem can trace the duration of individual syscalls using hardware‑timestamped tracepoints.
```bash
# Record enter and exit timestamps for read() syscalls over 5 seconds
perf record -e syscalls:sys_enter_read -e syscalls:sys_exit_read -a -- sleep 5
# Convert to a readable latency report
perf script | awk '
  /sys_enter_read/ { ts_enter[$1] = $2 }
  /sys_exit_read/  { 
    if (ts_enter[$1]) { 
      latency = $2 - ts_enter[$1]; 
      sum += latency; count++; 
      delete ts_enter[$1] 
    } 
  }
  END { if (count) printf "Average read() latency: %.3f µs\n", sum/count/1000 }'
```
The resulting average latency is an empirical estimate of the mean service time \( \mathbb{E}[S] \) for the block‑device read path (assuming the workload is dominated by reads).

### 3. Queue Length Observation for Network Interfaces
Linux’s `tc` (traffic control) exposes queue statistics.
```bash
# Show current queue length (in packets) and drops for eth0
tc -s qdisc show dev eth0
```
Sample output:
```
qdisc mq 0: root
 Sent 12345678 bytes 9876 pkt (dropped 0, overlimits 0 requeues 0)
 backlog 0b 0p requeues 0
```
The `backlog` field (in bytes) divided by the average packet size gives an estimate of the number of jobs waiting for NIC service—directly analogous to \(L_q\) in a queueing model.

### 4. Synthetic Load Generation for Controlled Experiments
`stress-ng` can produce a predictable arrival process.
```bash
# Generate CPU-bound work approximating a Poisson arrival of 10 tasks/s, each taking ~0.05s
stress-ng --cpu 4 --cpu-load 50 --timeout 30s --metrics-brief
```
The `--cpu-load` option defines the fraction of time each thread is busy, letting you set a target utilization \( \rho \) and then measure resulting latency via `perf` or `pidstat`.

### 5. End‑to‑End Example: Validating an M/M/1 Prediction
1. **Set arrival rate** using a loop that sends a UDP packet every 0.5 s (λ=2 req/s):
   ```bash
   #!/usr/bin/env bash
   interval=0.5
   while true; do
     echo -n "ping" | nc -u -w0 127.0.0.1 9000 &
     sleep $interval
   done &
   ```
2. **Service** the packets with a simple server that artificially sleeps for a deterministic 0.3 s (μ≈3.33 req/s):
   ```bash
   #!/usr/bin/env bash
   while true; do
     nc -lu -p 9000 | while read line; do
       sleep 0.3   # emulate service
     done
   done
   ```
3. **Measure** round‑trip latency with `ping`‑style timestamps using `tcpdump` and compute average; compare to the M/M/1 prediction \(W = 1/(μ-λ) = 1/(3.33-2) ≈ 0.6\) s.

These command‑level illustrations show how the abstract parameters λ, μ, and ρ appear in observable Linux counters, enabling you to validate or refine a performance model on a real system.

---

## Why This Matters
Performance models translate vague intuitions about “slow system” into quantitative predictions that guide concrete actions:

* **Capacity Planning** – By inserting measured λ and μ into the M/M/c formulas you can determine how many cores or disks are needed to keep latency under a target SLA before purchasing hardware.  
* **Bottleneck Identification** – A mismatch between predicted and observed latency signals that one model assumption (e.g., Poisson arrivals, exponential service) is violated, pointing you toward the subsystem that needs deeper investigation (e.g., bursty I/O, lock contention).  
* **Kernel Tuning** – Utilization ρ directly informs sysctl knobs such as `kernel.sched_min_granularity_ns` or `vm.dirty_ratio`; adjusting them changes the effective service rate μ, and the model tells you the expected impact on latency.  
* **Performance Debugging** – Tools like `perf`, `bpftrace`, and `/proc` expose the very quantities (arrival bursts, service‑time distributions) that the model consumes, letting you close the loop between measurement, modeling, and intervention.  
* **System‑Wide Reasoning** – Little’s Law and the Erlang C formula are *conservation laws* that hold regardless of scheduling algorithm, making them reliable foundations for reasoning about everything from container orchestrators to distributed micro‑services.

In short, mastering queueing‑theoretic performance models equips you to move from reactive firefighting to proactive, mathematically grounded system design and optimization—an indispensable skill for any Linux systems engineer, performance analyst, or cloud infrastructure architect.
