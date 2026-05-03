---
id: 193
title: "Orchestration concepts"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When you run one process on one machine, failure modes are simple: the process crashes, you restart it. At scale — dozens of services, hundreds of containers, thousands of requests per second — that model collapses. Without a scheduler, containers pile onto the same CPU while others sit idle. Without service discovery, a restarted container gets a new IP and its callers go dark. Without health checks, a scheduler keeps routing traffic to a process that is running but returning garbage. Without resource limits, one tenant's memory leak triggers the OOM killer and takes down every neighbor on the host.

The critical property that makes orchestration hard: distributed systems fail in **partial and silent** ways. A host can be up while all containers on it are deadlocked. A service can return HTTP 200 while silently dropping 30% of requests. No human operator can track this at scale — the orchestrator must.

---

## Core Concepts

### Scheduling

A scheduler decides *where* and *when* to run a unit of work. The Linux kernel's CFS scheduler allocates CPU time to threads on a single machine. An orchestrator extends this to a cluster: given a set of nodes with different available CPU and memory, and a container with stated resource *requests*, which node runs it?

The kernel scheduler operates in microseconds and has complete, accurate state (the run queues). The orchestrator scheduler operates in seconds and works from a **stale snapshot** of cluster state — nodes are reporting their capacity asynchronously, so the scheduler is always making decisions on slightly out-of-date information. This is why two pods can land on the same node even when another node appears free: two concurrent scheduling decisions both read the same stale node state.

Both schedulers face the same tension: **utilization vs. latency**. Packing work tightly onto fewer nodes raises utilization but increases CPU and memory contention. Spreading work out reduces contention but leaves capacity idle.

### Service Discovery

When a container restarts, the kernel assigns a new network namespace and the orchestrator assigns a new IP from a pool. Every caller that hardcoded the old IP now fails. Service discovery solves this by introducing a stable name — a DNS record or a virtual IP — that maps to whatever pods are currently healthy. The caller binds to the name, not the address.

This is a correctness requirement, not a convenience feature. Without it, restarting a pod requires updating every caller's configuration and restarting them too — which causes cascading restarts.

### Health Checks

A process can be running (from the OS perspective: it has a PID, it is scheduled, it is not zombie) while being functionally dead — stuck in a deadlock, exhausted of file descriptors, returning HTTP 500 on every request. The orchestrator cannot distinguish these cases by watching the process table alone.

Health checks are active probes:

- **Liveness probe**: "Is this process alive in a useful sense?" Failure triggers a kill and restart. Use this to escape unrecoverable states (deadlock, infinite loop consuming no CPU).
- **Readiness probe**: "Is this process ready to serve traffic?" Failure removes the instance from the load-balancer backend pool *without restarting it*. Use this during startup (cache warm-up, schema migration), transient backpressure, or graceful drain.

The distinction is load-bearing. If you use a liveness probe for something that is temporarily slow, you will restart processes that would have recovered on their own, generating a restart loop that makes the situation worse.

### Resource Limits

On Linux, resource limits are implemented via **cgroups v1/v2** (control groups). The kernel enforces two distinct constraints:

- **CPU limit**: Implemented via CFS bandwidth control. The container is given a quota of CPU time per period. When it exhausts the quota, its threads are descheduled until the next period begins — *throttling*.
- **Memory limit**: Implemented via the cgroup memory controller. When the container's RSS + page cache exceeds the limit, the kernel first tries to reclaim clean page cache. If that fails, it invokes the **cgroup OOM killer**, which selects a process inside the cgroup to kill based on `oom_score_adj` and current memory usage.

These two mechanisms are asymmetric: CPU throttling is non-destructive (threads wait, then resume). Memory limit violation is destructive (processes die). This asymmetry has practical consequences — you should set memory limits more conservatively than CPU limits.

---

## How It Works

### Scheduler Mechanics: Bin Packing as Optimization

The orchestrator's placement problem is a variant of *bin packing*: assign containers (items with resource requirements) to nodes (bins with finite capacity). Bin packing is NP-hard in the general case ($O(2^n)$ for the decision version), so orchestrators use polynomial-time heuristics.

Kubernetes computes a score for each candidate node using a weighted sum of resource availability. A simplified version:

$$\text{score}(n) = w_1 \cdot \frac{C_{\text{free}}(n)}{C_{\text{total}}(n)} + w_2 \cdot \frac{M_{\text{free}}(n)}{M_{\text{total}}(n)}$$

where $C$ is CPU capacity in millicores, $M$ is memory capacity in bytes, and $w_1, w_2$ are plugin-configurable weights. The node with the highest score wins. The actual Kubernetes scheduler runs this as a pipeline: first a **filter** phase (hard constraints: does the node have enough capacity? do taints/tolerations match?) eliminates ineligible nodes, then a **score** phase ranks survivors.

Because scheduling reads node state from an in-memory cache that lags real cluster state by up to the cache sync interval (default 30s in kube-scheduler), placement decisions can be wrong. The kubelet on the winning node performs a final admission check against actual available resources and will reject the pod if the node is over-committed — this is a *scheduling conflict*, logged as a `FailedScheduling` event.

### Queueing Theory and Scheduler Saturation

Under load, pod creation requests waiting for placement form a queue. In Kendall's notation, the scheduling pipeline approximates:

$$M/M/m$$

with Poisson arrivals at rate $\lambda$ (pod creation requests per second), exponentially distributed scheduling time with rate $\mu$ per worker, and $m$ scheduler worker goroutines. Mean wait time in the queue is:

$$W_q = \frac{C(m,\, \rho)}{m\mu - \lambda}, \quad \rho = \frac{\lambda}{m\mu}$$

where $C(m, \rho)$ is the Erlang-C formula giving the probability a new request must wait:

$$C(m,\rho) = \frac{\dfrac{(m\rho)^m}{m!} \cdot \dfrac{1}{1-\rho}}{\displaystyle\sum_{k=0}^{m-1} \frac{(m\rho)^k}{k!} + \frac{(m\rho)^m}{m!} \cdot \frac{1}{1-\rho}}$$

As $\lambda \to m\mu$ (i.e., $\rho \to 1$), $W_q \to \infty$. The scheduler itself becomes a bottleneck — pods queue faster than they are placed. The fix is to increase $m$ (more scheduler workers) or decrease $\mu^{-1}$ (reduce per-pod scheduling latency, e.g., by shrinking the node pool so fewer nodes must be scored).

### CFS Bandwidth Control: CPU Throttling

The kernel enforces CPU limits via two per-cgroup parameters written to the CFS bandwidth control interface:

```bash
# These paths are for cgroups v1. For v2, the interface is
# /sys/fs/cgroup/<group>/cpu.max  (format: "quota period")
cat /sys/fs/cgroup/cpu/docker/<container-id>/cpu.cfs_period_us
# e.g., 100000  (100ms)
cat /sys/fs/cgroup/cpu/docker/<container-id>/cpu.cfs_quota_us
# e.g., 50000   (50ms CPU per 100ms = 0.5 cores)
```

Each period, the cgroup gets a fresh quota of `cfs_quota_us` microseconds of CPU time across all its threads. The kernel tracks consumption in the per-cgroup `cfs_rq` run queue. When the quota is exhausted:

1. All runnable threads in the cgroup are dequeued from the CPU run queues.
2. A high-resolution timer (`hrtimer`) is armed to fire at the start of the next period.
3. When the timer fires, the quota is replenished and threads are re-enqueued.

The CPU utilization of the *physical* CPU is separate from the utilization of the *allowed* quota. A container limited to 0.5 cores, running a CPU-bound task, will show 50% utilization on `top` — but 100% utilization of its quota, with throttling every period.

Throttling is directly observable:

```bash
# Check throttle statistics for a running container
CGPATH="/sys/fs/cgroup/cpu/docker/$(docker inspect --format='{{.Id}}' <name>)"
cat "$CGPATH/cpu.stat"
# nr_periods       <total scheduling periods elapsed>
# nr_throttled     <periods where the cgroup was throttled>
# throttled_time   <total nanoseconds spent throttled>
```

If `nr_throttled / nr_periods` is high (say, > 5%), the container's CPU limit is too tight for its workload, and you will observe elevated tail latency even when the host CPU is not saturated.

A container's CPU limit corresponds to a quota-to-period ratio:

$$\text{limit (cores)} = \frac{\texttt{cpu.cfs\_quota\_us}}{\texttt{cpu.cfs\_period\_us}}$$

So a container with `quota=200000`, `period=100000` is allowed $200000 / 100000 = 2.0$ cores.

### Memory Limit Enforcement and OOM

The cgroup memory controller tracks **RSS + anonymous memory + file-backed pages charged to the cgroup**. When usage reaches the hard limit (`memory.limit_in_bytes` on v1, `memory.max` on v2):

1. The kernel tries to reclaim page cache pages charged to the cgroup (clean pages can be dropped; dirty pages must be written back first).
2. If reclaim fails to bring usage
