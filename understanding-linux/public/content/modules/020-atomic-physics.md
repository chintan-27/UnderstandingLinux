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

Transistors exist because silicon has a bandgap of 1.12 eV — not 0.5 eV, not 5 eV, but exactly that value, set by quantum mechanics. That bandgap determines the threshold voltage your CPU's gate oxide must maintain to distinguish logic 0 from logic 1. The 808 nm laser diode in a fiber-optic transceiver emits at precisely that wavelength because an electron in a specific semiconductor quantum well drops between two discrete energy levels separated by exactly 1.53 eV. None of this is tunable by engineering choice — it is fixed by atomic structure. If you want to understand why silicon works, why doping changes conductivity, or why photonic interconnects operate at specific wavelengths, you need the quantized atom.

---

## Core Concepts

### Why the Classical Atom Fails — Specifically

A classical orbiting electron is a charged particle undergoing centripetal acceleration. By Maxwell's equations, any accelerating charge radiates energy. The electron should continuously lose energy, spiraling inward. The radiated power is given by the Larmor formula:

$$P = \frac{e^2 a^2}{6\pi\epsilon_0 c^3}$$

where $a$ is the centripetal acceleration. Plugging in the numbers for a ground-state Bohr orbit ($r \approx 0.5$ Å), the electron would collapse into the nucleus in about $10^{-11}$ s. Hydrogen has existed for 13 billion years. The classical prediction is wrong by a factor of $10^{28}$. Something prevents radiation from occurring at all in the ground state — that something is quantization. An electron in a stationary eigenstate has no oscillating charge distribution, so it produces no electromagnetic radiation.

### Standing Waves as the Origin of Shells

An electron confined near a nucleus is not a billiard ball in an orbit. It is a wave. For a circular orbit of radius $r$ to be a stable stationary state, the wave must close on itself without destructive interference — the circumference must contain an integer number of de Broglie wavelengths:

$$2\pi r = n\lambda = \frac{nh}{p}, \quad n = 1, 2, 3, \ldots$$

This is exactly the condition for standing waves on a closed loop. Any radius that doesn't satisfy this condition produces a wave that cancels itself out — it simply cannot exist as a stable state. The integer $n$ is the **principal quantum number**, and it is discrete because integers are discrete. Shells are not zones arbitrarily labeled by chemists; they are nodes of a standing wave.

The de Broglie wavelength:

$$\lambda = \frac{h}{p}$$

where $h = 6.626 \times 10^{-34}$ J·s. For an electron with kinetic energy $KE$, $p = \sqrt{2m_e \cdot KE}$, so higher-energy electrons have shorter wavelengths and fit into smaller orbits — the causality runs from energy to orbit size, not the reverse.

### The Uncertainty Principle as the Physical Floor

Why doesn't the electron minimize its energy by sitting directly on the proton? Suppose you try to confine it to a region of size $\Delta x = a$. Then:

$$\Delta p \gtrsim \frac{\hbar}{2a}$$

This is not a measurement limitation. It is a statement about what the electron's momentum *is*: if you know where it is, its momentum is genuinely spread over a range, meaning its kinetic energy has a minimum value proportional to $1/a^2$. The smaller the box, the higher the kinetic energy floor. There is an equilibrium: electrostatic attraction pulls inward (energy $\propto -1/a$), kinetic confinement energy pushes outward (energy $\propto +1/a^2$). The atom settles at the radius where these balance.

$$\Delta x \cdot \Delta p \gtrsim \frac{\hbar}{2}, \quad \hbar = \frac{h}{2\pi} \approx 1.055 \times 10^{-34} \text{ J·s}$$

### Energy Quantization: The Rydberg Formula

The allowed energies of hydrogen are:

$$E_n = -\frac{m_e e^4}{8\epsilon_0^2 h^2} \cdot \frac{1}{n^2} = -\frac{13.6 \text{ eV}}{n^2}$$

The negative sign is binding energy — this much energy must be supplied to free the electron. The ground state ($n=1$) sits at $-13.6$ eV; the ionization threshold is $0$ eV. The energy difference between two levels is:

$$\Delta E = 13.6 \text{ eV} \left(\frac{1}{n_1^2} - \frac{1}{n_2^2}\right)$$

A photon emitted when the electron drops from $n_2$ to $n_1$ carries exactly this energy. The spectrum of hydrogen is discrete because $n$ is an integer, and integers are not continuous. The photon wavelength is:

$$\lambda = \frac{hc}{\Delta E}$$

For the Balmer series ($n_1 = 2$), transitions land in the visible range — this is why a hydrogen discharge tube glows red (656 nm, $n=3\to2$) rather than white.

### Why Atoms Resist Compression

When two atoms are pushed together, their electron clouds overlap and must now occupy a smaller combined volume. By the uncertainty principle, confining those electrons more tightly raises their minimum kinetic energy. This increase is steeper than the electrostatic attraction — kinetic energy scales as $1/a^2$ while potential energy scales as $1/a$ — so the energy minimum disappears and you get a repulsive wall. This is why condensed matter is rigid. It is not a classical spring; it is a quantum kinetic energy effect.

---

## How It Works

### Deriving the Bohr Radius from First Principles

Set the confinement scale to $a$. By the uncertainty principle:

$$\langle p^2 \rangle \sim \frac{\hbar^2}{a^2} \implies KE \sim \frac{\hbar^2}{2m_e a^2}$$

Electrostatic potential energy at separation $a$:

$$PE \sim -\frac{e^2}{4\pi\epsilon_0 a}$$

Total energy as a function of $a$:

$$E(a) = \frac{\hbar^2}{2m_e a^2} - \frac{e^2}{4\pi\epsilon_0 a}$$

Minimize:

$$\frac{dE}{da} = -\frac{\hbar^2}{m_e a^3} + \frac{e^2}{4\pi\epsilon_0 a^2} = 0$$

$$\boxed{a_0 = \frac{4\pi\epsilon_0 \hbar^2}{m_e e^2} \approx 0.529 \text{ Å}}$$

Substituting $a_0$ back into $E(a)$:

$$E(a_0) = -\frac{m_e e^4}{8\epsilon_0^2 h^2} \approx -13.6 \text{ eV}$$

Both numbers come out correctly. The argument is semiclassical but the physics is right: the atom's size and binding energy are determined entirely by $\hbar$, $m_e$, and $e$.

### Quantum Numbers and Shell Capacity

Each electron in an atom is completely characterized by four quantum numbers:

| Number | Symbol | Range | Meaning |
|---|---|---|---|
| Principal | $n$ | $1, 2, 3, \ldots$ | Shell; sets energy scale |
| Angular momentum | $\ell$ | $0$ to $n-1$ | Orbital shape (s, p, d, f) |
| Magnetic | $m_\ell$ | $-\ell$ to $+\ell$ | Orbital orientation; $2\ell+1$ values |
| Spin | $m_s$ | $\pm\frac{1}{2}$ | Intrinsic angular momentum |

The Pauli exclusion principle: no two electrons in the same atom can share all four quantum numbers. Counting all combinations for a given $n$:

$$N_n = \sum_{\ell=0}^{n-1} 2(2\ell+1) = 2n^2$$

| $n$ | Max electrons |
|:---:|:---:|
| 1 | 2 |
| 2 | 8 |
| 3 | 18 |
| 4 | 32 |

Silicon has 14 electrons. Its ground-state configuration is $1s^2\, 2s^2\, 2p^6\, 3s^2\, 3p^2$. The four electrons in the $n=3$ shell are the valence electrons that form covalent bonds in the crystal lattice. Doping introduces atoms with 3 or 5 valence electrons, creating holes or free electrons — but that mismatch only makes sense against the backdrop of the filled-shell structure.

### Photon Emission: Computing Wavelengths

```python
# Hydrogen energy level transitions
# E_n = -13.6 eV / n^2
# Photon energy = delta_E, wavelength = hc / delta_E

h   = 6.626e-34   # Planck's constant, J·s
c   = 2.998e8     # speed of light, m/s
eV  = 1.602e-19   # joules per eV

def hydrogen_transition(n_upper: int, n_lower: int) -> dict:
    """
    Compute photon properties for a hydrogen emission transition.
    n_upper > n_lower required for emission.
    Returns energy in eV and wavelength in nm.
    """
    if n_upper <= n_lower:
        raise ValueError("n_upper must exceed n_lower for emission")
    delta_E_eV = 13.6 * (1/n_lower**2 - 1/n_upper**2)
