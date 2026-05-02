---
id: 34
title: "Amplifiers and analog basics"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

Every sensor, microphone, ADC input, and radio front-end in a Linux system produces signals too small or too poorly conditioned to use directly. Getting this wrong has concrete consequences: an amplifier with wrong gain clips the ADC input and produces flat-topped waveforms that look like distortion; one with wrong biasing cuts off half the waveform silently; one without correct frequency compensation oscillates and either destroys itself or floods the signal chain with RF noise that corrupts nearby ADC readings. The op-amp solves all of these problems when used correctly, but its real behavior departs from the ideal in ways that corrupt precision measurements and destabilize feedback loops. Understanding those departures from first principles — not just memorizing formulas — is what lets you diagnose failures and select components that actually work.

---

## Core Concepts

### Gain

Gain is the ratio of output signal to input signal. For a voltage amplifier:

$$A_v = \frac{V_{out}}{V_{in}}$$

Gain is dimensionless when both quantities are voltages, but is almost always expressed in decibels:

$$A_{dB} = 20 \log_{10}\left(\frac{V_{out}}{V_{in}}\right)$$

A gain of 10 is 20 dB; a gain of 1000 is 60 dB. The log scale is not cosmetic — cascaded stages multiply their linear gains but *add* their dB values, which makes multi-stage design arithmetic tractable and lets you read stability margins directly off a Bode plot.

**Where does gain come from physically?** A transistor is a current-controlled (BJT) or voltage-controlled (MOSFET) device. A small change at the control terminal modulates a much larger current through the device. That current flowing through a load resistor $R_C$ produces a voltage swing $\Delta V = \Delta I_C \cdot R_C$. The ratio of that output swing to the input swing that caused it is the voltage gain. Gain is not magic — it is energy from the supply redirected by a small control signal.

### Biasing

A transistor amplifies only while it operates in its active (BJT) or saturation (MOSFET) region. If the DC operating point — the *quiescent point* $Q$ — is wrong, the transistor is either cut off (no current, signal is blocked entirely) or driven into hard saturation (transistor fully on, no headroom to swing). Biasing places the quiescent point in the middle of the linear range so that an AC signal can swing symmetrically in both directions without clipping.

For a BJT common-emitter stage with emitter degeneration:

$$I_C \approx \frac{V_B - V_{BE}}{R_E}$$

where $V_{BE} \approx 0.6\,\text{V}$ and $V_B$ is set by a resistor divider from the supply. This makes $I_C$ depend on $V_B / R_E$ — both stable quantities — rather than on $\beta$.

**Why does this matter for production hardware?** $\beta$ varies by 3× across units of the same part number and also shifts significantly with temperature. A bias scheme that depends directly on $\beta$ will produce a working prototype and broken production units. Emitter degeneration breaks that dependency: $I_C$ is now determined by resistor ratios, which are stable to 1% or better.

### Small-Signal Analysis

Once you have a stable DC operating point, you separate AC signal analysis from DC bias analysis entirely. The nonlinear transistor is replaced with a linear equivalent model — valid only for signals small enough that the nonlinearity is negligible.

The central parameter is **transconductance** $g_m$: the ratio of small-signal collector current change to small-signal base-emitter voltage change:

$$g_m = \frac{\partial I_C}{\partial V_{BE}}\bigg|_{Q} = \frac{I_C}{V_T}$$

where $V_T = kT/q \approx 26\,\text{mV}$ at room temperature ($T = 300\,\text{K}$). A transistor biased at $I_C = 1\,\text{mA}$ has $g_m = 1\,\text{mA} / 26\,\text{mV} \approx 38\,\text{mA/V}$.

The voltage gain of the common-emitter stage in small-signal terms:

$$A_v = -g_m R_C$$

The minus sign is real: the output is phase-inverted relative to the input. With $g_m = 38\,\text{mA/V}$ and $R_C = 1\,\text{k}\Omega$:

$$A_v = -(38 \times 10^{-3})(1 \times 10^3) = -38$$

**Why use a separate small-signal model rather than solving the full nonlinear equations?** Because linearity enables superposition, Thévenin/Norton equivalents, and phasor analysis — none of which apply to nonlinear systems. Small-signal analysis converts an intractable problem into a routine linear circuit problem. The price is that the model breaks down for large signals, which is when you see harmonic distortion in audio or intermodulation products in RF.

### Comparators

A comparator outputs a logic HIGH when $V_+ > V_-$ and LOW otherwise. It is an open-loop amplifier exploiting enormous open-loop gain to slam the output to one rail or the other for any nonzero differential input:

$$V_{out} = \begin{cases} V_{high} & \text{if } V_+ > V_- \\ V_{low} & \text{if } V_+ < V_- \end{cases}$$

**Why not use a general-purpose op-amp as a comparator?** Op-amps are internally compensated for stability in closed-loop feedback — they have a deliberately introduced dominant pole that rolls off their gain early (see below). This makes their output transitions slow: a compensated op-amp used open-loop may take microseconds to resolve a decision that a comparator resolves in nanoseconds. Worse, op-amp output stages are not designed for rail-to-rail switching and may enter an internal state that requires the input to overdrive far past the threshold before the output recovers — called *phase reversal* or *latch-up* depending on the architecture. Conversely, using a comparator (which has no frequency compensation) inside a feedback loop causes oscillation because the phase margin is undefined and almost certainly negative.

### Op-Amp Intuition: Virtual Short and Why It Works

An op-amp is a differential amplifier with open-loop DC gain $A_{OL}$ between $10^5$ and $10^8$ (100–160 dB). With negative feedback applied, the output adjusts to drive the differential input $V_+ - V_-$ to zero. This is the *virtual short* principle: in a correctly configured negative-feedback circuit, $V_+ \approx V_-$ because any departure from equality is amplified by $A_{OL}$ and immediately corrected at the output.

For the **non-inverting amplifier** (feedback divider from output to $V_-$, input at $V_+$):

$$A_{CL} = 1 + \frac{R_f}{R_1}$$

For the **inverting amplifier** (input through $R_{in}$ to virtual ground at $V_-$, feedback through $R_f$):

$$A_{CL} = -\frac{R_f}{R_{in}}$$

**Why does $A_{CL}$ depend only on resistors and not on $A_{OL}$?** Define the feedback fraction $B = R_1/(R_1 + R_f)$ for the non-inverting case. The closed-loop gain is:

$$A_{CL} = \frac{A_{OL}}{1 + A_{OL} B}$$

When $A_{OL} B \gg 1$, this reduces to $A_{CL} \approx 1/B$, which is set entirely by the resistor ratio. An op-amp whose $A_{OL}$ drifts from $10^6$ to $10^5$ with temperature changes $A_{CL}$ by a fraction of a part per million if $A_{OL} B = 10^4$. The resistors are doing the work; the op-amp is just enforcing the constraint.

---

## How It Works

### The Gain-Bandwidth Product and Frequency Compensation

Real op-amps have a dominant pole deliberately introduced by an internal compensation capacitor (Miller compensation is the most common technique). This causes the open-loop gain to roll off at $-20\,\text{dB/decade}$ starting from a corner frequency $f_1$ that may be as low as 10 Hz:

$$A_{OL}(f) = \frac{A_{OL,DC}}{1 + j\,f/f_1}$$

For $f \gg f_1$ this simplifies to:

$$|A_{OL}(f)| \approx \frac{f_T}{f}$$

where $f_T$ is the **unity-gain bandwidth** or **GBW** (gain-bandwidth product). The closed-loop bandwidth of any configuration is therefore:

$$BW_{CL} = \frac{f_T}{A_{CL}}$$

A 10 MHz GBW op-amp set to $A_{CL} = 100$ has $BW_{CL} = 100\,\text{kHz}$. If you need 1 MHz bandwidth at gain 100, you need a 100 MHz GBW part. This is a hard constraint from the compensation, not a fixable configuration issue.

**Why is the dominant pole necessary?** A multi-stage amplifier accumulates phase lag from each internal pole. Each pole contributes up to $-90°$ of phase shift asymptotically. If two or more internal poles exist and the total phase shift reaches $-180°$ while the loop gain $|A_{OL} \cdot B|$ is still greater than 1, negative feedback becomes positive feedback and the circuit oscillates. The dominant pole ensures that $|A_{OL}|$ drops below 0 dB (unity gain) before the higher-order poles contribute enough phase shift to reach $-180°$. The cost is bandwidth; the benefit is uncon
