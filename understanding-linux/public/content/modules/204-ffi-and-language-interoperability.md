---
id: 204
title: "FFI and language interoperability"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When a Python script calls a C library, when a Rust binary links against `glibc`, or when a JVM invokes a native method, the programs involved were compiled by different compilers with different memory models and type systems. Without a shared contract governing how function arguments are passed, where return values live, and who is responsible for cleaning up the stack, the call produces garbage or a segfault. That contract is the **calling convention**, and the mechanism that makes separately-compiled code findable at runtime is the **shared library symbol interface**.

The failure modes are subtle: a struct passed by value across an FFI boundary may be silently read from the wrong register because the two sides disagree on whether the struct fits in two eightbytes. The program compiles, links, and runs — and returns wrong answers only for structs larger than 16 bytes. These bugs appear in production under specific argument sizes and are nearly impossible to diagnose without knowing the ABI rules precisely.

---

## Core Concepts

### Calling Conventions

A calling convention is a binary-level protocol that specifies:
- Which registers carry the first $N$ integer arguments
- Which registers carry floating-point arguments
- Who (caller or callee) restores the stack pointer after the call
- Where the return value lives
- Which registers the callee may destroy without saving (*caller-saved*), and which it must restore (*callee-saved*)

On x86-64 Linux, the System V AMD64 ABI governs this. The first six integer/pointer arguments go in `rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9`. The return value lands in `rax`. Floating-point arguments use `xmm0`–`xmm7` independently — a function signature like `f(int, double, int)` passes the first `int` in `rdi`, the `double` in `xmm0`, and the second `int` in `rsi`. The integer and FP register sequences are consumed independently.

This is not arbitrary: register passing eliminates memory traffic for the common case. A call to a function with six or fewer integer arguments involves zero stack stores for the arguments themselves — the CPU never touches the cache for argument passing at all.

Arguments beyond the sixth integer (or eighth FP) spill onto the stack in right-to-left order, so the first spilled argument is at the lowest address. Right-to-left ordering exists so that variadic functions like `printf` can find argument $n$ at a fixed positive offset from the known start of the spill region, without needing to know the total argument count in advance.

The caller/callee-saved split exists to minimize push/pop pairs. The callee may destroy `rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8`–`r11` — these are caller-saved, meaning the caller must spill them before the call if it needs them afterward. The callee *must* restore `rbx`, `rbp`, `r12`–`r15` if it uses them. The compiler assigns long-lived loop variables to callee-saved registers precisely so they survive calls without being spilled and reloaded.

### The ABI vs. the API

An **API** is a source-level contract: function signatures, types, header files. An **ABI** is the compiled binary contract: register assignments, struct layout, name mangling, vtable offsets. A library can break its ABI without changing its API.

The canonical example: inserting a field into the middle of a struct in a header.

```c
// v1 header
struct Stat { int mode; int uid; long size; };

// v2 header — new field inserted before uid
struct Stat { int mode; int flags; int uid; long size; };
```

Code compiled against v1 reads `uid` at offset `+4`. Code compiled against v2 finds `uid` at offset `+8`. Both compile cleanly. At runtime, the v1 binary reads `flags` and interprets it as a UID. This is a silent ABI break — no linker error, no warning.

### Shared Libraries and the Symbol Interface

A shared library (`.so` file) exposes named symbols — functions and global variables — resolvable at load time or on first call. The **symbol interface** is the set of exported names, their types, their symbol versions, and their addresses relative to the load base. The dynamic linker (`/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`) walks the `.dynsym` section of each loaded `.so` to resolve references before `main()` runs.

The `.dynsym` section contains only exported/imported symbols. The full `.symtab` section (present in unstripped binaries) contains all symbols including static ones. Stripping a binary removes `.symtab` but cannot remove `.dynsym` — those symbols must remain visible for the dynamic linker.

### Name Mangling

C exports symbols with their literal names: `foo` becomes `foo`. C++ must encode the full signature into the symbol name to support overloading. Under the Itanium C++ ABI (used on Linux), `void ns::Foo::bar(int, double)` becomes `_ZN2ns3Foo3barEid`. The encoding is deterministic: `_Z` prefix, `N...E` for namespaces/classes, type codes (`i` = int, `d` = double). This means two C++ compilers implementing the same ABI produce identical mangled names and can link against each other's output.

Calling a C++ function from C requires `extern "C"` on the C++ side to suppress mangling:

```cpp
// mylib.cpp
extern "C" void process(int x) {   // exported as "process", not "_Z7processi"
    // ...
}
```

Without `extern "C"`, the C linker looks for `process` and finds nothing. The link fails with `undefined reference to 'process'`. This is the *good* failure mode — the alternative is accidentally linking to a symbol with the right name but wrong type, which silently passes garbage.

---

## How It Works

### Stack Frame Layout at a Call Boundary

When `caller` calls `callee(a, b, c, d, e, f, g)` under the System V AMD64 ABI, arguments $a$ through $f$ travel in registers, and $g$ spills to the stack:

```
High addresses
  [caller frame]
  [g]            <- rsp + 8  after CALL  (7th arg)
  [return addr]  <- rsp                  (pushed by CALL)
Low addresses

Registers on entry to callee:
  rdi = a,  rsi = b,  rdx = c
  rcx = d,  r8  = e,  r9  = f
```

The 16-byte stack alignment rule: `rsp` must be 16-byte aligned at the moment of the `CALL` instruction (i.e., before `CALL` pushes the return address). Since `CALL` pushes 8 bytes, `rsp` inside the callee satisfies:

$$\text{rsp} \equiv -8 \pmod{16}$$

The callee restores alignment by pushing `rbp` (8 bytes), making `rsp` divisible by 16 before any `CALL` it issues. This matters because SSE/AVX instructions that operate on memory (`movaps`, `vmovdqa`) require 16- or 32-byte-aligned addresses. A misaligned `rsp` at a nested call causes a `#GP` fault inside a library you didn't write.

For a function that pushes $k$ callee-saved registers plus a local frame of $n$ bytes, the total prologue adjustment is:

$$\Delta_\text{rsp} = 8k + n + \text{pad}$$

where $\text{pad}$ is chosen so that $\Delta_\text{rsp} \equiv 0 \pmod{16}$ after accounting for the 8-byte return address already on the stack.

### How the Dynamic Linker Resolves Symbols

Position-independent code cannot embed the absolute address of an external function — the `.so` loads at a random base address chosen by ASLR. Instead, calls go through two indirection tables:

- **GOT** (Global Offset Table, `.got.plt`): an array of 8-byte pointers, one per external symbol, writable at runtime.
- **PLT** (Procedure Linkage Table, `.plt`): a read-only array of stubs, one per external symbol.

On the first call to `foo`:

```
call foo@plt
  → PLT[foo]:  jmp *GOT[foo]      ; GOT[foo] initially points back into PLT
  → PLT[0]:    push link_map       ; push identity of this .so
                jmp _dl_runtime_resolve
  → linker resolves foo's address, patches GOT[foo]
  → foo() runs
```

On every subsequent call:

```
call foo@plt
  → PLT[foo]:  jmp *GOT[foo]      ; GOT[foo] now points directly to foo
  → foo() runs immediately
```

This is **lazy binding**. The first-call overhead is the linker's hash table lookup plus one `mprotect`-free write to the GOT. The steady-state overhead is exactly one extra indirect jump through a register — typically one additional cycle on a modern out-of-order CPU.

The memory cost per external symbol is:

$$\text{cost} = \underbrace{8\ \text{bytes}}_{\text{GOT entry}} + \underbrace{16\ \text{bytes}}_{\text{PLT stub}} = 24\ \text{bytes}$$

You can disable lazy binding with `LD_BIND_NOW=1` or the `-z now` linker flag, which resolves all symbols at load time. This trades startup latency for elimination of the PLT indirection entirely — the GOT is patched before `main()` and then the `.got.plt` section can be remapped read-only (`RELRO`), closing a class of GOT-overwrite exploits.

### Struct Passing and the Eightbyte Classification

The System V AMD64 ABI classifies each 8-byte chunk ("eightbyte") of a struct independently:

- If all bytes in the eightbyte are integers or pointers → class `INTEGER`, passed in the next available integer register.
- If any byte is a floating-point field and no integer field shares the eightbyte → class `SSE`, passed in the next `xmm
