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

## Core Concepts
### Complex Numbers as Ordered Pairs
A complex number is an ordered pair $(a,b)$ of real numbers with addition and multiplication defined by  
$$
(a,b)+(c,d) = (a+c,\;b+d),\qquad
(a,b)\cdot(c,d) = (ac-bd,\;ad+bc).
$$  
If we identify $(a,0)$ with the real number $a$ and $(0,1)$ with the symbol $i$, the multiplication rule gives $i^2 = (0,1)\cdot(0,1) = (-1,0) = -1$. Thus every complex number can be written $a+bi$ where $a=\operatorname{Re}(z)$ and $b=\operatorname{Im}(z)$.

### Geometry: Modulus and Argument
Interpreting $(a,b)$ as a point in the plane, the **modulus** (or absolute value) is  
$$
|z| = \sqrt{a^2+b^2},
$$  
and the **argument** (angle) is $\arg(z)=\operatorname{atan2}(b,a)$. The polar form follows:
$$
z = |z|(\cos\theta+i\sin\theta)=|z|e^{i\theta}.
$$  
Multiplication in polar form multiplies moduli and adds arguments:
$$
z_1z_2 = |z_1||z_2|\,e^{i(\theta_1+\theta_2)}.
$$

### Euler’s Formula from Series
The exponential, sine, and cosine have Taylor expansions:
$$
e^{x}= \sum_{n=0}^\infty\frac{x^n}{n!},\quad
\cos x = \sum_{n=0}^\infty\frac{(-1)^n x^{2n}}{(2n)!},\quad
\sin x = \sum_{n=0}^\infty\frac{(-1)^n x^{2n+1}}{(2n+1)!}.
$$  
Substituting $x=i\theta$ and separating real and imaginary parts gives
$$
e^{i\theta}= \sum_{n=0}^\infty\frac{(i\theta)^n}{n!}
= \sum_{k=0}^\infty\frac{(-1)^k\theta^{2k}}{(2k)!}
+ i\sum_{k=0}^\infty\frac{(-1)^k\theta^{2k+1}}{(2k+1)!}
= \cos\theta + i\sin\theta .
$$
This identity holds for every real $\theta$ and is the bridge between exponential growth and rotation.

### Phasors: Complex Amplitude of a Sinusoid
A real sinusoid $x(t)=A\cos(\omega t+\phi)$ can be written as the real part of a complex exponential:
$$
x(t)=\Re\bigl\{A e^{i\phi}\,e^{i\omega t}\bigr\}
      =\Re\bigl\{\tilde X\,e^{i\omega t}\bigr\},
\qquad \tilde X = A e^{i\phi}.
$$  
$\tilde X$ is the **phasor** (complex amplitude). In linear time‑invariant (LTI) systems, differentiation becomes multiplication by $i\omega$, so the steady‑state response to $e^{i\omega t}$ is simply the system’s frequency response $H(i\omega)$ times the same exponential.

### Impedance as Phasor Ratio
For an LTI element, define impedance $Z$ as the ratio of phasor voltage to phasor current:
$$
Z = \frac{\tilde V}{\tilde I}.
$$  
Applying the defining $v=i$ relationships in the phasor domain:
* Resistor: $v_R = Ri_R \;\Rightarrow\; Z_R = R$.
* Inductor: $v_L = L\frac{di_L}{dt}\;\Rightarrow\; \tilde V_L = L(i\omega)\tilde I_L \;\Rightarrow\; Z_L = i\omega L$.
* Capacitor: $i_C = C\frac{dv_C}{dt}\;\Rightarrow\; \tilde I_C = C(i\omega)\tilde V_C \;\Rightarrow\; Z_C = \frac{1}{i\omega C}= -\,\frac{i}{\omega C}$.

Series impedances add, parallel impedances combine via the reciprocal sum, exactly as with resistances but now using complex arithmetic.

---

## How It Works
### From Differentiation to Multiplication
For any signal $x(t)=\Re\{\tilde X e^{i\omega t}\}$,
$$
\frac{d}{dt}x(t)=\Re\{\tilde X (i\omega)e^{i\omega t}\}.
$$  
Thus a linear differential operator with constant coefficients becomes a polynomial in $i\omega$. The system’s **transfer function** $H(s)$ evaluated at $s=i\omega$ gives the phasor gain and phase shift:
$$
\tilde Y(i\omega)=H(i\omega)\tilde X(i\omega).
$$  
This is why phasor analysis reduces AC steady‑state circuit analysis to algebra.

### Impedance Composition
*Series*: $Z_{\text{series}}=Z_1+Z_2$ follows directly from Kirchhoff’s voltage law in the phasor domain.  
*Parallel*: From Kirchhoff’s current law,
$$
\frac{1}{Z_{\parallel}}=\frac{1}{Z_1}+\frac{1}{Z_2}.
$$  
These rules allow us to build networks of $R$, $L$, $C$ elements and compute a single complex impedance that captures both magnitude (ratio of amplitudes) and phase (lead/lag).

### Power in the Phasor Domain
Complex power $S=\tilde V \tilde I^*$ (where $^*$ denotes complex conjugate) separates into real power $P=\Re\{S\}$ and reactive power $Q=\Im\{S\}$. The power factor is $\cos\phi = P/|S|$, with $\phi=\arg(Z)$. Ignoring the imaginary part leads to incorrect power calculations—a common practical mistake.

---

## Worked Examples
### Example 1: Adding Complex Numbers (Step‑by‑Step)
Compute $(2+3i)+(4+5i)$.
1. Identify real parts: $2$ and $4$ → sum $=6$.
2. Identify imaginary parts: $3$ and $5$ → sum $=8$.
3. Reassemble: $6+8i$.

### Example 2: Multiplying Phasors
Given phasors $\tilde X = 3e^{i\pi/4}$ and $\tilde Y = 2e^{-i\pi/6}$.
1. Multiply magnitudes: $3\times2=6$.
2. Add arguments: $\pi/4 + (-\pi/6) = \frac{3\pi-2\pi}{12}= \frac{\pi}{12}$.
3. Result: $\tilde Z = 6e^{i\pi/12}$.
4. If rectangular form is needed:
   $$
   \tilde Z = 6\bigl(\cos\tfrac{\pi}{12}+i\sin\tfrac{\pi}{12}\bigr)
            \approx 6(0.9659+0.2588i)=5.7954+1.5528i.
   $$

### Example 3: Impedance of a Series RC Circuit
Let $R=100\;\Omega$, $C=10\;\mu\text{F}$, and $\omega=1000\;\text{rad/s}$.
1. Capacitive reactance: $X_C = -\frac{1}{\omega C}= -\frac{1}{1000\times10\times10^{-6}} = -100\;\Omega$.
2. Impedance: $Z = R + \frac{1}{i\omega C}= 100 - i\,100\;\Omega$.
3. Modulus: $|Z| = \sqrt{100^2+(-100)^2}=100\sqrt{2}\approx141.4\;\Omega$.
4. Phase: $\arg(Z)=\tan^{-1}\!\left(\frac{-100}{100}\right)=-\frac{\pi}{4}$ rad ($-45^\circ$).  
   The voltage lags the current by $45^\circ$.

---

## Common Mistakes
### Mistake 1: Misapplying the Square‑Root Rule to Negative Numbers
**Wrong:** $\sqrt{-1}\sqrt{-1}= \sqrt{(-1)(-1)}=\sqrt{1}=1$, implying $i^2=1$.  
**Why it’s wrong:** The identity $\sqrt{a}\sqrt{b}=\sqrt{ab}$ holds only for $a,b\ge0$. For negative radicands the principal square root is defined on the complex plane with a branch cut; splitting the root changes the branch and introduces a sign error. Correct approach: define $i$ by $i^2=-1$ directly, or use polar form: $\sqrt{-1}=e^{i\pi/2}$, then $\sqrt{-1}\sqrt{-1}=e^{i\pi/2}e^{i\pi/2}=e^{i\pi}=-1$.

### Mistake 2: Using Only Impedance Magnitude for Power Calculations
**Wrong:** Assuming $P = V_{\text{rms}} I_{\text{rms}}$ for any AC load.  
**Why it’s wrong:** Real power depends on the phase angle between voltage and current: $P=V_{\text{rms}}I_{\text{rms}}\cos\phi$. If the load is reactive ($\phi\neq0$), using only $|Z|$ overestimates $P$ and ignores reactive power $Q$, leading to incorrect sizing of conductors, transformers, and power‑factor correction devices.

### Mistake 3: Confusing Sine and Cosine Reference in Phasor Conversion
**Wrong:** Representing $v(t)=5\sin(100t)$ as phasor $5\angle0^\circ$.  
**Why it’s wrong:** The phasor definition assumes a cosine reference: $v(t)=\Re\{\tilde V e^{i\omega t}\}$. Since $\sin\theta=\cos(\theta-\pi/2)$, the correct phasor is $5\angle -90^\circ$ (or $5e^{-i\pi/2}$). Using the wrong reference flips the sign of the reactive component and gives an erroneous impedance angle.

---

## Exercises
### Easy
1. Compute $(7-2i)-(-3+4i)$ and give the result in $a+bi$ form.  
2. Find the modulus and argument of $z=-1+i\sqrt{3}$.  
3. Convert the phasor $4e^{i\pi/3}$ to rectangular form.

### Medium
1. A series network consists of $R=50\;\Omega$, $L=20\;\text{mH}$, and $C=5\;\mu\text{F}$.  
   a) Derive the total impedance $Z(\omega)$.  
   b) Evaluate $Z$ at $\omega=500\;\text{rad/s}$ and give magnitude and phase.  
2. A voltage source $v(t)=10\cos(200t+30^\circ)$ V drives a load with impedance $Z=20+j15\;\Omega$.  
   Find the steady‑state current $i(t)$ (amplitude and phase).  
3. Using Euler’s formula, show that $\cos^2\theta+\sin^2\theta=1$ by manipulating $e^{i\theta}e^{-i\theta}$.

### Hard
1. Derive the transfer function $H(s)=\frac{V_{out}(s)}{V_{in}(s)}$ for a series RLC circuit where $V_{out}$ is taken across the capacitor. Express $H(s)$ in standard second‑order form and identify the natural frequency $\omega_n$ and damping ratio $\zeta$.  
2. For the circuit in (1), compute the resonant frequency $\omega_0$ where $|H(j\omega)|$ is maximal, and the quality factor $Q=\frac{1}{2\zeta}$.  
3. Write a short C program that uses `<fftw3.h>` to compute the DFT of a length‑16 Hamming‑windowed sinusoid of frequency $k=3$ bins, and prints the magnitude spectrum. Explain why the peak appears at bin $3$ and how spectral leakage is reduced by the window.

---

## Linux Connection
### Real‑World Uses of Complex Numbers in Linux
* **FFTW (Fastest Fourier Transform in the West)** – a widely‑used library for computing discrete Fourier transforms. It is a dependency of many audio, video, and scientific packages (e.g., `ffmpeg`, `gnuradio`, `octave`). The library operates on arrays of `fftw_complex`, which is effectively `double _Complex[2]`.
* **ALSA (Advanced Linux Sound Architecture)** – the kernel subsystem that manages audio devices. Many ALSA drivers implement digital filters (e.g., biquad IIR filters) whose coefficients are designed using the bilinear transform, which maps the $s$-plane to the $z$-plane via complex frequency substitution $s = \frac{2}{T}\frac{1-z^{-1}}{1+z^{-1}}$. The filter design process inherently involves complex arithmetic.
* **eBPF and XDP** – networking tools that sometimes employ FFT‑based traffic analysis (e.g., detecting periodic bursts). Complex numbers appear when calculating the power spectral density of packet inter‑arrival times.
* **Kernel’s `<complex.h>` Support** – the Linux kernel headers expose the ISO C `<complex.h>` interface (via `uapi/linux/compat.h` for userspace) allowing kernel modules to perform complex arithmetic without pulling in heavy libraries.

### Runnable Examples

#### 1. Installing and using FFTW from the command line
```bash
# Install development files (Debian/Ubuntu)
sudo apt-get update
sudo apt-get install -y fftw3-dev

# Compile a simple FFT program
cat > fft_demo.c <<'EOF'
#include <fftw3.h>
#include <stdio.h>
#include <math.h>

int main(void) {
    const int N = 8;
    double in[N];
    fftw_complex out[N];
    fftw_plan p;

    // input: impulse (1,0,0,0,0,0,0,0)
    for (int i = 0; i < N; ++i) in[i] = (i == 0) ? 1.0 : 0.0;

    p = fftw_plan_dft_r2c_1d(N, in, out, FFTW_ESTIMATE);
    fftw_execute(p);

    printf("Frequency bin | Real | Imag | Magnitude\n");
    for (int i = 0; i < N; ++i) {
        double re = creal(out[i]);
        double im = cimag(out[i]);
        double mag = hypot(re, im);
        printf("%12d | %5.3f | %5.3f | %6.3f\n", i, re, im, mag);
    }

    fftw_destroy_plan(p);
    fftw_cleanup();
    return 0;
}
EOF
gcc -o fft_demo fft_demo.c -lfftw3 -lm
./fft_demo
```
*Explanation*: The program computes the DFT of an impulse, which should yield a constant magnitude across all bins (theoretically $1$ after scaling). The output shows the complex values and their magnitudes, illustrating how the library handles complex numbers internally.

#### 2. Using Python’s NumPy for spectrum analysis (available in most distros)
```bash
# Install numpy if not present
sudo apt-get install -y python3-numpy

# Python script
cat > spectrum.py <<'EOF'
import numpy as np
import matplotlib.pyplot as plt

fs = 1000               # sampling rate (Hz)
t = np.arange(0, 1, 1/fs)
x = np.cos(2*np.pi*50*t) + 0.5*np.cos(2*np.pi*120*t)  # 50 Hz + 120 Hz
X = np.fft.fft(x)
freqs = np.fft.fftfreq(len(x), 1/fs)

plt.stem(freqs[:len(freqs)//2], np.abs(X[:len(X)//2])/len(x)*2, basefmt=" ")
plt.title('Magnitude Spectrum (FFT)')
plt.xlabel('Frequency (Hz)')
plt.ylabel('Amplitude')
plt.grid()
plt.show()
EOF
python3 spectrum.py
```
*Explanation*: The script creates a two‑tone signal, computes its FFT, and plots the magnitude spectrum. The complex output of `np.fft.fft` encodes both amplitude and phase; taking `np.abs` yields the magnitude.

#### 3. ALSA mixer query (shows that audio processing uses complex‑valued filter coefficients internally)
```bash
# List available ALSA controls
amixer controls

# Example: read a specific mixer element (replace 'Master' with your control)
amixer get Master
```
While the mixer UI presents real‑valued gains, the underlying digital signal‑processing chains (e.g., equalizers, crossover filters) are implemented with complex biquad coefficients designed in the $s$‑domain and transformed to the $z$‑domain—steps that require complex algebra.

---

## Why This Matters
Complex numbers are not a mathematical curiosity; they are the language in which linear, time‑invariant systems speak. By converting differential equations into algebraic equations via the phasor transform, engineers can design filters, predict circuit behavior, and synthesize signals with a few lines of algebra instead of solving differential equations.  

In the Linux ecosystem, this theory materializes everywhere:
* **Audio** – ALSA drivers, PulseAudio, JACK, and user‑space tools like `ffmpeg` and `sox` rely on the Fourier transform (complex exponentials) to convert between time and frequency domains, enabling equalization, noise reduction, and codec compression.  
* **Video & Communications** – FFmpeg’s `libavfilter` uses complex FFTs for spectrogram display, phase vocoders, and LTE‑like OFDM modulation/demodulation.  
* **Scientific Computing** – Packages such as `octave`, `python‑numpy`, and `fftw3` provide the numerical backbone for research that runs on Linux clusters, where complex arithmetic underpins eigenvalue problems, quantum simulations, and solvers for PDEs.  
* **Kernel & Networking** – The kernel’s generic `<complex.h>` support lets developers write high‑performance network monitors or crypto algorithms that need frequency‑domain analysis without pulling in heavyweight user‑space libraries.  

Mastering complex numbers therefore gives you the ability to read, modify, and extend the very software that drives Linux’s multimedia, telecommunications, and signal‑processing stacks. It transforms you from a user of tools into someone who can understand *why* a filter behaves the way it does, how to tune it, and how to build new ones—skills that are indispensable for careers in systems engineering, audio/video development
