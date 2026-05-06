---
id: 39
title: "Boolean algebra"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Core Concepts  
### Boolean Algebra as an Algebraic Structure  
Boolean algebra is the algebraic structure \((\{0,1\}, \land, \lor, \lnot, 0, 1)\) where \(\land\) (AND) and \(\lor\) (OR) are binary operations, \(\lnot\) (NOT) is unary, and the constants 0 and 1 act as identities for \(\lor\) and \(\land\) respectively.  
It satisfies the Huntington postulates:  

1. **Commutativity**: \(x\land y = y\land x\), \(x\lor y = y\lor x\)  
2. **Distributivity**: \(x\land (y\lor z) = (x\land y)\lor (x\land z)\), \(x\lor (y\land z) = (x\lor y)\land (x\lor z)\)  
3. **Identity**: \(x\land 1 = x\), \(x\lor 0 = x\)  
4. **Complement**: \(x\land \lnot x = 0\), \(x\lor \lnot x = 1\)  

From these we derive idempotence (\(x\land x = x\)), absorption (\(x\lor (x\land y) = x\)), and the duality principle (swap \(\land\leftrightarrow\lor\) and \(0\leftrightarrow1\)).  

### Canonical Forms  
Any Boolean function \(f:\{0,1\}^n\to\{0,1\}\) can be uniquely expressed as a **sum‑of‑minterms** (canonical SOP) or a **product‑of‑maxterms** (canonical POS).  
A minterm is a conjunction of all variables where each appears either uncomplemented (\(\bar{x_i}=x_i\)) or complemented (\(\bar{x_i}=\lnot x_i\)) according to the row index; a maxterm is the dual disjunction.  
Because there are \(2^n\) possible input rows, there are \(2^{2^n}\) distinct Boolean functions—this explains why truth tables grow exponentially.

### Karnaugh Map (K‑Map) Visualization  
A K‑Map arranges the \(2^n\) minterms in a Gray‑code order so that adjacent cells differ by exactly one literal.  
Grouping powers‑of‑two of adjacent 1‑cells yields prime implicants; the minimal SOP is obtained by covering all 1‑cells with the fewest largest groups.  
This visual method exploits the adjacency property: if two minterms differ in only one variable, that variable can be eliminated (consensus theorem).

### De Morgan’s Theorem  
\[
\lnot (x\land y) = \lnot x \lor \lnot y \qquad
\lnot (x\lor y) = \lnot x \land \lnot y
\]  
Proof by exhaustive truth table (four rows) shows equality for every assignment; the theorem follows from the complement postulate and distributivity.

## How It Works  
### Systematic Simplification Procedure  

1. **Convert to Canonical SOP** – write the function as a sum of minterms (use truth table or algebraic expansion).  
2. **Apply Boolean Laws** – use idempotence, absorption, and consensus to eliminate literals:  
   - *Idempotent*: \(x\land x = x\)  
   - *Absorption*: \(x\lor (x\land y) = x\)  
   - *Consensus*: \(xy\lor \lnot x z\lor yz = xy\lor \lnot x z\)  
3. **Use De Morgan** – push negations inward only when a NAND/NOR form is needed for hardware mapping.  
4. **Karnaugh Map Reduction** – plot minterms, group maximal power‑of‑two blocks, read off simplified SOP.  
5. **Verify** – evaluate the simplified expression on all \(2^n\) inputs; equality to original confirms correctness.  

Each step is justified:  
- Canonical SOP is unique, so any equivalent expression must cover the same minterm set.  
- Boolean laws are derived directly from the Huntington postulates, preserving logical equivalence.  
- Consensus removes a term that is logically redundant because its contribution is already covered by the other two terms.  
- K‑Map grouping corresponds to applying the consensus theorem repeatedly; the largest groups eliminate the most literals.  

### Example Derivation (Consensus)  
Starting from \(F = xy \lor \lnot x z \lor yz\):  

\[
\begin{aligned}
F &= xy \lor \lnot x z \lor yz \\
  &= xy \lor \lnot x z \lor (y z)(x \lor \lnot x) &&\text{(multiply by }x\lor\lnot x =1)\\
  &= xy \lor \lnot x z \lor (xyz \lor \lnot x y z) \\
  &= (xy \lor xyz) \lor (\lnot x z \lor \lnot x y z) \\
  &= xy(1\lor z) \lor \lnot x z(1\lor y) &&\text{(distribution)}\\
  &= xy \lor \lnot x z &&\text{(absorption: }1\lor z =1\text{)}
\end{aligned}
\]  

Thus the middle term \(yz\) is consensus and can be dropped.

## Worked Examples  

### Example 1: Simplify \(F = (A\land B)\lor (C\land D)\)  

| Step | Expression | Reasoning |
|------|------------|-----------|
| 0 | \((A\land B)\lor (C\land D)\) | given |
| 1 | No common factor; treat as SOP with minterms: \(AB\bar{C}\bar{D} \lor AB\bar{C}D \lor A\bar{B}CD \lor ABCD\) (expand each product to 4‑literal minterms) | distributive law |
| 2 | Plot on 4‑var K‑Map (variables order A B C D). 1‑cells occupy corners of two separate 2‑cell blocks: one block for \(AB\) (C,D arbitrary) and one for \(CD\) (A,B arbitrary). | adjacency |
| 3 | Largest groups: group 1 → \(AB\) (covers cells where \(AB=11\)), group 2 → \(CD\). | each group size 4 → eliminates two variables |
| 4 | Result: \(F = AB \lor CD\) | already minimal; no further absorption possible |
| 5 | Verification: evaluate for all 16 inputs; matches original truth table. | — |

### Example 2: Apply De Morgan to \(\lnot (A\land B)\)  

1. Start: \(\lnot (A\land B)\).  
2. By De Morgan: \(\lnot A \lor \lnot B\).  
3. No further simplification (no absorption, no idempotence).  
4. Result: \(\lnot A \lor \lnot B\).  

### Example 3: Simplify \(G = (A\land B)\lor (C\land D)\lor (E\land F)\)  

1. Write as SOP: three disjoint product terms.  
2. 6‑variable K‑Map is impractical manually; note each term occupies a 2‑dimensional subcube where its two variables are 1 and the others are free.  
3. No overlapping 1‑cells between terms (different variable pairs), so no larger groups can be formed.  
4. Hence the expression is already minimal: \(G = AB \lor CD \lor EF\).  
5. If a don’t‑care condition were known (e.g., \(A\bar{B}C\bar{D}E\bar{F}=0\)), we could potentially merge, but absent such info the SOP is optimal.  

## Common Mistakes  

| Mistake | Why It’s Wrong | How to Avoid |
|---------|----------------|--------------|
| **Assuming \(\lnot (x\lor y) = \lnot x \lor \lnot y\)** | This swaps OR for AND incorrectly; De Morgan requires swapping the operator. The truth table shows \(\lnot (0\lor0)=1\) while \(\lnot0\lor\lnot0=1\) (OK for this row) but \(\lnot(1\lor0)=0\) vs \(\lnot1\lor\lnot0=0\lor1=1\) (fails). | Always recall: negation flips AND↔OR; verify with a single‑row counterexample. |
| **Dropping a term because it “looks” redundant without checking consensus** | Example: \(xy\lor \lnot x z\lor yz\) – the term \(yz\) *is* redundant, but in \(xy\lor \lnot x z\lor xz\) the middle term \(xz\) is **not** redundant; dropping it changes function. | Apply consensus theorem explicitly: a term \(yz\) is redundant only when the other two terms are \(xy\) and \(\lnot x z\). |
| **Over‑grouping in K‑Maps (non‑power‑of‑two blocks)** | Grouping 3 cells violates the adjacency property; the resulting product term does not correspond to any implicant. | Only group sizes 1,2,4,8,…; if a set isn’t a power of two, split it. |
| **Misapplying absorption: \(x\lor \bar{x}y = x\) vs \(x\lor xy = x\)** | The first is **false** (e.g., \(x=0,y=1\) gives LHS=1, RHS=0). The second is true. | Remember absorption requires the same variable uncomplemented in both terms: \(x\lor (x\land y)=x\). |
| **Confusing duality with complement** | Duality exchanges \(\land\leftrightarrow\lor\) and constants; complement adds negations. Applying both simultaneously yields nonsense. | Keep transformations separate; verify each step with truth table if unsure. |

## Exercises  

1. **(Easy)** Simplify \(F = (A\land B)\lor (A\land \lnot B)\lor (\lnot A\land B)\) using Boolean laws; show each step.  
2. **(Medium)** Use a Karnaugh map to minimize \(G = \sum m(0,1,2,5,6,7,8,9,10,14,15)\) for four variables \(A,B,C,D\). Provide the prime implicant chart and final SOP.  
3. **(Hard)** Prove the consensus theorem \(xy\lor \lnot x z\lor yz = xy\lor \lnot x z\) by algebraic manipulation (no truth tables). Then apply it to simplify \(H = (P\land Q)\lor (\lnot P\land R)\lor (Q\land R)\lor (\lnot Q\land \lnot R)\).  

## Linux Connection  
### Bitwise Operations in Kernel Code  
The Linux kernel treats sets of flags as bit fields in integers; Boolean algebra directly governs testing, setting, and clearing those bits.

*Example – checking if a network interface is up:*  
```c
#include <linux/netdevice.h>   /* struct net_device */
#include <linux/bitops.h>      /* test_bit */

static bool is_iface_up(const struct net_device *dev)
{
    /* IFF_UP is bit 0 in dev->flags */
    return test_bit(0, &dev->flags);   /* equivalent to (dev->flags & (1<<0)) != 0 */
}
```
`test_bit` expands to a compile‑time constant shift and an `&` operation, i.e.  
\[
\texttt{dev->flags} \,\&\, (1\ll 0) \neq 0.
\]

*Example – setting the “dirty” flag on an inode:*  
```c
#include <linux/fs.h>          /* struct inode */
#include <linux/bitops.h>      /* set_bit */

static void mark_inode_dirty(struct inode *inode)
{
    set_bit(I_DIRTY_SYNC, &inode->i_state);   /* I_DIRTY_SYNC = 1 */
}
```
Here the operation performed is  
\[
\texttt{inode->i\_state} \gets \texttt{inode->i\_state} \lor (1\ll \texttt{I\_DIRTY\_SYNC}).
\]

*Example – clearing a flag with an atomic operation:*  
```c
#include <linux/atomic.h>

static void clear_softirq_pending(unsigned int nr)
{
    /* clear bit nr in softirq_mask */
    __clear_bit(nr, &softirq_mask);
}
```
The underlying instruction is  
\[
\texttt{softirq\_mask} \gets \texttt{softirq\_mask} \land \lnot(1\ll \texttt{nr}).
\]

### Real Subsystems & Files  

| Subsystem | Flag/bit location | Meaning | Typical accessor |
|-----------|-------------------|---------|------------------|
| **VFS** | `inode->i_state` (in `<linux/fs.h>`) | I_DIRTY_SYNC, I_DIRTY_DATASYNC, I_NEW … | `test_bit/set_bit/clear_bit` |
| **Network** | `net_device->flags` (`<linux/netdevice.h>`) | IFF_UP, IFF_RUNNING, IFF_PROMISC … | `dev->flags & IFF_UP` |
| **Block layer** | `request->cmd_flags` (`<linux/blkdev.h>`) | REQ_WRITE, REQ_FLUSH, REQ_DISCARD … | `req->cmd_flags & REQ_WRITE` |
| **Scheduler** | `task->flags` (`<linux/sched.h>`) | PF_KTHREAD, PF_EXITING, PF_VCPU … | `test_bit(PF_KTHREAD, &task->flags)` |
| **Syscalls** | `open(2)` flags (`<asm/fcntl.h>`) | O_RDONLY, O_WRONLY, O_CREAT, O_TRUNC … | `flags & O_CREAT` |

### Runnable Shell Commands  

*Inspecting a process’s flag field:*  
```bash
# Show the 'flags' field (hex) of the current shell process
cat /proc/self/stat | awk '{print strtonum("0x"$23)}'
```
The 23rd field in `/proc/self/stat` is the process flag (`flags`).  

*Testing a specific kernel config option (which is a Boolean macro):*  
```bash
# Check if CONFIG_PREEMPT is enabled in the running kernel
grep -s CONFIG_PREEMPT /boot/config-$(uname -r) && echo "enabled" || echo "disabled"
```
`CONFIG_PREEMPT` expands to either `y` (true) or is absent (false) – a direct Boolean interpretation.

*Using bitwise arithmetic in bash to compute a mask:*  
```bash
# Compute mask for bits 0, 2, and 5 set
mask=$(( (1<<0) | (1<<2) | (1<<5) ))
echo "mask = $mask (0x$(printf '%x' $mask))"
```
Result: `mask = 37 (0x25)`.

### Why the Kernel Prefers Bitwise  
- **Atomicity**: Single‑instruction `AND`, `OR`, `XOR` on a word is atomic on most architectures, avoiding locks for flag updates.  
- **Cache efficiency**: Flags reside in the same cache line as the structure they describe, reducing false sharing.  
- **Memory footprint**: Storing 32 independent Boolean states in a 32‑bit integer saves space versus an array of `bool`.  

## Why This Matters  
Boolean algebra is not an abstract exercise; it is the exact mathematics that governs how the Linux kernel makes decisions with zero overhead. Every time a driver checks whether a device is ready, a filesystem decides if an inode needs flushing, or the scheduler determines if a task should be pre‑empted, the underlying operation is a Boolean expression reduced to one or two machine instructions. Mastering the axioms, theorems, and minimization techniques lets you:

*Predict* the effect of a flag change without running code.  
*Diagnose* misbehaving kernels by reasoning about which bits must be set or cleared.  
*Write* lock‑free, high‑performance synchronization primitives that rely on correct algebraic manipulation of bit masks.  

Beyond the kernel, the same principles appear in userspace: configuring `ssh` options (`-o` flags), constructing `iptables` rules, or shaping `systemd` service dependencies. By internalizing the derivations—not just memorizing truth tables—you acquire a transferable skill for any domain where discrete logical states must be combined, minimized, and reasoned about rigorously. This deep understanding transforms you from a script‑user into a systems thinker capable of designing correct, efficient, and provably correct software.
