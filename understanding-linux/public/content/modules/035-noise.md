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

## Core Concepts
Noise is an unwanted, stochastic perturbation that adds to a desired signal and limits the detectability of weak signals. Its origins lie in fundamental physical processes: thermal agitation of charge carriers, the discrete nature of electric charge, and trapping/detrapping phenomena in solids. Because these processes are random, noise is described statistically by its **power spectral density (PSD)** \(S_{xx}(f)\) (units V²/Hz for voltage, A²/Hz for current). The **noise density** is the square‑root of the one‑sided PSD:
$$e_n = \sqrt{S_{vv}(f)}\quad\left[\frac{\text{V}}{\sqrt{\text{Hz}}}\right],\qquad
i_n = \sqrt{S_{ii}(f)}\quad\left[\frac{\text{A}}{\sqrt{\text{Hz}}}\right].$$
For a **white** noise source the PSD is constant over frequency, so the noise density does not depend on \(f\).

The **signal‑to‑noise ratio (SNR)** compares signal power to noise power. With a sinusoidal signal of RMS voltage \(V_s\) across a resistance \(R\),
$$P_{\text{sig}} = \frac{V_s^{2}}{R},\qquad
P_{\text{noise}} = \frac{V_{n,\text{rms}}^{2}}{R} = \frac{e_n^{2}B}{R},$$
where \(B\) is the measurement bandwidth. Hence
$$\text{SNR} = \frac{V_s^{2}}{e_n^{2}B},\qquad
\text{SNR}_{\rm dB}=10\log_{10}\!\left(\frac{V_s^{2}}{e_n^{2}B}\right)=20\log_{10}\!\left(\frac{V_s}{e_n\sqrt{B}}\right).$$
The SNR determines the maximum usable information rate via the Shannon–Hartley theorem \(C = B\log_{2}(1+\text{SNR})\).

### Types of Noise
| Type | Physical Origin | PSD (one‑sided) | Typical Dependence |
|------|----------------|----------------|-------------------|
| **Thermal (Johnson‑Nyquist)** | Thermally driven motion of charge carriers in any conductor | \(S_{vv}=4kTR\) | White, proportional to \(T\) and \(R\) |
| **Shot** | Discrete arrival of electrons (or holes) at a potential barrier | \(S_{ii}=2qI\) | White, proportional to average current \(I\) |
| **Flicker (1/f)** | Carrier number/mobility fluctuations due to trapping‑detrapping | \(S_{vv}=K/f\) | Increases at low \(f\); material‑dependent constant \(K\) |
| **Burst (popcorn)** | Random switching of discrete traps | Lorentzian bursts | Appears as random telegraph steps |
| **Quantization** | Finite resolution of an ADC/DAC | Uniform over \([-q/2,q/2]\) | White with PSD \(q^{2}/12f_s\) (where \(q\) is LSB, \(f_s\) sample rate) |
| **Phase noise / Jitter** | Random fluctuations of oscillator phase | \(L(f)\) (dBc/Hz) | Leads to timing variance \(\sigma_t^{2}=\int\frac{L(f)}{(2\pi f)^{2}}df\) |

Each type can be derived from first principles, as shown next.

## How It Works
### Thermal Noise (Johnson‑Nyquist)
The fluctuation‑dissipation theorem links the dissipative element (resistor \(R\)) to its fluctuating voltage. Equipartition assigns an average energy \(\frac12kT\) to each quadratic degree of freedom. A resistor supports two orthogonal voltage quadratures (real and imaginary parts of the analytic signal), giving a mean‑square voltage
$$\langle v^{2}\rangle = 4kTR\,\Delta f,$$
where \(\Delta f\) is the bandwidth considered. Dividing by \(\Delta f\) yields the one‑sided PSD
$$S_{vv}=4kTR\quad\Longrightarrow\quad
e_n=\sqrt{4kTR}\;\;[\text{V}/\sqrt{\text{Hz}}].$$
The RMS noise voltage over a bandwidth \(B\) is therefore
$$V_{n,\rm rms}=e_n\sqrt{B}=\sqrt{4kTRB}.$$

### Shot Noise
Consider a Poisson process of charge carriers crossing a barrier with average rate \(\lambda = I/q\). In a time interval \(\Delta t\) the number of carriers \(n\) has mean \(\langle n\rangle=\lambda\Delta t\) and variance \({\rm Var}(n)=\langle n\rangle\). The instantaneous current is \(I(t)=qn/\Delta t\); its variance is
$${\rm Var}[I(t)]=\frac{q^{2}}{\Delta t^{2}}\,{\rm Var}(n)=\frac{q^{2}\lambda}{\Delta t}=2qI\,\frac{1}{2\Delta t}.$$
Identifying the single‑sided PSD as the limit \({\rm Var}[I(t)]/(2\Delta t)\) gives
$$S_{ii}=2qI\quad\Longrightarrow\quad
i_n=\sqrt{2qI}\;\;[\text{A}/\sqrt{\text{Hz}}].$$
Over a bandwidth \(B\) the RMS noise current is \(I_{n,\rm rms}=i_n\sqrt{B}\).

### Flicker (1/f) Noise
Empirically observed in many conductors and semiconductors, the PSD follows
$$S_{vv}(f)=\frac{K}{f},$$
where \(K\) scales with trap density and carrier mobility fluctuations. The mechanism involves carriers being captured and released from defect states, modulating their drift velocity. Because the PSD diverges as \(f\to0\), the total low‑frequency noise grows logarithmically with the measurement interval:
$$\langle v^{2}\rangle_{[f_1,f_2]}=K\ln\!\left(\frac{f_2}{f_1}\right).$$

### Noise Addition
For uncorrelated sources, PSDs add:
$$S_{vv,{\rm tot}}(f)=\sum_i S_{vv,i}(f).$$
When expressed as densities, the total voltage density is
$$e_{n,{\rm tot}}=\sqrt{\sum_i e_{n,i}^{2}}.$$
If the sources are correlated (e.g., through a common impedance), cross‑terms must be retained.

### Noise Figure and Friis Formula
The **noise factor** \(F\) of a device is the ratio of input SNR to output SNR:
$$F=\frac{\text{SNR}_{\rm in}}{\text{SNR}_{\rm out}}.\qquad
\text{NF}=10\log_{10}F\;[\text{dB}].$$
For a cascade of stages with power gains \(G_i\) and noise factors \(F_i\),
$$F_{\rm total}=F_1+\frac{F_2-1}{G_1}+\frac{F_3-1}{G_1G_2}+\cdots.$$
Thus a low‑noise, high‑gain first stage dominates the overall noise performance.

### Jitter from Phase Noise
An oscillator’s single‑sideband phase‑noise density \(L(f)\) (dBc/Hz) relates to timing jitter by
$$\sigma_t^{2}= \int_{f_1}^{f_2}\frac{10^{L(f)/10}}{(2\pi f)^{2}}\,df.$$
A flat phase‑noise floor (white frequency noise) yields \(\sigma_t\propto\sqrt{B}\); a \(1/f\) phase‑noise region gives a logarithmic dependence.

## Worked Examples
### Example 1 – Thermal Noise Density and Voltage
**Problem:** Find the noise density and RMS noise voltage of a \(10\;{\rm k\Omega}\) resistor at \(T=50^{\circ}{\rm C}\) over a \(10\;{\rm kHz}\) bandwidth.

**Solution:**
1. Convert temperature: \(T = 50 + 273.15 = 323.15\;{\rm K}\).
2. Boltzmann constant: \(k = 1.380649\times10^{-23}\;{\rm J/K}\).
3. Compute the product:
   \[
   4kTR = 4\,(1.380649\times10^{-23})\,(323.15)\,(10^{4})
          = 1.784\times10^{-16}\;{\rm V^{2}/Hz}.
   \]
4. Noise density:
   \[
   e_n = \sqrt{1.784\times10^{-16}} = 1.336\times10^{-8}\;{\rm V/\sqrt{Hz}}
        \approx 13.4\;{\rm nV/\sqrt{Hz}}.
   \]
5. RMS voltage over \(B=10\;{\rm kHz}\):
   \[
   V_{n,\rm rms}=e_n\sqrt{B}=13.4\times10^{-9}\times\sqrt{10^{4}}
                =13.4\times10^{-9}\times100
                =1.34\;\mu{\rm V\;rms}.
   \]

### Example 2 – Shot Noise from a Photodiode
**Problem:** A silicon photodiode has a dark current \(I=10\;\mu{\rm A}\). Compute the shot‑noise current density, the RMS noise current in a \(1\;{\rm MHz}\) bandwidth, and the corresponding RMS noise voltage across a \(50\;\Omega\) load.

**Solution:**
1. Shot‑noise density:
   \[
   i_n = \sqrt{2qI}= \sqrt{2\,(1.602\times10^{-19})\,(10\times10^{-6})}
        = \sqrt{3.204\times10^{-24}}
        = 5.66\times10^{-12}\;{\rm A/\sqrt{Hz}}
        = 5.66\;{\rm pA/\sqrt{Hz}}.
   \]
2. RMS current in \(B=1\;{\rm MHz}\):
   \[
   I_{n,\rm rms}=i_n\sqrt{B}=5.66\times10^{-12}\times\sqrt{10^{6}}
                =5.66\times10^{-12}\times10^{3}
                =5.66\;{\rm nA\;rms}.
   \]
3. RMS voltage across \(50\;\Omega\):
   \[
   V_{n,\rm rms}=I_{n,\rm rms}R = 5.66\times10^{-9}\times50
                =2.83\times10^{-7}\;{\rm V}
                =0.283\;\mu{\rm V\;rms}.
   \]

### Example 3 – SNR and Noise Figure of a Two‑Stage Amplifier
**Problem:** Stage 1: power gain \(G_1=15\;{\rm dB}\), noise figure \(NF_1=2\;{\rm dB}\). Stage 2: gain \(G_2=10\;{\rm dB}\), NF\(_2=6\;{\rm dB}\). Input signal power \(P_{\rm in}=-30\;{\rm dBm}\). System bandwidth \(B=1\;{\rm MHz}\). Source resistance \(R_s=50\;\Omega\) at \(T=300\;{\rm K}\). Find the overall noise figure and the output SNR.

**Solution:**
1. Convert gains and NF to linear:
   \[
   G_1 = 10^{15/10}=31.62,\quad
   G_2 = 10^{10/10}=10.0,
   \]
   \[
