---
id: 158
title: "Distributed systems interplay"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Distributed Systems Interplay
In a distributed system, correctness depends on how components handle **asynchronous communication**, **partial observability**, and **bounded resources**. Interplay is the set of rules that govern when a node should **retransmit**, **wait**, **shed load**, or **de‑duplicate** an operation. These rules are derived from the **CAP theorem** (consistency‑availability‑partition tolerance) and the **Fischer‑Lynch‑Paterson impossibility result**, which together imply that any protocol must trade off latency for fault‑tolerance.

### Retries and Timeouts – First‑Principles Derivation
Consider a request–response exchange over an unreliable channel where each transmission succeeds independently with probability \(p\). Let the one‑way network latency be a random variable \(L\) with known distribution (e.g., exponential with mean \(\mu\)). A node sets a timeout \(T\). The probability that a single attempt succeeds is  

\[
P_{\text{succ}}(T)=\Pr(L\le T)\,p = F_L(T)\,p,
\]

where \(F_L\) is the CDF of \(L\). If the attempt fails (either timeout or loss), the node may retry after a backoff interval \(B\). The expected number of attempts until success is  

\[
E[N]=\frac{1}{P_{\text{succ}}(T)}.
\]

To minimise expected latency while bounding the probability of **unbounded retries**, we choose \(T\) such that  

\[
F_L(T) \ge 1-\epsilon,
\]

for a small \(\epsilon\) (e.g., \(\epsilon=0.01\)). This yields a **timeout‑selection rule**: set \(T\) to the \((1-\epsilon)\)-quantile of the observed latency distribution.

### Partial Failure
A node fails when its **process crashes**, **network interface drops**, or **resource exhaustion** (CPU, memory, file descriptors) prevents it from responding. The system continues to operate if at least one **quorum** of replicas remains reachable. Formally, for a replicated service with \(N\) replicas and a quorum size \(Q\), the system tolerates up to \(N-Q\) simultaneous failures. Partial failure is therefore a **subset** of the replica set that is unavailable while the complement can still satisfy quorum‑based operations.

### Idempotency
An operation \(op\) is idempotent iff  

\[
\forall s\in S,\; op(op(s)) = op(s),
\]

where \(S\) is the state space. In practice, this means the operation’s effect depends only on the **input parameters**, not on how many times it is applied. Common idempotent patterns:  
- **PUT** with a full resource representation (HTTP/REST)  
- **DELETE** (removing a resource that may already be absent)  
- **Database upserts** (`INSERT … ON CONFLICT DO UPDATE`)  
- **Message deduplication** using a persistent log of processed IDs.

If \(op\) is not idempotent, retrying can violate **linearizability** (e.g., double‑charging a bank account). Therefore, the system must either **detect duplicates** via a unique request ID and stateful log, or **transform** the operation into an idempotent form.

### Backpressure – Control‑Theoretic View
Backpressure is a **feedback control** mechanism that matches the **arrival rate** \(\lambda_{in}\) of requests to the **service rate** \(\mu\) of a node. When \(\lambda_{in} > \mu\), the node’s queue length \(q(t)\) grows. A simple proportional controller sets the **allowed injection rate** \(\lambda_{out}\) as  

\[
\lambda_{out}= \mu - K_p \, q(t),
\]

with gain \(K_p>0\). If \(q(t)\) exceeds a threshold \(q_{max}\), the node signals **pressure** (e.g., via TCP window shrink, HTTP 429, or an application‑level `RETRY-AFTER` header). The sender then reduces its \(\lambda_{in}\) accordingly, preventing queue overflow and the consequent **tail‑latency explosion**.

---

## How It Works
### Detailed Protocol Flow with Mathematics
1. **Request Generation** – Client computes a globally unique request ID `uid = hash(timestamp‖clientID‖seq)`.  
2. **Initial Timeout Selection** – From recent RTT samples \(\{rtt_i\}\) (collected via `TCP_INFO` or `SO_TIMESTAMPING`), compute the empirical 99‑th percentile:  

   \[
   T_0 = \operatorname{percentile}_{0.99}(\{rtt_i\}).
   \]

3. **Transmission** – Send request with `sendto(sockfd, …, MSG_NOSIGNAL)`. Start a **monotonic timer** (`clock_gettime(CLOCK_MONOTONIC, &t0)`).  
4. **Wait for Response** – Block on `epoll_wait(epfd, &ev, 1, T_elapsed)` where  

   \[
   T_{\text{elapsed}} = T_0 \cdot \beta^{\text{attempt}} + J,
   \]  

   with backoff factor \(\beta = 2\) (exponential) and jitter \(J\sim\mathcal{U}[0, T_0\cdot\beta^{\text{attempt}}]\) to avoid synchronization.  
5. **Outcome Evaluation**  
   - **Response received** before timer expires → verify `uid` not seen before (idempotency cache lookup). If new, process; else discard.  
   - **Timer expires** → treat as loss; increment attempt counter.  
   - **Error from `sendto`** (`EAGAIN`, `ENOBUFS`) → apply same backoff; indicates local backpressure.  
6. **Backpressure Signal** – If the receiver’s queue length `q` exceeds `q_{high}`, it sets `TCP_WINDOW_UPDATE` to advertise a zero window or sends an application‑level `429 Too Many Requests` with `Retry-After: \delta`. The sender reduces its effective \(\lambda_{in}\) by multiplying its sending interval by \((1+\delta/RTT)\).  
7. **Termination** – After `MAX_ATTEMPTS` (typically 3‑5) without success, the client raises an exception to the application layer, which may trigger **circuit‑breaker** opening or **fallback** logic.

### Why Each Step Matters
- **Unique ID** prevents processing duplicate effects when retries happen after the server has already applied the operation (idempotency guarantee).  
- **Percentile‑based timeout** adapts to changing network conditions, reducing unnecessary retries (which increase load) while keeping the miss probability below \(\epsilon\).  
- **Exponential backoff + jitter** converts a deterministic retry storm into a Poisson‑like process, lowering the collision probability in congested networks (analysis similar to Ethernet CSMA/CD).  
- **Idle‑queue detection** (`q_{high}`) provides a leading‑edge signal before packet loss occurs, allowing smoother throughput regulation than loss‑based congestion control (e.g., TCP Reno).  
- **Circuit‑breaker** after repeated failures prevents **thundering herd** on recovery, protecting both client and server resources.

---

## Worked Examples
### Example 1: Exponential Backoff with Jitter – Numerical
Assume RTT samples show a 99‑th percentile of \(T_0 = 12\text{ ms}\). Max attempts = 4, \(\beta = 2\), jitter uniform \([0, T_0\beta^{k}]\).

| Attempt | Base timeout \(T_0\beta^{k}\) (ms) | Jitter (ms) | Total wait \(T_k\) (ms) | Cumulative time (ms) |
|---------|-----------------------------------|------------|--------------------------|----------------------|
| 0 (initial) | 12 | 0 (no jitter on first try) | 12 | 12 |
| 1 | 24 | 7 | 31 | 43 |
| 2 | 48 | 20 | 68 | 111 |
| 3 | 96 | 55 | 151 | 262 |

If the network loss probability per try is \(p_{loss}=0.1\) and success probability given delivery is \(p_{deliv}=0.95\), then  

\[
P_{\text{succ}} = (1-p_{loss})\,p_{deliv}=0.855.
\]

Probability of failure after 4 attempts:  

\[
P_{\text{fail}} = (1-P_{\text{succ}})^4 = (0.145)^4 \approx 4.4\times10^{-4}.
\]

Thus the expected latency (conditioned on eventual success) is  

\[
E[T] = \sum_{k=0}^{3} T_k \, P_{\text{succ}}(1-P_{\text{succ}})^k + T_{4}\,(1-P_{\text{succ}})^4 \approx 78\text{ ms}.
\]

### Example 2: Idempotent PUT with Duplicate Detection
A service stores user profiles under `/profiles/<uid>`. The operation `PUT /profiles/123` with JSON body `{ "name":"Alice", "age":30 }` is idempotent because repeated writes store the same value. The server maintains a **write‑ahead log** (WAL) entry `<uid, txnID, hash(body)>`. On receipt, it checks:  

1. If `txnID` already present in WAL → **acknowledge** without rewriting.  
2. Else, write new version, append to WAL, fsync, then ack.

If the client retries after a timeout, the second `PUT` carries the same `txnID`; the server detects the duplicate and avoids a second `fsync`, saving ~0.5 ms of disk latency per duplicate.

### Example 3: Token‑Bucket Backpressure in NGINX
NGINX limits request rate using the `limit_req` module. Configuration:

```
limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;
server {
    location /api/ {
        limit_req zone=mylimit burst=20 nodelay;
        proxy_pass http://backend;
    }
}
```

- **Token bucket** parameters: rate = 10 tokens/s, bucket size = burst = 20.  
- When arrival rate \(\lambda = 15\) r/s, the bucket drains at 10 r/s, allowing bursts up to 20 tokens. After the bucket empties, excess requests receive HTTP 429 with `Retry-After: 0.1s` (since each token replenishes every 0.1 s).  
- The client, upon seeing 429, reduces its send rate to ≤10 r/s, stabilizing queue length at the backend.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Fixed timeout regardless of observed RTT** | Using a constant `T = 1s` even when median RTT is 20ms or 500ms. | Causes either **excessive retransmissions** (wasting bandwidth) or **missed failures** (delayed detection). Timeout must be a function of measured latency distribution. |
| **Retrying non‑idempotent writes without deduplication** | Sending `POST /orders` (creates a new order) repeatedly on timeout. | Leads to **duplicate orders**, financial over‑charge, and violates **exact‑once semantics**. Requires either making the operation idempotent (e.g., `PUT` with client‑generated ID) or storing a duplicate‑detector log. |
| **Ignoring jitter in backoff** | Using pure exponential backoff `T_k = T0 * 2^k`. | When many clients synchronize (e.g., after a network partition), they retry in lockstep, causing **retry storms** that exacerbate congestion. Jitter decorrelates retry times, converting deterministic collisions into probabilistic ones with lower peak load. |
| **Setting backpressure threshold too high** | Activating backpressure only after queue length > 1000 requests. | By the time backpressure kicks in, latency tail has already exploded (Little’s Law: \(L = \lambda W\)). Early signalling (e.g., at 80% of target queue) keeps 99th‑percentile latency within SLA. |
| **Using `SO_RCVTIMEO` for application‑level timeout** | Relying on socket receive timeout to abort a request. | `SO_RCVTIMEO` only aborts the **blocking recv()**, not the whole transaction; if data arrives partial, the app may misinterpret it. Proper timeout must be managed by the application using monotonic timers and explicit state machines. |

---

## Exercises
### Easy – Implement Exponential Backoff with Jitter (Python)
Write a function `call_with_retry(fn, *args, max_attempts=4, base_timeout=0.01, backoff=2)` that:
1. Measures RTT of successful calls via a moving average.
2. Sets initial timeout to the 99‑th percentile of observed RTTs (use a simple list and `numpy.percentile` or manual sorting).
3. On each timeout, waits `base_timeout * (backoff**attempt) + random.uniform(0, base_timeout * (backoff**attempt))`.
4. Returns the result or raises the last exception after `max_attempts`.

### Medium – Design an Idempotent Resource Update (HTTP + LevelDB)
Using Go or Rust, implement a REST endpoint `PUT /kv/{key}` that:
- Expects a JSON body `{ "value": <string> }`.
- Stores the value in LevelDB under the key.
- Generates a UUID v4 for each request, stores `<key, UUID>` in a separate LevelDB column family.
- On receipt, checks if the UUID already exists for that key; if yes, returns `200 OK` without writing.
- Returns `201 Created` on first write, `200 OK` on duplicate.
Provide the code and a `curl` test showing duplicate detection.

### Hard – Simulate Token‑Bucket Backpressure with `epoll` and `timerfd` (C)
Create a program that:
1. Opens a TCP listening socket on port 9000.
2. Uses `epoll` to accept connections and read requests (fixed‑size 64‑byte messages).
3. Implements a token bucket: `rate = 50 tokens/s`, `burst = 100`.
4. For each incoming connection, if tokens > 0, consume one and echo the message; otherwise, send `HTTP/1.1 429 Too Many Requests\r\nRetry-After: 0.02\r\n\r\n` and close.
5. Replenishes tokens via a `timerfd` that fires every 10 ms, adding `rate * 0.01 = 0.5` tokens (use fixed‑point arithmetic).
6. Logs per‑second accepted/rejected counts.
Show how to compile (`gcc -Wall -O2 backpressure.c -o backpressure`) and run (`./backpressure &`), then test with `hey -z 10s -c 50 http://127.0.0.1:9000/`.

---

## Linux Connection
### Socket‑Level Timeout Configuration
```c
/* Set send and receive timeouts to 200 ms */
struct timeval tv = { .tv_sec = 0, .tv_usec = 200000 };
setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
```
- `SO_SNDTIMEO` aborts `send()` after the interval if the kernel cannot copy data to the send buffer (e.g., due to `EWOULDBLOCK` from flow control).  
- `SO_RCVTIMEO` aborts `recv()` if no data arrives; useful for **client‑side** request timeout but must be paired with explicit sequence numbers to avoid accepting stale data.

### Measuring RTT with `TCP_INFO`
```c
struct tcp_info info;
socklen_t len = sizeof(info);
getsockopt(fd, IPPROTO_TCP, TCP_INFO, &info, &len);
double rtt_us = info.tcpi_rtt * 1000.0 / info.tcpi_rttvar;  // approx.
```
- `tcpi_rtt` is the smoothed round‑trip time in microseconds (Linux’s internal RFC 6298 estimator).  
- Use a moving window of the last 10 samples to compute the 99‑th percentile via `nfth_element` or a quick‑select algorithm.

### Epoll‑Based Timeout Handling
```c
int epfd = epoll_create1(0);
struct epoll_event ev = { .events = EPOLLIN, .data.fd = connfd };
epoll_ctl(epfd, EPOLL_CTL_ADD, connfd, &ev);

/* Wait up to timeout_ms */
int n = epoll_wait(epfd, &ev, 1, timeout_ms);
if (n == 0) { /* timeout */ }
else if (n < 0) { /* error */ }
else { /* data ready */ }
```
- `epoll_wait` returns 0 when the supplied timeout expires, giving a **kernel‑level** timeout that does not require busy‑looping.

### Timerfd for Periodic Token Replenishment
```c
int tfd = timerfd_create(CLOCK_MONOTONIC, TFD_NONBLOCK);
struct itimerspec its = {
    .it_interval = { .tv_sec = 0, .tv_nsec = 10'000'000 }, // 10 ms
    .it_value    = { .tv_sec = 0, .tv_nsec = 10'000'000 }
};
timerfd_settime(tfd, 0, &its, NULL);

/* In event loop */
uint64_t expirations;
read(tfd, &expirations, sizeof(expirations)); // consumes notifications
tokens += rate * 0.01 * expirations;          // fixed‑point update
```
- `timerfd` delivers a file descriptor that becomes readable at each interval, allowing the backpressure controller to run inside the same `epoll` loop without extra threads.

### Observing Kernel Retry Counters
```bash
# Show TCP retransmits per second
watch -n 1 "cat /proc/net/snmp | grep -E 'TcpRetransSegs|TcpOutSegs'"
```
- `TcpRetransSegs` increments each time the kernel retransmits a TCP segment due to timeout or duplicate ACK.  
- Comparing `TcpRetransSegs` vs `TcpOutSegs` yields the **retransmission ratio**, a direct indicator of whether your application‑level timeout is too aggressive.

### Using `ss` to Inspect Socket State
```bash
ss -ti state established '( dport = :9000 )'
```
Output includes:
- `rto:` – current retransmission timeout (ms) calculated by the kernel.  
- `cwnd:` – congestion window (segments).  
- `snd_wnd:` – peer’s advertised receive window.  
These values let you verify that your application’s backoff aligns with the kernel’s own RTT estimator.

---

## Why This Matters
Mastering the interplay of retries, timeouts, partial failure, idempotency, and backpressure transforms a distributed system from a fragile collection of communicating processes into a **self‑stabilizing service** that can:
- **Bound latency** under lossy networks by selecting timeouts from empirical latency quantiles, not guesswork.  
- **Guarantee safety** despite repeated attempts through strict idempotency or duplicate detection, preventing corrupt state transitions.  
- **Preserve throughput** under load by employing control‑theoretic backpressure (token bucket, TCP window) that reacts before queues overflow, thus keeping tail latency within SLA.  
- **Leverage Linux primitives** (`setsockopt`, `TCP_INFO`, `epoll`, `timerfd`, `/proc` counters) to implement these mechanisms with minimal overhead and observable metrics.  

When these concepts are correctly applied, the system exhibits **predictable failure detection**, **exactly‑once semantics** where required, and **graceful degradation** instead of cascading collapse—properties essential for modern infrastructure ranging from micro‑services to distributed databases and edge computing platforms. The next step for the practitioner is to instrument these mechanisms, measure their effect in production, and tune the parameters (timeout percentiles, backoff factor, token rates) to match the observed traffic characteristics. This closes the loop from theory to observable, operable reliability.
