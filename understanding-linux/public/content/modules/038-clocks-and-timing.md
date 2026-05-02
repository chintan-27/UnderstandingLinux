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

Every digital system depends on clocks being correct in two distinct senses: *frequency* (the average rate) and *phase* (when each edge arrives). These are independent failure modes. A clock can have perfect average frequency but still corrupt data through cycle-to-cycle jitter. Two clocks can be identical in frequency but destroy a pipeline through skew. Linux runs on hardware where the kernel must reason about both: `hrtimer` fires based on the hardware counter's frequency accuracy; `clock_gettime(CLOCK_REALTIME)` correctness depends on NTP disciplining a local oscillator whose drift you can directly observe; RDTSC-based timestamps across cores fail silently when TSC skew is nonzero. Understanding the physics of clocks is not background knowledge — it determines which kernel APIs are safe to use and why.

---

## Core Concepts

### Oscillators: The Trade-off Between Tunability and Stability

An oscillator sustains a periodic signal by routing its own output back as input through a resonant element that selects one frequency. The resonant element determines everything important:

- **RC oscillators**: Cheap, electrically tunable (useful for PLLs), but frequency shifts with temperature because resistance and capacitance both have temperature coefficients. Drift of hundreds of ppm/°C is normal.
- **Crystal oscillators**: A quartz crystal's mechanical resonance has a Q factor of $10^4$–$10^6$, versus $10$–$100$ for an LC tank. That high Q means the resonance is sharp — the crystal strongly rejects frequencies even slightly off resonance — which translates directly into frequency stability. Consumer-grade crystals are specified at $\pm 20$–$50\ \text{ppm}$ total over their temperature range; temperature-compensated crystal oscillators (TCXOs) reach $\pm 0.5\ \text{ppm}$; oven-controlled crystal oscillators (OCXOs) reach $\pm 0.01\ \text{ppm}$ by holding the crystal at a fixed temperature.

The ppm unit is an absolute frequency error per unit frequency. A $25\ \text{MHz}$ reference with $\pm 20\ \text{ppm}$ stability has a worst-case drift of:

$$\Delta f = 25 \times 10^6\ \text{Hz} \times 20 \times 10^{-6} = 500\ \text{Hz}$$

That $500\ \text{Hz}$ error accumulates. After one second, the clock has deviated by $500\ \text{ns}$. After one day ($86400\ \text{s}$), the deviation is $86400 \times 500\ \text{ns} = 43.2\ \text{ms}$. This is why `ntpd` and `chronyd` exist: without continuous correction, every machine's clock drifts at a rate set by its crystal's ppm rating.

### Phase-Locked Loops: Frequency Multiplication via Phase Error

The problem: a $25\ \text{MHz}$ crystal is stable, but a CPU core needs $3\ \text{GHz}$. You cannot fabricate a crystal at $3\ \text{GHz}$; the mechanical dimensions become impossibly small. A PLL synthesizes the high frequency from the stable reference by treating frequency multiplication as a feedback control problem.

The loop contains three functional blocks:

1. **Phase Detector (PD):** Produces an output proportional to the phase difference between its two inputs. A bang-bang PD outputs a pulse whose width encodes the sign and magnitude of the phase error.
2. **Loop Filter:** A low-pass filter. It integrates the phase error signal and presents a smoothed control voltage. Its bandwidth is the most important design parameter of the entire PLL.
3. **Voltage-Controlled Oscillator (VCO):** An RC or LC oscillator whose free-running frequency shifts in proportion to the control voltage. The gain constant $K_{\text{VCO}}$ has units of Hz/V.

The feedback path divides the VCO output by $N$ before returning it to the phase detector. At lock:

$$f_{\text{VCO}} = N \times f_{\text{ref}}$$

The loop locks when the phase error is zero — not just the frequency error. A nonzero phase offset would cause the phase detector output to have a nonzero DC component, which shifts the VCO frequency, which changes the phase, until phase error reaches zero. This self-correcting mechanism is why the crystal's long-term stability propagates through to the synthesized $3\ \text{GHz}$ output: any drift in the VCO creates a phase error that the loop cancels.

The loop filter bandwidth sets a critical trade-off. The VCO's phase noise (intrinsic to any oscillator — see jitter section) is high-pass shaped by the loop: noise *below* the loop bandwidth is suppressed by feedback correction, while noise *above* it passes through uncorrected. The crystal's reference noise is low-pass shaped: it contributes inside the loop bandwidth but is rejected outside it. Therefore:

- **Wide loop bandwidth:** VCO noise is well-suppressed; reference noise dominates; loop tracks the crystal closely; responds quickly to disturbance.
- **Narrow loop bandwidth:** VCO phase noise dominates at high offset frequencies; loop cannot track fast disturbances; but power-supply noise injected into the VCO control path is better rejected.

CPU PLLs typically use loop bandwidths of $1$–$10\ \text{MHz}$ for a $100\ \text{MHz}$ reference — roughly $f_{\text{ref}}/10$, a standard stability criterion.

### Jitter: Phase Noise in the Time Domain

Jitter is deviation of a clock edge from its ideal position in time. It is the time-domain manifestation of phase noise. The mechanism is straightforward: a signal crossing a logic threshold has finite slope, and any voltage noise on that signal translates directly into timing uncertainty:

$$\sigma_{t} = \frac{\sigma_{V}}{\left.\dfrac{dV}{dt}\right|_{\text{crossing}}}$$

A clock with a $1\ \text{V/ns}$ edge rate and $10\ \text{mV}_{\text{rms}}$ noise has $10\ \text{ps}_{\text{rms}}$ of jitter. That same noise on a $0.1\ \text{V/ns}$ edge gives $100\ \text{ps}_{\text{rms}}$. This is why clock signals use fast edges, controlled impedance, and differential signaling (LVDS): differential reception rejects common-mode noise and doubles the effective $dV/dt$.

Jitter is categorized by its statistics:

- **Random jitter (RJ):** Gaussian-distributed, unbounded in principle; arises from thermal noise and shot noise. Characterized by $\sigma_j$.
- **Deterministic jitter (DJ):** Bounded, non-Gaussian; arises from specific sources — inter-symbol interference, power supply noise at specific frequencies, crosstalk. Characterized by peak-to-peak amplitude.
- **Total jitter (TJ):** At a given bit error rate target, $\text{TJ} = \text{DJ} + 2Q \cdot \sigma_j$, where $Q$ is the Q-factor corresponding to the BER (e.g., $Q \approx 7.03$ for BER $= 10^{-12}$).

Random jitter accumulates as a random walk. After $N$ independent clock cycles each with jitter standard deviation $\sigma_j$, the accumulated phase error is:

$$\sigma_{\text{accumulated}} = \sigma_j \sqrt{N}$$

This unbounded growth is why clock recovery circuits in PCIe and SATA receivers must continuously re-synchronize to the incoming data stream rather than using a free-running local clock.

Jitter directly consumes timing margin. A flip-flop captures data correctly only if data is stable for the setup time $t_s$ before the clock edge and hold time $t_h$ after it. The timing margin for a pipeline stage is:

$$\text{margin} = T_{\text{clk}} - t_{\text{propagation}} - t_s - t_h - t_{\text{jitter,clock}} - t_{\text{jitter,data}}$$

When this goes negative, the flip-flop input violates setup or hold time and the output voltage resolves to an indeterminate voltage between $V_{IL}$ and $V_{IH}$. This is **metastability**. The probability that the output has not resolved to a valid logic level by time $t$ after the clock edge decays exponentially:

$$P(\text{unresolved at } t) \propto e^{-t / \tau}$$

where $\tau$ is a technology-dependent constant, typically $20$–$100\ \text{ps}$ in modern CMOS. Synchronizers in crossing-clock-domain circuits (including every SoC) rely on this exponential decay.

### Clock Skew: The Spatial Dimension of Timing

Skew is the difference in arrival time of the same clock edge at two different registers. It arises from wire length differences, buffer propagation delays, and load capacitance variation. Skew is a systematic, repeatable offset — the same $\delta$ every cycle — which distinguishes it from jitter.

For a register pair where flip-flop A launches data and flip-flop B captures it, with A's clock arriving $\delta$ earlier than B's:

$$t_{\text{propagation}} \leq T_{\text{clk}} - t_s + \delta_{\text{skew}}$$

Positive skew (capturing flop's clock arrives later) adds to the budget — it is "free" setup time. Negative skew reduces it. But skew also creates a hold time constraint that is often more dangerous because it cannot be fixed by slowing the clock:

$$t_{\text{propagation}} \geq t_h - \delta_{\text{skew}}$$

If $\delta_{\text{skew}}$ is large and positive, data launched by A may arrive at B while B's hold window is still open — a hold violation that causes the flip-flop to capture the *new* value instead of the intended one. Hold violations cause functional failures that cannot be fixed at the system level.

FPGA and ASIC place-and-route tools insert **clock tree buffers** to equalize clock arrival times. The result — a balanced H-tree or spine-and-branch distribution network — keeps skew below $50$–$100\ \text{ps
