---
id: 31
title: "Capacitors and inductors"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Core Concepts
### Capacitors – physics and circuit law
A capacitor stores energy in an electric field **E** between two conductive plates separated by a dielectric.  
Applying Gauss’ law to a pillbox that encloses one plate gives the surface charge density σ = Q/A, and the uniform field  

\[
E = \frac{\sigma}{\varepsilon} = \frac{Q}{\varepsilon A},
\]

where ε = ε₀εᵣ is the permittivity of the dielectric.  
The voltage across the plates is the line integral of **E** over the plate separation d:

\[
V = \int_0^d E\,dx = \frac{Qd}{\varepsilon A}.
\]

Solving for the charge yields the definition of capacitance  

\[
\boxed{C \equiv \frac{Q}{V}= \frac{\varepsilon A}{d}} \qquad\text{(farads)}.
\]

Because charge cannot appear instantaneously, the constitutive relation follows from differentiating Q = CV:

\[
I = \frac{dQ}{dt}=C\frac{dV}{dt}. \tag{1}
\]

The energy stored is obtained by integrating the instantaneous power \(p = VI\):

\[
W = \int_0^V V'\,C\,dV' = \frac12 CV^{2}. \tag{2}
\]

### Inductors – physics and circuit law
An inductor consists of N turns of wire wound around a magnetic core. A current I produces a magnetic flux Φ linking each turn; the total flux linkage is  

\[
\lambda = N\Phi .
\]

For a linear material, λ is proportional to I, defining inductance  

\[
\boxed{L \equiv \frac{\lambda}{I}= \frac{N\Phi}{I}} \qquad\text{(henrys)}.
\]

Faraday’s law of induction states that a changing flux induces an emf opposing the change:

\[
V = -\frac{d\lambda}{dt}= -L\frac{dI}{dt}. \tag{3}
\]

The magnetic energy stored is  

\[
W = \int_0^I \lambda\,dI' = \frac12 LI^{2}. \tag{4}
\]

### First‑order RC and RL circuits – derivation of the time constant
**RC series** (voltage source Vₛ, resistor R, capacitor C, initially Vc(0)=0).  
Kirchhoff’s voltage law gives  

\[
Vₛ = V_R + V_C = IR + V_C.
\]

Using (1) for the capacitor, \(I = C \frac{dV_C}{dt}\), we obtain the linear ODE  

\[
RC\frac{dV_C}{dt}+V_C = Vₛ. \tag{5}
\]

Its solution with Vc(0)=0 is  

\[
\boxed{V_C(t)=Vₛ\bigl(1-e^{-t/\tau}\bigr)},\qquad \tau = RC. \tag{6}
\]

The resistor current follows from Ohm’s law:  

\[
I(t)=\frac{Vₛ}{R}e^{-t/\tau}. \tag{7}
\]

**RL series** (voltage source Vₛ, resistor R, inductor L, initially I(0)=0).  
KVL:  

\[
Vₛ = V_R + V_L = IR + L\frac{dI}{dt}.
\]

Substituting gives  

\[
L\frac{dI}{dt}+RI = Vₛ \;\;\Longrightarrow\;\; \frac{dI}{dt}+\frac{R}{L}I=\frac{Vₛ}{L}. \tag{8}
\]

Solution with I(0)=0:  

\[
\boxed{I(t)=\frac{Vₛ}{R}\bigl(1-e^{-t/\tau}\bigr)},\qquad \tau = \frac{L}{R}. \tag{9}
\]

The inductor voltage is  

\[
V_L(t)=L\frac{dI}{dt}=Vₛ e^{-t/\tau}. \tag{10}
\]

### Impedance and resonance in the frequency domain
For a sinusoidal steady‑state \(e^{j\omega t}\) we replace derivatives by \(j\omega\).  
Impedances:  

\[
Z_R = R,\qquad Z_C = \frac{1}{j\omega C},\qquad Z_L = j\omega L.
\]

Series RLC impedance  

\[
\boxed{Z = R + j\bigl(\omega L - \frac{1}{\omega C}\bigr)}. \tag{11}
\]

Resonance occurs when the imaginary part vanishes:

\[
\omega L = \frac{1}{\omega C}\;\Longrightarrow\; 
\boxed{\omega_0 = \frac{1}{\sqrt{LC}}},\qquad f_0=\frac{\omega_0}{2\pi}. \tag{12}
\]

At ω₀ the circuit behaves purely resistively, giving maximum current \(I_{max}=Vₛ/R\).

---

## How It Works
The transient solutions (6)–(10) arise directly from the first‑order ODEs (5) and (8).  
Physically, a capacitor **cannot** change its voltage instantaneously because that would require infinite current (I = C dV/dt). The resistor limits that current, producing an exponential approach to the final voltage with a characteristic time τ = RC that quantifies how much charge can be moved per volt of driving force.  

Similarly, an inductor **cannot** change its current instantaneously; a sudden change would demand infinite voltage (V = L dI/dt). The resistor in series limits the voltage, so the current rises exponentially with τ = L/R, the ratio of magnetic energy storage (½LI²) to the rate at which resistance dissipates power (I²R).  

In the frequency domain, the impedance expression (11) shows that the capacitor’s reactance \(-1/(\omega C)\) decreases with frequency, while the inductor’s reactance \(+\omega L\) increases. At low frequencies the capacitor dominates (high impedance), at high frequencies the inductor dominates, and at ω₀ they cancel, leaving only resistance.

---

## Worked Examples
### Example 1 – RC charging
**Given:** C = 1 µF, R = 1 kΩ, step voltage Vₛ = 5 V, capacitor initially uncharged.  

1. **Time constant**  
   \[
   \tau = RC = (1\times10^{3})(1\times10^{-6}) = 1\times10^{-3}\,\text{s}=1\text{ ms}.
   \]

2. **Voltage across capacitor** (6)  
   \[
   V_C(t)=5\bigl(1-e^{-t/1\text{ms}}\bigr)\;\text{V}.
   \]

   - At t = τ: \(V_C = 5(1-e^{-1}) ≈ 5(0.632)=3.16\) V.  
   - At t = 5τ: \(V_C ≈ 5(1-e^{-5}) ≈ 4.96\) V (≈99% of final).

3. **Current through resistor** (7)  
   \[
   I(t)=\frac{5}{1\text{kΩ}}e^{-t/1\text{ms}} = 5\text{ mA}\;e^{-t/1\text{ms}}.
   \]

   - At t = τ: I ≈ 5 mA·0.368 = 1.84 mA.  
   - At t = 5τ: I ≈ 5 mA·0.0067 ≈ 33 µA.

4. **Energy stored at t = 5τ** using (2)  
   \[
   W = \tfrac12 C V_C^{2} ≈ \tfrac12 (1µF)(4.96\text{ V})^{2} ≈ 12.3µ\text{J}.
   \]

**Python script to plot** (same as draft, but with explicit units and annotations):

```python
import numpy as np
import matplotlib.pyplot as plt

R = 1e3          # Ω
C = 1e-6         # F
V = 5.0          # V
tau = R * C      # 1 ms
t = np.linspace(0, 5*tau, 1000)

I = V / R * np.exp(-t / tau)          # A
Vc = V * (1 - np.exp(-t / tau))       # V

plt.figure(figsize=(6,4))
plt.plot(t*1e3, I*1e3, label='Current (mA)')
plt.plot(t*1e3, Vc, label='V_C (V)')
plt.xlabel('Time (ms)')
plt.ylabel('Amplitude')
plt.title('RC step response (R=1 kΩ, C=1 µF, V=5 V)')
plt.grid(True, which='both', ls='--', lw=0.5)
plt.legend()
plt.tight_layout()
plt.show()
```

### Example 2 – RL rise with voltage step
**Given:** L = 1 mH, R = 1 Ω, step voltage Vₛ = 5 V, inductor initially zero current.  

1. **Time constant**  
   \[
   \tau = \frac{L}{R} = \frac{1\times10^{-3}}{1}=1\text{ ms}.
   \]

2. **Current through inductor** (9)  
   \[
   I(t)=5\bigl(1-e^{-t/1\text{ms}}\bigr)\;\text{A}.
   \]

   - At t = τ: I ≈ 5·0.632 = 3.16 A.  
   - At t = 5τ: I ≈ 5·0.993 = 4.97 A.

3. **Voltage across inductor** (10)  
   \[
   V_L(t)=5\,e^{-t/1\text{ms}}\;\text{V}.
   \]

   - At t = τ: V_L ≈ 5·0.368 = 1.84 V.  
   - At t = 5τ: V_L ≈ 5·0.0067 = 0.034 V (practically zero).

4. **Voltage across resistor** (Ohm’s law)  
   \[
   V_R(t)=RI(t)=5\bigl(1-e^{-t/1\text{ms}}\bigr)\;\text{V},
   \]
   which complements V_L so that V_R+V_L=Vₛ at all times.

5. **Magnetic energy stored at t = 5τ** using (4)  
   \[
   W = \tfrac12 L I^{2} ≈ \tfrac12 (1\text{ mH})(4.97\text{ A})^{2} ≈ 12.3\text{ mJ}.
   \]

**Python script to plot**:

```python
import numpy as np
import matplotlib.pyplot as plt

L = 1e-3          # H
R = 1.0           # Ω
V = 5.0           # V
tau = L / R       # 1 ms
t = np.linspace(0, 5*tau, 1000)

I = V / R * (1 - np.exp(-t / tau))   # A
VL = V * np.exp(-t / tau)            # V
VR = R * I                           # V

plt.figure(figsize=(6,4))
plt.plot(t*1e3, I, label='Current (A)')
plt.plot(t*1e3, VL, label='V_L (V)')
plt.plot(t*1e3, VR, label='V_R (V)')
plt.xlabel('Time (ms)')
plt.ylabel('Amplitude')
plt.title('RL step response (L=1 mH, R=1 Ω, V=5 V)')
plt.grid(True, which='both', ls='--', lw=0.5)
plt.legend()
plt.tight_layout()
plt.show()
```

---

## Common Mistakes
| # | Misconception | Why it’s wrong (first‑principles explanation) |
|---|----------------|------------------------------------------------|
| 1 | “A capacitor blocks DC instantly.” | A capacitor only blocks DC **after** it has charged to the applied voltage. Initially it behaves like a short because \(I = C\,dV/dt\); with a step voltage, dV/dt is infinite at t=0, giving an impulse of current. Only after the voltage across the capacitor equals the source does the current fall to zero. |
| 2 | “An inductor is a short circuit at DC immediately.” | An inductor opposes *changes* in current. At t=0⁺, with a step voltage, the current is zero and begins to rise as \(I(t)=\frac{V}{R}(1-e^{-t/\tau})\). Only after many time constants (t≫τ) does the current reach its steady‑state value V/R, at which point the inductor’s voltage is zero and it appears as a short. |
| 3 | “Reactance can be added algebraically to resistance.” | Reactance is imaginary; impedance is a complex sum \(Z = R + jX\). Adding magnitudes ignores phase shift between voltage and current, leading to errors in power calculations (real power = \(I^{2}R\), not \(I^{2}|Z|\)). |
| 4 | “The time constant of an RL circuit is L/R regardless of initial conditions.” | τ = L/R describes the *natural* response when the circuit is source‑free. With a step input, the forced response adds a steady‑term; the total solution is the sum of forced and natural parts. Ignoring the forced term gives the wrong transient amplitude. |
| 5 | “In resonance, impedance is zero.” | In a series RLC, impedance is **minimum** but equals the pure resistance R (the reactive parts cancel). Zero impedance would require R=0, which is unrealistic; any series resistance limits the peak current to Vₛ/R. |

---

## Exercises
### Easy
1. A capacitor holds a charge Q = 8 µC when the voltage across it is V = 4 V. Compute its capacitance and the energy stored.  
2. An inductor carries a steady current I = 2 A and stores magnetic energy W = 0.5 J. Find its inductance.

### Medium
3. Design an RC low‑pass filter with a cutoff frequency \(f_c = 10\) kHz using a resistor of 2 kΩ. What capacitance is required? (Recall \(f_c = 1/(2\pi RC)\).)  
4. For a series RLC circuit with L = 10 mH and C = 100 nF, calculate the resonant frequency \(f_0\) and the impedance at resonance if R = 5 Ω.

### Hard
5. A series RLC circuit (R = 50 Ω, L = 20 mH, C = 0.5 µF) is subjected to a voltage step Vₛ = 12 V at t=0. Derive the expression for the capacitor voltage \(V_C(t)\) (including the under‑damped case if applicable) and compute the maximum overshoot percentage relative to the final steady‑state value.  
6. Using the Linux `ngspice` tool, simulate the RC circuit from Exercise 3 (R=2 kΩ, C from your answer) with a 5 V step. Report the simulated 10‑%‑to‑90 % rise time and compare it to the theoretical \(2.2\tau\).

---

## Linux Connection
Linux treats many electronic subsystems as **RC** or **RL** networks when configuring timing, debounce, or power‑rail filtering. Concrete examples:

### 1. I²C bus pull‑up RC timing
The I²C core calculates the maximum bus frequency from the pull‑up resistance and the total bus capacitance (including PCB traces and device pin capacitance). The relevant sysfs entry shows the effective capacitance used by the kernel:

```bash
# Show the I²C bus 1 timing parameters (on a typical Raspberry Pi)
cat /sys/devices/i2c-1/i2c-1/device/boarding
# Output may contain:  bus_capacitance=50 pF   pull_up_resistance=4.7 kΩ
```

From these values the kernel computes the RC time constant \(\tau = R_{\text{pullup}} C_{\text{bus}}\) and enforces a minimum clock low period of \(3\tau\) to guarantee proper signal integrity. Adjusting the pull‑up resistors in `/boot/config.txt` (e.g., `dtparam=i2c_arm_baudrate=400000`) changes the effective τ.

### 2. USB VBUS debounce (RC model)
When a USB device is attached, the VBUS line is monitored through an RC network that filters mechanical bounce. The debounce time is exposed via the power subsystem:

```bash
# Debounce time (in milliseconds) for USB port 1-1
cat /sys/bus/usb/devices/1-1/power/autosuspend_delay
# Typical value: 100 ms, derived from τ = R·C of the VBUS sense circuit.
```

Changing the debounce requires editing the device tree source for the USB controller (e.g., `dwc2` driver) and rebuilding the kernel.

### 3. Regulator framework – capacitor‑based ripple filtering
The Linux regulator API (used by CPU voltage regulators) accepts a *minimum effective output capacitance* to guarantee stability. Query a regulator’s constraints:

```bash
# List regulators on the system
ls /sys/class/regulator/
# Example regulator " regulator.0 "
cat /sys/class/regulator/regulator.0/microvolts          # output voltage
cat /sys/class/regulator/regulator.0/min_uV              # minimum allowed
cat /sys/class/regulator/regulator.0/max_uV              # maximum allowed
cat /sys/class/regulator/regulator.0/state               # enabled/disabled
cat /sys/class/regulator/regulator.0/min_uA              # min load current
cat /sys/class/regulator/regulator.0/max_uA              # max load current
cat /sys/class/regulator/regulator.0/microfarads         # required output capacitance
```

If the board’s output capacitance falls below the regulator’s `microfarads` requirement, the regulator may become unstable, leading to oscillations visible in `/sys/devices/platform/.../voltage` readings.

### 4. Simulating circuits with ngspice (Linux‑friendly)
Install the open‑source SPICE simulator and run a transient analysis:

```bash
# Install ngspice on Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y ngspice

# Create a netlist for the RC low‑pass filter from Exercise 3
cat > rc_lowpass.cir <<'EOF
* RC low‑pass filter, R=2k, C=?? (calculated from Exercise 3)
Vin in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 2k
C1 out 0 {1/(2*pi*2000*10e3)}  ; C = 7.96 nF for fc=10kHz
.tran 0.1ms 20ms
.control
  run
  plot V(out) V(in)
.endc
.end
EOF

# Run the simulation
ngspice -b rc_lowpass.cir
```

The output (`ngspice.out`) contains the voltage at the output node versus time, from which you can extract the 10‑%‑to‑90 % rise time and verify the theoretical \(2.2\tau\).

These examples show how the fundamental RC/RL concepts are not just abstract theory but appear in kernel parameters, device‑tree settings, and user‑space tools that Linux developers interact with daily.

---

## Why This Matters
Capacitors and inductors are the two elementary energy‑storage elements that shape every analog and mixed‑signal system Linux touches—from the delicate timing of I²C buses that let sensors talk to the kernel, to the bulk capacitance that keeps a CPU’s voltage steady during rapid frequency scaling, to the magnetic inductors in DC‑DC converters that enable efficient power delivery across a server rack.  

By mastering the **first‑order differential equations** that govern \(V_C(t)\) and \(I_L(t)\), you can predict how fast a signal will settle, how much energy must be supplied to charge a decoupling capacitor, and where parasitic LC resonances might cause unwanted ringing in high‑speed traces.  

When you can read `/sys/class/regulator/*/microfarads` and understand why the kernel demands a certain capacitance, or when you adjust an I²C pull‑up resistor and know exactly how the resulting RC time
