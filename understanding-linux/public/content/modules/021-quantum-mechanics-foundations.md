---
id: 21
title: "Quantum mechanics foundations"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Classical electromagnetism predicts that an orbiting electron continuously radiates energy and spirals into the nucleus in roughly $10^{-11}$ seconds. Metals, treated classically, have no mechanism to resist compression to zero volume. Neither prediction is wrong by a small margin — classical physics gives the completely wrong qualitative answer. Quantum mechanics is not a correction to classical physics; it is a replacement that happens to reproduce classical results at large scales.

The concrete consequence for computing: silicon's band gap of $1.12\,\text{eV}$ is not a material property you look up — it is a calculable result of electron wavefunctions in a periodic crystal potential. The transistor threshold voltage, the tunnel oxide thickness in NAND flash, the Johnson noise floor in amplifier circuits — all are quantum mechanical in origin. Every `read()` syscall that returns data from an SSD depends on electrons having tunneled through $\sim 10\,\text{nm}$ of silicon dioxide.

---

## Core Concepts

### Wavefunctions: Probability Amplitudes, Not Ignorance

Classical mechanics assigns a particle a definite position $x(t)$ and momentum $p(t)$ at every instant. Quantum mechanics replaces both with a single complex-valued **wavefunction** $\psi(x, t)$. The squared magnitude is a probability density:

$$P(x, t) = |\psi(x, t)|^2$$

The wavefunction is not an expression of measurement uncertainty in the engineering sense. There is no hidden variable tracking the "real" position — Bell's theorem and subsequent experiments (Aspect 1982, Hensen 2015) rule out local hidden-variable theories. The probability distribution is the complete physical description.

The wave behavior follows directly from the linearity of the Schrödinger equation. Because $\psi$ is linear, any two solutions $\psi_1$ and $\psi_2$ can be superposed:

$$\psi = c_1\psi_1 + c_2\psi_2, \quad c_1, c_2 \in \mathbb{C}$$

The resulting probability density $|\psi|^2$ contains cross terms $2\,\text{Re}(c_1 c_2^* \psi_1 \psi_2^*)$ — interference. An electron diffracts through a double slit not because it splits in two, but because the wavefunction, which has spatial extent, propagates through both slits simultaneously and the two contributions interfere before any position measurement occurs.

### Quantization: What Confinement Actually Does

A free particle can have any energy. Confine it — impose boundary conditions — and you constrain which wavefunctions are physically valid. The mathematics is identical to standing waves: only wavelengths $\lambda$ satisfying $n(\lambda/2) = L$ fit in a box of length $L$, where $n$ is a positive integer.

Since momentum is related to wavelength by the de Broglie relation $p = h/\lambda = \hbar k$ where $k = 2\pi/\lambda$, and kinetic energy is $p^2/2m$, the allowed energies in a one-dimensional box are:

$$E_n = \frac{n^2 \pi^2 \hbar^2}{2mL^2}, \quad n = 1, 2, 3, \ldots$$

Three things to notice. First, $n = 0$ is excluded — $\psi = 0$ everywhere is not a physical state. The ground state $n=1$ has nonzero **zero-point energy** $E_1 = \pi^2\hbar^2 / (2mL^2)$; the particle cannot be at rest inside a finite region. Second, the spacing between levels scales as $1/L^2$: smaller boxes mean larger energy gaps, which means more energy required to disturb the system. Atomic electrons are hard to remove not arbitrarily but for this calculable reason. Third, the levels are non-degenerate in 1D; in 3D, multiple quantum number combinations can share the same energy, producing the shell structure of atoms.

The Heisenberg uncertainty principle is not a statement about measurement disturbance — it is a theorem about Fourier transforms. A wavefunction well-localized in position space requires a broad superposition of momentum-space components, and vice versa:

$$\Delta x \cdot \Delta p \geq \frac{\hbar}{2}$$

where $\Delta x$ and $\Delta p$ are standard deviations of the respective probability distributions. Compressing an electron into a region of width $\Delta x$ forces $\Delta p \geq \hbar / (2\Delta x)$, which raises the expected kinetic energy as $\langle T \rangle \sim (\Delta p)^2 / 2m \sim \hbar^2 / (8m(\Delta x)^2)$. This is precisely the pressure that prevents electron clouds from collapsing, and it scales correctly with atomic radii.

### Tunneling: Exponential Decay, Not Magic

Classically, a particle with energy $E < V$ cannot enter a region where the potential is $V$. Quantum mechanically, the Schrödinger equation inside the barrier becomes:

$$-\frac{\hbar^2}{2m}\frac{d^2\psi}{dx^2} = (E - V)\psi$$

Since $E - V < 0$, the right-hand side has the wrong sign for oscillatory solutions. The solutions are real exponentials, not complex ones:

$$\psi(x) \propto e^{\pm\kappa x}, \quad \kappa = \sqrt{\frac{2m(V-E)}{\hbar^2}}$$

The physically acceptable solution inside a finite barrier decays as $e^{-\kappa x}$. If the barrier has width $d$, the wavefunction at the far side is suppressed by $e^{-\kappa d}$ in amplitude, giving a transmission probability:

$$T \approx e^{-2\kappa d}$$

The exponential sensitivity to both $d$ and $\sqrt{V - E}$ is the key engineering parameter. For a silicon dioxide tunnel oxide with $V - E \approx 3.1\,\text{eV}$ and $d = 10\,\text{nm}$:

$$\kappa = \sqrt{\frac{2 \times (9.109 \times 10^{-31}\,\text{kg}) \times (3.1 \times 1.602 \times 10^{-19}\,\text{J})}{(1.055 \times 10^{-34}\,\text{J·s})^2}} \approx 9.0 \times 10^9\,\text{m}^{-1}$$

$$T \approx e^{-2 \times 9.0 \times 10^9 \times 10^{-8}} = e^{-180} \approx 10^{-78}$$

That is essentially zero — data retention under zero field. Apply a voltage that reduces the effective barrier height by $2\,\text{eV}$ to $V - E \approx 1.1\,\text{eV}$ during a write operation:

$$\kappa' = \sqrt{\frac{2 \times (9.109 \times 10^{-31}) \times (1.1 \times 1.602 \times 10^{-19})}{(1.055 \times 10^{-34})^2}} \approx 5.4 \times 10^9\,\text{m}^{-1}$$

$$T' \approx e^{-2 \times 5.4 \times 10^9 \times 10^{-8}} = e^{-108} \approx 10^{-47}$$

Still tiny in absolute terms, but $10^{31}$ times larger than before. With $\sim 10^{15}$ electrons available and nanosecond attempt frequencies, write operations complete in microseconds. The same exponential that ensures retention is what enables writing — it is the ratio that matters, not the absolute value.

### Pauli Exclusion: Why the Periodic Table Has the Shape It Has

Electrons are **fermions** with spin $s = 1/2$. The many-electron wavefunction must be antisymmetric under exchange of any two identical electrons:

$$\psi(\ldots, x_i, \ldots, x_j, \ldots) = -\psi(\ldots, x_j, \ldots, x_i, \ldots)$$

This is not a separate postulate layered on top of quantum mechanics — it follows from the spin-statistics theorem in quantum field theory, which connects particle spin to the symmetry character of the multi-particle state. The consequence is immediate: if electrons $i$ and $j$ are in identical states, swapping them changes nothing, so $\psi = -\psi$, forcing $\psi = 0$. The state has zero probability of existing.

The result: each quantum state specified by the tuple $(n, \ell, m_\ell, m_s)$ — principal, azimuthal, magnetic, and spin quantum numbers — can be occupied by at most one electron. The $2p$ subshell ($n=2$, $\ell=1$) has $m_\ell \in \{-1, 0, 1\}$ and $m_s \in \{-1/2, +1/2\}$, giving 6 states. Fill them and you have neon's configuration. The next electron must go into $n=3$, and so on.

Without antisymmetry, all electrons would collapse into the $1s$ ground state. Atoms larger than hydrogen would not exist in any chemically meaningful sense.

### Energy Bands: What Happens When $N \to 10^{23}$

Bring two hydrogen atoms together. The $1s$ level of each atom is an energy eigenstate, but once the electron wavefunctions overlap, the system eigenstates are the symmetric and antisymmetric combinations: $(\psi_1 \pm \psi_2)/\sqrt{2}$. These have slightly different energies — one level splits into two.

For $N$ atoms in a periodic lattice, each atomic level splits into $N$ closely-spaced levels. With $N \sim 10^{
