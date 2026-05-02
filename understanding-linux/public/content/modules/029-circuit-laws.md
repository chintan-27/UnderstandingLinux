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

Every resistor, voltage regulator, current source, and power rail in a computer obeys three laws without exception. When a Linux kernel driver miscalculates a pull-up resistor value, a GPIO line floats and reads garbage. When a power supply designer ignores current summation at a node, the board overheats or fails to start under load. Ohm's law and Kirchhoff's laws are not approximations — they are exact constraints enforced by charge conservation and energy conservation. Without them, you cannot read a schematic, size a resistor, understand why a voltage rail droops under load, or make sense of how a current-sense circuit works.

---

## Core Concepts

### Ohm's Law

The voltage across a resistor is proportional to the current through it:

$$V = IR$$

This holds because resistance is a material property: more electrons per second attempting to pass through the same cross-section of resistive material produce proportionally more collisions, requiring proportionally more driving force (voltage). Double the current, double the required voltage — the ratio is fixed by the material and geometry at constant temperature. Rearranged:

$$I = \frac{V}{R} \qquad R = \frac{V}{I}$$

Power dissipated follows directly from the definition of power as $P = IV$, substituted with Ohm's law:

$$P = IV = I^2 R = \frac{V^2}{R}$$

The $I^2 R$ form is the critical one for hardware: current is the dangerous quantity. A resistor carrying $100\,\text{mA}$ through $10\,\Omega$ dissipates $100\,\text{mW}$, but carrying $1\,\text{A}$ through the same resistor dissipates $10\,\text{W}$ — one hundred times more power for ten times the current. This is why high-current PCB traces are wide (lower $R$) and why motor driver ICs run hot even with low resistance MOSFETs.

### Kirchhoff's Current Law (KCL)

At any node in a circuit, charge cannot accumulate (absent a capacitor, which stores charge deliberately). Therefore:

$$\sum I_{\text{in}} = \sum I_{\text{out}}$$

With a sign convention (positive into node, negative out):

$$\sum_{k} I_k = 0$$

If $5\,\text{mA}$ flows in on one wire and $3\,\text{mA}$ flows in on another, exactly $8\,\text{mA}$ must leave on the third. This is not a guideline — any deviation would require charge to appear or disappear at the node, which violates conservation of charge.

### Kirchhoff's Voltage Law (KVL)

Around any closed loop, a charge carrier that returns to its starting point has the same potential energy it started with. Therefore all voltage rises and drops must cancel:

$$\sum_{k} V_k = 0$$

Every source adds potential energy; every resistor and load converts it. They must balance because potential is a state function — path doesn't matter, only position. This is why you can choose any loop in any direction and KVL holds: you are just accounting for energy at each element along a closed path.

---

## How It Works

### Ohm's Law in a Resistor Divider

Two resistors $R_1$ and $R_2$ in series across $V_{in}$:

```
    +Vin
     |
    [R1]
     |
     +--- Vout
     |
    [R2]
     |
    GND
```

KCL at the middle node: with nothing else connected, the same current $I$ flows through both resistors. KVL around the outer loop:

$$V_{in} - IR_1 - IR_2 = 0 \implies I = \frac{V_{in}}{R_1 + R_2}$$

The output voltage is the drop across $R_2$ only:

$$V_{out} = IR_2 = V_{in} \cdot \frac{R_2}{R_1 + R_2}$$

This equation silently assumes zero load current. The moment a load $R_L$ is connected to $V_{out}$, it appears in parallel with $R_2$, replacing $R_2$ with $R_2 \| R_L$:

$$R_2 \| R_L = \frac{R_2 R_L}{R_2 + R_L}$$

Since $R_2 \| R_L < R_2$, the output voltage drops. For the divider to be load-tolerant, choose $R_1$ and $R_2$ such that $R_L \gg R_2$ — the "stiff" divider condition. A common rule of thumb is $R_L \geq 10 R_2$, which limits the output droop to under 10%.

### KCL at a Node: The Op-Amp Summing Junction

In an inverting summing amplifier, two inputs $V_1$ and $V_2$ connect through $R_1$ and $R_2$ to the inverting input of an op-amp, which is held at virtual ground by negative feedback:

$$I_1 = \frac{V_1}{R_1}, \qquad I_2 = \frac{V_2}{R_2}$$

KCL demands the total current entering the node must leave through the feedback resistor $R_f$ (the op-amp's input draws negligible current):

$$I_f = I_1 + I_2 = \frac{V_1}{R_1} + \frac{V_2}{R_2}$$

The output voltage is:

$$V_{out} = -I_f R_f = -R_f\left(\frac{V_1}{R_1} + \frac{V_2}{R_2}\right)$$

With $R_1 = R_2 = R_f$, this is a unity-gain inverting summer. KCL is the entire derivation — the op-amp's job is only to enforce virtual ground at the node.

### KVL: Sizing an LED Current-Limiting Resistor

A 3.3 V GPIO output drives an LED with forward voltage $V_f \approx 2.0\,\text{V}$. The desired current is $5\,\text{mA}$ (visible brightness without stressing the GPIO driver, which typically sources 8–16 mA maximum).

KVL around the loop:

$$V_{GPIO} - V_R - V_f = 0 \implies V_R = 3.3 - 2.0 = 1.3\,\text{V}$$

By Ohm's law:

$$R = \frac{V_R}{I} = \frac{1.3\,\text{V}}{0.005\,\text{A}} = 260\,\Omega$$

The nearest standard E24 value is $270\,\Omega$, giving:

$$I = \frac{1.3}{270} \approx 4.8\,\text{mA}$$

This is exactly the calculation embedded in GPIO LED driver documentation and device tree LED node properties. Get it wrong and you either starve the LED (too dim) or exceed the SoC's GPIO current rating.

### Resistor Current Sources and Their Power Cost

An LM317 voltage regulator holds exactly $V_{ref} = 1.25\,\text{V}$ between its output and adjust pins. Placing a resistor $R$ between those pins forces a fixed current regardless of load:

$$I = \frac{V_{ref}}{R} = \frac{1.25}{R}$$

For $I = 10\,\text{mA}$:

$$R = \frac{1.25}{0.010} = 125\,\Omega \implies \text{use } 124\,\Omega \text{ (E96 series)}$$

The power cost is real. If the supply is $12\,\text{V}$ and the load drops $2\,\text{V}$, the LM317 itself dissipates:

$$P_{LM317} = (V_{supply} - V_{load} - V_{ref}) \cdot I = (12 - 2 - 1.25) \times 0.010 = 87.5\,\text{mW}$$

That heat must go somewhere — the LM317 package thermal resistance $\theta_{JA} \approx 50\,°\text{C/W}$ in free air means a junction temperature rise of about $4.4\,°\text{C}$ above ambient for this load, which is manageable, but scale to 100 mA and you need a heatsink.

---

## Linux Connection

### Pull-up Resistors and GPIO State

Every GPIO pin configured as input must be tied to a defined voltage when floating, or the Linux input subsystem reads metastable garbage. A pull-up resistor connects the pin to $V_{cc}$; when the pin is driven low externally (e.g., by a button to GND), the current through the pull-up is:

$$I_{pullup} = \frac{V_{cc}}{R_{pullup}}$$

For a $3.3\,\text{V}$ rail with a $10\,\text{k}\Omega$ internal pull-up:

$$I = \frac{3.3}{10000} = 330\,\mu\text{A}$$

This current flows continuously as long as the pin is held low. On a design with 64 such pins all held low simultaneously:

$$P = 64 \times 3.3\,\text{V} \times 330\,\mu\text{A} \approx 69.7\,\text{mW}$$

That is not negligible on a battery-powered embedded system. Linux exposes pull configuration through the `gpiolib` character device interface. Using `libgpiod`:

```bash
# Read pin 17 with pull-up bias enabled
gpioget --bias=pull-up gpiochip0 17

# Read pin 18 with pull-down bias enabled
gpioget --bias=pull-down gpiochip0 18

# Set pin 17 as output
