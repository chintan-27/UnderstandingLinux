---
id: 163
title: "Filesystem design"
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
# Filesystem design

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Filesystem design** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 5 interconnected topics: allocation, metadata, journaling, crash consistency, copy-on-write ideas. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Allocation

**Allocation** is a foundational concept within filesystem design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding allocation allows you to reason about system behavior rather than treating it as a black box.

### Metadata

**Metadata** is a foundational concept within filesystem design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding metadata allows you to reason about system behavior rather than treating it as a black box.

### Journaling

**Journaling** is a foundational concept within filesystem design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding journaling allows you to reason about system behavior rather than treating it as a black box.

### Crash consistency

**Crash consistency** is a foundational concept within filesystem design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding crash consistency allows you to reason about system behavior rather than treating it as a black box.

### Copy-on-write ideas

**Copy-on-write ideas** is a foundational concept within filesystem design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding copy-on-write ideas allows you to reason about system behavior rather than treating it as a black box.

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

- **Allocation** — understand this deeply and the rest of filesystem design follows naturally.
- **Metadata** — understand this deeply and the rest of filesystem design follows naturally.
- **Journaling** — understand this deeply and the rest of filesystem design follows naturally.
- **Crash consistency** — understand this deeply and the rest of filesystem design follows naturally.
- **Copy-on-write ideas** — understand this deeply and the rest of filesystem design follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Linux filesystems**, builds directly on these ideas. Ext4 concepts and XFS concepts extend what you've learned here into linux filesystems.
