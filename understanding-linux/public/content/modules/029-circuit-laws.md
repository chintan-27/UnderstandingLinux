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

## Core Concepts
### Ohm’s Law from Microscopic Charge Transport  
In a conductor, free electrons experience an average drift velocity \(v_d\) proportional to the applied electric field \(E\):  
\[
v_d = \mu E
\]  
where \(\mu\) is the electron mobility (m² V⁻¹ s⁻¹). Current density \(J\) is charge per unit area per unit time:  
\[
J = n e v_d = n e \mu E
\]  
with \(n\) the free‑electron density and \(e\) the elementary charge. Defining conductivity \(\sigma = n e \mu\) gives the microscopic Ohm’s law \(J = \sigma E\). For a uniform conductor of length \(L\) and cross‑section \(A\),  
\[
V = EL,\qquad I = JA \;\Rightarrow\; V = \frac{L}{\sigma A} I \equiv RI,
\]  
so resistance \(R = L/(\sigma A)\) and conductance \(G = 1/R = \sigma A/L\).  

### Kirchhoff’s Current Law (KCL) – Charge Conservation  
Consider a node (junction) where \(k\) conductors meet. Over a time interval \(\Delta t\), the net charge entering the node must equal the net charge leaving, otherwise charge would accumulate, violating the continuity equation \(\partial\rho/\partial t + \nabla\!\cdot\!J = 0\). Summing currents (positive for entering, negative for leaving) gives  
\[
\sum_{i=1}^{k} I_i = 0 \quad\Longleftrightarrow\quad \sum I_{\text{in}} = \sum I_{\text{out}} .
\]  
KCL holds for any lumped‑element circuit regardless of element linearity.

### Kirchhoff’s Voltage Law (KVL) – Conservative Electrostatic Field  
The electric field in a static circuit is conservative: \(\oint_{\mathcal{C}} \mathbf{E}\cdot d\mathbf{l}=0\) for any closed loop \(\mathcal{C}\). Voltage drop across an element is defined as the line integral of \(\mathbf{E}\) through that element. Summing the signed drops around a loop yields zero:  
\[
\sum_{j=1}^{m} V_j = 0 .
\]  
If time‑varying magnetic flux links the loop, Faraday’s law adds an emf term; KVL then applies to the *total* voltage (including induced emf).

### Conductance, Resistance, and the Passive Sign Convention  
* Conductance \(G\) (S) quantifies how easily current flows for a given voltage: \(I = GV\).  
* Resistance \(R\) (Ω) quantifies opposition: \(V = IR\).  
* The passive sign convention assigns current entering the positive voltage terminal of an element; then \(P = VI\) is the power *absorbed* by the element (positive for dissipation, negative for generation).  

These three laws together form a complete linear description of any lumped‑element circuit composed of resistors, independent sources, and (later) linear capacitors/inductors via their impedance analogues.

## How It Works
### From Laws to Equations  
1. **Element Relations** – Replace each branch by its constitutive law: for a resistor \(V_k = I_k R_k\); for a voltage source \(V_k = V_{s,k}\); for a current source \(I_k = I_{s,k}\).  
2. **KCL at Nodes** – Write \(\sum I_{\text{leaving}} = 0\) for every independent node (reference node excluded). Substituting the element relations gives equations linear in the unknown node voltages.  
3. **KVL around Loops** – Write \(\sum V = 0\) for each independent loop. Substituting the element relations yields equations linear in the unknown loop currents (mesh analysis).  

Because the element relations are linear (Ohm’s law), the resulting system is a set of linear algebraic equations. Solving them yields all branch currents and node voltages.

#### Nodal Analysis Derivation (Key Step)  
Select a reference node (ground). For each node \(i\) with voltage \(V_i\), the current leaving node \(i\) through a resistor connecting to node \(j\) is  
\[
I_{ij} = \frac{V_i - V_j}{R_{ij}} .
\]  
Summing over all resistors attached to node \(i\) and adding any attached current sources \(I_{s,i}\) gives the KCL equation:  
\[
\sum_{j} \frac{V_i - V_j}{R_{ij}} + I_{s,i} = 0 .
\]  
Rearranging:  
\[
\left(\sum_{j}\frac{1}{R_{ij}}\right) V_i - \sum_{j}\frac{1}{R_{ij}} V_j = - I_{s,i}.
\]  
In matrix form \(\mathbf{G}\mathbf{V} = \mathbf{I}_s\), where \(\mathbf{G}\) is the conductance matrix (symmetric, positive‑definite for passive networks). Solving \(\mathbf{V} = \mathbf{G}^{-1}\mathbf{I}_s\) gives node voltages; branch currents follow from Ohm’s law.

#### Mesh Analysis Derivation (Key Step)  
Assign a loop current \(I_k\) to each independent mesh. The voltage drop across a resistor shared by meshes \(k\) and \(l\) is \(R_{kl}(I_k - I_l)\). Summing drops around mesh \(k\) and equating to any mesh‑inserted voltage sources \(V_{s,k}\) yields:  
\[
\sum_{l} R_{kl}(I_l - I_k) = V_{s,k}.
\]  
Collecting terms gives the impedance matrix equation \(\mathbf{Z}\mathbf{I} = \mathbf{V}_s\).  

Both formulations are equivalent; the choice depends on which yields fewer equations (nodes vs meshes).

### Superposition and Linearity  
Because the governing equations are linear, the response to multiple independent sources equals the sum of responses to each source acting alone (others set to zero: voltage sources → short, current sources → open). This principle underlies many analysis techniques and is directly used in SPICE’s *DC sweep* and *AC analysis* modes.

## Worked Examples
### Example 1: Series Resistance (Node‑Based)  
**Circuit:** 10 V source → \(R_1=5\;\Omega\) → \(R_2=10\;\Omega\) → back to source.  
**Goal:** Find loop current \(I\).

1. Choose reference node at the negative terminal of the source.  
2. Node voltage \(V_1\) is the voltage across the series string (unknown).  
3. KCL at the top node: current entering from source equals current leaving through \(R_1\) (same as through \(R_2\) because series):  
   \[
   \frac{V_s - V_1}{0} = \frac{V_1 - 0}{R_1+R_2}
   \]  
   (the source is ideal, so its internal resistance is 0 Ω; we treat it as a known voltage).  
4. Directly, the series resistance is \(R_{eq}=R_1+R_2=15\;\Omega\).  
5. Apply Ohm’s law:  
   \[
   I = \frac{V_s}{R_{eq}} = \frac{10\text{ V}}{15\;\Omega}= \frac{2}{3}\text{ A}\approx0.667\text{ A}.
   \]  

### Example 2: Parallel Resistance (Node‑Based)  
**Circuit:** 10 V source → node A → two resistors \(R_1=5\;\Omega\) and \(R_2=10\;\Omega\) to ground.  
**Goal:** Currents \(I_1, I_2\).

1. Node A voltage \(V_A\) unknown; ground is 0 V.  
2. KCL at node A (current from source splits):  
   \[
   I_s = I_1 + I_2 .
   \]  
   The source current \(I_s\) equals the current delivered by the 10 V source: \(I_s = V_s / R_{eq}\) where \(R_{eq}\) is the parallel combination.  
3. Express branch currents via Ohm’s law:  
   \[
   I_1 = \frac{V_A}{R_1},\qquad I_2 = \frac{V_A}{R_2}.
   \]  
4. KCL gives:  
   \[
   \frac{V_s - V_A}{0} = \frac{V_A}{R_1} + \frac{V_A}{R_2} \;\Rightarrow\; V_A = V_s = 10\text{ V}
   \]  
   (ideal source forces node voltage to source voltage).  
5. Hence:  
   \[
   I_1 = \frac{10}{5}=2\text{ A},\qquad I_2 = \frac{10}{10}=1\text{ A}.
   \]  

### Example 3: Bridge Circuit (Nodal Analysis)  
**Circuit:** Diamond‑shaped bridge with resistors:  
- Top left \(R_1=5\;\Omega\) (between node 1 and node 2)  
- Top right \(R_2=10\;\Omega\) (node 2 to node 3)  
- Bottom left \(R_3=15\;\Omega\) (node 1 to node 4)  
- Bottom right \(R_4=20\;\Omega\) (node 4 to node 3)  
- Cross‑branch \(R_5=25\;\Omega\) (node 2 to node 4)  
A 12 V source connects node 1 (positive) to node 3 (negative).  

**Goal:** Find current through \(R_5\).

1. Choose node 3 as reference (0 V). Unknown node voltages: \(V_1, V_2, V_4\).  
2. Write KCL at each unknown node (currents leaving node = sum of \((V_i-V_j)/R_{ij}\)).  

   *Node 1:*  
   \[
   \frac{V_1-V_2}{R_1} + \frac{V_1-V_4}{R_3} + \frac{V_1-0}{R_s}=0,
   \]  
   where the source is modeled as a 12 V voltage source to reference → we replace the term \(\frac{V_1-0}{R_s}\) with a known current injection:  
   \[
   I_s = \frac{12\text{ V}}{0}\;\text{(ideal)} \;\Rightarrow\; \text{instead set } V_1 = 12\text{ V}.
   \]  
   Since node 1 is forced to 12 V by the source, we eliminate it.

   *Node 2:*  
   \[
   \frac{V_2-12}{R_1} + \frac{V_2-V_4}{R_5} + \frac{V_2-0}{R_2}=0 .
   \]  

   *Node 4:*  
   \[
   \frac{V_4-12}{R_3} + \frac{V_4-V_2}{R_5} + \frac{V_4-0}{R_4}=0 .
   \]  

3. Substitute numbers (all resistances in Ω):  

   Node 2:  
   \[
   \frac{V_2-12}{5} + \frac{V_2-V_4}{25} + \frac{V_2}{10}=0
   \]  
   → multiply by 50:  
   \[
   10(V_2-12) + 2(V_2-V_4) + 5V_2 = 0
   \]  
   → \(10V_2-120 + 2V_2-2V_4 +5V_2 =0\)  
   → \((10+2+5)V_2 -2V_4 =120\)  
   → \(17V_2 -2V_4 =120\) (1)

   Node 4:  
   \[
   \frac{V_4-12}{15} + \frac{V_4-V_2}{25} + \frac{V_4}{20}=0
   \]  
   → multiply by 300 (LCM):  
   \[
   20(V_4-12) + 12(V_4-V_2) + 15V_4 =0
   \]  
   → \(20V_4-240 +12V_4-12V_2 +15V_4 =0\)  
   → \((20+12+15)V_4 -12V_2 =240\)  
   → \(47V_4 -12V_2 =240\) (2)

4. Solve (1)–(2):  

   From (1): \(V_2 = \frac{120+2V_4}{17}\).  
   Insert into (2):  
   \[
   47V_4 -12\left(\frac{120+2V_4}{17}\right)=240
   \]  
   → \(47V_4 -\frac{1440+24V_4}{17}=240\)  
   → multiply 17: \(799V_4 -1440 -24V_4 =4080\)  
   → \((799-24)V_4 =4080+1440=5520\)  
   → \(775V_4 =5520\) → \(V_4 = \frac{5520}{775}\approx7.122\text{ V}\).  

   Then \(V_2 = \frac{120+2(7.122)}{17}= \frac{120+14.244}{17}= \frac{134.244}{17}\approx7.896\text{ V}\).  

5. Current through \(R_5\) (from node 2 to node 4):  
   \[
   I_{R_5}= \frac{V_2-V_4}{R_5}= \frac{7.896-7.122}{25}= \frac{0.774}{25}\approx0.03096\text{ A}=31\text{ mA}.
   \]  

The bridge is not balanced; a small current flows diagonally.

## Common Mistakes
| Mistake | Why It’s Wrong | How to Avoid |
|---|---|---|
| **Assuming the same current through parallel branches** | Parallel elements share the same voltage, not the same current; current divides according to conductance (\(I_i = V/R_i\)). | Write KCL at the shared node; compute each branch current separately using Ohm’s law. |
| **Using a voltmeter with non‑infinite internal resistance** | A real voltmeter draws a small current, loading the circuit and altering node voltages, especially in high‑impedance nodes. | Model the voltmeter as a large resistance (typically 10 MΩ) and include it in the nodal equations, or use a buffer amplifier. |
| **Treating a diode as a linear resistor** | Diodes exhibit exponential I‑V; linearizing only works around a bias point. | Use the Shockley diode equation or piecewise‑linear model; verify operating point before applying \(V=IR\). |
| **Mixing RMS and peak values in AC power calculations** | Power \(P = V_{\text{rms}} I_{\text{rms}}\cos\phi\); using peak values gives a factor of 2 error. | Convert sinusoidal amplitudes to RMS (\(V_{\text{rms}}=V_{p}/\sqrt{2}\)) before computing power or energy. |
| **Neglecting temperature dependence of resistance** | \(R(T)=R_0[1+\alpha (T-T_0)]\); ignoring \(\alpha\) leads to bias in power‑dissipation estimates. | Include temperature coefficient \(\alpha\) in simulations or measure resistance at operating temperature. |
| **Assuming zero internal resistance for batteries** | Real sources have internal resistance \(r\); neglecting it overestimates deliverable current and ignores voltage sag under load. | Model the source as an ideal voltage source in series with \(r\); solve the resulting circuit. |
| **Applying KVL to a loop with changing magnetic flux without emf term** | Faraday’s law adds \(\mathcal{E}= -d\Phi_B/dt\); omitting it yields incorrect loop equations. | Include the induced emf as an additional voltage source in the KVL sum. |

## Exercises
### Easy  
1. A 9 V battery powers a single resistor of 470 Ω. Compute the current and the power dissipated in the resistor.  

### Medium  
2. Three resistors are connected: \(R_1=100\;\Omega\) and \(R_2=220\;\Omega\) in parallel, and this combination is in series with \(R_3=330\;\Omega\). A 15 V source drives the network.  
   a) Find the equivalent resistance.  
   b) Determine the total current from the source.  
   c) Calculate the voltage across \(R_2\) and the current through it.  

### Hard  
3. Consider the bridge circuit of Example 3 but replace the 12 V source with a sinusoidal source \(v_s(t)=12\sqrt{2}\cos(2\pi 60t)\) V (peak 12 V RMS). Assume all resistors are unchanged and the circuit is purely resistive.  
   a) Derive the expression for the instantaneous current through \(R_5\).  
   b) Compute the RMS value of that current.  
   c) If a 10 µF capacitor is placed in parallel with \(R_5\), write the differential equation governing the voltage across the capacitor and solve for its steady‑state sinusoidal amplitude.  

## Linux Connection
### Simulating Circuits with ngspice  
`ngspice` is the SPICE variant packaged in most distributions. A netlist file (`example.cir`) describes the circuit; `ngspice` performs DC, AC, or transient analysis and writes raw data that can be plotted with `gnuplot`.

```bash
# Create a simple RC low‑pass netlist
cat > rc_lowpass.cir <<EOF
* RC low‑pass filter
Vin in 0 DC 5
R1 in out 1k
C1 out 0 1uF
.tran 0.1ms 20ms
.control
run
plot v(out) v(in)
.endc
.end
EOF

# Run the simulation
ngspice -b rc_lowpass.cir

# Plot the result (gnuplot reads the raw file produced by ngspice)
gnuplot -p -e "set datafile separator whitespace; \
               plot 'rc_lowpass.raw' using 1:2 with lines title 'Vout', \
                    '' using 1:3 with lines title 'Vin'"
```

### Measuring Power with the RAPL Interface (Intel)  
Modern x86 CPUs expose energy counters via the Running Average Power Limit (RAPL) model. The counters reside in sysfs under `/sys/class/powercap/intel-rapl:0/`. Reading the counter twice and dividing by the elapsed time yields average power.

```bash
# Read initial energy (microjoules)
E1=$(cat /sys/class/powercap/intel-rapl:0/energy_uj)

# Wait 1 second
sleep 1

# Read final energy
E2=$(cat /sys/class/powercap/intel-rapl:0/energy_uj)

# Compute average power in watts
P=$(( (E2 - E1) / 1000000 ))   # µJ → J, divided by 1 s → W
echo "Average power over last second: $P W"
```

### Accessing an ADC via the Industrial I/O (IIO) Subsystem  
Many embedded Linux boards expose analog‑to‑digital converters through IIO. The following C snippet reads a single‑ended channel from an ADC device (`iio:device0`) using the sysfs interface.

```c
/* adc_read.c – read voltage from IIO channel 0 */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>

int main(void)
{
    const char *path = "/sys/bus/iio/devices/iio:device0/in_voltage0_raw";
    int fd = open(path, O_RDONLY);
    if (fd < 0) {
        perror("open");
        return EXIT_FAILURE;
    }

    char buf[16];
    ssize_t n = read(fd, buf, sizeof(buf)-1);
    if (n < 0) {
        perror("read");
        close(fd);
        return EXIT_FAILURE;
    }
    buf[n] = '\0';
    close(fd);

    long raw = strtol(buf, NULL, 10);
    /* Assume 12‑bit ADC with reference 3.3 V */
    float voltage = (raw * 3.3f) / 4095.0f;
    printf("ADC raw=%ld → voltage=%.3f V\n", raw, voltage);
    return EXIT_SUCCESS;
}
```

Compile and run:

```bash
gcc -Wall -O2 adc_read.c -o adc_read
sudo ./adc_read   # needs read permission on sysfs IIO nodes
```

These examples show how the abstract circuit laws become concrete Linux tools: simulation (ngspice), power accounting (RAPL), and analog sensing (IIO).

## Why This Matters
Mastering Ohm’s law, KCL, and KVL gives you the analytical toolkit to predict how any interconnection of passive elements will behave under excitation. That predictive ability is the foundation of *circuit design*: choosing component values to meet voltage‑gain, bandwidth, or power‑budget targets. In the Linux ecosystem, those same principles appear everywhere the kernel manages energy—from the RAPL counters that let you measure and cap CPU power, to the IIO framework that turns a physical voltage into a readable integer for sensor drivers, to SPICE‑based tools like `ngspice` that let you prototype analog front‑ends before soldering a single resistor. By linking the first‑principles equations to real‑world interfaces (sysfs, ioctl, netlists), you can write drivers, power‑management policies, and validation scripts that are both electrically sound and Linux‑native. Thus, the circuit laws are not just textbook theory; they are the lingua franca that lets software and hardware speak the same language, enabling efficient, reliable, and measurable electronic systems.
