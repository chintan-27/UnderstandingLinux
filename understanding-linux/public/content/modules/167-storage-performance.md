---
id: 167
title: "Storage performance"
part: "XII"
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
# Storage performance

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Storage performance** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 5 interconnected topics: IOPS, throughput, queue depth, fsync costs, latency distributions. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### IOPS

**IOPS** is a foundational concept within storage performance. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding IOPS allows you to reason about system behavior rather than treating it as a black box.

### Throughput

**Throughput** is a foundational concept within storage performance. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding throughput allows you to reason about system behavior rather than treating it as a black box.

### Queue depth

**Queue depth** is a foundational concept within storage performance. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding queue depth allows you to reason about system behavior rather than treating it as a black box.

### Fsync costs

**Fsync costs** is a foundational concept within storage performance. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding fsync costs allows you to reason about system behavior rather than treating it as a black box.

### Latency distributions

**Latency distributions** is a foundational concept within storage performance. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding latency distributions allows you to reason about system behavior rather than treating it as a black box.

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

- **IOPS** — understand this deeply and the rest of storage performance follows naturally.
- **Throughput** — understand this deeply and the rest of storage performance follows naturally.
- **Queue depth** — understand this deeply and the rest of storage performance follows naturally.
- **Fsync costs** — understand this deeply and the rest of storage performance follows naturally.
- **Latency distributions** — understand this deeply and the rest of storage performance follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Threads and shared memory**, builds directly on these ideas. Race conditions and Critical sections extend what you've learned here into threads and shared memory.
