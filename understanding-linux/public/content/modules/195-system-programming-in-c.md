---
id: 195
title: "System programming in C"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Processes
A process is the OS abstraction of an executing program. It consists of:
* **Memory layout** – text (code), data, heap, stack, and guarded regions.  
* **Kernel resources** – a `task_struct` (Linux) containing PID, parent/child pointers, file descriptor table, signal handlers, scheduling info, and credentials.  
* **Address space** – isolated via page tables; each process has its own CR3 (x86‑64) or PTBR (ARM).  

**Why fork() works** – When `fork()` is invoked, the kernel creates a new `task_struct` and duplicates the parent’s page tables **copy‑on‑write (COW)**. No physical memory is copied until a page is written. The cost is therefore proportional to the number of dirty pages:
$$
T_{fork} \approx C_{struct} + \sum_{p\in\text{pages}} \big[ \text{dirty}(p) \cdot (C_{copy}+C_{map}) \big]
$$
where `C_struct` is the allocation of the new task struct, and `C_copy`/`C_map` are the costs of copying a page and inserting it into the child’s page table.

### Files
A file is a sequence of bytes managed by the Virtual File System (VFS). Opening a file returns a **file descriptor (fd)**, an index into the per‑process fd table that points to a `struct file` representing:
* **file operations** (`read`, `write`, `llseek`, …)  
* **inode** – metadata (size, permissions, timestamps)  
* **offset** – current file position  

**Why open() returns an fd** – The fd is a small integer (typically 0‑1023) because the kernel stores the fd table as a simple array; lookup is O(1). The actual kernel object (`struct file`) lives in kernel memory, providing isolation: a process cannot forge an fd to access another’s resources without privileged system calls.

### Signals
A signal is a **software interrupt** delivering asynchronous notification. The kernel maintains for each thread:
* **signal mask** (`sigset_t blocked`) – signals currently blocked from delivery.  
* **pending set** (`sigset_t pending`) – signals that have been generated but not yet delivered.  

Delivery occurs when:
1. A signal is generated (by kernel, another process via `kill()`, or self‑raise).  
2. The signal is not blocked (`(pending & ~blocked) != 0`).  
3. The kernel selects a target thread, clears the bit from `pending`, and invokes the handler (or default action).

**Why sigaction() is preferred over signal()** – `signal()` has unspecified behavior regarding automatic resetting of the handler and restarting of interrupted system calls across implementations. `sigaction()` lets you specify:
```c
struct sigaction sa = {
    .sa_handler = handler,
    .sa_flags   = SA_RESTART,   // restart interrupted syscalls
    .sa_mask    = 0             // no extra blocked signals during handler
};
sigaction(SIGINT, &sa, NULL);
```
Thus you control restart semantics and avoid race conditions where a second signal arrives before the handler reinstates the mask.

### Pipes
A pipe is a **kernel‑managed circular buffer** (typically 64 KiB) with two ends: read‑end and write‑end. Each end is represented by a file descriptor referring to the same `struct pipe_inode_info`.  
* **Write** copies data from user space into the buffer; if full, the writer blocks (or returns `EAGAIN` if `O_NONBLOCK`).  
* **Read** copies data out; if empty, the reader blocks (or returns `EAGAIN`).  

**Why pipes are unidirectional** – The VFS layer treats each end as a separate `struct file` with distinct `f_op->read`/`write` pointers; the underlying buffer enforces FIFO ordering, but there is no mechanism to write to the read‑end or read from the write‑end without breaking the contract.

### Sockets
A socket is an endpoint for communication, represented by a `struct socket` that points to a `struct sock` in the protocol‑specific layer (TCP, UDP, UNIX domain). The socket API is layered:
1. **BSD socket interface** (`socket()`, `bind()`, `listen()`, `accept()`, `connect()`, `send()`, `recv()`).  
2. **Protocol families** (AF_INET, AF_INET6, AF_UNIX, AF_NETLINK, …).  
3. **Network stack** – IP, TCP/UDP, or UNIX domain protocols.

**Why socket() returns a fd** – Like files, sockets are accessed via the VFS; the fd table indexes a `struct file` whose `f_op` points to socket‑specific operations (`sock_sendmsg`, `sock_recvmsg`, etc.). This uniform descriptor model enables `select()`, `poll()`, and `epoll()` to wait on both files and sockets interchangeably.

### Epoll
Epoll provides **O(1)** event notification for many fds, unlike `select()`/`poll()` which are O(n). Core data structures:
* **epoll file descriptor** – created by `epoll_create1()`.  
* **red‑black tree** (`struct rb_root`) storing all registered fds (key = fd).  
* **ready list** (`struct list_head`) holding fds that have become ready since the last `epoll_wait()`.

**Why epoll_wait() is O(1)** – Upon an event (e.g., data arrival), the kernel marks the corresponding `struct epitem` as ready and inserts it into the ready list. `epoll_wait()` merely copies up to `maxevents` entries from this list to user space; the cost does not grow with the number of registered fds.

### Threads
A thread is a **lightweight process** sharing the same memory descriptor (`mm_struct`) but having its own:
* **Thread ID** (`tid`) – unique within the thread group.  
* **Kernel stack** – typically 8 KiB (x86‑64) or 4 KiB (ARM).  
* **Register set** – saved/restored on context switch.  
* **Signal disposition** – can be per‑thread (via `pthread_sigmask`) or shared.

**Why pthread_create() is cheaper than fork()** – No new `mm_struct` is allocated; the kernel merely duplicates the scheduler entities (`task_struct`) and allocates a new stack. Memory overhead is roughly the size of the stack plus a few KB for the task struct:
$$
\Delta M_{thread} \approx \text{stacksize} + \sizeof(struct task_struct)
$$
versus fork() which may duplicate megabytes of COW pages.

---

## How It Works
### fork() and exec()
1. **fork()** – kernel:
   * Allocates a new `task_struct` (`dup_task_struct()`).  
   * Copies the parent’s page table entries marking them **read‑only** (COW).  
   * Sets child’s `tid` distinct from parent’s PID, increments `ptrace` counters, resets statistics.  
   * Returns child PID to parent, 0 to child.  
2. **execve()** – replaces the current process image:
   * Unmaps existing memory regions (`exit_mmap()`).  
   * Loads new ELF executable via `load_elf_binary()`: allocates new `vm_area_struct`s for text, data, heap, stack.  
   * Sets `rip`/`eip` to entry point, initializes registers, clears signal handlers (except those set `SA_ONSTACK`).  
   * Returns never (on success) or -1 on error.

### pipe()
* `int pipe(int pipefd[2])`:
  1. Allocates a `struct pipe_inode_info` with a circular buffer (`PAGE_SIZE * PIPE_BUF`).  
  2. Creates two `struct file` instances: one with `f_mode = FMODE_READ`, the other `FMODE_WRITE`.  
  3. Installs them into the caller’s fd table at `pipefd[0]` and `pipefd[1]`.  
  4. Returns 0 on success.

### socket()
* `int socket(int domain, int type, int protocol)`:
  1. Looks up `net_proto_family` for `domain` (e.g., `inet_family_ops` for AF_INET).  
  2. Calls the family’s `create()` method, which allocates a `struct sock` and binds it to a `struct socket`.  
  3. Wraps the socket in a `struct file` with socket‑specific `file_operations`.  
  4. Inserts the file into the fd table and returns the index.

### connect()
* For a stream socket (SOCK_STREAM):
  1. Builds a `struct sockaddr` (AF_INET → `struct sockaddr_in`).  
  2. Calls `__sys_connect()` which:
     * Checks socket state (`SS_UNCONNECTED`).  
     * Resolves destination address (ARP/route lookup).  
     * Sends a SYN segment, enters `SYN_SENT` state.  
     * Blocks (or returns `EINPROGRESS` if `O_NONBLOCK`) until SYN‑ACK received or timeout.

### epoll_create1() / epoll_ctl() / epoll_wait()
* **epoll_create1(int flags)**:
  * Allocates an `eventpoll` structure (`struct eventpoll`) containing the rb‑tree and ready list, returns its fd.  
* **epoll_ctl(int epfd, int op, int fd, struct epoll_event *ev)**:
  * `op = EPOLL_CTL_ADD`: inserts `fd` into the rb‑tree with key `fd`, stores user data (`ev->data.ptr` or `ev->data.u64`).  
  * `op = EPOLL_CTL_MOD`: updates the event mask in the tree node.  
  * `op = EPOLL_CTL_DEL`: removes the node.  
* **epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout)**:
  * If ready list non‑empty, copies up to `maxevents` entries to `events`.  
  * Else, waits on the `epoll` wait queue (via `wait_event_interruptible_timeout()`) until either an event arrives or timeout expires.

### pthread_create()
* `int pthread_create(pthread_t *thread, const pthread_attr_t *attr,
                      void *(*start_routine)(void *), void *arg)`:
  1. Allocates kernel stack (`alloc_thread_stack_node()`).  
  2. Duplicates the calling thread’s `task_struct` via `clone()` with flags `CLONE_VM | CLONE_FS | CLONE_FILES | CLONE_SIGHAND | CLONE_THREAD | CLONE_SYSVSEM | CLONE_SETTLS | CLONE_PARENT_SETTID | CLONE_CHILD_CLEARTID`.  
  3. Sets child’s `thread_info` and `tsk->thread.sp0` to the new stack top.  
  4. Places the start routine and argument onto the child’s stack as per the ABI (so the first instruction executes `start_routine(arg)`).  
  5. Returns the new thread’s TID in `*thread`; the child runs concurrently.

---

## Worked Examples
### Example 1: Pipe with Parent‑Child Communication (showing fd numbers)
```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <sys/wait.h>

int main(void) {
    int pipefd[2];               // pipefd[0] = read, pipefd[1] = write
    if (pipe(pipefd) == -1) {
        perror("pipe");
        exit(EXIT_FAILURE);
    }
    printf("[parent] pipe fds: %d (read), %d (write)\n", pipefd[0], pipefd[1]);

    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        exit(EXIT_FAILURE);
    }

    if (pid == 0) {              // child
        close(pipefd[0]);        // close unused read end
        const char *msg = "Hello from child (PID ";
        char buf[64];
        snprintf(buf, sizeof(buf), "%s%d)\\n", msg, getpid());
        size_t len = strlen(buf);
        ssize_t w = write(pipefd[1], buf, len);
        if (w != (ssize_t)len) {
            perror("write");
            _exit(EXIT_FAILURE);
        }
        close(pipefd[1]);        // EOF for reader
        _exit(EXIT_SUCCESS);
    } else {                     // parent
        close(pipefd[1]);        // close unused write end
        char rb[128];
        ssize_t r = read(pipefd[0], rb, sizeof(rb)-1);
        if (r == -1) {
            perror("read");
            exit(EXIT_FAILURE);
        }
        rb[r] = '\0';
        printf("[parent] received: %s", rb);
        int status;
        waitpid(pid, &status, 0); // reap zombie
        close(pipefd[0]);
        return 0;
    }
}
```
**Step‑by‑step reasoning**
1. `pipe()` allocates a kernel pipe buffer (64 KiB) and returns two fds; suppose the kernel assigns `pipefd[0]=3`, `pipefd[1]=4` (stdin/stdout/stderr are 0‑2).  
2. `fork()` duplicates the fd table; child inherits fds 3 and 4 pointing to the same pipe buffer.  
3. Child closes fd 3 (read end) because it only writes. It writes a formatted string containing its PID (e.g., if child PID = 5421, the message is `"Hello from child (PID 5421)\\n"`).  
4. `write()` copies up to `PIPE_BUF` bytes atomically; here length ≈ 24 < 4096, so the write succeeds instantly and returns 24.  
5. Child closes fd 4, signaling EOF.  
6. Parent, having closed fd 4, reads from fd 3; `read()` blocks until data arrives, then copies 24 bytes into `rb`, NUL‑terminates, and prints.  
7. Parent calls `waitpid()` to reap the child, preventing a zombie.

### Example 2: TCP Client Socket with Non‑Blocking Connect and epoll
```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/epoll.h>

int main(void) {
    /* 1. Create non‑blocking TCP socket */
    int sockfd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0);
    if (sockfd < 0) { perror("socket"); exit(EXIT_FAILURE); }

    /* 2. Prepare server address */
    struct sockaddr_in serv = {
        .sin_family = AF_INET,
        .sin_port   = htons(8080),
    };
    if (inet_pton(AF_INET, "127.0.0.1", &serv.sin_addr) <= 0) {
        perror("inet_pton"); close(sockfd); exit(EXIT_FAILURE);
    }

    /* 3. Initiate connect (may return -EINPROGRESS) */
    if (connect(sockfd, (struct sockaddr *)&serv, sizeof(serv)) < 0) {
        if (errno != EINPROGRESS) {
            perror("connect"); close(sockfd); exit(EXIT_FAILURE);
        }
        /* Connection in progress; we'll wait for writability */
    }

    /* 4. Set up epoll to wait for socket becoming writable */
    int efd = epoll_create1(0);
    if (efd < 0) { perror("epoll_create1"); close(sockfd); exit(EXIT_FAILURE); }

    struct epoll_event ev = {
        .events = EPOLLOUT,          // wait for write‑ability
        .data   = { .fd = sockfd }
    };
    if (epoll_ctl(efd, EPOLL_CTL_ADD, sockfd, &ev) < 0) {
        perror("epoll_ctl"); close(efd); close(sockfd); exit(EXIT_FAILURE);
    }

    /* 5. Wait up to 5 s for socket to be ready */
    struct epoll_event out;
    int n = epoll_wait(efd, &out, 1, 5000);
    if (n <= 0) {
        fprintf(stderr, "connect timeout or error\n");
        close(efd); close(sockfd); exit(EXIT_FAILURE);
    }

    /* 6. Verify connection succeeded */
    int err = 0;
    socklen_t len = sizeof(err);
    if (getsockopt(sockfd, SOL_SOCKET, SO_ERROR, &err, &len) < 0) {
        perror("getsockopt"); close(efd); close(sockfd); exit(EXIT_FAILURE);
    }
    if (err != 0) {
        errno = err; perror("connect"); close(efd); close(sockfd); exit(EXIT_FAILURE);
    }
    puts("Connected to 127.0.0.1:8080");

    /* 7. Clean up */
    close(efd);
    close(sockfd);
    return 0;
}
```
**Explanation of numbers**
* The socket call typically yields the next free fd, e.g., `sockfd=3`.  
* `SOCK_NONBLOCK` sets `O_NONBLOCK` flag on the underlying file description; after `connect()`, the socket returns `-1` with `errno = EINPROGRESS` because the TCP three‑way handshake is asynchronous.  
* `epoll_create1()` might return `efd=4`.  
* The epoll wait queue holds a single entry; when the SYN‑ACK arrives, the kernel marks the socket writable, places it in the ready list, and `epoll_wait()` returns `n=1`.  
* `getsockopt(SO_ERROR)` retrieves the stored error code from the handshake; a value of `0` means success.

### Example 3: Thread Pool with Mutex‑Protected Work Queue (using futex via pthread)
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <stdatomic.h>
#include <unistd.h>

typedef struct job {
    void (*func)(void *);
    void *arg;
    struct job *next;
} job_t;

static pthread_mutex_t qlock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t  qnot_empty = PTHREAD_COND_INITIALIZER;
static atomic_int      npending = ATOMIC_VAR_INIT(0);
static job_t          *head = NULL, *tail = NULL;
static int             shutdown = 0;

static void *worker(void *arg) {
    (void)arg;
    for (;;) {
        pthread_mutex_lock(&qlock);
        while (!head && !shutdown) {
            pthread_cond_wait(&qnot_empty, &qlock);
        }
        if (shutdown && !head) {
            pthread_mutex_unlock(&qlock);
            break;
        }
        job_t *job = head;
        head = job->next;
        if (!head) tail = NULL;
        pthread_mutex_unlock(&qlock);

        atomic_fetch_sub(&npending, 1);
        job->func(job->arg);
        free(job);
    }
    return NULL;
}

int tpool_enqueue(void (*f)(void *), void *a) {
    job_t *job = malloc(sizeof *job);
    if (!job) return -1;
    job->func = f;
    job->arg  = a;
    job->next = NULL;

    pthread_mutex_lock(&qlock);
    if (tail) tail->next = job;
    else      head = job;
    tail = job;
    atomic_fetch_add(&npending, 1);
    pthread_cond_signal(&qnot_empty);
    pthread_mutex_unlock(&qlock);
    return 0;
}

void tpool_shutdown(void) {
    pthread_mutex_lock(&qlock);
    shutdown = 1;
    pthread_cond_broadcast(&qnot_empty);
    pthread_mutex_unlock(&qlock);
}

/* Example job: prints a number after a short nap */
void print_num(void *v) {
    int n = *(int *)v;
    usleep(1000);          // 1 ms
    printf("%d ", n);
    fflush(stdout);
}

int main(void) {
    const int nthreads = 4;
    pthread_t th[nthreads];
    for (int i = 0; i < nthreads; ++i)
        pthread_create(&th[i], NULL, worker, NULL);

    int values[20];
    for (int i = 0; i < 20; ++i) {
        values[i] = i+1;
        tpool_enqueue(print_num, &values[i]);
    }

    /* wait for all jobs */
    while (atomic_load(&npending) > 0) {
        usleep(100);
    }
    tpool_shutdown();
    for (int i = 0; i < nthreads; ++i)
        pthread_join(th[i], NULL);
    putchar('\n');
    return 0;
}
```
**Key points**
* The work queue is protected by a **PTHREAD_MUTEX_INITIALIZER** (fast futex‑based lock).  
* `pthread_cond_wait()` atomically releases the mutex and sleeps on a futex; wake‑up via `pthread_cond_signal()` reacquires the mutex before returning.  
* `atomic_int npending` lets the main thread detect completion without extra locking.  
* The worker loop checks `shutdown` under the mutex to avoid missed signals.

---

## Common Mistakes
| # | Mistake | Why it’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Assuming `read()`/`write()` transfer the full count** | These calls may return fewer bytes than requested (e.g., due to signals, non‑blocking mode, or kernel buffer limits). Ignoring the return value leads to truncated data or infinite loops. | Loop until the requested number of bytes is processed: `while (n > 0) { ssize_t r = read(fd, buf, n); if (r <= 0) handle_error(); buf += r; n -= r; }` |
| 2 | **Using `signal()` instead of `sigaction()`** | `signal()` has implementation‑defined semantics regarding automatic handler reset and restart of interrupted syscalls; race conditions can arise when a second signal arrives before the handler is reinstated. | Use `sigaction()` with explicit flags
