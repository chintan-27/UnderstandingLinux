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

Every transistor in your CPU sits inside a silicon crystal lattice. Whether that transistor switches reliably at 5 GHz or fails after six months depends on what the crystal does under stress, heat, and electric fields. Grain boundaries scatter electrons and limit conductivity in metal interconnects. Point defects create the dopant sites that make n-type and p-type semiconductors possible. Diffusion through a crystal lattice is how dopants are introduced during fabrication and how atoms migrate to create voids under electromigration — the dominant failure mode in copper interconnects below 10 nm. The kernel's CPU frequency scaling, thermal throttling, and memory refresh intervals are all engineering responses to atomic-scale physics. This module explains the physics those engineering choices are compensating for.

---

## Core Concepts

### Crystal Structures: Long-Range Order

A crystal is a solid where atoms occupy the vertices of a repeating three-dimensional **lattice**. The smallest repeating unit is the **unit cell**. Silicon forms a **diamond cubic** structure: two interpenetrating face-centered cubic (FCC) sublattices, one offset from the other by $\frac{a\sqrt{3}}{4}$ along the body diagonal, where $a = 0.543\ \text{nm}$ is the lattice constant. Each silicon atom is covalently bonded to four neighbors in a tetrahedral geometry — this four-fold coordination is why silicon is a semiconductor rather than a metal: the bonding and antibonding states split into a valence band and a conduction band separated by a 1.12 eV gap.

The reason atoms form crystals rather than random arrangements is energy minimization. The equilibrium bond length $r_0$ is the separation where net interatomic force is zero:

$$\frac{dU}{dr}\bigg|_{r=r_0} = 0$$

The potential well depth at $r_0$ is the cohesive energy per bond. For silicon, cohesive energy is approximately $4.63\ \text{eV/atom}$, which is why silicon does not spontaneously disorder at room temperature — thermal energy $k_B T \approx 0.026\ \text{eV}$ at 300 K is far below the energy cost of breaking bonds.

The lattice is not static. Atoms vibrate around equilibrium with amplitudes that grow with temperature. These vibrations are quantized — the quanta are **phonons** — and they carry heat through the crystal via propagation rather than electron transport. Silicon's thermal conductivity ($\approx 150\ \text{W/m·K}$) is high because phonons propagate with low scattering in a pure, stiff lattice. Anything that disrupts lattice periodicity — impurities, defects, grain boundaries — scatters phonons and reduces thermal conductivity. This matters for CPU cooling: a doped, stressed silicon die conducts heat less efficiently than a perfect crystal, and the thermal interface between die and heatspreader is engineered precisely because phonons cannot cross an amorphous boundary without mode conversion losses.

### Defects: Where Reality Diverges from the Ideal

Real crystals contain defects at finite temperature because their presence increases entropy enough to lower the Gibbs free energy even at the cost of disrupting local bonding. Defects are classified by dimensionality:

**Point defects (0D):**
- **Vacancy**: a missing atom. The site is empty, local bonds are broken, and neighboring atoms relax inward.
- **Interstitial**: an extra atom squeezed between lattice sites. Silicon interstitials are particularly mobile and mediate dopant diffusion during ion implantation annealing.
- **Substitutional impurity**: a foreign atom replacing a host atom. Phosphorus (group V, one extra valence electron → n-type donor) and boron (group III, one fewer electron → p-type acceptor) substituted into silicon at concentrations of $10^{15}$–$10^{20}\ \text{cm}^{-3}$ are the deliberate point defects that make transistors switch.

**Line defects (1D) — Dislocations:**
A dislocation is a line along which the crystal's regular stacking is disrupted. The displacement the crystal undergoes as you trace a closed loop around the dislocation line is the **Burgers vector** $\vec{b}$. For an edge dislocation, $\vec{b}$ is perpendicular to the dislocation line; for a screw dislocation, $\vec{b}$ is parallel. The shear stress required to move a dislocation through a perfect crystal is orders of magnitude lower than the theoretical shear strength of the lattice, which is why metals deform plastically at stresses far below $E/10$. In silicon wafers, dislocation density must be kept below roughly $10^3\ \text{cm}^{-2}$ — dislocations in the active device region act as recombination centers that degrade transistor performance.

**Planar defects (2D) — Grain Boundaries:**
Where two crystals of differing orientations meet, a grain boundary forms. Polycrystalline silicon, copper interconnects, and solder joints are all polycrystalline. The consequences are profound and mostly negative from a device perspective.

The equilibrium vacancy concentration follows a Boltzmann distribution because the system minimizes free energy by trading bond energy for configurational entropy:

$$n_v = N \exp\!\left(-\frac{E_f}{k_B T}\right)$$

where $N$ is the number of lattice sites, $E_f$ is the vacancy formation energy ($\approx 2.3\ \text{eV}$ for copper, $\approx 3.6\ \text{eV}$ for tungsten), $k_B$ is Boltzmann's constant, and $T$ is temperature. For copper at 20°C versus 300°C:

$$\frac{n_v(300°\text{C})}{n_v(20°\text{C})} = \exp\!\left(-\frac{E_f}{k_B}\left(\frac{1}{573} - \frac{1}{293}\right)\right) \approx 10^{10}$$

Ten orders of magnitude more vacancies at chip operating temperatures than at room temperature. Those vacancies in copper interconnects are what electromigration moves — electron wind drags copper atoms along the current direction, leaving vacancy clusters (voids) at the source and hillocks at the sink.

### Stress and Strain: How Solids Respond to Force

**Stress** $\sigma$ is force per unit area (Pa). **Strain** $\varepsilon$ is fractional deformation — dimensionless ratio of displacement to original length. In the elastic regime:

$$\sigma = E \varepsilon$$

where $E$ is **Young's modulus**. Silicon is elastically anisotropic: $E \approx 130\ \text{GPa}$ along $\langle 100 \rangle$, $\approx 187\ \text{GPa}$ along $\langle 111 \rangle$. Modern process nodes deliberately introduce **strain engineering** — depositing silicon-germanium in source/drain regions compresses the silicon channel, which distorts the band structure and increases carrier mobility by 20–50%, directly increasing drive current and switching speed without scaling geometry.

Beyond the **yield stress** $\sigma_y$, plastic deformation occurs via dislocation motion — the crystal permanently reshapes. Beyond the **fracture stress**, it breaks. Silicon is brittle (no plastic regime) — it fractures rather than bends, which is why wafer handling requires controlled environments and why die cracking during packaging is a yield concern.

Thermal stress arises when bonded materials have different **coefficients of thermal expansion (CTE)**. The mismatch strain is:

$$\varepsilon_{\text{thermal}} = (\alpha_1 - \alpha_2)\,\Delta T$$

For silicon ($\alpha \approx 2.6\ \text{ppm/K}$) bonded to copper ($\alpha \approx 17\ \text{ppm/K}$), a $\Delta T = 100\ \text{K}$ temperature swing produces:

$$\varepsilon_{\text{thermal}} = (17 - 2.6) \times 10^{-6} \times 100 = 1.44 \times 10^{-3}$$

Multiplied by copper's modulus ($\approx 130\ \text{GPa}$), that's $\sim 187\ \text{MPa}$ of stress — enough to drive fatigue cracking in solder joints over thousands of power cycles. CPU package design is largely the engineering problem of managing this mismatch across silicon, copper lid, thermal interface material, and FR4 PCB substrate.

### Diffusion: Atomic Motion Through a Lattice

At finite temperature, atoms hop between lattice sites by surmounting an energy barrier $Q$. The probability of surmounting the barrier follows Boltzmann statistics, giving an **Arrhenius diffusion coefficient**:

$$D = D_0 \exp\!\left(-\frac{Q}{k_B T}\right)$$

$D_0$ is a pre-exponential that encodes attempt frequency and geometry; $Q$ is the activation energy. For boron diffusing in silicon, $Q \approx 3.46\ \text{eV}$; for phosphorus, $Q \approx 3.66\ \text{eV}$. These values set the time and temperature of annealing steps in fab. Note the exponential sensitivity: a 50°C process temperature error changes $D$ by a factor of $\sim 2$–$5$ depending on $Q$, shifting dopant profile depths and threshold voltages.

Net atomic flux down a concentration gradient is **Fick's First Law**:

$$J = -D \frac{\partial C}{\partial x}$$

The time evolution of concentration is **Fick's Second Law**:

$$\frac{\partial C}{\partial t} = D \frac{\partial^2 C}{\partial x^2}$$

For a delta-function source (ion implant) diffusing into a semi-infinite solid, the solution is a Gaussian:

$$C(x,t) = \frac{Q_0}{\sqrt{\pi D t}}\exp\!\left(-\frac{x^2}{4Dt}\right)$$

where $Q_0$ is the total implanted dose. The **diffusion length** $L = 2\sqrt{Dt}$ characterizes how far the profile spreads. At
