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

## Why This Matters

When two processes communicate across a network, the network can drop packets, delay them arbitrarily, duplicate them, or partition the communicating parties entirely — and the sender receives no synchronous notification that any of this happened. Without deliberate handling of these failure modes: a client waiting for a response hangs forever; a server drowns under retry storms from every client simultaneously; an operation executes twice when it should execute once; a slow consumer causes a fast producer to exhaust memory and crash.

TCP already solves many of these problems inside a single connection. Studying exactly *how* — exponential backoff, selective acknowledgment, congestion windows — gives you the mechanical intuition needed to reason about the same problems at the application layer, where TCP's help ends and yours begins.

## Core Concepts

### Timeouts

A timeout is a bet: "if I haven't heard back within $T$ seconds, I'll assume something went wrong." Choosing $T$ poorly breaks the system in both directions. Too short: you declare failure when the reply was already in flight, causing duplicate work and amplifying load on a struggling server. Too long: a dead peer holds your thread for an arbitrarily extended interval, eventually exhausting the thread pool.

TCP calculates a dynamic retransmission timeout (RTO) from measured round-trip time using the Jacobson/Karels algorithm (RFC 6298). Let $\hat{R}$ be the smoothed RTT estimate (EWMA) and $\hat{V}$ be the mean deviation estimate. On each RTT sample $R_m$:

$$\hat{V} \leftarrow (1 - \beta)\hat{V} + \beta\,|\hat{R} - R_m|, \qquad \beta = \tfrac{1}{4}$$

$$\hat{R} \leftarrow (1 - \alpha)\hat{R} + \alpha R_m, \qquad \alpha = \tfrac{1}{8}$$

$$\text{RTO} = \hat{R} + 4\hat{V}$$

The $4\hat{V}$ term is deliberate: it provides headroom for jitter proportional to observed variance, so the timeout tracks actual network behavior rather than being a fixed constant. When variance is low (stable LAN), RTO stays tight. When variance is high (cross-continental path with queuing), RTO automatically widens. Application-level timeouts should be informed by exactly this reasoning: measure RTT to your dependency, smooth it, add variance slack.

### Retries

Retrying on failure is the natural response to a timeout, but naive retries amplify the original problem. If $N$ clients all time out at $T = 5\,\text{s}$ and all retry simultaneously, they produce a synchronized thundering herd that hits a server already struggling — exactly when it is least able to absorb load. TCP uses **exponential backoff** to avoid this: each successive retransmission waits twice as long as the previous one, capped at a maximum:

$$\text{RTO}_n = \min\!\left(2^n \cdot \text{RTO}_0,\ \text{RTO}_{\max}\right)$$

The doubling serves two purposes: it reduces the arrival rate of retries at a congested receiver (giving the system time to recover), and it spreads retries from multiple clients across time — because small random initial differences compound exponentially, clients that started synchronized become desynchronized after a few doublings.

Adding explicit **jitter** — a random offset on each retry interval — accelerates this desynchronization:

$$\text{wait}_n = \min\!\left(2^n \cdot \text{base},\ \text{cap}\right) \cdot U(0, 1)$$

where $U(0,1)$ is a uniform random variable. This is the "Full Jitter" strategy from the AWS architecture blog, and it is measurably superior to pure exponential backoff under high concurrency.

### Idempotency

An operation is **idempotent** if applying it $n$ times produces the same result as applying it once:

$$f^n(x) = f(x) \quad \forall\, n \geq 1$$

This matters because timeouts create ambiguity: the server may have received the request and failed to reply, or it may never have received it. If you cannot distinguish these cases — and across a network, you generally cannot — you *must* retry, which means the operation may execute twice. A `GET` is idempotent by construction; a `POST` that appends a record or debits a balance is not.

The standard mechanism for making non-idempotent operations safe to retry is a **client-generated idempotency key**: a unique identifier included in every request that the server uses to deduplicate. The server stores a mapping from key to result; a second request with the same key returns the stored result without re-executing. The key must be generated *once per logical operation* and reused across all retry attempts.

### Partial Failure

In a single process, a function either returns or it does not — there are two outcomes. Across a network, a third outcome exists: the operation ran on the remote side but the acknowledgment was lost. You cannot distinguish "server crashed before processing" from "server processed and crashed before replying" from "reply was dropped in transit." This is the **partial failure** problem: a remote call has observable quantum superposition between success and failure until some additional evidence resolves it.

Idempotency and exactly-once semantics exist entirely to cope with partial failure. The reason distributed systems are fundamentally harder than local ones is not latency or bandwidth — it is that partial failure makes the state of the remote side unknowable, and every protocol decision has to account for that.

### Backpressure

When a producer generates work faster than a consumer can process it, one of three things happens: the consumer's queue grows without bound (memory exhaustion), work is dropped (loss), or the producer is slowed down (backpressure). Backpressure is the only option that preserves work without exhausting memory.

TCP implements backpressure via the **receive window** (`rwnd`): the receiver advertises available buffer space in bytes in every ACK segment, and the sender may not have more unacknowledged bytes in flight than `rwnd`. The actual constraint on how much the sender can inject into the network at any moment is:

$$\text{FlightSize} \leq \min(\text{cwnd},\ \text{rwnd})$$

where `cwnd` is the congestion window (network-limited, maintained by the sender's congestion control algorithm) and `rwnd` is the flow control window (receiver buffer-limited, advertised by the receiver). When the receiver's application stops reading — `recv()` calls pause — the kernel receive buffer fills, `rwnd` drops to zero, and the sender stops transmitting. This is backpressure propagating from the slow consumer back to the producer through the protocol itself, without any application-level code.

## How It Works

### TCP's Retransmission State Machine

When TCP sends a segment, it places a copy in the retransmission queue and arms a timer set to the current RTO. If an ACK covering that segment arrives before the timer fires, the segment is removed from the queue and the timer is cancelled. If the timer fires first, TCP retransmits the segment and **doubles the RTO** (Karn's algorithm: do not update the RTT estimator from retransmitted segments, because you cannot tell which transmission the ACK corresponds to).

On Linux, the number of retransmit attempts before the connection is aborted is controlled by:

```bash
# Maximum number of TCP data retransmissions (default: 15, ~30 minutes)
sysctl net.ipv4.tcp_retries2

# Set to 5 for faster failure detection (≈ 2–3 minutes depending on RTO)
sysctl -w net.ipv4.tcp_retries2=5
```

After `tcp_retries2` retransmissions without acknowledgment, the kernel tears down the connection and delivers `ETIMEDOUT` to userspace on the next `read()` or `write()`. The actual timeout duration is not simply `RTO × retries` — because RTO doubles each attempt, it is approximately:

$$T_{\text{abort}} \approx \text{RTO}_0 \cdot (2^{n+1} - 1)$$

where $n$ is `tcp_retries2`. At the default RTO floor of 200 ms and `tcp_retries2=15`, this produces roughly 30 minutes of persistence before userspace sees an error — far too long for most service-to-service calls.

You can observe the retransmission state machine directly:

```bash
# Watch retransmit counters per connection in real time
ss -tin dst <target_ip>
# Look for: rto:<ms> rtt:<smoothed>/<variance> retrans:<count>/<total>

# Or watch kernel TCP stats globally
nstat -az | grep -E 'RetransFail|RetransSegs|TCPTimeouts'
```

### Fast Retransmit: Not Waiting for the Timer

Waiting for the RTO timer to fire is slow — RTOs are typically hundreds of milliseconds. TCP has a faster loss recovery path: when the receiver gets an out-of-order segment, it immediately sends a **duplicate ACK** acknowledging the last contiguous in-order byte. When the sender receives **three duplicate ACKs** for the same sequence number, it infers packet loss rather than reordering (reordering rarely displaces more than 1–2 packets) and retransmits the missing segment immediately, without waiting for the timer.

Three duplicates is the threshold because normal reordering might produce one or two duplicate ACKs; three consecutive duplicates is strong evidence of loss. The sender also halves `cwnd` at this point (this is the fast recovery phase of TCP Reno/CUBIC), because three duplicate ACKs mean the network is still delivering packets — it's congested, not broken.

```bash
# Observe fast retransmit events
nstat -az | grep TCPFastRetrans

# Capture and inspect duplicate ACKs on a specific port
tcpdump -nn -i eth0 'tcp and port 80' -w capture.pcap
# Then in Wireshark: filter tcp.analysis.duplicate_ack
```

### SACK: Telling the Sender Exactly What Was Lost

Without Selective Acknowledgment (SACK), a cumulative ACK can only say "I have everything up to byte $N$." If segments $A$, $B$, and $C$ are sent and $B$ is lost, the receiver has $A$ and $C$
