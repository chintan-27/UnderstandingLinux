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

## Core Concepts
A **socket** is a kernel‑maintained object that represents one endpoint of a network communication channel. It is exposed to user space as a file descriptor (`int`). The kernel identifies a socket by the 4‑tuple  
\[
(\text{protocol family},\;\text{local address},\;\text{local port},\;\text{remote address},\;\text{remote port})
\]  
(for an unconnected socket the remote fields are undefined).  

The socket API decouples application code from the concrete protocol implementation (TCP, UDP, SCTP, RAW, UNIX domain). When a packet arrives, the network stack demultiplexes it by looking up the matching socket in a hash table keyed by the 4‑tuple; thus the same `send()`/`recv()` calls work for any protocol family.

### Socket Lifecycle – First‑Principle View
1. **`socket(int domain, int type, int protocol)`**  
   *Allocates*: a `struct socket` (generic descriptor) and a protocol‑specific `struct sock`.  
   *Returns*: the lowest unused file descriptor in the process’s fd table.  
   *Why*: The fd table is the mechanism the VFS uses to route I/O syscalls to the correct kernel object; a socket must appear as a fd to be usable with `read()`, `write()`, `select()`, etc.

2. **`bind(int sockfd, const struct sockaddr *addr, socklen_t addrlen)`**  
   *Action*: copies the user‑provided address into kernel memory, checks that the requested `(family, address, port)` tuple is not already in use (via the protocol’s port‑hash table), then stores the values in `sk->sk_rcvaddr`/`sk->sk_rcvport`.  
   *Why*: Binding fixes the local endpoint so incoming packets can be matched to this socket; without it the kernel would have no way to deliver packets to the process.

3. **`listen(int sockfd, int backlog)`**  
   *Action*: transitions the socket to the `TCP_LISTEN` state (for SOCK_STREAM) and allocates a listen‑backlog queue (`struct request_sock_queue`). The `backlog` argument specifies the maximal number of **completed** connections that may await `accept()`. The kernel silently caps the value at `SOMAXCONN` (typically 128).  
   *Why*: A listening socket must decouple the arrival of SYNs (handled in the SYN‑received state) from the application’s readiness to take a connection; the backlog queue provides that buffering.

4. **`accept(int sockfd, struct sockaddr *addr, socklen_t *addrlen)`**  
   *Action*: removes the first established connection from the accept‑queue, clones the listening socket’s `struct sock` (giving the new socket its own receive/send buffers, timers, etc.), allocates a new fd, and returns it. The returned `addr` is filled with the remote peer’s address.  
   *Why*: Accepting yields a *new* socket dedicated to the data transfer with that particular peer, leaving the listening socket free to continue accepting further connections.

5. **`connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen)`**  
   *Action* (TCP): builds a SYN segment, enters `SYN_SENT`, processes SYN‑ACK, sends ACK, reaches `ESTABLISHED`.  
   *Action* (UDP): merely stores the destination address in `sk->sk_daddr`/`sk->sk_dport` so that subsequent `send()` calls can omit the destination parameter.  
   *Why*: For connection‑oriented protocols the handshake establishes shared state (sequence numbers, window sizes, RTT estimators). For connectionless protocols `connect()` is a convenience that enables `send()`/`recv()` without address arguments and enables asynchronous error reporting (e.g., `ECONNREFUSED`).

6. **`ssize_t send(int sockfd, const void *buf, size_t len, int flags)`** and **`ssize_t recv(int sockfd, void *buf, size_t len, int flags)`**  
   *Action*: data is copied between the user buffer and the socket’s kernel buffers (`sk->sk_write_queue` for `send`, `sk->sk_receive_queue` for `recv`). If the operation would block and the socket is blocking, the task is put to sleep until room/data becomes available; otherwise `-EAGAIN` is returned. The return value may be **less than** `len` (partial transfer).  
   *Why*: The socket buffers decouple the application’s production/consumption rate from the network’s variable latency and bandwidth; partial returns arise because the underlying protocol may deliver or accept data in chunks limited by MSS, window size, or available buffer space.

7. **`close(int fd)`**  
   *Action*: decrements the fd’s reference count; when it reaches zero the kernel initiates the protocol’s teardown (TCP sends FIN, enters `TIME_WAIT`, etc.) and frees the associated `struct sock` and `struct socket`.  
   *Why*: Resources (memory, timers, port numbers) must be reclaimed; the reference‑counted fd model guarantees that a socket stays alive as long as any thread holds a descriptor to it.

### Socket Types – Why They Exist
| Type | Protocol | Service Model | Why Choose It |
|------|----------|---------------|---------------|
| `SOCK_STREAM` | TCP (or SCTP in stream mode) | Reliable, ordered, byte‑stream | When loss‑free, in‑order delivery is required (HTTP, SSH, DB). |
| `SOCK_DGRAM` | UDP (or SCTP in message mode) | Unreliable, datagram‑preserving | When latency matters more than reliability (DNS, VoIP, gaming). |
| `SOCK_SEQPACKET` | SCTP | Reliable, message‑boundaried | When you need record boundaries *and* reliability (telephony signaling). |
| `SOCK_RAW` | IP/ICMP/RAW | Direct access to protocol headers | For building custom packets (ping, traceroute, firewall tests). |

---

## How It Works
### Socket Creation – Kernel Internals
```c
int sockfd = socket(AF_INET, SOCK_STREAM, 0);
```
* The `socket()` syscall (`sys_socket`) calls `sock_create()` → `sock_alloc()` → allocates a `struct socket`.  
* Based on `type` (`SOCK_STREAM`) it selects the TCP proto‑ops (`inet_stream_ops`) and creates a `struct sock` via `sk_prot_alloc()`.  
* The new `struct sock` is linked to the `struct socket` (`socket->sk = sk`).  
* An unused file descriptor is obtained from the process’s fd table (`fd_alloc()`) and the `struct socket` is stored there.  
* The returned integer (`sockfd`) is the index into that table.

### Address Structure – Memory Layout
```c
struct sockaddr_in {
    sa_family_t    sin_family;   /* 2 bytes: AF_INET = 2 */
    uint16_t       sin_port;     /* 2 bytes, network byte order */
    struct in_addr sin_addr;     /* 4 bytes */
    unsigned char  sin_zero[8];  /* padding to 16 bytes total */
};
```
* `htons(8080)` → `0x1F90` (big‑endian).  
* `INADDR_ANY` → `0x00000000`.  
* The total size is 16 bytes, which is what `accept()` expects as `addrlen`.

### Binding – Why the Kernel Checks Availability
```c
bind(sockfd, (struct sockaddr *)&serv_addr, sizeof(serv_addr));
```
* The kernel verifies that no other socket has the same `(AF_INET, INADDR_ANY, 8080)` tuple by looking in the TCP port hash table (`inet_bind_hash()`).  
* If the port is already in use **and** the socket does not have `SO_REUSEADDR` set, `bind()` fails with `EADDRINUSE`.  
* Binding to `INADDR_ANY` lets the kernel accept packets arriving on any configured interface; binding to a specific address restricts delivery to that interface only.

### Listening – Backlog Semantics
```c
listen(sockfd, 3);          /* backlog = 3 */
```
* The listen backlog queue holds **completed** connections (those that have completed the three‑way handshake).  
* SYN‑received (half‑open) connections are kept in a separate *syn‑queue* whose length is limited by `tcp_max_syn_backlog`.  
* If the accept‑queue is full, further incoming SYNs are dropped (causing the client to see a connection timeout or `ECONNREFUSED` after retransmissions).

### Accept – Creating a New Socket
```c
int newsockfd = accept(sockfd, (struct sockaddr *)&cli_addr, &clilen);
```
* The kernel removes the first entry from the accept‑queue, clones the listening socket’s `struct sock` (copying rcv/snd buffers, timers, etc.), allocates a fresh fd, and returns it.  
* The listening socket remains unchanged and can continue to accept more connections.  
* The new socket inherits the local address/port of the listener; its remote address/port are set to the peer’s values.

### Connect – TCP Three‑Way Handshake (State Diagram)
```
CLOSED --> SYN_SENT (send SYN) --> SYN_RECV (recv SYN+ACK, send ACK) --> ESTABLISHED
```
* Initial sequence number (ISN) is chosen randomly (RFC 793 §3.3).  
* After `ESTABLISHED`, the socket’s `sk->sk_write_queue` holds outgoing data; `sk->sk_receive_queue` holds in‑coming data.  
* The kernel maintains per‑socket RTT estimator:
  \[
  \text{SRTT} \leftarrow (1-\alpha)\cdot\text{SRTT} + \alpha\cdot\text{RTT\_sample}
  \]
  \[
  \text{RTTVAR} \leftarrow (1-\beta)\cdot\text{RTTVAR} + \beta\cdot|\text{RTT\_sample}-\text{SRTT}|
  \]
  \[
  \text{RTO} \leftarrow \text{SRTT} + 4\cdot\text{RTTVAR}
  \]
  (Jacobson/Karels, with typical \(\alpha=1/8,\beta=1/4\)).

### Send/Recv – Buffering and Partial Transfers
```c
char buffer[256];
ssize_t n = send(sockfd, buffer, strlen(buffer), 0);   /* may return < strlen */
```
* Data is first copied from user space to the socket’s **send queue** (`sk->sk_write_queue`).  
* If the queue is full and the socket is blocking, the task sleeps on the wait queue until TCP frees space (after ACKs advance the send window).  
* The return value is the number of bytes **actually queued**; the caller must loop until the desired length is sent.  
* `recv()` analogous: data is copied from the receive queue to the user buffer; if no data is available and the socket is blocking, the task sleeps; otherwise `-EAGAIN` is returned for non‑blocking sockets.

---

## Worked Examples
### Example 1: Robust TCP Server (echo with error handling)
```c
/* tcp_echo_server.c */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

/* Helper: retry on EINTR */
static ssize_t full_write(int fd, const void *buf, size_t len) {
    size_t written = 0;
    while (written < len) {
        ssize_t n = write(fd, (const char *)buf + written, len - written);
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        if (n == 0) break;      /* EOF */
        written += n;
    }
    return (ssize_t)written;
}

static ssize_t full_read(int fd, void *buf, size_t len) {
    size_t got = 0;
    while (got < len) {
        ssize_t n = read(fd, (char *)buf + got, len - got);
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        if (n == 0) break;      /* peer closed */
        got += n;
    }
    return (ssize_t)got;
}

int main(void) {
    int listen_fd, conn_fd;
    struct sockaddr_in serv_addr, cli_addr;
    socklen_t cli_len = sizeof(cli_addr);

    /* 1. socket */
    if ((listen_fd = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        perror("socket");
        exit(EXIT_FAILURE);
    }

    /* 2. allow rapid restarts */
    int opt = 1;
    if (setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt(SO_REUSEADDR)");
        close(listen_fd);
        exit(EXIT_FAILURE);
    }

    /* 3. bind */
    memset(&serv_addr, 0, sizeof(serv_addr));
    serv_addr.sin_family = AF_INET;
    serv_addr.sin_port   = htons(8080);          /* 0x1F90 */
    serv_addr.sin_addr.s_addr = htonl(INADDR_ANY); /* 0x00000000 */
    if (bind(listen_fd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
        perror("bind");
        close(listen_fd);
        exit(EXIT_FAILURE);
    }

    /* 4. listen */
    if (listen(listen_fd, SOMAXCONN) < 0) {      /* ask kernel for max */
        perror("listen");
        close(listen_fd);
        exit(EXIT_FAILURE);
    }
    printf("Server listening on 0.0.0.0:8080\n");

    /* 5. accept loop */
    for (;;) {
        conn_fd = accept(listen_fd, (struct sockaddr *)&cli_addr, &cli_len);
        if (conn_fd < 0) {
            if (errno == EINTR) continue;
            perror("accept");
            continue;
        }
        char host[NI_MAXHOST], svc[NI_MAXSERV];
        if (getnameinfo((struct sockaddr *)&cli_addr, cli_len,
                        host, sizeof(host), svc, sizeof(svc),
                        NI_NUMERICHOST | NI_NUMERICSERV) == 0) {
            printf("Accepted connection from %s:%s\n", host, svc);
        }

        /* 6. echo loop */
        char buf[4096];
        while (1) {
            ssize_t n = full_read(conn_fd, buf, sizeof(buf));
            if (n <= 0) {               /* 0 = EOF, <0 = error */
                if (n < 0) perror("read");
                break;
            }
            if (full_write(conn_fd, buf, (size_t)n) != n) {
                perror("write");
                break;
            }
        }
        close(conn_fd);
    }
    /* unreachable */
    close(listen_fd);
    return 0;
}
```
**Step‑by‑step reasoning**
1. `socket()` → fd 3 (example).  
2. `setsockopt(SO_REUSEADDR)` avoids `EADDRINUSE` when restarting quickly.  
3. `bind()` assigns local endpoint `0.0.0.0:8080`.  
4. `listen()` creates an accept queue; we request the kernel maximum (`SOMAXCONN`).  
5. `accept()` blocks until a TCP three‑way handshake completes; it returns a new fd (e.g., 4) for the data‑transfer socket.  
6. The server reads with `full_read()` which loops until either the requested bytes are read, EOF, or an error (handling `EINTR`).  
7. Data is echoed back with `full_write()` which similarly loops until all bytes are queued.  
8. On peer EOF or error, the connection socket is closed; the listening socket stays open.

### Example 2: TCP Client with Timeout and Retry
```c
/* tcp_client.c */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/poll.h>

int main(void) {
    int sockfd;
    struct sockaddr_in serv_addr;
    const char *msg = "Hello, server!";
    size_t msglen = strlen(msg);

    /* 1. socket */
    if ((sockfd = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        perror("socket");
        exit(EXIT_FAILURE);
    }

    /* 2. set connect timeout via poll */
    memset(&serv_addr, 0, sizeof(serv_addr));
    serv_addr.sin_family = AF_INET;
    serv_addr.sin_port   = htons(8080);
    if (inet_pton(AF_INET, "127.0.0.1", &serv_addr.sin_addr) <= 0) {
        perror("inet_pton");
        close(sockfd);
        exit(EXIT_FAILURE);
    }

    /* make socket non‑blocking for connect */
    int flags = fcntl(sockfd, F_GETFL, 0);
    fcntl(sockfd, F_SETFL, flags | O_NONBLOCK);

    if (connect(sockfd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
        if (errno != EINPROGRESS) {
            perror("connect");
            close(sockfd);
            exit(EXIT_FAILURE);
        }
        /* wait up to 5 seconds for completion */
        struct pollfd pfd = { .fd = sockfd, .events = POLLOUT };
        int ret = poll(&pfd, 1, 5000);
        if (ret <= 0) {
            fprintf(stderr, "connect timeout or error\n");
            close(sockfd);
            exit(EXIT_FAILURE);
        }
        /* check for error */
        int err = 0;
        socklen_t len = sizeof(err);
        if (getsockopt(sockfd, SOL_SOCKET, SO_ERROR, &err, &len) < 0 || err != 0) {
            perror("connect failed");
            close(sockfd);
            exit(EXIT_FAILURE);
        }
    }
    /* restore blocking mode if desired */
    fcntl(sockfd, F_SETFL, flags);

    /* 3. send with retry on short writes */
    size_t offset = 0;
    while (offset < msglen) {
        ssize_t n = write(sockfd, msg + offset, msglen - offset);
        if (n < 0) {
            if (errno == EINTR) continue;
            perror("write");
            close(sockfd);
            exit(EXIT_FAILURE);
        }
        offset += n;
    }

    /* 4. receive response (server echoes) */
