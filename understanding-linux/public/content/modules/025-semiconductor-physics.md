---
id: 25
title: "Semiconductor physics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every CPU, RAM chip, and storage controller in your Linux machine is built from semiconductors. The transistors switching inside your processor only work because engineers can precisely control electron flow through doped silicon — a material that can be made to behave as either a conductor or insulator on demand. Without the p-n junction, there are no diodes, no transistors, no MOSFETs, no DRAM cells. The entire computational substrate the kernel manages disappears. Understanding how charge carriers drift under electric fields and diffuse down concentration gradients is not abstract physics — it is the operating principle of every piece of hardware Linux talks to.

---

## Core Concepts

### Intrinsic Semiconductors

Pure silicon forms a covalent lattice with four valence electrons per atom. At absolute zero, every electron is bound in a covalent bond and silicon is a perfect insulator. At room temperature, thermal energy promotes a small number of electrons across the **band gap** into the conduction band:

$$E_g \approx 1.1\ \text{eV} \quad \text{(Si, 300 K)}$$

Each promoted electron leaves behind a **hole** — a vacancy in the valence band that behaves as a positive charge carrier because neighboring electrons can fall into it, propagating the vacancy in the direction opposite to electron motion. In a pure (intrinsic) semiconductor, every promoted electron creates exactly one hole:

$$n = p = n_i$$

The intrinsic carrier concentration at 300 K:

$$n_i \approx 1.5 \times 10^{10}\ \text{cm}^{-3}$$

Compare this to copper: $n_{\text{Cu}} \approx 8.5 \times 10^{22}\ \text{cm}^{-3}$. Pure silicon has roughly $10^{12}$ times fewer free carriers than copper. This is why it is useless as either a conductor or a controllable switch in its intrinsic state.

The temperature dependence of $n_i$ is exponential in the band gap:

$$n_i(T) = \sqrt{N_c N_v}\, \exp\!\left(-\frac{E_g}{2k_B T}\right)$$

where $N_c$ and $N_v$ are the effective density of states in the conduction and valence bands. This exponential sensitivity means a 10 °C temperature rise approximately doubles $n_i$, which matters for leakage current in real devices.

### Extrinsic Semiconductors and Doping

Doping introduces impurity atoms to break the $n = p$ symmetry, making one carrier type dominate.

**N-type:** Substitute Group V atoms (phosphorus, arsenic) into the Si lattice. Phosphorus brings five valence electrons; four participate in covalent bonds, and the fifth sits in a shallow donor level just $\sim 0.045\ \text{eV}$ below the conduction band — compared to $1.1\ \text{eV}$ for the band gap. At 300 K, $k_B T \approx 0.026\ \text{eV}$, so virtually all donor atoms are ionized, each contributing a free electron without creating a hole. The ionized donor ($\text{P}^+$) is fixed in the lattice and cannot move.

**P-type:** Substitute Group III atoms (boron). Boron's three valence electrons leave an incomplete bond — a shallow acceptor level just above the valence band ($\sim 0.045\ \text{eV}$). At room temperature, valence electrons are readily promoted into this level, leaving mobile holes behind.

Typical doping concentrations range from $10^{14}$ to $10^{20}\ \text{cm}^{-3}$, which overwhelms $n_i$ by 4–10 orders of magnitude. The majority carrier concentration equals the dopant concentration to excellent approximation:

$$n \approx N_D \quad \text{(n-type)}, \qquad p \approx N_A \quad \text{(p-type)}$$

The minority carrier concentration follows from the **law of mass action**, which holds at thermal equilibrium because carrier generation and recombination rates must balance:

$$np = n_i^2$$

So in n-type silicon with $N_D = 10^{16}\ \text{cm}^{-3}$:

$$p = \frac{n_i^2}{N_D} = \frac{(1.5 \times 10^{10})^2}{10^{16}} = 2.25 \times 10^4\ \text{cm}^{-3}$$

Doping with donors suppresses hole concentration by twelve orders of magnitude. This asymmetry is exactly what gives a p-n junction its rectifying behavior.

### Drift

An applied electric field $\mathcal{E}$ exerts force $q\mathcal{E}$ on free carriers. Electrons accelerate opposite to $\mathcal{E}$; holes accelerate along $\mathcal{E}$. But carriers do not accelerate indefinitely — they scatter off lattice vibrations (phonons) and ionized impurity atoms at a mean interval $\tau$ (the **mean free time**). Each collision randomizes momentum, so the carrier starts fresh and re-accelerates. The average velocity gained between collisions is:

$$v_d = \frac{q\mathcal{E}}{m^*}\tau = \mu\mathcal{E}$$

where $\mu = q\tau/m^*$ is the **carrier mobility** ($\text{cm}^2/\text{V·s}$). This is structurally the same as terminal velocity under drag: the field accelerates, scattering dissipates, and a steady state emerges.

In silicon at 300 K:

| Carrier | Mobility | Reason for difference |
|---------|----------|-----------------------|
| Electron | $\mu_n \approx 1400\ \text{cm}^2/\text{V·s}$ | Lower effective mass $m^*$ |
| Hole | $\mu_p \approx 450\ \text{cm}^2/\text{V·s}$ | Higher effective mass, complex valence band |

Mobility degrades with temperature (more phonon scattering, $\mu \propto T^{-3/2}$) and with doping concentration (more ionized impurity scattering). This is why heavily doped silicon has lower electron mobility than lightly doped silicon — relevant when sizing resistive poly-silicon structures in CMOS.

The total **drift current density** sums both carrier contributions:

$$J_{\text{drift}} = (nq\mu_n + pq\mu_p)\mathcal{E} = \sigma\mathcal{E}$$

This is Ohm's Law derived from first principles. The conductivity $\sigma = nq\mu_n + pq\mu_p$ is controllable over many orders of magnitude by adjusting $n$ and $p$ through doping — the fundamental reason silicon is useful.

### Diffusion

Carriers also move in response to **concentration gradients**, with no electric field required. Random thermal motion is isotropic, but if more carriers exist on the left than the right, more random steps cross the boundary leftward-to-rightward than the reverse. The net flux is down the gradient — diffusion.

The diffusion current densities are:

$$J_n^{\text{diff}} = qD_n \frac{dn}{dx}, \qquad J_p^{\text{diff}} = -qD_p \frac{dp}{dx}$$

The sign difference: electrons diffusing down a concentration gradient (positive $dn/dx$ meaning carriers move in $-x$) produce a current in $+x$ because current is defined opposite to electron flow. Holes diffusing down their gradient produce current in the same direction as their motion.

Mobility and diffusion coefficient are not independent. At equilibrium, zero net current flows, so drift and diffusion must exactly cancel everywhere. Applying this condition to the equilibrium carrier distribution (which follows a Boltzmann exponential in the electrostatic potential) yields the **Einstein relation**:

$$\frac{D_n}{\mu_n} = \frac{D_p}{\mu_p} = \frac{k_B T}{q} \equiv V_T$$

At 300 K, the **thermal voltage** $V_T \approx 25.85\ \text{mV}$. This is not an empirical fit — it is forced by thermodynamics. Any model where this relation is violated predicts spontaneous current flow at equilibrium, violating the second law.

Practical values: $D_n \approx 36\ \text{cm}^2/\text{s}$, $D_p \approx 12\ \text{cm}^2/\text{s}$ in lightly doped silicon at 300 K.

### The P-N Junction

Bring p-type and n-type silicon into metallurgical contact. The steep concentration gradient at the interface drives immediate diffusion:

- Electrons diffuse from n → p (high $n$ to low $n$)
- Holes diffuse from p → n (high $p$ to low $p$)

As electrons vacate the n-side near the junction, they leave behind positively charged, immobile donor ions ($\text{P}^+$, $\text{As}^+$). As holes vacate the p-side, they expose negatively charged acceptor ions ($\text{B}^-$). A region forms near the junction that is depleted of free carriers — the **depletion region** — containing only fixed ionic charge.

This fixed charge distribution creates an electric field $\mathcal{E}$ pointing from the positive charge on the n-side to the negative charge on the p-side (n→p direction). This field drives drift currents that oppose the diffusion:

- Drift pushes electrons back toward n (field opposes diffusion)
- Drift pushes holes back toward p

Equilibrium is reached when drift current density exactly equals diffusion current density for each carrier species separately (not just in total). The junction reaches a steady state with a **built-in electric field** but zero net current.

### The Depletion Region and Built-in Potential

The built-in potential $V_{bi}$ is the electrostatic potential difference across the depletion region at equilibrium. It can be derived directly from the Einstein relation and the requirement of zero net current:
