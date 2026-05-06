---
id: 33
title: "Devices"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Core Concepts
### Passive vs. Active Components
Passive components (resistors, capacitors, inductors) cannot supply net power; they only store or dissipate energy. Active components (diodes, transistors) can control flow of charge and, when biased, deliver power to a circuit. This distinction follows from the definition of power $P = VI$: a passive element’s $V$ and $I$ always have the same sign (positive $P$), whereas an active element can exhibit negative $P$ (supplying power) under bias.

### Resistors – Microscopic Origin
The macroscopic resistance $R$ of a uniform conductor follows from Ohm’s law at the electron level. Drift velocity $v_d = \frac{eE\tau}{m}$ (where $E$ is electric field, $\tau$ mean free time, $m$ effective mass) gives current density $J = n e v_d = \sigma E$ with conductivity $\sigma = \frac{n e^2 \tau}{m}$. Since $R = \frac{V}{I} = \frac{E L}{J A}$, substituting $J=\sigma E$ yields  

$$
R = \frac{L}{\sigma A} = \rho \frac{L}{A},
$$  

where resistivity $\rho = 1/\sigma$. Thus $R$ scales linearly with length and inversely with cross‑sectional area.

### Capacitors – Energy Storage Mechanism
A parallel‑plate capacitor stores energy in the electric field $E = V/d$ between plates of area $A$ separated by distance $d$. Using $D = \epsilon E$ and $Q = DA$, capacitance is  

$$
C = \frac{Q}{V} = \frac{\epsilon A}{d}.
$$  

Energy density $u = \frac{1}{2}\epsilon E^2$ integrates over volume $Ad$ to give total stored energy  

$$
E = \frac{1}{2} C V^2.
$$  

### Inductors – Magnetic Energy
For a solenoid of $N$ turns, length $\ell$, cross‑section $A$, and core permeability $\mu$, Ampere’s law gives $B = \mu \frac{N I}{\ell}$. Flux $\Phi = B A$, so total flux linkage $\lambda = N\Phi = \mu \frac{N^2 A}{\ell} I$. By definition $L = \lambda/I$, thus  

$$
L = \mu \frac{N^2 A}{\ell}.
$$  

The magnetic energy density $u_B = \frac{B^2}{2\mu}$ integrates to  

$$
E = \frac{1}{2} L I^2.
$$  

### Diodes – Shockley Diode Equation
In a p‑n junction, drift and diffusion currents balance at equilibrium. Under forward bias $V$, the net current is  

$$
I = I_S \left(e^{\frac{V}{n V_T}} - 1\right),
$$  

where $I_S$ is saturation current, $V_T = kT/q\approx 26\text{ mV}$ at 300 K, and $n$ is the ideality factor (≈1–2). This exponential $I$–$V$ relation explains why a diode conducts easily in one direction and blocks in the reverse.

### Transistors – BJT Operation
A bipolar junction transistor (BJT) consists of two back‑to‑back p‑n junctions. In the active region, the base‑emitter junction is forward biased, injecting electrons from emitter into base. Because the base is thin and lightly doped, most electrons diffuse across to the collector, yielding  

$$
I_C \approx \beta I_B,
$$  

with $\beta = \frac{I_C}{I_B}$ the current gain. The collector‑emitter voltage $V_{CE}$ must remain above the saturation voltage ($\approx0.2\text{ V}$) to keep the collector‑base junction reverse biased; otherwise the transistor enters saturation and $\beta$ drops.

---

## How It Works
### From Material Properties to Circuit Behaviour
1. **Resistivity → Resistance** – Using $R=\rho L/A$, a 10 cm long copper wire ($\rho_{Cu}=1.68\times10^{-8}\,\Omega\!\cdot\!m$) with $A=1\text{ mm}^2=1\times10^{-6}\text{ m}^2$ has  

   $$
   R = 1.68\times10^{-8}\frac{0.1}{1\times10^{-6}} = 1.68\text{ m}\Omega.
   $$  

   This shows why PCB traces are modeled as low‑resistance impedances only when long or thin.

2. **Capacitance → RC Time Constant** – The voltage across a capacitor charging through a resistor $R$ obeys  

   $$
   V_C(t) = V_S\left(1-e^{-t/(RC)}\right).
   $$  

   Derivation: $i = C\frac{dV_C}{dt} = \frac{V_S-V_C}{R}$ → first‑order ODE → solution above. The time constant $\tau = RC$ determines speed of settling.

3. **Inductance → LR Time Constant** – For an inductor $L$ in series with $R$, current rise follows  

   $$
   I(t) = \frac{V_S}{R}\left(1-e^{-t/(R/L)}\right),
   $$  

   with $\tau = L/R$. This explains why inductors oppose rapid current changes (back‑EMF $V_L = L\frac{dI}{dt}$).

4. **Diode Reverse Recovery** – When switching from forward to reverse bias, stored minority charge must be removed. Reverse recovery time $t_{rr}$ depends on lifetime $\tau$ and reverse current $I_R$:  

   $$
   t_{rr} \approx \tau \ln\!\left(\frac{I_F}{I_R}+1\right).
   $$  

   This loss contributes to switching dissipation in MOSFETs driven by diode‑clamped gates.

5. **Transistor Small‑Signal Model** – Linearizing the Ebers‑Moll equations around a bias point yields the hybrid‑π model:  

   $$
   g_m = \frac{I_C}{V_T},\qquad r_\pi = \frac{\beta}{g_m},\qquad r_o = \frac{V_A}{I_C},
   $$  

   where $V_A$ is Early voltage. Voltage gain of a common‑emitter stage with collector resistor $R_C$ is  

   $$
   A_v = -g_m R_C \parallel r_o.
   $$  

   This links device physics to amplifier design.

---

## Worked Examples
### Example 1: Resistor Power Dissipation with Temperature Coefficient
A 1 kΩ resistor made of nickel‑chrome ($\alpha = 0.0004\ \text{°C}^{-1}$) dissipates 0.5 W at 25 °C. Find its resistance at 75 °C and the new power if voltage remains constant.

**Step‑by‑step**  
1. Power at 25 °C: $P = V^2/R \Rightarrow V = \sqrt{PR} = \sqrt{0.5\times1000}=22.36\text{ V}$.  
2. Resistance change: $R_T = R_0[1+\alpha (T-T_0)] = 1000[1+0.0004(75-25)] = 1000[1+0.02]=1020\ \Omega$.  
3. New power (same $V$): $P_T = V^2/R_T = (22.36)^2/1020 = 0.49\text{ W}$.  

*Interpretation*: The resistance increase slightly reduces dissipation; neglecting $\alpha$ would overestimate power by 2 %.

### Example 2: RC Low‑Pass Filter Cut‑off Frequency
Design a low‑pass filter with $f_c = 10\text{ kHz}$ using a 10 nF capacitor. Find required resistor value and verify attenuation at 100 kHz.

**Derivation**  
Cut‑off frequency $f_c = \frac{1}{2\pi RC}$ → $R = \frac{1}{2\pi f_c C} = \frac{1}{2\pi\times10^4\times10\times10^{-9}} \approx 1.59\text{ k}\Omega$.  

Attenuation magnitude: $|H(f)| = \frac{1}{\sqrt{1+(f/f_c)^2}}$. For $f=100\text{ kHz}$ ($f/f_c=10$):  

$$
|H| = \frac{1}{\sqrt{1+10^2}} = \frac{1}{\sqrt{101}} \approx 0.0995 \;( -20\text{ dB}).
$$  

### Example 3: MOSFET Switching Loss Estimation
A Si MOSFET ($Q_g = 30\text{ nC}$, $V_{GS}=10\text{ V}$) switches a 12 V load at 1 MHz with drain current $I_D=2\text{ A}$. Estimate gate drive loss and switching loss assuming $t_{rise}=t_{fall}=20\text{ ns}$.

**Gate drive loss**  
Energy per transition $E_G = Q_g V_{GS}=30\text{ nC}\times10\text{ V}=300\text{ nJ}$.  
Two transitions per cycle → $P_G = 2E_G f = 2\times300\text{ nJ}\times10^6 = 0.6\text{ W}$.

**Switching loss** (linear approximation)  
$E_{sw} = \frac{1}{2} V_{DS} I_D (t_{rise}+t_{fall}) = 0.5\times12\times2\times40\text{ ns}=480\text{ nJ}$.  
$P_{sw}=E_{sw}f = 480\text{ nJ}\times10^6 = 0.48\text{ W}$.

Total loss ≈ 1.08 W, showing why gate charge and switching speed dominate losses at high frequency.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | Using $P=V^2/R$ for AC RMS values without converting peak to RMS. | $V$ in the formula must be the instantaneous voltage across the resistor; for sinusoidal $v(t)=V_{pk}\sin(\omega t)$, average $P = V_{pk}^2/(2R)$. | Compute $V_{rms}=V_{pk}/\sqrt{2}$ then $P=V_{rms}^2/R$ or integrate over a period. |
| 2 | Assuming a capacitor’s voltage can change instantaneously. | $i=C\frac{dv}{dt}$; a finite current is required to change voltage. An ideal voltage step would demand infinite current. | Model the charging path with series resistance; use $v(t)=V_S(1-e^{-t/RC})$. |
| 3 | Treating a BJT as a current‑controlled switch with $I_C=\beta I_B$ in saturation. | In saturation both junctions are forward biased; collector current is limited by external circuit, not $\beta$. | Verify $V_{CE}>V_{CE(sat)}$; if not, use $I_C\approx (V_{CC}-V_{CE(sat)})/R_C$. |
| 4 | Neglecting parasitic inductance of a decoupling capacitor’s leads when estimating self‑resonant frequency. | Lead inductance $L_{lead}$ forms series LC with $C$, creating resonance where impedance rises, reducing decoupling effectiveness above $f_{SRF}=1/(2\pi\sqrt{LC})$. | Minimize loop area, use multiple parallel caps, or add ferrite beads to damp resonance. |
| 5 | Using the ideal diode equation $I=I_S(e^{V/(nV_T)}-1)$ for reverse bias beyond breakdown. | Avalanche or Zener mechanisms dominate; current rises sharply at $V_{BR}$. | Check $|V_R|<V_{BR}$; otherwise include breakdown region in model. |

---

## Exercises
### Easy  
1. **Resistivity calculation** – A tungsten filament ($\rho=5.6\times10^{-8}\,\Omega\!\cdot\!m$) is 2 mm long with a circular cross‑section diameter 10 µm. Compute its resistance.  
2. **Capacitor charge** – A 4.7 µF capacitor is charged to 3.3 V. What is the stored charge in µC?  

### Moderate  
3. **RC timing** – Design a monostable pulse of 5 ms width using a 0.1 µF capacitor. Determine the resistor value and the tolerance needed if the capacitor is ±10 %.  
4. **Inductor energy** – A 100 µH inductor carries a steady 500 mA current. Calculate the magnetic energy stored. If the current is interrupted in 100 ns, estimate the average voltage induced across the inductor (assume linear decay).  

### Hard  
5. **BJT bias network** – For a silicon BJT with $\beta=100$, $V_{BE}=0.7\text{ V}$, $V_{CC}=12\text{ V}$, and collector resistor $R_C=1\text{ k}\Omega$, choose $R_B$ to place the transistor at the edge of saturation ($V_{CE}=0.2\text{ V}$). Show all steps and compute the resulting base current.  
6. **Regulator feedback** – An adjustable LDOs uses a feedback resistor divider: $V_{OUT}=V_{REF}(1+R_1/R_2)$ with $V_{REF}=0.8\text{ V}$. To obtain $V_{OUT}=3.3\text{ V}$ and keep the divider current ≤ 10 µA, select $R_1$ and $R_2$ (standard values). Verify power dissipation in each resistor.  

---

## Linux Connection
### Accessing Voltage, Current, and Power via sysfs
Modern kernels expose hardware monitors through the **sysfs** virtual filesystem under `/sys/class/` and `/sys/devices/`. The most relevant subsystems are:

| Subsystem | Purpose | Typical path |
|-----------|---------|--------------|
| `regulator` | Voltage regulators (LDOs, buck/boost) | `/sys/class/regulator/` |
| `power_supply` | Batteries, AC adapters, USB power | `/sys/class/power_supply/` |
| `hwmon` | General purpose hardware monitoring (voltage, current, temperature) | `/sys/class/hwmon/` |
| `intel-rapl` (amd‑gpu‑powermgmt, etc.) | CPU energy counters via RAPL | `/sys/class/powercap/intel-rapl:` |

#### Real‑world examples
1. **Reading a laptop battery voltage**  
   ```bash
   # Show voltage in µV (microvolts)
   cat /sys/class/power_supply/BAT0/voltage_now
   # Convert to volts: divide by 1e6
   awk '{print $1/1e6 " V"}' /sys/class/power_supply/BAT0/voltage_now
   ```
2. **Monitoring CPU package power with RAPL**  
   ```bash
   # Energy consumed since boot, in microjoules
   cat /sys/class/powercap/intel-rapl:0/energy_uj
   # Compute instantaneous power by sampling twice 1 s apart
   e1=$(cat /sys/class/powercap/intel-rapl:0/energy_uj)
   sleep 1
   e2=$(cat /sys/class/powercap/intel-rapl:0/energy_uj)
   power_w=$(( (e2 - e1) / 1000000 ))   # µJ/s → W
   echo "Package power: $power_w W"
   ```
3. **Using an INA219 current‑shunt sensor over I²C**  
   The INA219 provides bus voltage, shunt voltage, and calculated current.  
   ```bash
   # Load i2c-dev if not present
   sudo modprobe i2c-dev
   # Assuming the sensor is at address 0x40 on bus 1
   i2cget -y 1 0x40 0x02 w   # read shunt voltage register (VBUS)
   i2cget -y 1 0x40 0x04 w   # read bus voltage register
   # Convert: 1 LSB = 10 µV (shunt), 4 mV (bus) per datasheet
   ```
   A small C helper using the i2c‑dev ioctl:
   ```c
   #include <linux/i2c-dev.h>
   #include <fcntl.h>
   #include <sys/ioctl.h>
   #include <unistd.h>
   #include <stdio.h>

   int main(void) {
       int fd = open("/dev/i2c-1", O_RDWR);
       ioctl(fd, I2C_SLAVE, 0x40);
       uint16_t reg;
       read(fd, &reg, 2);          // shunt voltage
       float v_shunt = (int16_t)reg * 10e-6; // V
       read(fd, &reg, 2);          // bus voltage
       float v_bus = reg * 4e-3;   // V
       printf("Shunt: %.3f mV, Bus: %.3f V\n", v_shunt*1e3, v_bus);
       close(fd);
       return 0;
   }
   ```
4. **Controlling a regulator via the regulator API (kernel space)**  
   ```c
   #include <linux/regulator/consumer.h>
   #include <linux/err.h>
   #include <linux/printk.h>

   static int __init regulator_example_init(void) {
       struct regulator *reg;
       int ret, voltage_uV;

       reg = regulator_get(NULL, "ldo1");          // name from device tree
       if (IS_ERR(reg))
           return PTR_ERR(reg);

       regulator_enable(reg);
       /* Set output to 1.8 V */
       voltage_uV = 1800000;
       ret = regulator_set_voltage(reg, voltage_uV, voltage_uV);
       if (ret)
           pr_err("Failed to set voltage: %d\n", ret);

       /* Read back */
       voltage_uV = regulator_get_voltage(reg);
       pr_info("Regulator voltage: %d mV\n", voltage_uV/1000);

       regulator_disable(reg);
       regulator_put(reg);
       return 0;
   }
   module_init(regulator_example_init);
   ```
   This snippet demonstrates how a device‑tree‑defined regulator (`ldo1`) can be enabled, programmed, and queried—directly linking the abstract concept of a voltage regulator to concrete kernel interfaces.

### Why These Interfaces Matter
- **Power budgeting**: Administrators can read instantaneous power (`energy_uj`) to enforce thermal limits or trigger frequency scaling.
- **Hardware validation**: Voltage readings from `power_supply` confirm that a regulator’s output matches its setpoint before enabling sensitive ICs.
- **Driver development**: The `regulator` API lets drivers request specific voltages without knowing the underlying hardware (PMIC, LDO, switch‑mode), promoting reusable code.

---

## Why This Matters
Understanding the fundamental physics of resistors, capacitors, inductors, diodes, and transistors provides the *first‑principles* foundation needed to interpret every layer of a computer system—from the silicon transistors that implement logic gates, to the decoupling capacitors that stabilize power rails, to the inductors in DC‑DC converters that supply the CPU, and finally to the Linux kernel interfaces that let us monitor and control those very quantities in real time.  

When you can derive $R=\rho L/A$, you see why a long, thin PCB trace becomes a source of IR drop and why designers use wide power planes. When you grasp the $RC=\tau$ relationship, you can predict how fast a level‑shifter will transition and why a poorly chosen decoupling capacitor fails to suppress high‑frequency noise. Knowing the diode’s exponential $I$‑$V$ curve explains why a simple series resistor is insufficient for LED current control and why constant‑current drivers are essential. Mastery of the BJT’s $\beta$ and Early effect lets you bias analog amplifiers correctly, while the MOSFET gate‑charge model drives efficient PWM design for motor controllers and switch‑mode power supplies.  

Finally, the Linux kernel exposes these same electrical quantities through well‑defined sysfs and API layers, turning abstract theory into actionable diagnostics and control. By linking semiconductor physics to concrete kernel interfaces—reading a battery’s voltage via `/sys/class/power_supply`, measuring CPU energy with RAPL, or programming a regulator through the regulator subsystem—you gain the ability to design, debug, and optimize systems that are both electrically sound and software‑controllable. This holistic view is indispensable for engineers working on embedded Linux, IoT devices, data‑center servers, or any platform where hardware and software co‑design determines performance, efficiency, and reliability.
