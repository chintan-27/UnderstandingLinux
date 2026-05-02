---
id: 26
title: "Semiconductor manufacturing"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every abstraction you have studied — system calls, virtual memory, the scheduler, file descriptors — ultimately executes on a physical substrate made of sand. When manufacturing fails to hold tolerances at the nanometer scale, transistors leak current, clock speeds must be reduced, and caches become unreliable. More fundamentally: the physics of how silicon is processed sets hard ceilings that no kernel patch can raise. Dennard scaling collapsed because leakage current grows faster than active power shrinks below roughly 65 nm — a direct consequence of gate oxide thickness hitting quantum tunneling limits. That collapse forced multicore designs, which is why Linux's SMP scheduler, NUMA memory topology, and CPU frequency governors exist at all. The manufacturing process is not background knowledge; it is the reason the software stack is shaped the way it is.

---

## Core Concepts

### Silicon Purification: From Sand to Nine Nines

Raw silicon dioxide (SiO₂) is reduced with carbon in an arc furnace to yield metallurgical-grade silicon at roughly 99% purity. That sounds acceptable until you understand the constraint: a single boron or phosphorus atom per billion silicon atoms measurably shifts a transistor's threshold voltage. The Siemens process closes the gap — silicon is converted to trichlorosilane (SiHCl₃), fractionally distilled (exploiting the large vapor-pressure difference between SiHCl₃ and metal-chloride contaminants), then thermally decomposed back to solid silicon on a heated rod. The result is electronic-grade silicon at better than 99.9999999% purity (nine nines, or $< 1$ ppb metallic contamination).

Purity matters for a precise reason: any atom whose valence differs from silicon's four bonds either donates a free electron (phosphorus, arsenic — n-type) or creates a hole (boron — p-type). Uncontrolled dopants are defects; controlled dopants are transistors. The same chemistry that destroys yield when accidental is the mechanism exploited deliberately in every step that follows.

### Ingot Growth: Czochralski and Crystal Orientation

A seed crystal of known crystallographic orientation is dipped into molten silicon (melting point 1414 °C) and pulled upward while rotating. Silicon atoms attach epitaxially to the seed, propagating its lattice order. The result is a single-crystal boule up to 300 mm in diameter.

*Single-crystal* is the operative constraint. A polycrystalline ingot would contain grain boundaries — planar defects where two misoriented lattice regions meet. At a grain boundary, periodic potential is broken, carrier mobility drops, and leakage paths form. No amount of process optimization recovers a transistor built across a grain boundary, which is why the Czochralski process is non-negotiable rather than merely conventional.

Orientation is chosen for electrical reasons. The (100) surface:
- Cleaves along {110} planes, giving controlled die singulation
- Has lower interface trap density ($D_{it}$) at the Si/SiO₂ boundary than (111) — meaning fewer states that capture charge and degrade MOSFET threshold stability
- Yields higher electron and hole mobility in the channel due to effective mass anisotropy in the diamond-cubic band structure

Bulk resistivity is set at this stage by adding controlled dopant quantities to the melt, establishing the starting substrate type and doping level that all subsequent implants will modify locally.

### Wafering: Surface Preparation Sets Process Latitude

The boule is sliced into wafers roughly 775 μm thick with a wire saw. This introduces subsurface lattice damage that would cause unacceptable leakage and hinder subsequent epitaxy. The damage is removed in sequence: mechanical lapping flattens the gross bow, chemical etching dissolves the damaged crystalline layer, and chemical-mechanical planarization (CMP) achieves the final surface. CMP combines a slurry of abrasive particles (SiO₂ or CeO₂) with a chemical oxidant; the mechanical action removes softened material while the chemistry re-oxidizes the surface, producing sub-nanometer RMS roughness.

Why does roughness matter at this scale? A 1 nm surface step is comparable to a few silicon lattice spacings (0.543 nm lattice constant). Any step that survives into the active region becomes a local variation in gate oxide thickness, which shifts the threshold voltage of the transistor sitting above it. CMP recurs throughout the process — not just on bare wafers — precisely because planarity is a prerequisite for the focus depth of the photolithography system.

### Oxidation: Growing the Gate Dielectric

Exposing silicon to oxygen or steam at 800–1200 °C grows a thermal oxide:

$$\text{Si} + \text{O}_2 \rightarrow \text{SiO}_2 \qquad \text{(dry)}$$

$$\text{Si} + 2\text{H}_2\text{O} \rightarrow \text{SiO}_2 + 2\text{H}_2 \qquad \text{(wet)}$$

The oxide grows *into* the silicon, consuming it at a ratio of approximately 0.44 nm of Si per 1 nm of SiO₂ grown. This is not incidental — it means the Si/SiO₂ interface forms inside previously undamaged crystal rather than at an exposed surface, producing the electrically clean interface that makes MOSFETs possible.

The Deal–Grove model describes oxidation kinetics. For thick oxides the growth rate is diffusion-limited and parabolic; for thin oxides it is reaction-rate-limited and linear:

$$x_{ox}^2 + A\, x_{ox} = B(t + \tau)$$

where $x_{ox}$ is oxide thickness, $B$ is the parabolic rate constant, $B/A$ is the linear rate constant, and $\tau$ accounts for any initial oxide. In practice, gate oxides are grown in the thin, linear regime with precise time control.

The physical limit of SiO₂ as a gate dielectric is set by quantum mechanics. For an oxide thinner than approximately 1.2 nm, the electron wavefunction tunnels directly from channel to gate, producing gate leakage current that grows roughly as:

$$J_g \propto \exp\!\left(-2\kappa\, t_{ox}\right), \qquad \kappa = \frac{\sqrt{2m^* \phi_B}}{\hbar}$$

where $t_{ox}$ is oxide thickness, $m^*$ is the electron effective mass in SiO₂, and $\phi_B \approx 3.1\,\text{eV}$ is the Si/SiO₂ tunnel barrier. At 45 nm node geometries, $t_{ox}$ reached this limit. The solution was high-κ dielectrics (hafnium oxide, HfO₂, κ ≈ 25 vs. SiO₂'s κ ≈ 3.9): a physically thicker film with the same capacitance per unit area as a thin SiO₂ layer, but an exponentially lower tunnel current because $t_{ox}$ in the exponent above refers to physical, not equivalent, thickness.

The equivalent oxide thickness (EOT) quantifies this trade-off:

$$\text{EOT} = t_{high-\kappa} \cdot \frac{\kappa_{SiO_2}}{\kappa_{high-\kappa}}$$

A 3 nm HfO₂ layer has EOT ≈ $3 \times (3.9/25) \approx 0.47\,\text{nm}$ — capacitively equivalent to an SiO₂ film that would be far into the direct-tunneling regime.

### Deposition: Adding Material Without Consuming Silicon

**Chemical Vapor Deposition (CVD)** brings precursor gases to the hot wafer surface where they react and leave a solid film. Polysilicon for gate electrodes is deposited by silane pyrolysis:

$$\text{SiH}_4 \xrightarrow{625\,°\text{C}} \text{Si} + 2\text{H}_2$$

Plasma-Enhanced CVD (PECVD) uses a glow discharge to dissociate precursors, driving reactions at 300–400 °C rather than 600+ °C. This matters because by the time metal interconnects are present, any temperature above roughly 400 °C causes aluminum to spike into silicon or copper to diffuse through barriers — destroying structures deposited in previous steps. The thermal budget is a cumulative constraint: every high-temperature step reshapes every dopant profile laid down earlier, so process integration is a multi-variable optimization, not a sequence of independent steps.

**Atomic Layer Deposition (ALD)** achieves angstrom-level control by exploiting surface saturation. Each cycle exposes the surface to precursor A (which chemisorbs in a self-limiting monolayer), purges the chamber, then exposes to precursor B (which reacts only with the adsorbed A layer), and purges again. One cycle deposits one monolayer regardless of precursor partial pressure or exposure time variations. HfO₂ gate dielectrics and TiN barrier/electrode layers are deposited by ALD. At 2 nm nodes, where total film thicknesses are measured in a handful of atomic layers, ALD is not a premium option — it is the only method with sufficient thickness control.

**Physical Vapor Deposition (PVD) / Sputtering** uses argon ion bombardment to knock atoms off a target material; they deposit on the wafer. PVD is used for bulk metal layers (tungsten plugs, copper seed layers, TiN liners) where conformality requirements are less stringent than for gate dielectrics.

### Photolithography: Wavelength, Numerical Aperture, and the Resolution Limit

Photolithography transfers a geometric pattern from a mask to the wafer surface. The sequence: spin-coat photoresist, expose through a mask via a projection lens system, develop the exposed resist, then etch or implant through the openings.

The minimum resolvable half-pitch $L$ follows the Rayleigh criterion:

$$L = k_1 \frac{\lambda}{\text{NA}}$$

where $\lambda$ is the exposure wavelength, NA is the numerical aperture of the projection lens ($\text{NA} = n \sin\theta$, where $n$ is the refractive index of the immersion medium), and $k_1$ is a process factor bounded below
