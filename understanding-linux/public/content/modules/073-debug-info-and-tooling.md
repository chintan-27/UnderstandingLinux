---
id: 73
title: "Debug info and tooling"
part: "VI"
supermoduleId: 6
estimatedMinutes: 45
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
# Debug info and tooling

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Debug info and tooling** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 3 interconnected topics: DWARF intuition, symbol tables, stack unwinding. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### DWARF intuition

**DWARF intuition** is a foundational concept within debug info and tooling. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding DWARF intuition allows you to reason about system behavior rather than treating it as a black box.

### Symbol tables

**Symbol tables** is a foundational concept within debug info and tooling. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding symbol tables allows you to reason about system behavior rather than treating it as a black box.

### Stack unwinding

**Stack unwinding** is a foundational concept within debug info and tooling. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding stack unwinding allows you to reason about system behavior rather than treating it as a black box.

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

- **DWARF intuition** — understand this deeply and the rest of debug info and tooling follows naturally.
- **Symbol tables** — understand this deeply and the rest of debug info and tooling follows naturally.
- **Stack unwinding** — understand this deeply and the rest of debug info and tooling follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **What an OS does**, builds directly on these ideas. Abstraction and Resource management extend what you've learned here into what an os does.
