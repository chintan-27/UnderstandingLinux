---
id: 4
title: "Calculus"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Core Concepts
### Limits
A limit describes the value a function approaches as its input approaches a point, formalized by the ε‑δ definition:  
$$\lim_{x\to a}f(x)=L \iff \forall\varepsilon>0\;\exists\delta>0:\;0<|x-a|<\delta\implies|f(x)-L|<\varepsilon.$$  
This definition is needed because it lets us discuss behavior at points where the function may be undefined (e.g., \(f(x)=\frac{\sin x}{x}\) at \(x=0\)) and provides the rigorous foundation for both derivatives and integrals.

### Derivatives
The derivative of \(f\) at \(a\) is the limit of the average rate of change over an interval shrinking to zero:  
$$f'(a)=\lim_{h\to0}\frac{f(a+h)-f(a)}{h}.$$  
Geometrically, this limit is the slope of the tangent line because the secant line through \((a,f(a))\) and \((a+h,f(a+h))\) rotates to touch the curve as \(h\to0\). From this definition we derive linearity \((cf+g)'=cf'+g'\) and the product rule via algebraic manipulation of the difference quotient.

### Integrals
The definite integral of \(f\) over \([a,b]\) is the limit of Riemann sums:  
$$\int_a^b f(x)\,dx=\lim_{n\to\infty}\sum_{i=1}^n f(x_i^*)\Delta x,\quad \Delta x=\frac{b-a}{n},\;x_i^*\in[x_{i-1},x_i].$$  
If the limit exists, it equals the signed area under the curve. The integral is the inverse operation of differentiation because accumulating infinitesimal changes \(f(x)dx\) reconstructs the net change in the antiderivative.

## How It Works
### Fundamental Theorem of Calculus (FTC)
Let \(F\) be an antiderivative of \(f\) on \([a,b]\) (\(F'=f\)). Then  
$$\int_a^b f(x)\,dx = F(b)-F(a).$$  
*Proof sketch:* Define \(G(x)=\int_a^x f(t)\,dt\). By the limit definition of the derivative,  
$$G'(x)=\lim_{h\to0}\frac{1}{h}\int_x^{x+h}f(t)\,dt = f(x)$$  
(the integrand is approximately constant over the tiny interval). Hence \(G\) is an antiderivative of \(f\); any two antiderivatives differ by a constant, so \(F(b)-F(a)=G(b)-G(a)=\int_a^b f(t)\,dt\).  
This theorem shows why finding an antiderivative suffices to evaluate a definite integral: the integral measures the net change of the antiderivative across the interval.

### Evaluating a Definite Integral
1. **Find an antiderivative** \(F\) such that \(F'=f\).  
2. **Compute** \(F(b)\) and \(F(a)\).  
3. **Subtract** \(F(b)-F(a)\).  
The subtraction works because the FTC guarantees the integral equals exactly that difference; no additional approximation is needed.

## Worked Examples
### Example 1: Derivative of \(f(x)=x^3\)
Start from the definition:
$$f'(x)=\lim_{h\to0}\frac{(x+h)^3-x^3}{h}.$$  
Expand the numerator:
$$(x+h)^3 = x^3+3x^2h+3xh^2+h^3.$$  
Thus
$$\frac{(x+h)^3-x^3}{h}= \frac{3x^2h+3xh^2+h^3}{h}=3x^2+3xh+h^2.$$  
Now take the limit:
$$\lim_{h\to0}(3x^2+3xh+h^2)=3x^2,$$  
since the terms containing \(h\) vanish. Hence \(f'(x)=3x^2\).

### Example 2: Definite Integral \(\displaystyle\int_0^1 x^2\,dx\)
Find an antiderivative: \(\displaystyle F(x)=\frac{x^3}{3}\) because \(\frac{d}{dx}\left(\frac{x^3}{3}\right)=x^2\).  
Apply FTC:
$$\int_0^1 x^2\,dx = F(1)-F(0)=\frac{1^3}{3}-\frac{0^3}{3}=\frac{1}{3}.$$  
*Verification via Riemann sum:* With \(n\) subintervals, \(\Delta x=1/n\), right‑hand sum  
$$S_n=\sum_{i=1}^n \left(\frac{i}{n}\right)^2\frac{1}{n}= \frac{1}{n^3}\sum_{i=1}^n i^2 =\frac{1}{n^3}\cdot\frac{n(n+1)(2n+1)}{6}.$$  
Taking the limit \(n\to\infty\) yields \(\frac{1}{3}\), confirming the result.

## Common Mistakes
| Mistake | Why it’s wrong | Correct approach |
|---------|----------------|------------------|
| **Treating \(\frac{dy}{dx}\) as a fraction and cancelling differentials arbitrarily** | The derivative is a limit, not a ratio of infinitesimals; cancellation can lead to invalid results (e.g., in implicit differentiation). | Apply the chain rule formally: \(\frac{dy}{dx}=\frac{dy}{du}\cdot\frac{du}{dx}\) only after proving \(y\) and \(u\) are differentiable functions of \(x\). |
| **Forgetting the constant of integration in indefinite integrals** | An antiderivative is defined up to an additive constant; omitting it loses the family of solutions and breaks initial‑value problems. | Always write \(\int f(x)\,dx = F(x)+C\) and determine \(C\) from given conditions. |
| **Applying L’Hôpital’s rule to limits that are not indeterminate** | The rule requires \(\frac{0}{0}\) or \(\frac{\pm\infty}{\pm\infty}\); using it otherwise can give false limits. | Verify the indeterminate form first; if not present, evaluate the limit directly or use algebraic manipulation. |
| **Confusing definite and indefinite integrals when computing area** | A definite integral yields signed area; to get total area you must split intervals where the function changes sign. | Compute \(\int_a^b |f(x)|dx = \int_{a}^{c} -f(x)dx + \int_{c}^{b} f(x)dx\) if \(f\) changes sign at \(c\). |
| **Misapplying the power rule to functions with variable exponents** | \(\frac{d}{dx}x^n = nx^{n-1}\) holds only for constant \(n\); for \(x^{g(x)}\) you need logarithmic differentiation. | Use \(\frac{d}{dx}x^{g(x)} = x^{g(x)}\bigl(g'(x)\ln x + \frac{g(x)}{x}\bigr)\). |

## Exercises
1. **Easy:** Compute the derivative of \(f(x)=5x^4-2x^2+7\) using the power rule.  
2. **Medium:** Evaluate \(\displaystyle\int_0^{\pi/2} \sin x\,dx\) by finding an antiderivative and applying the FTC.  
3. **Hard:** Let  
   $$f(x)=\begin{cases}
   x^2 & x<1\\
   2x-1 & x\ge 1
   \end{cases}$$  
   Determine whether \(f\) is differentiable at \(x=1\). If it is, find \(f'(1)\); if not, explain which condition of differentiability fails.

## Linux Connection
Calculus appears in many Linux‑based scientific and engineering tools. Below are concrete ways to invoke them from the shell.

### GNU Octave
Octave provides symbolic and numeric calculus functions.  
```bash
# Install Octave on Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y octave

# Symbolic derivative of x^3
octave --silent --eval "syms x; f = x^3; df = diff(f, x); disp(df)"
```
Output: `3*x^2`

### Python + SciPy/NumPy
Python scripts can compute integrals numerically and symbolically via SymPy.  
```bash
# Install required packages
sudo apt-get install -y python3-pip
pip3 install numpy scipy sympy

# Numerical integral of x^2 from 0 to 1 using scipy
python3 - <<'PY'
import numpy as np
from scipy import integrate
result, error = integrate.quad(lambda x: x**2, 0, 1)
print(f"Integral = {result:.10f}, error estimate = {error:.2e}")
PY
```
Output: `Integral = 0.3333333333, error estimate = 2.22e-15`

### Using `bc` for a Riemann sum
A quick shell calculation of a left‑hand Riemann sum with 10 000 slices:  
```bash
n=10000
dx=$(echo "scale=12; 1/$n" | bc -l)
sum=0
for i in $(seq 0 $((n-1))); do
    x=$(echo "scale=12; $i*$dx" | bc -l)
    term=$(echo "scale=12; $x*$x" | bc -l)
    sum=$(echo "scale=12; $sum+$term" | bc -l)
done
integral=$(echo "scale=12; $sum*$dx" | bc -l)
echo "Riemann sum ≈ $integral"
```
Typical result: `Riemann sum ≈ 0.333300000000` (approaches 1/3 as \(n\) grows).

### File Locations (typical Ubuntu install)
- Octave binary: `/usr/bin/octave`  
- SciPy library: `/usr/lib/python3/dist-packages/scipy`  
- SymPy (pip install): `~/.local/lib/python3.x/site-packages/sympy`  

These paths let you verify installations or debug library version mismatches.

## Why This Matters
Calculus is not abstract theory; it is the language that turns continuous change into computable quantities on Linux systems:

- **Signal processing:** The Fourier transform, an integral of a signal multiplied by complex exponentials, underpins audio filters, image compression (JPEG, MPEG), and network traffic analysis. Tools like `ffmpeg` and `fftw3` rely on integral formulations.
- **Optimization & Machine Learning:** Gradient descent updates parameters using the derivative of a loss function. Libraries such as TensorFlow, PyTorch, and SciPy’s `optimize` module compute derivatives automatically (autodiff) to train models on CPUs/GPUs accessible via `/dev/nvidia*` or `/dev/dri`.
- **Physics simulations:** Solving differential equations (e.g., Navier–Stokes for fluid dynamics) requires numerical integration schemes (Runge–Kutta, finite element). Packages like PETSc and FEniCS are invoked from the command line to run simulations on clusters.
- **Computer graphics:** Ray tracing evaluates integrals over hemispheres to compute lighting (the rendering equation). Open-source renderers such as Blender’s Cycles use Monte‑Carlo integration, a direct application of the Riemann sum concept.
- **Systems performance analysis:** The `perf` tool samples hardware counters over time; estimating event rates involves differentiating counter values, while estimating total elapsed time integrates sampling intervals—both grounded in calculus fundamentals.

By mastering limits, derivatives, and integrals, you gain the ability to read, modify, and extend the very tools that power scientific computing, graphics, and machine learning on Linux. This deepens not only your theoretical understanding but also your practical capacity to innovate and debug real‑world software.
