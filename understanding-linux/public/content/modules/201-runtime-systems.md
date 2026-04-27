---
id: 201
title: "Runtime systems"
part: "XVIII"
supermoduleId: 12
estimatedMinutes: 55
resources:
  - type: book
    title: "Systems Performance (Brendan Gregg)"
    url: "https://www.brendangregg.com/systems-performance-2nd-edition-book.html"
  - type: article
    title: "Brendan Gregg's Blog"
    url: "https://www.brendangregg.com/"
  - type: book
    title: "The Linux Programming Interface"
    url: "https://man7.org/tlpi/"
---
# Runtime systems

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Runtime systems** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 5 interconnected topics: process startup, stacks, heaps, allocators, garbage collection interaction with OS. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Process startup

**Process startup** is a foundational concept within runtime systems. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding process startup allows you to reason about system behavior rather than treating it as a black box.

### Stacks

**Stacks** is a foundational concept within runtime systems. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding stacks allows you to reason about system behavior rather than treating it as a black box.

### Heaps

**Heaps** is a foundational concept within runtime systems. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding heaps allows you to reason about system behavior rather than treating it as a black box.

### Allocators

**Allocators** is a foundational concept within runtime systems. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding allocators allows you to reason about system behavior rather than treating it as a black box.

### Garbage collection interaction with OS

**Garbage collection interaction with OS** is a foundational concept within runtime systems. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding garbage collection interaction with OS allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# System observation
$ vmstat 1 5          # virtual memory stats, 1s interval
$ iostat -x 1         # disk I/O stats
$ mpstat -P ALL 1     # per-CPU stats
$ free -h             # memory usage
$ lsof -p $$          # files open by current shell
```

## Key Insights

- **Process startup** — understand this deeply and the rest of runtime systems follows naturally.
- **Stacks** — understand this deeply and the rest of runtime systems follows naturally.
- **Heaps** — understand this deeply and the rest of runtime systems follows naturally.
- **Allocators** — understand this deeply and the rest of runtime systems follows naturally.
- **Garbage collection interaction with OS** — understand this deeply and the rest of runtime systems follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Memory allocators**, builds directly on these ideas. Malloc internals and Arenas extend what you've learned here into memory allocators.
