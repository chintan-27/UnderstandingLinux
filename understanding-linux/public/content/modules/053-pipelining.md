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

## Why This Matters

A pipelined CPU overlaps instruction execution to increase throughput, but this creates a fundamental problem: later instructions in the pipeline may need results that earlier instructions haven't finished computing yet. Without mechanisms to detect and resolve these conflicts — called **hazards** — the CPU would silently produce wrong answers. The forwarding paths, stall logic, and branch predictor in a modern CPU are not optional optimizations; they are correctness requirements.

This matters beyond microarchitecture textbooks. When GCC's `-O2` reorders your instructions, it is legally exploiting the fact that the hardware will produce the same result regardless of instruction order — *because* the forwarding unit guarantees it. When Spectre works, it exploits the fact that branch misprediction causes speculative execution of instructions that *should never have run*. The pipeline hazard model is the foundation underneath both.

---

## Core Concepts

### The Pipeline Stages

A classic 5-stage pipeline executes every instruction through:

$$\text{IF} \rightarrow \text{ID} \rightarrow \text{EX} \rightarrow \text{MEM} \rightarrow \text{WB}$$

| Stage | Action | Cycle (for instruction $i$) |
|-------|--------|----------------------------|
| IF | Fetch instruction from I-cache | $i$ |
| ID | Decode, read register file | $i+1$ |
| EX | ALU operation | $i+2$ |
| MEM | Load/store to D-cache | $i+3$ |
| WB | Write result to register file | $i+4$ |

Instruction $i+1$ begins IF while instruction $i$ is in ID. The overlap is what creates hazards: instruction $i+1$ reads the register file in cycle $i+2$, but instruction $i$ doesn't write the register file until cycle $i+4$.

---

### Data Hazards: Read-After-Write (RAW)

A **RAW hazard** occurs when instruction $j$ reads a register that instruction $i$ ($i < j$) writes, and $i$ hasn't reached WB before $j$ reaches ID.

```asm
add $t0, $t1, $t2   ; writes $t0 at end of cycle 5 (WB)
sub $t3, $t0, $t4   ; reads $t0 at start of cycle 3 (ID) — stale!
```

The gap between when a value is *produced* (end of EX, cycle 4) and when it is *consumed* (start of ID, cycle 3) is the root of the problem. There is no read-after-write hazard between instructions separated by two or more intervening instructions, because WB of instruction $i$ completes before ID of instruction $i+3$.

The distance at which a hazard disappears:

$$\text{safe separation} = \text{WB cycle of producer} - \text{ID cycle of consumer} \geq 0$$

For producer at position $i$ and consumer at position $j$:

$$\text{hazard exists iff } (j - i) < 2 \text{ (EX hazard) or } (j - i) < 3 \text{ (if load, MEM hazard)}$$

---

### Forwarding (Bypassing)

**Forwarding** resolves most RAW hazards by routing a result from a pipeline register directly to the ALU input, bypassing the register file. The value is architecturally correct the moment EX finishes — it's sitting in the EX/MEM register. The only reason it hasn't been "committed" is that WB hasn't run yet. Forwarding exploits that fact.

Two forwarding conditions exist (for source register `Rs`; symmetrical for `Rt`):

$$\text{EX hazard:} \quad \texttt{EX/MEM.RegWrite} \;\wedge\; \texttt{EX/MEM.Rd} \neq 0 \;\wedge\; \texttt{EX/MEM.Rd} = \texttt{ID/EX.Rs} \;\Rightarrow\; \texttt{ForwardA} = 10_2$$

$$\text{MEM hazard:} \quad \texttt{MEM/WB.RegWrite} \;\wedge\; \texttt{MEM/WB.Rd} \neq 0 \;\wedge\; \texttt{MEM/WB.Rd} = \texttt{ID/EX.Rs} \;\Rightarrow\; \texttt{ForwardA} = 01_2$$

The EX hazard condition must take priority: if both conditions are true simultaneously (two consecutive writers to the same register), the *most recent* result wins.

```
ForwardA = 00  → use register file output (no hazard)
ForwardA = 10  → forward from EX/MEM register (1-cycle-old result)
ForwardA = 01  → forward from MEM/WB register (2-cycle-old result)
```

No stall cycles are consumed. Forwarding has zero throughput cost.

---

### Load-Use Hazard: When Forwarding Isn't Enough

A **load-use hazard** is a RAW hazard where the producer is a `lw` instruction. The result of a load is not available until the *end* of the MEM stage (cycle $i+3$). The consumer needs it at the *start* of EX (cycle $j+2$). For $j = i+1$:

$$\text{required at: } (i+1)+2 = i+3 \quad \text{available at: end of } i+3$$

The consumer needs the value at the *beginning* of cycle $i+3$; the load produces it at the *end* of cycle $i+3$. Forwarding cannot violate causality. A **stall** is mandatory.

```asm
lw  $t0, 0($t1)     ; MEM completes at end of cycle 4
add $t2, $t0, $t3   ; EX needs $t0 at start of cycle 4 — impossible
                    ; one bubble inserted: EX now starts cycle 5 ✓
```

Stall detection condition (evaluated in ID stage):

$$\texttt{ID/EX.MemRead} = 1 \;\wedge\; (\texttt{ID/EX.Rd} = \texttt{IF/ID.Rs} \;\vee\; \texttt{ID/EX.Rd} = \texttt{IF/ID.Rt})$$

Implementation: assert `PCWrite = 0` (freeze PC), `IF/IDWrite = 0` (re-fetch same instruction next cycle), and zero all control signals in the ID/EX register (insert a bubble/NOP). After one stall cycle, the load result sits in MEM/WB and forwarding completes the transfer normally.

The pipeline timeline:

```
Cycle:    1    2    3    4    5    6    7
lw:       IF   ID   EX   MEM  WB
add:           IF   ID   --   EX   MEM  WB
                         ^
                    bubble inserted here
```

---

### Control Hazards and Branch Penalties

A **control hazard** occurs because the CPU fetches the next sequential instruction before it knows whether a branch is taken. The branch target and taken/not-taken decision aren't available until the branch is evaluated.

**Where** branch resolution occurs determines the penalty:

| Resolution stage | Penalty (cycles flushed) |
|-----------------|--------------------------|
| MEM (naïve) | 3 |
| EX | 2 |
| ID (optimized) | 1 |

Moving branch evaluation hardware into ID — adding a dedicated comparator and target adder there — reduces the penalty to 1 cycle. Only the instruction currently in IF must be flushed. This is done by asserting `IF.Flush`, which zeroes the IF/ID register, converting the fetched instruction into a NOP.

The cost: the ID-stage comparator needs register values. If the immediately preceding instruction writes a register the branch reads, that value isn't ready at ID yet:

- **ALU instruction immediately before branch** → 1 stall cycle required
- **Load immediately before branch (using loaded value)** → 2 stall cycles required

These stalls are inserted by the same hazard detection unit used for load-use hazards, because the branch's register read moves to ID — one stage earlier than a normal instruction's EX read.

---

### Branch Prediction

Stalling one cycle on every branch still costs throughput. With a branch every 5–6 instructions (typical for compiled code), a 1-cycle branch penalty reduces IPC by roughly $1/6 \approx 16\%$. Dynamic branch prediction eliminates most of this.

#### 1-Bit Predictor

A **branch history table (BHT)** is a direct-mapped array indexed by the low-order $k$ bits of the branch PC. Each entry stores one bit: 1 = predict taken, 0 = predict not-taken.

Weakness: a loop taken $n-1$ times and not-taken once suffers **two** mispredictions per loop execution — one on the final not-taken iteration (bit flips to 0), and one on the first iteration of the next execution (bit is 0, predicts not-taken, but branch is taken).

Accuracy for a loop taken $n-1$ out of $n$ times:

$$\text{accuracy}_{1\text{-bit}} = \frac{n-2}{n}$$

For $n=10$: $\frac{8}{10} = 80\%$, not $90\%$ as you might expect.

#### 2-Bit Saturating Counter

Each BHT entry becomes a 2-bit saturating counter with four states:

```
00 (Strongly NT) ←→ 01 (Weakly NT) ←→ 10 (Weakly T) ←→ 11 (Strongly T)
     ↑ not-taken                              taken ↑
```

A taken branch increments the counter (saturating at `11`); a not-taken branch decrements it (saturating at `00`). Predict taken iff the high bit is 1.

A single mispredict at loop exit flips `11 → 10` (still pred
