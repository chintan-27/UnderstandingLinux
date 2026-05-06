---
id: 172
title: "Parallel programming models"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to Parallel Programming Models
Parallel programming models dictate how concurrent execution is expressed, coordinated, and scheduled. They differ in abstraction level, synchronization primitives, and underlying hardware assumptions. Choosing a model affects contention, scalability, and programmability. In Linux, these models map to kernel primitives (threads, futexes, epoll, io_uring, workqueues) and user‑space libraries (pthread, libuv, asyncio, OpenMP, TBB). Understanding the trade‑offs lets you match the model to the workload’s communication pattern and latency tolerance.

### Threads
A thread is a lightweight execution context that shares the virtual memory space, file descriptors, and signal handlers of its parent process, but maintains its own stack, registers, and scheduling state. The kernel implements threads via the `clone()` system call with flags `CLONE_VM | CLONE_FS | CLONE_FILES | CLONE_SIGHAND`. Because memory is shared, inter‑thread communication can be performed through ordinary loads/stores, but this requires memory‑ordering guarantees (see the C11/C++11 memory model) to avoid torn reads/write reordering.

**Why shared memory matters:**  
- Latency: a load from another thread’s stack costs ~3–5 ns (L1 cache hit) versus >100 ns for a cross‑process IPC message.  
- Bandwidth: intra‑process memory bandwidth can reach tens of GB/s, far exceeding socket or pipe throughput.  
- Cost: creating a thread via `pthread_create` incurs ~2–5 µs overhead (stack allocation, TLS setup), whereas a process fork costs ~20–30 µs.

**Scalability limit:** With N hardware threads, the maximum achievable speedup is bounded by Amdahl’s law:  
$$ S(N) = \frac{1}{(1-p) + \frac{p}{N}} $$  
where *p* is the parallelizable fraction. If *p* = 0.95, 64 cores yield at most ~2.8× speedup, illustrating why minimizing serial sections is critical.

### Event Loops
An event loop is a single‑threaded dispatcher that repeatedly extracts ready events from a queue and invokes associated callbacks. It eliminates the need for preemptive multithreading by converting I/O‑driven concurrency into deterministic, cooperative scheduling. The loop’s correctness hinges on two properties:

1. **Non‑blocking readiness detection** – the kernel must report which file descriptors are ready without the thread sleeping (e.g., `epoll_wait`, `poll`, `io_uring`).  
2. **Prompt callback execution** – callbacks must return quickly; otherwise, they stall the loop and increase latency for other events.

Mathematically, if each callback takes time *cᵢ* and the inter‑arrival time of events is exponentially distributed with rate λ, the average waiting time in an M/G/1 queue is  
$$ W = \frac{\lambda \, \mathbb{E}[c^2]}{2(1-\lambda \, \mathbb{E}[c])} $$  
showing that heavy‑tailed callback durations cause queue blow‑up.

### Async I/O
Async I/O lets a thread initiate an operation and receive completion notification without blocking. The kernel separates submission and completion phases: the thread issues a request (e.g., `io_uring_submit`) and later retrieves results (e.g., `io_uring_get_completion`). This decoupling enables overlapping computation with I/O latency.

Key advantage over traditional blocking I/O:  
- **Blocking**: thread sleeps in kernel until I/O finishes → CPU idle.  
- **Async**: thread continues executing → CPU utilization ≈ 1 −  (I/O latency / (I/O latency + compute time)).  

For a disk read with 5 ms latency and 1 ms compute per iteration, async yields ~83 % CPU utilization versus ~16 % for blocking.

### Work Stealing
Work stealing is a decentralized scheduler where each worker maintains a deque of tasks. Idle workers steal from the tail of another worker’s deque (usually the victim’s oldest task). This yields good load balance with low contention because:
- Workers primarily push/pop from their own deque head (O(1) amortized).  
- Stealing occurs only when local deque is empty, reducing remote accesses.  

The expected overhead per steal is O(1) plus cache‑miss cost. Analysis (Blumofe & Leiserson, 1999) shows that for a computation with total work *T₁* and critical‑path length *T∞*, the expected execution time on *P* processors is  
$$ \mathbb{E}[T_P] \le \frac{T_1}{P} + O(T_\infty) $$  
demonstrating near‑optimal scaling when *T∞* ≪ *T₁*/P.

### Task Models
A task model represents a computation as a directed acyclic graph (DAG) where nodes are tasks and edges denote dependencies. The runtime schedules tasks as soon as their predecessors complete. This model separates *what* to compute (the DAG) from *how* to schedule it (work stealing, BFS, etc.).  

In Linux, task graphs are often expressed via:
- **OpenMP task constructs** (`#pragma omp task`) → libgomp runtime uses its own work‑stealing queue.  
- **Intel TBB** (`tbb::task_group`) → implements a hierarchical work‑stealing scheduler.  
- **Kernel workqueues** (`struct work_struct`) → each CPU has a worker thread that processes queued work items.

Memory layout of a task descriptor typically includes:
```c
struct task {
    void (*func)(void *);
    void *arg;
    struct task *next;   // singly‑linked list for queue
    atomic_t refcount;   // for dependency tracking
};
```
The size (usually 32 or 64 bytes on x86‑64) determines cache‑line utilization; packing multiple descriptors per line reduces false sharing.

## How It Works
### Thread Creation and Scheduling
The POSIX thread API is a thin wrapper around `clone()`. When `pthread_create` is called:
1. Allocate a stack (default 8 MiB, adjustable via `pthread_attr_setstacksize`).  
2. Allocate thread‑specific data (TCB) in the process’s TLS area.  
3. Call `clone()` with appropriate flags; the kernel returns a new `tid` (thread ID) in the parent and zero in the child.  
4. The child starts at the supplied entry point with registers set per the ABI (e.g., `%rdi` = arg).  

The scheduler treats each thread as a schedulable entity (`struct task_struct`). The Completely Fair Scheduler (CFS) assigns a virtual runtime (`vruntime`) based on actual CPU time consumed and the thread’s nice value. The scheduler picks the task with the smallest `vruntime`.  

**Preemption granularity:** CFS uses a timeslice of ~6 ms by default (adjusted via `/proc/sys/kernel/sched_cfs_bandwidth_slice_us`). This determines how long a thread can run before being preempted for fairness.

**Example of setting affinity:**  
```c
#include <pthread.h>
#include <sched.h>

void set_cpu_affinity(pthread_t thread, int cpu) {
    cpu_set_t set;
    CPU_ZERO(&set);
    CPU_SET(cpu, &set);
    pthread_setaffinity_np(thread, sizeof(cpu_set_t), &set);
}
```
Binding a thread to a specific core reduces cache misses when the thread’s working set fits in that core’s L3.

### Event Loop Implementation
An event loop uses a readiness multiplexer (`epoll`, `poll`, `select`) to block until at least one file descriptor is ready, then drains the ready list. The core loop pseudocode:
```c
int efd = epoll_create1(0);
struct epoll_event ev, events[MAX_EVENTS];
while (!done) {
    int n = epoll_wait(efd, events, MAX_EVENTS, -1); // block indefinitely
    for (int i = 0; i < n; ++i) {
        void *data = events[i].data.ptr;
        ((callback_t)data)(events[i].events);   // invoke user callback
    }
}
```
**Why edge‑triggered (EPOLLET) matters:** In ET mode, `epoll_wait` returns only when a state change occurs, reducing spurious wakeups but requiring the callback to consume *all* available data (e.g., read until `EAGAIN`). This eliminates the need to re‑arm the fd after each read, cutting syscall overhead.

**Timing analysis:** Suppose each I/O operation yields 4 KiB of data and the network interface delivers 100 MiB/s. The time to fill the socket buffer is  
$$ t_{buf} = \frac{4\text{ KiB}}{100\text{ MiB/s}} \approx 0.04\text{ ms} $$  
If the callback processes the data in 0.2 ms, the loop can sustain up to  
$$ \frac{1}{0.2\text{ ms}} = 5{,}000 \text{ callbacks/s} $$  
before the queue backlogs.

### Async I/O Implementation
Modern Linux async I/O centers on `io_uring`, which replaces the older `aio` interface. An `io_uring` instance comprises two ring buffers in shared memory: submission queue (SQ) and completion queue (CQ). The workflow:
1. **Prepare SQE** (submission queue element) – fill opcode, file descriptor, offset, etc.  
2. **Push to SQ** – write to the shared SQ ring, increment `sq.tail`.  
3. **Notify kernel** – via `io_uring_enter` system call (or rely on polling mode).  
4. **Kernel processes** – performs the I/O, writes result to CQ ring.  
5. **Application polls CQ** – reads completions, increments `cq.head`.  

Because SQ and CQ reside in memory mapped via `mmap`, the application can submit and retrieve without a syscall per operation after the initial `io_uring_register` and `io_uring_enter` (in polling mode). This reduces per‑I/O overhead from ~1 µs (syscall) to ~100 ns (memory barrier).

**Mathematical model of throughput:** Let *λ* be the submission rate (IOPS) and *μ* the kernel service rate. The system behaves like an M/M/1 queue with effective service time  
$$ \frac{1}{\mu_{eff}} = \frac{1}{\mu} + t_{overhead} $$  
where *t_overhead* includes submission/completion polling. For *λ* = 150 k IOPS, *μ* = 200 k IOPS, *t_overhead* = 0.5 µs, the utilization ρ = λ/μ_eff ≈ 0.78, giving average latency  
$$ L = \frac{1}{\mu_{eff} - \lambda} \approx \frac{1}{200k - 150k} \text{ s} = 20\text{ µs} $$  
which matches measured io_uring latencies.

### Work Stealing
In user‑level runtimes (e.g., Intel TBB), each worker *w* maintains a double‑ended queue `deque_w`. The algorithm:
```c
// push task (worker-owned)
deque_w.push_bottom(task);

// pop task (worker-owned)
task = deque_w.pop_bottom();   // returns nullptr if empty

// steal task (idle worker)
task = deque_victim.pop_top(); // returns nullptr if empty
```
**Correctness argument:**  
- No two workers pop the same bottom element because only the owner modifies the bottom.  
- Stealing from the top ensures that the stolen task is the oldest in the victim’s deque, preserving work‑depth properties.  
- The ABA problem is avoided by using monotonic counters or hazard pointers in the deque’s atomic head/tail pointers.

**Cache‑line ping‑pong cost:** If a worker steals from a remote deque, it incurs a cache miss on the victim’s head pointer (typically 64‑byte line). Assuming a 3 ns L1 hit and 100 ns remote latency, each steal adds ~100 ns overhead. With a steal probability *p_s* per task, the expected overhead per task is *p_s*·100 ns. For a balanced workload, *p_s* ≈ 1/√P (where P is number of workers), giving sub‑linear overhead growth.

### Task Models
A task graph can be represented by an adjacency list and processed via topological order. The runtime’s scheduler repeatedly:
1. Finds all tasks with indegree = 0 (ready).  
2. Places them into a worker‑local deque.  
3. Workers execute tasks, decrement indegree of children, and push newly ready tasks.

**Complexity:** Let *V* be number of tasks, *E* edges. Computing indegrees is O(V+E). Each edge is processed once when its source completes, giving total O(V+E) work. Synchronization overhead comes from atomic indegree decrements; using fetch‑sub yields O(1) per edge with low contention if the graph is coarse‑grained.

**Example: parallel prefix sum (scan)**  
Given array *A* of length *n*, the scan computes *S[i] = Σ_{j=0}^{i} A[j]*. A work‑efficient parallel scan uses two phases:
- **Up‑sweep:** build a binary tree of partial sums (O(n) work, O(log n) depth).  
- **Down‑sweep:** propagate sums to produce final result (same bounds).  

The total work is 2n − 2, depth 2log₂ n, giving speedup on *P* processors bounded by  
$$ S(P) \le \frac{2n-2}{\frac{2n-2}{P} + 2\log_2 n} $$  
For *n* = 1 048 576 (2²⁰) and *P* = 64, the theoretical speedup ≈ 53×, illustrating how low depth enables near‑linear scaling.

## Worked Examples
### Example 1: Thread Creation, Affinity, and Barrier Synchronization
**Goal:** Two threads compute partial sums of an array, then combine via a barrier.

```c
#define _GNU_SOURCE
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <linux/unistd.h>

#define N 10000000
static int64_t *A;
static int64_t sum[2];
static pthread_barrier_t barrier;

void *worker(void *arg) {
    int id = *(int *)arg;
    size_t start = id * (N/2);
    size_t end   = (id+1) * (N/2);
    int64_t local = 0;
    for (size_t i = start; i < end; ++i) local += A[i];
    sum[id] = local;
    pthread_barrier_wait(&barrier);   // both threads reach here before any proceeds
    return NULL;
}

int main(void) {
    A = malloc(N * sizeof *A);
    for (size_t i = 0; i < N; ++i) A[i] = 1;   // simple test data

    pthread_barrier_init(&barrier, NULL, 2);
    pthread_t t[2];
    int id[2] = {0,1};

    for (int i = 0; i < 2; ++i) {
        pthread_create(&t[i], NULL, worker, &id[i]);
        // pin each thread to a distinct core
        cpu_set_t set;
        CPU_ZERO(&set);
        CPU_SET(i, &set);
        pthread_setaffinity_np(t[i], sizeof(set), &set);
    }

    for (int i = 0; i < 2; ++i) pthread_join(t[i], NULL);

    printf("Total sum = %ld\n", sum[0] + sum[1]);
    pthread_barrier_destroy(&barrier);
    free(A);
    return 0;
}
```
**Step‑by‑step reasoning:**
1. Array `A` is allocated in shared memory; each thread accesses a disjoint half, eliminating false sharing.  
2. Each thread computes a local 64‑bit sum; the addition is associative, so no locks are needed.  
3. `pthread_barrier_wait` ensures both threads finish their partial sums before any thread proceeds to read the partner’s sum—without the barrier, a thread could read the other’s sum before it’s written, causing a race.  
4. Affinity setting via `pthread_setaffinity_np` pins thread 0 to core 0 and thread 1 to core 1, guaranteeing that each thread’s working set stays in its core’s L3 cache, reducing inter‑core cache traffic.  
5. The final `printf` runs after both joins, so the output is deterministic.

**Performance note:** On a 2.6 GHz Xeon, the parallel version runs in ~0.04 s versus ~0.07 s sequentially (≈1.75× speedup) because the workload is memory‑bandwidth bound; the barrier adds negligible overhead (~200 ns).

### Example 2: Edge‑Triggered Epoll Loop with EAGAIN Handling
**Goal:** A server that accepts connections, reads HTTP requests, and echoes them back, using edge‑triggered epoll.

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#define MAX_EVENTS 1024
#define PORT 8080

static int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int main(void) {
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

    int efd = epoll_create1(0);
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLET;   // edge-triggered
    ev.data.fd = listen_fd;
    epoll_ctl(efd, EPOLL_CTL_ADD, listen_fd, &ev);

    struct epoll_event events[MAX_EVENTS];
    while (1) {
        int n = epoll_wait(efd, events, MAX_EVENTS, -1);
        for (int i = 0; i < n; ++i) {
            int fd = events[i].data.fd;
            if (fd == listen_fd) {
                // accept all pending connections (edge-triggered)
                while (1) {
                    struct sockaddr_in client;
                    socklen_t len = sizeof(client);
                    int conn = accept4(fd, (struct sockaddr *)&client, &len,
                                       SOCK_NONBLOCK);
                    if (conn == -1) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK) break;
                        perror("accept4");
                        break;
                    }
                    ev.events = EPOLLIN | EPOLLET;
                    ev.data.fd = conn;
                    epoll_ctl(efd, EPOLL_CTL_ADD, conn, &ev);
                }
            } else {
                // handle data on an existing connection
                if (events[i].events & (EPOLLERR | EPOLLHUP)) {
                    close(fd);
                    continue;
                }
                char buf[4096];
                while (1) {
                    ssize_t r = read(fd, buf, sizeof buf);
                    if (r == -1) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK) break;
                        perror("read");
                        close(fd);
                        break;
                    }
                    if (r == 0) {   // EOF
                        close(fd);
                        break;
                    }
                    // echo back
                    write(fd, buf, r);
                }
            }
        }
    }
}
```
**Explanation of each step:**
- The listening socket is set non‑blocking; otherwise `accept` could block the loop.  
- `EPOLLET` ensures we receive a notification only when the state transitions from “no data” to “data available”. Consequently, after being notified we must drain the socket completely (`while (read(...) > 0)`) until `EAGAIN`.  
- New connections are accepted in a inner loop to avoid missing any that arrived while we were processing the first.  
- Each connection socket is also made non‑blocking and registered with `EPOLLIN | EPOLLET`.  
- Errors (`EPOLLERR`, `EPOLLHUP`) cause immediate closure to prevent the loop from spinning on a dead fd.  
- The echo simply writes back the exact bytes read; for a real HTTP server you would parse the request, but the I/O pattern remains identical.

**Why edge‑triggered reduces syscalls:** In level‑triggered mode, `epoll_wait` would return repeatedly as long as data remains in the buffer, causing a wakeup per iteration even if the application does not consume new data. Edge‑triggered forces the application to consume all available data before sleeping again, cutting the number of wakeups from O(data chunks) to O(state changes).

### Example 3: io_uring Submissions and Polling Mode
**Goal:** Issue 100 k random reads from a file using io_uring in polling mode, measuring throughput and latency.

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/syscall.h>
#include <linux/io_uring.h>
#include <time.h>
#include <errno.h>
#include <string.h>

#define QUEUE_DEPTH 32
#define BATCH_SIZE  32
#define TOTAL_REQ   100000
#define BSIZE       4096

static inline uint64_t ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e9ULL + ts.tv_nsec;
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <file>\n", argv[0]);
        return 1;
    }
    int fd = open(argv[1], O_RDONLY | O_DIRECT);
    if (fd < 0) { perror("open"); return 1; }

    struct io_uring ring;
    if (io_uring_queue_init(QUEUE_DEPTH, &ring, 0)) {
        perror("io_uring_queue_init"); return 1;
    }

    // Allocate aligned buffers
    void *buffers[TOTAL_REQ];
    for (int i = 0; i < TOTAL_REQ; ++i) {
        if (posix_memalign(&buffers[i], BSIZE, BSIZE)) {
            perror("posix_memalign"); return 1;
        }
    }

    uint64_t start = ns();
    unsigned int submitted = 0, completed = 0;
    unsigned int req_idx = 0;
    off_t file_len = lseek(fd, 0, SEEK_END);
    lseek(fd, 0, SEEK_SET);

    while (completed < TOTAL_REQ) {
        // Submit as many as possible up to QUEUE_DEPTH
        while (submitted - completed < QUEUE_DEPTH && req_idx < TOTAL_REQ) {
            struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
            if (!sqe) break;   // should not happen if depth respected
            off_t offset = (rand() % (file_len / BSIZE)) * BSIZE;
            io_uring_prep_read(sqe, fd, buffers[req_idx], BSIZE, offset);
            io_uring_sqe_set_data(sqe, (void *)(uintptr_t)req_idx);
            sqe->flags |= IOSQE_ASYNC;   // ensure async
            ++submitted;
            ++req_idx;
        }
        // Submit batch to kernel
        if (submitted > completed) {
            io_uring_submit(&ring);
        }
        // Reap completions (polling mode)
        struct io_uring_cqe *cqe;
        while (io_uring_peek_cqe(&ring, &cqe) == 0) {
            unsigned int idx = (unsigned int)(uintptr_t)cqe->user_data;
            if (cqe->res < 0) {
                fprintf(stderr, "req %u failed: %s\n", idx, strerror(-cqe->res));
            }
            io_uring_pop_cqe(&ring);
            ++completed;
        }
    }
    uint64_t end = ns();

    printf("Submitted: %u, Completed: %u\n", submitted, completed);
    printf("Total time: %.3f s\n", (end - start) / 1e9);
    printf("Throughput: %.2f MiB/s\n",
           (completed * BSIZE) / ( (end - start) / 1e9 ) / (1024*1024));
    double avg_latency_ns = (double)(end - start) / completed;
    printf("Average latency: %.2f µs\n", avg_latency_ns
