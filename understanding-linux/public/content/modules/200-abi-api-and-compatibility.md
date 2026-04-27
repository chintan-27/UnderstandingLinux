---
id: 200
title: "ABI, API, and compatibility"
part: "XVII"
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
# ABI, API, and compatibility

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**ABI, API, and compatibility** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: versioning, syscall stability, library compatibility. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Versioning

**Versioning** is a foundational concept within abi, api, and compatibility. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding versioning allows you to reason about system behavior rather than treating it as a black box.

### Syscall stability

**Syscall stability** is a foundational concept within abi, api, and compatibility. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding syscall stability allows you to reason about system behavior rather than treating it as a black box.

### Library compatibility

**Library compatibility** is a foundational concept within abi, api, and compatibility. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding library compatibility allows you to reason about system behavior rather than treating it as a black box.

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

- **Versioning** — understand this deeply and the rest of abi, api, and compatibility follows naturally.
- **Syscall stability** — understand this deeply and the rest of abi, api, and compatibility follows naturally.
- **Library compatibility** — understand this deeply and the rest of abi, api, and compatibility follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Runtime systems**, builds directly on these ideas. Process startup and Stacks extend what you've learned here into runtime systems.
