---
id: 215
title: "Reading specifications and standards"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When a syscall returns an unexpected value, when two binaries refuse to link, or when a performance counter reports a number that contradicts your mental model, the question is always the same: *what is the actual contract?* Blog posts describe what usually happens. Specifications describe what must happen. The difference matters when you are debugging at the boundary between components — between compiler and kernel, between kernel and hardware, between your code and someone else's — because each component was written by a different team that trusted the specification, not your intuition.

## Core Concepts

### RFCs (Request for Comments)

RFCs define Internet protocols at the level of individual bits: frame formats, state machine transitions, timer values, and error codes. RFC 2119 defines the compliance vocabulary that every subsequent RFC uses. "MUST" means a hard requirement whose violation makes an implementation non-compliant. "SHOULD" means a strong recommendation whose violation requires documented justification. "MAY" means genuinely optional behavior.

This matters in practice because interoperability failures are almost always a MUST violation by one party. When `tcpdump` shows a retransmit loop and you cannot tell which side is wrong, the RFC's state machine diagram is the arbiter. Without it, you are guessing.

The RFC index lives at [rfc-editor.org](https://www.rfc-editor.org/). For any protocol you interact with at the socket level — TCP, TLS, DNS, HTTP — the relevant RFC is findable in under a minute and is more accurate than any secondary source.

### ABI Documents

An ABI is the machine-level contract that lets separately compiled code interoperate. It specifies:

- **Calling convention**: which registers carry arguments and return values, in what order
- **Callee-saved vs. caller-saved registers**: who is responsible for preserving which registers across a call
- **Stack alignment**: what alignment the stack pointer must have at a call site
- **Struct layout**: padding, alignment, and field ordering rules

On x86-64 Linux, the governing document is the *System V AMD64 ABI*. The first six integer/pointer arguments go in `rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9`. Floating-point arguments go in `xmm0`–`xmm7`. The callee must preserve `rbx`, `rbp`, `r12`–`r15`. The stack pointer must be 16-byte aligned immediately before a `call` instruction.

These rules are not suggestions. The C compiler, the kernel's syscall entry path, and every shared library are compiled against the same ABI document. If your hand-written assembly or JIT-compiled code violates any rule, the callee reads garbage from the wrong register, and the failure is silent.

### Architecture Manuals

CPU vendors publish the ground truth for instruction semantics, memory ordering, cache behavior, and hardware performance counters.

- **Intel Software Developer's Manual (SDM)**: three logical volumes covering basic architecture, the full instruction set reference, and system programming (paging, interrupts, MSRs, virtualization)
- **AMD Architecture Programmer's Manual**: equivalent coverage for AMD processors; AMD also publishes per-family register references (e.g., Family 17h for Zen) that document the exact MSR offsets and bit fields for that microarchitecture

When you need to know what a memory fence *actually* guarantees, which MSR enables a hardware feature, or what a performance counter precisely measures (not approximately measures), these manuals are the only source. Every other resource is a summary of them.

### Vendor Docs Beyond the CPU

Storage controllers, NICs, and PCIe devices each have their own behavioral contracts. A disk's write cache flush behavior, a NIC's interrupt coalescing parameters, and a DMA engine's alignment requirements are specified in vendor datasheets and programmer's guides — not in Linux kernel comments, which describe the *driver's* interpretation of those documents. When you are tuning at the hardware layer, the vendor doc is the only source that distinguishes "this parameter does X" from "this parameter appears to do X on the hardware I tested."

## How It Works

### How an ABI Governs a Function Call

Consider:

```c
ssize_t result = read(fd, buf, count);
```

The compiler lowers this to a syscall sequence. For Linux x86-64, `read(2)` is syscall number 0:

```asm
mov     rdi, [fd]       ; 1st argument: file descriptor
mov     rsi, [buf]      ; 2nd argument: buffer pointer
mov     rdx, [count]    ; 3rd argument: byte count
mov     rax, 0          ; syscall number: read(2) = 0
syscall                 ; trap to kernel
; on return: rax holds the return value (bytes read, or -errno)
```

The syscall ABI is *distinct* from the function-call ABI. Syscalls use `rax` for the number, and the fourth argument register is `r10` instead of `rcx` (because `syscall` itself clobbers `rcx` with the return address). This is documented in `man 2 syscall` under the register table, and in `arch/x86/entry/entry_64.S` in the kernel source.

The full register map:

| Argument | Function call ABI | Syscall ABI |
|----------|------------------|-------------|
| 1st      | `rdi`            | `rdi`       |
| 2nd      | `rsi`            | `rsi`       |
| 3rd      | `rdx`            | `rdx`       |
| 4th      | `rcx`            | `r10`       |
| 5th      | `r8`             | `r8`        |
| 6th      | `r9`             | `r9`        |
| number   | —                | `rax`       |
| return   | `rax`            | `rax`       |

This difference is why you cannot call a syscall directly with `call` — the two ABIs differ at argument 4.

### Memory Alignment and the ABI

The ABI specifies that a type must be aligned to its own size: a `uint32_t` to a 4-byte boundary, a `uint64_t` to an 8-byte boundary. The reason is cache-line geometry.

A cache line on x86-64 is 64 bytes. Given a value of size $s$ bytes starting at byte offset $o$ within a page, the number of cache lines it touches is:

$$\text{lines} = \left\lfloor \frac{o + s - 1}{64} \right\rfloor - \left\lfloor \frac{o}{64} \right\rfloor + 1$$

For a correctly aligned 8-byte value, $o \bmod 8 = 0$, and this evaluates to 1. For a worst-case misaligned 8-byte value where $o = 63$, bytes 63 and 64–70 span two cache lines, so it evaluates to 2. That second cache-line fetch doubles the memory bus traffic for that access, and under high load the effect is measurable.

On ARM, misalignment on naturally-aligned accesses can raise a `SIGBUS`. On x86-64, it silently costs performance — which makes it harder to detect and easier to ignore until benchmarking reveals it.

You can observe alignment in a C struct with:

```c
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

struct example {
    uint8_t  a;       // offset 0
    // 7 bytes padding here
    uint64_t b;       // offset 8
    uint32_t c;       // offset 16
    // 4 bytes padding here
    uint64_t d;       // offset 24
};

int main(void) {
    printf("offsetof(b) = %zu\n", offsetof(struct example, b));  // 8
    printf("offsetof(c) = %zu\n", offsetof(struct example, c));  // 16
    printf("offsetof(d) = %zu\n", offsetof(struct example, d));  // 24
    printf("sizeof      = %zu\n", sizeof(struct example));        // 32
    return 0;
}
```

The padding is inserted by the compiler to satisfy ABI alignment requirements, not for any aesthetic reason. When you share a struct across the kernel–userspace boundary (as with `ioctl` or `ptrace`), both sides must agree on this layout — which is why those interfaces are ABI-stable and why changing them breaks existing binaries.

### Physical vs. Virtual Address Space: Reading the SDM on PAE

PAE (Physical Address Extension) is a concrete example of a feature that is only fully understood by reading the Intel SDM directly.

Without PAE, a 32-bit processor uses two-level paging with 32-bit page table entries. The physical address bus is 32 bits, so the addressable physical memory is:

$$2^{32} \text{ bytes} = 4 \text{ GiB}$$

With PAE enabled, the processor switches to three-level paging with 64-bit page table entries (PDPTE → PDE → PTE). The physical address field in those entries is 36 bits, so:

$$2^{36} \text{ bytes} = 64 \text{ GiB}$$

The SDM specifies the exact bit fields: CR4 bit 5 (`PAE`) enables the mode; CR0 bit 31 (`PG`) enables paging; the three-level structure uses a 4-entry Page Directory Pointer Table at the address in CR3. Each PDPTE is 64 bits wide: bits 51:12 hold the physical address of a Page Directory, bits 11:9 are available to the OS, bit 0 is the Present flag.

The constraint documented in the SDM that blog posts routinely omit: PAE expands *physical* address space, not *virtual*. A single 32-bit process still has a $2^{32}$ byte virtual address space. The OS gains the ability to place different processes in different 4 GiB physical windows, but no individual process sees more than 4 GiB of virtual address space. The SDM Volume 3, Chapter 4 ("Paging") is where this is stated precisely.

### Navigating Intel's SDM

The SDM is organized as:

- **Volume 1**: Data types, register set, execution environment overview — useful for orientation,
