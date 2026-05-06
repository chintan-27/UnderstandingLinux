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

## Core Concepts
### DWARF as a Portable Debugging Format  
DWARF (Debugging With Attributed Record Formats) defines a series of ELF sections (`*.debug_*`) that describe a program’s *static* structure independent of the compiler or ABI. The format is necessary because after compilation the executable contains only machine code; source‑level entities (variables, types, scopes) are lost. DWARF restores this information by encoding **Debugging Information Entries (DIEs)** in a tree whose nodes are tagged with DWARF tags (e.g. `DW_TAG_subprogram`, `DW_TAG_variable`) and whose attributes (name, type, location, byte size, etc.) are stored using a compact, extensible encoding (LEB128 integers, byte strings, references).  

### Symbol Tables in ELF  
An ELF object file contains two symbol tables:  
* **`.symtab`** – static symbols (functions, global/static variables) visible only during linking.  
* **`.dynsym`** – dynamic symbols needed for runtime linking (shared libraries).  

Each entry is an `Elf64_Sym` (or `Elf32_Sym`):  

```c
typedef struct {
    Elf64_Word   st_name;  /* index into .strtab */
    unsigned char st_info; /* binding + type */
    unsigned char st_other;/* visibility */
    Elf64_Section st_shndx;/* section index */
    Elf64_Addr   st_value; /* address (or offset) */
    Elf64_Xword  st_size;  /* size in bytes */
} Elf64_Sym;
```

The linker resolves **undefined** symbols by searching these tables; the value `st_value` is later adjusted by relocations.

### Relocation – Why Addresses Must Be Patched  
During compilation the compiler emits *relative* offsets because the final load address is unknown. A relocation record describes how to fix each such reference:

```c
typedef struct {
    Elf64_Addr   r_offset; /* location to patch */
    Elf64_Xword  r_info;   /* symbol index + type */
    Elf64_Sxword r_addend; /* constant addend (Rela only) */
} Elf64_Rela;
```

For an **R_X86_64_PCREL32** relocation the corrected 32‑bit field is:

$$
\text{*location} = (S + A) - P
$$

where  
* **S** = value of the referenced symbol after layout,  
* **A** = addend from the relocation,  
* **P** = address of the location being patched.  

If the symbol resides in a shared object, **S** includes the object's load bias, making the calculation position‑independent.

### Stack Unwinding – Reconstructing Call Frames  
A debugger must recover the *previous* frame’s registers (especially the return address and CFA – Canonical Frame Address) from the current register state. DWARF provides this via **frame description entries (FDEs)** in `.debug_frame` or the unwinder‑friendly `.eh_frame`. Each FDE is preceded by a **common information entry (CIE)** that defines the default rule set (e.g. CFA = rsp + 8 on System V AMD64). An FDE encodes, for a given code range `[initial_location, initial_location+address_range)`, a series of *rules* that tell how to compute each register’s value in the caller:

* **CFA rule** – usually an expression like `rsp + offset`.  
* **Return‑address rule** – often `[CFA - 8]` (the saved RIP).  
* **Callee‑saved registers** – may be `undefined` or `registerX`.

The unwinder starts at the current PC, finds the matching FDE, evaluates its rules to obtain the caller’s CFA, then repeats using the caller’s PC (the return address) until the stack is exhausted.

---

## How It Works
### DWARF Section Interaction  
1. **`.debug_info`** – DIE tree. Example: a `DW_TAG_subprogram` DIE for `foo` has attributes `DW_AT_low_pc` (start address), `DW_AT_high_pc` (end address), `DW_AT_frame_base` (CFA expression), and a list of child DIEs for parameters and locals.  
2. **`.debug_line`** – maps *machine address* → *source line*. The header contains:  
   * `minimum_instruction_length` (usually 1)  
   * `maximum_operations_per_instruction`  
   * `default_is_stmt`  
   * `line_base`, `line_range`, `opcode_base`  
   followed by a bytecode stream that encodes special opcodes advancing address and line simultaneously.  
   The decoder maintains a state machine `(address, line, file, column, …)`; when a special opcode is seen, both fields are updated:  

   ```
   address_advance = (opcode - opcode_base) / line_range * minimum_instruction_length
   line_advance    = line_base + (opcode - opcode_base) % line_range
   ```

3. **`.debug_frame` / `.eh_frame`** – CIE + FDEs. The CIE includes:  
   * `version`  
   * `augmentation` (e.g. `"zR"` for size and personality)  
   * `code_alignment_factor`  
   * `data_alignment_factor` (usually -8 on AMD64)  
   * `return_address_register` (DWARF register 16 = RIP)  
   The augmentation string may contain `z` (size LEB128) and `R` (a personality routine pointer).  

   An FDE encodes the *initial location* (segment‑relative offset) and *address range* (LEB128). The instruction stream afterwards is identical to the CIE’s but only overrides rules that differ.

### Symbol Resolution Process (Linker View)  
1. **Symbol collection** – The linker reads all `.symtab`/`.dynsym` entries, builds a hash table mapping `st_name` → `(symbol, defining object)`.  
2. **Duplicate handling** – If a symbol is defined in more than one relocatable object, the linker applies *visibility* and *binding* rules (STB_GLOBAL overrides STB_WEAK, etc.).  
3. **Relocation application** – For each `Elf64_Rela` in a relocatable’s `.rela.*` section:  
   * Locate the symbol `sym` via `ELF64_R_SYM(r_info)`.  
   * Compute `S = sym->st_value + load_bias_of_defining_object`.  
   * Compute `P = r_offset + load_bias_of_current_object`.  
   * Apply the formula appropriate to the relocation type (see above).  
   * Write the result back to memory at `P`.  

### Unwinding in Practice (gdb)  
When `gdb` receives a `SIGSEGV`, it:  
1. Reads the faulting PC from the thread’s `ucontext`.  
2. Looks up the PC in the process’s `vsyscall`/`vDSO` or main executable’s load map to find the corresponding ELF object.  
3. Uses `libdwfl` (from elfutils) to locate the FDE covering that PC.  
4. Executes the FDE’s DWARF expression engine to compute CFA and restore registers.  
5. Repeats with the restored RIP as the new PC until either a frame with no FDE is found (stop) or the stack limit is reached.  

---

## Worked Examples
### Example 1: Relocation and Symbol Resolution  
**Source (`foo.c`)**  

```c
extern int global;
void foo(void) { global = 42; }
```

Compile: `gcc -c -fpic -o foo.o foo.c`

`objdump -r foo.o` shows a relocation:

```
0000000000000004  R_X86_64_PC32      global-0x4
```

* At offset `0x4` in `.text` the instruction `movl $global, %eax` needs a 32‑bit PC‑relative displacement.  
* In the object file, `global` is undefined → `st_value = 0`, `st_shndx = SHN_UNDEF`.  

Link with: `gcc -o prog foo.o -Wl,--no-as-needed` (assume `global` defined in `bar.o` at address `0x601010` in the final executable).

**Linker steps**  

1. Symbol table after merging: `global` gets `st_value = 0x601010` (absolute address in `.data`).  
2. Apply relocation:  
   * `S = 0x601010`  
   * `A = -4` (the addend encoded in the relocation)  
   * `P = load_foo + 0x4`. Assume `foo.o` is placed at `0x400520` in the executable → `P = 0x400524`.  
   * Compute `*location = S + A - P = 0x601010 - 4 - 0x400524 = 0x200AE8`.  

The resulting 32‑bit field at `0x400524` holds `0x200AE8`. At runtime, when RIP = `0x400524`, the effective address computed by the CPU is `RIP + 0x200AE8 = 0x601010`, exactly the address of `global`.  

**Verification**  

```bash
$ objdump -d prog | grep -A2 "<foo>":
00000000000400520 <foo>:
  400520:   55                      push   %rbp
  400521:   48 89 e5                mov    %rbp,%rsp
  400523:   c7 05 ae 0a 20 00       movl   $0x42,0x200ae8(%rip)   # 601010 <global>
  40052a:   5d                      pop    %rbp
  40052b:   c3                      ret
```

The displacement `0x200ae8` matches our calculation.

### Example 2: Stack Unwinding with DWARF Frame Info  
**Source (`nest.c`)**  

```c
void leaf(int x) { asm volatile("" : : "r"(x)); }   /* prevent tail‑call opt */
void middle(int y) { leaf(y); }
void top(void)   { middle(7); }
int main(void) { top(); return 0; }
```

Compile with debug info: `gcc -g -O0 -o nest nest.c`

Inspect frame section:

```bash
$ readelf -wF nest | head -30
```

Output (excerpt):

```
CIE:
  version:               1
  augmentation:          zR
  code_alignment_factor: 1
  data_alignment_factor: -8
  return_address_register: 16
  augmentation size:     8
    -> size of LSDA:      0 (ULEB128 0)
    -> personality:       0x0 (encoded pointer)

FDE count: 2
  FDE at 0x00000000000006c0:
    initial location:   0x400530   (<top>+0x0)
    address range:      0x1c       (covers top through middle)
    DW_CFA_def_cfa:     rsp + 8
    DW_CFA_offset:      rip: -8 at CFA-8
    DW_CFA_offset:      rbp: -16 at CFA-16

  FDE at 0x00000000000006e8:
    initial location:   0x400550   (<leaf>+0x0)
    address range:      0x12
    DW_CFA_def_cfa:     rsp + 8
    DW_CFA_offset:      rip: -8 at CFA-8
    DW_CFA_offset:      rbp: -16 at CFA-16
```

Now run the program under `gdb` and stop at `leaf`:

```bash
$ gdb -q nest
(gdb) break leaf
Breakpoint 1 at 0x400550: file nest.c, line 3.
(gdb) run
Starting program: /home/user/nest

Breakpoint 1, leaf (x=7) at nest.c:3
3	    asm volatile("" : : "r"(x));
(gdb) bt
#0  leaf (x=7) at nest.c:3
#1  0x00000000000400558 in middle (y=7) at nest.c:4
#2  0x00000000000400540 in top () at nest.c:5
#3  0x00000000000400520 in main () at nest.c:8
```

**Why the backtrace is correct**  

* At the breakpoint, PC = `0x400550` (`leaf`). The FDE for `leaf` says CFA = `rsp + 8`.  
* The saved RIP is at `[CFA - 8]`. Reading memory at `rsp` (current stack pointer) yields the return address `0x400558` (the instruction after `call leaf` in `middle`).  
* The saved RBP is at `[CFA - 16]`; its value is the previous frame’s base pointer, which the unwinder uses as a sanity check (frame‑pointer chain matches).  
* The unwinder now sets PC = `0x400558` and repeats: the PC falls into the FDE for `top`/`middle` (range `0x400530‑0x40054c`). Its CFA rule is also `rsp + 8`, yielding the next return address `0x400540` (`top`), and so on until `main`.  

If we had compiled with `-O2 -fomit-frame-pointer`, the `DW_CFA_offset: rbp` rule would be omitted; the unwinder would rely solely on the CFA rule (`rsp + 8`) and the return‑address rule, which still works because DWARF frame info does **not** require a frame pointer.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Matters |
|---|---------|--------------|----------------|
| 1 | **Assuming a symbol’s `st_value` is its final virtual address** | In relocatable objects `st_value` is an *offset* within a section; only after layout (and relocation) does it become an address. | Leads to incorrect address calculations when manually parsing symbol tables or implementing custom loaders. |
| 2 | **Believing `.debug_line` is always present in stripped binaries** | Strip (`strip --strip-debug`) removes *all* `.debug_*` sections, including line info. | Debuggers cannot map PC → source line; you must rely on `.symtab`/`.dynsym` or separate debug files (`.build-id`). |
| 3 | **Thinking frame pointers are required for reliable unwinding** | Modern compilers omit `-fomit-frame-pointer`; DWARF frame info (`.eh_frame`) provides unwind rules without needing `%rbp`. | Relying on `%rbp` causes missing frames in optimized code; debuggers that only walk the frame‑pointer chain will lose accuracy. |
| 4 | **Using the symbol table of a shared object to resolve references in the main executable** | Each ELF object has its own symbol table; the dynamic linker resolves references at runtime using the *global scope* (loaded objects in order). | Looking only at the main executable’s `.dynsym` yields “undefined” for symbols actually provided by a library, causing false‑negatives in tools like `objdump -T`. |
| 5 | **Assuming the relocation addend `A` is zero for all types** | Many relocation types (e.g. `R_X86_64_64`, `R_X86_64_GOTPCREL`) encode a non‑zero addend that must be added to `S`. | Ignoring `A` produces off‑by‑constant errors, visible as garbled pointers or segmentation faults. |

---

## Exercises
### Easy  
1. **Symbol inspection** – Compile `gcc -c -o hello.o hello.c` (any C file). Run `readelf -s hello.o` and `objdump -t hello.o`. Identify the difference between the **local** (`STB_LOCAL`) and **global** (`STB_GLOBAL`) entries.  
2. **Relocation type identification** – Use `objdump -r hello.o`. List each relocation type and, using the Intel manual, state its purpose (e.g. PC‑relative vs GOT‑relative).  

### Medium  
3. **Address‑to‑source translation** – Write a short program `sample.c` containing a function `baz()` that returns `int`. Compile with `gcc -g -O0 -o sample sample.c`. Run `./sample` under `gdb`, break at `baz`, note the PC (`info register rip`). Then use `addr2line -e sample <pc>` to obtain the source line. Verify it matches `gdb`’s `list`.  
4. **Manual relocation calculation** – Take the object file from Exercise 1, extract a `R_X86_64_PC32` relocation (`objdump -r`). Using `readelf -s` to get the symbol’s value and `readelf -S` to get section load offsets (assume a link address of `0x400000`), compute the final 32‑bit field by hand and compare with the bytes in the object (`objdump -d -M intel`).  

### Hard  
5. **DWARF frame unwinder** – Using the `elfutils` library (`libdwfl`), write a C program that:  
   * Opens the current executable (`/proc/self/exe`).  
   * Finds the FDE containing a given PC (passed as the first argument).  
   * Executes the CIE/FDE rule set to compute CFA and restore `RIP` and `RBP`.  
   * Prints the recovered caller PC. Test it by invoking from a signal handler that captures the faulting PC and compares the unwound stack to `gdb bt`.  
6. **Custom linker script** – Create a linker script that places `.text` at `0x600000` and `.data` at `0x700000`. Compile a simple two‑file program, link with the script, and verify with `readelf -l` that the program headers reflect those addresses. Explain how the relocation addends change compared to the default script.  

---

## Linux Connection
### Kernel & Userspace Infrastructure  
* **`CONFIG_DEBUG_INFO`** – When set, the kernel is built with `-g`, generating DWARF sections in `vmlinuz` and modules (`/lib/modules/$(uname -r)/build/`).  
* **`/lib/debug/.build-id/`** – The build‑ID index used by `eu-unstrip` and `gdb` to locate separate debug files (`debuginfo` packages).  
* **`sysfs/debugfs`** – Files such as `/sys/kernel/debug/dwarf` (exposed by the `dwarf` decoder) allow inspection of kernel unwind tables at runtime.  
* **`ptrace`** – `ptrace(PTRACE_GETREGS, pid, NULL, &regs)` fetches a thread’s register state; combined with `libdwfl` it enables user‑space unwinders for other processes (used by `gdb`, `strace`, `perf`).  
* **`perf`** – The `perf record -g` option relies on DWARF frame info (`/usr/lib/debug/.build-id/`) to generate accurate call graphs; without it, perf falls back to frame‑pointer walking (which may miss frames).  
* **`uprobes`/`kprobes`** – When attaching a probe, the kernel validates the address against the object’s symbol table and, if available, uses DWARF to compute the correct offset for the probe handler.  

### Concrete Commands
```bash
# List DWARF sections in an executable
$ readelf -wS a.out

# Show the .debug_line table (human readable)
$ readelf -wl a.out | less

# Display frame info (CIE/FDE)
$ readelf -wF a.out

# Convert a PC to source line using separate debug file
$ eu-addr2line -e /usr/lib/debug/.build-id/ab/abcd1234...debug a.out 0x400550

# Find the build‑ID of a binary
$ eu-readelf -n a.out | grep BuildID

# Use gdb to unwind using DWARF (default)
$ gdb -q a.out
(gdb) set verbose on
(gdb) break main
(gdb) run
(gdb) bt full   # shows DWARF CFA expressions

# Perf callgraph with DWARF
$ perf record -g ./a.out
$ perf report --stdio
```

### File‑system Paths of Interest
| Path | Purpose |
|------|---------|
| `/usr/lib/debug/.build-id/*/*` | Separate debug symbols indexed by build‑ID (used by `gdb`, `perf`, `systemd-coredump`). |
| `/proc/<pid>/map_files/` | Symlinks to the actual backing files of each memory region (useful for locating the ELF object that contains a PC). |
| `/sys/kernel/debug/tracing/` | `trace_pipe` and `kprobe_events` – demonstrate how kernel probes rely on symbol tables/DWARF for address resolution. |
| `/usr/include/dwfl.h` | Header for `libdwfl` (
