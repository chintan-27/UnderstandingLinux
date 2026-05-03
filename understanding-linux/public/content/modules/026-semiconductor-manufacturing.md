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

Every Linux system call, every memory access, every clock cycle depends on transistors switching reliably at nanosecond timescales. Those transistors exist because chemistry and physics were reduced to a reproducible industrial process. The characteristics you observe through Linux tooling — CPU frequency scaling, thermal throttling, cache hierarchy sizes, memory latency — are direct consequences of manufacturing decisions made at the fab. When `lscpu` reports a 3.6 GHz base clock, that number is bounded by how fast a transistor can switch given its gate length, oxide capacitance, and supply voltage — all process-determined quantities. Understanding the manufacturing chain explains *why* those numbers are what they are, not just what they are.

---

## Core Concepts

### Silicon Purification: From Quartz to Electronic Grade

Quartz ($\text{SiO}_2$) is reduced with carbon in an electric arc furnace:

$$\text{SiO}_2 + 2\text{C} \rightarrow \text{Si} + 2\text{CO}$$

This yields metallurgical-grade silicon (~98% pure). That 2% contamination is catastrophic: dopant atoms like boron and phosphorus at $10^{15}$ atoms/cm³ would swamp any deliberate doping signal. The Siemens process converts Si to trichlorosilane ($\text{SiHCl}_3$), fractionally distills it — exploiting the fact that boron and phosphorus trichlorides have different boiling points from $\text{SiHCl}_3$ — then reduces it back:

$$\text{SiHCl}_3 + \text{H}_2 \rightarrow \text{Si} + 3\text{HCl}$$

Electronic-grade silicon reaches 99.9999999% purity (nine nines). Why does purity matter this precisely? Because semiconductor behavior depends on *controlled* impurities at $10^{14}$–$10^{18}$ atoms/cm³ against a background of $5 \times 10^{22}$ Si atoms/cm³. The doping signal-to-noise ratio requires background contamination to be orders of magnitude below the intended doping level. A boron contamination of $10^{13}$ atoms/cm³ from impure feedstock is invisible at threshold; $10^{15}$ makes a lightly-doped p-well undopable by design.

### Czochralski Ingot Growth: Making a Single Crystal

Polycrystalline silicon cannot be used for devices. Grain boundaries create potential barriers that scatter carriers and act as recombination centers, destroying minority carrier lifetime and degrading transistor gain. Every device on a wafer must sit in a continuous, defect-free diamond cubic lattice.

The Czochralski process melts purified silicon in a quartz crucible at 1415°C (just above the 1414°C melting point — tight thermal control matters because solidification and melting are both occurring at the crystal-melt interface). A seed crystal is touched to the melt and slowly pulled upward while rotating:

- **Rotation** (typically 10–20 RPM) homogenizes the thermal field, preventing asymmetric heat flow from creating dopant striations in the grown crystal
- **Pull rate** sets the axial temperature gradient at the interface, which controls ingot diameter: faster pull narrows the ingot because less time is available for lateral solidification
- **Deliberate bulk doping** (e.g., boron for p-type substrates) is added to the melt now; this is the only practical point at which uniform bulk doping can be achieved

Modern fabs use 300mm diameter ingots, up to 2m long. The crystallographic quality established here — dislocation density, oxygen incorporation from the quartz crucible, vacancy concentration — sets a defect floor that no subsequent process step can improve, only degrade.

### Wafering: Slicing and Surface Preparation

Diamond wire saws cut the ingot into wafers ~775μm thick (300mm wafers). The extra thickness beyond the ~100μm active device layer exists purely for mechanical rigidity during handling. Crystal orientation is not arbitrary:

- **(100) orientation** is standard for CMOS logic because Si–SiO₂ interface state density is lowest on this plane, minimizing threshold voltage scatter across a wafer
- **KOH wet etching** is anisotropic: the etch rate ratio between (100) and (111) planes is approximately 100:1, enabling precise V-groove microstructures used in MEMS and fiber alignment
- **Channel mobility** differs by orientation: (110) surface with ⟨110⟩ channel direction maximizes hole mobility for pMOS, which is why strained silicon and FinFET geometries exploit this

After slicing, wafers undergo lapping (removes wire saw damage), chemical etching (removes lapping-induced sub-surface cracks), and CMP (chemical mechanical polishing) to achieve surface roughness below 0.1nm RMS. This flatness is not cosmetic — photolithography depth of focus at EUV wavelengths is on the order of tens of nanometers, so wafer bow or surface roughness directly causes out-of-focus exposure and feature size variation.

### Oxidation: Growing $\text{SiO}_2$

Silicon oxidizes in oxygen or steam:

$$\text{Si} + \text{O}_2 \rightarrow \text{SiO}_2 \quad \text{(dry oxidation, slower, denser oxide)}$$
$$\text{Si} + 2\text{H}_2\text{O} \rightarrow \text{SiO}_2 + 2\text{H}_2 \quad \text{(wet oxidation, faster, used for thick field oxide)}$$

A critical geometric fact: because oxygen must incorporate silicon atoms into the oxide, 46% of the final oxide thickness comes from consumed silicon and 54% grows above the original surface. A 10nm gate oxide physically etches 4.6nm into the substrate. This matters for planarity calculations across a wafer with regions of different oxide thickness.

The Deal-Grove model describes growth kinetics. Growth transitions from linear (surface-reaction-limited, thin oxide regime) to parabolic (diffusion-limited, thick oxide regime):

$$x_{ox}^2 + A \cdot x_{ox} = B(t + \tau)$$

where $\tau$ accounts for any oxide present before $t=0$. In the two limiting cases:

$$x_{ox} = \frac{B}{A}(t + \tau) \quad \text{(linear, thin oxide)}$$
$$x_{ox} = \sqrt{B \cdot t} \quad \text{(parabolic, thick oxide)}$$

$B$ (the parabolic rate constant) is diffusion-limited and depends on oxidant diffusivity through the existing oxide. $B/A$ (the linear rate constant) is surface-reaction-limited and is higher for wet oxidation because $\text{H}_2\text{O}$ has a higher solubility in $\text{SiO}_2$ than $\text{O}_2$.

For modern gate dielectrics below ~2nm, thermally grown $\text{SiO}_2$ is replaced by high-$\kappa$ dielectrics (HfO₂, $\kappa \approx 25$ vs. $\kappa = 3.9$ for SiO₂). The motivation is purely electrical: gate capacitance per unit area is:

$$C_{ox} = \frac{\kappa \varepsilon_0}{t_{ox}}$$

A 2nm HfO₂ layer delivers the same $C_{ox}$ as a 0.31nm SiO₂ layer — physically impossible to grow — while being thick enough to block quantum mechanical tunneling leakage. This is why Intel's high-k/metal gate process starting at 45nm was not an incremental improvement but a materials substitution forced by physics.

### Deposition: Adding Material Without Consuming Substrate

**CVD (Chemical Vapor Deposition):** Gas-phase precursors decompose or react at the heated wafer surface. Polysilicon deposition for gate electrodes:

$$\text{SiH}_4 \xrightarrow{620\text{–}650°\text{C}} \text{Si} + 2\text{H}_2$$

The deposition temperature determines whether the result is amorphous (below ~580°C) or polycrystalline (above). Gate polysilicon is deposited polycrystalline and subsequently doped; amorphous silicon is used where recrystallization will be driven later (e.g., thin-film transistors).

**ALD (Atomic Layer Deposition):** Two self-limiting half-reactions are cycled alternately. For HfO₂:

1. Pulse HfCl₄ — surface hydroxyl groups react, depositing one monolayer of Hf, reaction halts when all surface sites are consumed
2. Purge excess HfCl₄
3. Pulse H₂O — oxidizes the Hf monolayer to HfO₂, reaction halts
4. Purge

Each cycle deposits ~0.1nm. ALD's value is conformality: because growth is self-limiting to surface chemistry rather than flux-dependent, film thickness is uniform over arbitrarily complex 3D geometries — essential for FinFETs and gate-all-around nanosheet devices where the gate must wrap around a thin silicon fin.

**PVD/Sputtering:** Argon plasma ions bombard a metal target (W, Cu, Co, TiN), ejecting atoms by momentum transfer. Used for barrier layers (TiN prevents Cu diffusion into dielectric) and seed layers for subsequent electroplating. PVD is line-of-sight and non-conformal, which limits its use as interconnect geometries shrink.

### Photolithography: Pattern Transfer and the Resolution Limit

Photolithography transfers a mask pattern to a resist-coated wafer. Sequence:

1. **Spin-coat** photoresist (a photoactive polymer, typically 50–200nm thick at leading nodes)
2. **Expose** through a chrome-on-quartz mask using a lens that demagnifies the pattern 4× onto the wafer
3. **Develop** — aqueous base developer dissolves exposed positive resist or unexposed negative resist
4. **Etch or implant** through the opened resist window
5. **Strip** resist (O₂ plasma + wet chemistry)

Minimum printable feature size is diff
