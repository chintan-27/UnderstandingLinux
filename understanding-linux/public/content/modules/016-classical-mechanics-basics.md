---
id: 16
title: "Classical mechanics basics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Core Concepts
Classical mechanics describes the deterministic evolution of a system of particles under forces, grounded in three empirical laws formulated by Newton.  
- **First law (inertia):** A body remains at rest or in uniform motion unless acted upon by a net force. This defines an *inertial reference frame*—a coordinate system in which Newton’s second law holds without fictitious forces.  
- **Second law (momentum):** The net force equals the time‑rate of change of linear momentum,  
  $$\mathbf{F} = \frac{d\mathbf{p}}{dt},\qquad \mathbf{p}=m\mathbf{v}.$$  
  For constant mass this reduces to the familiar $\mathbf{F}=m\mathbf{a}$, linking force directly to the second time‑derivative of position.  
- **Third law (action‑reaction):** Forces occur in equal‑and‑opposite pairs, guaranteeing conservation of momentum for an isolated system.  

From these laws we derive the kinematic and dynamic quantities used to describe motion.  

**Kinematics** is the geometric description of motion, independent of forces. For a particle with trajectory $\mathbf{r}(t)$:  

- Displacement: $\Delta\mathbf{r} = \mathbf{r}(t)-\mathbf{r}(t_0)$  
- Velocity (instantaneous): $\mathbf{v}(t)=\dfrac{d\mathbf{r}}{dt}$  
- Acceleration: $\mathbf{a}(t)=\dfrac{d\mathbf{v}}{dt}=\dfrac{d^2\mathbf{r}}{dt^2}$  

These are vector quantities; in one dimension we drop the bold notation and work with signed scalars.  

**Dynamics** applies the second law to relate forces to motion. Besides force we introduce:  

- Impulse: $\mathbf{J}=\int_{t_0}^{t_1}\mathbf{F}\,dt = \Delta\mathbf{p}$  
- Work: $W=\int_{\mathbf{r}_0}^{\mathbf{r}_1}\mathbf{F}\cdot d\mathbf{r}$  

When the force is conservative it can be written as the negative gradient of a scalar potential $U(\mathbf{r})$: $\mathbf{F}=-\nabla U$.  

**Energy** follows from the work‑energy theorem. Integrating Newton’s second law along the trajectory gives  

$$W = \int \mathbf{F}\cdot d\mathbf{r}
    = \int m\mathbf{a}\cdot d\mathbf{r}
    = m\int \frac{d\mathbf{v}}{dt}\cdot\mathbf{v}\,dt
    = \frac12 m\bigl(v^2-v_0^2\bigr)
    = \Delta K,$$  

where kinetic energy is defined as $K=\frac12 mv^2$. For a conservative force, $W=-\Delta U$, so  

$$\Delta K + \Delta U = 0\quad\Longrightarrow\quad E = K+U = \text{constant}.$$  

Thus mechanical energy is conserved iff all forces derive from a potential (no friction, air resistance, etc.).  

---

## How It Works
### Kinematic equations for constant acceleration  
Assume $a$ is constant. Starting from the definitions  

$$a = \frac{dv}{dt}\quad\Longrightarrow\quad v(t)=v_0 + at\tag{1}$$  

Integrate once more:  

$$v = \frac{ds}{dt}\quad\Longrightarrow\quad 
s(t)=s_0 + v_0t + \frac12 a t^2\tag{2}$$  

Eliminate $t$ between (1) and (2):  

$$v^2 = v_0^2 + 2a\,(s-s_0)\tag{3}$$  

These three relations are sufficient to solve any one‑dimensional constant‑acceleration problem.  

### Work‑energy derivation  
The infinitesimal work done by a force $\mathbf{F}$ over displacement $d\mathbf{r}$ is $dW=\mathbf{F}\cdot d\mathbf{r}$. Using $\mathbf{F}=m\mathbf{a}$ and $d\mathbf{r}=\mathbf{v}dt$,  

$$dW = m\mathbf{a}\cdot\mathbf{v}\,dt
    = m\frac{d\mathbf{v}}{dt}\cdot\mathbf{v}\,dt
    = \frac{d}{dt}\!\left(\frac12 m v^2\right)dt
    = dK.$$  

Integrating from state 0 to 1 yields $W=K_1-K_0$. If $\mathbf{F}=-\nabla U$, then $W=-(U_1-U_0)$ and $K+U$ is invariant.  

### Gravitational potential near Earth’s surface  
For a uniform gravitational field $\mathbf{F}=-mg\hat{\mathbf{y}}$, the potential satisfying $-\nabla U = \mathbf{F}$ is  

$$U(y)=mgy + C,$$  

where the additive constant $C$ is irrelevant; only differences matter.  

---

## Worked Examples
### Example 1 – Constant velocity  
A car travels at $v_0=30\ \text{m/s}$ with zero acceleration for $t=10\ \text{s}$.  

1. Since $a=0$, Eq. (2) reduces to $s = s_0 + v_0 t$.  
2. Take $s_0=0$ (origin at start).  
3. $s = 0 + (30\ \text{m/s})(10\ \text{s}) = 300\ \text{m}$.  

**Answer:** $300\ \text{m}$.  

### Example 2 – Constant force on a block  
A $5\ \text{kg}$ block is pulled by a horizontal force $F=10\ \text{N}$, starting from rest.  

1. Acceleration from Newton’s second law:  
   $$a = \frac{F}{m} = \frac{10\ \text{N}}{5\ \text{kg}} = 2\ \text{m/s}^2.$$  
2. Velocity after $t=2\ \text{s}$ using Eq. (1):  
   $$v = v_0 + at = 0 + (2\ \text{m/s}^2)(2\ \text{s}) = 4\ \text{m/s}.$$  
3. Displacement using Eq. (2):  
   $$s = 0 + 0\cdot t + \frac12 (2\ \text{m/s}^2)(2\ \text{s})^2
     = \frac12 \cdot 2 \cdot 4 = 4\ \text{m}.$$  

**Answer:** $a=2\ \text{m/s}^2$, $v=4\ \text{m/s}$ after $2\ \text{s}$, having traveled $4\ \text{m}$.  

### Example 3 – Falling ball (energy conversion)  
A $2\ \text{kg}$ ball is dropped from rest at height $h=10\ \text{m}$. Take $g=9.8\ \text{m/s}^2$.  

1. Potential energy at release:  
   $$U_i = mgh = (2\ \text{kg})(9.8\ \text{m/s}^2)(10\ \text{m}) = 196\ \text{J}.$$  
2. Just before impact the height is zero, so $U_f=0$. Mechanical energy conservation gives $K_f = U_i - U_f = 196\ \text{J}$.  
3. Verify via kinematics: final speed from Eq. (3) with $v_0=0$, $a=g$, $s-s_0 = h$:  
   $$v^2 = 0 + 2gh = 2(9.8)(10) = 196\ \text{(m/s)}^2
     \;\Longrightarrow\; v = \sqrt{196}=14\ \text{m/s}.$$  
   Then $K_f = \tfrac12 m v^2 = \tfrac12 (2)(196)=196\ \text{J}$, matching the energy method.  

**Answer:** Kinetic energy just before impact $=196\ \text{J}$ (speed $=14\ \text{m/s}$).  

---

## Common Mistakes
| # | Misconception | Why it’s wrong | Correct approach |
|---|---------------|----------------|------------------|
| 1 | **Using $F=ma$ for variable‑mass systems** (e.g., a rocket ejecting fuel). | Newton’s second law in the form $F=ma$ assumes constant mass. For changing mass the correct law is $F = \frac{dp}{dt}= m a + v_{\text{rel}}\dot{m}$, where $v_{\text{rel}}$ is the exhaust velocity relative to the body. | Apply the momentum form $F=\dot{p}$ or include the thrust term $v_{\text{rel}}\dot{m}$ explicitly. |
| 2 | **Assuming mechanical energy is always conserved** even when friction or air resistance acts. | Non‑conservative forces do work that converts mechanical energy into internal (thermal) energy; the work‑energy theorem reads $\Delta K = W_{\text{cons}} + W_{\text{nc}}$, with $W_{\text{nc}}\neq0$. | Compute work done by non‑conservative forces separately, or include a dissipated energy term $E_{\text{th}}$ in the energy balance. |
| 3 | **Using $s = vt$ when acceleration is present** (treating velocity as constant). | The relation $s=vt$ holds only for constant $v$. If $a\neq0$, the average velocity over the interval is $\bar v = (v_0+v)/2$, and $s = \bar v\,t$. | Use the full kinematic equations (Eqs. 1‑3) or integrate $v(t)$ when $a$ varies. |
| 4 | **Believing potential energy depends on the path taken**. | Potential energy is defined only for conservative forces, for which the work done is path‑independent. For non‑conservative forces no scalar potential exists; attempting to assign one leads to contradictions. | Check whether $\nabla\times\mathbf{F}=0$ (in 3‑D) or $\partial F_x/\partial y = \partial F_y/\partial x$ (in 2‑D). If not, treat the force as non‑conservative and use work‑energy directly. |

---

## Exercises
1. **Easy** – A train accelerates uniformly from rest at $a=1.5\ \text{m/s}^2$.  
   (a) How far does it travel in $t=20\ \text{s}$?  
   (b) What is its speed at that instant?  

2. **Medium** – A $12\ \text{kg}$ crate is pulled across a horizontal floor by a force $F=50\ \text{N}$ applied $30^\circ$ above the horizontal. The coefficient of kinetic friction is $\mu_k=0.25$. The crate starts from rest.  
   (a) Determine the net horizontal acceleration.  
   (b) Find the speed after $t=5\ \text{s}$.  

3. **Hard** – A particle of mass $m=0.5\ \text{kg}$ moves along the $x$‑axis under the Hooke‑law force $F(x) = -k x$ with $k=200\ \text{N/m}$. It is released from rest at $x=0.10\ \text{m}$.  
   (a) Using energy conservation, compute the speed when the particle passes the equilibrium point $x=0$.  
   (b) What is the period of small‑oscillation motion? (You may quote the result $T=2\pi\sqrt{m/k}$ after verifying it from the energy solution.)  

---

## Linux Connection
Classical mechanics is not just abstract theory; it appears in concrete Linux tools, kernel interfaces, and measurement techniques.

### 1. High‑resolution timing with `clock_gettime`
The monotonic clock provides the time base needed for numerical integration of $s(t)$, $v(t)$, etc.

```c
/* timer.c – prints monotonic time with nanosecond resolution */
#define _POSIX_C_SOURCE 199309L
#include <time.h>
#include <stdio.h>
int main(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    printf("%.9f s\n", ts.tv_sec + ts.tv_nsec * 1e-9);
}
```
Compile and run:  
```bash
gcc -Wall -O2 timer.c -o timer
./timer
```
The output can be fed into a simulation loop that updates $s$ using Eq. (2).

### 2. Reading process CPU time from `/proc`
The file `/proc/<pid>/stat` contains user and system times (in clock ticks). Converting to seconds yields the effective “action” integral $\int \mathbf{F}\cdot d\mathbf{r}$ for a process (approximated by CPU cycles).

```bash
pid=$$                              # current shell PID
clktck=$(getconf CLK_TCK)           # ticks per second (usually 100)
awk -v clk=$clktck '
    {printf "utime=%.3f s, stime=%.3f s\n", $14/clk, $15/clk}
' /proc/$pid/stat
```
If you run a CPU‑bound program, you can see how the accumulated user time grows linearly with the simulated “force” (work) performed.

### 3. Performance counters with `perf`
A tiny program that numerically integrates $v = v_0 + at$ lets us see how many CPU cycles are spent per integration step—directly linking the **force‑acceleration** cycle to hardware work.

`simulate.c`:
```c
#include <stdio.h>
int main(void) {
    double s = 0.0, v = 0.0, a =
