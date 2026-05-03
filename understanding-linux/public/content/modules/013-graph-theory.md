---
id: 13
title: "Graph theory"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every packet your Linux machine sends traverses a path chosen by a graph algorithm. The kernel's routing subsystem selects next-hops by minimizing a cost metric; `ospfd` and `bgpd` in FRRouting compute shortest paths over a weighted digraph of the entire network; `tc` enforces bandwidth guarantees by reasoning about flow capacity through queuing disciplines. When routing breaks — a BGP black hole, an OSPF routing loop, a `tc` configuration that drops traffic unexpectedly — the cause is almost always a violated algorithm precondition: a weight went negative, a cycle appeared where none was expected, or a cut capacity was saturated. The mathematics here is operational knowledge.

---

## Core Concepts

### Graphs: The Basic Model

A **graph** $G = (V, E)$ consists of a vertex set $V$ and an edge set $E \subseteq V \times V$. In a **weighted graph**, each edge $(u, v)$ carries a weight $w(u, v) \in \mathbb{R}$ modeling a cost metric — latency in microseconds, inverse bandwidth, OSPF administrative distance, or hop count.

A **directed graph** (digraph) uses ordered pairs: $(u, v) \neq (v, u)$. Routing tables are inherently directed — the path from host A to host B need not be the reverse of the path from B to A, and asymmetric routing is the default in any multi-homed network.

Graphs are typically represented in one of two ways:

- **Adjacency list:** $O(V + E)$ space, $O(\deg(u))$ time to enumerate neighbors of $u$. Preferred for sparse graphs like real networks.
- **Adjacency matrix:** $O(V^2)$ space, $O(1)$ edge lookup. Useful only when $|E| \approx |V|^2$.

### Shortest Paths

The **shortest path** from $s$ to $t$ is the path $P = (s = v_0, v_1, \ldots, v_k = t)$ minimizing:

$$\text{dist}(s, t) = \sum_{i=0}^{k-1} w(v_i, v_{i+1})$$

The reason shortest-path algorithms work incrementally is **optimal substructure**: if $(s, \ldots, u, v, \ldots, t)$ is a shortest path, then $(s, \ldots, u, v)$ is a shortest path from $s$ to $v$. Proof by contradiction: if a shorter path to $v$ existed, you could splice it in to produce a shorter full path, contradicting optimality. This property licenses dynamic programming and greedy relaxation.

**Dijkstra's algorithm** exploits the non-negative weight assumption to guarantee that once a vertex $u$ is extracted from the priority queue with distance $d$, no future relaxation can improve $d$. The argument: any remaining path through an unvisited vertex $x$ has cost at least $\text{dist}(s, x) \geq d$, so adding more edges can only increase it. This invariant breaks with negative weights because a later edge $(x, u)$ with $w < 0$ could reduce the already-finalized distance.

Time complexity with a binary heap: $O((V + E) \log V)$. With a Fibonacci heap: $O(E + V \log V)$, which matters when $|E| \gg |V|$.

**Bellman-Ford** relaxes every edge $|V| - 1$ times. The correctness argument: the shortest path in a graph with $|V|$ vertices visits at most $|V| - 1$ edges (no vertex repeated), so after $k$ iterations, all shortest paths using at most $k$ edges are correct. A $|V|$-th relaxation pass that still improves any distance proves a negative-weight cycle is reachable. Cost: $O(VE)$.

### Spanning Trees

A **spanning tree** of a connected graph $G$ on $n$ vertices is a subgraph that connects all $n$ vertices using exactly $n - 1$ edges with no cycles. These three conditions are equivalent — satisfying any two implies the third, because a connected acyclic graph on $n$ vertices must have exactly $n - 1$ edges (provable by induction: removing any leaf from a tree gives a tree on $n-1$ vertices).

The number of distinct spanning trees of the complete graph $K_n$ is given by **Cayley's formula**:

$$t(K_n) = n^{n-2}$$

For $K_4$: $t = 4^2 = 16$. This can be verified via the **matrix-tree theorem**: for any graph $G$, construct the **Laplacian matrix** $L$:

$$L_{ij} = \begin{cases} \deg(v_i) & i = j \\ -1 & (i,j) \in E \\ 0 & \text{otherwise} \end{cases}$$

The number of spanning trees equals any cofactor of $L$, or equivalently:

$$t(G) = \frac{1}{n} \prod_{i=1}^{n-1} \lambda_i$$

where $\lambda_1 \leq \lambda_2 \leq \cdots \leq \lambda_{n-1}$ are the nonzero eigenvalues of $L$ (the smallest eigenvalue is always 0, corresponding to the all-ones eigenvector).

For $K_4$, the eigenvalues of $L$ are $0, 4, 4, 4$, giving $t = \frac{1}{4}(4 \cdot 4 \cdot 4) = 16$. The Laplacian encodes the spanning tree count because its eigenstructure captures how "well-connected" each cut of the graph is — a near-zero eigenvalue (beyond the trivial one) signals a bottleneck that nearly disconnects the graph.

A **minimum spanning tree (MST)** minimizes $\sum_{(u,v) \in T} w(u,v)$ over all spanning trees $T$. MSTs solve the problem of connecting $n$ nodes with minimum total wire length, which maps directly to network infrastructure design.

**Kruskal's algorithm:** Sort all edges by weight. Iterate through them; add edge $(u,v)$ iff $u$ and $v$ are in different components (checked and merged with union-find). Correctness follows from the **cut property**: for any cut $(S, V \setminus S)$ with no tree edge crossing it, the minimum-weight crossing edge belongs to every MST. Complexity: $O(E \log E)$ dominated by the sort.

**Prim's algorithm:** Maintain a growing tree. At each step, add the minimum-weight edge connecting the tree to a non-tree vertex. This is identical in structure to Dijkstra — the difference is that Dijkstra tracks cumulative path cost while Prim tracks only the edge cost to join the tree. Complexity: $O((V + E) \log V)$ with a binary heap.

### Flows and Cuts

A **flow network** is a digraph where each edge $(u,v)$ has a **capacity** $c(u,v) \geq 0$. A **flow** $f$ is a function on edges satisfying:

$$0 \leq f(u, v) \leq c(u, v) \qquad \text{(capacity constraint)}$$

$$\sum_{u \in V} f(u, v) = \sum_{w \in V} f(v, w) \qquad \forall\, v \neq s, t \quad \text{(conservation)}$$

Conservation means flow into any intermediate node equals flow out — no buffering, no creation. The **value of a flow** is $|f| = \sum_{v} f(s, v) - \sum_{v} f(v, s)$.

A **cut** $(S, T)$ partitions $V$ with $s \in S$, $t \in T$. The capacity of the cut counts only forward edges (from $S$ to $T$):

$$c(S, T) = \sum_{\substack{u \in S \\ v \in T}} c(u, v)$$

**Max-flow min-cut theorem:** $\max |f| = \min c(S,T)$ over all $s$-$t$ cuts. The proof has two directions: (1) any flow value is bounded by any cut capacity because every unit of flow from $s$ to $t$ must cross the cut; (2) when Ford-Fulkerson terminates, the set $S$ of vertices reachable from $s$ in the residual graph defines a cut whose capacity exactly equals the flow found. This duality means bottleneck identification and maximum throughput are the same problem.

---

## How It Works

### Dijkstra's Algorithm in Detail

```python
import heapq

def dijkstra(graph, source):
    """
    graph: dict of {u: [(v, weight), ...]}
    Returns: dist dict where dist[v] = shortest distance from source to v.
    """
    dist = {v: float('inf') for v in graph}
    dist[source] = 0
    pq = [(0, source)]  # min-heap: (tentative distance, vertex)

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            # Stale entry: u was already finalized at a lower cost.
            # This happens because Python's heapq has no decrease-key;
            # we insert duplicates and skip obsolete ones.
            continue
        for v, w in graph[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                heapq.heappush(pq, (dist[v], v))

    return dist
```

The stale-entry check is not optional: without it, the algorithm may re-process a vertex after its distance was finalized, producing wasted work or (with negative weights) incorrect results. The check works because `dist[u]` holds the finalized value, and any heap entry with `d > dist[u]` was inserted before a better path was found.

**Why negative weights break this:** Suppose $\text{dist}(u) = 5$ is finalized. Later we discover an
