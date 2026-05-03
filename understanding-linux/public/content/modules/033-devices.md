---
id: 33
title: "Devices"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

Every piece of hardware your Linux kernel talks to is built from a small set of primitive electronic components. When a kernel driver writes to a memory-mapped register to configure a GPIO pin, it is ultimately controlling a gate voltage on a MOSFET. When an ADC driver reads a conversion result, that result encodes the ratio of a sensor's output voltage to a reference — set by a resistor divider. When a USB controller misbehaves only at high data rates, the cause is often parasitic inductance on a PCB trace, not a software bug.

Driver code manipulates abstractions. This module explains what those abstractions sit on top of — so when hardware misbehaves, you can reason about the physics instead of guessing.

---

## Core Concepts

### Resistors

A resistor enforces a linear relationship between voltage and current:

$$V = IR$$

Resistance is measured in ohms (Ω). In series, resistances add:

$$R_{\text{series}} = R_1 + R_2 + \cdots + R_n$$

In parallel, conductances add (conductance $G = 1/R$), giving:

$$R_{\text{parallel}} = \frac{R_1 R_2}{R_1 + R_2}$$

**Voltage divider:** Two resistors in series from $V_{DD}$ to GND produce an output at the midpoint:

$$V_{\text{out}} = V_{DD} \cdot \frac{R_2}{R_1 + R_2}$$

This is how a pull-up resistor works: $R_1$ connects the signal line to $V_{DD}$; when no device is driving the line, $R_2$ is the device's input impedance (very large), so $V_{\text{out}} \approx V_{DD}$. When a device pulls the line to GND, $R_2 \to 0$ and $V_{\text{out}} \to 0$. The pull-up resistor value is a trade-off: smaller values pull the line high faster (lower $RC$ time constant) but waste more power when driven low.

**Non-ideal behavior:** Above roughly 100 MHz, even a small resistor body acts as a series inductor ($\sim 1\text{–}5\text{ nH}$ for a surface-mount component). The impedance becomes $Z = \sqrt{R^2 + (\omega L)^2}$ rather than just $R$. This is why a 100 Ω termination resistor on a 1 GHz signal line may not actually present 100 Ω to the signal.

Resistors also generate **Johnson-Nyquist noise** — thermal noise with spectral density:

$$S_V = 4 k_B T R \quad [\text{V}^2/\text{Hz}]$$

A 1 kΩ resistor at room temperature generates $\approx 4\text{ nV}/\sqrt{\text{Hz}}$. Irrelevant for digital logic; critical when a kernel driver reads a low-level ADC channel from a high-impedance sensor.

### Capacitors

A capacitor stores energy in the electric field between two conductors separated by a dielectric. Charge and voltage are related by:

$$Q = CV$$

Taking the time derivative gives the defining circuit relationship:

$$I = C \frac{dV}{dt}$$

This equation explains every important capacitor behavior: **current flows only when voltage is changing**. At DC steady state, $dV/dt = 0$, so no current flows — the capacitor is an open circuit. At high frequency, $dV/dt$ is large, so large current flows — the capacitor is nearly a short circuit. The impedance of a capacitor is:

$$Z_C = \frac{1}{j\omega C}$$

At $f = 1\text{ MHz}$, a 100 nF capacitor has $|Z_C| = \frac{1}{2\pi \times 10^6 \times 10^{-7}} \approx 1.6\text{ Ω}$. At 1 kHz, the same capacitor has $|Z_C| \approx 1.6\text{ kΩ}$. This frequency-dependent impedance is the mechanism behind every filtering application.

**Bypass (decoupling) capacitors** placed physically adjacent to a chip's power pin supply instantaneous current during switching transients. The reason for proximity is that every millimeter of PCB trace has inductance ($\approx 0.7\text{–}1\text{ nH/mm}$); a remote capacitor is isolated from the chip by that inductance during the transient, so it cannot respond fast enough. See the quantitative example in the "How It Works" section.

Capacitors combine as the inverse of resistors:

$$C_{\text{series}} = \frac{C_1 C_2}{C_1 + C_2}, \qquad C_{\text{parallel}} = C_1 + C_2$$

Parallel capacitors add because you are effectively increasing the plate area; that is why you see multiple bypass capacitors of different values (100 nF, 10 μF) in parallel on a power rail — each handles a different frequency decade.

### Inductors

An inductor stores energy in the magnetic field surrounding a current-carrying conductor. The defining relationship is dual to the capacitor:

$$V = L \frac{dI}{dt}$$

Voltage appears across an inductor only when current is changing. An inductor is a short circuit at DC and an open circuit at very high frequency. Impedance:

$$Z_L = j\omega L$$

At $f = 100\text{ MHz}$, a 10 nH inductor has $|Z_L| = 2\pi \times 10^8 \times 10^{-8} \approx 6.3\text{ Ω}$. This is the parasitic inductance of a few centimeters of PCB trace — large enough to cause a substantial voltage transient during fast switching.

**In power supplies:** Switching regulators (buck, boost) use an inductor to transfer energy efficiently. During the "on" phase, current ramps up through the inductor storing energy; during the "off" phase, the inductor releases that energy to the output. The average output voltage is set by the duty cycle $D$:

$$V_{\text{out}} = D \cdot V_{\text{in}} \quad \text{(buck converter)}$$

The kernel's `regulator` subsystem (under `drivers/regulator/`) controls these switching regulators via I²C or SPI; the inductor is what makes the conversion efficient rather than burning the voltage difference as heat (as a linear regulator does).

**LC resonance:** An inductor and capacitor in a circuit exchange energy at:

$$f_0 = \frac{1}{2\pi\sqrt{LC}}$$

A 10 μH inductor and 100 nF capacitor resonate at $f_0 = \frac{1}{2\pi\sqrt{10^{-5} \times 10^{-7}}} \approx 159\text{ kHz}$. Signals at this frequency see a very high impedance (parallel LC) or very low impedance (series LC). Power supply designers choose $L$ and $C$ to push this resonance well above the switching frequency noise they want to filter.

### Diodes

A diode passes current in one direction (anode to cathode, forward-biased) and blocks it in the other. The Shockley equation gives the full behavior:

$$I = I_S \left( e^{V / n V_T} - 1 \right)$$

where $I_S$ is the reverse saturation current ($\sim\text{fA}$ to $\text{nA}$), $n$ is the ideality factor (1–2), and $V_T = k_B T / q \approx 26\text{ mV}$ at room temperature. In practice: a silicon diode conducts significantly above $\approx 0.6\text{–}0.7\text{ V}$ forward bias and blocks in reverse up to its breakdown voltage.

**Zener diode:** Engineered with a precise reverse breakdown voltage $V_Z$ (1–200 V range). Below $V_Z$, it blocks; at $V_Z$, it conducts in reverse at nearly constant voltage regardless of current. Use case: clamping a MOSFET gate signal to a safe voltage, or providing a voltage reference. The kernel's `hwmon` subsystem reads voltages from supervisor ICs that use Zener-based references.

**Schottky diode:** Metal-semiconductor junction; lower forward voltage ($\approx 0.2\text{–}0.4\text{ V}$) and faster switching than silicon PN diodes. Used in power rectifiers and as clamp diodes on logic signals.

### BJTs (Bipolar Junction Transistors)

A BJT is a current-controlled device. In the active region:

$$I_C = \beta \cdot I_B, \qquad I_E = I_C + I_B = (\beta + 1) I_B$$

$\beta$ (also written $h_{FE}$) is the current gain, typically 100–300. The base–emitter junction is a forward-biased diode ($V_{BE} \approx 0.6\text{ V}$). Collector current also has an exponential dependence on $V_{BE}$:

$$I_C = I_S e^{V_{BE}/V_T}$$

This means $I_C$ approximately doubles every 9°C at fixed $V_{BE}$. **Thermal runaway** in parallel BJTs: the hotter device has lower $V_{BE}$ for the same current, draws more current, heats further — a positive-feedback loop that destroys the device. The fix is emitter-ballast resistors that drop voltage proportional to current, introducing negative feedback. This is not just a power electronics concern: any BJT-based driver stage (e.g., driving an LED array or a relay coil from a GPIO) must respect this property.

BJTs are less common in new digital designs than MOSFETs but remain in: audio circuits, high-voltage switching (some SiC/GaN drivers), and as part of BiCMOS processes used in RF ICs.

### MOSFETs

A MOSFET is a
