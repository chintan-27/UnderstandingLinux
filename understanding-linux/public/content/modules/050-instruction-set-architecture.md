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

Every C statement you write compiles to a sequence of encoded integers. The CPU fetches each integer, decodes which operation it encodes, and executes it. The ISA is the formal contract specifying exactly which bit patterns map to which operations, which registers exist, what memory alignment is required, and which operations are restricted to privileged code. Without this contract, a compiler cannot generate correct code, an OS cannot isolate processes, and a debugger cannot walk a stack. When a segfault kills your process, it is because the CPU detected a privilege or memory violation *defined in the ISA* and transferred control to the kernel's exception handler — a mechanism that only functions because every layer honors identical encoding rules.

---

## Core Concepts

### Opcodes: Numbers That Mean Operations

Every instruction is a fixed-width or variable-width integer in which some bits encode *which operation* to perform (the opcode) and the remaining bits encode operands. On MIPS, every instruction is exactly 32 bits and the top 6 bits are the opcode field. Opcode `0b000000` means "this is an R-type instruction — look at the bottom 6 bits (the `funct` field) to determine the actual operation." This two-level dispatch exists because 6 bits allows only $2^6 = 64$ distinct opcodes, which is insufficient for all the arithmetic variants MIPS needs without widening the instruction.

On x86-64, opcodes are variable length: 1–4 bytes for the opcode alone, preceded by up to four optional prefix bytes. The decoder cannot know where one instruction ends and the next begins until it has consumed enough bytes to identify the opcode — which itself tells it how many operand bytes follow. This is the fundamental reason x86 instruction decoding requires a state machine while MIPS decoding is a combinational logic problem.

### Instruction Formats: The Bit Layout Contract

MIPS uses three canonical 32-bit formats:

| Format | Bits 31–26 | Bits 25–21 | Bits 20–16 | Bits 15–11 | Bits 10–6 | Bits 5–0 |
|--------|------------|------------|------------|------------|-----------|----------|
| **R-type** | opcode (6) | rs (5) | rt (5) | rd (5) | shamt (5) | funct (6) |
| **I-type** | opcode (6) | rs (5) | rt (5) | immediate (16) | | |
| **J-type** | opcode (6) | target address (26) | | | | |

R-type encodes register-to-register operations (`add`, `sub`, `slt`). I-type carries a 16-bit immediate and handles loads, stores, branches, and immediate arithmetic. J-type encodes jump targets. The format is not labeled inside the instruction — the decoder infers it entirely from the opcode field, which is why opcode 0 is special: its R-type format is only discoverable because the ISA designates opcode 0 as the R-type sentinel.

The 16-bit immediate in I-type is sign-extended to 32 bits before use. This means `addi $t0, $t0, -1` encodes `0xFFFF` in the immediate field, and the hardware sign-extends it to `0xFFFFFFFF` — giving you the full signed integer range $[-32768,\ 32767]$ from 16 bits.

### Registers: The CPU's Working Memory

Registers sit inside the processor and are accessible in under one clock cycle, orders of magnitude faster than even L1 cache. MIPS has 32 general-purpose 32-bit registers (`$0`–`$31`). Register `$0` always reads as zero regardless of what is written to it — this is not a software convention but a hardware invariant baked into the register file. The ISA exploits it: `move $t0, $t1` is not a real instruction but a pseudo-instruction the assembler encodes as `add $t0, $zero, $t1` (opcode 0, funct 32, rs = `$t1`, rd = `$t0`).

The register count of 32 is not arbitrary. Three 5-bit register specifiers fit into a 32-bit instruction alongside a 6-bit opcode and a 6-bit funct field with zero bits wasted:

$$6 + 5 + 5 + 5 + 5 + 6 = 32 \text{ bits}$$

Doubling to 64 registers would require 6-bit specifiers, consuming 3 additional bits per R-type instruction, which would force either a wider instruction or a narrower immediate or funct field — each with its own cost.

x86-64 has 16 general-purpose 64-bit registers (`rax`–`r15`), with the 8 original registers (`rax`–`rdi`) requiring a `REX` prefix to access the high registers `r8`–`r15`. This prefix byte exists because the original x86 encoding had no room for a 4th register bit — it was added in 64-bit mode by repurposing an unused opcode prefix slot.

### Addressing Modes: How Operands Are Located

An *addressing mode* defines how the CPU computes the effective address (EA) of an operand:

| Mode | EA Formula | Example |
|------|-----------|---------|
| Register | operand is register content | `add $t0, $t1, $t2` |
| Immediate | operand is encoded in instruction | `addi $t0, $t0, 4` |
| Base + offset | $EA = \text{reg} + \text{sign\_ext}(\text{imm16})$ | `lw $t0, 8($sp)` |
| PC-relative | $EA = (PC + 4) + \text{sign\_ext}(\text{imm16}) \times 4$ | `beq $t0, $t1, label` |
| Pseudo-direct | $EA = \{PC[31:28],\ \text{imm26},\ 00_2\}$ | `j target` |

MIPS restricts itself to these five modes because each maps to simple adder logic in the execution unit. x86 supports `base + index × scale + displacement` as a single addressing mode — where scale $\in \{1, 2, 4, 8\}$ — which simplifies array indexing code at the cost of a more complex address-generation unit (AGU) in hardware.

The reason `lw` and `sw` require base + offset rather than supporting arbitrary addressing is that memory access latency is already the bottleneck; complex address computation during the same cycle would either lengthen the critical path or require an extra pipeline stage.

### Privilege Levels: Hardware-Enforced Isolation

CPUs define privilege levels stored in a status register. On MIPS, this is a 2-bit field in the `CP0 Status` register (`$12` in coprocessor 0). On x86-64, it is the 2-bit CPL field in the `CS` segment register. Linux uses two levels: kernel mode (ring 0 / MIPS KSU=0) and user mode (ring 3 / MIPS KSU=2). Rings 1 and 2 exist on x86 but Linux does not use them.

Privileged instructions — writing to page table base registers (`CR3` on x86-64, `CP0 EntryHi/Lo` on MIPS), flushing TLBs, halting the CPU, accessing I/O ports — raise a hardware exception immediately if executed in user mode. The CPU does not ask the OS; it traps unconditionally. This is the mechanism that makes process isolation a hardware guarantee rather than a software policy.

Crossing from user to kernel mode is only possible through controlled entry points:

- **MIPS**: the `syscall` instruction raises a synchronous exception, saving the PC into `CP0 EPC`, setting the KSU bits to kernel mode, and jumping to the exception vector at `0x80000180`.
- **x86-64**: the `syscall` instruction saves `RIP` into `RCX`, saves `RFLAGS` into `R11`, loads the kernel's RIP from `IA32_LSTAR` MSR, and switches CPL to 0. The jump target is set by the kernel at boot — user code cannot influence it.

---

## How It Works

### Decoding a MIPS Instruction by Hand

Take the 32-bit hex value `0x02308020`. In binary:

```
0000 0010 0011 0000 1000 0000 0010 0000
```

Split by field widths (6/5/5/5/5/6):

```
opcode  rs     rt     rd     shamt  funct
000000  10001  10000  10000  00000  100000
  0      17     16     16      0     32
```

- Opcode = 0 → R-type, consult `funct`
- `funct` = 32 = `0x20` → `add`
- rs = 17 = `$s1`, rt = 16 = `$s0`, rd = 16 = `$s0`

Result:

```asm
add $s0, $s1, $s0      # $s0 = $s1 + $s0
```

You can verify this in any MIPS simulator or cross-assembler. The mapping of register numbers to ABI names (`$s0` = 16, `$s1` = 17) is a software convention, not encoded in the instruction.

### Branch Target Calculation

Branch instructions encode a *signed 16-bit word offset*. The CPU computes:

$$\text{target} = (PC + 4) + (\text{sign\_ext}(\text{offset}_{16}) \times 4)$$

The $PC + 4$ appears because MIPS uses a *branch delay slot*: by the time the branch is evaluated, the PC has already advanced to the next instruction (and that instruction executes regardless of the branch outcome). Multiplying by 4 converts word offset to byte offset. The reachable range is:

$$\Delta = \pm 2^{15} \times 4 = \pm 131{,}072 \text{ bytes} = \pm 128 \text{ KiB}$$

A branch to a label more than 128
