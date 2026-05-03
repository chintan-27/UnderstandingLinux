---
id: 22
title: "Chemistry foundations"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every process running on your Linux system is, at the deepest level, a story about electrons. The transistors in your CPU switch because electrons move between silicon atoms whose bonding geometry changes under an applied electric field. The thermal throttling in `cpufreq` exists because atomic vibration — heat — scatters conduction electrons, increasing resistance and causing voltage drops that corrupt logic levels. Flash storage wears out because electrons tunnel through silicon dioxide layers and become permanently trapped, shifting the threshold voltage of the floating gate until the cell can no longer distinguish 0 from 1. Chemistry is not background knowledge — it is the reason your hardware has the failure modes it does.

## Core Concepts

### Atoms and the Stability Imperative

An atom consists of a nucleus (protons + neutrons) surrounded by electrons in discrete energy shells. Shell capacities follow from quantum mechanics: 2, 8, 8, 18, ... The outermost shell — the **valence shell** — determines all bonding behavior.

The driving principle: **electrostatic potential energy is minimized when the valence shell is full**. This is not a metaphor. The Coulomb potential between a nucleus of charge $+Ze$ and an electron at distance $r$ is:

$$V(r) = -\frac{Ze^2}{4\pi\epsilon_0 r}$$

Electrons in a full shell are screened by inner electrons and settle into a configuration where net force on each electron is minimized. Atoms with incomplete valence shells have asymmetric charge distributions — exposed nuclear charge — that create electrostatic gradients. Bonding is the mechanical consequence of atoms lowering that gradient.

### Valence: Precise Bookkeeping

Valence electrons are the electrons in the outermost shell. They determine bond count exactly:

| Element | Valence $e^-$ | Bonds formed | Reason |
|---------|--------------|--------------|--------|
| H | 1 | 1 | needs 1 more to fill shell (capacity 2) |
| C | 4 | 4 | needs 4 more to fill shell (capacity 8) |
| N | 5 | 3 | needs 3 more; 1 lone pair remains |
| O | 6 | 2 | needs 2 more; 2 lone pairs remain |
| Si | 4 | 4 | same as carbon — this is not a coincidence |

Silicon's 4-valence structure is why it was chosen for transistors: like carbon, it forms a tetrahedral lattice with exactly 4 bonds per atom, and that lattice can be precisely doped by substituting atoms with 3 or 5 valence electrons to create controlled charge deficits (p-type) or surpluses (n-type).

$\text{CO}_2$ is linear with double bonds ($\text{O=C=O}$) because carbon's 4 bonding slots are filled by two double bonds, and each oxygen's 2 bonding slots are filled by one double bond. There is no other stable configuration that satisfies both atoms' valence requirements simultaneously.

### Covalent vs. Ionic Bonds

**Covalent bonds** form when atoms *share* electrons into overlapping orbitals. Neither atom surrenders the electrons; both nuclei attract the shared pair, lowering the system's potential energy. The bond has a definite spatial direction — it points along the line of orbital overlap — which is why molecules have rigid geometries.

Bond strength is quantified as **bond dissociation energy**: the energy required to break one mole of bonds homolytically. Representative values:

| Bond | Dissociation energy |
|------|-------------------|
| C–C | 347 kJ/mol |
| C=C | 614 kJ/mol |
| C≡C | 839 kJ/mol |
| Si–O | 452 kJ/mol |
| Si–H | 318 kJ/mol |

The Si–O bond's strength (452 kJ/mol) is why silicon dioxide ($\text{SiO}_2$) is used as a gate dielectric — it forms spontaneously on silicon surfaces and is chemically stable enough to survive fabrication temperatures.

**Ionic bonds** form when the electronegativity difference between two atoms is large enough that electron transfer is energetically favorable over sharing. Sodium (1 valence electron) transfers it to chlorine (7 valence electrons). The result:

- $\text{Na}^+$: full outer shell, net charge $+1$
- $\text{Cl}^-$: full outer shell, net charge $-1$
- Electrostatic attraction: $F = k_e \frac{q_1 q_2}{r^2}$

NaCl forms a repeating cubic lattice with no discrete molecule — every $\text{Na}^+$ is surrounded by 6 $\text{Cl}^-$ ions and vice versa. "A molecule of salt" is not a meaningful concept; the lattice energy is the sum of all pairwise Coulomb interactions across the crystal.

### Molecular Geometry and Polarity

Bond angles emerge from **valence shell electron pair repulsion (VSEPR)**: all electron pairs — bonding and lone — repel each other and adopt maximum angular separation. Water has 4 electron pairs around oxygen (2 bonding, 2 lone), which adopt a tetrahedral arrangement; but because the lone pairs are invisible to X-ray diffraction, the observed geometry is bent with a bond angle of $104.5°$ rather than the ideal tetrahedral $109.5°$. Lone pairs repel more strongly than bonding pairs, compressing the H–O–H angle.

The asymmetric geometry means the center of negative charge does not coincide with the center of positive charge. This separation constitutes a **dipole moment**:

$$\vec{\mu} = q \cdot \vec{d}$$

where $q$ is the magnitude of separated charge and $\vec{d}$ points from negative to positive. Water's dipole moment is $1.85 \text{ D}$ (debyes). This is why water dissolves ionic compounds: the $\delta^-$ oxygen end orients toward cations; the $\delta^+$ hydrogen ends orient toward anions. The hydration energy released exceeds the lattice energy of the ionic solid, so dissolution proceeds.

Nonpolar molecules (symmetric charge distribution, $\vec{\mu} = 0$) cannot interact favorably with water's dipole — hence "like dissolves like." This matters for semiconductor fabrication: nonpolar photoresists are deliberately chosen so they don't absorb atmospheric water vapor.

### Reactions: Energy Accounting

A chemical reaction rearranges bonds. Atoms are conserved; bond energies are not. Whether a reaction releases or absorbs energy depends on the difference in bond energies between products and reactants:

$$\Delta H_{rxn} = \sum \text{(bonds broken)} - \sum \text{(bonds formed)}$$

Methane combustion:

$$\text{CH}_4 + 2\text{O}_2 \rightarrow \text{CO}_2 + 2\text{H}_2\text{O}$$

Bonds broken: 4(C–H) + 2(O=O) = 4(413) + 2(498) = 2648 kJ/mol  
Bonds formed: 2(C=O) + 4(O–H) = 2(799) + 4(463) = 3450 kJ/mol  
$\Delta H \approx 2648 - 3450 = -802$ kJ/mol (exothermic; products are lower energy)

The general spontaneity criterion is Gibbs free energy:

$$\Delta G = \Delta H - T\Delta S$$

A reaction proceeds spontaneously when $\Delta G < 0$. At low $T$, enthalpy dominates — whether bonds in products are stronger than in reactants determines the outcome. At high $T$, the $T\Delta S$ term dominates — reactions that increase disorder ($\Delta S > 0$) become favorable. This crossover is why some reactions are endothermic but still proceed at high temperatures: the entropy gain outweighs the enthalpy cost.

Activation energy $E_a$ is the energy barrier the system must surmount to reach the transition state. The rate constant follows the Arrhenius equation:

$$k = A e^{-E_a / RT}$$

Doubling temperature does not double the rate — it exponentially increases it. This is why a CPU running 20°C hotter than rated does not degrade twice as fast; it degrades *much* faster, because the reaction rates for electromigration and oxide breakdown follow the Arrhenius form.

### Oxidation and Reduction

**Oxidation** is loss of electrons; **reduction** is gain of electrons (OIL RIG). They always occur as a pair — electrons lost by one species are gained by another. The **oxidation state** is a bookkeeping assignment of formal electron ownership: in $\text{H}_2\text{O}$, oxygen is $-2$, hydrogen is $+1$.

$$\text{Zn} + \text{Cu}^{2+} \rightarrow \text{Zn}^{2+} + \text{Cu}$$

Zinc: $0 \rightarrow +2$, oxidized, lost 2 electrons.  
Copper: $+2 \rightarrow 0$, reduced, gained 2 electrons.

The cell potential driving this reaction is:

$$\mathcal{E}_{cell} = \mathcal{E}_{cathode} - \mathcal{E}_{anode}$$

For Zn/Cu: $\mathcal{E}_{cell} = +0.34\text{ V} - (-0.76\text{ V}) = 1.10\text{ V}$

This is the basis of every battery — controlled redox produces an electromotive force. Lithium-ion cells use intercalation (lithium ions moving between graphite and metal oxide lattices) rather than dissolution, but the electrochemistry is identical in principle: electron flow through an external circuit, ion flow through the electrolyte.

Oxidation is also how aluminum forms its protective $\text{Al}_2\text{O}_3$ layer — aluminum at the surface is oxidized by atmospheric oxygen, and the resulting oxide is dense enough to prevent further oxidation of the bulk metal. Heatsink material selection is partially a story about which oxides form, how dense they are, and whether they conduct
