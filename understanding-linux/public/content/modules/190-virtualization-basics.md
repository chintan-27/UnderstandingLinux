---
id: 190
title: "Virtualization basics"
part: "XVI"
supermoduleId: 12
estimatedMinutes: 45
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
# Virtualization basics

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Virtualization basics** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: type 1/type 2 intuition, hardware virtualization support, guest/host boundary. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Type 1/type 2 intuition

**Type 1/type 2 intuition** is a foundational concept within virtualization basics. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding type 1/type 2 intuition allows you to reason about system behavior rather than treating it as a black box.

### Hardware virtualization support

**Hardware virtualization support** is a foundational concept within virtualization basics. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding hardware virtualization support allows you to reason about system behavior rather than treating it as a black box.

### Guest/host boundary

**Guest/host boundary** is a foundational concept within virtualization basics. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding guest/host boundary allows you to reason about system behavior rather than treating it as a black box.

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

- **Type 1/type 2 intuition** — understand this deeply and the rest of virtualization basics follows naturally.
- **Hardware virtualization support** — understand this deeply and the rest of virtualization basics follows naturally.
- **Guest/host boundary** — understand this deeply and the rest of virtualization basics follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **KVM concepts**, builds directly on these ideas. VM execution model and Virtual devices extend what you've learned here into kvm concepts.
