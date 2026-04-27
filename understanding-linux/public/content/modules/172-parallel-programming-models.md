---
id: 172
title: "Parallel programming models"
part: "XIII"
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
# Parallel programming models

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Parallel programming models** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 5 interconnected topics: threads, event loops, async I/O, work stealing, task models. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Threads

**Threads** is a foundational concept within parallel programming models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding threads allows you to reason about system behavior rather than treating it as a black box.

### Event loops

**Event loops** is a foundational concept within parallel programming models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding event loops allows you to reason about system behavior rather than treating it as a black box.

### Async I/O

**Async I/O** is a foundational concept within parallel programming models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding async I/O allows you to reason about system behavior rather than treating it as a black box.

### Work stealing

**Work stealing** is a foundational concept within parallel programming models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding work stealing allows you to reason about system behavior rather than treating it as a black box.

### Task models

**Task models** is a foundational concept within parallel programming models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding task models allows you to reason about system behavior rather than treating it as a black box.

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

- **Threads** — understand this deeply and the rest of parallel programming models follows naturally.
- **Event loops** — understand this deeply and the rest of parallel programming models follows naturally.
- **Async I/O** — understand this deeply and the rest of parallel programming models follows naturally.
- **Work stealing** — understand this deeply and the rest of parallel programming models follows naturally.
- **Task models** — understand this deeply and the rest of parallel programming models follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Performance scaling laws**, builds directly on these ideas. Amdahl and Gustafson extend what you've learned here into performance scaling laws.
