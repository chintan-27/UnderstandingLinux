---
id: 49
title: "Machine organization"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

Every instruction a CPU executes passes through a specific set of hardware components in a specific order. If the control signals that coordinate them fire at the wrong time or in the wrong combination, the processor computes garbage or halts. This is not abstract: the kernel's context switch code in `arch/x86/kernel/process_64.c` saves and restores registers because the register file has finite ports and writeback is synchronous — skip a register, lose a thread's state. The syscall ABI specifies which registers survive a call because the hardware has no automatic save mechanism; software convention fills the gap. Performance counters exposed by `perf` measure the exact pipeline stages this lesson describes. You cannot reason about any of this without understanding what the datapath is and why the control signals are structured the way they are.

---

## Core Concepts

### The Datapath

The datapath is the collection of hardware elements that move and transform data: instruction memory, register file, ALU, data memory, adders, and multiplexors. It is the *mechanism*. Control signals are the *policy* that steers it. Separating the two matters because the same physical hardware executes dozens of different instruction types — changing which multiplexor input is selected and what operation the ALU performs is cheaper than building separate circuits per instruction.

### The Register File

The register file is a small, fast array of 32 registers (on MIPS), each 32 bits wide, with two read ports and one write port. The reason there are exactly two read ports is that all binary operations need exactly two inputs. A third read port would cost silicon and increase the critical path length without benefit for the common case.

A register file read is **combinational**: the output appears as soon as the address lines are stable, with no clock edge required. A write is **synchronous**: it only commits on a rising clock edge when `RegWrite` is asserted. This asymmetry is load-bearing. Combinational reads mean the hardware can speculatively route operands through the ALU before the instruction is fully decoded. Synchronous writes mean state never changes accidentally — a write either completes atomically on a clock edge or not at all.

On x86-64, the kernel exploits this directly. The `TASK_STRUCT` in Linux stores register state as a flat array:

```c
// arch/x86/include/asm/processor.h (simplified)
struct thread_struct {
    unsigned long   sp;      // stack pointer
    unsigned long   ip;      // instruction pointer
    // ... segment registers, debug registers ...
};
```

When the scheduler calls `__switch_to_asm` in `arch/x86/entry/entry_64.S`, it issues a sequence of `pushq`/`popq` instructions that exploit the write-port discipline: every register save is a synchronous write to memory, every restore is a read that becomes combinational once the address is stable in cache.

### The ALU

The ALU performs integer arithmetic and logic on two 32-bit operands, producing a 32-bit result plus status bits. The most important status bit is the `Zero` flag: it is asserted when the output is exactly $0$, and it is wired directly into the branch logic. The ALU does not decide what to compute — a 4-bit `ALUcontrol` signal tells it.

`ALUcontrol` is derived in two stages:

1. The main control unit decodes `opcode` (bits 31–26) and emits a 2-bit `ALUOp`.
2. The ALU control unit combines `ALUOp` with the `funct` field (bits 5–0) to produce the final 4-bit `ALUcontrol`.

The reason for two layers is that the `opcode` alone cannot distinguish `add` from `sub` from `and` — all R-type instructions share `opcode = 000000`. The `funct` field carries the distinction. Keeping the main controller ignorant of `funct` means it stays a small combinational ROM; the ALU control handles R-type nuance locally.

The ALU's `Zero` output is a single wire. It feeds a two-input AND gate:

$$\text{PCSrc} = \text{Branch} \land \text{Zero}$$

`Branch` is asserted by the main controller for `beq`. `Zero` is asserted by the ALU when the subtraction of the two branch operands equals $0$. Both conditions must hold simultaneously to redirect the PC — hardware-enforced two-factor authorization for a branch.

### Control Signals

Seven control signals govern the single-cycle datapath. Each selects between two datapaths or enables a write:

| Signal | 0 (deasserted) | 1 (asserted) |
|---|---|---|
| `RegDst` | Write register ← `rt` (bits 20:16) | Write register ← `rd` (bits 15:11) |
| `RegWrite` | No write | Write to register file |
| `ALUSrc` | Second ALU input ← `Read data 2` | Second ALU input ← sign-extended immediate |
| `PCSrc` | PC ← PC + 4 | PC ← branch target |
| `MemRead` | No read | Read from data memory |
| `MemWrite` | No write | Write to data memory |
| `MemtoReg` | Write data ← ALU result | Write data ← memory read data |

For `add $t1, $t2, $t3`: `RegDst=1` (destination is `rd`), `ALUSrc=0` (second operand from register), `MemtoReg=0` (result from ALU), `RegWrite=1`, `MemRead=0`, `MemWrite=0`, `PCSrc=0`. Every memory signal is deasserted; the data path is entirely register file → ALU → register file.

For `lw $t1, 8($t2)`: `RegDst=0` (destination is `rt`), `ALUSrc=1` (offset from immediate), `MemtoReg=1` (data from memory), `RegWrite=1`, `MemRead=1`, `MemWrite=0`, `PCSrc=0`. The ALU computes the effective address:

$$\text{EA} = \text{R}[t2] + \text{SignExt}(8)$$

and that address feeds directly into data memory — the ALU is repurposed as an address adder.

### Buses and Multiplexors

A bus is a bundle of wires carrying a multi-bit value. The key constraint is exclusivity: multiple sources may connect to a bus, but only one may drive it at a time. Multiplexors enforce this — the control signal selects which source wins. Letting two sources drive the same bus simultaneously causes a short circuit (or, in CMOS, a logic contention that draws excessive current and produces an undefined voltage). Multiplexors are the hardware equivalent of a mutex.

---

## How It Works

### Instruction Execution: Five Stages, One Clock Cycle

In a single-cycle implementation, everything resolves within one clock period. Data flows in causal order:

```
Instruction Memory → Register File (read) → ALU → Data Memory → Register File (write)
```

The clock period must be long enough for the slowest instruction to complete end-to-end. If data memory access takes $t_{mem}$ and every other stage takes $t_{stage}$, then:

$$T_{clock} \geq t_{fetch} + t_{decode} + t_{ALU} + t_{mem} + t_{writeback}$$

A store instruction skips writeback; a branch skips memory. But the clock period is fixed to the worst case — every instruction, even a fast one, waits. This is the central inefficiency that pipelining solves.

**Step 1 — Fetch.** The PC holds the address of the current instruction. Instruction memory is combinational: address in, 32-bit instruction out. Simultaneously, a dedicated adder computes:

$$PC_{next} = PC + 4$$

This adder is hardwired to increment by 4; it is not the ALU. Using the ALU here would create a structural hazard in a pipelined design and would require routing the PC through ALU control logic unnecessarily.

**Step 2 — Decode and register read.** The 32-bit instruction is split by field position:

```
Bits [31:26]  opcode    → main control unit
Bits [25:21]  rs        → Read register 1
Bits [20:16]  rt        → Read register 2 (or Write register if RegDst=0)
Bits [15:11]  rd        → Write register (if RegDst=1)
Bits [15:0]   immediate → sign-extend unit → 32-bit value
Bits [5:0]    funct     → ALU control unit
```

The register file reads `rs` and `rt` simultaneously and unconditionally. The hardware does not wait to determine whether the instruction actually needs both operands. This is safe because reads are combinational and non-destructive — reading a register that turns out to be irrelevant wastes nothing.

**Step 3 — Execute.** `ALUSrc` selects the second ALU operand: `Read data 2` for R-type and `beq`, or the sign-extended immediate for `lw`, `sw`, and `addi`. The ALU computes its result and asserts `Zero` if the 32-bit output is $0$.

The branch target address is computed by a separate adder — not the main PC+4 adder, not the ALU:

$$PC_{branch} = (PC + 4) + \left(\text{SignExt}(\text{imm}_{15:0}) \ll 2\right)$$

The left shift by 2 (equivalent to multiplication by 4) converts word offsets to byte addresses. Branch offsets are always word-aligned, so the low 2 bits of any valid branch target are always `00` — those bits are implicit and not stored in the instruction encoding, buying 2 bits of extra branch range for free.

**Step 4 — Memory access.** `lw` asserts `MemRead=1`; the ALU result is the byte address; data memory outputs the 32-bit word at that address. `sw` asserts `MemWrite=1`; `Read data 2` is the value written. R-type instructions assert neither — data memory is idle, but it is still present in the datapath and its outputs are simply ignored downstream.

**Step 5 — Write back.** `MemtoReg` selects the source of
