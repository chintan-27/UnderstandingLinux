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

Classical electrodynamics predicts that an accelerating charge radiates energy. An electron in a circular orbit is always accelerating. The classical collapse timescale works out to roughly $16\ \text{ps}$ — every atom on Earth should have imploded before you finished reading this sentence. The fact that atoms are stable is not a minor detail quantum mechanics patches; it is the central explanandum that forces the entire framework into existence.

From that foundation: quantized energy levels give atoms their identity, the Pauli exclusion principle forces electrons into distinct orbitals and builds the periodic table, and quantum tunneling lets electrons cross oxide barriers they cannot classically surmount. CMOS transistors switch because of band structure engineered by controlled doping. Flash memory stores bits by trapping electrons behind a tunnel oxide roughly $10\ \text{nm}$ thick — thin enough that tunneling is probable under an applied field, thick enough that the trapped charge persists for years without one. None of this is a quantum correction to a classical picture. It is the operating mechanism.

---

## Core Concepts

### Wavefunctions: Probability Amplitude, Not Ignorance

A particle in quantum mechanics is described by a **wavefunction** $\psi(\mathbf{r}, t)$, a complex-valued field. The physically meaningful quantity is the probability density:

$$P(\mathbf{r}, t) = |\psi(\mathbf{r}, t)|^2$$

The wavefunction is not a description of your ignorance about a definite trajectory. There is no trajectory. The particle has no position between measurements — this is the content of Bell inequality violations, confirmed experimentally to high precision. The wavefunction evolves deterministically under the Schrödinger equation; the randomness enters only at measurement.

The wavefunction must be normalized: the particle exists somewhere, so

$$\int_{-\infty}^{\infty} |\psi(x, t)|^2\, dx = 1$$

The complex phase of $\psi$ carries physical content. Two wavefunctions can interfere — add coherently or cancel — which is why electrons passing through a double slit produce an interference pattern even when sent one at a time.

### Quantized States: Boundary Conditions Force Discreteness

Quantization is not postulated; it emerges from boundary conditions. A wavefunction confined to a finite region must satisfy those boundaries, and only certain wavelengths fit. For a particle in a 1D infinite square well of width $L$, the boundary conditions $\psi(0) = \psi(L) = 0$ require:

$$\psi_n(x) = \sqrt{\frac{2}{L}}\sin\!\left(\frac{n\pi x}{L}\right), \quad n = 1, 2, 3, \ldots$$

The de Broglie relation $p = h/\lambda$ then fixes the momentum, and kinetic energy $E = p^2/2m$ gives:

$$E_n = \frac{n^2 \pi^2 \hbar^2}{2mL^2}$$

Only integer $n$ — no continuum, no $n = 0$ (that would make $\psi$ identically zero, which is not normalizable). The $n=1$ state has nonzero energy even at absolute zero: the **zero-point energy** $E_1 = \pi^2\hbar^2/2mL^2$. This is a direct consequence of the uncertainty principle — confining the particle to $\Delta x \sim L$ forces $\Delta p \geq \hbar/2L$, which costs kinetic energy. An electron simply cannot be at rest inside a box.

### The Uncertainty Principle: A Property of Waves

Position and momentum are conjugate variables related by a Fourier transform. A wavefunction sharply localized in position ($\Delta x$ small) necessarily spans many spatial frequencies, meaning many momenta ($\Delta p$ large). This is a theorem of Fourier analysis, not a claim about measurement disturbance. Formally:

$$\Delta x \cdot \Delta p \geq \frac{\hbar}{2}$$

where $\hbar = h/2\pi \approx 1.055 \times 10^{-34}\ \text{J·s}$.

Apply this to the hydrogen atom. The electron is bound within a radius $a$, so $\Delta x \sim a$ and $\Delta p \sim \hbar/a$. The total energy is:

$$E(a) = \frac{\hbar^2}{2ma^2} - \frac{e^2}{4\pi\epsilon_0 a}$$

Minimizing $dE/da = 0$:

$$a_0 = \frac{4\pi\epsilon_0\hbar^2}{me^2} \approx 0.529\ \text{Å}$$

Substituting back:

$$E_1 = -\frac{me^4}{2(4\pi\epsilon_0)^2\hbar^2} \approx -13.6\ \text{eV}$$

This matches the experimentally measured ionization energy of hydrogen. The atom is stable because compressing it further raises the kinetic energy faster than it lowers the potential energy. The ground state is the minimum of that tradeoff.

### Tunneling: Exponential Sensitivity to Barrier Width

Inside a classically forbidden region (where $E < V_0$), the Schrödinger equation gives real exponential solutions rather than oscillating ones. For a rectangular barrier of height $V_0$ and width $d$:

$$\psi(x) \propto e^{-\kappa x}, \quad \kappa = \sqrt{\frac{2m(V_0 - E)}{\hbar^2}}$$

If the barrier is thin enough, this decaying wavefunction still has nonzero amplitude at the far side. The transmission probability is:

$$T \approx 16\frac{E}{V_0}\!\left(1 - \frac{E}{V_0}\right) e^{-2\kappa d}$$

For the leading behavior, $T \sim e^{-2\kappa d}$.

The exponential dependence on $d$ and $\sqrt{m}$ is what makes tunneling device-relevant for electrons but negligible for anything heavier. For a $1\ \text{eV}$ electron hitting a $2\ \text{eV}$ barrier:

$$\kappa = \sqrt{\frac{2 \times 9.109\times10^{-31} \times 1 \times 1.602\times10^{-19}}{(1.055\times10^{-34})^2}} \approx 5.12 \times 10^9\ \text{m}^{-1}$$

At $d = 1\ \text{nm}$: $T \sim e^{-2 \times 5.12 \times 10^9 \times 10^{-9}} = e^{-10.24} \approx 3.6 \times 10^{-5}$.  
At $d = 3\ \text{nm}$: $T \sim e^{-30.7} \approx 2 \times 10^{-14}$.

Three nanometers of additional oxide cuts transmission by nine orders of magnitude. This is why gate oxide thickness is one of the most carefully controlled parameters in transistor fabrication — and why below ~1 nm it stops working as an insulator entirely.

### Pauli Exclusion Principle: Antisymmetry, Not a Rule

The exclusion principle is not an additional axiom. It follows from a deeper requirement: electrons are indistinguishable, and the laws of physics must be symmetric under exchange. For fermions (half-integer spin), that symmetry is **antisymmetry** — swapping two electrons flips the sign of the total wavefunction:

$$\psi(\mathbf{r}_1, \mathbf{r}_2) = -\psi(\mathbf{r}_2, \mathbf{r}_1)$$

If two electrons occupy identical states, then $\psi(\mathbf{r}_1, \mathbf{r}_2) = \psi(\mathbf{r}_2, \mathbf{r}_1)$. Combined with the antisymmetry requirement: $\psi = -\psi$, so $\psi = 0$. The state does not exist.

A quantum state is labeled $(n, l, m_l, m_s)$. Because $m_s \in \{+\frac{1}{2}, -\frac{1}{2}\}$, each spatial orbital $(n, l, m_l)$ holds exactly two electrons. This fills shells in order, producing the periodic table — not as a fact to memorize but as a consequence of antisymmetry. The chemical differences between carbon (6 electrons) and nitrogen (7 electrons) trace directly to which orbital the 7th electron must occupy given the antisymmetry constraint on the first six.

### Energy Bands in Solids: Splitting at Scale

Two quantum wells coupled together split each energy level into two — a bonding and an antibonding state separated by an energy gap proportional to the coupling strength. With $N \sim 10^{23}$ atoms in a crystal, each level splits into $N$ levels spanning an energy range set by the interatomic coupling. The spacing between adjacent levels within a band is of order $\Delta E \sim \text{bandwidth} / N \approx 10^{-23}\ \text{eV}$ — indistinguishable from a continuum. Between bands, the gaps remain.

Conductivity is determined by band filling:

- **Metal:** Highest occupied band partially filled. The Fermi level sits inside a band; electrons can absorb arbitrarily small energies and scatter into nearby empty states. Current flows.
- **Insulator:** Valence band completely full, conduction band empty, gap $E_g > 5\ \text{eV}$. No available states near the Fermi level; electrons cannot respond to small electric fields.
- **Semiconductor:** Same topology as insulator, $E_g \sim 1\ \text{eV}$ (silicon: $1.12\ \text{eV}$, GaAs: $1.42\ \text{eV}$). Thermal energy $k_BT \approx 26\ \text{meV}$ at room temperature is insufficient to bridge
