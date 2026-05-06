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

## Core Concepts
### Object Files and the ELF Format
An object file produced by a compiler (e.g., `gcc -c`) is not raw machine code; it is an **ELF** (Executable and Linkable Format) container that holds:
- **Sections**: `.text` (code), `.rodata` (read‑only data), `.data` (initialized writable data), `.bss` (uninitialized writable data), `.symtab` (symbol table), `.rel.text` / `.rela.text` (relocation entries), `.got`, `.plt`, etc.
- **Symbol Table**: each entry contains `st_name` (index into string table), `st_value` (address or offset), `st_size`, `st_info` (binding/type), `st_other`, `st_shndx`. Bindings: `STB_LOCAL` (visible only within the object), `STB_GLOBAL` (visible to other objects), `STB_WEAK` (like global but overridden by a non‑weak definition).  
- **Relocation Entries**: describe how to fix a reference whose final address is unknown at compile time. A typical `R_X86_64_PC32` relocation encodes:  
  $$
  \text{Place} \gets (\text{SymbolAddr} + \text{Addend}) - (\text{PlaceAddr} + 4)
  $$
  where *Place* is the location to be patched, *SymbolAddr* the address of the referenced symbol, and *Addend* a constant stored in the relocation entry.

Why this matters: Separate compilation requires the compiler to emit placeholders for external symbols; the linker must replace those placeholders with concrete addresses while preserving the program’s semantics.

### Static vs. Dynamic Linking
- **Static linking** copies the *entire* needed portion of a library (typically the `.text` and `.rodata` sections) into the final executable. The executable becomes self‑contained; at load time the kernel only needs to map the executable’s segments.  
- **Dynamic linking** leaves a *reference* to a shared object (`.so`) in the executable. At runtime the dynamic loader (`ld-linux.so.2`) maps the shared object, resolves its symbols, and performs relocations. The indirection enables:
  1. **Memory sharing**: multiple processes can map the same physical pages of a shared library.  
  2. **Updates**: fixing a library bug does not require relinking every dependent executable.  
  3. **Reduced disk footprint**: common code stored once.

The trade‑off is startup overhead (the loader must resolve symbols and apply relocations) and the need for position‑independent code (PIC) in shared objects, because the library may be loaded at any address.

### GOT and PLT – Indirection for PIC
Shared libraries must work regardless of their load address. The compiler therefore generates **position‑independent code** that accesses global variables and functions through tables:
- **Global Offset Table (GOT)**: an array of pointers, one per external global variable. The code loads the address via a GOT entry (`mov rax, [got+offset]`). The dynamic loader fills each GOT entry with the actual address of the variable after mapping the library.
- **Procedure Linkage Table (PLT)**: a stub for each external function. The first call goes through the PLT resolver, which lazily binds the symbol and patches the corresponding GOT slot. Subsequent calls jump directly via the GOT entry.  

On x86‑64, each PLT entry is 16 bytes:
```
   jmp *got+offset(%rip)   ; indirect jump through GOT
   pushq $index
   jmp plt0
```
The first PLT entry (`plt0`) pushes the link‑map index and jumps to the dynamic linker’s resolver. This indirection adds a single extra memory indirection per call after the first resolution, a cost that is usually negligible compared to the benefit of sharing.

## How It Works
### Phase 1 – Symbol Collection
The linker scans all input object files and archives, building a **global symbol table**. For each defined symbol it records:
- The object file and section where it resides.
- Its binding (local/global/weak) and size.
For each undefined symbol it notes a *reference* that must be satisfied.

### Phase 2 – Symbol Resolution
The linker processes undefined symbols in order:
1. **Definition search**: looks for a definition in the current symbol table (including previously processed archives).  
2. **Archive handling**: if the symbol is undefined and the next input is an archive (`.a`), the linker extracts any object that defines the symbol and repeats the scan. This explains why library ordering matters: an archive is only consulted when an undefined symbol exists *at that point*.  
3. **Shared object handling**: for `.so` files, the linker records a *DT_NEEDED* entry; the actual address resolution is deferred to the runtime loader.  

If a symbol remains undefined after all inputs, the linker emits an error.

### Phase 3 – Layout and Allocation
The linker decides the final virtual addresses of each **output section** (e.g., `.text`, `.data`). It obeys:
- Segment permissions (`PF_R`, `PF_W`, `PF_X`) derived from section flags.
- Alignment constraints (e.g., a section requiring 0x1000 alignment starts at a page boundary).  
The layout can be visualized as:
$$
\text{OutputAddr}_{\text{sec}} = \text{BaseAddr}_{\text{segment}} + \sum_{\text{prev sections}} \text{Size}_{\text{prev}} \; \text{rounded up to alignment}
$$

### Phase 4 – Relocation Application
For each relocation entry, the linker computes the value to write:
$$
\text{Value} = \text{SymbolAddr} + \text{Addend} - \text{PlaceAddr}
$$
(PC‑relative) or simply `SymbolAddr + Addend` (absolute). The computed value is patched into the object’s section contents.  
If the target is a shared object and the relocation type is *relative* (e.g., `R_X86_64_RELATIVE`), the linker emits a **RELRO** relocation table that the dynamic loader will apply at runtime after the library’s base address is known.

### Phase 5 – Emitting the Executable / Shared Object
The linker writes the final ELF file, populating:
- **Program headers** describing loadable segments.
- **Dynamic section** (`DT_NEEDED`, `DT_SYMTAB`, `DT_STRTAB`, `DT_RELA`, `DT_PLTGOT`, `DT_JMPREL`, `DT_PLTRELSZ`, etc.).
- **Interpreter field** (`PT_INTERP`) set to `/lib64/ld-linux-x86-64.so.2` for dynamically linked executables.

## Worked Examples
### Example 1 – Static Linking with Map File
```bash
# foo.c
extern int bar();
int main() { return bar(); }

# bar.c
int bar() { return 42; }

# Compile to object files
gcc -c foo.c -o foo.o
gcc -c bar.c -o bar.o

# Static link, requesting a linker map to see layout
ld -o foo_static foo.o bar.o -M > foo_static.map
```
**Excerpts from `foo_static.map`:**
```
 .text        0x0000000000401000      0x20
  *(.text)
 .text.main   0x0000000000401000      0xf  foo.o
 .text.bar    0x000000000040100f      0x11 bar.o
 .data        0x0000000000601000      0x10
  *(.data)
 .bss         0x0000000000601010      0x0
```
The executable’s entry point is at `0x401000`. The size (`size foo_static`) shows:
```
   text    data     bss     dec     hex filename
    48       0       0      48      30 foo_static
```
No external symbols remain; the executable can be run directly:
```bash
$ ./foo_static
$ echo $?
42
```

### Example 2 – Dynamic Linking with Position‑Independent Code
```bash
# Build PIC object for the library
gcc -c -fPIC bar.c -o bar.o

# Create shared library
gcc -shared -o libbar.so bar.o

# Build main executable, linking against the shared lib
gcc foo.c -L. -lbar -o foo_dynamic
```
Inspect the dynamic section:
```bash
$ readelf -d foo_dynamic | grep -E 'NEEDED|PLTGOT|JMPREL'
 0x0000000000000001 (NEEDED)             Shared library: [libbar.so]
 0x0000000000601018 (PLTGOT)             0x601018
 0x0000000000000011 (JMPREL)             0x400400
```
Run `ldd` to see the dependency:
```bash
$ ldd foo_dynamic
        linux-vdso.so.1 (0x00007ffd...)
        libbar.so => ./libbar.so (0x00007f8c5c3d5000)
        libc.so.6 (0x00007f8c5c1c5000)
        /lib64/ld-linux-x86-64.so.2 (0x00007f8c5c5d8000)
```
Execute:
```bash
$ ./foo_dynamic
$ echo $?
42
```
The first call to `bar()` goes through the PLT; subsequent calls jump directly via the GOT entry.

### Example 3 – Examining GOT/PLT Entries
```bash
# Disassemble the PLT of the executable
objdump -d -M intel foo_dynamic | grep -A5 '<plt>'
```
Sample output (x86‑64):
```
0000000000400400 <puts@plt>:
  400400:       ff 25 0a 20 00 00       jmp    QWORD PTR [rip+0x200a]        # 602010 <_GLOBAL_OFFSET_TABLE_+0x10>
  400406:       68 00 00 00 00          push   0x0
  40040b:       e9 e0 ff ff ff          jmp    4003f0 <plt0>

00000000004003f0 <plt0>:
  4003f0:       ff 35 0a 20 00 00       push   QWORD PTR [rip+0x200a]        # 602010 <_GLOBAL_OFFSET_TABLE_+0x10>
  4003f6:       ff 25 0c 20 00 00       jmp    QWORD PTR [rip+0x200c]        # 602018 <_GLOBAL_OFFSET_TABLE_+0x18>
```
Each PLT entry is 16 bytes (`0x10`). The first entry (`plt0`) pushes the link‑map index and jumps to the dynamic linker’s resolver (`_dl_runtime_resolve`). The GOT entry at `0x602010` initially points back to the second instruction of the PLT (`push`); after resolution it is overwritten with the real address of `puts`.

## Common Mistakes
| Mistake | What’s Wrong | Why It Fails |
|---------|--------------|--------------|
| **Linking a static archive after a shared object that needs its symbols** (`ld foo.o libbar.so libfoo.a`) | The archive `libfoo.a` is consulted only for undefined symbols *at that point*. If `libbar.so` already satisfied those symbols, the archive is ignored, causing missing symbols. | The linker’s one‑pass archive rule: archives are searched only when the current undefined‑symbol set is non‑empty. Placing the archive before the shared object forces it to be considered. |
| **Building a shared library without `-fPIC` on architectures that require it (e.g., x86‑64)** | The compiler emits absolute relocations (`R_X86_64_64`) in `.text`. At runtime the dynamic loader must apply *text relocations*, marking the library’s code pages writable. | Text relocations break **RELRO** (Read‑Only Relocations) and prevent the kernel from mapping the library’s code as read‑only, wasting memory and weakening ASLR. |
| **Using `-Wl,--whole-archive` incorrectly** (`ld foo.o -Wl,--whole-archive libbar.so -Wl,--no-whole-archive`) | `--whole-archive` forces extraction of *all* objects from the archive, even those not referenced. When applied to a `.so` (treated as a linker script), it can cause duplicate symbol definitions. | Shared objects are not archives; the flag is ignored or misinterpreted, leading to bloated executables or link errors. |
| **Relying on `LD_PRELOAD` to interpose a function that is defined `static` in the library** | `static` gives the function `STB_LOCAL` binding; it is not visible in the dynamic symbol table, so the dynamic linker cannot interpose it. | Only `STB_GLOBAL` or `STB_WEAK` symbols are eligible for interposition via `LD_PRELOAD`. |
| **Assuming that `-lc` must be specified explicitly** | The driver (`gcc`) implicitly adds `-lc`; specifying it manually can change the search order and cause the linker to pick an incompatible libc (e.g., from a non‑standard directory). | The implicit `-lc` is added *after* all user libraries, ensuring the system libc is used unless deliberately overridden. Explicit placement can break symbol resolution (e.g., `__libc_start_missing`). |

## Exercises
### Easy
1. **Static link two objects**  
   Write `a.c` containing `extern int foo(); int main(){return foo();}` and `b.c` containing `int foo(){ return 7; }`. Compile to `.o` files and link with `ld -o prog a.o b.o`. Run `./prog` and verify the exit status is 7. Use `size prog` to report section sizes.

2. **Dynamic library basics**  
   Create `libhello.so` from `hello.c` (`void hello(){ puts("Hello"); }`) using `gcc -shared -fPIC -o libhello.so hello.c`. Write a small caller that calls `hello()`. Link with `gcc caller.c -L. -lhello -o caller`. Run `ldd caller` and confirm the library is found. Execute the program.

### Medium
3. **Examining relocations**  
   Build `foo.o` (`extern int ext; int use(){ return ext; }`) and `bar.o` (`int ext = 42;`). Link statically: `ld -o test foo.o bar.o`. Use `readelf -r test` to list relocations. Identify the `R_X86_64_32` (or `R_X86_64_PC32`) entry that resolves `ext`. Change the definition in `bar.o` to `int ext = 99;` and relink; observe the changed relocation value via `objdump -s -j .data test`.

4. **Lazy binding demonstration**  
   Compile a program that calls `puts` (from libc) and another that calls a custom function in a shared library. Use `ltrace -e puts ./prog` to see the first call resolve via the dynamic linker, then subsequent calls bypass the resolver. Explain the observed behavior in terms of PLT/GOT.

### Hard
5. **Custom linker script**  
   Write a linker script that places `.text` at address `0x400000` and `.data` at `0x600000`. Build a simple program (`int main(){return 0;}`) with `ld -T myscript.rt -o prog prog.o`. Verify the addresses with `readelf -l prog` and `objdump -h prog`. Discuss why arbitrary addresses may break ASLR.

6. **Symbol versioning**  
   Create two versions of a function in a library: `void foo_v1(int)` and `void foo_v2(int)`. Use a version script to bind `foo` to `foo_v1` in the baseline version and to `foo_v2` in a new version. Link an executable against the library, then run with `LD_DEBUG=bindings ./prog` to see which version is selected. Change the executable to request the new version explicitly via asm symbol aliasing and observe the effect.

## Linux Connection
The Linux runtime linking machinery lives in **glibc’s dynamic linker** (`ld-linux.so.2`). Key artifacts and commands:

| Artifact | Purpose | Example Command |
|----------|---------|-----------------|
| **PT_INTERP** | Specifies the pathname of the interpreter (dynamic loader) for an ELF executable. | `readelf -l /bin/ls | grep interpreter` → `[Requesting program interpreter: /lib64/ld-linux-x86-64.so.2]` |
| **`/etc/ld.so.conf` and `/etc/ld.so.conf.d/`** | Directories searched by `ldconfig` to build the cache of shared libraries. | `ldconfig -v | grep libc` shows cached paths. |
| **`ldconfig`** | Updates `/etc/ld.so.cache` and creates the necessary symbolic links (`libfoo.so → libfoo.so.1 → libfoo.so.1.0`). | `sudo ldconfig -n /opt/mylib` adds a directory temporarily. |
| **`DT_NEEDED`** | Entries in the dynamic table listing required shared objects. | `readelf -d a.out | grep NEEDED` |
| **`DT_RPATH` / `DT_RUNPATH`** | Colon‑separated directories consulted at runtime (overrides `LD_LIBRARY_PATH`). | `readelf -d a.out | grep RUNPATH` |
| **`/proc/<pid>/maps`** | Shows the virtual memory mappings of a process, including where each shared object is loaded. | `cat /proc/$$/maps | grep libbar` |
| **`ltrace`** | Tracks dynamic library calls and PLT resolves. | `ltrace -e puts ./a.out` |
| **`dlopen` / `dlsym`** | APIs for loading libraries manually and resolving symbols at runtime. | Example C snippet below. |
| **`LD_DEBUG`** | Environment variable to verbose the dynamic linker’s actions. | `LD_DEBUG=bindings,files ./a.out` |

### Sample: Manual `dlopen` usage
```c
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>

int main(void) {
    void *handle = dlopen("./libbar.so", RTLD_LAZY);
    if (!handle) { fputs(dlerror(), stderr); return 1; }

    int (*bar)(void) = dlsym(handle, "bar");
    if (!bar) { fputs(dlerror(), stderr); dlclose(handle); return 1; }

    printf("bar() = %d\n", bar());
    dlclose(handle);
    return 0;
}
```
Compile with:
```bash
gcc -ldl -o dlopen_demo dlopen_demo.c
```
Run:
```bash
$ ./dlopen_demo
bar() = 42
```
This demonstrates that the dynamic linker can be invoked programmatically, resolving symbols and applying relocations on demand—exactly what the static linker does up‑front, but deferred to runtime.

## Why This Matters
Understanding the linker is not academic; it directly impacts **performance, security, and maintainability** of Linux software:

1. **Startup latency** – Each unresolved PLT entry incurs a resolver call on first use. Reducing unnecessary PLT entries (e.g., by linking statically for hot‑path functions or using `-Wl,--as-needed`) can shave milliseconds off critical‑path launches.
2. **Memory efficiency** – Shared libraries enable **copy‑on‑write** pages for code and read‑only data. A single instance of `libc.so.6` backs thousands of processes, saving hundreds of megabytes of RAM.
3. **ASLR and RELRO** – Position‑independent code and relocations that are resolved after mapping allow the kernel to randomize base addresses. Full RELRO (`-z relro -z now`) makes the GOT read‑only after relocations, thwarting GOT‑overwrite attacks.
4. **ABI compatibility** – Symbol versioning (`GLIBC_2.2.5`, etc.) lets newer libraries retain old symbols, allowing binaries built against an older glibc to run on newer systems without recompilation.
5. **Debugging and observability** – Tools like `ldd`, `ltrace`, `readelf`, and `/proc/<pid>/maps` give visibility into which libraries are actually loaded, where they reside, and when symbols are resolved—essential for diagnosing missing‑symbol crashes or unexpected interposition.
6. **Build reproducibility** – Knowing how library order, `-whole-archive`, and `-as-needed` affect the final binary enables deterministic builds, a cornerstone of CI/CD pipelines and secure software supply chains.

In short, the linker transforms independent translation units into a coherent program while balancing **space**, **time**, and **security**. Mastery of its mechanisms empowers you to craft leaner, faster, and safer Linux applications—and to diagnose the inevitable linking issues that arise in large, evolving codebases.
