---
id: 64
title: "C language at systems depth"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Why This Matters

C is a contract between the programmer and the compiler, written in terms of an *abstract machine*. That contract specifies exactly when objects exist, what their values are, and when reading them produces defined behavior. Violate the contract and the compiler is not obligated to produce code that matches your intent — it may silently delete your null-pointer check because it already proved the pointer cannot be null along that path, reorder your memory writes because no `volatile` or barrier prevents it, or recycle a stack frame while a pointer still aliases into it. These are not theoretical edge cases. The Linux kernel uses `-fno-strict-aliasing` precisely because kernel code performs type-punning that the standard forbids, and the compiler would miscompile it otherwise. Every allocator, driver, and lock-free data structure you write depends on understanding this contract exactly.

---

## Core Concepts

### The Abstract Machine and Storage Duration

The C standard defines behavior in terms of an *abstract machine* — a conceptual executor with infinite precision, sequential execution, and a flat address space. Real compilers are permitted to deviate from the abstract machine's execution order in any way that preserves *observable behavior*: writes to `volatile` objects, I/O operations, and the final values of returned objects. Every other reordering or elimination is legal. This is the formal basis for why undefined behavior is so dangerous: UB removes the constraint that compiled code must match the abstract machine at all, so the compiler can assume UB never occurs and optimize accordingly.

Every object has a **storage duration** that controls when its storage is reserved and released:

| Duration | Context | Lifetime | Typical segment |
|---|---|---|---|
| Static | `static` keyword or file scope | Entire program run | `.data` (initialized), `.bss` (zero-init) |
| Automatic | Local variable, no `static` | Enclosing block | Stack frame |
| Allocated | `malloc` / `free` | Between those two calls | Heap |
| Thread | `_Thread_local` | Thread creation to exit | Thread-local storage (TLS) |

The segment column is an implementation detail, not a language guarantee — but it holds universally on Linux ELF targets and is what `size(1)` reports.

```bash
# Inspect storage layout of a compiled binary
size ./a.out
# text    data     bss     dec     hex filename
# 2048     600      32    2680     a78 ./a.out

# See symbol storage classes: 'B' = BSS, 'D' = data, 'T' = text
nm ./a.out | grep -E '^[0-9a-f]+ [BDT]'
```

### Pointers: Values That Name Addresses

A pointer holds a virtual address in the process's address space plus a *type* that tells the compiler the size of the referent and the stride for arithmetic. The type is erased at runtime — `int *` and `double *` are both a 64-bit integer at the machine level on x86-64. The compiler uses the type at compile time to:

1. Scale pointer arithmetic: `p + n` compiles to `address(p) + n * sizeof(*p)`.
2. Enforce aliasing rules (see §Undefined Behavior).
3. Select the correct load/store instruction width.

Pointer arithmetic is defined only *within* a single array object, and at most one element past its end. Arithmetic that crosses object boundaries is undefined behavior even when the addresses are physically adjacent, because the compiler is allowed to lay out objects in any order and to use the UB assumption for optimization.

```c
int a[4], b[4];
int *p = &a[4];       // valid to form; one-past-end
int *q = &b[0];
ptrdiff_t d = q - p;  // UB: distinct objects, despite likely adjacency
```

The one-past-end rule exists so that the standard loop idiom `for (p = arr; p < arr + N; p++)` is valid: `arr + N` is a legitimate pointer to compare against, but must never be dereferenced.

On x86-64 Linux, all user-space pointers are 64 bits wide but the current canonical address space uses only 48 bits. Addresses in the range $[0,\ 2^{47})$ are user space; $[2^{63} - 2^{47},\ 2^{64})$ are kernel space. Attempting to dereference a kernel address from user space raises `SIGSEGV`.

$$\text{user virtual address space} = [0,\ 2^{47}) \approx 128\ \text{TiB}$$

### Arrays Are Not Pointers

An array designator *decays* to a pointer to its first element in almost every expression context. The decay is implicit and silent, which is the source of most confusion. The critical point is that an array *is not* a pointer — it is a contiguous sequence of elements with a fixed size known to the compiler.

```c
int arr[8];
int *p = arr;        // decay: p == &arr[0]
sizeof(arr);         // 32  (8 × sizeof(int)) — no decay
sizeof(p);           // 8   (pointer width on x86-64) — no array info
_Alignof(arr);       // alignment of int, not of a pointer
```

The four contexts where decay does *not* occur: `sizeof`, `_Alignof`, unary `&`, and string literal initialization of a `char[]`. In every other context — function arguments, arithmetic, assignments — the array silently becomes a pointer and its size information is lost. This is why C has no bounds-checked array passing; the callee receives only an address.

```c
void f(int buf[8]) { /* buf decays to int*; sizeof(buf)==8, not 32 */ }
```

### Structs, Alignment, and Padding

A struct is a contiguous block of storage holding named members in declaration order. The compiler inserts *padding* bytes — bytes with no corresponding member — to ensure each member starts at an address satisfying its alignment requirement. This requirement exists because hardware memory buses are often word-aligned: a misaligned 4-byte load may require two bus transactions and, on some architectures (ARMv6 without `SCTLR.A` clear), causes a fault.

The alignment requirement of a type $T$, written $\text{align}(T)$, is the smallest power of two $a$ such that every object of type $T$ must reside at an address $\equiv 0 \pmod{a}$. On x86-64 Linux with the System V ABI:

$$\text{align}(\texttt{char}) = 1,\quad \text{align}(\texttt{int}) = 4,\quad \text{align}(\texttt{double}) = 8,\quad \text{align}(\texttt{pointer}) = 8$$

The size of a struct must itself be a multiple of its alignment (the maximum alignment of any member), so that arrays of structs keep each element correctly aligned.

```c
struct Unordered {
    char   c;  // offset  0, size 1
               // 3 bytes padding (align int to 4)
    int    i;  // offset  4, size 4
    char   d;  // offset  8, size 1
               // 7 bytes padding (align double to 8)
    double x;  // offset 16, size 8
};             // sizeof == 24; align == 8

struct Packed {
    double x;  // offset  0, size 8
    int    i;  // offset  8, size 4
    char   c;  // offset 12, size 1
    char   d;  // offset 13, size 1
               // 2 bytes padding (pad to multiple of align(double)=8)
};             // sizeof == 16; align == 8  — 8 bytes saved
```

Reorder members by descending alignment to minimize padding. Verify with `offsetof` and `sizeof` at compile time:

```c
#include <stddef.h>
_Static_assert(offsetof(struct Packed, i) == 8, "layout changed");
_Static_assert(sizeof(struct Packed) == 16,     "size changed");
```

```bash
# Dump struct layout using pahole (from dwarves package)
gcc -g -c struct_example.c
pahole struct_example.o
```

The kernel uses `pahole` extensively during builds (`scripts/pahole-flags.sh`) to report and minimize struct padding in hot data structures like `struct task_struct`.

### Unions: Overlapping Storage

A union allocates storage large enough for its largest member; all members share that storage starting at offset 0. The size of a union is therefore:

$$\text{sizeof}(\text{union}\ U) = \max_{m \in U}\bigl(\text{sizeof}(m)\bigr),\ \text{rounded up to}\ \text{align}(U)$$

Only the last-written member has a defined value in C++. In C, reading a member other than the last-written one is defined when the members share a *common initial sequence* — corresponding members up to the point of divergence have compatible types and the same alignment. The canonical use case is type-punning to inspect the bit representation of a float:

```c
#include <stdint.h>
#include <stdio.h>

union FloatBits {
    float    f;
    uint32_t u;
};

union FloatBits fb = { .f = -0.15625f };
printf("bits: %08x\n", fb.u);
// sign=1 exp=01111011 mantissa=01000000000000000000000 → bf200000
```

This is defined in C11 (§6.5.2.3¶3 footnote 95) and is the correct way to inspect floating-point bit patterns. The equivalent with a cast (`*(uint32_t *)&f`) violates strict aliasing. In the kernel, `union`s appear in `include/uapi/linux/if_ether.h`, `include/linux/ip.h`, and dozens of hardware descriptor structures.

### Undefined Behavior

UB is the standard's mechanism for granting the compiler permission to assume certain conditions never hold, enabling optimizations that would otherwise require proving the condition globally. When a program does trigger UB, it is not that the standard specifies a crash — the standard specifies *nothing*, including no requirement that prior non-UB operations have their
