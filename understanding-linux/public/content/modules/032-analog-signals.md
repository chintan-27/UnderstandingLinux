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

Digital systems live inside analog physics. Every wire has capacitance, every trace has inductance, and every signal you care about — audio, RF, sensor data, clock edges — is a voltage varying continuously in time. When you read from `/dev/snd` or `/dev/i2c-0`, the kernel hands you integers that were carved out of a continuous waveform by a sampling process. If you don't understand frequency content, bandwidth, and filtering, you cannot reason about why a microphone sounds muffled after a misconfigured ALSA period size, why a high-speed serial link fails at 1 GHz but works at 100 MHz, why ADC readings are noisy, or how a PLL stabilizes a CPU clock. The math here is not decoration — it is the actual mechanism by which hardware works or fails.

---

## Core Concepts

### Waveforms and the Time Domain

A waveform is a function $v(t)$ — voltage as a function of time. A pure sine wave at frequency $f_0$ is:

$$v(t) = A \sin(2\pi f_0 t + \phi)$$

where $A$ is amplitude in volts, $f_0$ is frequency in Hz, and $\phi$ is phase in radians. This is the fundamental building block because Fourier's theorem guarantees that *any* periodic waveform decomposes into a sum of sinusoids. Circuits respond linearly to each sinusoidal component independently, so decomposing a signal into sinusoids lets you predict what any linear circuit does to it.

The waveforms that fall naturally out of RC charging curves and digital comparator output — square waves, triangle waves, sawtooth waves — are not single tones. They contain many simultaneous frequency components. Sine waves require deliberate circuit design (oscillators with feedback and amplitude control) but are essential for clean frequency synthesis, audio, and RF work precisely because they contain only one frequency component.

### The Frequency Domain

Instead of asking "what is the voltage at time $t$?", the frequency domain asks "how much energy exists at frequency $f$?". The Fourier transform converts between these views:

$$V(f) = \int_{-\infty}^{\infty} v(t)\, e^{-j2\pi f t}\, dt$$

The complex exponential $e^{-j2\pi ft} = \cos(2\pi ft) - j\sin(2\pi ft)$ acts as a correlation kernel: $V(f)$ is large when $v(t)$ oscillates coherently at frequency $f$, and small when it does not. For a pure sine wave, $V(f)$ is zero everywhere except at $\pm f_0$. For a square wave with fundamental $f_0$, the Fourier series is:

$$v(t) = \frac{4A}{\pi} \sum_{n=1,3,5,...} \frac{1}{n} \sin(2\pi n f_0 t)$$

Components exist at $f_0$, $3f_0$, $5f_0$, ... with amplitudes falling as $1/n$. This is why a square-wave clock signal radiates EMI across a wide spectrum: a 100 MHz clock contains significant energy at 300 MHz, 500 MHz, 700 MHz, and beyond. Faster edges (shorter rise times) push that energy to even higher harmonics — this is the direct causal link between edge rate and EMI.

The **power spectral density** (PSD) describes how noise or signal power is distributed across frequency, in units of $\text{V}^2/\text{Hz}$ or equivalently $\text{V}/\sqrt{\text{Hz}}$. White noise has a flat PSD: equal power per hertz at all frequencies, because its autocorrelation is a delta function. Pink noise ($1/f$ noise) has PSD that rises as frequency decreases — this is dominant in semiconductor devices at low frequencies and is why op-amp noise floors rise below a few hundred Hz.

### Bandwidth

Bandwidth is the range of frequencies a system passes, processes, or represents. For a simple RC low-pass filter, the $-3\,\text{dB}$ bandwidth is:

$$f_{3\text{dB}} = \frac{1}{2\pi RC}$$

At this frequency, output amplitude is $1/\sqrt{2} \approx 0.707$ of the input amplitude, and output *power* is half the input power. The $-3\,\text{dB}$ figure comes from:

$$20 \log_{10}\!\left(\frac{1}{\sqrt{2}}\right) = -10 \log_{10}(2) \approx -3.01\,\text{dB}$$

Bandwidth constrains noise: since thermal noise power is proportional to bandwidth, **halving bandwidth halves noise power**, or equivalently reduces RMS noise voltage by $1/\sqrt{2}$. This is a hard physical bound — no amount of amplification recovers a signal already buried by in-band noise.

### Filtering

A filter is a frequency-selective network characterized by its transfer function $H(f) = V_{\text{out}}(f) / V_{\text{in}}(f)$. The four canonical types:

| Type | Passes | Blocks |
|---|---|---|
| Low-pass | $f < f_c$ | $f > f_c$ |
| High-pass | $f > f_c$ | $f < f_c$ |
| Band-pass | $\|f - f_0\| < B/2$ | Everything outside the band |
| Band-stop (notch) | Everything outside the band | $\|f - f_0\| < B/2$ |

A single RC stage gives a $-20\,\text{dB/decade}$ rolloff above $f_{3\text{dB}}$. Cascading $n$ identical buffered RC stages increases rolloff to $-20n\,\text{dB/decade}$, but the actual $-3\,\text{dB}$ frequency shifts downward. The corrected cutoff is:

$$f_{3\text{dB}}(n) = f_{3\text{dB}}(1) \cdot \sqrt{2^{1/n} - 1}$$

For $n = 4$ stages, $\sqrt{2^{1/4}-1} \approx 0.435$, so the actual cutoff is less than half what each individual stage provides. This is why active filter topologies (Butterworth, Chebyshev, Bessel) are designed as a unit rather than stacked identical stages — they place poles at specific locations in the complex plane to achieve a target response while compensating for this frequency shift.

---

## How It Works

### The RC Low-Pass Filter in Detail

Resistor $R$ in series, capacitor $C$ to ground, output taken across $C$. The capacitor's impedance is $Z_C = 1/(j2\pi f C)$. The circuit is a voltage divider:

$$H(f) = \frac{Z_C}{R + Z_C} = \frac{1}{1 + j2\pi f RC} = \frac{1}{1 + j(f/f_{3\text{dB}})}$$

The magnitude and phase are:

$$|H(f)| = \frac{1}{\sqrt{1 + (f/f_{3\text{dB}})^2}}, \qquad \angle H(f) = -\arctan\!\left(\frac{f}{f_{3\text{dB}}}\right)$$

The causal mechanism: at high $f$, $Z_C \to 0$, shorting the output node to ground. At low $f$, $Z_C \to \infty$, making the capacitor an open circuit through which no current flows across $R$, so $V_{\text{out}} = V_{\text{in}}$. The $-45°$ phase at exactly $f_{3\text{dB}}$ is a direct consequence of $R$ and $Z_C$ having equal magnitude there.

The time-domain view: the same circuit is characterized by its time constant $\tau = RC$. A step input charges the capacitor as:

$$v_{\text{out}}(t) = V_{\text{step}} \left(1 - e^{-t/\tau}\right)$$

The $10\%$–$90\%$ rise time is $t_r \approx 2.2\tau = 2.2RC$. This is directly linked to bandwidth:

$$t_r \approx \frac{0.35}{f_{3\text{dB}}}$$

This $0.35 / f_{3\text{dB}}$ relationship (specific to a single-pole system) is used constantly in oscilloscope measurements: an oscilloscope with $f_{3\text{dB}} = 100\,\text{MHz}$ cannot accurately display rise times faster than $\approx 3.5\,\text{ns}$.

### Thermal Noise and Bandwidth — A Concrete Example

Thermal (Johnson–Nyquist) noise arises from random electron motion in any resistor. The noise voltage spectral density is:

$$e_n = \sqrt{4 k_B T R} \quad [\text{V}/\sqrt{\text{Hz}}]$$

where $k_B = 1.38 \times 10^{-23}\,\text{J/K}$ and $T$ is temperature in kelvin. This is white noise — flat across all frequencies. The total RMS noise over bandwidth $B$ is:

$$v_{n,\text{rms}} = e_n \sqrt{B} = \sqrt{4 k_B T R B}$$

At $T = 300\,\text{K}$, $R = 1\,\text{k}\Omega$, $B = 10\,\text{kHz}$:

$$v_{n,\text{rms}} = \sqrt{4 \times 1.38\times10^{-23} \times 300 \times 10^3 \times 10^4} = \sqrt{1.656\times10^{-13}} \approx 12.9\,\text{nV}_{\text{rms}}$$

That is 12.9 nV over a 10
