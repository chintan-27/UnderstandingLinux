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

Every performance-critical subsystem in Linux eventually bottlenecks on a linear algebra primitive. The GPU command processor in `drivers/gpu/drm/` submits transformation matrices to hardware that rotates, scales, and projects geometry — a broken rotation matrix produces visual corruption that looks like a driver bug but is an algebraic one. The kernel's CFS scheduler maintains per-CPU load vectors and computes weighted sums to balance work; when NUMA topology is involved, that weighting is essentially a matrix-vector product. ALSA's resampling path in `sound/core/` applies FIR filters that are convolutions — which become pointwise multiplications after an FFT, a fact that falls directly out of eigenvalue theory. `scikit-learn`'s PCA, `numpy`'s `linalg.solve`, and OpenBLAS's `dgemm` are all calling into the same LAPACK routines ultimately traceable to Gaussian elimination.

When these systems fail the root cause is almost always an invariant violation: rank dropped where it shouldn't, a matrix became ill-conditioned so small floating-point errors exploded, eigenvalues went negative in a covariance matrix that must be positive-semidefinite. You cannot diagnose those failures without knowing what the invariants are and why they must hold.

---

## Core Concepts

### Vectors

A vector is an ordered $n$-tuple of scalars. Two operations define it completely — addition and scalar multiplication:

$$\mathbf{u} + \mathbf{v} = \begin{pmatrix} u_1 + v_1 \\ \vdots \\ u_n + v_n \end{pmatrix}, \qquad c\mathbf{v} = \begin{pmatrix} cv_1 \\ \vdots \\ cv_n \end{pmatrix}$$

A **vector space** is any set closed under these two operations with the expected associativity, commutativity, and distributivity axioms. The reason to care about the abstract definition is that the same theorems apply everywhere: $\mathbb{R}^n$, polynomials of degree $\leq k$, continuous functions on $[0,1]$, and finite fields $\mathbb{F}_2^n$ (used in error-correcting codes) are all vector spaces. Intuitions built in $\mathbb{R}^3$ transfer directly.

### Matrices as Linear Transformations

A matrix is not a grid of numbers — it is a compact encoding of a **linear transformation** $T: \mathbb{R}^m \to \mathbb{R}^n$ satisfying:

$$T(\mathbf{u} + \mathbf{v}) = T(\mathbf{u}) + T(\mathbf{v}), \qquad T(c\mathbf{v}) = cT(\mathbf{v})$$

Linearity means $T$ is completely determined by its action on a basis. If you know where $T$ sends $n$ basis vectors, you know where it sends every vector. An $n \times m$ matrix encodes exactly this: **column $j$ is the image of the $j$-th basis vector**. This is why matrix-vector multiplication looks the way it does:

$$A\mathbf{x} = x_1 \mathbf{a}_1 + x_2 \mathbf{a}_2 + \cdots + x_m \mathbf{a}_m$$

The output is a linear combination of $A$'s columns weighted by the entries of $\mathbf{x}$.

### Rank

The **rank** of $A$ is the dimension of its column space — the number of linearly independent directions the transformation actually produces. For an $m \times n$ matrix:

$$r = \operatorname{rank}(A) \leq \min(m, n)$$

The **rank-nullity theorem** states:

$$\operatorname{rank}(A) + \operatorname{nullity}(A) = n$$

where $\operatorname{nullity}(A) = \dim(\ker A)$ is the dimension of the null space — the subspace of inputs that map to zero. Every direction in the null space is destroyed by $A$; information sent into those directions is unrecoverable. A rank-deficient $A\mathbf{x} = \mathbf{b}$ system either has no solution (if $\mathbf{b}$ lies outside the column space) or infinitely many (the solution is a particular solution plus any vector in the null space).

Practically: if you build a system of equations whose coefficient matrix is rank-deficient because two sensors are measuring the same physical quantity, you will not get a unique solution no matter how good your solver is. The algebraic structure reflects the physical redundancy.

### Eigenvalues and Eigenvectors

For a square $n \times n$ matrix $A$, a nonzero vector $\mathbf{v}$ is an **eigenvector** if the transformation only scales it:

$$A\mathbf{v} = \lambda \mathbf{v}$$

The scalar $\lambda$ is the **eigenvalue**. Rearranging: $(A - \lambda I)\mathbf{v} = \mathbf{0}$ has a nontrivial solution iff $A - \lambda I$ is singular, i.e.:

$$\det(A - \lambda I) = 0$$

This **characteristic polynomial** has degree $n$, so there are $n$ eigenvalues (counting multiplicity, over $\mathbb{C}$). Eigenvectors are the natural axes of $A$ — directions the transformation acts on independently, with no coupling to other directions.

Why they matter computationally: repeated application of $A$ amplifies directions with $|\lambda| > 1$ and suppresses directions with $|\lambda| < 1$. The largest eigenvalue dominates after enough iterations. This is exactly why the **power method** works for finding the dominant eigenvector, and why Google's original PageRank algorithm reduces to finding the principal eigenvector of a stochastic matrix.

### Diagonalization

$A$ is **diagonalizable** if it has $n$ linearly independent eigenvectors. Then:

$$A = P D P^{-1}$$

where $D = \operatorname{diag}(\lambda_1, \ldots, \lambda_n)$ and the columns of $P$ are the corresponding eigenvectors. The payoff is that powers and exponentials become trivial:

$$A^k = P D^k P^{-1}, \qquad D^k = \operatorname{diag}(\lambda_1^k, \ldots, \lambda_n^k)$$

$$e^{At} = P \operatorname{diag}(e^{\lambda_1 t}, \ldots, e^{\lambda_n t}) P^{-1}$$

The matrix exponential $e^{At}$ is the exact solution to the ODE system $\dot{\mathbf{x}} = A\mathbf{x}$, which governs everything from circuit transients to linearized control systems in real-time kernels. Without diagonalization, computing $e^{At}$ for each timestep would require a full $O(n^3)$ matrix exponential algorithm; with it, the per-step cost is $O(n)$.

### Singular Value Decomposition

Eigendecomposition requires a square matrix and may not exist over $\mathbb{R}$. The **SVD** has no such restriction. Every $m \times n$ matrix $A$ decomposes as:

$$A = U \Sigma V^T$$

where $U$ ($m \times m$) and $V$ ($n \times n$) are orthogonal, and $\Sigma$ ($m \times n$) is diagonal with nonnegative entries $\sigma_1 \geq \sigma_2 \geq \cdots \geq \sigma_r > 0$ called **singular values**. The rank of $A$ is exactly the number of nonzero singular values.

The geometric reading: $V^T$ rotates the input, $\Sigma$ stretches along the coordinate axes, $U$ rotates the output. The condition number $\kappa(A) = \sigma_1 / \sigma_r$ measures how much the transformation amplifies errors. A large condition number means small perturbations in $\mathbf{b}$ cause large changes in $\mathbf{x}$ when solving $A\mathbf{x} = \mathbf{b}$ — the matrix is **ill-conditioned**.

The **rank-$k$ truncated SVD**:

$$A_k = \sum_{i=1}^k \sigma_i \mathbf{u}_i \mathbf{v}_i^T$$

is the best rank-$k$ approximation to $A$ in both spectral and Frobenius norms (Eckart-Young theorem). This is the mathematical foundation of PCA, latent semantic analysis, and low-rank matrix compression.

### Orthogonality and QR

Two vectors are **orthogonal** when $\mathbf{u} \cdot \mathbf{v} = \sum_i u_i v_i = 0$. An **orthonormal basis** ($Q$) has mutually orthogonal unit vectors. Its defining property: $Q^T Q = I$, so $Q^{-1} = Q^T$. Inversion costs nothing — just a transpose.

**Gram-Schmidt** constructs an orthonormal basis from any linearly independent set by iteratively subtracting projections:

$$\mathbf{u}_k = \mathbf{a}_k - \sum_{j=1}^{k-1} \frac{\mathbf{a}_k \cdot \mathbf{q}_j}{\mathbf{q}_j \cdot \mathbf{q}_j} \mathbf{q}_j, \qquad \mathbf{q}_k = \frac{\mathbf{u}_k}{\|\mathbf{u}_k\|}$$

This is the constructive proof of **QR decomposition**: $A = QR$ where $Q$ is orthogonal and $R$ is upper triangular. QR is numerically stabler than LU for least-squares problems because orthogonal transformations have condition number 1 — they do not amplify errors.

---

## How It Works
