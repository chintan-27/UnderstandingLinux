---
id: 184
title: "CPU profiling"
part: "XV"
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
# CPU profiling

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**CPU profiling** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 3 interconnected topics: sampling, instrumentation, flame graph intuition. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Sampling

**Sampling** is a foundational concept within cpu profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding sampling allows you to reason about system behavior rather than treating it as a black box.

### Instrumentation

**Instrumentation** is a foundational concept within cpu profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding instrumentation allows you to reason about system behavior rather than treating it as a black box.

### Flame graph intuition

**Flame graph intuition** is a foundational concept within cpu profiling. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding flame graph intuition allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# CPU profiling with perf
$ perf record -g ./my_program     # sample with call stacks
$ perf report                     # interactive report
$ perf stat ./my_program          # hardware counters

# Generate a flame graph
$ perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg

# Trace syscalls
$ strace -c ./my_program          # syscall summary
$ strace -e openat ./my_program   # trace specific syscall
```

## Key Insights

- **Sampling** — understand this deeply and the rest of cpu profiling follows naturally.
- **Instrumentation** — understand this deeply and the rest of cpu profiling follows naturally.
- **Flame graph intuition** — understand this deeply and the rest of cpu profiling follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Memory profiling**, builds directly on these ideas. Allocation patterns and Working set extend what you've learned here into memory profiling.
