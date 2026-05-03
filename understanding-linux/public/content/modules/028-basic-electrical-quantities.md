---
id: 28
title: "Basic electrical quantities"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

Every piece of hardware your Linux kernel talks to operates by controlling the flow of electrons through engineered paths. When your kernel writes to a memory-mapped register to reset a peripheral, it is changing a voltage. When a GPIO pin asserts high, current flows through whatever load is attached. When `cpufreq` drops a core's operating frequency, it is reducing the $P = CV^2f$ dynamic power dissipation of millions of switching transistors. Without a working model of charge, current, voltage, resistance, power, and energy, hardware datasheets are unreadable, signal integrity problems are invisible, and power management code is cargo-culted. These quantities are the physical substrate every abstraction in your stack ultimately rests on.

---

## Core Concepts

### Charge

Electric charge $Q$ is a fundamental property of matter. The SI unit is the **coulomb** (C). One electron carries $q_e = -1.602 \times 10^{-19}$ C. Charge is conserved — the total charge in a closed system cannot change. This conservation law is the physical basis of Kirchhoff's Current Law: what flows into a node must flow out, because charge cannot accumulate there indefinitely.

### Current

Current $I$ is the rate at which charge passes a cross-section of a conductor:

$$I = \frac{dQ}{dt}$$

The unit is the **ampere** (A): one coulomb per second. By convention, current flows from higher to lower potential — the direction a *positive* charge would move — which is opposite to actual electron drift. This historical convention is universal in circuit diagrams and datasheets. When a datasheet specifies that a GPIO sink can handle 8 mA, it means 8 mA of conventional current flowing *into* the pin from an external source.

### Voltage

Voltage $V$ is the energy required to move one unit of charge between two points:

$$V = \frac{dW}{dQ}$$

The unit is the **volt** (V): one joule per coulomb. Voltage is always a *difference* — there is no such thing as absolute voltage, only potential relative to a reference. When a datasheet specifies a 3.3 V I/O standard, it means 3.3 V above the circuit's ground node. "Ground" is not zero volts in any absolute sense; it is the agreed reference point for the circuit.

### Resistance

Resistance $R$ quantifies how strongly a material opposes current flow. For ohmic materials, voltage and current are proportional:

$$V = IR \quad \text{(Ohm's Law)}$$

The unit is the **ohm** (Ω). Resistance is the mechanism by which electrical energy is converted to heat — not optionally, but as a direct consequence of charge carriers scattering off the atomic lattice. A short circuit is $R \to 0$; an open circuit is $R \to \infty$. Real PCB traces have resistance on the order of milliohms per centimeter; at high currents this drop becomes significant and causes both voltage errors and heat.

### Power

Power $P$ is the rate of energy transfer:

$$P = \frac{dW}{dt} = IV$$

The unit is the **watt** (W). Substituting Ohm's Law gives two forms that are used constantly:

$$P = I^2 R = \frac{V^2}{R}$$

$P = I^2 R$ is the form to reach for when you know the current through a component (e.g., a sense resistor, a PCB trace, a connector pin). $P = V^2/R$ applies when you know the voltage across it (e.g., the supply rail drooping across a decoupling resistor).

### Energy

Energy $E$ is power integrated over time:

$$E = \int_0^t P(\tau)\, d\tau = Pt \quad \text{(constant } P\text{)}$$

The unit is the **joule** (J). Watt-hours (Wh) and kilowatt-hours (kWh) are the same unit scaled: $1\text{ Wh} = 3600\text{ J}$. A battery's capacity in milliamp-hours (mAh) requires a voltage to convert to energy: $E = V \cdot Q = V \cdot (I \cdot t)$, which is why a 3000 mAh cell at 3.7 V stores a different amount of energy than a 3000 mAh cell at 1.2 V.

---

## How It Works

### Ohm's Law Is a Linear Approximation

Ohm's Law holds for resistors within their rated operating range. It fails for diodes, transistors, and LEDs, which have exponential or threshold-governed $I$–$V$ relationships. It also fails for a resistor whose temperature changes significantly under load: a tungsten filament has roughly 10× higher resistance when incandescent than when cold. Before applying $V = IR$, verify the device is actually ohmic in the operating region.

### Voltage Dividers and Loading Error

Two resistors in series divide an input voltage:

$$V_{out} = V_{in} \cdot \frac{R_2}{R_1 + R_2}$$

This equation is exact only when zero current is drawn from $V_{out}$. Any load $R_L$ placed at $V_{out}$ appears in parallel with $R_2$, reducing the effective lower resistance:

$$R_{2,\text{eff}} = \frac{R_2 \cdot R_L}{R_2 + R_L}$$

A 10 kΩ–10 kΩ divider loaded by a 20 kΩ ADC input has $R_{2,\text{eff}} = 10k \| 20k = 6.67\text{ k}\Omega$, shifting $V_{out}$ from $0.5\, V_{in}$ to $0.4\, V_{in}$ — an 20% error from a "high-impedance" input. This is why high-impedance buffers precede ADC inputs in precision designs, and why oscilloscope probes use a 10 MΩ input impedance: the probe must not change the circuit it is measuring.

### Power Dissipation Is Mandatory

A 100 Ω resistor carrying 100 mA dissipates:

$$P = I^2 R = (0.1\text{ A})^2 \times 100\text{ Ω} = 1\text{ W}$$

A 1/4 W rated resistor in this circuit will overheat, shift in value, and eventually fail open. Power ratings on components are thermal limits set by how quickly the package can shed heat to the surrounding air. Exceeding them does not cause immediate failure; it causes gradual drift followed by sudden failure, which is harder to debug than an immediate short.

### Internal Resistance and Source Loading

All real voltage sources have an internal series resistance $R_s$. Under load current $I$, the terminal voltage drops:

$$V_\text{terminal} = V_\text{oc} - I \cdot R_s = V_\text{oc} \cdot \frac{R_L}{R_L + R_s}$$

where $V_\text{oc}$ is the open-circuit voltage. A phone battery with $R_s = 150\text{ mΩ}$ supplying 3 A to a processor loses $0.15 \times 3 = 0.45\text{ V}$ at the terminals, which is why battery management ICs separately report open-circuit voltage (state of charge) and operating voltage (affected by load). Maximum power transfers to a load when $R_L = R_s$, but for signal measurement you want $R_L \gg R_s$ to avoid disturbing the source.

### Battery Energy and Runtime

A 3000 mAh battery at 3.7 V nominal stores:

$$E = 3.7\text{ V} \times 3.0\text{ Ah} = 11.1\text{ Wh} = 11.1 \times 3600\text{ J} \approx 40\text{ kJ}$$

If the system draws a constant 1 W:

$$t = \frac{E}{P} = \frac{11.1\text{ Wh}}{1\text{ W}} = 11.1\text{ h}$$

Real runtimes are shorter because: (1) battery capacity is rated at a slow discharge rate and drops at high current due to internal resistance losses ($I^2 R_s$); (2) the capacity curve is not flat — the nominal 3.7 V drops as charge depletes; (3) the system power draw is not constant.

---

## Linux Connection

### Battery and Charger State: `power_supply` Subsystem

The kernel's `power_supply` subsystem abstracts fuel gauge ICs, charger controllers, and USB power delivery negotiation. Drivers expose attributes as sysfs files under `/sys/class/power_supply/`. A fuel gauge IC measures current by sampling the voltage drop across a precision shunt resistor (typically 10–100 mΩ) — Ohm's Law in silicon, resolved to microamp precision.

```bash
# List available power supply nodes (battery, AC adapter, USB, etc.)
ls /sys/class/power_supply/

# Terminal voltage in microvolts (divide by 1e6 for volts)
cat /sys/class/power_supply/BAT0/voltage_now

# Instantaneous current in microamps; negative = discharging
cat /sys/class/power_supply/BAT0/current_now

# Remaining energy in microwatt-hours (some drivers report microamp-hours
# in charge_now instead; check energy_full_design vs charge_full_design)
cat /sys/class/power_supply/BAT0/energy_now
cat /sys/class/power_supply/BAT0/energy_full

# Compute instantaneous power in watts from the raw sysfs values:
V=$(cat /sys/class/power_supply/BAT0/voltage_now)
I=$(cat /sys/class/power_supply/BAT0/current_now)
# P = V * I, scaled from micro-units: (µV * µA) / 1e12 = W
awk "BEGIN { printf \"%.3f W\n\", ($V * $I) / 1e
