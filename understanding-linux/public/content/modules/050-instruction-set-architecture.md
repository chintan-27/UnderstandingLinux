---
id: 50
title: "Instruction set architecture"
part: "V"
supermoduleId: 5
estimatedMinutes: 55
resources:
  - type: book
    title: "Computer Organization and Design (Patterson & Hennessy)"
    url: "https://www.elsevier.com/books/computer-organization-and-design/patterson/978-0-12-820109-1"
  - type: article
    title: "Putting the "You" in CPU"
    url: "https://cpu.land/"
  - type: video
    title: "MIT 6.004 — Computation Structures"
    url: "https://ocw.mit.edu/courses/6-004-computation-structures-spring-2017/"
---
# Instruction set architecture

## Why This Matters

Architecture defines the contract between hardware and software. Understanding it explains why code runs fast — or slow.

**Instruction set architecture** sits within Computer Architecture and Machine Execution (Supermodule 5). This module covers 5 interconnected topics: opcodes, instruction formats, registers, addressing modes, privilege levels. Each builds on the previous, forming a coherent picture of how computer architecture works at this level.

## Core Concepts

### Opcodes

**Opcodes** is a foundational concept within instruction set architecture. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding opcodes allows you to reason about system behavior rather than treating it as a black box.

### Instruction formats

**Instruction formats** is a foundational concept within instruction set architecture. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding instruction formats allows you to reason about system behavior rather than treating it as a black box.

### Registers

**Registers** is a foundational concept within instruction set architecture. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding registers allows you to reason about system behavior rather than treating it as a black box.

### Addressing modes

**Addressing modes** is a foundational concept within instruction set architecture. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding addressing modes allows you to reason about system behavior rather than treating it as a black box.

### Privilege levels

**Privilege levels** is a foundational concept within instruction set architecture. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding privilege levels allows you to reason about system behavior rather than treating it as a black box.

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

- **Opcodes** — understand this deeply and the rest of instruction set architecture follows naturally.
- **Instruction formats** — understand this deeply and the rest of instruction set architecture follows naturally.
- **Registers** — understand this deeply and the rest of instruction set architecture follows naturally.
- **Addressing modes** — understand this deeply and the rest of instruction set architecture follows naturally.
- **Privilege levels** — understand this deeply and the rest of instruction set architecture follows naturally.
- Think in terms of trade-offs: every design choice in computer architecture sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Assembly language**, builds directly on these ideas. Arithmetic and Branches extend what you've learned here into assembly language.
