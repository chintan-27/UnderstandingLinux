---
id: 5
title: "Linear algebra"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every non-trivial computation is a transformation of data. A graphics driver rotating a 3D scene applies a matrix to every vertex. The Linux kernel's CFS scheduler represents per-CPU load as a weighted sum — a linear combination — of task weights. A compiler's liveness analysis over a control-flow graph solves a system of linear equations over bit-vectors. When you understand linear algebra, you see these as instances of the same machinery.

The structural fact underlying much of this: a homogeneous system $A\mathbf{x} = \mathbf{0}$ with more unknowns than equations *always* has a nonzero solution. This is not a coincidence — it is a theorem about rank, and it determines whether a set of constraints is satisfiable, whether an optimization has a free parameter, and whether an algorithm is guaranteed to terminate.

---

## Core Concepts

### Vectors

A vector $\mathbf{v} \in \mathbb{R}^n$ is an ordered $n$-tuple of real numbers:

$$\mathbf{v} = \begin{pmatrix} v_1 \\ v_2 \\ \vdots \\ v_n \end{pmatrix}$$

Two operations are defined: componentwise addition and scalar multiplication:

$$\mathbf{u} + \mathbf{v} = \begin{pmatrix} u_1 + v_1 \\ \vdots \\ u_n + v_n \end{pmatrix}, \qquad c\mathbf{v} = \begin{pmatrix} cv_1 \\ \vdots \\ cv_n \end{pmatrix}$$

These two operations, and the eight axioms they satisfy (associativity, commutativity, distributivity, existence of zero and negation), define a **vector space**. The axioms are not decoration — they are exactly the conditions needed to guarantee that linear combinations behave predictably. Every result in linear algebra follows from them.

A **linear combination** of vectors $\mathbf{v}_1, \ldots, \mathbf{v}_k$ is any sum $c_1\mathbf{v}_1 + \cdots + c_k\mathbf{v}_k$. The set of all such combinations is the **span** of those vectors. If no vector in a set is a linear combination of the others, the set is **linearly independent**.

### Matrices

A matrix $A$ of shape $m \times n$ encodes a **linear transformation** $T: \mathbb{R}^n \to \mathbb{R}^m$. The array of numbers is just the representation; the object is the transformation.

Matrix-vector multiplication:

$$A\mathbf{x} = \begin{pmatrix} a_{11} & a_{12} \\ a_{21} & a_{22} \end{pmatrix} \begin{pmatrix} x_1 \\ x_2 \end{pmatrix} = x_1\begin{pmatrix} a_{11} \\ a_{21} \end{pmatrix} + x_2\begin{pmatrix} a_{12} \\ a_{22} \end{pmatrix}$$

Reading it this way — as a linear combination of columns — is more useful than the row-dot-product formula. The output of $A\mathbf{x}$ is always a linear combination of the columns of $A$. This is why the set of all possible outputs is called the **column space** of $A$.

Matrix multiplication $C = AB$ composes transformations: $C\mathbf{x} = A(B\mathbf{x})$ means apply $B$ first, then $A$. Non-commutativity ($AB \neq BA$ in general) is a direct consequence: rotating then reflecting is geometrically different from reflecting then rotating.

### Linear Transformations

$T: \mathbb{R}^n \to \mathbb{R}^m$ is linear if and only if:

$$T(\mathbf{u} + \mathbf{v}) = T(\mathbf{u}) + T(\mathbf{v}), \qquad T(c\mathbf{v}) = cT(\mathbf{v})$$

Setting $c = 0$ in the second rule forces $T(\mathbf{0}) = \mathbf{0}$. This immediately disqualifies translation: $T(\mathbf{x}) = \mathbf{x} + \mathbf{b}$ satisfies $T(\mathbf{0}) = \mathbf{b} \neq \mathbf{0}$ when $\mathbf{b} \neq \mathbf{0}$. Graphics pipelines handle this by lifting $\mathbb{R}^3$ into **homogeneous coordinates** $\mathbb{R}^4$, where translation *is* linear — this is exactly what the standard OpenGL model-view matrix does.

The power of linearity: the entire behavior of $T$ is determined by its values on a basis. If you know where $T$ sends $n$ independent vectors, you know where it sends everything.

### Rank

The **rank** of $A$ is the dimension of its column space — the number of linearly independent columns. It measures how much of the codomain the transformation actually reaches.

For an $m \times n$ matrix with rank $r$:

- The **null space** (kernel) has dimension $n - r$. This is the **rank-nullity theorem**: $r + \dim(\ker A) = n$.
- $A\mathbf{x} = \mathbf{b}$ has a solution if and only if $\mathbf{b}$ is in the column space of $A$.
- If $r < n$: the null space is nontrivial, meaning $A\mathbf{x} = \mathbf{0}$ has nonzero solutions. Any solution to $A\mathbf{x} = \mathbf{b}$ is non-unique — you can add any null-space vector to it.
- If $r = n$: $A$ is injective (distinct inputs give distinct outputs).
- If $r = m = n$: $A$ is invertible.

The homogeneous-system principle follows directly: if $n > m$, then $r \leq m < n$, so $\dim(\ker A) = n - r \geq 1$. More unknowns than equations guarantees a nonzero solution. This is the structural guarantee behind Gosper-Zeilberger's summation algorithm — when it sets up a system with more free parameters than constraint equations, it is guaranteed to find a nontrivial recurrence.

### Eigenvalues and Eigenvectors

For a square matrix $A \in \mathbb{R}^{n \times n}$, a nonzero vector $\mathbf{v}$ is an **eigenvector** with eigenvalue $\lambda$ if:

$$A\mathbf{v} = \lambda\mathbf{v}$$

$A$ does not rotate $\mathbf{v}$ — it only scales it by $\lambda$. Negative $\lambda$ flips the direction; $|\lambda| > 1$ stretches; $|\lambda| < 1$ contracts; $\lambda = 0$ collapses to zero (and signals that $A$ is not invertible).

Eigenvalues are roots of the **characteristic polynomial**:

$$\det(A - \lambda I) = 0$$

For a $2 \times 2$ matrix this gives a quadratic; for $n \times n$ a degree-$n$ polynomial. The roots may be complex even for real $A$ — a rotation matrix has no real eigenvectors because no direction is preserved under rotation.

Why eigenvectors matter causally: they are the directions along which a transformation is *decoupled*. In those directions, the system behaves like independent scalar equations, not a coupled system. Everything that makes repeated application tractable — Markov chains converging to steady state, differential equations with exponential solutions, recurrences with closed forms — exploits this decoupling.

### Diagonalization

If $A \in \mathbb{R}^{n \times n}$ has $n$ linearly independent eigenvectors $\mathbf{v}_1, \ldots, \mathbf{v}_n$ with eigenvalues $\lambda_1, \ldots, \lambda_n$, form the matrix $P = [\mathbf{v}_1 \mid \cdots \mid \mathbf{v}_n]$. Then:

$$A = PDP^{-1}, \qquad D = \begin{pmatrix} \lambda_1 & & \\ & \ddots & \\ & & \lambda_n \end{pmatrix}$$

The payoff for repeated application:

$$A^k = PD^kP^{-1}, \qquad D^k = \begin{pmatrix} \lambda_1^k & & \\ & \ddots & \\ & & \lambda_n^k \end{pmatrix}$$

Computing $D^k$ costs $O(n)$ scalar exponentiations instead of $O(n^3)$ per matrix multiplication. The Apéry recurrence

$$(n+2)^3 A_{n+2} - (2n+3)(17n^2+51n+39)A_{n+1} + (n+1)^3 A_n = 0$$

is analyzed by exactly this: writing it as a matrix recurrence $\mathbf{w}_{n+1} = M_n \mathbf{w}_n$ and studying the asymptotic growth of eigenvalues to prove irrationality of $\zeta(3)$.

### Orthogonality

Two vectors are **orthogonal** when their dot product is zero:

$$\mathbf{u} \cdot \mathbf{v} = \sum_{i=1}^n u_i v_i = 0$$

A set of mutually orthogonal unit vectors ($\|\mathbf{v}\| = 1$) is an **orthonormal basis**. In such a basis, projecting $\mathbf{b}$ onto direction $\hat{\mathbf{u}}$ is exact and cheap:

$$\text{proj}_{\hat{\mathbf{u}}}\, \mathbf{b} = (\
