---
id: 72
title: "Build systems"
part: "VI"
supermoduleId: 6
estimatedMinutes: 50
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
# Build systems

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Build systems** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 4 interconnected topics: Make, dependency graphs, reproducible builds, cross-compilation. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### Make

**Make** is a foundational concept within build systems. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding Make allows you to reason about system behavior rather than treating it as a black box.

### Dependency graphs

**Dependency graphs** is a foundational concept within build systems. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding dependency graphs allows you to reason about system behavior rather than treating it as a black box.

### Reproducible builds

**Reproducible builds** is a foundational concept within build systems. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding reproducible builds allows you to reason about system behavior rather than treating it as a black box.

### Cross-compilation

**Cross-compilation** is a foundational concept within build systems. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding cross-compilation allows you to reason about system behavior rather than treating it as a black box.

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

- **Make** — understand this deeply and the rest of build systems follows naturally.
- **Dependency graphs** — understand this deeply and the rest of build systems follows naturally.
- **Reproducible builds** — understand this deeply and the rest of build systems follows naturally.
- **Cross-compilation** — understand this deeply and the rest of build systems follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Debug info and tooling**, builds directly on these ideas. DWARF intuition and Symbol tables extend what you've learned here into debug info and tooling.
