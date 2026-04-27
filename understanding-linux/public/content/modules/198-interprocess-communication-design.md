---
id: 198
title: "Interprocess communication design"
part: "XVII"
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
# Interprocess communication design

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Interprocess communication design** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 5 interconnected topics: pipes, shared memory, RPC, sockets, protocol design. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Pipes

**Pipes** is a foundational concept within interprocess communication design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding pipes allows you to reason about system behavior rather than treating it as a black box.

### Shared memory

**Shared memory** is a foundational concept within interprocess communication design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding shared memory allows you to reason about system behavior rather than treating it as a black box.

### RPC

**RPC** is a foundational concept within interprocess communication design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding RPC allows you to reason about system behavior rather than treating it as a black box.

### Sockets

**Sockets** is a foundational concept within interprocess communication design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding sockets allows you to reason about system behavior rather than treating it as a black box.

### Protocol design

**Protocol design** is a foundational concept within interprocess communication design. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding protocol design allows you to reason about system behavior rather than treating it as a black box.

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

- **Pipes** — understand this deeply and the rest of interprocess communication design follows naturally.
- **Shared memory** — understand this deeply and the rest of interprocess communication design follows naturally.
- **RPC** — understand this deeply and the rest of interprocess communication design follows naturally.
- **Sockets** — understand this deeply and the rest of interprocess communication design follows naturally.
- **Protocol design** — understand this deeply and the rest of interprocess communication design follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Error handling and robustness**, builds directly on these ideas. Errno and Retries extend what you've learned here into error handling and robustness.
