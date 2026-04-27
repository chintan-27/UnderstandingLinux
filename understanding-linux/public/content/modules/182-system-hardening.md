---
id: 182
title: "System hardening"
part: "XIV"
supermoduleId: 12
estimatedMinutes: 60
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
# System hardening

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**System hardening** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 6 interconnected topics: patching, least privilege, auditing, isolation, logging, attack surface reduction. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Patching

**Patching** is a foundational concept within system hardening. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding patching allows you to reason about system behavior rather than treating it as a black box.

### Least privilege

**Least privilege** is a foundational concept within system hardening. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding least privilege allows you to reason about system behavior rather than treating it as a black box.

### Auditing

**Auditing** is a foundational concept within system hardening. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding auditing allows you to reason about system behavior rather than treating it as a black box.

### Isolation

**Isolation** is a foundational concept within system hardening. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding isolation allows you to reason about system behavior rather than treating it as a black box.

### Logging

**Logging** is a foundational concept within system hardening. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding logging allows you to reason about system behavior rather than treating it as a black box.

### Attack surface reduction

**Attack surface reduction** is a foundational concept within system hardening. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding attack surface reduction allows you to reason about system behavior rather than treating it as a black box.

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

- **Patching** — understand this deeply and the rest of system hardening follows naturally.
- **Least privilege** — understand this deeply and the rest of system hardening follows naturally.
- **Auditing** — understand this deeply and the rest of system hardening follows naturally.
- **Isolation** — understand this deeply and the rest of system hardening follows naturally.
- **Logging** — understand this deeply and the rest of system hardening follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Performance models**, builds directly on these ideas. Latency and Throughput extend what you've learned here into performance models.
