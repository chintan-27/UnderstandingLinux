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

## Why This Matters

Every circuit on your motherboard needs clean, stable DC voltage at a specific level. The wall outlet delivers 120V AC. A battery delivers a voltage that sags under load and drops as it discharges. Without regulation, a 5% voltage droop on a CPU's 1.0V rail shifts logic thresholds enough to violate setup and hold times — the result is silent data corruption or hard resets, not a clean error you can debug. Without decoupling, the 10A current spike when a CPU transitions from idle to full load travels through parasitic inductance in PCB traces and creates a voltage spike that can reset neighboring chips. Linux sees all of this directly: the `cpufreq` subsystem exists because the VRM has thermal limits; `hwmon` exposes VRM fault flags; ACPI P-states and C-states are negotiated in real time partly to stay within the power delivery envelope. Power delivery is a physical constraint that software navigates continuously.

---

## Core Concepts

### Linear Regulators

A linear regulator places a transistor (the pass element) in series between the unregulated input and the regulated output. A feedback loop compares the output voltage to a stable bandgap reference and adjusts the transistor's gate to hold the output at the set point. The transistor is biased in its active region — it behaves as a variable resistor, and the excess voltage $(V_{in} - V_{out})$ drops across it.

The efficiency ceiling is set by the voltage ratio alone:

$$\eta_{max} = \frac{V_{out}}{V_{in}}$$

At $V_{in} = 12\text{V}$, $V_{out} = 5\text{V}$, efficiency is capped at $\approx 42\%$. The remaining $7\text{V} \times I_{load}$ is dissipated as heat in the pass transistor — not as a switching loss or a conduction loss that you can engineer around, but as a direct consequence of Ohm's law applied to the voltage difference. At 1A, that is 7W regardless of load behavior. The thermal problem scales with current, which is why linear regulators at anything above a few hundred milliamps require significant heatsinking.

Linear regulators remain useful in three narrow cases: small $V_{in}$-to-$V_{out}$ differential (efficiency loss is acceptable), low load current, or applications requiring very low output noise. Switching regulators inject high-frequency noise by their operating principle; a linear post-regulator on a sensitive analog or RF supply trades efficiency for the noise floor.

### Switching Regulators

A switching regulator drives a transistor as a saturated switch — either fully on (small $V_{DS}$, nearly zero dissipation) or fully off (zero $I_D$, zero dissipation). The switch is never held in the resistive region, so the power loss during each state is small. Transition losses (charging and discharging gate capacitance, finite switching time) scale with frequency, but efficiency of 85–95% is routinely achievable.

The mechanism: during the on-time, the switch connects $V_{in}$ to an inductor, and the inductor current ramps up, storing energy as $E = \frac{1}{2}LI^2$. When the switch opens, the inductor's collapsing magnetic field drives current through a catch diode (or synchronous low-side switch) into the output capacitor and load. The output voltage is set by the fraction of time the switch is on — the duty cycle $D$:

$$V_{out} = D \cdot V_{in}$$

This holds for a continuous-conduction-mode (CCM) buck converter in steady state. The feedback loop adjusts $D$ in real time to maintain regulation against load and line changes. The cost relative to a linear regulator is complexity: switching noise, EMI, and component count. Every high-frequency switching edge is a radiated and conducted emission source.

### Decoupling Capacitors

When a digital circuit switches and demands a burst of current, that current must travel from the power supply through PCB traces, vias, and package leads to the die. Every segment of that path has inductance. Faraday's law gives the voltage penalty:

$$V_L = L\frac{dI}{dt}$$

A 10A step in 1ns through 1nH of inductance produces a 10V spike on a 1V rail — catastrophic. Decoupling capacitors placed physically close to the load act as local charge reservoirs. They supply the initial transient current from stored charge $Q = CV$ while the regulator's slower feedback loop (with bandwidth typically in the tens to hundreds of kHz) catches up.

Decoupling requires capacitors at multiple scales because each real capacitor has a self-resonant frequency (SRF) above which its parasitic series inductance (ESL) dominates and it behaves inductively. Below the SRF, it is capacitive and useful for decoupling. The required hierarchy:

| Type | Typical Value | Function |
|---|---|---|
| Bulk electrolytic/polymer | 100 µF – 1 mF | Load steps over microseconds to milliseconds |
| MLCC ceramic | 100 nF | Nanosecond switching transients |
| On-die capacitance | tens of nF (integrated) | Sub-nanosecond transitions at the die edge |

The reason you cannot use one large capacitor is that a 1 mF electrolytic has an SRF of perhaps 10 kHz — it is inductive at the frequencies a 100 MHz clock edge generates. A 100 nF ceramic MLCC has an SRF around 50–100 MHz and handles that range. On-die capacitance, placed microns from the switching gates, handles the fastest transitions at GHz frequencies.

### Power Integrity

Power integrity (PI) is the discipline of keeping $V_{DD}$ and $V_{SS}$ within their specified tolerance bands at every point in the system across all frequencies of interest. The governing quantity is the power distribution network (PDN) impedance $Z_{PDN}(f)$. The target impedance at any frequency is:

$$Z_{target} = \frac{\Delta V_{allowed}}{I_{max}}$$

For a CPU rail with $V_{DD} = 1.0\text{V}$, a 5% tolerance ($\Delta V = 50\text{mV}$), and peak current $I_{max} = 100\text{A}$:

$$Z_{target} = \frac{0.05\text{V}}{100\text{A}} = 0.5\text{m}\Omega$$

Maintaining sub-milliohm PDN impedance from DC through several hundred MHz requires coordinated placement of VRM output capacitors, board-level bulk and bypass capacitors, and on-package capacitance. Resonances in the PDN (where inductive and capacitive elements interact) produce impedance peaks that cause voltage droop at specific frequencies — the frequencies that happen to match a CPU's load modulation pattern from a tight loop.

---

## How It Works

### Buck Converter Operation in Detail

Consider a synchronous buck converter: input $V_{in}$, output $V_{out}$, inductor $L$, output capacitor $C$, switching frequency $f_{sw}$, duty cycle $D$.

**On-phase** (duration $DT$, where $T = 1/f_{sw}$): The high-side switch closes, connecting $V_{in}$ to the inductor. The voltage across the inductor is $V_{in} - V_{out}$, so current ramps up:

$$\frac{dI_L}{dt}\bigg|_{on} = \frac{V_{in} - V_{out}}{L}$$

**Off-phase** (duration $(1-D)T$): The high-side switch opens; the low-side switch closes, connecting the inductor to ground. The voltage across the inductor is $-V_{out}$, so current ramps down:

$$\frac{dI_L}{dt}\bigg|_{off} = \frac{-V_{out}}{L}$$

In steady state, the inductor current must be periodic — the current at the end of each cycle equals the current at the start. This means the volt-second product must balance over one cycle (the average voltage across the inductor must be zero):

$$(V_{in} - V_{out}) \cdot DT = V_{out} \cdot (1-D)T$$

Solving:

$$V_{out} = D \cdot V_{in}$$

The peak-to-peak inductor current ripple is:

$$\Delta I_L = \frac{(V_{in} - V_{out}) \cdot D}{L \cdot f_{sw}}$$

The resulting output voltage ripple (assuming the capacitor ESR is negligible) is:

$$\Delta V_{out} = \frac{\Delta I_L}{8 \cdot C \cdot f_{sw}} = \frac{V_{out}(1-D)}{8LCf_{sw}^2}$$

This equation tells you the design levers for ripple reduction: increase $L$, increase $C$, or increase $f_{sw}$. Doubling $f_{sw}$ reduces ripple by $4\times$ for the same $L$ and $C$ — this is why modern server VRMs operate at 300 kHz to 1 MHz rather than the 50–100 kHz typical in older designs. Faster switching allows physically smaller passives while maintaining tighter output regulation.

### Multiphase VRMs

A CPU VRM uses $N$ parallel switching phases, each offset in time by $T/N$. Each phase runs the same basic buck topology but out-of-phase with its neighbors.

The output current ripple of the $N$-phase converter is not $N$ times worse — the ripple components partially cancel because they are phase-shifted. At the worst-case duty cycle $D = k/N$ for integer $k$, the effective ripple current seen by the output capacitors is:

$$\Delta I_{ripple,N} \approx \frac{\Delta I_{ripple,1}}{N}$$

The ripple frequency presented to the output capacitors is $N \cdot f_{sw}$, not $f_{sw}$. Higher effective ripple frequency means less capacitance is needed for the same voltage ripple — from the ripple equation, $C \propto 1/f^2$, so multiplying frequency by $N$ reduces required capacitance by $N^2$ at fixed ripple.
