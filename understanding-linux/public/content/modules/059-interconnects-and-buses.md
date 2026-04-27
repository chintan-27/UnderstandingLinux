---
id: 59
title: "Interconnects and buses"
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
# Interconnects and buses

## Why This Matters

Architecture defines the contract between hardware and software. Understanding it explains why code runs fast — or slow.

**Interconnects and buses** sits within Computer Architecture and Machine Execution (Supermodule 5). This module covers 3 interconnected topics: PCIe intuition, memory buses, on-chip interconnects. Each builds on the previous, forming a coherent picture of how computer architecture works at this level.

## Core Concepts

### PCIe intuition

**PCIe intuition** is a foundational concept within interconnects and buses. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding PCIe intuition allows you to reason about system behavior rather than treating it as a black box.

### Memory buses

**Memory buses** is a foundational concept within interconnects and buses. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding memory buses allows you to reason about system behavior rather than treating it as a black box.

### On-chip interconnects

**On-chip interconnects** is a foundational concept within interconnects and buses. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding on-chip interconnects allows you to reason about system behavior rather than treating it as a black box.

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

- **PCIe intuition** — understand this deeply and the rest of interconnects and buses follows naturally.
- **Memory buses** — understand this deeply and the rest of interconnects and buses follows naturally.
- **On-chip interconnects** — understand this deeply and the rest of interconnects and buses follows naturally.
- Think in terms of trade-offs: every design choice in computer architecture sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Multiprocessors**, builds directly on these ideas. Shared memory and Cache coherence extend what you've learned here into multiprocessors.
