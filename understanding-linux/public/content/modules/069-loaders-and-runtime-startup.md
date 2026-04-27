---
id: 69
title: "Loaders and runtime startup"
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
# Loaders and runtime startup

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Loaders and runtime startup** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 3 interconnected topics: process image, runtime initialization, dynamic loader. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### Process image

**Process image** is a foundational concept within loaders and runtime startup. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding process image allows you to reason about system behavior rather than treating it as a black box.

### Runtime initialization

**Runtime initialization** is a foundational concept within loaders and runtime startup. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding runtime initialization allows you to reason about system behavior rather than treating it as a black box.

### Dynamic loader

**Dynamic loader** is a foundational concept within loaders and runtime startup. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding dynamic loader allows you to reason about system behavior rather than treating it as a black box.

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

- **Process image** — understand this deeply and the rest of loaders and runtime startup follows naturally.
- **Runtime initialization** — understand this deeply and the rest of loaders and runtime startup follows naturally.
- **Dynamic loader** — understand this deeply and the rest of loaders and runtime startup follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Compilers**, builds directly on these ideas. Lexical analysis and Parsing extend what you've learned here into compilers.
