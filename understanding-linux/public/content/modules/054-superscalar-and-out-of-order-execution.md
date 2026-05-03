---
id: 54
title: "Superscalar and out-of-order execution"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

A single-issue in-order pipeline wastes most of its silicon most of the time: while a load waits for DRAM, the integer ALU sits idle, the FPU sits idle, and the branch unit sits idle. Superscalar out-of-order (OoO) execution exists to fix this by finding independent instructions *dynamically*, at runtime, even when the compiler could not statically separate them. The hardware renames registers to eliminate false dependencies, buffers instructions until their operands arrive, and retires results in program order so the rest of the system never sees the disorder.

The payoff is that IPC can exceed 1.0 — sometimes substantially. When `perf stat` reports `IPC: 0.31` on your workload, it means the OoO machinery is starved: the window of in-flight instructions is not large enough, or the dependency chains are too long, or branch mispredictions keep flushing the pipeline. Understanding the mechanism tells you which it is and what to do about it.

---

## Core Concepts

### Multiple Issue and IPC

A scalar in-order pipeline has $\text{IPC} \leq 1$ by construction. A $w$-wide superscalar can *retire* up to $w$ instructions per cycle:

$$\text{IPC}_{\max} = w, \quad \text{CPI}_{\min} = \frac{1}{w}$$

Peak throughput for a 4 GHz four-wide machine is:

$$4 \times 10^9 \, \text{Hz} \times 4 \, \frac{\text{instructions}}{\text{cycle}} = 16 \times 10^9 \, \frac{\text{instructions}}{\text{second}}$$

That ceiling is never reached because real dependency chains, memory latencies, and mispredictions all reduce the average. The useful design question is: *what limits IPC below $w$?* The answer is almost always one of three things: a long true-dependence chain (serializes execution), a branch misprediction (flushes the ROB), or a last-level cache miss (stalls the load/store queue and everything waiting on it).

### True Dependences vs. Name Dependences

A **RAW (Read After Write)** dependence is a real constraint — instruction B cannot start until instruction A produces a value. No renaming can remove it; the latency is structural.

**WAR (Write After Read)** and **WAW (Write After Write)** are *name dependences*. They exist only because two logically unrelated operations happen to target the same architectural register name. They carry no information. They exist because architectural ISAs have a small, fixed register file (16 integer registers in x86-64, 31 in AArch64), which the compiler reuses aggressively.

Name dependences are the specific problem that register renaming solves. Removing them is what allows the OoO engine to see a wider window of independent instructions.

### Register Renaming

The processor maintains a **physical register file** much larger than the architectural one — Skylake has 180 integer physical registers vs. 16 architectural. Every time an instruction writes an architectural register $r$, the hardware allocates a fresh physical register $p$ and records the mapping $r \to p$ in the **Register Alias Table (RAT)**. Subsequent instructions that read $r$ are redirected to $p$.

The old physical register backing $r$ is freed only when the new mapping *commits* — not when the new instruction executes. This is critical for speculation: if a misprediction forces a rollback, the old mapping is still valid.

The invariant: at any moment, the RAT holds the *speculative* mapping (what in-flight instructions see), and the **Retirement Register File (RRF)** or **Architectural Register File (ARF)** holds the *committed* mapping (what the programmer's model sees).

### Reservation Stations

When an instruction is dispatched, it enters a **reservation station (RS)** — a buffer slot associated with a class of functional units. Each RS entry holds:

- The operation to perform
- The physical register numbers (or ROB tags) for each source operand
- A ready bit per source

The RS watches the **Common Data Bus (CDB)**: every time a functional unit completes and broadcasts a result tagged with physical register $p$, every RS entry waiting on $p$ captures the value and sets its ready bit. When all ready bits are set, the instruction issues to an available functional unit — immediately, regardless of program order.

This is why OoO execution scales: the RS is not a FIFO. It issues the *oldest ready* instruction (or on some microarchitectures, simply the first ready one), so a long-latency multiply that blocks nothing else does not stall a subsequent independent add.

### The Reorder Buffer (ROB)

Out-of-order execution creates a correctness problem: if a speculative store commits to memory before a preceding branch resolves, and the branch was mispredicted, the store cannot be undone. The **Reorder Buffer** prevents this.

Every dispatched instruction claims a ROB entry *in program order* — the ROB is a circular queue. The instruction executes out of order and writes its result back to a physical register, but the ROB entry is only marked *complete*. Instructions **commit** strictly from the ROB head, in order. Commit is when the architectural state changes: the ARF is updated, the old physical register is released, and any exception from that instruction is raised.

This means:
- Speculative instructions never touch committed architectural state.
- Exceptions are precise: when instruction $i$ raises a fault at commit, all instructions older than $i$ have already committed correctly, and all instructions newer than $i$ are still speculative and are flushed.
- Memory ordering is enforced: stores only become visible to other cores after commit (modulo the store buffer, which is a separate but related topic).

The minimum ROB size to keep a $w$-wide machine fully busy across a pipeline with $N$ post-issue stages is:

$$\text{ROB}_{\min} = w \times N$$

If the ROB fills before old entries commit (e.g., because a cache miss stalls the head of the ROB), dispatch stalls and IPC collapses. This is called a **ROB full stall** and it is a measurable event in `perf`.

### Speculation

Branch prediction allows the front end to continue fetching and executing instructions *before the branch resolves*. The OoO engine treats all post-branch instructions as speculative ROB entries. Two outcomes:

- **Correct prediction:** the ROB entries are already complete when the branch resolves and commit normally. The branch's latency is hidden.
- **Misprediction:** the ROB is flushed from the branch onward, the RAT is rolled back to the pre-branch state, and the front end restarts at the correct PC. The architectural state is untouched because nothing past the branch had committed.

The cost of a misprediction is roughly the number of pipeline stages between fetch and branch resolution — typically 15–20 cycles on modern x86. At 4 GHz, that is 4–5 ns per mispredict, multiplied by the misprediction rate. A 1% misprediction rate on a branch-dense loop can cut IPC by 30%.

---

## How It Works

### The Full Pipeline

```
Fetch → Decode/Rename → Dispatch → Issue → Execute → Writeback → Commit
        [in-order]                  [out-of-order]               [in-order]
```

The front end (fetch through dispatch) and back end (commit) are strictly ordered. Only the middle — from reservation stations through writeback — is disordered.

**Instruction lifecycle:**

1. **Fetch/Decode:** Instruction bytes are fetched from the I-cache (via the BTB/branch predictor for control flow), decoded into micro-ops. On x86, this is where CISC instructions decompose: `ADDQ (%rsi), %rax` becomes a load µop and an add µop.

2. **Rename:** The RAT is consulted. Each source register is replaced with the physical register currently mapped to it. Each destination register is assigned a new physical register from the free list. The RAT is updated speculatively.

3. **Dispatch:** The µop is entered into the ROB (ordered slot) and a reservation station. If the ROB or RS is full, dispatch stalls.

4. **Issue:** The RS monitors the CDB. When all source operands are available, the µop issues to a free functional unit. This is the OoO step.

5. **Execute and Writeback:** The functional unit computes the result. The result is broadcast on the CDB with its destination physical register tag. Waiting RS entries capture it. The ROB entry is marked complete.

6. **Commit:** When the instruction is at the ROB head *and* marked complete, it commits: the ARF is updated, the previously-mapped physical register is returned to the free list, and any pending exception is raised.

### Register Renaming: Worked Example

```asm
; Original sequence — architectural registers
MUL R1, R2, R3      ; (a)  R1 = R2 * R3        [6-cycle latency]
ADD R4, R1, R5      ; (b)  R4 = R1 + R5        [RAW on R1 from (a)]
SUB R1, R6, R7      ; (c)  R1 = R6 - R7        [WAW on R1 with (a); WAR from (b)]
MOV R8, R1          ; (d)  R8 = R1             [should read (c)'s R1]
```

Without renaming, (c) cannot issue until (b) reads R1 (WAR), and (d) must wait for (c) to distinguish which R1 it should read (WAW). Everything serializes behind the 6-cycle multiply.

After renaming, assuming physical registers P10–P13 are allocated:

```asm
MUL P10, P2,  P3    ; (a)  R1→P10
ADD P11, P10, P5    ; (b)  reads P10 [waits for (a)]; R4→P11
SUB P12, P6,  P7    ; (c)  R1→P12   [independent of (a) and (b)]
MOV P13, P12        ; (d)  reads P12 [waits for (c)]
```

Now (a) and (c) can execute in parallel. (b) wa
