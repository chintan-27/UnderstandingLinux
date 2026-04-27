---
id: 174
title: "Kernel concurrency patterns"
part: "XIII"
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
# Kernel concurrency patterns

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Kernel concurrency patterns** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: RCU, lock hierarchies, per-CPU data, interrupt concurrency. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### RCU

**RCU** is a foundational concept within kernel concurrency patterns. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding RCU allows you to reason about system behavior rather than treating it as a black box.

### Lock hierarchies

**Lock hierarchies** is a foundational concept within kernel concurrency patterns. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding lock hierarchies allows you to reason about system behavior rather than treating it as a black box.

### Per-CPU data

**Per-CPU data** is a foundational concept within kernel concurrency patterns. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding per-CPU data allows you to reason about system behavior rather than treating it as a black box.

### Interrupt concurrency

**Interrupt concurrency** is a foundational concept within kernel concurrency patterns. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding interrupt concurrency allows you to reason about system behavior rather than treating it as a black box.

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

- **RCU** — understand this deeply and the rest of kernel concurrency patterns follows naturally.
- **Lock hierarchies** — understand this deeply and the rest of kernel concurrency patterns follows naturally.
- **Per-CPU data** — understand this deeply and the rest of kernel concurrency patterns follows naturally.
- **Interrupt concurrency** — understand this deeply and the rest of kernel concurrency patterns follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Security foundations**, builds directly on these ideas. Threat models and Attack surface extend what you've learned here into security foundations.
