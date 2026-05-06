---
id: 51
title: "Assembly language"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### Instruction Set Architecture Basics
An ISA defines the binary format that a CPU executes. Each instruction consists of an **opcode** (operation code) and zero or more **operands**. The opcode tells the CPU *what* to do; the operands specify *where* the data lives. In a load‑store ISA (e.g., MIPS, RISC‑V, ARM) only load/store instructions touch memory; arithmetic works solely on registers. This separation simplifies the datapath and enables pipelining: the CPU can fetch, decode, and execute stages independently because register operands are guaranteed to be ready after the decode stage.

### Data Movement and Addressing
Data movement instructions (`mov`, `ldr`, `str`) use **addressing modes** to compute the effective address (EA) of a memory operand. Common modes:
* **Register indirect**: `EA = Rn` – one add‑free cycle.
* **Base + offset**: `EA = Rn + imm12` – requires an ALU add in the address generation stage.
* **Indexed**: `EA = Rn + Rm` – two‑register add.
* **PC‑relative** (used for position‑independent code): `EA = PC + imm` – essential for shared libraries because the kernel loads them at unpredictable addresses.

Why does the ISA provide multiple modes? To balance **code density** (shorter immediates) with **flexibility** (large offsets or register‑based indexing). The assembler must choose the shortest encoding that can represent the required EA; otherwise it emits a relocation for the linker to fix later.

### Arithmetic and Logical Operations
Arithmetic instructions (`add`, `sub`, `mul`, `div`) typically follow a three‑operand format: `dst = src1 op src2`. The CPU performs the operation in the **ALU**. For addition, the result and carry-out are produced in a single cycle; subtraction uses two’s‑complement addition. Multiplication may be multi‑cycle (e.g., Booth’s algorithm) and often writes to a pair of registers (high/low). Division is similarly costly and may trap on overflow or divide‑by‑zero.

Logical ops (`and`, `or`, `xor`, `shift`) are pure bitwise; they affect condition flags (zero, sign, carry, overflow) that later branch instructions consume. Understanding flag setting is crucial: e.g., `sub` sets the zero flag iff the operands are equal, enabling `beq` (branch if equal) without a separate compare.

### Control Flow: Branches and Jumps
A branch changes the **program counter (PC)**. Two broad classes:
* **PC‑relative branch**: `PC ← PC + offset`. Offset is signed, typically limited to ±2^N bytes (e.g., ±2 MiB for a 26‑bit offset in ARM). This enables **position‑independent code** because the offset does not depend on where the image is loaded.
* **Absolute jump/jump‑register**: `PC ← target` (from register or immediate). Used for function returns (`bx lr`) and indirect calls (virtual function tables, jump tables).

Conditional branches test condition flags. For example, on ARM: `b.eq label` branches if Z flag = 1. The CPU evaluates the condition in the decode stage; if false, it fetches the next sequential instruction, avoiding a pipeline flush. This is why **branch prediction** matters: mispredictions cost ~10‑20 cycles on modern cores.

### Stack Mechanics
The stack is a **LIFO** region of memory managed by the stack pointer (`SP` or `RSP`). Conventions:
* **Growth direction**: on x86‑64, the stack grows **down** (toward lower addresses). Pushing decrements `SP`; popping increments it.
* **Alignment**: the System V AMD64 ABI requires the stack to be 16‑byte aligned at call sites. This alignment enables SIMD instructions (e.g., `movaps`) that fault on misaligned addresses.
* **Frame layout**: a typical frame contains, from high to low addresses: return address, saved callee‑saved registers, local variables, and possibly outgoing argument space (the “red zone” on x86‑64 is 128 bytes below `SP` that leaf functions may use without adjusting `SP`).

Why a stack? It provides automatic storage for **function activation records**, enabling recursion and re‑entrancy without manual memory management. The hardware `call` instruction pushes the return address; `ret` pops it and jumps. This tight coupling reduces instruction count versus manual `push`/`jmp` sequences.

### Calling Conventions and the ABI
A **calling convention** is a contract between caller and callee that specifies:
* **Argument passing**: first six integer/pointer arguments in `RDI, RSI, RDX, RCX, R8, R9`; further arguments on the stack.
* **Return value**: 64‑bit in `RAX`; second return value (e.g., struct) in `RDX`.
* **Register preservation**: `RBX, RBP, R12‑R15` are **callee‑saved**; the caller expects them unchanged after a call. `RAX, RCX, RDX, R8‑R11` are **caller‑saved**.
* **Stack alignment**: as noted, `RSP % 16 == 0` before a `call`.
* **Variadic functions**: `printf`‑style functions receive the number of vector registers used in `AL` (for SSE) – a detail the caller must set.

These rules exist so that independently compiled object files can link correctly and share libraries without recompiling every dependent module. Violating them leads to silent data corruption or crashes.

---

## How It Works
### Assembly Process (Two‑Pass Assembler)
1. **First pass**: scan source, build a **symbol table** mapping labels to addresses (unknown yet). Compute the size of each instruction; for forward references, emit a placeholder and record a relocation.
2. **Second pass**: with known addresses, emit actual machine code. For each relocation, apply the appropriate fix‑up (e.g., `PC‑relative offset = symbol_addr - (next_instruction_addr)`).

Example relocation for a PC‑relative branch on x86‑64:
```
offset = S - (P + 4)   // S = target symbol address, P = address of the branch instruction
```
The assembler stores `offset` in a 32‑bit signed field; if it doesn’t fit, it reports an error (branch out of range).

### Linking
The **linker** (`ld`) performs:
* **Symbol resolution**: matches undefined symbols in object files to defined ones in other objects or shared libraries.
* **Section layout**: concatenates `.text`, `.rodata`, `.data`, `.bss`; assigns final virtual addresses.
* **Relocation processing**: applies relocations (e.g., GOT entries for shared libraries, PLT stubs for lazy binding).
* **Executable format**: produces an ELF (`Executable and Linkable Format`) file with program headers describing loadable segments.

### Machine‑Code Illustration (x86‑64)
Consider the instruction `add eax, ebx`. Its encoding:
```
01 /r   // opcode 0x01, /r indicates reg/register mode
    11 000 011   // mod=11 (reg), reg=000 (eax), r/m=011 (ebx)
```
Thus the byte sequence is `01 03`. The assembler derives this from opcode tables and the ModR/M byte.

### From Machine Code to Execution
The CPU fetches 16‑byte aligned chunks from the instruction cache, decodes them into micro‑ops, schedules them on execution ports, and retires them. For a simple `add`, the latency is 1 cycle, throughput 0.5 cycles per cycle (two per clock on modern Intel cores). Branch misprediction flushes the pipeline, incurring ~15 cycles penalty on Intel Skylake.

---

## Worked Examples
### Example 1: Zero‑Extending a 32‑Bit Immediate into a 64‑Bit Register
Goal: load the constant `0x12345678` into `rax` without affecting the upper 32 bits.
```asm
    mov eax, 0x12345678   ; zero‑extends to rax automatically
```
**Step‑by‑step**:
1. Instruction `mov eax, imm32` encodes `B8 + rd` (`B8` for `eax`).
2. CPU writes the 32‑bit immediate to the low half of `rax` and **clears** bits 32‑63 (zero‑extension) – defined by ISA for 32‑bit operand writes to 64‑bit registers.
3. After execution, `rax = 0x0000000012345678`.

### Example 2: Loop Printing Numbers 0‑4 Using `write` Syscall
We'll use the Linux `write` syscall (`SYS_write = 1`), file descriptor `1` (stdout), and a newline‑terminated buffer.
```asm
    .section .data
msg:    .asciz "%d\n"          ; format string (not used directly, we'll build digits)
    .section .bss
buf:    .space 2               ; enough for one digit + '\n'
    .section .text
    .global _start
_start:
    xor    ebp, ebp            ; loop counter i = 0
.Lloop:
    ; Convert i (0‑9) to ASCII character
    add    ebp, '0'            ; ebp = '0' + i
    mov    byte [buf], bpl     ; store low byte
    mov    byte [buf+1], 0xA   ; newline
    ; write syscall: eax=1, edi=1, esi=buf, edx=2
    mov    eax, 1
    mov    edi, 1
    lea    esi, [buf]          ; address of buf
    mov    edx, 2
    syscall                    ; invoke kernel
    ; reset ebp to numeric value for next iteration
    sub    ebp, '0'
    inc    ebp                 ; i++
    cmp    ebp, 5
    jl     .Lloop              ; if i < 5 repeat
    ; exit
    mov    eax, 60             ; SYS_exit
    xor    edi, edi            ; status 0
    syscall
```
**Explanation**:
* `xor ebp, ebp` clears `ebp` (lower 32 bits of `rbp`) – faster than `mov ebp,0`.
* The digit conversion works because `'0' = 0x30`. Adding `i` yields `'0'+i`.
* `syscall` uses the System V ABI: syscall number in `rax`, args in `rdi, rsi, rdx, r10, r8, r9`. Here we reuse `eax`/`edi`/`esi`/`edx` after zero‑extending.
* Loop condition uses `cmp`/`jl` (signed less‑than) – works because `ebp` stays non‑negative.
* After loop, we exit with `exit` syscall (`SYS_exit = 60`).

### Example 3: Function Call Following the System V ABI
Compute `f(x, y) = x + y` and return the result in `rax`.
```asm
    .global _start
    .text
_start:
    ; call foo(7, 5)
    mov    edi, 7          ; first arg in rdi
    mov    esi, 5          ; second arg in rsi
    call   foo
    ; result now in rax; exit with it as status
    mov    edi, eax
    mov    eax, 60         ; SYS_exit
    syscall

foo:
    ; prologue: save rbp if we needed a frame pointer (not needed here)
    ; args already in rdi, rsi
    lea    eax, [rdi + rsi] ; eax = rdi + rsi
    ret                    ; return address popped, rip set to caller
```
**Why `lea`?** `lea` computes an address without touching memory; it’s used here as a three‑operand add that doesn’t affect flags, preserving the caller’s condition codes if needed.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Breaks |
|---------|--------------|---------------|
| **Using `eax` for a syscall number on x86‑64** | Placing the syscall number in `eax` works only in 32‑bit mode; in 64‑bit mode the kernel expects it in **rax**. | The kernel ignores the high 32 bits of `rax`; if you leave garbage there, the syscall number is wrong → `ENOSYS` or undefined behavior. |
| **Neglecting to preserve callee‑saved registers** | Overwriting `rbx`, `rbp`, or `r12‑r15` inside a function without restoring them. | The caller (e.g., `glibc`) assumes those registers retain their values across the call; corruption leads to stack mis‑addressing or infinite loops. |
| **Misaligning the stack before a call** | Calling a function with `rsp % 16 != 0`. | SIMD instructions like `movaps` fault with `#GP` if the memory operand isn’t 16‑byte aligned; many library functions (e.g., `sincos`) rely on this alignment. |
| **Using a 32‑bit immediate where a sign‑extension is required** | `mov eax, 0xFFFFFFFF` then using `eax` as a pointer. | The value is zero‑extended to `0x00000000FFFFFFFF`; the upper bits are not sign‑extended, so the address is wrong in the low 4 GiB range, causing segmentation faults. |
| **Confusing `int 0x80` with `syscall`** | Using the legacy `int 0x80` interface in 64‑bit code. | `int 0x80` expects syscall number in `eax` and arguments in `ebx, ecx, edx, esi, edi, ebp`; mixing conventions yields wrong arguments → erroneous syscalls. |
| **Assuming `rip‑relative addressing` works in 32‑bit mode** | Writing `mov eax, [rip + offset]` in a 32‑bit binary. | RIP‑relative addressing exists only in **64‑bit mode**; the assembler will reject it or produce nonsense, leading to illegal‑instruction faults. |

---

## Exercises
### Easy
1. **Zero a register**: Write three‑instruction sequence that sets `rax` to zero using only `xor`, `sub`, and `and`. Explain why each works.
2. **Return a constant**: Create a function `get_five` that returns the integer `5` in `rax` and is callable from C (`int get_five(void);`). Show the assembly and a small C test program.

### Medium
3. **String length**: Implement `size_t my_strlen(const char *s)` in x86‑64 assembly using the `scasb` instruction (or a simple loop). Follow the System V ABI; show how you would call it from C and print the result with `printf`.
4. **Branch‑delay simulation**: Write a loop that counts down from 10 to 0 using `dec` and `jne`. Count the exact number of executed instructions (including the branch) and compute the total execution time assuming a 1‑cycle `dec`, 1‑cycle `jne` (when not taken) and a 15‑cycle penalty when the branch is mispredicted. Assume perfect prediction after the first iteration.

### Hard
5. **Recursive factorial**: Implement `unsigned long long factorial(unsigned long long n)` recursively, obeying the ABI (preserve callee‑saved registers, align stack). Include a base case at `n==0`. Write a C driver that calls `factorial(5)` and prints the result.
6. **Linux `getpid` via vdso**: Write a program that calls `getpid` **without** making a traditional syscall, by jumping into the vdso‑provided function. Show how to locate the vdso address at runtime (e.g., via `auxv` AT_SYSINFO_EHDR) and call the function. Verify the result matches the PID obtained from a normal `getpid` syscall.

---

## Linux Connection
### Toolchain
* **Assembler**: `as` (GNU AS) – converts `.s` → relocatable `.o`.
  ```bash
  as -o hello.o hello.s
  ```
* **Linker**: `ld` – creates an ELF executable.
  ```bash
  ld -o hello hello.o
  ```
* **Object inspection**:
  ```bash
  objdump -d hello      # disassemble .text
  readelf -h hello      # ELF header, entry point
  readelf -S hello      # section headers
  ```
* **Runtime tracing**:
  ```bash
  strace -e trace=write ./hello   # see each write syscall
  perf record -e cycles ./hello   # rough performance profile
  gdb ./hello                     # step‑through, inspect registers
  ```

### System Call Interface (x86‑64)
The kernel entry point is the `syscall` instruction. Registers per the Linux x86‑64 ABI:
| Register | Meaning |
|----------|---------|
| `rax`    | syscall number |
| `rdi`    | arg1 |
| `rsi`    | arg2 |
| `rdx`    | arg3 |
| `r10`    | arg4 (note: `rcx` is clobbered by `syscall`) |
| `r8`     | arg5 |
| `r9`     | arg6 |

Example: `exit(0)`:
```asm
    mov    eax, 60          ; SYS_exit
    xor    edi, edi         ; status = 0
    syscall
```

### vDSO (Virtual Dynamically-linked Shared Object)
The kernel maps a shared object (`linux-vdso.so.1`) into every process to provide fast syscalls like `gettimeofday`, `clock_gettime`, and `getpid`. Example to call `getpid` via vdso:
```c
/* vdso_getpid.c */
#include <stdio.h>
#include <elf.h>
#include <link.h>
#include <unistd.h>
#include <sys/syscall.h>

extern void *__vdso_sym(const char *name); /* provided by glibc */

int main(void) {
    unsigned long (*getpid_vdso)(void) = __vdso_sym("__kernel_getpid");
    if (!getpid_vdso) {
        /* fallback */
        return syscall(SYS_getpid);
    }
    pid_t pid = getpid_vdso();
    printf("pid via vdso: %d\n", pid);
    return 0;
}
```
Compile:
```bash
gcc -o vdso_getpid vdso_getpid.c
./vdso_getpid
```
The vdso eliminates the kernel‑mode transition for these calls, saving ~200 ns per invocation.

### Where Headers Live
* System call numbers: `/usr/include/asm/unistd_64.h`
* ELF constants: `/usr/include/elf.h`
* ABI details: `/usr/share/doc/libc6/ABI*` (or the *System V AMD64 ABI* PDF from Intel).

---

## Why This Matters
Understanding assembly bridges the gap between **abstract algorithms** and **silicon reality**. It reveals why:
* **Performance tuning** hinges on instruction selection, scheduling, and branch prediction—knowledge that comes from seeing the exact opcode layout and latency numbers.
* **Security mitigations** (e.g., stack canaries, return‑oriented programming defenses) rely on the stack’s layout and calling conventions; exploiting or defending against them requires precise register and memory models.
* **Operating‑system development** demands the ability to write interrupt handlers, context switches, and system‑call stubs in assembly because higher‑level languages cannot guarantee the precise register preservation or atomicity needed.
* **Embedded and real‑time systems** often lack an OS; developers must program hardware directly, using memory‑mapped I/O, timers, and interrupts—all expressed in assembly or intrinsics derived from it.
* **Reverse engineering and malware analysis** start with disassembling binaries; recognizing calling conventions, syscall conventions, and typical prologue/epilogue patterns is essential to infer functionality.

By mastering the mechanics laid out above—instruction encoding, data movement, stack discipline, and the Linux syscall/ABI interface—you gain the mental model needed to read, write, and optimize code at the lowest level, a skill that distinguishes senior systems engineers from application programmers.
