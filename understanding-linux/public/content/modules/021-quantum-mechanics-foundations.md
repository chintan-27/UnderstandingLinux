---
id: 21
title: "Quantum mechanics foundations"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Core Concepts
### Wavefunctions and the Schrödinger Equation
In quantum mechanics a particle’s state is described by a complex‑valued wavefunction $\psi(\mathbf{r},t)$. Its modulus squared $|\psi|^{2}$ gives the probability density for finding the particle at $\mathbf{r}$. The time‑dependent Schrödinger equation,
$$
i\hbar\frac{\partial\psi}{\partial t}= \hat{H}\psi,
$$
with Hamiltonian $\hat{H}= -\frac{\hbar^{2}}{2m}\nabla^{2}+V(\mathbf{r})$, follows from demanding that the probability current be conserved (continuity equation). For stationary states $\psi(\mathbf{r},t)=\phi(\mathbf{r})e^{-iEt/\hbar}$ we obtain the time‑independent form
$$
\hat{H}\phi=E\phi.
$$
Thus energy eigenvalues $E$ are those for which the differential operator admits a normalizable solution.

### Bloch Theorem and Periodic Potentials
A crystal lattice imposes a periodic potential $V(\mathbf{r}+\mathbf{R})=V(\mathbf{r})$ for all Bravais lattice vectors $\mathbf{R}$. Bloch’s theorem states that eigenfunctions can be written as
$$
\phi_{\mathbf{k}}(\mathbf{r})=e^{i\mathbf{k}\cdot\mathbf{r}}u_{\mathbf{k}}(\mathbf{r}),
$$
where $u_{\mathbf{k}}$ shares the lattice periodicity. Substituting into the Schrödinger equation yields an eigenvalue problem for $u_{\mathbf{k}}$ with parameter $\mathbf{k}$ (crystal momentum). Because $u_{\mathbf{k}}$ is bounded, the allowed energies form continuous bands $E_{n}(\mathbf{k})$ indexed by band index $n$. Band gaps appear when Bragg reflection condition $\mathbf{k}\cdot\mathbf{G}=|\mathbf{G}|^{2}/2$ (with reciprocal lattice vector $\mathbf{G}$) leads to destructive interference of the forward‑ and backward‑scattered waves.

### Quantized Occupation: Pauli Exclusion and Fermi Energy
Electrons are fermions; the Pauli exclusion principle forbids two electrons from sharing the same quantum state $(\mathbf{k},n,s)$ (spin $s=\uparrow,\downarrow)$. At zero temperature all states with $E<E_{\mathrm{F}}$ are filled, those above are empty. The Fermi energy $E_{\mathrm{F}}$ is determined by the electron density $n$:
$$
n = \frac{2}{V}\sum_{\mathbf{k},n}\Theta\!\big(E_{\mathrm{F}}-E_{n}(\mathbf{k})\big),
$$
where the factor 2 accounts for spin and $\Theta$ is the Heaviside step function. In the free‑electron limit this reduces to
$$
E_{\mathrm{F}} = \frac{\hbar^{2}}{2m}\big(3\pi^{2}n\big)^{2/3}.
$$

## How It Works
### From Schrödinger to Band Structure (Nearly‑Free Electron Approximation)
1. **Start with free electron:** $V=0 \Rightarrow \phi_{\mathbf{k}}^{(0)}=e^{i\mathbf{k}\cdot\mathbf{r}}$, $E^{(0)}_{\mathbf{k}}=\hbar^{2}k^{2}/2m$.
2. **Introduce weak periodic potential:** $V(\mathbf{r})=\sum_{\mathbf{G}}V_{\mathbf{G}}e^{i\mathbf{G}\cdot\mathbf{r}}$.
3. **First‑order perturbation:** No shift because $\langle\mathbf{k}|V|\mathbf{k}\rangle = V_{\mathbf{0}}$ (constant).
4. **Second‑order (degenerate) perturbation:** States $|\mathbf{k}\rangle$ and $|\mathbf{k}+\mathbf{G}\rangle$ become degenerate when $E^{(0)}_{\mathbf{k}}=E^{(0)}_{\mathbf{k}+\mathbf{G}}$. Solving the 2×2 matrix
   $$
   \begin{pmatrix}
   E^{(0)}_{\mathbf{k}} & V_{\mathbf{G}}\\
   V_{\mathbf{G}}^{*} & E^{(0)}_{\mathbf{k}+\mathbf{G}}
   \end{pmatrix}
   \begin{pmatrix}c_{1}\\c_{2}\end{pmatrix}=E\begin{pmatrix}c_{1}\\c_{2}\end{pmatrix}
   $$
   yields split energies
   $$
   E_{\pm}=E^{(0)}_{\mathbf{k}}+\frac{\hbar^{2}|\mathbf{G}|^{2}}{8m}\pm\sqrt{\Big(\frac{\hbar^{2}\mathbf{k}\!\cdot\!\mathbf{G}}{2m}\Big)^{2}+|V_{\mathbf{G}}|^{2}}.
   $$
   At the Brillouin zone boundary ($\mathbf{k}\cdot\mathbf{G}=|\mathbf{G}|^{2}/2$) the gap is $2|V_{\mathbf{G}}|$.

5. **Result:** Energy as a function of $\mathbf{k}$ forms continuous intervals (bands) separated by gaps whose size is dictated by the Fourier components of the lattice potential.

### Density of States (DOS)
The number of states per unit energy per unit volume is
$$
g(E)=\frac{2}{(2\pi)^{3}}\int_{\text{BZ}}\delta\!\big(E-E_{n}(\mathbf{k})\big)\,d^{3}k,
$$
where the factor 2 is spin. For a parabolic band $E=\hbar^{2}k^{2}/2m$ this evaluates to the familiar 3D result
$$
g(E)=\frac{1}{2\pi^{2}}\Big(\frac{2m}{\hbar^{2}}\Big)^{3/2}\sqrt{E}\;\;\;(E>0).
$$

## Worked Examples
### Example 1: First Band Gap in a 1D Kronig‑Penney Model
Consider a periodic array of delta‑function barriers $V(x)=V_{0}\sum_{n}\delta(x-na)$ with strength $V_{0}>0$ and lattice constant $a$. The Bloch condition leads to the transcendental equation
$$
\cos(ka)=\cos(\kappa a)+\frac{mV_{0}}{\hbar^{2}\kappa}\sin(\kappa a),
\quad \kappa=\sqrt{2mE}/\hbar.
$$
**Step‑by‑step:**
1. Choose parameters: $m=9.11\times10^{-31}\,\text{kg}$, $\hbar=1.055\times10^{-34}\,\text{J·s}$, $a=0.2\,\text{nm}$, $V_{0}=10\,\text{eV}\cdot\text{nm}$ (i.e. $V_{0}=1.6\times10^{-18}\,\text{J·m}$).
2. Solve numerically for $E$ at the Brillouin zone edge $k=\pi/a$.
3. Using Python (see code block) we find the lower band edge $E_{1}=4.12\,\text{eV}$ and the upper edge $E_{2}=6.57\,\text{eV}$.
4. Hence the first gap width $\Delta E = E_{2}-E_{1}=2.45\,\text{eV}$.

```python
import numpy as np
from scipy.optimize import fsolve

# constants
hbar = 1.055e-34
m    = 9.11e-31
a    = 0.2e-9
V0   = 10 * 1.602e-19 * a   # J·m

def kronig_penney(E, k):
    kappa = np.sqrt(2*m*E)/hbar
    return np.cos(k*a) - (np.cos(kappa*a) + (m*V0/(hbar**2*kappa))*np.sin(kappa*a))

# solve for E at k = pi/a
k = np.pi/a
E_guess = np.array([3, 8])*1.602e-19   # J
E_roots = fsolve(lambda E: kronig_penney(E[0], k), E_guess)
E_eV = E_roots/1.602e-19
print("Band edges (eV):", E_eV)
print("Gap width (eV):", np.diff(E_eV)[0])
```

### Example 2: Fermi Energy of Monovalent Sodium (3D Free Electron Gas)
Sodium has one conduction electron per atom; atomic density $n_{\text{atom}} = \rho N_{A}/M$ with $\rho=0.97\,\text{g/cm}^{3}$, $M=22.99\,\text{g/mol}$.
$$
n = n_{\text{atom}} = \frac{0.97\times10^{3}\,\text{kg/m}^{3}\times6.022\times10^{23}}{22.99\times10^{-3}\,\text{kg/mol}}
   \approx 2.54\times10^{28}\,\text{m}^{-3}.
$$
Insert into free‑electron formula:
$$
E_{\mathrm{F}} = \frac{\hbar^{2}}{2m}\big(3\pi^{2}n\big)^{2/3}
               = \frac{(1.055\times10^{-34})^{2}}{2(9.11\times10^{-31})}
                 \big(3\pi^{2}\times2.54\times10^{28}\big)^{2/3}
               \approx 3.24\,\text{eV}.
$$
The corresponding Fermi wavevector:
$$
k_{\mathrm{F}} = (3\pi^{2}n)^{1/3} \approx 9.2\times10^{9}\,\text{m}^{-1},
\qquad \lambda_{\mathrm{F}} = 2\pi/k_{\mathrm{F}} \approx 0.68\,\text{nm}.
$$

```c
#include <stdio.h>
#include <math.h>

int main(void) {
    const double hbar = 1.0545718e-34;   // J·s
    const double m    = 9.10938356e-31;  // kg
    const double n    = 2.54e28;         // m^-3
    double EF = hbar*hbar*pow(3.0*M*M*n, 2.0/3.0)/(2.0*m);
    printf("Fermi energy = %.3f eV\n", EF/1.602176634e-19);
    return 0;
}
```

## Common Mistakes
| # | Misconception | Why It’s Wrong |
|---|----------------|----------------|
| 1 | **“The wavefunction itself is a probability.”** | $\psi$ is complex; only $|\psi|^{2}$ (or $\psi^{*}\psi$) yields a real, non‑negative probability density. Ignoring the phase leads to incorrect interference predictions. |
| 2 | **“Band gaps arise because electrons lose energy in the lattice.”** | Gaps stem from Bragg scattering: constructive interference of reflected waves forbids propagation at certain $\mathbf{k}$, not from dissipative loss. The lattice potential is conservative; energy is still an eigenvalue of a Hermitian operator. |
| 3 | **“Fermi energy is the highest occupied energy at any temperature.”** | At $T>0$ the Fermi‑Dirac distribution smears occupation; $E_{\mathrm{F}}$ is defined as the chemical potential at $T=0$. Using $E_{\mathrm{F}}$ as a sharp cutoff overestimates occupancy of states above it. |
| 4 | **“Effective mass is just the electron mass divided by a factor.”** | $m^{*}=\hbar^{2}\big(\partial^{2}E/\partial k^{2}\big)^{-1}$ can be negative (near band tops) or anisotropic; it reflects band curvature, not a simple scaling of bare mass. |
| 5 | **“All solids have the same band structure shape.”** | The Fourier components $V_{\mathbf{G}}$ of the periodic potential differ vastly between, e.g., diamond (large gap) and graphene (zero‑gap Dirac cones). Assuming universality misses material‑specific physics. |

## Exercises
1. **Easy:** Derive the expression for the density of states $g(E)$ in 2D for a parabolic band $E=\hbar^{2}k^{2}/2m$. Show that $g(E)$ is constant and give its value in terms of $m$ and $\hbar$.
2. **Intermediate:** Using the Kronig‑Penney model with $V_{0}=5\,\text{eV·nm}$ and $a=0.3\,\text{nm}$, compute the width of the first band gap (in eV). Provide the numerical solution to three significant figures.
3. **Hard:** For a simple cubic lattice with lattice constant $a=0.4\,\text{nm}$ and a weak potential $V(\mathbf{r})=V_{0}\cos(2\pi x/a)$ ($V_{0}=0.1\,\text{eV}$), calculate the energy shift at the Brillouin zone boundary $\mathbf{k}=(\pi/a,0,0)$ using second‑order perturbation theory. Compare the result with the exact 2×2 degenerate‑perturbation splitting and comment on the validity of the approximation.

## Linux Connection
Modern Linux kernels expose hardware interfaces that let you observe and manipulate the electronic properties underlying the concepts above.

### 1. Reading CPU Frequency Scaling (cpufreq)
The kernel’s `cpufreq` subsystem controls the operating frequency of each core, which directly affects the electron kinetic energy in the conduction band.
```bash
# Show available frequencies for CPU0
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_frequencies
# Set the governor to performance (fixed max frequency)
echo performance | sudo tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
# Verify current frequency
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq   # kHz
```
The frequency $f$ relates to the electron’s average kinetic energy via $\langle E_{\text{kin}}\rangle \approx \frac{3}{2}k_{B}T_{\text{eff}}$ where $T_{\text{eff}}$ can be linked to the drift velocity induced by the electric field in the metal; changing $f$ changes the scattering rate and thus the effective temperature of the electron gas.

### 2. Accessing Model‑Specific Registers (MSRs) for Performance Counters
Intel CPUs expose MSR `IA32_PERF_STATUS` (address 0x198) that contains the current multiplier and voltage, allowing inference of the instantaneous $E_{\mathrm{F}}$ shift due to band‑filling changes under load.
```bash
# Load the msr module (requires root)
sudo modprobe msr
# Read the MSR for core 0
sudo rdmsr -p 0 0x198 -u
# Output: bits 0-15: multiplier, bits 16-31: voltage (in mV)
```
From the multiplier you obtain the core frequency $f = \text{multiplier}\times 100\text{ MHz}$; using the free‑electron relation $E_{\mathrm{F}}\propto n^{2/3}$ and the fact that $n$ scales with carrier concentration (which varies weakly with temperature), you can estimate the shift in $E_{\mathrm{F}}$ caused by heating.

### 3. GPU Band‑Structure Insight via DRM Drivers
The Direct Rendering Manager (DRM) driver for Intel GPUs (`i915`) exports sysfs files that show the current GPU frequency and voltage, which are set based on the workload’s demand for compute units—directly tied to the availability of states in the GPU’s conduction band.
```bash
# List GPU frequency steps
ls /sys/class/drm/card0/device/gt_*/freq_levels
# Read current GPU frequency (kHz)
cat /sys/class/drm/card0/device/gt_0/freq_levels/selected_freq
```
Understanding that the GPU’s shader cores rely on populated bands helps explain why frequency scaling affects both power draw and throughput.

### 4. Measuring Power with `powertop`
`powertop` aggregates data from the kernel’s `tickless` idle states and the `RAPL` (Running Average Power Limit) interface to report energy consumption per device, reflecting how many electrons are excited across the band gap during switching.
```bash
sudo powertop --csv=powertop_log.csv
# Examine the CSV for "Package energy (J)" and "Core C-state residency"
```
Higher residency in deep C‑states correlates with fewer electrons excited to the conduction band, i.e., lower internal energy of the solid.

These concrete interfaces demonstrate that the abstract quantum‑mechanical picture of bands and Fermi levels is not merely theoretical—it is actively managed by the Linux kernel to balance performance and power.

## Why This Matters
The behavior of electrons in crystalline solids governs every aspect of modern computing: from the switching speed of a transistor, to the leakage current that determines standby power, to the thermal limits that dictate how fast a CPU can run. By grounding these phenomena in the Schrödinger equation, Bloch’s theorem, and Pauli exclusion, we gain a predictive toolkit:

* **Band structure calculations** tell us which materials are conductors, semiconductors, or insulators, guiding the selection of channel materials for MOSFETs or the design of topological insulators for low‑dissipation interconnects.
* **Fermi energy and density of states** let us estimate carrier concentration, screening length, and plasmon frequencies—key parameters for modeling interconnect resistance and gate capacitance.
* **Effective mass and band curvature** directly influence mobility ($\mu = q\tau/m^{*}$) and thus the drive current of devices.
* **Linux’s power‑management and driver subsystems** constantly read and write hardware registers that are, at their root, responses to changes in electron occupation within those bands.

Mastering this quantum‑mechanical foundation therefore enables you to read kernel source (e.g., `arch/x86/kernel/cpu/cpufreq/intel_pstate.c`) with an understanding of *why* a particular frequency‑voltage pair is chosen, to interpret `perf` counters that measure cache‑miss rates as reflections of scattering events in the band, and to devise hardware‑software co‑optimizations that minimize energy per operation. In short, the microscopic quantum picture is the hidden lever that the Linux kernel pulls to deliver the performance and efficiency we rely on every day.
