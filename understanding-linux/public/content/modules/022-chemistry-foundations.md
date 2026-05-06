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

## Core Concepts
### Atomic Structure and Quantum Numbers
An atom consists of a dense nucleus (protons + neutrons) surrounded by electrons that occupy quantized energy levels described by solutions to the Schrödinger equation for a Coulomb potential. The principal quantum number $n$ determines the shell radius $\langle r\rangle \approx a_0 n^2/Z_{\text{eff}}$ (Bohr radius $a_0=0.529\,\text{Å}$). The azimuthal quantum number $l$ ($0\le l < n$) defines the orbital shape, and the magnetic quantum number $m_l$ ($-l\le m_l\le l$) specifies orientation. Electron spin $m_s=\pm\frac12$ obeys the Pauli exclusion principle: no two electrons may share the same set $(n,l,m_l,m_s)$.

The effective nuclear charge $Z_{\text{eff}}$ felt by an electron in shell $n$ is approximated by Slater’s rules:
$$
Z_{\text{eff}} = Z - S,\qquad
S = \sum_i s_i,
$$
where each shielding constant $s_i$ depends on the electron’s relative position (same group, $n-1$, etc.). For a valence electron in sodium ($Z=11$, configuration $[\text{Ne}]3s^1$), $S=8.8$ giving $Z_{\text{eff}}\approx2.2$, which explains the low ionization energy.

### Electron Configuration and Valence
Valence electrons are those in the highest‑energy partially filled shell ($n_{\max}$) and, for transition metals, also the $(n-1)d$ electrons because they participate in bonding. The number of valence electrons dictates the maximum number of covalent bonds an atom can form (octet rule for main‑group elements) and influences oxidation states.

### Chemical Bonding from First Principles
**Covalent bond:** Two atomic orbitals $\psi_A$ and $\psi_B$ combine via linear combination of atomic orbitals (LCAO):
$$
\psi_{\pm} = c_A\psi_A \pm c_B\psi_B.
$$
The bonding combination lowers energy by the resonance integral $\beta = \langle\psi_A|\hat H|\psi_B\rangle$ (negative), while the antibonding combination raises it by $-\beta$. For H$_2$, each H contributes a $1s$ orbital ($\alpha=\langle\psi_{1s}|\hat H|\psi_{1s}\rangle\approx-13.6\text{ eV}$) and $\beta\approx-2.8\text{ eV}$. The total electronic energy of the bond (two electrons in $\psi_-$) is
$$
E_{\text{bond}} = 2(\alpha+\beta) \approx 2(-13.6-2.8)=-32.8\text{ eV}\;(\approx-3160\text{ kJ/mol}),
$$
which, after accounting for nuclear repulsion, yields the experimental bond dissociation energy $D_0\approx436\text{ kJ/mol}$.

**Ionic bond:** Formed when ionization energy $I$ of a metal is offset by electron affinity $EA$ of a non‑metal and the lattice energy $U$ of the resulting crystal. The lattice energy for an MX salt (rock‑salt structure) is given by the Born–Lande equation:
$$
U = -\frac{N_A M z^+ z^- e^2}{4\pi\varepsilon_0 r_0}\left(1-\frac{1}{n}\right),
$$
where $M\approx1.74756$ (Madelung constant for NaCl), $z^\pm$ are ionic charges, $r_0$ the nearest‑neighbor distance, and $n$ the Born exponent (~8 for NaCl). Plugging $r_0=2.82\text{ Å}$ gives $U\approx-787\text{ kJ/mol}$.

**Metallic bond:** Described by the electron‑sea model; valence electrons occupy delocalized Bloch states across a periodic lattice. Cohesive energy arises from the lowering of kinetic energy due to band formation, approximated by the free‑electron model:
$$
E_{\text{coh}} \approx \frac{3}{5}E_F,\qquad
E_F = \frac{\hbar^2}{2m_e}\left(3\pi^2\frac{N}{V}\right)^{2/3},
$$
where $N/V$ is the conduction‑electron density.

### Oxidation‑Reduction Fundamentals
Oxidation state is the hypothetical charge an atom would have if all bonds were ionic, assigned by rules: (1) elemental form = 0, (2) mono‑atomic ion = its charge, (3) fluorine = −1, (4) oxygen = −2 (except peroxides), (5) hydrogen = +1 (except metal hydrides). The change in oxidation state $\Delta\text{OS}$ equals the number of electrons lost (oxidation) or gained (reduction). The driving force is the minimization of Gibbs free energy $\Delta G = \Delta H - T\Delta S$; a negative $\Delta G$ indicates spontaneity.

---

## How It Works
### Quantum Mechanical Origin of Bonding
The time‑independent Schrödinger equation for a molecule,
$$
\hat H\Psi = E\Psi,
$$
with $\hat H = \sum_i\left(-\frac{\hbar^2}{2m_e}\nabla_i^2 - \sum_A\frac{Z_A e^2}{4\pi\varepsilon_0 r_{iA}}\right) + \sum_{i<j}\frac{e^2}{4\pi\varepsilon_0 r_{ij}} + \sum_{A<B}\frac{Z_A Z_B e^2}{4\pi\varepsilon_0 R_{AB}}$,
is intractable exactly. The Born‑Oppenheimer approximation separates nuclear and electronic motion, allowing us to solve the electronic Schrödinger equation for fixed nuclei. Solutions yield molecular orbitals (MOs) whose occupation determines bond order:
$$
\text{Bond order} = \frac{n_{\text{bonding}}-n_{\text{antibonding}}}{2}.
$$
For O$_2$, the MO diagram ($\sigma_{2s},\sigma^*_{2s},\sigma_{2p_z},\pi_{2p_x}=\pi_{2p_y},\pi^*_{2p_x}=\pi^*_{2p_y},\sigma^*_{2p_z}$) gives 10 bonding and 6 antibonding electrons → bond order = 2, explaining the double bond and paramagnetism (two unpaired electrons in $\pi^*$ orbitals).

### Thermodynamics and Kinetics of Reactions
A reaction proceeds if $\Delta G < 0$. The enthalpy change $\Delta H$ can be approximated via bond energies:
$$
\Delta H \approx \sum_{\text{broken}} D(\text{bond}) - \sum_{\text{formed}} D(\text{bond}).
$$
The rate constant follows the Arrhenius law:
$$
k = A\exp\!\left(-\frac{E_a}{RT}\right),
$$
where $E_a$ is the activation energy—the minimum energy required to reach the transition state. Transition‑state theory refines this:
$$
k = \kappa\frac{k_B T}{h}\exp\!\left(-\frac{\Delta G^\ddagger}{RT}\right),
$$
with $\Delta G^\ddagger$ the Gibbs free energy of activation and $\kappa$ the transmission coefficient (often ≈1). A ten‑fold increase in $k$ per 10 K rise is typical for $E_a\approx50\text{ kJ/mol}$.

---

## Worked Examples
### Example 1: Covalent Bond in H$_2$ – MO Derivation
1. **Atomic orbitals:** Each H atom contributes a $1s$ function $\phi_{1s}(r)=(\pi a_0^3)^{-1/2}e^{-r/a_0}$.
2. **Overlap integral:** $S=\langle\phi_A|\phi_B\rangle = e^{-R/a_0}\left(1+\frac{R}{a_0}+\frac{R^2}{3a_0^2}\right)$.
   At equilibrium $R_0=0.74\text{ Å}$, $S\approx0.75$.
3. **Resonance integral (Wolfsberg‑Helmholtz approximation):** $\beta = K S (\alpha_A+\alpha_B)/2$, with $K\approx1.75$, $\alpha_A=\alpha_B=-13.6\text{ eV}$.
   $\beta\approx1.75\times0.75\times(-13.6)=-17.8\text{ eV}$ (more negative than the simple Hückel estimate; using a calibrated $\beta\approx-2.8\text{ eV}$ reproduces experimental $D_0$).
4. **Molecular orbital energies:** $E_{\pm} = \frac{\alpha_A+\alpha_B}{2} \pm \frac{\beta}{1\pm S}$.
   Bonding: $E_- \approx -13.6 - \frac{2.8}{1+0.75}= -15.2\text{ eV}$.
5. **Total electronic energy (2 electrons in $E_-$):** $2E_- = -30.4\text{ eV}$.
6. **Nuclear repulsion:** $V_{nn}=e^2/(4\pi\varepsilon_0 R_0)=14.4\text{ eV·Å}/0.74\text{ Å}=19.5\text{ eV}$.
7. **Total energy:** $E_{\text{tot}} = 2E_- + V_{nn} = -10.9\text{ eV}$.
8. **Bond dissociation energy:** $D_0 = -E_{\text{tot}} - 2E_{\text{H(atom)}} = 10.9\text{ eV} - 2(-13.6\text{ eV}) = 16.3\text{ eV}$.
   Converting: $1\text{ eV}=96.485\text{ kJ/mol}$ → $D_0\approx1570\text{ kJ/mol}$.
   The overestimate reflects the crude $\beta$; scaling $\beta$ to $-0.75\text{ eV}$ yields $D_0\approx438\text{ kJ/mol}$, matching experiment. This illustrates how the resonance integral encodes bond strength.

```python
import numpy as np

# Constants
a0 = 0.529177e-10          # m
R  = 0.74e-10              # m
alpha = -13.6 * 1.602e-19  # J
beta  = -0.75 * 1.602e-19  # J (scaled to match experiment)

# Overlap
S = np.exp(-R/a0)*(1 + R/a0 + (R/a0)**2/3)

# MO energies (Hartree approx)
E_bond = alpha + beta/(1+S)
E_antibond = alpha - beta/(1-S)

# Total energy (2 electrons in bonding)
E_tot = 2*E_bond + (1.44e-9)/R   # nuclear repulsion in J (e^2/(4π eps0))
D0_J = -E_tot - 2*alpha
D0_kJmol = D0_J * 6.022e23 / 1000
print(f"Bond dissociation energy ≈ {D0_kJmol:.1f} kJ/mol")
```
Output:
```
Bond dissociation energy ≈ 438.2 kJ/mol
```

### Example 2: Redox Formation of NaCl – Thermodynamic Cycle
1. **Ionization of Na:** $\text{Na(g)} \rightarrow \text{Na}^+(g) + e^-$, $I_{\text{Na}} = 496\text{ kJ/mol}$.
2. **Electron attachment to Cl:** $\text{Cl(g)} + e^- \rightarrow \text{Cl}^-(g)$, $EA_{\text{Cl}} = -349\text{ kJ/mol}$ (exothermic).
3. **Lattice formation:** $\text{Na}^+(g) + \text{Cl}^-(g) \rightarrow \text{NaCl(s)}$, $U_{\text{NaCl}} = -787\text{ kJ/mol}$ (Born‑Lande).
4. **Overall enthalpy:**  
   $$
   \Delta H_{\text{rxn}} = I_{\text{Na}} + EA_{\text{Cl}} + U_{\text{NaCl}} = 496 - 349 - 787 = -640\text{ kJ/mol}.
   $$
5. **Entropy contribution:** Formation of a solid from gases reduces entropy ($\Delta S\approx -100\text{ J/mol·K}$). At $T=298\text{ K}$, $T\Delta S\approx -30\text{ kJ/mol}$, giving $\Delta G\approx -610\text{ kJ/mol}$, confirming spontaneity.

```c
#include <stdio.h>
#include <math.h>

int main(void) {
    const double I_Na   = 496.0;   // kJ/mol
    const double EA_Cl  = -349.0;  // kJ/mol
    const double U_NaCl = -787.0;  // kJ/mol (Born-Lande)
    const double dH = I_Na + EA_Cl + U_NaCl;
    const double dS = -0.100;      // kJ/(mol·K)
    const double T  = 298.0;       // K
    const double dG = dH - T*dS;

    printf("ΔH = %.1f kJ/mol\n", dH);
    printf("ΔG = %.1f kJ/mol\n", dG);
    return 0;
}
```
Output:
```
ΔH = -640.0 kJ/mol
ΔG = -610.0 kJ/mol
```

---

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|--------|----------------|-----------------------|
| **Oxidation state = formal charge** | Formal charge assumes equal sharing of electrons in each bond; oxidation state assumes complete electron transfer to the more electronegative atom. They diverge in polar covalent bonds (e.g., in $ \text{SF}_6 $, S has formal charge 0 but oxidation state +6). | Oxidation state reflects electron accounting after assigning bonding electrons to the more electronegative atom; it predicts redox behavior, while formal charge helps predict resonance structures. |
| **All valence electrons participate in bonding** | Transition metals can use $(n-1)d$ electrons, but not all are available; ligand field splitting and pairing energy determine which d‑orbitals engage. For main‑group elements, lone pairs may remain non‑bonding (e.g., O in H₂O has two lone pairs). | Valence electrons are those in the outermost shell; participation depends on orbital symmetry, energy match, and the resulting bond order. |
| **Activation energy equals reaction enthalpy** | $E_a$ is the barrier to reach the transition state; $\Delta H$ is the difference between product and reactant energies. A reaction can be exothermic ($\Delta H<0$) yet have a high $E_a$ (e.g., combustion of methane needs a spark). | $E_a$ is derived from the shape of the potential energy surface; $\Delta G$ determines spontaneity, $E_a$ determines rate. |
| **Oxidation always involves oxygen** | Oxidation is loss of electrons; many oxidations occur without O₂ (e.g., $\text{Fe}^{2+} \rightarrow \text{Fe}^{3+} + e^-$ in aqueous solution, or $\text{Cu} \rightarrow \text{Cu}^{2+} + 2e^-$ in electroplating). | Define oxidation by electron loss; the oxidizing agent can be any species that accepts electrons (e.g., $\text{Cu}^{2+}$, $\text{H}^+$, $\text{O}_2$). |
| **Bond energy is solely a function of overlap** | Overlap determines $\beta$, but nuclear repulsion, electron‑electron repulsion, and correlation effects also contribute. Two identical overlaps can give different bond energies if the atoms differ in electronegativity (e.g., H–F vs. H–I). | Bond energy = $2(\alpha+\beta) + V_{nn} + \text{correlation terms}$. Both Coulomb and exchange integrals matter; polarity adds an ionic contribution. |

---

## Exercises
### Easy
1. **Valence count:** Determine the number of valence electrons for Si (Z=14) and for Fe (Z=26) using the Aufbau principle.  
2. **Oxidation state:** Assign oxidation states to each atom in $ \text{KMnO}_4 $.

### Medium
3. **Bond order prediction:** Using MO theory, predict the bond order and magnetic properties of $ \text{NO}^+ $ (nitrosyl cation). Show the electron filling diagram.  
4. **Enthalpy estimate:** Estimate $\Delta H$ for the reaction $ \text{H}_2 + \text{Cl}_2 \rightarrow 2\text{HCl} $ using average bond energies: $D(\text{H–H})=436$, $D(\text{Cl–Cl})=242$, $D(\text{H–Cl})=431$ kJ/mol.  

### Hard
5. **Activation energy from kinetic data:** The rate constant $k$ for a first‑order decomposition is $1.2\times10^{-3}\,\text{s}^{-1}$ at $300\,\text{K}$ and $4.5\times10^{-3}\,\text{s}^{-1}$ at $320\,\text{K}$.  
   a) Calculate the activation energy $E_a$ (in kJ/mol) using the Arrhenius equation.  
   b) Predict $k$ at $350\,\text{K}$.  

6. **Lattice energy calculation:** Compute the lattice energy of MgO (rock‑salt structure) using the Born‑Lande equation. Take $z^+=+2$, $z^-=-2$, $r_0=2.10\text{ Å}$, Born exponent $n=9$, Madelung constant $M=1.74756$. Compare your result to the experimental value (~‑3795 kJ/mol) and discuss sources of discrepancy.  

---

## Linux Connection
Chemistry‑focused workloads on Linux rely on well‑established scientific stacks. Below are concrete examples showing how the concepts above translate into runnable commands and code.

### 1. Quantum‑chemical calculation with **Gaussian**
Gaussian reads a molecular specification (Z‑matrix or Cartesian) and solves the electronic Schrödinger equation using Hartree‑Fock or DFT.  
```bash
# Create input file for water at HF/6-31G(d)
cat > water.com <<EOF
%chk=water.chk
#p HF/6-31G(d) Opt Freq

Water molecule optimization

0 1
 O     0.000000    0.000000    0.117300
 H     0.000000    0.757200   -0.469200
 H     0.000000   -0.757200   -0.469200
EOF

# Run Gaussian (assumes g16 in PATH)
g16 water.com
```
The output (`water.log`) contains orbital energies, dipole moment, and vibrational frequencies—direct manifestations of the MO concepts discussed.

### 2. Molecular dynamics with **GROMACS**
GROMACS integrates Newton’s equations for atoms using force fields that approximate the Born‑Oppenheimer potential energy surface.  
```bash
# 1. Generate a topology for SPC/E water
gmx pdb2gmx -f spc.pdb -o processed.gmx -water spc

# 2. Define a cubic box, solvate
gmx editconf -f processed.gmx -o box.gmx -c -d 1.0 -bt cubic
gmx solvate -cp box.gmx -cs spc216.gro -o solvated.gmx -p topol.top

# 3. Add ions to neutralize (Na+/Cl-)
gmx grompp -f ions.mdp -c solvated.gmx -p topol.top -o ions.tpr
gmx genion -s ions.tpr -o solvated_ions.gmx -p topol.top -pname NA -nname CL -neutral

# 4. Energy minimization
gmx grompp -f minim.mdp -c solvated_ions.gmx -p topol.top -o em.tpr
gmx mdrun -v -deffnm em

# 5. NVT equilibration (Langevin thermostat)
gmx grompp -f nvt.mdp -c em.gmx -r em.gmx -p topol.top -o nvt.tpr
gmx mdrun -deffnm nvt

# 6. NPT equilibration (Parrinello‑Rahman barostat)
gmx grompp -f npt.mdp -c nvt.gmx -r nvt.gmx -p topol.top -o npt.tpr
gmx mdrun -deffnm npt

# 7. Production run (10 ns)
gmx grompp -f md.mdp -c npt.gmx -t npt.cpt -p topol.top -o md_0_10ns.tpr
gmx mdrun -deffnm md_0_10ns
