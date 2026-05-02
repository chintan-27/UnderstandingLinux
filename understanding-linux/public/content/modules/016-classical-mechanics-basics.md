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

Every physics engine, molecular dynamics simulator, robotics controller, and finite-element solver running on Linux is an numerical integrator of Newton's second law. The reason CPU clock frequencies are physically bounded is that transistor switching involves atoms crossing potential energy barriers — a classical mechanics problem. The reason thermal noise floors exist in every ADC and analog circuit is that temperature *is* disordered kinetic energy at the atomic scale. The reason the Verlet integrator is used instead of Euler in production simulators is that it conserves a shadow Hamiltonian, a consequence of symplectic structure in classical phase space. This module gives you the mechanical substrate that underlies all of that.

---

## Core Concepts

### Force and Newton's Second Law

Force is the time rate of change of momentum:

$$\vec{F} = \frac{d\vec{p}}{dt}$$

When mass is constant this becomes $\vec{F} = m\vec{a}$. The causal direction matters: forces do not produce velocity, they produce *changes in momentum*. A constant force on a stationary object produces linearly growing momentum, not a jump to some terminal velocity.

Newton's Third Law states that forces between any two objects are equal in magnitude and opposite in direction. This is not an empirical observation about specific materials — it is a structural constraint whose consequence is that internal forces in any closed system sum to zero, which is exactly what makes conservation of momentum provable rather than postulated.

### Conservation of Momentum

For two particles interacting only with each other, Newton's Third Law gives:

$$\frac{d\vec{p}_1}{dt} = -\frac{d\vec{p}_2}{dt}$$

Therefore:

$$\frac{d(\vec{p}_1 + \vec{p}_2)}{dt} = 0$$

The total momentum is constant. The deeper reason this works is Noether's theorem: conservation of momentum is the direct consequence of the laws of physics being invariant under spatial translation. The rocket works in vacuum not because it pushes against anything, but because ejecting mass backward with momentum $-p$ forces the rocket's momentum forward by exactly $+p$ to keep the total constant.

### Kinetic and Potential Energy

Kinetic energy is:

$$T = \frac{1}{2}mv^2$$

For a conservative force — one whose work integral depends only on endpoints, not the path — potential energy is defined as:

$$U(\vec{r}) = -\int_{\vec{r}_0}^{\vec{r}} \vec{F} \cdot d\vec{s}$$

The reference point $\vec{r}_0$ is arbitrary because only $\Delta U$ ever appears in equations. The force is recovered from the potential by:

$$\vec{F} = -\nabla U$$

This sign is load-bearing: the force points *down* the potential gradient, toward lower energy. A ball on a hillside rolls in the direction of steepest descent of $U$, not steepest ascent.

When only conservative forces act:

$$T + U = E = \text{constant}$$

Energy does not disappear; it converts between forms. The total $E$ is set by initial conditions and never changes.

### Potential Energy Wells and Equilibrium

At a minimum of $U$, the gradient vanishes:

$$F = -\frac{dU}{dr} = 0$$

This is an equilibrium point. Displacing the particle slightly produces a restoring force because $dU/dr \neq 0$ away from the minimum — the particle is pushed back. The sign of the second derivative determines stability: if $U''(r_0) > 0$ it is a stable minimum; if $U''(r_0) < 0$ it is an unstable maximum.

The inter-atomic potential between two neutral atoms has exactly this structure: weakly attractive at large separations (van der Waals, $U \propto -r^{-6}$) and strongly repulsive at short range (electron cloud overlap, $U \propto +r^{-12}$). The minimum at $r_0$ is where the atom pair settles. The curvature at that minimum determines how stiff the bond is.

### Vibrations and Simple Harmonic Motion

Taylor-expand $U(r)$ around the equilibrium $r_0$:

$$U(r) \approx U(r_0) + \underbrace{U'(r_0)}_{=0}(r - r_0) + \frac{1}{2}U''(r_0)(r - r_0)^2$$

Define $x = r - r_0$ and $k = U''(r_0)$. The restoring force is:

$$F = -kx$$

The equation of motion $m\ddot{x} = -kx$ has the general solution:

$$x(t) = A\cos(\omega_0 t + \phi), \qquad \omega_0 = \sqrt{\frac{k}{m}}$$

The natural frequency $\omega_0$ encodes the *entire* local shape of the potential well. A stiffer well (larger $k$, larger $U''$) raises $\omega_0$; a heavier mass lowers it. This single formula governs spring-mass systems, diatomic molecular vibrations, LC oscillator resonance, and acoustic phonon modes in a crystal lattice — the physics is identical, only the values of $k$ and $m$ differ.

The period of one oscillation is:

$$T_0 = \frac{2\pi}{\omega_0} = 2\pi\sqrt{\frac{m}{k}}$$

### Thermal Motion as Disordered Kinetic Energy

When macroscopic mechanical energy dissipates — a damped oscillator coming to rest — the energy does not vanish. It becomes kinetic energy of the system's constituent atoms, distributed randomly across all available degrees of freedom. Temperature is operationally defined as the average kinetic energy per degree of freedom:

$$\langle \frac{1}{2}mv^2 \rangle = \frac{1}{2}k_B T$$

per translational degree of freedom, where $k_B = 1.38 \times 10^{-23}\ \text{J/K}$ is Boltzmann's constant. At room temperature ($T \approx 300\ \text{K}$), this is roughly $2 \times 10^{-21}\ \text{J}$ per degree of freedom — small, but not zero. That floor of disordered kinetic energy is what sets the Johnson-Nyquist noise voltage in every resistor attached to your machine:

$$V_{\text{rms}} = \sqrt{4 k_B T R \Delta f}$$

where $R$ is resistance and $\Delta f$ is measurement bandwidth. There is no engineering fix for this; it is a direct consequence of temperature being nonzero.

### Relativistic Momentum

At velocities $v \to c$, Newtonian momentum $p = m_0 v$ is not conserved in collisions. The corrected expression is:

$$\vec{p} = \gamma m_0 \vec{v}, \qquad \gamma = \frac{1}{\sqrt{1 - v^2/c^2}}$$

Conservation of momentum still holds, with this definition. At $v = 0.01c$ (one percent of light speed), $\gamma \approx 1.00005$ — a 0.005% correction. At $v = 0.9c$, $\gamma \approx 2.29$, which is no longer negligible. For everything in this module except the explicit relativistic section, $v \ll c$ and $\gamma \approx 1$.

---

## How It Works

### The Rocket Equation

Consider a rocket of current mass $M$ moving at velocity $v$. It ejects a mass element $dm$ at exhaust velocity $V_e$ relative to the rocket. Conservation of momentum for the system (rocket + exhaust) gives:

$$M\, dv = V_e\, dm_{\text{ejected}} = -V_e\, dM$$

because ejecting mass $dm_{\text{ejected}}$ reduces the rocket mass by $dM = -dm_{\text{ejected}}$. Separating variables:

$$dv = -V_e \frac{dM}{M}$$

Integrating from initial mass $M_0$ to final mass $M_f$:

$$\Delta v = V_e \ln\frac{M_0}{M_f}$$

This is the Tsiolkovsky rocket equation. The logarithm is the reason orbital mechanics is dominated by propellant mass: to achieve $\Delta v = 2V_e$, you need $M_0/M_f = e^2 \approx 7.4$, meaning more than six-sevenths of your initial mass must be propellant. There is no external surface involved — only internal momentum redistribution.

### The Lennard-Jones Potential Well

The standard model for inter-atomic forces between neutral atoms is:

$$U(r) = 4\epsilon\left[\left(\frac{\sigma}{r}\right)^{12} - \left(\frac{\sigma}{r}\right)^6\right]$$

The $r^{-12}$ term models Pauli repulsion (electron cloud overlap); the $r^{-6}$ term is the London dispersion attraction. The minimum is located at:

$$r_0 = 2^{1/6}\sigma \approx 1.122\sigma$$

To find the effective spring constant, compute $U''(r_0)$:

$$k = U''(r_0) = \frac{72 \cdot 2^{1/3}\, \epsilon}{\sigma^2}$$

This $k$ goes directly into $\omega_0 = \sqrt{k/m}$ for the vibrational frequency of the bond. A deeper well (larger $\epsilon$) or a narrower one (smaller $\sigma$) both increase stiffness.

```python
import numpy as np
import matplotlib.pyplot as plt

def lj_potential(r, epsilon=1.0, sigma=1.0):
    sr6 = (sigma / r)**6
    return 4 * epsilon * (sr6**2 - sr6)

def lj_force(r, epsilon=1.0, sigma=1.0):
    # F = -dU/dr, computed analytically
    sr6 = (sigma / r)**6
