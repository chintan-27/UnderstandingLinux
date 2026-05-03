---
id: 3
title: "Complex numbers"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every signal your Linux machine processes — audio samples from ALSA, IQ samples from an RTL-SDR dongle, packet waveforms decoded by a modem driver — is a sinusoid with an amplitude and a phase. Tracking those two quantities separately forces you into product-to-sum trig identities every time signals combine. Complex numbers eliminate that: a single complex number encodes both, multiplication of complex numbers *is* rotation-plus-scaling, and differentiation of $e^{i\omega t}$ collapses to multiplication by $i\omega$. That last fact is why the Fourier transform, the FFT, impedance analysis, and PLLs all become tractable — the derivative operator turns into scalar multiplication, converting differential equations into algebra.

---

## Core Concepts

### Real and Imaginary Parts

A complex number $z = a + bi$ is a point in the 2D complex plane. The real axis is horizontal; the imaginary axis is vertical. The unit imaginary $i$ satisfies $i^2 = -1$, which forces rotational behavior: multiplying any complex number by $i$ rotates it 90° counterclockwise. Multiply twice and you get $i^2 = -1$: a 180° rotation, which is scalar negation. The real numbers are not a separate system — they are the subset of the complex plane lying on the horizontal axis.

### Polar Form and Why Multiplication is Rotation

Every complex number has a polar representation:

$$z = r e^{i\theta} = r(\cos\theta + i\sin\theta)$$

where $r = |z| = \sqrt{a^2 + b^2}$ is the **magnitude** and $\theta = \arg(z) = \text{atan2}(b, a)$ is the **phase angle**. (Use `atan2`, not `arctan(b/a)` — the two-argument form handles all quadrants correctly, which matters in code.)

When you multiply two complex numbers in polar form:

$$z_1 z_2 = r_1 e^{i\theta_1} \cdot r_2 e^{i\theta_2} = r_1 r_2 \, e^{i(\theta_1 + \theta_2)}$$

Magnitudes multiply; angles add. This is the geometric fact that makes complex numbers the right tool for waves: combining two oscillations is composing a rotation and a scaling, not expanding $\cos(\alpha)\cos(\beta)$ with identities.

### Euler's Formula is a Theorem, Not a Definition

$$e^{i\theta} = \cos\theta + i\sin\theta$$

This follows from substituting $i\theta$ into the Taylor series of $e^x$:

$$e^{i\theta} = \sum_{n=0}^{\infty} \frac{(i\theta)^n}{n!} = \underbrace{\left(1 - \frac{\theta^2}{2!} + \frac{\theta^4}{4!} - \cdots\right)}_{\cos\theta} + i\underbrace{\left(\theta - \frac{\theta^3}{3!} + \frac{\theta^5}{5!} - \cdots\right)}_{\sin\theta}$$

The even powers of $i$ cycle through $1, -1, 1, -1, \ldots$ (real), so their terms collect into the cosine series. The odd powers cycle through $i, -i, i, -i, \ldots$ (imaginary), collecting into the sine series. There is no assumption here — this is a structural consequence of how $i^2 = -1$ distributes through the power series.

The immediate corollary:

$$e^{i\pi} + 1 = 0$$

is not numerology. It says that rotating by $\pi$ radians maps $1$ to $-1$, which is the definition of negation in the complex plane.

### Phasors

A phasor represents a **steady-state sinusoidal signal** by factoring out the time dependence. A physical voltage:

$$v(t) = V_0 \cos(\omega t + \phi) = \text{Re}\!\left(V_0 e^{i(\omega t + \phi)}\right) = \text{Re}\!\left(\tilde{V} \, e^{i\omega t}\right)$$

defines the phasor $\tilde{V} = V_0 e^{i\phi}$, which encodes amplitude and phase offset but not time. When every signal in a circuit shares the same $\omega$ — the steady-state assumption — the $e^{i\omega t}$ factor appears on both sides of every equation and cancels. You work entirely with phasors.

The key step: $\frac{d}{dt}\bigl(\tilde{V} e^{i\omega t}\bigr) = i\omega \tilde{V} e^{i\omega t}$. Differentiation with respect to time is exactly multiplication of the phasor by $i\omega$. This is the mechanism that converts differential equations to algebra.

### Impedance

Impedance $Z$ is the complex generalization of resistance, defined by:

$$\tilde{V} = Z \tilde{I}$$

For the three passive components, the impedances follow directly from their voltage-current relationships after applying $\frac{d}{dt} \to i\omega$:

| Component | Time-domain relation | Phasor substitution | Impedance |
|-----------|---------------------|---------------------|-----------|
| Resistor $R$ | $v = Ri$ | — | $Z_R = R$ |
| Inductor $L$ | $v = L\,di/dt$ | $\tilde{V} = L(i\omega)\tilde{I}$ | $Z_L = i\omega L$ |
| Capacitor $C$ | $i = C\,dv/dt$ | $\tilde{I} = C(i\omega)\tilde{V}$ | $Z_C = \tfrac{1}{i\omega C} = \tfrac{-i}{\omega C}$ |

The $i$ in $Z_L$ and $Z_C$ is the 90° phase shift. For an inductor, multiplying the current phasor by $i\omega L$ rotates it 90° counterclockwise — voltage leads current. For a capacitor, $Z_C = -i/(\omega C)$ rotates the voltage phasor 90° clockwise relative to current — current leads voltage. These are not rules to memorize; they fall out of the geometry.

---

## How It Works

### RC Circuit: From ODE to Ohm's Law

Without phasors, the series RC circuit driven by $V_0\cos(\omega t)$ requires solving:

$$R \frac{dq}{dt} + \frac{q}{C} = V_0 \cos(\omega t)$$

With phasors, substitute $v(t) = \text{Re}(\tilde{V} e^{i\omega t})$, use $\frac{d}{dt} \to i\omega$, and cancel $e^{i\omega t}$:

$$(Z_R + Z_C)\,\tilde{I} = \tilde{V} \implies \left(R + \frac{1}{i\omega C}\right)\tilde{I} = \tilde{V}$$

The total impedance is:

$$Z = R - \frac{i}{\omega C}$$

with magnitude and phase:

$$|Z| = \sqrt{R^2 + \frac{1}{\omega^2 C^2}}, \qquad \theta = \arctan\!\left(\frac{-1}{\omega RC}\right)$$

At low frequencies ($\omega \to 0$), $|Z| \to \infty$ — the capacitor blocks DC. At high frequencies ($\omega \to \infty$), $|Z| \to R$ — the capacitor shorts. The cutoff frequency where $R = 1/(\omega C)$, giving $|Z| = R\sqrt{2}$ and $\theta = -45°$, is:

$$\omega_c = \frac{1}{RC}, \qquad f_c = \frac{1}{2\pi RC}$$

This is the $-3\,\text{dB}$ corner frequency of the RC low-pass filter — the same number that appears in ALSA's filter coefficients, kernel IIR implementations, and SDR decimation chains.

### Computing with Complex Numbers in C

The C99 `<complex.h>` header provides the `double complex` type and functions matching the math. The Linux kernel itself avoids floating-point in kernel space (the FPU state is not saved across context switches unless explicitly requested), but userspace DSP code, `libm`, FFTW, and GNU Radio all use this interface.

```c
#include <stdio.h>
#include <complex.h>
#include <math.h>

int main(void) {
    /* RC low-pass: R=1kΩ, C=100nF → f_c = 1/(2π·1e3·1e-7) ≈ 1591.5 Hz */
    double omega = 2.0 * M_PI * 1000.0;  /* drive at 1 kHz, below f_c */
    double R     = 1000.0;               /* 1 kΩ */
    double C     = 1e-7;                 /* 100 nF */

    double complex Z_R     = R;
    double complex Z_C     = 1.0 / (I * omega * C);
    double complex Z_total = Z_R + Z_C;

    printf("Z       = %+.2f %+.2fi Ω\n", creal(Z_total), cimag(Z_total));
    printf("|Z|     = %.4f Ω\n",           cabs(Z_total));
    printf("phase   = %.4f°\n",            carg(Z_total) * 180.0 / M_PI);

    /* Voltage divider: output across C given V_in = 1∠0° */
    double complex V_in
