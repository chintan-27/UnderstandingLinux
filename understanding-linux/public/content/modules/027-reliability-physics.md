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

Every Linux system you administer is undergoing irreversible physical degradation right now. Electrons are displacing copper atoms in CPU interconnects. Electric fields are punching charge traps into gate oxides measured in nanometers. Thermal expansion cycles are shearing solder joints. These are not metaphors — they are specific, quantified physical processes with known rate equations. When they complete, you get a kernel panic, a silent bit-flip, or a drive that stops responding mid-write.

Understanding the underlying physics tells you *why* hardware has rated lifetimes, why data centers run reduced voltage and cooler intake temperatures, why ECC memory exists, and why tools like `smartctl`, `mcelog`, and the kernel's EDAC subsystem are early-warning instruments for processes already in motion — not post-mortem diagnostics.

---

## Core Concepts

### Electromigration

Current flow through a metal conductor is not passive. Electrons carry momentum, and at every collision with a metal ion in the lattice, some of that momentum transfers. At the current densities present in nanometer-scale CPU interconnects, this cumulative transfer physically displaces ions — material piles up downstream (a hillock) and a void opens upstream. The void eventually severs the conductor; the hillock can bridge to an adjacent wire.

The critical quantity is **current density** $J$ (A/m²), not total current. If you halve a wire's cross-sectional area to fit more interconnects into the same die area, you quadruple $J$ for the same current, because $J = I / A_{cross}$. This is why electromigration became a hard constraint as geometries shrank below a micron: the same logic currents, flowing through geometrically smaller conductors, produce catastrophically higher current densities.

Mean time to failure follows **Black's equation**:

$$\text{MTTF} = \frac{A}{J^n} \cdot e^{Q / k_B T}$$

- $A$: material and geometry constant (absorbed into empirical fits)
- $J$: current density (A/m²)
- $n$: empirical exponent, typically 1–2 for aluminum, closer to 1 for copper
- $Q$: activation energy for ion migration (eV) — for copper, roughly 0.9–1.0 eV in bulk, lower at grain boundaries
- $k_B = 8.617 \times 10^{-5}\ \text{eV/K}$
- $T$: absolute temperature (K)

Two structural observations. First, the $J^n$ dependence is superlinear: doubling current density reduces MTTF by a factor of $2^n$. At $n=2$, that is a 4× reduction. Second, temperature enters through the same Boltzmann exponential that governs every thermally-activated process — the probability that an ion has sufficient thermal energy to hop over the migration barrier scales as $e^{-Q/k_BT}$. A 20°C increase in junction temperature can cut electromigration MTTF by more than half, depending on $Q$.

Modern CPUs manage this by limiting sustained current draw during power virus workloads (distinct from the transient current limits), and by the EDA tools calculating current density on every metal layer during sign-off — a chip does not tape out if any wire exceeds its electromigration budget.

### Dielectric Breakdown (TDDB)

A MOSFET gate oxide is an insulator measured in atom-layers of thickness, typically 1–2 nm in modern processes. Its function is to transmit an electric field to the channel without conducting current. The problem is quantum mechanics: at these thicknesses, carriers can tunnel through the oxide, and each tunneling event has a probability of leaving a **charge trap** — a broken bond or interstitial ion that captures charge. Traps accumulate. When their density reaches a critical threshold, they form a percolation path — a connected chain from gate to channel — and the oxide becomes permanently conductive. This is **time-dependent dielectric breakdown (TDDB)**.

The field driving trap generation is:

$$E_{ox} = V_{gate} / t_{ox}$$

where $t_{ox}$ is oxide thickness. As geometries shrink, $t_{ox}$ shrinks, but the threshold voltage for turning on the transistor cannot scale proportionally (it is bounded by thermal noise, $k_BT/q$). This is why supply voltages have dropped monotonically — from 5 V to 3.3 V to 1.8 V to sub-1 V across process generations — not to save power as a primary goal, but to keep $E_{ox}$ below the threshold where trap generation rates become unacceptable. Saving power is a consequence, not the cause.

TDDB lifetime follows a power-law model in field:

$$\text{MTTF}_{TDDB} \propto E_{ox}^{-n} \cdot e^{E_a / k_B T}$$

with $n$ typically in the range 30–50 for SiO₂ (the steep dependence is why a 5% overvoltage can produce a dramatic reliability hit). High-κ dielectrics like HfO₂ have different $n$ values and their own trap physics, which is one reason the industry transition to high-κ/metal-gate required extensive new reliability characterization.

### Thermal Cycling

An integrated circuit package is a laminate of materials with mismatched **coefficients of thermal expansion (CTE)**:

| Material | CTE (ppm/°C) |
|---|---|
| Silicon die | ~2.6 |
| Copper interconnect | ~17 |
| FR4 PCB substrate | ~14–17 (in-plane) |
| SnAgCu solder | ~21 |
| Epoxy mold compound | ~8–20 (varies) |

Every temperature change $\Delta T$ produces differential expansion. The shear strain at a BGA solder joint is approximately:

$$\Delta \varepsilon \approx \frac{(CTE_1 - CTE_2) \cdot \Delta T \cdot L}{2h}$$

where $L$ is the distance from the package neutral point to the joint, and $h$ is the joint height. Joints far from center, with large $\Delta T$ per cycle, in packages with large $L$, fail first.

Fatigue crack propagation follows the **Coffin-Manson** relation:

$$N_f = C \cdot (\Delta \varepsilon_p)^{-k}$$

where $N_f$ is cycles to failure, $\Delta \varepsilon_p$ is plastic strain range per cycle, and $k$ is typically 1.9–2.0 for solder. The $k > 1$ exponent means damage is not linear in strain: one large thermal swing from 0°C to 100°C is more damaging than two swings from 0°C to 50°C, even though the total temperature excursion is the same. This matters operationally — workloads that repeatedly hard-power-cycle servers are mechanically harder on solder joints than workloads that keep systems at steady temperature.

### Failure Distributions

The **Weibull distribution** models all three phases of hardware life with a single parametrization. Its hazard function (instantaneous failure rate at time $t$ given survival to $t$) is:

$$h(t) = \frac{\beta}{\eta} \left(\frac{t}{\eta}\right)^{\beta - 1}$$

The shape parameter $\beta$ determines the failure regime:
- $\beta < 1$: failure rate decreasing — infant mortality (manufacturing defects)
- $\beta = 1$: failure rate constant — random failures, reduces to exponential distribution
- $\beta > 1$: failure rate increasing — wear-out (electromigration, TDDB, fatigue)

The cumulative distribution function — the probability a unit has failed by time $t$ — is:

$$F(t) = 1 - e^{-(t/\eta)^\beta}$$

The scale parameter $\eta$ is the **characteristic life**: the time at which $F(\eta) = 1 - e^{-1} \approx 63.2\%$ of the population has failed, regardless of $\beta$.

The MTTF is *not* $\eta$. It is:

$$\text{MTTF} = \eta \cdot \Gamma\!\left(1 + \frac{1}{\beta}\right)$$

where $\Gamma$ is the gamma function. A vendor quoting MTTF = 1,000,000 hours for a drive is giving you this expectation value. If $\beta = 1.5$ (mild wear-out), then $\Gamma(1 + 1/1.5) = \Gamma(1.667) \approx 0.903$, so $\eta \approx 1.107 \times 10^6$ hours — and roughly 10% of units will have failed by around $0.2\eta \approx 221{,}000$ hours, far below the MTTF. The distribution, not the mean, determines when *your* drive fails.

---

## How It Works

### Thermal Activation — The Unifying Structure

Electromigration, TDDB, corrosion, and most wear-out mechanisms share a common rate equation: the **Arrhenius equation**:

$$r \propto e^{-E_a / k_B T}$$

The derivation is statistical mechanical: the fraction of a system's degrees of freedom with energy exceeding a barrier $E_a$ is $e^{-E_a/k_BT}$, a direct consequence of the Boltzmann distribution. Failure mechanisms governed by this equation accelerate exponentially with temperature — not linearly, not quadratically. This is why junction temperature is the primary reliability control variable in thermal design.

The acceleration factor between two temperatures $T_1 < T_2$ is:

$$AF = \frac{r(T_2)}{r(T_1)} = \exp\!\left[\frac{E_a}{k_B}\left(\frac{1}{T_1} - \frac{1}{T_2}\right)\right]$$

For a failure mechanism with $E_a = 0.7\ \text{eV}$ (typical for electromigration in aluminum), comparing operation at 70°C versus 90°C:

```
