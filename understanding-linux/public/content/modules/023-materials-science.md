---
id: 23
title: "Materials science"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every piece of hardware your Linux system runs on exists because humans learned to control matter at the atomic scale. A CPU's switching speed is bounded by electron mobility through a silicon crystal; that mobility collapses when the crystal contains too many defects. DRAM retention time is governed by charge leakage through oxide, which is a diffusion process. Solder joints crack under thermal cycling because of grain boundary stress accumulation. These are not metaphors — they are the rate-limiting physics that determine why your CPU throttles, why ECC events cluster at elevated temperatures, and why old hardware fails in characteristic ways. This module builds the physical intuition behind those mechanisms.

---

## Core Concepts

### Crystal Lattices: Periodicity as the Source of Band Structure

A crystal is defined by translational symmetry: atoms occupy positions $\mathbf{r} = n_1\mathbf{a}_1 + n_2\mathbf{a}_2 + n_3\mathbf{a}_3$ for integer $n_i$, where $\mathbf{a}_i$ are the primitive lattice vectors. The repeating unit is the **unit cell**. Silicon adopts the **diamond cubic** structure: two interpenetrating face-centered cubic (FCC) sublattices, one offset from the other by $\frac{a}{4}(1,1,1)$, giving each atom exactly four covalent nearest neighbors in a tetrahedral geometry.

Why does this geometry determine electrical behavior? Because electrons in a periodic potential cannot have arbitrary energies — Bloch's theorem forces electron wavefunctions to inherit the lattice periodicity, and the resulting interference between forward- and backward-scattered waves opens **band gaps**: ranges of energy with no allowed electron states. Silicon's gap is:

$$E_g \approx 1.12\ \text{eV} \quad \text{at } T = 300\ \text{K}$$

This value sits between metals ($E_g = 0$) and insulators ($E_g > 5\ \text{eV}$), which is precisely what makes it controllable: thermal energy at room temperature ($k_BT \approx 0.026\ \text{eV}$) is too small to bridge the gap spontaneously, but chemical doping can place electrons just below the conduction band, where trivially small energies ionize them.

The lattice constant $a = 0.543\ \text{nm}$ sets the atom density:

$$n = \frac{8}{a^3} = \frac{8}{(5.43 \times 10^{-10})^3} \approx 5.00 \times 10^{28}\ \text{m}^{-3}$$

Modern transistor gate pitches are $\sim 5\ \text{nm}$ — roughly 9 lattice constants — so the discrete atomic structure of the crystal is no longer negligible in device design. At this scale, one misplaced dopant atom shifts the threshold voltage of an individual transistor.

### Defects: The Mechanisms That Make Semiconductors Useful

A perfect crystal is a mathematical abstraction with zero entropy; thermodynamics guarantees that real crystals contain defects. More importantly, controlled defects are the *mechanism* of transistor operation.

**Point defects:**

- **Vacancy**: a missing atom. Neighboring atoms relax inward; the local electronic structure changes. Vacancies are the dominant vehicle for solid-state diffusion — atoms migrate by hopping into adjacent vacancies. The equilibrium vacancy concentration is:

$$n_v = N \exp\!\left(-\frac{E_f}{k_BT}\right)$$

where $E_f \approx 2.3\ \text{eV}$ for silicon. At $T = 1000\ \text{K}$ (a typical anneal temperature), $n_v/N \approx e^{-26.7} \approx 10^{-12}$, which sounds small but corresponds to $\sim 5 \times 10^{16}\ \text{vacancies/m}^3$ — comparable to intentional dopant concentrations.

- **Substitutional dopant**: a phosphorus atom (group V, 5 valence electrons) replacing a silicon atom donates one electron to the conduction band, costing only $E_d \approx 0.045\ \text{eV}$ — far below $k_BT$ at room temperature, so essentially all donors are ionized. Boron (group III, 3 valence electrons) accepts an electron from the valence band for $E_a \approx 0.045\ \text{eV}$, creating a mobile hole. The carrier density in an n-type sample doped at $N_D$ is:

$$n \approx N_D, \quad p \approx \frac{n_i^2}{N_D}$$

where $n_i \approx 1.5 \times 10^{10}\ \text{cm}^{-3}$ at 300 K is the intrinsic carrier concentration. This is why heavily doped silicon ($N_D \sim 10^{19}\ \text{cm}^{-3}$) behaves like a metal — carriers outnumber intrinsic thermally generated ones by nine orders of magnitude.

- **Interstitial**: an atom sitting between lattice sites, causing local compression. Oxygen interstitials in silicon act as pinning centers for dislocations — deliberately introduced to prevent dislocation propagation through the active device region.

**Line defects (dislocations):**

An edge dislocation is an extra half-plane of atoms terminated inside the crystal. The surrounding lattice is elastically strained in a field that decays as $1/r$ from the dislocation core. Dislocations move under shear stress (they enable plastic deformation in metals), but in silicon they are catastrophic: the broken bonds at the dislocation core introduce **mid-gap trap states** that act as carrier recombination centers. A single dislocation threading through a transistor channel can increase off-state leakage by orders of magnitude. Wafer manufacturers specify dislocation densities below $10^3\ \text{cm}^{-2}$ for device-grade material; float-zone silicon reaches below $10^1\ \text{cm}^{-2}$.

The **Burgers vector** $\mathbf{b}$ characterizes a dislocation's strength: it is the closure failure when you walk a loop around the dislocation in the perfect crystal. For FCC silicon, $|\mathbf{b}| = \frac{a}{\sqrt{2}} \approx 0.384\ \text{nm}$.

### Grain Boundaries: Structural Discontinuities That Resist Current

A **polycrystalline** material consists of many crystalline grains with different orientations, separated by **grain boundaries** — thin regions (1–2 nm wide) where the periodic structure breaks down. The misorientation angle $\theta$ between adjacent grains determines the boundary structure: low-angle boundaries ($\theta < 15°$) can be described as arrays of dislocations; high-angle boundaries are amorphous-like transition zones.

Grain boundaries matter for chip interconnects for three compounding reasons:

1. **Electron scattering**: Conduction electrons scatter at boundaries, adding a resistivity contribution $\rho_{GB}$ that scales as $d^{-1}$ where $d$ is grain size. As copper interconnect widths shrink below the electron mean free path ($\lambda_{Cu} \approx 40\ \text{nm}$ at room temperature), $\rho_{GB}$ dominates over bulk scattering. Interconnect resistivity at the 5 nm node is 2–3× the bulk copper value — this directly increases $RC$ delay and power dissipation.

2. **Accelerated diffusion**: Grain boundary diffusion has activation energy $Q_{GB} \approx 0.8\ \text{eV}$ in copper, versus $Q_{bulk} \approx 2.1\ \text{eV}$. At operating temperatures ($\sim 100°\text{C}$), boundary diffusion is faster than bulk diffusion by a factor:

$$\frac{D_{GB}}{D_{bulk}} = \exp\!\left(\frac{Q_{bulk} - Q_{GB}}{k_BT}\right) = \exp\!\left(\frac{1.3}{0.032}\right) \approx 10^{17}$$

This is why electromigration damage nucleates at grain boundaries before anywhere else.

3. **Impurity segregation**: Impurity atoms with a size or valence mismatch lower their energy by sitting in the disordered boundary region. This makes grain boundaries preferential sites for corrosion and void nucleation.

### Stress and Strain: Why Packages Crack on Thermal Cycling

**Stress** $\sigma$ is force per unit area (Pa). **Strain** $\varepsilon$ is fractional change in length (dimensionless). In the elastic regime, they are related by Young's modulus $E$:

$$\sigma = E\varepsilon$$

Silicon is elastically anisotropic: $E$ varies from $\approx 130\ \text{GPa}$ along $\langle100\rangle$ to $\approx 187\ \text{GPa}$ along $\langle111\rangle$. Wafers are diced along specific crystal planes to minimize chipping, and this anisotropy is why they cleave cleanly.

Thermal stress arises from CTE mismatch between bonded layers. For silicon and its gate oxide:

| Material | CTE $\alpha$ (K$^{-1}$) |
|---|---|
| Silicon | $2.6 \times 10^{-6}$ |
| SiO$_2$ | $0.5 \times 10^{-6}$ |
| Copper | $17 \times 10^{-6}$ |
| FR4 PCB | $\sim 14 \times 10^{-6}$ |

When a chip heats by $\Delta T$ from its bonding temperature, the biaxial stress generated at an interface is:

$$\sigma = \frac{E}{1-\nu}\,\Delta\alpha\cdot\Delta T$$

where $\nu$ is Poisson's ratio. For a CPU cycling between 30°C idle and 90°C load ($\Delta T = 60\ \text{K}$), the stress at the silicon–
