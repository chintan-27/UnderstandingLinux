---
id: 65
title: "Other systems languages"
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
# Other systems languages

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Other systems languages** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 3 interconnected topics: C++, Rust basics in systems context, ABI interaction. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### C++

**C++** is a foundational concept within other systems languages. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding C++ allows you to reason about system behavior rather than treating it as a black box.

### Rust basics in systems context

**Rust basics in systems context** is a foundational concept within other systems languages. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding Rust basics in systems context allows you to reason about system behavior rather than treating it as a black box.

### ABI interaction

**ABI interaction** is a foundational concept within other systems languages. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding ABI interaction allows you to reason about system behavior rather than treating it as a black box.

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

- **C++** — understand this deeply and the rest of other systems languages follows naturally.
- **Rust basics in systems context** — understand this deeply and the rest of other systems languages follows naturally.
- **ABI interaction** — understand this deeply and the rest of other systems languages follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Assemblers and object generation**, builds directly on these ideas. Symbols and Relocation extend what you've learned here into assemblers and object generation.
