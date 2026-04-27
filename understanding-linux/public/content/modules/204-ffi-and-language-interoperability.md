---
id: 204
title: "FFI and language interoperability"
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
# FFI and language interoperability

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**FFI and language interoperability** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: calling conventions, shared libraries, symbol interfaces. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Calling conventions

**Calling conventions** is a foundational concept within ffi and language interoperability. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding calling conventions allows you to reason about system behavior rather than treating it as a black box.

### Shared libraries

**Shared libraries** is a foundational concept within ffi and language interoperability. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding shared libraries allows you to reason about system behavior rather than treating it as a black box.

### Symbol interfaces

**Symbol interfaces** is a foundational concept within ffi and language interoperability. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding symbol interfaces allows you to reason about system behavior rather than treating it as a black box.

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

- **Calling conventions** — understand this deeply and the rest of ffi and language interoperability follows naturally.
- **Shared libraries** — understand this deeply and the rest of ffi and language interoperability follows naturally.
- **Symbol interfaces** — understand this deeply and the rest of ffi and language interoperability follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Time and clocks**, builds directly on these ideas. Monotonic vs wall clocks and Synchronization extend what you've learned here into time and clocks.
