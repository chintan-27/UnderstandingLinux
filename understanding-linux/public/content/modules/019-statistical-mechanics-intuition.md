---
id: 19
title: "Statistical mechanics intuition"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Core Concepts
Statistical mechanics connects the microscopic dynamics of many‑particle systems to observable macroscopic quantities by treating the microstates as equally likely (for an isolated system) or weighted by the Boltzmann factor (for a system in thermal contact with a reservoir).  

* **Microstate** – a complete specification of every particle’s position and momentum.  
* **Macrostate** – defined by a few coarse‑grained variables (energy \(E\), volume \(V\), particle number \(N\)).  
* **Postulate of equal a priori probabilities** – for an isolated system with fixed \((E,V,N)\) each accessible microstate has the same probability. This follows from Liouville’s theorem (phase‑space volume is conserved under Hamiltonian flow) and the ergodic hypothesis (time averages equal ensemble averages).  

When the system can exchange energy with a large reservoir at temperature \(T\), the probability of finding the system in a microstate of energy \(E_i\) is proportional to the number of reservoir microstates compatible with that energy. If the reservoir’s density of states \(\Omega_R(E)\) varies slowly, expanding \(\ln\Omega_R(E_{\text{tot}}-E_i)\) to first order gives  

\[
P_i \propto e^{-\beta E_i},\qquad \beta\equiv\frac{1}{k_B T}.
\]

The **partition function**  

\[
Z(\beta,V,N)=\sum_i e^{-\beta E_i}
\]

normalizes the probabilities and encodes all thermodynamic information. From \(Z\) we obtain the Helmholtz free energy  

\[
F=-k_BT\ln Z,
\]

and derivatives of \(\ln Z\) yield averages, fluctuations, and response functions.

## How It Works
### Derivation of the Canonical (Boltzmann) Distribution
Consider a small system \(S\) plus a reservoir \(R\) with total energy \(E_{\text{tot}}\). The number of joint microstates with \(S\) in state \(i\) (energy \(E_i\)) is  

\[
\Omega_{\text{tot}}(E_{\text{tot}})=\sum_i \Omega_S(E_i)\,\Omega_R(E_{\text{tot}}-E_i).
\]

Assuming \(\Omega_S(E_i)=1\) (non‑degenerate microstate) and that the reservoir is huge, expand  

\[
\ln\Omega_R(E_{\text{tot}}-E_i)=\ln\Omega_R(E_{\text{tot}})-\beta E_i+O\!\left(\frac{E_i^2}{E_{\text{tot}}^2}\right),
\]

where \(\beta = \partial\ln\Omega_R/\partial E\big|_{E_{\text{tot}}}=1/(k_BT)\). Hence  

\[
P_i=\frac{\Omega_R(E_{\text{tot}}-E_i)}{\sum_j\Omega_R(E_{\text{tot}}-E_j)}
   \propto e^{-\beta E_i}.
\]

Normalization gives  

\[
\boxed{P_i=\frac{e^{-\beta E_i}}{Z}},\qquad Z=\sum_i e^{-\beta E_i}.
\]

### From Partition Function to Thermodynamics
*Average energy*  

\[
\langle E\rangle = -\frac{\partial\ln Z}{\partial\beta}.
\]

*Energy fluctuations*  

\[
\langle(\Delta E)^2\rangle =\frac{\partial^2\ln Z}{\partial\beta^2}
                         = k_B T^2 C_V,
\]
where \(C_V=\partial\langle E\rangle/\partial T\) is the heat capacity at constant volume.

*Pressure* (for a system with volume‑dependent energies)  

\[
p = k_BT\frac{\partial\ln Z}{\partial V}.
\]

*Entropy*  

\[
S = -\left(\frac{\partial F}{\partial T}\right)_{V,N}
  = k_B(\ln Z + \beta\langle E\rangle).
\]

These relations show why knowing \(Z\) is sufficient: every macroscopic observable follows from derivatives of \(\ln Z\).

## Worked Examples
### Example 1: Two‑Level System
Let \(E_1=0\), \(E_2=\epsilon\).  

\[
Z = e^{-\beta\cdot0}+e^{-\beta\epsilon}=1+e^{-\beta\epsilon}.
\]

Probabilities  

\[
P_1=\frac{1}{Z},\qquad P_2=\frac{e^{-\beta\epsilon}}{Z}.
\]

Average energy  

\[
\langle E\rangle =0\cdot P_1+\epsilon\cdot P_2
                =\epsilon\frac{e^{-\beta\epsilon}}{1+e^{-\beta\epsilon}}
                =\frac{\epsilon}{1+e^{\beta\epsilon}}.
\]

*Numerical check*: \(\epsilon=0.1\;\text{eV}\), \(T=300\;\text{K}\) → \(\beta\epsilon = \frac{0.1\;\text{eV}}{k_B T}\approx\frac{0.1}{0.02585}\approx3.87\).  
\(P_2 = e^{-3.87}/(1+e^{-3.87})\approx0.020\), \(\langle E\rangle\approx0.002\;\text{eV}\) (≈0.3 meV), showing the high‑energy state is sparsely populated.

### Example 2: Monatomic Ideal Gas (Translational Partition Function)
For a single particle in a box of volume \(V\),

\[
Z_1 = \frac{V}{h^3}\int d^3p\,e^{-\beta p^2/(2m)}
    = V\left(\frac{2\pi m k_B T}{h^2}\right)^{3/2}.
\]

For \(N\) indistinguishable particles, the canonical partition function includes the Gibbs factor \(1/N!\):

\[
Z_N = \frac{Z_1^{\,N}}{N!}.
\]

*Average energy*  

\[
\langle E\rangle = -\frac{\partial\ln Z_N}{\partial\beta}
                 = \frac{3}{2}Nk_BT.
\]

*Pressure*  

\[
p = k_BT\frac{\partial\ln Z_N}{\partial V}
   = \frac{Nk_BT}{V},
\]
recovering the ideal‑gas law.

*Numerical example*: \(N=1\) mol, \(T=300\) K, \(V=24.5\) L (≈1 atm).  

\[
\langle E\rangle = \frac{3}{2}RT = \frac{3}{2}\times8.314\times300\;\text{J/mol}
                 \approx 3.74\;\text{kJ/mol}.
\]

### Example 3: Quantum Harmonic Oscillator
Energy levels \(E_n = \hbar\omega\left(n+\tfrac12\right)\).  

\[
Z = \sum_{n=0}^\infty e^{-\beta\hbar\omega(n+1/2)}
  = \frac{e^{-\beta\hbar\omega/2}}{1-e^{-\beta\hbar\omega}}.
\]

Average energy  

\[
\langle E\rangle = -\frac{\partial\ln Z}{\partial\beta}
                 = \frac{\hbar\omega}{2}
                   +\frac{\hbar\omega}{e^{\beta\hbar\omega}-1},
\]
the familiar zero‑point plus Planck term. At high \(T\) (\(\beta\hbar\omega\ll1\)), \(\langle E\rangle\approx k_BT\) (equipartition); at low \(T\) it approaches the zero‑point energy \(\hbar\omega/2\).

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Perspective |
|---|---|---|
| **Treating the Boltzmann factor as \(e^{-E/T}\) (omitting \(k_B\))** | \(\beta\) must have dimensions of inverse energy; dropping \(k_B\) gives a nonsensical exponent and leads to wrong temperature scaling. | Always write \(\beta = 1/(k_B T)\); keep \(k_B\) explicit or use natural units where \(k_B=1\). |
| **Ignoring particle indistinguishability and using \(Z = Z_1^N\)** | Leads to the Gibbs paradox: entropy becomes non‑extensive (depends on how you label particles). | Include the \(1/N!\) factor for classical indistinguishable particles; for quantum gases use the appropriate symmetric/antisymmetric sum (Bose‑Einstein or Fermi‑Dirac). |
| **Assuming the Maxwell distribution applies to any gas** | The Maxwell speed distribution derives from the Boltzmann factor *and* the quadratic kinetic energy; it fails for quantum degenerate gases (e.g., electrons in a metal) where Fermi‑Dirac statistics dominate. | Use the appropriate quantum statistics; recover Maxwell‑Boltzmann only when \(n\lambda_T^3\ll1\) (low phase‑space density). |
| **Confusing average energy \(\langle E\rangle\) with total energy \(E_{\text{tot}}\)** | \(\langle E\rangle\) is per‑particle (or per‑mode) average; multiplying by \(N\) gives the total only if particles are non‑interacting and identical. | For interacting systems, compute \(\langle E\rangle = -\partial\ln Z/\partial\beta\) from the full \(Z\); do not assume simple scaling. |
| **Neglecting degeneracy of energy levels** | If multiple microstates share the same \(E_i\), the Boltzmann weight must be multiplied by the degeneracy \(g_i\); otherwise probabilities don’t sum to one. | Use \(Z=\sum_i g_i e^{-\beta E_i}\) and \(P_i=g_i e^{-\beta E_i}/Z\). |

## Exercises
### Easy
1. A system has three non‑degenerate levels: \(E_0=0\), \(E_1=\Delta\), \(E_2=2\Delta\).  
   (a) Write the partition function \(Z(\beta)\).  
   (b) Find the probability of occupying the middle level at \(T\) such that \(\beta\Delta=1\).  

### Medium
2. Consider a set of \(N\) quantum harmonic oscillators with frequency \(\omega\).  
   (a) Derive the total partition function \(Z_N\).  
   (b) Obtain the heat capacity \(C_V(T)\) and show its limits: \(C_V\to Nk_B\) for \(T\gg\hbar\omega/k_B\) and \(C_V\to0\) for \(T\ll\hbar\omega/k_B\).  

### Hard
3. Derive the Sackur‑Tetrode equation for the entropy of a monatomic ideal gas starting from the translational partition function, explicitly keeping the \(1/N!\) factor and using Stirling’s approximation.  
   (a) Show that  

\[
S = Nk_B\Bigl[\ln\!\Bigl(\frac{V}{N}\Bigl(\frac{4\pi mU}{3Nh^2}\Bigr)^{3/2}\Bigr)+\frac{5}{2}\Bigr],
\]

   where \(U=\langle E\rangle\) is the internal energy.  
   (b) Evaluate \(S\) for 1 mol of argon at \(T=300\) K, \(p=1\) atm, and compare with the experimental value (~154 J mol⁻¹ K⁻¹).  

## Linux Connection
Statistical‑mechanics ideas appear throughout Linux kernel power‑ and thermal‑management subsystems. Below are concrete locations, tools, and runnable commands that illustrate the link.

### 1. CPU Frequency Scaling (`cpufreq`)
The scheduler treats the recent CPU load as a stochastic variable and updates an **exponential weighted moving average (EWMA)**:

\[
\ell_{t+1} = \alpha \ell_t + (1-\alpha) \, \text{util}_t,
\]

where \(\alpha = e^{-\Delta t/\tau}\) plays the role of a Boltzmann factor with relaxation time \(\tau\). This is mathematically identical to the canonical ensemble’s weighting of states by \(e^{-\beta E}\); the “energy” here is the instantaneous load, and \(\tau\) sets the temperature scale.

*Relevant files*  

```
/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_frequencies
```

*Example: read the current governor and available frequencies*  

```bash
# Show governor for CPU0
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor

# List available frequencies (kHz)
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_frequencies
```

*Example: switch to performance governor (requires root)*  

```bash
echo performance | sudo tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
```

### 2. Thermal Daemon (`thermald`)
`thermald` implements a simple **thermal RC model** analogous to the heat‑capacity equation  

\[
C \frac{dT}{dt} = P - \frac{T - T_{\text{amb}}}{R},
\]

where \(C\) is the thermal capacitance (J/K), \(R\) the thermal resistance (K/W), and \(P\) the instantaneous power. Solving this discrete‑time Langevin‑like equation yields a prediction of future temperature, allowing the daemon to pre‑emptively engage cooling mechanisms.

*Configuration* (XML) – typical path  

```
/etc/thermald/thermal-conf.xml
```

*Example: query current sensor temperatures*  

```bash
# Install lm-sensors if needed: sudo apt install lm-sensors
sudo sensors
```

*Example: view thermald state*  

```bash
systemctl status thermald
journalctl -u thermald -f   # follow logs in real time
```

### 3. PowerTOP – Estimating Energy per Wakeup
PowerTOP uses the relation  

\[
\langle E_{\text{wakeup}}\rangle = \sum_i p_i \, E_i,
\]

where \(p_i\) is the probability of a particular wakeup source (derived from interrupt statistics) and \(E_i\) the energy cost of handling that interrupt. This is a direct application of the Boltzmann‑weighted average over a discrete set of “wakeup states”.

*Run PowerTOP*  

```bash
sudo powertop
```

Inside the interactive view, the “Wakeups/s” column shows the probability distribution; the “Power consumption” column shows the corresponding average energy.

### 4. Cgroup v2 Memory Pressure
The kernel’s **pressure stall information (PSI)** for memory computes the fraction of time tasks are stalled due to lack of memory. The underlying model treats memory reclamation as a Poisson process with rate \(\lambda\); the probability of a stall lasting longer than \(t\) is \(e^{-\lambda t}\), again a Boltzmann‑type tail.

*Check PSI*  

```bash
cat /proc/pressure/memory
```

### 5. Example: Computing a Simple Partition Function in C
The following program evaluates the translational partition function for a single particle in a box and prints the average energy.

```c
/* partition.c – compute Z1 and <E> for an ideal gas particle */
#include <stdio.h>
#include <math.h>

int main(void) {
    const double h   = 6.62607015e-34;   /* J·s */
    const double kB  = 1.380649e-23;    /* J/K */
    const double m   = 6.6335209e-26;   /* mass of N2 molecule (kg) */
    const double V   = 24.5e-3;         /* 24.5 L -> m^3 (1 atm, 300 K) */
    const double T   = 300.0;           /* K */

    double beta = 1.0/(kB*T);
    double Z1   = V * pow(2.0*M_PI*m*kB*T, 1.5) / (h*h*h);
    double Eavg = 1.5 * kB * T;         /* analytic result */

    printf("Z1 = %.3e\n", Z1);
    printf("<E> = %.3e J (%.3f eV)\n", Eavg, Eavg/1.602176634e-19);
    return 0;
}
```

*Compile and run*  

```bash
gcc -O2 -std=c11 partition.c -o partition -lm
./partition
```

The output should match the analytic \(\langle E\rangle = \frac{3}{2}k_B T\) within floating‑point error, demonstrating how the partition function encodes macroscopic thermodynamics.

## Why This Matters
Statistical mechanics is not an abstract curiosity; it provides the **calculus of probabilities** that underlies every modern Linux subsystem that manages limited resources—energy, cycles, memory, or bandwidth. By grasping how a partition function summarizes microscopic possibilities and how its derivatives yield observable averages and fluctuations, you can:

* **Tune governors intelligently** – understand why the scheduler’s EWMA decay constant \(\tau\) behaves like a temperature, allowing you to predict frequency scaling under varying workloads.
* **Diagnose thermal throttling** – interpret `thermald` logs through the lens of the RC model, estimate thermal capacitance from sensor data, and adjust cooling policies before overheating occurs.
* **Optimize power usage** – apply the Boltzmann‑weighted average to wake‑up statistics in PowerTOP, identifying which interrupt sources dominate energy waste.
* **Capacity‑plan memory** – use the exponential stall distribution from PSI to set realistic low‑memory thresholds in cgroup v2, avoiding out‑of‑memory kills while maintaining latency targets.
* **Extend to new domains** – the same formalism applies to network traffic modeling (packet arrival as a Poisson process), GPU shader core utilization, or even container scheduling, where energy‑like cost functions replace physical energy.

In short, mastering the statistical‑mechanics toolkit lets you move from trial‑and‑error tweaking to **first‑principles reasoning** about Linux performance, power, and thermal behavior—turning observables into predictable, controllable outcomes.
