---
id: 214
title: "Kernel contribution workflow"
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
# Kernel contribution workflow

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Kernel contribution workflow** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: patches, subsystem maintainers, coding style, mailing list culture. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Patches

**Patches** is a foundational concept within kernel contribution workflow. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding patches allows you to reason about system behavior rather than treating it as a black box.

### Subsystem maintainers

**Subsystem maintainers** is a foundational concept within kernel contribution workflow. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding subsystem maintainers allows you to reason about system behavior rather than treating it as a black box.

### Coding style

**Coding style** is a foundational concept within kernel contribution workflow. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding coding style allows you to reason about system behavior rather than treating it as a black box.

### Mailing list culture

**Mailing list culture** is a foundational concept within kernel contribution workflow. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding mailing list culture allows you to reason about system behavior rather than treating it as a black box.

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

- **Patches** — understand this deeply and the rest of kernel contribution workflow follows naturally.
- **Subsystem maintainers** — understand this deeply and the rest of kernel contribution workflow follows naturally.
- **Coding style** — understand this deeply and the rest of kernel contribution workflow follows naturally.
- **Mailing list culture** — understand this deeply and the rest of kernel contribution workflow follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Reading specifications and standards**, builds directly on these ideas. RFCs and ABI docs extend what you've learned here into reading specifications and standards.
