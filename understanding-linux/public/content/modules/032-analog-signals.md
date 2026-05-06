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

## Core Concepts
### Analog Signals and Their Representation  
An analog signal \(x(t)\) is a continuous‑time function whose amplitude can take any real value within a finite interval. Unlike a discrete‑time signal, there is no inherent sampling interval; the signal is defined for every \(t\in\mathbb{R}\).  

Two equivalent descriptions are useful:  

* **Time‑domain waveform** – a plot of amplitude versus time, \(x(t)\) vs. \(t\).  
* **Frequency‑domain spectrum** – the Fourier transform \(X(f)=\int_{-\infty}^{\infty}x(t)e^{-j2\pi ft}\,dt\), which gives the complex amplitude of each sinusoidal frequency component. The magnitude \(|X(f)|\) is the amplitude spectrum; its squared magnitude \(|X(f)|^{2}\) is the power spectral density (PSD).  

The Fourier transform exists for any signal that is absolutely integrable (\(\int|x(t)|dt<\infty\)) or has finite energy, which covers most practical analog signals (audio, sensor outputs, RF carriers).  

### Bandwidth  
The **bandwidth** \(B\) of a signal is the width of the frequency interval that contains a specified fraction of its total power (commonly the frequencies where \(|X(f)|^{2}\) drops to half its peak, i.e. the \(-3\text{ dB}\) points). For a baseband low‑pass signal extending from \(-f_{\max}\) to \(+f_{\max}\), the one‑sided bandwidth is \(B=f_{\max}\).  

### Linear Time‑Invariant (LTI) Filtering  
A filter is an LTI system whose impulse response \(h(t)\) determines how it reshapes any input signal via convolution:  

\[
y(t)= (x * h)(t)=\int_{-\infty}^{\infty}x(\tau)h(t-\tau)\,d\tau .
\]

In the frequency domain convolution becomes multiplication:  

\[
Y(f)=X(f)\,H(f),
\]

where \(H(f)=\mathcal{F}\{h(t)\}\) is the **frequency response**. Designing a filter therefore means choosing \(h(t)\) (or equivalently \(H(f)\)) to pass desired frequencies and attenuate others.

---

## How It Works
### From Circuit Theory to Transfer Function  
Consider the simplest passive low‑pass filter: a resistor \(R\) in series with a capacitor \(C\) to ground, with the output taken across the capacitor (see Fig. 1).  

The capacitor’s impedance is  

\[
Z_C(\omega)=\frac{1}{j\omega C},
\]

while the resistor’s impedance is \(Z_R=R\). Using the voltage‑divider rule:

\[
H(j\omega)=\frac{V_{out}}{V_{in}}=\frac{Z_C}{R+Z_C}
          =\frac{\frac{1}{j\omega C}}{R+\frac{1}{j\omega C}}
          =\frac{1}{1+j\omega RC}.
\]

This complex transfer function captures both magnitude and phase shift.  

### Magnitude and Cutoff Frequency  
The magnitude is  

\[
|H(j\omega)|=\frac{1}{\sqrt{1+(\omega RC)^2}}.
\]

The **‑3 dB cutoff** occurs when \(|H|=1/\sqrt{2}\):  

\[
\frac{1}{\sqrt{1+(\omega_c RC)^2}}=\frac{1}{\sqrt{2}}
\;\Longrightarrow\;
\omega_c RC = 1
\;\Longrightarrow\;
\boxed{f_c=\frac{\omega_c}{2\pi}= \frac{1}{2\pi RC}}.
\]

For frequencies \(f\ll f_c\), \(|H|\approx 1\) (passband); for \(f\gg f_c\), \(|H|\approx 1/(2\pi fRC)\) (roll‑off of \(-20\text{ dB/decade}\)).  

### Phase Response  
The phase angle is  

\[
\angle H(j\omega)=-\arctan(\omega RC),
\]

which contributes **group delay**  

\[
\tau_g(\omega)=-\frac{d}{d\omega}\angle H(j\omega)=\frac{RC}{1+(\omega RC)^2}.
\]

Near DC the delay is approximately \(RC\); it diminishes at high frequencies. Ignoring phase can distort transient shapes even when magnitude looks correct—a subtle but important point.

### Higher‑Order Filters (brief)  
Cascading \(n\) identical RC sections yields  

\[
H_n(j\omega)=\left(\frac{1}{1+j\omega RC}\right)^{\!n},
\]

giving a roll‑off of \(-20n\text{ dB/decade}\) and a sharper transition. Active filters (using op‑amps) can achieve arbitrary polynomial denominators without loading effects.

---

## Worked Examples
### Example 1: Determining the Cutoff of an RC Low‑Pass  
**Problem:** Find the cutoff frequency of a low‑pass filter with \(R=2\;\text{k}\Omega\) and \(C=0.15\;\mu\text{F}\).  

**Solution:**  

1. Convert units to SI:  
   \[
   R=2\times10^{3}\;\Omega,\qquad C=0.15\times10^{-6}\;\text{F}.
   \]  

2. Compute the product \(RC\):  
   \[
   RC = (2\times10^{3})(0.15\times10^{-6}) = 3.0\times10^{-4}\;\text{s}.
   \]  

3. Apply the cutoff formula:  
   \[
   f_c = \frac{1}{2\pi RC}
        = \frac{1}{2\pi \times 3.0\times10^{-4}}
        \approx \frac{1}{1.884\times10^{-3}}
        \approx 531\;\text{Hz}.
   \]  

Thus the filter passes frequencies below roughly **531 Hz** (‑3 dB point) and attenuates higher frequencies at \(-20\text{ dB/decade}\).

### Example 2: Filtering a Discrete Spectrum with an Ideal Low‑Pass  
**Problem:** A signal consists of sinusoidal components at the frequencies and amplitudes shown below. Apply an ideal low‑pass filter with cutoff \(f_c=300\;\text{Hz}\) (unity gain for \(|f|\le f_c\), zero otherwise).  

| Frequency (Hz) | Amplitude |
|----------------|-----------|
| 100            | 1 |
| 200            | 2 |
| 300            | 3 |
| 400            | 4 |
| 500            | 5 |

**Solution:**  

* Because the filter is ideal and zero‑phase, each component is either passed unchanged or removed.  
* Compare each frequency to \(f_c\):  

| f (Hz) | ≤ 300 Hz? | Action | Output Amplitude |
|--------|----------|--------|------------------|
| 100    | Yes      | Pass   | 1 |
| 200    | Yes      | Pass   | 2 |
| 300    | Yes      | Pass   | 3 |
| 400    | No       | Block  | 0 |
| 500    | No       | Block  | 0 |

Resulting spectrum:  

| Frequency (Hz) | Amplitude |
|----------------|-----------|
| 100            | 1 |
| 200            | 2 |
| 300            | 3 |

All energy above 300 Hz has been eliminated. In practice, a realizable filter will exhibit a transition band and some attenuation at 300 Hz; the example illustrates the **conceptual** operation of frequency‑domain multiplication.

### Example 3: Computing the Frequency Response of a Given RC Network  
**Problem:** For \(R=1\;\text{k}\Omega\) and \(C=0.1\;\mu\text{F}\), plot \(|H(f)|\) and \(\angle H(f)\) from 10 Hz to 10 kHz.  

**Solution (analytic):**  

1. Compute \(RC = 1\times10^{3}\times0.1\times10^{-6}=1\times10^{-4}\;\text{s}\).  
2. Normalized frequency variable: \(\displaystyle \frac{f}{f_c}\) where \(f_c=\frac{1}{2\pi RC}\approx 1591.55\;\text{Hz}\).  
3. Magnitude:  
   \[
   |H(f)|=\frac{1}{\sqrt{1+\left(\frac{f}{f_c}\right)^2}}.
   \]  
4. Phase:  
   \[
   \angle H(f)=-\arctan\!\left(\frac{f}{f_c}\right).
   \]  

A quick Python snippet (shown in the Linux Connection) evaluates these expressions and produces the plot.  

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Treating the cutoff frequency as a hard brick wall** | Real filters have a gradual roll‑off; assuming infinite attenuation at \(f_c\) leads to over‑optimistic predictions of out‑of‑band rejection. | Use the exact magnitude formula \(|H(f)|=1/\sqrt{1+(f/f_c)^2}\) or simulate the filter’s frequency response. |
| 2 | **Neglecting source and load impedance** | The simple RC formula assumes the filter is driven by an ideal voltage source and drives an infinite‑impedance load. Real source resistance adds to \(R\); load capacitance creates an extra pole, shifting \(f_c\). | Measure or specify the Thevenin equivalent resistance seen by the filter and include any load capacitance in the transfer function. |
| 3 | **Confusing amplitude‑‑3 dB point with power‑‑3 dB point** | For voltage, –3 dB corresponds to \(|H|=1/\sqrt{2}\); for power it is \(|H|^{2}=1/2\). Using the wrong reference mis‑places the cutoff by 3 dB. | Clearly state whether you are working with voltage gain or power gain; apply the appropriate factor. |
| 4 | **Assuming component tolerances are irrelevant** | A 5 % resistor and 10 % capacitor can shift \(f_c\) by >10 %. In precision audio or instrumentation this is unacceptable. | Use tolerance analysis (worst‑case or Monte‑Carlo) and select tighter‑tolerance parts (e.g., 0.1 % metal‑film resistors, NP0/C0G capacitors). |
| 5 | **Ignoring phase/group delay when filtering pulses or modulated signals** | A filter that preserves magnitude but alters phase can distort the shape of a pulse or introduce inter‑symbol interference in communications. | Examine both magnitude and phase; if linear phase is required, use a symmetric FIR or a Bessel analog prototype. |
| 6 | **Using the –3 dB point as the “bandwidth” for multi‑tone signals without checking harmonic content** | A signal may have significant energy at harmonics well above the fundamental; cutting off at the fundamental’s –3 dB point can remove needed harmonics, distorting the waveform. | Compute the signal’s power spectral density and choose a cutoff that retains the desired fraction of total power (e.g., 95 %). |

---

## Exercises
### Easy  
1. **Cutoff calculation** – Compute \(f_c\) for \(R=4.7\;\text{k}\Omega\) and \(C=33\;\text{nF}\). Show all unit conversions.  
2. **Magnitude at a frequency** – For the RC network in Exercise 1, calculate \(|H(f)|\) at \(f=2f_c\) and express the result in decibels.  

### Moderate  
3. **Component selection** – Design a low‑pass filter with \(f_c=1.2\;\text{kHz}\) using a standard capacitor value of \(0.1\;\mu\text{F}\). Determine the required resistor value, then choose the nearest E‑96 series resistor and compute the actual cutoff.  
4. **Cascade effect** – Two identical RC sections (as in Exercise 1) are cascaded. Derive the overall transfer function and compute the –3 dB frequency of the cascade (hint: solve \(|H_{total}(f_{c,\,\text{cascade}})|=1/\sqrt{2}\)).  

### Hard  
5. **Transient response** – For the RC low‑pass of Exercise 1, derive the step‑response \(v_{out}(t)\) when a 5 V DC step is applied at \(t=0\). Plot (or sketch) the response and calculate the 10 %–90 % rise time.  
6. **Digital implementation** – Write a short C program that reads 16‑bit PCM samples from an ALSA capture device, applies a direct‑form I FIR low‑pass filter with coefficients \(\{0.2,0.2,0.2,0.2,0.2\}\) (a 5‑tap moving average), and writes the filtered stream to an ALSA playback device. Include error checking and cleanup.  

---

## Linux Connection
### Audio Capture and Playback with ALSA  
Linux exposes sound hardware through the **Advanced Linux Sound Architecture (ALSA)**. The primary user‑space API is accessed via `libasound`. Device nodes appear under `/dev/snd/` (e.g., `/dev/snd/controlC0`, `/dev/snd/pcmC0D0p`).  

#### Opening a PCM stream  
```c
#include <alsa/asoundlib.h>

int main(void) {
    snd_pcm_t *capture_handle, *playback_handle;
    snd_pcm_hw_params_t *hw_params;
    unsigned int rate = 48000;          /* samples per second */
    snd_pcm_uframes_t frames = 128;     /* period size */

    /* Open capture (microphone) and playback (headphones) */
    snd_pcm_open(&capture_handle, "default", SND_PCM_STREAM_CAPTURE, 0);
    snd_pcm_open(&playback_handle, "default", SND_PCM_STREAM_PLAYBACK, 0);

    /* Allocate a hw_params object and fill it with default values */
    snd_pcm_hw_params_malloc(&hw_params);
    snd_pcm_hw_params_any(capture_handle, hw_params);
    snd_pcm_hw_params_set_access(capture_handle, hw_params,
                                 SND_PCM_ACCESS_RW_INTERLEAVED);
    snd_pcm_hw_params_set_format(capture_handle, hw_params,
                                 SND_PCM_FORMAT_S16_LE);
    snd_pcm_hw_params_set_rate_near(capture_handle, hw_params,
                                    &rate, 0);
    snd_pcm_hw_params_set_period_size_near(capture_handle, hw_params,
                                           &frames, 0);
    snd_pcm_hw_params(capture_handle, hw_params);
    snd_pcm_hw_params_free(hw_params);

    /* Same parameters for playback */
    snd_pcm_hw_params_malloc(&hw_params);
    snd_pcm_hw_params_any(playback_handle, hw_params);
    snd_pcm_hw_params_set_access(playback_handle, hw_params,
                                 SND_PCM_ACCESS_RW_INTERLEAVED);
    snd_pcm_hw_params_set_format(playback_handle, hw_params,
                                 SND_PCM_FORMAT_S16_LE);
    snd_pcm_hw_params_set_rate_near(playback_handle, hw_params,
                                    &rate, 0);
    snd_pcm_hw_params_set_period_size_near(playback_handle, hw_params,
                                           &frames, 0);
    snd_pcm_hw_params(playback_handle, hw_params);
    snd_pcm_hw_params_free(hw_params);

    /* Allocate buffers */
    size_t buffer_bytes = frames * 2; /* 2 bytes per sample (S16_LE) */
    int16_t *capture_buf = malloc(buffer_bytes);
    int16_t *playback_buf = malloc(buffer_bytes);

    /* Processing loop */
    while (1) {
        snd_pcm_readi(capture_handle, capture_buf, frames);
        /* ---- Insert filter here (see below) ---- */
        snd_pcm_writei(playback_handle, playback_buf, frames);
    }

    /* Cleanup */
    free(capture_buf);
    free(playback_buf);
    snd_pcm_drain(capture_handle);
    snd_pcm_drain(playback_handle);
    snd_pcm_close(capture_handle);
    snd_pcm_close(playback_handle);
    return 0;
}
```
*Compile:* `gcc -Wall -o alsa_loop alsa_loop.c -lasound`  

#### Adding a Simple FIR Low‑Pass  
A moving‑average filter of length \(N\) has coefficients \(h[k]=1/N\). Its frequency response is  

\[
H(f)=\frac{\sin(\pi f N/f_s)}{N \sin(\pi f/f_s)}e^{-j\pi f (N-1)/f_s},
\]

where \(f_s\) is the sampling rate. For \(N=5\) and \(f_s=48\text{ kHz}\) the –3 dB point is roughly \(f_c\approx f_s/(2N)=4.8\text{ kHz}\).  

Insert the filtering step in the loop:

```c
/* Simple 5‑tap moving average */
for (size_t i = 0; i < frames; ++i) {
    int32_t acc = 0;
    for (int k = 0; k < 5; ++k) {
        size_t idx = (i + k) % frames; /* circular buffer, simplify for demo */
        acc += capture_buf[idx];
    }
    playback_buf[i] = (int16_t)(acc / 5);
}
```
(For production code use a proper FIR library or overlap‑save method to avoid boundary artifacts.)

### Command‑Line Tools  
* **sox** – The “Swiss Army knife” of sound processing.  
  Low‑pass filtering a wav file:  
  ```bash
  sox input.wav output.wav lowpass 1000   # -3 dB at 1 kHz
  ```  
  To inspect the spectrum:  
  ```bash
  sox input.wav -n spectrogram -o spec.png
  ```
* **ffmpeg** – Supports the `afir` (finite impulse response) audio filter.  
  Example: design a 101‑tap FIR low‑pass with cutoff 800 Hz using `ffmpeg`'s `afir` filter:  
  ```bash
  ffmpeg -i input.wav -af "afir=born=101:fc=800:fs=48000" output.wav
  ```
* **alsamixer** – Interactive mixer to set capture playback volumes, bypassing software gain that could distort the filter’s intended magnitude response.  
* **/proc/asound/card0/pcm0p/sub0/hw_params** – Shows the active hardware parameters (sample rate, format, period size) of a running PCM stream – useful for confirming that the filter operates at the expected \(f_s\).  

---

## Why This Matters
Understanding analog signals and their frequency‑domain manipulation is the bridge between continuous‑time physics and the discrete‑time world of computers.  

* **Audio** – Music, speech, and communication systems rely on precise filtering to remove noise, limit bandwidth, and shape timbres. The ALSA‑sox‑ffmpeg chain shown above is the exact pipeline used in professional Linux‑based studios and embedded audio products (e.g., Raspberry Pi HATs, USB sound cards).  
* **Instrumentation** – Sensors (temperature, pressure, accelerometers) produce analog voltages that must be conditioned before an ADC can digitize them. An anti‑aliasing low‑pass (often a higher‑order active filter) prevents spectral folding; knowing the exact transfer function lets you choose component values that meet a target noise bandwidth.  
* **Software‑Defined Radio (SDR)** – RF front ends Down‑convert analog RF to baseband IQ streams; the subsequent digital filtering mirrors the analog concepts we derived (e.g., root‑raised cosine pulse shaping).  
* **Control Systems** – Plant actuators are driven by analog voltage commands; filtering sensor feedback prevents high‑frequency noise from destabilizing the loop. The phase‑delay discussion explains why a naïve low‑pass can degrade phase margin and why a Bessel or linear‑phase FIR is sometimes preferred in a digital controller.  

By mastering the derivations, recognizing the subtle pitfalls, and seeing how the theory maps onto real Linux tools and kernel interfaces, you gain the ability to **design, analyze, and implement** signal‑processing blocks that work reliably from the sensor to the speaker, from the antenna to the Ethernet frame. This depth transforms a casual acquaintance with “filters” into a rigorous engineering skill set—exactly what the platform aims to cultivate.
