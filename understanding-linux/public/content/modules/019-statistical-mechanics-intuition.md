---
id: 19
title: "Statistical mechanics intuition"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every physical system you interact with — the RAM in your computer, the disk beneath your filesystem, the thermal throttling logic in your CPU — behaves the way it does because of statistics applied to enormous numbers of particles. Without statistical mechanics, you cannot explain why a resistor generates noise, why a CPU heats up and slows down, why flash memory wears out, or why the Boltzmann distribution governs which energy states electrons occupy in a semiconductor. These are not engineering approximations — they are the mechanism. The randomness is the physics.

---

## Core Concepts

### Microstates and Macrostates

A **macrostate** is what you can measure: temperature, pressure, average current. A **microstate** is one specific configuration of all the constituent particles — positions and momenta of every atom at one instant. The key insight: an enormous number of microstates map to the same macrostate. Temperature is not a property of any single particle; it is a statistical summary of a distribution of particle energies across $\sim 10^{23}$ of them. This is why "temperature of a single electron" is meaningless.

Entropy $S$ quantifies how many microstates correspond to a given macrostate:

$$S = k_B \ln \Omega$$

where $\Omega$ is the number of accessible microstates. A system evolves toward higher entropy not because nature "prefers" disorder, but because there are vastly more high-entropy microstates than low-entropy ones. The second law is a statement about counting, not about physics having a direction.

### The Boltzmann Factor

The probability that a system in contact with a thermal reservoir at temperature $T$ occupies a state with energy $E$ is:

$$P(E) \propto e^{-E / k_B T}$$

where $k_B = 1.38 \times 10^{-23}\ \text{J/K}$. This follows directly from counting: when a subsystem takes energy $E$ from a reservoir, the reservoir loses entropy $E/T$, reducing its accessible microstates by $e^{-E/k_BT}$. The exponential suppression is not a postulate — it is the consequence of the reservoir having far fewer ways to arrange itself when it is missing energy $E$.

The product $k_B T$ sets the energy scale of thermal fluctuations. At room temperature ($T = 300\ \text{K}$):

$$k_B T \approx 4.1 \times 10^{-21}\ \text{J} \approx 25.7\ \text{meV}$$

Any process with an energy barrier $\Delta E \gg k_B T$ is exponentially suppressed. Any barrier $\Delta E \lesssim k_B T$ is routinely overcome by thermal fluctuations. The $26\ \text{meV}$ figure is the single number that tells you whether a physical process will spontaneously occur at room temperature.

### The Equipartition Theorem

In thermal equilibrium, every quadratic degree of freedom in the Hamiltonian contributes exactly $\frac{1}{2} k_B T$ to the mean energy. A translational mode $\frac{1}{2}mv_x^2$ contributes $\frac{1}{2}k_BT$; so does a spring mode $\frac{1}{2}kx^2$. A monatomic ideal gas has 3 translational DOFs:

$$\langle E \rangle = \frac{3}{2} k_B T$$

This is why temperature *is* mean kinetic energy per DOF (scaled by $k_B$). It also explains the heat capacity of solids: each atom in a crystal has 3 kinetic and 3 potential DOFs, giving $\langle E \rangle = 3 k_B T$ per atom and a molar heat capacity of $3R$ (the Dulong-Petit law). Equipartition breaks down when $k_B T$ drops below the spacing between quantum energy levels — which is why diamond has a low heat capacity at room temperature and why the quantum corrections matter.

### The Maxwell-Boltzmann Speed Distribution

For an ideal gas at temperature $T$, the fraction of particles with speeds in $[v, v+dv]$ is:

$$f(v) = 4\pi n \left(\frac{m}{2\pi k_B T}\right)^{3/2} v^2 \, e^{-mv^2 / 2k_B T}$$

The $v^2$ prefactor counts how many momentum-space states exist at speed $v$ (the surface area of a sphere of radius $mv$ in momentum space grows as $v^2$). The exponential kills high energies. The peak — the **most probable speed** — is:

$$v_p = \sqrt{\frac{2 k_B T}{m}}$$

The mean speed and RMS speed are slightly higher:

$$\langle v \rangle = \sqrt{\frac{8 k_B T}{\pi m}}, \qquad v_\text{rms} = \sqrt{\frac{3 k_B T}{m}}$$

The distribution has a long high-energy tail. Chemical reaction rates and evaporation rates are dominated by particles in that tail — particles with $E \gg k_B T$ that have enough energy to cross a barrier. This is why reaction rates are so sensitive to temperature: a small increase in $T$ significantly populates the tail.

### Fermi-Dirac and Bose-Einstein Statistics

Classical Boltzmann statistics treat particles as distinguishable. Quantum mechanics forbids this for identical particles. For electrons (spin-$\frac{1}{2}$ fermions obeying the Pauli exclusion principle), the occupation probability of a state with energy $\varepsilon$ is:

$$f(\varepsilon) = \frac{1}{e^{(\varepsilon - \mu)/k_B T} + 1}$$

At $T = 0$, this is a perfect step function: every state below the **Fermi energy** $E_F$ is occupied, every state above is empty. At finite $T$, thermal fluctuations smear the edge over a width of roughly $4 k_B T$. For copper, $E_F \approx 7\ \text{eV}$, while $k_B T \approx 26\ \text{meV}$ at room temperature — the smearing is less than 0.4% of $E_F$. This is why metals' electrical properties are nearly temperature-independent: almost all conduction electrons are deep in the Fermi sea and irrelevant; only those within $\sim k_B T$ of $E_F$ participate in transport.

For bosons (photons, phonons), the $+1$ becomes $-1$:

$$n(\varepsilon) = \frac{1}{e^{\varepsilon/k_B T} - 1}$$

This is the **Bose-Einstein distribution** (with $\mu = 0$ for photons, since photon number is not conserved). It produces the Planck blackbody spectrum and the phonon contribution to heat capacity, and diverges as $\varepsilon \to 0$ — the reason bosons can macroscopically condense into a single ground state.

---

## How It Works

### Why Randomness Produces Predictable Macroscopic Laws

Relative fluctuations in any extensive quantity scale as $1/\sqrt{N}$. For $N \sim 10^{23}$ particles, relative fluctuations are $\sim 10^{-12}$. The macroscopic world looks deterministic because the probability of observing a significant deviation from the mean is not small — it is effectively zero. Entropy increase looks like a law because the ratio of high-entropy to low-entropy microstates is something like $e^{10^{23}}$ to 1. There is no microscopic arrow of time; the arrow emerges from this counting.

### Thermal Noise: Johnson-Nyquist

A resistor of resistance $R$ at temperature $T$ contains electrons in thermal equilibrium. By equipartition, their random thermal motion generates fluctuating currents, which appear as a fluctuating voltage across the terminals. The **power spectral density** of this voltage noise is:

$$S_V(f) = 4 k_B T R \quad [\text{V}^2/\text{Hz}]$$

This is white noise (flat spectrum) up to frequencies where $hf \sim k_B T$, i.e., into the terahertz range at room temperature. The RMS noise over bandwidth $\Delta f$ is:

$$V_\text{rms} = \sqrt{4 k_B T R \,\Delta f}$$

For a $1\ \text{k}\Omega$ resistor at $T = 300\ \text{K}$ over $\Delta f = 1\ \text{MHz}$:

$$V_\text{rms} = \sqrt{4 \times 1.38 \times 10^{-23} \times 300 \times 10^3 \times 10^6} \approx 4\ \mu\text{V}$$

This floor is fundamental — it cannot be reduced by better circuit design, only by lowering $R$ or lowering $T$. Cryogenic amplifiers used in radio telescopes and quantum computing readout circuits operate at $4\ \text{K}$ or below precisely to push this floor down by a factor of $\sqrt{300/4} \approx 9$.

The Johnson-Nyquist formula follows from the **fluctuation-dissipation theorem**: any system that dissipates energy (any resistor) must also fluctuate. Dissipation and noise are two faces of the same microscopic coupling.

### The Arrhenius Equation and Hardware Failure

Many rate processes — chemical reactions, ion migration, defect formation — require crossing an energy barrier $E_a$. The rate is:

$$r = A \, e^{-E_a / k_B T}$$

This is the **Arrhenius equation**. The prefactor $A$ sets the attempt frequency; the exponential gives the fraction of attempts that succeed (the Boltzmann probability of having enough energy). Doubling a reaction rate by raising temperature requires only a modest increase because the exponential is so sensitive: if $E_a / k_B T = 30$ at $300\ \text{K}$, raising to $310\ \text{K}$ reduces the
