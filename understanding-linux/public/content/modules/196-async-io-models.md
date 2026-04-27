---
id: 196
title: "Async I/O models"
part: "XVII"
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
# Async I/O models

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Async I/O models** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: select, poll, epoll, io_uring concepts. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Select

**Select** is a foundational concept within async i/o models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding select allows you to reason about system behavior rather than treating it as a black box.

### Poll

**Poll** is a foundational concept within async i/o models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding poll allows you to reason about system behavior rather than treating it as a black box.

### Epoll

**Epoll** is a foundational concept within async i/o models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding epoll allows you to reason about system behavior rather than treating it as a black box.

### Io_uring concepts

**Io_uring concepts** is a foundational concept within async i/o models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding io_uring concepts allows you to reason about system behavior rather than treating it as a black box.

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

- **Select** — understand this deeply and the rest of async i/o models follows naturally.
- **Poll** — understand this deeply and the rest of async i/o models follows naturally.
- **Epoll** — understand this deeply and the rest of async i/o models follows naturally.
- **Io_uring concepts** — understand this deeply and the rest of async i/o models follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Daemon and service design**, builds directly on these ideas. Lifecycle and Supervision extend what you've learned here into daemon and service design.
