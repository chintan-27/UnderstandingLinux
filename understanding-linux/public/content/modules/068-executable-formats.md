---
id: 68
title: "Executable formats"
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
# Executable formats

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Executable formats** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 5 interconnected topics: ELF sections, segments, symbols, relocations, shared objects. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### ELF sections

**ELF sections** is a foundational concept within executable formats. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding ELF sections allows you to reason about system behavior rather than treating it as a black box.

### Segments

**Segments** is a foundational concept within executable formats. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding segments allows you to reason about system behavior rather than treating it as a black box.

### Symbols

**Symbols** is a foundational concept within executable formats. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding symbols allows you to reason about system behavior rather than treating it as a black box.

### Relocations

**Relocations** is a foundational concept within executable formats. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding relocations allows you to reason about system behavior rather than treating it as a black box.

### Shared objects

**Shared objects** is a foundational concept within executable formats. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding shared objects allows you to reason about system behavior rather than treating it as a black box.

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

- **ELF sections** — understand this deeply and the rest of executable formats follows naturally.
- **Segments** — understand this deeply and the rest of executable formats follows naturally.
- **Symbols** — understand this deeply and the rest of executable formats follows naturally.
- **Relocations** — understand this deeply and the rest of executable formats follows naturally.
- **Shared objects** — understand this deeply and the rest of executable formats follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Loaders and runtime startup**, builds directly on these ideas. Process image and Runtime initialization extend what you've learned here into loaders and runtime startup.
