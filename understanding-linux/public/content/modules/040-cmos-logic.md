---
id: 40
title: "CMOS logic"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Core Concepts
### Why CMOS Reduces Static Power
In a MOSFET the channel forms when the gate‑source voltage exceeds the threshold voltage \(V_{TH}\).  
An **nMOS** conducts for \(V_{GS}>+V_{THn}\); a **pMOS** conducts for \(V_{GS}< -V_{THp}\) (note the negative sign).  
If we connect an nMOS and a pMOS in series between \(V_{DD}\) and GND and drive their gates with the same signal, **one device is always off** for any static input voltage:
* For \(V_{IN}=0\): nMOS off (\(V_{GS}=0<V_{THn}\)), pMOS on (\(V_{GS}=-V_{DD}<-V_{THp}\)).
* For \(V_{IN}=V_{DD}\): nMOS on, pMOS off.  

Thus there is **no direct path from \(V_{DD}\) to GND** in steady state, eliminating static (leakage‑free) current. Power is drawn only when the network switches (charging/discharging capacitances) and from short‑circuit currents during the brief overlap when both transistors are partially on.

### MOS Transistor First‑Order Model
In saturation:
\[
I_{DS}= \frac{1}{2}\mu C_{ox}\frac{W}{L}(V_{GS}-V_{TH})^{2}(1+\lambda V_{DS})
\]
* \(\mu\) – carrier mobility (\(\mu_n\approx 2\mu_p\) for Si).  
* \(C_{ox}\) – oxide capacitance per unit area.  
* \(W/L\) – aspect ratio (design knob).  
* \(\lambda\) – channel‑length modulation.

The **transconductance** \(g_m=\partial I_{DS}/\partial V_{GS}\) scales linearly with \(W/L\); increasing width lowers resistance but raises gate capacitance \(C_G\approx C_{ox}WL\).

### Static CMOS Gate Structure
A static CMOS gate consists of:
* **Pull‑Down Network (PDN)** – nMOS transistors that connect output to GND when the logic function is true.  
* **Pull‑Up Network (PUN)** – pMOS transistors that connect output to \(V_{DD}\) when the logic function is false.  

By construction, PUN and PDN are **dual networks**: for every series nMOS in the PDN there is a parallel pMOS in the PUN, guaranteeing that the output is never left floating nor shorted.

### Key Figures of Merit
* **Switching threshold** \(V_M\) – input voltage where \(V_{OUT}=V_{IN}\); determines noise margins.  
* **Logical effort** \(g\) – ratio of input capacitance of a gate to that of an inverter delivering the same drive strength.  
* **Parasitic delay** \(p\) – delay of the gate driving an identical copy (fanout = 1).  
* **Propagation delay** (first‑order):  
\[
t_{pd}= \tau \bigl(g\cdot h + p\bigr),\qquad 
\tau=\frac{R_{eq}C_{IN}}{}
\]
where \(h=C_{LOAD}/C_{IN}\) is the electrical effort (fanout).

---

## How It Works
### CMOS Inverter – Voltage Transfer Curve
When \(V_{IN}\) sweeps from 0 to \(V_{DD}\):
1. **Low input** (\(V_{IN}<V_{THn}\)): nMOS off, pMOS linear → \(V_{OUT}\approx V_{DD}\).  
2. **Transition region**: both transistors in saturation; equate currents:  
\[
\frac{1}{2}\mu_n C_{ox}\frac{W_n}{L}(V_{IN}-V_{THn})^{2}
=
\frac{1}{2}\mu_p C_{ox}\frac{W_p}{L}(V_{DD}-V_{IN}-|V_{THp}|)^{2}
\]
Solving for \(V_{IN}=V_M\) gives:
\[
V_M=\frac{V_{DD}-|V_{THp}|\sqrt{\frac{\mu_p W_p}{\mu_n W_n}}}
{1+\sqrt{\frac{\mu_p W_p}{\mu_n W_n}}}
\]
Choosing \(W_p/W_n=\mu_n/\mu_p\approx2\) makes \(V_M\approx V_{DD}/2\), maximizing noise margins.

### Dynamic Power Derivation
Each switching event charges the load capacitance \(C_L\) from 0 to \(V_{DD}\) (or vice‑versa). Energy drawn from the supply per transition:
\[
E_{sw}= \int_0^{V_{DD}} i(t)V_{DD}\,dt = C_{LL}V_{DD}^{2}
\]
Only half of this energy is stored in the capacitor; the other half is dissipated in the resistive channel. With a switching activity factor \(\alpha\) (probability of a transition per clock) and frequency \(f\):
\[
\boxed{P_{dyn}= \alpha C_{L}V_{DD}^{2}f}
\]
Often written with \(\alpha=1/2\) for a random data stream, yielding the familiar \(\tfrac12 C V^{2} f\).

### Short‑Circuit Power
During the transition both nMOS and pMOS are partially on, creating a temporary \(V_{DD}\)-to‑GND path. Approximate short‑circuit current:
\[
I_{SC}\approx \frac{V_{DD}}{2}\bigl(g_{mn}+g_{mp}\bigr)
\]
If the input rise/fall time is \(t_{rf}\), the short‑circuit energy per transition is \(E_{SC}\approx I_{SC}V_{DD}t_{rf}\). Hence
\[
P_{SC}= f\,E_{SC}= f\,I_{SC}V_{DD}t_{rf}
\]
Short‑circuit power becomes significant when \(t_{rf}\) approaches the intrinsic gate delay.

### Leakage Power (Deep‑Submicron)
* **Subthreshold leakage**: \(I_{sub}\propto e^{-(V_{GS}-V_{TH})/nV_T}\).  
* **Gate oxide leakage**: \(I_{gox}\propto V_{ox}e^{-\phi_{B}/V_{ox}}\).  
Total standby power:
\[
P_{leak}= V_{DD}\bigl(I_{sub}+I_{gox}\bigr)N_{tran}
\]
where \(N_{tran}\) is the number of transistors. Leakage grows exponentially as \(V_{TH}\) is lowered for performance, motivating multi‑threshold CMOS (MTCMOS) and power gating.

### NAND Gate – Operation & Timing
*PDN*: two nMOS in series → conducts only when **both** inputs are high.  
*PUN*: two pMOS in parallel → conducts when **any** input is low.

Effective resistance of the series stack (identical widths) is roughly \(2R_{eqn}\); the parallel pMOS presents \(\tfrac12R_{eqp}\). Logical effort for a 2‑input NAND:
\[
g_{NAND}= \frac{C_{in,NAND}}{C_{in,inv}} = \frac{(W_n+W_p)}{(W_n+W_p)}_{\text{inv}} \times
\frac{2}{1}= \frac{4}{3}
\]
(derivation: input sees one nMOS + one pMOS; inverter sees same; but the nMOS must be twice as wide to match pull‑down strength, giving extra capacitance.)

Propagation delay for fanout \(h\):
\[
t_{pd}= \tau\bigl(g_{NAND}h + p_{NAND}\bigr),\quad
p_{NAND}\approx 2
\]
(derived from the extra RC of the series nMOS).

---

## Worked Examples
### Example 1: Symmetrical CMOS Inverter (45 nm PTM)
**Given**  
* \(V_{DD}=1.0\text{ V}\)  
* \(\mu_n C_{ox}=200\ \mu\text{A/V}^2\) , \(\mu_p C_{ox}=100\ \mu\text{A/V}^2\)  
* \(L=45\text{ nm}\)  
* Target load \(C_L=10\text{ fF}\) (typical fanout of 4)  
* Desired \(t_{rise}\approx t_{fall}\)

**Step 1 – Width ratio for equal rise/fall**  
Rise resistance \(\approx \frac{L}{\mu_p C_{ox}W_p}\); fall resistance \(\approx \frac{L}{\mu_n C_{ox}W_n}\).  
Set equal:
\[
\frac{1}{\mu_p W_p}= \frac{1}{\mu_n W_n}\;\Rightarrow\;
\frac{W_p}{W_n}= \frac{\mu_n}{\mu_n}=2
\]
Choose \(W_n=120\text{ nm}\) → \(W_p=240\text{ nm}\).

**Step 2 – Equivalent resistance**  
\[
R_{eqn}= \frac{L}{\mu_n C_{ox}W_n}
= \frac{45\times10^{-9}}{200\times10^{-6}\times120\times10^{-9}}
\approx 1.875\ \text{k}\Omega
\]
\(R_{eqp}=2R_{eqn}\) (because mobility half) → \(3.75\ \text{k}\Omega\).  
For worst‑case (rise) use \(R_{eqp}\).

**Step 3 – Propagation delay**  
\[
t_{p}=0.69\,R_{eq}C_{L}
=0.69\times3.75\times10^{3}\times10\times10^{-15}
\approx 26\text{ ps}
\]
Matches typical inverter delay in 45 nm.

### Example 2: 2‑Input NAND Gate – Logical Effort & Delay
**Given** same device parameters as above, \(W_n=120\text{ nm}\), \(W_p=240\text{ nm}\).  
Load: \(C_L=20\text{ fF}\) (fanout = 4 after input capacitance).

**Input capacitance**  
Each transistor contributes \(C_{ox}WL\).  
\(C_{in}=C_{ox}(W_nL+W_pL)=C_{ox}L(W_n+W_p)=
8.5\text{ fF/µm}^2\times45\text{ nm}\times(120+240)\text{ nm}
\approx 7.4\text{ fF}\).

**Logical effort** (as derived): \(g=4/3\).  
**Electrical effort**: \(h=C_L/C_{in}=20/7.4\approx2.7\).  
**Parasitic delay** for NAND: \(p\approx2\) (two series nMOS).  
Assume \(\tau=R_{eqn}C_{IN}=1.875\text{k}\Omega\times7.4\text{fF}\approx13.9\text{ps}\).

\[
t_{pd}= \tau\bigl(g h + p\bigr)
=13.9\text{ps}\times\Bigl(\frac{4}{3}\times2.7 + 2\Bigr)
\approx13.9\text{ps}\times(3.6+2)=78\text{ps}
\]

### Example 3: CMOS NOR Gate – Sizing for Balanced Delay
**Goal**: make rise and fall times equal.  
*PDN*: two nMOS **in parallel** → effective resistance \(R_{eqn}/2\).  
*PUN*: two pMOS **in series** → resistance \(2R_{eqp}\).

Set \(R_{eqn}/2 = 2R_{eqp}\) → \(\frac{R_{eqn}}{R_{eqp}} =4\).  
Since \(R_{eq}\propto 1/(\mu W)\) and \(\mu_n\approx2\mu_p\):
\[
\frac{1/(2\mu_n W_n)}{1/(2\mu_p W_p)}=4
\;\Rightarrow\;
\frac{\mu_p W_p}{\mu_n W_n}=4
\;\Rightarrow\;
\frac{W_p}{W_n}=4\frac{\mu_n}{\mu_p}=8
\]
Pick \(W_n=100\text{ nm}\) → \(W_p=800\text{ nm}\).  
Resulting input capacitance rises, but rise/fall delays become matched (~50 ps each for the same load as Example 2).

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Ignoring body effect in stacked transistors** | When nMOS are stacked, the source of the upper device is not at GND; its \(V_{SB}>0\) raises its \(V_{TH}\) by \(\Delta V_{TH}= \gamma(\sqrt{V_{SB}+2\phi_F}-\sqrt{2\phi_F})\). | The effective pull‑down resistance increases, causing slower fall‑time and logic‑level degradation. |
| 2 | **Assuming equal rise/fall without width scaling** | \(\mu_n\approx2\mu_p\); equal widths give \(R_{p}\approx2R_{n}\). | Rise is slower than fall → skewed switching threshold, reduced noise margin, and possible latch‑up in noisy environments. |
| 3 | **Neglecting leakage in sub‑100 nm nodes** | Subthreshold current scales as \(e^{-V_{TH}/(nV_T)}\); a 100 mV reduction in \(V_{TH}\) can increase leakage by \(10\times\). | Standby power dominates total power in sleep modes, invalidating designs that only consider dynamic power. |
| 4 | **Using minimum‑size transistors for high fanout** | Delay scales with \(g h\); minimum size gives large input capacitance but weak drive, inflating \(h\). | Excessive propagation delay, possible voltage droop on the output, and failure to meet timing budgets. |
| 5 | **Overlooking short‑circuit power in high‑frequency designs** | Short‑circuit energy \(\propto t_{rf}\); at multi‑GHz clocks \(t_{rf}\) can be a sizable fraction of the period. | Underestimation of total power, leading to thermal budget violations and unexpected throttling. |

---

## Exercises
### Easy
1. **Inverter switching threshold** – Using the parameters from Example 1 (\(\mu_nC_{ox}=200\mu A/V^2\), \(\mu_pC_{ox}=100\mu A/V^2\), \(V_{THn}=0.3\text{ V}\), \(V_{THp}=-0.3\text{ V}\)), compute \(V_M\) for \(W_n=120\text{ nm}\), \(W_p=240\text{ nm}\).  
2. **Logical effort of a NOR2** – Derive the logical effort expression for a 2‑input NOR gate (parallel nMOS, series pMOS) and evaluate it for the same width ratio as the inverter.

### Medium
3. **Design a 4‑input NAND** – Target rise/fall symmetry (as in Example 1). Determine the required \(W_p/W_n\) ratio and compute the logical effort \(g_{NAND4}\). Estimate the propagation delay driving a fanout of 6 (\(C_L=30\text{ fF}\)).  
4. **Power budget of a ring oscillator** – Build an 11‑stage inverter ring (odd number to oscillate). Using \(C_L=15\text{ fF}\) per stage, \(V_{DD}=1.0\text{ V}\), \(f=1\text{ GHz}\), \(\alpha=0.5\), and the short‑circuit current approximation \(I_{SC}=0.2\text{ mA}\) per transition, calculate:  
   a) Dynamic power \(P_{dyn}\).  
   b) Short‑circuit power \(P_{SC}\).  
   c) Total power and temperature rise assuming a thermal resistance of \(0.5\ \text{W/°C}\).

### Hard
5. **Leakage‑dominant sleep mode** – For a 65 nm bulk CMOS process, subthreshold leakage per minimum‑size transistor is \(I_{sub0}=10\text{ nA}\) at \(V_{TH}=0.35\text{ V}\). If the threshold is lowered by \(50\text{ mV}\) for performance, estimate the increase in leakage per transistor. Then, for a block containing \(10^{6}\) transistors, compute the standby power at \(V_{DD}=0.9\text{ V}\). Discuss two architectural techniques (power gating, multi‑threshold assignment) to reduce this leakage by at least a factor of 10, and quantify the resulting power.

### Very Hard (Optional)
6. **Timing verification with logical effort** – Given a critical path consisting of: INV → NAND2 → NOR2 → INV, with fanouts \(h=[4,3,2,4]\) respectively, compute the worst‑case path delay using the logical effort method. Then, perform a simple SPICE‑level verification by writing a Verilog testbench that instantiates the gate primitives (using the CMOS switch‑level model) and measures the 50 % point delay. Explain any discrepancy between the analytical and simulated results.

---

## Linux Connection
### Accessing the Real‑Time Clock (CMOS RAM) from Linux
The x86 CMOS RAM (128 bytes) is accessed via the **Real‑Time Clock (RTC)** driver. The kernel exposes it through:

| Interface | Path | Description |
|-----------|------|-------------|
| Character device | `/dev/rtc` (or `/dev/rtc0`) | Provides ioctl‑based access (RTC\_RD\_TIME, RTC\_SET\_TIME). |
| Sysfs attributes | `/sys/class/rtc/rtc0/` | Contains `date`, `since_epoch`, `max_raw_frequency`, etc. |
| Platform device | `CONFIG_RTC_CLASS`, `CONFIG_RTC_DRV_CMOS` | Kernel config options that enable the CMOS RTC driver. |

#### Reading the CMOS RAM via `/dev/rtc`
```bash
# Show current RTC time in seconds since epoch
cat /sys/class/rtc/rtc0/since_epoch
# Output: 1730563200   (example)
```
The same information can be retrieved with the `hwclock` utility:
```bash
hwclock --show   # reads from /dev/rtc and prints human‑readable time
```

#### Writing a new clock value (requires root)
```bash
sudo hwclock --set --date="2024-11-03 12:00:00"
# or via ioctl from a C program:
#include <linux/rtc.h>
#include <sys/ioctl.h>
#include <fcntl.h>
#include <time.h>
int fd = open("/dev/rtc", O_RDONLY);
struct rtc_time rtc;
ioctl(fd, RTC_RD_TIME, &rtc);   // read
rtc.tm_year = 124;               // years since 1900
ioctl(fd, RTC_SET_TIME, &rtc);  // write
close(fd);
```

#### Direct register access (educational, needs root)
The CMOS registers are mapped to I/O ports `0x70` (address) and `0x71` (data). Linux provides `/dev/port` (or `iopl/iopl` via `ioperm`) for raw port I/O, but a safer way is to use the `devmem2` utility to read the memory‑mapped RTC on some platforms:
```bash
sudo devmem2 0x70 w   # write address register (e.g., 0x0A for Register A)
sudo devmem2 0x71 w   # read data register
```
On modern x86 the RTC is still port‑mapped, so the above works if the kernel allows port I/O (`CONFIG_DEVMEM` and proper privileges).

### Power‑Management Tools that Rely on CMOS‑level Concepts
* **`powertop`** – Shows which drivers/components cause wakeups and suggests tunings.  
  ```bash
  sudo powertop --auto-tune   # apply all suggested tunings
  ```
* **`tlp`** – Advanced power‑saving script for laptops; adjusts CPU frequency scaling, disk spindown, Wi‑Fi power saving, etc.  
  ```bash
  sudo tlp stat   # display current power settings
  ```
* **`perf` with RAPL** – Intel Running Average Power Limit interface lets you measure energy directly from the CPU.  
  ```bash
  sudo perf stat -e power/energy-pkg/ sleep 5   # reports Joules consumed in 5 s
  ```
* **`rtcwake`** – Suspends the system and wakes it after a given interval using the RTC alarm.  
  ```bash
  sudo rtcwake -m mem -s 30   # suspend to RAM, wake after 30 s
  ```

### Kernel Configuration Highlights
```
CONFIG_RTC_CLASS=y
CONFIG_RTC_DRV_CMOS=y
CONFIG_PM=y
CONFIG_PM_SLEEP=y
CONFIG_CPU_FREQ=y
CONFIG_CPU_FREQ_GOV_PERFORMANCE=y
CONFIG_CPU_FREQ_GOV_POWERSAVE=y
CONFIG_INTEL_IDLE=y
CONFIG_X86_PPLATFORM=y   # RAPL support
```
These options enable the CMOS RTC driver, generic power management (`pm_*`), CPU frequency scaling, and the RAPL interface that exposes the same energy‑metering principles discussed in the CMOS power section.

---

## Why This Matters
CMOS logic is the **foundation of every digital system** because it converts the physical properties of MOSFETs into a logic family that ideally draws **zero static power** and scales predictably with frequency and load. The quantitative models we derived—switching threshold, logical effort, dynamic and short‑circuit power, leakage—are not abstract theory; they directly dictate:

* **Battery life** of mobile devices (dynamic power dominates active use; leakage dominates
