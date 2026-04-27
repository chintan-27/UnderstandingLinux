---
id: 164
title: "Linux filesystems"
part: "XII"
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
# Linux filesystems

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Linux filesystems** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: ext4 concepts, XFS concepts, Btrfs concepts at a high level. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Ext4 concepts

**Ext4 concepts** is a foundational concept within linux filesystems. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding ext4 concepts allows you to reason about system behavior rather than treating it as a black box.

### XFS concepts

**XFS concepts** is a foundational concept within linux filesystems. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding XFS concepts allows you to reason about system behavior rather than treating it as a black box.

### Btrfs concepts at a high level

**Btrfs concepts at a high level** is a foundational concept within linux filesystems. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding Btrfs concepts at a high level allows you to reason about system behavior rather than treating it as a black box.

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

- **Ext4 concepts** — understand this deeply and the rest of linux filesystems follows naturally.
- **XFS concepts** — understand this deeply and the rest of linux filesystems follows naturally.
- **Btrfs concepts at a high level** — understand this deeply and the rest of linux filesystems follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Page cache and writeback**, builds directly on these ideas. Caching and Dirty pages extend what you've learned here into page cache and writeback.
