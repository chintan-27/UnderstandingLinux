---
id: 70
title: "Compilers"
part: "VI"
supermoduleId: 6
estimatedMinutes: 55
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
# Compilers

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Compilers** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 5 interconnected topics: lexical analysis, parsing, IR, optimization, code generation. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### Lexical analysis

**Lexical analysis** is a foundational concept within compilers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding lexical analysis allows you to reason about system behavior rather than treating it as a black box.

### Parsing

**Parsing** is a foundational concept within compilers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding parsing allows you to reason about system behavior rather than treating it as a black box.

### IR

**IR** is a foundational concept within compilers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding IR allows you to reason about system behavior rather than treating it as a black box.

### Optimization

**Optimization** is a foundational concept within compilers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding optimization allows you to reason about system behavior rather than treating it as a black box.

### Code generation

**Code generation** is a foundational concept within compilers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding code generation allows you to reason about system behavior rather than treating it as a black box.

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

- **Lexical analysis** — understand this deeply and the rest of compilers follows naturally.
- **Parsing** — understand this deeply and the rest of compilers follows naturally.
- **IR** — understand this deeply and the rest of compilers follows naturally.
- **Optimization** — understand this deeply and the rest of compilers follows naturally.
- **Code generation** — understand this deeply and the rest of compilers follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Compiler optimizations**, builds directly on these ideas. Inlining and Vectorization extend what you've learned here into compiler optimizations.
