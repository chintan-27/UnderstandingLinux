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

## Why This Matters

Every real circuit has multiple interconnected nodes, and predicting what voltage or current appears where requires a systematic method. Without nodal or mesh analysis you are reduced to guessing or simulating blindly. Without Thévenin and Norton equivalents you cannot reason about how adding a load *changes* a circuit — which means you cannot predict whether a GPIO pin will sink enough current to drive an LED, whether a sensor's output will sag when you connect it to a microcontroller input, or whether two cascaded filter stages will interact destructively. These theorems let you collapse an arbitrarily complex sub-circuit into a single source and a single resistor, after which every load interaction reduces to a voltage divider.

---

## Core Concepts

### Nodal Analysis

Every junction where two or more components meet is a **node**. Nodal analysis applies Kirchhoff's Current Law (KCL) at each node: the algebraic sum of currents leaving a node is zero. This is not a convention — it is a statement that charge cannot accumulate at a node in DC steady state, because if it did, the node voltage would be changing.

You assign a voltage variable to each unknown node referenced to ground, express each branch current as $(V_n - V_k)/R_{nk}$, and solve the resulting linear system. For a node $n$ connected to $K$ other nodes and driven by net injected current $I_n$:

$$\sum_{k=1}^{K} \frac{V_n - V_k}{R_{nk}} = I_n$$

$N$ unknown nodes yield $N$ equations. The method scales directly to matrix form, which is exactly what SPICE-family simulators do internally.

### Mesh Analysis

A **mesh** is a loop in a planar circuit that contains no smaller loops. Mesh analysis applies Kirchhoff's Voltage Law (KVL): the sum of voltage drops around any closed loop is zero, because voltage is a path-independent potential and you return to the starting point. You assign a circulating current $I_m$ to each mesh; shared branches carry the algebraic difference of their two mesh currents.

$$\sum_{k} R_{mk} \cdot I_k = V_{\text{source},m}$$

Mesh analysis is preferable when a circuit has many series components and few loops. Nodal analysis is preferable when there are many parallel branches or current sources. Both produce the same answer; the choice is computational convenience.

### Thévenin's Theorem

Any linear two-terminal network — regardless of how many resistors, independent sources, and dependent sources it contains — is externally equivalent to a single voltage source $V_T$ in series with a single resistance $R_T$.

- $V_T = V_{OC}$: the open-circuit voltage across the terminals with no load attached.
- $R_T$: the resistance seen looking back into the terminals with all **independent** sources killed — voltage sources replaced by short circuits (their internal resistance is zero), current sources replaced by open circuits (their internal conductance is zero). Dependent sources are left active; they can only be found by injecting a test source.

This equivalence follows directly from the superposition principle, which holds for any linear network. Because the Thévenin model is linear, it remains valid only as long as the actual network is operating in its linear region — a transistor biased into saturation, for example, breaks the equivalence.

### Norton's Theorem

The Norton equivalent is the current-source dual of Thévenin:

$$I_N = I_{SC}, \qquad R_N = R_T, \qquad V_T = I_N R_N$$

$I_{SC}$ is the short-circuit current — what flows when you place a wire directly across the terminals. The Thévenin-to-Norton conversion is a source transformation and carries no new information; use whichever form matches the topology of the downstream circuit (Norton is natural when the load is in parallel, Thévenin when it is in series).

---

## How It Works

### Nodal Analysis: Worked Example

A 20 V source drives two 10 kΩ resistors to ground and one 5 kΩ resistor connecting the two internal nodes $V_1$ and $V_2$. Apply KCL at each node, choosing currents-leaving-equal-zero:

At $V_1$:

$$\frac{V_1 - 20}{10\text{k}} + \frac{V_1}{10\text{k}} + \frac{V_1 - V_2}{5\text{k}} = 0$$

At $V_2$:

$$\frac{V_2 - V_1}{5\text{k}} + \frac{V_2}{10\text{k}} = 0$$

Multiply through by 10 kΩ to clear denominators (note: $10\text{k}/5\text{k} = 2$):

$$\begin{cases} (V_1 - 20) + V_1 + 2(V_1 - V_2) = 0 \\[4pt] 2(V_2 - V_1) + V_2 = 0 \end{cases}$$

$$\begin{cases} 4V_1 - 2V_2 = 20 \\[4pt] -2V_1 + 3V_2 = 0 \end{cases}$$

From the second equation $V_1 = \tfrac{3}{2}V_2$. Substituting:

$$4 \cdot \tfrac{3}{2}V_2 - 2V_2 = 20 \implies 4V_2 = 20 \implies V_2 = 5\text{ V}, \quad V_1 = 7.5\text{ V}$$

The 5 kΩ coupling resistor transfers current from the higher-potential node to the lower one; its presence pulls $V_1$ down from the 10 V it would be without the coupling path.

### Thévenin Equivalent: The Resistive Divider

A 20 V source with a 10 kΩ upper resistor and a 10 kΩ lower resistor to ground. The output terminal is the junction between them.

**Step 1 — Open-circuit voltage.** With the output unloaded, no current flows through any branch except the divider chain:

$$V_T = V_{OC} = 20 \cdot \frac{10\text{k}}{10\text{k} + 10\text{k}} = 10\text{ V}$$

**Step 2 — Thévenin resistance.** Kill the 20 V source (short it). Looking into the output terminal, the upper 10 kΩ connects to the short (previously the source) and the lower 10 kΩ connects to ground — both are now in parallel between the terminal and ground:

$$R_T = 10\text{k} \| 10\text{k} = \frac{10\text{k} \cdot 10\text{k}}{10\text{k} + 10\text{k}} = 5\text{ k}\Omega$$

**Step 3 — Norton equivalent.** Short the terminals. The full 20 V drives both resistors in parallel to ground, so:

$$I_N = I_{SC} = \frac{V_T}{R_T} = \frac{10\text{ V}}{5\text{ k}\Omega} = 2\text{ mA}$$

This is consistent: $I_{SC}$ also equals $V_{20}/(R_1 \| R_2)$... but computing it via the Thévenin values confirms both are consistent.

**Step 4 — Load prediction.** Attach a 5 kΩ load. Without Thévenin you must re-solve the full three-resistor network. With Thévenin, it is one voltage divider:

$$V_{load} = V_T \cdot \frac{R_L}{R_T + R_L} = 10 \cdot \frac{5\text{k}}{5\text{k} + 5\text{k}} = 5\text{ V}$$

The loaded voltage is exactly half the open-circuit voltage because $R_L = R_T$. This is also the condition of **maximum power transfer** — a result that follows immediately from the Thévenin model and is otherwise non-obvious.

Maximum power delivered to $R_L$:

$$P_{max} = \frac{V_T^2}{4 R_T} \quad \text{when } R_L = R_T$$

### Why Stage Loading Matters

Cascading two identical RC low-pass sections does not simply square the single-stage transfer function, because the second stage loads the first. The Thévenin resistance of the first stage appears in series with the second stage's input impedance, forming a frequency-dependent voltage divider that shifts the pole location.

For a single RC section with $R = 10\text{ k}\Omega$ and $C = 10\text{ nF}$, the pole is at:

$$f_c = \frac{1}{2\pi R C} = \frac{1}{2\pi \cdot 10^4 \cdot 10^{-8}} \approx 1591\text{ Hz}$$

When you cascade an identical second stage directly, the Thévenin resistance seen by the second capacitor is $R + (R \| R_{\text{in,2}})$, not just $R$. The combined $-3\text{ dB}$ frequency is no longer $f_c$ but is shifted downward — you need the full two-pole transfer function to find it.

The design solution is a **buffer stage** — an op-amp voltage follower or emitter follower — which presents $R_T \approx 0$ to the load and $Z_{in} \gg R_T$ of the source. The Thévenin model makes this requirement explicit: if $Z_{load} \gg R_T$, the loaded voltage approaches $V_{OC}$; if $Z_{load} \sim R_T$, you lose half your signal.

---

## Linux Connection

### ngspice: SPICE Nodal Analysis on Linux

**ngspice** performs nodal analysis internally. At each operating point (DC), frequency step (AC), or time step (transient), it assembles the **modified nod
