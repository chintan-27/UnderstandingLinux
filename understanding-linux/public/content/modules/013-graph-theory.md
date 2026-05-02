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

## Module 13: Graph Theory — Shortest Paths, Spanning Trees, Flows, Cuts, and Routing

## Why This Matters

Every packet your Linux machine sends traverses a weighted directed graph. When the kernel's routing subsystem selects an interface, it is solving a shortest-path problem on a graph whose vertices are routers and whose edge weights encode metrics like hop count, bandwidth, or administrative preference. When OSPF floods link-state advertisements and computes paths with Dijkstra, it is doing exactly the algorithm described below — on real hardware, with real convergence deadlines. When an 802.1D bridge runs STP, it is constructing a spanning tree to prevent the broadcast storms that would otherwise result from cycles in a switched Ethernet topology. These are not analogies. The implementations are direct translations of the mathematics.

## Core Concepts

### Graphs: Directed, Undirected, Weighted

A graph $G = (V, E)$ consists of a vertex set $V$ and an edge set $E \subseteq V \times V$. In a **directed** graph, $(u, v) \neq (v, u)$: the edge from $u$ to $v$ is distinct from the edge back. In an **undirected** graph, edges are unordered pairs $\{u, v\}$. A **weighted** graph assigns a real-valued cost $w: E \to \mathbb{R}$ to each edge.

Direction matters because real networks are asymmetric. A BGP session may carry different route policies in each direction. An iptables rule may permit TCP from inside to outside but not the reverse. A fiber link may have asymmetric latency under load. A model that collapses directed edges into undirected ones will produce incorrect paths.

### Shortest Paths

The shortest path from $s$ to $t$ is the path $v_0, v_1, \ldots, v_k$ with $v_0 = s$, $v_k = t$ minimizing:

$$d(s,t) = \min_{\text{paths } P} \sum_{i=0}^{k-1} w(v_i, v_{i+1})$$

The key structural fact enabling efficient computation is **optimal substructure**: any subpath of a shortest path is itself a shortest path. Proof by contradiction — if the subpath $s \to \cdots \to u$ within an optimal $s \to t$ path were not optimal to $u$, substituting the cheaper subpath would reduce the total cost, contradicting optimality. This is why dynamic programming and greedy relaxation both work here.

**Negative cycles** invalidate the problem. A cycle with total weight $\sum_{i} w(e_i) < 0$ can be traversed arbitrarily many times, driving $d(s,t) \to -\infty$ for any $t$ reachable from it. Dijkstra assumes all edge weights are non-negative; it will produce wrong answers silently on graphs with negative edges — not just negative cycles, but any negative edge. Bellman-Ford handles negative edges and detects negative cycles, at the cost of $O(|V| \cdot |E|)$ time instead of $O((|V| + |E|) \log |V|)$.

### Spanning Trees

A **spanning tree** of a connected undirected graph $G = (V, E)$ is a subgraph that includes every vertex, is connected, and contains no cycles. Any such tree has exactly $|V| - 1$ edges — fewer and it disconnects; more and it must contain a cycle.

The total number of spanning trees of the complete graph $K_n$ is given by **Cayley's formula**:

$$t(K_n) = n^{n-2}$$

For $n = 4$: $t(K_4) = 4^2 = 16$. This counts distinct labeled trees — each is a different subset of edges.

A **minimum spanning tree** (MST) minimizes the sum of edge weights:

$$\text{MST} = \arg\min_{T \text{ spanning tree}} \sum_{e \in T} w(e)$$

The MST is the cheapest connected subgraph. In a network, "cheapest to connect all nodes" is exactly what you want when laying cable or configuring a backbone: all nodes reachable, no redundant links wasting capacity, total cost minimized. The acyclicity is a consequence of the tree structure, not an independent constraint — but it has the operational benefit of eliminating broadcast loops.

### Flows and Cuts

A **flow network** is a directed graph where each edge $(u,v)$ has capacity $c(u,v) \geq 0$. A **flow** $f$ assigns a value to each edge satisfying two constraints:

$$0 \leq f(u,v) \leq c(u,v) \qquad \text{(capacity)}$$

$$\sum_{v} f(u,v) = \sum_{v} f(v,u) \qquad \forall u \neq s, t \qquad \text{(conservation)}$$

Conservation says: everything that flows into an intermediate node flows back out. No node accumulates or generates flow except the source $s$ and sink $t$.

The **value** of the flow is the net output of the source:

$$|f| = \sum_v f(s,v) - \sum_v f(v,s)$$

A **cut** $(S, T)$ partitions $V$ with $s \in S$, $t \in T$. Its capacity is the total capacity of edges crossing from $S$ to $T$:

$$c(S,T) = \sum_{\substack{u \in S \\ v \in T}} c(u,v)$$

Note: edges from $T$ to $S$ do not count toward cut capacity. This asymmetry is intentional — those edges do not block flow from $s$ to $t$.

**Max-Flow Min-Cut Theorem**: For any flow network,

$$\max |f| = \min_{(S,T) \text{ cut}} c(S,T)$$

The proof has two directions: (1) no flow can exceed any cut's capacity because every unit of flow from $s$ to $t$ must cross the cut; (2) when the Ford-Fulkerson algorithm terminates with no augmenting path, the set of vertices reachable from $s$ in the residual graph defines a cut whose capacity equals the current flow. The theorem gives you something operationally useful: the minimum cut identifies exactly which edges are the bottleneck. Remove them and you disconnect source from sink with minimum capacity cost — directly applicable to network partitioning and fault analysis.

## How It Works

### Dijkstra's Algorithm

Dijkstra maintains a tentative distance $d[v]$ for each vertex, initialized to $d[s] = 0$ and $d[v] = \infty$ for $v \neq s$. It repeatedly extracts the unvisited vertex $u$ with minimum $d[u]$, then **relaxes** each outgoing edge:

$$d[v] \leftarrow \min\!\bigl(d[v],\ d[u] + w(u,v)\bigr)$$

The invariant maintained after each extraction: the extracted vertex has its true shortest-path distance. This holds because all edge weights are non-negative — no future path can improve on a distance already finalized, since adding more non-negative edges can only increase cost.

```python
import heapq

def dijkstra(graph, source):
    """
    graph: dict mapping vertex -> list of (weight, neighbor)
    Returns: dict of shortest distances from source
    """
    dist = {v: float('inf') for v in graph}
    dist[source] = 0
    pq = [(0, source)]  # (tentative distance, vertex)

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue  # stale heap entry; u already finalized at lower cost
        for w, v in graph[u]:
            nd = dist[u] + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist
```

The stale-entry check (`if d > dist[u]: continue`) is load-bearing. Python's `heapq` does not support decrease-key, so when a vertex's distance improves, the old entry stays in the heap. Without this check, you process a vertex multiple times and may relax edges from an outdated distance.

**Complexity**: With a binary heap, each vertex is extracted once — $O(|V| \log |V|)$ — and each edge triggers at most one heap push — $O(|E| \log |V|)$ — for a total of $O((|V| + |E|) \log |V|)$. With a Fibonacci heap, decrease-key costs $O(1)$ amortized, yielding $O(|E| + |V| \log |V|)$. The Fibonacci heap bound matters when the graph is dense: for $|E| = \Theta(|V|^2)$, binary-heap Dijkstra is $O(|V|^2 \log |V|)$ while Fibonacci-heap Dijkstra is $O(|V|^2)$.

### Bellman-Ford

Bellman-Ford relaxes **all** edges $|V| - 1$ times. After $k$ iterations, $d[v]$ holds the shortest path using at most $k$ edges. Since any simple shortest path uses at most $|V| - 1$ edges, $|V| - 1$ iterations suffice. A $|V|$-th pass that still reduces any $d[v]$ proves a negative cycle exists.

```python
def bellman_ford(edges, vertices, source):
    """
    edges: list of (u, v, weight)
    Returns: (dist dict, negative_cycle: bool)
    """
    dist = {v: float('inf') for v in vertices}
    dist[source] = 0

    for _ in range(len(vertices) - 1):
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w

    # Detect negative cycle
    for u, v, w in edges:
        if dist[u] + w < dist[v]:
