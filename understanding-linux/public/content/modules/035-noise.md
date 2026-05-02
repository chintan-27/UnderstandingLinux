---
id: 35
title: "Noise"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

Every measurement system — a kernel ADC driver reading a thermistor, a UART receiver recovering bits at 115200 baud, a PCIe SerDes locking onto a reference clock — operates against a background of unwanted electrical fluctuations. Noise is not a design imperfection you eliminate; it is a physical consequence of temperature and the discrete nature of charge. Understanding its sources tells you which problems are solvable in software (averaging, filtering), which require analog hardware fixes (shielding, layout), and which are irreducible limits set by thermodynamics.

The distinction matters for driver development. A kernel IIO driver that misidentifies $1/f$ noise as sensor drift will apply a wrong calibration offset that worsens over time. A clock recovery PLL that does not account for jitter will violate setup times on every received edge at high data rates. Getting this wrong is not a subtle performance issue — it causes data corruption.

---

## Core Concepts

### Thermal (Johnson–Nyquist) Noise

Electrons in a resistor at temperature $T$ undergo random thermal motion. Even with zero net current, their collisions produce a fluctuating open-circuit voltage at the terminals. The power spectral density of this voltage is flat with frequency (white), with voltage noise density:

$$e_n = \sqrt{4 k_B T R}$$

where $k_B = 1.38 \times 10^{-23}\ \text{J/K}$, $T$ is absolute temperature in kelvin, and $R$ is resistance in ohms. This is not a material property — it is a thermodynamic consequence of the fluctuation-dissipation theorem: any element that dissipates energy must also fluctuate. A perfect reactive element (ideal capacitor, inductor) produces no Johnson noise; a lossy capacitor (with ESR) does.

At $T = 300\ \text{K}$:

| $R$ | $e_n$ |
|---|---|
| $50\ \Omega$ | $0.91\ \text{nV}/\sqrt{\text{Hz}}$ |
| $100\ \Omega$ | $1.28\ \text{nV}/\sqrt{\text{Hz}}$ |
| $1\ \text{k}\Omega$ | $4.07\ \text{nV}/\sqrt{\text{Hz}}$ |
| $10\ \text{k}\Omega$ | $12.9\ \text{nV}/\sqrt{\text{Hz}}$ |

You cannot reduce Johnson noise by choosing a lower-noise resistor — any resistor of the same value at the same temperature produces the same noise. Your only levers are bandwidth reduction and physical cooling. The total rms noise integrated over bandwidth $B$ is:

$$v_{n,\text{rms}} = \sqrt{4 k_B T R \cdot B}$$

Short-circuit the resistor and it drives a noise current:

$$i_{n} = \frac{e_n}{R} = \sqrt{\frac{4 k_B T}{R}}$$

Note the inversion: a smaller resistance produces more noise current but less noise voltage. This matters when you are noise-matching a source impedance to an amplifier's input.

### Shot Noise

When charge carriers cross a potential barrier independently — as in a p-n junction, a vacuum tube, or a reverse-biased photodiode — each crossing is a Poisson-distributed random event uncorrelated with all others. The current fluctuation is:

$$i_n = \sqrt{2 q I_{DC}}$$

where $q = 1.602 \times 10^{-19}\ \text{C}$ and $I_{DC}$ is the mean DC current. Shot noise is white. The independence assumption is what makes it Poissonian; in a metallic conductor, long-range Coulomb correlations between electrons suppress fluctuations far below this level, which is why ohmic resistors do not exhibit shot noise on their own — their thermal noise is the dominant mechanism.

A photodiode with $I_{DC} = 1\ \text{mA}$ produces:

$$i_n = \sqrt{2 \times 1.602 \times 10^{-19} \times 10^{-3}} \approx 17.9\ \text{pA}/\sqrt{\text{Hz}}$$

### 1/f Noise (Flicker Noise)

Real semiconductor devices add excess noise whose power spectral density grows as $f \to 0$, approximately $\propto 1/f^\alpha$ with $\alpha \approx 1$. The physical origin is carrier trapping and release at lattice defects and surface states — a spectrum of trap time constants produces the characteristic $1/f$ shape. Because this is a surface/interface effect, MOSFETs (which conduct at the oxide–silicon interface) exhibit far more $1/f$ noise than BJTs (which conduct in the bulk). Cooling helps only modestly.

Every amplifying device has a **corner frequency** $f_c$ where $1/f$ noise power equals the white noise floor. Below $f_c$, $1/f$ dominates. For a low-noise BJT, $f_c$ might be $\sim 100\ \text{Hz}$; for a MOSFET it can be $\sim 10\ \text{kHz}$ to $\sim 1\ \text{MHz}$. This is why precision DC instrumentation (EEG amplifiers, seismic sensors, ADC driver stages) favors BJT input stages or chopper-stabilization over FET inputs.

The total noise voltage density in a device combining white noise floor $e_{n,w}$ and flicker noise is approximately:

$$e_n(f) = e_{n,w}\sqrt{1 + \frac{f_c}{f}}$$

### Signal-to-Noise Ratio

SNR is the ratio of signal power to noise power:

$$\text{SNR} = \frac{P_{\text{signal}}}{P_{\text{noise}}}$$

In decibels, using the fact that power $\propto V^2$:

$$\text{SNR}_{\text{dB}} = 10 \log_{10}\!\left(\frac{P_s}{P_n}\right) = 20 \log_{10}\!\left(\frac{V_s}{V_n}\right)$$

For an ideal $N$-bit ADC driven by a full-scale sinusoid, quantization error is the only noise source. Each bit contributes approximately 6 dB, and the sinusoid's crest factor adds 1.76 dB:

$$\text{SNR}_{\text{ideal}} \approx 6.02N + 1.76\ \text{dB}$$

A 16-bit ADC has a quantization-limited ceiling of $\approx 98\ \text{dB}$; a 12-bit ADC, $\approx 74\ \text{dB}$. Real ADCs fall short of this by an amount characterized by their **effective number of bits (ENOB)**:

$$\text{ENOB} = \frac{\text{SNR}_{\text{measured}} - 1.76}{6.02}$$

If a 16-bit ADC achieves only 90 dB SNR, its ENOB is $\approx 14.6$ — thermal noise, clock jitter, and comparator metastability inside the ADC are consuming the remaining resolution.

### Interference

Unlike Johnson and shot noise, interference is not thermodynamically fundamental — it is an engineering failure. Sources:

- **Ground loops**: Two nominally grounded points sit at different potentials because current flows through shared ground impedance $Z_g$. Any signal current returning through $Z_g$ creates a voltage $V = I \cdot Z_g$ that appears in series with your measurement.
- **Capacitive coupling**: A changing voltage on an aggressor trace induces current into a victim trace via parasitic capacitance $C_p$:
$$I_{\text{induced}} = C_p \frac{dV_{\text{aggressor}}}{dt}$$
- **Inductive coupling**: Changing current in an aggressor loop induces voltage in a nearby loop via mutual inductance $M$:
$$V_{\text{induced}} = M \frac{dI_{\text{aggressor}}}{dt}$$
- **RFI rectification**: High-frequency signals entering an op-amp or transistor input are demodulated by the nonlinear junction, appearing as a DC offset shift or low-frequency artifact.

These are solved by differential signaling, proper single-point grounding, guard rings, shielding, and minimizing loop areas in PCB layout — none of which software can fix after the fact.

### Jitter

Jitter is temporal noise on a clock or data edge. A comparator threshold-crossing has uncertainty in time because thermal noise on its input is present at the moment of transition. If the signal crosses the threshold with slope $dV/dt$ and the rms input noise is $v_n$, the rms timing uncertainty is:

$$\sigma_t = \frac{v_n}{dV/dt}$$

This is a direct consequence of linearizing the threshold crossing: $\Delta V = (dV/dt) \cdot \Delta t$, so $\Delta t = \Delta V / (dV/dt)$.

For a 1 GHz clock edge with $dV/dt = 1\ \text{V/ns}$ and $v_n = 1\ \text{mV rms}$:

$$\sigma_t = \frac{1\ \text{mV}}{1\ \text{V/ns}} = 1\ \text{ps rms}$$

Aperture jitter in an ADC sample-and-hold directly limits ENOB at high input frequencies. For a sinusoidal input at frequency $f_{in}$ with aperture jitter $\sigma_t$, the SNR ceiling imposed by jitter alone is:

$$\text{SNR}_{\text{jitter}} = -20 \log_{10}(2\pi f_{in} \sigma_t)$$

A 14-bit ADC sampling a 100 MHz input signal requires aperture jitter below $\approx 0.6\ \text{ps rms}$ to not degrade ENOB below 14 bits. This is why high-speed ADC clock inputs require ultra-low-jitter oscillators, not the general-purpose clocks used for logic.

---

## How It
