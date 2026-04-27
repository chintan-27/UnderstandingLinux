---
id: 168
title: "Threads and shared memory"
part: "XIII"
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
# Threads and shared memory

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Threads and shared memory** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: race conditions, critical sections, synchronization patterns. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Race conditions

**Race conditions** is a foundational concept within threads and shared memory. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding race conditions allows you to reason about system behavior rather than treating it as a black box.

### Critical sections

**Critical sections** is a foundational concept within threads and shared memory. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding critical sections allows you to reason about system behavior rather than treating it as a black box.

### Synchronization patterns

**Synchronization patterns** is a foundational concept within threads and shared memory. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding synchronization patterns allows you to reason about system behavior rather than treating it as a black box.

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

- **Race conditions** — understand this deeply and the rest of threads and shared memory follows naturally.
- **Critical sections** — understand this deeply and the rest of threads and shared memory follows naturally.
- **Synchronization patterns** — understand this deeply and the rest of threads and shared memory follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Atomics and memory ordering**, builds directly on these ideas. Acquire/release intuition and Fences extend what you've learned here into atomics and memory ordering.
