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

## Core Concepts
A sinusoid is the graph of a function of the form  
$$y = A\sin(\omega x + \phi)$$  
where  

* **Amplitude** $A$ is the peak deviation from zero; it determines the signal’s power ($\propto A^2$).  
* **Angular frequency** $\omega = 2\pi f$ (rad · s⁻¹) counts how many radians the argument advances per unit of the independent variable $x$ (often time).  
* **Phase** $\phi$ shifts the wave left/right; physically it represents the initial state of an oscillator at $x=0$.  

A complex number $z = a+ib$ can be expressed in **polar form** as  
$$z = r\bigl(\cos\theta + i\sin\theta\bigr) = re^{i\theta},$$  
with magnitude $r=\sqrt{a^2+b^2}$ and argument $\theta=\operatorname{atan2}(b,a)$.  
Euler’s formula $e^{i\theta}=\cos\theta+i\sin\theta$ links the exponential, trigonometric, and polar representations, enabling the treatment of sinusoids as complex exponentials—a cornerstone of frequency‑domain analysis.

## How It Works
### Derivation of Fundamental Identities from the Unit Circle
Consider a point $P=(\cos\theta,\sin\theta)$ on the unit circle $x^2+y^2=1$. By definition of cosine and sine as the $x$‑ and $y$‑coordinates,
$$\cos^2\theta+\sin^2\theta = 1 \quad\text{(Pythagorean identity).}$$  
Differentiating $\sin\theta$ and $\cos\theta$ with respect to $\theta$ yields
$$
\frac{d}{d\theta}\sin\theta = \cos\theta,\qquad 
\frac{d}{d\theta}\cos\theta = -\sin\theta,
$$
which follows from the geometry of the circle (arc length $= r \cdot \Delta\theta$).

### Angle‑Addition Formulas via Euler’s Formula
Start with $e^{i(\alpha+\beta)} = e^{i\alpha}e^{i\beta}$. Expanding each side with Euler’s formula gives  
$$
\cos(\alpha+\beta)+i\sin(\alpha+\beta)=
(\cos\alpha+i\sin\alpha)(\cos\beta+i\sin\beta).
$$
Multiplying the right‑hand side and equating real and imaginary parts produces  
$$\boxed{\cos(\alpha+\beta)=\cos\alpha\cos\beta-\sin\alpha\sin\beta}$$  
$$\boxed{\sin(\alpha+\beta)=\sin\alpha\cos\beta+\cos\alpha\sin\beta}.$$  
Setting $\beta=\alpha$ yields the double‑angle formulas  
$$
\sin(2\alpha)=2\sin\alpha\cos\alpha,\qquad 
\cos(2\alpha)=\cos^2\alpha-\sin^2\alpha.
$$

### From Time‑Domain to Frequency‑Domain
A real‑valued sinusoid $x(t)=A\cos(\omega_0 t+\phi)$ can be written as the sum of two complex exponentials:
$$x(t)=\frac{A}{2}e^{i(\omega_0 t+\phi)}+\frac{A}{2}e^{-i(\omega_0 t+\phi)}.$$  
Thus its Fourier transform consists of two Dirac impulses at $\pm\omega_0$, each weighted by $\frac{A}{2}e^{\pm i\phi}$. This representation is what the Linux kernel’s **ALSA** subsystem uses when it converts PCM samples to spectral data for equalizers or noise‑suppression filters.

## Worked Examples
### Example 1: Extracting Amplitude, Angular Frequency, and Phase
Given $y(t)=5\sin\bigl(4t-\pi/3\bigr)$.

1. **Amplitude**: coefficient of sine → $A=5$.  
2. **Angular frequency**: coefficient of $t$ inside the argument → $\omega=4\;\text{rad/s}$.  
3. **Ordinary frequency**: $f=\omega/(2\pi)=\dfrac{4}{2\pi}\approx0.6366\;\text{Hz}$.  
4. **Phase**: $\phi=-\pi/3$ rad (≈ −60°).  

*Verification*: At $t=0$, $y(0)=5\sin(-\pi/3)=-5\cdot\frac{\sqrt3}{2}\approx-4.33$, which matches the shifted sine wave.

### Example 2: Polar Form and Principal Argument
Let $z=-1+i\sqrt3$.

1. Magnitude: $r=\sqrt{(-1)^2+(\sqrt3)^2}= \sqrt{1+3}=2$.  
2. Raw arctangent: $\arctan\bigl(\frac{\sqrt3}{-1}\bigr)=\arctan(-\sqrt3)=-\pi/3$.  
3. Since the point lies in quadrant II ($x<0, y>0$), add $\pi$:  
   $\theta = -\pi/3+\pi = 2\pi/3$.  
4. Polar form: $$z = 2\bigl(\cos(2\pi/3)+i\sin(2\pi/3)\bigr)=2e^{i\,2\pi/3}.$$

### Example 3: Deriving $\sin(2x)=2\sin x\cos x$ from Euler’s Formula (step‑by‑step)
1. Write $e^{i2x} = (e^{ix})^2$.  
2. Expand left side with Euler: $\cos(2x)+i\sin(2x)$.  
3. Expand right side: $(\cos x+i\sin x)^2 = \cos^2x-\sin^2x + i\,2\sin x\cos x$.  
4. Equate imaginary parts: $\sin(2x)=2\sin x\cos x$.  

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Approach |
|---------|----------------|------------------|
| Using $\tan^{-1}(y/x)$ without `atan2` to find the argument of a complex number. | $\tan^{-1}$ returns values only in $(-\pi/2,\pi/2)$; it cannot distinguish quadrants II and III, leading to an argument off by $\pi$. | Use `atan2(y, x)` (C: `atan2(y, x)`; Bash: `awk -v y=$Y -v x=$X 'BEGIN{printf "%f", atan2(y,x)}'`). |
| Confusing angular frequency $\omega$ with ordinary frequency $f$ and omitting the $2\pi$ factor when converting. | The argument of $\sin$ or $\cos$ must be dimensionless; $\omega t$ is in radians, while $f t$ is in cycles. Missing $2\pi$ yields a period off by a factor of $2\pi$. | Always apply $\omega = 2\pi f$; verify by checking that the period $T = 2\pi/\omega = 1/f$. |
| Assuming $\sin^2\theta+\cos^2\theta=1$ holds for complex $\theta$. | The identity derives from the real unit circle; for complex $\theta$, $\sin$ and $\cos$ become hyperbolic, and the sum equals $\cosh(2\operatorname{Im}\theta)$. | Restrict the identity to real arguments; for complex arguments use $\sin^2z+\cos^2z=1$ still holds (it’s an identity of analytic functions) but the geometric interpretation changes; verify via series expansion if needed. |
| Neglecting phase when modeling a signal as $A\sin(\omega t)$ only. | Phase determines the initial condition of a physical oscillator; ignoring it can cause sign errors in interference or control‑loop calculations. | Keep $\phi$ explicit; when measuring a signal, compute $\phi = \operatorname{atan2}\bigl(\text{quadrature component},\text{in‑phase component}\bigr)$. |

## Exercises
1. **(Easy)** A discrete‑time signal is given by $x[n]=3\cos\bigl(\frac{\pi}{4}n+\pi/6\bigr)$. State its amplitude, angular frequency (rad/sample), and ordinary frequency (cycles/sample).  
2. **(Medium)** Convert the complex number $z=-2-2i$ to polar form, giving the principal argument in radians.  
3. **(Hard)** A sinusoidal voltage $v(t)=V_m\sin(2\pi 50 t+\pi/4)$ drives a resistive load $R=10\;\Omega$.  
   a) Derive the instantaneous power $p(t)=v^2(t)/R$ and express it as a sum of a constant term and a sinusoid at twice the line frequency.  
   b) Compute the average power over one period.  
   c) Write a short C program (using `<math.h>`) that samples $v(t)$ at 1 kHz for 0.2 s and prints the RMS value; compile and run it on a Linux box, showing the command line.

## Linux Connection
Trigonometric routines appear throughout the Linux stack, from the kernel’s fixed‑point approximations to user‑space libraries that implement the IEEE‑754 `sin`, `cos`, and `atan2` functions.

* **libm (glibc)** – The standard math library.  
  ```bash
  # Locate the sin implementation in glibc (x86‑64)
  objdump -d /lib/x86_64-linux-gnu/libm.so.6 | grep -A5 "<sin>"
  ```
  The source (in `sysdeps/ieee754/ldbl-96/s_sinl.c`) uses a minimax polynomial approximation after argument reduction via the `rempio2` kernel.

* **Kernel fixed‑point sin/cos** – Used in drivers where floating‑point is prohibited (e.g., early boot, real‑time schedulers).  
  ```c
  /* Example from arch/x86/lib/tsc.c (simplified) */
  static inline s32 sin_fixed(s32 x)   /* x in Q2.30 format */
  {
      /* table‑lookup + linear interpolation */
  }
  ```
  You can inspect it with:
  ```bash
  grep -R "sin_fixed" /usr/src/linux-headers-$(uname -r)/arch/x86/lib/
  ```

* **ALSA PCM API** – Applications capture or play audio samples; many effects (e.g., tremolo, vibrato) are implemented by modulating amplitude or frequency with a sinusoid.  
  ```bash
  # Generate a 440 Hz sine wave for 2 seconds using sox (uses libm internally)
  play -n synth 2 sine 440
  ```
  To see the underlying syscalls, trace with `strace`:
  ```bash
  strace -e trace=write play -n synth 2 sine 440 2>&1 | head
  ```

* **FFTW (Fastest Fourier Transform in the West)** – Library used by audio analysis tools (e.g., `audacity`, `praat`) to compute the spectrum of a signal; internally it multiplies data by complex exponentials $e^{-i2\pi k n/N}$.  
  ```bash
  # Install and test FFTW
  sudo apt-get install fftw3-dev
  cat > test_fft.c <<'EOF'
  #include <fftw3.h>
  #include <math.h>
  #include <stdio.h>
  int main(void){
      const int N=8;
      double in[N]; fftw_complex out[N];
      fftw_plan p = fftw_plan_dft_r2c_1d(N,in,out,FFTW_ESTIMATE);
      for(int i=0;i<N;i++) in[i]=sin(2*M_PI*2*i/N); /* 2‑cycle sinusoid */
      fftw_execute(p);
      for(int i=0;i<N;i++)
          printf("bin %d: %g + %gi\n", i, out[i][0], out[i][1]);
      fftw_destroy_plan(p);
      return 0;
  }
  EOF
  gcc test_fft.c -lfftw3 -lm -o test_fft && ./test_fft
  ```
  The output shows a peak at bin 2 (and its conjugate at bin 6), confirming the sinusoid’s frequency.

* **V4L2 (Video4Linux2)** – Color space conversion routines (e.g., RGB↔YCbCr) use sine/cos‑based rotation matrices for hue adjustments.  
  ```bash
  # List available pixel formats that involve conversion
  v4l2-ctl --list-formats-ext | grep -E "YUV|HSV"
  ```

These concrete interfaces show how the abstract trigonometric concepts are turned into runnable code, system calls, and library functions on a modern Linux system.

## Why This Matters
Trigonometry supplies the mathematical language for any phenomenon that repeats or rotates—oscillating voltages, rotating phasors, wheel encoders, or the phase of a carrier wave. In Linux, this language is realized in:

* **Audio pipelines** (ALSA, PulseAudio, JACK) where signals are generated, filtered, and analyzed using sinusoids and their Fourier transforms.  
* **Graphics stacks** (DRM/KMS, Mesa, Wayland compositors) that perform rotations, hue shifts, and projection via sine/cos‑based matrices.  
* **Control loops** in the kernel (e.g., CFS scheduler’s vruntime calculation, timers) that rely on periodic updates derived from angular frequencies.  
* **Numerical libraries** (FFTW, GSL, libm) that provide highly optimized, correctly‑rounded implementations of the transcendental functions, enabling scientific computing, machine‑learning preprocessing, and real‑time signal processing on commodity hardware.

By mastering the definitions, derivations, and practical manifestations of sinusoids, phase, and frequency, you gain the ability to read, modify, and extend the very subsystems that turn electrical impulses into sound, images, and control actions on a Linux system. This bridges the gap between abstract mathematics and the concrete, performance‑critical code that powers the open‑source stack.
