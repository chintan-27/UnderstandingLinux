---
id: 8
title: "Discrete mathematics"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Core Concepts
### Discrete Mathematics
Discrete mathematics studies structures that are fundamentally countable—integers, graphs, sets, and formal languages—rather than continua. Its importance in computer science stems from the fact that data stored in memory is ultimately a finite arrangement of bits; reasoning about algorithms therefore reduces to reasoning about discrete objects.  

### Logic and Proof
A proposition is a declarative sentence that is either true or false. Logical connectives (¬, ∧, ∨, →, ↔) combine propositions into compound statements whose truth values are given by truth tables. A proof is a finite sequence of propositions where each follows from earlier ones by a rule of inference (modus ponens, universal instantiation, etc.). The soundness of these rules guarantees that if the premises are true, the conclusion must be true—this is why proofs give certainty beyond empirical testing.  

### Induction
Mathematical induction proves statements of the form ∀n∈ℕ P(n). It consists of two steps:  

1. **Base case**: Show P(0) (or P(1)) holds.  
2. **Inductive step**: Assume P(k) (induction hypothesis) and prove P(k+1).  

The principle follows from the well‑ordering of ℕ: if there existed a smallest counter‑example, the inductive step would produce a smaller one, a contradiction. Thus induction lets us lift a local truth to an infinite domain.  

### Sets and Relations
A set S is an unordered collection of distinct elements; membership is denoted x∈S. The Cartesian product S×T = {(s,t) | s∈S, t∈T} forms ordered pairs. A relation R⊆S×T is any subset of this product; it encodes which pairs are related. Properties such as reflexivity (∀x (x,x)∈R), symmetry, and transitivity are defined directly from this set‑theoretic view, enabling precise reasoning about equivalence and order.  

### Functions
A function f:S→T is a relation where each s∈S appears in exactly one ordered pair (s,f(s)). This functional property guarantees well‑definedness: given an input, the output is unambiguous. Functions are the mathematical counterpart of pure procedures in programming, which is why they model system calls, library routines, and transformations on data structures.  

### Combinatorics
Combinatorics counts configurations of finite sets. Two fundamental primitives:  

* **Permutations** – arrangements where order matters. The number of permutations of n distinct objects is n! = n·(n‑1)…·1.  
* **Combinations** – selections where order does not matter. The number of k‑subsets of an n‑set is the binomial coefficient  
  $$ \binom{n}{k} = \frac{n!}{k!\,(n-k)!}. $$  

These formulas arise from the multiplication principle: for each step of constructing an object, multiply the number of choices available at that step.  

### Graphs and Trees
A graph G=(V,E) consists of a vertex set V and an edge set E⊆{{u,v} | u,v∈V, u≠v}. The degree deg(v) is the number of incident edges. A key identity, the **handshaking lemma**, follows from double‑counting edge‑incidences:  

$$ \sum_{v\in V}\deg(v) = 2|E|. $$  

A tree is a connected acyclic graph. Equivalently, a tree on n vertices has exactly n‑1 edges; removing any edge disconnects it, and adding any edge creates a cycle. Trees model hierarchical data (directory hierarchies, process trees, DNS zones) because they guarantee a unique simple path between any two vertices.  

## How It Works
The discrete tools compose to solve computational problems:  

* **Logic** provides the language for specifications and the inference rules used by automated theorem provers and model checkers (e.g., SPIN, CBMC).  
* **Proof techniques** (direct, contradiction, induction) are the backbone of correctness arguments for algorithms and kernel code.  
* **Induction** lets us prove properties of loops and recursive functions that operate over unbounded data structures (e.g., linked lists, B‑trees).  
* **Sets and relations** underlie relational databases, access‑control matrices, and the formal definition of file permissions as a relation between subjects and objects.  
* **Functions** capture deterministic system calls; their partiality models error‑return values (‑1 with errno).  
* **Combinatorics** yields exact counts for resource allocations (e.g., number of ways to assign PIDs, page‑frame allocations) and informs probabilistic analyses (hash‑table collision probability ≈ 1‑e^{‑k²/(2N)}).  
* **Graph theory** models network topologies, dependency graphs (make, systemd), and control‑flow graphs used by compilers and static analysers.  
* **Trees** give logarithmic‑time search (red‑black trees, B‑trees) and enable efficient hierarchical naming (filesystem paths, XML/JSON).  

Together they form a rigorous foundation: any program can be viewed as a discrete dynamical system whose state lives in a countable space, and whose evolution is described by logical transitions.  

## Worked Examples
### Example 1: Inductive Proof of $2^n > n$ for all $n\ge 1$
**Goal**: Prove $\forall n\in\mathbb{Z}_{>0},\;2^n>n$.  

**Base case (n=1)**: $2^1=2>1$. ✔  

**Inductive hypothesis**: Assume $2^k>k$ for some arbitrary $k\ge1$.  

**Inductive step**: Show $2^{k+1}>k+1$.  

\[
\begin{aligned}
2^{k+1} &= 2\cdot 2^k \\
&> 2\cdot k \quad\text{(by IH)}\\
&= k + k \\
&\ge k+1 \quad\text{(since }k\ge1\text{)}.
\end{aligned}
\]

Thus $2^{k+1}>k+1$. By induction, the statement holds for all positive $n$.  

### Example 2: Counting Permutations with Restrictions
**Problem**: How many ways to arrange the letters of “LINUX” such that the letter **U** is never first?  

Total permutations of 5 distinct letters: $5! = 120$.  

Count the forbidden permutations where **U** is first: fix U at position 1, then permute the remaining 4 letters → $4! = 24$.  

Allowed count = total – forbidden = $120 - 24 = 96$.  

Alternatively, apply the multiplication principle directly: choose first letter from {L,I,N,X} (4 options), then arrange the remaining 4 letters arbitrarily → $4\cdot4! = 96$.  

### Example 3: Graph Model of Linux Process Hierarchy
The Linux kernel maintains a **process tree** where each node is a `task_struct`. Edges point from parent to child via the `children` list.  

*Vertices*: each process PID.  
*Edges*: (parent → child).  

Properties:  

* The tree is rooted at the init process (PID 1).  
* Depth of a node equals the number of `execve`‑generations from init.  
* The handshaking lemma applied to this tree yields:  

\[
\sum_{v\in V}\deg(v) = 2(|V|-1),
\]

since a tree with $|V|$ vertices has $|V|-1$ edges.  

We can verify this with a shell command:  

```bash
# Count total processes and sum of their numbers of children
ps -e -o pid,ppid | awk '
    {pp[$2]++; cnt++}
    END {
        sum=0; for (p in pp) sum+=pp[p];
        printf "processes=%d, sum_child_degrees=%d, 2*(procs-1)=%d\n",
               cnt, sum, 2*(cnt-1);
    }'
```

On a typical system the equality holds, confirming the tree invariant.  

## Common Mistakes
1. **Treating a relation as a set of elements rather than a set of ordered pairs**  
   *What’s wrong*: Writing “R = {a, b, c}” when R⊆A×B.  
   *Why it matters*: This conflates membership with pairing, breaking definitions of domain, range, and properties like reflexivity. A relation must be a subset of the Cartesian product; otherwise statements such as “(a,a)∈R” are meaningless.  

2. **Assuming induction proves the statement for “all numbers” without verifying the base case**  
   *What’s wrong*: Skipping or misstating the base case (e.g., proving P(k)→P(k+1) but never checking P(0)).  
   *Why it matters*: The inductive step alone only shows that if the statement holds somewhere, it holds forever forward; without a true base, the chain may start from a false premise, leading to vacuously true conclusions.  

3. **Using $n!$ to count combinations**  
   *What’s wrong*: Applying the permutation formula when order does not matter.  
   *Why it matters*: Overcounts by a factor of $k!$; e.g., choosing 2 fruits from {apple, banana, cherry} yields $\binom{3}{2}=3$ pairs, not $3!/1!=6$. Recognizing whether the problem cares about arrangement is essential for correct complexity estimates (e.g., number of possible cache lines vs. number of ways to fill them).  

4. **Confusing directed and undirected edges when applying the handshaking lemma**  
   *What’s wrong*: Using $\sum\deg(v)=2|E|$ on a directed graph.  
   *Why it matters*: In a digraph, the sum of out‑degrees equals the sum of in‑degrees equals |E|, not 2|E|. Misapplying the lemma leads to erroneous conclusions about network reliability or routing tables.  

## Exercises
### Easy  
1. Prove by induction that $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$ for all $n\ge1$.  

2. How many distinct IPv4 addresses are available in the subnet `192.168.10.0/27`?  

### Medium  
3. Let $G$ be a simple undirected graph with 10 vertices and 15 edges. Using the handshaking lemma, determine the average degree of a vertex and argue whether $G$ can be bipartite.  

4. Write a C function that, given an array of $n$ distinct integers, returns the number of permutations that place the smallest element in the first position. Provide a brief complexity analysis.  

### Hard  
5. Consider the Linux `inotify` watch limit (`/proc/sys/fs/inotify/max_user_watches`). Derive an expression for the maximum number of distinct file‑system events that can be simultaneously monitored if each watch generates at most $e$ events per second and the kernel queues events in a buffer of size $B$ bytes, each event occupying $s$ bytes.  

6. Prove that the set of all finite binary strings forms a countable set by constructing an explicit bijection with $\mathbb{N}$. Show how this bijection underlies the encoding of kernel module parameters as strings in `/sys/module/<name>/parameters/`.  

## Linux Connection
### Memory Management – Slab Allocator
The SLAB allocator caches frequently used kernel objects (e.g., `task_struct`, `inode`). Each cache is a **set** of free objects; allocation removes an element, deallocation inserts it. The allocator uses **combinatorics** to decide slab size:  

\[
\text{objects per slab} = \left\lfloor\frac{\text{PAGE\_SIZE}}{\text{object size} + \text{metadata}}\right\rfloor.
\]

```c
/* Simplified slab cache definition (linux/slab.h) */
struct kmem_cache {
    unsigned int object_size;
    unsigned int size;          /* includes metadata */
    unsigned int reciprocal;    /* 1/size for fast division */
    const char *name;
    /* ... */
};
```

A practical view:  

```bash
# Show slab caches and their object counts
cat /proc/slabinfo | head -20
```

### Process Scheduling – Red‑Black Tree
The Completely Fair Scheduler (CFS) maintains a **red‑black tree** (`rb_root`) keyed by `vruntime`. Insertion and deletion are $O(\log n)$, guaranteeing fair CPU allocation.  

```c
/* From linux/sched.h */
struct cfs_rq {
    struct rb_root tasks_timeline;
    /* ... */
};
```

Observing the tree in action:  

```bash
# Display the vruntime of each thread (requires perf with sched tracing)
perf record -e sched:sched_switch -a sleep 5
perf script | grep "sched_switch" | head -5
```

### Networking – Netfilter State Machine
`nf_conntrack` tracks connection states as a **directed graph** where vertices are protocol states (NEW, ESTABLISHED, RELATED, INVALID) and edges are transitions triggered by packets. The firewall rules correspond to cutting edges.  

```bash
# List current tracked connections (shows state graph)
conntrack -L | grep ESTABLISHED | wc -l
```

### File System – Extent Trees (EXT4)
EXT4 stores file extents in a **binary tree** (`extent_status` tree) to map logical file offsets to physical blocks, enabling $O(\log n)$ lookup and reducing fragmentation.  

```bash
# Dump extent tree of a file
hdparm --fibmap /path/to/file | grep -i extent
```

### Cryptography – Modular Arithmetic in RSA
The Linux `crypto` API relies on number‑theoretic results (Euler’s theorem, Chinese Remainder Theorem). Modular exponentiation uses repeated squaring, whose correctness follows from induction on the exponent bits.  

```bash
# Benchmark RSA signature generation using OpenSSL (uses kernel crypto)
openssl speed -evp rsa2048
```

## Why This Matters
Discrete mathematics is not a collection of abstract facts; it is the exact language the Linux kernel and user‑space tools use to reason about resources, correctness, and performance.  

* When you **prove** a kernel invariant with induction, you gain confidence that a scheduler will never starve a task, even under arbitrary workloads.  
* When you **count** possible memory layouts with combinatorics, you can predict the probability of allocator fragmentation and tune slab sizes accordingly.  
* When you **model** the process hierarchy as a tree, you can quickly compute inheritance of credentials or trace a signal’s path with simple tree walks.  
* When you **apply** graph algorithms to network topologies, you can detect loops in routing tables or compute minimal cut sets for firewall hardening.  

By mastering these foundational structures—sets, relations, functions, inductive reasoning, counting, and graph theory—you acquire the mental toolkit to read kernel source, design efficient system programs, and troubleshoot subtle bugs that stem from mismatched assumptions about discrete state. This is why fluency in discrete mathematics is a prerequisite for expert Linux development and system administration.
