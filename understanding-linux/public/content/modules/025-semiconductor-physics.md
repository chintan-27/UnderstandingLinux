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

Every transistor switching in your CPU right now depends on a deliberate impurity — one foreign atom per million silicon atoms — introduced during fabrication. That impurity controls whether a region conducts via electrons or holes, and the boundary between two such regions (the p-n junction) is the physical primitive beneath every diode, BJT, MOSFET, and logic gate ever built.

This has direct consequences for systems programming:

- **CMOS power**: Gates consume dynamic power only during switching because both NMOS and PMOS transistors are never simultaneously on — a consequence of complementary doping. Static power leakage is a tunneling and subthreshold conduction problem rooted in junction physics.
- **Thermal throttling**: Carrier mobility falls with temperature ($\mu \propto T^{-3/2}$ in the phonon-scattering regime), increasing resistance and reducing drive current. The kernel's `cpufreq` and thermal governors exist to manage this degradation.
- **Flash wear**: Each write to a NAND cell tunnels electrons through a ~10 nm oxide. The oxide accumulates trapped charge over cycles, shifting the threshold voltage until the cell fails. The kernel's MTD subsystem and wear-leveling in flash translation layers are compensating for this physics.
- **Voltage scaling**: The Linux `cpufreq` driver reduces $V_{dd}$ at lower frequencies because MOSFET switching energy scales as $CV_{dd}^2$, and leakage current through reverse-biased junctions sets a floor on how low you can go.

---

## Core Concepts

### Intrinsic Semiconductors

Silicon forms a covalent lattice with four valence electrons per atom. At absolute zero, every electron is bound — silicon is a perfect insulator. At finite temperature, phonons (quantized lattice vibrations) carry thermal energy $k_B T$. When a phonon interaction transfers enough energy to break a covalent bond (the bandgap energy $E_g = 1.12$ eV for silicon at 300 K), it produces two carriers: a free electron in the conduction band and a **hole** — a missing electron in the valence band that behaves as a particle with positive charge $+q$ and its own effective mass.

The hole is not a metaphor. It has a well-defined momentum, drifts in applied fields, and carries current. The distinction matters because hole mobility differs from electron mobility, and that asymmetry propagates all the way up to CMOS circuit design.

Intrinsic carrier concentration at 300 K:

$$n_i \approx 1.5 \times 10^{10} \text{ cm}^{-3}$$

Silicon atom density is $5 \times 10^{22}$ cm$^{-3}$, so roughly one bond in $3 \times 10^{12}$ is broken at room temperature. The conductivity is correspondingly poor.

The **mass action law** holds at equilibrium regardless of doping:

$$n \cdot p = n_i^2$$

This is a consequence of detailed balance: the rate of electron-hole generation equals the rate of recombination. Increasing $n$ by doping suppresses $p$ proportionally, and vice versa. This constraint is what makes doped semiconductors predictable — you cannot independently set both carrier concentrations.

### Extrinsic Semiconductors and Doping

**N-type**: A Group V atom (phosphorus, arsenic, antimony) substitutes into the silicon lattice. Four of its five valence electrons participate in covalent bonds; the fifth is bound to the donor nucleus by only ~45 meV — far less than $E_g$. At room temperature ($k_B T \approx 26$ meV), virtually all donors are ionized. Each donor atom contributes one free electron and leaves behind a fixed positive ion. Majority carriers: electrons.

**P-type**: A Group III atom (boron, aluminum) has three valence electrons. It accepts an electron from a neighboring bond to complete its four bonds, leaving a free hole. Each acceptor becomes a fixed negative ion. Majority carriers: holes.

Typical doping: $N_D$ or $N_A$ from $10^{14}$ to $10^{20}$ cm$^{-3}$. Since $n_i = 1.5 \times 10^{10}$ cm$^{-3}$, even $10^{14}$ cm$^{-3}$ doping increases the majority carrier density by four orders of magnitude over intrinsic. The minority carrier density drops by the same factor (mass action law).

At doping $N_D = 10^{16}$ cm$^{-3}$ in n-type silicon:

$$n \approx N_D = 10^{16} \text{ cm}^{-3}, \quad p = \frac{n_i^2}{N_D} = \frac{(1.5\times10^{10})^2}{10^{16}} = 2.25 \times 10^4 \text{ cm}^{-3}$$

Minority hole concentration is 12 orders of magnitude below majority electron concentration.

### Drift

Apply an electric field $E$. A free carrier accelerates under force $qE$, but the crystal lattice is not empty — phonons and ionized dopant atoms scatter carriers stochastically. The mean free time between collisions $\tau$ is on the order of 0.1–1 ps. Between collisions, a carrier accelerates; each collision randomizes its momentum. The net result is a steady **drift velocity** proportional to field:

$$v_d = \mu E$$

The **mobility** $\mu$ is:

$$\mu = \frac{q\tau}{m^*}$$

where $m^*$ is the carrier's effective mass (which accounts for band curvature — it is not the free electron mass). Electrons have lower effective mass and longer mean free time than holes in silicon:

$$\mu_n \approx 1400 \text{ cm}^2/\text{V·s}, \quad \mu_p \approx 450 \text{ cm}^2/\text{V·s}$$

This 3:1 ratio is why NMOS transistors deliver ~3× the drive current of PMOS at identical geometry and bias — and why high-performance logic uses NMOS for pull-down networks where speed is critical.

Drift current density:

$$J_\text{drift} = q(n\mu_n + p\mu_p)E$$

At high fields (above ~$10^4$ V/cm in silicon), $v_d$ saturates at $v_\text{sat} \approx 10^7$ cm/s because carriers emit optical phonons faster than the field can re-accelerate them. This velocity saturation is the reason simply shrinking transistor dimensions stops improving speed past a point — the channel field increases but $v_d$ does not.

### Diffusion

A concentration gradient drives net carrier flow even with no applied field. This is not a force — it is a consequence of random thermal motion: carriers in a high-concentration region have more neighbors to collide with and statistically migrate toward lower concentration. The flux is:

$$J_{\text{diff},n} = qD_n \frac{dn}{dx}, \quad J_{\text{diff},p} = -qD_p \frac{dp}{dx}$$

The sign difference: both equations describe flux from high to low concentration, but electrons ($-q$) and holes ($+q$) produce opposite current directions for the same particle flow.

Drift and diffusion are linked. In thermal equilibrium, no net current flows anywhere — the drift and diffusion components must cancel exactly. Enforcing this cancellation yields the **Einstein relation**:

$$D = \mu \frac{k_B T}{q} = \mu V_T$$

where $V_T = k_B T / q \approx 26$ mV at 300 K is the **thermal voltage**. This is not an independent equation — it is a thermodynamic constraint. Violating it would imply a perpetual current in equilibrium, which violates the second law. Concretely:

$$D_n = 1400 \times 0.026 \approx 36 \text{ cm}^2/\text{s}, \quad D_p = 450 \times 0.026 \approx 11.7 \text{ cm}^2/\text{s}$$

### The P-N Junction

Place p-type and n-type silicon in contact (in practice, this is done by ion implantation or diffusion into a single crystal — there is no physical interface, just a doping profile that changes over nanometers to microns).

At the instant of contact, there is a large electron concentration gradient at the boundary: electrons diffuse from n into p, holes diffuse from p into n. As they leave, they expose the fixed dopant ions: positive donor ions on the n-side, negative acceptor ions on the p-side. These fixed charges cannot move. They create an electric field pointing from n to p — which drives drift currents opposing the diffusion. Equilibrium is reached when drift exactly cancels diffusion for each carrier species independently.

The region depleted of mobile carriers is the **depletion region**. Its width is set by charge neutrality: total negative charge on p-side equals total positive charge on n-side.

$$x_n N_D = x_p N_A$$

where $x_n$ and $x_p$ are the depletion widths into the n and p sides respectively. Total depletion width:

$$W = x_n + x_p = \sqrt{\frac{2\epsilon_s}{q}\left(\frac{1}{N_A} + \frac{1}{N_D}\right)V_{bi}}$$

For heavily doped n-type ($N_D \gg N_A$), the depletion region extends almost entirely into the lightly doped p-side. Asymmetric doping produces asymmetric depletion — this is why the drain/body junction in a MOSFET behaves differently on each side.

---

## How It Works

### Built-in Potential

The Fermi level $E_F$ — the electrochemical potential of electrons, the energy at which occupation probability is exactly $\frac{1}{2}$ — must be spatially uniform throughout any system in thermal equilibrium. (A gradient in $E_F$ would imply a net current, which is not equilibrium.) Since doping shifts $E_F$ differently in p and n regions, the bands must bend across the
