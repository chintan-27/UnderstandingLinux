---
id: 196
title: "Async I/O models"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Synchronous vs. Asynchronous I/O
A **synchronous** I/O system call (`read()`, `write()`) blocks the calling thread until the kernel finishes the operation. If the file descriptor refers to a socket, pipe, or terminal that is not ready, the thread is put to sleep and a context switch occurs. The cost of a blocked syscall includes:
- Kernel entry/exit overhead (~100–300 ns on modern x86‑64)
- Potential scheduler latency if the thread is descheduled
- Wasted CPU cycles while the thread could be doing other work

**Asynchronous I/O** decouples the initiation of an operation from its completion, allowing the application to continue executing while the kernel processes the request in the background. The application later retrieves the result via a completion mechanism (e.g., a return value from a wait syscall or a completion queue entry). This model is essential for handling many concurrent I/O sources without creating a thread per source, which would incur:
- Stack memory overhead (typically 8 MiB per thread)
- Context‑switch cost proportional to the number of threads
- Synchronization overhead for shared state

### Multiplexing Primitives
The kernel provides multiplexing syscalls that let a single thread wait for readiness on *multiple* file descriptors. Their efficiency hinges on how they track interest and how they report readiness.

| Syscall | Interest representation | Kernel readiness check | Complexity per wait | Typical use case |
|---------|------------------------|------------------------|---------------------|------------------|
| `select` | Bitmask in `fd_set` (size = `FD_SETSIZE` bits) | Linear scan of the bitmask | $O(\text{maxfd})$ | Legacy code, portable |
| `poll` | Array of `struct pollfd` | Linear scan of the array | $O(n)$ where *n* = number of entries | Slightly better than `select`, no `FD_SETSIZE` limit |
| `epoll` | Red‑black tree of registered fds + ready list | Tree lookup for add/remove; ready list scan | $O(\log n)$ for update, $O(k)$ for wait where *k* = number of ready fds | High‑scale servers (nginx, Node.js) |
| `io_uring` | Submission and completion rings (shared memory) | Lock‑less producer/consumer on rings; kernel processes submissions asynchronously | $O(1)$ submission, $O(1)$ completion retrieval | Ultra‑low‑latency, zero‑copy applications (databases, network stacks) |

**Why the differences matter:**  
- `select`/`poll` must examine every registered descriptor each time they block, even if only one is ready. As the number of monitored fds grows, the wait time grows linearly.  
- `epoll` maintains a kernel‑side data structure (a red‑black tree) that tracks interest; adding or removing a descriptor costs $O(\log n)$, but waiting only walks the ready list, which contains *only* those descriptors that the kernel has marked ready.  
- `io_uring` goes further: the application and kernel share two lock‑less rings (submission and completion). The application writes a `struct io_uring_sqe` (submission queue entry) into the submission ring, triggers a syscall (`io_uring_enter`) to tell the kernel how many entries to consume, and later reads completion queue entries (`struct io_uring_cqe`) from the completion ring. No per‑descriptor scanning occurs; the kernel processes I/O requests directly from the submission ring.

### Key Data Structures
- **`fd_set`** (used by `select`): an array of `unsigned long` bits. On Linux, `FD_SETSIZE` is typically 1024, so the structure occupies $\frac{1024}{8}=128$ bytes. The macro `FD_SET(fd, &set)` computes `set->fds_bits[fd / (8*sizeof(unsigned long))] |= (1UL << (fd % (8*sizeof(unsigned long))))`.
- **`struct pollfd`**:  
  ```c
  struct pollfd {
      int   fd;          /* file descriptor */
      short events;      /* requested events */
      short revents;     /* returned events */
  };
  ```
  On a 64‑bit system each field is naturally aligned, giving a size of 8 bytes (fd) + 2 bytes (events) + 2 bytes (revents) + 2 bytes padding = 16 bytes.  
- **`struct epoll_event`**:  
  ```c
  struct epoll_event {
      __uint32_t events;  /* epoll events */
      epoll_data_t data;  /* user data */
  };
  ```
  Typically 8 bytes on x86‑64.  
- **`io_uring_sqe`** (submission queue entry): 64 bytes, containing opcode, fd, offsets, pointers to buffers, and flags.  
- **`io_uring_cqe`** (completion queue entry): 16 bytes, containing user‑data tag and result (return value or negative error).

### Operational Flow
1. **Registration** – The application informs the kernel which fds it cares about and what events (read, write, error, etc.) it wants.
2. **Wait** – The application invokes a multiplexing syscall (`select`, `poll`, `epoll_wait`, `io_uring_enter`). The kernel either:
   - Scans its interest structure to find ready fds (`select`/`poll`), or
   - Checks a ready list that was populated asynchronously by the interrupt/BH handlers (`epoll`), or
   - Processes pre‑submitted requests from the shared submission ring (`io_uring`).
3. **Retrieval** – The kernel returns either a count of ready fds (`select`/`poll`), an array of filled `epoll_event`s (`epoll_wait`), or completion queue entries (`io_uring_get_cqe`). The application then processes each ready fd or completion.
4. **Re‑arm (if needed)** – For level‑triggered interfaces (`select`, `poll`, default `epoll`) the kernel continues to report readiness until the condition clears. For edge‑triggered `epoll` (`EPOLLET`) the application must re‑arm after each event by performing an I/O operation that would block if the fd were not ready.

## Worked Examples
### Example 1: `select` – Echo Server Handling Two Clients
```c
/* select_echo.c */
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#define PORT 9000
#define BACKLOG 2
#define BUF_SIZE 1024

int main(void)
{
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(PORT)
    };
    bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr));
    listen(listen_fd, BACKLOG);

    fd_set read_set;
    int max_fd = listen_fd;
    int client_fds[2] = { -1, -1 };
    int client_cnt = 0;

    while (1) {
        FD_ZERO(&read_set);
        FD_SET(listen_fd, &read_set);
        max_fd = listen_fd;
        for (int i = 0; i < 2; ++i) {
            if (client_fds[i] != -1) {
                FD_SET(client_fds[i], &read_set);
                if (client_fds[i] > max_fd) max_fd = client_fds[i];
            }
        }

        /* block until something is ready */
        int ready = select(max_fd + 1, &read_set, NULL, NULL, NULL);
        if (ready == -1) {
            perror("select");
            exit(EXIT_FAILURE);
        }

        /* new connection */
        if (FD_ISSET(listen_fd, &read_set)) {
            int conn = accept(listen_fd, NULL, NULL);
            if (client_cnt < 2) {
                client_fds[client_cnt++] = conn;
                printf("Accepted client %d (fd=%d)\n", client_cnt, conn);
            } else {
                close(conn); /* exceed limit */
            }
        }

        /* handle existing clients */
        for (int i = 0; i < client_cnt; ++i) {
            int fd = client_fds[i];
            if (FD_ISSET(fd, &read_set)) {
                char buf[BUF_SIZE];
                ssize_t n = read(fd, buf, sizeof(buf));
                if (n <= 0) { /* EOF or error */
                    printf("Client %d closed (fd=%d)\n", i, fd);
                    close(fd);
                    client_fds[i] = -1;
                    /* compact array */
                    for (int j = i; j < client_cnt-1; ++j) client_fds[j] = client_fds[j+1];
                    client_fds[--client_cnt] = -1;
                    --i; /* re‑check this slot */
                } else {
                    write(fd, buf, n); /* echo */
                }
            }
        }
    }
}
```
**Step‑by‑step reasoning**
1. `listen_fd` is the only fd initially registered; `max_fd` tracks the highest fd for `select`.
2. Each loop iteration rebuilds the `fd_set` because `select` modifies it (clears bits for non‑ready fds).
3. `select(max_fd+1, &read_set, NULL, NULL, NULL)` blocks until at least one bit is set. Complexity: $O(\text{max_fd}+1)$ → here at most `listen_fd`+2.
4. On readiness, we test each fd with `FD_ISSET`. For the listening socket we `accept`; for client sockets we `read` and echo.
5. When a client closes, we compact the `client_fds` array to keep `max_fd` accurate. Forgetting to recompute `max_fd` after a close is a common mistake (see Common Mistakes).

### Example 2: `poll` – Concurrent File Copy from Three Sources
```c
/* poll_copy.c */
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define BUF_SIZE 4096

int main(int argc, char *argv[])
{
    if (argc != 5) {
        fprintf(stderr, "Usage: %s <src1> <src2> <src3> <dst>\n", argv[0]);
        exit(EXIT_FAILURE);
    }

    int src[3];
    for (int i = 0; i < 3; ++i) {
        src[i] = open(argv[i+1], O_RDONLY);
        if (src[i] < 0) {
            perror("open src");
            exit(EXIT_FAILURE);
        }
    }
    int dst = open(argv[4], O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (dst < 0) {
        perror("open dst");
        exit(EXIT_FAILURE);
    }

    struct pollfd pfd[3];
    int remaining = 3;
    char buf[BUF_SIZE];

    for (int i = 0; i < 3; ++i) {
        pfd[i].fd = src[i];
        pfd[i].events = POLLIN;
        pfd[i].revents = 0;
    }

    while (remaining > 0) {
        int ret = poll(pfd, 3, -1); /* block indefinitely */
        if (ret == -1) {
            if (errno == EINTR) continue;
            perror("poll");
            exit(EXIT_FAILURE);
        }

        for (int i = 0; i < 3; ++i) {
            if (pfd[i].revents & POLLIN) {
                ssize_t n = read(pfd[i].fd, buf, sizeof(buf));
                if (n <= 0) { /* EOF or error */
                    close(pfd[i].fd);
                    pfd[i].fd = -1;
                    pfd[i].events = 0;
                    --remaining;
                    continue;
                }
                /* write to destination; handle short writes */
                size_t off = 0;
                while (off < (size_t)n) {
                    ssize_t w = write(dst, buf + off, n - off);
                    if (w <= 0) {
                        perror("write");
                        exit(EXIT_FAILURE);
                    }
                    off += w;
                }
            }
            pfd[i].revents = 0; /* clear for next poll */
        }
    }

    close(dst);
    return 0;
}
```
**Why `poll` is preferable here**
- No `FD_SETSIZE` limit; we can easily scale to hundreds of files by enlarging the `pfd` array.
- The `revents` field tells us exactly which event occurred (`POLLIN` in this case). Forgetting to zero‑revents after processing leads to spurious reprocessing.

### Example 3: `epoll` – Edge‑Triggered HTTP‑Like Server (Non‑Blocking Accept)
```c
/* epoll_et.c */
#define _GNU_SOURCE
#include <sys/epoll.h>
#include <fcntl.h>
#include <unistd.h>
#include <netinet/in.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#define PORT 8080
#define MAX_EVENTS 1024
#define BUF_SIZE 2048

static int set_nonblocking(int fd)
{
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags == -1) return -1;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int main(void)
{
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(PORT)
    };
    bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr));
    listen(listen_fd, SOMAXCONN);
    set_nonblocking(listen_fd);

    int epfd = epoll_create1(0); /* size argument ignored since Linux 2.6.8 */
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLET; /* edge‑triggered */
    ev.data.fd = listen_fd;
    if (epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev) == -1) {
        perror("epoll_ctl listen");
        exit(EXIT_FAILURE);
    }

    struct epoll_event events[MAX_EVENTS];
    char buf[BUF_SIZE];

    for (;;) {
        int n = epoll_wait(epfd, events, MAX_EVENTS, -1);
        if (n == -1) {
            if (errno == EINTR) continue;
            perror("epoll_wait");
            exit(EXIT_FAILURE);
        }

        for (int i = 0; i < n; ++i) {
            int fd = events[i].data.fd;
            uint32_t event = events[i].events;

            if ((event & EPOLLERR) || (event & EPOLLHUP) || !(event & EPOLLIN)) {
                /* error or hangup */
                fprintf(stderr, "epoll error on fd %d\n", fd);
                close(fd);
                continue;
            }

            if (fd == listen_fd) {
                /* accept all pending connections (edge‑triggered) */
                while (1) {
                    struct sockaddr_in client_addr;
                    socklen_t client_len = sizeof(client_addr);
                    int conn = accept4(listen_fd,
                                       (struct sockaddr *)&client_addr,
                                       &client_len,
                                       SOCK_NONBLOCK);
                    if (conn == -1) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK)
                            break; /* no more pending */
                        perror("accept4");
                        break;
                    }
                    struct epoll_event conn_ev;
                    conn_ev.events = EPOLLIN | EPOLLET;
                    conn_ev.data.fd = conn;
                    if (epoll_ctl(epfd, EPOLL_CTL_ADD, conn, &conn_ev) == -1)
                        perror("epoll_ctl add conn");
                }
                continue;
            }

            /* client socket – read until would‑block */
            while (1) {
                ssize_t rr = read(fd, buf, sizeof(buf));
                if (rr == -1) {
                    if (errno == EAGAIN || errno == EWOULDBLOCK)
                        break; /* done for now */
                    perror("read");
                    goto close_conn;
                }
                if (rr == 0) { /* EOF */
                    goto close_conn;
                }
                /* echo back (simplistic) */
                size_t off = 0;
                while (off < (size_t)rr) {
                    ssize_t ss = write(fd, buf + off, rr - off);
                    if (ss <= 0) {
                        perror("write");
                        goto close_conn;
                    }
                    off += ss;
                }
            }
            continue;

        close_conn:
            close(fd);
        }
    }
}
```
**Key points**
- Edge‑triggered (`EPOLLET`) requires the socket to be non‑blocking and the application to keep reading/writing until `EAGAIN`. If the application stops early, it will not be notified again until new data arrives.
- The listen socket is also edge‑triggered; we loop on `accept4` until it returns `EAGAIN` to pull all pending connections in one burst, preventing starvation.
- `epoll_wait` returns the number of filled `epoll_event` structures; we must iterate over exactly that count.

### Example 4: `io_uring` – Async Read‑Then‑Write Loop (Zero‑Copy)
```c
/* io_uring_copy.c */
#define _GNU_SOURCE
#include <liburing.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define QUEUE_DEPTH 32
#define BUF_SIZE    4096

int main(int argc, char *argv[])
{
    if (argc != 3) {
        fprintf(stderr, "Usage: %s <src> <dst>\n");
        exit(EXIT_FAILURE);
    }

    int src_fd = open(argv[1], O_RDONLY);
    if (src_fd < 0) { perror("open src"); exit(EXIT_FAILURE); }
    int dst_fd = open(argv[2], O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (dst_fd < 0) { perror("open dst"); exit(EXIT_FAILURE); }

    struct io_uring ring;
    if (io_uring_queue_init(QUEUE_DEPTH, &ring, 0) < 0) {
        perror("io_uring_queue_init");
        exit(EXIT_FAILURE);
    }

    /* Pre‑allocate a buffer pool (simple single buffer for demo) */
    char *buf = aligned_alloc(4096, BUF_SIZE);
    if (!buf) { perror("aligned_alloc"); exit(EXIT_FAILURE); }

    off_t src_offset = 0;
    off_t dst_offset = 0;
    int pending = 0;

    while (1) {
        /* Submit read requests while we have capacity and src not EOF */
        while (pending < QUEUE_DEPTH) {
            struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
            if (!sqe) break; /* submission ring full */
            io_uring_prep_read_fixed(sqe,
                                     src_fd,
                                     buf,
                                     BUF_SIZE,
                                     src_offset,
                                     0); /* fixed fd index 0 */
            io_uring_sqe_set_data(sqe, (void *)(uintptr_t)src_offset);
            src_offset += BUF_SIZE;
            ++pending;
        }

        if (pending == 0) break; /* nothing left to do */

        /* Submit the batch */
        if (io_uring_submit(&ring) < 0) {
            perror("io_uring_submit");
            exit(EXIT_FAILURE);
        }

        /* Reap completions */
        struct io_uring_cqe *cqe;
        unsigned int head;
        io_uring_for_each_cqe(&ring, head, cqe) {
            int res = cqe->res;
            if (res < 0) {
                fprintf(stderr, "io_uring read error: %s\n", strerror(-res));
                exit(EXIT_FAILURE);
            }
            if (res == 0) { /* EOF */
                --pending;
                continue;
            }
            off_t offset = (off_t)(uintptr_t)cqe->user_data;
            /* Write the data we just read */
            struct io_uring_sqe *wsqe = io_uring_get_sqe(&ring);
            if (!wsqe) { fprintf(stderr, "sqe full while reaping\n"); exit(EXIT_FAILURE); }
            io_uring_prep_write_fixed(wsqe,
                                      dst_fd,
                                      buf,
                                      res,
                                      offset,
                                      0);
            io_uring_sqe_set_data(wsqe, (void *)(uintptr_t)offset);
            /* completion will be processed later */
        }
        io_uring_cq_advance(&ring, head);
    }

    /* Drain any remaining writes */
    while (pending > 0) {
        io_uring_submit_and_wait(&ring, 1);
        struct io_uring_cqe *cqe;
        io_uring_wait_cqe(&ring, &cqe);
        if (cqe->res < 0) { perror("io_uring write error"); exit(EXIT_FAILURE); }
        io_uring_cq_seen(&ring, cqe);
        --pending;
    }

    io_uring_queue_exit(&ring);
    free(buf);
    close(src_fd);
    close(dst_fd);
    return 0;
}
```
**Explanation of the flow**
1. **Submission ring** – We obtain `io_uring_sqe`s, prepopulate them with `read_fixed` (or `write_fixed`) describing a buffer, offset, and length. The `user_data` field carries the file offset so we can match completions to the correct buffer region.
2. **Submit** – `io_uring_submit` tells the kernel
