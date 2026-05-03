---
id: 148
title: "Sockets API"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

Every networked program sits on top of the sockets API, but the API is deceptively thin: it exposes about a dozen syscalls that map directly onto TCP state machine transitions, and every call you make — or fail to make, or make in the wrong order — has consequences visible in `ss`, `tcpdump`, and `/proc`. Servers fail to restart after a crash because the programmer never set `SO_REUSEADDR`, leaving the port trapped in `TIME_WAIT` for up to $2 \times \text{MSL}$ seconds. Clients hang indefinitely because no `SO_RCVTIMEO` was set and the peer stopped sending without closing. Connections are silently refused under load because `listen()`'s backlog was too small and the kernel dropped SYNs rather than sending a RST. The API forces you to make decisions at every step whose correctness depends on knowing what TCP is doing underneath.

---

## Core Concepts

### The Socket as a File Descriptor

`socket()` allocates a kernel `struct socket` and returns a file descriptor that indexes into the process's open file table. At creation the socket is unbound — no local address, no remote address, no port. Every subsequent call moves it through a state machine that mirrors TCP's own states (`CLOSED` → `LISTEN` → `SYN_RCVD` → `ESTABLISHED` → `TIME_WAIT`, etc.). The fd is just a handle; all the state lives in the kernel.

### Endpoints and the Four-Tuple

TCP demultiplexes every arriving segment using four values:

$$(\text{src\_ip},\ \text{src\_port},\ \text{dst\_ip},\ \text{dst\_port})$$

This four-tuple must be globally unique across all open connections. `bind()` sets the local half $(\text{src\_ip}, \text{src\_port})$. `connect()` on the client side — and `accept()` on the server side — fills in the remote half. Until both halves are populated, no connection exists. The kernel's TCP input path hashes this four-tuple into the `ehash` table (established connections) or checks the `lhash` table (listening sockets) to find the right socket for each packet.

Omitting `bind()` on the client side is correct and normal: the kernel selects an **ephemeral port** from the range defined by `/proc/sys/net/ipv4/ip_local_port_range` (default `32768–60999`). The selection avoids four-tuples already in use, including those in `TIME_WAIT`.

### Passive vs. Active Open

A server performs a **passive open**: `listen()` transitions the socket to `LISTEN` state and instructs the kernel to begin accepting SYNs. A client performs an **active open**: `connect()` sends a SYN and blocks until the three-way handshake completes. The asymmetry matters — the kernel completes the handshake on the server's behalf before the application ever calls `accept()`. This means a connection can be fully established, consuming kernel memory, while the server process is busy doing something else.

### The Two-Queue Model and Backlog

Linux maintains two queues per listening socket:

- **SYN queue** (incomplete connections): holds connections that have received a SYN but not yet completed the handshake. Size controlled by `/proc/sys/net/ipv4/tcp_max_syn_backlog`.
- **Accept queue** (complete connections): holds fully established connections waiting for the application to call `accept()`. Size is $\min(\text{backlog}, \text{/proc/sys/net/core/somaxconn})$.

When the accept queue is full and a new handshake completes, the kernel drops the final ACK from the client, forcing the client to retransmit. The client's TCP sees this as a stall, not a refusal, and retransmits with binary exponential backoff — initial timeout $\approx 1\ \text{s}$, doubling each retry. No RST is sent, so the client cannot distinguish "server busy" from "server unreachable."

You can observe queue depth in real time:

```bash
ss -lnt sport = :6666
# State  Recv-Q  Send-Q  Local Address:Port
# LISTEN 0       128     0.0.0.0:6666
# Recv-Q = current accept queue depth
# Send-Q = configured backlog limit
```

### TIME_WAIT and 2MSL

The side that sends the final FIN enters `TIME_WAIT` and stays there for:

$$T_{\text{TIME\_WAIT}} = 2 \times \text{MSL}$$

On Linux, `MSL = 30\ \text{s}` (hardcoded in `include/net/tcp.h` as `TCP_TIMEWAIT_LEN = 60` seconds), so:

$$T_{\text{TIME\_WAIT}} = 2 \times 30\ \text{s} = 60\ \text{s}$$

`TIME_WAIT` serves two purposes:

1. **Lost final ACK**: if the peer's FIN+ACK is retransmitted because the ACK was dropped, the socket is still alive to re-send the ACK.
2. **Delayed segment protection**: a new connection with the same four-tuple cannot be established while the old one is in `TIME_WAIT`, preventing a delayed segment from a dead connection from corrupting a live one.

The practical consequence: after a server process on port 6666 exits, the four-tuple it was using enters `TIME_WAIT`. A restart attempt will find that four-tuple still registered in the kernel and `bind()` fails with `EADDRINUSE`. The port is unavailable for up to 60 seconds.

Observe active `TIME_WAIT` entries:

```bash
ss -ant state time-wait sport = :6666
```

### SO_REUSEADDR

`SO_REUSEADDR`, set before `bind()`, tells the kernel to permit binding to a port that appears in a `TIME_WAIT` four-tuple, provided the new connection's full four-tuple is distinct (different client IP or client port). The `TIME_WAIT` entry still exists — it is not erased — and still protects against delayed segments for the *old* four-tuple. The server simply reclaims its listening port.

What `SO_REUSEADDR` does **not** do: it does not let two sockets bind the same `(IP, port)` for a new `LISTEN` simultaneously. That requires `SO_REUSEPORT` (Linux 3.9+), which allows multiple sockets — typically in different threads or processes — to bind the same address and have the kernel load-balance incoming connections across them.

### Nonblocking I/O and Readiness

By default all socket syscalls block: `accept()` blocks until a connection arrives; `recv()` blocks until data arrives; `connect()` blocks until the handshake completes or fails. A process handling thousands of connections cannot afford to block on any single one.

Setting `O_NONBLOCK` makes these calls return `EAGAIN`/`EWOULDBLOCK` immediately when they cannot complete. The process then uses `epoll` to wait for readiness across all fds simultaneously, with $O(1)$ wakeup cost per event (unlike `select`/`poll` which scan $O(n)$ fd sets).

A nonblocking `connect()` returns `-1` with `errno == EINPROGRESS` immediately. The connection completes asynchronously; completion is signaled when the socket becomes **writable** in `epoll`/`poll`. Writability alone is not sufficient — a failed connect also becomes writable — so you must confirm success:

```c
int err;
socklen_t len = sizeof(err);
getsockopt(sockfd, SOL_SOCKET, SO_ERROR, &err, &len);
// err == 0: connected; err != 0: failed with that errno
```

---

## How It Works

### Full Server Lifecycle

```c
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <errno.h>

int main(void) {
    // AF_INET = IPv4, SOCK_STREAM = TCP, protocol 0 = default for stream
    int listenfd = socket(AF_INET, SOCK_STREAM, 0);

    // Must be set BEFORE bind(). Without this, restarting within 60s fails
    // with EADDRINUSE because the old four-tuple is still in TIME_WAIT.
    int opt = 1;
    setsockopt(listenfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {
        .sin_family      = AF_INET,
        .sin_port        = htons(6666),
        .sin_addr.s_addr = INADDR_ANY,  // bind all local interfaces
    };
    bind(listenfd, (struct sockaddr *)&addr, sizeof(addr));

    // Transitions listenfd to LISTEN state. backlog caps the accept queue.
    // Effective limit = min(128, /proc/sys/net/core/somaxconn).
    listen(listenfd, 128);

    // Blocks until a completed connection is in the accept queue.
    // Returns a NEW fd representing the ESTABLISHED connection.
    // listenfd remains in LISTEN state and is not consumed.
    struct sockaddr_in client_addr;
    socklen_t addrlen = sizeof(client_addr);
    int connfd = accept(listenfd, (struct sockaddr *)&client_addr, &addrlen);

    char buf[4096];
    ssize_t n = recv(connfd, buf, sizeof(buf), 0);
    if (n > 0)
        send(connfd, buf, n, 0);

    // FIN is sent on close(). listenfd closed separately.
    close(connfd);
    close(listenfd);
    return 0;
}
```

`listenfd` and `connfd` are two distinct kernel objects. `listenfd` lives in `LISTEN` for the server's lifetime. Each `accept()` call dequeues one completed connection and returns a new fd for it. Closing `connfd` does not affect `listenfd`.

### Full Client Lifecycle

```c
#include <sys/socket.h
