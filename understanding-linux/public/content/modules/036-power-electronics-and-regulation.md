---
id: 36
title: "Power electronics and regulation"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Core Concepts
### What Power Electronics Really Is
Power electronics is the discipline of **controlling and converting electrical energy** using semiconductor switches that operate predominantly in their saturation (on) or cutoff (off) states. The fundamental advantage over linear dissipation is **energy‑conversion efficiency**: a switch either conducts with near‑zero voltage drop or blocks with near‑zero current, so instantaneous power loss \(P_{loss}=V_{DS}\cdot I_D\) is minimized.  

### Why Regulation Is Required
Every electronic system faces two unavoidable disturbances:
1. **Source variation** – mains voltage sags, battery voltage droops with state‑of‑charge, or alternator ripple.
2. **Load variation** – digital logic switches cause instantaneous current spikes (di/dt) that would otherwise produce voltage droop \( \Delta V = L\frac{dI}{dt} \) on the supply rails.  

If left unchecked, these disturbances cause timing errors, logic corruption, or even latch‑up. Regulation maintains the output within a tight band (e.g., ±1 %) despite these perturbations.

### Linear vs. Switching Regulators – First‑Principle View
*Linear regulator*: a **voltage‑controlled current source** (the pass transistor) dissipates the excess power as heat:  
\[
P_{diss} = (V_{in}-V_{out})\cdot I_{out}
\]  
The control loop forces the transistor’s \(V_{CE}\) (or \(V_{DS}\)) to whatever value is needed to keep \(V_{out}\) constant. Hence, efficiency is fundamentally limited by the voltage drop across the device.

*Switching regulator*: a **duty‑cycle‑modulated switch** alternately connects the input to an LC filter. The average output voltage equals the input multiplied by the duty cycle \(D\):  
\[
\boxed{V_{out}=D\cdot V_{in}} \qquad\text{(ideal buck)}
\]  
Energy is stored in the inductor during the on‑time and released to the load during the off‑time, so the switch sees either high current low voltage (on) or low current high voltage (off), keeping instantaneous loss low. Efficiency can exceed 90 % because the dominant loss becomes conduction (\(I^2R\)) and switching losses, not the large resistive drop of a linear pass element.

### Decoupling – High‑Frequency Impedance Engineering
A capacitor’s impedance is  
\[
Z_C(j\omega)=\frac{1}{j\omega C}+ESR + j\omega ESL
\]  
At low frequencies the capacitive term dominates; at high frequencies the **equivalent series inductance (ESL)** creates a self‑resonant frequency  
\[
f_{sr}=\frac{1}{2\pi\sqrt{LC}}
\]  
Above \(f_{sr}\) the device looks inductive and no longer decouples. Effective decoupling therefore requires:
* placing low‑ESL ceramics (e.g., 0402, 0201) as close as possible to the power pins,
* using a **frequency‑stacked** set of capacitors (e.g., 100 nF + 10 µF) so that each covers a different band,
* minimizing loop area to reduce parasitic inductance of the power‑ground path.

### Power Distribution – IR Drop and Plane Capacitance
On a PCB, the voltage at a load a distance \(x\) from the source sees a drop  
\[
\Delta V(x)=I_{load}\cdot R_{sheet}\cdot \frac{x}{W}
\]  
where \(R_{sheet}\) is the copper sheet resistance and \(W\) the trace width. For large currents, designers use **power planes** (large copper pours) that provide:
* low DC resistance (\(R\propto 1/(t\cdot W)\)),
* distributed capacitance between power and ground planes:  
\[
C_{plane}=\frac{\varepsilon_{r}\varepsilon_{0}A}{d}
\]  
This plane capacitance helps sustain voltage during fast transients, reducing the needed decoupling capacitance locally.

### Power Integrity – Impedance Target Methodology
The PDN (power distribution network) must present an impedance \(Z_{PDN}(f)\) below a target \(Z_{tgt}\) across the frequency band where the load draws significant current. The target is derived from the allowable voltage ripple \(\Delta V_{max}\) and the peak‑to‑peak current swing \(\Delta I_{pp}\):  
\[
Z_{tgt}= \frac{\Delta V_{max}}{\Delta I_{pp}}
\]  
Designers then shape \(Z_{PDN}\) with decoupling capacitors, plane capacitance, and loop inductance to stay under \(Z_{tgt}\) from DC up to tens or hundreds of MHz.

## How It Works
### Block‑Level View of a Regulated Supply
```
+--------+    +------------+    +----------+    +--------+
| Input  |--> |  Filter (L/C)  |-->|  Power   |-->|  Load  |
| Source |    |  Stage       |    | Stage    |    |        |
+--------+    +------------+    +----------+    +--------+
                     ^                         |
                     |   Error Amplifier       |
                     +----< Feedback Network ----+
```
1. **Input filtering** removes high‑frequency noise that could alias into the control loop.  
2. **Power stage** (linear pass transistor or switching MOSFET/diode) transfers energy.  
3. **Output filter** (inductor + capacitor) stores energy and smooths ripple.  
4. **Feedback network** senses \(V_{out}\), compares to a reference, and drives the error amplifier, which adjusts the power stage duty cycle or conductance.

### Deriving the Buck Converter Relation
Consider ideal switch, inductor \(L\), output capacitor \(C\), load \(R_{load}\). During the on‑time \(t_{ON}=D T_{S}\) the inductor voltage is \(V_{L}=V_{in}-V_{out}\). During off‑time \(t_{OFF}=(1-D)T_{S}\) it is \(-V_{out}\). Volt‑second balance over a period gives:  
\[
(V_{in}-V_{out})D T_{S} + (-V_{out})(1-D)T_{S}=0
\]  
\[
\Rightarrow V_{out}=D V_{in}
\]  
The output voltage ripple (peak‑to‑peak) for continuous conduction mode (CCM) is:  
\[
\Delta V_{out}= \frac{\Delta I_{L}}{8 f_{S} C}
\quad\text{with}\quad
\Delta I_{L}= \frac{(V_{in}-V_{out})D T_{S}}{L}
\]  
Thus, increasing \(L\) or \(C\) reduces ripple, while raising switching frequency \(f_{S}\) reduces both \(\Delta I_{L}\) and \(\Delta V_{out}\).

### Linear Regulator Small‑Signal Model
For an adjustable regulator (e.g., LM317) with feedback resistors \(R_1\) (from output to adjust pin) and \(R_2\) (from adjust pin to ground), the output is:  
\[
V_{out}=V_{ref}\left(1+\frac{R_2}{R_1}\right)+I_{adj}R_2
\]  
where \(V_{ref}\approx1.25\text{ V}\) and \(I_{adj}\) is the adjust pin current (typically \(<100\mu A\)). The open‑loop gain is the product of the error amplifier transconductance \(g_m\) and the load resistance \(R_{load}\):  
\[
A(s)=g_m R_{load}\frac{1}{1+s/(2\pi f_{p})}
\]  
The dominant pole \(f_{p}\) is set by the output capacitor and load: \(f_{p}=1/(2\pi R_{load}C_{out})\). To achieve stability, the compensation network (often a simple RC) must place a zero near \(f_{p}\) and ensure the unity‑gain crossover \(f_c\) is below about one‑tenth of the switching frequency (if any) or well below any parasitic poles.

### Input/Output Filter Design Equations
*Input LC low‑pass cutoff*:  
\[
f_{c,in}= \frac{1}{2\pi\sqrt{L_{in}C_{in}}}
\]  
Choose \(f_{c,in}\) at least one decade below the lowest switching frequency to attenuate conducted EMI.

*Output LC cutoff*:  
\[
f_{c,out}= \frac{1}{2\pi\sqrt{L_{out}C_{out}}}
\]  
Set \(f_{c,out}\) well below the switching frequency so that the filter attenuates the switching ripple while preserving loop bandwidth.

## Worked Examples
### Example 1 – Adjustable Linear Regulator (LM317) for 3.3 V from 12 V
**Goal**: \(V_{out}=3.3\text{ V}\), \(V_{in}=12\text{ V}\), load current up to 500 mA.  

1. **Resistor selection** (neglect \(I_{adj}\) initially):  
\[
\frac{R_2}{R_1}= \frac{V_{out}}{V_{ref}}-1 = \frac{3.3}{1.25}-1 = 1.64
\]  
Choose standard \(R_1=1.0\text{ k}\Omega\Rightarrow R_2=1.64\text{ k}\Omega\) → use 1.6 kΩ (1 % tolerance).  

2. **Adjust pin current correction**:  
\(I_{adj}=50\mu A\) (typical). The extra term \(I_{adj}R_2 = 50\mu A \times 1.6\text{ k}\Omega = 80\text{ mV}\).  
Adjust \(R_2\) slightly lower: target \(V_{out}=3.3\text{ V}\Rightarrow V_{out}-I_{adj}R_2 = 3.22\text{ V}\).  
\[
\frac{R_2}{R_1}= \frac{3.22}{1.25}-1 = 1.576\;\Rightarrow\;R_2\approx1.58\text{ k}\Omega
\]  
Use 1.58 kΩ (series 1.5 kΩ + 80 Ω).  

3. **Power dissipation in the pass transistor**:  
\[
P_{LM317}= (V_{in}-V_{out})\cdot I_{load}= (12-3.3)\text{ V}\times0.5\text{ A}=4.35\text{ W}
\]  
Thermal resistance junction‑to‑ambient \(\theta_{JA}\approx 50\text{ °C/W}\) (TO‑220 without heatsink) → temperature rise \(≈217\text{ °C}\) → **requires a heatsink**. With a heatsink \(\theta_{JA}=10\text{ °C/W}\), rise ≈ 44 °C, safe if ambient < 55 °C.  

4. **Dropout check**: LM317 typical dropout ≈ 2 V at 500 mA. Since \(V_{in}-V_{out}=8.7\text{ V}\) > dropout, regulation is fine.  

**Result**: Use \(R_1=1.0\text{ k}\Omega\), \(R_2=1.58\text{ k}\Omega\), add a 10 µF output capacitor (low ESR) and a 0.1 µF ceramic for high‑frequency decoupling.  

### Example 2 – Buck Switching Regulator (5 V, 2 A) from 12 V
**Specifications**: \(V_{in}=12\text{ V}\), \(V_{out}=5\text{ V}\), \(I_{out}=2\text{ A}\), switching frequency \(f_{S}=500\text{ kHz}\), allowable output ripple \(\Delta V_{out}=10\text{ mV}\).  

1. **Duty cycle**:  
\[
D = \frac{V_{out}}{V_{in}} = \frac{5}{12}=0.4167\;(41.7\%)
\]  

2. **Inductor selection for 30 % ripple current** (\(\Delta I_{L}=0.3 I_{out}=0.6\text{ A}\)):  
\[
L = \frac{(V_{in}-V_{out})D}{\Delta I_{L} f_{S}}
   = \frac{(12-5)\times0.4167}{0.6\times5\times10^{5}}
   = \frac{2.9169}{3\times10^{5}}
   \approx 9.7\;\mu\text{H}
\]  
Pick a standard 10 µH, saturation current > 3 A, DCR < 30 mΩ.  

3. **Output capacitor for voltage ripple** (using \(\Delta V_{out}= \Delta I_{L}/(8 f_{S} C)\)):  
\[
C = \frac{\Delta I_{L}}{8 f_{S} \Delta V_{out}}
   = \frac{0.6}{8\times5\times10^{5}\times0.01}
   = \frac{0.6}{40}
   = 15\;\mu\text{F}
\]  
Choose two parallel 10 µF X7R ceramics (total 20 µF) to margin ESR and temperature.  

4. **ESR contribution**: Ripple due to ESR: \(\Delta V_{ESR}= \Delta I_{L}\times ESR\). With ESR≈5 mΩ (typical for 10 µF 0805 X7R), \(\Delta V_{ESR}=0.6\times0.005=3\text{ mV}\). Combined with capacitive ripple (~7 mV) stays under 10 mV.  

5. **Current‑sense resistor for peak‑current mode control**: Desired peak current \(I_{peak}= I_{out}+ \Delta I_{L}/2 = 2 + 0.3 = 2.3\text{ A}\). If the comparator threshold is 0.5 V,  
\[
R_{sense}= \frac{V_{th}}{I_{peak}} = \frac{0.5}{2.3}\approx0.217\;\Omega
\]  
Use a 0.22 Ω, 1 % sense resistor, power rating \(P=I_{out}^2R\approx0.88\text{ W}\) → choose a 2 W resistor.  

6. **Efficiency estimate** (ignoring switching loss):  
Conduction loss in MOSFET: \(I_{out}^2 \times R_{DS(on)}\) (assume 30 mΩ) → \(2^2\times0.03=0.12\text{ W}\).  
Diode (or synchronous MOSFET) loss: \(I_{out}^2 \times R_{DS(on)Sync}\) (20 mΩ) → 0.08 W.  
Inductor copper loss: \(I_{out}^2 \times DCR\) (0.03 Ω) → 0.12 W.  
Total ≈ 0.32 W → output power \(P_{out}=5\times2=10\text{ W}\) → efficiency ≈ 96 % (ideal). Realistic ≈ 90 % after adding switching and core losses.  

7. **Control‑loop bandwidth**: Aim for \(f_c\approx \frac{1}{10} f_{S}=50\text{ kHz}\). With transconductance of error amp \(g_m=500\mu\text{S}\) and load resistance \(R_{load}=V_{out}/I_{out}=2.5\Omega\), open‑loop gain at DC: \(A_0=g_mR_{load}=0.00125\). Add a type‑II compensator (zero at \(f_z=5\text{ kHz}\), pole at \(f_p=50\text{ kHz}\)) to boost gain and achieve 0 dB crossing at 50 kHz with ~45° phase margin.  

**Result**: Bill of materials:  
* Inductor: 10 µH, 3 A saturation (e.g., TDK CLF7045N).  
* Output caps: 2×10 µF X7R 0805.  
* Sense resistor: 0.22 Ω, 2 W.  
* MOSFET: SiR840DP (30 V, 30 mΩ).  
* Schottky diode (if not synchronous): SS14 (40 V, 1 A) – better to use synchronous MOSFET for efficiency.  

**Verification via bash**:  
```bash
# Assuming a PWM-enabled regulator on pwmchip0
# Set duty cycle to 41.7% of 2µs period (500 kHz) → period_ns = 2000 ns
# duty_ns = period_ns * D = 2000 * 0.4167 ≈ 833 ns
echo 2000000 > /sys/class/pwm/pwmchip0/pwm0/period   # 2 ms? Wait, correct units: ns
# Actually period in ns:
echo 2000 > /sys/class/pwm/pwmchip0/pwm0/period      # 2000 ns = 2 µs
echo 833 > /sys/class/pwm/pwmchip0/pwm0/duty_cycle   # 833 ns ≈ 41.7%
```

## Common Mistakes
| # | Mistake | Why It’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Selecting an inductor based only on inductance, ignoring saturation current** | The inductor’s magnetic core saturates when \(B\) exceeds \(B_{sat}\); inductance drops sharply, causing \(\Delta I_L\) to run away. | Output voltage collapses, overheating, possible converter failure. |
| 2 | **Placing decoupling capacitors > 5 mm from the IC power pins** | Loop area grows, adding parasitic inductance \(L_{loop}\approx \mu_0 \cdot \frac{l}{w}\) (≈ nH/mm). At 100 MHz, a few nH yields impedance \(j\omega L\) of several ohms, reducing decoupling effectiveness. | High‑frequency noise couples into sensitive analog circuits, causing jitter or ADC errors. |
| 3 | **Using a linear regulator for a 12 V→3.3 V conversion at 2 A** | Power dissipation \(P=(V_{in}-V_{out})I = (12-3.3)\times2 = 17.4\text{ W}\). Even with a heatsink, junction temperature exceeds limits quickly. | Thermal shutdown, reduced reliability, wasted energy. |
| 4 | **Neglecting the right‑half‑plane zero (RHPZ) in boost converters** | A boost converter’s control‑to‑output transfer function contains a RHPZ at \(f_{z,RHP}= \frac{R_{load}(1-D)^2}{2\pi L}\). Ignoring it leads to phase loss when the loop gain crosses this frequency. | Loop becomes unstable, exhibiting ringing or oscillation at mid‑frequencies. |
| 5 | **Using a voltage‑feedback divider with too high resistance** | High divider resistors increase thermal noise (\(e_n=\sqrt{4kTRB}\)) and bias‑current error, degrading regulation accuracy and increasing susceptibility to leakage. | Output voltage drifts with temperature, reduced regulation precision. |

## Exercises
### Easy
1. **LM317 resistor calculation** – For a fixed 2.5 V output using an LM317 (Vref = 1.25 V), compute \(R_1\) and \(R_2\) (choose \(R_1=1\text{ k}\Omega\)).  
2. **Buck duty cycle** – A buck converter runs at 300 kHz with \(V_{in}=24\text{ V}\) and desired \(V_{out}=6\text{ V}\). What duty cycle is required?  

### Medium
1. **Inductor and capacitor sizing** – Design a buck regulator for \(V_{in}=18\text{ V}\), \(V_{out}=3.3\text{ V}\), \(I_{out}=1.5\text{ A}\), \(f_{S}=1\text{ MHz}\), targeting \(\Delta I_L=20\%\) and \(\Delta V_{out}=15\text{ mV}\). Provide L, C, and ESR limits.  
2. **Thermal check for linear regulator** – An LP2950‑5.0 (Vref = 1.23 V) sets 5 V from a 9 V supply, delivering 300 mA. Calculate power dissipation and required \(\theta_{JA}\) to keep junction temperature < 125 °C assuming ambient 40 °C.  

### Hard
1. **Loop‑gain derivation** – For a voltage‑mode buck converter with error amp transconductance \(g_m=400\mu\text{S}\), output resistance \(R_{out}=10\Omega\), and output filter \(L=15\mu H\), \(C=22\mu F\) (ESR = 10 mΩ), derive the small‑signal transfer function \(G(s)=\frac{\hat{V}_{out}}{\hat{V}_{c}}\). Compute the frequency of the dominant pole and the zero introduced by ESR.  
2. **Compensator design** – Using the transfer function from (1), design a type‑II compensator (values \(R_z\), \(C_z\), \(C_p\)) to achieve a crossover frequency of 50 kHz with at least 45° phase margin. Show the Bode plot reasoning.  
3. **Linux regulator API exercise** – Write a short C program that opens the regulator framework device `/dev/regulator` (or uses sysfs) to enable a regulator named `vdd_core`, set its voltage to 900 000 µV, and read back the actual voltage. Include
