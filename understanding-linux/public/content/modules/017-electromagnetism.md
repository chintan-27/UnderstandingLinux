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

Every transistor in your CPU is a voltage-controlled switch: a gate voltage above a threshold repels or attracts enough charge to open or close a conductive channel. Every DDR5 memory cell is a capacitor holding charge that the controller must periodically refresh before it leaks away. Every PCIe lane is a transmission line where signal propagation speed, impedance mismatch, and electromagnetic interference are engineering constraints, not incidental details. The Linux kernel's decisions — why `mmap` alignment matters, why DMA buffers need cache coherency, why interrupt latency has a floor — trace back to physics that this module makes explicit.

---

## Core Concepts

### Charge: The Primitive Quantity

Electric charge is quantized in units of $e \approx 1.602 \times 10^{-19}$ C. Electrons carry $-e$, protons carry $+e$. Charge is *strictly conserved* — not approximately, not on average, but exactly: no process in classical or quantum physics has ever been observed to create or destroy net charge.

Ordinary matter is neutral to extraordinary precision. The electromagnetic force between two charges is:

$$F = k\frac{q_1 q_2}{r^2}, \quad k = \frac{1}{4\pi\epsilon_0} \approx 8.99 \times 10^9 \; \text{N·m}^2/\text{C}^2$$

For reference, $k/G \approx 10^{36}$ — electromagnetism is $10^{36}$ times stronger than gravity at the same scales. The reason you don't notice is that bulk matter maintains charge balance to better than one part in $10^{20}$. Even a $10^{-10}$ fractional imbalance in the charge of two 1 g objects 1 m apart would produce a force of roughly $10^9$ N. The near-perfect cancellation is not luck; it is enforced by the enormous energy cost of any imbalance.

### Electric Field: Why the Abstraction Earns Its Keep

Instead of tracking force between every pair of charges, we define the field $\mathbf{E}$ as the force per unit positive test charge at a point, *before* any test charge is placed there:

$$\mathbf{E}(\mathbf{r}) = \frac{1}{4\pi\epsilon_0} \frac{Q}{r^2} \hat{r}$$

This is not just bookkeeping. The field is *physically real*: it carries energy and momentum, propagates at $c$, and exerts force on whatever charge later appears there. The energy density stored in an electric field is:

$$u_E = \frac{1}{2}\epsilon_0 E^2 \quad \text{(J/m}^3\text{)}$$

This is the quantity that matters when a capacitor stores energy — not charge on plates in isolation, but field energy in the gap between them.

### Electric Potential: Scalar Bookkeeping for Vector Work

The potential $V$ at position $\mathbf{r}$ is the work done per unit charge by an external agent moving a positive test charge from a reference point (infinity, by convention) to $\mathbf{r}$, against the field:

$$V(\mathbf{r}) = -\int_\infty^{\mathbf{r}} \mathbf{E} \cdot d\mathbf{s}$$

For a point charge $Q$: $V = \frac{Q}{4\pi\epsilon_0 r}$. The field is recovered by:

$$\mathbf{E} = -\nabla V$$

The gradient points uphill in potential; the field points downhill. Crucially, potential is a *scalar*, so superposition of contributions from multiple charges is simple addition rather than vector addition. Moving charge $q$ through potential difference $\Delta V$ transfers energy $W = q\Delta V$ — this is why "voltage" is the useful engineering quantity.

### Current, Resistance, and Why Ohm's Law Is Not Fundamental

Current is the rate of charge transport:

$$I = \frac{dq}{dt} \quad \text{(amperes = C/s)}$$

In a metal, conduction electrons have a thermal velocity $\sim 10^6$ m/s, but their *net drift* in an applied field is slow — typically $\sim 10^{-4}$ m/s. The drift velocity $v_d$ is proportional to the applied field because each electron accelerates briefly, then scatters off the lattice and loses its momentum. The mean free time $\tau$ between collisions gives:

$$v_d = \frac{eE\tau}{m_e}$$

Current density is $J = nev_d = \sigma E$, where $\sigma = ne^2\tau/m_e$ is conductivity. Ohm's Law $V = IR$ follows from integrating this over the geometry of a resistor. It fails when $\tau$ becomes field-dependent (high fields, semiconductors, superconductors). The kernel driver model for a device implicitly assumes some version of Ohm's Law; this is why semiconductor device behavior at extreme voltages requires special handling in ACPI tables and thermal throttling logic.

### Magnetic Field: The Relativistic Consequence of Current

A stationary charge creates $\mathbf{E}$ only. A moving charge — equivalently, a current — creates a magnetic field $\mathbf{B}$ that curls around the direction of motion (right-hand rule). The force on a charge $q$ moving with velocity $\mathbf{v}$:

$$\mathbf{F} = q\mathbf{v} \times \mathbf{B}$$

The cross product means $\mathbf{F} \perp \mathbf{v}$, so the magnetic force does *no work* — it deflects without accelerating. The physical content here is subtle: the magnetic force on a current-carrying wire is actually just the electrostatic force between moving charges, transformed by special relativity. Length contraction of a moving charge distribution changes its apparent charge density from the frame of a moving test charge. Magnetism is, in this sense, *relativistic electricity*.

### Induction: Why Changing Fields Cannot Exist in Isolation

Faraday's Law: a time-varying magnetic flux $\Phi_B = \int \mathbf{B} \cdot d\mathbf{A}$ through any loop drives an electromotive force around that loop:

$$\mathcal{E} = -\frac{d\Phi_B}{dt}$$

The negative sign is Lenz's Law: the induced current creates a field opposing the flux change. This is not a separate law — it is conservation of energy in field form. If the induced field aided the change, you would get runaway amplification; nature forbids it.

Maxwell's addition: a *time-varying electric flux* also drives a magnetic field — the displacement current $\epsilon_0 \frac{d\Phi_E}{dt}$. Maxwell added this term not from experiment but from *dimensional consistency*: without it, Ampere's Law gave contradictory results for open surfaces. The consequence is that $\mathbf{E}$ and $\mathbf{B}$ sustain each other in vacuum and propagate as waves at:

$$c = \frac{1}{\sqrt{\mu_0 \epsilon_0}} = \frac{1}{\sqrt{(4\pi \times 10^{-7})(8.854 \times 10^{-12})}} \approx 2.998 \times 10^8 \; \text{m/s}$$

This derivation — predicting the speed of light from static measurements of $\mu_0$ and $\epsilon_0$ — was one of the most consequential predictions in physics.

---

## How It Works

### Maxwell's Equations (Integral Form)

$$\oint_S \mathbf{E} \cdot d\mathbf{A} = \frac{Q_\text{enc}}{\epsilon_0} \tag{Gauss — } \mathbf{E} \text{ sourced by charge}$$

$$\oint_S \mathbf{B} \cdot d\mathbf{A} = 0 \tag{no magnetic monopoles}$$

$$\oint_C \mathbf{E} \cdot d\mathbf{s} = -\frac{d\Phi_B}{dt} \tag{Faraday — changing } \mathbf{B} \text{ drives } \mathbf{E}$$

$$\oint_C \mathbf{B} \cdot d\mathbf{s} = \mu_0 I_\text{enc} + \mu_0\epsilon_0 \frac{d\Phi_E}{dt} \tag{Ampere-Maxwell}$$

Together with the Lorentz force $\mathbf{F} = q(\mathbf{E} + \mathbf{v} \times \mathbf{B})$, these four equations are the complete classical theory. Circuit theory, transmission line theory, antenna design, and optics are all limiting cases or approximations derived from these equations under specific boundary conditions.

### The Capacitor: Storing Energy in a Field

A parallel-plate capacitor: plates of area $A$, separation $d$, charge $\pm q$ on opposing plates. Gauss's Law gives a uniform field between the plates:

$$E = \frac{\sigma}{\epsilon_0} = \frac{q}{\epsilon_0 A}$$

Integrating across the gap: $V = Ed = \frac{qd}{\epsilon_0 A}$. Define capacitance:

$$C = \frac{\epsilon_0 A}{d}$$

so $q = CV$. The stored energy is the integral of work done charging from zero:

$$U = \int_0^Q \frac{q}{C}\,dq = \frac{Q^2}{2C} = \frac{1}{2}CV^2$$

This energy lives in the electric field between the plates, with density $u_E = \frac{1}{2}\epsilon_0 E^2$. Verify: the volume between the plates is $Ad$, so $u_E \cdot Ad = \frac{1}{2}\epsilon_0 \left(\frac{V}{d}\right)^2 Ad
