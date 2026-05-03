---
id: 73
title: "Debug info and tooling"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Why This Matters

When a program crashes, the binary the CPU executes contains no variable names, no line numbers, no type information. A segfault at `0x7fff8a3c` is meaningless without metadata that answers: which function owns this address, which source line generated the instruction there, and what was on the call stack when control reached it?

Three distinct mechanisms answer these questions. **Symbol tables** map addresses to names — enough for the linker and for coarse debugger output. **DWARF** encodes structured metadata: source lines, local variable locations, full type information, and the rules for reconstructing stack frames. **Stack unwinding** uses that metadata to walk backwards through the call chain from the current instruction pointer. These are not redundant; they operate at different granularities and serve different consumers. A profiler like `perf` needs unwinding but not type info. The linker needs symbol binding but not line numbers. `gdb` needs all three.

---

## Core Concepts

### Symbol Tables: Binding and Visibility at Link Time

Every ELF binary and relocatable object file contains a `.symtab` section — an array of fixed-size entries mapping names to addresses, sizes, types, and binding attributes. The linker uses this table to resolve cross-file references: when `main.o` calls `parse()` defined in `parser.o`, the linker finds `parse` in `parser.o`'s `.symtab` as a global symbol and patches the call site.

Symbol binding determines linker visibility:
- **`STB_LOCAL`**: visible only within the translation unit that defines it. `static` functions and `static` globals get this binding.
- **`STB_GLOBAL`**: visible across all object files. The linker enforces exactly one definition (ODR). Multiple definitions produce a linker error.
- **`STB_WEAK`**: like global but silently overridable. If both a weak and a strong definition exist, the strong one wins. This is how `__attribute__((weak))` works.

Symbol type (`STT_FUNC`, `STT_OBJECT`, `STT_NOTYPE`) lets tools like `objdump` and `gdb` interpret a symbol's content correctly — whether to disassemble it as code or dump it as data.

`.symtab` covers function names and global/static variable names, but *not* local variables inside functions. Those live in `.debug_info`. The split is deliberate: the linker never needs to resolve a local variable; including them in `.symtab` would waste space in every shipped binary with no benefit to linking.

`strip` removes `.symtab` entirely. The binary still executes — the CPU has never consulted it — but debuggers lose the address-to-name mapping, and stack traces collapse to raw addresses.

The dynamic linker uses a separate table, `.dynsym`, a minimal subset of `.symtab` containing only the symbols needed for runtime binding. `.dynsym` is marked `SHF_ALLOC` and loaded into memory; `.symtab` is not.

### DWARF: Encoding High-Level State Over Machine State

DWARF stores debug metadata in several ELF sections, each with a distinct role:

| Section | Content |
|---|---|
| `.debug_info` | Tree of Debugging Information Entries (DIEs): functions, variables, types |
| `.debug_abbrev` | Abbreviation table that compresses `.debug_info` |
| `.debug_line` | State machine bytecode mapping addresses to source lines |
| `.debug_loc` | Location expressions: where a variable lives at each point in execution |
| `.debug_ranges` | Address ranges for non-contiguous code (inlined functions, split blocks) |
| `.eh_frame` | Call Frame Information used for stack unwinding (also used for C++ exceptions) |
| `.debug_frame` | Same as `.eh_frame` but not loaded at runtime |

DWARF's central challenge is that *optimized code breaks the naive correspondence between source and machine state*. A variable declared on line 12 might be held in `%rax` from instructions `0x401020`–`0x401038`, spilled to `%rsp-16` from `0x401039`–`0x40105c`, and dead after that. A static mapping from variable name to address cannot express this — it requires per-instruction rules. DWARF provides them through location expressions and location lists.

A **DIE** (Debugging Information Entry) is a tagged node in a tree. The root of a compilation unit is a `DW_TAG_compile_unit` DIE. Inside it are `DW_TAG_subprogram` DIEs for functions, each containing `DW_TAG_variable` and `DW_TAG_formal_parameter` DIEs for locals. Each DIE carries attributes: `DW_AT_name`, `DW_AT_type`, `DW_AT_low_pc`/`DW_AT_high_pc` for address range, and `DW_AT_location` encoding where the value lives.

A location expression like `DW_OP_fbreg -24` means "the variable is at the frame base minus 24 bytes." `DW_OP_reg3` means "it's currently in `%rbx`." For variables that move, `.debug_loc` provides a list of `(start_address, end_address, location_expression)` triples. GDB evaluates these at the current `%rip` to find any variable.

### Stack Unwinding: Reconstructing the Call Chain from CFI

At any point during execution, the CPU holds `%rip` and `%rsp`. It has no built-in record of how it got there. Stack unwinding recovers the sequence of return addresses — and from them, the call chain — by repeatedly answering: *given the current frame, where is the return address, and what was the caller's stack pointer?*

The traditional answer relies on the **frame pointer convention**. On x86-64, a conforming function prologue executes:

```asm
pushq   %rbp          ; save caller's %rbp onto stack (8 bytes)
movq    %rsp, %rbp    ; %rbp now points to saved-caller-%rbp slot
subq    $N, %rsp      ; allocate N bytes of locals
```

This creates a singly-linked list: `%rbp` → saved `%rbp` → saved `%rbp` → … → `0`. The return address for each frame sits at `%rbp + 8` (pushed by the `callq` that entered this function). Unwinding is a pointer-chasing walk:

```c
// Frame-pointer walk — works only when -fno-omit-frame-pointer
void walk_frames(void) {
    void **fp = __builtin_frame_address(0);   // current %rbp
    while (fp && (uintptr_t)fp > 0x1000) {
        void *ret = *(fp + 1);                // return address at rbp+8
        // resolve ret via symbol table / DWARF
        fp = (void **)*fp;                    // follow saved %rbp chain
    }
}
```

GCC and Clang omit the frame pointer by default at `-O1` and above on x86-64 (reclaiming `%rbp` as a general-purpose register). This breaks frame-pointer unwinding, which is why `perf` stack traces are often truncated in optimized binaries.

The DWARF-based alternative encodes explicit unwinding rules in `.eh_frame` (for exception handling and unwinding at runtime) and `.debug_frame` (for offline debugger use). For each address range, the **Call Frame Information (CFI)** table records the **Canonical Frame Address (CFA)** — a stable reference point for the frame — and rules for locating the return address and any callee-saved registers. A typical rule set looks like:

```
Address range       CFA rule          Return address rule
0x401020–0x401023   rsp + 8           *(CFA - 8)
0x401024–0x401060   rbp + 16          *(CFA - 8)
0x401061–0x401080   rsp + 32          *(CFA - 8)
```

The unwinder evaluates the CFA rule at `%rip` to locate the return address, sets `%rip` to that return address, sets `%rsp` to the CFA, and repeats. This works without `%rbp` at the cost of requiring accurate CFI data — which the compiler generates correctly but which hand-written assembly sometimes omits (a common source of broken stack traces in kernel code, addressed by explicit `.cfi_*` assembler directives).

`libunwind` and the unwinding logic inside `libgcc` implement this algorithm. Tools like `perf`, `gdb`, `lldb`, `libbacktrace`, and ASan/TSan all ultimately call into one of these implementations.

---

## How It Works

### ELF Symbol Table Structure

The symbol table is an array of `Elf64_Sym` structs defined in `<elf.h>`:

```c
typedef struct {
    Elf64_Word    st_name;   // byte offset into .strtab
    unsigned char st_info;   // binding (high 4 bits) | type (low 4 bits)
    unsigned char st_other;  // visibility: STV_DEFAULT, STV_HIDDEN, STV_PROTECTED
    Elf64_Section st_shndx;  // section index, or SHN_ABS / SHN_UNDEF / SHN_COMMON
    Elf64_Addr    st_value;  // virtual address (for executables/DSOs) or section offset
    Elf64_Xword   st_size;   // size in bytes (0 if unknown)
} Elf64_Sym;
```

Binding and type are packed into `st_info`. To extract them:

```c
#define ELF64_ST_BIND(info)  ((info) >> 4)
#define ELF64_ST_TYPE(info)  ((info) & 0xf)
```

`st_shndx` deserves attention. Three pseudo-indices have special meaning:
- `SHN_UNDEF` (`0`): symbol is referenced here but defined in another object file. The linker must find a matching `STB_GLOBAL` definition elsewhere or error out.
- `SHN_ABS` (`0xfff1`): the value in `st_value` is absolute
