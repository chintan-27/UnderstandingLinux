---
id: 55
title: "Caches"
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
# Caches

## Why This Matters

Architecture defines the contract between hardware and software. Understanding it explains why code runs fast — or slow.

**Caches** sits within Computer Architecture and Machine Execution (Supermodule 5). This module covers 4 interconnected topics: locality, mapping, replacement, coherence intuition. Each builds on the previous, forming a coherent picture of how computer architecture works at this level.

## Core Concepts

### Locality

**Locality** is a foundational concept within caches. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding locality allows you to reason about system behavior rather than treating it as a black box.

### Mapping

**Mapping** is a foundational concept within caches. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding mapping allows you to reason about system behavior rather than treating it as a black box.

### Replacement

**Replacement** is a foundational concept within caches. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding replacement allows you to reason about system behavior rather than treating it as a black box.

### Coherence intuition

**Coherence intuition** is a foundational concept within caches. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding coherence intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Locality** — understand this deeply and the rest of caches follows naturally.
- **Mapping** — understand this deeply and the rest of caches follows naturally.
- **Replacement** — understand this deeply and the rest of caches follows naturally.
- **Coherence intuition** — understand this deeply and the rest of caches follows naturally.
- Think in terms of trade-offs: every design choice in computer architecture sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Virtual memory hardware**, builds directly on these ideas. Page tables and TLBs extend what you've learned here into virtual memory hardware.
