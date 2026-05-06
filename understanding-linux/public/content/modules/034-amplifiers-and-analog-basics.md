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

## Core Concepts
### Amplifier Fundamentals
An amplifier is a two‑port network that increases the power of a signal by drawing energy from a supply. The essential property is **power gain** \(G_P = \frac{P_{out}}{P_{in}}\). For voltage‑amplifier stages we usually quote **voltage gain** \(A_v = \frac{v_{out}}{v_{in}}\); current gain follows similarly. Gain is not a free parameter—it is set by the transistor’s transconductance and the feedback/network impedances that surround it.

### Biasing and the Quiescent Point
Biasing fixes the DC operating (Q) point so that the transistor remains in its active region for the entire signal swing. If the Q point is too close to cutoff or saturation, the output clips. The bias network must satisfy two conflicting goals: provide a stable \(I_C\) despite temperature variations, and present a high enough input impedance to avoid loading the preceding stage. A classic solution is the **voltage‑divider bias** with an emitter resistor \(R_E\) that introduces negative feedback, stabilizing \(I_C\) against \(V_{BE}\) shifts.

### Small‑Signal Modeling
For sinusoidal or small‑amplitude signals we linearize the transistor’s exponential \(I_C(V_{BE})\) characteristic about the Q point. A first‑order Taylor expansion yields  
\[
i_c = g_m \, v_{be} + \frac{v_{be}}{r_\pi},
\]  
where \(g_m = \frac{I_C}{V_T}\) (transconductance) and \(r_\pi = \frac{\beta}{g_m}\). The **hybrid‑pi** model replaces the BJT with these linear elements, allowing standard circuit analysis (KCL/KVL) to derive voltage gain, input/output impedance, and bandwidth.

### Comparator vs. Op‑Amp
A comparator is an open‑loop high‑gain stage driven into saturation; its output logic level indicates which input is larger. An **operational amplifier** is the same high‑gain differential pair but intended for use with negative feedback, which forces the differential input voltage to (ideally) zero—the **virtual short** condition. With feedback, the closed‑loop gain becomes dependent only on the surrounding feedback network, not on the device’s open‑loop gain \(A_{OL}\).

---

## How It Works
### BJT Common‑Emitter Stage with Emitter Degeneration
Consider the circuit below (textual description; a schematic would show \(R_B1\), \(R_B2\) forming the divider, \(R_E\) at the emitter, \(R_C\) at the collector, load \(R_L\) coupled via a coupling capacitor).

1. **DC Bias Calculation**  
   The base voltage from the divider:  
   \[
   V_B = V_{CC}\frac{R_{B2}}{R_{B1}+R_{B2}} .
   \]  
   Assuming \(I_B \ll\) divider current, \(V_E = V_B - V_{BE}\).  
   The emitter current:  
   \[
   I_E \approx \frac{V_E}{R_E}, \qquad I_C \approx I_E .
   \]  
   Verify \(V_C = V_{CC} - I_C R_C\) lies between \(V_E\) and \(V_{CC}\) to confirm active mode.

2. **Small‑Signal Parameters**  
   \[
   g_m = \frac{I_C}{V_T},\quad r_\pi = \frac{\beta}{g_m}.
   \]  
   The emitter resistance seen looking into the emitter is \(r_e = \frac{1}{g_m}\) (≈\(V_T/I_C\)). With external \(R_E\) the effective emitter resistance is \(R_E' = r_e \parallel R_E\).

3. **Voltage Gain Derivation**  
   Applying a test voltage \(v_{in}\) at the base, the small‑signal collector current is  
   \[
   i_c = g_m \frac{v_{in}}{1+g_m R_E'} .
   \]  
   The collector voltage change (output) is  
   \[
   v_{out} = -i_c (R_C \parallel R_L) .
   \]  
   Hence the **closed‑loop voltage gain**:  
   \[
   A_v = \frac{v_{out}}{v_{in}} = -\,\frac{g_m (R_C \parallel R_L)}{1+g_m R_E'} .
   \]  
   The minus sign indicates 180° phase shift. Increasing \(R_E\) reduces gain but improves linearity and stabilizes the Q point.

4. **Input and Output Impedance**  
   \[
   R_{in} = r_\pi \parallel (R_{B1}\parallel R_{B2}) \bigl(1+\beta \frac{R_E'}{R_E'+r_e}\bigr) ,
   \]  
   \[
   R_{out} = R_C \parallel R_L .
   \]  
   The emitter degeneration boosts \(R_{in}\) (good for coupling) while leaving \(R_{out}\) essentially unchanged.

### Ideal Op‑Amp with Negative Feedback
An ideal op‑amp assumes:  
- Open‑loop gain \(A_{OL} \to \infty\)  
- Input impedance \(R_{in} \to \infty\)  
- Output impedance \(R_{out} \to 0\)  
- Zero input offset voltage.

With negative feedback, the **virtual short** (\(v_+ = v_{-}\)) and **virtual open** (\(i_{+} = i_{-} = 0\)) hold. For an **inverting amplifier** (input via \(R_{in}\) to \(-\), feedback \(R_f\) from output to \(-\)):  
Applying KCL at the inverting node:  
\[
\frac{v_{in}-v_{-}}{R_{in}} + \frac{v_{out}-v_{-}}{R_f} = 0 .
\]  
Since \(v_{-}=v_{+}=0\) (grounded non‑inverting input),  
\[
\frac{v_{in}}{R_{in}} + \frac{v_{out}}{R_f} = 0 \;\Longrightarrow\; A_v = -\frac{R_f}{R_{in}} .
\]  
Thus the gain depends solely on the ratio of two resistors, independent of \(A_{OL}\), bandwidth, or temperature—provided the op‑amp remains within its linear region (output not saturated, frequency below the gain‑bandwidth product).

**Non‑inverting configuration** yields  
\[
A_v = 1 + \frac{R_f}{R_g} ,
\]  
where \(R_g\) is the resistor from the inverting input to ground.

---

## Worked Examples
### Example 1: BJT Common‑Emitter with Emitter Degeneration
**Given:**  
- \(V_{CC}=12\text{ V}\)  
- Bias divider: \(R_{B1}=56\text{ kΩ}\), \(R_{B2}=12\text{ kΩ}\)  
- Emitter resistor \(R_E=1.2\text{ kΩ}\)  
- Collector resistor \(R_C=3.6\text{ kΩ}\)  
- Load \(R_L=10\text{ kΩ}\) (coupled via capacitor)  
- \(\beta=100\), \(V_{BE}=0.7\text{ V}\), \(V_T=26\text{ mV}\)  
- Input: 1 V pp sine wave at 1 kHz (coupled via capacitor)

**Step‑by‑step:**

1. **Base voltage**  
   \[
   V_B = 12\frac{12k}{56k+12k}=12\frac{12}{68}=2.12\text{ V}.
   \]

2. **Emitter voltage**  
   \[
   V_E = V_B - V_{BE}=2.12-0.7=1.42\text{ V}.
   \]

3. **Emitter and collector currents**  
   \[
   I_E = \frac{V_E}{R_E}= \frac{1.42}{1.2k}=1.18\text{ mA}.
   \]  
   \(I_C \approx I_E = 1.18\text{ mA}\) (base current \(I_B=I_C/\beta≈11.8\mu A\), negligible vs divider current).

4. **Collector voltage**  
   \[
   V_C = V_{CC} - I_C R_C = 12 - (1.18m)(3.6k)=12-4.25=7.75\text{ V}.
   \]  
   Since \(V_E < V_C < V_{CC}\), the transistor is in active mode.

5. **Small‑signal parameters**  
   \[
   g_m = \frac{I_C}{V_T}= \frac{1.18\text{ mA}}{26\text{ mA}}≈45.4\text{ mS}.
   \]  
   \[
   r_\pi = \frac{\beta}{g_m}= \frac{100}{45.4\text{ mS}}≈2.20\text{ kΩ}.
   \]  
   \[
   r_e = \frac{1}{g_m}=22.0\text{ Ω}.
   \]  
   Effective emitter resistance: \(R_E' = r_e \parallel R_E = \frac{22·1200}{22+1200}≈21.6\text{ Ω}\) (≈\(r_e\) because \(R_E\gg r_e\)).

6. **Voltage gain**  
   \[
   R_C\parallel R_L = \frac{3.6k·10k}{3.6k+10k}=2.65\text{ kΩ}.
   \]  
   \[
   A_v = -\frac{g_m (R_C\parallel R_L)}{1+g_m R_E'} = -\frac{0.0454·2.65k}{1+0.0454·21.6}
   = -\frac{120.3}{1+0.98}= -\frac{120.3}{1.98}= -60.8 .
   \]  
   Magnitude ≈ 60.8 (≈35.7 dB). The negative sign indicates inversion.

7. **Output amplitude**  
   Input amplitude = 0.5 V (peak).  
   Output peak = \(|A_v|·0.5 = 30.4\text{ V}\).  
   However the supply limits swing: the collector can only vary between ≈\(V_E\) (1.42 V) and \(V_{CC}\) (12 V). The available headroom is ~\(12-1.42=10.58\) V peak, so the circuit will clip.  
   **Clipping check:** maximum undistorted peak = \(\frac{V_{CC}-V_E}{2}= \frac{12-1.42}{2}=5.29\text{ V}\).  
   Thus the actual undistorted output peak ≈ 5.29 V (≈10.6 Vpp). The gain is effectively limited by headroom; to get 10 Vpp undistorted we would need a higher \(V_{CC}\) or lower gain.

**Result:** With the given bias, the amplifier can deliver up to ≈10.6 Vpp undistorted sine wave at 1 kHz; beyond that the output clips at the supply rails.

### Example 2: Op‑Amp Inverting Amplifier
**Given:**  
- Op‑amp: ideal (infinite \(A_{OL}\), infinite \(R_{in}\), zero \(R_{out}\))  
- Feedback resistor \(R_f = 10\text{ kΩ}\)  
- Input resistor \(R_{in}=1\text{ kΩ}\)  
- Input: 1 Vpp sine wave at 10 kHz  
- Supply: ±12 V  

**Analysis:**  
Using the virtual short, inverting node voltage = 0 V.  
KCL: \(\frac{v_{in}-0}{1k} + \frac{v_{out}-0}{10k}=0\) → \(v_{out} = -10·v_{in}\).  

Thus gain magnitude = 10 (20 dB).  

**Output amplitude:**  
Input peak = 0.5 V → output peak = 5 V → output pp = 10 V.  

**Bandwidth check:**  
Assume op‑amp GBW = 1 MHz. Closed‑loop bandwidth = \(\frac{GBW}{|A_v|} = \frac{1\text{ MHz}}{10}=100\text{ kHz}\). At 10 kHz we are well within the flat region, so gain ≈ 10 holds.  

**Slew‑rate limit:**  
If the op‑amp slew rate SR = 0.5 V/µs, the maximum undistorted slope for a sine wave is \(2π f V_{peak}\).  
Required SR = \(2π·10k·5 = 314,000\text{ V/s}=0.314\text{ V/µs}\) < 0.5 V/µs, so no slew‑rate distortion.

**Result:** Output is a 10 Vpp sine wave, inverted, undistorted at 10 kHz.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | How to Avoid |
|---|---------|----------------|--------------|
| 1 | **Assuming \(A_v = -R_C/R_E\) without considering \(r_e\) or loading** | The simplified formula ignores the intrinsic emitter resistance \(r_e\) and the effect of \(R_L\) on collector impedance. At high collector currents \(r_e\) is not negligible, and loading reduces effective gain. | Compute \(g_m = I_C/V_T\) and use the full gain expression \(A_v = -g_m(R_C\parallel R_L)/(1+g_m(R_E\parallel r_e))\). |
| 2 | **Setting bias point by only measuring \(V_{BE}\) and ignoring temperature drift** | \(V_{BE}\) changes ≈ ‑2 mV/°C; a fixed base voltage will cause \(I_C\) to drift, moving the Q point toward cutoff or saturation. | Use a voltage‑divider bias with an emitter resistor; the feedback stabilizes \(I_C\) ( \(\partial I_C/\partial V_{BE} \approx 1/(R_E+ r_e)\) ). |
| 3 | **Treating an op‑amp as having infinite bandwidth** | Real op‑amps have a gain‑bandwidth product (GBW). Closed‑loop gain reduces bandwidth: \(f_{BW}=GBW/|A_{cl}|\). Ignoring this leads to unexpected gain roll‑off and phase shift. | Always check \(f_{BW}\) for the intended gain; if needed, compensate or choose a device with higher GBW. |
| 4 | **Using a comparator in place of an op‑amp with feedback** | Comparators are designed to operate open‑loop and saturate quickly; with feedback they can oscillate or exhibit hysteresis unpredictably. | Use a dedicated comparator IC (e.g., LM393) when you need a threshold detector; for linear amplification use an op‑amp configured with feedback. |
| 5 | **Neglecting coupling capacitor effects on low‑frequency gain** | Coupling capacitors form high‑pass filters with the input/output impedance; ignoring them yields incorrect low‑frequency gain and phase. | Compute the -3 dB point: \(f_L = 1/(2π R_{in} C_{in})\) (input side) and similarly for output; ensure \(f_L\) is below the lowest signal frequency of interest. |
| 6 | **Assuming resistor ratios directly set gain in a BJT stage without checking headroom** | Even if the small‑signal gain formula predicts a certain gain, the output may clip if the swing exceeds supply rails. | Verify quiescent point and verify that \(|\Delta V_{out}| < \min(V_C-V_E, V_{CC}-V_C)\) for the expected signal amplitude. |

---

## Exercises
### Easy
1. **BJT Gain Calculation**  
   A common‑emitter amplifier uses \(R_C=2.2\text{ kΩ}\), \(R_E=470\text{ Ω}\), \(V_{CC}=10\text{ V}\), and a stiff bias that fixes \(I_C=2\text{ mA}\).  
   - Compute \(g_m\), \(r_e\), and the predicted voltage gain magnitude (ignore \(R_L\)).  
   - If a load \(R_L=4.7\text{ kΩ}\) is attached, what is the loaded gain?

### Medium
2. **Bias Design for Desired Collector Current**  
   Design a voltage‑divider bias network for a BJT with \(\beta=150\), \(V_{BE}=0.7\text{ V}\), targeting \(I_C=1.5\text{ mA}\) and \(V_{CE}=6\text{ V}\) from a \(V_{CC}=15\text{ V}\) supply. Choose standard resistor values (E12 series) for \(R_{B1}\) and \(R_{B2}\) and an emitter resistor \(R_E\) that keeps the divider current at least 10×\(I_B\). Show all calculations and verify the Q point.

### Hard
3. **Op‑Amp Integrator with Slew‑Rate Limit**  
   Consider an ideal op‑amp integrator: feedback capacitor \(C=100\text{ nF}\), input resistor \(R=10\text{ kΩ}\), non‑inverting input grounded.  
   - Derive the output voltage for a square‑wave input of amplitude ±1 V and frequency 1 kHz.  
   - If the op‑amp has a slew rate of 0.2 V/µs, determine whether the output can keep up with the ideal integral. If not, compute the actual peak output voltage and describe the waveform distortion.  
   - Suggest a component change to eliminate the slew‑rate limitation while preserving the same integration time constant.

---

## Linux Connection
Amplifier and analog concepts appear throughout the Linux kernel and user‑space stacks, especially in audio, sensor, and control subsystems.

### ALSA (Advanced Linux Sound Architecture)
The ALSA driver exposes PCM devices that ultimately drive DACs (digital‑to‑analog converters) which contain output amplifiers.  
- List sound cards:  
  ```bash
  $ aplay -l
  ```
- Set playback volume via the mixer (the mixer controls the gain of the analog output stage):  
  ```bash
  $ amixer sset 'Master' 80%
  ```
- Play a test tone and observe the amplifier’s output with an oscilloscope or a USB‑audio ADC:  
  ```bash
  $ speaker-test -t sine -f 440 -l 1   # 440 Hz sine, 1 iteration
  ```

### Industrial I/O (IIO) Subsystem
Analog‑to‑digital converters (ADCs) often include a programmable gain amplifier (PGA) before the conversion stage. The IIO framework lets userspace read raw values and apply the device‑specific scale.  
- Locate IIO devices:  
  ```bash
  $ ls /sys/bus/iio/devices/
  ```
- Example: reading a channel with built‑in gain:  
  ```bash
  $ cat /sys/bus/iio/devices/iio:device0/in_voltage0_raw
  2048
  $ cat /sys/bus/iio/devices/iio:device0/in_voltage0_scale
  0.00048828125   # V per LSB (for a 12‑bit ADC with ±2.5 V range)
  ```
- Compute voltage:  
  ```bash
  $ raw=$(cat /sys/bus/iio/devices/iio:device0/in_voltage0_raw)
  $ scale=$(cat /sys/bus/iio/devices/iio:device0/in_voltage0_scale)
  $ echo "$raw * $scale" | bc
  1.000000
  ```
- Many ADCs expose an `in_voltage0_gain` attribute to set the PGA:  
  ```bash
  $ echo 2 > /sys/bus/iio/devices/iio:device0/in_voltage0_gain   # set gain = 2×
  ```

### PulseAudio / PipeWire
These sound servers manage software volume (digital gain) and route streams to hardware ALSA devices, effectively controlling the overall gain chain from application to speaker.  
- List sink (output) gains:  
  ```bash
  $ pactl list sinks | grep -A2 'Volume:'
  ```
- Adjust sink volume (linear gain in dB):  
  ```bash
  $ pactl set-sink-volume @DEFAULT_SINK@ +3dB
  ```

### Real‑Time Control (e.g., motor drives)
Analog current‑sense amplifiers feed the ADC of a microcontroller that runs a Linux‑based real‑time subsystem (e.g., using the PREEMPT_RT patch). The control loop gain is set by the transimpedance amplifier; misunderstanding its bandwidth leads to instability. Developers can inspect the amplifier’s transfer function via sysfs if the driver exposes it:  
```bash
$ cat /sys/bus/iio/devices/iio:device0/in_voltage0_offset   # optional offset calibration
```

These examples show how the abstract amplifier concepts translate into concrete sysfs attributes, mixer controls, and command‑line tools that a Linux engineer manipulates daily.

---

## Why This Matters
Mastering amplifier theory is not an academic exercise; it directly determines the fidelity, efficiency, and reliability of every Linux‑based system that interacts with the physical world.  
- In **audio pipelines**, the gain structure set by ALSA mixers, PulseAudio, and the hardware output amplifier dictates signal‑to‑noise ratio and headroom; mis‑setting any stage causes clipping or excessive noise, degrading user experience.  
- In **sensor interfaces**, the PGA inside an IIO ADC defines the smallest detectable voltage; misunderstanding its gain or bandwidth leads to wasted dynamic range or aliasing, compromising measurement accuracy.  
- In **control loops** (motor drives, power supplies, RF transceivers), the loop gain is the product of the transimpedance amplifier, the ADC, the controller, and the PWM stage. Errors in any gain term cause instability, overshoot, or poor disturbance rejection—exactly the pitfalls highlighted in the common‑mistakes list.  
- By linking first‑principles derivations (hybrid‑pi model, virtual short, GBW limits) to tangible Linux interfaces (`alsamixer
