---
id: 27
title: "Reliability physics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every piece of hardware your Linux system runs on is consuming itself. Electrons moving through copper traces physically displace atoms. Electric fields across 2 nm oxide layers occasionally punch through permanently. Temperature swings crack solder joints through metal fatigue. These are not manufacturing defects — they are irreversible thermodynamic processes with quantifiable rates. Without understanding them, you cannot interpret `/var/log/mcelog`, reason about why ECC scrubbing exists, understand why `thermald` is not optional on laptops, or explain why the kernel treats machine check exceptions as first-class events rather than OS bugs. The kernel's reliability infrastructure exists because physics guarantees failure; the only engineering question is whether software catches it gracefully.

---

## Core Concepts

### Electromigration

Current through a metal conductor means electrons colliding with metal lattice atoms and transferring momentum. At high current density, this momentum transfer is large enough to physically displace atoms — **electromigration**. Atoms pile up downstream of electron flow (forming hillocks that can short-circuit adjacent traces) and deplete upstream (forming voids that eventually open-circuit the trace). The failure mode is directional and cumulative: every coulomb of charge contributes.

Mean time to failure from electromigration follows **Black's equation**:

$$\text{MTTF} = A \cdot J^{-n} \cdot \exp\!\left(\frac{E_a}{k_B T}\right)$$

where $J$ is current density (A/m²), $T$ is temperature in Kelvin, $E_a$ is the activation energy for atomic migration ($\approx 0.7\text{ eV}$ for Al, $\approx 0.9\text{ eV}$ for Cu), $k_B = 8.617 \times 10^{-5}\text{ eV/K}$, $n \approx 2$ for aluminum, and $A$ encodes geometry and material constants.

The $J^{-n}$ term explains why shrinking process nodes are so sensitive to electromigration: halving interconnect width while holding current constant quadruples current density ($J = I/A$), which reduces MTTF by $2^n = 4\times$ on the current-density term alone, before temperature effects compound it.

Why does temperature appear as $\exp(E_a / k_B T)$? Atomic migration requires surmounting an energy barrier $E_a$. The fraction of atoms with thermal energy exceeding that barrier is proportional to $\exp(-E_a / k_B T)$ — the Boltzmann factor. Higher $T$ means more atoms already near the barrier, so each electron-wind nudge displaces more of them. MTTF is inversely proportional to migration rate, hence the positive exponent.

### Dielectric Breakdown

A MOSFET's gate electrode is separated from the channel by silicon dioxide — 1–5 nm thick in modern nodes. Applying 1 V across 2 nm produces a field of $5 \times 10^8\text{ V/m}$. At these field strengths, conduction-band electrons gain enough energy between scattering events to ionize oxide atoms, creating **trap states** — localized energy levels inside the bandgap where charge can be captured. Each switching event has a nonzero probability of creating a new trap. When enough traps align spatially between gate and substrate, a conductive filament forms and the oxide fails permanently: **time-dependent dielectric breakdown (TDDB)**.

This is why TDDB is stochastic but cumulative. The failure probability grows with both time and switching frequency — a transistor running at 5 GHz accumulates trap states faster than one at 3 GHz under identical voltage. It follows a Weibull distribution (see below) because failure requires a sufficient density of randomly located events to align.

Overvoltage directly accelerates TDDB. The Fowler-Nordheim tunneling current density through the oxide scales as:

$$J_{FN} \propto E^2 \exp\!\left(-\frac{B}{E}\right)$$

where $E$ is the oxide field and $B$ is a material constant. A 10% increase in supply voltage roughly doubles $J_{FN}$, accelerating trap generation proportionally. This is the physical reason overvolting CPUs for overclocking is a one-way transaction: you are spending oxide lifetime at an accelerated rate.

### Thermal Cycling

Silicon ($\text{CTE} \approx 2.6\text{ ppm/K}$), copper ($\approx 17\text{ ppm/K}$), FR4 PCB substrate ($\approx 14$–$17\text{ ppm/K}$ in-plane), and solder ($\approx 21\text{ ppm/K}$) expand at different rates. Every power cycle is a mechanical stress cycle: joints are strained as the package heats, relaxed as it cools. The mismatch strain at a solder joint is:

$$\Delta \varepsilon = (\alpha_1 - \alpha_2)\,\Delta T$$

where $\alpha_i$ are CTEs and $\Delta T$ is the temperature swing. Repeated strain causes fatigue crack nucleation and propagation — the same mechanism that breaks a paperclip bent repeatedly. Cycles to failure scale as:

$$N_f \propto (\Delta \varepsilon)^{-\beta} \propto (\Delta T)^{-\beta}$$

with $\beta \approx 2$–$4$. Doubling $\Delta T$ reduces joint lifetime by $4$–$16\times$. This is why thermal design cares about *cycling amplitude*, not just peak temperature. A server that idles at 30°C and peaks at 80°C (50°C swing) is harder on solder joints than one that runs continuously at 75°C with a 5°C swing.

### Hot Carrier Injection

At high lateral electric fields near the drain of a MOSFET (most severe at short gate lengths and high $V_{DS}$), carriers accelerate to energies well above the thermal equilibrium value — they become "hot." A fraction of these hot carriers have enough energy ($> 3.2\text{ eV}$ above the Si/SiO₂ barrier) to inject into the gate oxide and become trapped there, or to generate interface trap states at the Si/SiO₂ boundary. Both effects shift the transistor's threshold voltage $V_{th}$ over time.

The circuit-level consequence: a transistor that originally switched reliably at $V_{DD}$ may require $V_{DD} + \Delta V_{th}$ after years of HCI degradation. Timing margins that were designed in at tape-out no longer hold. The chip does not fail catastrophically — it fails intermittently under timing stress, producing soft errors that look like random bit flips or crashes before the root cause is identified.

### Failure Rate Distributions

Failures cluster at specific life phases. The **bathtub curve** names three regimes:

1. **Infant mortality:** elevated failure rate immediately after manufacture, caused by latent defects — oxide pinholes, electromigration-weak voids already close to critical size, marginal solder joints. Rate decreases as the weak population fails out.
2. **Useful life:** roughly constant failure rate. Failures here are random, not cumulative-damage events — stray alpha particles, cosmic rays, voltage transients.
3. **Wear-out:** increasing failure rate as TDDB trap counts, electromigration void sizes, and fatigue crack lengths approach critical thresholds simultaneously across the population.

The **Weibull distribution** models all three regimes through a single shape parameter. The hazard function (instantaneous failure rate) is:

$$\lambda(t) = \frac{\beta}{\eta} \left(\frac{t}{\eta}\right)^{\beta - 1}$$

where $\eta$ is the characteristic life (the time by which $1 - e^{-1} \approx 63.2\%$ of units have failed) and $\beta$ is the shape parameter:

| $\beta$ | Regime | Failure rate |
|---|---|---|
| $< 1$ | Infant mortality | Decreasing |
| $= 1$ | Random failures | Constant (exponential distribution) |
| $> 1$ | Wear-out | Increasing |

The reliability function (probability of surviving to time $t$) is:

$$R(t) = \exp\!\left[-\left(\frac{t}{\eta}\right)^\beta\right]$$

---

## How It Works

### The Boltzmann Factor as a Universal Accelerator

Every thermally activated degradation process — atom migration, oxide trap creation, corrosion, diffusion — has a rate determined by how often thermal fluctuations supply enough energy to surmount an activation barrier $E_a$:

$$\text{rate} \propto \exp\!\left(-\frac{E_a}{k_B T}\right)$$

At $T = 300\text{ K}$, $k_B T \approx 0.026\text{ eV}$. For copper electromigration with $E_a = 0.9\text{ eV}$:

$$\exp\!\left(-\frac{0.9}{0.026}\right) = e^{-34.6} \approx 1.1 \times 10^{-15}$$

At $T = 330\text{ K}$ (30°C warmer):

$$\exp\!\left(-\frac{0.9}{0.028}\right) = e^{-32.1} \approx 1.1 \times 10^{-14}$$

The migration rate increases by $10\times$ from a 30°C temperature rise, because the exponent is sensitive to $1/T$ — each degree matters more at lower absolute temperatures than at higher ones. At $T = 300\text{ K}$, $\partial/\partial T\,[k_BT]^{-1} = -k_B / (k_B T)^2$ is larger in magnitude than at $T = 350\text{ K}$, which is why consumer electronics running cool are disproportionately rewarded.

### Acceleration Factor and Accelerated Life Testing

Manufacturers cannot wait years to validate a component's 10-year lifetime. They run **accelerated life tests (ALT)** at elevated temperature and infer use-condition lifetime through the **Arrhenius acceleration factor**:

$$AF = \
