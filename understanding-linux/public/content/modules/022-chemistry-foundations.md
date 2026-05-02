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

Silicon is a semiconductor not because of what it *is* but because of what you *do* to it: you deliberately introduce foreign atoms that either donate or accept electrons, shifting the Fermi level and creating regions that conduct only under specific conditions. That process — doping — is redox chemistry. Copper traces corrode when oxygen oxidizes the metal surface, increasing resistance and eventually breaking continuity. Thermal interface materials conduct heat in proportion to how well their molecular structure couples phonon vibration across a junction. Solder flows at a precise temperature because that is where the metallic bond energy of the alloy is overcome by thermal agitation. None of this is accessible without a working model of atomic structure, electron transfer, and bonding geometry. This module builds that model from first principles, oriented toward the physical behavior of computing hardware.

---

## Core Concepts

### Atoms and Electrons

A nucleus contains protons (which define the element) and neutrons (which affect mass and nuclear stability but almost nothing about chemistry). Electrons surround the nucleus in discrete energy levels called shells.

The critical quantity is the number of electrons in the **outermost shell** — the **valence electrons**. These are the only electrons involved in bonding. Inner electrons are shielded by the nucleus and do not participate. The periodic table is organized so that every element in the same column has the same valence electron count, which is why column position predicts chemical behavior.

Shell capacities:

- Shell 1: 2 electrons
- Shell 2: 8 electrons
- Shell 3: 8 electrons (for main-group elements), expandable for transition metals

An atom is most stable when its outermost shell is full. This is not a preference — it is a consequence of quantum mechanical energy minimization. A full shell is a local energy minimum; any partially filled shell represents stored potential energy that can be released by bonding.

### Valence and Bonding Rules

| Element | Valence electrons | Bonds typically formed | Why |
|---------|-------------------|----------------------|-----|
| H       | 1                 | 1                    | Needs 1 more to fill shell 1 (capacity 2) |
| C       | 4                 | 4                    | Needs 4 more to fill shell 2 (capacity 8) |
| N       | 5                 | 3                    | Needs 3 more; 1 lone pair remains |
| O       | 6                 | 2                    | Needs 2 more; 2 lone pairs remain |
| Si      | 4                 | 4                    | Same configuration as C, one shell lower |

Si and C both have 4 valence electrons and form 4 bonds. This is why silicon can form the same tetrahedral crystal lattice as diamond carbon, and why silicon is the basis of semiconductor fabrication rather than, say, aluminum.

### Bonding: Why Atoms Stick Together

Bonding occurs because sharing or transferring electrons produces a lower total energy state than two isolated atoms. The energy released in forming a bond is the bond dissociation energy — you have to put that much energy *back in* to break it.

**Covalent bonding**: Electrons are shared between atoms. Neither atom gives up the electron entirely; both nuclei attract the shared pair, and the electron density between them lowers the total electrostatic energy. Water ($\text{H}_2\text{O}$) is covalent: each hydrogen shares its single electron with oxygen, and both achieve full outer shells. The O–H bond dissociation energy is approximately 459 kJ/mol — that is the energy cost to sever it.

**Ionic bonding**: One atom transfers an electron to another. Sodium has 1 valence electron; removing it leaves a full shell (shell 2) and produces $\text{Na}^+$. Chlorine has 7 valence electrons; accepting one more fills its shell and produces $\text{Cl}^-$. The resulting ions attract each other by Coulomb's law:

$$F = k_e \frac{q_1 q_2}{r^2}$$

In solid NaCl there is no discrete "NaCl molecule." The crystal is an infinite lattice of alternating $\text{Na}^+$ and $\text{Cl}^-$ ions, each surrounded by six of the opposite charge. Every ion is bonded to its six neighbors equally — there is no natural boundary where one "molecule" ends and another begins.

**Metallic bonding**: Valence electrons are not localized to specific atoms or pairs. They delocalize across the entire material, forming a mobile electron sea. The metal cations sit in fixed lattice positions; the electrons flow freely between them. This is why metals conduct electricity: an applied electric field exerts force on those free electrons, and they drift. It is also why metals are malleable — the lattice can shift without breaking discrete bonds, because the electron sea adjusts continuously.

### Molecular Geometry

Bond angles are not arbitrary. Electron pairs — both bonding pairs and lone pairs — repel each other electrostatically (VSEPR: Valence Shell Electron Pair Repulsion). They arrange to maximize angular separation.

$\text{CO}_2$ is linear because carbon forms two double bonds with oxygen, and two electron groups separated by 180° is the maximum possible separation. No lone pairs exist on carbon to distort this.

Water is bent, not linear, because oxygen has **two lone pairs** in addition to its two bonding pairs. Four electron groups arrange tetrahedrally (~109.5°), but lone pairs occupy more angular space than bonding pairs, compressing the H–O–H bond angle to approximately 104.5°. This distortion has direct physical consequences — it makes water polar.

Molecular geometry determines:
- **Polarity** (whether charge is asymmetrically distributed)
- **Intermolecular forces** (which determine boiling point and viscosity)
- **Reactivity** (which face of a molecule an attacking species can approach)

### Equilibrium and Dynamic Balance

A sealed flask half-full of water at constant temperature looks static. It is not. At the liquid surface, molecules continuously escape into the vapor phase (evaporation) and vapor molecules continuously return to the liquid (condensation). Equilibrium is the condition where these rates are equal — not where they are zero.

This has a precise quantitative form. The vapor pressure $P$ at temperature $T$ follows the Clausius-Clapeyron equation:

$$\ln\frac{P_2}{P_1} = -\frac{\Delta H_\text{vap}}{R}\left(\frac{1}{T_2} - \frac{1}{T_1}\right)$$

where $\Delta H_\text{vap}$ is the molar enthalpy of vaporization and $R$ is the gas constant. Increase $T$ and $P$ rises exponentially — the equilibrium shifts toward the vapor phase because more molecules have enough energy to escape.

The same logic applies to dissolving ionic salts: equilibrium occurs when the rate of ions leaving the crystal lattice equals the rate of ions re-depositing from solution. Heating shifts the equilibrium because it changes reaction rates unequally.

### Chemical Reactions: Rearranging Atoms

A reaction breaks bonds and forms new bonds. Atoms are conserved; only their connectivity changes. The energy balance determines whether the reaction releases heat (exothermic) or absorbs it (endothermic):

$$\Delta H_\text{rxn} = \sum (\text{bond energies broken}) - \sum (\text{bond energies formed})$$

If bonds formed are stronger than bonds broken, $\Delta H_\text{rxn} < 0$ and energy is released. The reaction $2\text{H}_2 + \text{O}_2 \rightarrow 2\text{H}_2\text{O}$ is strongly exothermic because O–H bonds (~459 kJ/mol each) are much stronger than the H–H (~436 kJ/mol) and O=O (~498 kJ/mol) bonds they replace.

**Reaction rate** depends on temperature through the Arrhenius equation:

$$k = A \cdot e^{-E_a / RT}$$

where $E_a$ is the activation energy — the energy barrier that must be crossed to rearrange bonds. Below the activation threshold, collisions are elastic and no reaction occurs. The exponential dependence means small temperature increases produce large rate increases.

### Oxidation and Reduction

Oxidation and reduction always occur together — one species loses electrons, another gains them. The mnemonic: **OIL RIG** — Oxidation Is Loss, Reduction Is Gain.

$$4\text{Fe} + 3\text{O}_2 \rightarrow 2\text{Fe}_2\text{O}_3$$

Iron is oxidized: each Fe atom loses electrons to reach a positive oxidation state (+3 in $\text{Fe}_2\text{O}_3$). Oxygen is reduced: each O atom gains electrons, reaching oxidation state −2.

**Oxidation state** is a bookkeeping convention for electron distribution in a compound. Rules:
- Free elements have oxidation state 0
- Monatomic ions have oxidation state equal to their charge
- In a neutral compound, all oxidation states sum to zero
- Oxygen is almost always −2; hydrogen is almost always +1

For $\text{Fe}_2\text{O}_3$: let Fe = $x$. Then $2x + 3(-2) = 0$, so $x = +3$. Iron has been oxidized by 3 electrons per atom.

This is not a surface phenomenon in iron. Once the oxide layer forms, oxygen diffuses through it to reach fresh metal underneath. Unless the oxide layer is impermeable (as with aluminum's $\text{Al}_2\text{O}_3$, which is dense and self-limiting), corrosion continues inward.

---

## How It Works

### Why Water Is Polar and Why That Matters

Electronegativity measures how strongly a nucleus attracts shared bonding electrons toward itself. Oxygen's electronegativity (3.44 on the Pauling scale) is much higher than hydrogen's (2.20). In an O–H bond, the shared electrons spend more time near oxygen, creating a partial negative charge ($\delta^-$) on oxygen and partial positive charges ($\delta^+$) on the hydrogens.

Because water is bent rather than linear, these bond dipoles do not cancel — the molecule has a net dipole moment of 1.85 D. If water were linear like $\text{CO}_2$ (where the two C=O dipoles point in exactly opposite directions and cancel), it would
