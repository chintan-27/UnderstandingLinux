---
id: 67
title: "Linkers"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Why This Matters

When you write a C program that calls `printf`, you don't define `printf` — someone else did, in a separate compilation unit, possibly compiled years ago. The linker takes a collection of compiled object files and libraries, resolves every symbol reference to a definition, patches in the correct addresses, and produces a runnable executable.

This matters because linker behavior is non-obvious in ways that corrupt programs silently. Two `.c` files can each declare `int x;` at file scope, the linker will merge them into one variable without a warning, and both translation units will share storage they didn't know they were sharing. Understanding the linker means you can reason about why this happens, predict when it will happen, and read the machinery directly when it fails.

---

## Core Concepts

### Object Files and Sections

The compiler produces **relocatable object files** (`.o` files) — ELF-formatted containers partitioned into named sections. The critical constraint is that the compiler emits these without knowing the final load address of anything. It uses placeholder addresses (typically 0) and emits relocation records that tell the linker where to go back and patch.

| Section | Contents |
|---|---|
| `.text` | Compiled machine instructions |
| `.data` | Initialized global and static variables |
| `.bss` | Uninitialized statics and zero-initialized globals — size only, no disk bytes |
| `.symtab` | Every defined and referenced name the linker must know about |
| `.rel.text` / `.rel.data` | Relocation records: (offset, symbol, type, addend) tuples |
| `.rodata` | Read-only data: string literals, `const` globals, jump tables |
| `.dynamic` | Dynamic linking metadata (shared objects only) |

`.bss` deserves special attention: it takes zero bytes on disk because its contents are always zero. The ELF header records only the section's size. The OS zero-fills those pages when the process loads.

### Symbols and Their Three States

Every `.symtab` entry carries a **binding** (local or global), a **type** (function, object, section), and a **section** assignment. Three pseudo-sections control linker behavior:

| Section | Meaning |
|---|---|
| `ABS` | Absolute — this value is never relocated |
| `UNDEF` | Referenced here, defined elsewhere — must be resolved |
| `COMMON` | Uninitialized global — linker decides final placement |

The distinction between `COMMON` and `.bss` is load-bearing. By convention:

- **`COMMON`**: uninitialized global variables declared at file scope (`int x;`) — the linker will merge multiple weak definitions across object files into a single allocation
- **`.bss`**: uninitialized *static* variables (`static int x;`) or explicitly zero-initialized globals (`int x = 0;`) — these have a single, definite owner; no merging occurs

`COMMON` exists because FORTRAN's `COMMON` block semantics required a linker mechanism to allow multiple object files to reserve storage for the same name without any single file being the "owner." C inherited this for tentative definitions. The danger: two object files can both declare `int errno;` and the linker silently fuses them, which is why POSIX headers declare `errno` as a macro expanding to a thread-local expression rather than a plain global.

### Static Linking

A static linker (`ld`, invoked via `gcc -static`) performs exactly two phases:

**Phase 1 — Symbol resolution**: walk every `.symtab`, match every `UNDEF` reference to a unique definition somewhere in the input set.

**Phase 2 — Relocation**: assign each section a final virtual address, merge sections of the same type, then walk every `.rel.text` and `.rel.data` record and patch the placeholder bytes.

Static libraries (`.a` files) are **archives** — a flat concatenation of `.o` files plus an index (`ar` format). The linker does not pull in the entire archive; it scans the index and extracts only the members that satisfy a currently unresolved symbol. This extraction is greedy and order-dependent, which is why link order is not stylistic — it is semantic.

### Dynamic Linking

A shared object (`.so` file) is not merged into the executable. The linker records the dependency in the executable's `.dynamic` section and records the path of the **dynamic linker/interpreter** in the `.interp` section — typically `/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`. The kernel reads `.interp` and, instead of jumping to `main`, maps the dynamic linker into the process and hands it control.

The dynamic linker (`ld-linux.so`) then:
1. Reads the `.dynamic` section to find required libraries (`DT_NEEDED` entries)
2. Maps each `.so` into the process's virtual address space
3. Resolves symbol references across all loaded objects
4. Patches GOT entries
5. Runs each library's `.init` section (constructors, `__attribute__((constructor))` functions)
6. Transfers control to `_start`, which calls `main`

The shared-page benefit: the `.text` segment of `libc.so.6` is mapped read-only and shared across all processes. Every process using `libc` points at the same physical pages. The GOT is per-process and writable — it lives in `.data.rel.ro` or `.got.plt`, and each process gets its own copy that the dynamic linker fills in.

### Position-Independent Code, GOT, and PLT

Shared libraries must work at any virtual address. The compiler achieves this by never embedding absolute addresses in `.text`. Instead:

**Global Offset Table (GOT)**: a per-process, writable table of pointers. Code in `.text` accesses external variables and functions by loading a pointer from the GOT using a PC-relative address — an address it *can* compute at compile time because the distance from the instruction to the GOT is fixed within the `.so`. The dynamic linker fills in the actual target addresses at load time.

**Procedure Linkage Table (PLT)**: a lazy resolution mechanism. Resolving every external function at startup costs time proportional to the number of imported symbols, most of which a given execution may never call. The PLT defers that cost: the first call to any external function triggers resolution; subsequent calls go directly through the GOT.

The PLT/GOT split is also a security boundary. `RELRO` (`-Wl,-z,relro,-z,now`) marks the GOT read-only after startup, preventing a writable GOT from being used as a code-redirect primitive in exploitation.

---

## How It Works

### Static Linking: Symbol Resolution Algorithm

The linker maintains three sets during input processing:

- $E$ — object files to be merged into the output
- $U$ — currently unresolved symbol references
- $D$ — symbols already defined

Processing rules per input item:

- **`.o` file**: unconditionally add to $E$; add its defined symbols to $D$; add its `UNDEF` symbols to $U$; remove from $U$ any symbol just added to $D$
- **`.a` archive**: scan member index; for each member $m$ that defines a symbol in $U$, add $m$ to $E$, update $D$ and $U$; repeat until no new members are added

Terminal condition: if $|U| > 0$, emit `undefined reference` errors and abort.

The archive scan is a fixed-point iteration, not a single pass, but it does not backtrack to earlier archives. This is why the command-line order is semantically significant:

```bash
# Fails: libvector.a is scanned when U is empty; main.o's references
# are added to U afterward, but the archive won't be re-scanned.
gcc -static ./libvector.a main.c -o prog

# Works: main.o is processed first, populating U with references to
# symbols in libvector.a, which is then scanned and satisfies them.
gcc -static main.c ./libvector.a -o prog

# Circular dependencies between archives require repetition or grouping:
gcc -static main.c -Wl,--start-group liba.a libb.a -Wl,--end-group -o prog
```

`--start-group`/`--end-group` tells `ld` to repeatedly scan the enclosed archives until $U$ stops shrinking — $O(n^2)$ in the number of archive members, so avoid it when not needed.

### Relocation: Patching Addresses

The compiler emits a call to `addvec` as:

```asm
e8 00 00 00 00    ; call rel32=0  (placeholder)
```

The `.rel.text` section records the relocation entry:

```
offset: 0x0f   type: R_X86_64_PC32   symbol: addvec   addend: -4
```

`R_X86_64_PC32` is a PC-relative 32-bit reference. After the linker assigns `addvec` to address $A$ and determines the call instruction's location as $P$, it computes:

$$\text{patch} = A + \text{addend} - P = A - 4 - P$$

This value is written into the four bytes at `offset`. At runtime, when the CPU executes the call, the program counter holds $P + 4$ (pointing past the instruction), so the effective target is:

$$(P + 4) + \text{patch} = (P + 4) + (A - 4 - P) = A$$

which is exactly `addvec`'s address. The $-4$ addend compensates for the CPU's post-increment of the program counter before applying the displacement.

For absolute references (`R_X86_64_32`, `R_X86_64_64`), the formula is simpler — the patch is just $A + \text{addend}$ — but these cannot appear in position-independent code because they embed a fixed virtual address that is only valid at one load address.

### GOT/PLT Mechanics in Detail

For a dynamically linked call to `printf`, the compiler generates a call to `printf@plt` — a stub in the executable's own `.plt` section. On first call:

```asm
printf@plt:
    jmp    *printf@got.plt     ; GOT slot initially holds address of next instr
    push   $index              ; push the relocation index for this symbol
    jmp    PLT[0]
