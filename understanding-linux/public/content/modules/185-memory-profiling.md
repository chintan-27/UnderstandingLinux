---
id: 185
title: "Memory profiling"
part: "XV"
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
# Memory profiling

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Memory profiling** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: allocation patterns, working set, cache misses, page faults. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Allocation patterns

**Allocation patterns** is a foundational concept within memory profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding allocation patterns allows you to reason about system behavior rather than treating it as a black box.

### Working set

**Working set** is a foundational concept within memory profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding working set allows you to reason about system behavior rather than treating it as a black box.

### Cache misses

**Cache misses** is a foundational concept within memory profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding cache misses allows you to reason about system behavior rather than treating it as a black box.

### Page faults

**Page faults** is a foundational concept within memory profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding page faults allows you to reason about system behavior rather than treating it as a black box.

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

- **Allocation patterns** — understand this deeply and the rest of memory profiling follows naturally.
- **Working set** — understand this deeply and the rest of memory profiling follows naturally.
- **Cache misses** — understand this deeply and the rest of memory profiling follows naturally.
- **Page faults** — understand this deeply and the rest of memory profiling follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **I/O profiling**, builds directly on these ideas. Disk latency and Queueing extend what you've learned here into i/o profiling.
