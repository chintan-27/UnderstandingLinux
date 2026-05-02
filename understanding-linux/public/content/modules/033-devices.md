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

Every kernel driver that configures a GPIO pin, sets a clock frequency, or manages a power rail is commanding circuits built from a handful of primitive components. When a peripheral fails to enumerate on USB because a decoupling capacitor was omitted from the board, or a system crashes under load because of voltage droop on a power rail, the failure has a direct physical cause traceable to component behavior. Reading a datasheet, interpreting a driver's register writes, or diagnosing a hardware fault requires understanding what these components actually do — not just their symbols.

---

## Core Concepts

### Resistors: Constraining the Voltage-Current Relationship

$$V = IR$$

A resistor enforces a linear, instantaneous relationship between voltage and current. It dissipates energy as heat — it stores nothing. The two directions of application are identical mathematically: given a supply voltage and a desired current, choose $R = V/I$; given a current source and a desired voltage, the same equation applies. Resistors in series add; in parallel:

$$R_{\text{parallel}} = \frac{R_1 R_2}{R_1 + R_2}$$

Real resistors deviate from ideal behavior in three ways that matter to hardware debugging: parasitic inductance (a wire-wound resistor looks like an inductor at high frequency), temperature coefficient (resistance drifts with heat, which matters for precision analog circuits), and excess noise in carbon-composition types (which matters for low-noise amplifier design). Metal-film resistors are preferred in precision circuits for their low tempco and low noise.

### Capacitors: Opposing Voltage Change

A capacitor stores charge on two conductors separated by a dielectric. The governing relationship is not $Q = CV$ but its time derivative:

$$I = C \frac{dV}{dt}$$

This is the operative equation. Current flows through a capacitor only when voltage is changing. Zero $dV/dt$ means zero current — DC is blocked. Large $dV/dt$ means large current. The practical consequences:

- **Decoupling**: A logic gate switching state demands a sudden current pulse. The PCB power trace has real inductance; from $V = L\,dI/dt$, a fast current step induces a voltage spike. A capacitor placed physically close to the supply pin supplies that pulse locally, from stored charge, before the trace inductance can generate a spike. The key word is *locally* — a capacitor on the far side of the board cannot respond fast enough.
- **Filtering**: High-frequency noise on a power rail sees a low-impedance path to ground through the capacitor; DC sees an open circuit.
- **Timing**: Charging at a known rate (constant $I$, linear $V$ rise) or through a resistor (exponential rise) creates a predictable delay.

Practical values span many decades:

| Unit | Symbol | Value |
|------|--------|-------|
| Microfarad | $\mu\text{F}$ | $10^{-6}\ \text{F}$ |
| Nanofarad | $\text{nF}$ | $10^{-9}\ \text{F}$ |
| Picofarad | $\text{pF}$ | $10^{-12}\ \text{F}$ |

**Worked example.** If $1\ \text{mA}$ is forced into a $1\ \mu\text{F}$ capacitor:

$$\frac{dV}{dt} = \frac{I}{C} = \frac{10^{-3}}{10^{-6}} = 1000\ \text{V/s}$$

A $10\ \text{ms}$ current pulse raises the voltage by $10\ \text{V}$. This calculation reappears constantly — in oscilloscope probing, in power supply design, in estimating how long a hold-up capacitor sustains a circuit during a brown-out.

### Inductors: Opposing Current Change

$$V = L \frac{dI}{dt}$$

The dual of the capacitor equation. An inductor resists changes in current: it passes steady DC with only resistive loss, but opposes any rapid change. This is why you cannot abruptly disconnect an inductor from its drive circuit — the collapsing magnetic field demands current continuity and generates a large voltage spike ($V = L\,dI/dt$ with a very large $dI/dt$). This spike destroys unprotected switching transistors; a freewheeling diode across the inductor provides a current path to absorb it.

Inductors appear in buck/boost converters (where the inductor is the energy transfer element), in EMI filters (series inductor blocks high-frequency noise from escaping a power supply), and in RF circuits.

### Diodes: Asymmetric Conduction and Protection

A silicon diode conducts forward (anode to cathode) with a voltage drop of roughly $0.6$–$0.7\ \text{V}$ and blocks reverse. The forward drop is not a fixed value — it decreases with temperature (approximately $-2\ \text{mV/°C}$) and increases with current. Schottky diodes have a lower forward drop ($\approx 0.2$–$0.3\ \text{V}$) and faster switching; they appear in high-frequency power converters and as protection diodes on logic inputs.

Zener diodes conduct in reverse at a precise breakdown voltage. Placed gate-to-source on a MOSFET, a Zener clamps $V_{GS}$ and protects the gate oxide from overvoltage transients, which otherwise destroy it irreversibly. Placed on an input pin, a Zener clamps electrostatic discharge (ESD) spikes.

### BJTs: Current-Controlled Gain and the Thermal Runaway Mechanism

A Bipolar Junction Transistor (BJT) has base, collector, and emitter. In the active region:

$$I_C = \beta \cdot I_B$$

where $\beta$ (also $h_{FE}$) is typically 50–500. The base-emitter junction behaves like a forward-biased diode: $V_{BE} \approx 0.6\ \text{V}$.

The critical failure mode: BJT collector current has a **positive temperature coefficient** — roughly $+9\%/°C$. If one BJT in a parallel array runs slightly hotter than its neighbors, it draws more current, dissipates more power, heats further, and draws still more current. This thermal runaway is self-reinforcing and destroys the device. The fix is **emitter degeneration resistors** (small resistors in series with each emitter): as current through a device increases, the voltage drop across its emitter resistor increases, reducing $V_{BE}$, which reduces $I_B$, which reduces $I_C$ — a local negative feedback that forces equal current sharing.

### MOSFETs: Voltage-Controlled Switches and the Tempco Inversion

A MOSFET's gate is isolated from the channel by a thin oxide layer ($\text{SiO}_2$, typically $5$–$50\ \text{nm}$ thick). It draws virtually no DC gate current, which means:

1. The drive circuit needs to supply only enough charge to charge gate capacitance, not a sustained current.
2. The gate oxide is fragile. Exceeding the rated $V_{GS}$ — even briefly — ruptures it permanently.

The gate-source voltage $V_{GS}$ controls drain current $I_D$. In saturation:

$$I_D = \frac{1}{2} \mu_n C_{ox} \frac{W}{L} (V_{GS} - V_{th})^2$$

The relevant parameter for switching power is $R_{DS(on)}$, the on-state drain-source resistance, which appears in datasheets and determines conduction loss:

$$P_{\text{conduction}} = I_D^2 \cdot R_{DS(on)}$$

**Temperature coefficient inversion.** At high drain currents (the regime of power switching), MOSFET $I_D$ has a **negative temperature coefficient**: higher temperature reduces carrier mobility, which increases $R_{DS(on)}$, which reduces current. This means parallel MOSFETs self-balance — a hotter device conducts less and cools down. No ballasting resistors needed. However, at low drain currents in the linear region, the tempco inverts to positive, so MOSFETs operating as linear pass elements (e.g., a linear regulator) can still suffer thermal runaway.

### Oscillators: Gain Plus Frequency-Selective Feedback

An oscillator requires two things: **gain** (from an active device) and **frequency-selective positive feedback** (from an LC tank or crystal). An LC tank oscillates because inductor and capacitor exchange energy: charge stored on the capacitor drives current through the inductor, the collapsing magnetic field recharges the capacitor in reverse polarity, and the cycle repeats at:

$$f_0 = \frac{1}{2\pi\sqrt{LC}}$$

Real LC tanks lose energy to resistance, so oscillation damps out. The active device replenishes energy each cycle. A crystal replaces the LC tank with the mechanical resonance of quartz, which has a quality factor ($Q$) of $10^4$–$10^6$ — orders of magnitude higher than any practical LC circuit. This is why crystal oscillators achieve frequency stabilities of $\pm 20\ \text{ppm}$ or better, which your CPU reference clock requires.

---

## How It Works

### RC Time Constant

Series R and C driven by a voltage step:

```
          R
 Vin ----/\/\/----+---- Vout
                  |
                  C
                  |
                 GND
```

The capacitor charges exponentially:

$$V(t) = V_{\text{final}}\left(1 - e^{-t/\tau}\right), \quad \tau = RC$$

After one $\tau$: $63\%$ charged. After $5\tau$: $>99\%$ charged — effectively complete.

With $R = 10\ \text{k}\Omega$, $C = 100\ \text{nF}$:

$$\tau = 10^4 \cdot 10^{-7} = 1\ \text{ms}$$

The RC circuit is nearly universal: debounce filters on GPIO inputs, pull-up networks on I²C lines (which set the maximum clock rate via $\tau = R_{\text
