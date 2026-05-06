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

## Core Concepts
### Graphs and Representations
A **graph** $G = (V,E)$ consists of a finite set of vertices $V$ and a set of edges $E\subseteq V\times V$.  
- **Undirected** edges are unordered pairs $\{u,v\}$; **directed** edges are ordered pairs $(u,v)$.  
- A **weight function** $w:E\rightarrow\mathbb{R}_{\ge0}$ assigns a non‑negative cost to each edge (for unweighted graphs $w(e)=1$).  
- A graph is **simple** if it contains no self‑loops and at most one edge between any pair of vertices; otherwise it may be a **multigraph**.  

Two standard representations affect both space and runtime:  

| Representation | Space | Edge‑existence test | Typical use |
|----------------|-------|---------------------|-------------|
| Adjacency matrix $A\in\{0,1\}^{|V|\times|V|}$ (or $w_{ij}$ for weighted) | $\Theta(|V|^2)$ | $O(1)$ | Dense graphs, algebraic methods |
| Adjacency list: for each $v$, a list of $(u,w(v,u))$ | $\Theta(|V|+|E|)$ | $O(\deg(v))$ | Sparse graphs, graph traversals |
| Incidence matrix $B\in\{0,1\}^{|V|\times|E|}$ | $\Theta(|V|\cdot|E|)$ | $O(|V|)$ | Rare, used in circuit theory |

For an undirected graph the **handshaking lemma** holds: $\displaystyle\sum_{v\in V}\deg(v)=2|E|$.  

### Walks, Paths, and Connectivity
- A **walk** is a sequence $v_0,e_1,v_1,\dots,e_k,v_k$ where each $e_i=(v_{i-1},v_i)$.  
- A **path** is a walk with all vertices distinct (except possibly $v_0=v_k$ for a cycle).  
- A graph is **connected** (undirected) if every pair of vertices is joined by a path; for directed graphs we distinguish **weakly** (ignore direction) and **strongly** (directed paths both ways) connected.  
- **Strongly connected components (SCC)** partition a digraph; they can be found in $O(|V|+|E|)$ by Kosaraju’s or Tarjan’s algorithm.  

### Trees and Spanning Trees
A **tree** is an acyclic connected graph; a **forest** is a disjoint union of trees.  
- A **spanning tree** of $G$ is a tree that contains all vertices of $G$.  
- If edges are weighted, a **minimum spanning tree (MST)** minimizes $\displaystyle\sum_{e\in T} w(e)$.  
Two fundamental properties guide MST algorithms:  

1. **Cut Property** – For any cut $(S,V\!\setminus\!S)$, the minimum‑weight edge crossing the cut belongs to *some* MST.  
2. **Cycle Property** – For any cycle, the maximum‑weight edge on the cycle belongs to *no* MST.  

These properties justify greedy selection in Kruskal’s and Prim’s algorithms.

### Flows, Cuts, and the Max‑Flow Min‑Cut Theorem
A **flow network** is a directed graph $G=(V,E)$ with a source $s\in V$, sink $t\in V$, and a capacity function $c:E\rightarrow\mathbb{R}_{\ge0}$.  
A **flow** $f:E\rightarrow\mathbb{R}_{\ge0}$ satisfies:  

- **Capacity constraint**: $0\le f(e)\le c(e)$ for all $e\in E$.  
- **Flow conservation**: $\forall v\in V\setminus\{s,t\},\;\sum_{e\in\text{in}(v)}f(e)=\sum_{e\in\text{out}(v)}f(e)$.  

The **value** of a flow is $\displaystyle|f|=\sum_{e\in\text{out}(s)}f(e)-\sum_{e\in\text{in}(s)}f(e)$.  

An **$(S,T)$ cut** partitions $V$ into $S\ni s$ and $T\ni t$; its capacity is $c(S,T)=\sum_{u\in S,\,v\in T}c(u,v)$.  

**Max‑Flow Min‑Cut Theorem**: The maximum possible flow value equals the minimum capacity of any $s\!-\!t$ cut.  
Consequently, any algorithm that repeatedly finds an **augmenting path** in the *residual network* $G_f$ (where residual capacity $c_f(u,v)=c(u,v)-f(u,v)$ plus reverse edges) and augments flow along it will terminate at a max flow when no $s\!-\!t$ path remains in $G_f$.

## How It Works
### Dijkstra’s Algorithm – Single‑Source Shortest Paths (non‑negative weights)
**Idea** – Maintain a set $S$ of vertices whose shortest‑path distance from the source $s$ is finalized. At each step extract the vertex $u\notin S$ with smallest tentative distance $d[u]$; by the *cut property* of shortest paths, $d[u]$ equals the true shortest distance, so $u$ can be added to $S$.  

**Data structure** – A min‑priority queue keyed by $d[\cdot]$. With a binary heap each `extract‑min` and `decrease‑key` costs $O(\log V)$, giving $O((V+E)\log V)$. A Fibonacci heap improves this to $O(E+V\log V)$; in practice binary heaps are preferred due to low constant factors.

**Correctness sketch** – Induction on $|S|$: Assume all vertices in $S$ have correct distances. Let $u$ be the next extracted vertex. Any $s\!\to\!u$ path must leave $S$ at some edge $(x,y)$ with $x\in S$, $y\notin S$. By the induction hypothesis $d[x]=\delta(s,x)$. Because $u$ has the smallest key, $d[u]\le d[x]+w(x,y)$. Moreover, any path to $y$ has length at least $d[x]+w(x,y)$ (otherwise $y$ would have a smaller key). Hence $d[u]=\delta(s,u)$.  

**C implementation (adjacency list + binary heap)**  
```c
/* dijkstra.c – O((V+E) log V) */
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>

typedef struct Edge {
    int to;
    int weight;
    struct Edge *next;
} Edge;

typedef struct Vertex {
    Edge *head;
} Vertex;

/* Min‑heap of (dist, vertex) */
typedef struct HeapNode {
    int dist;
    int v;
} HeapNode;

static void heap_push(HeapNode *h, int *size, HeapNode x) {
    int i = (*size)++;
    while (i && h[(i-1)/2].dist > x.dist) {
        h[i] = h[(i-1)/2];
        i = (i-1)/2;
    }
    h[i] = x;
}
static HeapNode heap_pop(HeapNode *h, int *size) {
    HeapNode ret = h[0];
    HeapNode last = h[--(*size)];
    int i = 0;
    while (1) {
        int left = 2*i+1, right = left+1, smallest = i;
        if (left < *size && h[left].dist < h[smallest].dist) smallest = left;
        if (right < *size && h[right].dist < h[smallest].dist) smallest = right;
        if (smallest == i) break;
        h[i] = h[smallest];
        i = smallest;
    }
    h[i] = last;
    return ret;
}

/* Returns array dist[0..V-1]; caller must free */
int *dijkstra(Vertex *g, int V, int source) {
    int *dist = calloc(V, sizeof(int));
    for (int i = 0; i < V; ++i) dist[i] = INT_MAX;
    dist[source] = 0;

    HeapNode *pq = malloc(V * sizeof(HeapNode));
    int pq_size = 0;
    heap_push(pq, &pq_size, (HeapNode){0, source});

    while (pq_size) {
        HeapNode cur = heap_pop(pq, &pq_size);
        int u = cur.v, d = cur.dist;
        if (d != dist[u]) continue;          /* stale entry */
        for (Edge *e = g[u].head; e; e = e->next) {
            int v = e->to;
            int nd = d + e->weight;
            if (nd < dist[v]) {
                dist[v] = nd;
                heap_push(pq, &pq_size, (HeapNode){nd, v});
            }
        }
    }
    free(pq);
    return dist;
}
```
*Notes* – The algorithm tolerates duplicate heap entries; outdated entries are ignored by the `if (d != dist[u])` test. This avoids a costly `decrease‑key` operation.

### Bellman‑Ford Algorithm – Single‑Source Shortest Paths (arbitrary weights)
**Idea** – Repeatedly relax all edges $|V|-1$ times. After $k$ iterations, any path using at most $k$ edges has its correct distance recorded. Since a shortest simple path contains at most $|V|-1$ edges, after $|V|-1$ passes all distances are optimal. A final pass detects a negative‑weight cycle: if any distance improves, a negative cycle reachable from the source exists.

**Complexity** – $\Theta(VE)$ time, $O(V)$ space.

**C implementation**  
```c
/* bellman_ford.c – O(VE) */
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>

typedef struct Edge { int u, v, w; } Edge;

int *bellman_ford(int V, Edge *edges, int E, int source) {
    int *dist = calloc(V, sizeof(int));
    for (int i = 0; i < V; ++i) dist[i] = INT_MAX;
    dist[source] = 0;

    for (int i = 0; i < V-1; ++i) {
        int updated = 0;
        for (int j = 0; j < E; ++j) {
            Edge e = edges[j];
            if (dist[e.u] != INT_MAX && dist[e.u] + e.w < dist[e.v]) {
                dist[e.v] = dist[e.u] + e.w;
                updated = 1;
            }
        }
        if (!updated) break;          /* early exit */
    }

    /* negative‑cycle detection */
    for (int j = 0; j < E; ++j) {
        Edge e = edges[j];
        if (dist[e.u] != INT_MAX && dist[e.u] + e.w < dist[e.v])
            return NULL;               /* signal negative cycle */
    }
    return dist;
}
```
*Why the $V-1$ bound?* Any simple path can contain at most $V-1$ edges; if a shorter path existed with a cycle, removing the cycle yields a strictly shorter simple path, contradicting minimality.

### Kruskal’s Algorithm – Minimum Spanning Tree
**Idea** – Process edges in non‑decreasing weight order; add an edge iff it connects two different components (i.e., does not create a cycle). The cut property guarantees safety of each added edge.

**Data structure** – Disjoint‑set union (union‑find) with path compression and union by rank yields amortized $O(\alpha(V))$ per operation ($\alpha$ = inverse Ackermann, <5 for any realistic $V$). Sorting dominates: $O(E\log E)=O(E\log V)$.

**C snippet**  
```c
/* kruskal.c – O(E log V) */
#include <stdio.h>
#include <stdlib.h>

typedef struct Edge { int u, v, w; } Edge;

int cmp(const void *a, const void *b) {
    return ((Edge*)a)->w - ((Edge*)b)->w;
}

/* Union‑Find */
typedef struct UF {
    int *parent, *rank;
    int n;
} UF;

UF *uf_make(int n) {
    UF *uf = malloc(sizeof(UF));
    uf->n = n;
    uf->parent = malloc(n*sizeof(int));
    uf->rank   = malloc(n*sizeof(int));
    for (int i=0;i<n;++i) { uf->parent[i]=i; uf->rank[i]=0; }
    return uf;
}
int uf_find(UF *uf, int x) {
    if (uf->parent[x]!=x)
        uf->parent[x]=uf_find(uf, uf->parent[x]);
    return uf->parent[x];
}
void uf_union(UF *uf, int a, int b) {
    a = uf_find(uf, a); b = uf_find(uf, b);
    if (a==b) return;
    if (uf->rank[a] < uf->rank[b]) uf->parent[a]=b;
    else if (uf->rank[a] > uf->rank[b]) uf->parent[b]=a;
    else { uf->parent[b]=a; uf->rank[a]++; }
}

/* Returns total weight of MST */
long kruskal(int V, Edge *edges, int E) {
    qsort(edges, E, sizeof(Edge), cmp);
    UF *uf = uf_make(V);
    long mst_weight = 0;
    int edges_taken = 0;
    for (int i=0;i<E && edges_taken<V-1;++i) {
        Edge e = edges[i];
        if (uf_find(uf, e.u) != uf_find(uf, e.v)) {
            uf_union(uf, e.u, e.v);
            mst_weight += e.w;
            ++edges_taken;
        }
    }
    free(uf->parent); free(uf->rank); free(uf);
    return mst_weight;
}
```

### Prim’s Algorithm – Minimum Spanning Tree
**Idea** – Grow a tree $T$ from an arbitrary start vertex. Maintain for each vertex $v\notin T$ the cheapest edge connecting $v$ to $T$ (its *key*). Repeatedly extract the vertex with minimum key and add its incident edge to $T$. This is essentially Dijkstra’s algorithm where the path cost is replaced by edge weight.

**Complexity** – With a binary heap: $O(E\log V)$; with a Fibonacci heap: $O(E+V\log V)$.

**C implementation (lazy heap, similar to Dijkstra)**  
```c
/* prim.c – O(E log V) */
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>

typedef struct Edge { int to, weight; struct Edge *next; } Edge;
typedef struct Vertex { Edge *head; } Vertex;

typedef struct HeapNode { int key; int v; } HeapNode;

/* same heap helpers as Dijkstra omitted for brevity */
int *prim(Vertex *g, int V, int start, long *total_weight) {
    int *in_mst = calloc(V, sizeof(int));
    int *key    = malloc(V*sizeof(int));
    int *parent = malloc(V*sizeof(int));   /* not required for weight only */
    for (int i=0;i<V;++i) key[i]=INT_MAX;
    key[start]=0;
    HeapNode *pq = malloc(V*sizeof(HeapNode));
    int pq_size=0;
    heap_push(pq,&pq_size,(HeapNode){0,start});

    while (pq_size) {
        HeapNode cur = heap_pop(pq,&pq_size);
        int u = cur.v;
        if (in_mst[u]) continue;
        in_mst[u]=1;
        if (parent[u]!=-1) *total_weight += cur.key;
        for (Edge *e=g[u].head; e; e=e->next) {
            int v=e->to;
            if (!in_mst[v] && e->weight < key[v]) {
                key[v]=e->weight;
                parent[v]=u;
                heap_push(pq,&pq_size,(HeapNode){e->weight,v});
            }
        }
    }
    free(key); free(parent); free(pq);
    return in_mst;   /* caller can inspect which vertices are in MST */
}
```

### Maximum Flow – Edmonds‑Karp (BFS‑based Ford‑Fulkerson)
**Idea** – Each augmentation uses a *shortest* (fewest edges) $s\!-\!t$ path in the residual graph, found by BFS. Lemma: the distance from $s$ to $t$ in the residual graph monotonically increases after each augmentation, and can increase at most $V-1$ times before becoming $\infty$. Hence $O(VE)$ augmentations, each $O(E)$ → $O(VE^2)$.

**C implementation (edge list with forward/reverse indices)**  
```c
/* edmonds_karp.c – O(V E^2) */
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>

typedef struct Edge {
    int to, rev;      /* index of reverse edge in adjacency list of 'to' */
    int cap;
} Edge;

typedef struct Graph {
    int n;
    Edge **adj;       /* adj[v] = dynamic array of Edge */
} Graph;

Graph *graph_new(int n) {
    Graph *g = malloc(sizeof(Graph));
    g->n = n;
    g->adj = calloc(n, sizeof(Edge*));
    return g;
}
void add_edge(Graph *g, int fr, int to, int cap) {
    Edge fwd = { .to = to, .rev = 0, .cap = cap };
    Edge rev = { .to = fr, .rev = 0, .cap = 0 };
    fwd.rev = (int)(sizeof(Edge)*(g->adj[to]?1:0)); /* placeholder */
    rev.rev = (int)(sizeof(Edge)*(g->adj[fr]?1:0));
    /* Simplify: push then fix rev indices */
    Edge *tmp = realloc(g->adj[fr], ( (g->adj[fr]?1:0)+1 ) * sizeof(Edge));
    g->adj[fr] = tmp;
    g->adj[fr][ (g->adj[fr]?1:0)-1 ] = fwd;
    tmp = realloc(g->adj[to], ( (g->adj[to]?1:0)+1 ) * sizeof(Edge));
    g->adj[to] = tmp;
    g->adj[to][ (g->adj[to]?1:0)-1 ] = rev;
    /* now set rev indices correctly */
    g->adj[fr][ (g->adj[fr]?1:0)-1 ].rev = (int)(g->adj[to]? ( (g->adj[to]?1:0)-1 ) : 0);
    g->adj[to][ (g->adj[to]?1:0)-1 ].rev = (int)(g->adj[fr]? ( (g->adj[fr]?1:0)-1
