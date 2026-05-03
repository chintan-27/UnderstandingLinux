---
id: 68
title: "Executable formats"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Why This Matters

When you type `./program`, the kernel does not execute bytes directly — it parses a structured binary format, maps code and data into virtual memory at specific addresses with specific permissions, then hands control to a dynamic linker that loads shared libraries, performs relocations, and calls initialization functions before your `main()` runs. Every step can fail in a distinct, diagnosable way: a missing symbol causes a link-time error with a precise name; a bad relocation produces a segfault at a non-null but wrong address; a missing `.so` causes a runtime `FATAL: kernel too old` or `cannot open shared object file`. Understanding ELF is what makes these failures readable.

---

## Core Concepts

### ELF: One Format, Three Roles

ELF (Executable and Linkable Format) is used for three distinct file types, distinguished by the `e_type` field in the ELF header:

| `e_type` value | File type | Typical extension |
|---|---|---|
| `ET_REL` | Relocatable object | `.o` |
| `ET_EXEC` | Executable | none |
| `ET_DYN` | Shared object or PIE executable | `.so` |

A relocatable object has all symbol addresses set to 0 — they are placeholders. An executable has all addresses resolved. A shared object is position-independent: it can be mapped at any virtual address, so its internal references use offsets from the instruction pointer, not absolute addresses.

### Sections vs. Segments: Why Both Exist

ELF has two independent views of the same file:

- **Sections** are named byte ranges with semantic meaning to the linker (`.text` is code, `.rela.text` is relocation entries for that code, `.symtab` is the symbol table). They answer the question: *what is this data for?*
- **Segments** are ranges the OS maps into memory with specific permissions. They answer the question: *where does this go in the process's address space, and with what access rights?*

The mapping is many-to-one: the loader's `PT_LOAD` segment with `PF_R | PF_X` permissions typically spans `.text` and `.rodata`; the `PT_LOAD` segment with `PF_R | PF_W` spans `.data` and `.bss`. The linker discards section boundaries when constructing segments. A stripped binary has no section header table at all and still runs, because the kernel only reads the program header table.

```bash
# Inspect sections of an object file
readelf -S /bin/ls | head -40

# Inspect segments (program headers) of an executable
readelf -l /bin/ls

# Note which sections are mapped into which segments
readelf -l /bin/ls | grep -A2 "LOAD"
```

### Symbol Resolution

Every `.o` file has a symbol table. Each entry is either a *definition* (this file provides this name at this offset) or a *reference* (this file uses this name, defined elsewhere). The linker's resolution pass matches every reference to exactly one definition. If a reference has no match, you get `undefined reference to 'foo'`. If it has two matches, you get `multiple definition of 'foo'`.

Symbol binding controls visibility:

- **`STB_GLOBAL`** — exported; visible to all `.o` files and shared libraries being linked
- **`STB_LOCAL`** — `static` in C; scoped to this translation unit; two `.o` files can both define a local `helper` without conflict
- **`STB_WEAK`** — defined here, but a strong (`STB_GLOBAL`) definition elsewhere overrides it silently; used by the C runtime for symbols like `__attribute__((weak)) int myfunc()`

The `st_shndx` field in each symbol table entry records where the symbol is defined. `SHN_UNDEF` means the symbol is referenced but not defined here — the linker must find it elsewhere. `SHN_ABS` means the symbol has an absolute address that relocation never modifies.

```bash
# Show all symbols in an object file, including undefined references
nm -u myfile.o          # undefined only
nm myfile.o             # all: T=text/defined, U=undefined, t=local text

# Show dynamic symbol table of a shared library
nm -D /lib/x86_64-linux-gnu/libc.so.6 | grep " T " | head -20
```

### Relocation

The compiler emits code with placeholder addresses — zeros or small offsets — wherever a symbol's real address is needed. Each placeholder is described by a relocation entry in `.rela.text` or `.rela.data`. A relocation entry contains three things: the byte offset to patch, the symbol whose address to use, and an addend. The linker applies the relocation by computing a formula and writing the result at the specified offset.

For `R_X86_64_PLT32` (used for `call foo` when `foo` may be in a shared library):

$$\text{patched value} = S + A - P$$

where $S$ is the resolved symbol address, $A$ is the addend (typically $-4$), and $P$ is the address of the byte being patched. The result is the signed 32-bit displacement the `call rel32` instruction encodes. If the displacement does not fit in 32 bits — caller and callee are more than $2^{31} - 1$ bytes apart — the linker errors with `relocation truncated to fit`.

For `R_X86_64_64` (absolute 64-bit address, used in data sections):

$$\text{patched value} = S + A$$

For `R_X86_64_PC32` (32-bit PC-relative reference, used for local branches):

$$\text{patched value} = S + A - P$$

Same formula as `PLT32`, but without going through the PLT — used when the linker knows the target is in the same linked unit.

```bash
# View relocation entries in a relocatable object file
readelf -r myfile.o

# Example output:
# Offset          Info           Type           Sym. Value    Sym. Name + Addend
# 000000000015  000a00000004 R_X86_64_PLT32    0000000000000000 printf - 4
```

### Static Libraries

A static library (`.a`) is a `ar`-format archive of `.o` files with an index. The linker scans the archive to satisfy unresolved references: it extracts only the `.o` files needed, and only if processing them would resolve at least one currently-unresolved symbol. **Order matters**: if `libfoo.a` depends on `libbar.a`, `libfoo.a` must appear first on the command line. The linker makes a single left-to-right pass; a symbol referenced in `libbar.a` that was already processed will not be re-examined.

The extracted `.o` files are permanently copied into the final executable. A process using `printf` from a statically linked libc has its own private copy of `printf`'s machine code in its `.text` segment.

```bash
# Create a static library from object files
ar rcs libmylib.a foo.o bar.o

# See the archive index
ar t libmylib.a
nm --print-armap libmylib.a    # symbol index: which .o defines which symbol
```

### Shared Libraries and Dynamic Linking

A shared library is not copied into the executable. The executable instead records a dependency on the library by name (`libm.so.6`, `libc.so.6`) in the `.dynamic` section as `DT_NEEDED` entries. At load time, `ld-linux-x86-64.so.2` (the dynamic linker, itself an ELF shared object) maps the library's `PT_LOAD` segments into the process's virtual address space.

The physical pages backing the library's `.text` segment are shared across all processes that have the library loaded — the kernel's page tables for each process point to the same physical frames. Each process has its own copy of the library's `.data` and `.bss` (writable, copy-on-write). This means a shared library's code must not contain hardcoded absolute addresses — it must be position-independent.

```bash
# Show shared library dependencies of an executable
ldd /bin/ls

# Show the DT_NEEDED entries directly (ldd executes the binary; readelf does not)
readelf -d /bin/ls | grep NEEDED

# Show which library provides a given symbol at runtime
ldconfig -p | grep libc
```

---

## How It Works

### ELF File Structure

```c
typedef struct {
    unsigned char e_ident[16]; // [0..3]=\x7fELF, [4]=class (1=32,2=64),
                               // [5]=endian (1=LE,2=BE), [6]=ELF version
    uint16_t      e_type;      // ET_REL=1, ET_EXEC=2, ET_DYN=3
    uint16_t      e_machine;   // EM_X86_64=0x3e
    uint32_t      e_version;   // Always 1
    uint64_t      e_entry;     // Virtual address of entry point (_start)
    uint64_t      e_phoff;     // Byte offset of program header table in file
    uint64_t      e_shoff;     // Byte offset of section header table in file
    uint32_t      e_flags;     // Architecture-specific flags
    uint16_t      e_ehsize;    // Size of this header (64 bytes for ELF64)
    uint16_t      e_phentsize; // Size of one program header entry
    uint16_t      e_phnum;     // Number of program header entries
    uint16_t      e_shentsize; // Size of one section header entry
    uint16_t      e_shnum;     // Number of section header entries
    uint16_t      e_shstrndx;  // Section index of the section name string table
} Elf64_Ehdr;
```

The kernel identifies ELF files by the magic bytes at `e_ident[0..3]`: `\x7f`, `E`, `L`, `F`. This check happens in `fs/binfmt_elf.c` in the kernel source, in the `load_elf_binary()` function — the
