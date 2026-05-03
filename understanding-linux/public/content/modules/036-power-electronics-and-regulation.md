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

Every circuit on your Linux machine — CPU, RAM, PCIe bus, storage controller — requires a stable DC voltage to function correctly. If the voltage supply to your CPU droops 5% during a memory burst, you get bit errors, instability, or a hard crash — not a kernel panic with a useful message, but silent data corruption or a machine check exception. If decoupling is absent, high-frequency switching noise from one subsystem couples into the analog front-end of another. Voltage regulators solve the first problem; decoupling capacitors solve the second. Without both working correctly, no amount of software correctness matters — the hardware beneath your kernel is lying to it.

---

## Core Concepts

### The Problem: Unregulated DC

Rectifying AC through a transformer and bridge gives you DC, but it is *unregulated*: the output voltage sags under heavy load because of nonzero source impedance, rises under light load, and ripples at twice the line frequency (120 Hz in North America, 100 Hz in Europe). The ripple amplitude is:

$$V_{ripple} \approx \frac{I_{load}}{2 f C}$$

where $f$ is the line frequency and $C$ is the filter capacitor. Doubling $C$ halves the ripple, but at 120 Hz you need hundreds of microfarads to get millivolt-level ripple — capacitors that are physically enormous. The practical answer is regulation through a feedback loop, not brute-force filtering.

### Linear Regulators

A linear regulator places a transistor — the *pass element* — in series between the unregulated input and the regulated output. A feedback amplifier compares the output to a bandgap reference and drives the pass transistor's gate to maintain constant $V_{out}$. The pass transistor operates in its active region, dropping the excess voltage as heat:

$$P_{dissipated} = (V_{in} - V_{out}) \times I_{load}$$

This produces very clean output — no switching transitions, no high-frequency noise — which makes linear regulators attractive for noise-sensitive analog and RF circuitry. But efficiency is bounded by the voltage ratio:

$$\eta = \frac{V_{out}}{V_{in}}$$

At $V_{in} = 12\,\text{V}$, $V_{out} = 5\,\text{V}$, $I_{load} = 1\,\text{A}$: $\eta = 42\%$, with $7\,\text{W}$ wasted as heat in the pass transistor. At $100\,\text{A}$ — not unusual for a server VRM — that becomes $700\,\text{W}$ of thermal load. Linear regulators are practical only when $V_{in} - V_{out}$ is small (a few hundred millivolts, as in an LDO post-regulator) or load current is low.

### Switching Regulators

A switching regulator uses a transistor as a saturated *switch*, not a variable resistor. It alternates rapidly between fully on ($V_{DS} \approx 0$, so $P = V_{DS} \cdot I_D \approx 0$) and fully off ($I_D = 0$, so $P = 0$ again). In both ideal states the switch dissipates negligible power. Real losses come from the transitions themselves — charging and discharging gate capacitance at frequency $f_{sw}$, plus conduction losses from finite on-resistance $R_{DS(on)}$ — but these are small compared to linear dissipation at high current.

The most common topology is the *buck converter* (step-down):

1. **High-side switch closes**: $V_{in}$ is applied across the inductor. Current ramps up at $\frac{dI}{dt} = \frac{V_{in} - V_{out}}{L}$, storing energy $E = \frac{1}{2}LI^2$ in the magnetic field.
2. **Switch opens**: The inductor maintains current flow — because $V = L\,\frac{dI}{dt}$, any attempt to abruptly stop current drives $V$ to whatever value is needed to keep current flowing. A catch diode (or synchronous low-side FET) provides the return path; current ramps down at $\frac{dI}{dt} = \frac{V_{out}}{L}$.
3. **Feedback loop** measures $V_{out}$ and adjusts the duty cycle $D = t_{on}/T$ to regulate the output. At steady state, volt-second balance on the inductor gives:

$$V_{out} = D \cdot V_{in}$$

Efficiencies of 85–95% are achievable, which is why every modern power supply — laptop charger, server PSU, CPU VRM — is a switcher. The cost is complexity and switching noise: the fast $dV/dt$ and $dI/dt$ transitions generate broadband EMI that must be filtered and shielded.

### Voltage References

Every regulator requires a stable reference voltage to compare against. Bandgap references exploit the predictable temperature behavior of silicon PN junctions: the base-emitter voltage $V_{BE}$ of a bipolar transistor has a negative temperature coefficient (~$-2\,\text{mV/°C}$), while the thermal voltage $V_T = kT/q$ has a positive one. A circuit that sums these in the right proportion produces a temperature-stable output near $1.25\,\text{V}$ — the silicon bandgap voltage extrapolated to $0\,\text{K}$. If this reference drifts, every downstream voltage drifts with it, and the regulator's regulation accuracy is only as good as its reference.

### Decoupling Capacitors

Even a perfect regulator cannot respond instantaneously to load steps. The *power distribution network* (PDN) — board traces, vias, connector pins, bond wires inside the package — has nonzero inductance $L_{PDN}$. When a digital block switches, it draws a current spike with a rise time in the nanosecond range. That $dI/dt$ through the PDN inductance creates a voltage drop:

$$V_{drop} = L_{PDN} \frac{dI}{dt}$$

For $L_{PDN} = 10\,\text{nH}$ and $\frac{dI}{dt} = 1\,\text{A/ns} = 10^9\,\text{A/s}$:

$$V_{drop} = 10\,\text{nH} \times 10^9\,\text{A/s} = 10\,\text{V}$$

That is catastrophic on a 1.2 V CPU core rail. The fix is to place capacitors physically close to the load. They act as local charge reservoirs: they supply the instantaneous current while the regulator (which has finite loop bandwidth and sees the inductance of the longer supply path) catches up. The allowable voltage droop $\Delta V$ determines how much charge the capacitor must supply:

$$Q = C \cdot \Delta V$$

If $\Delta I = 10\,\text{A}$, the transient lasts $t = 100\,\text{ns}$, and $\Delta V_{max} = 50\,\text{mV}$, then:

$$C \geq \frac{\Delta I \cdot t}{\Delta V} = \frac{10 \times 100 \times 10^{-9}}{50 \times 10^{-3}} = 20\,\mu\text{F}$$

Different capacitor values cover different frequency decades. Bulk electrolytics (100–1000 µF, mounted near the VRM) handle slow load steps where regulator bandwidth is insufficient. MLCC ceramics (100 nF–10 µF, scattered across the board near loads) handle mid-frequency switching transients. Small ceramics (1–10 nF) placed directly at IC power pins — or inside the package itself — handle the fastest edges. Each layer targets the impedance of the PDN at a specific frequency range; the goal is a flat $|Z_{PDN}(f)|$ below the target impedance across the entire operating bandwidth.

### Power Integrity

Power integrity (PI) is the discipline of ensuring every power node stays within voltage tolerance under all operating conditions. A PI failure looks, from software, like random machine check exceptions, ECC-corrected or uncorrected memory errors, PCIe link retrains, or spontaneous reboots under load — symptoms that are frequently misdiagnosed as software bugs or bad RAM.

---

## How It Works

### The Buck Converter in Detail

For a synchronous buck converter with switching frequency $f_{sw}$, inductor $L$, and duty cycle $D$:

**Current ripple** through the inductor during on-time $t_{on} = D/f_{sw}$:

$$\Delta I_L = \frac{(V_{in} - V_{out}) \cdot D}{f_{sw} \cdot L} = \frac{V_{out}(1 - D)}{f_{sw} \cdot L}$$

Both expressions are equal at steady state — this is the volt-second balance condition. Solving either for $V_{out}$ recovers $V_{out} = D \cdot V_{in}$.

**Why higher $f_{sw}$ allows smaller passive components**: for a fixed $\Delta I_L$ target, $L \propto 1/f_{sw}$. Doubling the switching frequency halves the required inductance and capacitance. This is why modern CPU VRMs run at 300 kHz–3 MHz rather than the 50–100 kHz common in older designs — silicon FET switching losses scale as $P_{sw} \propto f_{sw}$, so there is a design tradeoff between passive component size and switching losses.

**Minimum inductance for continuous conduction mode (CCM)**: the converter enters discontinuous conduction mode (DCM) when $\Delta I_L/2 > I_{load}$. For CCM at minimum load $I_{min}$:

$$L_{min} = \frac{V_{out}(1-D)}{2 f_{sw} \cdot I_{min}}$$

A controller entering DCM changes its small-signal transfer function, which can destabilize the feedback loop — this is why converters have a minimum load specification.

### Reactive Power and Why Capacitors Don't Burn
