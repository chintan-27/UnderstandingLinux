---
id: 38
title: "Clocks and timing"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

Every digital system is a state machine that advances on a clock edge. If that edge arrives late, early, or with noise, bits get sampled wrong — not with a clean crash, but with silent data corruption. At 3 GHz, one full cycle is $T = 1/f = 333\text{ ps}$. A 10 ps jitter budget violation is not theoretical: it is 3% of your entire timing margin. The Linux kernel contains a hierarchy of timekeeping abstractions precisely because the hardware underneath is imperfect — crystals drift, PLLs overshoot, and different cores on the same die see the same clock edge at slightly different times. Understanding why, from oscillator physics through kernel clocksource selection, lets you reason about timing bugs, NTP convergence failures, and `clock_gettime()` latency in production systems.

---

## Core Concepts

### Oscillators: Turning Energy into a Periodic Signal

An oscillator sustains periodic oscillation by feeding a portion of its output back to its input with the right phase and amplitude. The two ingredients are a **frequency-selective element** (sets the period) and an **amplifying element with positive feedback** (compensates for energy dissipated per cycle).

The frequency-selective element determines the stability/flexibility tradeoff:

| Technology | Typical frequency | Stability | Tunable? |
|---|---|---|---|
| RC relaxation | 1 Hz – 50 MHz | ±1% | Yes, easily |
| LC resonator | 1 MHz – GHz | ±0.01–0.1% | Yes (varactor) |
| Ceramic resonator | 200 kHz – 50 MHz | ±0.3% | Slightly |
| Quartz crystal | 10 kHz – 250 MHz | ±1–50 ppm | Slightly (VCXO) |
| SAW resonator | 100 MHz – several GHz | ±10–100 ppm | Limited |

A **quartz crystal** works because quartz is piezoelectric: mechanical stress generates voltage, and voltage generates mechanical stress. Driving the crystal electrically forces it to vibrate at its mechanical resonant frequency. That frequency depends on the speed of sound in quartz and the crystal's physical dimensions — not on circuit parasitics, not on supply voltage. The dimensionless **Q factor** quantifies how sharply the resonance peaks:

$$Q = 2\pi \frac{\text{energy stored}}{\text{energy lost per cycle}} = \frac{f_0}{\Delta f_{3\text{dB}}}$$

Quartz reaches $Q = 10^4$–$10^6$, versus $\sim$100 for a good LC tank. Higher Q means the resonator resists being pulled away from $f_0$ — the loop gain required to sustain oscillation at any other frequency is unavailable. This is the mechanical origin of crystal frequency stability.

### Temperature Coefficient and Drift

No oscillator is perfectly stable. The two primary long-term imperfections are:

- **Drift**: slow monotonic frequency change over months/years as the crystal's cut geometry relaxes under mechanical stress and contamination
- **Tempco** (temperature coefficient): frequency change per °C, expressed in ppm/°C

A crystal with $1\text{ ppm/°C}$ tempco over a $50°C$ operating range accumulates:

$$\Delta f = f_0 \times 50\text{ ppm} = 10\text{ MHz} \times 50 \times 10^{-6} = 500\text{ Hz}$$

For timekeeping, that $50\text{ ppm}$ total error translates to:

$$\text{drift} = 50 \times 10^{-6} \times 86400\text{ s/day} \approx 4.3\text{ s/day}$$

This is why NTP is not optional on any server where time matters — the crystal alone cannot hold microsecond accuracy for more than seconds.

Specialized designs compensate:

- **TCXO** (Temperature-Compensated XO): an analog correction network applies a compensating voltage proportional to temperature, pulling the crystal's frequency back toward nominal. Achieves ~0.1–1 ppm over temperature range.
- **OCXO** (Oven-Controlled XO): places the crystal in a resistively heated oven held at a temperature above the ambient maximum, so the crystal never experiences a temperature gradient. Achieves ~0.001–0.01 ppm, but requires warm-up time and consumes watts continuously.

The choice between TCXO and OCXO is an engineering tradeoff: TCXO is cheaper and draws milliwatts; OCXO is more accurate but costs more, is physically larger, and draws 1–5 W — significant for battery-powered devices and even noticeable on server power budgets when many cards each carry one.

### Jitter: Short-Timescale Instability

Drift and tempco describe average frequency over long timescales. A separate problem exists on short timescales: the exact moment a clock edge crosses the logic threshold varies randomly from cycle to cycle. This is **jitter**.

Jitter originates from noise sources — thermal noise in resistors ($v_n = \sqrt{4kTRB}$), shot noise in transistors, power supply ripple — that perturb the signal voltage near the decision threshold $V_{th}$. The conversion from voltage noise to timing uncertainty is set by the edge rate at the threshold crossing:

$$\tau_{jitter} = \frac{V_n}{dV/dt}\bigg|_{V=V_{th}}$$

A slow-rising edge (small $dV/dt$) converts the same $V_n$ into proportionally more timing uncertainty. This is why degraded signal integrity — unterminated lines, excessive capacitive load, long FR4 traces — directly increases jitter even if the oscillator itself is perfect.

**Phase noise** is the frequency-domain equivalent for sinusoidal signals. $\mathcal{L}(f)$ in dBc/Hz describes how much power density appears at offset frequency $f$ from the carrier. RMS jitter integrates across an offset band $[f_1, f_2]$:

$$J_{rms} = \frac{1}{\pi f_0} \sqrt{\int_{f_1}^{f_2} 10^{\mathcal{L}(f)/10} \, df}$$

where $f_0$ is the carrier frequency. The band limits matter: jitter specified at $[12\text{ kHz}, 20\text{ MHz}]$ versus $[1\text{ Hz}, 100\text{ MHz}]$ can differ by an order of magnitude for the same oscillator. Always check what band a jitter specification uses.

### PLLs: Multiplying and Filtering Frequencies

A **Phase-Locked Loop** solves two problems: multiplying a low-frequency reference to a higher output frequency, and filtering jitter in the process.

A phase detector compares the reference frequency $f_{ref}$ against a divided-down copy of the VCO output $f_{out}/N$. Any phase error produces a correction signal; after low-pass filtering, this steers the VCO. At lock:

$$f_{out} = N \cdot f_{ref}$$

```
                  ┌──────────────────────────────────────┐
                  │                PLL                   │
 f_ref ──► [Phase Detector] ──► [Loop Filter] ──► [VCO] ──► f_out = N·f_ref
                  ▲                                      │
                  └──────────────── [÷N] ────────────────┘
```

The **loop filter** bandwidth $f_{BW}$ determines what noise sources dominate the output:

- For offset frequencies $f < f_{BW}$: the loop tracks the reference, so **reference phase noise** dominates the output
- For offset frequencies $f > f_{BW}$: the loop cannot respond, so **free-running VCO noise** dominates

The optimal loop bandwidth sits at the crossover where reference noise and VCO noise are equal. This is why a clean reference with a well-tuned loop bandwidth can produce output cleaner than either source alone: the loop borrows the reference's long-term stability while the VCO contributes low noise at high offset frequencies.

On a CPU die, the main PLL takes a 100 MHz or 133 MHz reference from the PCB clock generator and multiplies it to the core frequency ($N = 30$–60 for a modern processor). Each core cluster typically has its own PLL so frequencies can be adjusted independently for P-states and turbo boost without affecting the memory controller clock domain.

### Clock Skew

**Skew** is the spatial counterpart of jitter: the same clock edge arrives at different registers at different times due to different wire lengths, gate delays, and capacitive loads in the distribution network. If skew between two adjacent pipeline stages is $\delta_{skew}$, the cycle time constraint becomes:

$$T_{cycle} \geq T_{prop,\max} + T_{setup} + \delta_{skew}$$

and the hold time constraint (which cannot be fixed by slowing the clock) becomes:

$$T_{prop,\min} \geq T_{hold} - \delta_{skew}$$

Positive skew (downstream flop receives clock later) relaxes setup time but tightens hold time. Negative skew does the opposite. **Timing closure** is the process of adjusting wire lengths, buffer insertion, and placement to satisfy both constraints across all process, voltage, and temperature (PVT) corners simultaneously.

At the PCB and system level, clock skew between chips is controlled by matched trace lengths — a motherboard's memory traces are length-matched to within fractions of a millimeter precisely because at DDR5-7200, one UI (unit interval) is $\sim$139 ps, and a 10 mm length mismatch in FR4 introduces $\sim$70 ps of skew, consuming half the timing margin.

---

## How It Works

### Crystal Oscillator Circuit

The Pierce oscillator uses a CMOS inverter as the amplifying element. The inverter is biased into its linear region by feedback resistor $R_f$, making it act as a high-gain inverting amplifier. The crystal, together with load capacitors $C_1$ and $C_2$, forms a $\pi$ network that provides exactly 180° of additional phase shift at the resonant frequency — completing the 360° total required
