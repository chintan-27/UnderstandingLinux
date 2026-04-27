---
id: 159
title: "Magnetic storage basics"
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
# Magnetic storage basics

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Magnetic storage basics** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: disks, sectors, seeks, rotational latency. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Disks

**Disks** is a foundational concept within magnetic storage basics. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding disks allows you to reason about system behavior rather than treating it as a black box.

### Sectors

**Sectors** is a foundational concept within magnetic storage basics. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding sectors allows you to reason about system behavior rather than treating it as a black box.

### Seeks

**Seeks** is a foundational concept within magnetic storage basics. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding seeks allows you to reason about system behavior rather than treating it as a black box.

### Rotational latency

**Rotational latency** is a foundational concept within magnetic storage basics. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding rotational latency allows you to reason about system behavior rather than treating it as a black box.

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

- **Disks** — understand this deeply and the rest of magnetic storage basics follows naturally.
- **Sectors** — understand this deeply and the rest of magnetic storage basics follows naturally.
- **Seeks** — understand this deeply and the rest of magnetic storage basics follows naturally.
- **Rotational latency** — understand this deeply and the rest of magnetic storage basics follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Flash storage and SSDs**, builds directly on these ideas. Pages and Blocks extend what you've learned here into flash storage and ssds.
