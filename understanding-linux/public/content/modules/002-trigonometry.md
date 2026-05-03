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

Every repeating phenomenon in computing — audio samples, clock signals, ADC readings, network jitter profiles — decomposes into sinusoids. This is not a metaphor. The Linux audio stack (`ALSA`, `PulseAudio`, `PipeWire`) fills ring buffers with PCM samples computed from exactly the formula below. The kernel's `clocksource` subsystem and hardware PLLs lock frequencies by minimizing phase error between two sinusoids. `scipy.signal`, `numpy.fft`, and every DSP library you will ever call are manipulating amplitudes, frequencies, and phases. If you do not own this math, you are guessing.

---

## Core Concepts

### The Sinusoid

$$f(t) = A \sin(2\pi f t + \phi)$$

- $A$ — **amplitude**: peak displacement from zero. Doubling $A$ doubles the energy in the signal (power scales as $A^2$).
- $f$ — **frequency** in Hz. Determines pitch for audio, color for light, switching rate for a clock line.
- $\phi$ — **phase** in radians: a horizontal shift. It does not change energy, but it determines how two signals interact when summed.
- $T = 1/f$ — **period**: time for one complete cycle. A 440 Hz signal has $T = 1/440 \approx 2.27\ \text{ms}$.

**Why sine specifically?** Sine and cosine are the only functions satisfying:

$$\frac{d^2 y}{dt^2} = -\omega^2 y$$

Any system with a restoring force proportional to displacement — a spring, an LC tank circuit, a vibrating membrane — obeys this equation and therefore oscillates sinusoidally. The math does not prefer sine; nature keeps producing it because this differential equation appears everywhere.

### Angular Frequency

$$\omega = 2\pi f \quad \text{(radians per second)}$$

One full cycle covers $2\pi$ radians, so $\omega$ is the rate at which the phase angle advances. The sinusoid becomes:

$$f(t) = A \sin(\omega t + \phi)$$

You will see $\omega$ everywhere in DSP and kernel clock code because it eliminates the $2\pi$ factor in derivatives: $\frac{d}{dt}\sin(\omega t) = \omega\cos(\omega t)$.

### Cosine Is Not a Separate Concept

$$\cos\theta = \sin\!\left(\theta + \frac{\pi}{2}\right)$$

Cosine is sine advanced by a quarter cycle. When you see both in DSP code, one is always derivable from the other. They appear together because real and imaginary components of a complex exponential are cosine and sine respectively — which leads directly to the next point.

### Euler's Formula and Phasors

$$e^{i\theta} = \cos\theta + i\sin\theta$$

A sinusoid is the projection of a rotating complex number onto the real (or imaginary) axis. A point moving at constant angular velocity $\omega$ on the unit circle traces a sine wave when viewed edge-on. This is not just notational convenience — it is the reason sinusoids are preserved under differentiation, integration, and linear filtering: the only effect is a change in amplitude and phase, never a change in shape.

A **phasor** encodes amplitude and phase as a single complex number:

$$\tilde{s} = A e^{i\phi} = A(\cos\phi + i\sin\phi)$$

The time-domain signal is recovered as:

$$s(t) = \operatorname{Re}\!\left[\tilde{s}\cdot e^{i\omega t}\right] = A\cos(\omega t + \phi)$$

Phasors reduce phase arithmetic to complex multiplication. Adding a phase offset $\Delta\phi$ is multiplication by $e^{i\Delta\phi}$. This is exactly what DSP libraries exploit internally.

### Phase

$$s_1(t) = \sin(\omega t), \qquad s_2(t) = \sin(\omega t + \phi)$$

When $\phi = 0$: constructive — summing gives $2\sin(\omega t)$.  
When $\phi = \pi/2$: orthogonal — the signals share no correlated energy.  
When $\phi = \pi$: destructive — the sum is identically zero.

The time delay corresponding to a phase shift is:

$$\Delta t = \frac{\phi}{\omega} = \frac{\phi}{2\pi f}$$

A $\pi$ phase shift at 440 Hz corresponds to $\Delta t = 1/(2\times 440) \approx 1.14\ \text{ms}$ — the travel time difference equivalent to about 39 cm of path length in air.

---

## How It Works

### Discrete Sinusoids: The Bridge to Code

The continuous formula $A\sin(\omega t)$ becomes, when sampled at rate $f_s$:

$$s[n] = A \sin\!\left(\frac{2\pi f\, n}{f_s}\right)$$

where $n$ is the sample index and $t = n/f_s$. Every audio driver on Linux fills its DMA buffer with values of this formula (or a sum of them). The index $n$ is an integer; the frequency ratio $f/f_s$ determines how many samples per cycle.

```python
import math

SAMPLE_RATE = 44100   # Hz — standard CD quality
FREQUENCY   = 440.0   # Hz — concert A
AMPLITUDE   = 0.8     # normalized: 1.0 = full scale
DURATION    = 1.0     # seconds

num_samples = int(SAMPLE_RATE * DURATION)
omega = 2 * math.pi * FREQUENCY

samples = [
    AMPLITUDE * math.sin(omega * n / SAMPLE_RATE)
    for n in range(num_samples)
]
# samples[n] is the normalized air pressure at t = n / SAMPLE_RATE
# For 16-bit PCM: multiply by 32767 and cast to int16
```

At 44100 Hz, 440 Hz gives exactly $44100/440 = 100.227\ldots$ samples per cycle — not an integer, which is why naive looping introduces phase discontinuities at buffer boundaries. The correct approach is to accumulate phase, not recompute $t$ from scratch each buffer.

### Superposition: Waveforms as Sums of Sinusoids

Any periodic signal with period $T$ decomposes as:

$$x(t) = \sum_{k=0}^{\infty} A_k \sin(k \omega_0 t + \phi_k), \qquad \omega_0 = \frac{2\pi}{T}$$

The $k=1$ term is the **fundamental**; $k > 1$ terms are **harmonics**. The waveform *shape* — square, sawtooth, triangle — is entirely determined by which harmonics are present and at what relative amplitudes and phases. This is the Fourier series.

A 440 Hz square wave:

$$x(t) = \frac{4}{\pi}\sum_{k=1,3,5,\ldots} \frac{1}{k}\sin(2\pi \cdot 440k \cdot t)$$

Only odd harmonics, amplitudes decaying as $1/k$. Truncate the sum at 20 kHz (the hearing limit) and you get the audible approximation. A sawtooth includes all harmonics ($1/k$), which is why it sounds brighter than a square.

### Phase Differences Are Physical Path Differences

Two microphones recording the same point source, mic 2 at distance $d$ further away. Sound travels at $c \approx 343\ \text{m/s}$, so the extra delay is $\Delta t = d/c$:

$$s_2(t) = \sin\!\bigl(\omega(t - \Delta t)\bigr) = \sin(\omega t - \omega \Delta t)$$

The phase difference:

$$\Delta\phi = \omega \Delta t = \frac{2\pi f d}{c}$$

When $d = \lambda/2$ (half a wavelength), $\Delta\phi = \pi$, and summing the two channels gives silence at frequency $f$. This is **comb filtering** — notches at $f = c/(2d),\ 3c/(2d),\ 5c/(2d),\ldots$. It is why placing two microphones at different distances from a speaker causes audible frequency-dependent cancellation, and why JACK session engineers care about microphone placement even in software routing.

### Phasor Arithmetic in Code

```python
import cmath

def make_phasor(amplitude: float, phase_rad: float) -> complex:
    """Encode amplitude + phase as a complex number."""
    return amplitude * cmath.exp(1j * phase_rad)

def shift_phase(phasor: complex, delta_phi: float) -> complex:
    """Rotate phasor by delta_phi radians — O(1) phase manipulation."""
    return phasor * cmath.exp(1j * delta_phi)

def to_signal(phasor: complex, omega: float, t: float) -> float:
    """Recover real time-domain value at time t."""
    return (phasor * cmath.exp(1j * omega * t)).real

# Example: 1 kHz signal, phase-shifted 90 degrees
p = make_phasor(1.0, 0.0)
p_shifted = shift_phase(p, math.pi / 2)
# p_shifted now represents cos(ωt) instead of sin(ωt)
```

Multiplying two phasors: amplitudes multiply, phases add — $A_1 e^{i\phi_1} \cdot A_2 e^{i\phi_2} = A_1 A_2\, e^{i(\phi_1+\phi_2)}$. This is the algebraic foundation of every digital filter and mixer.

---

## Linux Connections

### ALSA: Where the Samples Live

ALSA exposes audio hardware through `/dev/snd/`. The userspace API fills a ring buffer; the kernel DMA-transfers
