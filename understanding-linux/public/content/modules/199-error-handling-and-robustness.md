---
id: 199
title: "Error handling and robustness"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every system call can fail. A `write()` returns -1. A `connect()` times out. A `read()` delivers fewer bytes than requested. Programs that ignore these outcomes don't fail gracefully — they corrupt data, loop forever, silently drop work, or crash in ways that are nearly impossible to diagnose.

The operating system communicates failure through a precise, small vocabulary: `errno`, return codes, and signals. Beyond individual calls, real systems face *transient* failures — a network briefly unavailable, a file descriptor table momentarily exhausted — which demands retry logic with carefully chosen backoff strategies. The danger is that naive retry logic becomes its own cause of collapse.

---

## Core Concepts

### `errno`: The Error Number Variable

When a system call fails, it returns -1 (or `NULL` for `malloc`/`mmap`-family calls) and sets a thread-local integer named `errno` to a code describing *why*. The thread-locality is deliberate: each POSIX thread has its own `errno` slot, so concurrent calls in different threads don't race on the same variable. Under glibc, `errno` expands to a macro that dereferences a per-thread pointer.

`errno` is only meaningful *immediately* after a failed call. The C library itself issues system calls internally; even a call to `fprintf()` can overwrite `errno`. Read it first, before anything else.

Common codes, defined in `<errno.h>` per POSIX.1-2001:

| Code | Numeric (x86-64) | Meaning |
|---|---|---|
| `EINTR` | 4 | Call interrupted by a signal |
| `EAGAIN` / `EWOULDBLOCK` | 11 / 11 | Resource temporarily unavailable |
| `ENOMEM` | 12 | Kernel out of memory |
| `EACCES` | 13 | Permission denied |
| `ENOENT` | 2 | No such file or directory |
| `EBADF` | 9 | Bad file descriptor |
| `EPIPE` | 32 | Broken pipe (reader closed) |
| `ECONNREFUSED` | 111 | Connection refused by remote |
| `ETIMEDOUT` | 110 | Operation timed out |
| `EINVAL` | 22 | Invalid argument |

On x86-64 Linux, the kernel returns error codes as negative values in `rax` (e.g., `-ENOENT` = `-2`). The syscall wrapper in glibc negates these, stores the absolute value in `errno`, and returns -1 to userspace.

### Return Values and Partial Success

A `read()` or `write()` returning a positive integer smaller than `count` is not an error — it is *partial success*. The kernel is not obligated to fulfill the full request in one shot, for concrete reasons:

- **Pipes and FIFOs**: the kernel pipe buffer is 65536 bytes by default (`/proc/sys/fs/pipe-max-size`). A write larger than the current free space returns the number of bytes that fit.
- **Network sockets**: TCP's send buffer (`SO_SNDBUF`) may be partially full. `write()` drains what it can and returns.
- **Signals**: a signal arriving mid-call causes early return with a short count, *or* sets `errno=EINTR` with a -1 return, depending on whether `SA_RESTART` was set for that signal handler.

Code that calls `write()` once and moves on is silently losing data.

### Retries and Transient Failures

Some errors are the kernel's way of saying *not now, try later*:

- `EAGAIN` on a non-blocking fd: the kernel buffer is empty (read) or full (write) at this instant.
- `EINTR`: a signal arrived while the thread was blocked in the kernel. The call was aborted; nothing was transferred. Retry unconditionally unless you're checking for a shutdown signal.
- `ENOMEM` from `connect()` or `accept()`: the kernel ran out of socket buffer memory transiently. May clear within milliseconds.

Retrying these immediately is usually correct. The question of *how long to wait* arises when the resource is contended or a remote service is down.

### Exponential Backoff

Immediate retry under load is catastrophic: if $N$ clients all fail simultaneously and loop instantly, they generate $N$ new requests before the server has processed any, compounding the overload. This is the *thundering herd* or *retry storm*.

Exponential backoff spaces retries geometrically:

$$t_n = t_0 \cdot 2^n$$

where $t_0$ is the base delay and $n \in \{0, 1, 2, \ldots\}$ is the attempt index. After $k$ failures, total time spent waiting is:

$$T_k = \sum_{n=0}^{k-1} t_0 \cdot 2^n = t_0 \cdot (2^k - 1)$$

This grows fast: with $t_0 = 1\,\text{ms}$ and 10 attempts, $T_{10} = 1023\,\text{ms}$, but attempt 9 alone waits $512\,\text{ms}$.

Cap the delay at $t_{\max}$ so retries continue at a bounded interval:

$$t_n = \min\!\left(t_{\max},\; t_0 \cdot 2^n\right)$$

**Jitter** adds a random offset to break synchronization among multiple clients. Full jitter replaces the deterministic delay with a uniform sample:

$$t_n = \text{Uniform}\!\left(0,\; \min(t_{\max},\, t_0 \cdot 2^n)\right)$$

This is the strategy recommended by the AWS Architecture Blog's "Exponential Backoff and Jitter" analysis, which showed full jitter minimizes contention under load better than decorrelated or equal jitter variants.

---

## How It Works

### Checking `errno` Correctly

```c
#include <errno.h>
#include <string.h>
#include <stdio.h>
#include <fcntl.h>

int fd = open("/nonexistent/path", O_RDONLY);
if (fd == -1) {
    int saved = errno;  // save immediately before any other call
    fprintf(stderr, "open: %s (errno=%d)\n", strerror(saved), saved);
    // errno == ENOENT (2): No such file or directory
}
```

Saving `errno` into a local variable before calling `fprintf` (which may itself issue `write()` syscalls) is not paranoia — it is required correctness. `strerror_r()` is the thread-safe variant if you're building the message in a multithreaded context:

```c
char errbuf[128];
strerror_r(saved, errbuf, sizeof errbuf);
```

### The Full-Write Pattern

```c
#include <errno.h>
#include <unistd.h>
#include <sys/types.h>

ssize_t write_all(int fd, const void *buf, size_t count) {
    const char *ptr = buf;
    size_t remaining = count;

    while (remaining > 0) {
        ssize_t n = write(fd, ptr, remaining);

        if (n == -1) {
            if (errno == EINTR)
                continue;       // signal interrupted: no bytes lost, retry
            return -1;          // EPIPE, EIO, EBADF: real failure
        }

        ptr       += n;         // advance pointer by bytes actually written
        remaining -= n;         // $remaining \leftarrow remaining - n$
    }
    return (ssize_t)count;
}
```

The pointer arithmetic `ptr += n` advances into the buffer by exactly the number of bytes the kernel consumed. Without this, you'd retransmit the beginning of the buffer on each partial write.

`EPIPE` deserves special mention: it arrives when the reader has closed its end of the pipe or socket. The kernel also delivers `SIGPIPE` to the process, which by default terminates it. To handle `EPIPE` programmatically, either install a `SIG_IGN` handler for `SIGPIPE` or use `send()` with `MSG_NOSIGNAL` on sockets.

### The Full-Read Pattern

```c
ssize_t read_all(int fd, void *buf, size_t count) {
    char *ptr = buf;
    size_t remaining = count;

    while (remaining > 0) {
        ssize_t n = read(fd, ptr, remaining);

        if (n == 0)
            break;              // EOF: peer closed; return bytes read so far

        if (n == -1) {
            if (errno == EINTR)
                continue;
            return -1;
        }

        ptr       += n;
        remaining -= n;
    }
    return (ssize_t)(count - remaining);
}
```

EOF (`n == 0`) is not an error. On a stream socket it means the remote peer called `close()` or `shutdown(SHUT_WR)`. On a file it means you've reached the end. The caller must inspect the return value to know how many bytes were actually delivered — it may be less than `count`.

### Exponential Backoff with Jitter in C

```c
#include <stdlib.h>
#include <unistd.h>
#include <time.h>

#define BASE_US       1000LL      // 1 ms
#define MAX_US        1000000LL   // 1 s
#define MAX_ATTEMPTS  10

/* Returns 0 on success, -1 after MAX_ATTEMPTS failures. */
int connect_with_backoff(int (*try_connect)(void)) {
    /* Seed once per program run, not per call */
    static int seeded = 0;
    if (!seeded) { srand((unsigned)time(NULL)); seeded = 1; }

    for (int n = 0; n < MAX_ATTEMPTS; n++) {
        if (try_connect() == 0)
            return 0;

        /* cap: t_n = min(
