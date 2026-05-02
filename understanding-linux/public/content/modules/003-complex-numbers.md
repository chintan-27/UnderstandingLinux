---
id: 3
title: "Complex numbers"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every oscillating quantity in a physical system carries two independent pieces of information: how large the oscillation is (amplitude) and where in the cycle it currently sits (phase). Real arithmetic forces you to track these separately, which means every operation on sinusoids requires expanding trigonometric identities. Multiply two sinusoids in real arithmetic and you get a sum-of-products identity; do the same with complex exponentials and you get a single line. Complex numbers are not a convenience — they are the minimal algebraic structure that makes linear time-invariant system analysis tractable.

This matters directly for Linux systems work: the ALSA kernel driver applies IIR biquad filters whose coefficients are derived from poles and zeros in the complex plane; `numpy.fft` and `scipy.signal` represent filter transfer functions as ratios of complex polynomials; audio resampling in PipeWire uses sinc interpolation whose frequency-domain behavior is described entirely in terms of $e^{j\omega}$. If you cannot read complex impedance or a transfer function expressed as $H(j\omega)$, you cannot interpret what these subsystems are doing.

---

## Core Concepts

### Real and Imaginary Parts

A complex number is an ordered pair of real numbers written as a single algebraic object:

$$z = a + jb$$

where $a = \text{Re}(z)$ and $b = \text{Im}(z)$. The symbol $j$ (engineering convention) or $i$ (mathematics convention) is defined by the single axiom $j^2 = -1$. This extends the real numbers into a **field**: every nonzero element has a multiplicative inverse, so division is always defined (except by zero), and all four arithmetic operations stay within the set.

Geometrically, $z$ is a point in the **Argand plane**: real axis horizontal, imaginary axis vertical. The geometry is load-bearing, not decorative — multiplication of two complex numbers corresponds to rotation and scaling in that plane, which is exactly what happens to a sinusoidal signal as it passes through a linear system.

### Polar Form and Magnitude

The Cartesian form $a + jb$ and the polar form are two coordinate systems for the same point. The conversion is:

$$|z| = \sqrt{a^2 + b^2}, \qquad \theta = \arg(z) = \operatorname{atan2}(b,\, a)$$

Note $\operatorname{atan2}$ rather than $\arctan(b/a)$: the two-argument form preserves the correct quadrant when $a \leq 0$. In polar form:

$$z = |z|\,(\cos\theta + j\sin\theta)$$

The magnitude $|z|$ is the amplitude of the oscillation this number represents; the angle $\theta$ is its phase. Separating them into polar coordinates is what makes multiplication geometrically transparent.

### Euler's Formula

$$e^{j\theta} = \cos\theta + j\sin\theta$$

This is a theorem, not a definition. It follows from substituting $x = j\theta$ into the real-valued Taylor series for $e^x$ and observing that the powers of $j$ cycle with period 4: $j^0=1,\; j^1=j,\; j^2=-1,\; j^3=-j,\; j^4=1,\ldots$ The even-indexed terms collect into the cosine series; the odd-indexed terms (each carrying a factor of $j$) collect into $j$ times the sine series. The derivation is in the next section.

The consequence is that polar form becomes:

$$z = |z|\,e^{j\theta}$$

and multiplication reduces to:

$$z_1 z_2 = |z_1||z_2|\,e^{j(\theta_1+\theta_2)}$$

Magnitudes multiply; angles add. This is the algebraic reason complex exponentials are the natural basis functions for linear systems: a system that scales amplitude and shifts phase acts by multiplying its input by a single complex number.

### Phasors

A **phasor** represents a steady-state sinusoid as a time-frozen complex amplitude. Given:

$$v(t) = V_0\cos(\omega t + \phi)$$

the phasor is:

$$\tilde{V} = V_0\,e^{j\phi}$$

The time-domain signal is recovered by:

$$v(t) = \operatorname{Re}\!\left(\tilde{V}\,e^{j\omega t}\right)$$

The $e^{j\omega t}$ factor is frozen out because, in a circuit or filter driven at a single frequency $\omega$, every voltage and current shares the same $e^{j\omega t}$. It appears on both sides of every equation and cancels. What remains is a system of complex algebraic equations — no differential equations, no trigonometric identities.

This is the step that converts a circuit's integro-differential equations into Ohm's law applied to complex numbers.

### Impedance

Impedance $Z$ is the phasor-domain generalization of resistance. It is defined by $\tilde{V} = Z\tilde{I}$, exactly Ohm's law, where both $\tilde{V}$ and $\tilde{I}$ are phasors.

| Component | Impedance | Physical meaning |
|-----------|-----------|-----------------|
| Resistor $R$ | $Z = R$ | Dissipates energy; no phase shift |
| Inductor $L$ | $Z = j\omega L$ | Voltage leads current by $90°$; stores magnetic energy |
| Capacitor $C$ | $Z = \dfrac{1}{j\omega C}$ | Current leads voltage by $90°$; stores electric energy |

The imaginary part of $Z$ is called **reactance**. Pure reactance stores and returns energy each cycle rather than dissipating it — this is why inductors and capacitors act as frequency-selective elements. A purely real $Z$ would mean a purely resistive network: flat frequency response, no filtering.

---

## How It Works

### Euler's Formula from the Taylor Series

The Taylor series for $e^x$, $\cos x$, and $\sin x$ all converge absolutely for every complex $x$, so substitution is valid:

$$e^{j\theta} = \sum_{n=0}^{\infty}\frac{(j\theta)^n}{n!} = 1 + j\theta + \frac{(j\theta)^2}{2!} + \frac{(j\theta)^3}{3!} + \frac{(j\theta)^4}{4!} + \cdots$$

Apply the cycle $j^2=-1,\; j^3=-j,\; j^4=1$:

$$e^{j\theta} = 1 + j\theta - \frac{\theta^2}{2!} - j\frac{\theta^3}{3!} + \frac{\theta^4}{4!} + j\frac{\theta^5}{5!} - \cdots$$

Collect real and imaginary parts:

$$e^{j\theta} = \underbrace{\left(1 - \frac{\theta^2}{2!} + \frac{\theta^4}{4!} - \cdots\right)}_{\cos\theta} \;+\; j\underbrace{\left(\theta - \frac{\theta^3}{3!} + \frac{\theta^5}{5!} - \cdots\right)}_{\sin\theta}$$

The derivation requires no geometric intuition — it is pure algebraic manipulation of convergent series.

### Complex Arithmetic in Python

Python's `cmath` module operates on complex numbers natively. `1j` is Python's literal for $j$.

```python
import cmath
import math

# Two phasors: V = 10∠30°, I = 2∠−45°
V = 10 * cmath.exp(1j * math.radians(30))
I =  2 * cmath.exp(1j * math.radians(-45))

Z = V / I   # Impedance: Z = V/I

print(f"V      = {V:.4f}")                              # (8.6603+5.0000j)
print(f"I      = {I:.4f}")                              # (1.4142-1.4142j)
print(f"Z      = {Z:.4f}")                              # complex impedance
print(f"|Z|    = {abs(Z):.4f}")                         # magnitude = |V|/|I| = 5.0
print(f"∠Z     = {math.degrees(cmath.phase(Z)):.2f}°") # phase = 30−(−45) = 75°
```

```python
# Verify Euler's formula numerically
theta = math.pi / 3   # 60°
lhs = cmath.exp(1j * theta)
rhs = complex(math.cos(theta), math.sin(theta))
print(f"e^(jπ/3)  = {lhs:.10f}")
print(f"cos+j·sin = {rhs:.10f}")
print(f"Residual  = {abs(lhs - rhs):.2e}")   # should be ~0 (floating-point noise only)
```

```python
# Series RC transfer function H(jω) = 1 / (1 + jωRC)
# As ω increases, |H| drops and phase shifts negative — this is a low-pass filter.
R = 1e3        # 1 kΩ
C = 1e-6       # 1 µF
# Corner frequency: ω₀ = 1/RC
omega_0 = 1 / (R * C)   # 1000 rad/s ≈ 159 Hz

for omega in [omega_0 / 10, omega_0, omega_0 * 10]:
    H = 1 / (1 + 1j * omega * R * C)
    print(f"ω={omega:8.1f} rad/s | |H|={abs(H):.4f} | ∠H={math.degrees(cmath.phase(H)):7.2f}°")
