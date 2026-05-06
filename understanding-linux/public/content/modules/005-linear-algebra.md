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

## Core Concepts
### Vectors
A vector in $\mathbb{R}^n$ is an ordered $n$-tuple $v=(v_1,\dots,v_n)$.  
Geometrically it represents a directed segment from the origin to the point $(v_1,\dots,v_n)$; its **magnitude** is $\|v\|_2=\sqrt{\sum_{i=1}^n v_i^2}$ and its **direction** is the unit vector $v/\|v\|_2$.  

Two fundamental operations are defined:

* **Addition**: $(u+v)_i = u_i+v_i$.  
  *Why?* Adding vectors corresponds to placing the tail of $v$ at the head of $u$; the resulting displacement is the sum of the individual displacements.  

* **Scalar multiplication**: $(\alpha v)_i = \alpha v_i$ for $\alpha\in\mathbb{R}$.  
  *Why?* Scaling stretches or shrinks the vector while preserving its line through the origin; if $\alpha<0$ the direction reverses.

A set of vectors $\{v_1,\dots,v_k\}$ is **linearly independent** if the only solution to $\sum_{i=1}^k \alpha_i v_i =0$ is $\alpha_i=0\;\forall i$.  
If a vector can be written as a linear combination of others, it is **dependent**; the maximal number of independent vectors in a set equals the dimension of their span.

### Matrices
An $m\times n$ matrix $A$ is a rectangular array $a_{ij}$ with $1\le i\le m$, $1\le j\le n$.  
When bases $\mathcal{B}_V=\{e_1,\dots,e_n\}$ of $V=\mathbb{R}^n$ and $\mathcal{B}_W=\{f_1,\dots,f_m\}$ of $W=\mathbb{R}^m$ are fixed, $A$ represents the linear map $T:V\to W$ defined by  
$$
T(e_j)=\sum_{i=1}^m a_{ij}f_i .
$$  
Thus the $j$‑th column of $A$ is the image of the $j$‑th basis vector of $V$.

**Matrix multiplication**: If $A\in\mathbb{R}^{m\times p}$ and $B\in\mathbb{R}^{p\times n}$, then $C=AB\in\mathbb{R}^{m\times n}$ has entries  
$$
c_{ik}=\sum_{j=1}^p a_{ij}b_{jk}.
$$  
*Why this formula?* Applying $T_B$ followed by $T_A$ to a basis vector $e_k$ gives  
$$
T_A(T_B(e_k)) = T_A\!\Big(\sum_{j=1}^p b_{jk}f_j\Big)=\sum_{j=1}^p b_{jk}T_A(f_j)=\sum_{j=1}^p b_{jk}\sum_{i=1}^m a_{ij}g_i
=\sum_{i=1}^m\Big(\sum_{j=1}^p a_{ij}b_{jk}\Big)g_i,
$$  
so the coefficient of $g_i$ is exactly $c_{ik}$. Consequently matrix multiplication is **associative** and **distributive**, but **not commutative** in general because the underlying linear maps need not commute.

**Special matrices**  
* Identity $I_n$: $a_{ij}=\delta_{ij}$; it represents the identity map.  
* Transpose $A^T$: $(A^T)_{ij}=a_{ji}$; corresponds to the adjoint with respect to the standard inner product.  
* Orthogonal matrix $Q$: satisfies $Q^TQ=I$; its columns form an orthonormal basis.

### Linear Transformations
A map $T:V\to W$ between vector spaces is **linear** iff  
$$
T(u+v)=T(u)+T(v),\qquad T(\alpha u)=\alpha T(u)\quad\forall u,v\in V,\;\alpha\in\mathbb{R}.
$$  
*Why these two properties?* They encode precisely the preservation of vector addition and scalar multiplication, the only structure a vector space possesses.  

If $\dim V=n$ and $\dim W=m$, choosing bases yields a unique matrix $A$ such that $T(x)=Ax$ for all coordinate vectors $x\in\mathbb{R}^n$. Conversely, any matrix defines a linear transformation. Hence the study of linear transformations is equivalent to the study of matrices.

Important consequences:
* $T(0)=0$ (set $u=v=0$ in additivity).  
* $T$ preserves linear combinations: $T\big(\sum_i\alpha_i v_i\big)=\sum_i\alpha_i T(v_i)$.  
* The **kernel** (null space) $\ker T=\{v\mid T(v)=0\}$ and **image** $\operatorname{im} T=\{T(v)\mid v\in V\}$ are subspaces; their dimensions relate via the rank–nullity theorem (see below).

### Rank
For a matrix $A\in\mathbb{R}^{m\times n}$ define  
* **Column space** $\mathcal{C}(A)=\{Ax\mid x\in\mathbb{R}^n\}\subseteq\mathbb{R}^m$.  
* **Row space** $\mathcal{R}(A)=\{y^TA\mid y\in\mathbb{R}^n\}\subseteq\mathbb{R}^m$.  

The **rank** of $A$, denoted $\operatorname{rank}(A)$, is the dimension of either space (they are equal).  

*Proof of equality*: Elementary row operations do not change the row space and preserve linear relations among columns; similarly, column operations preserve column relations. Reducing $A$ to row‑echelon form reveals pivot columns that form a basis for $\mathcal{C}(A)$; the number of pivots equals the number of nonzero rows, a basis for $\mathcal{R}(A)$.  

**Rank–nullity theorem**: For $T:x\mapsto Ax$,  
$$
\operatorname{rank}(A)+\operatorname{nullity}(A)=n,
$$  
where $\operatorname{nullity}(A)=\dim\ker A$.  
*Why?* Extend a basis of $\ker A$ to a basis of $\mathbb{R}^n$; the images of the added basis vectors are linearly independent and span $\operatorname{im}A$, giving exactly $n-\dim\ker A$ independent image vectors.

### Eigenvalues and Diagonalization
Let $A\in\mathbb{R}^{n\times n}$. A scalar $\lambda$ is an **eigenvalue** if there exists a non‑zero vector $v$ such that  
$$
Av=\lambda v .
$$  
$v$ is then an **eigenvector** associated with $\lambda$.  

*Characteristic polynomial*:  
$$
p_A(\lambda)=\det(A-\lambda I)=\lambda^n + c_{n-1}\lambda^{n-1}+\dots +c_0 .
$$  
The roots of $p_A$ are precisely the eigenvalues (Fundamental Theorem of Algebra).  

**Algebraic multiplicity** $m_a(\lambda)$ = multiplicity of $\lambda$ as a root of $p_A$.  
**Geometric multiplicity** $m_g(\lambda)=\dim\ker(A-\lambda I)$ = number of linearly independent eigenvectors for $\lambda$.  
Always $m_g(\lambda)\le m_a(\lambda)$.  

A matrix is **diagonalizable** iff there exists an invertible $P$ with $P^{-1}AP=D$ diagonal.  
*Criterion*: $A$ is diagonalizable $\iff$ the sum of geometric multiplicities equals $n$, i.e. $A$ possesses $n$ linearly independent eigenvectors.  

If $A$ is real symmetric ($A^T=A$), the **Spectral Theorem** guarantees orthogonal diagonalization: there exists an orthogonal $Q$ ($Q^TQ=I$) such that $Q^TAQ=\Lambda$ where $\Lambda$ is diagonal with real eigenvalues. Orthogonal matrices preserve lengths and angles, making symmetric matrices especially useful in physics and optimization.

### Orthogonality
With the standard inner product $\langle u,v\rangle = u^T v = \sum_{i=1}^n u_i v_i$, two vectors are **orthogonal** if $\langle u,v\rangle =0$.  
A set $\{q_1,\dots,q_k\}$ is **orthonormal** if $\langle q_i,q_j\rangle =\delta_{ij}$.  

An **orthogonal matrix** $Q$ satisfies $Q^TQ=I$; equivalently its columns (and rows) form an orthonormal basis. Multiplication by $Q$ preserves the inner product:  
$$
\langle Qx,Qy\rangle = (Qx)^T(Qy)=x^TQ^TQy = x^Ty = \langle x,y\rangle .
$$  
Hence orthogonal transformations are **rigid motions** (rotations/reflections) that do not distort shapes.

**Gram–Schmidt process**: Given a linearly independent set $\{v_1,\dots,v_k\}$, produce an orthonormal set $\{u_1,\dots,u_k\}$ by  
$$
u_1=\frac{v_1}{\|v_1\|},\qquad
u_j=\frac{v_j-\sum_{i<j}\langle v_j,u_i\rangle u_i}{\big\|v_j-\sum_{i<j}\langle v_j,u_i\rangle u_i\big\|},\;j\ge2 .
$$  
This construction underlies QR factorization $A=QR$ with $Q$ orthogonal and $R$ upper‑triangular, a numerically stable way to solve least‑squares problems.

## How It Works
### Solving Linear Systems
Given $Ax=b$ with $A\in\mathbb{R}^{m\times n}$, perform Gaussian elimination to obtain an upper‑triangular matrix $U$ via elementary row operations (which correspond to left‑multiplication by invertible matrices).  
*If* $\operatorname{rank}(A)=\operatorname{rank}([A\mid b])=n$ (full column rank) then the system has a **unique solution** $x=A^{-1}b$ (when $m=n$) or the **minimum‑norm solution** $x=A^{\dagger}b$ (Moore–Penrose pseudoinverse) when $m>n$.  
*If* the ranks differ, the system is **inconsistent** (no solution).  
*If* $\operatorname{rank}(A)<n$, there are infinitely many solutions; they form an affine subspace $x_0+\ker A$.

The **LU decomposition** $A=LU$ (with $L$ lower‑triangular unit diagonal, $U$ upper‑triangular) stems directly from the elimination steps and enables solving multiple right‑hand sides in $O(n^2)$ after an $O(n^3)$ factorization.

### Composition of Linear Transformations
If $T_1:\mathbb{R}^p\to\mathbb{R}^q$ and $T_2:\mathbb{R}^q\to\mathbb{R}^r$ have matrices $B$ and $A$ respectively, then the composition $T_2\circ T_1$ is represented by $AB$.  
Because matrix multiplication captures successive application, the order matters: $AB\neq BA$ generally, reflecting that applying a rotation then a shear differs from a shear then a rotation.

### Eigenvalues in Dynamical Systems
Consider the linear ODE $\dot{x}=Ax$, $x(0)=x_0$.  
If $A=PDP^{-1}$ with $D=\operatorname{diag}(\lambda_1,\dots,\lambda_n)$, then  
$$
x(t)=e^{At}x_0=Pe^{Dt}P^{-1}x_0,
$$  
where $e^{Dt}=\operatorname{diag}(e^{\lambda_1 t},\dots,e^{\lambda_n t})$.  
Thus each eigenvector direction evolves independently, scaling by $e^{\lambda_i t}$. Positive $\lambda_i$ yields growth, negative yields decay, complex pairs produce oscillations. Diagonalization therefore **decouples** the system.

### Orthogonal Projections and Least Squares
For inconsistent $Ax=b$, the **least‑squares** solution minimizes $\|Ax-b\|_2^2$. Setting the gradient to zero yields the **normal equations**  
$$
A^TAx=A^Tb .
$$  
If $A$ has full column rank, $A^TA$ is invertible and the unique solution is $x=(A^TA)^{-1}A^Tb$.  
Geometrically, $Ax$ is the orthogonal projection of $b$ onto $\mathcal{C}(A)$; the residual $b-Ax$ is orthogonal to every column of $A$.  
QR factorization provides a numerically stable method: $Ax=QRx$, so the normal equations become $R^Tx=Q^Tb$, solved by back substitution.

## Worked Examples
### Example 1: Inverse of a $2\times2$ Matrix
Find $A^{-1}$ for  
$$
A=\begin{pmatrix}2&1\\[2pt]1&1\end{pmatrix}.
$$

**Step 1 – Determinant**  
$$
\det A = 2\cdot1-1\cdot1 = 1.
$$  
Since $\det A\neq0$, $A$ is invertible.

**Step 2 – Adjugate**  
The cofactor matrix $C$ is  
$$
C=\begin{pmatrix}
\ \ \ 1 & -1\\
-1 & \ \ \ 2
\end{pmatrix},
$$  
where $C_{ij}=(-1)^{i+j}\det(A_{ji})$ (note the transpose).  
The adjugate is $\operatorname{adj}(A)=C^T=\begin{pmatrix}1&-1\\-1&2\end{pmatrix}$.

**Step 3 – Inverse**  
$$
A^{-1}= \frac{1}{\det A}\operatorname{adj}(A)=
\begin{pmatrix}1&-1\\-1&2\end{pmatrix}.
$$  
*Verification*: $AA^{-1}=I_2$.

### Example 2: Orthogonal Diagonalization of a Symmetric Matrix
Diagonalize  
$$
A=\begin{pmatrix}4&2\\2&1\end{pmatrix}.
$$

**Step 1 – Characteristic polynomial**  
$$
\det(A-\lambda I)=\det\begin{pmatrix}4-\lambda&2\\2&1-\lambda\end{pmatrix}
=(4-\lambda)(1-\lambda)-4=\lambda^2-5\lambda.
$$  
Thus $\lambda_1=0,\ \lambda_2=5$.

**Step 2 – Eigenvectors**  
*For $\lambda_1=0$*: Solve $Av=0$  
$$
\begin{pmatrix}4&2\\2&1\end{pmatrix}\!\begin{pmatrix}x\\y\end{pmatrix}=0
\;\Rightarrow\;4x+2y=0\;\Rightarrow\;y=-2x.
$$  
Choose $v_1=\begin{pmatrix}1\\-2\end{pmatrix}$.

*For $\lambda_2=5$*: Solve $(A-5I)v=0$  
$$
\begin{pmatrix}-1&2\\2&-4\end{pmatrix}\!\begin{pmatrix}x\\y\end{pmatrix}=0
\;\Rightarrow\;-x+2y=0\;\Rightarrow\;x=2y.
$$  
Choose $v_2=\begin{pmatrix}2\\1\end{pmatrix}$.

**Step 3 – Orthonormalize**  
$\|v_1\|=\sqrt{1^2+(-2)^2}=\sqrt5$, $\|v_2\|=\sqrt{2^2+1^2}=\sqrt5$.  
Set  
$$
q_1=\frac{v_1}{\sqrt5}=\begin{pmatrix}1/\sqrt5\\-2/\sqrt5\end{pmatrix},\qquad
q_2=\frac{v_2}{\sqrt5}=\begin{pmatrix}2/\sqrt5\\\ 1/\sqrt5\end{pmatrix}.
$$  
Form $Q=[q_1\; q_2]$:  
$$
Q=\begin{pmatrix}
\frac{1}{\sqrt5}&\frac{2}{\sqrt5}\\[4pt]
-\frac{2}{\sqrt5}&\frac{1}{\sqrt5}
\end{pmatrix},\qquad Q^TQ=I.
$$

**Step 4 – Diagonal form**  
$$
Q^TAQ=\begin{pmatrix}0&0\\0&5\end{pmatrix}= \Lambda .
$$  
Hence $A=Q\Lambda Q^T$ is the orthogonal diagonalization.

## Common Mistakes
| # | Mistake | Why it’s Wrong | Correct Reasoning |
|---|---------|----------------|-------------------|
| 1 | **Assuming $\det(A+B)=\det A+\det B$** | Determinant is multilinear in rows *or* columns, not additive over matrix addition. Counterexample: $A=I_2$, $B=-I_2$ gives $\det(A+B)=0\neq\det A+\det B=2$. | Use $\det(A+B)=\det A+\det B+\text{mixed terms}$; compute directly or use properties like $\det(A+B)=\det A\det(I+A^{-1}B)$ when $A$ invertible. |
| 2 | **Thinking $AB=BA$ whenever $A$ and $B$ are both diagonal** | Only true if both are diagonal *in the same basis*. If $A$ is diagonal but $B$ is not, they generally don’t commute. Example: $A=\begin{pmatrix}1&0\\0&2\end{pmatrix}$, $B=\begin{pmatrix}0&1\\1&0\end{pmatrix}$ gives $AB\neq BA$. | Diagonal matrices commute with each other, but not with arbitrary matrices. Check $AB-BA$ explicitly or note that commutativity requires simultaneous diagonalizability. |
| 3 | **Using $A^{-1}=\frac{1}{\det A}\operatorname{adj}(A)$ for non‑square matrices** | The adjugate is defined only for square matrices; non‑square matrices lack a two‑sided inverse. | For $m\neq n$, discuss one‑sided inverses or the Moore–Penrose pseudoinverse $A^{\dagger}=(A^TA)^{-1}A^T$ (if $A$ has full column rank). |
| 4 | **Assuming orthogonal matrices have determinant $+1$ only** | Orthogonal matrices satisfy $Q^TQ=I$, which implies $\det Q=\pm1$. Determinant $-1$ corresponds to a reflection (orientation‑reversing). | Remember $\det(Q)^2=\det(Q^TQ)=\det I=1$, so $\det Q=\pm1$. Examples: rotation in 2D has $\det+1$, reflection across a line has $\det-1$. |

## Exercises
1. **(Easy) Inverse via Gaussian elimination**  
   Compute the inverse of  
   $$
   B=\begin{pmatrix}
   3 & 0 & 2\\
   2 & 1 &-1\\
   1 & 0 & 1
   \end{pmatrix}
   $$  
   by augmenting with $I_3$ and performing row‑reduction. Show each elementary step and verify $BB^{-1}=I_3$.

2. **(Intermediate) Diagonalization of a $3\times3$ symmetric matrix**  
   Diagonalize  
   $$
   C=\begin{pmatrix}
   5 & 2 & 0\\
   2 & 5 & 0\\
   0 & 0 & 3
   \end{pmatrix}.
   $$  
   Find eigenvalues, orthogonal eigenvectors, construct $Q$, and confirm $Q^TCQ=\Lambda$.

3. **(Hard) Rank, nullspace, and least‑squares**  
   Let  
   $$
   D=\begin{pmatrix}
   1 & 2 & 3 & 4\\
   2 & 4 & 6 & 8\\
   0 & 1
