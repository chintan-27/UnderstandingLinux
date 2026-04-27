---
id: 71
title: "Compiler optimizations"
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
# Compiler optimizations

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Compiler optimizations** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 4 interconnected topics: inlining, vectorization, alias analysis, loop optimizations. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### Inlining

**Inlining** is a foundational concept within compiler optimizations. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding inlining allows you to reason about system behavior rather than treating it as a black box.

### Vectorization

**Vectorization** is a foundational concept within compiler optimizations. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding vectorization allows you to reason about system behavior rather than treating it as a black box.

### Alias analysis

**Alias analysis** is a foundational concept within compiler optimizations. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding alias analysis allows you to reason about system behavior rather than treating it as a black box.

### Loop optimizations

**Loop optimizations** is a foundational concept within compiler optimizations. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding loop optimizations allows you to reason about system behavior rather than treating it as a black box.

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

- **Inlining** — understand this deeply and the rest of compiler optimizations follows naturally.
- **Vectorization** — understand this deeply and the rest of compiler optimizations follows naturally.
- **Alias analysis** — understand this deeply and the rest of compiler optimizations follows naturally.
- **Loop optimizations** — understand this deeply and the rest of compiler optimizations follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Build systems**, builds directly on these ideas. Make and Dependency graphs extend what you've learned here into build systems.
