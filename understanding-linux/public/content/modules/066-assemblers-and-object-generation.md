---
id: 66
title: "Assemblers and object generation"
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
# Assemblers and object generation

## Why This Matters

C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.

**Assemblers and object generation** sits within C, Assembly, Compilers, Linking, and Binaries (Supermodule 6). This module covers 3 interconnected topics: symbols, relocation, instruction encoding. Each builds on the previous, forming a coherent picture of how the C language, toolchain, and binary formats works at this level.

## Core Concepts

### Symbols

**Symbols** is a foundational concept within assemblers and object generation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding symbols allows you to reason about system behavior rather than treating it as a black box.

### Relocation

**Relocation** is a foundational concept within assemblers and object generation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding relocation allows you to reason about system behavior rather than treating it as a black box.

### Instruction encoding

**Instruction encoding** is a foundational concept within assemblers and object generation. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding instruction encoding allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```asm
; x86-64 assembly — function prologue
section .text
global _start

add_numbers:
    push rbp              ; save old base pointer
    mov  rbp, rsp         ; set new base pointer
    mov  eax, edi         ; first argument (System V ABI)
    add  eax, esi         ; second argument
    pop  rbp              ; restore base pointer
    ret                   ; return value in eax
```

## Key Insights

- **Symbols** — understand this deeply and the rest of assemblers and object generation follows naturally.
- **Relocation** — understand this deeply and the rest of assemblers and object generation follows naturally.
- **Instruction encoding** — understand this deeply and the rest of assemblers and object generation follows naturally.
- Think in terms of trade-offs: every design choice in the C language, toolchain, and binary formats sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Linkers**, builds directly on these ideas. Static linking and Dynamic linking extend what you've learned here into linkers.
