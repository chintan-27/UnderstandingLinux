---
id: 189
title: "Benchmarking methodology"
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
# Benchmarking methodology

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Benchmarking methodology** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 5 interconnected topics: warmup, noise, isolation, representative workloads, measurement error. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Warmup

**Warmup** is a foundational concept within benchmarking methodology. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding warmup allows you to reason about system behavior rather than treating it as a black box.

### Noise

**Noise** is a foundational concept within benchmarking methodology. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding noise allows you to reason about system behavior rather than treating it as a black box.

### Isolation

**Isolation** is a foundational concept within benchmarking methodology. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding isolation allows you to reason about system behavior rather than treating it as a black box.

### Representative workloads

**Representative workloads** is a foundational concept within benchmarking methodology. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding representative workloads allows you to reason about system behavior rather than treating it as a black box.

### Measurement error

**Measurement error** is a foundational concept within benchmarking methodology. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding measurement error allows you to reason about system behavior rather than treating it as a black box.

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

- **Warmup** — understand this deeply and the rest of benchmarking methodology follows naturally.
- **Noise** — understand this deeply and the rest of benchmarking methodology follows naturally.
- **Isolation** — understand this deeply and the rest of benchmarking methodology follows naturally.
- **Representative workloads** — understand this deeply and the rest of benchmarking methodology follows naturally.
- **Measurement error** — understand this deeply and the rest of benchmarking methodology follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Virtualization basics**, builds directly on these ideas. Type 1/type 2 intuition and Hardware virtualization support extend what you've learned here into virtualization basics.
