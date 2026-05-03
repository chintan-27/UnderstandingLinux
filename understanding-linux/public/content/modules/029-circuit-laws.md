---
id: 29
title: "Circuit laws"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Why This Matters

Every circuit you will analyze — from the voltage regulator powering a CPU core to the pull-up resistor on an I²C bus — obeys three laws. Without Ohm's law you cannot predict current through a resistor, which means you cannot size a current-limiting resistor for an LED, cannot explain why a GPIO pin burns out when driven into a short, and cannot derive why a linear regulator's heat output scales with input-output voltage difference. Without Kirchhoff's laws you cannot track current at a junction or enforce voltage consistency around a loop — which means you cannot analyze a voltage divider, a feedback network, or a power rail. These laws are not approximations for simple circuits: they are the constraints that make any circuit analysis deterministic.

---

## Core Concepts

### Ohm's Law

A resistor is defined by a linear relationship between voltage and current:

$$V = IR$$

The linearity is the key property. It means resistance is a *constant* — independent of $V$ and $I$ — which is what distinguishes a resistor from a diode or a transistor. If you apply 5 V across a 1 kΩ resistor, you get exactly 5 mA. If you double the voltage, you get exactly 10 mA. Any deviation from this linearity means the device is not behaving as a resistor.

The physical origin of resistance is electron-lattice scattering. Electrons moving through a conductor collide with atoms; each collision transfers kinetic energy to the lattice as heat. More scattering per unit length means higher resistance. This gives the macroscopic formula:

$$R = \rho \frac{L}{A}$$

where $\rho$ is resistivity (units: $\Omega \cdot \text{m}$, a material constant), $L$ is conductor length, and $A$ is cross-sectional area. Doubling the length doubles the scattering path; doubling the area provides two parallel scattering paths, halving resistance. This is why PCB trace resistance matters: a long, thin trace on a high-current rail creates a measurable voltage drop.

Power dissipated in a resistor — energy delivered to the lattice per second — is:

$$P = IV = I^2 R = \frac{V^2}{R}$$

All three forms follow from substituting $V = IR$ into $P = IV$. Use whichever form matches what you know: if you know current and resistance, use $I^2 R$; if you know voltage and resistance, use $V^2/R$.

### Kirchhoff's Current Law (KCL)

At any node in a circuit, charge cannot accumulate:

$$\sum_{k} I_k = 0$$

where currents entering the node are positive and currents leaving are negative (or vice versa, as long as you are consistent). This is charge conservation, not an approximation — it holds at every node, at every instant, in DC and in AC circuits (with the caveat that at high frequencies, displacement current in capacitors must be accounted for, but the generalized form still holds).

The practical consequence: in a series circuit, current is identical at every point. There are no branch nodes, so there is nowhere else for current to go. In a parallel circuit, the source current splits among branches, and KCL tells you exactly how.

### Kirchhoff's Voltage Law (KVL)

Around any closed loop, the signed sum of all voltage differences is zero:

$$\sum_{k} V_k = 0$$

This is energy conservation. A charge carrier traversing a complete loop returns to its starting point, so the net work done on it is zero. Every volt gained through a source must be lost across loads. The sign convention: voltage rises (moving from − to + through a source) are positive; voltage drops (moving through a resistor in the direction of current) are negative.

KVL is what makes "voltage" a well-defined concept — it guarantees that the potential at a node has a single value regardless of which path you took to get there. If KVL were violated, node voltages would be path-dependent and circuit analysis would be impossible.

---

## How It Works

### Resistor-Based Current Source and Its Fundamental Limit

The simplest way to source a constant current is a resistor in series with a supply. If the supply is $V_S$ and the total series resistance is $R$, the current into a load $R_L$ is:

$$I = \frac{V_S}{R + R_L}$$

For the current to be approximately constant as $R_L$ varies, you need $R \gg R_L$, so that $R_L$ contributes negligibly to the denominator. The fractional change in current for a change $\Delta R_L$ in load is:

$$\frac{\Delta I}{I} \approx \frac{\Delta R_L}{R + R_L} \approx \frac{\Delta R_L}{R}$$

**Example**: You need 10 mA ±1% into a load that swings 0–10 V (i.e., $R_L$ swings 0–1 kΩ).

The load voltage swing of 10 V at 10 mA represents a $\Delta R_L$ of 1 kΩ. For 1% regulation:

$$\frac{\Delta R_L}{R} < 0.01 \implies R > \frac{1\,\text{k}\Omega}{0.01} = 100\,\text{k}\Omega$$

At 10 mA through 100 kΩ, the supply must be at least:

$$V_S = I \cdot R = 0.01\,\text{A} \times 100\,\text{k}\Omega = 1000\,\text{V}$$

and the resistor dissipates:

$$P_R = I^2 R = (0.01)^2 \times 100{,}000 = 10\,\text{W}$$

This is the fundamental problem with resistor-based current sources: tight regulation requires enormous headroom voltage, and that headroom is entirely dissipated as heat. A transistor current source (or a dedicated IC like the LT3092) decouples regulation quality from supply voltage by using active feedback instead of a large passive impedance.

### Voltage Divider via KVL + KCL

Two resistors in series across supply $V_S$:

```
    Vs
    |
   [R1]
    |---- Vout
   [R2]
    |
   GND
```

KVL around the outer loop: $V_S - V_{R1} - V_{R2} = 0$

KCL at the middle node (with no current drawn from $V_{out}$): the current through $R_1$ equals the current through $R_2$, call it $I$.

Ohm's law for each resistor: $V_{R1} = IR_1$, $V_{R2} = IR_2$.

Substituting into KVL: $V_S = I(R_1 + R_2)$, so $I = V_S/(R_1 + R_2)$.

Therefore:

$$V_{out} = IR_2 = V_S \cdot \frac{R_2}{R_1 + R_2}$$

The ratio $R_2/(R_1+R_2)$ is always less than 1, so $V_{out} < V_S$. The divider only works as derived when negligible current is drawn from the output — any load resistance in parallel with $R_2$ changes $R_2$ to $R_2 \| R_L = R_2 R_L/(R_2+R_L)$, lowering $V_{out}$.

This equation directly controls the LM317 output voltage. The LM317 regulates the voltage between its OUT and ADJ pins to a fixed 1.25 V reference. With $R_1$ from OUT to ADJ and $R_2$ from ADJ to GND:

$$V_{out} = 1.25\,\text{V} \cdot \left(1 + \frac{R_2}{R_1}\right)$$

Changing $R_2$ programs the output. The derivation is pure KVL plus the definition of what the LM317 regulates.

### KCL at a Switching Node: Buck Converter Output

In a buck converter's output stage, $I_L$ is the inductor current, $I_{out}$ is the load current, and $I_C$ is the current into the output capacitor. KCL at the output node:

$$I_L = I_{out} + I_C$$

Rearranging: $I_C = I_L - I_{out}$

When $I_L > I_{out}$, $I_C > 0$ — the capacitor is charging and the output voltage is rising. When $I_L < I_{out}$, $I_C < 0$ — the capacitor is discharging and the output voltage is falling. The converter's control loop adjusts the switching duty cycle to keep the average $I_L = I_{out}$, maintaining the output voltage. KCL is the mechanism by which this bookkeeping works at every instant.

### KVL + Ohm's Law: Linear Regulator Heat Dissipation

A linear regulator passes the full load current through a series pass transistor. The transistor drops the excess voltage. With 12 V input, 5 V output, 500 mA load:

KVL around the series path: $V_{in} = V_{drop} + V_{out}$

$$V_{drop} = 12\,\text{V} - 5\,\text{V} = 7\,\text{V}$$

KCL says the same current passes through the transistor and the load (it's a series path). Power in the transistor:

$$P = V_{drop} \cdot I = 7\,\text{V} \times 0.5\,\text{A} = 3.5\,\text{W}$$

The efficiency is:

$$\eta = \frac{P_{out}}{P_{in}} = \frac{V_{out}}{V_{in}} = \frac{5}{12} \approx 42\%$$

The remaining 58% is heat. This is intrinsic to the linear topology — you cannot improve it without changing $V
