---
id: 187
title: "Network profiling"
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
# Network profiling

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Network profiling** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: packet drops, retransmissions, queueing, socket buffers. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Packet drops

**Packet drops** is a foundational concept within network profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding packet drops allows you to reason about system behavior rather than treating it as a black box.

### Retransmissions

**Retransmissions** is a foundational concept within network profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding retransmissions allows you to reason about system behavior rather than treating it as a black box.

### Queueing

**Queueing** is a foundational concept within network profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding queueing allows you to reason about system behavior rather than treating it as a black box.

### Socket buffers

**Socket buffers** is a foundational concept within network profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding socket buffers allows you to reason about system behavior rather than treating it as a black box.

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

- **Packet drops** — understand this deeply and the rest of network profiling follows naturally.
- **Retransmissions** — understand this deeply and the rest of network profiling follows naturally.
- **Queueing** — understand this deeply and the rest of network profiling follows naturally.
- **Socket buffers** — understand this deeply and the rest of network profiling follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Linux observability tools**, builds directly on these ideas. Ps and Top extend what you've learned here into linux observability tools.
