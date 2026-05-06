---
id: 11
title: "Numerical methods"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Core Concepts
### Approximation from First Principles
In numerical analysis we replace an exact mathematical object \(f\) by a computable surrogate \(\tilde f\). The surrogate is chosen so that the error \(e = f - \tilde f\) is bounded and, ideally, decreases as we invest more computational effort.  
*Why* we approximate: most interesting functions (e.g., \(\sin x\), \(e^x\), solutions of ODEs) lack closed‑form inverses or require solving nonlinear equations; exact evaluation would need infinite series or recursion that cannot be terminated.  
*How* we bound the error: we derive a truncation term from the Taylor remainder theorem. For a function with \(n+1\) continuous derivatives,
\[
f(x) = P_n(x) + R_n(x),\qquad 
R_n(x)=\frac{f^{(n+1)}(\xi)}{(n+1)!}(x-x_0)^{n+1},\ \xi\in[x_0,x].
\]
If we can bound \(|f^{(n+1)}|\) on the interval, we obtain a guaranteed error bound. This causal link—more terms \(\Rightarrow\) smaller power of \((x-x_0)\) \(\Rightarrow\) smaller remainder—is the foundation of all approximation schemes.

### Floating‑Point Error: Sources and Propagation
A floating‑point number represents a real value as 
\[
x = (-1)^s \times m \times 2^{e},
\]
where \(s\) is the sign bit, \(m\in[1,2)\) the mantissa (precision \(p\) bits), and \(e\) the exponent. The set of representable numbers is discrete; the distance between adjacent numbers (the **unit in the last place**, ULP) is 
\[
\mathrm{ulp}(x)=2^{e-p+1}.
\]
When an exact real result \(r\) lies between two representable numbers, the hardware rounds to the nearest, incurring a rounding error bounded by \(\frac{1}{2}\mathrm{ulp}(r)\).  

Two error mechanisms matter:
1. **Rounding error** – occurs at each arithmetic operation.  
2. **Cancellation error** – when subtracting nearly equal numbers, the relative error can blow up because the leading significant bits cancel, leaving only the noisy lower bits.

*Why* it matters: the total error after \(k\) operations can grow roughly as \(k\,\epsilon_{\text{mach}}\) (where \(\epsilon_{\text{mach}}=2^{-p+1}\) is machine epsilon) if errors accumulate linearly, or exponentially if the problem is ill‑conditioned. Understanding the source lets us redesign algorithms to avoid catastrophic cancellation (e.g., using Kahan summation or reformulating \((x^2-1)/(x-1)\) as \(x+1\) for \(x\approx1\)).

### Stability: Definition and Mechanism
A numerical method is **stable** if small perturbations in input or intermediate results produce proportionally small changes in the final output. Formally, for a method mapping input data \(d\) to output \(y\),
\[
\frac{\|\Delta y\|}{\|y\|}\le C\frac{\|\Delta d\|}{\|d\|},
\]
with a modest constant \(C\) independent of problem size.  

*Why* instability arises: many iterative schemes amplify errors via the spectral radius of their iteration matrix. For a linear fixed‑point iteration \(x_{k+1}=Ax_k+b\), the error evolves as \(e_{k+1}=Ae_k\). If \(\rho(A)>1\) (spectral radius larger than one), any initial error is magnified, causing divergence. Conversely, if \(\rho(A)<1\), errors contract and the method is stable.  

Thus stability analysis reduces to examining the eigenvalues of the linearization of the update rule.

### Iterative Methods: Linear vs. Nonlinear
Iterative methods generate a sequence \(\{x_k\}\) that converges to a solution \(x^\*\).  
*Linear* iterative methods apply a fixed linear operator: \(x_{k+1}=Mx_k+c\). Convergence speed is governed by \(\rho(M)\); the asymptotic error reduction factor per step is \(\rho(M)\).  

*Nonlinear* iterative methods (e.g., Newton‑Raphson) linearize the problem at each step:
\[
x_{k+1}=x_k - [J_f(x_k)]^{-1}f(x_k),
\]
where \(J_f\) is the Jacobian. Near a simple root, the error satisfies
\[
\|e_{k+1}\|\approx \frac{1}{2}\frac{\|J_f^{-1}(x^\*)\|\, \|f''(x^\*)\|}{\|f'(x^\*)\|}\|e_k\|^2,
\]
yielding **quadratic** convergence—error squares each iteration—provided the initial guess is sufficiently close and the Jacobian remains nonsingular.  

*Why* we prefer nonlinear methods when available: they achieve high accuracy in far fewer steps, reducing total rounding error accumulation.

---

## How It Works
### Deriving a First‑Order Finite Difference Approximation
Consider approximating \(f'(x_0)\). Using Taylor expansions forward and backward:
\[
\begin{aligned}
f(x_0+h) &= f(x_0) + h f'(x_0) + \frac{h^2}{2}f''(x_0) + \frac{h^3}{6}f'''(\xi_+),\\
f(x_0-h) &= f(x_0) - h f'(x_0) + \frac{h^2}{2}f''(x_0) - \frac{h^3}{6}f'''(\xi_-).
\end{aligned}
\]
Subtracting eliminates the zeroth and second‑order terms:
\[
f(x_0+h)-f(x_0-h)=2h f'(x_0)+\frac{h^3}{6}\bigl(f'''(\xi_+)+f'''(\xi_-)\bigr).
\]
Hence the **central difference** formula
\[
f'(x_0)\approx\frac{f(x_0+h)-f(x_0-h)}{2h}
\]
has truncation error \(\displaystyle \frac{h^2}{6}f'''(\xi)\) for some \(\xi\).  
*Why* central? The error term is \(O(h^2)\) versus \(O(h)\) for forward/backward differences, giving higher accuracy for the same step size.  

Choosing \(h\) involves a trade‑off: truncation error \(\propto h^2\) versus rounding error \(\propto \epsilon_{\text{mach}}/h\). The optimal \(h\) minimizes total error:
\[
\frac{d}{dh}\bigl(C_1 h^2 + C_2 \frac{\epsilon}{h}\bigr)=0\;\Rightarrow\;h_{\text{opt}}=\bigl(\frac{C_2\epsilon}{2C_1}\bigr)^{1/3}.
\]

### Implementation: Central Difference with Error Estimate (C)
```c
#include <stdio.h>
#include <math.h>
#include <float.h>

/* Central difference with optional error bound */
double central_diff(double (*f)(double), double x, double h,
                    double *error_est)
{
    double fxph = f(x + h);
    double fxmh = f(x - h);
    double deriv = (fxph - fxmh) / (2.0 * h);

    /* Estimate third derivative via finite difference of second derivative */
    double fxxph = f(x + 2*h);
    double fxxmh = f(x - 2*h);
    double fpp   = (fxxph - 2*f(x) + fxxmh) / (2.0 * h * h); /* f'' approx */
    double fppp  = (f(x+3*h) - 3*f(x+2*h) + 3*f(x+h) - f(x)) / (h*h*h); /* crude f''' */
    *error_est = fabs((h*h)/6.0 * fppp);   /* truncation bound */
    return deriv;
}

double my_sin(double x) { return sin(x); }

int main(void)
{
    double x0 = M_PI/4;          /* 0.785398... */
    double h  = pow(DBL_EPSILON, 1.0/3.0); /* ~1e-5 */
    double err;
    double df = central_diff(my_sin, x0, h, &err);
    printf("cos(%g) ≈ %.15f  (error estimate ±%g)\n",
           x0, df, err);
    printf("True cos(%g) = %.15f\n", x0, cos(x0));
    return 0;
}
```
*Explanation*:  
- `h` chosen via the cube‑root rule balances truncation and rounding.  
- The error estimate uses a finite‑difference approximation of the third derivative; if unavailable, a user‑supplied bound may be inserted.  
- The program prints both the approximation and the true value for verification.

### Deriving the Newton‑Raphson Update from Taylor’s Theorem
We seek \(x\) such that \(f(x)=0\). Expand \(f\) about current guess \(x_k\):
\[
f(x_k+e)=f(x_k)+e f'(x_k)+\frac{e^2}{2}f''(\xi).
\]
Setting the left‑hand side to zero and dropping the quadratic term yields the linear correction
\[
e\approx -\frac{f(x_k)}{f'(x_k)}.
\]
Thus the iteration
\[
x_{k+1}=x_k-\frac{f(x_k)}{f'(x_k)}.
\]
*Why* quadratic convergence? Substituting the exact expression for the error and retaining the quadratic term gives
\[
e_{k+1}= \frac{f''(\xi)}{2f'(x_k)}e_k^{\,2},
\]
so the error squares each step (provided \(f'(x^\*)\neq0\) and \(f''\) bounded).

### Worked Example 1: Taylor Approximation with Rigorous Error Bound
**Problem**: Approximate \(f(x)=e^x\) at \(x=0.2\) using a third‑order Taylor polynomial about \(x_0=0\).  

**Step‑by‑step**  
1. Derivatives at 0: \(f^{(0)}(0)=1,\;\(\%\) \(f^{(1)}(0)=1,\; f^{(2)}(0)=1,\; f^{(3)}(0)=1\).  
2. Polynomial:  
   \[
   P_3(x)=1+x+\frac{x^2}{2}+\frac{x^3}{6}.
   \]  
3. Evaluate at \(x=0.2\):  
   \[
   P_3(0.2)=1+0.2+\frac{0.04}{2}+\frac{0.008}{6}
          =1+0.2+0.02+0.001\overline{3}=1.221\overline{3}.
   \]  
4. Remainder bound (Lagrange form):  
   \[
   |R_3(0.2)|\le \frac{\max_{[0,0.2]}|f^{(4)}(t)|}{4!}|0.2|^{4}
              =\frac{e^{0.2}}{24}\times0.0016
              \approx\frac{1.2214}{24}\times0.0016
              \approx8.14\times10^{-5}.
   \]  
5. Thus the true value lies in \([1.22125,1.22141]\).  
6. Actual \(e^{0.2}=1.221402758\); error \(|e^{0.2}-P_3|=1.43\times10^{-4}\), consistent with the bound.

**C implementation with bound**
```c
#include <stdio.h>
#include <math.h>

double taylor_exp3(double x)
{
    return 1.0 + x + 0.5*x*x + (1.0/6.0)*x*x*x;
}

int main(void)
{
    double x = 0.2;
    double approx = taylor_exp3(x);
    /* bound using max exp on [0,x] = exp(x) */
    double bound = exp(x) * pow(x,4) / 24.0;
    printf("P3(%.2f)=% .10f\n", x, approx);
    printf("True exp(%.2f)=% .10f\n", x, exp(x));
    printf("Error ≤ %e\n", bound);
    return 0;
}
```

### Worked Example 2: Newton‑Raphson for \(x^3-2x-5=0\)
**Function**: \(f(x)=x^3-2x-5,\; f'(x)=3x^2-2\).  

**Iteration table** (starting \(x_0=2\)):
| k | \(x_k\) | \(f(x_k)\) | \(f'(x_k)\) | correction \(-f/f'\) | \(x_{k+1}\) |
|---|---------|------------|-------------|----------------------|------------|
| 0 | 2.000000| \(-1\)    | 10          | 0.100000             | 2.100000 |
| 1 | 2.100000| 0.261000  | 11.23       | -0.023250            | 2.076750 |
| 2 | 2.076750| 0.001928  | 10.95       | -0.000176            | 2.076574 |
| 3 | 2.076574| 1.2e‑7    | 10.95       | -1.1e‑8              | 2.076574 |

Convergence to \(x^\*\approx2.076574\) after three updates; error drops roughly by a factor of \(10^2\) each step, confirming quadratic behavior.

**C code with dynamic stopping**
```c
#include <stdio.h>
#include <math.h>

double f(double x) { return x*x*x - 2*x - 5; }
double df(double x){ return 3*x*x - 2; }

int main(void)
{
    double x = 2.0;          /* initial guess */
    double tol = 1e-12;
    int max_iter = 20;
    for (int i=0; i<max_iter; ++i) {
        double fx = f(x);
        double dfx = df(x);
        if (fabs(fx) < tol) break;
        double dx = -fx/dfx;
        x += dx;
        printf("iter %2d: x = %.15f, f(x) = %.3e\n", i, x, fx);
    }
    printf("Root ≈ %.15f\n", x);
    return 0;
}
```

### Worked Example 3: Adaptive Step‑Size Runge‑Kutta (RK45) for \(y' = -2y,\ y(0)=1\)
The exact solution is \(y(t)=e^{-2t}\). We implement a Dormand‑Prince 5(4) pair, which provides an embedded 4th‑order estimate to control error.

**Python snippet (illustrative)**
```python
import numpy as np

def rk45_step(f, t, y, h):
    # Butcher tableau for Dormand-Prince (coefficients omitted for brevity)
    # ... compute k1..k7 ...
    y5 = y + h * sum(b5[i]*k[i] for i in range(7))   # 5th order
    y4 = y + h * sum(b4[i]*k[i] for i in range(7))   # 4th order
    err = np.linalg.norm(y5 - y4)                    # error estimate
    return y5, err

def adaptive_rk45(f, t0, y0, t_end, tol=1e-6):
    t, y, h = t0, y0, 0.1
    ts, ys = [t], [y]
    while t < t_end:
        y1, err = rk45_step(f, t, y, h)
        if err <= tol:
            t += h
            y = y1
            ts.append(t); ys.append(y)
        h *= min(2.0, max(0.5, 0.9*(tol/err)**0.2))
    return np.array(ts), np.array(ys)

# usage
ts, ys = adaptive_rk45(lambda t, y: -2*y, 0.0, 1.0, 2.0, 1e-4)
print("t={:.3f} y_approx={:.6f} y_exact={:.6f} err={:.2e}".format(
      ts[-1], ys[-1], np.exp(-2*ts[-1]), abs(ys[-1]-np.exp(-2*ts[-1]))))
```
*Why adaptive?* The step size grows when the solution is smooth (error small) and shrinks where rapid change demands higher resolution, keeping the global error near the tolerance while minimizing function evaluations.

---

## Common Mistakes
### 1. Ignoring Cancellation in Difference Formulas
**What**: Using \(\frac{f(x+h)-f(x)}{h}\) to estimate a derivative when \(f\) is nearly flat (e.g., \(f(x)=\cos x\) near \(x=0\)).  
**Why wrong**: For small \(h\), \(f(x+h)\approx f(x)\); the subtraction loses significant bits, leaving only rounding error. The resulting derivative can be orders of magnitude larger than the true value.  
**Fix**: Use a symmetric formula (central difference) or reformulate analytically (e.g., derivative of \(\cos x\) is \(-\sin x\)).

### 2. Applying an Unstable Fixed‑Point Iteration Without Preconditioning
**What**: Solving \(x = \cos x\) via the iteration \(x_{k+1}=\cos x_k\) starting far from the solution.  
**Why wrong**: The iteration function \(g(x)=\cos x\) has \(|g'(x^\*)| = |\sin x^\*| \approx 0.9\) near the fixed point \(x^\*\approx0.739\); while convergent, the rate is slow. If one mistakenly uses \(x_{k+1}=2\cos x_k\), the derivative magnitude exceeds 1, causing divergence.  
**Fix**: Check \(|g'(x)|<1\) in a neighbourhood; otherwise apply Newton’s method or use relaxation \(x_{k+1}=(1-\lambda)x_k+\lambda g(x_k)\) with \(0<\lambda<1\).

### 3. Forgetting to Verify Convergence Criteria in Iterative Solvers
**What**: Running a Newton‑Raphson loop for a fixed number of iterations without monitoring \(|f(x_k)|\) or \(\|x_{k+1}-x_k\|\).  
**Why wrong**: For poorly conditioned problems or bad initial guesses, the method may stagnate or diverge; a fixed iteration count can waste CPU time or produce a wildly inaccurate result.  
**Fix**: Always include a dual stopping test:  
\[
|f(x_k)|<\text{tol}_f \quad\text{or}\quad \|x_{k+1}-x_k\|<\text{tol}_x,
\]
and enforce a maximum iteration count as a safety net.

---

## Exercises
### Easy – Approximation & Error Bound
1. **Task**: Approximate \(\ln(1.25)\) using a second‑order Taylor polynomial about \(x_0=1\).  
   - Derive the polynomial, compute the numeric value, and give a rigorous Lagrange remainder bound.  
   - Write a C program that prints the approximation, the true value (using `log`), and the error bound.  

### Medium – Root‑Finding with Safeguards
2. **Task**: Find the root of \(f(x)=x^3 - x - 2\) using Newton‑Raphson.  
   - Implement the method in Python, including:  
     * a check for zero derivative,  
     * a fallback to bisection if Newton fails to reduce \(|f|\) after 5 iterations,  
     * reporting iteration count and final residual.  
   - Test with initial guesses \(x_0=0,\,1,\,2\).  

### Hard – Adaptive ODE Solver & Performance Analysis
3. **Task**: Implement an adaptive Runge‑Kutta‑Fehlberg (RK45) solver in C for the stiff system  
   \[
   \begin{cases}
   y_1' = -100 y_1 + 100 y_2\\
   y_2' = y_1 - y_2 + t
   \end{cases},
   \quad
   y_1(0)=1,\;y_2(0)=0,
   \]
   on \(t\in[0,0.1]\).  
   - Use the embedded error estimate to enforce a local tolerance of \(10^{-5}\).  
   - Output the number of steps taken and the global error compared to a high‑precision solution obtained with `odeint` from SciPy (you may call it via `subprocess`).  
   - Discuss how stiffness influences step size and why an explicit RK method may require many steps; suggest switching to an implicit method (e.g., backward Euler) and outline the changes needed.  

---

## Linux Connection
Numerical methods are not just academic; they are baked into the Linux ecosystem at multiple layers.

| Subsystem / Tool | Numerical Technique | Concrete Example |
|------------------|--------------------|------------------|
| **CFS Scheduler** | Exponential moving average (EMA) for load tracking | `/proc/sched_debug` shows `load_avg` updated each tick: `load_avg = load_avg * exp(-Δt/τ) + Δ` where `τ` is the scheduling period. |
| **TCP Congestion Control (VEGAS)** | RTT‑based linear model | `sysctl -n net.ipv4.tcp_congestion_control` → `vegas`. The algorithm updates `cwnd` using `diff = (base_rtt - cur_rtt)/base_rtt`. |
| **FFmpeg’s FDCT/IDCT** | Discrete cosine transform (DCT) via integer approximations | Run `ffmpeg -flags +pseudo -i in.wav out.wav` and inspect `libavcodec/dct.c` for the Chen algorithm that reduces floating‑point ops. |
| **GNU Octave / SciPy** | High‑level numerical linear algebra (BLAS, LAPACK) | Install with `sudo apt-get install octave libopenblas-dev liblapack-dev`. Example: `octave --eval "A=rand(1000); tic; inv(A); toc"` measures time spent in BLAS. |
| **PETSc** | Krylov subspace methods (GMRES, CG) for PDEs | `./configure --with-openmp && make && ./ex1 -ksp_type gmres -pc_type ilu`. Demonstrates iterative solvers for sparse matrices from finite‑element discretizations. |
| **perf** | Hardware counter‑based performance analysis (numerical timing) | `perf stat -e cycles,instructions,cache-references ./a.out` reveals how many cycles a numerical kernel spends stalling on memory latency. |
| **bc / awk** | Arbitrary‑precision
