---
id: 199
title: "Error handling and robustness"
part: "XVII"
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
# Error handling and robustness

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Error handling and robustness** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: errno, retries, backoff, partial failure handling. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Errno

**Errno** is a foundational concept within error handling and robustness. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding errno allows you to reason about system behavior rather than treating it as a black box.

### Retries

**Retries** is a foundational concept within error handling and robustness. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding retries allows you to reason about system behavior rather than treating it as a black box.

### Backoff

**Backoff** is a foundational concept within error handling and robustness. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding backoff allows you to reason about system behavior rather than treating it as a black box.

### Partial failure handling

**Partial failure handling** is a foundational concept within error handling and robustness. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding partial failure handling allows you to reason about system behavior rather than treating it as a black box.

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

- **Errno** — understand this deeply and the rest of error handling and robustness follows naturally.
- **Retries** — understand this deeply and the rest of error handling and robustness follows naturally.
- **Backoff** — understand this deeply and the rest of error handling and robustness follows naturally.
- **Partial failure handling** — understand this deeply and the rest of error handling and robustness follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **ABI, API, and compatibility**, builds directly on these ideas. Versioning and Syscall stability extend what you've learned here into abi, api, and compatibility.
