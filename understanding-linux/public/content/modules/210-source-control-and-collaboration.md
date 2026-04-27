---
id: 210
title: "Source control and collaboration"
part: "XX"
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
# Source control and collaboration

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Source control and collaboration** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: Git, branching, patch workflows, code review. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Git

**Git** is a foundational concept within source control and collaboration. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding Git allows you to reason about system behavior rather than treating it as a black box.

### Branching

**Branching** is a foundational concept within source control and collaboration. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding branching allows you to reason about system behavior rather than treating it as a black box.

### Patch workflows

**Patch workflows** is a foundational concept within source control and collaboration. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding patch workflows allows you to reason about system behavior rather than treating it as a black box.

### Code review

**Code review** is a foundational concept within source control and collaboration. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding code review allows you to reason about system behavior rather than treating it as a black box.

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

- **Git** — understand this deeply and the rest of source control and collaboration follows naturally.
- **Branching** — understand this deeply and the rest of source control and collaboration follows naturally.
- **Patch workflows** — understand this deeply and the rest of source control and collaboration follows naturally.
- **Code review** — understand this deeply and the rest of source control and collaboration follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Testing**, builds directly on these ideas. Unit and Integration extend what you've learned here into testing.
