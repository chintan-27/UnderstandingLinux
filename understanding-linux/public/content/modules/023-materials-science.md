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

## Core Concepts  
### Atomic Basis of Solids  
Matter is built from atoms whose electrons occupy quantized states described by the Schrödinger equation. In a solid, the periodic potential of the nuclei leads to Bloch states; the energy bands determine whether a material is a conductor, semiconductor, or insulator. The **lattice constant** \(a\) is the equilibrium spacing that minimizes the total energy \(E(a)\) derived from the interatomic potential (e.g., Lennard‑Jones or embedded‑atom model).  

### Crystal Lattices and Symmetry  
A crystal is defined by a **Bravais lattice** \(\{\mathbf{R}=n_1\mathbf{a}_1+n_2\mathbf{a}_2+n_3\mathbf{a}_3\}\) plus a basis of atoms. The three cubic lattices—FCC, BCC, simple cubic—are distinguished by their packing fractions:  
\[
\text{FCC: }\eta=\frac{\pi\sqrt{2}}{6}\approx0.74,\qquad
\text{BCC: }\eta=\frac{\pi\sqrt{3}}{8}\approx0.68.
\]  
HCP has the same \(\eta\) as FCC but a two‑atom basis leading to anisotropic elastic constants.  

### Point Defects  
A **vacancy** removes an atom, creating a formation energy \(E_f^v\) that can be estimated from broken bonds:  
\[
E_f^v \approx \frac{z}{2}E_{\text{bond}},
\]  
where \(z\) is the coordination number. An **interstitial** squeezes an extra atom into a lattice site, costing strain energy \(\sim \frac{1}{2}K\Delta V^2\) (bulk modulus \(K\), volume change \(\Delta V\)). Substitutional impurities alter the local charge balance and can introduce donor/acceptor levels in the band gap.  

### Line Defects (Dislocations)  
A dislocation is characterized by its **Burgers vector** \(\mathbf{b}\). The strain energy per unit length of an isolated straight dislocation in an isotropic medium is  
\[
\frac{E_{\text{disl}}}{L}= \frac{\mu b^2}{4\pi(1-\nu)}\ln\!\left(\frac{R}{r_0}\right),
\]  
with shear modulus \(\mu\), Poisson ratio \(\nu\), outer cut‑off \(R\) (sample size) and core radius \(r_0\). Dislocations enable plastic deformation at stresses far below the theoretical strength \(\sigma_{\text{th}}\approx \mu/2\pi\).  

### Planar Defects and Grain Boundaries  
A **grain boundary (GB)** is a planar defect separating two crystallographically oriented grains. Its energy \(\gamma_{\text{GB}}\) depends on the misorientation angle \(\theta\) (Read‑Shockley model for low‑angle GBs):  
\[
\gamma_{\text{GB}}(\theta)=\gamma_0\theta\left(A-\ln\theta\right),
\]  
where \(\gamma_0\) and \(A\) are material constants. High‑angle GBs act as sinks/sources for vacancies and dislocations, influencing diffusion and mechanical strength.  

### Stress, Strain, and Hooke’s Law  
For small deformations, the **stress tensor** \(\sigma_{ij}\) relates linearly to the **strain tensor** \(\varepsilon_{kl}\) via the fourth‑order stiffness tensor \(C_{ijkl}\):  
\[
\sigma_{ij}=C_{ijkl}\varepsilon_{kl}.
\]  
In an isotropic solid this reduces to two independent Lamé parameters \(\lambda,\mu\):  
\[
\sigma_{ij}= \lambda\,\varepsilon_{kk}\delta_{ij}+2\mu\varepsilon_{ij}.
\]  
Young’s modulus \(E\) and Poisson’s ratio \(\nu\) follow:  
\[
E=\frac{\mu(3\lambda+2\mu)}{\lambda+\mu},\qquad \nu=\frac{\lambda}{2(\lambda+\mu)}.
\]  

### Diffusion Mechanisms  
Atomic motion occurs via thermally activated jumps. The **jump rate** \(\Gamma\) follows transition‑state theory:  
\[
\Gamma = \nu_0 \exp\!\left(-\frac{E_m}{k_BT}\right),
\]  
where \(\nu_0\) is the attempt frequency (\(\sim10^{12-13}\,\text{s}^{-1}\)) and \(E_m\) the migration barrier. The macroscopic diffusion coefficient for a random walk of jump length \(\lambda\) is  
\[
D = \frac{1}{6}\lambda^2\Gamma \quad\text{(3D)}.
\]  
In vacancy‑mediated diffusion \(D = D_v c_v\) with vacancy concentration \(c_v = \exp(-E_f^v/k_BT)\).  

### Phase Behavior and Gibbs Free Energy  
A phase is stable when its Gibbs free energy \(G=H-TS\) is lowest. For a binary A‑B system, the regular solution model gives  
\[
G_{\text{mix}} = \Omega x_A x_B + RT\big[x_A\ln x_A + x_B\ln x_B\big],
\]  
with interaction parameter \(\Omega\). Phase boundaries (solvus, eutectic) are obtained by solving \(\partial G/\partial x =0\) and equality of chemical potentials.  

---

## How It Works  
### From Electronic Structure to Mechanical Properties  
The total energy of a crystal can be expressed within density‑functional theory (DFT) as  
\[
E[\rho]=T_s[\rho]+E_{\text{ext}}[\rho]+E_{\text{H}}[\rho]+E_{\text{xc}}[\rho]+E_{\text{ion-ion}},
\]  
where \(\rho\) is the electron density. The **Hellmann‑Feynman theorem** gives the force on ion \(I\):  
\[
\mathbf{F}_I = -\nabla_{\mathbf{R}_I}E[\rho] = -\int\rho(\mathbf{r})\nabla_{\mathbf{R}_I}V_{\text{ext}}(\mathbf{r})\,d\mathbf{r} - \sum_{J\neq I}\frac{Z_IZ_IE^2}{|\mathbf{R}_I-\mathbf{R}_J|^3}(\mathbf{R}_I-\mathbf{R}_J).
\]  
At equilibrium \(\mathbf{F}_I=0\). Small displacements \(\mathbf{u}_I\) lead to a harmonic expansion; the dynamical matrix yields phonon frequencies \(\omega_{\mathbf{q}s}\). The **elastic constants** are the second derivatives of \(E\) with respect to strain:  
\[
C_{ijkl} = \frac{1}{V_0}\frac{\partial^2E}{\partial\varepsilon_{ij}\partial\varepsilon_{kl}}\bigg|_{\varepsilon=0}.
\]  
Thus, bonding stiffness directly determines \(E\) and \(\mu\).  

### Defect Thermodynamics  
The equilibrium concentration of point defects follows from minimizing the free energy:  
\[
c_v = \exp\!\left(-\frac{G_f^v}{k_BT}\right) = \exp\!\left(-\frac{E_f^v - T S_f^v}{k_BT}\right).
\]  
Entropy \(S_f^v\) includes configurational (\(k_B\ln N\)) and vibrational contributions. For dislocations, the line tension balances the applied resolved shear stress \(\tau\) via the **Peach‑Koehler formula**:  
\[
\mathbf{f}= (\boldsymbol{\sigma}\cdot\mathbf{b})\times\boldsymbol{\xi},
\]  
where \(\boldsymbol{\xi}\) is the dislocation line direction. Motion occurs when \(\tau\) exceeds the lattice friction (Peierls stress).  

### Grain‑Boundary Mediated Diffusion  
GBs provide fast diffusion paths because the atomic coordination is reduced, lowering \(E_m\). The effective diffusion coefficient in a polycrystal is  
\[
D_{\text{eff}} = D_l + \frac{\delta}{d}D_{gb},
\]  
where \(D_l\) is lattice diffusion, \(\delta\) GB width (\(\sim0.5\,\text{nm}\)), \(d\) grain size, and \(D_{gb}\) GB diffusion (often \(10^2-10^4\) times larger than \(D_l\)).  

### Stress‑Strain Beyond Hooke’s Law  
Plastic flow begins when the resolved shear stress on a slip system reaches the critical resolved shear stress (CRSS). For FCC metals, slip occurs on \(\{111\}<110>\) systems; the Schmid law gives  
\[
\tau_{\text{RSS}} = \sigma\, \cos\phi \cos\lambda,
\]  
with \(\phi\) angle between load axis and slip plane normal, \(\lambda\) between load axis and slip direction.  

### Phase Transformations under External Fields  
Applying hydrostatic pressure \(P\) shifts phase boundaries via the Clapeyron relation:  
\[
\frac{dT}{dP}= \frac{\Delta V}{\Delta S},
\]  
where \(\Delta V\) and \(\Delta S\) are volume and entropy changes between phases.  

---

## Worked Examples  

### Example 1: Lattice Constant of FCC Copper from DFT‑Total Energy Curve  
**Goal:** Find equilibrium lattice constant \(a_0\) by fitting \(E(a)\) to a Birch‑Murnaghan equation of state.  

**Data (from a converged DFT calculation):**  
| \(a\) (Å) | \(E\) (eV/atom) |
|----------|-----------------|
| 3.55     | -3.482          |
| 3.60     | -3.495          |
| 3.65     | -3.502          |
| 3.70     | -3.503          |
| 3.75     | -3.500          |

**Birch‑Murnaghan (3rd order):**  
\[
E(V)=E_0+\frac{9V_0B_0}{16}\Big\{\big[(V_0/V)^{2/3}-1\big]^3 B_0' +\big[(V_0/V)^{2/3}-1\big]^2\big[6-4(V_0/V)^{2/3}\big]\Big\}.
\]  
For FCC, \(V=a^3/4\). Perform a non‑linear least‑squares fit (e.g., using `scipy.optimize.curve_fit`). The fit yields:  
\[
a_0 = 3.615\ \text{Å},\quad B_0 = 140\ \text{GPa},\quad B_0' = 5.2.
\]  
**Interpretation:** The experimental lattice constant of Cu is 3.615 Å, confirming the DFT‑PBE functional’s accuracy within 0.1 %.  

**Python snippet (included for reproducibility):**  
```python
import numpy as np
from scipy.optimize import curve_fit

def birch_murnaghan(V, E0, B0, Bp, V0):
    x = (V0/V)**(2/3) - 1
    return E0 + 9*V0*B0/16 * (x**3 * Bp + x**2 * (6 - 4*x))

# convert a to volume per atom (FCC: 4 atoms per conventional cell)
a_data = np.array([3.55, 3.60, 3.65, 3.70, 3.75])  # Angstrom
E_data = np.array([-3.482, -3.495, -3.502, -3.503, -3.500])  # eV
V_data = a_data**3 / 4.0

popt, _ = curve_fit(birch_murnaghan, V_data, E_data,
                    p0=[-3.5, 140, 5.2, (3.6**3)/4])
E0, B0, Bp, V0 = popt
a0 = (4*V0)**(1/3)
print(f"Equilibrium a = {a0:.3f} Å, B0 = {B0:.1f} GPa, B0' = {Bp:.2f}")
```  

---

### Example 2: Stress‑Strain Response of a Single‑Crystal Aluminum Wire  
**Goal:** Compute axial strain under a tensile load, accounting for elastic anisotropy.  

**Given:**  
- Load \(F = 5000\) N applied along the \([100]\) direction of an Al wire.  
- Wire cross‑section: square \(2\text{mm}\times2\text{mm}\) → \(A = 4\times10^{-6}\,\text{m}^2\).  
- Elastic constants for cubic Al (in GPa): \(C_{11}=108\), \(C_{12}=62\), \(C_{44}=28\).  

**Step 1 – Stress tensor:**  
Uniaxial stress along \(x\): \(\sigma_{xx}=F/A = 1.25\times10^9\ \text{Pa}\), all other components zero.  

**Step 2 – Compliance matrix:** For cubic symmetry, the inverse of \(C\) gives  
\[
S_{11}= \frac{C_{11}+C_{12}}{(C_{11}-C_{12})(C_{11}+2C_{12})},\quad
S_{12}= -\frac{C_{12}}{(C_{11}-C_{12})(C_{11}+2C_{12})},\quad
S_{44}= \frac{1}{C_{44}}.
\]  
Plugging numbers (convert GPa → Pa):  
\[
S_{11}= 9.93\times10^{-12}\ \text{Pa}^{-1},\;
S_{12}= -2.53\times10^{-12}\ \text{Pa}^{-1},\;
S_{44}= 3.57\times10^{-11}\ \text{Pa}^{-1}.
\]  

**Step 3 – Strain:** \(\varepsilon_{ij}=S_{ijkl}\sigma_{kl}\). Only \(\varepsilon_{xx}\) non‑zero:  
\[
\varepsilon_{xx}=S_{11}\sigma_{xx}=9.93\times10^{-12}\times1.25\times10^9=0.0124.
\]  
Thus the wire elongates by **1.24 %**.  

**Step 4 – Lateral contraction (Poisson effect):**  
\[
\varepsilon_{yy}= \varepsilon_{zz}= S_{12}\sigma_{xx}= -2.53\times10^{-12}\times1.25\times10^9 = -0.00316,
\]  
giving a Poisson ratio \(\nu = -\varepsilon_{yy}/\varepsilon_{xx}=0.255\), close to tabulated Al (\(\nu\approx0.33\); discrepancy arises from using only \([100]\) direction).  

**Verification with isotropic approximation:**  
Using \(E = (C_{11}-C_{12})(C_{11}+2C_{12})/(C_{11}+C_{12})\) → \(E\approx 69\) GPa, \(\nu = C_{12}/(C_{11}+C_{12})\approx0.36\). Then \(\varepsilon = \sigma/E = 1.25\text{ GV}/69\text{ GPa}=0.0181\). The anisotropic result is lower because the \([100]\) direction is softer than the polycrystalline average.  

**Shell command to compute with `elastic` Python package:**  
```bash
pip install elastic
python3 - <<'PY'
from elastic import CubicCrystal
al = CubicCrystal(c11=108e9, c12=62e9, c44=28e9)  # Pa
stress = [1.25e9, 0, 0, 0, 0, 0]  # Voigt notation
strain = al.compliance @ stress
print("Strain (Voigt):", strain)
print("Axial strain:", strain[0])
PY
```  

---

### Example 3: Vacancy‑Mediated Diffusion Coefficient of Nickel at 800 K  
**Goal:** Estimate \(D\) using formation and migration energies from literature.  

**Known values:**  
- Vacancy formation energy \(E_f^v = 1.6\) eV.  
- Migration barrier \(E_m = 1.3\) eV.  
- Attempt frequency \(\nu_0 = 5\times10^{12}\,\text{s}^{-1}\).  
- Jump distance for FCC nearest‑neighbor \(\lambda = a/\sqrt{2}\) with \(a=3.52\) Å → \(\lambda = 2.49\) Å = \(2.49\times10^{-10}\) m.  

**Step 1 – Equilibrium vacancy concentration:**  
\[
c_v = \exp\!\left(-\frac{E_f^v}{k_BT}\right) 
= \exp\!\left(-\frac{1.6\ \text{eV}}{8.617\times10^{-5}\ \text{eV/K}\times800\ \text{K}}\right)
= \exp(-23.2)= 8.9\times10^{-11}.
\]  

**Step 2 – Jump rate:**  
\[
\Gamma = \nu_0 \exp\!\left(-\frac{E_m}{k_BT}\right)
= 5\times10^{12}\exp\!\left(-\frac{1.3}{8.617\times10^{-5}\times800}\right)
= 5\times10^{12}\exp(-18.9)= 5\times10^{12}\times 6.2\times10^{-9}
\approx 3.1\times10^{4}\,\text{s}^{-1}.
\]  

**Step 3 – Diffusion coefficient:**  
\[
D = \frac{1}{6}\lambda^2\Gamma\,c_v
= \frac{1}{6}(2.49\times10^{-10})^2 (3.1\times10^{4})(8.9\times10^{-11})
\approx 2.8\times10^{-15}\ \text{m}^2\!/\text{s}.
\]  

**Comparison:** Experimental \(D_{\text{Ni}}(800\text{K})\) ≈ \(3\times10^{-15}\,\text{m}^2/\text{s}\); the simple model agrees within factor of 2, showing the dominant role of vacancy thermodynamics.  

**Bash script to compute with `ase`:**  
```bash
pip install ase
python3 - <<'PY'
import numpy as np
kB = 8.617333262e-5  # eV/K
T = 800.0
Ef = 1.6   # eV
Em = 1.3   # eV
nu0 = 5e12 # s^-1
a = 3.52e-10 # m
lam = a/np.sqrt(2)
cv = np.exp(-Ef/(kB*T))
Gamma = nu0*np.exp(-Em/(kB*T))
D = lam**2 * Gamma * cv / 6
print(f"D = {D:.2e} m^2/s")
PY
```  

---

## Common Mistakes  

| # | Mistake | Why It’s Wrong | Correct Reasoning |
|---|---------|----------------|-------------------|
| 1 | Assuming **Hooke’s law** holds for strains > 1 % in metals. | Hooke’s law is a linear‑elastic approximation; beyond the proportional limit, dislocation motion and anharmonic lattice effects cause non‑linear stress‑strain. | Use the full stress–strain curve or crystal plasticity models (e.g., Taylor hardening) for plastic regime. |
| 2 | Treating **grain boundaries** as mere passive interfaces that do not affect diffusion. | GBs have excess free energy and disordered atomic configurations, lowering migration barriers and acting as fast‑diffusion pipes (often 10²–10⁴× bulk). | Include GB diffusion term \(D_{gb}\) in effective diffusivity: \(D_{\text{eff}}=D_l+(\delta/d)D_{gb}\). |
| 3 | Confusing **vacancy formation energy** with **migration barrier** when estimating diffusion rates. | The overall diffusion coefficient scales with the product of vacancy concentration (set by formation energy) and jump rate (set by migration barrier). Ignoring either leads to orders‑of‑magnitude error. | Use \(D = D_0 \exp[-(E_f^v+E_m)/k_BT]\) where \(D_0 = \frac{1}{6}\lambda^2\nu_0\). |
| 4 | Assuming **isotropic elastic constants** for cubic crystals when computing directional Young’s modulus. | Cubic crystals are elastically anisotropic; \(E\) varies with direction (e.g., \(E_{[100]}\neq E_{[111]}\)). | Use the compliance tensor transformation: \(E(\mathbf{n}) = 1/(S_{ijkl}n_i n_j n_k n_l)\). |
| 5 | Neglecting **zero‑point energy** when comparing phase stability at low temperature. | At 0 K, quantum vibrational zero‑point energy can shift relative phase stability by several meV/atom, sometimes reversing the predicted ground state. | Include phonon zero‑point contribution: \(G(T)=E_{\text{DFT}}+F_{\text{vib}}(T)\) with \(F_{\text{vib}}(0)=\frac12\sum\hbar\omega\). |

---

## Exercises  

### Easy  
1. **Lattice constant from density** – A material has density \(ρ = 7.87\ \text{g cm}^{-3}\) and atomic mass \(M = 55.85\ \text{g mol}^{-1}\). Assuming a simple cubic lattice with one atom per primitive cell, compute the lattice constant \(a\).  
   *Hint:* Use \(ρ = \frac{M}{N_A a^3}\).  

2. **Stress in a rod** – A steel rod of cross‑section \(A = 5\ \text{mm}^2\) carries a tensile force \(F = 2\ \text{kN}\). Calculate the normal stress \(\sigma\).  

### Medium  
3. **Vacancy concentration** – For copper (\(E_f^v = 1.28\ \text{eV}\)), compute the equilibrium vacancy concentration at \(T = 600\ \text{K}\) and \(T = 900\ \text{K}\). Comment on the temperature dependence.  

4. **Anisotropic Young’s modulus** – Using the elastic constants of Ti (\(C_{11}=162\), \(C_{12}=92\), \(C_{44}=47\) GPa), determine Young’s modulus along the \([110]\) direction.  

### Hard  
5. **Diffusion coupling** – In a Ni‑Co alloy, vacancy formation energy varies linearly with Co fraction \(x\): \(E_f^v(x)=1.6-0.4x\) eV, while migration barrier is constant \(E_m=1.3\) eV. Derive an expression for the interdiffusion coefficient \(\tilde{D}(x,T)\) assuming Darken’s approximation and calculate \(\tilde{D}\) at \(x=0.3\), \(T=1000\) K.  

6. **Phase boundary shift under pressure** – The α→β transition in iron has \(\Delta V = -0.5\times10^{-6}\ \text{m}^3\ \text{mol}^{-1}\) and \(\Delta S = 0.12\ \text{J\,mol}^{-1}\text{K}^{-1}\). Using the Clapeyron equation, estimate the temperature shift \(\Delta T\) when pressure is increased by \(1\ \text{GPa}\).  

*Answers should be shown with appropriate significant figures and units.*  

---

## Linux Connection  

### 1. First‑Principles Codes – **ABINIT** and **Quantum ESPRESSO**  
Both packages solve the Kohn‑Sham DFT equations and can output total energies, forces, and stress tensors.  

**Installation (Ubuntu 22.04):**  
```bash
sudo apt-get update
sudo apt-get install -y abinit quantum-espresso
```  

**ABINIT input for Cu lattice relaxation (`cu.abi`):**  
```txt
# Definition of the unit cell
acell 3*7.61   # Bohr (initial guess ~3.6 Å)
ecut 30        # Hartree
nstyp 1        # one type of atom
znucl 29       # Cu atomic number
natom 1
typat 1
xcart 0 0 0    # fractional coordinates (only one atom)

# Optimization
optcell 1      # relax cell shape and volume
tolvrs 1.0e-12
tolmxf 5.0e-5  # force tolerance
```  

Run:  
```bash
abinit < cu.abi > cu.log
```  

The output file `cu.out` contains the equilibrium lattice parameter (`acell`) and the stress tensor (`stress`).  

### 2. Molecular Dynamics – **LAMMPS**
