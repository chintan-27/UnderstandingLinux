---
id: 18
title: "Thermodynamics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Why This Matters

Every computation dissipates energy as heat. This is not an engineering inconvenience — it is a consequence of the second law of thermodynamics, and it sets hard limits on what processors, storage devices, and data centers can do. Without thermodynamics, you cannot reason about why your CPU throttles under load, why SSDs wear out faster at high temperatures, why cooling systems fail in predictable ways, or why doubling clock frequency requires more than doubling power. The Linux kernel exposes thermal state through hardware sensors, thermal zones, and governors precisely because heat is a first-class constraint on computation — ignore it, and hardware fails silently or permanently.

---

## Core Concepts

### Temperature

Temperature measures the average kinetic energy of the microscopic constituents of a system. For an ideal gas, each translational degree of freedom carries $\frac{1}{2}kT$ of energy, where $k = 1.38 \times 10^{-23}\ \text{J/K}$ is Boltzmann's constant. Two objects in thermal contact exchange energy until their temperatures equalize — that equilibrium condition *is* the operational definition of equal temperature, not a consequence of it.

For an ideal gas of $N$ molecules, pressure arises from counting molecular collisions with a wall:

$$pV = NkT$$

Temperature enters as the proportionality between pressure and molecular kinetic energy density. This is why a sealed container at fixed volume shows rising pressure as you heat it — more energetic molecules hit the walls harder and more often.

### Heat

Heat is energy in transit due to a temperature difference. It is not a property a system *has* — it is something that flows *between* systems. Once absorbed, heat becomes internal energy: molecular translation, vibration, rotation. A block of metal at 300 K has internal energy $U$; the 50 J that flowed into it when you touched it was heat $Q$. After the transfer, there is no "heat" left to point to — only $U$ increased.

### The First Law

Energy is conserved. For a closed system:

$$\Delta U = Q - W$$

where $Q$ is heat absorbed by the system and $W$ is work done *by* the system. Work done by an expanding gas against a piston:

$$W = \int_{V_a}^{V_b} p \, dV$$

The first law is silent on direction. A process and its exact time-reverse are both consistent with energy conservation. The constraint on direction comes from the second law.

### The Second Law and the Carnot Limit

The first law permits turning work entirely into heat — friction does this. The second law forbids the unconditional reverse: **you cannot convert heat to work at a single temperature with no other change to the universe.** Any heat engine must dump some fraction of its input heat into a cold reservoir; the rest becomes work.

Carnot showed that all reversible engines operating between a hot reservoir at $T_1$ and a cold reservoir at $T_2$ achieve the same efficiency, independent of working fluid:

$$\eta_{\text{Carnot}} = 1 - \frac{T_2}{T_1}$$

The proof does not rely on any property of steam or gas. It follows from a logical argument: if two reversible engines operating between the same reservoirs had different efficiencies, you could run the less efficient one in reverse as a heat pump and use the more efficient one to drive it, extracting net work from a single reservoir — violating the second law. Therefore all reversible engines are equally efficient.

For a reversible engine, conservation of entropy across the cycle gives:

$$\frac{Q_1}{T_1} = \frac{Q_2}{T_2}$$

This is the origin of entropy as a useful quantity, and it holds universally for reversible processes regardless of working substance.

### Entropy

Entropy $S$ is defined by the differential:

$$dS = \frac{dQ_{\text{rev}}}{T}$$

where the subscript means the heat transfer must be carried out reversibly. In a reversible cycle, $\oint dS = 0$ — entropy gained at $T_1$ is exactly returned at $T_2$. For any irreversible process (friction, free expansion, heat flow across a finite $\Delta T$), entropy is created:

$$\Delta S \geq \frac{Q}{T}$$

Equality holds only for reversible processes. Entropy is a state function — it depends only on where you are, not how you got there. For a perfect gas:

$$S(V, T) = Nk \left( \ln V + \frac{1}{\gamma - 1} \ln T \right) + a$$

where $\gamma = C_p / C_v$ and $a$ is the chemical constant (set by the Nernst theorem: $S \to 0$ as $T \to 0$).

The physical content: entropy measures how many microscopic arrangements are consistent with the macroscopic state you observe. A hot resistor and a cold one in contact will reach equilibrium not because energy conservation demands it, but because there are overwhelmingly more microscopic states consistent with "both at the same intermediate temperature" than with "one hot, one cold." The process runs forward because probability is so extreme it looks like a law.

### Adiabatic Processes

An adiabatic process exchanges no heat ($Q = 0$, therefore $\Delta S = 0$ for a reversible adiabat). For an ideal gas:

$$pV^\gamma = \text{const}, \qquad TV^{\gamma-1} = \text{const}$$

These follow directly from $dU = -p\,dV$ (first law with $Q=0$) and the ideal gas relations. The second form is why rapid compression heats a gas: shrink $V$, and $T$ must rise to keep $TV^{\gamma-1}$ constant. Refrigeration exploits the reverse: force a refrigerant through an expansion valve, $V$ rises, $T$ falls, and the cold fluid absorbs heat from the CPU or data center.

### Dissipation

Dissipation is the irreversible conversion of ordered energy into disordered thermal energy. For a resistor:

$$P = I^2 R = \frac{V^2}{R}$$

For a CMOS transistor switching at frequency $f$ with load capacitance $C$ and supply voltage $V_{dd}$:

$$P_{\text{dynamic}} = \alpha C V_{dd}^2 f$$

where $\alpha$ is the activity factor (fraction of cycles that actually switch). This is why reducing $V_{dd}$ is so effective: power scales as $V_{dd}^2$. Halving voltage cuts dynamic power by a factor of four — but at the cost of slower switching, since gate delay scales as $V_{dd}/(V_{dd} - V_t)^2$ for a MOSFET with threshold $V_t$.

There is also static (leakage) power that flows even when transistors are nominally off:

$$P_{\text{static}} = I_{\text{leak}} \cdot V_{dd}$$

As transistors shrink, $I_{\text{leak}}$ grows because gate oxide becomes thinner and sub-threshold leakage increases. At sufficiently small process nodes, static power rivals dynamic power — this is why idle servers still run hot.

The minimum energy to irreversibly erase one bit of information is set by Landauer's principle:

$$E_{\min} = kT \ln 2 \approx 2.85 \times 10^{-21}\ \text{J at 300 K}$$

Modern transistors dissipate roughly $10^6$ times this per operation. Landauer's limit is not a manufacturing target for the next decade; it is a thermodynamic floor that tells you the industry has at least six orders of magnitude of headroom before physics itself is the binding constraint on energy per bit.

---

## How It Works

### The Carnot Cycle in Detail

A Carnot engine runs four reversible steps on an ideal gas:

1. **Isothermal expansion** at $T_1$: absorb $Q_1$ from the hot reservoir; gas expands, $\Delta U = 0$ (isothermal), so $W_1 = Q_1 = NkT_1 \ln(V_b/V_a)$
2. **Adiabatic expansion**: no heat exchange; gas cools from $T_1$ to $T_2$, doing additional work $W_2 = -\Delta U = C_v(T_1 - T_2)$
3. **Isothermal compression** at $T_2$: dump $Q_2$ into cold reservoir; $Q_2 = NkT_2 \ln(V_c/V_d)$
4. **Adiabatic compression**: gas returns from $T_2$ to $T_1$; no heat exchange

The two adiabatic steps constrain the volume ratios. From $TV^{\gamma-1} = \text{const}$:

$$T_1 V_b^{\gamma-1} = T_2 V_c^{\gamma-1}, \qquad T_1 V_a^{\gamma-1} = T_2 V_d^{\gamma-1}$$

Dividing these: $V_b/V_a = V_c/V_d$. Therefore the logarithms in $Q_1$ and $Q_2$ are equal, giving $Q_1/T_1 = Q_2/T_2$, confirming entropy balance. Net work:

$$W = Q_1 - Q_2 = Q_1\left(1 - \frac{T_2}{T_1}\right)$$

Nothing in this derivation required an ideal gas — the volume-ratio equality follows from the adiabatic relations, and the entropy result is universal.

### Entropy as a State Function

Moving an ideal gas from $(V_a, T_a)$ to $(V_b, T_b)$ along two different reversible paths should yield the same $\int dQ/T$. Verify using the entropy formula:

$$\Delta S = Nk \ln\frac{V_b}{V_a} + \frac{Nk}{\gamma-1} \ln\frac{T_b}{T_a}$$

This depends only on the endpoints, not the path — confirming $S$ is a state function. Cross-check with the adiabatic condition: $dS = 0$ implies $\ln V + \frac{1
