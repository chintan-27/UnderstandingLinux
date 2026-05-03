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

## Why This Matters

When a single machine holds your data, correctness is trivial: writes are serialized through one CPU, one memory bus, one disk controller. The moment you replicate across nodes, that serialization disappears. Two nodes receiving concurrent writes have no shared clock, no shared memory, and no instantaneous communication channel — so they cannot agree on ordering without explicitly coordinating. That coordination has a cost measured in network round trips, and every design decision in distributed storage is about where to pay that cost, how much of it to defer, and what breaks when you defer too much.

## Core Concepts

### Replication

Every replica of a dataset is a bet: you're trading write complexity for read availability and fault tolerance. The two strategies differ in *when* you collect on that bet.

- **Synchronous replication**: The primary waits for all replicas to confirm the write before acknowledging to the client. Durability is guaranteed — a committed write exists on every node — but write latency is at least $2 \times RTT_{\max}$ where $RTT_{\max}$ is the round-trip time to the slowest replica. Worse, a single unavailable replica blocks *all* writes. With $N$ replicas, the probability that at least one is unavailable at any moment is $1 - (1-p)^N$ for per-node failure probability $p$, which grows quickly with $N$.

- **Asynchronous replication**: The primary acknowledges the client after committing locally and replicates in the background. Write latency drops to local disk latency, but replicas lag behind by a time $\Delta t$ that is bounded below by network RTT and unbounded above — a stalled replica falls arbitrarily far behind. Reads from lagging replicas return stale data, and if the primary crashes before replication completes, committed writes are permanently lost.

This is not an implementation deficiency. The **CAP theorem** proves that under a network partition — two subsets of nodes that cannot communicate — any system must choose between returning a consistent answer (which may require blocking until the partition heals) or returning an available answer (which may be stale). You cannot have both. Every distributed storage system you encounter has made this choice, usually implicitly.

### Consensus Intuition

Consensus is the problem of getting $N$ nodes to irrevocably agree on one value from a set of proposals, tolerating up to $f$ node failures. The core difficulty: any node could fail mid-protocol, and messages can be arbitrarily delayed, so no node can distinguish a slow node from a dead one.

The mechanism that makes consensus possible is a **quorum**: requiring a majority $Q > N/2$ before committing. Any two majorities of an $N$-node cluster share at least one node in common:

$$Q = \left\lfloor \frac{N}{2} \right\rfloor + 1$$

With $N = 5$, $Q = 3$. If one quorum commits value $v$, any subsequent quorum must include at least one node that witnessed that commit. That node rejects any proposal for a different value, making it impossible for two conflicting values to both achieve quorum. This overlap is the entire foundation of protocols like Paxos and Raft.

The cost: committing one value requires at minimum two network round trips (propose → promise → accept → accepted), and the protocol must handle message loss, duplicate messages, and nodes that rejoin after crashing mid-round. A commit under Raft takes at minimum:

$$T_{\text{commit}} \geq 2 \times RTT_{\text{leader} \leftrightarrow \text{follower}}$$

This is why systems treat consensus as a scarce resource and avoid it on every write.

### Eventual Consistency

Eventual consistency is a **liveness** property, not a safety property. It guarantees: if writes stop, all replicas converge to the same value — eventually. It makes no promise about *when*, and no promise about what intermediate values a reader observes. Two clients reading from different replicas during convergence can see different values for the same key simultaneously.

This weakness is also its strength: no coordination means writes never block on replica availability. The system accepts every write immediately and reconciles later.

The hard part is reconciliation. If two clients write different values to the same key during a partition, both writes succeed, and you have a genuine conflict with no obvious winner. Resolution strategies:

- **Last-write-wins (LWW)**: Use timestamps to pick the newer write. Problem: clocks on distributed nodes are not synchronized. A write with a higher timestamp is not necessarily later in wall-clock time. LWW silently discards writes.
- **Merge functions**: Application-defined logic to combine conflicting values. Correct but requires the application to reason about every possible conflict.
- **CRDTs**: Data structures whose merge operation is mathematically guaranteed to produce the same result regardless of order, covered below.

## How It Works

### Replication Lag and Read-Your-Writes

In a primary-replica setup, every write hits the primary and replicates asynchronously. The sequence looks like:

```
T=0ms:   Client  → Primary:  SET x = 42   (primary commits to WAL)
T=0ms:   Primary → Client:   ACK
T=50ms:  Primary → Replica:  replicate x = 42
T=50ms:  Replica:            commits x = 42
```

A read from the replica at $T = 10\text{ms}$ returns the old value. The lag $\Delta t = 50\text{ms}$ here is network-bound, but under replica load it can grow to minutes.

**Read-your-writes** is a session guarantee that prevents a client from observing its own write disappear. Two implementation strategies:

1. **Primary routing**: After any write, route all reads for that session to the primary for a window of $W$ seconds. Correct but increases primary load and adds latency for geographically distant clients.
2. **Replication position tracking**: The primary returns the log sequence number (LSN) with each write acknowledgment. Before serving a read, the replica checks whether it has replicated past that LSN. If not, it either waits or redirects to the primary.

In PostgreSQL, this is observable directly:

```bash
# On the primary — current WAL write position
psql -c "SELECT pg_current_wal_lsn();"

# On a replica — how far behind the primary it is
psql -c "SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"

# Replay lag in bytes
psql -c "SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn());"
```

If the byte lag is nonzero, the replica is serving stale reads for any keys written since that LSN.

### Raft Leader Election: The Quorum in Practice

Raft partitions time into **terms**, each identified by a monotonically increasing integer. A new term begins whenever a node suspects the leader has failed. The suspicion mechanism is a randomized election timeout $T_e \sim \text{Uniform}(150\text{ms}, 300\text{ms})$: if no heartbeat arrives within $T_e$, the node starts an election.

Election procedure:

1. Increment local term. Transition to **Candidate**. Vote for self.
2. Broadcast `RequestVote(term, candidateId, lastLogIndex, lastLogTerm)` to all peers.
3. A peer grants a vote only if both conditions hold:
   - `term >= peer.currentTerm` (candidate is not behind)
   - candidate's log is at least as up-to-date as peer's log (last log term is higher, or same term with equal or longer log)
4. Receiving votes from $Q = \lfloor N/2 \rfloor + 1$ nodes → transition to **Leader**.

The randomized timeout is not cosmetic. Without it, all nodes time out simultaneously, all start elections simultaneously, and votes split indefinitely. With randomization, the first node to time out typically wins before others even start. In the rare case of a split vote, the next timeout round resolves it, with a new random delay for each node.

The safety invariant: **at most one leader per term**. Two candidates cannot both reach $Q$ votes from the same $N$ nodes, because the total votes available is $N < 2Q$.

Once elected, the leader commits entries by replicating them to followers:

$$\text{entry committed} \iff \text{stored on} \geq \left\lfloor \frac{N}{2} \right\rfloor + 1 \text{ nodes}$$

A leader crash before an entry achieves quorum leaves that entry uncommitted. The next leader may or may not carry it forward, depending on whether it appears in the logs of nodes that participate in the next quorum. This is why the vote grant condition checks log freshness — it prevents a node with a stale log from becoming leader and overwriting committed entries.

### CRDTs: Convergence Without Coordination

A CRDT is a data structure where the **merge** operation is a join on a semilattice: it is associative, commutative, and idempotent. These three properties together guarantee that any two replicas, merging in any order with any number of duplicates, converge to the same state.

$$\text{merge}(x, x) = x \qquad \text{(idempotent)}$$
$$\text{merge}(x, y) = \text{merge}(y, x) \qquad \text{(commutative)}$$
$$\text{merge}(x, \text{merge}(y, z)) = \text{merge}(\text{merge}(x, y), z) \qquad \text{(associative)}$$

**G-Counter** (grow-only counter): Each of $N$ nodes maintains one slot in a vector, and only ever increments its own slot. The merge takes the element-wise maximum.

```
Node A state: [3, 0, 0]    # A has incremented 3 times
Node B state: [0, 5, 0]    # B has incremented 5 times
Node C state: [0, 0, 2]    # C has incremented 2 times

merge(A, B)       = [max(3,0), max(0,5), max(0,0)] = [3, 5, 0]
merge([3,5,0], C) = [max(3,0), max(5,0), max(0,2)] = [
