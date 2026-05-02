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

A single-issue in-order pipeline stalls the entire fetch-decode-execute stream whenever one instruction waits for a result — even if the next ten instructions are completely independent. Superscalar execution issues multiple instructions per clock, but that immediately exposes a harder problem: the instructions ready to execute are not necessarily the ones that appear next in program order. Three mechanisms make out-of-order execution correct and recoverable. Register renaming eliminates false dependencies that block scheduling even when no true data dependency exists. The reorder buffer (ROB) holds results in a speculative limbo until they can be committed in program order, making every execution tentative and reversible. Speculation allows the processor to execute past unresolved branches by betting on the outcome, converting branch latency from a guaranteed stall into an occasional penalty. Without all three working together, either performance collapses or correctness breaks.

---

## Core Concepts

### Instructions Per Cycle vs. Cycles Per Instruction

CPI has a theoretical floor of 1.0 on a single-issue in-order machine. Superscalar breaks that floor. The inverse, IPC, is the natural metric:

$$\text{IPC} = \frac{\text{instructions retired}}{\text{clock cycles elapsed}}$$

A 4-wide machine has a theoretical ceiling of $\text{IPC} = 4$. The gap between that ceiling and sustained reality — typically $\text{IPC} \approx 1.5$–$2.5$ on integer workloads — is almost entirely explained by three costs: true data dependencies that no amount of renaming can eliminate, L1/L2 cache misses that drain the ROB while the pipeline waits, and branch mispredictions that flush speculative work. Profiling which of the three dominates is the first step in any microarchitectural optimization.

### Register Renaming and the RAT

WAR (write-after-read) and WAW (write-after-write) hazards are *name dependencies*, not data dependencies. They occur because a later instruction wants to write a register that an earlier instruction hasn't finished reading or writing yet, but the two operations are otherwise independent. Blocking on them is unnecessary — they can be broken by giving each destination a fresh physical register.

The register alias table (RAT) maps each architectural register to the physical register currently holding its live value. At rename time, the processor:

1. Reads the RAT to find the physical registers holding the current source values.
2. Allocates a new physical register from the free list for the destination.
3. Updates the RAT so the architectural destination now points to the new physical register.
4. Saves the *old* physical register mapping in the ROB entry — needed for rollback on misprediction.

x86-64 exposes 16 general-purpose registers. Zen 4 maintains 224 integer physical registers. That pool is what allows ~300 in-flight instructions without false dependencies serializing them.

### Reservation Stations and the Common Data Bus

After renaming, an instruction enters a reservation station (RS). Each source operand is either:

- **Ready**: the physical register value is copied directly into the RS entry.
- **Pending**: the RS entry holds the ROB tag of the instruction that will produce the value.

When a functional unit completes, it broadcasts `(tag, value)` on the common data bus (CDB). Every RS entry listening for that tag captures the value, marks the operand ready, and — if all operands are now ready — becomes eligible for dispatch. The scheduler selects among ready entries and dispatches to a free execution port.

This is *out-of-order issue*: instructions leave the RS in readiness order, not program order. The full pipeline sequence is:

> Fetch → Decode → Rename (RAT lookup + physical reg allocation) → ROB entry allocated → RS entry allocated → wait for operands via CDB → dispatch to execution port → execute → result broadcast on CDB → ROB entry marked complete → commit from ROB head in order

### Reorder Buffer

The ROB is a circular buffer. Every renamed instruction gets an entry allocated at the tail, in program order. Execution completes entries out of order, marking them `COMPLETE`. Commit happens only from the head, only when the head entry is `COMPLETE`, and only in program order.

Until an instruction commits, its destination write is invisible to architectural state — it lives in a physical register tagged as speculative. This is what makes rollback cheap: on a misprediction, entries from the squash point to the tail are simply freed, and the RAT is restored to the snapshot saved in the branch's ROB entry. No memory writes are undone because stores don't issue to the cache until they commit (via the store buffer).

Exceptions are handled by the same mechanism. A speculative load that faults a page it should never have touched does not immediately trap. The exception is *latched* in the ROB entry. If the instruction reaches the head and commits — meaning all prior branches were predicted correctly — the exception fires. If a prior branch was mispredicted and the load is squashed, the latched exception is discarded. Correct exception semantics fall out of the commit discipline for free.

### Speculation and Misprediction Cost

The processor fetches and executes along the predicted path before the branch resolves. Speculative instructions consume ROB entries, reservation stations, and physical registers, but cannot commit. If the prediction is correct, they commit normally and the speculation overhead is zero. If it is wrong, the cost is:

$$\text{penalty}_\text{mispredict} \approx \text{stage}_\text{resolve} - \text{stage}_\text{fetch}$$

On a ~20-stage out-of-order core where branch resolution happens around stage 14, a misprediction flushes ~14 cycles of speculative work. The effective CPI accounting for branch penalties:

$$\text{CPI}_\text{eff} = \text{CPI}_\text{ideal} + f_b \cdot m \cdot p$$

where $f_b$ is branch frequency, $m$ is misprediction rate, and $p$ is the penalty in cycles. For $f_b = 0.20$, $m = 0.05$, $p = 15$:

$$\text{CPI}_\text{penalty} = 0.20 \times 0.05 \times 15 = 0.15$$

Adding 0.15 to an ideal CPI of 1.0 reduces effective IPC from 1.0 to $\frac{1}{1.15} \approx 0.87$ — a 13% throughput loss from branch mispredictions alone. This is why TAGE predictors (which use multiple history lengths and a tagged storage structure) achieve >99% accuracy on branch-heavy code.

---

## How It Works

### Renaming Example: Loop Unrolling

Consider a simple MIPS-like multiply-accumulate loop:

```asm
LOOP:
    LD    F0,  0(R1)
    MULTD F4,  F0, F2
    SD    F4,  0(R1)
    SUBI  R1,  R1, 8
    BNEZ  R1,  LOOP
```

The second iteration writes `F0` and `F4` again. Without renaming, the second iteration's `LD F0` creates a WAW hazard with the first iteration's `F0`, and the first iteration's `MULTD` reading `F0` creates a WAR hazard with the second iteration's `LD`. These force serialization even though the two iterations are independent. Compiler unrolling with fresh register names (`F6`, `F8`) breaks them explicitly:

```asm
    LD    F0,   0(R1)
    LD    F6,  -8(R1)
    MULTD F4,   F0, F2
    MULTD F8,   F6, F2
    SD    F4,   0(R1)
    SD    F8,  -8(R1)
    SUBI  R1,   R1, 16
    BNEZ  R1,   LOOP
```

With two-wide issue and the load latency of 2 cycles overlapped by the scheduler, 8 instructions execute in approximately 5 cycles across the two unrolled iterations:

$$\text{CPI} = \frac{5}{8} = 0.625$$

Hardware renaming achieves the same effect without compiler intervention: the RAT assigns a fresh physical register to every `LD F0`, so both iterations' loads can be in flight simultaneously with no name conflict.

### ROB Entry Layout and Commit Logic

Each ROB entry tracks enough state to commit or roll back cleanly:

| Field | Type | Purpose |
|---|---|---|
| `instr_type` | enum | ALU / load / store / branch |
| `arch_dest` | uint8 | Architectural register index |
| `phys_dest` | uint16 | Allocated physical register |
| `old_phys` | uint16 | Previous physical register for this arch reg (rollback) |
| `value` | uint64 | Computed result |
| `state` | enum | ISSUED / EXECUTING / COMPLETE / COMMITTED |
| `exc_code` | uint32 | Latched exception, 0 if none |
| `store_addr` | uint64 | For stores: target address |

Commit logic in simplified C:

```c
// Called once per clock; may retire up to N entries (superscalar commit)
void rob_commit(struct ROB *rob, int width) {
    for (int i = 0; i < width; i++) {
        struct ROBEntry *head = rob_head(rob);
        if (!head || head->state != COMPLETE)
            break;

        if (head->exc_code) {
            // All prior instructions have committed cleanly.
            // This exception is precise: architectural state is consistent.
            pipeline_flush(rob);
            deliver_exception(head->exc_code, head->pc);
            return;
        }

        if (head->instr_type == STORE) {
            // Drain from store buffer to cache — now safe, in order.
            store_buffer_commit(head->store_addr, head->value);
        } else {
            arch_regfile[head->arch_dest] = head->value;
        }

        // Old physical register is no longer needed for rollback.
        freelist_push(rob->freelist, head->old_phys);
        rob_advance_head(rob);
    }
}
```

The `old_ph
