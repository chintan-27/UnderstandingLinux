---
id: 50
title: "Instruction set architecture"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

Every program you write eventually becomes a sequence of fixed-width binary patterns that a CPU fetches from memory and executes. The instruction set architecture (ISA) is the contract between software and hardware: it defines exactly which binary patterns are legal, what they mean, which registers they touch, and what privileges they require.

This contract has direct consequences for systems programming. When Linux performs a context switch, it must save and restore every register the ISA defines as part of architectural state. When `gdb` disassembles a crash, it uses the ISA to parse raw bytes into instructions. When the kernel sets up a new process with `execve`, it zeroes or initializes registers according to the ISA's ABI conventions. When a process issues `syscall` on x86-64, the hardware uses ISA-defined mechanism — not software — to switch privilege levels. Understanding the ISA means understanding *why* these mechanisms are built the way they are.

---

## Core Concepts

### Opcodes

An opcode is the bit field that tells the control unit which operation to perform. It is decoded first, before any other field, because the meaning of every other bit in the instruction depends on it.

On MIPS, every instruction is exactly 32 bits wide. The top 6 bits are the opcode field. `opcode = 000000` means "R-type: consult the `funct` field at bits [5:0] for the actual operation." This indirection exists because there are more than $2^6 = 64$ possible register-to-register operations, but only 64 opcode values. The `funct` field provides a second 6-bit namespace, giving $2^6 = 64$ additional encodings — all under a single opcode.

This design — fixed width, fixed opcode position — makes the decode stage a single-cycle lookup. x86, by contrast, uses variable-length encodings (1–15 bytes per instruction) with optional prefix bytes that modify opcode meaning. This allows denser code and a larger instruction vocabulary, but requires a substantially more complex decoder; modern x86 CPUs dedicate significant die area to the pre-decode stage that just figures out instruction boundaries.

### Instruction Formats

An instruction format partitions the 32 bits into named fields. The format is not discovered at runtime — it is determined entirely by the opcode. MIPS defines three formats:

**R-type** (register-to-register operations):

```
| opcode (6) | rs (5) | rt (5) | rd (5) | shamt (5) | funct (6) |
```

**I-type** (loads, stores, branches, immediate arithmetic):

```
| opcode (6) | rs (5) | rt (5) | immediate (16) |
```

**J-type** (unconditional jumps):

```
| opcode (6) | address (26) |
```

The field widths are not arbitrary. Each format uses all 32 bits with no wasted space. The 16-bit immediate in I-type is a direct consequence of allocating 6 bits for the opcode and 5 bits each for two register fields: $32 - 6 - 5 - 5 = 16$. Any design change — wider registers, more registers, larger immediates — propagates as a constraint through every format.

### Registers

Registers are the only storage the ALU can operate on directly. A MIPS `add` instruction cannot add two memory locations — it must add two registers, because the hardware paths between the register file and the ALU are what make single-cycle execution possible. Memory access takes many cycles; register access takes one.

MIPS has 32 general-purpose 32-bit registers, `$0`–`$31`. They are encoded as 5-bit fields because $\lceil \log_2(32) \rceil = 5$. Register `$0` (`$zero`) is hardwired to zero at the hardware level: writes are silently discarded, reads always return 0. This enables useful encodings without extra opcodes. The pseudoinstruction `move $t0, $t1` assembles to `add $t0, $zero, $t1` — no dedicated move opcode needed.

The tradeoff in register count is real. Doubling to 64 registers would require 6-bit register fields. In R-type, three register fields would consume $3 \times 6 = 18$ bits instead of 15, shrinking the `shamt` or `funct` field. In I-type, two 6-bit fields plus a 6-bit opcode leave only $32 - 6 - 6 - 6 = 14$ bits for the immediate, reducing branch range and load/store offset range. x86-64 expanded from 8 to 16 general-purpose registers by adding a REX prefix byte — adding a whole byte of overhead per instruction to encode 4 extra bits.

### Addressing Modes

An addressing mode defines how an instruction computes the effective address or operand value. The mode is implicit in the instruction type and opcode — there is no separate "mode" field.

| Mode | Example | Effective address / value |
|------|---------|--------------------------|
| Register | `add $t0, $t1, $t2` | Value = register contents |
| Immediate | `addi $t0, $t1, 4` | Value = sign-extended 16-bit constant |
| Base + offset | `lw $t0, 8($sp)` | Address = `$sp` + sign-extend(8) |
| PC-relative | `beq $t0, $t1, L` | Target = (PC + 4) + sign-extend(offset) × 4 |
| Pseudo-direct | `j L` | Target = `{PC[31:28], addr26, 00}` |

PC-relative addressing exists because branches are almost always local. A 16-bit signed offset covers $\pm 2^{15}$ instructions $= \pm 131{,}072$ bytes, which handles any branch within a typical function or even a large compilation unit. Encoding a full 32-bit absolute target would require 32 bits just for the address, leaving no room for register fields in the same instruction word.

The `j` instruction's pseudo-direct mode covers $2^{26}$ word addresses $= 2^{28}$ bytes $= 256\text{ MB}$ per region. The top 4 bits of the target are inherited from the PC, so a `j` instruction cannot reach across a 256 MB boundary. This is why large programs occasionally require the linker to emit a `jr` sequence loading a full 32-bit address into a register.

### Privilege Levels

The ISA defines hardware-enforced privilege rings. MIPS defines kernel mode and user mode. x86 defines four rings (0–3); Linux uses only ring 0 (kernel) and ring 3 (user). The current privilege level is stored in a hardware register (the `CPL` field of the `CS` segment register on x86; the KSU bits in the `Status` register on MIPS).

In user mode, instructions that touch hardware control — modifying page tables, disabling interrupts, accessing I/O ports — are illegal. The CPU checks the privilege level *before* executing the instruction. A violation raises a hardware exception that unconditionally transfers control to a kernel-defined handler. No software in the process is consulted; no user-space signal handler runs first. This is why process isolation is a hardware property, not a software policy.

The mechanism for intentionally entering kernel mode from user space is the system call instruction (`syscall` on x86-64 and MIPS, `svc` on ARM). The ISA defines exactly what happens at that instruction: the privilege level changes, the stack pointer may switch, and control transfers to a fixed kernel entry point. On x86-64, `syscall` saves `RIP` and `RFLAGS` and jumps to the address in the `LSTAR` MSR — a register only kernel mode can write. The kernel sets `LSTAR` during boot; user space cannot change it.

---

## How It Works

### Decoding an R-type Instruction

Given the 32-bit value:

```
0000 0010 0001 0000 1000 0000 0010 0000
```

Parse into fields:

```
opcode  rs      rt      rd      shamt   funct
000000  10000   10000   10000   00000   100000
  0      16      16      16       0      32
```

- `opcode = 0` → R-type; interpret `funct`
- `funct = 32` (0x20) → `add`
- `rs = 16` → `$s0`, `rt = 16` → `$s0`, `rd = 16` → `$s0`

Result: `add $s0, $s0, $s0` — doubles `$s0`. The instruction set does not have a "double" opcode because the `add` encoding already expresses it when all three register fields are the same.

### PC-Relative Branch Arithmetic

The branch instruction `beq $t0, $t1, label` encodes a 16-bit signed word offset. The target is:

$$\text{target} = (\text{PC} + 4) + (\text{offset}_{\text{sign-extended}} \times 4)$$

The `+4` advances past the current instruction (accounting for the delay slot in real MIPS pipelines). The `×4` converts a word-count offset to a byte address, since MIPS instructions are 4 bytes wide.

The reachable range:

$$\Delta = \pm 2^{15} \text{ words} = \pm 2^{15} \times 4 \text{ bytes} = \pm 131{,}072 \text{ bytes}$$

For targets beyond this range, the assembler typically emits:

```asm
beq  $t0, $t1, skip   # inverted branch over the jump
j    far_label         # 26-bit pseudo-direct jump
skip:
```

For targets beyond 256 MB (outside the `j` range), the assembler emits:

```asm
lui  $at, %hi(far_label)
ori  $at, $at, %lo(far_label)
jr   $at
```

The `j` instruction's 26-bit field addresses $2^{26}$ words. The full 32-bit target is assembled as:

$$\text{target} = \{\ \underbrace{PC[31:28]}_{
