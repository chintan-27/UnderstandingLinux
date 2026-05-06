---
id: 213
title: "Reliability engineering"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Reliability Engineering in Computer Systems
Reliability engineering quantifies the probability that a system will continue to deliver its specified service **without failure** for a given interval. The underlying cause is the stochastic nature of hardware faults, software bugs, and external disturbances. By modeling failures as a Poisson process with rate λ (failures per hour), the probability of zero failures in time *t* is $P_{0}(t)=e^{-\lambda t}$. Minimizing λ (through fault‑tolerant design, redundancy, and rigorous testing) directly raises this probability.

### Service Level Objective (SLO)
An SLO is a **target** expressed as a probabilistic bound on a Service Level Indicator (SLI). For availability, the SLI is the fraction of time the system is able to respond to requests. If we monitor uptime over a measurement window *W*, the SLI is  
$$\text{SLI} = \frac{W - D}{W}$$  
where *D* is accumulated downtime. An SLO of 99.9% availability therefore imposes the inequality  
$$\frac{W - D}{W} \ge 0.999 \;\Longrightarrow\; D \le 0.001W.$$  
Thus the SLO translates directly into a **maximum allowable downtime** derived from first‑principles reliability theory.

### Error Budget
The error budget is the complement of the SLO: the amount of downtime (or error rate) that can be “spent” without violating the SLO. From the inequality above, the error budget for a window *W* is  
$$\text{EB} = W \times (1 - \text{SLO}).$$  
If the SLO is 99.95%, the error budget is 0.05% of *W*. Consuming more than this budget means the observed SLI has fallen below the SLO, triggering a reliability violation. Treating the error budget as a **spendable resource** creates a clear decision boundary: feature work can proceed while budget remains; once exhausted, work must shift to reliability‑improving tasks.

### Incident Response
Incident response is the organized reaction to a deviation from expected behavior that threatens the SLO. Its effectiveness hinges on minimizing **Mean Time to Detect (MTTD)** and **Mean Time to Contain (MTTC)**, because the total downtime *D* ≈ MTTD + MTTC + MTTR (Mean Time to Repair). Reducing any of these terms directly reduces *D* and preserves the error budget.

### Capacity Planning
Capacity planning ensures that the provisioned service rate μ exceeds the arrival rate λ of work, keeping utilization ρ = λ/μ below a stability threshold (typically ρ < 0.70 for latency‑sensitive services). Using Little’s Law, $L = \lambda W$, where *L* is the average number of jobs in the system and *W* the average response time. If *W* must stay below a target *T*, we require  
$$\mu \ge \frac{\lambda}{1 - \lambda T}.$$  
Thus capacity planning is a deterministic calculation derived from queueing theory, not guesswork.

---

## How It Works
### SLOs and Error Budgets in Practice
Consider a web service with an SLO of 99.9% availability measured over a 30‑day window (*W* = 30 days × 24 h × 60 min = 43 200 min). The allowable downtime is  
$$D_{\max}=W\times(1-0.999)=43.2\text{ min}.$$  
If the service experiences *d* minutes of downtime, the fraction of the error budget consumed is  
$$\frac{d}{D_{\max}}\times100\%.$$  
For example, 30 min downtime yields  
$$\frac{30}{43.2}\times100\% \approx 69.4\%$$  
of the budget used, leaving 30.6 % for future incidents.

The derivation follows directly from the SLO inequality:  
$$\text{SLI}=1-\frac{d}{W}\ge0.999 \;\Longrightarrow\; d\le0.001W.$$  

### Incident Response Process (Detailed)
1. **Detection** – Instrumentation emits metrics (e.g., Prometheus alerts) when SLI deviates beyond a threshold. The alert triggers a paging system; MTTD is the time from anomaly onset to first responder acknowledgment.  
2. **Containment** – Immediate actions limit blast radius:  
   * Network‑level: `iptables -A INPUT -s <bad_ip> -j DROP`  
   * Service‑level: Kubernetes pod deletion (`kubectl delete pod <pod>`) or circuit‑breaker activation via Istio (`destinationrule` with `outlierDetection`).  
   The goal is to reduce ongoing error accrual, lowering MTTC.  
3. **Eradication** – Root cause is isolated via logs (`journalctl -u <service>`), core dumps, or eBPF traces. Removing the cause may involve:  
   * Rolling back a faulty deployment (`kubectl rollout undo deployment/<deploy>`)  
   * Applying a security patch (`yum update -y <vulnerable-package>`)  
   * Killing a runaway process (`kill -9 <pid>`).  
4. **Recovery** – System is brought back to a known good state:  
   * Restoring from backups (`restic restore latest --target /mnt`)  
   * Re‑syncing replicated data (`ceph osd pool create <pool> 128`)  
   * Verifying health checks return 200 OK.  
   MTTR is measured here.  
5. **Post‑incident Review** – A blameless meeting produces an action item tracker; metrics such as “percentage of incidents with automated rollback” are recorded to improve future MTTD/MTTC/MTTR.

### Capacity Planning Techniques (Quantitative)
* **Load Testing** – Tools like `wrk` or `k6` generate a controlled request rate *R*. Measured latency *L* at each *R* yields the empirical service curve μ(*R*).  
* **Monitoring** – Time‑series databases (Prometheus) store per‑second counters: `rate(http_requests_total[1m])` gives λ; `avg(http_request_duration_seconds)` gives *W*.  
* **Modeling** – Assuming an M/M/1 queue, average response time is $W = \frac{1}{\mu-\lambda}$. Solving for μ given a target *W* yields $\mu = \lambda + \frac{1}{W}$.  
* **Trend Analysis** – Apply linear regression to historic λ(t) to forecast λ₍future₎; then recompute μ using the model above.  
* **Utilization Bound** – For tail‑latency SLOs (e.g., 99th‑percentile < 100 ms), use the Kingman approximation for G/G/1 queues:  
  $$W_{q} \approx \frac{\rho^{2}}{1-\rho}\cdot\frac{C_{s}^{2}+C_{a}^{2}}{2}\cdot\frac{1}{\mu},$$  
  where ρ = λ/μ, $C_{s}$ and $C_{a}$ are service and arrival variability coefficients. Plugging a target $W_{q}$ solves for the required μ (or number of parallel servers *n* where μ = n·μ₁).

---

## Worked Examples
### Example 1: SLO Calculation (Detailed)
**Problem**: A micro‑service has an SLO of 99.95% uptime over a 7‑day window. It experiences 45 minutes of downtime. What fraction of its error budget is consumed?

**Solution**  
1. Convert window to minutes:  
   $W = 7 \text{ days} \times 24 \text{ h/day} \times 60 \text{ min/h} = 10\,080 \text{ min}$.  
2. Compute error budget:  
   $\text{EB} = W \times (1 - \text{SLO}) = 10\,080 \times (1 - 0.9995) = 10\,080 \times 0.0005 = 5.04 \text{ min}$.  
3. Fraction used:  
   $\frac{45 \text{ min}}{5.04 \text{ min}} = 8.93$ → **893 %** of the budget consumed.  
   The SLO is violated; the service must spend the next interval repairing reliability before earning new budget.

### Example 2: Incident Response Timeline
**Scenario**: An e‑commerce site suffers a SQL injection that leaks customer emails.

| Phase | Action | Command / Tool | Approx. Time |
|-------|--------|----------------|--------------|
| Detection | Alert on surge of 500 errors + unusual DB query pattern | `alertmanager` fires when `rate(http_errors_5xx[5m]) > 0.1` | 2 min |
| Containment | Block offending IP at edge; enable WAF rule | `iptables -I INPUT -s 203.0.113.45 -j DROP`<br>`kubectl annotate ingress my-ingress nginx.org/waf-modsec="on"` | 5 min |
| Eradication | Identify vulnerable parameter, patch code, redeploy | `git diff -p app/db.go` shows missing `sql.DB.QueryContext` fix<br>`kubectl rollout restart deployment/frontend` | 15 min |
| Recovery | Validate DB integrity, restore any corrupted rows from snapshot | `psql -c "SELECT COUNT(*) FROM users WHERE email LIKE '%@attacker.com%'"`<br>`pg_restore --dbname=ecommerce --table=users latest.dump` | 10 min |
| Post‑mortem | Write blameless report, add automated SQLi scanner to CI | Confluence page; add `bandit -r .` to CI pipeline | — |

Total downtime ≈ 32 min; if the SLO permits 20 min/month, the incident consumes 160 % of the monthly error budget, prompting a reliability‑focused sprint.

### Example 3: Capacity Planning via Queueing Model
**Problem**: A REST endpoint receives Poisson requests with average rate λ = 120 req/s. Current 99th‑percentile latency must stay under 150 ms. Each server (single‑core) can process μ₀ = 200 req/s with service‑time variability $C_s = 1$ (exponential). Arrival variability $C_a = 1$ (Poisson). How many identical servers *n* are needed?

**Solution**  
1. Utilization per server: $\rho = \frac{\lambda}{n\mu_0}$.  
2. Kingman approximation for average waiting time in queue:  
   $$W_q \approx \frac{\rho^{2}}{1-\rho}\cdot\frac{C_s^{2}+C_a^{2}}{2}\cdot\frac{1}{\mu_0}.$$  
   Total response time $W = W_q + 1/\mu_0$.  
3. Set $W \le 0.150$ s and solve for *n*.  
   Plug numbers:  
   $$\frac{1}{\mu_0}=0.005\text{ s}.$$  
   Let $x = \rho$. Then  
   $$W_q = \frac{x^{2}}{1-x}\cdot\frac{1+1}{2}\cdot0.005 = \frac{x^{2}}{1-x}\cdot0.005.$$  
   So $W = 0.005 + \frac{x^{2}}{1-x}\cdot0.005 \le 0.150$.  
   Rearranged: $\frac{x^{2}}{1-x} \le 29$.  
   Solve numerically: $x \approx 0.945$ gives LHS ≈ $0.945^2/(0.055) ≈ 16.2 < 29$.  
   Try $x=0.98$: $0.9604/0.02 = 48.0 > 29$. So $\rho_{max} \approx 0.965$.  
4. Compute required *n*:  
   $n \ge \frac{\lambda}{\mu_0 \rho_{max}} = \frac{120}{200 \times 0.965} \approx 0.622$.  
   Since *n* must be integer ≥ 1, one server already satisfies the latency SLO under these assumptions.  
   If we instead target 99th‑percentile (using $W_{99} \approx W_q \cdot \ln(100)$ for exponential), we repeat with factor ~4.6, yielding $n≈3$.  
   **Result**: To be safe against variability, provision **3 servers** (giving $\rho = 120/(3·200)=0.20$ and ample headroom).

---

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| Treating the error budget as a “permission to fail” rather than a **finite reserve**. | The budget is derived from the SLO inequality; spending it reduces future tolerance. Repeatedly consuming the budget drives the observed SLI below the SLO, causing chronic violations and customer churn. |
| Using **average** utilization (λ/μ) for capacity planning when latency SLOs concern tail percentiles. | Averages hide variance; under bursty arrivals the queue can blow up even if ρ<0.7. Tail‑latency SLOs require variability terms ($C_s, C_a$) as in the Kingman or Hall approximations. |
| Relying solely on **manual** incident response runbooks without automation. | Manual steps increase MTTD and MTTC; humans are slower and error‑prone under stress. Automated containment (e.g., Istio outlier detection, auto‑scale‑down) reduces human latency and improves repeatability. |
| Ignoring **idempotency** when designing recovery actions (e.g., restoring backups without checking for duplicate writes). | Non‑idempotent recovery can corrupt state, extending MTTR or causing data loss. Proper recovery must be safe to replay multiple times. |
| Assuming **static** resource provisioning based on peak load observed in a single load test. | Workloads are often non‑stationary; diurnal patterns, flash crowds, or seasonal spikes can exceed the tested peak. Continuous monitoring and predictive scaling (e.g., HPA with custom metrics) are required. |
| Misinterpreting **MTBF** as a guarantee of no failure within that interval. | MTBF is the *mean* of an exponential distribution; the probability of zero failure in time *t* is $e^{-t/MTBF}$. Even with high MTBF, there is a non‑zero chance of early failure; reliability engineering must design for detection and fast recovery, not just prevention. |

---

## Exercises
### Exercise 1 (Easy) – SLO & Error Budget
A database cluster promises 99.99% availability measured monthly (30 days). If it experiences 12 minutes of downtime in a month, what percentage of its error budget has been used? Show all steps.

### Exercise 2 (Medium) – Incident Response Design
You receive an alert that a Kubernetes node is reporting `NodeNotReady` due to a disk‑full condition (`/var/log` at 95%).  
1. List the exact commands you would run to **detect**, **contain**, **eradicate**, and **recover** using only standard Linux tools (`journalctl`, `systemctl`, `find`, `df`, `lvm`, etc.).  
2. Explain how each step reduces MTTD, MTTC, or MTTR.

### Exercise 3 (Hard) – Capacity Planning with Variability
A micro‑service processes requests with arrival rate λ = 250 req/s (Poisson). Each instance (single CPU) can serve μ₀ = 350 req/s with service‑time SCV $C_s = 0.8$. The 99th‑percentile latency SLO is 80 ms. Using the Kingman approximation for G/G/1 queues, determine the minimum number of identical instances *n* required to meet the SLO. Show the derivation and any numerical solving method you use (e.g., Newton‑Raphson iteration).  

---

## Linux Connection
### Kernel Subsystems & System Calls Relevant to Reliability
| Subsystem | Purpose | Key Interfaces / Files |
|-----------|---------|------------------------|
| **`printk` / `klogctl`** | Kernel logging; feeds `/dev/kmsg` and `syslog` | `int syslog(int type, char *bufp, int len);` |
| **`journald` (systemd)** | Structured, indexed journal; forward‑compatible with syslog | `/var/log/journal/`, `journalctl -u <unit>` |
| **`inotify` / `fanotify`** | File‑system event notification for monitoring config changes | `int fd = inotify_init1(IN_NONBLOCK|IN_CLOEXEC);` |
| **`cgroups v2`** | Resource isolation (CPU, memory, I/O) to bound faulty workloads | `/sys/fs/cgroup/`, `cgcreate`, `cgset` |
| **`namespaces` (pid, net, mnt, ipc, uts, user)** | Process isolation; limits blast radius of compromised containers | `unshare(CLONE_NEWNET)`, `setns(fd, CLONE_NEWPID)` |
| **`watchdog`** | Hardware‑timer that triggers reset if userspace fails to ping | `/dev/watchdog`, `ioctl(fd, WDIOC_SETTIMEOUT, &timeout)` |
| **`kexec` / `kdump`** | Fast reboot and crash‑dump capture for post‑mortem analysis | `systemctl kexec`, `/proc/sys/kernel/kexec_load`, `/proc/sys/kernel/kexec_crash_load` |
| **`perf` & `eBPF`** | Low‑overhead profiling, tracing syscalls, scheduler events | `perf record -g -a sleep 30`, `bpftrace -e 'tracepoint:syscalls:sys_enter_* { @[comm] = count(); }'` |
| **`futex`** | Fast userspace locking; contention leads to priority inversion → latency spikes | `int futex(int *uaddr, int op, int val, const struct timespec *timeout, int *uaddr2, int val3);` |

### Representative Commands & Code Snippets
```bash
# 1. Detect high error rate via journalctl
journalctl -u nginx.service --since "5 min ago" \
  | grep -c " 500 "   # count 5xx responses in last 5 min

# 2. Contain offending IP with nftables (modern replacement for iptables)
nft add rule inet filter input ip saddr 203.0.113.45 drop

# 3. Eradicate by rolling back a faulty deployment (kubectl)
kubectl rollout undo deployment/frontend --namespace=prod

# 4. Verify service health with curl loop
while ! curl -s -o /dev/null -w "%{http_error}\n" http://svc.local/health; do
    sleep 2
done

# 5. Collect kernel trace of syscalls during an incident (eBPF)
bpftrace -e '
tracepoint:syscalls:sys_enter_openat
{
    @[args->filename] = count();
}
interval:s:5
{
    print(@);
    clear(@);
}'
```

### C Example: Using `timerfd` to Implement a Watchdog Ping
```c
#include <sys/timerfd.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>

int main(void) {
    int tfd = timerfd_create(CLOCK_MONOTONIC, TFD_NONBLOCK | TFD_CLOEXEC);
    if (tfd < 0) { perror("timerfd_create"); exit(1); }

    struct itimerspec its = {
        .it_interval = { .tv_sec = 10, .tv_nsec = 0 }, // ping every 10s
        .it_value    = { .tv_sec = 10, .tv_nsec = 0 }
    };
    if (timerfd_settime(tfd, 0, &its, NULL) == -1) {
        perror("timerfd_settime"); exit(1);
    }

    while (1) {
        uint64_t expirations;
        ssize_t s = read(tfd, &expirations, sizeof(expirations));
        if (s != sizeof(expirations)) { perror("read"); exit(1); }
        // Ping the hardware watchdog here, e.g., ioctl(fd, WDIOC_KEEPALIVE, 0);
        printf("Watchdog ping %llu\n", (unsigned long long)expirations);
    }
}
```
This snippet shows how a userspace process can reliably feed the kernel watchdog, preventing automatic reboot while the service is healthy.

---

## Why This Matters
Reliability engineering turns vague notions of “uptime” into quantitative, actionable controls. By expressing expectations as **SLOs** and translating them into **error budgets**, teams gain a clear, measurable trade‑off between feature velocity and stability. Incident response becomes a disciplined loop—detect, contain, eradicate, recover, learn—where each stage is grounded in observable system properties (MTTD, MTTC, MTTR) and can be automated with Linux primitives like `systemd`, `eBPF`, and `cgroups`. Capacity planning, informed by queueing theory and real‑time metrics, prevents over‑provisioning while guaranteeing tail‑latency targets. The Linux kernel supplies the exact mechanisms—system calls, tracing facilities, and resource isolators—to implement these principles in practice. Mastering these concepts enables engineers to build systems that do not merely *hope* to stay available, but *prove* it through observable, repeatable, and continuously improving processes. This foundation allows deeper exploration of distributed consensus, chaotic testing, and advanced observability, ultimately delivering software that meets the stringent demands of modern users and stakeholders.
