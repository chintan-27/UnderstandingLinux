---
id: 191
title: "KVM concepts"
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
# KVM concepts

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**KVM concepts** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: VM execution model, virtual devices, hypervisor interactions. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### VM execution model

**VM execution model** is a foundational concept within kvm concepts. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding VM execution model allows you to reason about system behavior rather than treating it as a black box.

### Virtual devices

**Virtual devices** is a foundational concept within kvm concepts. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding virtual devices allows you to reason about system behavior rather than treating it as a black box.

### Hypervisor interactions

**Hypervisor interactions** is a foundational concept within kvm concepts. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding hypervisor interactions allows you to reason about system behavior rather than treating it as a black box.

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

- **VM execution model** — understand this deeply and the rest of kvm concepts follows naturally.
- **Virtual devices** — understand this deeply and the rest of kvm concepts follows naturally.
- **Hypervisor interactions** — understand this deeply and the rest of kvm concepts follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Containers**, builds directly on these ideas. Namespaces and Cgroups extend what you've learned here into containers.
