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

Every transistor in your CPU, every bit in your SSD, every sensor in your laptop's touchpad exists because engineers learned to control *which* electrons move and *when*. Band theory explains why silicon conducts only sometimes — why a trace of phosphorus turns an insulator into a switch, and why shining light on a material generates current.

These are not abstractions. When a CPU throttles under load, carriers in a semiconductor junction are scattering off phonons, converting electrical work into heat. When your NVMe drive wears out, electrons tunnel through a gate oxide on each write cycle, eventually trapping charge that shifts the threshold voltage until the cell can no longer be reliably read. The Linux kernel's `cpufreq`, `thermal`, and flash translation layer subsystems exist because of exactly these physical limits.

---

## Core Concepts

### Energy Bands

In an isolated atom, electrons occupy discrete energy levels. When $N$ atoms assemble into a crystal lattice, quantum mechanical coupling splits each level into $N$ closely-spaced levels. For $N \sim 10^{23}$, the spacing $\sim 10^{-23}\,\text{eV}$ is unresolvable — the levels form a continuous **band**.

The two bands that govern conduction:

- **Valence band**: the highest band fully (or nearly fully) occupied at absolute zero. Every available state is filled, so electrons cannot accelerate in response to an applied field — there is nowhere to scatter into.
- **Conduction band**: the next band up, mostly empty at absolute zero. Electrons here can respond to fields because vacant states are adjacent in energy.

The distinction is not about energy magnitude but about whether vacant states exist nearby.

### Band Gaps

Between valence and conduction bands lies the **band gap** $E_g$ — a range of energies for which no electron states exist in a perfect crystal. The cause is not electron–electron repulsion or any classical effect: it is Bragg reflection. At the Brillouin zone boundary, electron waves with wavevector $k = \pm\pi/a$ (where $a$ is the lattice constant) satisfy the Bragg condition and form two standing waves. Their probability densities peak at different positions relative to the ion cores, producing different electrostatic energies. The energy difference between these two standing waves is $E_g$. No traveling wave of intermediate energy can propagate — the gap is topological, not energetic.

| Material | $E_g$ (eV) | Classification |
|---|---|---|
| Diamond | 5.5 | Insulator |
| Silicon | 1.12 | Semiconductor |
| Germanium | 0.67 | Semiconductor |
| GaAs | 1.42 | Direct-gap semiconductor |
| Copper | 0 (overlap) | Metal |

A metal has no gap because the Fermi level falls inside a partially filled band — electrons can scatter into arbitrarily nearby states. An insulator's gap is so large that $k_BT \ll E_g$ at any practical temperature. A semiconductor's gap is small enough that doping or thermal energy can populate the conduction band controllably.

### The Fermi Level

The **Fermi level** $E_F$ is the electrochemical potential for electrons — the energy at which the probability of occupation is exactly $\frac{1}{2}$, from the Fermi-Dirac distribution:

$$f(E) = \frac{1}{e^{(E - E_F)/k_BT} + 1}$$

At $T = 0$ this is a sharp step. At room temperature, $k_BT \approx 26\,\text{meV}$, so the distribution smears over roughly $4k_BT \approx 100\,\text{meV}$ centered on $E_F$. For silicon with $E_g = 1.12\,\text{eV}$, that smearing is small but not negligible.

In an intrinsic semiconductor, $E_F$ sits near the middle of the gap — close to the midpoint but shifted slightly toward the band with the lower effective density of states. Doping moves it:

- **n-type** (phosphorus in Si, five valence electrons): the extra electron is loosely bound to the dopant — the binding energy is only $\sim 45\,\text{meV}$, which thermal energy at room temperature readily supplies. This ionized donor contributes a free electron to the conduction band and pulls $E_F$ up toward that band.
- **p-type** (boron in Si, three valence electrons): the missing bond creates an acceptor level just above the valence band edge. Electrons from the valence band thermally fill this level, leaving mobile holes and pushing $E_F$ down toward the valence band.

The shift is quantitative. For a donor concentration $N_D$ much larger than the intrinsic concentration $n_i$:

$$E_F - E_i = k_BT \ln\!\left(\frac{N_D}{n_i}\right)$$

where $E_i$ is the intrinsic Fermi level. At $N_D = 10^{17}\,\text{cm}^{-3}$ and $n_i \approx 10^{10}\,\text{cm}^{-3}$ for silicon, this shift is $\approx 0.41\,\text{eV}$ — nearly halfway to the conduction band edge.

### Carriers: Electrons and Holes

A **hole** is the absence of an electron in the valence band, treated as a positive charge carrier with its own effective mass $m_h^*$ and mobility $\mu_h$. This is not a convenient fiction: the valence band has a well-defined dispersion relation $E(k)$, and the dynamics of the missing electron are exactly those of a positive particle with mass $m_h^* = -\hbar^2 \left(\partial^2 E / \partial k^2\right)^{-1}$ evaluated at the top of the valence band, where the band curves downward (negative curvature), making $m_h^* > 0$.

Intrinsic carrier concentration:

$$n_i = \sqrt{N_C N_V} \exp\!\left(-\frac{E_g}{2k_BT}\right)$$

where $N_C$ and $N_V$ are the effective density-of-states in the conduction and valence bands respectively, both $\propto (m^* T)^{3/2}$. The exponential dependence on $E_g / 2k_BT$ is why silicon at room temperature has $n_i \approx 10^{10}\,\text{cm}^{-3}$ (barely conducting) while germanium with $E_g = 0.67\,\text{eV}$ has $n_i \approx 2\times10^{13}\,\text{cm}^{-3}$ (more conducting, but more temperature-sensitive — one reason silicon displaced germanium in power electronics).

The temperature sensitivity is exponential, not linear. Doubling the absolute temperature roughly squares $n_i$ through the prefactor but exponentially inflates it through the Boltzmann term. This is why semiconductors can transition from insulators to conductors over a modest temperature range, and why thermal runaway in power devices is a real failure mode.

### Mobility and Drift

An applied field $\mathcal{E}$ accelerates carriers, but scattering events interrupt the acceleration on a timescale $\tau$ (the mean free time). The net result is a steady **drift velocity**:

$$v_d = \mu \mathcal{E}, \qquad \mu = \frac{e\tau}{m^*}$$

Current density follows:

$$J = (n e \mu_e + p e \mu_h)\,\mathcal{E} = \sigma \mathcal{E}$$

This is Ohm's law derived from first principles, not postulated. The conductivity $\sigma$ contains both carrier count ($n$, $p$) and carrier speed per unit field ($\mu_e$, $\mu_h$). Doping raises $n$ but lowers $\mu$ — the tradeoff is quantitative.

For silicon at room temperature: $\mu_e \approx 1400\,\text{cm}^2/\text{V·s}$, $\mu_h \approx 450\,\text{cm}^2/\text{V·s}$. Electrons are faster because their effective mass in the conduction band is lower than holes' effective mass in the valence band.

### Scattering Mechanisms

Two mechanisms dominate in real devices and compete differently with temperature:

1. **Phonon (lattice) scattering**: Higher temperature → larger amplitude lattice vibrations → shorter mean free path → lower $\tau$ → lower $\mu$. For acoustic phonon scattering:
$$\mu_\text{phonon} \propto T^{-3/2}$$
   This is the dominant mechanism above $\sim 100\,\text{K}$ in lightly doped silicon, and explains why your CPU's carrier mobility drops as it heats up.

2. **Ionized impurity scattering**: Each dopant atom is a charged center that deflects carriers via Coulomb interaction. Faster carriers deflect less, so impurity scattering *improves* with temperature (faster carriers, shorter interaction time):
$$\mu_\text{impurity} \propto T^{3/2} / N_\text{dopant}$$
   More doping always means lower mobility regardless of temperature. In heavily doped source/drain regions of a MOSFET ($N_D \sim 10^{20}\,\text{cm}^{-3}$), mobility can fall below $100\,\text{cm}^2/\text{V·s}$ — a factor of 14 reduction from the lightly doped limit.

The total scattering rate is the sum of individual rates (Matthiessen's rule):

$$\frac{1}{\tau} = \frac{1}{\tau_\text{phonon}} + \frac{1}{\tau_\text{impurity}} + \cdots$$

The mobility is therefore limited by whichever mechanism scatters most frequently.

The **Einstein relation** connects diffusion to mobility:

$$D = \mu k_B T / e$$

Both $D$ and $\mu$ arise from the same scattering events
