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

## Core Concepts
### Machine Organization Fundamentals
A computer’s machine organization is the concrete realization of the von Neumann model: a **datapath** that moves and transforms data, a **control unit** that decides what the datapath does each clock cycle, a **register file** for fast temporary storage, an **ALU** for arithmetic/logic, and **buses** that interconnect them. Each block exists because of a specific physical limitation or performance goal:

- **Datapath** – needed because raw memory is slow (≈100 ns) while registers are fast (≈1 ns). Moving data through a dedicated path lets us overlap fetch, decode, and execute.
- **Control** – the datapath cannot self‑schedule; control signals derive from the instruction opcode and pipeline state, turning a static circuit into a programmable one.
- **Register File** – provides multiple simultaneous read/write ports (typically 2 read, 1 write) so the datapath can fetch two operands and store a result in one cycle without structural hazards.
- **ALU** – implements the primitive operations that compose higher‑level instructions (add, sub, and, or, shift, compare). Its combinational logic depth determines the minimum clock period.
- **Buses** – separate address, data, and control lines reduce wiring complexity and allow concurrent operations (e.g., address sent while previous data transaction finishes).

### Datapath and Control in Detail
The classic five‑stage RISC pipeline (IF, ID, EX, MEM, WB) partitions the datapath to balance stage delays:

1. **Instruction Fetch (IF)** – PC → instruction memory → IR.  
   Control: `PCWrite`, `IFIDWrite`.
2. **Instruction Decode (ID)** – Register file read (two operands), sign‑extend immediate, generate control signals from opcode.  
   Control: `RegDst`, `ALUSrc`, `MemToReg`, `RegWrite`, `MemRead`, `MemWrite`, `Branch`, `ALUOp`.
3. **Execute (EX)** – ALU computes either `ALUresult = A op B` (R‑type) or `ALUresult = A + sign_extend(imm16)` (I‑type load/store/branch).  
   For branches: `BranchTarget = PC + 4 + (sign_extend(imm16) << 2)`.
4. **Memory (MEM)** – If `MemRead`: `LMD = DataMem[ALUresult]`; if `MemWrite`: `DataMem[ALUresult] = B`.
5. **Write‑Back (WB)** – If `RegWrite`: `RF[rd] = (MemToReg ? LMD : ALUresult)`.

The **control unit** can be implemented as a finite‑state machine (FSM) that asserts the above signals based on the current pipeline register contents. Because each signal is a Boolean function of a few bits, the control logic is small and fast—typically a few gate delays.

### Register File
A register file with *R* registers, *Rₚ* read ports, and *R_w* write ports is built from an array of flip‑flops plus decoders. For a 32‑register MIPS file:

- **Read ports**: two 5‑bit decoders select registers; each port outputs a 32‑bit bus.  
- **Write port**: one 5‑bit decoder enables a write‑enable line; data is latched on the rising edge of the clock if `RegWrite=1`.

Why multiple ports? To avoid structural hazards: an instruction needing two source registers and a destination register must read two and write one in the same cycle. The read‑after‑write (RAW) hazard is handled by forwarding, not by stalling the register file.

### ALU
The ALU is a combinational block built from:

- **Adder/subtractor** (ripple‑carry or carry‑look‑ahead) for ADD/SUB.
- **Logic units** (AND, OR, XOR) for bitwise ops.
- **Shifter** (logical/arithmetic left/right, rotate).
- **Comparator** (set‑on‑less‑than) for SLT/SLTU.

The **critical path** is usually the carry‑propagation of the adder; a 32‑bit CLA adds ≈4 gate delays, setting the minimum clock period $T_{clk} \ge t_{ALU}+t_{reg}+t_{mux}$.

### Buses
- **Address Bus**: unidirectional from CPU to memory/I/O; width = address size (e.g., 64 bits on x86‑64).  
- **Data Bus**: bidirectional; width = word size (typically 64 bits).  
- **Control Bus**: carries signals like `MemRead`, `MemWrite`, `IRQ`, `Reset`.

Bus arbitration (e.g., daisy‑chain or round‑robin) decides which device drives the data bus when multiple masters exist (CPU, DMA). The **bus cycle time** limits memory bandwidth: $BW = \frac{DataWidth}{BusCycleTime}$.

---

## How It Works
### Instruction Execution Pipeline
When a program runs, the CPU repeatedly performs the five stages. The pipeline allows a new instruction to start each clock cycle after the pipeline is filled, giving an ideal **CPI = 1** (cycles per instruction). Real CPI rises due to:

- **Data hazards** (RAW, WAR, WAW) – resolved by forwarding or stalls.
- **Control hazards** (branches) – resolved by branch prediction, delay slots, or flushing.
- **Structural hazards** – avoided by duplicating resources (e.g., separate instruction and data memories).

#### Stage‑by‑Stage Signal Derivation
Consider an I‑type load `LW rt, offset(rs)`. The control signals are:

| Signal       | Value | Reason |
|--------------|-------|--------|
| `RegDst`     | 0     | rt field determines destination register |
| `ALUSrc`     | 1     | second ALU operand is immediate |
| `MemToReg`   | 1     | WB selects memory data |
| `RegWrite`   | 1     | write result to register file |
| `MemRead`    | 1     | read from data memory |
| `MemWrite`   | 0     | no store |
| `Branch`     | 0     | not a branch |
| `ALUOp`      | 00    | ALU performs addition (for address) |

The **effective address** is computed in EX:
$$
EA = R[rs] + \text{sign\_extend}(offset_{16})
$$
In MEM, the CPU reads `DataMem[EA]` into the `LMD` pipeline register. In WB, `RF[rt] ← LMD`.

#### Timing Example
Assume gate delays: register‑file read $t_{rf}=150$ ps, ALU $t_{alu}=200$ ps, data‑memory access $t_{dm}=300$ ps, mux $t_{mux}=50$ ps. The longest stage is MEM (300 ps + mux 50 ps = 350 ps). Therefore the clock period must satisfy:
$$
T_{clk} \ge 350\text{ ps} \;\; \Rightarrow \;\; f_{max} \approx 2.86\text{ GHz}
$$
If the actual clock is 2 GHz ($T_{clk}=500$ ps), each stage has slack, allowing timing margins.

### Control Unit Implementation (Hardwired)
A simple hardwired control unit uses a PLA or sum‑of‑products logic. For the `ALUOp` field (2 bits) we generate three internal signals:

- `ALUAdd = ALUOp[1]´·ALUOp[0]´` (00 → add)
- `ALUSub = ALUOp[1]´·ALUOp[0]`   (01 → subtract)
- `ALUAnd = ALUOp[1]·ALUOp[0]´`   (10 → and)

The ALU then selects the operation via a 4‑to‑1 mux controlled by these signals.

---

## Worked Examples
### Example 1: `ADD $t1, $t2, $t3`
Assume initial state:
- `$t2 = 0x00000010`
- `$t3 = 0x00000020`
- PC = 0x00400000 (instruction at this address)

| Cycle | Stage | Action | Register/Memory Values |
|-------|-------|--------|------------------------|
| 1 | IF | Fetch instruction `0x01234020` (opcode=0, rs=$t2, rt=$t3, rd=$t1, funct=0x20) | IF/IR = 0x01234020 |
| 2 | ID | Read `$t2`, `$t3` from RF; set control: `ALUSrc=0`, `RegDst=1`, `RegWrite=1`, `ALUOp=10` (funct → add) | ID/A = 0x10, ID/B = 0x20 |
| 3 | EX | ALU computes `0x10 + 0x20 = 0x30` | EX/ALUout = 0x30 |
| 4 | MEM | No memory access; pass-through | MEM/ALUout = 0x30 |
| 5 | WB | Write 0x30 to `$t1` | RF[$t1] = 0x30 |

Result: `$t1 = 0x30`. No stalls; CPI = 1.

### Example 2: `LW $t1, 8($t2)`
Assume:
- `$t2 = 0x00001000`
- Memory[0x1008] = 0xdeadbeef
- PC = 0x00400004

| Cycle | Stage | Action | Values |
|-------|-------|--------|--------|
| 1 | IF | Fetch `0x8c290008` (opcode=0x23, rt=$t1, rs=$t2, imm=8) | IR = 0x8c290008 |
| 2 | ID | Read `$t2`; sign‑extend imm → 0x00000008; controls: `ALUSrc=1`, `MemRead=1`, `MemToReg=1`, `RegWrite=1` | A = 0x1000, B = 0x00000008 |
| 3 | EX | ALU: `EA = 0x1000 + 0x00000008 = 0x1008` | ALUout = 0x1008 |
| 4 | MEM | Read DataMem[0x1008] = 0xdeadbeef → LMD | LMD = 0xdeadbeef |
| 5 | WB | Write LMD to `$t1` | RF[$t1] = 0xdeadbeef |

If the previous instruction wrote to `$t2`, a RAW hazard would appear; forwarding from EX/MEM or MEM/WB to the ID stage’s A input eliminates the stall.

### Example 3: `SW $t1, 8($t2)`
Assume:
- `$t2 = 0x00001000`
- `$t1 = 0x11223344`
- PC = 0x00400008

| Cycle | Stage | Action |
|-------|-------|--------|
| 1 | IF | Fetch `0xac290008` (opcode=0x2b) |
| 2 | ID | Read `$t1` (data) and `$t2` (base); imm=8 → controls: `ALUSrc=1`, `MemWrite=1` |
| 3 | EX | ALU: EA = `$t2` + 8 = 0x1008 |
| 4 | MEM | Write `$t1` to DataMem[0x1008] |
| 5 | WB | No register write (RegWrite=0) |

Result: Memory[0x1008] now holds 0x11223344.

---

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **“The datapath executes instructions on its own.”** | The datapath is purely combinational/sequential hardware; without control signals it cannot select which operation to perform or when to latch results. | Control unit asserts signals (e.g., `ALUSrc`, `RegWrite`) that steer data through the datapath each cycle. |
| **“The register file is just a small cache.”** | A cache is transparent, stores copies of memory, and uses tags; the register file is architecturally visible, has a fixed set of names, and is accessed directly by instructions. | Registers are explicit operands; they provide the fastest possible storage because they are built from flip‑flops with multi‑port access, not from SRAM arrays with tag checks. |
| **“The ALU also performs memory accesses.”** | Memory access requires address generation and a separate memory array; the ALU only computes arithmetic/logic results. | The ALU computes the effective address; the MEM stage uses that address to read/write the data memory. |
| **“Buses are just wires; more wires always mean faster transfer.”** | Adding wires increases capacitance and propagation delay; bus width trades off pin count vs. bandwidth, and bus protocols introduce overhead. | Effective bandwidth = (data width × transfer rate) / (overhead + latency). Wider buses help only if the controller can sustain the rate. |
| **“Pipelining always yields CPI = 1.”** | Hazards (data, control, structural) cause stalls or flushes, raising CPI. Branch mispredictions can cost several cycles. | Real CPI = ideal CPI + stall cycles per instruction due to hazards; minimizing stalls requires forwarding, good branch prediction, and balanced pipeline design. |

---

## Exercises
### Easy
1. **Address Calculation** – For `LW $t5, 16($t6)`, if `$t6 = 0x000007F0`, what is the effective address? Show the sign‑extension step.
2. **Control Signal Identification** – List the control signals (`RegDst`, `ALUSrc`, `MemRead`, `MemWrite`, `MemToReg`, `RegWrite`, `Branch`) for the instruction `OR $t7, $t8, $t9`.

### Medium
3. **Pipeline Diagram with Forwarding** – Given the instruction sequence:
   ```
   ADD $t1, $t2, $t3
   SUB $t4, $t1, $t5
   AND $t6, $t4, $t7
   ```
   Draw a five‑stage pipeline timing diagram (clock cycles 1‑6) indicating where forwarding paths are needed to avoid stalls. Label each pipeline register (IF/ID, ID/EX, EX/MEM, MEM/WB) and the forwarded values.
4. **Branch Penalty Calculation** – Assume a 5‑stage pipeline with a branch resolved in the EX stage. If the branch predictor is 90 % accurate and the misprediction penalty is 3 cycles, compute the effective CPI for a program where 20 % of instructions are branches.

### Hard
5. **Control Unit Truth Table** – Derive the Boolean expressions for the control signals `MemRead` and `MemWrite` as functions of the 6‑bit opcode field (assuming the MIPS opcode map). Show the Karnaugh map simplification for `MemRead`.
6. **Performance Experiment** – Write a C program that executes a tight loop of 10⁸ integer additions. Compile with `gcc -O0 -o add0 add.c` and `gcc -O3 -o add3 add.c`. Use `perf stat -e cycles,instructions,cache-references,cache-misses ./add0` and `perf stat … ./add3` to measure CPI and cache behavior. Explain the differences in terms of pipeline stalls and memory hierarchy usage.

---

## Linux Connection
The Linux kernel and user‑space programs run on the same machine organization described above. Concrete manifestations include:

### System‑Call Entry
On x86‑64, a system call is invoked via the `syscall` instruction (opcode `0x0f 0x05`). The kernel entry point (`entry_SYSCALL_64`) saves user registers, switches to kernel stack, and dispatches via the syscall table.

```bash
# View the syscall entry in the kernel (requires kernel source)
grep -n "entry_SYSCALL_64" arch/x86/entry/entry_64.S
```

### Context Switch & Register File
During a context switch, the kernel executes `switch_to(prev, next)`. In assembly (`arch/x86/entry/entry_64.S`), it saves the caller‑saved registers (`rax, rcx, rdx, rsi, rdi, r8‑r11`) and the callee‑saved registers (`rbx, rbp, r12‑r15`) onto the kernel stack, then loads the new task’s register state. This is a direct save/restore of the register file.

```bash
# Show the switch_to macro (simplified)
grep -A20 "switch_to" arch/x86/include/asm/thread_info.h
```

### Translation Lookaside Buffer (TLB)
The MMU uses a TLB to cache virtual‑to‑physical address translations. A TLB miss triggers a page‑walk that reads the page table from RAM (via the data bus). Linux exposes TLB statistics:

```bash
cat /proc/kpagecount | wc -l   # rough count of pages
perf stat -e dtlb_load_misses.refill:u ./a.out
```

### Observing Machine Instructions
You can inspect the exact machine code generated for a C program and see how it maps to datapath operations:

```c
// add.c
int main() {
    volatile int a = 5, b = 10, c;
    c = a + b;
    return 0;
}
```

```bash
gcc -O0 -march=native -S add.c -o add.s   # produce AT&T syntax asm
cat add.s
# Look for the add instruction:    addl    %esi, %edi   (example)
objdump -d -M intel a.out | grep -A2 "<main>:"   # see machine code
```

### Measuring CPI with `perf`
The retired‑instruction count and cycle count give actual CPI:

```bash
perf stat -e instructions,cycles ./a.out
# CPI = cycles / instructions
```

### Controlling Branch Prediction
The Linux `perf` tool can show branch misses:

```bash
perf stat -e branch-misses,branches ./a.out
```

A high miss rate indicates control‑hazard stalls that the pipeline must flush.

### DMA and Bus Utilization
A simple DMA test (using `hdparm` on a disk) shows how the CPU can offload data movement, freeing the datapath for computation:

```bash
hdparm -tT /dev/sda   # timings of cached vs buffered reads
```

These examples illustrate that the same principles of datapath, control, register file, ALU, and buses govern both user programs and the Linux kernel itself.

---

## Why This Matters
Understanding machine organization lets you reason about **where time is spent** in a program and how to change it:

- **Pipeline awareness** explains why tight loops of independent integer ops achieve near‑1 CPI, while dependency chains stall the EX stage.
- **Branch prediction** knowledge guides you to write predictable loops (`for (i=0; i<N; ++i)`) or use `__builtin_expect` to hint the CPU.
- **Memory‑access patterns** dictate whether the prefetcher can hide latency; strided accesses cause more bus traffic and lower effective bandwidth.
- **Register pressure** informs compiler optimization: spilling to memory adds MEM‑stage traffic and raises CPI.
- **System‑call overhead** is visible as a pipeline flush and register‑file save/restore; batching syscalls (e.g., `readv`/`writev`) reduces this cost.
- **Performance tools** (`perf`, `vtune`, `likwid`) ultimately measure quantities that stem from the datapath and control signals (cycle counts, stall reasons, cache miss rates).

By connecting abstract hardware blocks to concrete Linux interfaces—syscall entry, context switches, TLB misses, `perf` counters—you gain the ability to **diagnose** bottlenecks, **tune** kernels and applications, and **design** software that works *with* the underlying machine organization rather than against it. This depth transforms you from a coder who merely writes instructions into an engineer who orchestrates the flow of data through silicon.
