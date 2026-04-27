---
id: 175
title: "Security foundations"
part: "XIV"
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
# Security foundations

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Security foundations** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: threat models, attack surface, least privilege, trust boundaries. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Threat models

**Threat models** is a foundational concept within security foundations. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding threat models allows you to reason about system behavior rather than treating it as a black box.

### Attack surface

**Attack surface** is a foundational concept within security foundations. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding attack surface allows you to reason about system behavior rather than treating it as a black box.

### Least privilege

**Least privilege** is a foundational concept within security foundations. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding least privilege allows you to reason about system behavior rather than treating it as a black box.

### Trust boundaries

**Trust boundaries** is a foundational concept within security foundations. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding trust boundaries allows you to reason about system behavior rather than treating it as a black box.

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

- **Threat models** — understand this deeply and the rest of security foundations follows naturally.
- **Attack surface** — understand this deeply and the rest of security foundations follows naturally.
- **Least privilege** — understand this deeply and the rest of security foundations follows naturally.
- **Trust boundaries** — understand this deeply and the rest of security foundations follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Linux permissions and identity**, builds directly on these ideas. UID/GID and Capabilities extend what you've learned here into linux permissions and identity.
