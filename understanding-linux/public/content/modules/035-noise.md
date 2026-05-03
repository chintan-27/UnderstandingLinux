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

Every analog measurement system has a noise floor below which signals are unrecoverable — not because of poor design, but because thermodynamics and quantum mechanics forbid otherwise. If you do not understand where that floor comes from, you will build amplifier chains that faithfully amplify garbage, pick ADC resolutions that exceed what the analog front-end can actually resolve, and misread oscilloscope noise as signal artifacts. Linux interacts with this physics directly: the `hwrng` subsystem harvests shot noise and avalanche noise for entropy; ALSA and ASoC drivers expose analog front-end noise floors; IIO ADC drivers report effective resolution that thermal noise often limits before quantization does; and clock PLLs accumulate jitter that phase noise theory predicts exactly.

---

## Core Concepts

### Thermal (Johnson) Noise

Any resistor at temperature $T$ contains electrons in thermal equilibrium with the lattice. Their random kinetic energy produces a fluctuating open-circuit voltage — **Johnson noise** — that is independent of the resistor's material, geometry, or fabrication. It depends only on $R$ and $T$.

The noise voltage spectral density (RMS voltage per root-hertz) is:

$$e_n = \sqrt{4 k_B T R}$$

where $k_B = 1.38 \times 10^{-23}\ \text{J/K}$ and $T$ is in Kelvin. Units: $\text{V}/\sqrt{\text{Hz}}$.

**Why $\sqrt{R}$?** The fluctuation-dissipation theorem says a resistor in thermal equilibrium delivers noise *power* $k_B T$ per Hz into a matched load, independent of $R$. Power into a load $R_L = R$ is $V^2/(4R)$, so $V^2 \propto R$, giving $V \propto \sqrt{R}$.

Two reference points worth memorizing (290 K):

| Resistance | $e_n$ |
|---|---|
| $100\ \Omega$ | $1.28\ \text{nV}/\sqrt{\text{Hz}}$ |
| $1\ \text{k}\Omega$ | $4.05\ \text{nV}/\sqrt{\text{Hz}}$ |

Scale from either anchor: $e_n(R) = e_n(R_0)\cdot\sqrt{R/R_0}$.

Total RMS noise over bandwidth $B$:

$$V_{n,\text{rms}} = \sqrt{4 k_B T R B}$$

Bandwidth $B$ here is the *noise bandwidth* of the filter, not its $-3\ \text{dB}$ point. For a single-pole RC lowpass, the noise bandwidth is $\pi/2$ times the $-3\ \text{dB}$ frequency:

$$B_n = \frac{\pi}{2} f_{-3\text{dB}} = \frac{1}{4RC}$$

This is why a $10\ \text{k}\Omega$ source resistor with a 10 kHz bandwidth produces:

$$V_{n,\text{rms}} = \sqrt{4 \times 1.38\times10^{-23} \times 290 \times 10^4 \times 10^4} \approx 1.3\ \mu\text{V}$$

That is 1.3 μV of irreducible noise on any signal measured through that source — a hard limit on the minimum detectable signal.

The short-circuit noise *current* density is:

$$i_n = \frac{e_n}{R} = \sqrt{\frac{4 k_B T}{R}}$$

Larger $R$ → more voltage noise, less current noise. This trade-off becomes critical when choosing between transimpedance and voltage amplifier topologies for high-impedance sources like photodiodes.

---

### Shot Noise

When discrete charges cross a potential barrier — a diode junction, a BJT's base-collector depletion region, a tunnel junction — each crossing is a statistically independent Poisson event. The discreteness of charge produces current fluctuations called **shot noise**:

$$i_n = \sqrt{2 q I_{DC}}$$

where $q = 1.6 \times 10^{-19}\ \text{C}$ and $I_{DC}$ is the mean current.

**Why not in resistors?** In a metallic conductor, charge carriers are not independent — Coulomb correlations between the dense electron gas suppress fluctuations orders of magnitude below the Poisson (shot noise) prediction. Shot noise requires both a potential barrier *and* statistically independent crossings. A reverse-biased diode, BJT collector junction, or vacuum tube satisfies this; a copper trace does not.

For a BJT with $I_C = 100\ \mu\text{A}$:

$$i_n = \sqrt{2 \times 1.6\times10^{-19} \times 10^{-4}} \approx 5.7\ \text{pA}/\sqrt{\text{Hz}}$$

The BJT's intrinsic transconductance gives $r_e = k_BT/(qI_C) = 26\ \text{mV}/I_C$, so the input-referred shot noise voltage is:

$$e_{n,\text{shot}} = r_e \cdot i_n = \frac{k_BT}{qI_C}\sqrt{2qI_C} = \sqrt{\frac{2(k_BT)^2}{qI_C}} = \sqrt{\frac{2k_BT}{q} \cdot \frac{k_BT}{I_C}}$$

At 290 K, $k_BT/q \approx 25\ \text{mV}$:

$$e_{n,\text{shot}} \approx \sqrt{\frac{2 \times 25\ \text{mV} \times 25\ \text{mV}}{I_C}} = \frac{35.4\ \text{mV}/\sqrt{\text{Hz}}}{\sqrt{I_C[\text{A}]}}$$

At $I_C = 1\ \text{mA}$: $e_{n,\text{shot}} \approx 1.12\ \text{nV}/\sqrt{\text{Hz}}$.

The practical consequence: increasing $I_C$ lowers voltage noise because $r_e$ decreases as $1/I_C$ while shot current grows only as $\sqrt{I_C}$, so the product falls as $1/\sqrt{I_C}$. There is a cost — higher current noise $i_n$ — so the optimum bias current depends on the source impedance driving the transistor.

---

### 1/f Noise (Flicker Noise)

Johnson and shot noise are *white* — constant power spectral density across frequency. All real semiconductor devices add **flicker noise** with power spectral density that rises as $1/f$:

$$S_v(f) \propto \frac{1}{f} \implies e_n(f) \propto \frac{1}{\sqrt{f}}$$

The microscopic origin is carrier trapping and release at defect sites in semiconductor interfaces (primarily the Si/SiO₂ interface in MOSFETs). Carriers are randomly captured into trap states and released after a distribution of dwell times; the superposition of many such random telegraph signals with exponentially distributed time constants produces exactly $1/f$ spectral shape.

The **corner frequency** $f_c$ is where flicker noise power equals white noise power. Above $f_c$, white noise dominates; below it, flicker dominates. MOSFETs have $f_c$ ranging from a few Hz (p-channel, buried-channel) to tens of MHz (n-channel MOSFET in processes with high interface state density). BJTs typically have $f_c$ below 1 kHz. This is why BJTs are preferred in low-noise audio and precision DC amplifiers despite inferior high-frequency performance.

---

### Signal-to-Noise Ratio

$$\text{SNR} = \frac{P_{\text{signal}}}{P_{\text{noise}}}$$

In decibels, using RMS voltages across the same impedance:

$$\text{SNR}_{\text{dB}} = 20 \log_{10}\!\left(\frac{V_{\text{signal,rms}}}{V_{\text{noise,rms}}}\right)$$

For an ideal $N$-bit ADC with a full-scale sinusoidal input, quantization noise is uniformly distributed over $\pm q/2$ where $q = V_{FS}/2^N$ is the LSB voltage. The RMS quantization noise is $q/\sqrt{12}$, and the RMS value of a full-scale sine is $V_{FS}/(2\sqrt{2})$, giving:

$$\text{SNR}_{\text{dB}} = 20\log_{10}\!\left(\frac{V_{FS}/(2\sqrt{2})}{(V_{FS}/2^N)/\sqrt{12}}\right) = 20\log_{10}\!\left(\frac{2^N\sqrt{12}}{2\sqrt{2}}\right) \approx 6.02N + 1.76\ \text{dB}$$

Each bit adds 6.02 dB — one bit doubles the voltage resolution, which is a factor of 4 in power.

However, thermal noise from the source resistance and ADC input network frequently limits the *effective* resolution. If the RMS thermal noise referred to the ADC input is $V_{n,\text{rms}}$, the effective number of bits is:

$$\text{ENOB} = \frac{\text{SNR}_{\text{actual}} - 1.76}{6.02}$$

A 16-bit ADC ($\text{SNR}_\text{theoretical} = 98\ \text{dB}$) with a $1\ \text{k}\Omega$ source and 1 MHz bandwidth has $V_{n,\text{rms}} = \sqrt{4 \times 1.38\times10^{-23} \times 290 \times 10^3 \times 10^6} \approx 4\ \mu\text{V}$.
