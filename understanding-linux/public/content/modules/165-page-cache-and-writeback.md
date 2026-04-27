---
id: 165
title: "Page cache and writeback"
part: "XII"
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
# Page cache and writeback

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Page cache and writeback** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: caching, dirty pages, flushing, consistency semantics. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Caching

**Caching** is a foundational concept within page cache and writeback. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding caching allows you to reason about system behavior rather than treating it as a black box.

### Dirty pages

**Dirty pages** is a foundational concept within page cache and writeback. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding dirty pages allows you to reason about system behavior rather than treating it as a black box.

### Flushing

**Flushing** is a foundational concept within page cache and writeback. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding flushing allows you to reason about system behavior rather than treating it as a black box.

### Consistency semantics

**Consistency semantics** is a foundational concept within page cache and writeback. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding consistency semantics allows you to reason about system behavior rather than treating it as a black box.

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

- **Caching** — understand this deeply and the rest of page cache and writeback follows naturally.
- **Dirty pages** — understand this deeply and the rest of page cache and writeback follows naturally.
- **Flushing** — understand this deeply and the rest of page cache and writeback follows naturally.
- **Consistency semantics** — understand this deeply and the rest of page cache and writeback follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Memory-mapped files**, builds directly on these ideas. Mmap interaction with page cache and virtual memory extend what you've learned here into memory-mapped files.
