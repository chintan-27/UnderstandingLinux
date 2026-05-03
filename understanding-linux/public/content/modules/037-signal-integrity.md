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

Digital logic works because voltages represent bits — but voltages are physical quantities riding on physical wires, and physics imposes hard constraints. A signal traveling down a PCB trace or cable propagates as an electromagnetic wave. When that wave hits an impedance discontinuity — a connector, a via, a mismatched terminator — part of it reflects. The reflected wave superimposes on incoming signals, corrupting logic levels. Adjacent wires couple energy into each other, clocks radiate into neighboring nets, and ground planes develop voltage gradients that shift the reference every circuit depends on.

These effects are negligible at 1 MHz and catastrophic at 1 GHz — because the physical wavelength at 1 GHz in FR4 is roughly 15 cm, which is comparable to trace lengths on a real board. At that point, lumped-circuit assumptions break down entirely.

Modern Linux systems sit on hardware where this matters daily: DDR5 memory buses run at 4800–6400 MT/s, PCIe 5.0 runs at 32 GT/s per lane, and USB 3.2 Gen 2×2 hits 20 Gbps. When signal integrity fails, the kernel doesn't receive a tidy error — it gets bit flips, CRC failures, enumeration timeouts, or silent data corruption. Understanding the physics explains why the kernel and hardware both implement the mitigations they do.

---

## Core Concepts

### Transmission Lines

Any two conductors carrying a signal and its return path form a transmission line: a PCB trace over a ground plane, a coaxial cable, a twisted pair. The critical quantity is **characteristic impedance** $Z_0$, determined entirely by geometry:

$$Z_0 = \sqrt{\frac{L'}{C'}}$$

where $L'$ is inductance per unit length (H/m) and $C'$ is capacitance per unit length (F/m). $Z_0$ is not a function of frequency (for lossless lines) and is not the same as DC resistance — it is the ratio of voltage to current for a wave traveling in one direction. Standard coax and controlled-impedance PCB traces target $Z_0 = 50\,\Omega$. Differential pairs (USB, PCIe, LVDS) target $Z_{0,\text{diff}} = 100\,\Omega$, which is simply $2 \times 50\,\Omega$ for each trace in the pair referenced to ground.

Signals propagate at a velocity set by the dielectric:

$$v_p = \frac{c}{\sqrt{\varepsilon_r}}$$

FR4 PCB material has $\varepsilon_r \approx 4$, giving $v_p \approx c/2 \approx 15\,\text{cm/ns}$. The propagation delay per unit length is therefore:

$$t_{pd} = \frac{1}{v_p} = \frac{\sqrt{\varepsilon_r}}{c} \approx 67\,\text{ps/cm}$$

A 30 cm trace introduces approximately 2 ns of delay. When a DDR5 clock period is $1/3200\,\text{MHz} \approx 312\,\text{ps}$, that 2 ns delay is more than six clock cycles and must be accounted for in timing closure. This is why DDR layout rules enforce matched trace lengths on address and data lines to within tens of mils.

### Reflections

When a traveling wave reaches a load impedance $Z_L \neq Z_0$, continuity of voltage and current at the junction forces a reflected wave. The amplitude of the reflected wave relative to the incident wave is:

$$\Gamma = \frac{Z_L - Z_0}{Z_L + Z_0}$$

The transmitted wave amplitude is $1 + \Gamma$. The consequences are direct:

| Load condition | $\Gamma$ | Effect |
|---|---|---|
| $Z_L = Z_0$ (matched) | $0$ | No reflection |
| $Z_L = \infty$ (open circuit) | $+1$ | Full reflection; voltage at the open end doubles |
| $Z_L = 0$ (short circuit) | $-1$ | Full reflection; voltage inverts |
| $Z_L = 25\,\Omega$ | $-1/3$ | Partial reflection; voltage dips by one third |

An unconnected stub — say, a via that was drilled but not connected, or a connector pin with no device attached — presents an open circuit. The incident wave reflects at $\Gamma = +1$, the total voltage at that node briefly doubles, and the reflected wave travels back toward the source. If the source is also mismatched, it re-reflects, and the signal rings. A 3.3 V signal can momentarily reach 6 V at an open via. That voltage spike can exceed the absolute maximum ratings of an input buffer.

The time for a reflection to travel the round trip on a trace of length $l$ is:

$$t_{\text{round trip}} = \frac{2l}{v_p}$$

If the source rise time is shorter than $t_{\text{round trip}}$, the line must be treated as a transmission line — the reflection arrives back at the source before the edge has settled, causing visible ringing. The threshold is roughly:

$$l_{\text{critical}} \approx \frac{v_p \cdot t_r}{2}$$

where $t_r$ is the signal rise time. A 200 ps rise time on FR4 gives $l_{\text{critical}} \approx 1.5\,\text{cm}$ — shorter than many PCB traces on a modern board.

### Transmission Line Input Impedance

A mismatched line of length $l$ presents an input impedance that is a function of frequency:

$$Z_{\text{in}} = Z_0 \frac{Z_L + jZ_0 \tan\!\left(\frac{2\pi l}{\lambda}\right)}{Z_0 + jZ_L \tan\!\left(\frac{2\pi l}{\lambda}\right)}$$

Four cases worth knowing cold:

- **Quarter-wave transformer** ($l = \lambda/4$, $\tan \to \infty$): $Z_{\text{in}} = Z_0^2 / Z_L$. A short circuit becomes an open circuit. A 50 Ω line with a short at the end looks like an open at its input — infinite impedance at that frequency. This is the principle behind quarter-wave stubs used as RF chokes.
- **Half-wave line** ($l = \lambda/2$): $Z_{\text{in}} = Z_L$. The input impedance equals the load, regardless of $Z_0$. The line is invisible at this frequency.
- **Short open stub** ($l \ll \lambda$, open end): $Z_{\text{in}} \approx -j/(\omega C' l)$ — purely capacitive. A 1 cm unpopulated component pad at 1 GHz looks like a capacitor and introduces a reflection.
- **Short shorted stub** ($l \ll \lambda$, shorted end): $Z_{\text{in}} \approx j\omega L' l$ — purely inductive. A via through a PCB layer looks like a series inductor; its inductance is typically 0.5–1 nH, which at 1 GHz is $j3\,\Omega$ to $j6\,\Omega$ — enough to cause measurable reflections on a 50 Ω system.

These arise accidentally everywhere in hardware: connector pins, test points, via stubs, unpopulated resistor pads. High-speed PCB designs back-drill vias to remove the stub below the signal layer.

### Skin Effect and Lossy Lines

Real conductors attenuate signals, and the attenuation is frequency-dependent. AC current does not distribute uniformly through a conductor — it concentrates in a surface layer. The skin depth is:

$$\delta = \sqrt{\frac{1}{\pi \sigma \mu f}}$$

where $\sigma$ is conductivity (S/m), $\mu$ is permeability (H/m), and $f$ is frequency. For copper ($\sigma = 5.8 \times 10^7\,\text{S/m}$):

$$\delta_{\text{Cu}} \approx \frac{66\,\text{mm}}{\sqrt{f\,[\text{Hz}]}}$$

At 1 GHz, $\delta \approx 2\,\mu\text{m}$. A typical PCB trace is 35 µm thick — the current occupies only the top 2 µm. Since the effective conducting cross-section shrinks proportionally to $\delta$, resistance scales as $1/\delta \propto \sqrt{f}$. Attenuation in dB therefore scales as $\sqrt{f}$: doubling the frequency increases loss by a factor of $\sqrt{2} \approx 1.41$, so a trace with 3 dB loss at 1 GHz has approximately 6 dB loss at 4 GHz.

The consequence: a fast digital edge contains high-frequency harmonics. Those harmonics are attenuated more than the fundamental, so the edge slows down as it travels. A 50 ps rise time at the transmitter can become a 200 ps rise time at the receiver after 10 cm of trace. This is **dispersion**, and it is why high-speed serial links (PCIe, SATA, USB 3.x) require equalization — the receiver boosts high-frequency content to compensate, using either a passive CTLE (Continuous Time Linear Equalizer) or an active DFE (Decision Feedback Equalizer) in silicon.

### Crosstalk

Two parallel signal lines couple energy through mutual capacitance $C_m$ (F/m) and mutual inductance $M$ (H/m). The coupled current and voltage are:

$$i_{\text{cap}} = C_m \cdot \frac{dV}{dt}, \qquad v_{\text{ind}} = M \cdot \frac{dI}{dt}$$

Capacitive coupling injects a current pulse into the victim with the same polarity on both ends. Inductive coupling induces a voltage with opposite polarity at each end. When the two mechanisms add in the same direction on the near end and subtract on the far end (or vice versa
