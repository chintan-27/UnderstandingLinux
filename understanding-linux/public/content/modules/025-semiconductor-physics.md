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

## Core Concepts
### Intrinsic vs. Extrinsic Semiconductors
An intrinsic semiconductor is a pure crystal with no intentional impurities. At thermal equilibrium, electrons are excited across the band gap \(E_g\) creating equal concentrations of electrons (\(n\)) and holes (\(p\)):
\[
n = p = n_i = \sqrt{N_c N_v}\,e^{-E_g/(2kT)},
\]
where \(N_c\) and \(N_v\) are the effective density of states in the conduction and valence bands, \(k\) is Boltzmann’s constant, and \(T\) is absolute temperature. The product \(np=n_i^2\) is the **mass‑action law** and holds for both intrinsic and doped material.

Adding impurities (doping) breaks this symmetry. Donor atoms (e.g., P in Si) contribute extra electrons that are loosely bound; at room temperature they are ionized, raising the electron concentration \(n \approx N_D\) (donor density) while the hole concentration falls to \(p \approx n_i^2/N_D\). Acceptors (e.g., B in Si) capture electrons, creating mobile holes: \(p \approx N_A\), \(n \approx n_i^2/N_A\). The Fermi level \(E_F\) shifts toward the band that gains carriers:
\[
E_F = E_i + kT\ln\!\left(\frac{n}{n_i}\right) = E_i - kT\ln\!\left(\frac{p}{n_i}\right),
\]
where \(E_i\) is the intrinsic Fermi level (mid‑gap for symmetric bands). This shift explains why doped material conducts preferentially via the majority carrier.

### Drift and Diffusion from First Principles
When an electric field \(\mathbf{E}= -\nabla\phi\) acts on carriers, each experiences a force \(q\mathbf{E}\) ( \(q = +|e|\) for holes, \(-|e|\) for electrons). Between scattering events the carrier gains momentum, giving an average drift velocity
\[
\mathbf{v}_d = \mu \mathbf{E},
\]
where mobility \(\mu = q\tau/m^*\) (\(\tau\) mean free time, \(m^*\) effective mass). The drift current density is therefore
\[
\mathbf{J}_{\text{drift}} = q n \mu_n \mathbf{E} \quad\text{(electrons)},
\qquad
\mathbf{J}_{\text{drift}} = q p \mu_p \mathbf{E} \quad\text{(holes)}.
\]

If the carrier concentration varies in space, random thermal motion causes a net flux from high to low concentration. Using Fick’s law and the Einstein relation \(D = \mu kT/q\), the diffusion current density is
\[
\mathbf{J}_{\text{diff}} = q D_n \nabla n \quad\text{(electrons)},
\qquad
\mathbf{J}_{\text{diff}} = - q D_p \nabla p \quad\text{(holes)}.
\]
Note the minus sign for holes because they are positive charges moving down the concentration gradient.

Combining both mechanisms gives the **drift‑diffusion equations**:
\[
\boxed{\mathbf{J}_n = q\mu_n n \mathbf{E} + q D_n \nabla n},
\qquad
\boxed{\mathbf{J}_p = q\mu_p p \mathbf{E} - q D_p \nabla p}.
\]

### Formation of a p‑n Junction and the Depletion Region
When p‑ and n‑type regions are brought into contact, electrons diffuse from the n‑side to the p‑side and holes diffuse opposite. This leaves behind uncovered donor ions (\(+q\)) on the n‑side and acceptor ions (\(-q\)) on the p‑side, creating a space‑charge region. The built‑in electric field \(\mathbf{E}\) that arises opposes further diffusion until drift and diffusion currents balance.

Assuming an abrupt junction and depletion approximation (no free carriers inside the space‑charge region), Poisson’s equation in one dimension reads
\[
\frac{d^2V}{dx^2}= -\frac{\rho(x)}{\varepsilon},
\]
with \(\rho = qN_D\) for \(0<x<x_n\) (n‑side) and \(\rho = -qN_A\) for \(-x_p<x<0\) (p‑side). Integrating twice and applying continuity of \(V\) and \(\mathbf{E}= -dV/dx\) at the metallurgical junction yields the depletion widths
\[
x_n = \sqrt{\frac{2\varepsilon V_{bi}}{q}\frac{N_A}{N_D(N_A+N_D)}},
\qquad
x_p = \sqrt{\frac{2\varepsilon V_{bi}}{q}\frac{N_D}{N_A(N_A+N_D)}},
\]
so the total width
\[
\boxed{W = x_n + x_p = \sqrt{\frac{2\varepsilon}{q}\left(\frac{N_A+N_D}{N_A N_D}\right)V_{bi}}}.
\]

The built‑in potential follows from equating the Fermi levels on both sides before contact:
\[
V_{bi} = \frac{kT}{q}\ln\!\left(\frac{N_A N_D}{n_i^2}\right).
\]

### Diode Equation (Shockley)
Under forward bias the applied voltage reduces the barrier, allowing minority carriers to diffuse across the junction. Solving the steady‑state diffusion equation for excess minority carriers in the quasi‑neutral regions gives the saturation current
\[
I_s = qA\!\left(\frac{D_n p_{n0}}{L_n} + \frac{D_p n_{p0}}{L_p}\right),
\]
where \(A\) is the junction area, \(L_{n,p}=\sqrt{D_{n,p}\tau_{n,p}}\) diffusion lengths, and \(n_{p0}=n_i^2/N_A\), \(p_{n0}=n_i^2/N_D\) are equilibrium minority concentrations. The resulting current‑voltage relation is
\[
\boxed{I = I_s\!\left(e^{V/(nkT/q)}-1\right)},
\]
with ideality factor \(n\approx1\) for an ideal diode; recombination in the depletion region raises \(n\) toward 2.

---

## How It Works
### Energy Bands and Carrier Statistics
The periodic crystal potential leads to allowed energy bands separated by gaps. Near the band edges the dispersion can be approximated as parabolic:
\[
E_c(\mathbf{k}) = E_c + \frac{\hbar^2k^2}{2m_n^*},\qquad
E_v(\mathbf{k}) = E_v - \frac{\hbar^2k^2}{2m_p^*}.
\]
The density of states per unit volume is
\[
g_c(E)=\frac{1}{2\pi^2}\left(\frac{2m_n^*}{\hbar^2}\right)^{3/2}\!\sqrt{E-E_c},\quad
g_v(E)=\frac{1}{2\pi^2}\left(\frac{2m_p^*}{\hbar^2}\right)^{3/2}\!\sqrt{E_v-E}.
\]
Integrating the product of \(g(E)\) with the Fermi‑Dirac distribution
\[
f(E)=\frac{1}{1+e^{(E-E_F)/kT}}
\]
yields the electron and hole concentrations:
\[
n = \int_{E_c}^{\infty} g_c(E)f(E)dE,\qquad
p = \int_{-\infty}^{E_v} g_v(E)[1-f(E)]dE.
\]
For non‑degenerate semiconductors (\(|E_F-E_{c,v}|\gg kT\)) the Fermi‑Dirac integral simplifies to the Boltzmann approximation, giving the expressions used in the Core Concepts section.

### Derivation of the Drift‑Diffusion Equation from the Boltzmann Transport Equation
Starting from the Boltzmann equation in the relaxation‑time approximation:
\[
\frac{\partial f}{\partial t} + \mathbf{v}\cdot\nabla_{\mathbf{r}}f + \frac{q\mathbf{E}}{\hbar}\cdot\nabla_{\mathbf{k}}f = -\frac{f-f_0}{\tau},
\]
where \(f_0\) is the equilibrium distribution. Taking the first moment (multiply by \(q\mathbf{v}\) and integrate over \(\mathbf{k}\)) yields the continuity equation for each carrier type:
\[
\frac{\partial n}{\partial t} = -\frac{1}{q}\nabla\!\cdot\!\mathbf{J}_n + G_n - R_n,
\]
with the current density identified as
\[
\mathbf{J}_n = q\mu_n n\mathbf{E} + qD_n\nabla n,
\]
where we used the identities
\[
\langle\mathbf{v}\rangle = \mu_n\mathbf{E},\qquad
\langle\mathbf{v}\delta f\rangle = -D_n\nabla n.
\]
An analogous derivation holds for holes. This microscopic justification shows that the drift term originates from the systematic acceleration by \(\mathbf{E}\), while the diffusion term comes from the gradient of the non‑equilibrium part of \(f\).

### Poisson Equation and Electrostatics of the Depletion Region
The space‑charge density \(\rho(x)\) in the depletion approximation is piecewise constant, leading to a linear electric field:
\[
\mathcal{E}(x) = 
\begin{cases}
\displaystyle \frac{qN_D}{\varepsilon}(x-x_n), & 0<x<x_n\\[6pt]
\displaystyle -\frac{qN_A}{\varepsilon}(x+x_p), & -x_p<x<0\\[6pt]
0, & |x|>x_{n,p}.
\end{cases}
\]
Integrating \(\mathcal{E} = -dV/dx\) gives a quadratic potential variation, whose maximum at the junction is the built‑in voltage \(V_{bi}\). The total voltage across the junction under an external bias \(V_R\) (reverse bias positive) is \(V_{bi}+V_R\), which simply replaces \(V_{bi}\) in the depletion width formula:
\[
W(V_R) = \sqrt{\frac{2\varepsilon}{q}\left(\frac{N_A+N_D}{N_A N_D}\right)(V_{bi}+V_R)}.
\]

---

## Worked Examples
### Example 1: Depletion Width of an Abrupt Si p‑n Junction
**Given** (room temperature \(T=300\text{ K}\)):
- \(N_A = 1\times10^{15}\ \text{cm}^{-3}\) (p‑side)
- \(N_D = 1\times10^{16}\ \text{cm}^{-3}\) (n‑side)
- Relative permittivity of Si \(\varepsilon_r = 11.7\)
- \(\varepsilon_0 = 8.854\times10^{-14}\ \text{F/cm}\)
- Elementary charge \(q = 1.602\times10^{-19}\ \text{C}\)
- Intrinsic concentration of Si \(n_i = 1.0\times10^{10}\ \text{cm}^{-3}\)

**Step 1 – Built‑in potential**  
\[
V_{bi} = \frac{kT}{q}\ln\!\left(\frac{N_A N_D}{n_i^2}\right)
= \frac{0.02585\text{ V}}{1}\ln\!\left(\frac{(1\times10^{15})(1\times10^{16})}{(1\times10^{10})^2}\right)
= 0.02585\ln(1\times10^{21}) \approx 0.02585\times48.35 \approx 1.25\text{ V}.
\]

**Step 2 – Permittivity**  
\[
\varepsilon = \varepsilon_r\varepsilon_0 = 11.7\times8.854\times10^{-14}
= 1.036\times10^{-12}\ \text{F/cm}.
\]

**Step 3 – Depletion width (zero bias)**  
\[
W = \sqrt{\frac{2\varepsilon}{q}\left(\frac{N_A+N_D}{N_A N_D}\right)V_{bi}}
= \sqrt{\frac{2(1.036\times10^{-12})}{1.602\times10^{-19}}
\left(\frac{1\times10^{15}+1\times10^{16}}{(1\times10^{15})(1\times10^{16})}\right)(1.25)}.
\]
Compute the factor:
\[
\frac{2\varepsilon}{q}= \frac{2.072\times10^{-12}}{1.602\times10^{-19}}
=1.293\times10^{7}\ \text{V}^{-1}\text{cm}^{-1}.
\]
\[
\frac{N_A+N_D}{N_A N_D}= \frac{1.1\times10^{16}}{1\times10^{31}} =1.1\times10^{-15}\ \text{cm}^{3}.
\]
Multiply:
\[
1.293\times10^{7}\times1.1\times10^{-15}\times1.25
= 1.777\times10^{-8}\ \text{cm}^{2}.
\]
\[
W = \sqrt{1.777\times10^{-8}}\ \text{cm}=1.33\times10^{-4}\ \text{cm}=1.33\ \mu\text{m}.
\]

**Result** – The depletion region extends approximately **1.3 µm** into the silicon, with about 90 % on the lightly doped p‑side (\(x_p\approx1.2\ \mu\text{m}\), \(x_n\approx0.13\ \mu\text{m}\)).

---

### Example 2: Forward Current of a Si p‑n Diode
**Given** (same diode as above, junction area \(A = 1\times10^{-4}\ \text{cm}^2\)):
- Electron diffusion coefficient \(D_n = 25\ \text{cm}^2/\text{s}\)
- Hole diffusion coefficient \(D_p = 10\ \text{cm}^2/\text{s}
- Electron lifetime \(\tau_n = 1\ \mu\text{s}\) → \(L_n = \sqrt{D_n\tau_n}= \sqrt{25\times10^{-6}}=5\times10^{-3}\ \text{cm}=50\ \mu\text{m}\)
- Hole lifetime \(\tau_p = 0.5\ \mu\text{s}\) → \(L_p = \sqrt{10\times0.5\times10^{-6}}=2.24\times10^{-3}\ \text{cm}=22.4\ \mu\text{m}\)

**Step 1 – Equilibrium minority concentrations**
\[
n_{p0}= \frac{n_i^2}{N_A}= \frac{(1\times10^{10})^2}{1\times10^{15}}=1\times10^{5}\ \text{cm}^{-3},
\]
\[
p_{n0}= \frac{n_i^2}{N_D}= \frac{(1\times10^{10})^2}{1\times10^{16}}=1\times10^{4}\ \text{cm}^{-3}.
\]

**Step 2 – Saturation current**
\[
I_s = qA\!\left(\frac{D_n p_{n0}}{L_n} + \frac{D_p n_{p0}}{L_p}\right).
\]
First term:
\[
\frac{D_n p_{n0}}{L_n}= \frac{25\times1\times10^{4}}{5\times10^{-3}}
= \frac{2.5\times10^{5}}{5\times10^{-3}}=5.0\times10^{7}\ \text{cm}^{-2}\!\text{s}^{-1}.
\]
Second term:
\[
\frac{D_p n_{p0}}{L_p}= \frac{10\times1\times10^{5}}{2.24\times10^{-3}}
= \frac{1.0\times10^{6}}{2.24\times10^{-3}}=4.46\times10^{8}\ \text{cm}^{-2}\!\text{s}^{-1}.
\]
Sum ≈ \(4.96\times10^{8}\ \text{cm}^{-2}\!\text{s}^{-1}\).

Now
\[
I_s = (1.602\times10^{-19}\ \text{C})(1\times10^{-4}\ \text{cm}^2)(4.96\times10^{8})
= 7.95\times10^{-15}\ \text{A}\approx 8\ \text{fA}.
\]

**Step 3 – Forward current at \(V=0.6\text{ V}\)**
Thermal voltage \(V_T = kT/q = 0.02585\ \text{V}\). Assuming an ideality factor \(n=1\):
\[
I = I_s\!\left(e^{V/V_T}-1\right)
= 8\times10^{-15}\!\left(e^{0.6/0.02585}-1\right)
\approx 8\times10^{-15}\!\left(e^{23.2}-1\right)
\approx 8\times10^{-15}\times1.2\times10^{10}
\approx 9.6\times10^{-5}\ \text{A}=96\ \mu\text{A}.
\]

**Result** – With the chosen parameters the diode conducts roughly **100 µA** at 0.6 V forward bias. (If a larger area or higher doping were used, the current would scale accordingly.)

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Understanding |
|---|---------|----------------|-----------------------|
| 1 | **Assuming drift and diffusion currents always add** (same sign) | Electrons are negative; drift current \(J_n = q\mu_n nE\) points opposite to the electric field, while diffusion \(J_n = qD_n\nabla n\) points down the concentration gradient. In a p‑n junction under equilibrium the two cancel exactly. | Write the full drift‑diffusion expression and evaluate signs for each region; remember that \(q\) carries the carrier sign. |
| 2 | **Treating mobility as a constant independent of doping** | Ionized impurity scattering increases with dopant concentration, reducing \(\mu\). At \(N_D > 10^{18}\text{ cm}^{-3}\) electron mobility in Si can drop below 100 cm²/V·s. | Use empirical models (e.g., Caughey‑Thomas) or consult mobility vs. doping charts when calculating currents or resistances. |
| 3 | **Neglecting recombination in the depletion region** (assuming ideal diode equation holds for all bias) | Under high forward bias or in wide‑gap materials, Shockley‑Read‑Hall (SRH) recombination inside the space‑charge region becomes significant, raising the ideality factor to \(n\approx2\). | Include an SRH term \(U_{SRH}\) in the continuity equation or use the diode equation with \(n=2\) when appropriate. |
| 4 | **Using the low‑level injection approximation when the injected carrier density approaches the doping density** | When \(\Delta n \approx N_D\) (or \(\Delta p \approx N_A\)), the majority carrier concentration is no longer essentially constant, invalidating simple linear diffusion solutions. | Solve the full ambipolar diffusion equation or perform numerical simulation for high‑level injection. |
| 5 | **Assuming the thermal voltage \(V_T\) is always 25 mV** | \(V_T = kT/q\) varies linearly with temperature; at 400 K it is ≈34 mV, affecting exponential terms in the diode equation. | Keep \(V_T\) as a variable or compute it from the actual temperature in any calculation. |

---

## Exercises
### Easy
1. **Intrinsic concentration** – Calculate \(n_i\) for germanium at 300 K given \(E_g=0.66\text{ eV}\), \(m_n^*=0.55m_0\), \(m_p^*=0.37m_0\). Use \(N_c = 2\left(\frac{2\pi m_n^* kT}{h^2}\right)^{3/2}\) and similarly for \(N_v\).  
2. **Mobility from scattering** – If the mean free time for electrons in Si is \(\tau = 0.1\ \text{ps}\) and \(m_n^* = 0.26m_0\), compute the mobility \(\mu_n\).

### Medium
3. **Built‑in potential** – Derive the expression for \(V_{bi}\) starting from the condition \(E_{F_n}=E_{F_p}\) after junction formation, showing each algebraic step.  
4. **Depletion width vs. reverse bias** – For a Si junction with \(N_A=5\times10^{15}\text{ cm}^{-3}\), \(N_D=5\times10^{16}\text{ cm}^{-3}\), plot \(W(V_R)\) for \(V_R = 0\) to \(20\text{ V}\). (You may use Python or MATLAB; include the code.)

### Hard
5. **Extracting ideality factor** – Measure the forward I‑V curve of a diode (you can use a simple bench setup). Fit the data to \(I = I_s(e^{V/(nV_T)}-1)\) to obtain \(n\) and \(I_s\). Discuss what a value \(n>1\) reveals about recombination mechanisms.  
6. **Mini kernel module** – Write a loadable kernel module that maps a PCI BAR of a dummy device (e.g., using `pci_get_device`) with `ioremap`, reads a 32‑bit register, and prints its value via `pr_info`. Provide the Makefile and insertion/removal commands.

---

## Linux Connection
Semiconductor physics appears everywhere in the Linux kernel, from low‑level device drivers to performance‑critical subsystems. Below are concrete ways to observe and interact with semiconductor‑derived concepts.

### 1. Inspecting Hardware Exposed by Semiconductor Devices
```bash
# List all PCI devices and their kernel drivers
lspci -nnk | grep -E 'VGA|3D|Audio|Ethernet' -A2

# Example output (truncated):
# 00:02.0 VGA compatible controller [0300]: Intel Corporation UHD Graphics 630 [8086:5912] (rev 02)
#     Subsystem: Lenovo Device [17aa:225e]
#     Kernel driver in use: i915
#     Kernel modules: i915
```
The `i915` driver is the DRM (Direct Rendering Module) driver for Intel
