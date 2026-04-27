---
id: 57
title: "Interrupts and exceptions"
part: "V"
supermoduleId: 5
estimatedMinutes: 50
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
# Interrupts and exceptions

## Why This Matters

Architecture defines the contract between hardware and software. Understanding it explains why code runs fast — or slow.

**Interrupts and exceptions** sits within Computer Architecture and Machine Execution (Supermodule 5). This module covers 4 interconnected topics: traps, faults, interrupts, context save/restore. Each builds on the previous, forming a coherent picture of how computer architecture works at this level.

## Core Concepts

### Traps

**Traps** is a foundational concept within interrupts and exceptions. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding traps allows you to reason about system behavior rather than treating it as a black box.

### Faults

**Faults** is a foundational concept within interrupts and exceptions. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding faults allows you to reason about system behavior rather than treating it as a black box.

### Interrupts

**Interrupts** is a foundational concept within interrupts and exceptions. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding interrupts allows you to reason about system behavior rather than treating it as a black box.

### Context save/restore

**Context save/restore** is a foundational concept within interrupts and exceptions. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding context save/restore allows you to reason about system behavior rather than treating it as a black box.

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

- **Traps** — understand this deeply and the rest of interrupts and exceptions follows naturally.
- **Faults** — understand this deeply and the rest of interrupts and exceptions follows naturally.
- **Interrupts** — understand this deeply and the rest of interrupts and exceptions follows naturally.
- **Context save/restore** — understand this deeply and the rest of interrupts and exceptions follows naturally.
- Think in terms of trade-offs: every design choice in computer architecture sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Memory technologies**, builds directly on these ideas. SRAM and DRAM extend what you've learned here into memory technologies.
