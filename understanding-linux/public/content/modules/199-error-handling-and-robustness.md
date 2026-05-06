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

## Core Concepts
### Error Codes and `errno`
In Linux, every system call that can fail returns **‑1** on error and leaves the cause in the thread‑local variable `errno`. The variable is defined in `<errno.h>` (typically `/usr/include/errno.h` on glibc systems) and is implemented as `__thread int errno;`—each thread gets its own storage so that concurrent system calls do not interfere.  
A successful call **does not modify** `errno`; therefore checking it only after a ‑1 return is necessary and sufficient.

### Transient vs. Permanent Failures
Error codes fall into two classes:
* **Transient** (`EAGAIN`, `EWOULDBLOCK`, `EINTR`, `ECONNRESET`, `ETIMEDOUT`) – the operation may succeed if retried after a delay.  
* **Permanent** (`ENOENT`, `EACCES`, `EBADF`, `EFBIG`) – retrying will not change the outcome; the program must take alternative action or report the failure.

The distinction guides the choice of **retry‑and‑backoff** versus **partial‑failure handling**.

### Retry and Exponential Backoff
When a transient error is observed, a retry strategy limits the load placed on the resource while giving the system time to recover.  
Let:
* `b` = base delay (e.g., 100 ms)  
* `a` = attempt number (starting at 0)  
* `M` = maximum delay (e.g., 10 s)  

The deterministic exponential backoff delay is  
$$
d_a = \min(b \cdot 2^a,\, M)
$$
Adding **jitter** prevents synchronized retries across many clients. Full jitter chooses a delay uniformly from `[0, d_a]`. The expected delay after `a` attempts is `d_a/2`, and the expected total time until success (assuming success probability `p` per attempt) is bounded by  
$$
\mathbb{E}[T] \le \frac{1}{p}\sum_{i=0}^{\infty} \frac{d_i}{2}
$$
which converges because `d_i` is capped at `M`.

### Partial Failure Handling
A system can tolerate the loss of a subset of its components if it possesses **redundancy** or **degraded‑mode** operation. In networking, this means having multiple addresses, interfaces, or services to fall back to. The key property is **idempotency**: retrying the request on a different replica must not cause unintended side effects.

---

## How It Works
### 1. System‑call Error Reporting
```c
ssize_t ret = read(fd, buf, sizeof(buf));
if (ret == -1) {
    /* errno now holds the error code */
}
```
The kernel sets `errno` before returning ‑1. The value is copied from kernel thread‑local storage to user space via the `errno` location in the Thread Control Block (TCB). No extra syscall is needed; the C library provides the variable directly.

### 2. Error Classification
After a ‑1 return, the program inspects `errno`:
```c
if (errno == EINTR)          /* retry immediately */
    continue;
if (errno == EAGAIN)         /* transient, apply backoff */
    handle_transient();
else                         /* permanent */
    handle_permanent();
```
### 3. Retry Loop with Exponential Backoff and Full Jitter
```c
#include <time.h>
#include <unistd.h>
#include <stdlib.h>

#define BASE_MS   100
#define MAX_MS   10000
#define MAX_TRY   6

int operation_with_backoff(void (*op)(void))
{
    struct timespec ts;
    int attempt = 0;
    while (1) {
        op();                     /* try the operation */
        if (errno == 0) return 0; /* success */

        if (errno != EAGAIN && errno != EINTR && errno != EWOULDBLOCK)
            return -1;            /* permanent */

        if (++attempt >= MAX_TRY) return -1;

        /* deterministic backoff */
        unsigned int delay_ms = BASE_MS << attempt;   /* 2^attempt * BASE */
        if (delay_ms > MAX_MS) delay_ms = MAX_MS;

        /* full jitter: uniform [0, delay_ms] */
        unsigned int jitter = rand() % (delay_ms + 1);
        ts.tv_sec  = jitter / 1000;
        ts.tv_nsec = (jitter % 1000) * 1000000;
        nanosleep(&ts, NULL);
    }
}
```
**Derivation of jitter range:**  
Full jitter selects `U ~ Uniform(0, d_a)`. The expected value is `E[U] = d_a/2`. This reduces the variance of retry bursts compared to deterministic backoff while preserving the exponential upper bound.

### 4. Partial Failure Handling Example (Network)
A client maintains an ordered list of server addresses. On connection failure it:
1. Marks the failed address as **down** for a cool‑down period (`timeout = base * 2^{fail_count}`).
2. Selects the next address with the smallest timeout.
3. If all addresses are down, it enters a degraded mode (e.g., serves cached data) and periodically probes addresses.

This strategy mirrors Linux bonding (`mode=active-backup`) and DNS round‑robin with health checks.

---

## Worked Examples
### Example 1: Reporting `errno` with `perror` and `strerror`
```c
#define _POSIX_C_SOURCE 200809L
#include <fcntl.h>
#include <errno.h>
#include <string.h>
#include <unistd.h>
#include <stdio.h>

int main(void)
{
    int fd = open("nonexistent.txt", O_RDONLY);
    if (fd == -1) {
        /* perror uses the current errno and prints a standard message */
        perror("open");                     /* → open: No such file or directory */
        /* strerror gives the message as a string for custom formatting */
        fprintf(stderr, "Custom: open failed: %s\n", strerror(errno));
        return 1;
    }
    close(fd);
    return 0;
}
```
**Step‑by‑step:**
1. `open` returns ‑1 because the file does not exist → kernel sets `errno = ENOENT (2)`.
2. `perror("open")` writes `"open: No such file or directory\n"` to stderr.
3. `strerror(errno)` returns the pointer to the constant string `"No such file or directory"`.
4. The program exits with status 1.

### Example 2: Bounded Exponential Backoff with Full Jitter (Connection)
```c
#define _POSIX_C_SOURCE 200809L
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <time.h>
#include <stdio.h>

#define BASE_MS   200
#define MAX_MS    5000
#define MAX_TRY   8

int connect_with_backoff(const char *ip, uint16_t port)
{
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return -1;

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port   = htons(port),
        .sin_addr   = { .s_addr = inet_addr(ip) }
    };

    srand(time(NULL));   /* seed for jitter */

    for (int attempt = 0; attempt < MAX_TRY; ++attempt) {
        if (connect(sock, (struct sockaddr *)&addr, sizeof(addr)) == 0)
            return sock;   /* success */

        if (errno != EINPROGRESS && errno != EAGAIN &&
            errno != EWOULDBLOCK && errno != EINTR) {
            close(sock);
            return -1;     /* permanent */
        }

        /* compute backoff with full jitter */
        unsigned int delay_ms = BASE_MS << attempt;   /* 2^attempt * BASE */
        if (delay_ms > MAX_MS) delay_ms = MAX_MS;
        unsigned int jitter = rand() % (delay_ms + 1);

        struct timespec ts = {
            .tv_sec  = jitter / 1000,
            .tv_nsec = (jitter % 1000) * 1000000
        };
        nanosleep(&ts, NULL);
    }

    close(sock);
    return -1;   /* exhausted retries */
}
```
**Explanation:**
* After each failed `connect`, we check for transient codes (`EINPROGRESS`, `EAGAIN`, `EWOULDBLOCK`, `EINTR`).  
* The delay doubles each attempt, capped at `MAX_MS`.  
* Full jitter selects a uniform random delay in `[0, delay_ms]`, preventing thundering herd.  
* The loop terminates after `MAX_TRY` attempts or on success.

### Example 3: Partial Failure Handling via Redundant Network Interfaces
```c
#define _POSIX_C_SOURCE 200809L
#include <ifaddrs.h>
#include <net/if.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

/* Returns a usable socket bound to the first interface that is up */
int socket_on_available_interface(uint16_t port)
{
    struct ifaddrs *ifap, *ifa;
    if (getifaddrs(&ifap) == -1) {
        perror("getifaddrs");
        return -1;
    }

    for (ifa = ifap; ifa != NULL; ifa = ifa->ifa_next) {
        if (!(ifa->ifa_flags & IFF_UP) || !(ifa->ifa_flags & IFF_RUNNING))
            continue;                     /* skip down/dormant interfaces */
        if (ifa->ifa_addr == NULL || ifa->ifa_addr->sa_family != AF_INET)
            continue;                     /* we only handle IPv4 for brevity */

        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) {
            perror("socket");
            continue;
        }

        struct sockaddr_in addr = {
            .sin_family = AF_INET,
            .sin_port   = htons(port),
            .sin_addr   = { .s_addr =
                ((struct sockaddr_in *)ifa->ifa_addr)->sin_addr.s_addr }
        };
        if (bind(sock, (struct sockaddr *)&addr, sizeof(addr)) == 0) {
            freeifaddrs(ifap);
            return sock;   /* success */
        }
        /* bind failed – maybe address already in use; try next interface */
        close(sock);
    }

    freeifaddrs(ifap);
    return -1;   /* no usable interface */
}
```
**Why this works:**  
* `getifaddrs` enumerates all network interfaces; each has flags (`IFF_UP`, `IFF_RUNNING`).  
* Binding to an interface’s IP address ensures the socket will only receive packets arriving via that NIC.  
* If one NIC fails (link down, address conflict), the loop proceeds to the next available one, providing **partial‑failure tolerance** without stopping the program.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Checking `errno` after a successful call** | `errno` retains the value from the previous error; a successful call does **not** reset it. | Leads to false diagnostics and masks real bugs. |
| **Assuming `errno` is global** | In multi‑threaded programs each thread has its own `errno`. Accessing another thread’s `errno` yields stale or unrelated data. | Causes race‑condition‑like symptoms; debugging becomes extremely hard. |
| **Retrying on `EINTR` without checking if the syscall made progress** | Some syscalls (e.g., `read`) may return partial data before being interrupted; ignoring the byte count loses data. | Results in corrupted buffers or premature EOF. |
| **Using `sleep()` instead of `nanosleep()` or `usleep()` for sub‑second delays** | `sleep()` has a resolution of whole seconds and may be interrupted by signals, leaving the process waiting longer than intended. | Degrades responsiveness and makes backoff timing unpredictable. |
| **Unbounded exponential backoff (no cap)** | Delay grows as `2^attempt`; with many retries it can overflow an unsigned integer or exceed realistic limits. | Causes integer overflow, extremely long stalls, or denial‑of‑service to the program itself. |
| **Neglecting to mark a failed address as down during partial failure handling** | The client keeps trying the same dead address, wasting time and possibly causing connection storms. | Increases recovery time and may overload the failed component or network path. |
| **Ignoring `EAGAIN` on non‑blocking sockets** | Treating `EAGAIN` as fatal prevents the program from leveraging asynchronous I/O or event loops. | Reduces scalability and forces unnecessary blocking or busy‑waiting. |

---

## Exercises
### Easy
1. **Error‑message printer** – Write a C program that calls `open()` on a user‑supplied pathname, checks the return value, and prints the error using both `perror()` and `strerror(errno)`. Compile with `gcc -Wall -Wextra -o errmsg errmsg.c`.

### Medium
2. **Bounded retry with jitter** – Implement a function `int retry_connect(const char *host, uint16_t port, int max_tries)` that attempts a TCP connect, uses full‑jitter exponential backoff (base = 50 ms, max = 2 s), and returns the socket on success or ‑1 on exhaustion. Test against a netcat listener that you start and stop to simulate transient failures.  
   *Hint:* Use `getaddrinfo()` to resolve the host, and set the socket to non‑blocking (`O_NONBLOCK`) to distinguish `EINPROGRESS`.

### Hard
3. **Partial‑failure tolerant client** – Design a client that maintains a list of three server addresses (IPv4). On each request it:
   * Tries the first address; on connection failure (`ECONNREFUSED`, `ETIMEDOUT`, `ENETUNREACH`) it marks that address as down for a cool‑down period (`base * 2^{fail_count}` seconds, capped at 30 s).  
   * Selects the next address with the smallest cool‑down remaining.  
   * If all addresses are down, it serves a cached response or returns an error.  
   * Periodically (every 10 s) re‑probes down addresses.  
   Implement this in C, using `select()` or `poll()` for timeouts, and demonstrate it with three netcat servers on different ports, taking one or two offline during a run.

---

## Linux Connection
### Header and Helper Functions
* **Header:** `<errno.h>` – typically `/usr/include/errno.h` on glibc.  
  ```bash
  $ ls -l /usr/include/errno.h
  lrwxrwxrwx 1 root root 19 Sep 10  2022 /usr/include/errno.h -> x86_64-linux-gnu/errno.h
  $ head -5 /usr/include/errno.h
  #define errno (*__errno_location())
  ```
* **`perror`:** Prints `"prefix: {strerror(errno)}\n"` to stderr.  
* **`strerror`:** Returns a pointer to a static string describing the error code. Thread‑safe variant: `strerror_r`.  

### System Calls that Set `errno`
| Call | Typical transient errors | Typical permanent errors |
|------|--------------------------|--------------------------|
| `open(2)` | `EINTR`, `EAGAIN` (on O_NONBLOCK) | `ENOENT`, `EACCES`, `EISDIR` |
| `read(2)` / `write(2)` | `EINTR`, `EAGAIN` (non‑blocking) | `EBADF`, `EFAULT` |
| `connect(2)` | `EINPROGRESS`, `EAGAIN`, `EINTR`, `ETIMEDOUT` | `ECONNREFUSED`, `ENETUNREACH`, `EADDRNOTAVAIL` |
| `accept(2)` | `EINTR`, `EAGAIN` (non‑blocking) | `EBADF`, `ENOTSOCK` |
| `socket(2)` | `EINTR`, `EAGAIN` (resource limits) | `EAFNOSUPPORT`, `EPROTONOSUPPORT` |

### Observing Errors with `strace`
```bash
$ strace -e trace=open,read,write ./myprog 2>&1 | grep -E '= -1'
open("missing.txt", O_RDONLY) = -1 ENOENT (No such file or directory)
read(3, 0x7fffd... , 4096) = -1 EAGAIN (Resource temporarily unavailable)
```
`strace` shows the syscall name, return value, and the decoded `errno` symbol.

### Manipulating `errno` in Shell (via C snippet)
```bash
$ gcc -xc - <<'EOF' -o chkerr
#include <stdio.h>
#include <errno.h>
int main(){ errno = EACCES; printf("%d %s\n", errno, strerror(errno)); }
EOF
$ ./chkerr
13 Permission denied
```

### Real‑world Subsystem Example: **Network Bonding**
Linux bonding driver (`bonding`) provides active‑backup mode, which implements partial‑failure handling at the NIC layer:
```bash
# Show bonding module parameters
$ modinfo bonding | grep -i mode
parm:           mode:Mode of bonding; 0 for balance-rr, 1 for active-backup, 2 for balance-xor, ...
# Configure active-backup (failover)
$ sudo modprobe bonding mode=1 miimon=100
$ sudo ifenslave bond0 eth0 eth1
```
If `eth0` loses carrier (`IFF_RUNNING` cleared), the driver automatically switches traffic to `eth1` without application changes—exactly the redundancy principle discussed.

---

## Why This Matters
Robust error handling transforms a program from a fragile script into a **service** that can survive the inevitable imperfections of hardware, networks, and load. By mastering `errno` you gain a precise, portable signal from the kernel about *why* a syscall failed, enabling you to distinguish a fleeting glitch from a fatal condition. Exponential backoff with jitter turns a thundering‑herd retry storm into a controlled, exponentially‑slowing probe that respects both the client’s patience and the server’s recovery time. Partial‑failure handling—whether implemented in application logic, via Linux bonding, or through replicated services—ensures that the loss of any single component does not cascade into total outage.

These techniques are not academic; they appear in production code everywhere: web servers retrying backend connections with backoff, databases using quorum writes and read‑repair, container orchestrators probing health endpoints, and the kernel itself employing link‑carrier detection and failover. Understanding the *why* behind each mechanism lets you adapt them to new contexts, tune parameters correctly, and avoid the subtle bugs that cause intermittent failures in large‑scale systems. This knowledge is the foundation for building Linux software that is **observable, predictable, and resilient**—the hallmark of true systems engineering.
