---
id: 166
title: "Memory-mapped files"
part: "XII"
supermoduleId: 12
estimatedMinutes: 35
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
# Memory-mapped files

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Memory-mapped files** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module focuses on mmap interaction with page cache and virtual memory. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Mmap interaction with page cache and virtual memory

**Mmap interaction with page cache and virtual memory** is a foundational concept within memory-mapped files. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding mmap interaction with page cache and virtual memory allows you to reason about system behavior rather than treating it as a black box.

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

- **Mmap interaction with page cache and virtual memory** — understand this deeply and the rest of memory-mapped files follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Storage performance**, builds directly on these ideas. IOPS and Throughput extend what you've learned here into storage performance.
