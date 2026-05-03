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

Every sensor reading that enters a Linux system — a thermistor on a Raspberry Pi GPIO pin, a microphone feeding ALSA, a pressure transducer on an industrial Modbus controller — starts as a tiny, noisy analog voltage. Before an ADC can digitize it, something has to amplify it to a usable range, reject common-mode noise, and hold the operating point stable across temperature. The math in this module is the bridge between that physical signal and the integer in `/dev/input` or the PCM buffer in an ALSA period that Linux actually operates on.

---

## Core Concepts

### Gain

Gain is the ratio of output signal to input signal. For a voltage amplifier:

$$A_v = \frac{V_{out}}{V_{in}}$$

Expressed in decibels:

$$A_{dB} = 20 \log_{10}\left(\frac{V_{out}}{V_{in}}\right)$$

The factor of 20, not 10, appears because power scales as $V^2$: $10\log_{10}(V_2^2/V_1^2) = 20\log_{10}(V_2/V_1)$. This matters beyond notation: cascaded stages **add** in dB rather than multiply, which is why a 40 dB preamp followed by a −6 dB attenuator gives 34 dB of net gain by inspection, no multiplication required.

A few reference points worth memorizing:

| Ratio | dB |
|---|---|
| 1× (unity) | 0 dB |
| 2× | +6 dB |
| 10× | +20 dB |
| 0.5× | −6 dB |
| 0.001× | −60 dB |

### Biasing

A bipolar junction transistor (BJT) amplifies only when it is in the **active region** — $V_{BE} \approx 0.6\,\text{V}$, $V_{CE}$ large enough to keep the collector junction reverse-biased. The **quiescent point (Q-point)** is the DC operating point around which a signal swings.

Without a proper Q-point, a sinusoidal input centered on 0 V spends half its cycle driving $V_{BE}$ below the turn-on threshold. The transistor cuts off, the output clips on the negative half, and you have crossover distortion — a hard nonlinearity that contaminates every harmonic. The bias network — resistor divider, current mirror, or active bias — sets the base/gate at a fixed DC voltage so the transistor is always partially on. The AC signal then rides on top of that DC level and the transistor sees only a small excursion around the Q-point in both directions.

The Q-point also sets transconductance directly (see below), so a poorly chosen $I_{C,Q}$ changes the gain of every downstream calculation.

### Small-Signal Thinking

Around a valid Q-point, a nonlinear device is locally linear. The slope of $I_C$ vs. $V_{BE}$ at the Q-point defines **transconductance**:

$$g_m = \frac{\partial I_C}{\partial V_{BE}}\bigg|_{Q} = \frac{I_{C,Q}}{V_T}$$

where $V_T = kT/q \approx 26\,\text{mV}$ at $T = 300\,\text{K}$. At a quiescent collector current of $1\,\text{mA}$:

$$g_m = \frac{1\,\text{mA}}{26\,\text{mV}} \approx 38.5\,\text{mA/V}$$

The small-signal model (the **hybrid-$\pi$ model**) replaces the transistor with:
- $r_\pi = \beta / g_m$ between base and emitter
- A dependent current source $g_m v_{be}$ from collector to emitter
- All DC supplies replaced by short circuits (voltage sources) or open circuits (current sources)

This linearization is valid only for signal amplitudes small enough that the nonlinearity is negligible — roughly $v_{be} \ll V_T$, meaning peak swings well under 10 mV. Larger signals require either distortion analysis or a return to the full Ebers-Moll equations.

### Comparators

A comparator is a differential amplifier used **without negative feedback**. With open-loop gain $A_{OL} \sim 10^5$, a 100 µV imbalance drives the output to a supply rail. The output is binary regardless of the input magnitude.

Comparators are **not** interchangeable with op-amps in closed-loop circuits for two reasons:

1. **No internal frequency compensation.** General-purpose op-amps (e.g., LM741, TL071) are intentionally bandwidth-limited to keep them stable under feedback. A comparator (e.g., LM393) has no such compensation. Put feedback around it and it will oscillate.
2. **Open-collector outputs.** Many comparators (LM393, LM339) have open-collector outputs requiring an external pull-up resistor. This is deliberate — it lets you wire-AND multiple comparators or pull up to a different supply than the comparator itself uses.

The practical implication: if you are reading a threshold detector attached to a Raspberry Pi GPIO, the pull-up resistor on the comparator output (often `config.txt` sets `gpio=X=ip,pu` or the kernel configures it via `pinctrl`) is part of the circuit, not optional.

### Op-Amp Intuition

An ideal op-amp has infinite open-loop gain $A_{OL}$, infinite input impedance, and zero output impedance. Under **negative feedback**, these ideals collapse to two working rules:

1. **Virtual short:** The output drives itself until $V_+ = V_-$.
2. **Zero input current:** No current flows into either input terminal.

These are not intrinsic properties — they are consequences of high loop gain. Remove the feedback path and both rules fail immediately. This distinction is the source of most op-amp circuit errors.

Real deviations from the ideal:

| Parameter | Ideal | Typical (LM358) | Low-offset (OPA2134) |
|---|---|---|---|
| $A_{OL}$ | $\infty$ | 100 dB | 120 dB |
| Input offset $V_{OS}$ | 0 | ±2 mV | ±50 µV |
| Input bias $I_B$ | 0 | 45 nA | 5 pA |
| Output impedance | 0 | ~50 Ω (closed-loop) | ~10 Ω (closed-loop) |

$V_{OS}$ matters most in high-gain DC-coupled circuits: a 2 mV offset amplified by 100 becomes a 200 mV DC error on the output — enough to eat half a 3.3 V ADC's input range before the signal arrives.

---

## How It Works

### The Inverting Amplifier

```
        Rf
   ┌────┤├────┐
   │          │
   │   Rin    │
Vin─┤├──┬───(−)\
        │      >──── Vout
        └───(+)/
               |
              GND
```

Applying the golden rules: negative feedback holds $V_- = V_+ = 0\,\text{V}$ (virtual ground). Current through $R_{in}$:

$$I = \frac{V_{in}}{R_{in}}$$

No current flows into the input terminal, so all of $I$ flows through $R_f$, developing a voltage drop that the output must supply:

$$V_{out} = -I \cdot R_f = -\frac{R_f}{R_{in}} V_{in}$$

$$\boxed{A_v = -\frac{R_f}{R_{in}}}$$

The negative sign is a 180° phase inversion, not a numerical sign error. The gain depends only on a resistor ratio, which is why the circuit is stable and accurate as long as $A_{OL}$ is large enough that the virtual ground approximation holds. The condition for that approximation to hold within error $\epsilon$:

$$A_{OL} \gg \frac{1}{\epsilon} \cdot \frac{R_f}{R_{in}}$$

For 1% error with a gain of 100, you need $A_{OL} \gg 10{,}000$ — satisfied by any modern op-amp at DC.

### Gain-Bandwidth Product (GBW)

Real op-amps have one deliberately introduced dominant pole at $f_1$ (often a few Hz to a few hundred Hz). Above $f_1$, open-loop gain rolls off at −20 dB/decade (6 dB/octave):

$$A_{OL}(f) \approx \frac{A_{OL,DC}}{1 + j(f/f_1)} \xrightarrow{f \gg f_1} \frac{f_T}{f}$$

where $f_T$ is the **unity-gain frequency** ($A_{OL} = 1$ at $f = f_T$). The product:

$$\text{GBW} = A_{OL,DC} \cdot f_1 = f_T = \text{constant}$$

is fixed by the compensation capacitor inside the chip — you cannot change it by choice of feedback resistors. The consequence: closed-loop bandwidth $f_{-3\text{dB}}$ for a non-inverting gain $G$ is:

$$f_{-3\text{dB}} = \frac{f_T}{G}$$

For an LM358 ($f_T = 1\,\text{MHz}$) configured for a gain of 50 ($34\,\text{dB}$):

$$f_{-3\text{dB}} = \frac{1\,\text{MHz}}{50} = 20\,\text{kHz}$$

That is barely adequate for audio. An OPA2134 ($f_T = 8\,\text{MHz}$) at the same gain gives $
