---
id: 20
title: "Atomic physics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every abstraction in computing bottoms out in physics. The transistor works because electrons in silicon are forbidden from occupying arbitrary energies — quantization is not a convenience of the model, it is what makes stable matter possible. Without it, an orbiting electron radiates, loses energy, and collapses into the nucleus in roughly $10^{-11}$ seconds. No stable atoms means no crystal lattices, no bandgap engineering, no semiconductors, no DRAM. The uncertainty principle is the mechanism that sets the minimum size of an atom — which sets the minimum size of a silicon unit cell — which ultimately bounds how small a transistor gate can be. This module builds that foundation.

---

## Core Concepts

### Why Classical Orbits Are Impossible

An electron in circular orbit is centripetally accelerating. Classical electrodynamics (Larmor's formula) says any accelerating charge radiates power:

$$P = \frac{e^2 a^2}{6\pi \epsilon_0 c^3}$$

For a hydrogen ground-state orbit, the centripetal acceleration is $a \approx 9 \times 10^{22}\ \text{m/s}^2$, giving $P \approx 4.6 \times 10^{-8}$ W. The total orbital energy is about $-13.6$ eV $\approx 2.2 \times 10^{-18}$ J. The collapse time is:

$$t_\text{collapse} \sim \frac{|E|}{P} \approx \frac{2.2 \times 10^{-18}}{4.6 \times 10^{-8}} \approx 5 \times 10^{-11}\ \text{s}$$

This is not a rounding error — classical mechanics gives a definite, short timescale for atomic destruction. The fact that hydrogen atoms survive indefinitely is a hard falsification of classical mechanics at atomic scales.

### The Uncertainty Principle as a Stabilizing Pressure

Heisenberg's uncertainty principle:

$$\Delta x \cdot \Delta p \gtrsim \frac{\hbar}{2}$$

is a statement about waves, not about measurement clumsiness. A wave packet localized to a region $\Delta x$ must be a superposition of many wavelengths spanning a range $\Delta \lambda$. Since $p = h/\lambda$, a spread in wavelength is a spread in momentum. Compressing the electron closer to the nucleus does not reduce its energy — it *increases* the momentum uncertainty, which increases the kinetic energy. This creates an outward pressure that opposes electrostatic attraction.

The equilibrium between these two tendencies is not arbitrary — it defines a specific length scale, the Bohr radius $a_0 \approx 0.529$ Å, and a specific ground-state energy, $E_1 = -13.6$ eV. Both are derived below from first principles with no free parameters.

### Energy Quantization: Why Discrete Levels Exist

The same wave nature that produces the uncertainty principle requires that bound-state wavefunctions satisfy boundary conditions — they must be normalizable (vanish at infinity) and single-valued. These constraints are not optional; a wavefunction that fails them is unphysical. Imposing them on the Schrödinger equation for a $1/r$ potential yields solutions only at discrete energies. For hydrogen:

$$E_n = -\frac{13.6\ \text{eV}}{n^2}, \quad n = 1, 2, 3, \ldots$$

The $n^{-2}$ dependence is not phenomenological — it falls out of the radial Schrödinger equation exactly. The ground state ($n=1$, $E_1 = -13.6$ eV) is the lowest energy the electron can have while satisfying the wave boundary conditions and the uncertainty principle simultaneously. There is no lower state to decay into.

The ionization energy of hydrogen is:

$$E_\infty - E_1 = 0 - (-13.6\ \text{eV}) = 13.6\ \text{eV}$$

This is the **Rydberg energy**, $E_R = m_e e^4 / 2(4\pi\epsilon_0)^2\hbar^2$. Every constant in that expression has a physical origin: $m_e$ sets the inertia, $e^4$ the electrostatic strength, $\hbar^2$ the confinement penalty. The fact that they combine to give exactly 13.6 eV is a consistency check on the entire framework.

### Electron Shells and the Pauli Exclusion Principle

Electrons are fermions: the total wavefunction of two identical electrons must be antisymmetric under exchange. The consequence is that no two electrons in the same atom can share all four quantum numbers:

| Number | Symbol | Physical Meaning | Allowed Values |
|--------|--------|-----------------|----------------|
| Principal | $n$ | Energy / shell radius | $1, 2, 3, \ldots$ |
| Angular momentum | $\ell$ | Orbital shape (s, p, d, f) | $0, 1, \ldots, n-1$ |
| Magnetic | $m_\ell$ | Orbital orientation | $-\ell, \ldots, +\ell$ |
| Spin | $m_s$ | Intrinsic angular momentum | $+\tfrac{1}{2}, -\tfrac{1}{2}$ |

The number of states in shell $n$ is:

$$\sum_{\ell=0}^{n-1}(2\ell+1) \times 2 = 2n^2$$

giving capacity 2, 8, 18, 32 for $n = 1, 2, 3, 4$. The Pauli principle forces each additional electron into the next available state, building the periodic table from the bottom up. Valence electrons — those in the outermost partially-filled shell — determine chemical bonding. Silicon has four valence electrons in $n=3$, which is why it forms a tetrahedral crystal and has a bandgap amenable to transistor operation.

---

## How It Works

### Deriving the Hydrogen Ground State from the Uncertainty Principle

Let the electron be at characteristic distance $a$ from the proton. The total energy has two terms.

**Potential energy** (Coulomb):

$$U(a) = -\frac{e^2}{4\pi\epsilon_0 a}$$

**Kinetic energy**: Confinement to radius $a$ forces $\Delta x \sim a$, so:

$$\Delta p \sim \frac{\hbar}{a} \implies T \sim \frac{(\Delta p)^2}{2m_e} = \frac{\hbar^2}{2m_e a^2}$$

**Total energy**:

$$E(a) = \frac{\hbar^2}{2m_e a^2} - \frac{e^2}{4\pi\epsilon_0 a}$$

The kinetic term scales as $a^{-2}$ and the potential as $a^{-1}$. At large $a$, the potential dominates and $E$ decreases as $a$ shrinks — the electron is attracted inward. At small $a$, the kinetic term dominates and $E$ increases — the confinement penalty pushes back. There is a minimum. Setting $dE/da = 0$:

$$-\frac{\hbar^2}{m_e a^3} + \frac{e^2}{4\pi\epsilon_0 a^2} = 0$$

$$\boxed{a_0 = \frac{4\pi\epsilon_0 \hbar^2}{m_e e^2} \approx 0.529\ \text{Å}}$$

This is the **Bohr radius**. Substituting back into $E(a_0)$:

$$E_1 = \frac{\hbar^2}{2m_e a_0^2} - \frac{e^2}{4\pi\epsilon_0 a_0} = -\frac{m_e e^4}{2(4\pi\epsilon_0)^2 \hbar^2} \approx -13.6\ \text{eV}$$

No fitting parameters. The ground state energy and atomic radius emerge from three constants ($m_e$, $e$, $\hbar$) and one principle (minimize energy subject to confinement). This is why all hydrogen atoms everywhere are the same size.

### Spectral Lines: Energy Conservation in Photon Emission

When an electron transitions from level $n_i$ to $n_f < n_i$, the energy difference must go somewhere — it is carried away by a photon. Energy conservation requires:

$$E_\text{photon} = E_{n_i} - E_{n_f} = 13.6\ \text{eV}\left(\frac{1}{n_f^2} - \frac{1}{n_i^2}\right)$$

The photon frequency and wavelength follow from $E = hf = hc/\lambda$:

$$\frac{1}{\lambda} = \frac{E_\text{photon}}{hc} = R_\infty\left(\frac{1}{n_f^2} - \frac{1}{n_i^2}\right)$$

where $R_\infty = m_e e^4 / 8\epsilon_0^2 h^3 c \approx 1.097 \times 10^7\ \text{m}^{-1}$ is the **Rydberg constant**. This formula, derived purely theoretically, matches hydrogen spectral measurements to six significant figures.

The Balmer series ($n_f = 2$, transitions landing in the visible) gives:

| Transition | $E_\text{photon}$ | $\lambda$ | Color |
|------------|-------------------|-----------|-------|
| $3 \to 2$ | 1.89 eV | 656 nm | Red |
| $4 \to 2$ | 2.55 eV | 486 nm | Cyan |
| $5 \to 2$ | 2.86 eV | 434 nm | Violet |

Each element has a unique nuclear
