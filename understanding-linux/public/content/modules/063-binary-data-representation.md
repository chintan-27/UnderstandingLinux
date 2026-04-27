---
id: 63
title: "Binary data representation"
part: "VI"
supermoduleId: 6
estimatedMinutes: 60
resources:
  - type: book
    title: "The C Programming Language (K&R)"
    url: "https://www.cs.princeton.edu/~bwk/cbook.html"
  - type: article
    title: "Compiler Explorer (Godbolt)"
    url: "https://godbolt.org/"
  - type: book
    title: "Linkers and Loaders (John Levine)"
    url: "https://www.iecc.com/linker/"
---
# Binary data representation

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Binary data representation** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 6 interconnected topics: bits, bytes, endianness, two’s complement, fixed point, IEEE floating point. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### Bits

**Bits** is a foundational concept within binary data representation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding bits allows you to reason about system behavior rather than treating it as a black box.

### Bytes

**Bytes** is a foundational concept within binary data representation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding bytes allows you to reason about system behavior rather than treating it as a black box.

### Endianness

**Endianness** is a foundational concept within binary data representation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding endianness allows you to reason about system behavior rather than treating it as a black box.

### Two’s complement

**Two’s complement** is a foundational concept within binary data representation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding two’s complement allows you to reason about system behavior rather than treating it as a black box.

### Fixed point

**Fixed point** is a foundational concept within binary data representation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding fixed point allows you to reason about system behavior rather than treating it as a black box.

### IEEE floating point

**IEEE floating point** is a foundational concept within binary data representation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding IEEE floating point allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```c
#include <stdio.h>

// Undefined behavior: signed integer overflow
int ub_example(int x) {
    // The compiler may ASSUME this never overflows
    // and optimize based on that assumption
    return x + 1 > x;  // compiler can return 1 always
}

int main(void) {
    printf("%d\n", ub_example(2147483647)); // UB!
    return 0;
}
```

## Key Insights

- **Bits** — understand this deeply and the rest of binary data representation follows naturally.
- **Bytes** — understand this deeply and the rest of binary data representation follows naturally.
- **Endianness** — understand this deeply and the rest of binary data representation follows naturally.
- **Two’s complement** — understand this deeply and the rest of binary data representation follows naturally.
- **Fixed point** — understand this deeply and the rest of binary data representation follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **C language at systems depth**, builds directly on these ideas. Memory model and Storage duration extend what you've learned here into c language at systems depth.
