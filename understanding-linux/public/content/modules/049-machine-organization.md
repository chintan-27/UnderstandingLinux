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

Every instruction the Linux kernel executes — a system call entry via `syscall`, a `memcpy` inside `copy_to_user`, a scheduler `cmpxchg` on the run queue — is ultimately a sequence of control signals routed through physical hardware. The datapath determines what transformations are *possible* on any given cycle; the control unit determines which transformation *actually happens*. If you don't understand this layer, you can't reason about why `add` costs one cycle while `lw` costs more, why out-of-order CPUs need hazard detection, or why the Linux ABI mandates that function arguments live in specific registers. These aren't arbitrary conventions — they're direct consequences of datapath geometry.

---

## Core Concepts

### The Datapath

The datapath is the set of hardware elements that hold and transform data: instruction memory, data memory, register file, ALU, dedicated adders, and the buses connecting them. The PC is a register inside the datapath holding the address of the instruction currently being fetched.

On each rising clock edge, the datapath reads the instruction at `PC`, routes operands through functional units, and writes results back. The PC increments by 4 because each 32-bit instruction occupies exactly 4 bytes — incrementing by 1 would point into the middle of the current instruction:

$$\text{PC}_{\text{next}} = \text{PC} + 4$$

For a taken branch, the 16-bit offset encoded in the instruction is sign-extended to 32 bits and shifted left by 2 (converting a *word* offset to a *byte* offset), then added to $\text{PC} + 4$ — not to `PC` itself, because the PC has already advanced during fetch:

$$\text{PC}_{\text{branch}} = (\text{PC} + 4) + (\text{SignExt}(\text{offset}) \ll 2)$$

The shift-left-by-2 is not an arbitrary encoding decision. It encodes $4\times$ the word offset in only 16 bits, giving a branch range of $\pm 2^{15} \times 4 = \pm 131072$ bytes from the instruction following the branch. Exceeding that range requires a jump instruction or a trampoline.

### The Register File

The register file is a synchronous-read, synchronous-write array of 32 × 32-bit storage cells (on MIPS). It exposes **two read ports** and **one write port**, so it can deliver both source operands and absorb one result within a single clock cycle.

Read is combinational: supply a 5-bit register index, and the value propagates to the output within the same half-cycle, before the clock edge that latches the ALU result. Write is clocked: the value is latched on the rising edge only when **RegWrite** is asserted. This asymmetry is intentional — if writes were also combinational, a write and a read to the same register in the same cycle would produce a race condition with undefined behavior.

Why exactly two read ports? Because every ALU R-type instruction (`add`, `sub`, `and`, `slt`, …) has two source registers. A single read port would require two sequential read cycles per instruction, doubling the cycle count for the most common instruction class. Adding a third read port would benefit almost no instruction (stores need two registers, but one is an address, handled separately) at the cost of increased silicon area and wiring complexity.

The cost of a register access versus a cache access is architectural, not incidental:

- Register read latency: $\sim 0.2\,\text{ns}$ (on-die, direct index)
- L1 cache hit latency: $\sim 1\text{–}4\,\text{ns}$ (on-die, but requires tag comparison and set indexing)
- L2 cache hit latency: $\sim 10\text{–}20\,\text{ns}$

This is why the compiler works hard to keep hot variables in registers rather than spilling them to the stack.

### The ALU

The ALU takes two 32-bit inputs $A$ and $B$ and produces a 32-bit result $R$ plus status bits. The critical status bit for control flow is **Zero**: if $R = 0$, Zero is asserted. For `beq`, the ALU computes $A - B$; if $A = B$, the difference is zero and the branch is taken. The branch decision costs no extra cycles — the subtraction and Zero detection happen in parallel with the rest of the execute stage.

The ALU does not decide its own operation. A 3-bit **ALUcontrol** input selects from the supported operations:

| ALUcontrol | Operation |
|---|---|
| `000` | AND |
| `001` | OR |
| `010` | Add |
| `110` | Subtract |
| `111` | Set-less-than |

Those 3 bits are produced by a two-level decoding scheme to avoid making the main control unit aware of every funct-field variant:

1. The **main control unit** reads the 6-bit opcode (bits 31:26) and emits a 2-bit **ALUOp**: `00` = add (for `lw`/`sw`), `01` = subtract (for `beq`), `10` = look at funct (for R-type).
2. The **ALU control unit** combines ALUOp with the 6-bit funct field (bits 5:0) to produce the final 3-bit ALUcontrol.

The two-level scheme exists because R-type instructions encode their specific operation in funct, not opcode. The opcode for every R-type instruction is `000000`; without the funct field, `add` and `sub` and `slt` would be indistinguishable. The main control unit handles the coarse categorization; the ALU control unit handles the fine discrimination within R-type.

For `lw`, the funct field is irrelevant — ALUOp `00` forces add regardless, because `lw` always computes `base + offset`. This is why the "don't care" entries exist in the truth table.

### Control Signals

The control unit is a combinational circuit: it maps a 6-bit opcode to 7 asserted/deasserted 1-bit output signals, with no state. There is no feedback loop — the opcode goes in, the signals come out within the same clock phase, before the rising edge that locks in results.

| Signal | = 0 | = 1 |
|---|---|---|
| **RegDst** | Write register ← `rt` (bits 20:16) | Write register ← `rd` (bits 15:11) |
| **RegWrite** | No register written | Latch result into write register |
| **ALUSrc** | ALU input B ← Read data 2 (register) | ALU input B ← sign-extended immediate |
| **PCSrc** | PC ← PC + 4 | PC ← branch target |
| **MemRead** | No memory read | Read data memory at ALU result address |
| **MemWrite** | No memory write | Write data memory at ALU result address |
| **MemtoReg** | Write data ← ALU result | Write data ← memory read data |

**RegDst** exposes a fundamental asymmetry in the MIPS instruction encoding: R-type instructions encode the destination in `rd` (bits 15:11), but I-type instructions (including `lw`) encode it in `rt` (bits 20:16). The same bit field means "second source" for R-type and "destination" for I-type. A single multiplexer controlled by RegDst resolves this without the register file needing to know which format is in flight.

**MemtoReg** is similarly critical: after a `lw`, the value to write back comes from data memory, not the ALU. After an `add`, it comes from the ALU, not memory. These two values are routed to a mux; MemtoReg selects which one reaches the register file's write data input. They cannot both be written simultaneously — the register file has one write port.

### Buses

In a single-cycle datapath, "bus" usually means a point-to-point bundle of wires carrying a multi-bit value from one functional unit to another. The term "shared bus" (multiple masters contending for the same wires) applies more to memory interconnects and peripheral buses (PCIe, AHB) than to the CPU datapath itself.

The 32-bit **Write data** path into the register file is the datapath's most consequential mux output: the MemtoReg mux sits here, selecting between the ALU result and the memory read data. Getting MemtoReg wrong doesn't raise an exception — it silently writes the wrong value into a register, corrupting program state. The control unit must assert it correctly for every instruction, every cycle.

---

## How It Works

### Single-Cycle Execution: R-Type (`add $t1, $t2, $t3`)

```
  Encoding: opcode=000000, rs=$t2(25:21), rt=$t3(20:16), rd=$t1(15:11), funct=100000
```

1. **Fetch**: PC is sent to instruction memory. The memory returns the 32-bit instruction word. Simultaneously, a dedicated adder computes PC+4 and feeds it back to PC (PCSrc=0 selects this path).
2. **Decode/Read**: Bits 25:21 and 20:16 index the register file's two read ports. `$t2` and `$t3` appear on Read data 1 and Read data 2 combinationally.
3. **Execute**: ALUSrc=0 routes Read data 2 (not an immediate) to ALU input B. ALUOp=10 combined with funct=`100000` (add) produces ALUcontrol=`010`. The ALU computes `$t2 + $t3`.
4. **Write back**: RegDst=1 routes bits 15:11 (`$t1`) to the write register index. MemtoReg=0 routes the ALU result to Write data. RegWrite=1 latches the result into `$t1` on the rising clock edge.

MemRead=0, MemWrite=0: data memory is not touched.

### Single-Cycle Execution: Load (`lw $t1, 100($t2)`)

Encoding: opcode=`100011`, rs=
