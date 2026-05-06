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

## Core Concepts
An **assembler** translates a human‑readable assembly language file (`.s`) into a binary object file (`.o`) that the processor can execute. The translation is not a simple lexical substitution; it must satisfy three constraints imposed by the hardware and the software build process:

1. **Instruction encoding** – the CPU expects a specific bit pattern for each mnemonic, dictated by the Instruction Set Architecture (ISA).  
2. **Symbol resolution** – assembly uses labels (symbols) to refer to code or data that may be defined in another translation unit. The assembler cannot know the final address of those symbols until all object files are combined.  
3. **Relocation** – the assembler emits placeholders (relocation entries) for addresses that depend on the final load layout. The linker later patches those places with the correct values.

### Symbol Table
During the first pass, the assembler scans the source, records every defined label in a **symbol table**, and assigns it a *section‑relative offset* (the distance from the start of its section). For each symbol we store:
- **Name** (null‑terminated string)
- **Value** (offset within the section)
- **Section index** (`.text`, `.data`, `.rodata`, `.bss`, etc.)
- **Binding** (`STB_LOCAL`, `STB_GLOBAL`, `STB_WEAK`)
- **Type** (`STT_FUNC`, `STT_OBJECT`, `STT_SECTION`, …)

If a symbol is referenced but not defined in the current file, the assembler creates an **undefined** entry (`SHN_UNDEF`). The linker will later bind this to a definition from another object or a shared library.

### Relocation Entries
While emitting machine code, the assembler cannot fill in absolute addresses that depend on the final layout. Instead it writes a placeholder (often zero) and creates a relocation entry that tells the linker how to compute the correct value. A relocation entry contains:
- **Offset** – where in the section the patch should apply (section‑relative).
- **Symbol index** – which symbol the relocation refers to.
- **Type** – the algorithm to apply (e.g., `R_X86_64_64`, `R_X86_64_PC32`).
- **Addend** – a constant baked into the instruction (often the displacement field).

The linker evaluates each entry using a formula specific to its type. For the two most common X86‑64 types:

- **Absolute 64‑bit**: `value = S + A`  
- **PC‑relative 32‑bit**: `value = S + A - P`  

where `S` is the address of the referenced symbol, `A` is the addend, and `P` is the place (address of the storage unit being relocated).

### Instruction Encoding
The ISA defines the exact bit layout for each instruction. For example, the X86‑64 `mov r32, imm32` opcode is `0xB8` followed by a 32‑bit immediate in little‑endian order. The assembler must:
1. Map the mnemonic to the opcode byte(s).
2. Encode any register fields (`reg` field in the ModR/M byte, etc.).
3. Encode immediates or displacements, respecting endianness.
4. Emit any required prefixes (e.g., `REX.W` for 64‑bit operands).

Understanding these steps explains why the same assembly can produce different byte sequences for `-m32` vs `-m64` or for different Intel/AMD extensions.

---

## How It Works
### From Source to Object
1. **Preprocessing** (optional) – handles `#include`, `#define`, etc.; produces a temporary `.i` file.  
2. **Compilation** – the compiler (e.g., `gcc -S`) translates the preprocessed C into assembly (`.s`). This step is *independent* of the target’s final layout; it only needs to know the ISA and ABI (calling convention, register usage, stack alignment).  
3. **Assembly** – the assembler (`as` or `gcc -c`) reads the `.s` file:
   - **Pass 1**: builds the symbol table, notes undefined symbols, and records where each instruction will be placed (section offset).  
   - **Pass 2**: emits the binary bytes, inserting zeroes for unknown addresses, and writes relocation entries for each placeholder.  
   The result is an ELF object file containing sections (`.text`, `.data`, `.rodata`, `.bss`), a symbol table (`.symtab`), and a relocation table (`.rela.text`, etc.).
4. **Linking** – the linker (`ld` or `gcc`) combines one or more `.o` files:
   - Assigns each section a final virtual address (according to a linker script or default layout).  
   - Resolves every undefined symbol by finding a definition with `STB_GLOBAL`/`STB_WEAK` binding; if multiple definitions exist, the linker applies interposition rules.  
   - Applies each relocation: computes `value` using the appropriate formula and writes it into the instruction/data at the given offset.  
   - Optionally performs optimizations (dead‑code elimination, merge of identical sections, etc.) and writes the final executable (or shared library).

### Why Linking Is Necessary
Separate compilation enables parallel builds and reuse of libraries. Without a linker, each object would have to be linked at compile time, forcing monolithic builds and preventing:
- **Address Space Layout Randomization (ASLR)** – the loader can shift the entire image because relocations have already been applied.
- **Shared libraries** – the same `.o` can be linked into multiple executables with different load addresses.
- **Incremental builds** – only changed source files need re‑assembly; the linker reuses unchanged `.o`s.

### Math of Relocation (Derivation)
Consider a PC‑relative call instruction:
```
E8 xx xx xx xx   ; call rel32
```
The CPU computes the target as `RIP + sign_extend(rel32)`, where `RIP` is the address of the *next* instruction. If the assembler placed a zero placeholder, the addend `A` is `-4` (the length of the displacement field). The linker must solve for `rel32` such that:
```
RIP_next + rel32 = S
=> rel32 = S - RIP_next
```
Since `RIP_next = P + 4` (where `P` is the address of the relocation field), we obtain:
```
rel32 = S - (P + 4) = S + (-4) - P
```
Thus the relocation type `R_X86_64_PC32` uses addend `A = -4` and formula `value = S + A - P`.

---

## Worked Examples
### Example 1: Symbol Resolution
**Files**
```asm
/* file1.asm */
        .globl foo
foo:
        mov     eax, 1
        ret
```
```asm
/* file2.asm */
        extern foo
        .globl caller
caller:
        call    foo
        ret
```

**Steps**
1. Assemble each:
   ```bash
   as -o file1.o file1.asm
   as -o file2.o file2.asm
   ```
2. Examine symbol tables:
   ```bash
   readelf -s file1.o
   ```
   Output (relevant lines):
   ```
   Num:    Value          Size Type    Bind   Vis      Ndx Name
     3: 0000000000000000     4 FUNC    GLOBAL DEFAULT    1 foo
   ```
   `file2.o` shows `foo` as `UND` (undefined):
   ```
   Num:    Value          Size Type    Bind   Vis      Ndx Name
     2: 0000000000000000     0 NOTYPE  GLOBAL DEFAULT  UND foo
   ```
3. Link:
   ```bash
   ld -o prog file1.o file2.o
   ```
4. The linker assigns sections. Assume the default layout places `.text` at `0x400000`. The first object’s `.text` (size 7 bytes) starts at `0x400000`, so `foo` gets address `0x400000`. The second object’s `.text` follows at `0x400008`.  
   The linker updates the undefined symbol entry in `file2.o` to `0x400000` and patches the call site (see Example 2).  
   **Why this matters:** The assembler could not know `foo`’s final address; the linker’s symbol resolution step fills that gap, enabling separate compilation.

### Example 2: Relocation (PC‑relative call)
Continuing from Example 1, look at the relocation entry for the call in `file2.o`:
```bash
objdump -r file2.o
```
Output:
```
RELOCATION RECORDS FOR [.text]:
 OFFSET           TYPE              VALUE
 000000000001     R_X86_64_PC32     foo
```
- The call instruction is at offset `0x1` inside `.text` (the first byte `E8` is at offset `0`).  
- The addend for `R_X86_64_PC32` is implicitly `-4`.  

Assume after linking:
- `S` (address of `foo`) = `0x400000`  
- `P` (address of the relocation field) = `0x400000 + 1 = 0x400001`  

Compute:
```
value = S + A - P = 0x400000 + (-4) - 0x400001 = 0xFFFFFFFFFFFFFFFB
```
As a signed 32‑bit value this is `-5` (`0xFFFFFFFB`). The assembler wrote the bytes `FB FF FF FF` (little‑endian) into the displacement field. The CPU executes:
```
RIP_next = address after call = 0x400001 + 5 = 0x400006
target   = RIP_next + (-5) = 0x400001
```
which is precisely the start of `foo`.  

**Why this matters:** PC‑relative relocations enable position‑independent code; the same object can be loaded at any address without needing runtime fix‑ups beyond the PC‑relative offset.

### Example 3: Instruction Encoding (mov eax, imm32)
Assembly:
```asm
        mov     eax, 0x10
```
Encoding steps:
1. Opcode for `mov r32, imm32` = `0xB8`.  
2. The `reg` field in the opcode selects `eax` (register index `0`). The opcode already encodes this, so no ModR/M byte needed.  
3. Immediate `0x10` → little‑endian bytes `10 00 00 00`.  

Result: `B8 10 00 00 00`.  

You can verify:
```bash
echo -e "\xb8\x10\x00\x00\x00" | ndisasm -b32 -
```
Output:
```
00000000  B810000000        mov eax,0x10
```
**Why this matters:** Knowing the exact byte layout lets you predict code size, predict cache behavior, and hand‑craft shellcode or JIT‑generated instructions.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Happens | Correct Understanding |
|---|---|---|---|
| **Assuming symbol resolution occurs during assembly** | Believing that an undefined symbol is assigned an address by the assembler. | The assembler only sees the current object; it cannot know where other objects will place their sections. | Symbol resolution is a linker‑time activity; the assembler leaves undefined symbols and creates relocation entries for them. |
| **Treating all relocations as simple absolute adds** | Using `value = S + A` for PC‑relative cases, producing broken jumps/calls after linking. | Overlooking that the CPU interprets the field relative to the instruction pointer. | Relocation type dictates the formula; `R_X86_64_PC32` uses `S + A - P`. Ignoring the `-P` term yields off‑by‑instruction‑length errors. |
| **Neglecting section alignment and padding** | Expecting the layout of `.text` followed immediately by `.data` without gaps, leading to misaligned accesses. | The linker aligns each section to satisfy CPU requirements (e.g., 16‑byte alignment for SSE). | Alignment introduces padding; the final address of a symbol is `section_base + offset + padding`. Always check section headers (`readelf -S`) to see actual alignment values. |

---

## Exercises
### Easy
1. **Symbol inspection**  
   ```bash
   cat > hello.asm <<'EOF'
   .globl _start
   _start:
       mov eax, 1          ; exit
       xor ebx, ebx
       int 0x80
   EOF
   as -o hello.o hello.asm
   readelf -s hello.o
   ```
   *Question:* What is the value and binding of `_start`? Why is it `UND` in the object file?

### Medium
2. **Cross‑object call and relocation**  
   *fileA.asm*:
   ```asm
   .globl func
   func:
       mov eax, edi
       ret
   ```
   *fileB.asm*:
   ```asm
   extern func
   .globl caller
   caller:
       mov edi, 42
       call func
       ret
   ```
   Assemble, link with `ld -o demo fileA.o fileB.o`, then:
   ```bash
   objdump -d demo   # disassemble
   objdump -R demo   # show dynamic relocations (if any)
   readelf -s demo   # verify func’s address
   ```
   *Question:* Verify that the call displacement matches `S + A - P`. Explain why the relocation type is `R_X86_64_PC32` and not `R_X86_64_64`.

### Hard
3. **Position‑Independent Code (PIC) and shared library**  
   Write a PIC function that returns the address of a global variable using RIP‑relative addressing:
   ```asm
   /* pic.asm */
   .globl get_var
   get_var:
       mov eax, [rel var]   ; NASM syntax; for GAS use: mov var(%rip), %eax
       ret
   .data
   var: .long 0xdeadbeef
   ```
   Assemble with `-fPIC`:
   ```bash
   as -o pic.o pic.asm --fPIC
   objdump -r pic.o
   ld -shared -o libpic.so pic.o
   ```
   *Question:* What relocation type appears for the `[rel var]` operand? How does the loader use it when the shared library is mapped at a different base address? Show the math for a hypothetical load address `0x7f0000000000`.

---

## Linux Connection
The Linux toolchain and kernel expose the concepts discussed above in concrete ways.

### Kernel Build
The Linux kernel is built with a **freestanding** toolchain (no standard library) and uses the GNU assembler (`as`) and linker (`ld`) directly:
```bash
# From the kernel source root
make ARCH=x86_64 CFLAGS="-fno-pie -no-pie"  # ensures flat binary for early boot
```
The early boot code lives in `arch/x86/kernel/head_64.S`. Key symbols:
```asm
.globl _text
_text:
    .quad   startup_64   # entry point
```
`_text` is defined at the start of the `.text` section; the linker script `arch/x86/kernel/vmlinux.lds` places `.text` at the physical address `0x100000` (the kernel’s load offset). The assembler emits relocation entries for references to symbols like `startup_64`; the linker resolves them using the layout defined in the linker script.

**Commands to inspect the kernel object:**
```bash
# After make, before linking
objdump -t arch/x86/kernel/head_64.o | grep _text
readelf -S arch/x86/kernel/head_64.o   # view sections and their offsets
```

### User‑Space Example: glibc
The GNU C Library (`glibc`) is built as a set of shared objects. Examine a core routine:
```bash
objdump -t /lib/x86_64-linux-gnu/libc.so.6 | grep memcpy
readelf -S /lib/x86_64-linux-gnu/libc.so.6 | grep .text
```
You will see `memcpy` as a `FUNC` symbol with a specific offset inside the `.text` section. The shared object contains numerous `R_X86_64_GLOB_DAT` and `R_X86_64_JUMP_SLOT` relocations that the dynamic linker (`ld-linux.so.2`) resolves at runtime when an executable loads the library.

### Practical Shell Commands
```bash
# 1. Look at symbol table of an object file
objdump -t file.o

# 2. Look at relocation entries (section‑specific)
objdump -r file.o          # short form
objdump -R file.o          # displays addends explicitly

# 3. Examine ELF headers and sections of an executable
readelf -h a.out
readelf -S a.out

# 4. Link with a custom linker script (useful for embedded or kernel work)
ld -T myscript.ld -o output.o input1.o input2.o

# 5. Show the dynamic relocations applied by the loader at runtime
ldd ./a.out          # lists needed shared libraries
objdump -d ./a.out   # disassembled PLT/GOT entries (result of relocations)
```
These commands let you observe the **symbol table**, **relocation entries**, **section layout**, and **linker script effects** directly on a running Linux system.

---

## Why This Matters
Understanding assemblers, object files, and linkers is not an academic exercise; it is the foundation for every layer of systems software that interacts directly with hardware:

* **Performance** – Knowing how instructions are encoded lets you predict code size, alignment penalties, and pipeline stalls. Hand‑tuned assembly or JIT compilers rely on this knowledge to achieve peak throughput.
* **Security** – Mechanisms like **RELRO**, **PIE**, and **ASLR** depend on the assembler generating relocations that the linker or dynamic loader can apply. Misunderstanding relocation types leads to exploitable gaps (e.g., writable `.text` segments).
* **Debugging & Reverse Engineering** – Symbol tables and relocation data are what debuggers (`gdb`, `lldb`) and disassembly tools use to map machine code back to source symbols. Without them, debugging optimized binaries is nearly impossible.
* **Operating‑System Development** – Kernels are built as freestanding ELF images. The bootloader loads the image at a prescribed physical address; the kernel’s early assembly code (`head_*.S`) relies on correct symbol resolution and relocation to set up paging, transition to long mode, and call the C entry point.
* **Device‑Driver & Embedded Work** – Many drivers are compiled as kernel modules (`.ko`). The module loader performs its own relocation pass, applying the same ELF relocation types (`R_X86_64_RELATIVE`, `R_X86_64_64`, etc.) to adapt the module to the running kernel’s address space.

By mastering the **why** behind each step—why the assembler needs two passes, why relocation types differ, why the linker must respect alignment and section ordering—you gain the ability to write correct, efficient, and secure low‑level code, diagnose linking failures, and extend toolchains for new architectures or execution environments. This knowledge compounds as you move from writing simple programs to constructing operating systems, hypervisors, or high‑performance computing runtimes. The concepts covered here are the bedrock upon which all advanced systems programming rests.
