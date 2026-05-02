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

## Why This Matters

Every real circuit contains signals that change over time, and the moment you have change, you have components that *oppose* that change. Capacitors resist changes in voltage; inductors resist changes in current. Without understanding this, you cannot reason about why a power supply takes time to stabilize after you flip a switch, why audio signals are blocked or passed at certain frequencies, why a CPU power rail needs dozens of capacitors scattered across a motherboard, or why switching power converters (which run everything from your phone charger to server rack PSUs) work at all.

The Linux kernel manages hardware shaped by these behaviors at every level: GPIO transition timing is governed by RC time constants on the line, ADC inputs require RC anti-aliasing filters or sampled data is meaningless, DRAM refresh depends on capacitor charge retention, and every buck converter powering your SoC relies on an inductor to transfer energy without resistive loss. These are not analogies — they are direct dependencies.

---

## Core Concepts

### Capacitors Store Energy in an Electric Field

A capacitor is two conductors separated by a dielectric. Applying a voltage drives charge onto the plates, creating an electric field between them:

$$Q = CV$$

where $Q$ is stored charge (coulombs), $C$ is capacitance (farads), $V$ is voltage across the plates. The stored energy is:

$$E = \frac{1}{2}CV^2$$

The governing equation is:

$$I = C\frac{dV}{dt}$$

This is the causal core. Current flows *only* when voltage is changing. No change in $V$, no current — DC is blocked. Rapidly changing $V$ drives large current — high-frequency AC passes freely. More precisely, the capacitor's impedance is $Z_C = 1/j\omega C$: it falls as frequency rises, so the capacitor increasingly short-circuits high-frequency signals to ground in a filter topology.

**You cannot change the voltage across a capacitor instantaneously.** $I = C\,dV/dt$ rearranges to $dV/dt = I/C$: a finite current into a finite capacitance produces a finite rate of voltage change. Instantaneous voltage change would require $dV/dt \to \infty$, which demands infinite current. This is not a soft limit — it is a direct consequence of charge conservation.

### Inductors Store Energy in a Magnetic Field

An inductor is a coil of wire. Current through it builds a magnetic flux $\Phi$ through the coil. The stored energy is:

$$E = \frac{1}{2}LI^2$$

where $L$ is inductance (henries). The governing equation is:

$$V = L\frac{dI}{dt}$$

This is the exact dual of the capacitor equation. The inductor forces a voltage across itself proportional to how fast you try to change the current through it. Slow changes (DC) produce no opposing voltage — inductors pass DC freely. Rapid changes produce large opposing voltage — inductors impede high-frequency current. Impedance: $Z_L = j\omega L$, rising linearly with frequency.

**You cannot change the current through an inductor instantaneously.** The consequence is violent when you try: open a switch in series with an inductor and the current *must* continue, so the inductor drives $V = L\,dI/dt$ as high as necessary — arcing across the switch contacts or destroying a transistor. Flyback diodes exist precisely to give that current somewhere to go.

### Transients: The Approach to Steady State

Connect a resistor $R$ and capacitor $C$ in series to a voltage step. The capacitor voltage obeys:

$$V_C(t) = V_s\!\left(1 - e^{-t/\tau}\right), \quad \tau = RC$$

The time constant $\tau$ is not arbitrary — it emerges from the differential equation $V_s = IR + V_C = RC\,\dot{V}_C + V_C$, whose solution is the exponential above. The current is:

$$I(t) = \frac{V_s}{R}\,e^{-t/\tau}$$

It starts at $V_s/R$ (the capacitor looks like a short at $t=0$, since $V_C$ cannot jump) and decays as the capacitor charges. The resistor dissipates energy $\frac{1}{2}CV_s^2$ during charging regardless of $R$ — the same as the energy stored in the capacitor. Halving $R$ halves the charging time but doubles the peak current, leaving the total dissipation unchanged.

The RL circuit is the dual: current builds as $I(t) = (V_s/R)(1 - e^{-t/\tau})$ with $\tau = L/R$.

### Resonance in LC Circuits

In an LC circuit, energy transfers between the electric field (capacitor) and magnetic field (inductor) at a rate set by both components. The natural resonant frequency is:

$$\omega_0 = \frac{1}{\sqrt{LC}}, \qquad f_0 = \frac{1}{2\pi\sqrt{LC}}$$

At $\omega_0$, the capacitor's impedance $1/j\omega C$ and the inductor's impedance $j\omega L$ are equal in magnitude and opposite in sign — they cancel. In a series RLC circuit at resonance, only $R$ limits the current; the reactive components' voltages can individually exceed the source voltage by the quality factor $Q$:

$$Q = \frac{1}{R}\sqrt{\frac{L}{C}} = \frac{\omega_0 L}{R} = \frac{1}{\omega_0 RC}$$

High $Q$ means narrow resonance bandwidth $\Delta f = f_0/Q$ — the circuit responds sharply to frequencies near $f_0$ and rejects others. Low $Q$ means broad, heavily damped response. Quartz crystals achieve $Q \sim 10^5$–$10^6$ by exploiting the extremely low mechanical damping of crystalline quartz, which is why they produce far more stable frequencies than LC circuits built from discrete components.

---

## How It Works

### The RC Transient in Detail

For $R = 1\,\text{k}\Omega$, $C = 1\,\mu\text{F}$, $V_s = 5\,\text{V}$:

$$\tau = RC = 10^3\,\Omega \times 10^{-6}\,\text{F} = 1\,\text{ms}$$

| Time | $V_C$ | % of $V_s$ |
|------|-------|------------|
| $\tau = 1\,\text{ms}$ | $3.16\,\text{V}$ | 63.2% |
| $2\tau = 2\,\text{ms}$ | $4.32\,\text{V}$ | 86.5% |
| $3\tau = 3\,\text{ms}$ | $4.75\,\text{V}$ | 95.0% |
| $5\tau = 5\,\text{ms}$ | $4.97\,\text{V}$ | 99.3% |

The 63.2% figure is not magic — it is $1 - e^{-1}$, the value of the charging equation at $t = \tau$. Engineers use $5\tau$ as "fully charged" because $e^{-5} \approx 0.0067$, meaning less than 0.7% error remains.

The energy stored in the capacitor at full charge is $\frac{1}{2}CV_s^2 = \frac{1}{2}(10^{-6})(25) = 12.5\,\mu\text{J}$. The resistor dissipates exactly $12.5\,\mu\text{J}$ during the charge cycle — you can verify by integrating $I^2 R$ over all time:

$$\int_0^\infty I^2 R\,dt = \int_0^\infty \frac{V_s^2}{R}\,e^{-2t/\tau}\,dt = \frac{V_s^2}{R} \cdot \frac{\tau}{2} = \frac{V_s^2}{R} \cdot \frac{RC}{2} = \frac{1}{2}CV_s^2$$

This 50% efficiency ceiling applies to any resistive charging path. It is why switched-mode power supplies (which charge inductors rather than capacitors through resistances) are necessary when efficiency matters.

### Inductors in Switching Converters

In a synchronous buck converter, the switch (a MOSFET) alternates between connecting the inductor to $V_{in}$ and to ground. During the ON phase, with the switch connecting $V_{in}$ to the inductor's input and $V_{out}$ on the output side:

$$V_{in} - V_{out} = L\frac{dI_L}{dt} \implies \frac{dI_L}{dt} = \frac{V_{in} - V_{out}}{L}$$

Current ramps up linearly. During the OFF phase, the inductor drives current through the low-side switch (or freewheeling diode), with the output voltage opposing the current:

$$\frac{dI_L}{dt} = -\frac{V_{out}}{L}$$

Current ramps down linearly. In steady state, the net change in inductor current over a full switching period must be zero (otherwise the current would drift without bound). Setting $\Delta I_{up} = \Delta I_{down}$:

$$\frac{V_{in} - V_{out}}{L} \cdot DT = \frac{V_{out}}{L} \cdot (1-D)T$$

where $D$ is the duty cycle (fraction of the period $T$ that the switch is ON). Solving:

$$V_{out} = D \cdot V_{in}$$

The output capacitor smooths the triangular current ripple from the inductor into an approximately DC output voltage. The peak-to-peak current ripple is:

$$\Delta I_L = \frac{(V_{in} - V_{out})\,D}{L\,f_{sw}}$$

where $
