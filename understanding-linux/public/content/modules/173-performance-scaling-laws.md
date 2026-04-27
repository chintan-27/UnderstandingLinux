---
id: 173
title: "Performance scaling laws"
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
# Performance scaling laws

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Performance scaling laws** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: Amdahl, Gustafson, bottleneck reasoning. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Amdahl

**Amdahl** is a foundational concept within performance scaling laws. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding Amdahl allows you to reason about system behavior rather than treating it as a black box.

### Gustafson

**Gustafson** is a foundational concept within performance scaling laws. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding Gustafson allows you to reason about system behavior rather than treating it as a black box.

### Bottleneck reasoning

**Bottleneck reasoning** is a foundational concept within performance scaling laws. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding bottleneck reasoning allows you to reason about system behavior rather than treating it as a black box.

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

- **Amdahl** — understand this deeply and the rest of performance scaling laws follows naturally.
- **Gustafson** — understand this deeply and the rest of performance scaling laws follows naturally.
- **Bottleneck reasoning** — understand this deeply and the rest of performance scaling laws follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Kernel concurrency patterns**, builds directly on these ideas. RCU and Lock hierarchies extend what you've learned here into kernel concurrency patterns.
