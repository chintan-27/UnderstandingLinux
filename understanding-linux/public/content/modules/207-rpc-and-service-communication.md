---
id: 207
title: "RPC and service communication"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Remote Procedure Call (RPC) Foundations
RPC abstracts a networked function call into the same syntactic form as a local procedure call. The abstraction relies on three invariants that must hold for the client‑side stub to behave as if the remote procedure were local:

1. **Type Safety** – The marshaled arguments and return value must preserve the exact binary layout expected by the callee.  
2. **Transparency** – The client cannot distinguish a local call from a remote one except by observable latency or failure.  
3. **Failure Semantics** – The RPC layer must map network faults (lost packets, server crashes, partitions) to a well‑defined set of return values or exceptions that the application can reason about.

These invariants lead directly to the need for **serialization**, **timeout/retry**, and **load‑balancing** mechanisms. Without them, the invariants are violated: a corrupted byte stream breaks type safety, an unbounded wait breaks transparency, and an overloaded server turns transient failures into permanent ones.

### Why Retries and Deadlines Matter
Networks exhibit *packet loss* and *variable latency*. Let $p$ be the per‑attempt probability that a request reaches the server and receives a response before the client’s local timeout expires. If attempts are independent, the probability of eventual success after $n$ retries is  

$$
P_{\text{success}}(n) = 1-(1-p)^n .
\]

A *deadline* $D$ caps the total time the client is willing to wait. If each attempt consumes a random time $T_i$ (including backoff), the condition $\sum_{i=1}^{n} T_i \le D$ must hold. Choosing a backoff schedule influences both $p$ (by reducing collision probability) and the expected number of attempts that fit inside $D$.

### Serialization: From Memory to Wire
Serialization must satisfy two constraints:

* **Deterministic Layout** – The same source value always yields the same byte sequence, enabling the receiver to reconstruct it unambiguously.  
* **Alignment Padding** – Most XDR‑based RPC (the Sun RPC used by NFS, rpcbind) pads primitive fields to their natural alignment (e.g., a 32‑bit integer occupies 4 bytes and starts at a byte offset divisible by 4).

For a structure containing an `int32_t` followed by a `bool` (treated as `uint32_t` in XDR), the wire size is  

$$
\text{size} = 4\ \text{bytes (int)} + 4\ \text{bytes (bool padding)} = 8\ \text{bytes},
$$

even though the in‑memory size might be 5 bytes on a packed compiler layout. This padding cost is the primary source of serialization overhead in classic RPC.

### Load Balancing Principles
Load balancing aims to keep the *utilization* $\rho = \lambda / (\mu s)$ of each server below a threshold (commonly $\rho < 0.7$) where $\lambda$ is arrival rate, $\mu$ service rate, and $s$ number of parallel service threads. If requests are assigned uniformly at random to $N$ identical servers, the utilization per server is $\rho/N$. However, variance in request size causes *burst* imbalances; deterministic schemes like round‑robin or least‑connections reduce this variance.

## How It Works
### End‑to‑End RPC Sequence with Timing Model
Consider a client invoking a remote procedure `foo(args)`. The timeline below assumes a synchronous (blocking) client stub and a server that processes requests serially.

| Step | Action | Duration (typical) | Comment |
|------|--------|--------------------|---------|
| 1 | Client stub serializes `args` into XDR buffer | $T_{\text{ser}} = \frac{S}{B_{\text{cpu}}}$ | $S$ = serialized size, $B_{\text{cpu}}$ ≈ 0.5 GB/s on a modern core |
| 2 | Client → network transmission (one‑way) | $T_{\text{tx}} = \frac{S}{B_{\text{net}}}$ | $B_{\text{net}}$ = link bandwidth (e.g., 1 Gbps → 125 MB/s) |
| 3 | Server receives, deserializes | $T_{\text{deser}} = \frac{S}{B_{\text{cpu}}}$ |
| 4 | Server executes `foo` | $T_{\text{proc}}$ (application‑specific) |
| 5 | Server serializes result | $T_{\text{ser}}^{\prime}$ |
| 6 | Result → network | $T_{\text{tx}}^{\prime}$ |
| 7 | Client deserializes result | $T_{\text{deser}}^{\prime}$ |
| 8 | Client returns to caller | — |

The **round‑trip time (RTT)** for a successful call (no retries) is  

$$
\text{RTT}_0 = 2\bigl(T_{\text{ser}}+T_{\text{tx}}+T_{\text{deser}}\bigr) + T_{\text{proc}} .
\]

If the client does not receive a response within a locally set timeout $\tau$, it triggers a retry.

### Retry Algorithm with Exponential Backoff
A robust retry uses *exponential backoff* to reduce contention and respects a global deadline $D$. Pseudocode:

```c
#include <time.h>
#include <unistd.h>

#define BASE_DELAY_MS 10   /* initial backoff */
#define MAX_DELAY_MS  500  /* ceiling */
#define JITTER        0.1  /* ±10% random jitter */

bool rpc_call_with_retries(int max_retries,
                           struct timespec deadline,
                           bool (*send_req)(void),
                           bool (*is_success)(void))
{
    struct timespec now;
    int attempt = 0;
    double delay_ms = BASE_DELAY_MS;

    clock_gettime(CLOCK_MONOTONIC, &now);
    while (attempt < max_retries &&
           timespec_cmp(&now, &deadline) < 0) {
        if (send_req() && is_success())
            return true;

        /* backoff with jitter */
        double jitter = (double)rand() / RAND_MAX * 2 * JITTER - JITTER;
        double sleep_ms = delay_ms * (1.0 + jitter);
        if (sleep_ms > MAX_DELAY_MS) sleep_ms = MAX_DELAY_MS;
        usleep((useconds_t)(sleep_ms * 1000));

        delay_ms = fmin(delay_ms * 2, MAX_DELAY_MS);
        attempt++;
        clock_gettime(CLOCK_MONOTONIC, &now);
    }
    return false;
}
```

*Why exponential?* After each failure the probability of colliding with another retry halves (assuming Poisson retries), thus the expected number of attempts needed to succeed grows only logarithmically with load.

### Deadline Enforcement
A deadline can be expressed as an absolute `timespec`. The loop above checks `timespec_cmp(&now, &deadline) < 0` before each attempt. If the remaining time is less than the minimum backoff (`BASE_DELAY_MS`), the loop aborts and returns failure, guaranteeing the client never blocks beyond $D$.

### Load Balancing Dispatch
A simple *least‑connections* dispatcher maintains per‑server counters $c_i$. Upon a new request, it selects  

$$
i^\* = \arg\min_i c_i .
\]

When a request finishes, $c_{i^\*}$ is decremented. This yields a stationary distribution that matches the M/M/$s$ queue’s optimal routing under Poisson arrivals and exponential service.

## Worked Examples
### Example 1: Timing a Simple RPC Call
Assume:
* Payload size $S = 200$ bytes (arguments + result).
* CPU serialization bandwidth $B_{\text{cpu}} = 400$ MB/s.
* Network bandwidth $B_{\text{net}} = 100$ Mbps = 12.5 MB/s.
* Remote processing $T_{\text{proc}} = 0.8$ ms.
* Client timeout $\tau = 5$ ms, max retries = 3, base backoff = 2 ms.

Compute:

$$
T_{\text{ser}} = T_{\text{deser}} = \frac{200}{400\times10^6} = 0.5\ \mu s,
$$
$$
T_{\text{tx}} = T_{\text{tx}}^{\prime} = \frac{200}{12.5\times10^6} = 16\ \mu s.
$$

Thus  

$$
\text{RTT}_0 = 2(0.5+16)\mu s + 0.8\text{ms} \approx 0.835\text{ms}.
$$

Since $\text{RTT}_0 \ll \tau$, the first attempt will usually succeed. If the network drops the request with probability $p_{\text{loss}}=0.1$, the per‑attempt success probability is $p=0.9$. Probability of success within three attempts:

$$
P_{\text{success}}(3) = 1-(1-0.9)^3 = 1-0.001 = 0.999.
$$

Expected total time (including backoff) is  

$$
E[T] = \text{RTT}_0 + (1-p)\cdot\text{base} + (1-p)^2\cdot2\text{base} \approx 0.835\text{ms}+0.1\cdot2\text{ms}+0.01\cdot4\text{ms}=1.075\text{ms}.
$$

### Example 2: Retrying a Chunked File Transfer (NFSv3)
A client sends 8 KiB chunks via the `WRITE` procedure. Each chunk incurs an RTT of ~1 ms on a LAN. Suppose the link experiences a burst loss pattern: probability a chunk is lost = 0.02, independent per chunk.

*Without retries*: Expected successful chunks per 100‑chunk file = $100\times(1-0.02)=98$. The client must detect missing acknowledgments and abort, causing a retransmission of the whole file — highly inefficient.

*With per‑chunk retries* (max 3 attempts, base backoff 0.5 ms):  

Per‑chunk success probability after 3 tries: $1-(0.02)^3 = 0.999992$. Expected number of transmission attempts per chunk:  

$$
E[\text{tries}] = \sum_{k=1}^{3} k\,(0.02)^{k-1}(0.98) + 3\,(0.02)^3 \approx 1.02 .
$$

Effective throughput:  

$$
\frac{8\text{KiB}}{1.02\times1\text{ms}} \approx 7.84\text{MiB/s},
$$
close to the ideal 8 MiB/s (ignoring protocol overhead). This illustrates why fine‑grained retries preserve throughput under lossy conditions.

### Example 3: Load Balancing with Two NFS Servers
Two identical NFSv4 servers each handle requests at $\mu = 500$ ops/s. Poisson arrival rate $\lambda = 600$ ops/s.

*Random assignment*: Each server sees $\lambda/2 = 300$ ops/s → utilization $\rho = 300/500 = 0.6$. Probability of queue length > 10 (using M/M/1 formula $P_n = (1-\rho)\rho^n$) is $(1-0.6)0.6^{10}\approx 0.006$.

*Least‑connections*: Under the same load, the dispatcher keeps the utilizations balanced within ~±5 %, reducing the tail probability of overload by roughly a factor of 2. In practice, this translates to fewer NFS stale‑handle errors under spikes.

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Blocking RPC without timeout** | The client call may hang forever if the server crashes or the network partitions. | Violates transparency; the application cannot guarantee progress or release resources (e.g., file locks). |
| **Assuming idempotency for non‑idempotent procedures** | Retrying a `UPDATE_BALANCE` call twice may double‑credit an account. | Breaks correctness; RPC semantics must be explicitly defined (e.g., using checksums or operation tokens). |
| **Using a fixed‑size retry delay** | Constant backoff causes *synchronised retries* (thundering herd) after a transient outage. | Increases collision probability, lengthening recovery time and potentially overwhelming the server. |
| **Choosing a human‑readable format (XML/JSON) for high‑frequency RPC** | Parsing overhead dominates CPU usage; bandwidth inflation due to tags. | Reduces achievable requests‑per‑second; for microsecond‑scale services this is prohibitive. |
| **Neglecting server health checks in load balancer** | Requests are sent to a server that is still accepting TCP connections but has crashed its RPC daemon. | Leads to high error rates and timeouts, degrading perceived reliability despite “balanced” load. |
| **Misaligning XDR structures** | Sending a `struct {int32_t a; bool b;}` without padding leads the server to interpret the bool as part of the next field. | Causes silent data corruption; debugging is hard because the error manifests only when fields are used. |

## Exercises
1. **Basic RPC** – Write an `.x` file defining a program `TIMEPROG` with a single procedure `unsigned int gettime(void)`. Use `rpcgen -C` to generate client and server stubs. Implement the server to return the seconds since epoch (`time(NULL)`). Run the client and verify the output matches `date +%s`.  
   *Difficulty:* ★  

2. **Retry with Exponential Backoff** – Modify the client from Exercise 1 to call `gettime` via the retry function shown in the “How It Works” section. Introduce artificial packet loss using `iptables -A OUTPUT -p tcp --dport 2049 -j DROP --probability 0.1`. Measure success rate and average latency for 1 000 calls with max_retries = 3 and base delay = 10 ms.  
   *Difficulty:* ★★  

3. **Serialization Overhead Measurement** – Create two XDR structs:  
   a) `struct small { int32_t a; };`  
   b) `struct padded { int32_t a; bool b; };`  
   Serialize each 10 000 times, record the total bytes transmitted (`tcpdump -w -`), and compute the per‑call overhead. Explain the difference in terms of alignment padding.  
   *Difficulty:* ★★  

4. **Load‑Balancing Simulator** – Write a Python script that simulates two M/M/1 queues with arrival rate $\lambda = 800$ ops/s and service rate $\mu = 600$ ops/s per server. Compare three dispatch policies: (a) random, (b) round‑robin, (c) least‑connections. Plot the 95th‑percentile response time over 10 minutes of simulated time. Discuss why least‑connections outperforms the others under bursty arrivals.  
   *Difficulty:* ★★★  

5. **Linux RPC Inspection** – On a working Linux system with NFSv4 mounted (`mount | grep nfs4`), run:  
   ```bash
   # Show all registered RPC services and their ports
   rpcinfo -p
   # Dump the RPC statistics for NFS
   cat /proc/net/rpc/nfs
   # Trace a single RPC call with ktrace (if available) or strace
   strace -e trace=sendto,recvfrom,connect ./client_timeprog
   ```  
   Explain the output of each command, focusing on how the portmapper (`rpcbind`) resolves program numbers to network endpoints.  
   *Difficulty:* ★★  

## Linux Connection
### Real Subsystems and Tools
* **NFSv3/v4** – Implemented via Sun RPC (port 2049). The kernel module `sunrpc` provides the RPC transport layer; user‑space daemons (`rpc.nfsd`, `rpc.mountd`) register with `rpcbind`.  
* **NIS (YP)** – Uses the `ypbind` daemon and the `ypserv` program, both RPC‑based (program numbers 100004 and 100007).  
* **rpcbind (portmapper)** – Daemon that maps RPC program numbers to UDP/TCP ports. Configuration files live in `/etc/rpc` (program → number) and `/etc/rpcbind.conf`.  

### Essential Commands
```bash
# 1. List all RPC programs registered with the local portmapper
rpcinfo -p

# 2. Query a specific service (e.g., NFS) for its version and endpoints
rpcinfo -p | awk '$4=="nfs" {print $0}'
rpcinfo -u localhost nfs   # UDP query
rpcinfo -t localhost nfs   # TCP query

# 3. Show per‑protocol RPC statistics maintained by the kernel
cat /proc/net/rpc/nfs        # NFS client/server stats
cat /proc/net/rpc/rpcbind    # rpcbind stats

# 4. Adjust Sun RPC tunables (sysctl)
sysctl -w sunrpc.tcp_slot_table_entries=16   # increase concurrent TCP slots
sysctl -w sunrpc.udp_slot_table_entries=128  # increase UDP slots

# 5. Generate stubs from an XDR definition
#    Assume file timeprog.x contains the TIMEPROG definition from Exercise 1
rpcgen -C timeprog.x          # creates timeprog_clnt.c, timeprog_svc.c, timeprog_xdr.c
gcc -o client timeprog_clnt.c timeprog_xdr.c -ltirpc
gcc -o server timeprog_svc.c timeprog_xdr.c -ltirpc

# 6. Run the generated server and client in separate terminals
./server &
./client   # should print a Unix timestamp

# 7. Inspect the wire format with tcpdump (requires root)
sudo tcpdump -i lo -s0 -A -X port 2049   # observe XDR packets on loopback
```

### Where the Code Lives
* **Kernel RPC core** – `/usr/src/linux-headers-$(uname -r)/net/sunrpc/` (if sources installed).  
* **GLibc/TIRPC client stub library** – `/usr/lib/x86_64-linux-gnu/libtirpc.so`.  
* **rpcbind** – `/usr/sbin/rpcbind`, configured via `/etc/default/rpcbind`.  
* **Example XDR file** – `/usr/include/rpcsvc/timeprog.x` (often provided by the `rpcsvc` package).  

Understanding these paths lets you trace an RPC call from application → glibc stub → kernel `sunrpc` → network → `rpcbind` → daemon → back up the stack.

## Why This Matters
RPC is the lingua franca of distributed systems: it turns the network into an extension of the local address space while preserving strict semantics about data layout, timing, and fault tolerance. By mastering the first‑principles behind serialization (alignment, endianness), retry strategies (exponential backoff, deadline bounds), and load‑balancing (queueing theory, least‑connections), you gain the ability to:

* **Diagnose** latency spikes using `/proc/net/rpc/*` and `rpcinfo` with quantitative models.  
* **Design** robust services that gracefully handle packet loss, server crashes, and transient congestion—critical for cloud-native micro‑services and HPC storage stacks.  
* **Optimize** throughput by choosing the right serialization format (XDR vs. Protobuf vs. FlatBuffers) based on payload size and alignment cost.  
* **Tune** kernel RPC parameters (`sunrpc.* sysctls`) to match your workload’s concurrency needs without over‑allocating resources.  
* **Avoid** subtle correctness bugs that arise when retrying non‑idempotent operations or ignoring XDR padding.

In short, the concepts covered here are not academic; they are the very mechanisms that underlie NFS home directories, Kubernetes side‑car containers, and any system where a process must reliably invoke code on another machine. Mastery of them equips you to build, debug, and scale the distributed infrastructure that powers modern Linux‑based environments.
