---
id: 28
title: "Basic electrical quantities"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Core Concepts
### Charge, Current, and Voltage from First Principles
Electric charge $Q$ is the conserved property of matter that couples to the electromagnetic field. A macroscopic charge is the sum of elementary charges $e = 1.602\times10^{-19}\,\text{C}$: $Q = N e$.  

Current $I$ is defined as the rate at which charge moves through a surface:
$$I = \frac{dQ}{dt}.$$
If $n$ charge carriers per unit volume each carry charge $q$ and drift with velocity $\mathbf{v}_d$ across a cross‑section $A$, the instantaneous current is
$$I = n q A v_d.$$

Voltage (electric potential difference) $V_{ab}$ between points $a$ and $b$ is the work done per unit charge to move a test charge from $b$ to $a$ against the electric field $\mathbf{E}$:
$$V_{ab} = -\int_{b}^{a}\mathbf{E}\cdot d\mathbf{l} = \frac{U_a-U_b}{q},$$
where $U$ is the electrostatic potential energy. Hence $V$ has units of joules per coulomb = volts.

### Resistance and Ohm’s Law on a Microscopic Scale
In a conductor, charge carriers experience scattering from lattice phonons, impurities, and defects. The drift velocity is proportional to the applied electric field:
$$\mathbf{v}_d = \mu \mathbf{E},$$
where $\mu$ is the carrier mobility (m² V⁻¹ s⁻¹). Substituting into the current expression gives
$$I = n q A \mu E = n q A \mu \frac{V}{L},$$
with $L$ the conductor length. Rearranging,
$$V = \underbrace{\frac{L}{n q A \mu}}_{R} I \;\;\Longrightarrow\;\; V = I R.$$
Thus the macroscopic resistance $R = \rho \frac{L}{A}$ where resistivity $\rho = 1/(n q \mu)$. Ohm’s law therefore emerges from linear response of charge carriers to an electric field; it holds only while $\mu$ remains constant (i.e., for low fields and temperatures where scattering mechanisms are unchanged).

### Power and Energy
Power is the instantaneous rate of energy transfer:
$$P = \frac{dE}{dt}.$$
When a charge $dQ$ moves through a potential drop $V$, the infinitesimal work done is $dE = V\,dQ$. Dividing by $dt$,
$$P = V \frac{dQ}{dt} = V I.$$
Using Ohm’s law we obtain the alternative forms
$$P = I^{2}R = \frac{V^{2}}{R}.$$
Energy transferred over a time interval $[t_0,t_1]$ is the integral of power:
$$E = \int_{t_0}^{t_1} P\,dt = V I \Delta t \quad\text{(for constant $V,I$)}.$$

### Conservation Laws in Circuits
Kirchhoff’s Current Law (KCL) follows from charge conservation: the net current entering a node must be zero because charge cannot accumulate.  
Kirchhoff’s Voltage Law (KVL) follows from the conservative nature of the electrostatic field: the sum of potential differences around any closed loop is zero. These laws are direct consequences of Maxwell’s equations under the quasi‑static approximation ($\partial\mathbf{B}/\partial t\approx0$, $\nabla\times\mathbf{E}=0$).

---

## How It Works
### From Fields to Circuit Equations
When a voltage source imposes a potential difference $V$ across a resistor of length $L$, an electric field $\mathbf{E}=V/L\,\hat{\mathbf{l}}$ appears inside the material. Free electrons experience a force $q\mathbf{E}$ and acquire a drift velocity $\mathbf{v}_d = \mu\mathbf{E}$. Each collision with the lattice randomizes momentum, converting electrical work into kinetic energy of the lattice—observed as Joule heating. The power dissipated as heat is exactly $P=I^{2}R$, matching the rate at which the field does work on the carriers.

### Series and Parallel Networks Derived from KCL/KVL
*Series:* For $n$ resistors $R_i$ in series, KVL gives
$$V_{\text{source}} = \sum_{i=1}^{n} V_i = \sum_{i=1}^{n} I R_i = I\sum_{i=1}^{n}R_i \;\;\Longrightarrow\;\; R_{\text{eq}} = \sum_{i}R_i.$$
The same current $I$ flows through each element because there is only one path for charge (KCL at each interior node yields $I_{\text{in}}=I_{\text{out}}$).

*Parallel:* For resistors $R_i$ in parallel, KCL at the top node yields
$$I_{\text{source}} = \sum_{i=1}^{n} I_i = \sum_{i=1}^{n} \frac{V}{R_i} = V\sum_{i=1}^{n}\frac{1}{R_i} \;\;\Longrightarrow\;\; \frac{1}{R_{\text{eq}}} = \sum_{i}\frac{1}{R_i}.$$
KVL forces each resistor to see the same voltage $V$ because they share the same two nodes.

### Transient Behavior and Time Constants
When a resistor $R$ is charged through a capacitor $C$ from a DC source $V_s$, the loop equation is
$$V_s = V_R + V_C = IR + \frac{Q}{C}.$$
Substituting $I = dQ/dt$ gives a first‑order ODE:
$$R\frac{dQ}{dt} + \frac{Q}{C} = V_s.$$
Solution with $Q(0)=0$:
$$Q(t) = C V_s\bigl(1-e^{-t/(RC)}\bigr),\qquad
V_C(t)=V_s\bigl(1-e^{-t/(RC)}\bigr),\qquad
I(t)=\frac{V_s}{R}e^{-t/(RC)}.$$
The product $\tau = RC$ is the time constant governing how fast the capacitor approaches the source voltage. Similar analysis applies to RL circuits ($\tau = L/R$).

---

## Worked Examples
### Example 1: Single Resistor with Real-World Numbers
A lithium‑ion cell modeled as an ideal 12 V source with internal resistance $r_{\text{int}} = 0.05\,\Omega$ powers a load $R_L = 4\,\Omega$.

1. **Total resistance**: $R_{\text{tot}} = R_L + r_{\text{int}} = 4.05\,\Omega$.
2. **Current** (Ohm’s law):
   $$I = \frac{V_{\text{source}}}{R_{\text{tot}}} = \frac{12\,\text{V}}{4.05\,\Omega} = 2.96\,\text{A}.$$
3. **Voltage across load**:
   $$V_L = I R_L = 2.96\,\text{A}\times4\,\Omega = 11.84\,\text{V}.$$
4. **Power dissipated in load**:
   $$P_L = I^{2}R_L = (2.96\,\text{A})^{2}\times4\,\Omega = 35.0\,\text{W}.$$
5. **Power lost in internal resistance**:
   $$P_{\text{int}} = I^{2}r_{\text{int}} = (2.96\,\text{A})^{2}\times0.05\,\Omega = 0.44\,\text{W}.$$
6. **Efficiency**:
   $$\eta = \frac{P_L}{P_L+P_{\text{int}}}= \frac{35.0}{35.44}=0.988\;(98.8\%).$$

### Example 2: Series‑Parallel Combination with Temperature Coefficient
Two resistors: $R_1 = 2.00\,\Omega$ (temperature coefficient $\alpha_1 = 0.004\,\text{K}^{-1}$), $R_2 = 3.00\,\Omega$ ($\alpha_2 = 0.001\,\text{K}^{-1}$). Ambient temperature $T_0 = 20^{\circ}\text{C}$, device operates at $T = 50^{\circ}\text{C}$.

1. **Resistance at temperature**:
   $$R_i(T) = R_i(T_0)\bigl[1+\alpha_i (T-T_0)\bigr].$$
   $$R_1(50) = 2.00[1+0.004\times30] = 2.24\,\Omega,$$
   $$R_2(50) = 3.00[1+0.001\times30] = 3.09\,\Omega.$$
2. **Network**: $R_1$ and $R_2$ in parallel, then series with $R_3 = 5\,\Omega$.
   Parallel equivalent:
   $$R_{12} = \frac{R_1R_2}{R_1+R_2}= \frac{2.24\times3.09}{2.24+3.09}=1.30\,\Omega.$$
3. **Total**:
   $$R_{\text{tot}} = R_{12}+R_3 = 1.30+5.00 = 6.30\,\Omega.$$
4. **Current from 12 V source**:
   $$I = \frac{12}{6.30}=1.90\,\text{A}.$$
5. **Branch currents** (current divider):
   $$I_1 = I\frac{R_2}{R_1+R_2}=1.90\frac{3.09}{5.33}=1.10\,\text{A},$$
   $$I_2 = I - I_1 = 0.80\,\text{A}.$$

### Example 3: Energy Stored in a Capacitor and Discharge Through a Resistor
A $C = 100\,\mu\text{F}$ capacitor is charged to $V_0 = 9\,\text{V}$ then discharged through $R = 1\,\text{k}\Omega$.

1. **Initial energy**:
   $$E_0 = \frac{1}{2}CV_0^{2}= \frac{1}{2}\times100\times10^{-6}\times9^{2}=4.05\,\text{mJ}.$$
2. **Voltage decay**:
   $$V(t)=V_0 e^{-t/(RC)},\quad \tau = RC = 1\,\text{k}\Omega\times100\,\mu\text{F}=0.1\,\text{s}.$$
3. **Energy remaining after $t=0.2\,\text{s}$**:
   $$V(0.2)=9 e^{-0.2/0.1}=9 e^{-2}=9\times0.1353=1.22\,\text{V},$$
   $$E(t)=\frac{1}{2}C V(t)^{2}=0.5\times100\times10^{-6}\times1.22^{2}=7.45\,\mu\text{J}.$$
4. **Energy dissipated in resistor**:
   $$E_{\text{diss}} = E_0 - E(t) \approx 4.04\,\text{mJ}.$$
   (Matches integral $\int_0^{t} I^{2}R\,dt$.)

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Reasoning |
|---|---------|----------------|-------------------|
| 1 | **Assuming Ohm’s law applies to any two‑terminal device** (e.g., diode, transistor). | Ohm’s law assumes a linear $V\propto I$ relation arising from constant carrier mobility. Non‑linear devices have $I(V)$ described by Shockley, Ebers‑Moll, etc. | Use the device’s characteristic curve; linearize only around an operating point for small‑signal analysis. |
| 2 | **Neglecting source internal resistance** when calculating load voltage. | Every real voltage source has internal impedance; ignoring it overestimates load voltage and power. | Model source as $V_s$ in series with $r_{\text{int}}$; compute $V_L = V_s \frac{R_L}{R_L+r_{\text{int}}}$. |
| 3 | **Applying voltage divider formula to current division** (or vice‑versa). | Voltage divider relies on series connection where current is common; current divider relies on parallel connection where voltage is common. | Identify topology first: series → voltage divider, parallel → current divider. |
| 4 | **Using peak values for AC power calculations** without RMS conversion. | Instantaneous power $p(t)=v(t)i(t)$ averages to zero for pure sinusoids if peak values are used incorrectly. | Use RMS: $P_{\text{avg}} = V_{\text{rms}} I_{\text{rms}} \cos\phi$. |
| 5 | **Assuming wires have zero resistance** leading to infinite current in short‑circuit thought experiments. | Real conductors have finite resistivity; even “ideal” wires have inductance and skin effect at high frequencies. | Include wire resistance $R_{\text{wire}} = \rho \ell/A$ or use measured values from tables; for high‑frequency, add impedance $Z=R+j\omega L$. |
| 6 | **Ignoring temperature coefficient of resistance** when estimating power dissipation over time. | Resistance rises with temperature (for metals), increasing $I^{2}R$ loss and potentially causing thermal runaway. | Update $R$ iteratively: $R(T)=R_0[1+\alpha(T-T_0)]$; couple with thermal model $P = hA(T-T_{\text{amb}})$. |

---

## Exercises
### Easy
1. A 9 V battery with internal resistance $0.1\,\Omega$ powers a $20\,\Omega$ load. Compute load current, load voltage, and power dissipated in the load.  
2. A $10\,\text{k}\Omega$ resistor has a voltage drop of $2\,\text{V}$. Find the current and the power dissipated.  

### Medium
3. Design a voltage divider that provides $3.3\,\text{V}$ from a $5\,\text{V}$ rail using two standard E96 resistors. Choose values that keep the divider current under $1\,\text{mA}$ and calculate the exact output voltage.  
4. A circuit consists of a $12\,\text{V}$ source, a $4\,\Omega$ resistor in series with a parallel combination of $6\,\Omega$ and $3\,\Omega$. Find the total current, the current through each parallel branch, and the power dissipated in the $4\,\Omega$ resistor.  

### Hard
5. A NiMH cell is modeled as a $1.2\,\text{V}$ ideal source with $0.05\,\Omega$ internal resistance and a capacity of $2000\,\text{mAh}$.  
   a) Estimate the runtime when powering a constant $150\,\text{mA}$ load.  
   b) If the load draws $500\,\text{mA}$ pulses of $10\,\text{ms}$ every $100\,\text{ms}$ (duty cycle 10 %), compute the average current and the effective runtime, accounting for the voltage sag due to internal resistance during pulses.  
6. Derive the expression for the energy stored in an inductor $L$ carrying current $I$, starting from $P = V I$ and $V = L\,dI/dt$. Then calculate the energy stored in a $2\,\text{mH}$ inductor when the current rises linearly from $0$ to $500\,\text{mA}$ over $10\,\mu\text{s}$.  

---

## Linux Connection
The Linux kernel exposes electrical quantities through several well‑documented subsystems. Below are concrete interfaces, example commands, and a minimal C snippet showing how a driver can register a regulator (voltage source) and read current/voltage via sysfs.

### 1. Power‑Supply Class (`/sys/class/power_supply/`)
Each battery or AC adapter appears as a directory under `power_supply`. Files report voltage, current, charge, and status.

```bash
# Show available supplies
ls /sys/class/power_supply/
# Example output: BAT0  AC

# Read instantaneous voltage (µV) and current (µA) of a battery
cat /sys/class/power_supply/BAT0/voltage_now   # e.g., 12345000 → 12.345 V
cat /sys/class/power_supply/BAT0/current_now   # e.g., -1500000 → -1.5 A (discharging)
```

The sign convention: negative current = discharge, positive = charge.

### 2. Hardware Monitoring (`hwmon`) and I²C Sensors
Many platform chips (e.g., INA219, INA3221) expose voltage/current via the `hwmon` framework. The device appears under `/sys/class/hwmon/hwmonX/`.

```bash
# List hwmon devices
ls /sys/class/hwmon/
# Suppose hwmon0 corresponds to an INA219 at address 0x40 on i2c‑1

# Read shunt voltage (µV) and bus voltage (mV)
cat /sys/class/hwmon/hwmon0/in1_input    # shunt voltage
cat /sys/class/hwmon/hwmon0/in0_input    # bus voltage

# Compute current: I = Vshunt / Rshunt (Rshunt often 0.1 Ω)
# Example: Vshunt = 10000 µV = 0.01 V → I = 0.01/0.1 = 0.1 A
```

You can also talk directly to the I²C bus with `i2cget`/`i2cset`:

```bash
# Read register 0x01 (shunt voltage) from INA219 (0x40) on bus 1
i2cget -y 1 0x40 0x01 w   # returns little‑endian 16‑bit value
```

### 3. Regulator Framework
Drivers that supply configurable voltages to peripherals register with the regulator API (`<linux/regulator.h>`). The regulator appears under `/sys/class/regulator/`.

```bash
# List regulators
ls /sys/class/regulator/
# Example: regulator@2  regulator@3

# Enable/disable a regulator (requires root)
echo 1 > /sys/class/regulator/regulator@2/state   # enable
echo 0 > /sys/class/regulator/regulator@2/state   # disable
```

**Minimal C driver snippet** (Linux 6.x) registering a fixed‑voltage regulator:

```c
#include <linux/module.h>
#include <linux/platform_device.h>
#include <linux/regulator/driver.h>
#include <linux/regulator/machine.h>

static struct regulator_ops fixed_reg_ops = {
    .get_voltage = regulator_get_voltage_regmap,
    .set_voltage = regulator_set_voltage_regmap,
    .enable      = regulator_enable,
    .disable     = regulator_disable,
};

static int fixed_reg_probe(struct platform_device *pdev)
{
    struct regulator_config cfg = { };
    struct regulator_init_data *init = dev_get_platdata(&pdev->dev);
    struct regulator_dev *rdev;

    cfg.dev = &pdev->dev;
    cfg.init_data = init;
    cfg.driver_data = NULL;
    cfg.of_node = pdev->dev.of_node;

    rdev = devm_regulator_register(&pdev->dev,
                                   &fixed_reg_desc, &cfg);
    if (IS_ERR(rdev))
        return PTR_ERR(rdev);

    platform_set_drvdata(pdev, rdev);
    return 0;
}

static struct platform_driver fixed_reg_driver = {
    .probe  = fixed_reg_probe,
    .driver = {
        .name = "fixed-voltage-reg",
        .of_match_table = of_match_ptr(fixed_reg_of_match),
    },
};
module_platform_driver(fixed_reg_driver);
MODULE_LICENSE("GPL");
```

### 4. Runtime Power Management (Runtime PM)
Devices can autosuspend when idle, saving milliwatts to watts depending on the subsystem.

```bash
# Enable runtime autosuspend for a USB device
echo auto > /sys/bus/usb/devices/2-1/power/autosuspend
echo 1   > /sys/bus/usb/devices/2-1/power/autosuspend
```

Reading the current power consumption (if the driver supports it) via:

```bash
cat /sys/bus/usb/devices/2-1/power/runtime_status
cat /sys/bus/usb/devices/2-1/power/runtime_active_time
cat /sys/bus/usb/devices/2-1/power/runtime_suspended_time
```

---

## Why This Matters
Understanding charge, current, voltage, resistance, power, and energy is not abstract theory; it directly governs how Linux interacts with hardware at the lowest level:

* **Power Management** – The kernel’s regulator and runtime PM subsystems rely on accurate voltage/current measurements (via `hwmon` or `power_supply`) to decide when to throttle CPUs, cut off peripherals, or shift to low‑power states. Misreading these quantities leads to wasted energy or thermal throttling.
* **Battery‑Aware Scheduling** – The `power_supply` class provides remaining capacity and instantaneous draw; the scheduler can migrate tasks to little cores or defer background work when the discharge rate exceeds a threshold, extending mobile device life.
* **Thermal Management** – Joule heating $P=I^{2}R$ is the primary source of heat in silicon. The thermal subsystem uses sensor readings (temperature, current) to compute thermal budget and trigger cooling‑device actions (fan speed, clock scaling). Ignoring the $I^{2}R$ relationship underestimates hotspot formation.
* **Peripheral Supply Design** – When adding a new sensor board, a driver must register a regulator that supplies the correct voltage and current limits. Over‑supplying can damage the part; under‑supplying causes unreliable communication. The regulator API enforces these constraints in software.
* **Debugging and Validation** – Tools such as `powertop`, `perf stat -e power/energy-cores/`, and `intel-rapl` expose energy counters derived from the same $P=VI$ principle. Interpreting these numbers requires knowing how the underlying rails are measured and converted.

By mastering the foundational equations and seeing how they are exposed through `/sys`, `i2c*`, and kernel APIs, a Linux developer can write power‑efficient drivers, diagnose unexpected drains, and contribute to the kernel’s power‑saving features with confidence rather than guesswork. This deep link between electromagnetic fundamentals and kernel interfaces is why the material in this lesson is indispensable for anyone working on Linux‑based embedded, mobile, or data‑center systems.
