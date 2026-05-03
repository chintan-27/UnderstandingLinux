---
id: 17
title: "Electromagnetism"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every piece of computation you have ever run exists because engineers learned to control the movement of charged particles through conductors. The CPU executing your shell commands, the RAM holding your kernel's page tables, the SSD storing your filesystem — all of it operates by exploiting electromagnetic force. Without a working model of charge, fields, and induction, you cannot reason about why a capacitor smooths voltage spikes on a power rail, why a changing magnetic field induces current in an inductor, why your network cable needs careful impedance matching, or why the kernel's power management subsystem exists at all. Electromagnetism is not background flavor for computing — it is the physical substrate that computing is built on.

---

## Core Concepts

### Charge: The Primitive Quantity

Electric charge is a fundamental property of matter, carried by protons (positive) and electrons (negative). It is not derived from anything more basic. The critical fact is that ordinary matter is almost perfectly neutral: for every proton there is a balancing electron, and their forces cancel to extraordinary precision. Feynman illustrates this with two 1 mm grains of sand held 30 cm apart: if their charges were imbalanced by just 1%, the repulsive force between them would exceed three million tons. The entire edifice of electronics rests on controlling a *tiny* imbalance in this near-perfect neutrality — moving a fractional excess of electrons from one place to another.

Charge is conserved — it cannot be created or destroyed, only moved. The continuity equation encodes this:

$$\frac{\partial \rho}{\partial t} + \nabla \cdot \mathbf{J} = 0$$

where $\rho$ is charge density (C/m³) and $\mathbf{J}$ is current density (A/m²). This says: the rate at which charge density decreases at a point equals the net current flowing out of that point. Kirchhoff's current law — the sum of currents at a node is zero — is a direct consequence.

### Coulomb's Law: Force Between Charges

Two point charges $q_1$ and $q_2$ separated by distance $r$ exert a force on each other:

$$F = \frac{1}{4\pi\epsilon_0} \frac{q_1 q_2}{r^2}$$

The constant $\epsilon_0 \approx 8.85 \times 10^{-12}\ \text{F/m}$ is the **permittivity of free space** — it characterizes how easily electric fields propagate through vacuum. Like charges repel, unlike attract; the sign of $q_1 q_2$ gives you the direction automatically. The $1/r^2$ dependence is geometrically inevitable: force spreads over the surface of a sphere of area $4\pi r^2$, so intensity falls as the inverse square. The electromagnetic force is roughly $10^{36}$ times stronger than gravity between two electrons — which is why even a tiny charge imbalance produces macroscopically observable forces.

### Electric Field: Decoupling Source from Effect

Rather than describing forces between specific pairs of charges, define the **electric field** $\mathbf{E}$ as the force per unit positive test charge at a point:

$$\mathbf{E}(\mathbf{r}) = \frac{\mathbf{F}}{q_\text{test}}$$

This decoupling is the key abstraction: the source charge distribution creates $\mathbf{E}$ everywhere in space, and then *any* charge $q$ placed at position $\mathbf{r}$ experiences $\mathbf{F} = q\mathbf{E}(\mathbf{r})$, independently of the source. You do not need to re-solve the many-body problem for each new charge you introduce. A point charge $q$ at the origin creates:

$$\mathbf{E}(\mathbf{r}) = \frac{1}{4\pi\epsilon_0} \frac{q}{r^2} \hat{r}$$

radiating outward for positive $q$, inward for negative.

### Electric Potential: The Scalar Shortcut

Moving a charge against an electric field requires work. The **electric potential** $V$ at a point is the work per unit positive charge required to bring a test charge from a reference (usually infinity or ground) to that point:

$$V(\mathbf{r}) = -\int_{\mathbf{r}_\text{ref}}^{\mathbf{r}} \mathbf{E} \cdot d\mathbf{s}$$

Potential is scalar — you add contributions from multiple sources algebraically rather than vectorially, which makes it far easier to compute than $\mathbf{E}$ directly. Once you have $V$, recover $\mathbf{E}$ via:

$$\mathbf{E} = -\nabla V$$

The gradient points in the direction of steepest increase; the negative sign means $\mathbf{E}$ points from high to low potential, exactly as a ball accelerates downhill. **Voltage** in circuit analysis is the potential difference $\Delta V = V_a - V_b$ between two nodes. A charge $q$ moving through potential difference $\Delta V$ exchanges energy $W = q\,\Delta V$ with the field — releasing it if moving from high to low, absorbing it if moving against the field.

### Current: Moving Charge

**Current** $I$ is the net charge flowing past a cross-section per unit time:

$$I = \frac{dq}{dt}$$

measured in amperes (C/s). Electrons are the actual carriers in metals, but current direction is conventionally defined as the direction positive charges would move — opposite to electron drift. This convention is arbitrary and harmless as long as you are consistent. What matters physically is the product $qv$: whether you move negative charges one way or positive charges the other, the resulting current is the same.

The drift velocity of electrons in a copper wire carrying typical currents is surprisingly slow — on the order of $10^{-4}$ m/s. The electrical *signal* propagates at near-$c$ because it is the field configuration, not the electrons themselves, that propagates down the wire.

### Resistance and Ohm's Law

Charges moving through a conductor scatter off lattice vibrations (phonons) and impurities, losing directed momentum. This irreversible loss is **resistance** $R$ (ohms, $\Omega$). For ohmic materials over normal operating ranges:

$$V = IR$$

The linearity holds because scattering events are random and frequent: the net drift is a steady-state balance between field acceleration and collision braking. Resistance scales with conductor geometry as:

$$R = \rho \frac{L}{A}$$

where $\rho$ is resistivity (Ω·m), $L$ is length, and $A$ is cross-sectional area. This is why long, thin traces on a PCB have higher resistance than short, wide ones. Power dissipated as heat is:

$$P = IV = I^2 R = \frac{V^2}{R}$$

This is Joule heating — the energy extracted from the field permanently lost to thermal motion, not stored.

### Capacitance: Storing Charge in an Electric Field

A **capacitor** is two conductors separated by an insulator (dielectric). Forcing charge $+q$ onto one plate and $-q$ onto the other establishes a potential difference $V$ between them:

$$q = CV$$

where $C$ is **capacitance** in farads. For a parallel-plate capacitor with plate area $A$ and separation $d$:

$$C = \frac{\epsilon_0 \epsilon_r A}{d}$$

where $\epsilon_r$ is the relative permittivity of the dielectric (1 for vacuum, 2–10 for common insulators). The energy stored is in the electric field between the plates:

$$U = \frac{1}{2}CV^2 = \frac{q^2}{2C}$$

A capacitor does not dissipate energy — it stores and returns it. Current through a capacitor is:

$$I = C\frac{dV}{dt}$$

This is why capacitors block DC (constant $V$ means $dV/dt = 0$ means $I = 0$) and pass AC. It is also why capacitors on power rails suppress voltage spikes: a sudden surge of charge has $dV/dt$ limited by $C$, and the capacitor absorbs the excess charge before the voltage can rise far.

### Inductance: Storing Energy in a Magnetic Field

A current $I$ through a wire produces a **magnetic field** $\mathbf{B}$ encircling it (right-hand rule). For a solenoid of $n$ turns per unit length:

$$B = \mu_0 n I$$

where $\mu_0 = 4\pi \times 10^{-7}\ \text{H/m}$ is the permeability of free space. By Faraday's law, a *changing* magnetic flux $\Phi_B = \int \mathbf{B} \cdot d\mathbf{A}$ through a loop induces an EMF opposing that change:

$$\mathcal{E} = -\frac{d\Phi_B}{dt}$$

The negative sign (Lenz's law) is not arbitrary — it is required by energy conservation. An **inductor** formalizes this: when current through it changes, the resulting change in $\mathbf{B}$ induces a voltage opposing that change:

$$V = L\frac{dI}{dt}$$

where $L$ is inductance in henries. Energy is stored in the magnetic field:

$$U = \frac{1}{2}LI^2$$

The danger: if you interrupt current through an inductor suddenly (large negative $dI/dt$), it generates whatever voltage is necessary to maintain that current. For a relay coil with $L = 10\ \text{mH}$ and current $I = 100\ \text{mA}$ interrupted in $\Delta t = 1\ \mu\text{s}$:

$$V_\text{spike} = L\frac{\Delta I}{\Delta t} = (10^{-2})\frac{0.1}{10^{-6}} = 1000\ \text{V}$$

A 1000 V spike on a 5 V logic rail destroys transistors instantly. A flyback diode across the inductor provides a current path that lets
