---
id: 18
title: "Thermodynamics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every computation generates heat because transistor switching dissipates energy into the silicon lattice — not as a design flaw, but as a direct consequence of performing irreversible logical operations. The Linux kernel's thermal subsystem (`drivers/thermal/`) must respond to this in real time: reading hardware sensors, comparing temperatures against policy thresholds, and issuing cooling actions (fan ramp, frequency cap, core offline) before the hardware protects itself unilaterally. To understand what the kernel is fighting, you need to understand why heat appears, why it cannot be converted back to useful work without penalty, and what entropy measures quantitatively.

---

## Core Concepts

### Temperature

Temperature measures the average kinetic energy of random microscopic motion in a material. Two objects at the same temperature have zero net tendency to exchange energy — they are in thermal equilibrium, and no spontaneous heat flow occurs between them. The operationally important corollary: a CPU die at 90°C contains enormous internal energy, but *no work can be extracted from it* without a temperature difference to drive flow. The energy is there; the gradient is not.

### Heat, Work, and the First Law

Heat $Q$ and work $W$ are both energy in transit, but they differ in organization. Work is ordered energy transfer — it moves charge against a potential, flips a bit, spins a fan blade. Heat is disordered energy transfer driven by a temperature gradient. Once either arrives at a destination, it is indistinguishable from the internal energy already there.

The first law states that energy is conserved:

$$\Delta U = Q - W$$

For a CPU, nearly all electrical work $W$ input becomes heat $Q$ output. The "computation" done does not carry energy away — the logical result is a charge state on a capacitor, but the energy used to set it is dissipated resistively. The CPU is, thermodynamically, a resistor with a very expensive control structure.

### The Second Law and Irreversibility

The second law is a statement about probability at the microscopic level. There are astronomically more ways for energy to be spread randomly across molecular degrees of freedom than for it to be organized into unidirectional motion. Processes that increase disorder are overwhelmingly probable; their reverses are not forbidden, just fantastically unlikely. The practical consequence: friction does not spontaneously reverse, heat does not flow from cold to hot, and a hot CPU cannot cool itself by converting its own thermal vibration back into computation.

The efficiency of any heat engine operating reversibly between a hot reservoir at $T_1$ and a cold reservoir at $T_2$ (both in Kelvin) is bounded by the Carnot efficiency:

$$\eta_{\text{Carnot}} = 1 - \frac{T_2}{T_1}$$

No real engine beats this. Real engines — and CPUs viewed as reverse engines that convert work to heat — do worse, meaning they waste *more* energy than the Carnot bound requires.

### Entropy

Entropy $S$ is the accumulated ratio of reversible heat exchange to the temperature at which it occurs:

$$dS = \frac{dQ_{\text{rev}}}{T}$$

For a reversible cycle, total entropy change is zero — heat absorbed at high $T$ exactly cancels heat released at low $T$ when weighted by $1/T$. For any irreversible process (heat conducting across a finite $\Delta T$, a transistor switching, a current flowing through a resistor), entropy *increases*. The second law restated: the total entropy of an isolated system never decreases.

For an ideal gas with $N$ molecules, entropy as a function of volume $V$ and temperature $T$ is:

$$S(V, T) = Nk \left( \ln V + \frac{1}{\gamma - 1} \ln T \right) + a$$

where $k$ is Boltzmann's constant, $\gamma = C_p / C_v$ is the heat capacity ratio, and $a$ is a constant fixed by the third law ($S \to 0$ as $T \to 0$). This formula makes entropy a *state function*: it depends only on the current $(V, T)$, not on how the system got there. That is what makes it useful as a thermodynamic variable.

**Verification on an adiabat:** Along a reversible adiabatic process, $TV^{\gamma - 1} = \text{const}$ and no heat is exchanged, so $\Delta S$ must be zero. Substituting:

$$\Delta S = Nk\,\Delta\!\left(\ln V + \frac{\ln T}{\gamma - 1}\right) = Nk\,\Delta\ln\!\left(V \cdot T^{1/(\gamma-1)}\right) = 0$$

because $V \cdot T^{1/(\gamma-1)}$ is constant by the adiabatic condition. The formula is consistent.

### Dissipation in CMOS

Every CMOS gate switching charges and discharges a capacitance $C$ through a supply voltage $V_{DD}$. The energy dissipated per switching event is:

$$E_{\text{switch}} = C V_{DD}^2$$

Half is dissipated in the pull-up network charging the capacitor, half in the pull-down network discharging it — regardless of the resistance values, regardless of how slowly you switch. At clock frequency $f$ with activity factor $\alpha$ (fraction of gates switching per cycle):

$$P_{\text{dynamic}} = \alpha C V_{DD}^2 f$$

This is why voltage reduction has an outsized effect: power scales as $V_{DD}^2$. Halving the voltage cuts dynamic power by 4×. This is also why frequency scaling alone is less effective: power scales linearly with $f$, while the work done per cycle is unchanged, so energy-per-operation is constant. The kernel's cpufreq subsystem exploits the $V_{DD}^2$ lever by applying DVFS (dynamic voltage and frequency scaling) together, not just frequency scaling.

---

## How It Works

### The Carnot Bound in a Data Center Context

The Carnot argument establishes that any two reversible engines between the same temperature reservoirs must have identical efficiency — otherwise you could chain them to extract net work from a single reservoir, violating the second law. From a full cycle analysis (two isothermal legs at $T_1$, $T_2$ and two adiabatic legs), the heat and temperature ratios satisfy:

$$\frac{Q_1}{T_1} = \frac{Q_2}{T_2}$$

where $Q_1$ is heat absorbed at $T_1$ and $Q_2$ is heat rejected at $T_2$. The extractable work is:

$$W = Q_1 - Q_2 = Q_1\!\left(1 - \frac{T_2}{T_1}\right)$$

Concretely: a chip running at $T_1 = 373\,\text{K}$ (100°C) rejecting to air-conditioned air at $T_2 = 295\,\text{K}$ (22°C) has:

$$\eta_{\text{Carnot}} = 1 - \frac{295}{373} \approx 0.21$$

Twenty-one percent of the chip's heat flux *could in principle* do work — this is the theoretical ceiling for any waste-heat recovery system in that temperature range. In practice, essentially none of it is recovered; all of it loads the cooling infrastructure. The Carnot bound is not a design goal here; it is the quantitative reason waste-heat recovery from consumer hardware is economically marginal.

### Thermal Resistance and the Temperature Stack

Heat flows from die to ambient through a chain of interfaces, each with thermal resistance $\theta$ in units of °C/W. The temperature rise across each interface is:

$$\Delta T = P \cdot \theta$$

where $P$ is the power dissipated. The resistances add in series:

$$T_{\text{die}} = T_{\text{ambient}} + P \cdot (\theta_{jc} + \theta_{cs} + \theta_{sa})$$

with junction-to-case ($\theta_{jc}$), case-to-spreader ($\theta_{cs}$), and spreader-to-ambient ($\theta_{sa}$) resistances. A typical desktop CPU path:

| Interface | Typical $\theta$ (°C/W) |
|---|---|
| Die to heat spreader (IHS) | 0.1 – 0.3 |
| IHS to cooler base (TIM) | 0.05 – 0.15 |
| Cooler base to ambient air | 0.2 – 0.8 |

At $P = 100\,\text{W}$ and $\theta_{\text{total}} = 0.5\,\text{°C/W}$ with $T_{\text{ambient}} = 30\,\text{°C}$:

$$T_{\text{die}} = 30 + 100 \times 0.5 = 80\,\text{°C}$$

Increase TDP to 150W without changing the cooling path:

$$T_{\text{die}} = 30 + 150 \times 0.5 = 105\,\text{°C}$$

This exceeds the typical junction temperature limit (~100°C for most x86 CPUs). The hardware will throttle before you reach that point — the kernel's job is to intervene first, gracefully, rather than letting the hardware's emergency throttle fire abruptly.

The thermal resistance model also explains why replacing thermal interface material matters: reducing $\theta_{cs}$ from 0.3 to 0.05°C/W saves 25°C at 100W. No firmware change, no software change.

---

## Linux Connection

### The Kernel Thermal Framework

The kernel thermal subsystem (`drivers/thermal/`) implements a three-component model:

- **Thermal zones**: logical groupings of temperature sensors (CPU package, GPU, NVMe, battery). Each zone has a type, a current temperature, and a set of trip points.
- **Trip points**: temperature thresholds that trigger policy actions. Trip types include `active` (turn on a fan), `passive` (apply DVFS), `hot` (warn userspace), and `critical` (force shutdown).
- **Cooling devices**: entities the kernel can actuate — fan speeds (`cooling_device*/cur_state`), CPU frequency caps via cpufreq, core offlining.

The binding between
