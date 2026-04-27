---
id: 181
title: "Authentication and authorization"
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
# Authentication and authorization

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Authentication and authorization** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: passwords, PAM concepts, tokens, policy. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Passwords

**Passwords** is a foundational concept within authentication and authorization. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding passwords allows you to reason about system behavior rather than treating it as a black box.

### PAM concepts

**PAM concepts** is a foundational concept within authentication and authorization. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding PAM concepts allows you to reason about system behavior rather than treating it as a black box.

### Tokens

**Tokens** is a foundational concept within authentication and authorization. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding tokens allows you to reason about system behavior rather than treating it as a black box.

### Policy

**Policy** is a foundational concept within authentication and authorization. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding policy allows you to reason about system behavior rather than treating it as a black box.

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

- **Passwords** — understand this deeply and the rest of authentication and authorization follows naturally.
- **PAM concepts** — understand this deeply and the rest of authentication and authorization follows naturally.
- **Tokens** — understand this deeply and the rest of authentication and authorization follows naturally.
- **Policy** — understand this deeply and the rest of authentication and authorization follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **System hardening**, builds directly on these ideas. Patching and Least privilege extend what you've learned here into system hardening.
