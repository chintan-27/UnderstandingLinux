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

## Core Concepts
### ELF File Structure
An ELF (Executable and Linkable Format) file is a sequence of bytes that the kernel interprets via the **ELF header** (`Elf64_Ehdr`). The header describes two complementary views of the same file:

* **Section view** – used by the linker (`ld`). The file is divided into *sections* (`.text`, `.rodata`, `.symtab`, …) each with a type (`SHT_PROGBITS`, `SHT_SYMTAB`, …), flags, size, and offset.  
* **Segment view** – used by the dynamic loader (`ld-linux.so`). The file is divided into *program headers* (`Elf64_Phdr`) that describe *segments* to be mapped into memory. A segment groups one or more sections that share the same memory attributes (read/write/execute) and page alignment.

The ELF header fields that drive the two views are:

| Field | Meaning | Typical value (x86‑64) |
|-------|---------|------------------------|
| `e_ident[EI_CLASS]` | 32‑ vs 64‑bit | `ELFCLASS64` (2) |
| `e_type` | Object type | `ET_EXEC` (2) for executable, `ET_DYN` (3) for shared object |
| `e_machine` | ISA | `EM_X86_64` (62) |
| `e_entry` | Virtual address of entry point | 0x400400 (example) |
| `e_phoff` | File offset to program header table | 0x40 |
| `e_shoff` | File offset to section header table | 0x1230 |
| `e_phentsize` | Size of one program header entry | 0x38 |
| `e_shentsize` | Size of one section header entry | 0x40 |

#### Sections vs. Segments – Why Both Exist
*Sections* give the linker fine‑grained control: each symbol lives in a specific section, allowing the linker to discard unused sections (`--gc-sections`) or assign them to different memory regions.  
*Segments* give the loader a minimal set of memory mappings that satisfy the CPU’s MMU: each segment must be page‑aligned and have a uniform set of permissions (R/W/X). The kernel’s `execve` loader maps each `PT_LOAD` segment with `mmap`, applying the flags from `p_flags`.

#### Common Sections and Their Roles
| Section | Contents | Typical flags (`sh_flags`) |
|---------|----------|----------------------------|
| `.text` | Machine code | `SHF_ALLOC + SHF_EXECINSTR` |
| `.rodata` | Read‑only data (string literals, const) | `SHF_ALLOC` |
| `.data` | Initialized global/static variables | `SHF_ALLOC + SHF_WRITE` |
| `.bss` | Uninitialized globals (zero‑filled) | `SHF_ALLOC + SHF_WRITE` (no file bytes) |
| `.symtab` | Symbol table (static linking) | none (not allocated) |
| `.dynsym` | Dynamic symbol table (for shared objects) | `SHF_ALLOC` |
| `.rel.*` / `.rela.*` | Relocation entries | `SHF_ALLOC` |
| `.init_array`, `.fini_array` | Pointers to init/fini functions | `SHF_ALLOC + SHF_WRITE` |
| `.dynamic` | Dynamic linking info (DT_NEEDED, DT_SYMTAB, …) | `SHF_ALLOC` |
| `.interp` | Path to program interpreter (e.g., `/lib64/ld-linux-x86-64.so.2`) | `SHF_ALLOC` |

#### Common Segments (Program Headers)
| Segment type | Purpose | Typical `p_flags` | Typical `p_offset` / `p_vaddr` relationship |
|--------------|---------|-------------------|--------------------------------------------|
| `PT_PHDR` | Location of program header table itself | `R` | `p_offset = e_phoff`, `p_vaddr = base + e_phoff` |
| `PT_INTERP` | Interpreter pathname | `R` | points to `.interp` section |
| `PT_LOAD` (code) | Executable and read‑only data | `R + X` | `p_vaddr` page‑aligned, `p_offset` same modulo page size |
| `PT_LOAD` (data) | Writable data (`_DATA` + `_BSS`) | `R + W` | same alignment rule |
| `PT_DYNAMIC` | Dynamic section (`_DYNAMIC`) | `R` | inside data segment |
| `PT_GNU_RELRO` | Read‑only after relocations (RELRO) | `R` | subset of data segment |
| `PT_GNU_STACK` | Stack flags (often `RW`) | `RW` | zero file size, describes desired stack permissions |

**Address calculation** – For each `PT_LOAD` segment the kernel computes the actual memory mapping:

```
let PAGE = 4096
let offset = p_offset & ~(PAGE-1)          // round down to page boundary
let vaddr  = p_vaddr & ~(PAGE-1)
let mapsz  = ((p_vaddr + p_memsz - offset) + (PAGE-1)) & ~(PAGE-1)
mmap(addr = vaddr, length = mapsz,
     offset = offset,
     prot   = translate(p_flags),
     flags  = MAP_PRIVATE | MAP_FIXED)
```

Thus the *virtual address* seen by the program (`p_vaddr`) may differ from the file offset (`p_offset`) only by a page‑aligned delta.

### Symbols and Relocations
A **symbol** is a tuple `<name, value, size, info, other, shndx>` stored in an ELF symbol table (`.symtab` for link‑time, `.dynsym` for run‑time).  

* `st_value` – offset within the section defined by `st_shndx` (or absolute value if `SHN_ABS`).  
* `st_info` encodes binding (`STB_LOCAL`, `STB_GLOBAL`, `STB_WEAN`) and type (`STT_OBJECT`, `STT_FUNC`, …).  

When the linker resolves a reference, it performs a **relocation**: it locates the place in the code/data that needs fixing, reads the existing addend (`A`), finds the symbol’s final address (`S`), and writes the result according to the relocation type.

#### Relocation Formula (generic)
For most architectures the linker computes:

```
result = S + A
```

where `S` is the symbol’s virtual address and `A` is the addend stored in the instruction/data field. Some architectures use PC‑relative forms:

```
result = (S + A) - P
```

with `P` being the place (address of the relocation field).

#### Example: x86‑64 `R_X86_64_PC32`
Used for a 32‑bit PC‑relative displacement (e.g., `call rel32`). The linker does:

```
*loc = (S + A) - P
```

Truncated to 32 bits; overflow leads to a link‑time error if the displacement does not fit.

### Shared Objects and Position‑Independent Code (PIC)
A **shared object** (`ET_DYN`) must be loadable at any virtual address without modification. Therefore the compiler emits **position‑independent code**:

* References to global data go through the **Global Offset Table** (GOT).  
* Function calls use the **Procedure Linkage Table** (PLT) which initially jumps to the dynamic linker for lazy binding.

The linker creates a **DT_NEEDED** entry for each required shared object and a **DT_SYMTAB/DT_STRTAB** for the dynamic symbol table. At runtime the dynamic loader (`/lib64/ld-linux-x86-64.so.2`) performs:

1. **Loading** – map all `PT_LOAD` segments of the main executable and each needed shared object.  
2. **Relocation** – process `DT_REL`/`DT_RELA` entries (including `JUMP_SLOT` for PLT and `GLOB_DAT` for GOT).  
3. **Initialization** – call `.init` and `.init_array` functions.  

The loader also honors **environment variables** like `LD_LIBRARY_PATH`, `LD_PRELOAD`, and **security features** such as `DT_FLAGS_1` (now `DF_1_NOW` for immediate binding) and `DT_FLAGS` (e.g., `DF_ORIGIN`).

---

## How It Works
### From Source to Executable – Detailed Pipeline
1. **Preprocessing** (`cpp`) – expands macros, includes headers; produces a translation unit.  
2. **Compilation** (`gcc -c`) – translates translation unit to assembly, then to an object file (`foo.o`). The object file contains:
   * ELF header (`e_type = ET_REL`).  
   * Sections: `.text`, `.data`, `.rodata`, `.bss`, `.symtab`, `.rel.*`, `.debug_*` (if `-g`).  
   * Relocation entries referencing symbols that are not yet defined (e.g., calls to external functions).  
3. **Assembly** (`as`) – simply translates the assembly output to machine code; the object file format is already ELF.  
4. **Linking** (`ld` or `gcc` driver) – performs:
   * **Symbol resolution** – scans all input object files and libraries, builds a global symbol table. Undefined symbols cause an error unless `-shared` or `-undef` is used.  
   * **Section merging** – concatenates like‑named sections (e.g., all `.text` into one output `.text`), assigns them virtual addresses based on the linker script.  
   * **Relocation application** – for each relocation, computes `S + A` (or PC‑relative variant) and patches the output section.  
   * **Segment creation** – groups sections with identical `p_flags` into `PT_LOAD` segments, enforcing page alignment.  
   * **Interpreter insertion** – for executables, adds a `PT_INTERP` segment pointing to the dynamic linker.  
   * **Dynamic section** – for shared objects and executables that use shared libraries, adds `.dynamic` with needed entries (`DT_NEEDED`, `DT_SONAME`, `DT_HASH`/`DT_GNU_HASH`, `DT_STRTAB`, `DT_SYMTAB`, `DT_RELA`, `DT_RELASZ`, etc.).  
   * **Output** – writes the final ELF file (`a.out` or specified name).  

The linker script (default `/usr/lib/ldscripts/elf_x86_64.x`) defines the memory layout:

```
SECTIONS
{
  . = 0x400000;                     /* start of text segment */
  .text : { *(.text) }
  .rodata : { *(.rodata) }
  .data : { *(.data) }
  .bss : { *(.bss) }
  /* ... */
}
```

The start address `0x400000` is the traditional **base address** for non‑PIE executables on x86‑64 (page‑aligned, leaves room for the header). For PIE (`-fPIE -pie`) the linker uses a variable base chosen by the loader (ASLR).

### Loading and Execution
When a program is invoked via `execve("/bin/ls", argv, envp)`:

1. The kernel’s `binfmt_elf` handler checks the ELF magic (`0x7f 'E' 'L' 'F'`).  
2. It reads the program headers, locates the `PT_INTERP` segment (if present) to obtain the pathname of the dynamic linker.  
3. The kernel maps the executable’s `PT_LOAD` segments using `mmap` as described above.  
4. If an interpreter is present, the kernel transfers control to it, passing the executable’s entry point via the stack (`auxv` vector includes `AT_ENTRY`).  
5. The dynamic linker (`ld-linux.so`) then:
   * Maps all needed shared objects (again via `PT_LOAD` segments).  
   * Performs relocations (`DT_RELA`).  
   * Resolves symbols using its internal hash tables (`DT_GNU_HASH`).  
   * Calls any pre‑init (`DT_PREINIT_ARRAY`) and init (`DT_INIT`, `DT_INIT_ARRAY`) functions.  
   * Finally jumps to the executable’s entry point (`e_entry`).  

**Relocation timing** – With lazy binding (`DT_FLAGS_1 & DF_1_NOW` not set), the PLT entries initially point to a stub that pushes the relocation index and jumps to the dynamic linker’s `_dl_runtime_resolve`. On first call, the resolver looks up the symbol, patches the GOT entry, and subsequent calls go directly to the target. This reduces startup time at the cost of an extra indirection on first use.

### Memory Layout Math – Example
Suppose an executable has the following program headers (hex values):

| Type   | Offset (`p_off`) | Vaddr (`p_vaddr`) | Filesz (`p_filesz`) | Memsz (`p_memsz`) | Flags |
|--------|------------------|-------------------|---------------------|-------------------|-------|
| PT_LOAD| 0x000000         | 0x00400000        | 0x00001000          | 0x00001000        | R+X   |
| PT_LOAD| 0x0001000        | 0x00401000        | 0x00000200          | 0x00000300        | R+W   |
| PT_DYNAMIC| 0x0001000      | 0x00401000        | 0x00000100          | 0x00000100        | R     |
| PT_GNU_RELRO|0x0001000    | 0x00401000        | 0x00000080          | 0x00000080        | R     |

*Page size = 0x1000.*  

For the first segment: `p_offset` already page‑aligned (0), `p_vaddr` aligned (0x400000). Mapping length = `p_filesz` rounded up to page size = 0x1000.  

For the second segment: `p_offset = 0x1000`, `p_vaddr = 0x401000`. The kernel maps from `offset = 0x1000` (already page‑aligned) with length = round_up(0x00000300, 0x1000) = 0x1000. The memory region thus covers file bytes `0x1000-0x11FF` plus zero‑filled bytes `0x1200-0x1FFF` to satisfy `p_memsz`. The extra zero‑filled region becomes the `.bss` portion.

---

## Worked Examples
### Example 1: Building a Position‑Independent Shared Library
```c
/* math.c */
int add(int a, int b) { return a + b; }
int sub(int a, int b) { return a - b; }
```
**Commands**
```bash
# 1️⃣ Compile with PIC – required for shared objects
gcc -c -fPIC math.c -o math.o          # produces ET_REL object with .text, .data, etc.

# 2️⃣ Create the shared library, setting a SONAME for versioning
gcc -shared -Wl,-soname,libmath.so.1 math.o -o libmath.so.1.0.0

# 3️⃣ Create the symlink expected by the linker
ln -sf libmath.so.1.0.0 libmath.so
ln -sf libmath.so.1.0.0 libmath.so.1
```
**What Happened**
* `-fPIC` forces the compiler to generate GOT‑based accesses:  
  ```asm
  ; add function (simplified)
  mov    eax, edi          ; a
  add    eax, esi          ; a+b
  ret
  ```
  No absolute addresses appear; any reference to a global variable would be `mov eax, [var@GOTPCREL(%rip)]`.  
* The linker script for `-shared` sets the ELF type to `ET_DYN` and places a `PT_INTERP` segment *only* if the output is an executable; shared objects have no interpreter.  
* `readelf -d libmath.so.1.0.0` shows:
  ```
  Dynamic section at offset 0x11d8 contains 24 entries:
   Tag        Type                         Name/Value
   0x00000001 (NEEDED)             Shared library: [libc.so.6]
   0x0000000e (SONAME)             Library soname: [libmath.so.1]
   0x0000000c (INIT)               0x400450
   0x0000000d (FINI)               0x4005a0
   0x00000019 (HASH)               0x10c0
   0x0000001b (SYMTAB)             0x10d8
   0x0000001c (STRTAB)             0x1248
   0x00000015 (SYMENT)             18 (bytes)
   0x00000003 (PLTGOT)             0x2010
   0x00000002 (PLTRELSZ)           48 (bytes)
   0x00000014 (PLTREL)             RELA
   0x00000017 (JMPREL)             0x1190
   0x00000011 (RELA)               0x1090
   0x00000012 (RELASZ)             120 (bytes)
   0x00000013 (RELAENT)            24 (bytes)
  ```

### Example 2: Linking an Executable Against the Shared Library
```c
/* main.c */
extern int add(int, int);
int main(void) {
    return add(40, 2);
}
```
**Commands**
```bash
gcc -c main.c -o main.o          # ET_REL object, contains an undefined reference to add
gcc main.o -L. -lmath -o main    # -L. adds current directory to library search path
```
**Linker Steps (visible via `ld -v`)**
1. Scan `main.o` → undefined symbol `add`.  
2. Search `-L.` → finds `libmath.so` (symlink to `libmath.so.1.0.0`).  
3. Because the library is `ET_DYN`, the linker does **not** copy its `.text` into the executable; instead it:
   * Adds a `DT_NEEDED` entry for `libmath.so.1`.  
   * Emits a relocation of type `R_X86_64_JUMP_SLOT` (PLT) or `R_X86_64_GLOB_DAT` (GOT) for `add` in the executable’s `.rela.plt`/`.rela.dyn`.  
   * Sets the executable’s entry point to its own `_start`.  
4. Output `main` is an `ET_EXEC` (non‑PIE) by default.

**Verification**
```bash
readelf -s main | grep add
# Output:    12: 0000000000000610    23 FUNC    GLOBAL DEFAULT  UND add@libmath.so.1 (2)

objdump -d -M intel main | grep -A2 '<add@plt>'
# Displays the PLT stub that jumps via the GOT.
```
Running the program:
```bash
$ ./main
$ echo $?
42
```
The dynamic loader resolves `add` at runtime (lazy binding) and patches the GOT entry to point to `0x0000000000000610` inside `libmath.so.1`.

### Example 3: Manual Relocation Inspection
```bash
# Create two simple objects as in the draft
cat > foo.c <<'EOF'
int foo(void) { return 1; }
EOF
cat > bar.c <<'EOF'
extern int foo();
int bar(void) { return foo(); }
EOF
gcc -c foo.c -o foo.o
gcc -c bar.c -o bar.o

# Link with verbose relocation display
gcc foo.o bar.o -o main -Wl,--emit-relocs
```
The `-Wl,--emit-relocs` flag tells `ld` to keep a `.reloc` section (normally stripped) so we can view it:
```bash
readelf -r main
```
Output (excerpt):
```
Relocation section '.rela.text' at offset 0x410 contains 2 entries:
  Offset          Info           Type           Sym. Value    Sym. Name + Addend
0000000000000610  000100000002   R_X86_64_PLT32 0000000000000000 foo - 4
000000000000061f  000200000001   R_X86_64_GLOB_DAT 0000000000000000 __libc_start_main 0
```
* The first entry (`R_X86_64_PLT32`) is for the call to `foo`. The linker placed a PLT entry at `0x610` and will fill it with the address of `foo` after loading.  
* The second entry resolves `__libc_start_main` from libc.

If we link **statically** (`gcc -static foo.o bar.o -o main_static`) we see:
```bash
readelf -r main_static | grep foo
# No relocation for foo; the call is encoded directly:
objdump -d -M intel main_static | grep -A2 '<foo>'
# 0000000000000610 <foo>:
#   610:   b8 01 00 00 00          mov    eax,0x1
#   615:   c3                      ret
# 0000000000000616 <bar>:
#   616:   e8 f5 ff ff ff          call   0x610 <foo>
#   61b:   c3                      ret
```
The call uses a relative offset (`e8 f5 ff ff ff` = call -0xb) because both functions reside in the same text segment.

---

## Common Mistakes
| Mistake | Why It Happens | Consequence | Fix |
|---------|----------------|-------------|-----|
| **Missing `-fPIC` when building a shared object** | The compiler assumes the code will be loaded at a fixed address; it emits absolute relocations (`R_X86_64_64`). | At runtime the dynamic loader cannot relocate those absolute addresses if the library is loaded elsewhere → **segmentation fault** or **SIGSEGV** on first use. | Recompile source with `-fPIC` (or `-fPIE` for executables). |
| **Incorrect library order on the link line** (`gcc main.o -lmath -
