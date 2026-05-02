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

Every computation your CPU performs reduces to electrons charging and discharging capacitors through transistors. CMOS gate structure directly sets three hard physical limits you will encounter as a systems programmer:

1. **Frequency ceiling**: clock speed stalled near 4 GHz around 2004 because dynamic power scales as $P \propto f V_{DD}^2$, and voltage could not be reduced fast enough to compensate.
2. **Latency floor**: `mmap`, cache miss penalties, and pipeline depths all have lower bounds set by how fast capacitances charge through transistor resistance.
3. **Thermal throttling**: the kernel's `cpufreq` subsystem, DVFS (dynamic voltage and frequency scaling), and per-core power gating exist because static leakage current in sub-65nm nodes makes it physically necessary to shut off idle silicon.

If you cannot reason about gate delay, fanout, and the $CV^2f$ power model, you cannot understand why these mechanisms exist — only that they do.

---

## Core Concepts

### The CMOS Inverter: Complementary Switching

A CMOS inverter connects one pMOS (pull-up) and one nMOS (pull-down) in series between $V_{DD}$ and GND. Both gates are tied to the input; both drains are tied to the output.

- **nMOS** conducts when $V_{GS} > V_{tn}$ (gate HIGH). Electrons are the carrier. Fast.
- **pMOS** conducts when $V_{GS} < -V_{tp}$ (gate LOW). Holes are the carrier. Slower by roughly $2\times$.

When input $A = 1$: nMOS ON, pMOS OFF → output pulled to GND → $Y = 0$.  
When input $A = 0$: pMOS ON, nMOS OFF → output pulled to $V_{DD}$ → $Y = 1$.

The structural consequence: in steady state, one transistor is always OFF. There is no resistive path from $V_{DD}$ to GND, so DC current is (ideally) zero. Power is only consumed during the switching transient when both transistors are momentarily conducting — this is the root of dynamic power dissipation.

### NAND and NOR: Series/Parallel Duality

Every static CMOS gate is built from two complementary networks:

- **Pull-down network (PDN)**: nMOS transistors. Conducts when output should be LOW.
- **Pull-up network (PUN)**: pMOS transistors. Conducts when output should be HIGH.

The duality rule: wherever the PDN has transistors in **series**, the PUN has them in **parallel**, and vice versa. This guarantees that when one network conducts, the other is open — no $V_{DD}$-to-GND short in any input combination.

**2-input NAND** ($Y = \overline{AB}$):
- PDN: two nMOS in **series** — both A and B must be HIGH to pull Y low.
- PUN: two pMOS in **parallel** — either A or B LOW is sufficient to pull Y high.

**2-input NOR** ($Y = \overline{A+B}$):
- PDN: two nMOS in **parallel** — either A or B HIGH pulls Y low.
- PUN: two pMOS in **series** — both A and B must be LOW to pull Y high.

The series pMOS stack in NOR is the problem: because $\mu_p \approx \frac{1}{2}\mu_n$, each pMOS already switches slowly, and stacking them in series compounds this. A 4-input NOR has four slow pMOS in series in its pull-up path, making it significantly weaker than a 4-input NAND with four fast nMOS in series in its pull-down path. Synthesis tools default to NAND-centric logic for exactly this reason.

### Fanout and Capacitive Load

When one gate output drives $n$ gate inputs, each input presents an input capacitance $C_{in}$ (gate oxide capacitance plus interconnect). The total load the driving gate must charge or discharge is:

$$C_{load} = n \cdot C_{in}$$

The output voltage rises or falls as this capacitance charges through the ON transistor's effective resistance $R_{eff}$. The propagation delay scales as:

$$t_{pd} \propto R_{eff} \cdot C_{load} = R_{eff} \cdot n \cdot C_{in}$$

Doubling fanout approximately doubles delay. Standard-cell libraries specify a maximum fanout (typically 4–16 depending on drive strength) beyond which a buffer must be inserted. High-fanout nets — like clock trees or reset signals — require buffered trees specifically to keep each buffer's $C_{load}$ bounded.

### Propagation Delay and Contamination Delay

Every gate and combinational path is characterized by two timing bounds:

| Symbol | Name | Meaning |
|--------|------|---------|
| $t_{pd}$ | Propagation delay | Output is **guaranteed valid** after this time (worst case) |
| $t_{cd}$ | Contamination delay | Output **may begin to change** after this time (best case) |

For a path through $k$ gates:

$$t_{pd,\text{path}} = \sum_{i=1}^{k} t_{pd,i} \qquad t_{cd,\text{path}} = \sum_{i=1}^{k} t_{cd,i}$$

The **critical path** is the path with maximum $t_{pd}$ — it sets the minimum clock period and therefore the maximum operating frequency:

$$f_{max} = \frac{1}{t_{pd,\text{critical}} + t_{setup} + t_{skew}}$$

The **short path** sets $t_{cd}$ for the circuit. In a synchronous design, the short path must satisfy a hold-time constraint: outputs must not change so fast that a receiving flip-flop captures a spurious value. Violating hold time causes functional failures that do not go away when you slow the clock — the opposite behavior from a setup violation.

### Dynamic and Static Power

**Dynamic power** dissipates as charge moves onto and off of load capacitances during switching:

$$P_{dynamic} = \alpha C V_{DD}^2 f$$

where:
- $\alpha \in [0,1]$ is the **activity factor**: the probability a node switches in a given clock cycle.
- $C$ is the total switched capacitance (gate + wire).
- $V_{DD}$ is supply voltage.
- $f$ is clock frequency.

The $V_{DD}^2$ dependence is why voltage reduction is the most effective power-reduction lever. Halving $V_{DD}$ reduces dynamic power by $4\times$ — but it also slows transistors, which is why DVFS trades frequency for power.

**Static power** flows even when no signals switch, due to subthreshold leakage and gate-oxide tunneling:

$$P_{static} = I_{leakage} \cdot V_{DD}$$

In processes above ~130nm, $I_{leakage}$ is negligible. Below ~65nm, transistor gate oxide is only a few atomic layers thick, and leakage current becomes comparable to dynamic current. This is why modern CPUs implement fine-grained power gating: unused execution units are physically disconnected from $V_{DD}$ to eliminate their leakage contribution.

---

## How It Works

### Transistor-Level Gate Construction

A 2-input NAND built from four transistors, showing the series/parallel structure:

```
         VDD
          |
    ┌─[pMOS A]─┐
    │           ├──── Y
    └─[pMOS B]─┘
                |
           [nMOS A]
                |
           [nMOS B]
                |
               GND
```

Truth table — verify the PDN series path:

| A | B | nMOS-A | nMOS-B | PDN (series) | PUN (parallel) | Y |
|---|---|--------|--------|:------------:|:--------------:|---|
| 0 | 0 | OFF    | OFF    | OPEN         | CLOSED (both)  | 1 |
| 0 | 1 | OFF    | ON     | OPEN         | CLOSED (A)     | 1 |
| 1 | 0 | ON     | OFF    | OPEN         | CLOSED (B)     | 1 |
| 1 | 1 | ON     | ON     | CLOSED       | OPEN           | 0 |

Only with both inputs HIGH does the series PDN form a complete path to GND. This confirms $Y = \overline{AB}$.

### Why NAND is Preferred Over NOR

Transistor current drive is proportional to carrier mobility times the width-to-length ratio:

$$I_D \propto \mu \cdot \frac{W}{L} \cdot \left(V_{GS} - V_t\right)$$

Since $\mu_n \approx 2\mu_p$, a pMOS transistor must be sized roughly $2\times$ wider than an nMOS transistor to deliver the same drive current. In a NAND gate, pMOS transistors are in the PUN in **parallel** — each sees the full $V_{DD}$ and they do not interact resistively. In a NOR gate, pMOS transistors are in **series** in the PUN: their resistances add, and to achieve equivalent drive strength each must be sized up by an additional factor proportional to the number of series transistors. A 4-input NOR gate's PUN may require pMOS transistors $8\times$ wider than the minimum, consuming substantial area and increasing parasitic capacitance. The same logic in NAND form has no such problem in the PDN because nMOS transistors are both faster and require less upsizing for series stacks.

### Calculating Critical Path Delay

Consider this three-gate combinational circuit:

```
A ──┬──[AND2]──┬──[OR2]──[AND2]── Z
B ──┘          │
C ─────────────┘
```

Assume each gate has $t_{pd} = 100\,\text{ps}$, $t_{cd} = 60\
