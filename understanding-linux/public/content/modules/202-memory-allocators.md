---
id: 202
title: "Memory allocators"
part: "XVIII"
supermoduleId: 12
estimatedMinutes: 50
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
# Memory allocators

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Memory allocators** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: malloc internals, arenas, fragmentation, tcache intuition. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Malloc internals

**Malloc internals** is a foundational concept within memory allocators. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding malloc internals allows you to reason about system behavior rather than treating it as a black box.

### Arenas

**Arenas** is a foundational concept within memory allocators. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding arenas allows you to reason about system behavior rather than treating it as a black box.

### Fragmentation

**Fragmentation** is a foundational concept within memory allocators. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding fragmentation allows you to reason about system behavior rather than treating it as a black box.

### Tcache intuition

**Tcache intuition** is a foundational concept within memory allocators. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding tcache intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Malloc internals** — understand this deeply and the rest of memory allocators follows naturally.
- **Arenas** — understand this deeply and the rest of memory allocators follows naturally.
- **Fragmentation** — understand this deeply and the rest of memory allocators follows naturally.
- **Tcache intuition** — understand this deeply and the rest of memory allocators follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Managed runtimes on Linux**, builds directly on these ideas. JVM/.NET/Go runtime interactions with threads and Memory extend what you've learned here into managed runtimes on linux.
