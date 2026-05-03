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

## Why This Matters

When you link a Rust library into a C program, or call a Linux syscall wrapper from C++, the compiler cannot protect you — the ABI is the only contract that keeps the program from corrupting the stack or misinterpreting return values. The ABI specifies which registers carry which arguments, how structs are laid out in memory, and how symbol names appear in object files. Violate it and you get silent data corruption or a segfault with a call stack that points nowhere useful. This module explains what the ABI actually specifies, why C++/Rust make the choices they do when crossing language boundaries, and how to verify those choices with real tools.

---

## Core Concepts

### The System V AMD64 ABI: What It Actually Specifies

On x86-64 Linux, the **System V AMD64 ABI** governs every cross-language call boundary. It defines four things that matter here:

**1. Argument passing.** Integer and pointer arguments are assigned to registers in order:

$$\text{rdi},\ \text{rsi},\ \text{rdx},\ \text{rcx},\ \text{r8},\ \text{r9}$$

Arguments beyond the sixth spill to the stack in right-to-left order. Floating-point arguments use `xmm0`–`xmm7` independently of the integer registers, so a function `f(int, double, int)` places the first `int` in `rdi`, the `double` in `xmm0`, and the second `int` in `rsi` — the floating-point and integer register sets are allocated separately.

**2. Return values.** Integers and pointers return in `rax`; 128-bit values use `rax:rdx`. Structs small enough to fit in two registers are returned in `rax:rdx`; larger structs are returned by writing through a hidden pointer passed in `rdi` (shifting all other arguments right by one slot).

**3. Caller/callee-saved registers.** The callee may freely clobber `rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8`–`r11` (caller-saved). It must preserve `rbx`, `rbp`, `r12`–`r15` (callee-saved). Violate this and the caller silently reads garbage.

**4. Stack alignment.** Before a `call` instruction, `rsp` must be 16-byte aligned. The `call` itself pushes 8 bytes (the return address), so the stack is 16-byte aligned *inside* the callee after the standard prologue. SSE/AVX instructions that operate on aligned memory (`movaps`, `vmovaps`) fault if this is wrong — a common source of crashes when hand-writing assembly that calls into C.

### Name Mangling: Why It Exists and When It Breaks You

C++ encodes function signatures into symbol names so the linker can catch mismatched declarations. `int add(int, int)` becomes `_Z3addii`; `int add(float, float)` becomes `_Z3addff`. The encoding scheme is defined in the **Itanium C++ ABI**, which both GCC and Clang implement on Linux. You can decode any mangled name:

```bash
# Decode a mangled C++ symbol
echo '_Z3addii' | c++filt
# Output: add(int, int)

# See all mangled symbols in an object file
nm -C my_object.o          # -C demangles automatically
objdump -t my_object.o     # raw mangled names
```

Rust uses its own mangling scheme (historically ad hoc, now `v0` by default since Rust 1.37). A Rust function `fn compute(x: i32) -> i32` in crate `mylib` might appear as `_ZN6mylib7compute17h3f4e5a6b7c8d9e0fE`. The `h...` suffix is a hash of the full path — it changes across compiler versions, which is why Rust's internal ABI is explicitly unstable.

`extern "C"` suppresses mangling entirely: the symbol name in the object file is exactly the identifier in your source. This is the minimal requirement for C interop — same symbol name, same calling convention.

```cpp
// C++ calling POSIX — without extern "C", the linker searches for
// a mangled symbol like _Z6socketi and finds nothing in libc.so
extern "C" {
    int socket(int domain, int type, int protocol);
    ssize_t read(int fd, void *buf, size_t count);
    int close(int fd);
}
```

System headers already wrap their declarations in `extern "C"` when compiled as C++ — that's what the `#ifdef __cplusplus` guard in every libc header does. You only write it yourself when declaring functions from a C library that lacks a system-installed header.

### The Process Address Space and Where Languages Live In It

The virtual address space layout is fixed by the kernel's ELF loader and the dynamic linker (`/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`). Every process — regardless of source language — sees this structure:

```
High addresses  0xFFFFFFFFFFFFFFFF
┌───────────────────────────────────┐
│         kernel space              │  ← inaccessible; SIGSEGV on access
├───────────────────────────────────┤  ~0x7FFFFFFFFFFF
│         user stack                │  ← %rsp; grows ↓; default 8MB (ulimit -s)
│               ↓                   │
│         (unmapped guard)          │  ← catches stack overflow → SIGSEGV
│               ↑                   │
│         memory-mapped region      │  ← ld.so, libc.so.6, libstdc++.so.6,
│                                   │    libpthread.so.0, mmap() anonymous pages
│               ↑                   │
│         heap                      │  ← brk() / mmap(); malloc/new/Box::new
├───────────────────────────────────┤  brk (initially just above .bss)
│         .bss                      │  ← zero-initialized globals
│         .data                     │  ← initialized globals, thread-local storage
├───────────────────────────────────┤
│         .text / .rodata           │  ← executable code, string literals, vtables
└───────────────────────────────────┘  ~0x400000 (PIE binaries: randomized by ASLR)
```

With ASLR enabled (`/proc/sys/kernel/randomize_va_space` = 2), the stack base, mmap region, and heap start are randomized each execution. The `.text` base is randomized only for PIE (Position Independent Executables) — the default for binaries compiled with `-fpie` in modern GCC/Clang.

Inspect this live for any process:

```bash
# Show memory map of the current shell
cat /proc/self/maps

# Show map of a running process by PID with human-readable sizes
pmap -x $(pgrep firefox | head -1)

# Compile a minimal program and inspect its segments
gcc -O0 -g -o prog prog.c
readelf -l prog          # program headers: LOAD segments define the layout
size prog                # text/data/bss sizes
```

A Rust binary compiled with `cargo build --release` occupies the same segments. Rust's allocator (by default `jemalloc` in older versions, now the system allocator) calls `mmap` for large allocations and `brk` for small ones — the same interfaces libc's `malloc` uses.

The address of any symbol is computable from its section offset:

$$\text{runtime\_addr} = \text{load\_base} + \text{section\_vaddr} + \text{symbol\_offset}$$

For a non-PIE binary, `load_base = 0`, so the address in `readelf` output is the runtime address. For PIE, subtract the base from `readelf` output and add the ASLR-randomized load base (visible in `/proc/<pid>/maps`).

### C++: What Vtables Actually Are in Memory

A virtual function call is an indirect call through a pointer loaded from memory. When the compiler sees `obj->method()` and `method` is virtual, it emits roughly:

```asm
; obj is in rdi (first argument = this pointer)
mov    rax, [rdi]          ; load vtable pointer (first 8 bytes of obj)
call   [rax + 0x18]        ; call third virtual function (offset 3 * 8 = 24)
```

The vtable is a read-only array of function pointers in the `.rodata` section, one per class. The first entry is typically a pointer to the RTTI (runtime type information) struct; virtual function pointers follow. You can inspect vtables:

```bash
# Build with debug info, then look at the vtable symbol
g++ -O0 -g -o prog prog.cpp
nm -C prog | grep vtable
# Output: 0000000000404d20 V vtable for Derived

readelf -s prog | grep -i vtable
objdump -d prog | grep -A 10 '<_ZTV'   # _ZTV = vtable prefix
```

The offset of each virtual function in the vtable is fixed at compile time across all translation units — that's why changing a base class's virtual function order breaks the ABI and requires recompiling all callers. This is the core of the "fragile base class" problem and why shared libraries version their ABIs.

C++ exceptions add a parallel mechanism: the `.eh_frame` and `.gcc_except_table` sections encode stack unwinding information. When an exception propagates, the runtime (`libgcc_s.so.1` or `libunwind`) walks these tables to find catch blocks and call destructors — no scanning of the actual stack content occurs. This is why zero-cost exception handling is possible: the tables are consulted only when an exception is actually thrown.

### Rust: What `#[repr(C)]` and `#[no_mangle]` Actually Do

Rust's compiler is free to reorder struct fields, add padding, or change their representation for optimization. `#[repr(C)]` disables this and
