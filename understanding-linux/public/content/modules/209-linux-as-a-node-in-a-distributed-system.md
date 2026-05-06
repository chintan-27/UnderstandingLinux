---
id: 209
title: "Linux as a node in a distributed system"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Distributed Systems: Definition and Failure Model
A distributed system consists of *n* independent processing elements (nodes) that communicate solely via message passing over a network. Independence means each node has its own private address space, CPU scheduling, and failure domain. The system appears as a single coherent service to clients only if the communication layer hides the underlying heterogeneity and partial failures.  
Formally, let each node *i* have a local state *Sᵢ*. The global state is the Cartesian product *S = ⨉ₖ Sₖ*. A transition occurs when a node executes a local step or sends/receives a message. Because message delivery is unbounded in time, the system follows an **asynchronous message‑passing model** with possible **crash‑stop** failures (a node may halt permanently) and **omission** losses (messages may be dropped). This model necessitates explicit handling of ordering, duplication, and loss.

### Resource Isolation in Linux
Isolation prevents one node’s misbehavior from degrading another’s performance or compromising security. Linux provides isolation through three orthogonal mechanisms:

| Mechanism | What it isolates | Key data structures / files |
|-----------|------------------|-----------------------------|
| **Memory Management Unit (MMU)** | Virtual address space | `struct mm_struct`, `/proc/<pid>/maps` |
| **Namespaces** (UTS, IPC, PID, Mount, Network, User, Cgroup) | Filesystem, hostname, process IDs, network stack, user/group IDs | `/proc/<pid>/ns/`, `ip netns list`, `unshare(2)` |
| **Control Groups (cgroups v2)** | CPU, memory, I/O, bandwidth | `/sys/fs/cgroup/`, `cgcreate`, `cgexec` |

*Why*: Without MMU‑based address translation, a buggy process could corrupt another’s kernel or user memory via stray pointers. Namespaces prevent a process in one container from seeing or interfering with another’s network interfaces or mount points. Cgroups bound resource consumption so a noisy node cannot starve others of CPU cycles or network bandwidth.

### Observability: Metrics, Traces, and Logs
Observability is the ability to infer internal states from external outputs. In a Linux node we have three pillars:

1. **Metrics** – time‑series counters exposed via `/proc`/`sysfs` or the **prometheus** client library. Example: `cpu.utilization = (user+nice+system+irq+softirq) / (user+nice+system+irq+softirq+idle+iowait+steal) * 100%`.
2. **Distributed Tracing** – uniquely identifying a request across hops using a trace ID propagated in headers (e.g., `traceparent` per W3C spec). The Linux kernel can inject eBPF programs at `tcp_sendmsg`/`tcp_recvmsg` to stamp timestamps with nanosecond resolution.
3. **Logs** – immutable, append‑only records; structured logging (JSON) enables querying with `jq` or `loki`.

*Why*: Metrics give *what* is happening (e.g., latency spikes). Traces answer *why* a particular request was slow (which service added delay). Logs capture *what* happened (error messages, state changes) for post‑mortem.

### Network Interactions: From Packets to Sockets
Linux’s network stack is layered:  
**Device Driver → NAPI poll → IP layer (L3) → Transport layer (L4 – TCP/UDP) → Socket layer (L5) → User Space**.  

Key concepts:

* **Maximum Transmission Unit (MTU)** – largest IP packet size that can be sent without fragmentation. For Ethernet, MTU = 1500 bytes.  
* **Transmission Delay** – $T_{tx} = \frac{L}{R}$ where *L* is packet length (bits) and *R* is link rate (bits/s).  
* **Propagation Delay** – $T_{prop} = \frac{d}{v}$ where *d* is distance, *v* ≈ 2·10⁸ m/s in copper/fiber.  
* **Round‑Trip Time (RTT)** – $RTT = 2·(T_{prop}+T_{queue}+T_{tx})$. Queueing delay depends on buffer size and traffic intensity (ρ = λ/μ).  
* **TCP Congestion Control** – approximates $cwnd_{new} = cwnd_{old} + \frac{1}{cwnd_{old}}$ (additive increase) on ACK, halves on loss (multiplicative decrease).  

Understanding these formulas lets you predict when a link will saturate and why TCP’s sawtooth appears in latency plots.

### Storage Interactions: Consistency, Availability, Partition Tolerance
Distributed storage must choose trade‑offs per the **CAP theorem**. In practice, systems target **strong consistency** within a replica group using quorum reads/writes or consensus protocols (Raft, Paxos).  

*Quorum condition*: For *N* replicas, a write is acknowledged after *W* nodes persist; a read returns the latest value after contacting *R* nodes. Consistency is guaranteed if $W + R > N$.  

*Example*: With N=5, choosing W=3, R=2 yields strong consistency. If a network partition isolates ≤2 nodes, writes still succeed (availability) but reads may be stale if they contact only the isolated side (consistency loss).  

Linux interacts with distributed storage via the **Virtual File System (VFS)** layer: each filesystem (e.g., Ceph’s libceph, GlusterFS) registers a `struct file_operations` set; VFS routes `open`, `read`, `write`, `fsync` calls to the underlying client library, which translates them into RPCs over the network.

---

## How It Works
### Socket Programming as the Primitive for Distributed Communication
The Linux socket API is a thin wrapper around kernel data structures (`struct sock`, `struct inet_connection_sock`). Each step maps to a specific kernel path:

| Step | Syscall | Kernel action | Reason |
|------|---------|---------------|--------|
| `socket(AF_INET, SOCK_STREAM, 0)` | Allocates a `struct sock` with `sk_type=SOCK_STREAM`, assigns a file descriptor via `alloc_fd()`. | Creates endpoint; protocol family selects TCP implementation (`inet_hashtables`). |
| `bind(sockfd, (struct sockaddr *)&addr, sizeof(addr))` | Copies user address to kernel, checks for address reuse (`SO_REUSEADDR`), inserts sock into `inet_bind_hashbucket`. | Associates endpoint with local IP/port; enables demux of incoming packets. |
| `listen(sockfd, backlog)` | Sets `sk_state=TCP_LISTEN`, increments `sk_ack_backlog` limit; syn‑queue size = min(backlog, `/proc/sys/net/core/somaxconn`). | Prepares to accept incoming SYNs; backlog limits simultaneous half‑open connections. |
| `accept(sockfd, …)` | Removes a completed connection from the accept queue, clones the listening sock into a new `struct sock` for the child, returns new fd. | Yields a dedicated socket for data transfer; avoids head‑of‑line blocking on the listener. |
| `read()/write()` | Calls `sock_recvmsg`/`sock_sendmsg`, which eventually invoke TCP’s `tcp_recvmsg`/`tcp_sendmsg`. Data is copied via `iovec` to/from kernel skb buffers, then segmented per MSS. | Provides full‑duplex byte stream; TCP handles sequencing, retransmission, flow control. |
| `close(fd)` | Triggers `tcp_close` → sends FIN, enters `TCP_CLOSING`/`TIME_WAIT` states, releases resources after 2·MSL. | Graceful teardown; prevents delayed duplicate segments from being misinterpreted. |

### Detailed Example: Echo Server with Error Handling
```c
/* echo_server.c – robust iterative TCP echo server */
#define _POSIX_C_SOURCE 200809L
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

int main(void) {
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd < 0) {
        perror("socket");
        exit(EXIT_FAILURE);
    }

    /* Allow rapid restarts */
    int opt = 1;
    if (setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt(SO_REUSEADDR)");
        close(listen_fd);
        exit(EXIT_FAILURE);
    }

    struct sockaddr_in serv_addr = {
        .sin_family = AF_INET,
        .sin_port   = htons(9000),               /* network‑byte order */
        .sin_addr   = { htonl(INADDR_ANY) }      /* bind to all IPv4 interfaces */
    };
    if (bind(listen_fd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
        perror("bind");
        close(listen_fd);
        exit(EXIT_FAILURE);
    }

    if (listen(listen_fd, 128) < 0) {            /* backlog tuned for high‑conn rate */
        perror("listen");
        close(listen_fd);
        exit(EXIT_FAILURE);
    }

    printf("Server listening on port 9000\n");
    while (1) {
        struct sockaddr_in cli_addr;
        socklen_t cli_len = sizeof(cli_addr);
        int conn_fd = accept(listen_fd,
                             (struct sockaddr *)&cli_addr,
                             &cli_len);
        if (conn_fd < 0) {
            if (errno == EINTR) continue;       /* restart if interrupted by signal */
            perror("accept");
            continue;
        }

        char hbuf[NI_MAXHOST], sbuf[NI_MAXSERV];
        if (getnameinfo((struct sockaddr *)&cli_addr, cli_len,
                        hbuf, sizeof(hbuf),
                        sbuf, sizeof(sbuf),
                        NI_NUMERICHOST | NI_NUMERICSERV) == 0) {
            printf("Connection from %s:%s\n", hbuf, sbuf);
        }

        ssize_t n;
        char buf[4096];
        while ((n = recv(conn_fd, buf, sizeof(buf), 0)) > 0) {
            ssize_t total = 0;
            while (total < n) {
                ssize_t w = send(conn_fd, buf + total, n - total, 0);
                if (w < 0) {
                    if (errno == EINTR) continue;
                    perror("send");
                    break;
                }
                total += w;
            }
        }
        if (n < 0 && errno != EINTR) perror("recv");

        close(conn_fd);
    }
    close(listen_fd);
    return 0;
}
```
*Why each line matters*:
- `socket` creates the endpoint; without it no communication.
- `setsockopt(..., SO_REUSEADDR)` avoids “Address already in use” after a crash, crucial for rapid iteration.
- `htonl`/`htons` convert host byte order to network byte order; ignoring them yields non‑portable code on little‑endian machines.
- Loop on `recv`/`send` handles partial reads/writes; TCP is a stream protocol, not message‑based.
- Restarting `accept` after `EINTR` prevents premature exit when a signal (e.g., SIGCHLD) interrupts the syscall.
- Using a moderate backlog (`128`) matches the default `somaxconn` (often 128) and avoids SYN‑drop under burst.

### Client Example with Timing Measurement
```c
/* ping_client.c – measures RTT to echo server */
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

int main(int argc, char *argv[]) {
    if (argc != 3) {
        fprintf(stderr, "Usage: %s <server_ip> <port>\n");
        exit(EXIT_FAILURE);
    }
    const char *ip = argv[1];
    uint16_t port = (uint16_t)atoi(argv[2]);

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) { perror("socket"); exit(EXIT_FAILURE); }

    struct sockaddr_in srv = {
        .sin_family = AF_INET,
        .sin_port   = htons(port),
        .sin_addr   = { .s_addr = inet_addr(ip) }
    };
    if (connect(sock, (struct sockaddr *)&srv, sizeof(srv)) < 0) {
        perror("connect");
        close(sock);
        exit(EXIT_FAILURE);
    }

    const char *msg = "ping";
    size_t mlen = strlen(msg);
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    if (write(sock, msg, mlen) != (ssize_t)mlen) {
        perror("write");
        close(sock);
        exit(EXIT_FAILURE);
    }

    char resp[mlen];
    ssize_t nr = read(sock, resp, mlen);
    clock_gettime(CLOCK_MONOTONIC, &t1);
    if (nr != (ssize_t)mlen) {
        perror("read");
        close(sock);
        exit(EXIT_FAILURE);
    }
    close(sock);

    double rtt_ms = (t1.tv_sec - t0.tv_sec) * 1e3 +
                    (t1.tv_nsec - t0.tv_nsec) / 1e6;
    printf("RTT = %.3f ms\n", rtt_ms);
    return 0;
}
```
*Why*: `clock_gettime(CLOCK_MONOTONIC)` provides monotonic, high‑resolution timing unaffected by system clock adjustments. The RTT measurement includes propagation, queueing, transmission, and TCP processing delays, enabling empirical validation of the formulas in the Core Concepts section.

---

## Worked Examples
### Example 1: Calculating Expected TCP Throughput
**Problem**: A 100 Mbps Ethernet link (MTU=1500 B) with 2 ms one‑way propagation delay, negligible queuing, and a TCP receiver window of 64 KB. What is the maximal steady‑state throughput assuming no loss?

**Solution**:
1. **Transmission delay per segment**:  
   $T_{tx} = \frac{L·8}{R} = \frac{1500·8}{100·10^6} = 0.12\text{ ms}$.
2. **Round‑Trip Time**:  
   $RTT = 2·(T_{prop}+T_{tx}) = 2·(2\text{ ms}+0.12\text{ ms}) = 4.24\text{ ms}$.
3. **Bandwidth‑Delay Product (BDP)**:  
   $BDP = R·RTT = 100·10^6·4.24·10^{-3} = 424{,}000\text{ bits} ≈ 53\text{ KB}$.
4. Since the receiver window (64 KB) > BDP, the link can be fully utilized.  
   Max throughput ≈ link rate = **100 Mbps** (≈12.5 MB/s).  
   If the receiver window were 32 KB (< BDP), throughput would be limited to  
   $\frac{Window}{RTT} = \frac{32·8·10^{3}}{4.24·10^{-3}} ≈ 60.3\text{ Mbps}$.

### Example 2: Implementing a Two‑Phase Commit (2PC) Coordinator
**Goal**: Show how a coordinator can use Linux sockets to coordinate a transaction across two participants.

**Steps** (pseudo‑code with real syscalls):
1. **Listener Setup** – same as echo server, but on port 9001.
2. **Accept Participants** – `accept` twice, obtaining `fd_a`, `fd_b`.
3. **Vote Request** – send `"VREQ"` (4 B) to each participant via `write(fd_x, "VREQ", 4)`.  
   Participants reply with `"VOTE_YES"` or `"VOTE_NO"` (8 B).  
   Use `read` in a loop to guarantee receipt of all 8 B.
4. **Decision** – If both votes are YES, send `"COMMIT"` (6 B); else `"ABORT"` (4 B).  
   Await acknowledgments (`read` of `"ACK"` 3 B) from each.
5. **Cleanup** – `close` on all fds.

**Why this works**: The coordinator never relies on atomic multicast; it uses reliable, ordered TCP channels to guarantee that each participant receives the same decision. The protocol tolerates participant crashes after voting because the coordinator can retransmit the decision upon recovery (idempotent messages).  

**Numbers**: Assuming LAN RTT = 0.5 ms, each round‑trip (vote+decision) adds ≈1 ms overhead, negligible compared to disk‑fsync latency (~5 ms) typically dominating transaction latency.

### Example 3: Measuring Context‑Switch Overhead with `perf`
**Objective**: Quantify the cost of a thread switch when a server handles many short-lived connections.

**Procedure**:
```bash
# 1. Compile a simple echo server that spawns a thread per connection
gcc -pthread -o threaded_server threaded_server.c

# 2. Run it in background, binding to port 9002
./threaded_server &
SERVER_PID=$!

# 3. Generate load with 500 concurrent clients (each sends 1 KB and exits)
for i in {1..500}; do
    ( echo "ping" | nc 127.0.0.1 9002 ) &
done
wait

# 4. Capture context-switch events for 5 seconds
perf record -e sched:sched_switch -p $SERVER_PID -- sleep 5

# 5. Report average duration
perf report -s comm,parent comm | awk '
    /sched_switch/ {sum+=$3; cnt++}
    END {if(cnt) print "avg switch time:", sum/cnt, "ns"; else print "no samples"}'
```
*Explanation*:  
- `perf record -e sched:sched_switch` captures kernel tracepoints that fire on each context switch, reporting the timestamp delta between the outgoing and incoming task.  
- By limiting to the server PID we isolate its thread switches.  
- The average switch time on a modern x86‑64 kernel typically ranges from **0.5 µs to 2 µs** depending on tickless mode and CPU frequency scaling.  
- If the observed time exceeds ~5 µs, suspect excessive lock contention or priority inversion; you can then investigate with `perf lock` or `tracecmd`.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Matters |
|---|---------|--------------|----------------|
| 1 | **Assuming TCP guarantees message boundaries** | Treating a single `read` as receiving a whole application message. | TCP is a byte stream; partial reads cause protocol desynchronization, leading to data corruption or infinite loops. |
| 2 | **Neglecting `EINTR` handling** | Looping on `accept`, `read`, or `write` without restarting when `errno == EINTR`. | Signals (e.g., SIGCHLD from reaping children) frequently interrupt syscalls; ignoring `EINTR` causes premature termination or busy‑loops. |
| 3 | **Using a fixed-size buffer without length checks** | `char buf[256]; read(fd, buf, 256);` assuming the sender never exceeds 256 B. | Overflow can overwrite adjacent stack/heap data, enabling security exploits (buffer overflow). |
| 4 | **Setting `listen` backlog too low** | `listen(fd, 1)` on a server expecting bursts of connections. | The kernel will drop SYNs once the accept queue exceeds the backlog, raising connection latency and causing client‑visible “connection refused” under load. |
| 5 | **Ignoring byte order for multi‑byte fields** | Sending raw `uint32_t` values without `htonl/ntohl`. | On little‑endian hosts the receiver interprets the value incorrectly, breaking interoperability across architectures. |
| 6 | **Not enabling TCP keepalive** | Expecting dead peers to be detected instantly. | Without keepalive, a half‑open connection can linger for hours, consuming file descriptors and preventing server reuse. |
| 7 | **Assuming `SO_REUSEADDR` permits multiple listeners on the same port** | Binding two servers to the same IP/port with only `SO_REUSEADDR`. | `SO_REUSEADDR` only allows *reuse* after a socket is in `TIME_WAIT`; true port sharing requires `SO_REUSEPORT` (Linux ≥3.9) or distinct IP addresses. |
| 8 | **Using blocking I/O in a high‑concurrency server** | Spawning a thread per connection or using a single thread with blocking `read`. | Context‑switch overhead and thread limits cap scalability; better to use `epoll`, `io_uring`, or asynchronous frameworks. |
| 9 | **Skipping checksum validation on UDP** | Trusting payload without verifying UDP checksum (disabled on localhost). | On real networks, corrupted packets can deliver bogus data; UDP offers no retransmission, so errors go undetected. |
|10 | **Believing that `fsync` guarantees durability on all filesystems** | Calling `fsync` after write and assuming data is on non‑volatile media. | Some network filesystems (e.g., NFS v3) delay writes; you must also mount with `sync` or use application‑level acknowledgments. |

---

## Exercises
### Easy
1. **Socket Basics** – Write a client that sends a 32‑bit integer (network byte order) to a server; the server returns the integer squared. Include full error checking for all syscalls and handle `EINTR`.
2. **RTT Measurement** – Modify the ping client to send 100 packets, compute min, avg, max RTT, and plot the results with `gnuplot`. Use `clock_gettime(CLOCK_MONOTONIC)`.
3. **Namespace Exploration** – Create a new network namespace (`ip netns add ns1`), move a `sleep` process into it, and verify that its interface list (`ip link`) differs from the host.

### Medium
4. **Concurrent Echo Server** – Implement an echo server using `epoll` (edge‑triggered) that can handle ≥10 000 simultaneous connections without spawning a thread per connection. Measure CPU usage with `pidstat`.
5. **Quorum‑Based Key‑Value Store** – Build a three‑node replicated store where a write succeeds only after acknowledgment from two nodes (W=2) and a read contacts two nodes (R=2). Use UDP for simplicity; implement retransmission with timeout and duplicate detection. Test consistency by partitioning one node with `iptables`.
6. **eBPF TCP Latency Tracer** – Write an eBPF program (using `bpftool` or `bpftrace`) that attaches to `tcp_sendmsg` and `tcp_recvmsg` to record timestamps and compute per‑connection RTT. Export results via a BPF map to a userspace daemon that prints average RTT every second.

### Hard
7. **Mini‑Raft Consensus** – Implement a Raft cluster of five processes communicating over TCP sockets. Each node must persist its log to a file (`open(..., O_DSYNC)`) and handle leader election, log replication, and safety properties. Verify correctness by injecting
