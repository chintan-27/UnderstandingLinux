---
id: 62
title: "Firmware"
part: "V"
supermoduleId: 5
estimatedMinutes: 45
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
# Firmware

## Why This Matters

Architecture defines the contract between hardware and software. Understanding it explains why code runs fast — or slow.

**Firmware** sits within Computer Architecture and Machine Execution (Supermodule 5). This module covers 3 interconnected topics: boot ROM, UEFI/BIOS concepts, hardware initialization. Each builds on the previous, forming a coherent picture of how computer architecture works at this level.

## Core Concepts

### Boot ROM

**Boot ROM** is a foundational concept within firmware. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding boot ROM allows you to reason about system behavior rather than treating it as a black box.

### UEFI/BIOS concepts

**UEFI/BIOS concepts** is a foundational concept within firmware. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding UEFI/BIOS concepts allows you to reason about system behavior rather than treating it as a black box.

### Hardware initialization

**Hardware initialization** is a foundational concept within firmware. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding hardware initialization allows you to reason about system behavior rather than treating it as a black box.

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

- **Boot ROM** — understand this deeply and the rest of firmware follows naturally.
- **UEFI/BIOS concepts** — understand this deeply and the rest of firmware follows naturally.
- **Hardware initialization** — understand this deeply and the rest of firmware follows naturally.
- Think in terms of trade-offs: every design choice in computer architecture sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Binary data representation**, builds directly on these ideas. Bits and Bytes extend what you've learned here into binary data representation.
