---
id: 45
title: "Asynchronous design basics"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Core Concepts  
### Asynchronous Design Fundamentals  
In synchronous digital systems a global clock distributes a periodic edge to every flip‑flop, guaranteeing that all state transitions occur within a known bounded interval \([t_{clk}-t_{setup}, t_{clk}+t_{hold}]\). When the clock cannot be guaranteed—because domains run at unrelated frequencies, because latency is data‑dependent, or because power‑saving requires clock gating—the system must rely on **event‑based coordination** rather than a time‑based trigger.  

An asynchronous circuit therefore computes a function \(f:\{0,1\}^n\rightarrow\{0,1\}^m\) where the *validity* of an output is signaled by a **handshake** rather than a clock edge. The correctness condition is:  

\[
\forall\,\text{input vector }x,\; \text{output }y=f(x) \text{ is considered valid only after the receiver asserts an acknowledgement.}
\]

This shifts the timing burden from a global skew budget to the **propagation delay of the handshake signals**. If the forward path delay is \(d_{fwd}\) and the reverse path delay is \(d_{rev}\), the minimum handshake period is  

\[
T_{handshake}=d_{fwd}+d_{rev}+t_{arb},
\]

where \(t_{arb}\) is the arbitration time needed to resolve concurrent request/acknowledgement transitions (typically a few gate delays).  

### Handshake Protocols  
A handshake consists of two signals: **request** (\(req\)) from sender and **acknowledgement** (\(ack\)) from receiver. Two canonical variants exist:

| Protocol | Signal Transition Sequence | Properties |
|----------|----------------------------|------------|
| **Two‑phase** (level‑encoded) | \(req\) toggles → data valid → \(ack\) toggles → data may change | Simple, but requires return‑to‑zero (RTZ) or return‑to‑one (RTO) encoding to avoid ambiguity. |
| **Four‑phase** (return‑to‑zero) | \(req\)↑ → data valid → \(ack\)↑ → \(req\)↓ → data may change → \(ack\)↓ → idle | Robust to noise; each phase returns to a known baseline, eliminating DC bias. |

The four‑phase protocol guarantees **delay‑insensitivity**: as long as gates exhibit monotonic transition behavior (no glitches), the protocol functions correctly regardless of absolute delays.  

### Hazards in Asynchronous Circuits  
A **hazard** is a transient incorrect logic level that can cause the downstream state machine to sample a wrong value.  

*Static hazard*: occurs when a logic function should maintain a constant output while an input changes, but due to differing path delays the output glitches. Example: output \(F = A\bar{B}+ \bar{A}C\). If \(A\) switches from 0→1 while \(B=0, C=1\), the two product terms have different delays, causing a momentary 0.  

*Dynamic hazard*: occurs when an output should transition monolithically (0→1 or 1→0) but makes multiple transitions due to reconvergent paths with unequal delays.  

Both are eliminated by ensuring **delay‑balanced** logic (e.g., using Huffman synthesis or inserting buffers) or by applying **hazard‑free covering** in the Boolean expression (e.g., adding the consensus term \(BC\) to the above example).  

### Synchronization Primitives  
When asynchronous modules share mutable state, concurrent accesses must be serialized. The kernel provides three primary primitives, each built from atomic instructions and memory ordering guarantees:

| Primitive | Underlying Atomic | Typical Use | Memory Ordering |
|-----------|-------------------|-------------|-----------------|
| **Mutex** (`struct mutex`) | `cmpxchg`‑based lock with a wait queue | Sleepable locking (may block) | Acquire on lock, release on unlock (full barrier) |
| **Spinlock** (`spinlock_t`) | `xchg` loop | Short critical sections, interrupt context | Acquire/release imply a barrier; variants with `_irqsave` disable/enable local interrupts |
| **RCU** (Read‑Copy‑Update) | `smp_load_acquire` / `smp_store_release` | Read‑mostly data structures | Read side: no locks, only memory barriers; updaters use `synchronize_rcu()` after grace period |

The choice hinges on **critical section length** and **context**: if the section may sleep (e.g., waiting for I/O) use a mutex; if it must run in hard‑IRQ or with bounded latency, use a spinlock; for readers that vastly outnumber writers, RCU yields near‑zero read overhead.

---

## How It Works  
### From Specification to Silicon  
1. **Formal Specification** – Describe the protocol as a **finite state machine (FSM)** using a hardware description language (HDL). Signals are annotated with *valid* and *data* wires.  
2. **Synthesis** – The HDL is translated to a **gate‑level netlist** while preserving **delay‑insensitivity** properties. Synthesis tools (e.g., Yosys, Synopsys DC) apply *asynchronous constraints*:  
   - *No combinational loops* without acknowledgment.  
   - *Isolators* inserted where asynchronous signals cross clock‑domain boundaries (if any).  
3. **Placement & Routing** – Physical design tools place gates to **minimize wire length** on critical handshake paths, because total handshake latency directly impacts throughput. The router attempts to keep \(d_{fwd}\) and \(d_{rev}\) balanced to reduce \(t_{arb}\).  
4. **Verification** –  
   - **Simulation** with event‑driven kernels (Verilog/VHDL simulators) to test corner cases (simultaneous requests, metastability).  
   - **Formal property checking** (e.g., using SymbiYosys) to prove *deadlock‑freedom* and *output correctness* under arbitrary gate delays.  
   - **Metastability analysis**: compute the Mean Time Between Failures (MTBF) of a synchronizer using  

\[
\text{MTBF}= \frac{e^{T/\tau}}{T_0 \cdot f_{clk} \cdot \lambda},
\]

where \(T\) is the available resolution time, \(\tau\) the device time constant (~0.1 ns for 65 nm CMOS), \(T_0\) a technology constant (~10⁻⁴ s), \(f_{clk}\) the clock frequency sampling the asynchronous signal, and \(\lambda\) the data transition rate. A larger \(T\) (by adding flip‑flop stages) exponentially increases MTBF.  

### Handshake Implementation (Verilog) – Four‑Phase  
```verilog
module async_handshake #(
    parameter DATA_W = 32
) (
    input  wire               clk,        // only for testbench; not used in datapath
    input  wire               req,        // request from sender
    output wire               ack,        // acknowledgement to sender
    input  wire [DATA_W-1:0]  din,        // data from sender
    output reg  [DATA_W-1:0]  dout        // data to receiver
);
    // FSM states: 0=IDLE, 1=DATA_VALID, 2=ACK_WAIT, 3=RESET
    reg [1:0] state, next_state;

    // Next‑state logic (combinational)
    always @* begin
        case (state)
            2'b00: next_state = req ? 2'b01 : 2'b00; // IDLE → DATA_VALID on req
            2'b01: next_state = 2'b10;               // DATA_VALID → ACK_WAIT
            2'b10: next_state = !req ? 2'b11 : 2'b10; // ACK_WAIT → RESET when req drops
            2'b11: next_state = req ? 2'b11 : 2'b00; // RESET → IDLE when ack drops
            default: next_state = 2'b00;
        endcase
    end

    // State register (asynchronous reset optional)
    always @(posedge clk or negedge req) begin // clk used only for test‑bench sync
        if (!req) state <= 2'b00; // async reset when request low (for simplicity)
        else      state <= next_state;
    end

    // Output logic
    assign ack = (state == 2'b10); // assert ack during ACK_WAIT
    always @* begin
        if (state == 2'b01) dout = din; // latch data when valid
        else                dout = 'b0;
    end
endmodule
```
*Notes*: The design is **clock‑agnostic** for the datapath; the `clk` input is only needed for test‑bench synchronization. The FSM guarantees that `dout` is stable and valid while `ack` is high, and that the sender sees a proper request/acknowledge cycle before de‑asserting `req`.

### Synchronization Example (C + pthreads)  
```c
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <unistd.h>

#define NTHREADS 8
#define ITERS    1000000

/* Shared counter protected by a mutex */
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static atomic_int counter = ATOMIC_VAR_INIT(0); /* atomic for debug only */

void *worker(void *arg)
{
    for (int i = 0; i < ITERS; ++i) {
        /* Acquire lock – includes an acquire barrier */
        pthread_mutex_lock(&lock);
        /* Critical section: read‑modify‑write */
        int tmp = counter;      /* load */
        tmp += 1;               /* increment */
        counter = tmp;          /* store */
        /* Release lock – includes a release barrier */
        pthread_mutex_unlock(&lock);
    }
    return NULL;
}

int main(void)
{
    pthread_t th[NTHREADS];
    for (int i = 0; i < NTHREADS; ++i)
        pthread_create(&th[i], NULL, worker, NULL);
    for (int i = 0; i < NTHREADS; ++i)
        pthread_join(&th[i], NULL);

    printf("Final counter = %d (expected %d)\n",
           atomic_load(&counter), NTHREADS * ITERS);
    return 0;
}
```
The mutex guarantees **mutual exclusion** and provides the necessary **memory ordering** so that each thread sees the updates made by the previous holder of the lock. Without the lock, the race on `counter` would produce a final value far below the expected total due to lost updates.

---

## Worked Examples  

### Example 1: Four‑Phase Handshake Timing Analysis  
Assume a 65 nm CMOS library where a minimum inverter delay is \(t_{inv}=30\) ps and a NAND2 delay is \(t_{nand}=45\) ps. The request‑to‑acknowledge path consists of two series NAND2 gates (request → acknowledgement generation) and the reverse path is similar.  

- Forward path delay: \(d_{fwd}=2 \times t_{nand}=90\) ps  
- Reverse path delay: \(d_{rev}=2 \times t_{nand}=90\) ps  
- Arbitration time (metastability resolution of the request/acknowledge crossover) approximated as one inverter delay: \(t_{arb}=t_{inv}=30\) ps  

Thus the minimum handshake period  

\[
T_{handshake}=d_{fwd}+d_{rev}+t_{arb}=90+90+30=210\text{ ps}.
\]

The achievable **throughput** (one data word per handshake) is  

\[
\text{Throughput}= \frac{1}{T_{handshake}} \approx 4.76\text{ GHz}.
\]

If the design targets a 2 GHz system, the timing slack is  

\[
\text{Slack}= \frac{1}{2\text{ GHz}} - T_{handshake}=500\text{ ps}-210\text{ ps}=290\text{ ps},
\]

which can be absorbed by inserting buffers or widening datapaths without affecting correctness.

### Example 2: Mutex‑Protected Circular Buffer (Producer‑Consumer)  
```c
#define BUF_SZ 16
typedef struct {
    int buf[BUF_SZ];
    unsigned int head; /* index to insert */
    unsigned int tail; /* index to remove */
    pthread_mutex_t mtx;
    pthread_cond_t  not_full;
    pthread_cond_t  not_empty;
} circ_buf_t;

void cb_init(circ_buf_t *cb)
{
    cb->head = cb->tail = 0;
    pthread_mutex_init(&cb->mtx, NULL);
    pthread_cond_init(&cb->not_full, NULL);
    pthread_cond_init(&cb->not_empty, NULL);
}

void cb_produce(circ_buf_t *cb, int val)
{
    pthread_mutex_lock(&cb->mtx);
    while (((cb->head + 1) % BUF_SZ) == cb->tail)   /* full */
        pthread_cond_wait(&cb->not_full, &cb->mtx);
    cb->buf[cb->head] = val;
    cb->head = (cb->head + 1) % BUF_SZ;
    pthread_cond_signal(&cb->not_empty);
    pthread_mutex_unlock(&cb->mtx);
}

int cb_consume(circ_buf_t *cb)
{
    int v;
    pthread_mutex_lock(&cb->mtx);
    while (cb->head == cb->tail)   /* empty */
        pthread_cond_wait(&cb->not_empty, &cb->mtx);
    v = cb->buf[cb->tail];
    cb->tail = (cb->tail + 1) % BUF_SZ;
    pthread_cond_signal(&cb->not_full);
    pthread_mutex_unlock(&cb->mtx);
    return v;
}
```
*Why each step matters*:  
- The mutex ensures only one thread manipulates `head`/`tail` at a time.  
- The condition variables encode the **buffer occupancy predicate**, turning busy‑waiting into a **blocking wait** that releases the CPU.  
- The memory barriers implicit in `pthread_mutex_lock/unlock` guarantee that stores to `buf[head]` become visible to the consumer before the `not_empty` signal is observed.

### Example 3: RCU-Protected Linked List (Linux Kernel Style)  
```c
#include <linux/rculist.h>
#include <linux/slab.h>

struct node {
    int key;
    struct rcu_head rcu;
    struct list_head list;
};

/* Global list head protected by RCU */
static LIST_HEAD(my_list);

/* Insertion – can run in any context */
void list_insert(int key)
{
    struct node *n = kmalloc(sizeof(*n), GFP_ATOMIC);
    n->key = key;
    /* No lock needed; list_add_tail_rcu publishes via a store‑release */
    list_add_tail_rcu(&n->list, &my_list);
}

/* Deletion – requires grace period */
void list_delete(int key)
{
    struct node *n, *tmp;
    list_for_each_entry_safe(n, tmp, &my_list, list) {
        if (n->key == key) {
            list_del_rcu(&n->list);   /* marks removed, readers still see old list */
            call_rcu(&n->rcu, kfree); /* free after all pre‑existing readers finish */
            break;
        }
    }
}

/* Reader – lock‑free */
int list_lookup(int key)
{
    struct node *n;
    int ret = -ENOENT;
    rcu_read_lock();
    list_for_each_entry_rcu(n, &my_list, list) {
        if (n->key == key) {
            ret = 0;
            break;
        }
    }
    rcu_read_unlock();
    return ret;
}
```
*Explanation*:  
- Writers use `list_add_tail_rcu`/`list_del_rcu`, which issue **store‑release** and **load‑acquire** barriers ensuring that the new node is fully initialized before its pointer becomes visible, and that the pointer removal is observed after any prior reads have completed.  
- Readers execute within `rcu_read_lock()`/`rcu_read_unlock()`; these map to **preempt‑disable** (or nothing on CONFIG_PREEMPT_RCU) and impose no memory overhead.  
- The grace period (`call_rcu`) guarantees that any reader that started before the deletion will finish before the memory is reclaimed, eliminating use‑after‑free without explicit locks.

---

## Common Mistakes  

| # | Mistake | What’s Wrong | Why It Fails |
|---|---------|--------------|--------------|
| 1 | **Using a two‑phase handshake without RTZ/RTO encoding** | The receiver may interpret a level‑held request as a new request after the sender has already moved on. | The protocol becomes **ambiguous**: a constant high `req` could be either a valid request or an idle state, leading to lost or spurious acknowledgements. |
| 2 | **Neglecting metastability resolution time in synchronizer chains** | Assuming a single flip‑flop suffices for crossing clock domains. | The probability of metastability \(P_{meta} \approx \frac{T_0}{\tau}e^{-T/\tau}\) can be non‑negligible; without enough stages the MTBF may drop below system lifetime, causing sporadic data corruption. |
| 3 | **Accessing shared variables without atomicity or locks** (e.g., `counter++`) | The operation compiles to load‑increment‑store, which is not atomic. | Concurrent threads can interleave, causing **lost updates**; the final value is nondeterministic and often lower than expected. |
| 4 | **Calling a blocking mutex from interrupt context** | `mutex_lock()` may sleep; interrupts cannot sleep. | The kernel will trigger a **BUG: sleeping function called from invalid context** and may deadlock or panic. |
| 5 | **Failing to issue memory barriers after lock acquisition in lock‑free code** | Assuming the lock provides ordering when using custom atomic ops. | On weakly‑ordered architectures (ARM, PowerPC) a store may become visible before the load‑acquire, breaking invariants and causing **silent data corruption**. |
| 6 | **Using `spin_lock_irqsave()` but forgetting to restore flags on error paths** | Early return leaves interrupts disabled. | System responsiveness degrades; other interrupts are masked, leading to **latency spikes** and possible watchdog timeouts. |
| 7 | **Assuming RCU readers are completely free of overhead** | Using RCU in a preemptible kernel without `CONFIG_PREEMPT_RCU` can cause **priority inversion**. | Readers may be preempted while holding an RCU read‑side lock, delaying grace‑period completion and stalling updaters. |
| 8 | **Mis-sizing a handshake FIFO (depth = 1) for bursty traffic** | The FIFO stalls when the producer sends two words before the consumer acknowledges the first. | Throughput collapses to **zero** during bursts, defeating the purpose of asynchronous decoupling. |

---

## Exercises  

### Easy  
1. **Handshake Timing** – Given a NAND2 delay of 50 ps and an inverter delay of 20 ps, compute the minimum four‑phase handshake period and the maximum sustainable data rate for a 32‑bit word. Show your work.  
2. **Mutex Counter** – Write a minimal pthread program that increments a shared 64‑bit counter 10 million times using a mutex. Verify the final value equals `NTHREADS * ITERS`.  

### Medium  
3. **Metastability MTBF** – For a synchronizer built from two flip‑flops in a 28 nm process (\(\tau = 0.07\) ns, \(T_0 = 2\times10^{-4}\) s) receiving an asynchronous signal with transition rate \(\lambda = 200\) MHz and clocked at \(f_{clk}=500\) MHz, calculate the MTBF if the available resolution time \(T\) is one clock period (2 ns).  
4. **RCU Grace Period** – Write a small kernel module that spawns a kthread which periodically deletes entries from an RCU‑protected list while a second kthread continuously traverses the list. Use `tracepoint` or `printk` to show that no null‑pointer dereference occurs.  

### Hard  
5. **Design a Delay‑Insensitive FIFO** – Implement a dual‑rail asynchronous FIFO in Verilog (or SystemVerilog) that uses a four‑phase handshake on both push and pop ports. Prove (by inspection or using a tool like **CADP**) that the FIFO is free of static and dynamic hazards for arbitrary gate delays.  
6. **Lock‑Free Queue Verification** – Implement Michael & Scott’s non‑blocking queue in C using C11 atomics (`atomic_compare_exchange_strong`). Then, using **ThreadSanitizer** (`-fsanitize=thread`) and **stress‑test** with 32 threads each performing 5 million enqueue/dequeue operations, demonstrate absence of data races and linearizability (you may check invariants such as queue size never negative).  

---

## Linux Connection  

### Kernel Synchronization Primitives in Practice  

| Primitive | Header | Typical Usage | Example Command / File |
|-----------|--------|---------------|------------------------|
| `struct mutex` | `<linux/mutex.h>` | Protects sleepable resources (e.g., device registers, file‑system metadata) | `cat /proc/<pid>/status | grep -i mutex` (shows mutex held by a process) – more directly: `sudo perf lock -s` lists mutex contention events. |
| `spinlock_t` | `<linux/spinlock.h>` | Very short critical sections, interrupt handlers | `$ sudo cat /proc/interrupts` – look at the increase of a specific IRQ while holding a spinlock (you can add a `tracepoint` to `spin_lock`). |
| `rcu_head` / `rcu_read_lock()` | `<linux/rcupdate.h>` | Read‑mostly structures (e.g., routing tables, VFS dentry cache) | `$ grep -R "rcu_read_lock" /usr/src/linux-headers-$(uname -r)/include/linux/` shows usage sites. |
| `wait_queue_head_t` + `wait_event` | `<linux/wait.h>` | Sleep until a condition becomes true (e.g., data arrival) | `$ cat /proc/<pid>/wchan` – shows the kernel function a thread is sleeping in (often a wait queue). |
| `completion` | `<linux/linux/compaction.h>` | One‑time event signalling between threads | `$ echo 1 > /proc/sys/kernel/rcu_normal` (not directly, but you can observe grace‑period duration via `cat /proc/softirqs`). |

### Concrete Shell Commands  

```bash
# 1. Observe mutex contention on a running system (requires perf)
sudo perf record -e sched:sched_switch -a sleep 5
sudo perf report | grep mutex

# 2. List all spinlocks held by the kernel (debugfs must be mounted)
sudo cat /proc/locks | grep -i spinlock   # shows POSIX file locks; kernel spinlocks appear via /proc/<pid>/fd if a process holds them via futex

# 3.
