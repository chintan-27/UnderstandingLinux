---
id: 179
title: "Cryptography fundamentals"
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
# Cryptography fundamentals

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Cryptography fundamentals** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: hashing, symmetric/asymmetric encryption, signatures, key exchange at a conceptual level. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Hashing

**Hashing** is a foundational concept within cryptography fundamentals. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding hashing allows you to reason about system behavior rather than treating it as a black box.

### Symmetric/asymmetric encryption

**Symmetric/asymmetric encryption** is a foundational concept within cryptography fundamentals. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding symmetric/asymmetric encryption allows you to reason about system behavior rather than treating it as a black box.

### Signatures

**Signatures** is a foundational concept within cryptography fundamentals. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding signatures allows you to reason about system behavior rather than treating it as a black box.

### Key exchange at a conceptual level

**Key exchange at a conceptual level** is a foundational concept within cryptography fundamentals. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding key exchange at a conceptual level allows you to reason about system behavior rather than treating it as a black box.

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

- **Hashing** — understand this deeply and the rest of cryptography fundamentals follows naturally.
- **Symmetric/asymmetric encryption** — understand this deeply and the rest of cryptography fundamentals follows naturally.
- **Signatures** — understand this deeply and the rest of cryptography fundamentals follows naturally.
- **Key exchange at a conceptual level** — understand this deeply and the rest of cryptography fundamentals follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Secure networking**, builds directly on these ideas. TLS and Certificates extend what you've learned here into secure networking.
