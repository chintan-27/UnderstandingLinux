---
id: 176
title: "Linux permissions and identity"
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
# Linux permissions and identity

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Linux permissions and identity** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: UID/GID, capabilities, setuid, ACL concepts. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### UID/GID

**UID/GID** is a foundational concept within linux permissions and identity. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding UID/GID allows you to reason about system behavior rather than treating it as a black box.

### Capabilities

**Capabilities** is a foundational concept within linux permissions and identity. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding capabilities allows you to reason about system behavior rather than treating it as a black box.

### Setuid

**Setuid** is a foundational concept within linux permissions and identity. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding setuid allows you to reason about system behavior rather than treating it as a black box.

### ACL concepts

**ACL concepts** is a foundational concept within linux permissions and identity. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding ACL concepts allows you to reason about system behavior rather than treating it as a black box.

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

- **UID/GID** — understand this deeply and the rest of linux permissions and identity follows naturally.
- **Capabilities** — understand this deeply and the rest of linux permissions and identity follows naturally.
- **Setuid** — understand this deeply and the rest of linux permissions and identity follows naturally.
- **ACL concepts** — understand this deeply and the rest of linux permissions and identity follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Memory safety and exploitation basics**, builds directly on these ideas. Overflows and Use-after-free intuition extend what you've learned here into memory safety and exploitation basics.
