---
id: 18
title: "Thermodynamics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Core Concepts  
### Temperature from Kinetic Theory  
Temperature is not a subjective “hotness” but a measurable statistical property. For a monatomic ideal gas in equilibrium, the average translational kinetic energy per particle is  

\[
\langle E_{\text{kin}}\rangle = \frac{3}{2}k_{\!B}T,
\]

where \(k_{\!B}=1.380649\times10^{-23}\,\text{J K}^{-1}\) is Boltzmann’s constant. This follows from the equipartition theorem: each quadratic degree of freedom contributes \(\frac12k_{\!B}T\) to the internal energy. Consequently, measuring temperature is equivalent to measuring the spread of particle velocities. In solids, the same relation holds for phonon modes, leading to the Debye model of specific heat.

### Heat as Energy Transfer  
Heat \(Q\) is the energy that crosses a system boundary **solely** because of a temperature difference. Unlike internal energy \(U\), heat is a process quantity; it is not a state function. The differential form of the first law (see below) writes  

\[
\delta Q = dU - \delta W,
\]

with the sign convention that \(\delta Q>0\) when energy enters the system as heat. Heat transfer mechanisms are:  

* **Conduction** – Fourier’s law \(\mathbf{q} = -k\nabla T\) (W m\(^{-2}\)).  
* **Convection** – Newton’s law of cooling \(\dot Q = hA(T_s-T_\infty)\).  
* **Radiation** – Stefan‑Boltzmann law \(\dot Q = \varepsilon\sigma A(T_s^4-T_\infty^4)\).

### Entropy from Microscopic Counting  
Entropy quantifies the number of microscopic microstates \(\Omega\) compatible with a given macrostate:

\[
S = k_{\!B}\ln\Omega .
\]

For a reversible infinitesimal heat exchange \(\delta Q_{\rm rev}\),

\[
dS = \frac{\delta Q_{\rm rev}}{T},
\]

which is the Clausius definition. In an isolated system, \(\Omega\) can only increase (or stay constant for a reversible process), giving the second law.

### Energy Transfer Channels  
The first law for a closed system reads  

\[
dU = \delta Q + \delta W,
\]

where \(\delta W = -p\,dV\) is boundary work (sign convention: work done **on** the system is positive). Open systems add a mass flow term \(\dot m (h + \frac{1}{2}v^2 + gz)\). Thus, any change in internal energy must be accounted for by heat, work, or mass transfer.

---

## How It Works  
### The Laws of Thermodynamics – First Principles  
1. **Zeroth Law** – If two systems are each in thermal equilibrium with a third, they are in equilibrium with each other. This justifies temperature as a transitive scalar.  
2. **First Law** – Energy conservation. Derive from the work‑energy theorem applied to each particle and summing over the system:  

   \[
   \Delta U = Q + W .
   \]

   No term can be created or destroyed; only converted.  
3. **Second Law** – For any process, the total entropy change of the universe satisfies  

   \[
   \Delta S_{\text{univ}} \ge 0 .
   \]

   Using \(dS = \delta Q_{\rm rev}/T\) and the fact that \(\delta Q \le \delta Q_{\rm rev}\) for irreversible heat transfer, we obtain the Clausius inequality  

   \[
   \oint \frac{\delta Q}{T} \le 0 .
   \]

   Equality holds only for reversible cycles.  
4. **Third Law** – As \(T\to0\), the entropy of a perfect crystal approaches a constant (taken as zero). Quantum mechanically, the ground state is non‑degenerate, so \(\Omega=1\Rightarrow S=0\).

### Heat Engines – Carnot Bound  
A reversible engine operating between reservoirs at temperatures \(T_H\) (hot) and \(T_C\) (cold) follows a Carnot cycle (two isotherms, two adiabats). The net work per cycle is  

\[
W = Q_H - Q_C .
\]

From the isotherms, \(Q_H = T_H\Delta S\) and \(Q_C = T_C\Delta S\). Hence  

\[
\eta \equiv \frac{W}{Q_H}=1-\frac{T_C}{T_H}.
\]

Any real engine has \(\eta_{\rm real}<\eta_{\rm Carnot}\) because irreversibilities generate extra entropy.

### Refrigerators and Heat Pumps – Coefficient of Performance  
For a refrigerator, the desired effect is heat extracted from the cold reservoir \(Q_C\). Using the same Carnot arguments,

\[
\text{COP}_{\rm refrig} = \frac{Q_C}{W}= \frac{T_C}{T_H-T_C}.
\]

A heat pump’s COP (heating mode) is \(\text{COP}_{\rm hp}= \frac{Q_H}{W}= \frac{T_H}{T_H-T_C}\). Both exceed unity because they move heat rather than create it.

### Entropy Production in Irreversible Heat Transfer  
Consider two finite bodies at \(T_1>T_2\) exchanging heat \(Q\) until they reach a common temperature \(T_f\). The entropy change of each is  

\[
\Delta S_1 = \int_{T_1}^{T_f}\frac{C\,dT}{T}=C\ln\frac{T_f}{T_1},
\quad
\Delta S_2 = C\ln\frac{T_f}{T_2}.
\]

Total entropy production  

\[
\Delta S_{\rm tot}=C\ln\frac{T_f^2}{T_1T_2}>0,
\]

since \(T_f\) lies between \(T_1\) and \(T_2\) and the log term is positive. This quantifies the irreversibility of simple thermal equilibration.

---

## Worked Examples  
### Example 1 – Lumped‑Capacitance Cooling of Coffee  
A 250 g ceramic mug (specific heat \(c=0.88\;\text{J g}^{-1}\text{K}^{-1}\)) holds 200 g of coffee (\(c\approx4.18\;\text{J g}^{-1}\text{K}^{-1}\)). The combined mass‑specific heat is  

\[
C = m_{\text{mug}}c_{\text{mug}}+m_{\text{coffee}}c_{\text{coffee}}
   = (250\times0.88)+(200\times4.18)\approx 1060\;\text{J K}^{-1}.
\]

Assume natural convection coefficient \(h=5\;\text{W m}^{-2}\text{K}^{-1}\) and exposed surface area \(A=0.025\;\text{m}^2\). The lumped‑capacitance time constant  

\[
\tau = \frac{C}{hA}= \frac{1060}{5\times0.025}= 8480\;\text{s}\approx 141\;\text{min}.
\]

The temperature obeys  

\[
T(t)=T_{\infty}+(T_0-T_{\infty})e^{-t/\tau},
\]

with \(T_{\infty}=20^{\circ}\text{C}\), \(T_0=80^{\circ}\text{C}\). Solve for \(t\) when \(T=40^{\circ}\text{C}\):

\[
\frac{40-20}{80-20}=e^{-t/\tau}\;\Longrightarrow\;
t=-\tau\ln\!\left(\frac{20}{60}\right)=\tau\ln 3\approx141\times1.099\approx155\;\text{min}.
\]

**Result:** ≈ 2.6 h to drop from 80 °C to 40 °C under the stated conditions.

### Example 2 – Real Heat Engine Efficiency  
Source temperature \(T_H = 500^{\circ}\text{C}=773\;\text{K}\). Sink temperature \(T_C = 20^{\circ}\text{C}=293\;\text{K}\).  

Carnot limit  

\[
\eta_{\rm Carnot}=1-\frac{T_C}{T_H}=1-\frac{293}{773}=0.621\;(62.1\%).
\]

The engine is said to operate at 30 % of the *heat input*, i.e.  

\[
\eta_{\rm real}=0.30.
\]

Work per unit heat input  

\[
\frac{W}{Q_H}= \eta_{\rm real}=0.30\;\Longrightarrow\; W=0.30\,Q_H.
\]

If the engine absorbs \(Q_H=10\;\text{kJ}\) per cycle, the work output is  

\[
W=0.30\times10\;\text{kJ}=3.0\;\text{kJ}.
\]

### Example 3 – Refrigerator COP Calculation  
Cold reservoir: \(T_C = -20^{\circ}\text{C}=253\;\text{K}\).  
Hot reservoir: \(T_H = 20^{\circ}\text{C}=293\;\text{K}\).  

Carnot COP  

\[
\text{COP}_{\rm Carnot}= \frac{T_C}{T_H-T_C}= \frac{253}{293-253}= \frac{253}{40}=6.33.
\]

Given an actual COP of 3, the heat removed per joule of work is  

\[
Q_C = \text{COP}\times W = 3\,W.
\]

For a compressor consuming \(W=150\;\text{J}\) per second, the cooling power is  

\[
\dot Q_C = 3\times150\;\text{W}=450\;\text{W}.
\]

---

## Common Mistakes  
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Using Celsius in efficiency formulas** \(\eta = 1 - T_C/T_H\) | The formula requires absolute temperature; a 10 °C difference is not the same as a 10 K difference at low temperatures. | Convert all temperatures to Kelvin before applying any thermodynamic ratio. |
| 2 | **Assuming adiabatic = reversible** | An adiabatic process can be irreversible (e.g., free expansion, rapid compression) producing entropy \(\Delta S>0\). | Check for quasistatic, dissipation‑free conditions; compute entropy generation if needed. |
| 3 | **Equating heat \(Q\) with change in internal energy \(\Delta U\)** | Ignores work term \(\delta W\); in many engineering devices (turbines, pistons) work dominates. | Always write the first law \(dU = \delta Q + \delta W\) and evaluate both terms. |
| 4 | **Neglecting entropy flow with mass** | In open systems, mass carries entropy \(s\dot m\); omitting it violates the second law for flow devices (nozzles, diffusers). | Include the term \(\dot m(s_{\rm out}-s_{\rm in})\) in the entropy balance. |
| 5 | **Treating the lumped‑capacitance model as universally valid** | It assumes Biot number \(\text{Bi}=hL_c/k\ll1\); for large objects or high \(h\), internal temperature gradients matter. | Compute Biot number; if \(\text{Bi}>0.1\), solve the transient heat conduction equation (e.g., using separation of variables). |

---

## Exercises  
### Easy  
1. **Unit conversion:** A sensor reports temperature as \(25\,000\) millikelvin. Express this in Kelvin, Celsius, and Fahrenheit.  

2. **Heat capacity:** Calculate the energy required to raise the temperature of 0.5 kg of aluminum (\(c=0.897\;\text{J g}^{-1}\text{K}^{-1}\)) from 20 °C to 150 °C.  

### Medium  
3. **Entropy of mixing:** Two ideal gases, A and B, each 1 mol, initially separated at 300 K and 1 bar, are allowed to mix adiabatically and irreversibly. Compute the entropy change of mixing.  

4. **Fin effectiveness:** A straight aluminum fin of length \(L=0.05\;\text{m}\), diameter \(D=0.005\;\text{m}\), conductivity \(k=205\;\text{W m}^{-1}\text{K}^{-1}\) is attached to a surface at \(T_b=80^{\circ}\text{C}\) exposed to air at \(T_\infty=20^{\circ}\text{C}\) with \(h=10\;\text{W m}^{-2}\text{K}^{-1}\). Assuming an insulated tip, find the fin effectiveness \(\eta_f\).  

### Hard  
5. **Design a heat sink:** A CPU dissipates 95 W. The ambient temperature is 25 °C and the maximum allowable junction temperature is 85 °C. Using the thermal resistance model \(R_{\thetaJA}=R_{\theta JC}+R_{\theta CS}+R_{\theta SA}\), where \(R_{\theta JC}=0.5\;\text{K/W}\) (junction‑to‑case) and \(R_{\theta CS}=0.2\;\text{K/W}\) (case‑to‑sink), determine the maximum allowable sink‑to‑ambient resistance \(R_{\theta SA}\) and suggest a suitable fin geometry (provide dimensions and material) that meets this resistance, assuming natural convection \(h=8\;\text{W m}^{-2}\text{K}^{-1}\).  

6. **Transient conduction in a slab:** A 10 mm thick stainless‑steel plate (\(k=16\;\text{W m}^{-1}\text{K}^{-1}\), \(\rho=8000\;\text{kg m}^{-3}\), \(c=500\;\text{J kg}^{-1}\text{K}^{-1}\)) initially at 20 °C is suddenly immersed in oil at 180 °C with a convection coefficient \(h=500\;\text{W m}^{-2}\text{K}^{-1}\). Using the one‑term approximation of the series solution, estimate the time required for the mid‑plane temperature to reach 150 °C.  

---

## Linux Connection  
### Thermal Subsystem in the Kernel  
Linux exports temperature sensors through the **thermal** sysfs class. Each sensor appears as a directory under `/sys/class/thermal/`. The file `type` describes the sensor (e.g., `x86_pkg_temp`), and `temp` holds the temperature in millidegrees Celsius.

```bash
# List all thermal zones
ls /sys/class/thermal/

# Show the type and current temperature of zone 0
cat /sys/class/thermal/thermal_zone0/type
cat /sys/class/thermal/thermal_zone0/temp   # output in millidegrees Celsius
```

Convert to degrees Celsius in the shell:

```bash
temp_milli=$(cat /sys/class/thermal/thermal_zone0/temp)
temp_c=$((temp_milli/1000))
echo "CPU temperature: ${temp_c}°C"
```

### Using lm_sensors  
The `lm_sensors` package provides user‑space access to hardware monitoring chips.

```bash
# Install (Debian/Ubuntu)
sudo apt-get update
sudo apt-get install lm_sensors

# Detect sensors
sudo sensors-detect   # answer prompts; usually accept defaults

# Read all sensors
sensors
```

Sample output (excerpt):

```
coretemp-isa-0000
Adapter: ISA adapter
Package id 0:  +45.0°C  (high = +80.0°C, crit = +100.0°C)
Core 0:        +42.0°C  (high = +80.0°C, crit = +100.0°C)
Core 1:        +44.0°C  (high = +80.0°C, crit = +100.0°C)
```

### Controlling Fan Speed via PWM  
Many platforms expose fan control as PWM devices under `/sys/class/hwmon/`.  

```bash
# Find hwmon devices that contain a pwm1 file
for d in /sys/class/hwmon/hwmon*; do
    if [ -f "$d/pwm1" ]; then
        echo "$d"
        cat "$d/pwm1"   # current duty cycle (0‑255)
    fi
done

# Set fan to 70 % duty (≈178/255)
echo 178 | sudo tee /sys/class/hwmon/hwmon0/pwm1
```

### Daemon‑Based Thermal Management  
`thermald` is a Linux daemon that uses the kernel’s thermal governor to keep temperatures within limits by adjusting CPU frequency, triggering fans, etc.

```bash
# Install and start
sudo apt-get install thermald
sudo systemctl enable --now thermald

# View current thermal policy
cat /sys/class/thermal/thermal_zone0/mode   # e.g., "enabled" or "disabled"
```

### Example C Program – Reading a Thermal Zone  
```c
/* read_temp.c – read temperature from a thermal zone */
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>

int main(void)
{
    const char *path = "/sys/class/thermal/thermal_zone0/temp";
    char buf[16];
    long temp_milli;
    int fd = open(path, O_RDONLY);
    if (fd < 0) {
        perror("open");
        return EXIT_FAILURE;
    }
    ssize_t n = read(fd, buf, sizeof(buf)-1);
    close(fd);
    if (n < 0) {
        perror("read");
        return EXIT_FAILURE;
    }
    buf[n] = '\0';
    temp_milli = strtol(buf, NULL, 10);
    printf("Temperature: %.2f°C\n", temp_milli/1000.0);
    return EXIT_SUCCESS;
}
```

Compile and run:

```bash
gcc -Wall -O2 read_temp.c -o read_temp
./read_temp
```

---

## Why This Matters  
Thermodynamics is not a abstract textbook topic; it governs the **energy budget** of every computing platform. The first law tells us that the electrical power drawn by a CPU must appear somewhere—as heat, as useful work (computation), or as stored energy. The second law limits how effectively we can move that heat away: no cooling system can reduce the entropy flux below the Carnot bound, which translates directly into a minimum achievable **Power Usage Effectiveness (PUE)** for data centers.  

By quantifying heat generation (\(P = IV\)), thermal resistance (\(R_{\theta}\)), and temperature rise (\(\Delta T = P\cdot R_{\theta}\)), engineers can:

* **Select heat‑sink geometry** that keeps junction temperatures below reliability limits.  
* **Tune CPU frequency governors** (via `cpufreq`) to balance performance and cooling power.  
* **Schedule workloads** to avoid hot spots, using thermal‑aware task schedulers (`thermal` subsystem in the kernel).  

In Linux, the interfaces shown above (`/sys/class/thermal`, `lm_sensors`, `thermald`, PWM fan controls) give administrators and developers direct, programmable access to these thermodynamic quantities. Applying the derived formulas—whether calculating the COP of a rack‑level chiller, estimating the time constant of a server’s chassis, or verifying that a fan’s PWM duty yields the required heat‑removal rate—turns theoretical principles into concrete operational metrics. Mastery of these connections enables the design of systems that are not only faster but also **more energy‑efficient, longer‑lived, and environmentally responsible**.
