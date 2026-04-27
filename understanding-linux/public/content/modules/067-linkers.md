---
id: 67
title: "Linkers"
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
# Linkers

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Linkers** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 4 interconnected topics: static linking, dynamic linking, symbol resolution, GOT/PLT intuition. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### Static linking

**Static linking** is a foundational concept within linkers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding static linking allows you to reason about system behavior rather than treating it as a black box.

### Dynamic linking

**Dynamic linking** is a foundational concept within linkers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding dynamic linking allows you to reason about system behavior rather than treating it as a black box.

### Symbol resolution

**Symbol resolution** is a foundational concept within linkers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding symbol resolution allows you to reason about system behavior rather than treating it as a black box.

### GOT/PLT intuition

**GOT/PLT intuition** is a foundational concept within linkers. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding GOT/PLT intuition allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# Inspect an ELF binary
$ readelf -h /bin/ls          # ELF header
$ readelf -S /bin/ls          # section headers
$ readelf -l /bin/ls          # program headers (segments)
$ nm /usr/lib/libc.so.6       # symbol table
$ objdump -d /bin/ls | head   # disassembly

# Trace dynamic linking
$ LD_DEBUG=bindings ./my_program 2>&1 | head
```

## Key Insights

- **Static linking** — understand this deeply and the rest of linkers follows naturally.
- **Dynamic linking** — understand this deeply and the rest of linkers follows naturally.
- **Symbol resolution** — understand this deeply and the rest of linkers follows naturally.
- **GOT/PLT intuition** — understand this deeply and the rest of linkers follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Executable formats**, builds directly on these ideas. ELF sections and Segments extend what you've learned here into executable formats.
