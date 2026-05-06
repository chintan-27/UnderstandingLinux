---
id: 206
title: "Failure models"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Failure Models in Networked Systems
A failure model abstracts how a system’s internal state deviates from its specification when a fault occurs. In the context of TCP, the relevant state includes:
* **Sequence numbers** (`SND.UNA`, `SND.NXT`, `RCV.NXT`)
* **Timer states** (retransmission timer, keepalive timer, persistence timer)
* **Connection‑control flags** (SYN, FIN, RST, ACK)

Each model describes a distinct class of state corruption.

#### Crash Failure (Fail‑Stop)
A crash failure removes all local state atomically. The process ceases to execute; any in‑kernel socket buffers are released by the kernel’s `skb_free` path when the file descriptor table is torn down. From the peer’s viewpoint, the connection appears to have vanished: no ACKs, no RST, and the socket transitions to `TCP_CLOSE_WAIT` → `TCP_LAST_ACK` only if the peer attempts to close.

#### Omission Failure (Fail‑Silent)
An omission failure leaves the process alive but prevents a specific action, most commonly the transmission of a required packet. The kernel still holds the socket, timers continue to run, and the local state machine progresses only insofar as events are received. The peer experiences missing ACKs or data segments, triggering retransmission logic.

#### Partition Failure
A partition failure isolates sets of nodes such that no packet can cross the cut. Both endpoints retain their local state, but the inter‑partition link delivers zero packets. The connection remains in `TCP_ESTABLISHED` on both sides until retransmission timers expire, at which point each side aborts independently.

#### Partial Failure
A partial failure corrupts a subset of the protocol’s functions while leaving others intact. Examples include:
* **Zero‑window syndrome** – the application can receive data (read() succeeds) but never calls `write()` or `send()`, causing the advertised window to shrink to zero.
* **Selective ACK loss** – the receiver generates ACKs but the sender’s ACK‑processing code is buggy, so SACK blocks are ignored.

Partial failures are detectable only by observing asymmetric progress (e.g., flow‑control updates in one direction but not the other).

### Fate Sharing
Fate sharing is a design principle: **store all state required to recover a communication association at the endpoints that create the association**.  
*Why?* If state were stored in intermediate network elements (routers, switches), a failure of those elements would destroy the state and prevent recovery, even if the endpoints are still alive. By contrast, endpoint‑resident state survives as long as at least one endpoint remains operational, allowing the connection to be resumed after transient network faults.

In TCP, the association state (sequence numbers, timers, socket buffers) lives entirely in the socket structures allocated by `inet_csk_alloc_sock`. The network merely transports segments; it never stores connection‑specific data.

## How It Works
### Interaction of Failure Models and Fate Sharing in TCP
TCP’s reliability mechanisms are derived directly from the failure models:

| Failure Model | Detection Mechanism (fate‑sharing) | Recovery Action |
|---------------|-----------------------------------|-----------------|
| Crash         | Missing keepalive ACKs → retransmission timeout → RST | Abort connection, notify application via `ECONNRESET` |
| Omission      | Missing data ACKs → retransmission timer exponential backoff → duplicate ACKs → fast retransmit | Resend missing segment(s) |
| Partition     | Symmetric loss of ACKs → both sides exceed retransmission retry limit → abort | Connection fails on both ends |
| Partial       | Asymmetric flow‑control (e.g., zero window) → persistence timer probes → application‑level timeout | Application may close or trigger error handling |

The keepalive mechanism is an *application‑level* heartbeat that leverages fate sharing: the endpoint sends a probe segment with no payload; the peer must reflect it with an ACK if the TCP stack is alive. Because the probe contains no application data, it does not interfere with normal data flow but still tests liveness.

#### Keepalive Timing Derivation
Linux exposes three sysctl variables:

* `$t_{idle}$` – `net.ipv4.tcp_keepalive_time` (seconds of inactivity before first probe)  
* `$t_{intvl}$` – `net.ipv4.tcp_keepalive_intvl` (seconds between probes)  
* `$N_{probe}$` – `net.ipv4.tcp_keepalive_probes` (number of unanswered probes before abort)

The worst‑case detection time `$T_{det}$` for a crashed peer is:

$$
T_{det} = t_{idle} + N_{probe} \cdot t_{intvl}
$$

*Derivation*: After `$t_{idle}$` seconds of silence, the first probe is sent. If the peer is dead, each probe elicits no ACK; after `$N_{probe}$` consecutive failures, the kernel aborts the connection and returns `ETIMEDOUT` to any pending `send()`.

Example values (default on many distros):
* `$t_{idle}=7200\ \text{s}$` (2 h)
* `$t_{intvl}=75\ \text{s}$`
* `$N_{probe}=9$`

$$
T_{det}=7200 + 9 \times 75 = 7200 + 675 = 7875\ \text{s} \approx 2\ \text{h}\ 11\ \text{m}\ 15\ \text{s}
$$

### Retransmission Timeout (RTO) Computation
TCP’s omission/retransmission logic relies on the Jacobson/Karels algorithm:

$$
\begin{aligned}
\text{RTT}_{\text{sample}} &= T_{\text{ack}} - T_{\text{send}} \\
\text{SRTT} &\leftarrow (1 - \alpha) \cdot \text{SRTT} + \alpha \cdot \text{RTT}_{\text{sample}} \\
\text{RTTVAR} &\leftarrow (1 - \beta) \cdot \text{RTTVAR} + \beta \cdot |\text{RTT}_{\text{sample}} - \text{SRTT}| \\
\text{RTO} &\leftarrow \text{SRTT} + 4 \cdot \text{RTTVAR}
\end{aligned}
$$

with $\alpha = 1/8$, $\beta = 1/4$. The RTO is clamped between `$tcp\_rto\_min$` (typically 200 ms) and `$tcp\_rto\_max$` (typically 120 s). After each timeout, the delay doubles (exponential backoff) up to `$tcp\_retries2$` attempts (default 15), yielding a total abort time of roughly 13‑30 minutes depending on the initial RTO.

## Worked Examples
### Example 1: Crash Failure Detection via Keepalive
**Scenario**: Client `C` and server `S` maintain an idle TCP connection. `S` crashes abruptly (power loss).  

**Step‑by‑step**:
1. `C` has not sent data for `$t_{idle}=7200$` s. Kernel triggers the keepalive timer.
2. First keepalive probe: `C` sends a segment with `SEQ=SND.UNA`, no payload, `ACK` flag set.
3. `S` is down → no response. Keepalive timer rearms after `$t_{intvl}=75$` s.
4. After `$N_{probe}=9$` probes (total elapsed `$T_{det}=7875$` s), kernel aborts the socket:
   * `tcp_write_timeout()` calls `inet_csk_clear_xmit_timer()`.
   * `sk->sk_err = ETIMEDOUT`; error queue receives the error.
   * Any blocking `read()`/`write()` returns `-1` with `errno = ETIMEDOUT`.
5. As part of abort, TCP transmits a **RST** segment (if the socket is still in `ESTABLISHED` state) to inform the peer’s IP stack that the connection is no longer valid.

**Experimental verification**:
```bash
# Terminal 1: start a simple echo server
$ nc -l -p 8080 &
# Terminal 2: connect client and enable keepalive
$ ./client 127.0.0.1 8080   # client sets SO_KEEPALIVE via setsockopt
# In another terminal, kill the server after 30s of idle
$ kill %1
# Observe client side:
$ ss -ti state established '( dport = :8080 )'
```
The `ss` output will show `timer:(keepalive,7200ms,0)` changing to `timer:(keepalive,75ms,8)` after the first probe, eventually transitioning to `timer:(off,0,0)` and the socket disappearing.

### Example 2: Omission Failure and Retransmission Backoff
**Scenario**: Server application correctly receives data but fails to call `send()` for the ACK (bug in application logic).  

**Step‑by‑step**:
1. Client sends segment with `SEQ=1000`, `LEN=200`. Kernel places data in send buffer, starts retransmission timer with initial RTO `$RTO_0 = 1$ s` (default `tcp_rto_min` after RTT estimation).
2. Server’s TCP layer receives segment, sends ACK (`ACK=1200`). Application never reads the ACK from its socket buffer, so the ACK is never transmitted to the network (omission).
3. Client does not see ACK → retransmission timer expires after `$RTO_0$`. Kernel retransmits the same segment, doubles the timer (`$RTO_1 = 2$ s`), increments retry counter.
4. This repeats: after `$n$` timeouts, `$RTO_n = 2^n$ s` (capped at `$tcp\_rto\_max$ = 120$ s). The kernel continues until `$tcp\_retries2$` (default 15) attempts are exhausted.
5. After the final timeout, the connection is aborted with `ETIMEDOUT`. The server, still believing the data was sent, may have buffered the data internally; its socket remains in `ESTABLISHED` until the application closes it or receives the RST from the client.

**Numerical example**:
* Initial RTO = 1 s, backoff factor 2, max 120 s, max attempts = 8 (for illustration).
* Sequence of timeouts: 1, 2, 4, 8, 16, 32, 64, 120 s → cumulative ≈ 243 s (≈4 min) before abort.

**Verification**:
```bash
# Terminal 1: run a server that reads but never ACKs
$ ./omitack_server 8080 &
# Terminal 2: client that sends a single packet and waits for reply
$ ./client 127.0.0.1 8080 <<< "ping"
# Use tcpdump to see retransmissions:
$ sudo tcpdump -i lo -nn -s 0 -v 'tcp[tcpflags] & (tcp-syn|tcp-fin|tcp-rst) != 0 or tcp[13] == 0x10'
```
You will observe the client retransmitting the same packet with increasing intervals.

### Example 3: Partition Failure and Symmetric Abort
**Scenario**: Two hosts, `A` and `B`, are connected via a router. An administrator inserts an iptables rule that drops all packets between them.

**Step‑by‑step**:
1. TCP connection established (`SYN/SYN-ACK/ACK`). Both sides enter `ESTABLISHED`.
2. No application traffic; after `$t_{idle}$`, keepalive probes start.
3. Each keepalive probe is dropped by the router → no ACK returned.
4. After `$N_{probe}$` failed keepalives, each side aborts locally (`ETIMEDOUT`) and sends a RST (if the socket is still open). The RST is also dropped, so each side sees only its own abort.
5. End result: both sockets transition to `CLOSED` without ever observing the peer’s RST.

**Experimental setup using network namespaces**:
```bash
# Create two namespaces linked by a veth pair
$ sudo ip netns add nsA
$ sudo ip netns add nsB
$ sudo ip link add vethA type veth peer name vethB
$ sudo ip link set vethA netns nsA
$ sudo ip link set vethB netns nsB
$ sudo ip netns exec nsA ip addr add 10.0.0.1/24 dev vethA
$ sudo ip netns exec nsB ip addr add 10.0.0.2/24 dev vethB
$ sudo ip netns exec nsA ip link set vethA up
$ sudo ip netns exec nsB ip link set vethB up

# Start server in nsB, client in nsA
$ sudo ip netns exec nsB nc -l -p 8080 &
$ sudo ip netns exec nsA nc 10.0.0.2 8080

# Introduce partition: drop all traffic between the veths
$ sudo iptables -A FORWARD -i vethA -o vethb -j DROP
$ sudo iptables -A FORWARD -i vethb -o vethA -j DROP

# Observe with ss inside each namespace
$ sudo ip netns exec nsA ss -ti state established '( dport = :8080 )'
$ sudo ip netns exec nsB ss -ti state established '( sport = :8080 )'
```
After `$T_{det}$` seconds, both `ss` outputs will show the socket gone.

### Example 4: Partial Failure – Zero‑Window Condition
**Scenario**: Server’s application calls `read()` but never consumes data; the advertised receive window shrinks to zero.

**Step‑by‑step**:
1. Client sends data; server’s TCP layer accepts it, increments `RCV.NXT`, and sends an ACK with `window=0`.
2. Client’s sender receives zero‑window ACK → invokes **persistence timer** (default `$tcp\_keepalive\_intvl$`‑based, but specifically `$tcp\_persist\_min$` = 5 s, doubling up to `$tcp\_persist\_max$` = 120 s).
3. Persistence timer triggers a **window probe**: a single‑byte segment (`SEQ=SND.UNA`) is sent to elicit a window update.
4. Application still not reading → window remains zero; probe elicits another zero‑window ACK.
5. Timer backs off exponentially (5 s, 10 s, 20 s, 40 s, 80 s, 120 s, then stays at 120 s). After `$tcp\_retries2$` probes (default 15), the connection is aborted with `ETIMEDOUT`.

**Code to probe the condition**:
```c
/* server side – deliberately do not read */
int conn = accept(listenfd, (struct sockaddr *)&cli, &len);
while (1) {
    /* intentionally block on select() without reading */
    select(conn+1, &(fd_set){ .fds_bits[0] = 1 << (conn % __NFDBITS) }, NULL, NULL, NULL);
}
```
Client side can monitor the send queue growth via `/proc/<pid>/net/tcp` or `ss -i`.

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **Confusing crash vs omission** | Both manifest as missing ACKs, but crash removes *all* state (process gone), while omission leaves the endpoint alive and timers running. | Crash → RST after keepalive failure; omission → retransmission backoff until RTO limit. |
| **Assuming TCP keepalive probes are application‑level messages** | Keepalive probes are generated by the kernel TCP stack, not by the application; they contain no payload and are ACK‑only. | Application must enable `SO_KEEPALIVE`; the kernel decides when to send probes based on idle time. |
| **Believing that setting `net.ipv4.tcp_keepalive_time` alone guarantees failure detection** | Detection also depends on `tcp_keepalive_intvl` and `tcp_keepalive_probes`; if probes are unanswered, the connection may persist indefinitely if the count is zero. | All three sysctls must be tuned together; `T_detect = keepalive_time + keepalive_intvl * keepalive_probes`. |
| **Thinking that `tcp_retries2` controls keepalive retries** | `tcp_retries2` governs retransmission timeout attempts for *data* segments; keepalive uses a separate internal counter derived from `tcp_keepalive_probes`. | Adjust `tcp_keepalive_probes` to change keepalive retry count. |
| **Using `tcpdump` without filtering for keepalive packets and missing them in high‑traffic traces** | Keepalive probes are small (typically 1‑byte payload, ACK flag) and can be lost in a flood of data packets. | Filter with `tcp[13] == 0x10` (pure ACK) and optionally `tcp[offset] == 0` to capture zero‑length ACKs. |
| **Assuming a zero window always indicates a bug** | A zero window is legitimate when the receiver’s application is temporarily busy (e.g., waiting for I/O). | Persistence timer is designed to probe the window; only if the window stays zero after retries does it signal a failure. |

## Exercises
### Easy
1. **Get and print current TCP keepalive parameters**  
   Write a C program that calls `getsockopt(fd, IPPROTO_TCP, TCP_KEEPIDLE, …)` etc., and prints the values in seconds. Verify against `/proc/sys/net/ipv4/tcp_keepalive_*`.

2. **Observe keepalive probes with `tcpdump`**  
   Start an idle `nc` listener, connect a client, enable `SO_KEEPALIVE`, and run:
   ```bash
   sudo tcpdump -i any -nn -s 0 -v 'tcp[13] == 0x10 && tcp[20:2] == 0'
   ```
   Explain the output fields (SEQ, ACK, window).

### Medium
3. **Simulate a crash failure and measure detection time**  
   - Set `net.ipv4.tcp_keepalive_time=5`, `net.ipv4.tcp_keepalive_intvl=2`, `net.ipv4.tcp_keepalive_probes=3`.  
   - Start a server, connect a client, then kill the server with `kill -9`.  
   - Use `ss -ti` to poll the connection state every second and record when the socket disappears. Compare measured delay to the formula $T_{det}$.

4. **Demonstrate exponential backoff for omitted ACKs**  
   Patch a simple TCP echo server to drop outgoing ACKs (e.g., using `nfqueue` or an `iptables -j DROP` rule on outgoing ACK packets).  
   Run a client that sends a single 100‑byte segment and use `tcptrace` or Wireshark to plot the inter‑retransmission intervals. Verify they follow 1×, 2×, 4× … up to the configured max.

### Hard
5. **Create a network partition using namespaces and observe symmetric abort**  
   Replicate the namespace scenario from Worked Example 3, but also capture the RST attempts with `tcpdump` on the veth interfaces. Show that each side sends a RST but never receives one due to the drop, and both sides independently transition to `CLOSED`.

6. **Inject a partial failure (zero‑window bug) and automate recovery detection**  
   Write a server that calls `read()` but never consumes data, and a client that streams data at 1 Mbps.  
   - Use `ss -i` to monitor the sender’s `cwnd` and `send_queue`.  
   - When the persistence timer triggers, log the interval between window probes.  
   - After the connection aborts, have the client reconnect with SO_KEEPALIVE enabled and verify that the new connection resumes normal flow.

## Linux Connection
### Kernel Subsystems and Data Structures
* **Socket allocation** – `inet_csk_alloc_sock()` in `net/ipv4/af_inet.c` creates a `struct inet_connection_sock` (`icsk`) embedding a `struct tcp_sock`.  
* **Keepalive timer** – managed by `icsk->icsk_keepalive_timer`. The function `tcp_keepalive_timer(struct timer_list *t)` (in `net/ipv4/tcp_timer.c`) is invoked when the idle period expires. It:
  1. Checks `tp->keepalive_probes_sent` vs `tp->keepalive_probes`.  
  2. Sends a probe via `tcp_write_wakeup(tsk)` → ultimately `tcp_transmit_skb()` with an empty segment (`TCP_FLAG_ACK`).  
  3. On failure, increments the probe counter and rearms the timer with interval `tp->keepalive_intvl`.  
  4. On exceeding the probe limit, calls `tcp_write_timeout()` which sets `sk->sk_err = ETIMEDOUT` and triggers `tcp_done()` → socket moves to `CLOSED`.

* **Retransmission timer** – `icsk->icsk_retransmit_timer` handler `tcp_retransmit_timer()` (same file) implements the Jacobson/Karels RTO update and exponential backoff.  
* **Persistence timer** – `icsk->icsk_persist_timer` handler `tcp_persist_timer()` sends zero‑window probes.

### Sysctl Interface
| Variable | Path | Meaning | Units |
|----------|------|---------|-------|
| `net.ipv4.tcp_keepalive_time` | `/proc/sys/net/ipv4/tcp_keepalive_time` | `$t_{idle}$` | seconds |
| `net.ip
