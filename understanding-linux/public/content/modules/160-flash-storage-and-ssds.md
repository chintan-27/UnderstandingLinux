---
id: 160
title: "Flash storage and SSDs"
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
# Flash storage and SSDs

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Flash storage and SSDs** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 5 interconnected topics: pages, blocks, wear leveling, garbage collection, FTL. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Pages

**Pages** is a foundational concept within flash storage and ssds. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding pages allows you to reason about system behavior rather than treating it as a black box.

### Blocks

**Blocks** is a foundational concept within flash storage and ssds. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding blocks allows you to reason about system behavior rather than treating it as a black box.

### Wear leveling

**Wear leveling** is a foundational concept within flash storage and ssds. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding wear leveling allows you to reason about system behavior rather than treating it as a black box.

### Garbage collection

**Garbage collection** is a foundational concept within flash storage and ssds. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding garbage collection allows you to reason about system behavior rather than treating it as a black box.

### FTL

**FTL** is a foundational concept within flash storage and ssds. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding FTL allows you to reason about system behavior rather than treating it as a black box.

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

- **Pages** — understand this deeply and the rest of flash storage and ssds follows naturally.
- **Blocks** — understand this deeply and the rest of flash storage and ssds follows naturally.
- **Wear leveling** — understand this deeply and the rest of flash storage and ssds follows naturally.
- **Garbage collection** — understand this deeply and the rest of flash storage and ssds follows naturally.
- **FTL** — understand this deeply and the rest of flash storage and ssds follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **RAID and redundancy**, builds directly on these ideas. Striping and Mirroring extend what you've learned here into raid and redundancy.
