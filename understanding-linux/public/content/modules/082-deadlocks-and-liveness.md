---
id: 82
title: "Deadlocks and liveness"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
A deadlock arises when a set of processes are each **blocked** waiting for a resource that is held by another process in the set, so none can make progress.  
To reason about deadlocks we model the system as a **resource allocation graph** (RAG):  

* Vertices: processes \(P_i\) and resources \(R_j\).  
* Directed edge \(P_i \rightarrow R_j\) means *process \(i\) is requesting* resource \(j\).  
* Directed edge \(R_j \rightarrow P_i\) means *resource \(j\) is held by* process \(i\).  

A deadlock exists **iff** the RAG contains a directed cycle.  
From this graph perspective we derive the four *necessary* conditions (Coffman, 1971). Each condition is required for a cycle to appear; removing any one breaks all possible cycles.

| Condition | Formal statement in the RAG | Why it is required for a cycle |
|-----------|----------------------------|--------------------------------|
| **Mutual Exclusion** | A resource vertex has at most one incoming edge from a process (i.e., it is non‑sharable). | If a resource could be shared, multiple processes could hold it simultaneously, eliminating the wait‑for edge that creates a cycle. |
| **Hold and Wait** | A process vertex has both an incoming edge (holding) and an outgoing edge (requesting). | A process that only requests or only holds cannot be part of a wait‑for cycle; it must simultaneously hold one resource while waiting for another. |
| **No Preemption** | Edges cannot be forcibly removed; a resource can be released only by its holding process. | If the OS could preempt a resource, the holding edge could be broken, destroying any cycle. |
| **Circular Wait** | There exists a set \(\{P_{i1},…,P_{ik}\}\) such that \(P_{i1}\) waits for \(R_{j1}\) held by \(P_{i2}\), …, \(P_{ik}\) waits for \(R_{jk}\) held by \(P_{i1}\). | This is exactly a directed cycle in the RAG. |

*Why are they not sufficient?*  
A system may satisfy all four yet never deadlock if the request pattern never aligns to close the cycle (e.g., resources are always released before a conflicting request). Conversely, if any condition is absent, a cycle cannot form, guaranteeing deadlock‑freedom.

### Resource ordering (prevention)
Impose a **global strict total order** \(\prec\) on all resources. Require every process to request resources only in increasing order: if a process holds \(R_a\) and wishes to acquire \(R_b\), then \(R_a \prec R_b\).  

*Proof of deadlock‑freedom:*  
Assume a cycle exists: \(P_1\) holds \(R_{a1}\) and waits for \(R_{b1}\) with \(R_{a1} \prec R_{b1}\); \(P_2\) holds \(R_{a2}\) and waits for \(R_{b2}\) with \(R_{a2} \prec R_{b2}\); …; \(P_k\) holds \(R_{ak}\) and waits for \(R_{bk}\) with \(R_{ak} \prec R_{bk}\). Because each waiting edge points from a lower‑ordered resource to a higher‑ordered one, following the cycle yields a strict increase in resource order at each step. After \(k\) steps we must have \(R_{a1} \prec R_{a1}\), an impossibility. Hence no cycle can form.

---

## How It Works
### Minimal deadlock example with two mutexes
```c
/* Process 1 */
pthread_mutex_lock(&mA);   /* hold A */
pthread_mutex_lock(&mB);   /* request B */

/* Process 2 */
pthread_mutex_lock(&mB);   /* hold B */
pthread_mutex_lock(&mA);   /* request A */
```
If the two threads interleave as shown, each holds one mutex and waits for the other → a cycle in the RAG:  
\(P1 \rightarrow mB \rightarrow P2 \rightarrow mA \rightarrow P1\).

### Avoidance by resource ordering
Declare a global order: `mA ≺ mB`. Both threads must acquire `mA` first:
```c
/* Process 1 & 2 (identical) */
pthread_mutex_lock(&mA);
pthread_mutex_lock(&mB);
```
Now the RAG can only contain edges from a lower‑ordered mutex to a higher‑ordered one; a cycle would require a decreasing edge, which the protocol forbids.

### Detecting deadlocks with a wait‑for graph
The kernel maintains a **wait‑for graph (WFG)** where vertices are processes and an edge \(P_i \rightarrow P_j\) means *\(i\) is blocked waiting for a resource held by \(j\)*.  
A deadlock ⇔ WFG contains a cycle.  
Cycle detection can be done with DFS in \(O(V+E)\) time.  
Linux’s `lockdep` subsystem builds a similar graph at runtime and reports potential cycles.

---

## Worked Examples
### 1. Dining Philosophers (5 philosophers, 5 chopsticks)
*Model*: each chopstick is a mutex `stick[i]`. Philosopher `i` needs `stick[i]` (left) and `stick[(i+1)%5]` (right).

**Naïve algorithm (deadlock possible)**
```c
void philosopher(int i) {
    pthread_mutex_lock(&stick[i]);           /* left */
    pthread_mutex_lock(&stick[(i+1)%5]);     /* right */
    eat();
    pthread_mutex_unlock(&stick[i]);
    pthread_mutex_unlock(&stick[(i+1)%5]);
}
```
If all philosophers simultaneously pick up their left stick, each holds one and waits for the right stick held by the neighbor → a 5‑cycle in the WFG.

**Solution 1 – Resource hierarchy**  
Number chopsticks 0…4. Require each philosopher to pick the lower‑numbered stick first:
```c
void philosopher(int i) {
    int first = i < (i+1)%5 ? i : (i+1)%5;
    int second = i < (i+1)%5 ? (i+1)%5 : i;
    pthread_mutex_lock(&stick[first]);
    pthread_mutex_lock(&stick[second]);
    eat();
    pthread_mutex_unlock(&stick[first]);
    pthread_mutex_unlock(&stick[second]);
}
```
Philosopher 4 now grabs stick 0 before stick 4, breaking the symmetry; the WFG can no longer contain a cycle.

**Solution 2 – Asymmetric pickup (odd/even)**  
Odd philosophers pick left‑then‑right; even pick right‑then‑left. This also eliminates the cycle because the direction of waiting edges alternates.

*Timing note*: If each think/eat phase lasts \(T_{think}=10\) ms and \(T_{eat}=5\) ms, the naive algorithm deadlocks after at most \(5 \times T_{think}=50\) ms; the hierarchical solution guarantees progress regardless of timing.

### 2. Banker’s Algorithm (safety check)
Assume 3 resource types (A,B,C) with total instances \(\mathbf{E} = (10,5,7)\).  
Current allocation matrix \(\mathbf{A}\) and request matrix \(\mathbf{R}\):

\[
\mathbf{A}=
\begin{bmatrix}
0 & 1 & 0\\
2 & 0 & 0\\
3 & 0 & 2\\
2 & 1 & 1\\
0 & 0 & 2
\end{bmatrix},
\qquad
\mathbf{R}=
\begin{bmatrix}
0 & 0 & 0\\
2 & 0 & 2\\
0 & 0 & 0\\
1 & 0 & 0\\
0 & 0 & 2
\end{bmatrix}
\]

Compute **need** = \(\mathbf{R} - \mathbf{A}\):
\[
\mathbf{N}=
\begin{bmatrix}
0 & 0 & 0\\
0 & 0 & 2\\
-3 & 0 & -2\\
-1 & -1 & -1\\
0 & 0 & 0
\end{bmatrix}
\]
(negative entries mean the request exceeds allocation; they are treated as zero for safety.)

Available vector \(\mathbf{V} = \mathbf{E} - \sum \mathbf{A}_{*}= (3,2,2)\).

Safety algorithm: find a process \(i\) such that \(\mathbf{N}_i \le \mathbf{V}\).  
- \(P_0\): need \((0,0,0) \le (3,2,2)\) → finish, release its allocation → \(\mathbf{V} = (3,3,2)\).  
- \(P_1\): need \((0,0,2) \le (3,3,2)\) → finish → \(\mathbf{V} = (5,3,2)\).  
- \(P_2\): need now treated as \((0,0,0)\) → finish → \(\mathbf{V} = (8,3,4)\).  
- \(P_3\): need \((0,0,0)\) → finish → \(\mathbf{V} = (10,4,5)\).  
- \(P_4\): need \((0,0,0)\) → finish → \(\mathbf{V} = (10,4,7)\).

All processes finished → system is **safe**. A request \((1,0,2)\) from \(P_1\) would be checked:  
\[
\text{Request} \le \text{Need}_1? \;(1,0,2) \le (0,0,2) \text{ fails (1>0)}\Rightarrow\text{deny}.
\]

### 3. Producer‑Consumer deadlock (missing condition variable)
```c
#define BUF_SZ 10
int buf[BUF_SZ];
int in = 0, out = 0;
pthread_mutex_t mtx = PTHREAD_MUTEX_INITIALIZER;
/* no condition variables */

void *producer(void *arg) {
    while (1) {
        pthread_mutex_lock(&mtx);
        if ((in + 1) % BUF_SZ == out) {   /* buffer full */
            pthread_mutex_unlock(&mtx);
            /* busy‑wait – wastes CPU, but if scheduler never runs consumer,
               producer never releases mutex → deadlock */
        }
        buf[in] = produce();
        in = (in + 1) % BUF_SZ;
        pthread_mutex_unlock(&mtx);
    }
}
```
If the consumer never gets CPU time (e.g., due to priority inversion), the producer spins holding `mtx`. The consumer, when finally scheduled, blocks on `pthread_mutex_lock(&mtx)` → deadlock.

**Fix** – use two condition variables `not_full` and `not_empty`:
```c
pthread_cond_t not_full = PTHREAD_COND_INITIALIZER;
pthread_cond_t not_empty = PTHREAD_COND_INITIALIZER;

void *producer(void *arg) {
    while (1) {
        pthread_mutex_lock(&mtx);
        while ((in + 1) % BUF_SZ == out)   /* wait while full */
            pthread_cond_wait(&not_full, &mtx);
        buf[in] = produce();
        in = (in + 1) % BUF_SZ;
        pthread_cond_signal(&not_empty);
        pthread_mutex_unlock(&mtx);
    }
}
```
Now the producer releases `mtx` while waiting, allowing the consumer to acquire it and consume, guaranteeing progress.

---

## Common Mistakes
| Mistake | What’s wrong | Why it leads to deadlock (or liveness failure) |
|---------|--------------|-----------------------------------------------|
| **Assuming lock ordering is unnecessary if you use `trylock`** | `pthread_mutex_trylock` only avoids blocking; failure leads to retry loops that may never acquire the second lock. | If both processes repeatedly `trylock` the opposite lock and always fail, they livelock; if one finally succeeds while the other holds the first lock, a deadlock can still occur when the successful thread later blocks on the second lock. |
| **Failing to unlock on error paths** | Early `return` or `goto error` skips `pthread_unlock`. | The held lock remains forever, turning a *hold‑and‑wait* condition into a permanent block for any other process needing that lock. |
| **Using non‑recursive mutexes as if they were recursive** | A thread locks the same mutex twice without `pthread_mutexattr_settype`. | The second lock attempt blocks on a lock already held by the same thread → self‑deadlock. |
| **Relying on spinlocks in process context** | Spinlocks busy‑wait; if the holder is preempted, the spinner wastes CPU and may block the holder from running (priority inversion). | In a preemptive kernel, a spinlock held by a low‑priority task while a high‑priority task spins can prevent the low‑priority task from ever getting CPU → deadlock‑like stall. |
| **Believing lock‑free data structures eliminate deadlock** | Lock‑free algorithms avoid locks but may still suffer from *ABA* or *livelock* due to contention. | Although no thread blocks waiting for a lock, repeated failed CAS operations can cause threads to make no progress (livelock), which is equivalent to deadlock from a liveness perspective. |
| **Ignoring the impact of priority inheritance** | Using plain mutexes under real‑time scheduling without enabling priority inheritance. | A high‑priority thread blocked by a low‑priority holder can be indefinitely delayed if a medium‑priority thread preempts the holder → priority inversion → effective deadlock. |

---

## Exercises
### Easy – Wait‑for graph detection
1. Write a C program that reads a list of `(holder, waiter)` pairs from stdin (e.g., `P1 R2` meaning *process P1 holds resource R2, and some process waits for it*).  
2. Build the wait‑for graph (process vertices only) and output **YES** if a cycle exists, otherwise **NO**.  
*Hint:* Use DFS with a recursion stack; complexity \(O(V+E)\).

### Medium – Resource‑ordering wrapper
1. Implement a library `ordered_lock.h` providing `ordered_lock(mutex *lower, mutex *higher)` that asserts `lower < higher` via a global resource ID map and locks in the correct order.  
2. Show its use in a producer‑consumer example with two mutexes (buffer lock and item count lock) and verify with `lockdep` that no warnings appear.

### Hard – Banker’s algorithm simulator
1. Parse a description of a system: number of processes *n*, number of resource types *m*, total instances vector **E**, allocation matrix **A**, request matrix **R**.  
2. Implement the safety algorithm; if the system is unsafe, print the set of processes that cause the unsafe state (a minimal deadlock‑prone subset).  
3. Extend the simulator to handle incremental requests: when a process requests resources, check using the Banker’s criterion; if safe, pretend to allocate and update **A** and **V**; otherwise, deny and report why.  
4. Test with the numeric example from the Worked Examples section and with a randomly generated case (n=10, m=5).  

---

## Linux Connection
Linux provides concrete mechanisms that map directly to the abstract concepts above.

| Concept | Linux implementation | Example usage |
|---------|----------------------|---------------|
| **Mutex (mutual exclusion)** | `pthread_mutex_t` (userspace) ; `struct mutex` (kernel) | `pthread_mutex_lock(&mtx);` <br> `mutex_lock(&my_mutex);` |
| **Spinlock** | `raw_spinlock_t` (kernel, preempt‑disabled) | `raw_spinlock_t lock = __RAW_SPINLOCK_UNLOCKED(lock);`<br>`raw_spin_lock(&lock);` |
| **Read‑Write lock** | `pthread_rwlock_t` ; `struct rw_semaphore` | `pthread_rwlock_rdlock(&rwlock);` |
| **Lock ordering enforcement** | **Lockdep** (kernel lock dependency checker) | Enable: `echo 1 > /proc/sys/kernel/lockdep`<br>Run a test program; `dmesg` shows `=== TRACEPOINT lock: ... ===` warnings if a potential inversion is detected. |
| **Wait‑for graph / deadlock detection** | **`/proc/locks`** (shows POSIX and flock locks) <br> **`/sys/kernel/debug/tracing`** with `lock` tracepoints | `cat /proc/locks` lists each lock, holder PID, and type.<br>To detect a deadlock: `echo 1 > /sys/kernel/debug/tracing/events/lock/enable`; then `cat trace` after a stall. |
| **Futex (fast userspace mutex)** | `futex(2)` syscall – basis of `pthread_mutex` | `syscall(SYS_futex, &addr, FUTEX_WAIT, val, NULL, 0, 0);` |
| **Priority inheritance mutex** | `pthread_mutexattr_setprotocol(&attr, PTHREAD_PRIO_INHERIT);` | Prevents priority inversion; used in real‑time threads (`SCHED_FIFO`). |
| **File system lock (VFS inode lock)** | `struct inode->i_rwsem` (read‑write semaphore) | When `lookup()` needs to modify an inode, it acquires `inode->i_rwsem` via `down_write(&inode->i_rwsem);` |
| **Block I/O queue lock** | `struct request_queue->queue_lock` (spinlock) | `spin_lock_irqsave(&q->queue_lock, flags);` protects the request list. |
| **Network device lock** | `struct net_device->tx_global_lock` (spinlock) | `spin_lock_bh(&dev->tx_global_lock);` protects transmit queue. |
| **TCP retransmission timer lock** | `struct tcp_sock->write_seq` accessed under `sock_lock` (socket lock) | `lock_sock(sk);` before modifying `sk->sk_write_space`. |

### Demonstrating lockdep in practice
```bash
# 1. Enable lockdep (requires kernel configured with CONFIG_LOCKDEP)
echo 1 > /proc/sys/kernel/lockdep

# 2. Run a simple program that acquires two mutexes in opposite order
cat > deadlock_demo.c <<'EOF'
#include <pthread.h>
#include <unistd.h>
pthread_mutex_t A = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_t B = PTHREAD_MUTEX_INITIALIZER;
void* f1(void*_){ pthread_mutex_lock(&A); sleep(1); pthread_mutex_lock(&B); pthread_mutex_unlock(&B); pthread_mutex_unlock(&A); return NULL; }
void* f2(void*_){ pthread_mutex_lock(&B); sleep(1); pthread_mutex_lock(&A); pthread_mutex_unlock(&A); pthread_mutex_unlock(&B); return NULL; }
int main(){
    pthread_t t1,t2; pthread_create(&t1,NULL,f1,NULL); pthread_create(&t2,NULL,f2,NULL);
    pthread_join(t1,NULL); pthread_join(t2,NULL); return 0;
}
EOF
gcc -pthread deadlock_demo.c -o deadlock_demo
./deadlock_demo &
sleep 2
# 3. Check kernel log for lockdep warning
dmesg | tail -20
```
You will see output similar to:
```
[ 1234.567890] lockdep: WARNING: possible circular locking dependency detected
[ 1234.567891]  -> #0 (&A){+.-.}, at: [...]
[ 1234.567892]  -> #1 (&B){+.-.}, at: [...]
```
indicating that lockdep spotted the potential deadlock.

### Using `/proc/locks` to inspect active flock locks
```bash
# Take a shared lock on a file
flock -s /tmp/testfile &
# In another terminal, take an exclusive lock (will block)
flock -x /tmp/testfile &
# Now view the lock state
cat /proc/locks
```
Sample output:
```
1: POSIX  ADVISORY  WRITE 3621 08:02:12345 0:0
2: POSIX  ADVISORY  READ  3622 08:02:12345 0:0
```
Shows which PID holds which type; if both are waiting, you can infer a deadlock‑like contention.

---

## Why This Matters
Understanding the *necessary and sufficient* structure of deadlocks lets you move beyond superstition (“always lock in alphabetical order”) to **principled design**:

* **Correctness** – By imposing a global resource order or using lockdep‑validated lock hierarchies, you mathematically eliminate circular wait, guaranteeing that no execution can reach a deadlocked state.
* **Performance** – Avoiding heavyweight deadlock detection algorithms (which require periodic graph scans and possible process rollback) reduces overhead; lock ordering adds only a constant‑time check.
* **Debuggability** – Tools like lockdep, `/proc/locks`, and futex tracing give you observable evidence when your ordering assumptions are violated, turning a mysterious hang into a actionable diagnostic.
* **Real‑world relevance** – Linux subsystems (VFS, block I/O, networking) already rely on these principles; exposing the kernel’s lock ordering rules helps you write kernel modules, device drivers, or high‑performance servers that coexist safely with the core.
* **Scalability** – In large concurrent systems, the probability of a random lock acquisition forming a cycle grows super‑factorially with the number of locks; ordering reduces this probability to zero, enabling predictable scaling under load.

Mastering these concepts equips you to build systems that are not just *fast* but *provably* free from one of the most pernicious classes of concurrency bugs—deadlocks—while retaining the flexibility needed for complex, resource‑rich applications.
