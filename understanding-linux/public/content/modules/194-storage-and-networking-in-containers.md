---
id: 194
title: "Storage and networking in containers"
part: "XVI"
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
# Storage and networking in containers

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Storage and networking in containers** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: overlay filesystems, bridge networking, CNI-level intuition. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Overlay filesystems

**Overlay filesystems** is a foundational concept within storage and networking in containers. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding overlay filesystems allows you to reason about system behavior rather than treating it as a black box.

### Bridge networking

**Bridge networking** is a foundational concept within storage and networking in containers. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding bridge networking allows you to reason about system behavior rather than treating it as a black box.

### CNI-level intuition

**CNI-level intuition** is a foundational concept within storage and networking in containers. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding CNI-level intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Overlay filesystems** — understand this deeply and the rest of storage and networking in containers follows naturally.
- **Bridge networking** — understand this deeply and the rest of storage and networking in containers follows naturally.
- **CNI-level intuition** — understand this deeply and the rest of storage and networking in containers follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **System programming in C**, builds directly on these ideas. Processes and Files extend what you've learned here into system programming in c.
