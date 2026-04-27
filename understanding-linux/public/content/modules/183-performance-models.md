---
id: 183
title: "Performance models"
part: "XV"
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
# Performance models

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Performance models** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 5 interconnected topics: latency, throughput, utilization, service time, queueing. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Latency

**Latency** is a foundational concept within performance models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding latency allows you to reason about system behavior rather than treating it as a black box.

### Throughput

**Throughput** is a foundational concept within performance models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding throughput allows you to reason about system behavior rather than treating it as a black box.

### Utilization

**Utilization** is a foundational concept within performance models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding utilization allows you to reason about system behavior rather than treating it as a black box.

### Service time

**Service time** is a foundational concept within performance models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding service time allows you to reason about system behavior rather than treating it as a black box.

### Queueing

**Queueing** is a foundational concept within performance models. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding queueing allows you to reason about system behavior rather than treating it as a black box.

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

- **Latency** — understand this deeply and the rest of performance models follows naturally.
- **Throughput** — understand this deeply and the rest of performance models follows naturally.
- **Utilization** — understand this deeply and the rest of performance models follows naturally.
- **Service time** — understand this deeply and the rest of performance models follows naturally.
- **Queueing** — understand this deeply and the rest of performance models follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **CPU profiling**, builds directly on these ideas. Sampling and Instrumentation extend what you've learned here into cpu profiling.
