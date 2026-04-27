---
id: 49
title: "Machine organization"
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
# Machine organization

## Why This Matters

Architecture defines the contract between hardware and software. Understanding it explains why code runs fast — or slow.

**Machine organization** sits within Computer Architecture and Machine Execution (Supermodule 5). This module covers 5 interconnected topics: datapath, control, register file, ALU, buses. Each builds on the previous, forming a coherent picture of how computer architecture works at this level.

## Core Concepts

### Datapath

**Datapath** is a foundational concept within machine organization. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding datapath allows you to reason about system behavior rather than treating it as a black box.

### Control

**Control** is a foundational concept within machine organization. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding control allows you to reason about system behavior rather than treating it as a black box.

### Register file

**Register file** is a foundational concept within machine organization. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding register file allows you to reason about system behavior rather than treating it as a black box.

### ALU

**ALU** is a foundational concept within machine organization. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding ALU allows you to reason about system behavior rather than treating it as a black box.

### Buses

**Buses** is a foundational concept within machine organization. Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes. In practice, understanding buses allows you to reason about system behavior rather than treating it as a black box.

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

- **Datapath** — understand this deeply and the rest of machine organization follows naturally.
- **Control** — understand this deeply and the rest of machine organization follows naturally.
- **Register file** — understand this deeply and the rest of machine organization follows naturally.
- **ALU** — understand this deeply and the rest of machine organization follows naturally.
- **Buses** — understand this deeply and the rest of machine organization follows naturally.
- Think in terms of trade-offs: every design choice in computer architecture sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Instruction set architecture**, builds directly on these ideas. Opcodes and Instruction formats extend what you've learned here into instruction set architecture.
