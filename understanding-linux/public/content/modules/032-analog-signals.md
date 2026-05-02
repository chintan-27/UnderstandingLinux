---
id: 32
title: "Analog signals"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

Digital systems live inside an analog world. Every clock signal has rise times governed by bandwidth. Every ADC samples a continuous voltage. Every USB cable is a transmission line with frequency-dependent loss. If you don't understand how signals behave in the frequency domain — what bandwidth means, why filters exist, what happens when you violate sampling constraints — you will misread oscilloscope traces, misinterpret noise floors, and write kernel drivers that silently corrupt data.

The Linux kernel's ALSA audio subsystem, the IIO (Industrial I/O) ADC framework, and `libsigrok`-backed software-defined radio all rely on these concepts for correctness. This module gives you the substrate to reason about them precisely.

---

## Core Concepts

### Waveforms: Signals as Functions of Time

A waveform is a voltage expressed as a function of time: $v(t)$. The sinusoid is fundamental because it is the eigenfunction of linear time-invariant (LTI) systems — pass a sine through any linear circuit and the output is a sine at the same frequency, only scaled and phase-shifted. No other waveform shape has this property, which is exactly why frequency-domain analysis is so powerful.

$$v(t) = A \sin(2\pi f t + \phi)$$

where $A$ is amplitude (V), $f$ is frequency (Hz), $\phi$ is phase (radians).

Every periodic waveform is a sum of sinusoids — not an approximation, but an exact decomposition. A square wave with fundamental $f_0$ and amplitude $A$:

$$v(t) = \frac{4A}{\pi} \sum_{k=0}^{\infty} \frac{1}{2k+1} \sin\!\bigl(2\pi (2k+1) f_0 t\bigr)$$

The series never terminates. A perfect square wave requires infinite bandwidth. The square waves on your SPI bus are rounded precisely because harmonics above the system bandwidth are attenuated — the higher the bit rate relative to bandwidth, the worse the distortion. A $10\ \text{MHz}$ SPI clock needs clean content up through at least the 5th harmonic ($50\ \text{MHz}$) to preserve acceptable edge timing.

### Frequency Domain: The Spectrum of a Signal

The Fourier Transform answers a different question than the time domain. Rather than "what is the voltage at time $t$?", it asks "what amplitude and phase does each frequency component carry?"

$$V(f) = \int_{-\infty}^{\infty} v(t)\, e^{-j2\pi f t}\, dt$$

$V(f)$ is complex. Its magnitude $|V(f)|$ is the **amplitude spectrum**. Key examples:

- A pure $1\ \text{kHz}$ sine: a single spike at $1\ \text{kHz}$.
- A square wave at $f_0$: spikes at $f_0, 3f_0, 5f_0, \ldots$ (odd harmonics), each decaying as $1/(2k+1)$.
- A narrow pulse of width $\tau$: a $\text{sinc}$ spectrum with first null at $1/\tau$, spreading energy across a bandwidth $\sim 1/\tau$. This is why fast digital edges cause EMI — a $1\ \text{ns}$ edge has spectral content out to $\sim 1\ \text{GHz}$.

For sampled data, the Discrete Fourier Transform (DFT) — computed via the FFT algorithm in $O(N \log N)$ rather than $O(N^2)$ — performs the same decomposition. ALSA's period/buffer management, the IIO subsystem's sample rate configuration, and every DSP filter in `PipeWire` operate in this framework.

### Bandwidth: The Frequency Range a System Passes

Bandwidth ($BW$) is the range of frequencies a system transmits without unacceptable attenuation. The standard definition is the **−3 dB bandwidth**: the frequency at which output power drops to half its passband value, equivalently where amplitude drops to $1/\sqrt{2} \approx 0.707$.

$$f_c = \frac{1}{2\pi RC} \qquad \text{(first-order RC)}$$

Bandwidth has three distinct meanings that must not be conflated:

| Context | Meaning |
|---|---|
| **Signal bandwidth** | Frequency span occupied by the signal |
| **Channel bandwidth** | Maximum frequency range the medium passes without distortion |
| **Noise bandwidth** | Frequency range over which noise power is integrated |

If signal bandwidth exceeds channel bandwidth, high-frequency components are lost — the signal is distorted in shape, not just amplitude. If noise bandwidth is unnecessarily wide (e.g., an ADC input with no anti-aliasing filter), excess noise power aliases into the signal band and degrades SNR irrecoverably.

### Filtering: Shaping the Spectrum Deliberately

A filter passes some frequencies and attenuates others. The four types:

| Type | Passes | Attenuates |
|------|--------|------------|
| Lowpass | Below $f_c$ | Above $f_c$ |
| Highpass | Above $f_c$ | Below $f_c$ |
| Bandpass | Near $f_0$ | Far from $f_0$ |
| Notch (band-reject) | Far from $f_0$ | Near $f_0$ |

Filters exist because noise is broadband and signals are not. A lowpass filter before an ADC is not optional decoration — it prevents frequencies above the Nyquist limit ($f_s/2$) from aliasing into the signal band. Once aliased, those frequency components are indistinguishable from legitimate signal; no amount of digital post-processing can remove them. This is the function of the **anti-aliasing filter** (AAF), and its cutoff must satisfy $f_c \leq f_s/2$.

A sharper filter (steeper rolloff past $f_c$) requires higher order — more poles — which introduces increasing group delay and phase nonlinearity. Pulses passed through a high-order filter arrive distorted in time even when their frequency-domain amplitudes are preserved. This matters in data acquisition, audio, and any system where pulse shape carries information.

---

## How It Works

### The RC Lowpass Filter in Detail

The capacitor's impedance is frequency-dependent:

$$Z_C = \frac{1}{j2\pi f C}$$

Because impedance decreases with frequency, the capacitor shunts higher frequencies to ground more effectively. The transfer function (output/input ratio as a function of frequency) is a voltage divider:

$$H(f) = \frac{Z_C}{R + Z_C} = \frac{1}{1 + j(f/f_c)}, \qquad f_c = \frac{1}{2\pi RC}$$

The magnitude and phase responses:

$$|H(f)| = \frac{1}{\sqrt{1 + (f/f_c)^2}}, \qquad \angle H(f) = -\arctan(f/f_c)$$

Checkpoints:

| $f/f_c$ | $|H|$ | dB |
|---|---|---|
| 0.1 | 0.995 | −0.04 |
| 1.0 | 0.707 | −3.01 |
| 10 | 0.0995 | −20.0 |
| 100 | 0.00999 | −40.0 |

Above $f_c$, attenuation increases at exactly **−20 dB/decade** (equivalently −6 dB/octave). This is first-order rolloff. To compute the attenuation at any frequency:

$$\text{Attenuation (dB)} = -20 \log_{10}\!\sqrt{1 + (f/f_c)^2} \approx -20\log_{10}(f/f_c) \quad \text{for } f \gg f_c$$

For $n$ buffered identical RC sections, the composite −3 dB frequency is not $f_c$ but:

$$f_{3\text{dB}}(n) = f_c \cdot \sqrt{2^{1/n} - 1}$$

For $n=2$: $f_{3\text{dB}} \approx 0.644\, f_c$. Each stage must be designed to a *higher* individual cutoff to hit the target composite cutoff. The rolloff steepens to $-20n\ \text{dB/decade}$, but phase shift grows — each pole contributes up to $-90°$ at high frequencies, so a 4-pole filter can produce $-360°$ of phase shift, which is relevant for stability in feedback systems.

### Decibels: The Unit of Attenuation

Power and voltage ratios span many orders of magnitude; dB collapses them to a manageable scale.

$$\text{dB (power)} = 10 \log_{10}\!\left(\frac{P_2}{P_1}\right), \qquad \text{dB (voltage)} = 20 \log_{10}\!\left(\frac{V_2}{V_1}\right)$$

The factor of 20 for voltage follows directly from $P \propto V^2$: $10\log_{10}(V^2) = 20\log_{10}(V)$. Using 10 for a voltage ratio is a common and consequential error.

| dB | Voltage ratio | Power ratio | Meaning |
|----|---------------|-------------|---------|
| 0 | 1.000 | 1.000 | No change |
| −3 | 0.707 | 0.500 | Half power |
| −6 | 0.501 | 0.251 | ~Half voltage |
| −20 | 0.100 | 0.010 | Tenth of voltage |
| −40 | 0.010 | 0.0001 | Hundredth of voltage |
| −60 | 0.001 | $10^{-6}$ | Thousandth of voltage |

dBV and dBu are absolute references (0 dBV = 1 V RMS; 0 d
