---
id: 203
title: "Managed runtimes on Linux"
part: "XVIII"
supermoduleId: 12
estimatedMinutes: 45
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
# Managed runtimes on Linux

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Managed runtimes on Linux** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: JVM/.NET/Go runtime interactions with threads, memory, syscalls. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### JVM/.NET/Go runtime interactions with threads

**JVM/.NET/Go runtime interactions with threads** is a foundational concept within managed runtimes on linux. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding JVM/.NET/Go runtime interactions with threads allows you to reason about system behavior rather than treating it as a black box.

### Memory

**Memory** is a foundational concept within managed runtimes on linux. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding memory allows you to reason about system behavior rather than treating it as a black box.

### Syscalls

**Syscalls** is a foundational concept within managed runtimes on linux. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding syscalls allows you to reason about system behavior rather than treating it as a black box.

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

- **JVM/.NET/Go runtime interactions with threads** — understand this deeply and the rest of managed runtimes on linux follows naturally.
- **Memory** — understand this deeply and the rest of managed runtimes on linux follows naturally.
- **Syscalls** — understand this deeply and the rest of managed runtimes on linux follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **FFI and language interoperability**, builds directly on these ideas. Calling conventions and Shared libraries extend what you've learned here into ffi and language interoperability.
