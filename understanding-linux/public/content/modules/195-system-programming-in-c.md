---
id: 195
title: "System programming in C"
part: "XVII"
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
# System programming in C

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**System programming in C** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 7 interconnected topics: processes, files, signals, pipes, sockets, epoll, threads. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Processes

**Processes** is a foundational concept within system programming in c. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding processes allows you to reason about system behavior rather than treating it as a black box.

### Files

**Files** is a foundational concept within system programming in c. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding files allows you to reason about system behavior rather than treating it as a black box.

### Signals

**Signals** is a foundational concept within system programming in c. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding signals allows you to reason about system behavior rather than treating it as a black box.

### Pipes

**Pipes** is a foundational concept within system programming in c. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding pipes allows you to reason about system behavior rather than treating it as a black box.

### Sockets

**Sockets** is a foundational concept within system programming in c. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding sockets allows you to reason about system behavior rather than treating it as a black box.

### Epoll

**Epoll** is a foundational concept within system programming in c. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding epoll allows you to reason about system behavior rather than treating it as a black box.

### Threads

**Threads** is a foundational concept within system programming in c. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding threads allows you to reason about system behavior rather than treating it as a black box.

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

- **Processes** — understand this deeply and the rest of system programming in c follows naturally.
- **Files** — understand this deeply and the rest of system programming in c follows naturally.
- **Signals** — understand this deeply and the rest of system programming in c follows naturally.
- **Pipes** — understand this deeply and the rest of system programming in c follows naturally.
- **Sockets** — understand this deeply and the rest of system programming in c follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Async I/O models**, builds directly on these ideas. Select and Poll extend what you've learned here into async i/o models.
