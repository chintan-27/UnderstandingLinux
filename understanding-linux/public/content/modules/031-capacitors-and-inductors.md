---
id: 31
title: "Capacitors and inductors"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

Every circuit that does something interesting in time depends on components that store energy. Without capacitors and inductors, you have purely resistive circuits: instantaneous, memoryless, incapable of oscillation or filtering. A CPU's power rail would collapse the moment a transistor switched because the power supply cannot respond in nanoseconds — only a local capacitor can. A switching regulator couldn't transfer energy without an inductor to accumulate it during the on-phase and release it during the off-phase. A radio couldn't select a frequency without a resonant tank circuit.

Inside the Linux kernel, these effects are not abstractions. The reason `CONFIG_HZ` is bounded, the reason USB high-speed requires controlled-impedance traces, the reason a PCIe lane has equalization — all of it traces back to capacitive and inductive behavior in real conductors. Knowing this lets you reason from first principles when hardware misbehaves, not just pattern-match against a checklist.

---

## Core Concepts

### Capacitors: Electric Field Storage

A capacitor stores energy in the electric field between two conductors separated by a dielectric. Charge accumulates on the plates as current flows; the relationship between that current and the resulting voltage change is:

$$I = C \frac{dV}{dt}$$

The causality runs left to right: current flowing in *causes* voltage to rise. If voltage isn't changing, no current flows — not because the capacitor "blocks" DC as a rule, but because a static charge distribution requires no ongoing current to maintain itself. Conversely, if a load demands a sudden burst of current, the capacitor can supply it from stored charge before the power supply has time to respond. This is the physical basis for decoupling.

Energy stored in the electric field:

$$E = \frac{1}{2}CV^2$$

This energy is recoverable — an ideal capacitor dissipates nothing.

### Inductors: Magnetic Field Storage

An inductor stores energy in the magnetic field threading its coil. The dual of the capacitor relation:

$$V = L \frac{dI}{dt}$$

Current through an inductor cannot change instantaneously because doing so would require infinite voltage. When you try to interrupt inductor current abruptly — say, by opening a switch — $dI/dt$ is forced very large and negative, so $V = L\,dI/dt$ spikes to whatever voltage is necessary to maintain continuity of current. This is not a quirk; it is a direct consequence of the field's inability to collapse instantaneously.

Energy stored in the magnetic field:

$$E = \frac{1}{2}LI^2$$

At DC, an inductor is just wire — zero voltage drop across a fixed current. At high frequencies, $dI/dt$ is large even for small current amplitudes, so the opposing voltage is large. This is the exact complement of capacitor behavior.

### Transients: RC and RL Time Constants

Connect a resistor $R$ and capacitor $C$ in series to a voltage step $V_{in}$ at $t = 0$. The capacitor voltage obeys:

$$V_C(t) = V_{in}\left(1 - e^{-t/\tau}\right), \quad \tau = RC$$

Why exponential? The current that charges the capacitor is $I = (V_{in} - V_C)/R$. As $V_C$ rises, the driving voltage $(V_{in} - V_C)$ falls, reducing current, which slows the rise — a self-limiting feedback loop. The differential equation $C\,dV_C/dt = (V_{in} - V_C)/R$ has the exponential as its unique solution.

After one $\tau$: 63.2% of final value. After $5\tau$: 99.3%. The resistor sets how fast charge can arrive; the capacitor sets how much charge is required per volt.

For an RL circuit, the dual gives current rise:

$$I(t) = \frac{V_{in}}{R}\left(1 - e^{-t/\tau}\right), \quad \tau = \frac{L}{R}$$

The resistor now limits how fast voltage can be applied across the inductor, throttling $dI/dt$.

### Impedance: Frequency-Domain Behavior

Replace $d/dt$ with $j\omega$ (valid for sinusoidal steady-state). Capacitor and inductor impedances become:

$$Z_C = \frac{1}{j\omega C}, \quad Z_L = j\omega L$$

where $\omega = 2\pi f$. These are not merely "frequency-dependent resistors" — they are reactive: they shift phase by $\pm 90°$ and store rather than dissipate energy. The magnitude $|Z_C| = 1/(\omega C)$ decreases with frequency, which is why a capacitor shunting a power rail to ground attenuates high-frequency noise. The magnitude $|Z_L| = \omega L$ increases with frequency, which is why a series inductor in a power filter blocks high-frequency switching transients from reaching the load.

Voltage leads current by 90° in an inductor; current leads voltage by 90° in a capacitor. The mnemonic **ELI the ICE man**: **E**MI leads **I** in an i**L** (inductor), **I** leads **E** in a **C** (capacitor).

### Resonance in LC Circuits

Place a capacitor and inductor in a loop. Energy oscillates: capacitor voltage drives current into the inductor, building a magnetic field; when the capacitor is discharged, the inductor drives current back, recharging the capacitor in reverse polarity. This repeats at the frequency where $|Z_L| = |Z_C|$:

$$\omega_0 L = \frac{1}{\omega_0 C} \implies \omega_0 = \frac{1}{\sqrt{LC}}, \quad f_0 = \frac{1}{2\pi\sqrt{LC}}$$

In a series RLC circuit, total impedance at resonance is purely $R$ — the reactive parts cancel — so current is maximized. In a parallel RLC circuit, the reactive currents circulate internally and impedance is maximized, meaning the circuit presents a high impedance to external drive at $f_0$. A radio receiver exploits this: a parallel tank circuit presents high impedance only near $f_0$, so only that frequency develops significant voltage across it.

---

## How It Works

### RC Charging: A Worked Calculation

Series RC with $R = 1\,\text{k}\Omega$, $C = 1\,\mu\text{F}$, step input $V_{in} = 5\,\text{V}$ at $t = 0$:

$$\tau = RC = 10^3 \cdot 10^{-6} = 1\,\text{ms}$$

Voltage across capacitor at $t = 2\,\text{ms}$:

$$V_C(2\,\text{ms}) = 5\left(1 - e^{-2}\right) = 5 \times 0.8647 = 4.32\,\text{V}$$

Current at the same instant:

$$I(2\,\text{ms}) = \frac{V_{in} - V_C}{R} = \frac{5 - 4.32}{10^3} = 0.68\,\text{mA}$$

Equivalently, using the exponential form:

$$I(t) = \frac{V_{in}}{R}e^{-t/\tau} = 5\,\text{mA} \cdot e^{-2} = 0.68\,\text{mA}$$

The charge delivered to the capacitor by $t = 2\,\text{ms}$:

$$Q = C \cdot V_C = 10^{-6} \times 4.32 = 4.32\,\mu\text{C}$$

You can verify: $Q = \int_0^t I\,dt' = \frac{V_{in}}{R}\int_0^t e^{-t'/\tau}dt' = C V_{in}(1 - e^{-t/\tau})$. Consistent.

### The Flyback Converter: Inductors Storing and Releasing Energy

A flyback converter stores energy in an inductor during the switch-on phase and delivers it to the output during the switch-off phase. This is the topology in most USB chargers and isolated DC-DC converters.

**Switch ON:** The input voltage $V_{in}$ is applied across the primary inductance $L_{pri}$. Current ramps linearly:

$$I_{pri}(t) = \frac{V_{in}}{L_{pri}} \cdot t$$

Energy accumulates in the core: $E = \frac{1}{2}L_{pri}I_{pk}^2$, where $I_{pk}$ is the peak current at switch-off.

**Switch OFF:** The primary current path is broken. The magnetic field must collapse, which reverses the inductor voltage (flyback). The secondary winding sees this reversed voltage, forward-biasing the output diode, and the stored energy transfers to the output capacitor and load.

If there is *no* valid current path when the switch opens, $dI/dt$ is limited only by stray capacitance. The voltage spike $V = L\,dI/dt$ can reach hundreds of volts on the switch node in microseconds, destroying the MOSFET. Snubber circuits (RC or RCD across the switch) provide a controlled discharge path to absorb this energy.

### RLC Damping: Three Regimes

A series RLC circuit with step input has its transient behavior determined by the damping ratio:

$$\zeta = \frac{R}{2}\sqrt{\frac{C}{L}}$$

Equivalently, $\zeta = R / (2\omega_0 L)$. The natural frequency is $\omega_0 = 1/\sqrt{LC}$.

| Regime | Condition | Behavior |
|---|---|---|
| Overdamped | $\zeta > 1$ | Two real exponential modes, no oscillation, slow |
| Critically damped | $\zeta = 1$ | Fastest rise to final value without overshoot |
| Underdamped | $\zeta < 1$ | Decaying
