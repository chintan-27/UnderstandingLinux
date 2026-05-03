---
id: 66
title: "Assemblers and object generation"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Why This Matters

When you invoke `gcc -c`, the assembler converts mnemonics into bytes but cannot answer two questions: *what virtual address will this code occupy at runtime?* and *where exactly do external symbols like `printf` live?* Without a principled system for deferring those answers, linking multiple `.o` files would require recompiling everything together, shared libraries couldn't be mapped at arbitrary addresses, and position-independent code would be impossible. The assembler's answer is to emit *object files*: binaries that are complete in encoding but intentionally incomplete in addressing, with structured metadata — symbol tables and relocation entries — that tell the linker precisely which bytes to patch and how.

## Core Concepts

### Symbols

A symbol is a name bound to a value — typically an offset within a section that will become a virtual address after linking. The assembler distinguishes two kinds:

- **Defined symbols**: the label appears in this translation unit. The assembler records its section-relative offset in `.symtab`.
- **Undefined symbols**: referenced here, defined elsewhere. The assembler records the name and leaves the value as zero, obligating the linker to fill it in.

The split is forced by the one-file-at-a-time model. The assembler has no visibility outside the current translation unit, so it cannot resolve cross-file references — only describe them.

Symbols also carry *binding* (local vs. global) and *type* (function vs. object vs. section). Local symbols (lowercase labels, `static` functions in C) are invisible to the linker for symbol resolution; they exist only to support relocation within the file. Global symbols are the linker's vocabulary.

### Relocation

The assembler produces code as if each section starts at offset 0. Any instruction whose encoding embeds an address that isn't yet known — a call to an external function, a reference to a global variable in `.data` — gets flagged with a *relocation entry*. The entry records:

> "At byte offset $X$ in section $S$, patch in the address of symbol $Y$, using formula $Z$."

Without relocation entries, the linker would have to disassemble every instruction to find embedded addresses — an approach that fails for variable-length ISAs and is architecturally unsound regardless.

### Instruction Encoding

Encoding is mechanical: the assembler looks up the ISA-specified bit pattern for each opcode and operand combination, fills in register fields and immediates, and emits bytes. The interesting case is instructions that embed addresses, because those bytes may be zeros at assemble time and must be patched later.

For x86-64, instruction length varies from 1 to 15 bytes depending on prefixes, opcode width, ModRM/SIB bytes, displacement, and immediate. The offset of an embedded address within an instruction is what goes into `r_offset` of the relocation entry — the linker needs byte-level precision.

## How It Works

### Y86-64 Encoding (Concrete Example)

Y86-64's uniform structure makes encoding arithmetic visible. Every instruction starts with a byte split into two 4-bit fields:

$$\text{byte}_0 = (\texttt{icode} \ll 4) \mid \texttt{ifun}$$

For `irmovq $15, %rbx`:

| Field | Bits | Value | Meaning |
|---|---|---|---|
| icode | [7:4] | `3` | `irmovq` |
| ifun | [3:0] | `0` | no variants |
| rA | [7:4] of byte 1 | `F` | no source register (sentinel) |
| rB | [3:0] of byte 1 | `3` | `%rbx` |
| V | bytes 2–9 | `0F 00 ... 00` | value 15, little-endian 64-bit |

Full encoding: `30 F3 0F 00 00 00 00 00 00 00` (10 bytes).

The sentinel `0xF` for "no register" is not a hardware concept — it is a Y86-64 ISA convention that lets the register byte always be present, keeping the decoder logic branchless. Real ISAs use similar tricks: x86-64's `SIB.index = 100b` means "no index register."

### PC-Relative Jump Encoding

For a direct jump within the same file, the assembler resolves the target in a two-pass scan: pass 1 records all label offsets, pass 2 encodes instructions using those offsets. The embedded value is not the target's address — it is a *PC-relative offset*:

$$\texttt{rel32} = \texttt{addr}(\texttt{target}) - \texttt{addr}(\texttt{next\_instruction})$$

where $\texttt{addr}(\texttt{next\_instruction}) = \texttt{addr}(\texttt{jmp}) + \texttt{sizeof}(\texttt{jmp})$.

This is why position-independent code is possible: two instructions in the same `.text` section maintain a constant distance regardless of where the OS maps the segment. The offset is correct at any load address.

For a jump to an *external* symbol, the assembler emits `rel32 = 0` and records a relocation entry. The linker computes the correct offset after it knows both addresses.

### Relocation Entries in ELF

ELF stores relocation entries in `.rela.text` (for x86-64, which uses explicit addends). The kernel's `elf.h` defines:

```c
typedef struct {
    Elf64_Addr   r_offset;  /* byte offset within section to patch */
    Elf64_Xword  r_info;    /* ELF64_R_SYM(r_info): index into .symtab  */
                            /* ELF64_R_TYPE(r_info): relocation type     */
    Elf64_Sxword r_addend;  /* constant added to the relocated value     */
} Elf64_Rela;
```

The two most common relocation types on x86-64:

| Type | Width | Formula | Used for |
|---|---|---|---|
| `R_X86_64_PC32` | 32-bit | $S + A - P$ | `call`/`jmp` to external function |
| `R_X86_64_64` | 64-bit | $S + A$ | absolute data reference |
| `R_X86_64_PLT32` | 32-bit | $L + A - P$ | call through PLT (shared libs) |

Where $S$ = resolved symbol address, $A$ = `r_addend`, $P$ = `r_offset` (address of the patch site), $L$ = PLT entry address.

For `R_X86_64_PC32`, the linker computes:

$$\texttt{patch} = S + A - P$$

and writes the result as a signed 32-bit value at byte offset `r_offset`. If the result doesn't fit in 32 bits, the linker errors — this is the source of the dreaded *relocation truncated to fit* error when linking objects more than 2 GiB apart.

### What the Assembler Actually Produces

```
source.s  →  [as / gas]  →  source.o  (ELF relocatable)
source.c  →  [cc1 / as]  →  source.o  (same format)
```

An ELF relocatable object (`ET_REL`) contains:

| Section | Contents |
|---|---|
| `.text` | Encoded instruction bytes; external call targets are zero-filled |
| `.data` / `.rodata` | Initialized data; absolute pointers are zero-filled |
| `.bss` | Uninitialized data; occupies no file space (only a size record) |
| `.symtab` | One `Elf64_Sym` per symbol: name offset, value, size, binding, type |
| `.strtab` | Null-terminated symbol names, referenced by index from `.symtab` |
| `.rela.text` | One `Elf64_Rela` per unresolved reference in `.text` |
| Section header table | Per-section: type, flags, file offset, size, alignment, link |

The assembler knows the *section layout* but not *final virtual addresses*. Those are assigned by the linker when it places sections into segments.

## Linux Connection

### Inspecting a Real Object File

```bash
cat > greet.c << 'EOF'
#include <stdio.h>
void greet(const char *name) { printf("hello, %s\n", name); }
EOF

gcc -O0 -c -o greet.o greet.c
```

Examine the ELF header to confirm this is a relocatable object (type `REL`):

```bash
readelf -h greet.o | grep Type
# Type: REL (Relocatable file)
```

Dump the symbol table:

```bash
readelf -s greet.o
# Num: Value  Size  Type   Bind  Vis   Ndx  Name
#   9: 0000   47    FUNC   GLOBAL DEFAULT  1  greet   ← defined, section 1 (.text)
#  10: 0000    0    NOTYPE GLOBAL DEFAULT UND  printf  ← undefined
```

`greet` has `Ndx = 1` (index into section header table, pointing to `.text`). `printf` has `Ndx = UND`: the assembler recorded the reference but left resolution to the linker.

Dump relocation entries:

```bash
readelf -r greet.o
# Offset    Info        Type           Sym.Value  Sym. Name + Addend
# 000018  000a00000004  R_X86_64_PLT32  00000000  printf - 4
```

The offset `0x18` is the byte within `.text` where the `call` instruction's 32-bit displacement sits. The addend `-4` accounts for the fact that `r_offset` points to the *start* of the displacement field, but the PC at execution time points to the *next* instruction (4 bytes further), so $A = -4$ makes $S + A - P$ come out correctly.

Confirm the placeholder zeros in the raw encoding:

```bash
objdump -d greet.o
# call
