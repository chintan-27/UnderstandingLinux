---
id: 53
title: "Pipelining"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Module 53: Pipelining — Hazards, Forwarding, Stalling, and Branch Prediction

## Why This Matters

A pipelined CPU overlaps instruction execution across five stages (IF → ID → EX → MEM → WB). The throughput gain is real — ideally one instruction completes per cycle instead of one per five — but it creates a precise timing problem: an instruction in EX may need a result from an instruction still in MEM or WB, and a branch instruction redirects the PC before the pipeline knows what to fetch next. Without hardware solutions, the processor either silently computes wrong values or must stall for every dependent pair, collapsing to near-sequential performance.

Understanding these mechanisms explains observable performance phenomena: why a loop with a data-dependent branch runs measurably slower than a predictable one, why a `load` followed immediately by a dependent `add` costs an extra cycle, and why `perf stat` reports a non-zero `branch-misses` count even for trivial programs.

---

## Core Concepts

### The Three Classes of Hazard

**Structural hazard**: Two in-flight instructions require the same hardware resource in the same cycle. The classic case is a unified memory: if instruction fetch and data load share one memory port, they collide in cycles where both are active. The fix is structural separation — L1 caches are *always* split into L1i and L1d precisely because the pipeline needs simultaneous, independent access to both. A unified L2 is fine; nothing fetches from L2 every cycle.

**Data hazard**: An instruction needs a value before it's been written back. In a 5-stage pipeline, a result is committed to the register file at WB (stage 5), but the dependent instruction reads the register file at ID (stage 2). For back-to-back instructions, the producer is at EX (stage 3) when the consumer needs the value at ID (stage 2) — the value doesn't even exist yet, let alone sit in the register file. This is not a software scheduling problem that compilers can always hide; it's a hardware timing gap measured in cycles.

**Control hazard**: The pipeline fetches instructions sequentially at PC+4, PC+8, etc. A branch instruction may change the PC, but the pipeline committed to fetching those subsequent instructions before it evaluated the branch. The question is how many instructions have been fetched speculatively by the time the branch outcome is known — that number is the **branch penalty**, and it depends entirely on which pipeline stage resolves the branch.

---

### Forwarding (Bypassing)

The result of an ALU operation is architecturally correct the moment EX completes — it sits in the EX/MEM pipeline register. It won't reach the register file until two cycles later (WB), but the value is already valid. Forwarding routes it directly from the pipeline register to the ALU input mux of the consuming instruction, bypassing the register file entirely.

This requires:
1. A forwarding unit that compares the destination register of instructions in EX/MEM and MEM/WB against the source registers of the instruction currently in EX.
2. Multiplexers on each ALU input that can select from the register file (normal path), EX/MEM register, or MEM/WB register.

The hardware doesn't stall or reorder — it reroutes the datapath for that one cycle. The mux selection signals (`ForwardA`, `ForwardB`) are computed fresh every cycle.

---

### Stalling (Pipeline Bubbles)

Forwarding eliminates most data hazards but cannot fix a **load-use hazard**. A `lw` instruction doesn't produce its value until the end of MEM (stage 4). The immediately following instruction needs that value at the *start* of EX (stage 3). Even forwarding from MEM/WB to EX input is one cycle too late: the consumer reaches EX before the producer reaches MEM.

The only fix is to delay the consumer by one cycle. A stall:
- Freezes the PC and IF/ID register (upstream holds its position).
- Injects a NOP into the ID/EX register (a bubble propagates forward).
- Allows the `lw` to advance to MEM, producing the value one cycle later.

After the one-cycle stall, forwarding from MEM/WB → EX works correctly. The cost is exactly one wasted cycle per load-use pair — unavoidable in hardware, but reduceable by the compiler by reordering independent instructions between the load and its consumer (load scheduling).

---

### Branch Prediction

When a branch is fetched, the pipeline must decide what to fetch next *before* it knows whether the branch is taken. Two strategies:

**Static prediction** commits to one guess unconditionally — either always predict not-taken (continue sequential fetch) or always predict taken. If wrong, the speculatively-fetched instructions are flushed before they write any state: the `IF.Flush` signal zeroes the IF/ID register, converting them to NOPs. Static prediction is deterministic but blind to runtime behavior.

**Dynamic prediction** uses runtime history indexed by PC. A **branch history table (BHT)** — a small direct-mapped array indexed by the low bits of the branch PC — stores 1 or 2 bits per entry tracking recent outcomes.

**1-bit predictor**: Stores the last outcome. A loop that executes $n$ iterations mispredicts on the first iteration (predictor says not-taken from last loop exit) and on the exit iteration, yielding:

$$\text{accuracy}_{1\text{-bit}} = \frac{n-2}{n}$$

For $n = 10$, accuracy is 80%.

**2-bit saturating counter**: The predictor must be wrong *twice consecutively* to flip its prediction. The state machine has four states — Strongly Not Taken (SNT), Weakly Not Taken (WNT), Weakly Taken (WT), Strongly Taken (ST) — and only crosses the predict-taken/predict-not-taken boundary on two consecutive mispredictions. For the same loop:

$$\text{accuracy}_{2\text{-bit}} = \frac{n-1}{n}$$

For $n = 10$, accuracy is 90%, because after the first full invocation the predictor enters WT (not ST — it was decremented once by the exit branch), predicts taken correctly on the first iteration of the next invocation, and only mispredicts the final exit.

---

## How It Works

### Forwarding: Detection Logic

The forwarding unit computes mux select signals every cycle. The conditions for `ForwardA` (ALU first input):

```
// EX hazard: forward from EX/MEM (instruction two cycles back)
if (EX/MEM.RegWrite
    AND EX/MEM.RegisterRd ≠ $zero
    AND EX/MEM.RegisterRd == ID/EX.RegisterRs)
    → ForwardA = 2b'10

// MEM hazard: forward from MEM/WB (instruction three cycles back)
// Only if EX hazard doesn't already cover it (EX hazard takes priority)
if (MEM/WB.RegWrite
    AND MEM/WB.RegisterRd ≠ $zero
    AND NOT (EX/MEM.RegWrite
             AND EX/MEM.RegisterRd ≠ $zero
             AND EX/MEM.RegisterRd == ID/EX.RegisterRs)
    AND MEM/WB.RegisterRd == ID/EX.RegisterRs)
    → ForwardA = 2b'01
```

The EX hazard takes priority because it carries the *more recent* value. Without the priority condition, a WAW (write-after-write) sequence could forward the wrong (older) value from MEM/WB when EX/MEM already holds the correct newer result.

| `ForwardA` | ALU Input Source |
|---|---|
| `00` | Register file output (ID/EX stage) |
| `10` | EX/MEM pipeline register |
| `01` | MEM/WB pipeline register |

`ForwardB` uses symmetric logic for `ID/EX.RegisterRt`.

---

### Load-Use Hazard: Stall Condition

```
// Hazard detection unit (runs during ID stage)
if (ID/EX.MemRead
    AND (ID/EX.RegisterRt == IF/ID.RegisterRs
         OR ID/EX.RegisterRt == IF/ID.RegisterRt))
    → PCWrite = 0        // freeze program counter
    → IF/IDWrite = 0     // freeze IF/ID register
    → ID/EX ← NOP       // inject bubble
```

Cycle-by-cycle trace for:

```asm
lw   $t0, 0($s0)   # instruction I
add  $t1, $t0, $s1 # instruction I+1
```

| Cycle | I stage | I+1 stage | Note |
|---|---|---|---|
| 1 | IF | — | |
| 2 | ID | IF | |
| 3 | EX | ID | Stall detected: `ID/EX.MemRead` and `$t0` match |
| 4 | MEM | ID (stalled) | Bubble in EX; PC frozen |
| 5 | WB | EX | Forward MEM/WB → EX input |
| 6 | — | MEM | |

The stall inserts exactly one dead cycle. After it, the timing aligns: `lw` is in WB when `add` enters EX, enabling MEM/WB → EX forwarding.

---

### Branch Penalty and ID-Stage Resolution

In the unoptimized datapath, the branch comparator lives in the ALU (EX stage) and the PC update happens at MEM. By the time the branch is resolved, three instructions have been fetched speculatively:

$$\text{branch penalty}_{\text{unoptimized}} = 3 \text{ cycles}$$

By moving a dedicated equality comparator into **ID** and connecting an early branch-taken adder to the PC mux, the branch resolves one stage earlier:

$$\text{branch penalty}_{\text{ID-stage}} = 1 \text{ cycle}$$

The tradeoff: the ID stage now depends on register values that EX might not have produced yet. If the instruction immediately before the branch writes a register the branch reads, you need a stall — EX hasn't produced the value when ID needs it:
