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

## Module 196: Async I/O Models — select, poll, epoll, io_uring

## Why This Matters

A server blocking one thread per connection pays a cost that scales linearly with connection count — not because threads are doing work, but because the kernel is context-switching between thousands of threads that are sleeping. The real cost is memory ($\approx 8\,\text{MB}$ default stack per thread × 10,000 connections = $80\,\text{GB}$ virtual address space) and scheduler overhead, not CPU work. The solution is *I/O multiplexing*: one thread asks the kernel which descriptors are ready, then handles only those.

The evolution from `select` to `io_uring` is not incremental polish — each step eliminates a specific, measurable bottleneck. Understanding where each bottleneck lives (the kernel scan loop, the fd_set copy, the system call boundary, the readiness-vs-completion model mismatch) is what this module is about.

---

## Core Concepts

### The Fundamental Problem: Readiness vs. Completion

Two distinct I/O models exist, and conflating them causes bugs:

- **Readiness model** (`select`, `poll`, `epoll`): the kernel tells you a descriptor *can* be read without blocking. You still call `read()` yourself. Two syscalls per I/O event minimum.
- **Completion model** (`io_uring`, AIO): you submit an operation and the kernel tells you when it *finished*. One round trip for the result.

This distinction matters immediately when you try to mix epoll with file I/O: regular files on Linux are *always* reported ready by `select`/`poll`/`epoll` because the VFS layer doesn't support readiness semantics for them — the actual disk wait happens inside `read()` anyway. Only sockets, pipes, terminals, and a handful of other fd types have genuine readiness.

### select: $O(n)$ Scan with a Hard Descriptor Ceiling

`select` passes three bitmaps to the kernel: one each for read interest, write interest, and error interest. The kernel scans every bit from 0 to `nfds-1` on every call, regardless of how many are set. The hard limit `FD_SETSIZE` (defined as 1024 in `<sys/select.h>`) is a compile-time constant — the bitmap is a fixed-size array in the `fd_set` type itself, not a pointer to a heap buffer. You cannot watch fd 1025 with `select`, period.

Each call copies $\lceil n/8 \rceil$ bytes of fd_set into the kernel and back. For $n = 1024$, that is 128 bytes per bitmap, three bitmaps each way — 768 bytes of copying per call, plus the linear scan.

Total kernel work per call: $O(n)$ where $n$ = `nfds` argument, not the number of set bits.

### poll: Same Algorithm, No Ceiling

`poll` accepts a caller-allocated array of `pollfd` structs, removing the `FD_SETSIZE` limit. But the kernel implementation still iterates the full array calling `->poll()` on each file descriptor's file operations. The copy cost is now proportional to the array length: $n \times \text{sizeof(struct pollfd)} = n \times 8$ bytes transferred per call.

The improvement is purely ergonomic. For $n = 10{,}000$ connections, you're copying 80 KB into the kernel on every `poll()` call, and the kernel is calling `->poll()` on 10,000 file structs even if one has data.

### epoll: Amortized Registration, $O(1)$ Wait

`epoll` splits the problem into two phases:

1. **Registration** (`epoll_ctl`): inserts the fd into a red-black tree inside the kernel's epoll instance. Cost: $O(\log n)$ per registration. This happens once per fd lifetime, not per wait call.

2. **Wait** (`epoll_wait`): drains a linked list of ready events. The kernel populates this list via *wait queue callbacks* — at registration time, epoll installs a callback on each socket's internal wait queue. When the NIC driver delivers a packet and wakes the socket's wait queue, the callback fires and adds the socket to the ready list. `epoll_wait` never touches sockets that received no events.

No fd_set copy. No array scan. The kernel only touches descriptors that transitioned to ready since the last drain.

Complexity comparison for $n$ monitored descriptors, $k$ wait calls, $m$ events returned per call (averaged):

$$\text{select/poll total work} = O(n \cdot k)$$

$$\text{epoll total work} = O(n \log n) + O(m \cdot k)$$

When $m \ll n$ — which is exactly the high-connection-count / sparse-activity scenario — the epoll term $O(m \cdot k)$ dominates and is much smaller. The crossover point where epoll starts winning over poll is roughly $n \approx 20$–$50$ descriptors on real hardware, measurable with `strace` timing.

### io_uring: Eliminating the System Call Boundary

`epoll` with non-blocking I/O still requires at minimum two syscalls per I/O event: `epoll_wait` to learn readiness, then `read`/`write` to move data. Each syscall crosses the user/kernel boundary, flushes speculative execution state (post-Spectre mitigations made this worse), and may cause a TLB shootdown if address spaces differ.

`io_uring` maps two ring buffers into both userspace and kernel address space via `mmap`. The **Submission Queue (SQ)** is written by userspace; the **Completion Queue (CQ)** is written by the kernel. In `SQPOLL` mode, a kernel thread spins on the SQ, consuming entries without any syscall from userspace. Completions appear in the CQ and are read directly from userspace memory. Zero syscalls in steady state.

The model shift is significant: instead of "tell me what's ready so I can call read," you write `{op: IORING_OP_READ, fd: sock, buf: ptr, len: n}` into the SQ and later read `{result: bytes_read, user_data: tag}` from the CQ. The kernel does the actual I/O.

---

## How It Works

### select: The Bitmap Mechanics

```c
#include <sys/select.h>
#include <unistd.h>

fd_set readfds;
struct timeval timeout = {.tv_sec = 5, .tv_usec = 0};

FD_ZERO(&readfds);
FD_SET(sock1, &readfds);
FD_SET(sock2, &readfds);
int maxfd = (sock1 > sock2) ? sock1 : sock2;

// The kernel scans fds 0 through maxfd — not just sock1 and sock2.
// select() MODIFIES readfds in place: bits for non-ready fds are cleared.
// You must call FD_ZERO + FD_SET again before the next select().
int nready = select(maxfd + 1, &readfds, NULL, NULL, &timeout);
if (nready < 0) { perror("select"); exit(1); }

if (FD_ISSET(sock1, &readfds)) {
    // sock1 has data — read() will not block
    ssize_t n = read(sock1, buf, sizeof(buf));
}
```

The `maxfd + 1` argument tells the kernel where to stop scanning. Passing a larger value than necessary wastes time scanning zero bits. The kernel-side cost is proportional to this value, not to the number of set bits.

### poll: Surviving Beyond FD_SETSIZE

```c
#include <poll.h>

struct pollfd fds[N_CONNS];
for (int i = 0; i < N_CONNS; i++) {
    fds[i].fd     = conn_sockets[i];
    fds[i].events = POLLIN | POLLRDHUP;
    // fds[i].revents is written by the kernel, not caller
}

// poll() does NOT destroy fds[].events — but it still copies
// the entire array (N_CONNS * 8 bytes) into the kernel.
int nready = poll(fds, N_CONNS, 5000 /* ms */);

for (int i = 0; i < N_CONNS; i++) {
    if (fds[i].revents & POLLIN) {
        read(fds[i].fd, buf, sizeof(buf));
    }
    if (fds[i].revents & POLLRDHUP) {
        // Peer closed write end — detect half-close without read()
        close(fds[i].fd);
    }
}
```

`POLLRDHUP` (Linux-specific, requires `_GNU_SOURCE`) is worth using: it tells you when the remote side called `shutdown(SHUT_WR)` or `close()`, which `POLLIN` alone won't distinguish from arriving data without a zero-length `read()`.

### epoll: Registration, Wait Queue Callbacks, Edge vs. Level

```c
#include <sys/epoll.h>

// epoll_create1(0) is preferred over epoll_create(size) —
// the 'size' argument has been ignored since Linux 2.6.8.
int epfd = epoll_create1(EPOLL_CLOEXEC);  // avoid fd leak across exec()

struct epoll_event ev = {
    .events  = EPOLLIN | EPOLLET,  // edge-triggered
    .data.fd = sock1,
};
// O(log n) insertion into the kernel's rb-tree for this epoll instance
epoll_ctl(epfd, EPOLL_CTL_ADD, sock1, &ev);

struct epoll_event events[MAX_EVENTS];

for (;;) {
    // Blocks until at least one fd is ready, or timeout expires.
    // Returns only the ready fds — does not touch the rb-tree.
    int n = epoll_wait(epfd, events, MAX_EVENTS, -1
