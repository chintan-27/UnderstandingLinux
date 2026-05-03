---
id: 16
title: "Classical mechanics basics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every physical simulation, every thermal throttling decision in a CPU driver, and every vibration sensor in a hard drive protection system runs on classical mechanics. Conservation of momentum explains why a rocket accelerates in vacuum — and why a process cannot "borrow" CPU time without another process losing it. Energy conservation explains why a spring stops oscillating: the energy hasn't vanished, it has become disordered atomic vibration, which is exactly what thermal noise in your hardware is. These are not analogies. They are the same physics at different scales.

---

## Core Concepts

### Force and Newton's Second Law

Force is the rate of change of momentum:

$$F = \frac{dp}{dt}$$

For constant mass this reduces to $F = ma$, but the momentum form is prior. It correctly handles variable-mass systems — a rocket expelling propellant, a raindrop accumulating mass — without modification. The quantity $J = \int F \, dt = \Delta p$ is **impulse**: a brief large force and a long small force are interchangeable if their time-integrals are equal.

### Conservation of Momentum

Newton's Third Law states that for every internal force $F_{12}$ particle 1 exerts on particle 2, there is an equal and opposite force $F_{21} = -F_{12}$. Therefore:

$$\frac{dp_1}{dt} + \frac{dp_2}{dt} = F_{12} + F_{21} = 0$$

$$\frac{d(p_1 + p_2)}{dt} = 0$$

Total momentum is conserved. This is not an assumption — it is a direct consequence of Newton's Third Law. The constraint is that *no net external force* acts. Internal forces, regardless of their complexity, cancel exactly.

### Conservative Forces and Potential Energy

A force is **conservative** if the work it does between two points is path-independent. This is equivalent to the force having zero curl: $\nabla \times F = 0$. For such forces, a scalar potential $U(\mathbf{r})$ exists satisfying:

$$\mathbf{F} = -\nabla U$$

The sign is not arbitrary: $\mathbf{F}$ points in the direction of decreasing $U$, so moving with the force releases potential energy as kinetic energy. The reference level $U = 0$ can be placed anywhere because conservation depends only on differences:

$$\Delta T = -\Delta U \implies T + U = \text{const}$$

Non-conservative forces (friction, drag) do path-dependent work. They don't violate energy conservation — they transfer energy into microscopic degrees of freedom that we stop tracking.

### Equilibrium and Small Oscillations

At a potential minimum, $\frac{dU}{dr} = 0$: the force is zero. Displacing the system slightly produces a restoring force because the potential is curving upward. Taylor-expanding any smooth $U(x)$ around its minimum $x_0$:

$$U(x) \approx U(x_0) + \frac{1}{2}U''(x_0)(x - x_0)^2$$

The linear term vanishes because $x_0$ is a minimum. The effective spring constant is $k = U''(x_0)$, giving angular frequency:

$$\omega = \sqrt{\frac{k}{m}} = \sqrt{\frac{U''(x_0)}{m}}$$

This is universal: atomic bonds, pendulums, quartz oscillators, LC circuits — near any stable equilibrium, every system reduces to the same equation. The approximation breaks down when displacement is large enough that higher-order terms in the Taylor expansion become significant.

### Thermal Motion

Heat is the kinetic energy of random, phase-incoherent microscopic motion. The equipartition theorem assigns $\frac{1}{2}k_B T$ of average energy to each quadratic degree of freedom, where $k_B = 1.38 \times 10^{-23}\ \text{J/K}$. A monatomic ideal gas atom has three translational degrees of freedom, giving average kinetic energy $\frac{3}{2}k_B T$.

When a macroscopic oscillator damps out, energy flows into these incoherent microscopic modes. The total energy is conserved; we lose track of it because we stop counting $\sim 10^{23}$ degrees of freedom.

---

## How It Works

### Rocket Propulsion

A rocket of mass $M$ at rest ejects a mass element $dm$ at exhaust velocity $V_e$ (relative to the rocket). Momentum conservation over this ejection:

$$0 = -V_e \, dm + M \, dv$$

$$dv = V_e \frac{dm}{M}$$

Integrating from initial mass $M_0$ to final mass $M_f$:

$$\Delta v = V_e \ln\left(\frac{M_0}{M_f}\right)$$

This is the **Tsiolkovsky rocket equation**. The logarithm is brutal: to double $\Delta v$, you must square the mass ratio. To reach Earth orbit ($\Delta v \approx 9.4\ \text{km/s}$) with a chemical engine ($V_e \approx 4.5\ \text{km/s}$), the mass ratio is $e^{9.4/4.5} \approx 8.1$ — over 87% of launch mass must be propellant. No air is involved anywhere in the derivation. The rocket pushes against its own ejected mass, which is why vacuum operation is not a special case; it is the baseline.

### The Interatomic Potential

The Lennard-Jones potential models the interaction between two neutral atoms:

$$U(r) = 4\varepsilon\left[\left(\frac{\sigma}{r}\right)^{12} - \left(\frac{\sigma}{r}\right)^{6}\right]$$

The $r^{-6}$ attractive term arises from induced dipole–dipole (van der Waals) interaction. The $r^{-12}$ repulsive term is a computationally convenient approximation to Pauli exclusion repulsion (the true repulsion is exponential, but $r^{-12}$ is cheap to compute as the square of $r^{-6}$).

```
U(r)
  |
  |   \
  |    \
--+-----\-----------  0
  |      \      /
  |       \    /
  |        \  /   ← minimum at r = 2^(1/6)σ ≈ 1.12σ
  |         \/
  |
  +----------------------------> r
```

At the minimum, $F = -dU/dr = 0$: equilibrium bond length. Because the repulsive wall is steeper than the attractive tail, the potential minimum is asymmetric. At higher energy, the atom spends more time on the shallow attractive side than the steep repulsive side, so the time-averaged position shifts outward — this is the mechanism of **thermal expansion**.

### Simple Harmonic Motion

A mass $m$ displaced by $x$ from equilibrium on a spring of constant $k$:

$$m\ddot{x} = -kx \implies \ddot{x} + \omega^2 x = 0, \quad \omega = \sqrt{\frac{k}{m}}$$

Solution: $x(t) = A\cos(\omega t + \phi)$. The period is $T = 2\pi/\omega$, independent of amplitude — this is what makes harmonic oscillators useful as clocks.

Energy oscillates between kinetic and potential at twice the oscillation frequency, but the total is constant:

$$E = \frac{1}{2}mv^2 + \frac{1}{2}kx^2 = \frac{1}{2}kA^2$$

```python
import numpy as np

k = 1.0
m = 1.0
omega = np.sqrt(k / m)
A = 1.0

t = np.linspace(0, 4 * np.pi / omega, 10000)
x = A * np.cos(omega * t)
v = -A * omega * np.sin(omega * t)

KE = 0.5 * m * v**2
PE = 0.5 * k * x**2
E_total = KE + PE
E_expected = 0.5 * k * A**2

print(f"Expected total energy:          {E_expected:.6f}")
print(f"Mean computed total energy:     {np.mean(E_total):.6f}")
print(f"Max deviation from E_expected:  {np.max(np.abs(E_total - E_expected)):.2e}")
# Deviation should be ~1e-15 (floating point noise), not zero error by construction.
# If you see larger values, your time step is too coarse.
```

### Angular Momentum

For a particle at position $\mathbf{r}$ with momentum $\mathbf{p}$:

$$\mathbf{L} = \mathbf{r} \times \mathbf{p}$$

In 2D: $L = xp_y - yp_x$. Only the momentum component *perpendicular* to the radial direction contributes. A particle moving radially toward or away from an axis has $L = 0$ about that axis regardless of its speed. Angular momentum is conserved when no net external torque acts — the same structure as linear momentum, with torque $\boldsymbol{\tau} = \mathbf{r} \times \mathbf{F} = d\mathbf{L}/dt$.

---

## Linux Connection

### CPU Thermal Throttling

The Linux kernel's `cpufreq` subsystem implements thermal management through `drivers/thermal/` and `drivers/cpufreq/`. When junction temperature approaches $T_J^{\text{max}}$, the thermal governor reduces clock frequency to cut power dissipation. Dynamic power scales as:

$$P = C V^2 f$$

where $C$ is switching capacitance, $V$ is supply voltage, and $f$ is clock frequency. Halving the frequency halves dynamic power, but the chip also runs cooler, allowing voltage reduction — since $V$ scales roughly with $f$ to maintain timing margins, power scales closer to $f^3$ in practice.

The thermal
