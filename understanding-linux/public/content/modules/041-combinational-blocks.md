---
id: 41
title: "Combinational blocks"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Core Concepts
### Combinational Logic Foundations
A combinational block computes a pure Boolean function \(F:\{0,1\}^k\rightarrow\{0,1\}^m\) with no internal state. Its output at any instant depends **only** on the present values of its inputs. This property follows directly from the definition of a combinational circuit: directed acyclic graph of logic gates where each gate’s output is a function of its inputs and there are no feedback loops. Consequently, the block can be described by a truth table, a sum‑of‑products (SOP) expression, or a product‑of‑sums (POS) expression derived from that table.

### Half Adder
A half‑adder adds two one‑bit operands \(a,b\).  
From the truth table:

| a | b | Σ (sum) | C<sub>out</sub> (carry) |
|---|---|---------|------------------------|
| 0 | 0 | 0       | 0                      |
| 0 | 1 | 1       | 0                      |
| 1 | 0 | 1       | 0                      |
| 1 | 1 | 0       | 1                      |

We obtain the minimal SOP:
\[
\Sigma = a\oplus b = a\bar b + \bar a b,\qquad
C_{out}=a b .
\]
Thus the half‑adder can be built with one XOR and one AND gate. The critical‑path delay is
\[
t_{HA}=t_{XOR}+t_{AND}.
\]

### Full Adder
A full‑adder adds three one‑bit operands \(a,b,c_{in}\). Its truth table yields:
\[
\Sigma = a\oplus b\oplus c_{in},
\qquad
C_{out}= (a b) + (c_{in}(a\oplus b)).
\]
The carry expression can be factored as
\[
C_{out}= (a b) + (c_{in} (a\oplus b)) = (a b) + (c_{in} a) + (c_{in} b).
\]
Implementing with two half‑adders and an OR gate gives the same delay:
\[
t_{FA}=2t_{XOR}+t_{AND}+t_{OR}.
\]

### Ripple‑Carry Adder (RCA)
An *n‑bit* RCA chains *n* full‑adders, propagating the carry from LSB to MSB. The worst‑case propagation delay occurs when a carry generated at the LSB must ripple through all stages:
\[
t_{RCA}=n\;t_{FA}.
\]
The linear scaling motivates carry‑look‑ahead (CLA) designs, where the carry‑generate \(G_i=a_i b_i\) and carry‑propagate \(P_i=a_i\oplus b_i\) are computed in parallel and the carry for stage *i* is
\[
C_{i+1}=G_i + P_i C_i,
\]
which can be resolved in \(O(\log n)\) gate levels using a carry‑look‑ahead tree.

### Multiplexer (MUX)
A 2‑to‑1 MUX selects between inputs \(d_0,d_1\) based on select \(s\):
\[
Y = \bar s d_0 + s d_1.
\]
For an *n*-to‑1 MUX (with *n*=2^m), the select lines encode the index *i* and the output is
\[
Y = \bigvee_{i=0}^{n-1} \bigl(\bigwedge_{j=0}^{m-1} \ell_{ij}\, d_i\bigr),
\]
where \(\ell_{ij}\) is either the select line or its complement according to the binary representation of *i*. The gate count grows as \(O(nm)\); the delay is the delay of one AND‑OR level plus the decoder that produces the \(\ell_{ij}\) terms.

### Decoder
An *n*-to‑\(2^n\) binary decoder asserts exactly one output line corresponding to the binary value of its *n*‑bit input. For input vector \(x_{n-1}\dots x_0\), output *i* is
\[
O_i = \bigwedge_{j=0}^{n-1} \begin{cases}
x_j & \text{if bit }j\text{ of }i = 1\\
\bar x_j & \text{if bit }j\text{ of }i = 0
\end{cases}.
\]
Thus each output is an *n*-input AND gate (possibly with inverted inputs). Decoders are the basis of memory‑address decoding: the address lines drive a decoder that enables a single row/column in a RAM array.

### Encoder
A priority encoder receives a one‑hot (or arbitrary) set of request lines \(r_{n-1}\dots r_0\) and outputs the binary index of the highest‑priority active request. If priority is given to the most‑significant bit, the boolean equations are:
\[
\begin{aligned}
g_{n-1} &= r_{n-1}\\
g_{i}   &= r_i + (\bar r_{i+1} g_{i+1})\quad\text{for }i=n-2\dots0\\
\text{bin}_k &= \bigvee_{i: \text{bit }k\text{ of }i=1} g_i .
\end{aligned}
\]
The critical path traverses the chain of \(g_i\) computations, giving \(O(n)\) delay; a parallel prefix network reduces this to \(O(\log n)\).

### Comparator
An *n*-bit magnitude comparator produces three signals: \(A=B\), \(A<B\), \(A>B\). Starting from the LSB, we propagate equality and inequality:
\[
\begin{aligned}
e_0 &= (a_0 \equiv b_0) = \bar a_0 b_0 + a_0 \bar b_0\\
gt_0 &= a_0 \bar b_0\\
lt_0 &= \bar a_0 b_0\\
e_{i+1} &= e_i \cdot (a_{i+1}\equiv b_{i+1})\\
gt_{i+1} &= gt_i + e_i\cdot(a_{i+1}\bar b_{i+1})\\
lt_{i+1} &= lt_i + e_i\cdot(\bar a_{i+1} b_{i+1}) .
\end{aligned}
\]
The final outputs are \(A=B:e_n\), \(A<B:lt_n\), \(A>B:gt_n\). The ripple structure gives \(O(n)\) delay; a tree‑based comparator achieves \(O(\log n)\).

### Shifter
A logical left shifter by *k* positions computes \(y_i = x_{i-k}\) (with zeros shifted in). A logical right shifter does the opposite. An arithmetic right shifter replicates the sign bit:
\[
y_i = \begin{cases}
x_{i-k} & i\ge k\\
x_{n-1} & i<k \text{ (sign extension)} .
\end{cases}
\]
Shifters are implemented with multiplexers: each output bit selects either the appropriate input bit or a constant (0 or sign). A barrel shifter uses log‑n stages of 2‑to‑1 MUXes, giving \(O(\log n)\) delay and \(O(n\log n)\) gate count.

### ALU Pieces
An ALU combines the above primitives. A typical 4‑function ALU (add, subtract, AND, OR) uses:
* Two operands \(A,B\) and a carry‑in \(C_{in}\) (for add/sub).
* A function select \(S[1:0]\) steering a 4‑to‑1 MUX whose inputs are:
  * \(A+B+C_{in}\) (adder output),
  * \(A-B-C_{in}\) (subtractor, realized by adding the two’s complement of \(B\)),
  * \(A\land B\),
  * \(A\lor B\).
The selector logic is combinational; the critical path is the MUX delay plus the adder delay (the longest path).  

---

## How It Works
### Gate‑Level Realization from Boolean Algebra
Every combinational block begins with a Boolean expression derived from its truth table. Using Boolean algebra (or Karnaugh maps) we obtain a minimal sum‑of‑products form. Each product term corresponds to an AND gate (with possible inverted inputs), and the OR of all product terms yields the output. If the fan‑in of gates is limited (e.g., typical CMOS NAND/NOR gates have ≤4 inputs), we factor the expression to meet the technology constraints.

### Example: 4‑bit Ripple‑Carry Adder Derivation
For bit *i*:
\[
\begin{aligned}
\Sigma_i &= a_i \oplus b_i \oplus c_i,\\
c_{i+1}  &= (a_i b_i) + (c_i (a_i\oplus b_i)).
\end{aligned}
\]
Define propagate \(p_i = a_i\oplus b_i\) and generate \(g_i = a_i b_i\). Then:
\[
c_{i+1}=g_i + p_i c_i .
\]
Unrolling:
\[
c_n = g_{n-1} + p_{n-1}g_{n-2} + p_{n-1}p_{n-2}g_{n-3} + \dots + \bigl(\prod_{k=0}^{n-1}p_k\bigr)c_0 .
\]
The carry‑look‑ahead processor computes all \(g_i\) and \(p_i\) in parallel (one gate level) and then evaluates the above expression using a prefix‑tree of associative operators \((g,p)\rightarrow(g+p g,\,p p)\). The tree depth is \(\lceil\log_2 n\rceil\), giving the logarithmic delay bound.

### Timing Analysis
Assume a standard CMOS library where:
* \(t_{AND}=t_{OR}=60\) ps,
* \(t_{XOR}=120\) ps,
* \(t_{MUX}=80\) ps (2‑to‑1).

*Half‑adder*: \(t_{HA}=t_{XOR}+t_{AND}=180\) ps.  
*Full‑adder*: \(t_{FA}=2t_{XOR}+t_{AND}+t_{OR}=2·120+60+60=360\) ps.  
*4‑bit RCA*: \(t_{RCA}=4·360=1.44\) ns.  
*4‑bit CLA*: compute \(p,g\) (1·120 ps), then two levels of prefix (each 2·80 ps for the AND‑OR combine) → ≈120 ps+2·160 ps=440 ps, plus the final XOR for sum (120 ps) → ≈560 ps, **≈3.5× faster** than the RCA for 4 bits; the advantage grows with *n*.

### Power Considerations
Dynamic power \(P_{dyn}=α C V^2 f\) where *α* is switching activity. In a ripple‑carry adder, the carry toggles on roughly half the clock cycles, leading to higher α than in a CLA where carry signals switch less frequently due to parallel computation.

---

## Worked Examples
### Example 1: 8‑bit Ripple‑Carry Adder – Step‑by‑Step
We add \(A=0b10110101\) (181) and \(B=0b01101011\) (107).

| i | a_i | b_i | c_i | Σ_i = a_i⊕b_i⊕c_i | c_{i+1}=a_i b_i + c_i(a_i⊕b_i) |
|---|-----|-----|-----|-------------------|--------------------------------|
|0|1|1|0|0|1|
|1|0|1|1|0| (0·1)+(1·1)=1|
|2|1|0|1|0| (1·0)+(1·1)=1|
|3|1|1|1|1| (1·1)+(1·0)=1|
|4|0|0|1|1| (0·0)+(1·0)=0|
|5|1|1|0|0|1|
|6|0|0|1|1|0|
|7|1|0|0|1|0|

Result bits Σ₇…Σ₀ = **0 1 0 0 0 0 0 0** = 0b01000000 (64) with final carry out c₈ = 0 → correct sum 181+107=288 → 0b1 0010 0000 (9‑bit). The extra carry appears as the ninth bit.

### Example 2: 4‑to‑1 Multiplexer Using Two‑Level Structure
Select lines \(s_1 s_0\) encode index *i*. Internal signals:
\[
\begin{aligned}
y_0 &= \bar s_1 \bar s_0 d_0\\
y_1 &= \bar s_1 s_0 d_1\\
y_2 &= s_1 \bar s_0 d_2\\
y_3 &= s_1 s_0 d_3
\end{aligned}
\]
Output \(Y = y_0+y_1+y_2+y_3\).  
If \(s_1s_0=10\) (i=2): \(\bar s_1=0, s_1=1, \bar s_0=1, s_0=0\) → only \(y_2 = d_2\) propagates.

### Example 3: 8‑bit Priority Encoder – Derivation
Requests \(r_7 … r_0\). Define group‑generate \(G_{[i:j]} = r_i \lor (\bar r_{i+1} G_{[i+1:j]})\). The highest‑priority index is the most significant set bit. Binary output:
\[
\begin{aligned}
\text{bin}_2 &= r_7 \lor r_6 \lor r_5 \lor r_4\\
\text{bin}_1 &= (r_7 \lor r_6) \lor (\bar r_7 \bar r_6 \land (r_5 \lor r_4))\\
\text{bin}_0 &= r_7 \lor (\bar r_7 \land r_6) \lor (\bar r_7 \bar r_6 \land r_5) \lor (\bar r_7 \bar r_6 \bar r_5 \land r_4) \lor \dots
\end{aligned}
\]
Implemented with a tree of 2‑input OR gates and AND‑inverters gives \(O(\log n)\) delay.

---

## Common Mistakes
| Mistake | Why It’s Wrong | How to Fix |
|---|---|---|
| **Assuming zero propagation delay** – treating combinational logic as instantaneous. | Real gates have finite τ; in pipelines this causes race conditions or missed setup times. | Perform static timing analysis (e.g., using `OpenSTA`) and insert pipeline registers if the critical path exceeds the clock period. |
| **Using a ripple‑carry adder for wide datapaths without checking timing**. | Delay grows linearly; for 64‑bit adds at 2 GHz the path (~23 ns) exceeds the clock period. | Replace with a carry‑look‑ahead or carry‑select adder; verify with `grep -R "cla_" arch/*/include/asm/` in the kernel to see existing implementations. |
| **Implementing a multiplexer with a conditional operator (`?:`) in hardware description without synthesizing to a MUX**. | Some tools infer a priority encoder instead of a balanced MUX, increasing delay and area. | Explicitly instantiate a 2‑to‑1 MUX primitive or use a case‑statement with all select values covered; verify netlist with `yosys -p "show"` . |
| **Neglecting sign extension in arithmetic right shifts**. | Shifting a negative number incorrectly changes its value, breaking algorithms that rely on sign‑preserving shift. | Use `>>` arithmetic shift in C (`signed int`) or explicitly replicate the MSB in hardware: `y = (x >> k) | (~0 << (w-k)) & (x>>(w-1))`. |
| **Assuming an encoder output is valid when all request lines are zero**. | The encoder may output an arbitrary index, causing misdecoding. | Add a validity flag `valid = |r|` (OR of all requests) and gate the output with it. |
| **Overlooking fan‑out limits when driving many decoder outputs from a single address line**. | Excessive capacitance slows the line and can cause logical errors. | Buffer the address line with a series of inverters or use a hierarchical decoder (pre‑decode + final decode). |

---

## Exercises
### Easy
1. **Half‑Adder from NAND only** – Write a C function `half_adder_nand(a,b)` that returns `{sum,carry}` using only the bitwise NAND operation (`~(a&b)`).  
2. **2‑to‑1 MUX truth table** – Generate the truth table for inputs `a,b,sel` and output `y`; verify with a Bash one‑liner:
   ```bash
   for a in 0 1; do for b in 0 1; do for s in 0 1; do
       y=$(( s ? b : a ));
       printf "%d%d%d => %d\n" "$a" "$b" "$s" "$y";
   done; done; done
   ```

### Medium
3. **4‑bit Ripple‑Carry Adder** – Implement `rca4(a,b)` returning sum and carry-out; test against random pairs and compare to `a+b`.  
4. **8‑bit Barrel Shifter (logical left)** – Using only 2‑to‑1 MUX primitives (function `mux2(x,y,s)`), construct a shifter that shifts by a 3‑bit amount. Provide the C code and a test harness that prints input, shift amount, and output in hex.  
5. **Priority Encoder (4‑bit)** – Write `pri_enc4(r)` that returns the index of the highest‑set bit and a valid flag; demonstrate with all 16 input patterns.

### Hard
6. **Carry‑Look‑Ahead 8‑bit Adder** – Derive the generate/propagate equations and implement `cla8(a,b)`. Measure worst‑case delay by counting gate levels (assume each level = 1 unit) and compare to the RCA delay.  
7. **ALU with Add/Sub/AND/OR** – Build a 4‑bit ALU where a 2‑bit select chooses the function. Include a carry‑in for add/sub and produce a zero‑flag output. Validate by exhaustive testing (2⁸ input combinations).  
8. **Comparator Tree** – Design a 16‑bit magnitude comparator using a parallel‑prefix tree; output the three relations. Show the logarithmic depth by drawing the prefix network (ASCII art is fine) and compute the theoretical delay assuming each prefix node = 2 units.

---

## Linux Connection
Combinational logic is not just an academic abstraction; it appears throughout the Linux kernel’s low‑level hardware support.

### 1. CPU Feature Detection (`/proc/cpuinfo`)
The kernel decodes CPUID leaf 0x00000001 to extract feature flags. The extraction uses a series of bit‑mask and shift operations—pure combinational logic on the 32‑bit EAX/EBX/ECX/EDX registers.

```bash
# Show the raw feature flags word
grep -m1 '^flags' /proc/cpuinfo | cut -d: -f2 | tr ' ' '\n' | grep -E '^([a-z0-9_]+)$' | wc -l   # count distinct flags
```

### 2. Memory‑Address Decoding in the DRAM Controller
The `edac` (Error Detection and Correction) subsystem programs the memory controller’s row/column decoder registers. For a DDR4 DIMM with 12‑bit row address and 10‑bit column address, the kernel computes:
```
row = (addr >> COL_BITS) & ROW_MASK
col =  addr & ((1<<COL_BITS)-1)
```
Both right‑shift and mask are combinational.

```c
/* Example from drivers/edac/edac_mc.c (simplified) */
static unsigned long decode_row(unsigned long addr, unsigned col_bits)
{
    return (addr >> col_bits) & ((1UL << (64 - col_bits)) - 1);
}
static unsigned long decode_col(unsigned long addr, unsigned col_bits)
{
    return addr & ((1UL << col_bits) - 1);
}
```

### 3. Ethernet MAC CRC‑32
The MAC computes a CRC‑32 over each frame using a linear feedback shift register (LFSR). The LFSR’s next‑state logic is a set of XOR gates—a combinational block whose delay determines the maximum line rate. The kernel’s `drivers/net/ethernet/` drivers program the polynomial via a mask:
```c
/* In ixgbe/hw_ixgbe.c */
#define IXGBE_PCRC32   0x0000000C   /* polynomial register */
```
Changing the polynomial changes the combinational XOR network.

### 4. ALU Simulation in `perf`
The `perf` tool can count CPU micro‑ops to expose the cost of different ALU operations:
```bash
# Count integer-add vs integer-mul micro-ops on a Skylake CPU
perf stat -e arith.fetch_unit_retired.add,arith.fetch_unit_retired.mul \
          ./a.out   # where a.out does a tight loop of adds or muls
```
Typical output shows ~1 µop per add vs ~3‑4 µops per multiply, reflecting the more complex combinational network required for multiplication.

### 5. Toolchain Bit‑field Macros
The kernel provides `<linux/bitops.h>` macros like `GENMASK(l,h)` and `BIT(b)`. These expand to compile‑time constants created by shift and mask—pure combinational expressions evaluated by the preprocessor.
```bash
# Show the expansion of GENMASK(5,2)
echo "#include <linux/bitops.h>" | gcc -E - | grep GENMASK
# Output: ((((~0U) << 2) & (~0U >> (63-5))) )
```
These macros are used throughout the kernel to build field‑insertion/extraction logic without runtime cost.

---

## Why This Matters
Combinational blocks are the *atoms* of digital computation. Every arithmetic operation, every control decision, and every data‑path selection in a modern system ultimately reduces to a network of gates implementing a Boolean function. Understanding how those functions are derived— from truth tables to minimized expressions, from gate‑level delays to timing budgets— lets you:

* **Predict performance**: knowing the critical‑path delay of a ripple‑car
