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

## Why This Matters

A system that works perfectly at 10 requests per second can collapse at 10,000 — not because the code changes, but because queueing dynamics are nonlinear. A service that runs flawlessly in isolation fails unpredictably under hardware degradation or cascading dependency failures. Without a formal framework for defining what "working" means, measuring deviation from it, and deciding when to stop shipping features and fix stability, teams react to outages rather than preventing them. Reliability engineering gives you that framework: it converts "the site should be fast" into a measurable contract, spends failure margin deliberately, and predicts capacity exhaustion before traffic exposes it.

---

## Core Concepts

### Service Level Objectives (SLOs)

An SLO is a precise, measurable target for a single behavioral dimension — latency, availability, error rate — with an explicit measurement window. The distinction between indicator and objective is load-bearing:

- **SLI (Service Level Indicator):** the raw ratio being measured
- **SLO:** the threshold that ratio must satisfy
- **SLA:** a contractual consequence (often financial) if the SLO is breached

$$\text{SLI} = \frac{\text{good events}}{\text{valid events}}$$

A valid event is one that should be counted — excluding health checks, synthetic probes, and requests from internal scanners that would pollute the denominator. If you count every request including automated noise, your SLI will look better than users actually experience.

Example: "99.9% of non-health-check HTTP requests complete with status < 500 and latency < 200 ms, measured over a rolling 28-day window." The measurement window matters: a 7-day window recovers budget faster after an incident, which reduces conservatism; a 90-day window smooths transient spikes but makes alerting sluggish.

### Error Budgets

If your SLO is 99.9% availability, you are permitted $1 - 0.999 = 0.001$ of requests to fail. Over a 28-day window ($28 \times 24 \times 60 = 40{,}320$ minutes):

$$\text{error budget (time)} = 40{,}320 \times 0.001 = 40.32 \text{ minutes}$$

The error budget is not a safety margin — it is a resource you spend intentionally. Deployments consume it. Experiments consume it. Scheduled maintenance consumes it. When it depletes, the correct response is not a policy discussion; it is a mechanical rule: freeze deployments, halt experiments, investigate. This removes the recurring argument between reliability and velocity: the budget arbitrates automatically.

Budget consumption rate matters more than remaining balance. If you have burned 10% of budget in 1% of the window, you are on track to exhaust it 10× faster than the SLO tolerates.

### Incident Response

An incident is any event consuming error budget faster than the permitted rate, or threatening SLO breach before the window closes. The response sequence is fixed:

**detect → contain → diagnose → fix → postmortem**

Containment precedes root cause analysis because users are affected during diagnosis. Rolling back a deployment you do not yet understand is correct — it stops budget consumption while investigation continues. A postmortem that produces no structural change (no monitoring improvement, no runbook update, no architectural fix) is a ritual without effect.

### Capacity Planning

Capacity planning answers: at what load does a specific resource become the bottleneck, and when will current growth reach that load? It requires three inputs: a resource consumption model, a measured baseline, and a growth projection. Without the model, you cannot extrapolate. Without the baseline, you have no origin point. Without the projection, you cannot compute when.

---

## How It Works

### SLIs in Practice: Latency Percentiles

Averages suppress the distribution. A mean latency of 50 ms is consistent with a $P_{99}$ of 10 seconds if the distribution is heavy-tailed. SLOs must be expressed against percentiles because percentiles bound the fraction of users experiencing a given behavior:

$$P_n = \text{smallest value } v \text{ such that } n\% \text{ of observations} \leq v$$

A typical latency SLO stack:

- $P_{50} < 20\text{ ms}$ — median user experience
- $P_{99} < 200\text{ ms}$ — 1 in 100 requests
- $P_{99.9} < 1{,}000\text{ ms}$ — 1 in 1000 requests (the tail)

The $P_{99.9}$ matters because at 1,000 requests/second, it fires once per second. Users on degraded paths, overloaded backends, or slow networks are disproportionately represented in the tail. Ignoring $P_{99.9}$ means your dashboard is green while a specific population of users is consistently failed.

**Histogram accuracy:** naive percentile computation over pre-aggregated data introduces errors. If you average percentiles from multiple hosts — $\frac{P_{99}^{\text{host1}} + P_{99}^{\text{host2}}}{2}$ — the result is not the fleet-wide $P_{99}$. You must aggregate the underlying distributions, not the percentiles. HDR Histogram and t-digest exist for this reason; Prometheus `histogram_quantile` operates on raw bucket counts for the same reason.

### Error Budget Burn Rate

Define burn rate as the ratio of the current error rate to the permitted error rate:

$$\text{burn rate} = \frac{\text{current error rate}}{\text{SLO error rate}}$$

If the SLO permits 0.1% errors ($\epsilon = 0.001$) and you are observing 1% errors ($\epsilon_{\text{obs}} = 0.01$):

$$\text{burn rate} = \frac{0.01}{0.001} = 10\times$$

At $10\times$ burn rate, the 28-day budget exhausts in $\frac{28}{10} = 2.8$ days. Alert on burn rate over a short window (e.g., 1-hour burn rate $> 14.4\times$, which exhausts a 30-day budget in 2 hours) rather than on instantaneous error rate — this catches fast-burning incidents early while suppressing noise from brief transients. A two-window alert (fast window catches the spike, slow window confirms sustained burn) reduces both false positives and detection latency simultaneously.

The budget-consumption equation for a window of length $W$ with sustained burn rate $b$:

$$\text{budget consumed} = b \times \epsilon_{\text{SLO}} \times W$$

### Queueing Theory and Capacity

Resources under load behave as queueing systems. The **Utilization Law** from operational analysis:

$$U = X \cdot S$$

where $U \in [0, 1]$ is utilization, $X$ is throughput (requests/sec), and $S$ is mean service time per request (seconds). This is a tautology — it holds for any stable system regardless of arrival distribution.

The M/M/1 result (Poisson arrivals, exponential service, single server) gives mean residence time (wait plus service):

$$R = \frac{S}{1 - U}$$

Substituting concrete utilization values:

| $U$ | $R / S$ |
|-----|---------|
| 0.50 | 2× |
| 0.80 | 5× |
| 0.90 | 10× |
| 0.95 | 20× |
| 0.99 | 100× |

This is why systems appear fine and then suddenly do not — $R$ is hyperbolic in $U$ near saturation. At 80% CPU utilization, mean response time is already 5× the service time at zero load. The practical implication: never plan to run a resource above 70% sustained utilization if you have latency SLOs. Leave headroom for traffic bursts and garbage collection pauses.

For a multi-server system (M/M/m), adding servers reduces $R$ superlinearly near saturation, which is why horizontal scaling is more effective than vertical scaling when $U > 0.7$: each additional server disproportionately reduces queue depth.

**Little's Law** relates queue depth, throughput, and residence time:

$$N = X \cdot R$$

where $N$ is the mean number of requests in the system. If throughput doubles with no change in queue depth, residence time halved — latency improved. If queue depth grows faster than throughput, residence time is rising — degradation in progress. Both relationships hold at any measurement granularity.

### Incident Detection: What to Instrument

The signals that predict SLI violations, in order of lead time:

1. **Saturation signals** — CPU run queue depth, memory pressure, I/O queue depth. These lead SLI violations by seconds to minutes because they reflect resource contention before user-visible latency degrades.
2. **SLI violations** — directly measure user experience; zero lead time by definition.
3. **Error rates** — `ENOSPC`, TCP retransmit rate, storage I/O errors — indicate specific resource failures and can occur simultaneously with or before latency degradation.

A CPU run queue growing from $1 \times$ CPU count to $4 \times$ CPU count predicts latency degradation before the latency alert fires, because threads are waiting to run rather than running. By the time $P_{99}$ latency crosses its threshold, the queue has been growing for tens of seconds.

---

## Linux Connection

### Measuring Latency SLIs from Application Logs

For HTTP services, extract latency percentiles directly from access logs without external tooling. Nginx adds request duration to access logs with `$request_time` (seconds, milliseconds resolution). Confirm your log format includes it:

```bash
# Check the log_format in nginx config — $request_time is seconds as float
grep log_format /etc/nginx/nginx.conf /etc/nginx/conf.d/*.conf
```

Compute percentiles from a log file where the last field is latency in milliseconds:

```bash
# Extracts last field (latency), sorts numerically, computes P50/P99/P999
awk '{print $NF}' /var/log/nginx/access.log \
  | sort -n \
  | awk 'BEGIN{c=0} {a[c++]=$1} END{
      p50  = a[int(c*0
