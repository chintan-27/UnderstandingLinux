---
id: 170
title: "Cache coherence"
part: "XIII"
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
# Cache coherence

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Cache coherence** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: coherence states, false sharing, cache line bouncing. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Coherence states

**Coherence states** is a foundational concept within cache coherence. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding coherence states allows you to reason about system behavior rather than treating it as a black box.

### False sharing

**False sharing** is a foundational concept within cache coherence. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding false sharing allows you to reason about system behavior rather than treating it as a black box.

### Cache line bouncing

**Cache line bouncing** is a foundational concept within cache coherence. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding cache line bouncing allows you to reason about system behavior rather than treating it as a black box.

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

- **Coherence states** — understand this deeply and the rest of cache coherence follows naturally.
- **False sharing** — understand this deeply and the rest of cache coherence follows naturally.
- **Cache line bouncing** — understand this deeply and the rest of cache coherence follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **NUMA**, builds directly on these ideas. Locality and Remote memory access extend what you've learned here into numa.
