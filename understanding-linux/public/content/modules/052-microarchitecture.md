---
id: 52
title: "Microarchitecture"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

Every instruction your CPU executes passes through a fixed sequence of hardware stages. How you *organize* that sequence determines clock speed, throughput, and power. The naive approach—waiting for one instruction to fully complete before starting the next—is correct but leaves most of the silicon idle most of the time. Pipelining overlaps those stages, but correctness breaks down the moment one instruction depends on a result that the previous instruction hasn't produced yet. Understanding these tradeoffs tells you why `perf stat` reports a CPI above 1.0, why the compiler reorders your instructions without changing semantics, why a branch misprediction costs 15–20 ns on a modern core, and what the Linux scheduler is working around when it binds a latency-sensitive thread to a specific CPU.

---

## Core Concepts

### The Five Stages of Instruction Execution

Every MIPS-style instruction—and by extension RISC-V, early ARM, and most clean RISC designs—decomposes into at most five distinct hardware operations:

| Stage | Abbreviation | What happens |
|-------|-------------|--------------|
| Instruction Fetch | IF | Read the instruction word from memory at the current PC |
| Instruction Decode / Register Read | ID | Decode opcode fields; read source registers from the register file |
| Execute | EX | ALU computes result or calculates a memory address |
| Memory Access | MEM | Load or store data memory (only `lw`/`sw`; other instructions pass through) |
| Write Back | WB | Write the result into the destination register |

Not every instruction uses every stage. A `beq` does not write back; a `sw` does not write back either. This asymmetry matters: those stages execute a NOP in a pipelined design, but the pipeline register still latches, still consumes power, and the stage latency still constrains the clock.

### Single-Cycle Design

In a single-cycle processor, every instruction occupies exactly one clock cycle. The clock period must be long enough for the *slowest possible path* through the hardware—the critical path:

| Instruction | Path through hardware | Total latency |
|-------------|----------------------|--------------|
| `lw` | IF + ID + EX + MEM + WB | 800 ps |
| `sw` | IF + ID + EX + MEM | 700 ps |
| R-format (`add`, `sub`, …) | IF + ID + EX + WB | 600 ps |
| `beq` | IF + ID + EX | 500 ps |

$$T_{\text{clock}} = \max_{\,i \in \text{all instructions}}(\text{latency}_i) = 800\text{ ps}$$

Every `beq` wastes $800 - 500 = 300\text{ ps}$. Every R-format instruction wastes 200 ps. The hardware is correct, but the efficiency is bounded above by the worst-case instruction. If your workload is 30% loads, 30% branches, and 40% ALU ops, you're leaving significant throughput on the table by design.

### Multi-Cycle Design

Multi-cycle breaks execution into steps that each consume one short clock cycle. A fast instruction uses fewer cycles; a slow one uses more. Setting the clock to the *stage* latency rather than the full instruction latency:

$$T_{\text{clock, multi-cycle}} = \max_{i \in \text{stages}}(\text{latency of stage}_i) = 200\text{ ps}$$

An `lw` now takes 5 cycles × 200 ps = 1000 ps total—*longer* than the single-cycle 800 ps. That is not a regression in disguise: the payoff is hardware reuse. A single ALU can serve both the EX stage and the address-calculation step, because no two instructions occupy different stages simultaneously. Area (transistor count) shrinks. But throughput is still one instruction at a time.

### Pipelined Design

Pipelining keeps the short clock cycle of multi-cycle and adds the key insight: stages are *independent hardware*, so they can work on *different instructions simultaneously*.

The throughput formula assumes a pipeline of $k$ stages with the critical stage having latency $t$:

$$\text{Ideal throughput} = \frac{1}{t}$$

Compared to single-cycle:

$$\text{Ideal speedup} = \frac{T_{\text{single-cycle}}}{t_{\text{stage}}} = \frac{800\text{ ps}}{200\text{ ps}} = 4\times$$

This is ideal CPI = 1.0: one instruction completes per cycle once the pipeline is full. Real workloads break this because of hazards.

The pipeline fills over $k - 1$ cycles (the "ramp-up"), and drains over $k - 1$ cycles at the end. For a program of $n$ instructions through a $k$-stage pipeline, total cycles equal:

$$\text{Total cycles} = n + (k - 1)$$

For large $n$, the $(k-1)$ fill/drain overhead is negligible. For small, tight loops it is not.

### Hazards

A hazard is any condition that prevents the next instruction from entering the pipeline in the next clock cycle without producing a wrong result. There are exactly three kinds.

**Structural hazard**: Two in-flight instructions require the same hardware resource in the same cycle. The canonical example: a unified memory (no separate instruction and data caches). In cycle 4, instruction $n$ is in MEM (reading data) while instruction $n+3$ is in IF (reading the next instruction)—both need the memory bus simultaneously. The fix is either separate I-cache and D-cache (which is what every real CPU does) or stalling IF while MEM completes.

**Data hazard**: An instruction needs a register value that a preceding instruction has not yet written. The register file is only updated in WB, which is two cycles *after* EX produces the result. Without intervention, a consumer reading in ID gets the old (stale) value.

**Control hazard**: A branch changes the PC, but the pipeline has already fetched and partially decoded the instructions at $\text{PC}+4$ and $\text{PC}+8$. If the branch is taken, those instructions are wrong and must be flushed—wasting cycles and energy.

---

## How It Works

### Why the Clock Cannot Be Shorter Than the Slowest Stage

Pipeline registers (D flip-flops) sit between every stage. At each rising clock edge, all pipeline registers latch simultaneously. For correct operation, every stage must complete its combinational logic within one clock period. The constraint is:

$$T_{\text{clock}} \geq \max_{i}(t_{\text{stage},i}) + t_{\text{setup}} + t_{\text{clk-to-Q}}$$

where $t_{\text{setup}}$ is the flip-flop setup time and $t_{\text{clk-to-Q}}$ is its propagation delay. If you clock faster than this, you latch a value mid-transition—metastability or a corrupted result. A single slow stage sets the global clock rate for all stages. This is why microarchitects spend enormous effort balancing stage latencies: if four stages are 200 ps and one is 350 ps, the whole pipeline runs at 350 ps even though 80% of the hardware could run faster.

### Forwarding (Bypassing) to Resolve Data Hazards

Without forwarding, this sequence stalls:

```asm
add  $t0, $t1, $t2    # EX produces $t0 in cycle 3
sub  $t3, $t0, $t4    # EX needs $t0 in cycle 4 — WB won't happen until cycle 5
and  $t5, $t0, $t6    # EX needs $t0 in cycle 5 — WB still not done
```

The `add` result exists in the EX/MEM pipeline register at the end of cycle 3. Forwarding wires route that register's output directly back to the EX stage's ALU input mux, bypassing the register file entirely. The hazard detection unit computes:

```
if (EX/MEM.RegisterRd == ID/EX.RegisterRs) → forward from EX/MEM
if (MEM/WB.RegisterRd == ID/EX.RegisterRs) → forward from MEM/WB
```

With forwarding, the above sequence has no stall:

```
Cycle:   1    2    3    4    5    6    7
add      IF   ID   EX   MEM  WB
sub           IF   ID   EX   MEM  WB
and                IF   ID   EX   MEM  WB
                             ↑    ↑
                    EX/MEM forward  MEM/WB forward
```

**The load-use hazard is the one case forwarding cannot eliminate.** A `lw` produces its result at the *end* of MEM (cycle 4 for the first instruction), but the immediately following instruction needs that value at the *start* of its own EX (also cycle 4). The data doesn't exist yet. One stall cycle is unavoidable:

```asm
lw   $t0, 0($s0)     # data exits MEM at end of cycle 4
add  $t1, $t0, $t2   # needs $t0 at start of EX in cycle 4 → must stall to cycle 5
```

```
Cycle:   1    2    3    4    5    6    7    8
lw       IF   ID   EX   MEM  WB
add           IF   ID   **   EX   MEM  WB
                       stall inserted by hazard unit
```

The hazard detection unit inserts a bubble (NOP) into EX and re-issues the `add` one cycle later. Compilers exploit this: `-O2` will reorder instructions to put an unrelated instruction between a `lw` and its first use, eliminating the stall without any hardware cost. The reordering is architecturally invisible because the instructions are independent.

### Performance Model with Hazards

Ideal pipelined CPI is 1.0. Each hazard class adds a penalty:

$$\text{CPI}_{\text{actual}} = 1 + \text{stalls}_{\text{data}} + \text{stalls}_{\text{control}} + \text{stalls}_{\text
