---
id: 65
title: "Other systems languages"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Core Concepts
### C++ and Rust as Systems Languages
C++ provides **zero‑overhead abstractions** (templates, inline functions) and **deterministic resource management** (RAII) while retaining **full control over memory layout** and **direct hardware access**. Rust enforces **memory safety** at compile time through its **ownership model**, eliminating data races without a garbage collector, yet still permits **unsafe blocks** for low‑level operations when necessary. Both languages target the same **Application Binary Interface (ABI)** as C, allowing them to call into and be called from existing system libraries and the Linux kernel.

### Application Binary Interface (ABI) on Linux
The ABI is a contract between compiled code and the operating system that specifies:
* **Machine‑code format** – ELF (Executable and Linkable Format) on Linux.
* **Calling convention** – System V AMD64 ABI:  
  - Integer/pointer arguments in registers `RDI, RSI, RDX, RCX, R8, R9`; further arguments on the stack.  
  - Return value in `RAX` (and `RDX` for a second 64‑bit value).  
  - Stack must be 16‑byte aligned at call sites (`%rsp % 16 == 8` after the push of the return address).  
* **Name mangling** – C++ encodes type information into symbols (e.g., `_Z3fooi` for `void foo(int)`). Rust uses a stable mangling scheme (`_ZN4mycrate3foo17h1a2b3c4d5e6f7g8hE`).  
* **Exception handling** – C++ uses **LSDA** (Language Specific Data Area) in `.gcc_except_table`; Rust unwinds via **libunwind** tables (`.eh_frame`).  
* **Data layout** – Structs follow the same packing rules as C unless `#[repr(C)]` (Rust) or `alignas` / `#pragma pack` (C++) is used.  

Understanding these rules explains why a function compiled with `g++` can be called from a `rustc`‑generated object file **without** re‑compiling the caller: both produce machine code that obeys the same register usage, stack alignment, and symbol format.

### Machine Code and the Fetch‑Decode‑Execute Cycle
Machine code is a sequence of **opcode bytes** interpreted by the CPU’s control unit. For an x86‑64 instruction:
```
[prefixes] [opcode] [mod r/m] [sib] [displacement] [immediate]
```
* **Fetch** – the CPU reads the next `IP`‑relative bytes from the instruction cache.  
* **Decode** – the prefix bytes identify operand size, address size, locking, etc.; the opcode determines the operation (e.g., `0x89` = `MOV r/m, r`).  
* **Execute** – the arithmetic‑logic unit (ALU) or load/store unit performs the operation, updating flags and registers as specified.

The **assembly language** is a symbolic mapping of these fields, making it possible for humans to write instructions like:
```asm
mov    eax, DWORD PTR [rdi+0x8]   ; load 32‑bit value at (rdi+8) into eax
```
An **assembler** translates each mnemonic into the binary encoding, generates relocation entries for addresses not yet known, and emits an ELF object file.

### Compilers: From Source to Assembly
A modern compiler (GCC, Clang, rustc) consists of three logical phases:

1. **Frontend** – lexical analysis → tokens → syntax tree (AST) → semantic analysis (type checking, overload resolution).  
   *Why*: Guarantees that the program is well‑formed before any low‑level work.
2. **Middleend** – AST → **IR** (GIMPLE for GCC, LLVM IR for Clang/rustc).  
   Optimizations (constant propagation, dead‑code elimination, loop vectorization) operate on this language‑independent representation.  
   *Why*: Allows a single optimizer to serve many frontends and targets.
3. **Backend** – target‑specific **instruction selection**, **register allocation** (graph coloring), **instruction scheduling**, and **asm emission**.  
   *Why*: Maps the IR to concrete machine instructions while respecting the ABI (calling convention, register usage, stack alignment).

The compiler also emits **debug information** (DWARF) that maps source lines to address ranges, enabling tools like `gdb` to set breakpoints.

### Linkers: Creating an Executable
The linker consumes one or more **ELF object files** and produces an executable (or shared library). Its responsibilities:

* **Symbol resolution** – matches each undefined symbol (e.g., `std::cout`) with a definition in another object or a shared library.  
* **Relocation** – applies fix‑ups to addresses that depended on the final load location. For a relocation of type `R_X86_64_PC32` at offset `o` with addend `A`:  
  ```
  * (addr + o) = (S + A) - P
  ```
  where `S` is the symbol’s address, `P` is the place being relocated (`addr + o`).  
* **Layout** – assigns virtual addresses to sections (`.text`, `.rodata`, `.data`, `.bss`) respecting page alignment (typically 4 KiB).  
* **Dynamic linking** – inserts a **Procedure Linkage Table (PLT)** and **Global Offset Table (GOT)** for lazy binding of shared‑library symbols; the dynamic loader (`ld-linux.so.2`) resolves them at runtime.

Static linking (`ld -static`) copies all needed object code into the executable, eliminating runtime dependencies but increasing size. Dynamic linking (`ld -dynamic`) keeps the executable small and permits sharing of common libraries (e.g., `libc.so.6`).

---

## How It Works
### Step‑by‑step Translation of a C++/Rust Program
| Step | Action | Reason (Causality) | Linux‑specific detail |
|------|--------|--------------------|-----------------------|
| **Preprocessing** | `g++ -E` expands `#include`, evaluates `#if`, `#define`, removes comments. | Guarantees that the compiler sees a single translation unit; macro‑based configuration (e.g., feature flags) is resolved early. | Header files come from `/usr/include` (glibc) or `/usr/local/include`. |
| **Compilation** | Frontend → AST → Middleend → IR optimizations → Backend → assembly (`.s`). | Each phase refines the program while preserving semantics; optimizations improve speed/size without altering observable behavior. | `gcc -S -O2 -fverbose-asm hello.cpp` yields annotated asm. |
| **Assembly** | `as` (or the compiler’s integrated assembler) turns `.s` into a relocatable ELF object (`.o`). | Creates binary machine code while leaving placeholders for unresolved symbols; relocation tables enable the linker to adjust addresses later. | `objdump -r hello.o` shows relocation entries (e.g., `R_X86_64_PC32` for `std::cout`). |
| **Linking** | `ld` (invoked via `g++` or `rustc`) merges `.o` files, resolves symbols, applies relocations, builds ELF executable. | Produces a runnable image where every address is fixed (or marked for lazy binding) and the program can be loaded by the kernel’s execve. | `ld --verbose` prints the linker script showing section placement. |

### Why Each Step Is Necessary
*Without preprocessing*, the compiler would have to parse `#include` directives itself, complicating the frontend and preventing reuse of system headers.  
*Without a middleend IR*, each target would need its own optimizer, duplicating effort and making cross‑language optimizations (e.g., link‑time optimization) impossible.  
*Without assembly*, the backend would have to emit final machine code directly, making it harder to inspect or manually tweak generated code.  
*Without linking*, each translation unit would need to be a complete program, forbidding separate compilation and library reuse.

---

## Worked Examples
### Example 1: C++ “Hello, World!” – Full Pipeline
**Source (`hello.cpp`):**
```cpp
#include <iostream>

int main() {
    std::cout << "Hello, World!\n";
    return 0;
}
```

**1. Preprocessing** (`g++ -E -o hello.i hello.cpp`):
```bash
# Truncated output – shows the actual contents of <iostream> after macro expansion.
# You can see hundreds of lines; the important part is that std::cout becomes
#   std::basic_ostream<char, std::char_traits<char>>& std::cout;
```

**2. Compilation to Assembly** (`g++ -S -O2 -fverbose-asm -o hello.s hello.cpp`):
```asm
    .file   "hello.cpp"
    .section    .rodata
.LC0:
    .string "Hello, World!\n"
    .text
    .globl  main
    .type   main, @function
main:
.LFB0:
    .cfi_startproc
    subq    $8, %rsp          # allocate space for alignment
    .cfi_def_cfa_offset 16
    leaq    .LC0(%rip), %rdi  # load address of string into RDI (1st arg)
    call    std::basic_ostream<char, std::char_traits<char>>& std::cout::operator<<(char const*)
    # return value already in RAX from the call
    xor     eax, eax          # return 0
    addq    $8, %rsp
    .cfi_def_cfa_offset 8
    .ret
    .cfi_endproc
```
*Explanation*: The compiler placed the string in `.rodata`, used **RIP‑relative addressing** (`%rip` + offset) to load its address, and called the overloaded `operator<<`. The stack adjustment (`subq $8, %rsp`) maintains 16‑byte alignment before the call, as required by the System V ABI.

**3. Assembly to Object** (`as -o hello.o hello.s`):
```bash
$ objdump -h hello.o
hello.o:     file format elf64-x86-64
Sections:
Idx Name          Size      VMA       LMA       File off  Algn
 0 .text         00000030  00000000  00000000  00000040  2**2
                  CONTENTS, ALLOC, LOAD, READONLY, CODE
 1 .rodata       0000000e  00000000  00000000  00000070  2**3
                  CONTENTS, ALLOC, LOAD, READONLY, DATA
 2 .eh_frame     00000028  00000000  00000000  00000080  2**2
                  CONTENTS, ALLOC, LOAD, READONLY, DATA
```
The `.eh_frame` section holds unwind information for exception handling.

**4. Linking** (`g++ -o hello hello.o`):
```bash
$ ldd hello
        linux-vdso.so.1 (0x00007ffd9c7f8000)
        libstdc++.so.6 => /lib/x86_64-linux-gnu/libstdc++.so.6 (0x00007f9b8e5c0000)
        libm.so.6 => /lib/x86_64-linux-gnu/libm.so.6 (0x00007f9b8e4b0000)
        libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f9b8e0d0000)
        /lib64/ld-linux-x86-64.so.6 (0x00007f9b8ea80000)
```
The linker resolved `std::cout` to `libstdc++.so.6` and inserted PLT entries for lazy binding.  
**Runtime check** (`strace -e write ./hello`):
```bash
write(1, "Hello, World!\n", 14) = 14
```
The program invokes the `write` syscall via the C++ stream, which ultimately calls the kernel’s `sys_write`.

### Example 2: Rust “Hello, World!” – Full Pipeline
**Source (`hello.rs`):**
```rust
fn main() {
    println!("Hello, World!");
}
```

**1. Preprocessing** – Rust’s compiler (`rustc`) handles crate loading and macro expansion internally; the equivalent of `gcc -E` is `rustc --pretty=expanded hello.rs`. The `println!` macro expands to:
```rust
{
    use std::io::_print;
    _print(format_args!("Hello, World!\n"));
}
```

**2. Compilation to Assembly** (`rustc --emit asm -C opt-level=2 hello.rs`):
```asm
    .file   "hello.rs"
    .section    .rodata
.LC0:
    .string "Hello, World!\n"
    .text
    .globl  main
    .type   main, @function
main:
.LFB0:
    .cfi_startproc
    subq    $8, %rsp
    .cfi_def_cfa_offset 16
    leaq    .LC0(%rip), %rdi
    call    _ZN2std2io5print5_${{impl}}17h1a2b3c4d5e6f7g8hE
    xor     eax, eax
    addq    $8, %rsp
    .cfi_def_cfa_offset 8
    .ret
    .cfi_endproc
```
*Note*: The symbol name is Rust’s mangled form for `std::io::_print`. The same stack‑alignment pattern appears.

**3. Assembly to Object** (`rustc -C opt-level=2 -C debuginfo=0 -o hello.o --crate-type rlib hello.rs`):
```bash
$ readelf -S hello.o
Section Headers:
  [Nr] Name              Type            Addr     Off    Size   ES Flg Lk Inf Al
  [1] .text             PROGBITS        00000000 000040 000030 00  AX  0   0  4
  [2] .rodata           PROGBITS        00000000 000070 00000e 00  A  0   0  4
  [3] .eh_frame         PROGBITS        00000000 000080 000028 00  A  0   0  4
```
Similar layout to the C++ object.

**4. Linking** (`rustc -C opt-level=2 -o hello hello.rs`):
```bash
$ ldd hello
        linux-vdso.so.1 (0x00007ffd9c7f8000)
        librustc.so.62 => /lib/x86_64-linux-gnu/librustc.so.62 (0x00007f9b8d5c0000)
        libgcc_s.so.1 => /lib/x86_64-linux-gnu/libgcc_s.so.1 (0x00007f9b8d3b0000)
        libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f9b8d0d0000)
        /lib64/ld-linux-x86-64.so.6 (0x00007f9b8d880000)
```
The Rust runtime (`librustc.so`) provides the equivalent of libstdc++ for I/O.  
**Runtime check** (`strace -e write ./hello`):
```bash
write(1, "Hello, World!\n", 14) = 14
```
Both languages end up performing the same system call; the difference lies in how the language runtime prepares the arguments.

---

## Common Mistakes (with Root Causes)

| Mistake | What’s Wrong | Why It Happens (Underlying Mechanism) |
|---------|--------------|----------------------------------------|
| **Signed integer overflow** (`int x = INT_MAX; x + 1;`) | Undefined behavior in C++; may wrap, trap, or be optimized away. | The C++ standard permits the compiler to assume overflow never occurs, enabling optimizations like `-fwrapv` removal. Rust catches this in debug builds (`panic!`) and defines two’s‑complement wrap in release (`wrapping_add`). |
| **Dangling reference after moving a `std::unique_ptr`** | Using the moved‑from pointer leads to use‑after‑free. | Move semantics transfer ownership; the source object’s internal pointer is set to `nullptr`. Accessing it dereferences null → segfault. Rust’s borrow checker prevents this at compile time (`use of moved value`). |
| **Incorrect `extern "C"` on a C++ function called from C** | Linker error or wrong calling convention. | Without `extern "C"`, C++ name mangling creates a symbol like `_Z7foovi`. The C compiler expects a plain `foo`. Mismatch → unresolved symbol. |
| **Assuming struct layout without `#[repr(C)]` or `#pragma pack`** | Data sent over the network or passed to a syscall is misaligned. | The compiler may insert padding for performance; layout differs across compilers/options, breaking ABI compatibility with the kernel or hardware registers. |
| **Data race via unsynchronized `std::thread` writes** | Concurrent modification of the same non‑atomic variable yields torn values. | The C++ memory model allows reordering; without `std::atomic` or a mutex, two cores may cache different copies, leading to lost updates. Rust’s ownership model disallows concurrent mutable references unless wrapped in `Mutex`/`RwLock`. |
| **Failing to check return value of `open(2)`** | Using an invalid file descriptor leads to `EBADF` on subsequent `read/write`. | Syscalls return `-1` on error and set `errno`. Ignoring the result assumes success; subsequent I/O operates on `-1`, which the kernel treats as an invalid descriptor. |
| **Using `std::move` on a non‑move‑constructible type** | Compile‑time error or silent copy if fallback exists. | `std::move` merely casts to an rvalue reference; if the type lacks a move constructor, the compiler falls back to the copy constructor, possibly causing performance surprises. |
| **Misusing `volatile` for synchronization** | `volatile` prevents compiler optimizations but does not enforce atomicity or memory ordering. | On weakly ordered architectures (ARM, Power), a `volatile` load/store can still be reordered relative to other memory operations; proper synchronization needs `std::atomic` with appropriate memory order (`std::memory_order_acquire`, `release`). |
| **Linking a static library built with `-fPIC` into an executable** | Increases binary size unnecessarily and may cause duplicate symbol errors. | `-fPIC` generates position‑independent code via GOT indirection; when linked statically, those indirections remain, bloating the code. Use `-fno-PIC` for static linking unless the object is intended for a shared library. |
| **Assuming `sizeof(void*) == sizeof(size_t)` on all platforms** | Incorrect pointer arithmetic on ILP32 vs LP64 models. | On 32‑bit x86, both are 4 bytes; on 64‑bit x86‑64, pointers are 8 bytes while `size_t` remains 8 bytes, but on some embedded LP64 models pointers may be 4 bytes. Relying on this equality can break portability. |

Each mistake is tied to a concrete mechanism (UB, calling convention, layout rules, memory model) that explains *why* the error manifests, not just that it is wrong.

---

## Exercises
### Easy
1. **Inspect preprocessing output**  
   ```bash
   g++ -E -O0 -dD hello.cpp | head -30
   rustc --pretty=expanded -O0 hello.rs
   ```
   *Goal*: Identify where `#include <iostream>` expands and where the `println!` macro is expanded.

2. **Generate and compare assembly**  
   ```bash
   g++ -S -O2 -fverbose-asm -o hello_cpp.s hello.cpp
   rustc --emit asm -C opt-level=2 -o hello_rs.s hello.rs
   diff -u hello_cpp.s hello_rs.s | head -20
   ```
   *Goal*: Observe the identical stack‑alignment prologue and the different symbol names for the print routine.

3. **Run a program under `strace`**  
   ```bash
   strace -e trace=write ./hello_cpp ./hello_rs
   ```
   *Goal*: Verify both binaries invoke the same `write(2)` syscall.

### Medium
4. **Object‑file inspection**  
   ```bash
   g++ -c -O0 hello.cpp -o hello_cpp.o
   rustc -C opt-level=0 -C debuginfo=0 -o hello_rs.o --crate-type rlib hello.rs
   objdump -d -M intel hello_cpp.o
   objdump -d -M intel hello_rs.o
   nm hello_cpp.o
   nm hello_rs.o
   ```
   *Goal*: Locate the `main` symbol, note the `.text` size, and identify relocation entries (`R_X86_64_PC32`, `R_X86_64_PLT32`).

5. **Link with a static library**  
   ```bash
   # Create a tiny static library
   echo "int foo() { return 42; }" > foo.cpp
   g++ -c foo.cpp -o foo.o
   ar rcs libfoo.a foo.o
   # Link against it
   g++ hello.cpp -L. -lfoo -o hello_with_lib
   ./hello_with_lib
   ```
   *Goal*: See how the linker pulls in `foo.o` and resolves the symbol.

### Hard
6. **Build and use a shared library with explicit PLT/GOT inspection**  
   ```bash
   # Shared library source
   echo "extern \"C\" int answer() { return 42; }" > ans.cpp
   g++ -fPIC -shared -o libans.so ans.cpp
   # Main program that calls it
   echo "
   extern
