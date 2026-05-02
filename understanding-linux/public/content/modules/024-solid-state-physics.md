---
id: 24
title: "Solid-state physics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every transistor switch in your CPU, every DRAM cell refresh, every NVM Express wear-leveling decision runs on hardware whose behavior is entirely determined by the physics here. The Linux kernel's `cpufreq` governor chooses operating points on a power-versus-frequency curve that is shaped by carrier mobility. The `thermal` subsystem trips throttling thresholds set by junction temperatures at which leakage current — exponentially dependent on $E_F$ — becomes uncontrollable. If you treat semiconductors as black boxes you will misread performance counters, misattribute thermal throttling, and misunderstand why a cold SSD controller is measurably faster than a hot one.

---

## Core Concepts

### Energy Bands

In an isolated atom, electrons occupy discrete energy levels. Pack $N \sim 10^{23}$ atoms into a crystal and the Pauli exclusion principle forces each atomic level to split into $N$ distinct quantum states — a **band**. The splitting is not gradual: it is a direct consequence of the periodicity of the crystal lattice. The periodic ionic potential creates Bragg-reflection conditions for electron wavefunctions at specific wavevectors $k = n\pi/a$ (where $a$ is the lattice constant). At those wavevectors, the wavefunction must be a standing wave, and the two standing-wave solutions (peaking on the ions vs. peaking between the ions) have different electrostatic energies. That energy difference is the **band gap** $E_g$ — a range of energies for which no Bloch wavefunction exists in the bulk crystal.

The gap is not merely a lack of electrons; it is a lack of *allowed states*. An electron cannot exist at an energy inside the gap for the same reason a waveguide cannot propagate a frequency below cutoff — the dispersion relation has no real solution there.

### Band Gaps and Material Classification

The **valence band** is the highest fully occupied band at $T = 0$. The **conduction band** is the next band above the gap. Conduction requires electrons to have empty states to scatter into; the gap determines whether that is possible at a given temperature.

| Material | $E_g$ (eV) | Classification | Physical reason |
|---|---|---|---|
| Diamond | 5.5 | Insulator | C–C bonds too strong; $k_BT \approx 0.026\,\text{eV} \ll E_g$ |
| Silicon | 1.12 | Semiconductor | Moderate sp³ hybridization |
| Germanium | 0.67 | Semiconductor | Larger atom, weaker bonds |
| GaAs | 1.42 | Semiconductor (direct) | Direct gap → efficient photon emission |
| Copper | 0 (overlap) | Metal | 4s and 3d bands cross at $E_F$ |

In a metal the Fermi level lies inside a band — there are empty states infinitesimally above every occupied state, so any nonzero electric field accelerates electrons. In an insulator the gap is so large that $k_BT$ cannot bridge it and the conduction band is effectively unpopulated. Semiconductors are the interesting middle case: $E_g \sim k_BT$ at some accessible temperature or doping level.

### The Fermi Level

The **Fermi-Dirac distribution** gives the probability that a state at energy $E$ is occupied:

$$f(E) = \frac{1}{e^{(E - E_F)/k_BT} + 1}$$

$E_F$ is the electrochemical potential — the energy at which $f = \frac{1}{2}$. At $T = 0$ this is a sharp step; at finite $T$ the transition smears over $\sim 4k_BT$ around $E_F$. At room temperature $k_BT \approx 0.026\,\text{eV}$, so the smearing is narrow compared to a 1.12 eV gap.

**Critical point**: $E_F$ need not coincide with any allowed state. In an intrinsic semiconductor $E_F$ sits near the middle of the gap — there are no states there. It is a thermodynamic potential, not a particle energy. Misidentifying it as "where electrons are" is the single most common conceptual error in semiconductor physics.

Its precise location within the gap is:

$$E_F = \frac{E_c + E_v}{2} + \frac{k_BT}{2} \ln\frac{N_v}{N_c}$$

The logarithmic correction is small (a few meV) because $N_v/N_c$ is close to unity for most semiconductors.

### Carriers: Electrons and Holes

Thermal excitation across the gap leaves an empty state in the valence band. That vacancy — a **hole** — is a legitimate quasiparticle with:

- Charge $+q$ (removal of $-q$ electron)
- Effective mass $m_h^*$ (determined by the curvature of the valence band: $m^* = \hbar^2 / (d^2E/dk^2)$, which is *negative* at the valence band maximum, hence holes have positive effective mass)
- Its own mobility $\mu_h$

Why does the valence band curvature give a negative effective mass for electrons? Near the band maximum, $d^2E/dk^2 < 0$, so an electron there accelerates *opposite* to the applied force — it behaves as a negative-mass particle. Redefining the absent electron as a hole with positive mass restores Newton's second law for the quasiparticle.

**Doping** is controlled impurity introduction:

- **n-type** (donor, e.g., P in Si): Phosphorus has 5 valence electrons; 4 form covalent bonds with neighboring Si atoms. The fifth is bound to the P⁺ core with only $\sim 0.045\,\text{eV}$ binding energy (vs. 1.12 eV for a valence electron) because the electron moves through Si with a screened Coulomb potential and a small effective mass. Room temperature is sufficient to ionize it into the conduction band. $E_F$ shifts upward toward $E_c$.
- **p-type** (acceptor, e.g., B in Si): Boron has 3 valence electrons. It accepts a fourth from a neighboring Si–Si bond, creating a mobile hole. $E_F$ shifts downward toward $E_v$.

The carrier concentrations as functions of $E_F$ are:

$$n = N_c \, \exp\!\left(-\frac{E_c - E_F}{k_BT}\right), \qquad p = N_v \, \exp\!\left(-\frac{E_F - E_v}{k_BT}\right)$$

where $N_c = 2\left(\frac{2\pi m_e^* k_BT}{h^2}\right)^{3/2}$ and similarly for $N_v$. These are Boltzmann approximations valid when $E_F$ is at least a few $k_BT$ from the band edges (non-degenerate semiconductor).

Multiplying these two expressions eliminates $E_F$ entirely:

$$np = N_c N_v \, e^{-E_g/k_BT} \equiv n_i^2$$

This **mass-action law** holds in thermal equilibrium regardless of doping level. If you add donors (increasing $n$), $p$ decreases proportionally to maintain $n_i^2$. For silicon at 300 K, $n_i \approx 1.5 \times 10^{10}\,\text{cm}^{-3}$. A phosphorus doping of $N_D = 10^{16}\,\text{cm}^{-3}$ gives $n \approx N_D$ and $p = n_i^2/N_D \approx 2.25 \times 10^4\,\text{cm}^{-3}$ — the minority carrier concentration drops by twelve orders of magnitude relative to majority carriers.

### Mobility and Scattering

Carriers accelerated by field $\mathcal{E}$ scatter off lattice vibrations (phonons) and ionized impurities, reaching a steady-state drift velocity:

$$v_\text{drift} = \mu \mathcal{E}$$

The mobility $\mu = q\tau/m^*$ where $\tau$ is the mean free time between collisions. The current density from both carrier types is:

$$J = (n\mu_e + p\mu_h)\,q\mathcal{E} \equiv \sigma \mathcal{E}$$

giving conductivity $\sigma = q(n\mu_e + p\mu_h)$.

Two mechanisms limit $\tau$, and their rates add (Matthiessen's rule):

$$\frac{1}{\tau} = \frac{1}{\tau_\text{phonon}} + \frac{1}{\tau_\text{impurity}}$$

**Why phonon scattering increases with temperature**: The number of phonons (lattice vibration quanta) scales as $\sim k_BT$ at high temperature (equipartition). More phonons means more scattering events per unit time, so $\tau_\text{phonon} \propto T^{-1}$ and $\mu_\text{phonon} \propto T^{-3/2}$.

**Why impurity scattering decreases with temperature**: A carrier passing an ionized dopant is deflected by the Coulomb potential $V \propto 1/r$. A faster carrier (higher $T$) spends less time near the impurity and is deflected less. More precisely, the scattering cross-section $\sigma_\text{imp} \propto v^{-4} \propto T^{-2}$, giving $\mu_\text{impurity} \propto T^{3/2}$.

For silicon at 300 K: $\mu_e \approx 1400\,\text{cm}^2/\text{V·s}$, $\mu_h \approx 450\,\text{cm}^2/\text{V·s}$. Electrons are faster because the conduction band minimum in Si has
