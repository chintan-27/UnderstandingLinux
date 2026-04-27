---
id: 60
title: "Multiprocessors"
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
# Multiprocessors

## Why This Matters

Architecture defines the contract between hardware and software. Understanding it explains why code runs fast — or slow.

**Multiprocessors** sits within Computer Architecture and Machine Execution (Supermodule 5). This module covers 4 interconnected topics: shared memory, cache coherence, NUMA, inter-socket behavior. Each builds on the previous, forming a coherent picture of how computer architecture works at this level.

## Core Concepts

### Shared memory

**Shared memory** is a foundational concept within multiprocessors. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding shared memory allows you to reason about system behavior rather than treating it as a black box.

### Cache coherence

**Cache coherence** is a foundational concept within multiprocessors. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding cache coherence allows you to reason about system behavior rather than treating it as a black box.

### NUMA

**NUMA** is a foundational concept within multiprocessors. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding NUMA allows you to reason about system behavior rather than treating it as a black box.

### Inter-socket behavior

**Inter-socket behavior** is a foundational concept within multiprocessors. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding inter-socket behavior allows you to reason about system behavior rather than treating it as a black box.

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

- **Shared memory** — understand this deeply and the rest of multiprocessors follows naturally.
- **Cache coherence** — understand this deeply and the rest of multiprocessors follows naturally.
- **NUMA** — understand this deeply and the rest of multiprocessors follows naturally.
- **Inter-socket behavior** — understand this deeply and the rest of multiprocessors follows naturally.
- Think in terms of trade-offs: every design choice in computer architecture sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Accelerators**, builds directly on these ideas. GPU concepts and DMA-heavy devices extend what you've learned here into accelerators.
