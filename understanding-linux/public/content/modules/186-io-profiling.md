---
id: 186
title: "I/O profiling"
part: "XV"
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
# I/O profiling

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**I/O profiling** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: disk latency, queueing, block traces. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Disk latency

**Disk latency** is a foundational concept within i/o profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding disk latency allows you to reason about system behavior rather than treating it as a black box.

### Queueing

**Queueing** is a foundational concept within i/o profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding queueing allows you to reason about system behavior rather than treating it as a black box.

### Block traces

**Block traces** is a foundational concept within i/o profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding block traces allows you to reason about system behavior rather than treating it as a black box.

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

- **Disk latency** — understand this deeply and the rest of i/o profiling follows naturally.
- **Queueing** — understand this deeply and the rest of i/o profiling follows naturally.
- **Block traces** — understand this deeply and the rest of i/o profiling follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Network profiling**, builds directly on these ideas. Packet drops and Retransmissions extend what you've learned here into network profiling.
