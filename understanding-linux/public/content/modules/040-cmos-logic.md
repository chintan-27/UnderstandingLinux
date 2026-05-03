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

## Why This Matters

Every computation your CPU performs bottoms out in transistors switching between two states. The reason a 5 GHz CPU cannot become a 50 GHz CPU by decree is not software: propagation delay through chains of CMOS gates sets a hard physical ceiling on clock frequency. The reason your laptop dissipates more heat under load is not incidental: dynamic power grows quadratically with clock frequency, so doubling the clock nearly quadruples the heat output. The reason Spectre-class attacks are possible is that different circuit paths through logic have different delays — and those timing differences are measurable from software. None of these facts are accessible without a model of how gates are built.

---

## Core Concepts

### The CMOS Inverter: Complementary Switching

A CMOS inverter uses one pMOS transistor (pull-up) and one nMOS transistor (pull-down). Their gates share the input; their drains share the output.

- When $V_{in} = V_{DD}$: nMOS gate-to-source voltage $V_{GS} = V_{DD} > V_{th,n}$, so nMOS conducts and pulls output to GND. Simultaneously, pMOS gate-to-source voltage $V_{GS} = 0$, which is not negative enough to exceed its threshold, so pMOS is OFF.
- When $V_{in} = 0$: pMOS has $V_{GS} = -V_{DD}$, which exceeds $|V_{th,p}|$ in magnitude, so pMOS conducts and pulls output to $V_{DD}$. nMOS has $V_{GS} = 0$, so it is OFF.

The invariant: **exactly one transistor conducts at any steady-state input.** If both conducted simultaneously, $V_{DD}$ would be shorted to GND through a resistive path — continuous DC current, linear power dissipation, and thermal destruction at scale. If both were OFF, the output would float to an undefined voltage; the downstream gate's behavior would be indeterminate.

This complementary structure is the entire reason the technology is called **Complementary MOS**.

### NAND and NOR: Duality Made Physical

Every CMOS gate has two networks between the output node and the rails:

- **Pull-down network (PDN):** nMOS transistors connecting output to GND
- **Pull-up network (PUN):** pMOS transistors connecting output to $V_{DD}$

The PDN and PUN must be **duals** of each other: wherever the PDN has transistors in series, the PUN has transistors in parallel, and vice versa. This duality guarantees that for every input combination, exactly one network conducts — preserving the no-short, no-float invariant from the inverter.

The duality is De Morgan's theorem instantiated in silicon:

$$\overline{A \cdot B} = \bar{A} + \bar{B}$$

Series nMOS (AND in the PDN) forces parallel pMOS (OR in the PUN), producing NAND output. Parallel nMOS (OR in the PDN) forces series pMOS (AND in the PUN), producing NOR output.

**2-input NAND:**
- PDN: nMOS $A$ and $B$ in **series** — output pulled LOW only when both $A=1$ AND $B=1$
- PUN: pMOS $A$ and $B$ in **parallel** — output pulled HIGH when either $A=0$ OR $B=0$

**2-input NOR:**
- PDN: nMOS $A$ and $B$ in **parallel** — output pulled LOW when either input is HIGH
- PUN: pMOS $A$ and $B$ in **series** — output pulled HIGH only when both inputs are LOW

### Why NAND Gates Dominate Standard Cell Libraries

pMOS carrier mobility is roughly $\mu_p \approx 0.4\,\mu_n$ — holes move slower than electrons. To achieve the same drive current as an nMOS transistor, a pMOS transistor must be approximately $2\times$ wider, consuming more area and adding more capacitance to the driving node.

In a NOR gate, the pMOS transistors are in **series**. Series resistance adds: two pMOS in series presents roughly $2R_p \approx 4R_n$ of effective resistance. The RC delay through the pull-up network is proportionally worse.

In a NAND gate, the pMOS transistors are in **parallel**. Parallel resistance divides: two pMOS in parallel gives $R_p/2 \approx R_n$. The pull-up penalty is absorbed.

This is why logic synthesis tools (Synopsys Design Compiler, Cadence Genus) map nearly all combinational logic to NAND trees. Inverting logic is not an approximation — it is the architecturally correct choice given the physics.

### Propagation Delay and Contamination Delay

A gate switches in finite time. Two timing parameters bound that transition:

- **Propagation delay** $t_{pd}$: worst-case time from any input changing to the output reaching its final valid logic level. Used to determine whether a circuit meets timing.
- **Contamination delay** $t_{cd}$: best-case time before the output *begins* to change. Used to verify that data does not corrupt a downstream latch before it should.

For a combinational logic path, delay accumulates through gate stages:

$$t_{pd,\text{circuit}} = \sum_{i \in \text{critical path}} t_{pd,i}$$

$$t_{cd,\text{circuit}} = \sum_{i \in \text{short path}} t_{cd,i}$$

The critical path — the longest $t_{pd}$ sum from any input to any output — directly sets the maximum clock frequency:

$$f_{\max} = \frac{1}{t_{pd,\text{circuit}}}$$

Pipelining inserts registers to cut a long combinational path into shorter segments. If a single path has $t_{pd} = 500\,\text{ps}$ and you insert a register halfway through each segment, the critical path per stage drops toward $250\,\text{ps}$, allowing $f_{\max} \approx 4\,\text{GHz}$ instead of $2\,\text{GHz}$. The tradeoff is latency: the result now takes more clock cycles to emerge.

### Fanout and Capacitive Loading

**Fanout** is the number of gate inputs driven by a single output. Each gate input is a transistor gate terminal — a capacitor. Total load capacitance is approximately:

$$C_{load} = C_{wire} + \sum_{j=1}^{N} C_{in,j}$$

Driving a larger capacitance requires more charge to move the output voltage by $\Delta V$, since $Q = C \Delta V$. The time to deliver that charge through a transistor with effective resistance $R_{on}$ is the RC time constant:

$$t_{pd} \approx 0.69 \, R_{on} \cdot C_{load}$$

Doubling fanout approximately doubles $C_{load}$ and doubles the gate's contribution to $t_{pd}$. Synthesis tools insert **buffers** (two inverters in series, or a dedicated buffer cell with large transistors and low $R_{on}$) to restore drive strength when fanout is high enough to push the gate onto the critical path.

### Dynamic Power

Every time a gate output switches from LOW to HIGH, the load capacitance charges from GND to $V_{DD}$ through the pMOS pull-up network. The energy drawn from the supply is $CV_{DD}^2$; half is stored in the capacitor, half is dissipated in the pMOS resistance. On the HIGH-to-LOW transition, the stored $\frac{1}{2}CV_{DD}^2$ is dissipated in the nMOS pull-down. Per full switching cycle, total energy dissipated is $CV_{DD}^2$.

Not every node switches every clock cycle. The **activity factor** $\alpha \in [0,1]$ is the probability that a node switches in a given cycle. Average dynamic power:

$$P_{dynamic} = \alpha C V_{DD}^2 f$$

The quadratic dependence on $V_{DD}$ is the physical basis for **DVFS (Dynamic Voltage and Frequency Scaling)**. The kernel's `cpufreq` subsystem exploits this: dropping $V_{DD}$ from $1.2\,\text{V}$ to $0.9\,\text{V}$ reduces dynamic power by a factor of $(1.2/0.9)^2 = 1.78$, independent of frequency. Simultaneously lowering $f$ compounds the savings linearly.

### Static (Leakage) Power

At sub-20 nm gate lengths, the potential barrier between source and drain in an OFF transistor is thin enough for quantum-mechanical tunneling. A small **subthreshold leakage current** flows even when $V_{GS} < V_{th}$. There is also gate oxide tunneling current through the dielectric. Both are independent of switching activity:

$$P_{static} = I_{leakage} \cdot V_{DD}$$

In modern processes, $P_{static}$ can rival $P_{dynamic}$ even in active circuits. It is the reason modern SoCs implement **power gating** — physically disconnecting $V_{DD}$ from idle logic blocks — rather than simply halting clocks.

**Pseudo-nMOS gates** replace the entire pMOS pull-up network with a single weak pMOS transistor whose gate is permanently tied to GND (always ON). When the PDN pulls the output LOW, a continuous DC path from $V_{DD}$ through the weak pMOS to GND exists for as long as the output is LOW — a permanent static dissipation. The benefit is reducing transistor count for complex multi-input logic (a 4-input pseudo-nMOS NOR uses 5 transistors instead of 8). The cost makes it unsuitable for any high-density, low-power design.

---

## How It Works

### Transistor-Level Gate Construction

**2-input NAND (4 transistors):**

```
        VDD
       /   \
   [pA]   [pB]        ← parallel pMOS (gates driven by A, B)
       \   /
        Y  (output)
        |
       [nA]
