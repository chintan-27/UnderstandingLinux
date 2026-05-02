---
id: 2
title: "Trigonometry"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Signals are everywhere in computing: audio buffers, network waveforms, CPU clock cycles, display refresh rates, and sensor inputs all behave as oscillations. Without trigonometry, you cannot decompose a sound into frequencies (audio codecs), cannot understand why a PLL (phase-locked loop) locks onto a clock signal, cannot reason about aliasing when sampling ADC data, and cannot read the math behind Fourier transforms that underpin `fft`-based tools in Linux. The sinusoid is the atom of signal processing — every periodic signal is a sum of them, and that fact is not incidental but mathematically provable (Fourier's theorem).

---

## Core Concepts

### The Sinusoid

A sinusoid is the projection of uniform circular motion onto a line. That geometric origin is why it appears wherever rotation or repetition exists — not by coincidence, but because circular motion *is* what these systems are doing in state space.

$$x(t) = A \sin(2\pi f t + \phi)$$

- $A$ — **amplitude**: peak displacement from zero. Scales energy by $A^2$ (power is proportional to amplitude squared).
- $f$ — **frequency** in Hz: cycles per second. Its reciprocal is the **period** $T = 1/f$. A 440 Hz tone has $T \approx 2.27\,\text{ms}$.
- $\phi$ — **phase** in radians: the cycle position at $t = 0$. It encodes *when* the signal started relative to your time reference.
- $t$ — time in seconds.

These four numbers completely describe any single-frequency sinusoid.

### Angular Frequency

Angular frequency $\omega = 2\pi f$ has units of radians per second. One full cycle sweeps $2\pi$ radians, so multiplying cycles-per-second by $2\pi$ converts to radians-per-second:

$$\omega = 2\pi f \implies x(t) = A\sin(\omega t + \phi)$$

The reason $\omega$ appears in DSP headers and kernel timer math rather than $f$ is that differentiation of $\sin(\omega t)$ yields $\omega\cos(\omega t)$ — the frequency falls out directly as a coefficient, which simplifies analysis of rates of change.

### Phase

Phase is a *relative* quantity — it only has meaning with respect to a reference. Given two signals:

$$x_1(t) = \sin(\omega t), \qquad x_2(t) = \sin(\omega t + \phi)$$

the time shift between them is:

$$\Delta t = \frac{\phi}{\omega} = \frac{\phi}{2\pi f}$$

At $f = 1\,\text{kHz}$ and $\phi = \pi/2$, that is $\Delta t = 1/(4 \times 10^3) = 250\,\mu\text{s}$.

Two signals are **in phase** when $\phi = 0$ — they add constructively, doubling amplitude. They are **phase-opposed** when $\phi = \pi$ — they cancel completely. Noise-canceling headphones generate $\phi = \pi$ on captured ambient sound and sum it with the original; the cancellation is not approximate but exact when the phase relationship holds precisely.

A phase shift of $\phi = \pi/2$ converts sine to cosine:

$$\sin\!\left(\omega t + \frac{\pi}{2}\right) = \cos(\omega t)$$

This is why sine and cosine are not two different functions but the same function with a quarter-cycle offset.

### Euler's Formula and Polar Form

Euler's formula connects circular motion to exponential growth in the complex plane:

$$e^{i\theta} = \cos\theta + i\sin\theta$$

The reason this is true follows from comparing the Taylor series of $e^{ix}$, $\cos x$, and $\sin x$ — the real and imaginary parts of the exponential series are exactly those of cosine and sine respectively. The consequence for signal processing is that a sinusoid is the imaginary part of a rotating complex exponential:

$$A\sin(\omega t + \phi) = \operatorname{Im}\!\left(A e^{i(\omega t + \phi)}\right)$$

**Polar form** represents a complex number by magnitude and angle:

$$z = r e^{i\theta}, \qquad r = |z|, \quad \theta = \arg(z)$$

In signal processing, $r$ is amplitude and $\theta$ is phase. The key algebraic fact:

$$z_1 z_2 = r_1 r_2\, e^{i(\theta_1 + \theta_2)}$$

Multiplication in polar form multiplies amplitudes and *adds* phases. This is the deep reason why convolution in the time domain (which is expensive: $O(N^2)$) becomes pointwise multiplication in the frequency domain (cheap: $O(N)$ after an $O(N \log N)$ FFT) — the FFT decomposes signals into polar form, where interaction is just multiplication.

### Superposition

When two sinusoids at the same frequency add, the result is a sinusoid at the same frequency — never a different one:

$$A_1\sin(\omega t + \phi_1) + A_2\sin(\omega t + \phi_2) = A_R\sin(\omega t + \phi_R)$$

The resultant phasor is vector addition in the complex plane:

$$A_R e^{i\phi_R} = A_1 e^{i\phi_1} + A_2 e^{i\phi_2}$$

$$A_R = \sqrt{A_1^2 + A_2^2 + 2A_1 A_2 \cos(\phi_2 - \phi_1)}$$

This is why interference is *geometric*: when $\phi_2 - \phi_1 = 0$, the cosine term is $+1$ and $A_R = A_1 + A_2$. When $\phi_2 - \phi_1 = \pi$, the cosine term is $-1$ and $A_R = |A_1 - A_2|$.

---

## How It Works

### Discretizing a Sinusoid

Real systems sample continuous signals at discrete time steps. At sample rate $f_s$ samples/second, the $n$-th sample is:

$$x[n] = A\sin\!\left(2\pi \frac{f}{f_s} n + \phi\right)$$

The quantity $\hat{\omega} = 2\pi f / f_s$ is the **normalized frequency** in radians per sample — the only frequency a digital system actually knows. All DSP operates on this dimensionless ratio; $f_s$ is the bridge back to physical time.

**The Nyquist criterion** requires:

$$f_s \geq 2 f_{\max}$$

The reason is not arbitrary: a sinusoid is uniquely determined by its frequency, amplitude, and phase, but when $f > f_s/2$, the samples of that sinusoid are identical to the samples of a lower-frequency sinusoid. The two are *aliases* of each other and the system cannot distinguish them. Violating Nyquist does not degrade the signal gracefully — it folds energy from $f$ into $f_s - f$, corrupting the entire band irreversibly.

At $f_s = 48000\,\text{Hz}$ (standard Linux ALSA rate), the Nyquist limit is $24\,\text{kHz}$, covering the audible range with margin.

### Generating a Sine Wave in C

The `phase_increment` $\hat{\omega} = 2\pi f / f_s$ advances the phase by exactly one sample's worth per step. We accumulate phase rather than computing $2\pi f n / f_s$ each iteration because: (1) it avoids multiplying by a growing integer $n$ whose product with a float eventually loses precision, and (2) it makes real-time frequency modulation trivial — change `phase_increment` and the output frequency changes on the next sample.

```c
#include <math.h>
#include <stdio.h>

#define SAMPLE_RATE 48000
#define FREQUENCY   440.0   /* A4 */
#define AMPLITUDE   0.8
#define DURATION    0.01    /* seconds -> 480 samples */

int main(void) {
    double phase           = 0.0;
    double phase_increment = 2.0 * M_PI * FREQUENCY / SAMPLE_RATE;
    int    num_samples     = (int)(DURATION * SAMPLE_RATE);

    for (int n = 0; n < num_samples; n++) {
        double sample = AMPLITUDE * sin(phase);
        printf("%.6f\n", sample);
        phase += phase_increment;
        if (phase >= 2.0 * M_PI)
            phase -= 2.0 * M_PI;   /* prevent float drift, not overflow */
    }
    return 0;
}
```

The modular reduction keeps `phase` in $[0, 2\pi)$, preventing slow accumulation of floating-point error. Without it, after $\sim 10^6$ samples the least-significant bits of `phase` begin to contaminate the sine computation.

### The Recurrence Form

`sin()` is expensive — typically 20–100 ns on modern hardware depending on the FPU implementation. The angle-addition identities give a way to step the sinusoid forward with only multiplications and additions:

$$\sin(\theta + \Delta) = \sin\theta\cos\Delta + \cos\theta\sin\Delta$$
$$\cos(\theta + \Delta) = \cos\theta\cos\Delta - \sin\theta\sin\Delta$$

Precompute $c_\Delta = \cos\hat{\omega}$ and $s_\Delta = \sin\hat{\omega}$ once; then:

```c
double s      = 0.0;   /* sin(0) */
double c      = 1.0;   /* cos(0) */
double c_d    = cos(phase_increment);
double s_d    = sin(phase_increment);

for (int n = 0;
