---
id: 208
title: "Consistency basics"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
Consistency in a distributed system is the guarantee that all replicas observe a coherent view of shared state despite concurrency, failures, and network partitions.  
The strength of a consistency model is determined by what ordering constraints it imposes on operations:

* **Linearizability (strong consistency)** – each operation appears to take effect instantaneously at some point between its invocation and response, and the total order respects real‑time.  
* **Sequential consistency** – operations of each process appear in program order, but the global order may reorder across processes as long as every process sees the same order.  
* **Causal consistency** – only causally related operations must be seen in the same order by all replicas; concurrent operations may diverge.  
* **Eventual consistency** – if no new updates are made, all replicas will converge to the same state; no ordering guarantees are provided during updates.

These models sit on a spectrum dictated by the **CAP theorem**: in an asynchronous network subject to partitions, a system can simultaneously guarantee at most two of Consistency, Availability, and Partition tolerance. Choosing a weaker model (e.g., eventual) trades strict ordering for higher availability and lower latency.

The underlying mechanism that enforces any of these models is **replication** combined with a **coordination protocol**. Replication creates multiple copies; the coordination protocol dictates when a replica may acknowledge a write or serve a read, thereby shaping the visibility of updates.

## How It Works
### Replication and Quorum Systems
Consider a system with **N** replicas. A write is acknowledged after **W** replicas have durably stored it; a read returns the value after contacting **R** replicas and taking the version with the highest timestamp (or version vector).  

For a read to be guaranteed to see the latest completed write, the read and write quorums must intersect:

\[
R + W > N
\]

*Proof.* If the write quorum (size W) and read quorum (size R) were disjoint, there would exist a set of N − (W + R) replicas that saw neither the write nor the read, allowing the read to return an older value. Intersection prevents this. ∎  

From this we derive useful special cases:

* **Strict quorum (strong consistency)** – choose \(W = \lceil N/2 \rceil + 1\) and \(R = \lceil N/2 \rceil\). Then any read sees the latest write.  
* **Read‑your‑writes** – require \(W > N/2\) (a write is a majority) so that a subsequent read from any replica (R = 1) will overlap the write quorum.  
* **Eventual consistency** – set \(R + W \le N\); reads and writes may miss each other, relying on background anti‑entropy to converge.

### Consensus Protocols
Replicated state machines need agreement on the *order* of commands, not just their values. Consensus guarantees **safety** (all non‑faulty nodes decide the same value) and **liveness** (eventually a decision is made) under partial synchrony.

**Paxos** (single‑decree) works in two phases:

1. **Prepare/Promise** – a proposer selects a unique proposal number *n* and sends `Prepare(n)` to a majority. If a responder has not promised a higher number, it replies with a promise not to accept any proposal ≤ *n* and includes the highest-numbered value it has accepted (if any).  
2. **Accept/Accepted** – if the proposer receives promises from a majority, it chooses a value (its own if none reported, else the value from the highest-numbered promise) and sends `Accept(n, v)` to a majority. Responders accept unless they have promised a higher number; they then send `Accepted(n, v)` to learners.

Safety follows from the **quorum intersection** property: any two majorities overlap, ensuring that if a value is chosen in one round, any later proposer learns about it during its prepare phase and must reuse it. Liveness requires that eventually some proposer’s prepare requests are not delayed indefinitely (partial synchrony assumption).

**Raft** refines this by separating leader election, log replication, and safety:

* **Leader Election** – nodes start as followers; after an election timeout they become candidates, increment their term, and vote for themselves. A candidate that receives votes from a majority becomes leader.  
* **Log Replication** – the leader appends client commands to its log and sends `AppendEntries` RPCs to followers. An entry is considered *committed* once it is stored on a majority of nodes and the leader’s commitIndex advances.  
* **Safety** – the election restriction ensures that a candidate can win only if its log is at least as up‑to‑date as any other log (comparing term and index), preventing a newer leader from missing committed entries.

### Eventual Consistency Mechanisms
When the system opts for availability, convergence is achieved by **anti‑entropy** processes:

* **Gossip (epidemic) protocol** – each node periodically selects a random peer and exchanges state. With fan‑out *f*, the expected number of rounds to inform all *N* nodes is \(O(\log_{f} N)\).  
* **Version vectors** – each replica maintains a vector \(V[i]\) = number of updates originated at replica *i*. On receipt, a node updates each entry to \(\max(V_{local}[i], V_{peer}[i])\) and increments its own counter for local updates. Concurrent updates are detected when neither vector dominates the other.  
* **Conflict‑free Replicated Data Types (CRDTs)** – data types designed so that any two states can be merged by a deterministic, associative, commutative, and idempotent function. Example: a **grow‑only set (G‑Set)** where the merge is set union; a **PN‑counter** where increments and decrements are stored in two G‑Sets and the value is \(|\text{P}| - |\text{N}|\).

## Worked Examples
### Example 1: Quorum Read/Write (N=5)
Assume 5 replicas (A–E). Choose a write quorum \(W = 3\) and read quorum \(R = 3\) (satisfying \(R+W > N\)).  

1. **Write w1** (value = 42) from client C1:  
   - Coordinator sends `Write(w1,42)` to A, B, C.  
   - Each replica persists the entry and replies `Ack`.  
   - After 3 acks, w1 is considered committed.  

2. **Concurrent Write w2** (value = 99) from client C2:  
   - Coordinator contacts B, D, E.  
   - B already holds w1 (timestamp t1) and stores w2 with a higher timestamp t2.  

3. **Read r1** from client C3 contacting A, C, E:  
   - Replies: A(t1,42), C(t1,42), E(t2,99).  
   - The client picks the entry with the highest timestamp → value = 99 (w2).  

Even though w1 and w2 were concurrent, any read that contacts a majority will see the *later* timestamp because the write quorum (size 3) overlaps every possible read quorum (size 3). If we had chosen \(R = 2, W = 2\) (so \(R+W = 4 \le N\)), a read could hit A and C (both still holding only w1) and return 42, violating read‑your‑writes.

### Example 2: Paxos with Competing Proposals (N=5)
Proposal numbers are globally unique (e.g., node ID + local counter).  

| Step | Node | Action |
|------|------|--------|
| 1 | P1 (proposer) | Sends `Prepare(1)` to majority {A,B,C}. |
| 2 | A,B,C | No prior promises → reply `Promise(1, null)`. |
| 3 | P1 | Receives 3 promises → chooses value *v* = 7 (its own). Sends `Accept(1,7)` to {A,B,C}. |
| 4 | A,B,C | Accept unless promised higher → accept value 7, reply `Accepted(1,7)`. |
| 5 | P2 (competing proposer) | Sends `Prepare(3)` to {B,C,D} (higher number 3). |
| 6 | B,C | Have promised ≥1 → reply `Promise(3, (1,7))` (include highest accepted). |
| 7 | D | No prior promise → reply `Promise(3, null)`. |
| 8 | P2 | Receives promises from B,C,D → sees value 7 from B,C. Must use 7. Sends `Accept(3,7)` to {B,C,D}. |
| 9 | B,C,D | Accept 7 (no higher promise). Reply `Accepted(3,7)`. |
|10| Learners | Learn that 7 is chosen. |

Even though P2 started later, the prepare phase forced it to learn about the earlier accepted value and re‑propose it, preserving agreement.

### Example 3: Eventual Convergence with Version Vectors (3‑node counter)
Each node maintains a vector \([c_A, c_B, c_C]\) and a local counter value = sum of its vector.

Initial state: all \([0,0,0]\) → value 0.

1. Node A increments → local vector \([1,0,0]\), value 1.  
2. Node B increments → \([0,1,0]\), value 1.  
3. Node C increments → \([0,0,1]\), value 1.  

Now A and B gossip:

* A sends \([1,0,0]\) to B.  
* B updates its vector to \(\max([0,1,0],[1,0,0]) = [1,1,0]\).  
* B’s value becomes 2 (1+1).  

B then gossips with C:

* B sends \([1,1,0]\) to C.  
* C updates to \(\max([0,0,1],[1,1,0]) = [1,1,1]\).  
* C’s value becomes 3.  

A later gossips with C and converges to \([1,1,1]\) as well. After the gossip rounds, all nodes hold the same vector and agree the counter equals 3, despite the updates being concurrent and delivered in different orders.

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Assuming eventual consistency gives read‑your‑writes** | Eventual convergence only guarantees that *if* no new writes occur, replicas will agree. Without a read quorum overlapping the write quorum (\(R+W>N\)), a read may miss the latest write. | Stale reads, violations of application invariants (e.g., double‑spending). |
| **Believing synchronous replication eliminates latency** | Sync replication waits for the *slowest* replica in the write quorum. Latency = \(\max_i(\text{network}_i) + \text{processing}\). A single slow node or distant replica dominates. | Unpredictable tail latency, reduced throughput. |
| **Thinking Paxos guarantees liveness under fully asynchronous networks** | FLP impossibility shows deterministic consensus cannot guarantee termination in a purely asynchronous model with even one crash fault. Paxos requires eventual synchrony (or randomisation) for liveness. | System may hang indefinitely during prolonged network partitions. |
| **Using last‑writer‑wins with unsynchronized clocks** | LWW assumes the timestamp reflects real‑time order. Clock skew can cause an older update to win, silently discarding newer data. | Data loss, violation of causality. |
| **Confusing `fsync` with application‑level consistency** | `fsync(2)` forces the kernel to flush *its* buffers to the device, but does not ensure that other nodes see the data if replication is asynchronous or if the filesystem caches are not coherent across nodes. | Belief that a single‑node `sync` makes a distributed write durable, leading to inconsistency after a crash. |

## Exercises
### Easy – Quorum Simulation with Flock
Create a tmpfs directory with five files representing replicas. Implement a write that `flock`s on three files before writing, and a read that `flock`s on three files and picks the latest modification time.

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR=$(mktemp -d)
replicas=($DIR/{a..e})
quorum=3   # R=W=3

write() {
    local val=$1
    local ts=$(date +%s%N)
    # lock quorum replicas
    for i in $(seq 0 $((quorum-1))); do
        flock -x "${replicas[$i]}" echo "$ts $val" > "${replicas[$i]}"
    done
}

read_latest() {
    local latest_ts=0 latest_val=0
    for i in $(seq 0 $((quorum-1))); do
        flock -s "${replicas[$i]}" read ts val < "${replicas[$i]}"
        if (( ts > latest_ts )); then
            latest_ts=$ts
            latest_val=$val
        fi
    done
    echo "$latest_val"
}

# demo
write 42
echo "Read after write: $(read_latest)"
```

*What you learn*: how quorum intersection guarantees read‑your‑writes, and how locking mimics durable storage.

### Medium – Mini‑Paxos in Python
Implement a Paxos node that communicates over UDP sockets. Each node stores:
- `promised_num` (highest prepare promise)
- `accepted_num`, `accepted_val`
- `learned_val` (once a majority of Accepted messages are received)

Run three nodes on localhost ports 5000‑5002, have node 0 propose value 10, node 1 propose 20 concurrently, and verify that all nodes learn the same value.

*Deliverables*: Python script `paxos_node.py` with functions `prepare`, `promise`, `accept`, `accepted`, and a main loop that processes incoming packets.

### Hard – PN‑Counter CRDT in Go
Define a struct with two `map[uint64]int` fields `P` and `N` (increment and decrement counts). Implement:
- `Inc(id uint64)` – increment `P[id]`.
- `Dec(id uint64)` – increment `N[id]`.
- `Merge(other PNCounter)` – for each key, set `P[key] = max(P[key], other.P[key])`, similarly for `N`.
- `Value() int64` – sum(P) - sum(N).

Start three nodes, assign each a unique ID, apply random increments/decrements while partitioning the network (e.g., using `docker network disconnect`), then heal the partition and verify that all nodes converge to the same value.

*Learning outcome*: experience with state‑based CRDTs, merge monotonicity, and convergence under partitions.

## Linux Connection
### Filesystem Journaling & Synchronization
* **ext4/jbd2** – the journal resides in a hidden inode; `tune2fs -l /dev/sda1 | grep "Journal size"` shows its size.  
* **Mount options** – `data=ordered` (default) guarantees data blocks are written before their metadata is journaled; `data=journal` journals both data and metadata (higher safety, lower throughput).  
* **System calls** – `fdatasync(int fd)` flushes only user data (faster than `fsync` which also flushes metadata). `sync(2)` forces all dirty buffers to be written.  
* **Example**: ensure a log entry is durable before acknowledging:

```c
int log_fd = open("/var/log/app.log", O_WRONLY|O_CREAT|O_APPEND, 0644);
pwrite(log_fd, msg, len, offset);
fdatasync(log_fd);   // guarantee the log record is on disk
close(log_fd);
```

### Locking Mechanisms
* **fcntl advisory locks** – `F_SETLK` to acquire/release, `F_GETLK` to test. Works across processes on the same file.  
  ```c
  struct flock lock = { .l_type = F_WRLCK, .l_whence = SEEK_SET, .l_start = 0, .l_len = 0 };
  fcntl(fd, F_SETLKW, &lock);   // block until acquired
  // critical region
  lock.l_type = F_UNLCK;
  fcntl(fd, F_SETLK, &lock);
  ```
* **futex** – efficient userspace‑kernel synchronization for mutexes and condition variables.  
  ```c
  // simple spin lock using futex
  volatile int lock = 0;
  void lock_acquire() {
      while (__sync_val_compare_and_swap(&lock, 0, 1) != 0) {
          futex(&lock, FUTEX_WAIT, 1, NULL, NULL, 0);
      }
  }
  void lock_release() {
      lock = 0;
      futex(&lock, FUTEX_WAKE, 1, NULL, NULL, 0);
  }
  ```
* **seqlock** – used in the kernel for data that is read frequently and written infrequently (e.g., `xtime`). Writers take a spinlock, increment a sequence counter, write data, increment counter again; readers read the counter before and after to detect concurrent writes.

### Replication Subsystems
* **DRBD** – Distributed Replicated Block Device. Status via `drbdadm status`; configuration in `/etc/drbd.d/*.res`.  
  ```bash
  # promote node0 to primary
  drbdadm primary r0
  # on node1 (secondary)
  drbdadm secondary r0
  ```
* **Ceph RADOS** – object store with tunable replication (`osd pool set mypool size 3`).  
* **GlusterFS** – volume types: `replicate 3` creates three‑way synchronous replication.

### Consensus in Userspace
* **etcd** – implements Raft. CLI:  
  ```bash
  ETCDCTL_API=3 etcdctl endpoint status --cluster -w table
  etcdctl put /key value
  etcdctl get /key
  ```
* **ZooKeeper** – Zab protocol (similar to Paxos). `zkCli.sh -server host:2181` for basic commands.

### Memory Barriers & Atomic Primitives
* Kernel: `smp_mb()`, `smp_wmb()`, `smp_rmb()` enforce ordering of memory accesses across CPUs.  
* Userspace (gcc/clang): `__sync_synchronize()` or C11 `_Atomic` with `memory_order_seq_cst`.  
  Example: implementing a simple ticket lock with atomic fetch‑add.

```c
typedef struct {
    _Atomic unsigned int ticket;
    _Atomic unsigned int serving;
} ticket_lock_t;

void lock(ticket_lock_t *l) {
    unsigned int my = atomic_fetch_add_explicit(&l->ticket, 1, memory_order_relaxed);
    while (atomic_load_explicit(&l->serving, memory_order_acquire) != my) {
        // spin
    }
}
void unlock(ticket_lock_t *l) {
    atomic_store_explicit(&l->serving, l->serving + 1, memory_order_release);
}
```

Understanding these primitives clarifies why higher‑level constructs (mutexes, futexes, seqlocks) behave as they do.

## Why This Matters
Consistency is the invisible contract that lets a distributed system appear as a single, reliable machine. When that contract is violated—through stale reads, lost updates, or split‑brain states—applications lose correctness in ways that are often subtle and costly: financial transactions duplicate, cached views diverge, and recovery procedures become guesswork.

The mechanisms we examined turn abstract theory into concrete guarantees:

* **Quorum arithmetic** tells you exactly how many replicas must acknowledge a write for a read to be trustworthy, letting you tune latency versus safety.  
* **Consensus protocols** provide the foundation for replicated state machines that power orchestration platforms (Kubernetes’ etcd), configuration stores, and distributed databases; knowing their safety/liveness boundaries helps you avoid outages during partitions.  
* **Filesystem journaling and sync syscalls** ensure that a single node’s crash cannot corrupt on‑disk state, a prerequisite for any higher‑level replication to make sense.  
* **Locking primitives**—from `fcntl` to futexes—show how the kernel serial
