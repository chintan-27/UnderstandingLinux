---
id: 198
title: "Interprocess communication design"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Interprocess Communication (IPC) – First‑Principles View
IPC exists because processes are isolated protection domains: each has its own virtual address space, file descriptor table, and signal disposition. To cooperate, they must exchange data **without violating isolation**. The kernel therefore provides mechanisms that either:

* **Copy data** through a kernel‑mediated buffer (pipes, FIFOs, message queues) – the sender writes into a kernel buffer, the receiver reads from it; the kernel enforces ordering and flow control.
* **Map the same physical pages** into multiple address spaces (shared memory) – the kernel creates a backing object (tmpfs/shmfs) and inserts its pages into each process’s page table; no copying occurs, but processes must synchronize access.
* **Invoke a procedure via a message** (RPC) – the caller serializes arguments into a buffer, sends it to a server process (often over a socket), the server deserializes, executes, and returns a result the same way.
* **Exchange byte streams** (sockets) – a socket is a pair of kernel buffers plus protocol state; the socket API abstracts network or Unix‑domain communication.

Each mechanism trades off **latency, bandwidth, synchronization burden, and scope** (local vs. network). Understanding the underlying kernel objects lets you predict performance and avoid subtle bugs.

### Pipes
A pipe is a **kernel‑allocated circular buffer** with two file descriptors: read‑end (`fd[0]`) and write‑end (`fd[1]`). The buffer size is limited by `PIPE_BUF` (guaranteed atomic write size) and the runtime limit `pipe-max-size`. When a process writes:

1. Data is copied from user space into the kernel buffer.
2. If the buffer is full, the writer blocks (unless `O_NONBLOCK` is set) until a reader consumes data.
3. The kernel increments the buffer’s **read pointer** when data is consumed; the write pointer advances on each write.

If all read file descriptors are closed, a write generates `SIGPIPE` (or `EPIPE` if the signal is ignored). If all write file descriptors are closed, a read returns `0` (EOF). This EOF semantics is why a pipe can be used to **chain processes** without explicit termination signals.

### Shared Memory
Shared memory is implemented via the **shmfs (tmpfs) filesystem**. `shmget(key, size, flag)` creates or retrieves an inode in shmfs representing a memory object of `size` bytes (rounded up to page size). `shmat(id, addr, flag)` invokes `mmap()` on that shmfs inode, mapping the pages into the caller’s address space at `addr` (or a kernel‑chosen address if `addr == NULL`). The mapping inherits the protection bits from `flag` (typically `PROT_READ | PROT_WRITE`).

Because the same physical pages appear in multiple page tables, any store by one process is instantly visible to others—**no copying**. However, the kernel provides no inherent synchronization; concurrent writes produce race conditions unless the processes use external primitives (semaphores, futexes, mutexes in the shared region).

### RPC (Remote Procedure Call)
RPC builds on **message‑passing IPC** (often Unix‑domain sockets) and adds a marshalling layer:

1. **Client stub** serializes procedure ID and arguments into a byte buffer according to an agreed‑upon ABI (e.g., XDR, Protocol Buffers, or a simple struct layout).
2. The buffer is sent via a reliable, ordered transport (TCP or a sequenced packet socket).
3. **Server stub** demarshals, invokes the real function, marshals the result, and sends it back.
4. The client unmarshals the result and returns it to the caller.

The key advantage is **location transparency**: the caller need not know whether the callee resides in the same process, another process on the same host, or a remote machine—only the transport endpoint changes.

### Sockets
A socket is a **file descriptor bound to a protocol endpoint**. For Unix‑domain sockets (`AF_UNIX`), the endpoint is a pathname in the filesystem; for internet sockets (`AF_INET/AF_INET6`), it is an IP address and port. The kernel maintains:

* **Receive queue** (skb list) – data arrived from the network or peer.
* **Send queue** – data awaiting transmission or already handed to the NIC/driver.
* **Socket state** (TCP: LISTEN, SYN‑RCVD, ESTABLISHED, FIN‑WAIT‑1, …; UDP: unconnected or connected).

System calls:
* `socket(domain, type, protocol)` – allocates a `struct socket` and underlying `struct sock`.
* `bind(fd, addr, len)` – associates the socket with a local address.
* `listen(fd, backlog)` – transitions to LISTEN and prepares the accept queue.
* `accept(fd, addr, len)` – removes a completed connection from the accept queue and returns a new fd.
* `connect(fd, addr, len)` – initiates the three‑way handshake (TCP) or sets the default peer (UDP).
* `send()/recv()` – copy data between user buffers and the socket queues, handling fragmentation and flow control.

Because sockets use the same descriptor table as pipes, they can be `select()`/`poll()`/`epoll()`‑ed uniformly.

## How It Works
### Pipe Creation and Lifecycle – Step‑by‑Step
```c
#include <unistd.h>
#include <errno.h>

int main(void) {
    int pipefd[2];
    if (pipe(pipefd) == -1) {
        perror("pipe");
        return 1;
    }
    /* pipefd[0] = read end, pipefd[1] = write end */

    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        return 1;
    }

    if (pid == 0) {                 /* child */
        close(pipefd[1]);           /* unused write end */
        char buf[32];
        ssize_t n = read(pipefd[0], buf, sizeof(buf)-1);
        if (n == -1) {
            perror("read");
            _exit(1);
        }
        buf[n] = '\0';
        printf("child read: %s\n", buf);
        close(pipefd[0]);
        _exit(0);
    } else {                        /* parent */
        close(pipefd[0]);           /* unused read end */
        const char *msg = "hello from parent\n";
        ssize_t w = write(pipefd[1], msg, strlen(msg));
        if (w == -1) {
            perror("write");
            _exit(1);
        }
        close(pipefd[1]);           /* EOF for child */
        wait(NULL);
        return 0;
    }
}
```

**Why each step?**

* `pipe()` allocates a `struct pipe_inode_info` (found in `linux/pipe_fs_i.h`) with a circular buffer of `PAGE_SIZE * PIPE_DEF_BUFFERS` (default 16 pages ≈ 64 KiB on x86_64) and two `struct file` objects, one for each end, each incrementing the pipe’s **reference count**.
* After `fork()`, the child inherits copies of the file descriptor table; both processes now hold references to the same pipe object. Closing the unused end prevents the reference count from staying artificially high, which would cause the pipe to never report EOF.
* The parent’s `close(pipefd[1])` drops the write reference; when the count reaches zero, any blocked reader receives `0` (EOF). The child’s analogous close on the read end does the same for writers.

### Shared Memory – Detailed Mechanics
```c
#define _GNU_SOURCE
#include <sys/shm.h>
#include <sys/mman.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/wait.h>

int main(void) {
    const size_t len = sysconf(_SC_PAGESIZE);   /* one page */
    int shmid = shmget(IPC_PRIVATE, len,
                       IPC_CREAT | IPC_EXCL | S_IRUSR | S_IWUSR);
    if (shmid == -1) {
        perror("shmget");
        return 1;
    }

    /* shmat with NULL lets kernel choose address; SHM_RND rounds to page */
    void *addr = shmat(shmid, NULL, 0);
    if (addr == (void *)-1) {
        perror("shmat");
        /* clean up */
        shmctl(shmid, IPC_RMID, NULL);
        return 1;
    }

    /* Write a known pattern */
    for (size_t i = 0; i < len/sizeof(int); ++i)
        ((int *)addr)[i] = 0xdeadbeef + i;

    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        shmdt(addr);
        shmctl(shmid, IPC_RMID, NULL);
        return 1;
    }

    if (pid == 0) {                /* child */
        printf("child sees first int: %#x\n", ((int *)addr)[0]);
        /* modify to prove visibility */
        ((int *)addr)[0] = 0xfeedface;
        shmdt(addr);
        _exit(0);
    } else {                       /* parent */
        int status;
        wait(&status);
        printf("parent sees first int after child: %#x\n",
               ((int *)addr)[0]);
        shmdt(addr);
        shmctl(shmid, IPC_RMID, NULL);   /* delete the shmfs inode */
        return 0;
    }
}
```

**Underlying math**

* The kernel rounds `len` up to a multiple of the page size `P = sysconf(_SC_PAGESIZE)`.  
  `allocated_pages = ceil(len / P)`.  
  For `len = P`, `allocated_pages = 1`.
* The virtual address returned by `shmat` is page‑aligned; the kernel stores the offset within the shmfs inode as `vm_offset = addr - shmfs_base`.  
  When a process faults on that address, the kernel looks up the shmfs inode, finds the corresponding `struct page*`, and inserts it into the faulting process’s page table with the requested protection.

Thus, a write to `addr` modifies the same `struct page` that any other attached process sees—no data copy occurs.

### RPC – Minimal Working Example (Unix‑domain socket)
```c
/* common.h */
#ifndef COMMON_H
#define COMMON_H
#include <stdint.h>
typedef struct {
    uint32_t proc;   /* procedure number */
    uint32_t a;      /* first arg */
    uint32_t b;      /* second arg */
} add_args_t;

typedef struct {
    uint32_t result;
} add_res_t;
#endif
```

*Server (`rpc_server.c`)*
```c
#define _GNU_SOURCE
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include "common.h"

#define SOCK_PATH "/tmp/rpc_demo.sock"

int main(void) {
    int listenfd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (listenfd < 0) { perror("socket"); exit(1); }

    struct sockaddr_un addr = { .sun_family = AF_UNIX };
    strncpy(addr.sun_path, SOCK_PATH, sizeof(addr.sun_path)-1);
    unlink(SOCK_PATH);
    if (bind(listenfd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind"); close(listenfd); exit(1);
    }
    if (listen(listenfd, 5) < 0) { perror("listen"); exit(1); }

    for (;;) {
        int connfd = accept(listenfd, NULL, NULL);
        if (connfd < 0) { perror("accept"); continue; }

        add_args_t args;
        ssize_t n = read(connfd, &args, sizeof(args));
        if (n != sizeof(args)) { /* ignore malformed */ close(connfd); continue; }

        uint32_t sum = args.a + args.b;
        add_res_t resp = { .result = sum };
        write(connfd, &resp, sizeof(resp));
        close(connfd);
    }
}
```

*Client (`rpc_client.c`)*
```c
#define _GNU_SOURCE
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include "common.h"

#define SOCK_PATH "/tmp/rpc_demo.sock"

int main(void) {
    int sock = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sock < 0) { perror("socket"); exit(1); }

    struct sockaddr_un addr = { .sun_family = AF_UNIX };
    strncpy(addr.sun_path, SOCK_PATH, sizeof(addr.sun_path)-1);
    if (connect(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("connect"); close(sock); exit(1);
    }

    add_args_t args = { .proc = 0, .a = 123, .b = 456 };
    if (write(sock, &args, sizeof(args)) != sizeof(args)) {
        perror("write"); close(sock); exit(1);
    }

    add_res_t resp;
    if (read(sock, &resp, sizeof(resp)) != sizeof(resp)) {
        perror("read"); close(sock); exit(1);
    }
    printf("RPC result: %u + %u = %u\n", args.a, args.b, resp.result);
    close(sock);
    return 0;
}
```

**Why this works**

* `socket(AF_UNIX, SOCK_STREAM)` creates a sequenced, reliable byte‑stream channel analogous to a TCP connection but confined to the kernel’s VFS.
* `bind()` reserves a pathname in the filesystem; the kernel creates a `struct socket` linked to a `struct sock` of type `UNIX`.
* `accept()` extracts a completed connection from the listen queue, yielding a new fd that inherits the same protocol state.
* The client’s `write()` copies the `add_args_t` struct into the socket’s send buffer; the kernel eventually transmits it as a sequence of bytes to the server’s receive buffer.
* Because the channel is **byte‑oriented**, the server must know the exact layout (no framing). In production RPC you would add a length prefix or use a framing protocol (e.g., RPC over HTTP/2).

### Sockets – TCP Client/Server with Explicit Length Prefix
```c
/* tcp_echo.c */
#define _GNU_SOURCE
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#define PORT 9000
#define BACKLOG 5

void die(const char *msg) {
    perror(msg);
    exit(EXIT_FAILURE);
}

int main(int argc, char *argv[]) {
    int listenfd = socket(AF_INET, SOCK_STREAM, 0);
    if (listenfd < 0) die("socket");

    int opt = 1;
    setsockopt(listenfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in serv = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = htonl(INADDR_ANY),
        .sin_port = htons(PORT)
    };
    if (bind(listenfd, (struct sockaddr *)&serv, sizeof(serv)) < 0)
        die("bind");
    if (listen(listenfd, BACKLOG) < 0) die("listen");

    printf("server listening on %d\n", PORT);

    for (;;) {
        int connfd = accept(listenfd, NULL, NULL);
        if (connfd < 0) { perror("accept"); continue; }

        pid_t pid = fork();
        if (pid == 0) {          /* child */
            close(listenfd);
            while (1) {
                uint32_t netlen;
                ssize_t n = read(connfd, &netlen, sizeof(netlen));
                if (n <= 0) break; /* EOF or error */
                uint32_t len = ntohl(netlen);
                char *buf = malloc(len);
                if (!buf) { perror("malloc"); exit(1); }

                size_t off = 0;
                while (off < len) {
                    ssize_t r = read(connfd, buf + off, len - off);
                    if (r <= 0) { perror("read"); free(buf); exit(1); }
                    off += r;
                }
                /* echo back */
                uint32_t netlen_out = htonl(len);
                write(connfd, &netlen_out, sizeof(netlen_out));
                write(connfd, buf, len);
                free(buf);
            }
            close(connfd);
            _exit(0);
        } else {                 /* parent */
            close(connfd);
        }
    }
}
```

*Client side (similar, but initiates `connect()` and sends a length‑prefixed message).*

**Key points**

* The length prefix (`uint32_t`) solves TCP’s stream nature: without it, the receiver cannot discern where one message ends and the next begins.
* Converting between host and network byte order (`htonl/ntohl`) ensures correctness across architectures.
* The server uses `fork()` to handle each connection concurrently; an alternative is `epoll()`+nonblocking I/O for scalability.

## Worked Examples
### Example 1: Pipe Throughput Estimation
**Goal:** Compute the theoretical maximum throughput of a pipe when writer and reader run on the same CPU core, assuming zero-copy is *not* possible (data must be copied between user and kernel buffers).

*Pipe buffer size*: `B = pipe-max-size` (default 64 KiB on many distros).  
*System call overhead*: Each `write()` or `read()` incurs a context switch cost `C_sw ≈ 1 µs` and a copy cost `C_cpy = B / mem_bw`.  
Assume memory bandwidth `mem_bw = 20 GB/s`.

The time per transfer of size `B`:
```
T = 2*C_sw + B / mem_bw
  = 2*1µs + 64KiB / (20GB/s)
  = 2µs + (65536 B) / (20×10^9 B/s)
  ≈ 2µs + 3.28µs = 5.28µs
```
Throughput:
```
Θ = B / T ≈ 65536 B / 5.28µs ≈ 12.4 GB/s
```
In practice, the kernel limits the pipe to `PIPE_BUF = 4096` bytes for atomic writes; larger writes are split, increasing overhead. Measured pipe throughput on a modern x86_64 box is ~3–5 GB/s, matching the model when accounting for extra lock contention in the pipe’s internal mutex.

**Verification command:**
```bash
# Write a large block through pipe and measure with pv
dd if=/dev/zero bs=1M count=100 | pv -q > /dev/null
```
`pv` reports instantaneous throughput; on a typical laptop you’ll see ~4 GB/s.

### Example 2: Shared Memory Page Fault Latency
**Scenario:** Two processes attach to a 2 MiB shared region. The first process writes to every page, causing page faults that allocate zero‑filled pages; the second process later reads the same pages.

*Number of pages*: `N = size / P = 2MiB / 4KiB = 512`.
*Cost of a fault*: kernel must find a free page, clear it, insert into both page tables, and update the VMA. Approximate latency `L_fault ≈ 2 µs` (depends on CPU and system load).

*First writer*: incurs `N * L_fault = 512 * 2µs = 1.024 ms` fault latency + actual store time (negligible).
*Second reader*: pages are already resident; each read triggers a TLB miss (~100 ns) but no fault. Total read latency ≈ `N * 100ns = 51.2µs`.

Thus, the **cold start** cost is dominated by fault allocation; after warm‑up, shared memory access is essentially as fast as normal memory.

**Demonstration:**
```bash
# Allocate and fault pages in shared memory
./shm_fault_writer   # writer touches all pages
./shm_fault_reader   # reader then reads; time with `time`
```
You’ll observe the writer taking ~1 ms, the reader <0.1 ms.

### Example 3: RPC Round‑Trip Time (RTT) Measurement
**Setup:** Client and server on the same machine communicating via Unix‑domain stream socket. Message: 64‑byte payload.

*Components of RTT*:
1. Client syscall `write()` → copy to kernel socket buffer (`~0.5µs`).
2. Kernel delays until server is scheduled (assume timeslice `Q = 1 ms`, average wait `Q/2 = 0.5 ms`).
3. Server `read()` → copy to user buffer (`~0.5µs`).
4. Server processes (trivial) → `write()` reply (`~0.5µs`).
5. Network stack reverse path (same as step 1‑2) → another `~0.5 + 0.5 ms`.
6. Client `read()` reply (`~0.5µs`).

*Total* ≈ `2*(0.5µs + 0.5ms + 0.5µs) + 0.5µs` ≈ `1.0 ms + a few µs`.

**Measurement:**
```bash
# Server in one terminal
./rpc_server &
# Client in another, timing
time ./rpc_client
```
Real time reported by `time` will be ~1 ms, confirming the model.

## Common Mistakes
### Mistake 1: Assuming Pipe Writes Are Always Atomic Beyond PIPE_BUF
**Wrong:**  
```c
write(pipefd[1], large_buf, 8192);   /* > PIPE_BUF */
```
**Why it’s wrong:** POSIX guarantees atomicity only for writes ≤ `PIPE_BUF` (typically 512–4096 bytes). Larger writes may be interleaved with data from other writers if the pipe has multiple writers. The kernel splits the write into multiple internal operations, and without external locking you can get garbled output.

**Fix:** Either limit each write to `PIPE_BUF` or serialize writers with a mutex (e.g., `flock()` on a dummy file or a futex in shared memory).

### Mistake 2: Forgetting to Zero‑Initialize Shared Memory Before Use
**Wrong:**  
```c
int *shm = shmat(shmid, NULL, 0);
*shm = 42;   /* assume other fields are zero */
```
**Why it’s wrong:** The kernel allocates **zero‑filled pages** only when a page is first faulted *after* being allocated. If you `shmget()` with `IPC_CREAT` but never touch a page, its contents are indeterminate (may contain leftover data from a previous owner). Relying on it being zero leads to subtle bugs.

**Fix:** Explicitly zero the region after attach, or use `shmget()` with `SHM_HUGETLB` + `mlock()` and then `memset(shm, 0, size);`. Alternatively, use `shmget()` with `IPC_PRIVATE` and `IPC_CREAT | IPC_EXCL` and then `ftruncate()` on the underlying shmfs file via `/dev/shm` (less portable).

### Mistake 3: Using `connect()` on a UDP Socket Without Checking for `ECONNREFUSED`
**Wrong:**  
```c
int sock = socket(AF_INET, SOCK_DGRAM, 0);
connect(sock, (struct sockaddr *)&serv, sizeof(serv));
send(sock, msg, len, 0);   /* assume delivery */
```
**Why it’s wrong:** `connect()` on a UDP socket merely sets the default peer address; it does **not** perform any handshake. If no listener exists on the target port, the first `send()` will succeed (packet queued), but the ICMP “Port Unreachable” error may be delivered later as `ECONNREFUSED` on a subsequent `send()` or `recv()`. Ignoring it leads to silent packet loss.

**Fix:** After each `sendto()`/`send()`, check the return value; if it returns `-1` and `errno == ECONNREFUSED`, handle the situation (e.g., retry, log, or fall back to another path). For reliability, prefer TCP or an application-layer ACK.

### Mistake 4: Misunderstanding EOF on Pipes vs. Sockets
**Wrong:**  
```c
while ((n = read(fd, buf, sizeof(buf))) > 0
