---
id: 30
title: "Network analysis"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Core Concepts
### Network Analysis Foundations
Network analysis treats a circuit as a set of interconnected **nodes** (junctions) and **branches** (elements). The goal is to determine unknown node voltages or branch currents by applying conservation laws that follow directly from Maxwell’s equations under the lumped‑element assumption:

* **Kirchhoff’s Current Law (KCL)** – The algebraic sum of currents leaving a node equals zero because charge cannot accumulate at a point (continuity equation ∇·J = −∂ρ/∂t → ∑I = 0 for a node).  
* **Kirchhoff’s Voltage Law (KVL)** – The algebraic sum of voltage drops around any closed loop equals zero because the electrostatic field is conservative (∮ E·dl = 0).

From these two laws we can write a linear system **A·x = b**, where **x** contains the unknown node voltages (nodal analysis) or loop currents (mesh analysis). Solving the system yields the complete DC operating point; AC analysis follows by replacing impedances with complex values and solving the same linear system in the frequency domain.

### Nodal Analysis Procedure
1. **Reference node** – Choose a ground node (0 V). All other node voltages are measured relative to it.  
2. **Unknowns** – For *N* nodes, there are *N‑1* unknown voltages.  
3. **KCL at each unknown node** – Express each branch current in terms of node voltages using Ohm’s law (I = (V_i−V_j)/Z).  
4. **Assemble the conductance matrix** – The coefficient of V_i in the KCL equation for node i is the sum of conductances connected to node i; off‑diagonal entries are −Y_ij (negative admittance between i and j).  
5. **Source vector** – Current sources inject directly; voltage sources are handled by either creating a supernode or adding an unknown current through the source and an extra equation V_i−V_j = V_source.

The resulting matrix is symmetric and positive‑definite for passive networks, guaranteeing a unique solution.

### Mesh Analysis Procedure (dual to nodal)
1. **Identify independent loops** – Each loop gets a mesh current I_k.  
2. **KVL around each loop** – Sum of voltage drops (I_k·Z) equals sum of source voltages.  
3. **Impedance matrix** – Diagonal entries are total impedance of loop k; off‑diagonal entries are −Z_shared (impedance common to two loops).  
4. **Solve** – Gives mesh currents; branch currents are superpositions of relevant mesh currents.

Both methods are mathematically equivalent; nodal analysis is preferred when the circuit has many voltage sources, mesh analysis when many current sources dominate.

### Thévenin and Norton Equivalents – First‑Principle Derivation
Consider a linear, time‑invariant (LTI) sub‑network **N** with two external terminals a‑b. By superposition, the voltage V_ab across the terminals for any external load Z_L can be written as:

$$ V_{ab} = V_{oc} - I_{ab} Z_{th} $$

where:
* $V_{oc}$ is the voltage when the terminals are open‑circuit (I_ab = 0).  
* $Z_{th}$ is the impedance seen looking into the terminals with **all independent sources deactivated** (voltage sources shorted, current sources opened).  

*Derivation*: Deactivate sources → the network becomes a passive impedance network. Applying a test current I_test at a‑b yields a voltage V_test = I_test·Z_th by definition of input impedance. Reactivating the sources and using linearity gives the above affine relationship; the slope is −Z_th, the intercept is V_oc.

The Norton equivalent follows by source transformation:  
$ I_{n} = V_{oc}/Z_{th} $ (short‑circuit current) and the same $Z_{n}=Z_{th}$ placed in parallel with the current source.

These equivalents are **exact** for the external behavior of **N**; they are invaluable for reducing a complex power‑delivery network (PDN) to a simple source‑impedance model that can be plugged into system‑level simulations.

## How It Works
### From KCL/KVL to Matrix Equations
Given a circuit with nodes 0…N (0 = ground), write KCL at each node i (i≠0):

$$ \sum_{j\in\mathcal{N}(i)} Y_{ij}(V_i - V_j) + I_{i}^{src} = 0 $$

where $Y_{ij}$ is the admittance of the branch connecting i and j (zero if no direct branch), and $I_{i}^{src}$ is the net current flowing into node i from independent current sources. Rearranging:

$$ \left(\sum_j Y_{ij}\right)V_i - \sum_{j\neq i} Y_{ij}V_j = - I_{i}^{src} $$

Collecting for all i yields **G·V = I**, where **G** is the nodal conductance matrix (real, symmetric for reciprocal elements) and **I** is the known source current vector. Solve via LU decomposition or conjugate‑gradient for large sparse systems (as done in SPICE‑like solvers).

### Determining Thévenin Impedance Practically
1. **Open‑circuit voltage** – Remove any load, compute $V_{oc}$ via nodal analysis (sources active).  
2. **Short‑circuit current** – Place a wire (zero‑impedance) across the terminals, compute $I_{sc}$ (sources active).  
3. **Impedance** – $Z_{th}=V_{oc}/I_{sc}$.  
   *Proof*: With the terminals shorted, the external voltage is zero, so $0 = V_{oc} - I_{sc} Z_{th}$ ⇒ $Z_{th}=V_{oc}/I_{sc}$.

If the network contains dependent sources, deactivating independent sources **does not** zero the dependent sources; they must remain active when computing $Z_{th}$. This is a frequent source of error (see Common Mistakes).

### Small‑Signal Linearization
For nonlinear devices (diodes, transistors) we linearize around a DC operating point (Q‑point). The small‑signal model replaces each device by its incremental impedance (e.g., $r_{\pi}$, $g_m$, $r_o$ for a BJT). The resulting linear network is then analyzed with the same nodal/mesh techniques, giving transfer functions, impedance profiles, and stability metrics.

## Worked Examples
### Example 1: Nodal Analysis with Numbers
**Circuit**:  
- Node 0 = ground.  
- Node 1 connected to V1 = 12 V via R1 = 1 kΩ, to node 2 via R2 = 2 kΩ, and to ground via R3 = 1 kΩ.  
- Node 2 connected to V2 = 5 V via R4 = 2 kΩ, to node 1 via R2, and to ground via R5 = 1 kΩ.  

**Step 1 – Unknowns**: V1 (node 1) and V2 (node 2).  
**Step 2 – Write KCL** (currents leaving the node):

*Node 1*:
$$ \frac{V_1-12}{1k} + \frac{V_1-V_2}{2k} + \frac{V_1-0}{1k} = 0 $$

*Node 2*:
$$ \frac{V_2-5}{2k} + \frac{V_2-V_1}{2k} + \frac{V_2-0}{1k} = 0 $$

**Step 3 – Simplify** (multiply by 1k to eliminate kΩ):

Node 1: $(V_1-12) + 0.5(V_1-V_2) + V_1 = 0$ → $2.5V_1 -0.5V_2 = 12$  
Node 2: $(V_2-5) + 0.5(V_2-V_1) + V_2 = 0$ → $-0.5V_1 + 2.5V_2 = 5$

**Step 4 – Matrix form**:

$$
\begin{bmatrix}
2.5 & -0.5\\
-0.5 & 2.5
\end{bmatrix}
\begin{bmatrix}
V_1\\ V_2
\end{bmatrix}
=
\begin{bmatrix}
12\\ 5
\end{bmatrix}
$$

**Step 5 – Solve** (det = 2.5·2.5 − 0.5·0.5 = 6.0):

$$ V_1 = \frac{12·2.5 - (-0.5)·5}{6} = \frac{30 + 2.5}{6}=5.4167\text{ V} $$
$$ V_2 = \frac{2.5·5 - (-0.5)·12}{6} = \frac{12.5 + 6}{6}=3.0833\text{ V} $$

**Step 6 – Branch currents** (using Ohm’s law):

*I_R1* = (12−V1)/1k = (12−5.4167)/1k = 6.5833 mA (from V1 to node 1)  
*I_R2* = (V1−V2)/2k = (5.4167−3.0833)/2k = 1.1667 mA (node 1→node 2)  
*I_R3* = V1/1k = 5.4167 mA (node 1→ground)  
*I_R4* = (V2−5)/2k = (3.0833−5)/2k = −0.9583 mA (ground→node 2)  
*I_R5* = V2/1k = 3.0833 mA (node 2→ground)

Currents satisfy KCL at each node (check: node 1: 6.5833 mA in = 1.1667+5.4167 mA out).

### Example 2: Thévenin Equivalent of a Resistive Bridge
**Circuit**: Same topology as above, but terminals of interest are across R5 (node 2 to ground).  
**Goal**: Find $V_{th}$ and $Z_{th}$ looking into those terminals.

**Open‑circuit voltage ($V_{oc}$)** – Leave R5 open (remove it). Compute V2 with the previous nodal equations but **without** the $V_2/1k$ term (since R5 is absent). Node equations become:

Node 1: same as before → $2.5V_1 -0.5V_2 = 12$  
Node 2 (no ground via R5): $\frac{V_2-5}{2k} + \frac{V_2-V_1}{2k} = 0$ → $-0.5V_1 + V_2 = 5$

Solve:
$$ V_1 = \frac{12·1 - (-0.5)·5}{2.5·1 - (-0.5)·(-0.5)} = \frac{12 + 2.5}{2.5 -0.25}= \frac{14.5}{2.25}=6.444\text{ V} $$
$$ V_2 = 5 + 0.5V_1 = 5 + 3.222 = 8.222\text{ V} $$

Thus $V_{oc}=V_2 - 0 = 8.222\text{ V}$.

**Short‑circuit current ($I_{sc}$)** – Short node 2 to ground (replace R5 by a wire). Now V2=0 forced. Write KCL at node 1 only (node 2 is ground):

Node 1: $\frac{V_1-12}{1k} + \frac{V_1-0}{2k} + \frac{V_1-0}{1k} = 0$  
=> $(V_1-12) + 0.5V_1 + V_1 = 0$ → $2.5V_1 = 12$ → $V_1 = 4.8\text{ V}$

Current through the short (from node 2 to ground) is the sum of currents entering node 2 from R2 and R4:
$$ I_{R2} = \frac{V_1 - V_2}{2k} = \frac{4.8-0}{2k}=2.4\text{ mA} $$
$$ I_{R4} = \frac{0-5}{2k} = -2.5\text{ mA} $$ (negative means actually flowing from ground to node 2)  
Net short‑circuit current leaving node 2 toward ground: $I_{sc}= I_{R2} + I_{R4} = 2.4\text{ mA} -2.5\text{ mA}= -0.1\text{ mA}$ → magnitude 0.1 mA from ground to node 2.

**Thévenin impedance**:
$$ Z_{th}= \frac{V_{oc}}{I_{sc}} = \frac{8.222\text{ V}}{0.1\text{ mA}} = 82.22\text{ kΩ} $$

(Notice the large value because the bridge is nearly balanced; a small short‑circuit current yields a large equivalent resistance.)

**Norton equivalent**: $I_n = V_{oc}/Z_{th}=0.1\text{ mA}$, $Z_n = Z_{th}$ in parallel with the current source.

### Example 3: Small‑Signal MOSFET Common‑Source Amplifier
*Device*: NMOS biased at $V_{GS}=1.8\text{ V}$, $V_{DS}=5\text{ V}$, with $I_D=2\text{ mA}$, $k_n'=200\mu\text{A/V}^2$, $W/L=10$.  
*Small‑signal parameters*:  
$$ g_m = \sqrt{2k_n' \frac{W}{L} I_D}= \sqrt{2·200\mu·10·2m}= \sqrt{8m}=2.828\text{ mS} $$
$$ r_o = \frac{1}{\lambda I_D}\approx\frac{1}{0.02·2m}=25\text{ kΩ} $$ (assuming $\lambda=0.02\text{ V}^{-1}$)  
*Circuit*: Gate tied to AC signal via $C_{gs}$, source degenerated by $R_S=500\Omega$, drain load $R_D=10\text{ kΩ}$.

**Small‑signal nodal equation at source node (S)**:
$$ g_m (V_G - V_S) + \frac{V_S}{R_S} + \frac{V_S - V_D}{r_o}=0 $$
**Drain node (D)**:
$$ \frac{V_D - V_S}{r_o} + \frac{V_D}{R_D}=0 $$

Solve for voltage gain $A_v = V_D / V_G$. After algebra (substituting numbers) one finds:
$$ A_v \approx -\frac{g_m R_D}{1+g_m R_S}\cdot\frac{r_o}{r_o+R_D} \approx -\frac{2.828m·10k}{1+2.828m·0.5k}\cdot\frac{25k}{25k+10k}\approx -15.2 $$
Thus a 10 mV input yields ≈ −150 mV output, inverted.

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Assuming KCL sums currents *entering* a node equals zero without sign convention** | KCL is ∑I_out = 0 (or ∑I_in = 0). Mixing signs leads to wrong equations, especially when current sources are defined with arbitrary direction. | Choose a consistent direction (e.g., all currents leaving the node) and write each branch current as (V_node−V_neighbor)/Z. If a source forces current into the node, add it with a negative sign. |
| 2 | **Deactivating dependent sources when calculating Zₜₕ** | Dependent sources rely on circuit variables; turning them off changes the network topology and yields an incorrect Zₜₕ. | Keep dependent sources active; apply a test source (V_test or I_test) at the terminals and compute the ratio V_test/I_test with all independent sources off. |
| 3 | **Using the same polarity for Vₒc and Iₛc when computing Zₜₕ = Vₒc/Iₛc** | If the short‑circuit current is defined opposite to the voltage rise direction, the ratio gives a negative resistance, which is non‑physical for passive networks. | Define Vₒc as voltage from terminal a to b (a‑b). Define Iₛc as current flowing from a to b through the short. Then Zₜₕ = Vₒc / Iₛc (both using the same reference). |
| 4 | **Neglecting the effect of source internal resistance when measuring Vₒc with a voltmeter** | A real voltmeter has finite input resistance; loading the circuit changes the open‑circuit voltage. | Use a voltmeter with input resistance ≫ Zₜₕ (typically >10 MΩ) or compute the loading effect analytically and correct the measurement. |
| 5 | **Assuming mesh analysis yields the same number of equations as nodes** | Mesh count = B − N + 1 (planar circuits). Confusing the two leads to either too few or too many equations. | Count independent loops (or use the formula) before writing KVL equations. For non‑planar circuits, use loop analysis with a fundamental loop set. |

## Exercises
### Easy
1. **Two‑node resistive divider** – A 9 V source feeds series resistors R₁=2 kΩ and R₂=3 kΩ to ground.  
   a) Write the nodal equation for the middle node and solve for its voltage.  
   b) Compute the current through each resistor.  

2. **Superposition check** – In the circuit of Example 1, replace V₂ with a 0 V source (ground) and recompute V₁. Verify that V₁ (with V₂=0) plus V₁ (with V₁=0, V₂=5 V) equals the original V₁.

### Medium
3. **Thevenin of a loaded bridge** – Using the bridge circuit from Example 2, attach a load R_L=5 kΩ across the terminals (node 2‑ground).  
   a) Find the Thévenin equivalent (Vₜₕ, Zₜₕ) *without* the load.  
   b) Using the equivalent, calculate the load voltage and current.  
   c) Verify by solving the full nodal equations with R_L present.

4. **Dependent source impact** – Consider a VCVS with gain μ=10 controlling voltage across R₁=1 kΩ (V₁ = μ·V_x, where V_x is the voltage across R₂=2 kΩ). The circuit is excited by a 5 V source in series with R₁ and R₂.  
   a) Write nodal equations including the dependent source.  
   b) Solve for V₁ and V₂.  
   c) Compute the effective resistance seen by the 5 V source.

### Hard
5. **Frequency‑dependent PDN** – Model a simplified power‑delivery network as a series R‑L (R=10 mΩ, L=5 nH) feeding a parallel R‑C load (R=50 mΩ, C=10 µF) representing a VRM and decoupling capacitance.  
   a) Derive the input impedance Z_in(jω) of the network.  
   b) Find the frequency at which the magnitude of Z_in is minimum (resonance).  
   c) Compute the peak impedance magnitude and discuss its implication for VRM transient response.  

6. **Linux regulator API** – Write a C program that reads the microvolt value of a regulator named `vdd_core` via sysfs, converts it to volts, and prints it.  
   a) Show the required `#include`s, `open()`, `read()`, and error handling.  
   b) Compile with `gcc -Wall -o regread regread.c`.  
   c) Run on a system where the regulator exists (e.g., a recent ARM SoC) and verify the output matches `cat /sys/class/regulator/regulator.0/microvolts`.

## Linux Connection
Linux treats the **power delivery network (PDN)** as a hierarchy of **regulator devices**, each exposing a standard sysfs interface. The kernel’s **regulator framework** (`drivers/regulator/`) abstracts voltage/current sources, allowing board‑level device tree bindings to describe fixed regulators, SMPS, LDOs, and even CPU‑internal regulators.

### Key Subsystems and Files
| Subsystem | Purpose | Typical sysfs path |
|-----------|---------|--------------------|
| **regulator** | Provides `get_voltage()`, `set_voltage()`, `get_current_limit()` to drivers. | `/sys/class/regulator/regulator.<n>/` |
| **intel‑rapl** (x86) | Exposes Running Average Power Limit (RAPL) counters for CPU package, DRAM, PP0, PP1. | `/sys/powercap/intel-rapl:<domain>/energy_uj` |
| **powercap** | Generic framework for power‑capping devices (Intel RAPL, ARM CCU, etc.). | `/sys/powercap/` |
| **thermal** | Implements cooling‑device bindings that can throttle regulators based on temperature. | `/sys/thermal/cooling_device<>/` |
| **devfreq** | Dynamic voltage‑frequency scaling for devices like GPUs, display controllers. | `/sys/class/devfreq/` |

### Example: Reading a Regulator’s Voltage
```bash
# Show all regulators
$ ls /sys/class/regulator/
regulator.0  regulator.1  regulator.2

# Assume regulator.0 is the CPU core voltage (vdd_core)
$ cat /sys/class/regulator/regulator.0/microvolts
850000
```
The value is in **microvolts**; 850 000 µV = 0.85 V.

### Example: Measuring CPU Package Energy with RAPL
```bash
# Read accumulated energy (in microjoules) for the package domain
$ sudo cat /sys/powercap/intel-rapl:0/energy_uj
1234567890
```
To obtain average power over an interval Δt:
```bash
$ E1=$(cat /sys/powercap/intel-rapl:0/energy_uj)
$ sleep 1
$ E2=$(cat /sys/powercap/intel-rapl:0/energy_uj)
$ Power_uW=$(( (E2 - E1) / 1 ))   # Δt = 1 s → µJ/s
