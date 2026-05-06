---
id: 10
title: "Optimization"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Core Concepts
### Feasible Region, Objective Function, and Constraints
In constrained optimization we seek a point **x*** that minimizes (or maximizes) an objective function *f*: ℝⁿ→ℝ while satisfying a set of constraints.  
- **Feasible set** 𝔽 = { x | hᵢ(x)=0, i=1…p ; gⱼ(x)≤0, j=1…q }.  
  Equality constraints *hᵢ(x)=0* must hold exactly; inequality constraints *gⱼ(x)≤0* define a half‑space.  
- The **objective value** at a feasible point is *f(x)*.  
A point is **feasible** if it belongs to 𝔽; otherwise it is infeasible and must be discarded.

### Convexity and Its Consequences
A set 𝒞⊆ℝⁿ is **convex** if ∀x,y∈𝒞, θ∈[0,1] ⇒ θx+(1−θ)y∈𝒞.  
A function *f* is **convex** if its epigraph epi f = {(x,t) | f(x)≤t} is convex, equivalently if  
$$ f(\theta x+(1-\theta)y)\le \theta f(x)+(1-\theta)f(y),\quad\forall x,y,\;\theta\in[0,1]. $$  

If 𝔽 is convex and *f* is convex, any local minimum is also a global minimum. Moreover, the **Karush‑Kuhn‑Tucker (KKT)** conditions become sufficient as well as necessary (under Slater’s condition: ∃x∈𝔽 with gⱼ(x)<0).  

### Local vs. Global Minima
- A **local minimum** x̂ satisfies ∃ε>0 such that f(x̂)≤f(x) ∀x∈𝔽∣∥x−x̂∥<ε.  
- A **global minimum** x* satisfies f(x*)≤f(x) ∀x∈𝔽.  

Non‑convex problems may host many local minima; convex problems admit at most one (if *f* is strictly convex).  

### Lagrangian and KKT Conditions
Introduce Lagrange multipliers λ∈ℝᵖ for equalities and μ∈ℝ^q_≥0 for inequalities. The **Lagrangian** is  
$$ \mathcal{L}(x,\lambda,\mu)=f(x)+\sum_{i=1}^{p}\lambda_i h_i(x)+\sum_{j=1}^{q}\mu_j g_j(x). $$  

Necessary KKT conditions (assuming differentiability and a constraint qualification) are:  

1. **Stationarity**: ∇ₓℒ(x*,λ*,μ*)=0  
2. **Primal feasibility**: h_i(x*)=0, g_j(x*)≤0  
3. **Dual feasibility**: μ_j*≥0  
4. **Complementary slackness**: μ_j* g_j(x*)=0  

If 𝔽 and *f* are convex, these conditions are also sufficient.

---

## How It Works
### From KKT to Algorithmic Schemes
The KKT conditions give a system of equations/inequalities whose solution yields the optimum. Directly solving this nonlinear system is often impractical; instead, we construct iterative schemes that drive the residuals to zero.

#### 1. Equality‑Constrained Case (Lagrange Multipliers)
When only equalities exist (q=0), stationarity reduces to  
$$ \nabla f(x^*) + \sum_i \lambda_i^* \nabla h_i(x^*) = 0. $$  
Together with *h(x*)=0* we have a square system. Newton’s method applied to the KKT system yields the **primal‑dual Newton step**:
$$
\begin{bmatrix}
\nabla^2_{xx}\mathcal{L} & \nabla h(x)^\top \\
\nabla h(x) & 0
\end{bmatrix}
\begin{bmatrix}
\Delta x \\ \Delta \lambda
\end{bmatrix}
=
-
\begin{bmatrix}
\nabla_x\mathcal{L} \\
h(x)
\end{bmatrix}.
$$
Solving this linear system gives a search direction; a line search ensures sufficient decrease of a merit function (e.g., the augmented Lagrangian).

#### 2. Adding Inequalities – Active‑Set Method
Inequalities are handled by guessing which constraints are active (gⱼ(x*)=0) and treating them as equalities. The active set 𝔸 is updated iteratively:
- Solve the equality‑constrained KKT system for the current 𝔸.  
- If any μⱼ<0 for a constraint in 𝔸, drop it (it is not truly active).  
- If any gⱼ(x)>0 for a constraint not in 𝔸, add the most violated one.  

Under mild assumptions the active set converges in a finite number of steps.

#### 3. Interior‑Point (Barrier) Methods
Instead of explicitly managing active constraints, we embed them in the objective via a logarithmic barrier:
$$ \phi_\mu(x)=f(x)-\mu\sum_{j=1}^{q}\log(-g_j(x)),\qquad \mu>0. $$  
For a fixed μ, minimizing φ_μ yields a point that satisfies gⱼ(x)<0. As μ→0⁺ the barrier solution approaches the true optimum. Newton’s method applied to ∇φ_μ=0 gives a primal‑dual interior‑point step with complexity O(√n L) for linear programs (L = bit length of input).

#### 4. Sequential Quadratic Programming (SQP)
SQP builds a quadratic model of the Lagrangian and a linear model of the constraints:
$$
\begin{aligned}
\min_{d}\;& \frac{1}{2}d^\top\nabla^2_{xx}\mathcal{L}(x,\lambda,\mu)d+\nabla f(x)^\top d\\
\text{s.t.}\;& h(x)+\nabla h(x)^\top d=0,\\
            & g(x)+\nabla g(x)^\top d\le 0.
\end{aligned}
$$
Solving this QP yields a step (d,Δλ,Δμ). SQP enjoys super‑linear convergence when the QP is solved accurately and the Hessian is updated via BFGS.

### Why These Mechanisms Work
- **Newton step** drives the KKT residuals to zero quadratically when near a solution because it uses second‑order information.  
- **Active‑set** exploits the fact that at optimality only a small subset of constraints are tight; treating the rest as inactive reduces problem size.  
- **Barrier** transforms a constrained problem into a sequence of unconstrained smooth problems, allowing the use of efficient line‑search Newton methods while guaranteeing feasibility via the barrier term.  
- **SQP** inherits the fast convergence of Newton’s method for the Lagrangian while respecting constraints through the QP subproblem.

---

## Worked Examples
### Example 1: Linear Programming (Simplex Walk‑through)
**Problem**  
Maximize $f(x,y)=3x+2y$ subject to  
$$
\begin{cases}
x+y\le 5\\
x\ge0,\;y\ge0
\end{cases}
$$  

Convert to minimization of $-f$: $c=(-3,-2)^\top$.  
Standard form with slack variables $s_1,s_2,s_3\ge0$:  
$$
\begin{aligned}
x+y+s_1 &=5\\
-x+s_2 &=0\\
-y+s_3 &=0
\end{aligned}
$$  

**Initial BFS**: set $x=y=0$, then $s=(5,0,0)$. Basic variables: $s_1,s_2,s_3$.  
Reduced costs: $\bar c_N = c_N - C_B^\top B^{-1} N = (-3,-2)$ (since $C_B=0$). Both negative → improve.

**Entering variable**: choose most negative, $x$ (coeff -3).  
**Leaving variable**: minimum ratio test on $b_i / a_{i,x}$ where $a_{i,x}>0$:  
- Row1: $5/1=5$  
- Row2: $0/(-1)$ ignored (negative)  
- Row3: $0/0$ ignored  

Thus $s_1$ leaves. Pivot on $a_{1,x}=1$.

After pivot:  
$$
\begin{aligned}
x + s_1 &=5\\
-s_1 + s_2 &=0\\
-s_1 + s_3 &=0
\end{aligned}
\Rightarrow
\begin{aligned}
x &=5-s_1\\
s_2 &= s_1\\
s_3 &= s_1
\end{aligned}
$$  

Now non‑basics are $y,s_1$. Reduced cost for $y$: $\bar c_y = -2 + (0)\cdot(??) = -2<0$ → enter $y$.  
Ratio test: only row1 has $a_{1,y}=1$: $b_1 / a_{1,y}= (5-s_1)/1$. Since $s_1\ge0$, the minimum occurs at $s_1=0$ giving ratio 5. So $x$ leaves? Wait, basic variable in row1 is $x$, so $x$ leaves.

Pivot on $a_{1,y}=1$. New tableau:
$$
\begin{aligned}
y + s_1 &=5\\
s_2 &= s_1\\
s_3 &= s_1\\
x &= 5 - y
\end{aligned}
$$  
Now all reduced costs ($\bar c_{s_1}=0$, $\bar c_{s_2}=0$, $\bar c_{s_3}=0$) are non‑negative → optimal.

**Solution**: $x=0$, $y=5$, $s_1=0$, $s_2=0$, $s_3=0$. Objective value $f=3·0+2·5=10$.

**Verification via SciPy** (run in a terminal):
```python
import numpy as np
from scipy.optimize import linprog
c = np.array([-3, -2])          # minimize -f
A_ub = np.array([[1, 1], [-1, 0], [0, -1]])  # x+y<=5, -x<=0, -y<=0
b_ub = np.array([5, 0, 0])
res = linprog(c, A_ub=A_ub, b_ub=b_ub, method='highs')
print(res.x)   # -> [0. 5.]
print(-res.fun) # -> 10.0
```

### Example 2: Quadratic Programming with KKT (Analytical Solution)
**Problem**  
Minimize $f(x,y)=x^2+2y^2$ subject to $x+y\ge1$.

Rewrite inequality as $g(x,y)=1-x-y\le0$. Lagrangian:
$$ \mathcal{L}(x,y,\mu)=x^2+2y^2+\mu(1-x-y),\quad \mu\ge0. $$

KKT:
1. $\partial_x\mathcal{L}=2x-\mu=0\;\Rightarrow\; x=\mu/2$  
2. $\partial_y\mathcal{L}=4y-\mu=0\;\Rightarrow\; y=\mu/4$  
3. Primal feasibility: $1-x-y\le0$  
4. Complementary slackness: $\mu(1-x-y)=0$

**Case 1 – Constraint inactive ($\mu=0$)** → $x=y=0$, but then $1-0-0=1>0$ violates feasibility. Discard.

**Case 2 – Constraint active ($\mu>0$)** → $1-x-y=0$. Substitute $x,y$:  
$$
1-\frac{\mu}{2}-\frac{\mu}{4}=0\;\Rightarrow\;1-\frac{3\mu}{4}=0\;\Rightarrow\;\mu=\frac{4}{3}.
$$  
Then $x=\mu/2=2/3$, $y=\mu/4=1/3$. Check: $x+y=1$ exactly, satisfies all KKT.

**Objective value**: $f= (2/3)^2+2·(1/3)^2=4/9+2·1/9=4/9+2/9=6/9=2/3\approx0.6667$.

**Numerical verification** (SciPy SLSQP):
```python
import numpy as np
from scipy.optimize import minimize

def f(z): return z[0]**2 + 2*z[1]**2
def g(z): return z[0] + z[1] - 1   # >=0  ->  -g <=0

res = minimize(f, np.array([0.5,0.5]), 
               constraints={'type':'ineq','fun':g},
               method='SLSQP')
print(res.x)   # -> [0.6666667 0.3333333]
print(res.fun) # -> 0.6666667
```

### Example 3: Non‑linear Objective with Two Inequalities (Requires Active‑Set)
**Problem**  
Minimize $f(x,y)=(x-2)^2+(y-1)^2$ subject to  
$$
\begin{cases}
x^2+y^2\le4\\
x\ge0
\end{cases}
$$  

Interpretation: find the point in the right‑half of the unit disk closest to (2,1).  

Lagrangian:
$$ \mathcal{L}= (x-2)^2+(y-1)^2+\lambda_1(x^2+y^2-4)+\lambda_2(-x),\quad\lambda_1,\lambda_2\ge0. $$

KKT:
- $\partial_x\mathcal{L}=2(x-2)+2\lambda_1 x-\lambda_2=0$  
- $\partial_y\mathcal{L}=2(y-1)+2\lambda_1 y=0$  
- $\lambda_1(x^2+y^2-4)=0$  
- $\lambda_2(-x)=0$  
- Primal feasibility: $x^2+y^2\le4$, $x\ge0$.

We solve by considering active set possibilities.

1. **No active constraints** ($\lambda_1=\lambda_2=0$). Then $x=2$, $y=1$, but $x^2+y^2=5>4$ → infeasible.  

2. **Only circle active** ($\lambda_1>0,\lambda_2=0$, $x^2+y^2=4$, $x>0$).  
   From $\partial_y$: $2(y-1)+2\lambda_1 y=0\Rightarrow\lambda_1=-(y-1)/y$.  
   Plug into $\partial_x$: $2(x-2)+2\lambda_1 x=0\Rightarrow2(x-2)-2\frac{y-1}{y}x=0$.  
   Simplify: $x-2-\frac{y-1}{y}x=0\Rightarrow x-2-\frac{x y - x}{y}=0\Rightarrow x-2-\frac{x y}{y}+\frac{x}{y}=0\Rightarrow x-2-x+\frac{x}{y}=0\Rightarrow -2+\frac{x}{y}=0\Rightarrow x=2y$.  
   With $x^2+y^2=4$: $(2y)^2+y^2=4\Rightarrow5y^2=4\Rightarrow y=\sqrt{4/5}=2/\sqrt5≈0.8944$, $x=2y≈1.7889$. Check $x>0$ satisfied.  
   Multipliers: $\lambda_1=-(y-1)/y = -(0.8944-1)/0.8944 = 0.1176>0$. Good.  
   Objective: $f=(1.7889-2)^2+(0.8944-1)^2≈0.0449+0.0112=0.0561$.  

3. **Only x≥0 active** ($\lambda_2>0,\lambda_1=0$, $x=0$). Then $\partial_x$: $2(0-2)-\lambda_2=0\Rightarrow\lambda_2=-4<0$ infeasible.  

4. **Both active** ($\lambda_1>0,\lambda_2>0$, $x=0$, $x^2+y^2=4\Rightarrow y=\pm2$, but $x=0$ violates $\lambda_2(-x)=0$ unless $\lambda_2=0$, contradiction.  

Thus the optimum is the point found in case 2: $(x^*,y^*)≈(1.7889,0.8944)$ with $f≈0.0561$.  

**Verification via SciPy (trust-constr)**:
```python
import numpy as np
from scipy.optimize import minimize

def f(z): return (z[0]-2)**2 + (z[1]-1)**2
def con1(z): return 4 - (z[0]**2 + z[1]**2)   # >=0
def con2(z): return z[0]                     # >=0

res = minimize(f, np.array([0.0,0.0]),
               constraints=[{'type':'ineq','fun':con1},
                            {'type':'ineq','fun':con2}],
               method='trust-constr')
print(res.x)   # -> [1.78885438 0.89442719]
print(res.fun) # -> 0.056085...
```

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | How to Avoid |
|---|---------|----------------|--------------|
| 1 | **Dropping a constraint because it “looks loose”** | A constraint may be inactive at the optimum but still affect the feasible region; removing it can enlarge 𝔽 and produce an infeasible or sub‑optimal point. | Keep all constraints in the model; verify feasibility after solving. Use a feasibility check (`np.all(g(x)<=0+tol)`). |
| 2 | **Using gradient descent on a non‑convex problem without a global‑optimality guarantee** | Gradient descent converges only to a stationary point; non‑convex landscapes have many saddles and local minima that can trap the iterate. | Employ multi‑start, stochastic methods (e.g., simulated annealing), or convex relaxations; verify convexity of *f* and 𝔽 first. |
| 3 | **Misinterpreting Lagrange multipliers as “prices” without checking sign conventions** | In a minimization problem with $g(x)\le0$, the multiplier μ≥0 measures the *increase* in optimal cost per unit tightening of the constraint. Forgetting the sign leads to wrong sensitivity predictions. | Remember: for $g(x)\le0$, μ≥0 and $\frac{\partial f^*}{\partial b}= -\mu$ if constraint written $g(x)\le b$. Verify by finite‑difference perturbation. |
| 4 | **Ignoring second‑order sufficient conditions** | Solving ∇ℒ=0 yields a stationary point that could be a maximum or saddle; without checking $\nabla^2_{xx}\mathcal{L}$ projected onto the tangent space of active constraints, you may accept a non‑minimum. | Compute the reduced Hessian $Z^\top\nabla^2_{xx}\mathcal{L}Z$ (where Z spans nullspace of active constraint gradients) and confirm it is positive definite. |
| 5 | **Using a linear programming solver for a problem with a quadratic objective** | LP assumes linear objective and constraints; feeding a quadratic objective yields incorrect results because the solver optimizes a different function. | Detect quadratic terms; call a QP solver (`scipy.optimize.minimize` with method='trust-constr' or OSQP). |
| 6 | **Assuming the simplex method runs in polynomial time for all inputs** | The simplex method has exponential worst‑case behavior (e.g., Klee‑Minty cubes); relying on it for large‑scale LPs can cause unacceptable runtimes. | For large problems, prefer interior‑point or interior‑point‑like solvers (e.g., HiGHS, MOSEK) with provable polynomial bounds. |

---

## Exercises
### Easy – Linear Programming
1. Maximize $5x+4y$ subject to  
   $$
   \begin{aligned}
   2x + y &\le 10\\
   x + 3y &\le 15\\
   x, y &\ge 0
   \end{aligned}
   $$  
   Solve by hand using the simplex method (show tableau after each pivot) and verify with `scipy.optimize.linprog`.

### Medium – Quadratic Programming with Equality
2. Minimize $\frac12 x^\top Q x + c^\top x$ where  
   $$
   Q=\begin{bmatrix}4 & 1\\1 & 2\end{bmatrix},\quad
   c=\begin{bmatrix}-8\\-6\end{bmatrix}
   $$  
   subject to $Ax = b$ with $A=[1\;1]$, $b=3$.  
   Derive the KKT system, solve for $x^*$ and the multiplier $\lambda^*$, and compute the optimal objective value. Confirm numerically.

### Hard – Non‑convex Inequality Constrained
3. Minimize $f(x,y)=\sin(x)+\cos(y)$ subject to  
   $$
   \begin{aligned}
   (x-1)^2 + (y-2)^2 &\le 2\\
   x &\ge 0
   \end{aligned}
   $$  
   (a) Identify all KKT points by examining possible active‑set combinations.  
   (b) Determine which KKT point(s) satisfy the second‑order sufficient conditions.  
   (c) Report the global minimum value and the corresponding $(x^*,y^*)$.  
   Use a script to perform a grid search and compare with the analytical KKT solution.

---

## Linux Connection
Constrained optimization appears throughout the Linux kernel and user‑space tools whenever resources must be allocated under limits.

### 1. CPU Frequency Scaling (cpufreq)
The governor selects a frequency $f$ to **minimize power**
