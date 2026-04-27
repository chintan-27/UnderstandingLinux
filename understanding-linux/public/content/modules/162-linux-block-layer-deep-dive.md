---
id: 162
title: "Linux block layer deep dive"
part: "XII"
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
# Linux block layer deep dive

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Linux block layer deep dive** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: requests, elevators, multiqueue block layer. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Requests

**Requests** is a foundational concept within linux block layer deep dive. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding requests allows you to reason about system behavior rather than treating it as a black box.

### Elevators

**Elevators** is a foundational concept within linux block layer deep dive. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding elevators allows you to reason about system behavior rather than treating it as a black box.

### Multiqueue block layer

**Multiqueue block layer** is a foundational concept within linux block layer deep dive. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding multiqueue block layer allows you to reason about system behavior rather than treating it as a black box.

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

- **Requests** — understand this deeply and the rest of linux block layer deep dive follows naturally.
- **Elevators** — understand this deeply and the rest of linux block layer deep dive follows naturally.
- **Multiqueue block layer** — understand this deeply and the rest of linux block layer deep dive follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Filesystem design**, builds directly on these ideas. Allocation and Metadata extend what you've learned here into filesystem design.
