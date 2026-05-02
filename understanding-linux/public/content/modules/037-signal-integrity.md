---
id: 37
title: "Signal integrity"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

When a CPU writes to a memory-mapped register, the write is a voltage edge propagating down a PCB trace at finite speed into a load with finite impedance. If that load is mismatched, the edge reflects back toward the driver. If two address lines run parallel for 10 cm, switching one couples energy into the other. If the decoupling capacitor for a DDR PHY is on the wrong side of the board, the inductance of the via cancels its effect at 1 GHz. These failures show up as: a driver that works on rev A hardware but not rev B, a device that passes at room temperature but fails at 85°C, a PCIe link that trains at Gen2 but not Gen3. The Linux kernel contains `udelay()`, `rmb()`, `writel_relaxed()`, and `__iomem` annotations not as defensive programming but because specific hardware behaviors — propagation delay, write-buffer reordering, metastability windows — demand them. Understanding what the hardware physically does is what makes those primitives legible.

---

## Core Concepts

### Transmission Lines

Any conductor carrying a signal whose wavelength is comparable to or shorter than the conductor length must be treated as a **transmission line** — a distributed structure characterized by inductance per unit length $L'$ (H/m) and capacitance per unit length $C'$ (F/m). A PCB trace is not a wire with resistance; it is a transmission line at frequencies above roughly:

$$f_{critical} \approx \frac{v}{10 \cdot \ell}$$

where $v$ is propagation velocity and $\ell$ is trace length. For a 10 cm trace on FR4 this is approximately 150 MHz — well within DDR4, PCIe, USB3, and MIPI signaling rates.

**Characteristic impedance** is the voltage-to-current ratio for a forward-traveling wave:

$$Z_0 = \sqrt{\frac{L'}{C'}}$$

$Z_0$ depends only on geometry, not on line length. For a PCB microstrip (trace over ground plane):

$$Z_0 \approx \frac{87}{\sqrt{\epsilon_r + 1.41}} \ln\left(\frac{5.98 h}{0.8 w + t}\right)$$

where $h$ is the dielectric thickness, $w$ is trace width, $t$ is trace thickness, and $\epsilon_r$ is the dielectric constant. Narrower trace or thicker dielectric → higher $Z_0$. Wider trace or thinner dielectric → lower $Z_0$. This is why controlled-impedance PCBs specify trace widths and stackup precisely: a 6 mil trace on a 4 mil dielectric with $\epsilon_r = 4.2$ hits 50 Ω, but 5 mil on the same stackup is 58 Ω.

**Propagation velocity** is set by the dielectric, not the conductor:

$$v = \frac{c}{\sqrt{\epsilon_r}}$$

On FR4 ($\epsilon_r \approx 4.2$), $v \approx 1.46 \times 10^8$ m/s, so signals travel roughly **15 cm/ns**. A 30 cm trace between a CPU and a DDR4 DIMM slot introduces approximately 2 ns of propagation delay — relevant when the memory interface runs at 3200 MT/s and the setup window is under 100 ps.

### Reflections

At any impedance discontinuity — a connector, a via, a stub, an unterminated load — the wave partially reflects. The **reflection coefficient** at a load $Z_L$ on a line of impedance $Z_0$ is:

$$\Gamma = \frac{Z_L - Z_0}{Z_L + Z_0}$$

The transmitted fraction is $1 + \Gamma = \frac{2Z_L}{Z_L + Z_0}$.

Boundary cases are exact, not approximate:

| Load condition | $\Gamma$ | Consequence |
|---|---|---|
| $Z_L = Z_0$ | $0$ | No reflection; all energy absorbed |
| $Z_L \to \infty$ (open) | $+1$ | Full reflection; voltage doubles at the open end |
| $Z_L = 0$ (short) | $-1$ | Full reflection with polarity inversion |
| $Z_L = 2Z_0$ | $+1/3$ | Partial reflection; first overshoot is 33% of incident amplitude |

The doubling at an open end is not an approximation — it follows directly from the boundary condition that current must be zero at an open, so the reflected wave must have the same polarity as the incident wave to cancel the current. This is why an unterminated DDR data line can briefly see $2 \times V_{DD}$ — which can exceed the absolute maximum rating of the IO cell.

Multiple reflections produce ringing. The settling time depends on both $\Gamma$ values (load and source) and the round-trip delay $T_{RT} = 2\ell / v$. For a CMOS output with $Z_S \approx 10\ \Omega$ driving a 50 Ω trace with an open-circuit input ($\Gamma_L = +1$):

$$\Gamma_S = \frac{10 - 50}{10 + 50} = -\frac{2}{3}$$

The signal bounces with alternating-sign reflections of amplitude $\Gamma_L \Gamma_S = -2/3$ per round trip, eventually settling. Each bounce takes $T_{RT}$; the signal may not be valid until 3–4 round trips have decayed, which is why adding a series termination resistor ($R_S = Z_0 - Z_{driver}$) near the source is the standard fix: it makes $\Gamma_S = 0$ at the source, eliminating re-reflection after the first round trip.

The input impedance of a lossless transmission line of length $\ell$ is:

$$Z_{in} = Z_0 \cdot \frac{Z_L + jZ_0 \tan(\beta \ell)}{Z_0 + jZ_L \tan(\beta \ell)}, \quad \beta = \frac{2\pi}{\lambda}$$

Special cases:

| Length | Load | $Z_{in}$ |
|---|---|---|
| $\lambda/4$ | $Z_L$ | $Z_0^2 / Z_L$ (impedance inverter) |
| $\lambda/2$ | $Z_L$ | $Z_L$ (transparent) |
| $\lambda/4$ | short | $\infty$ (open at the input) |
| $\lambda/4$ | open | $0$ (short at the input) |

The $\lambda/4$ transformer is used in RF matching networks and in PCB PDN (power delivery network) stubs deliberately cut to resonate at a noise frequency.

### Skin Effect and Signal Loss

At DC, current fills a conductor uniformly. At AC, the magnetic field generated by the current itself pushes it toward the surface — the **skin effect**. The skin depth is:

$$\delta = \sqrt{\frac{2\rho}{\omega \mu}} = \frac{1}{\sqrt{\pi \sigma \mu f}}$$

For copper ($\sigma = 5.8 \times 10^7$ S/m, $\mu \approx \mu_0$):

$$\delta_{Cu} \approx \frac{66\ \text{mm}}{\sqrt{f\ [\text{Hz}]}}$$

| Frequency | Skin depth in copper |
|---|---|
| 1 MHz | 66 µm |
| 100 MHz | 6.6 µm |
| 1 GHz | 2.1 µm |
| 10 GHz | 0.66 µm |

A 1 oz copper trace (35 µm thick) carries current through its full thickness at 1 MHz but through only 2 µm of surface layer at 10 GHz. The effective cross-sectional area shrinks, so resistance increases as $\sqrt{f}$. Attenuation in dB/m scales as $\sqrt{f}$, which means **quadrupling the data rate doubles the dB loss per unit length**. This is the dominant reason 100G SerDes links require equalization (FFE/CTLE/DFE) while 1G links do not: the high-frequency components of the bit transitions arrive attenuated relative to the low-frequency content, closing the eye.

Dielectric loss adds a second mechanism. The imaginary part of $\epsilon_r$ (loss tangent $\tan\delta$) causes energy absorption that scales linearly with $f$, not $\sqrt{f}$. At 28 GHz and above, dielectric loss dominates over skin-effect loss, which is why 400G/800G designs use low-loss laminates (Megtron 6, PTFE-based) rather than standard FR4.

### Crosstalk

Two adjacent parallel conductors share mutual inductance $M$ and mutual capacitance $C_m$. When the aggressor switches, it induces noise on the victim through both:

$$V_{inductive} = M \frac{dI_a}{dt}, \qquad I_{capacitive} = C_m \frac{dV_a}{dt}$$

These two mechanisms produce noise components that travel in both directions on the victim. On a PCB (a non-TEM structure), the forward and backward coupling are not equal. The **backward crosstalk coefficient** (NEXT) is:

$$K_b = \frac{1}{4}\left(\frac{C_m}{C'} + \frac{M}{L'}\right) T_{RT}$$

where $T_{RT}$ is the coupled-region round-trip time. NEXT amplitude grows until the aggressor edge has traversed the full coupled length; after that it saturates at $K_b$ and holds for one round-trip time. **Forward crosstalk (FEXT)** on a homogeneous line is zero if $M/L' = C_m/C'$ (which holds for a perfectly embedded stripline in a uniform dielectric). In microstrip, the asymmetry in field distribution between the conductor side and the air
