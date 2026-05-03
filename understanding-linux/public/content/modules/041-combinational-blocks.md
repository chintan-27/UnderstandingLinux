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

## Why This Matters

When the Linux kernel executes `a + b` on two 32-bit integers, that addition runs on a ripple-carry or carry-lookahead adder whose propagation delay is a hard physical constraint on clock frequency. When GCC compiles `(unsigned)a < (unsigned)b` versus `(int)a < (int)b`, it emits different branch instructions because the underlying comparator reads a different output bit — carry-out versus sign. When the kernel's `do_div()` macro avoids a division by replacing it with a shift, that shift executes on a barrel shifter in $O(\log N)$ gate delays rather than $O(N)$. These are not abstractions: they are the physical reason certain C idioms are fast or slow, why integer overflow has defined wrap-around behavior, and why `SLT` exists as a single instruction rather than a sequence.

---

## Core Concepts

### Half Adder

Takes two single-bit inputs $A$ and $B$; produces sum $S$ and carry-out $C_{out}$:

$$S = A \oplus B \qquad C_{out} = A \cdot B$$

No carry-in port exists. Useful only at bit position 0 of a multi-bit adder, where there is no incoming carry by definition.

### Full Adder

Adds a carry-in $C_{in}$ to handle all positions above bit 0:

$$S = A \oplus B \oplus C_{in}$$
$$C_{out} = A \cdot B + C_{in} \cdot (A \oplus B)$$

The second product in $C_{out}$ is not redundant: $A \cdot B$ fires when both inputs generate a carry independently of $C_{in}$; $C_{in} \cdot (A \oplus B)$ fires when exactly one of $A$, $B$ is 1 and the incoming carry propagates through. Both conditions must be ORed because either one alone produces a carry-out.

### Ripple-Carry Adder (RCA)

Chain $N$ full adders so that $C_{out}^{(i)}$ drives $C_{in}^{(i+1)}$. Simple to lay out, but correctness of bit $N-1$ depends on carry information that originates at bit 0. Propagation delay is strictly linear:

$$t_{RCA} = N \cdot t_{FA}$$

For $N = 32$ and $t_{FA} = 300\,\text{ps}$:

$$t_{RCA} = 32 \times 300\,\text{ps} = 9{,}600\,\text{ps} = 9.6\,\text{ns}$$

At a 1 GHz clock ($T = 1\,\text{ns}$), this adder cannot complete in a single cycle. It is the reason no modern processor uses a plain RCA for its main integer datapath.

### Carry-Lookahead Adder (CLA)

The bottleneck in RCA is sequential carry propagation. CLA breaks this by precomputing carries in parallel. Define per-bit signals:

$$G_i = A_i \cdot B_i \qquad P_i = A_i \oplus B_i$$

$G_i$ is true when bit $i$ will *generate* a carry regardless of $C_{in}$. $P_i$ is true when bit $i$ will *propagate* an arriving carry. The carry into position $i+1$ is then:

$$C_{i+1} = G_i + P_i \cdot C_i$$

Expanding for four bits from $C_0$:

$$C_1 = G_0 + P_0 C_0$$
$$C_2 = G_1 + P_1 G_0 + P_1 P_0 C_0$$
$$C_3 = G_2 + P_2 G_1 + P_2 P_1 G_0 + P_2 P_1 P_0 C_0$$
$$C_4 = G_3 + P_3 G_2 + P_3 P_2 G_1 + P_3 P_2 P_1 G_0 + P_3 P_2 P_1 P_0 C_0$$

Each carry is now a two-level AND-OR expression computed directly from the original inputs and $C_0$, with no serial dependency between bit positions. For a 32-bit CLA organized in 4-bit blocks, the delay is roughly:

$$t_{CLA} \approx t_{PG} + t_{block} + \left(\frac{N}{k} - 1\right)t_{AND\text{-}OR} + k \cdot t_{FA}$$

With $t_{PG} = 100\,\text{ps}$, $t_{block} = 600\,\text{ps}$, $t_{AND\text{-}OR} = 200\,\text{ps}$, $k = 4$, $N = 32$:

$$t_{CLA} = 100 + 600 + 7 \times 200 + 4 \times 300 = 3{,}300\,\text{ps} = 3.3\,\text{ns}$$

That is $2.9\times$ faster than RCA for the same bit width, achieved entirely by trading gate count for parallelism.

### Prefix Adder

CLA within a 4-bit block is fast, but inter-block carries still propagate serially if blocks are chained naively. A prefix adder solves this by defining a *group* generate/propagate operator:

$$G_{i:j} = G_{i:k+1} + P_{i:k+1} \cdot G_{k:j}$$
$$P_{i:j} = P_{i:k+1} \cdot P_{k:j}$$

for any split point $k$. Applying this recursively in a binary tree computes all prefix carries $C_1, C_2, \ldots, C_{N-1}$ simultaneously. The tree has $\lceil \log_2 N \rceil$ levels, so:

$$t_{prefix} = O(\log N)$$

This is the architecture used in high-performance synthesis targets. The Kogge-Stone tree minimizes depth; the Brent-Kung tree minimizes gate count at the cost of one extra level.

### Subtraction via Two's Complement

Subtraction $A - B$ needs no dedicated circuit. Two's complement negation of $B$ is $\overline{B} + 1$. In hardware: invert all bits of $B$ (wire through NOT gates — zero delay), then supply the $+1$ by asserting $C_{in} = 1$ on the adder's carry-in. The same adder handles both addition and subtraction; only the control signal for bit-inversion and the initial carry differ. This is why an ALU control word encodes `ADD` as $C_{in}=0$ and `SUB` as $C_{in}=1$ with $B$-invert asserted.

### Multiplexer (MUX)

An $N$:1 MUX passes one of $N$ data inputs to its output, selected by $\lceil \log_2 N \rceil$ select lines. For a 2:1 MUX with select $S$:

$$Y = \overline{S} \cdot D_0 + S \cdot D_1$$

Any $N$-input logic function can be implemented by a $2^N$:1 MUX: wire the $2^N$ truth-table output values directly to the data inputs, use the $N$ function inputs as select lines. FPGA lookup tables (LUTs) exploit exactly this — a 6-LUT is a 64:1 MUX with a 64-bit SRAM-loaded truth table. Understanding this makes clear why LUT count, not gate count, is the meaningful FPGA resource metric.

### Decoder

An $N$-to-$2^N$ decoder asserts exactly one output line for each of the $2^N$ input values. Output $k$ is:

$$O_k = \prod_{i=0}^{N-1} \left(A_i^{k_i}\right) \quad \text{where } A_i^{k_i} = \begin{cases} A_i & \text{if bit } i \text{ of } k \text{ is 1} \\ \overline{A_i} & \text{if bit } i \text{ of } k \text{ is 0} \end{cases}$$

Each output is a single AND gate over all $N$ inputs (possibly complemented). In a CPU register file, the decoder takes a 5-bit register address and asserts exactly one of 32 word-lines, enabling the selected register's storage cells.

### Priority Encoder

A standard encoder collapses a one-hot $2^N$-bit input to an $N$-bit binary output. A priority encoder additionally handles multiple simultaneous assertions by selecting the highest-priority active input and suppressing the rest. For a 4-bit input with priority from bit 3 downward:

| $I_3 I_2 I_1 I_0$ | $Y_1 Y_0$ | Valid |
|---|---|---|
| `1 x x x` | `11` | 1 |
| `0 1 x x` | `10` | 1 |
| `0 0 1 x` | `01` | 1 |
| `0 0 0 1` | `00` | 1 |
| `0 0 0 0` | `--` | 0 |

The `Valid` output distinguishes "input 0 active" from "no input active" — without it, both states produce $Y = 00$. Linux's interrupt controller layer (`arch/x86/kernel/irq.c`, `kernel/irq/irqdesc.c`) mirrors this logic: when multiple IRQs arrive simultaneously, the APIC priority encoder selects the highest-vector interrupt and the kernel's `handle_irq()` dispatches it.

### Comparator

Compares two $N$-bit
