---
id: 188
title: "Linux observability tools"
part: "XV"
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
# Linux observability tools

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Linux observability tools** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 10 interconnected topics: ps, top, vmstat, iostat, sar, perf, strace, ltrace, ftrace, eBPF overview. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Ps

**Ps** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding ps allows you to reason about system behavior rather than treating it as a black box.

### Top

**Top** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding top allows you to reason about system behavior rather than treating it as a black box.

### Vmstat

**Vmstat** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding vmstat allows you to reason about system behavior rather than treating it as a black box.

### Iostat

**Iostat** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding iostat allows you to reason about system behavior rather than treating it as a black box.

### Sar

**Sar** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding sar allows you to reason about system behavior rather than treating it as a black box.

### Perf

**Perf** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding perf allows you to reason about system behavior rather than treating it as a black box.

### Strace

**Strace** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding strace allows you to reason about system behavior rather than treating it as a black box.

### Ltrace

**Ltrace** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding ltrace allows you to reason about system behavior rather than treating it as a black box.

### Ftrace

**Ftrace** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding ftrace allows you to reason about system behavior rather than treating it as a black box.

### EBPF overview

**EBPF overview** is a foundational concept within linux observability tools. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding eBPF overview allows you to reason about system behavior rather than treating it as a black box.

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

- **Ps** — understand this deeply and the rest of linux observability tools follows naturally.
- **Top** — understand this deeply and the rest of linux observability tools follows naturally.
- **Vmstat** — understand this deeply and the rest of linux observability tools follows naturally.
- **Iostat** — understand this deeply and the rest of linux observability tools follows naturally.
- **Sar** — understand this deeply and the rest of linux observability tools follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Benchmarking methodology**, builds directly on these ideas. Warmup and Noise extend what you've learned here into benchmarking methodology.
