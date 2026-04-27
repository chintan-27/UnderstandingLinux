---
id: 64
title: "C language at systems depth"
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
# C language at systems depth

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**C language at systems depth** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 8 interconnected topics: memory model, storage duration, pointers, arrays, structs, unions, UB, volatile. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### Memory model

**Memory model** is a foundational concept within c language at systems depth. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding memory model allows you to reason about system behavior rather than treating it as a black box.

### Storage duration

**Storage duration** is a foundational concept within c language at systems depth. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding storage duration allows you to reason about system behavior rather than treating it as a black box.

### Pointers

**Pointers** is a foundational concept within c language at systems depth. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding pointers allows you to reason about system behavior rather than treating it as a black box.

### Arrays

**Arrays** is a foundational concept within c language at systems depth. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding arrays allows you to reason about system behavior rather than treating it as a black box.

### Structs

**Structs** is a foundational concept within c language at systems depth. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding structs allows you to reason about system behavior rather than treating it as a black box.

### Unions

**Unions** is a foundational concept within c language at systems depth. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding unions allows you to reason about system behavior rather than treating it as a black box.

### UB

**UB** is a foundational concept within c language at systems depth. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding UB allows you to reason about system behavior rather than treating it as a black box.

### Volatile

**Volatile** is a foundational concept within c language at systems depth. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding volatile allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```c
#include <stdio.h>
#include <stddef.h>

struct example {
    char  a;    // offset 0, 1 byte
    // 3 bytes padding
    int   b;    // offset 4, 4 bytes
    char  c;    // offset 8, 1 byte
    // 7 bytes padding
    long  d;    // offset 16, 8 bytes
};  // total: 24 bytes (not 14!)

int main(void) {
    printf("sizeof(struct example) = %zu\n",
           sizeof(struct example));  // 24
    printf("offsetof(b) = %zu\n",
           offsetof(struct example, b));  // 4
    return 0;
}
```

## Key Insights

- **Memory model** — understand this deeply and the rest of c language at systems depth follows naturally.
- **Storage duration** — understand this deeply and the rest of c language at systems depth follows naturally.
- **Pointers** — understand this deeply and the rest of c language at systems depth follows naturally.
- **Arrays** — understand this deeply and the rest of c language at systems depth follows naturally.
- **Structs** — understand this deeply and the rest of c language at systems depth follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Other systems languages**, builds directly on these ideas. C++ and Rust basics in systems context extend what you've learned here into other systems languages.
