---
id: 20
title: "Atomic physics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Core Concepts
### Atomic Structure and Quantum Numbers
An atom consists of a nucleus (Z protons, N neutrons) surrounded by electrons whose states are solutions of the time‑independent Schrödinger equation for a Coulomb potential  
\[
\hat H\psi(\mathbf r)=\left[-\frac{\hbar^2}{2m_e}\nabla^2-\frac{Ze^2}{4\pi\varepsilon_0 r}\right]\psi(\mathbf r)=E\psi(\mathbf r).
\]  
Separation of variables in spherical coordinates yields  
\[
\psi_{nlm_lm_s}(r,\theta,\phi)=R_{nl}(r)Y_{l}^{m_l}(\theta,\phi)\chi_{m_s},
\]  
where the quantum numbers are:
* principal \(n\in\mathbb{N}^+\) – determines the radial node count and energy,
* orbital \(l=0,\dots,n-1\) – related to the magnitude of orbital angular momentum \(\hat L^2\),
* magnetic \(m_l=-l,\dots,l\) – projection of \(\hat L_z\),
* spin \(m_s=\pm\frac12\) – projection of \(\hat S_z\).

From the radial equation one obtains the quantization condition  
\[
n=n_r+l+1\quad (n_r=0,1,2,\dots),
\]  
leading to the hydrogen‑like energy spectrum  
\[
E_n=-\frac{Z^2R_\infty}{n^2},\qquad 
R_\infty=\frac{m_e e^4}{8\varepsilon_0^2 h^3c}=13.6057\;\text{eV}.
\]  
For a multi‑electron atom the energy also depends on \(l\) through shielding; a useful first‑order estimate is Slater’s rules, giving an effective nuclear charge \(Z_{\rm eff}=Z-S\) and  
\[
E_{nl}\approx -\frac{Z_{\rm eff}^2R_\infty}{n^2}.
\]

### Electron Shells, Subshells and the Pauli Principle
The Pauli exclusion principle follows from the requirement that the total electronic wavefunction be antisymmetric under particle exchange. Consequently, no two electrons may share the identical set \((n,l,m_l,m_s)\).  
Each subshell \((n,l)\) can accommodate \(2(2l+1)\) electrons (two spin states). The capacities are:
| Subshell | \(l\) | Max electrons |
|----------|------|----------------|
| s        | 0    | 2 |
| p        | 1    | 6 |
| d        | 2    | 10|
| f        | 3    | 14|

The Aufbau principle fills subshells in order of increasing \(n+l\); for equal \(n+l\) the lower \(n\) fills first. Hund’s rule maximizes total spin \(S\) (and thus exchange energy) by placing electrons singly in degenerate orbitals before pairing.

### Quantization Beyond Energy
Angular momentum is quantized:  
\[
\langle\hat L^2\rangle = l(l+1)\hbar^2,\qquad 
\langle\hat L_z\rangle = m_l\hbar,
\]  
and spin satisfies \(\hat S^2 = s(s+1)\hbar^2\) with \(s=\frac12\).  
Fine‑structure corrections arise from relativistic kinetic energy, spin‑orbit coupling  
\[
\hat H_{\rm SO}=\frac{1}{2m_e^2c^2}\frac{1}{r}\frac{dV}{dr}\,\hat{\mathbf L}\cdot\hat{\mathbf S},
\]  
leading to level splittings of order \(\alpha^2 Z^4\) (where \(\alpha\approx1/137\)).

---

## How It Works
1. **Solve the Central‑Potential Problem**  
   The Schrödinger equation separates; the radial part yields associated Laguerre polynomials \(L_{n_r}^{2l+1}(2\rho)\) with \(\rho = Zr/(na_0)\). The quantization condition \(n=n_r+l+1\) follows from demanding normalizable solutions. Energy depends only on \(n\) for a pure Coulomb field.

2. **Introduce Electron‑Electron Repulsion**  
   Treat the multi‑electron Hamiltonian as  
   \[
   \hat H=\sum_i\left[-\frac{\hbar^2}{2m_e}\nabla_i^2-\frac{Ze^2}{4\pi\varepsilon_0 r_i}\right]
          +\sum_{i<j}\frac{e^2}{4\pi\varepsilon_0 r_{ij}} .
   \]  
   Using a self‑consistent field (Hartree‑Fock) approach, each electron moves in an effective potential \(V_{\rm eff}(r)\) that includes shielding. Slater’s rules give a quick estimate of the shielding constant \(S\).

3. **Apply the Pauli Principle and Hund’s Rule**  
   After obtaining the set of available one‑electron orbitals \((n,l,m_l)\), fill them:
   * Fill lowest‑energy orbitals first (Aufbau).
   * Distribute electrons among degenerate orbitals to maximize total spin (Hund).
   * Pair opposite spins only when necessary (Pauli).

4. **Resulting Electron Configuration**  
   The final configuration is a compact notation, e.g. \(1s^2 2s^2 2p^6 3s^1\) for Na. The total energy is the sum of orbital energies plus exchange and correlation corrections.

---

## Worked Examples
### Example 1: Electron Configuration of Sodium (Z=11)
1. List electrons: 11.
2. Apply Aufbau: fill 1s (2), 2s (2), 2p (6) → 10 electrons used.
3. Remaining 1 electron goes to the next lowest orbital, 3s.
4. Configuration:  
   \[
   \boxed{1s^2\,2s^2\,2p^6\,3s^1}
   \]  
   Check: \(2+2+6+1=11\).

### Example 2: Energy of the 3s Electron in Sodium (Effective‑Charge Approximation)
Using Slater’s rules for a 3s electron:
* Same group (3s,3p): 0 other electrons → 0.
* n‑1 shell (n=2): 8 electrons, each contributes 0.85 → \(8\times0.85=6.8\).
* n‑2 or lower (n=1): 2 electrons, each contributes 1.00 → \(2\times1.00=2.0\).
* Shielding \(S = 6.8+2.0 = 8.8\).
* Effective charge \(Z_{\rm eff}=Z-S = 11-8.8 = 2.2\).

Energy estimate:  
\[
E_{3s}\approx -\frac{Z_{\rm eff}^2R_\infty}{3^2}
          = -\frac{(2.2)^2\times13.6\;\text{eV}}{9}
          = -\frac{4.84\times13.6}{9}\;\text{eV}
          \approx -7.31\;\text{eV}.
\]  
(The experimental ionization energy of Na is 5.14 eV; the discrepancy shows the need for correlation corrections beyond Slater.)

### Example 3: Term Symbol for Ground‑State Carbon (Z=6)
Configuration: \(1s^2 2s^2 2p^2\).  
Two equivalent p‑electrons (\(l=1\) each).  
Possible microstates give total orbital \(L=0,1,2\) and total spin \(S=0,1\).  
Applying Hund’s rule (max \(S\)) → \(S=1\) (triplet).  
Among triplet states, the lowest energy corresponds to the smallest \(L\) → \(L=0\) (S term).  
Thus ground‑state term: \(\boxed{^3P}\) (actually \(^3P_0\) after spin‑orbit splitting; the fine‑structure yields \(J=0,1,2\) with \(E_{J}= \frac{\lambda}{2}[J(J+1)-L(L+1)-S(S+1)]\)).  

---

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Reasoning |
|---------|----------------|-------------------|
| **Assuming \(E_n\) depends on \(l\) for hydrogen** | The Coulomb potential is spherically symmetric; the radial equation yields energies that depend only on \(n\). Any \(l\)‑dependence would require a non‑Coulomb term (e.g., screening). | For hydrogenic ions, \(E_n=-Z^2R_\infty/n^2\). Multi‑electron \(l\) dependence arises only from electron‑electron repulsion, not from the central nucleus alone. |
| **Filling 3d before 4s because 3 < 4** | Aufbau uses the \(n+l\) rule, not just \(n\). For 3d: \(n+l=3+2=5\); for 4s: \(4+0=4\). Hence 4s fills first. | The correct order is … 3p → 4s → 3d → 4p… . Ignoring this leads to configurations like \([Ar]3d^2\) instead of \([Ar]4s^2 3d^2\) for Ti. |
| **Neglecting exchange energy when applying Hund’s rule** | Parallel spins lower the Coulomb repulsion due to the antisymmetry of the spatial wavefunction (exchange). Pairing spins prematurely raises energy. | For two p‑electrons, the triplet (\(S=1\)) state lies ~1.5 eV lower than the singlet (\(S=0\)) for carbon; ignoring this predicts the wrong ground state. |
| **Using the hydrogenic formula for multi‑electron valence electrons** | Shielding reduces the effective nuclear charge; using \(Z\) overestimates binding. | Slater’s rules or Hartree‑Fock calculations give \(Z_{\rm eff}<Z\); e.g., for Na 3s, \(Z_{\rm eff}\approx2.2\) not 11. |
| **Confusing \(m_l\) with magnetic quantum number of spin** | \(m_l\) refers to orbital angular momentum projection; spin projection is \(m_s\). They add to give total \(m_j=m_l+m_s\) only in coupled basis. | In LS coupling, good quantum numbers are \(L,S,M_L,M_S\); in jj coupling, they are \(j_i,m_{j_i}\). Mixing them leads to incorrect term symbols. |

---

## Exercises
### Easy
1. Write the ground‑state electron configuration of neon (Z=10).  
2. Using the hydrogenic formula, compute the energy of the \(n=4\) level for He\(^+\) (Z=2).

### Medium
3. For fluorine (Z=9), estimate the effective nuclear charge felt by a 2p electron using Slater’s rules, then calculate its orbital energy.  
4. Determine the possible term symbols for the \(p^3\) configuration (e.g., N atom) and identify the ground state according to Hund’s rule.

### Hard
5. Derive the fine‑structure splitting of the hydrogen \(n=2\) level (2S\(_{1/2}\) vs 2P\(_{1/2}\),2P\(_{3/2}\)) starting from the spin‑orbit Hamiltonian \(\hat H_{\rm SO}\). Express the splitting in terms of \(\alpha\), \(R_\infty\), and \(n\).  
6. A lithium atom (Z=3) is placed in a uniform magnetic field \(B=2\;\text{T}\). Calculate the Zeeman shift of the \(2s\) (\(m_s=+\tfrac12\)) and \(2p\) (\(m_l=+1, m_s=+\tfrac12\)) states, assuming LS coupling and using \(g_L=1\), \(g_s\approx2.0023\).  

---

## Linux Connection
### Atomic Operations in the Kernel
The Linux kernel provides an atomic integer type (`atomic_t`) and a set of functions that execute indivisible read‑modify‑write instructions, essential for lock‑free synchronization.

```c
/* atomic_inc_and_test.c – example from <linux/atomic.h> */
#include <linux/atomic.h>
#include <linux/kernel.h>

static atomic_t counter = ATOMIC_INIT(0);

void increment_and_check(void)
{
    /* atomically increment and test if result is zero */
    if (atomic_inc_and_return(&counter) == 0)
        pr_info("counter wrapped to zero\n");
}
```
*Compilation:*  
```bash
# Build as a kernel module
make -C /lib/modules/$(uname -r)/build M=$(pwd) modules
```
*Insertion:*  
```bash
sudo insmod atomic_inc_and_test.ko
dmesg | tail
```
The underlying instruction on x86‑64 is `lock xadd`, which guarantees atomicity across cores.

### Futexes (Fast Userspace Mutexes)
Futexes combine user‑space atomic operations with kernel‑mediated blocking only when contention occurs.

```c
/* futex_lock.c – simple spin‑then‑block mutex */
#include <linux/futex.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <stdatomic.h>
#include <stdio.h>

static atomic_int futex_var = ATOMIC_VAR_INIT(0);

int futex_wait(int *addr, int val)
{
    return syscall(SYS_futex, addr, FUTEX_WAIT, val, NULL, NULL, 0);
}
int futex_wake(int *addr)
{
    return syscall(SYS_futex, addr, FUTEX_WAKE, 1, NULL, NULL, 0);
}
void lock(void)
{
    while (atomic_exchange_explicit(&futex_var, 1, memory_order_acquire)) {
        futex_wait(&futex_var, 1);
    }
}
void unlock(void)
{
    atomic_store_explicit(&futex_var, 0, memory_order_release);
    futex_wake(&futex_var);
}
```
*Compile & run:*  
```bash
gcc -pthread -o futex_lock futex_lock.c
./futex_lock   # (requires a test harness that spawns threads)
```

### Quantum‑Chemistry Software on Linux
Popular first‑principles packages (Quantum ESPRESSO, VASP, ABINIT) are built and executed on Linux clusters. Example: running a self‑consistent field (SCF) calculation with Quantum ESPRESSO’s `pw.x`.

```bash
# Install Quantum ESPRESSO (Ubuntu)
sudo apt-get install quantum-espresso

# Create a simple Si bulk input file (scf.in)
cat > scf.in <<EOF
&control
    calculation = 'scf',
    prefix = 'si',
    pseudo_dir = './pseudo/',
    outdir = './tmp/'
/
&system
    ibrav = 2,  celldm(1) = 10.2,  nat = 2,  ntyp = 1,
    ecutwfc = 30.0,
    ecutrho = 240.0,
/
&electrons
    conv_thr = 1.0e-8,
/
ATOMIC_SPECIES
 Si  28.0855  Si.pz-vbc.UPF
ATOMIC_POSITIONS crystal
 Si 0.00 0.00 0.00
 Si 0.25 0.25 0.25
K_POINTS automatic
 4 4 4 1 1 1
EOF

# Run the calculation
pw.x -scf < scf.in > scf.out
```
The output `scf.out` contains total energy, forces, and eigenvalue spectra—direct applications of the atomic‑physics concepts discussed (energy levels, quantization, Pauli principle).

### Why This Matters
A solid grasp of atomic structure underpins the reliability of the very tools Linux developers rely on:
* **Atomic primitives** (`atomic_t`, futexes, `cmpxchg`) translate the Pauli exclusion principle—no two threads may occupy the same logical state without coordination—into efficient, lock‑free primitives that scale on SMP systems.
* **Materials‑science simulations** (DFT, tight‑binding, quantum Monte‑carlo) solve the Schrödinger equation for solids; accurate energies and wave‑functions enable prediction of thermal conductivity, mechanical strength, and semiconductor band gaps, guiding kernel power‑scheduling and driver optimization.
* **Quantum‑computing frameworks** (Qiskit, Cirq, QuTiP) run on Linux to simulate qubit dynamics; the underlying Hamiltonians are built from atomic energy levels, spin‑orbit coupling, and exchange interactions—exactly the quantization rules derived here.
* Understanding shielding and effective charge explains why certain system calls (e.g., `mmap` with `PROT_READ|PROT_WRITE`) behave differently across architectures: the electron density of the substrate influences surface states and thus device‑level timing.

By linking first‑principles atomic physics to concrete Linux mechanisms—atomic ops, futexes, DFT codes, and quantum‑simulation stacks—students see how microscopic quantization governs macroscopic software performance and correctness. This connection is the payoff: mastering the theory enables the design of faster, safer, and more innovative Linux‑based systems.
