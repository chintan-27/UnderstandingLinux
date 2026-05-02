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

Every piece of hardware your Linux kernel drives obeys electrical laws before it obeys software abstractions. When a kernel driver misconfigures a GPIO pin's current limit, the pin burns out — not because the driver had a logic bug, but because $P = I^2 R$ exceeded the silicon's thermal rating. When a power supply can't deliver enough current under load, the system crashes mid-boot with no error message because the CPU itself browses out before it can log anything. When you read `/sys/class/power_supply/BAT0/voltage_now`, that number is a physical potential difference in microvolts — not a status code, not an abstraction. Without a working model of charge, current, voltage, resistance, power, and energy, you cannot reason about hardware behavior. You can only cargo-cult configurations and hope.

---

## Core Concepts

### Charge

Charge is a fundamental property of matter. The electron carries charge $q_e = -1.602 \times 10^{-19}$ C. One coulomb is the charge of approximately $6.24 \times 10^{18}$ electrons. Charge is conserved absolutely — it cannot be created or destroyed, only moved. This conservation law is the physical foundation of Kirchhoff's current law: whatever current flows into a node must flow out, because charge cannot accumulate there.

### Current

Current is the rate of charge flow past a point:

$$I = \frac{dQ}{dt}$$

One ampere = one coulomb per second. Current flows because voltage imposes a force on charge carriers. The direction convention — the direction positive charges would move — was fixed before electrons were discovered, so conventional current flows opposite to electron motion. This matters when reading datasheets: "current into pin" means electrons flowing out.

### Voltage

Voltage is electric potential difference: the work required to move one coulomb of charge between two points:

$$V = \frac{W}{Q}$$

where $W$ is energy in joules. Voltage is always a difference between two points — "5 V" is meaningless without a reference. Ground is defined as 0 V by convention; everything is measured relative to it. A GPIO pin driven high on a 3.3 V system is 3.3 V above ground, not 3.3 V in any absolute sense. This is why floating inputs are dangerous: with no reference path, the pin's voltage is undefined and the input reads noise.

### Resistance

Resistance opposes current flow. Ohm's Law:

$$V = IR$$

One ohm: one volt produces one ampere. Resistance arises from charge carriers colliding with the material's atomic lattice — those collisions convert electrical energy into heat, which is why resistors get warm and why wires have resistance ratings. Ohm's Law holds for resistors within their ratings; diodes and transistors have nonlinear $V$–$I$ relationships and do not obey it generally.

### Power

Power is the rate of energy transfer:

$$P = IV$$

Substituting $V = IR$ and $I = V/R$ gives two forms that are exact rewrites, not approximations:

$$P = I^2 R = \frac{V^2}{R}$$

The unit is the watt (W). $P = I^2 R$ tells you what a resistor dissipates as heat. $P = IV$ tells you what a supply delivers or a load consumes. They are the same equation — choose the form that matches what you know.

### Energy

Energy is power integrated over time:

$$E = \int_0^t P \, dt'$$

For constant power, $E = Pt$. The SI unit is the joule (J). Battery capacity is quoted in watt-hours: $1 \, \text{Wh} = 3600 \, \text{J}$. Milliampere-hours (mAh) are also common but require a voltage to convert to energy:

$$E \, [\text{Wh}] = \frac{C \, [\text{mAh}]}{1000} \times V \, [\text{V}]$$

Without the voltage, mAh is a charge quantity, not an energy quantity — a 4000 mAh cell at 3.85 V holds more energy than a 4000 mAh cell at 3.2 V.

---

## How It Works

### Voltage Dividers

Two resistors in series with a voltage applied across both produce an output proportional to the input:

$$V_{out} = V_{in} \cdot \frac{R_2}{R_1 + R_2}$$

Why: the same current flows through both resistors because there is only one path. That current is $I = V_{in} / (R_1 + R_2)$. The voltage across $R_2$ is $IR_2$, which gives the formula above. The output is always $\leq V_{in}$ — passive dividers cannot amplify. Voltage dividers appear in ADC resistor ladders, transistor bias networks, and the feedback networks that set CPU core voltage on a motherboard.

### Loading Effect

A voltage divider's Thévenin output resistance is $R_1 \| R_2$:

$$R_{out} = \frac{R_1 R_2}{R_1 + R_2}$$

Connecting a load $R_L$ across the output forms a new divider with $R_1$, dropping the output voltage:

$$V_{out,loaded} = V_{in} \cdot \frac{R_2 \| R_L}{R_1 + R_2 \| R_L}$$

Concrete example: a 10 kΩ–10 kΩ divider driven by 1 V, measured with a 20 kΩ meter input (a 20,000 Ω/V meter on its 1 V range):

$$V_{out} = 1 \cdot \frac{10k \| 20k}{10k + 10k \| 20k} = 1 \cdot \frac{6.67k}{16.67k} \approx 0.400 \, \text{V}$$

The ideal output is 0.500 V. The meter introduces a 20% error by existing. This is why oscilloscope probes are 10 MΩ and why ADC input buffers are high-impedance: measuring must not load the circuit being measured.

### Maximum Power Transfer

A source with internal resistance $R_S$ drives load $R_L$. Power delivered to the load:

$$P_L = \left(\frac{V_S}{R_S + R_L}\right)^2 R_L$$

Differentiating with respect to $R_L$ and setting to zero:

$$\frac{dP_L}{dR_L} = 0 \implies R_L = R_S$$

At matched impedance:

$$P_{L,\max} = \frac{V_S^2}{4 R_S}$$

Half the source power is wasted in $R_S$. Audio amplifiers and RF antenna feeds are designed for impedance matching to maximize power transfer. Digital logic drivers are not — you want $R_L \gg R_S$ there to maximize voltage transfer and minimize the energy wasted in the driver's own resistance.

### Heat Dissipation

From $P = I^2 R$: a 100 Ω resistor carrying 100 mA:

$$P = (0.1 \, \text{A})^2 \times 100 \, \Omega = 1 \, \text{W}$$

A standard 1/4 W resistor fails at this load — not degrades, fails, often with smoke or flame. Power ratings on resistors are thermal limits, not suggestions. The same math applies to PCB traces, connector pins, and MOSFETs — exceeding the thermal limit destroys the component regardless of the software running on the system.

### Battery Energy and Runtime

A cell rated 4000 mAh at 3.85 V nominal:

$$E = \frac{4000 \, \text{mAh}}{1000} \times 3.85 \, \text{V} = 15.4 \, \text{Wh} = 55{,}440 \, \text{J}$$

Runtime at constant 500 mW draw:

$$t = \frac{E}{P} = \frac{15.4 \, \text{Wh}}{0.5 \, \text{W}} = 30.8 \, \text{hours}$$

The kernel's power management subsystem — `drivers/power/supply/` and the `pm_qos` infrastructure — performs variants of this arithmetic continuously, trading off performance states against projected runtime.

---

## Linux Connection

### Reading Electrical Quantities from sysfs

The kernel's power supply class (`drivers/power/supply/power_supply_core.c`) exposes battery and charger measurements through sysfs. Units follow a consistent convention: voltages in microvolts (µV), currents in microamps (µA), energy in microwatt-hours (µWh), charge in microampere-hours (µAh).

```bash
# Voltage across the battery terminals, in µV
cat /sys/class/power_supply/BAT0/voltage_now

# Current: negative = discharging, positive = charging, in µA
cat /sys/class/power_supply/BAT0/current_now

# Remaining energy and design capacity, in µWh
cat /sys/class/power_supply/BAT0/energy_now
cat /sys/class/power_supply/BAT0/energy_full
cat /sys/class/power_supply/BAT0/energy_full_design

# Instantaneous power in µW (not always present — compute it if absent)
cat /sys/class/power_supply/BAT0/power_now

# Charger status: "Charging", "Discharging", "Full", "Not charging"
cat /sys/class/power_supply/BAT0/status
```

Compute instantaneous power and estimated runtime in a shell one-liner when `power_now` is absent:

```bash
V=$(cat /sys/class/power_supply/BAT0/voltage_now)   # µV
I=$(cat /sys/class/power_supply/BAT0/current_now)   # µA (may be negative)
E=$(cat /sys
