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

Every circuit you will ever analyze — from a voltage divider biasing a transistor to the output impedance of a signal driver — is a network of sources and impedances. Systematic methods matter because circuit topology alone does not tell you voltages or currents; you need a disciplined way to write equations that a solver — human or machine — can resolve unambiguously.

Thévenin and Norton equivalents matter for a specific reason: they let you separate a source network from its load and reason about each independently. When you connect a sensor to an ADC input, a driver to a transmission line, or a bench meter to a resistive divider, the load perturbs the source. Thévenin analysis makes that perturbation exact and predictable rather than a surprise.

---

## Core Concepts

### Nodes and Kirchhoff's Current Law (KCL)

A **node** is any point where two or more elements share a terminal. KCL states that the algebraic sum of currents at a node is zero — a direct consequence of charge conservation; charge cannot accumulate at an ideal node.

Choose one node as reference (ground, 0 V). Every other node gets one KCL equation whose unknown is the node voltage. For a circuit with $N$ total nodes, you write $N-1$ equations in $N-1$ unknowns.

The standard KCL stamp for a resistor between nodes $n$ and $k$:

$$\frac{V_n - V_k}{R_{nk}}$$

contributes $+G_{nk}$ to row $n$, column $n$ of the conductance matrix and $-G_{nk}$ to row $n$, column $k$, where $G_{nk} = 1/R_{nk}$. This mechanical stamping is exactly what SPICE does.

### Meshes and Kirchhoff's Voltage Law (KVL)

A **mesh** is a loop in a planar circuit that encloses no smaller loops. KVL states that the sum of voltage drops around any closed loop is zero — conservation of energy; a charge carrier returning to its starting point cannot have net work done on it.

Each mesh gets one assigned circulating current. Shared branches carry the algebraic difference of adjacent mesh currents. For $M$ independent meshes you write $M$ equations.

$$\sum_{k} V_k = 0 \quad \text{around any closed loop}$$

### Choosing Nodal vs. Mesh

The choice is computational, not philosophical:

- **Nodal**: fewer equations when nodes $\ll$ meshes; preferred when you need node voltages directly; handles current sources trivially (they appear as known RHS terms).
- **Mesh**: fewer equations when meshes $\ll$ nodes; handles voltage sources trivially (they appear as known loop voltages).

A voltage source between two non-reference nodes in nodal analysis creates a **supernode** — treat the two nodes as one unit, write their KCL together with the constraint $V_a - V_b = V_s$.

### Thévenin's Theorem

Any linear two-terminal network — regardless of internal complexity — presents to an external load exactly as a single voltage source $V_T$ in series with a resistance $R_T$. Linearity is the prerequisite; superposition must hold.

**Procedure:**
1. **$V_T = V_{OC}$**: Remove the load, measure (or compute) the open-circuit terminal voltage.
2. **$R_T$**: Kill all independent sources (voltage sources → short circuit, current sources → open circuit). Compute resistance looking into the terminals. If dependent sources are present, you cannot simply kill them — instead, drive the terminals with a test source $V_x$ and measure $I_x$; then $R_T = V_x / I_x$.

For the standard 10k–10k voltage divider driven by a stiff 20 V source:

$$V_T = 20 \cdot \frac{10\text{k}}{10\text{k} + 10\text{k}} = 10\ \text{V}$$

$$R_T = R_1 \| R_2 = \frac{10\text{k} \cdot 10\text{k}}{10\text{k} + 10\text{k}} = 5\ \text{k}\Omega$$

The parallel combination arises because with the 20 V source shorted, the two 10 kΩ resistors share a node at each end — they are in parallel from the terminal's perspective.

$$R_1 \| R_2 = \frac{R_1 R_2}{R_1 + R_2}$$

### Norton's Theorem

The Norton equivalent replaces the same network with a current source $I_N$ in parallel with $R_N = R_T$:

$$I_N = I_{SC} = \frac{V_{OC}}{R_T} = \frac{V_T}{R_T}$$

Norton is preferred when the load connects in parallel with a current source — it avoids the algebraic overhead of converting to series form first.

### Source Transformation

Thévenin and Norton are duals. The conversion is exact and reversible for linear networks:

$$V_T = I_N R_N, \qquad I_N = \frac{V_T}{R_T}, \qquad R_T = R_N$$

Source transformation is useful for circuit simplification: a chain of Thévenin stages can be collapsed left-to-right by repeatedly converting and combining.

---

## How It Works

### Nodal Analysis: Conductance Matrix Construction

Consider the following circuit:

```
          R1            R2
  N1 ---/\/\/--- N2 ---/\/\/--- N3 (GND = 0 V)
  |               |
 I_s             R3
  |               |
 GND            GND
```

Unknowns: $V_1$, $V_2$ (N3 is reference).

**KCL at N1** — current injected by source equals current leaving through $R_1$:

$$I_s = \frac{V_1 - V_2}{R_1}$$

**KCL at N2** — current entering from N1 equals current leaving through $R_2$ and $R_3$:

$$\frac{V_1 - V_2}{R_1} = \frac{V_2 - 0}{R_2} + \frac{V_2 - 0}{R_3}$$

Rearranging into conductance matrix form, where $G_k = 1/R_k$:

$$\begin{bmatrix} G_1 & -G_1 \\ -G_1 & G_1 + G_2 + G_3 \end{bmatrix} \begin{bmatrix} V_1 \\ V_2 \end{bmatrix} = \begin{bmatrix} I_s \\ 0 \end{bmatrix}$$

The diagonal entry for node $n$ is the sum of all conductances connected to $n$. The off-diagonal entry $(n, k)$ is the negative of the conductance between nodes $n$ and $k$. This pattern — the **nodal admittance matrix** — applies mechanically to any resistive network and extends directly to AC circuits by replacing $G$ with complex admittance $Y = 1/Z$.

Solving by Cramer's rule:

$$V_1 = \frac{I_s (G_1 + G_2 + G_3)}{G_1(G_2 + G_3) + G_1 G_1} \quad \text{(expand the determinant)}$$

In practice you solve numerically. SPICE assembles exactly this matrix and calls a sparse LU decomposition.

### Thévenin Reduction: RC Time Constant

Given a resistive network driving a capacitor:

```
Vin ---[R1]---+---[R2]--- GND
              |
             [C]
              |
             GND
```

**Without Thévenin**: writing the node equation at the junction directly yields a first-order ODE with $R_1 \| R_2$ as the effective resistance, but you have to carry the full divider ratio through the algebra.

**With Thévenin**: remove $C$, compute $V_T$ and $R_T$ of the resistive part, then replace the entire left side with a single voltage source $V_T$ in series with $R_T$. The result is a canonical RC circuit:

$$V_T = V_{in} \cdot \frac{R_2}{R_1 + R_2}, \qquad R_T = R_1 \| R_2 = \frac{R_1 R_2}{R_1 + R_2}$$

$$\tau = R_T C = \frac{R_1 R_2}{R_1 + R_2} \cdot C$$

The voltage across $C$ as a function of time (step input):

$$V_C(t) = V_T \left(1 - e^{-t/\tau}\right)$$

This approach generalizes: anytime you add a reactive element to an existing resistive network, Thévenin-reduce the resistive part first and you immediately have $\tau = R_T C$ or $\omega_0 = 1/\sqrt{L_T C}$ without re-solving the full network.

### Numerical Example: Meter Loading

A 20,000 Ω/V meter on its 1 V scale has input resistance $R_m = 20{,}000\ \Omega$. It is connected to a 10k–10k voltage divider driven by a stiff 1 V source.

Thévenin equivalent of the divider (before meter is attached):

$$V_T = 1\ \text{V} \cdot \frac{10\text{k}}{20\text{k}} = 0.5\ \text{V}, \qquad R_T = 10\text{k} \| 10\text{k} = 5\ \text{k}\Omega$$

With the meter attached, $R_m$ loads the Thévenin source:

$$V_{read} = V_T \cdot \frac{R_m}{R_T + R_m}
