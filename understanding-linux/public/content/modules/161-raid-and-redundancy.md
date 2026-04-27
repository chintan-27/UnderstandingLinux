---
id: 161
title: "RAID and redundancy"
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
# RAID and redundancy

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**RAID and redundancy** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: striping, mirroring, parity, failure tradeoffs. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Striping

**Striping** is a foundational concept within raid and redundancy. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding striping allows you to reason about system behavior rather than treating it as a black box.

### Mirroring

**Mirroring** is a foundational concept within raid and redundancy. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding mirroring allows you to reason about system behavior rather than treating it as a black box.

### Parity

**Parity** is a foundational concept within raid and redundancy. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding parity allows you to reason about system behavior rather than treating it as a black box.

### Failure tradeoffs

**Failure tradeoffs** is a foundational concept within raid and redundancy. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding failure tradeoffs allows you to reason about system behavior rather than treating it as a black box.

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

- **Striping** — understand this deeply and the rest of raid and redundancy follows naturally.
- **Mirroring** — understand this deeply and the rest of raid and redundancy follows naturally.
- **Parity** — understand this deeply and the rest of raid and redundancy follows naturally.
- **Failure tradeoffs** — understand this deeply and the rest of raid and redundancy follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Linux block layer deep dive**, builds directly on these ideas. Requests and Elevators extend what you've learned here into linux block layer deep dive.
