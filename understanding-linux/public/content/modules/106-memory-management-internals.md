---
id: 106
title: "Memory management internals"
part: "IX"
supermoduleId: 9
estimatedMinutes: 60
resources:
  - type: book
    title: "Linux Kernel Development (Robert Love)"
    url: "https://www.oreilly.com/library/view/linux-kernel-development/9780768696974/"
  - type: article
    title: "Kernel Newbies"
    url: "https://kernelnewbies.org/"
  - type: article
    title: "LWN.net — Linux Weekly News"
    url: "https://lwn.net/"
---
# Memory management internals

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Memory management internals** sits within Linux Kernel Internals (Supermodule 9). This module covers 6 interconnected topics: pages, zones, buddy allocator, slab/slub, page cache, reclaim. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Pages

**Pages** is a foundational concept within memory management internals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding pages allows you to reason about system behavior rather than treating it as a black box.

### Zones

**Zones** is a foundational concept within memory management internals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding zones allows you to reason about system behavior rather than treating it as a black box.

### Buddy allocator

**Buddy allocator** is a foundational concept within memory management internals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding buddy allocator allows you to reason about system behavior rather than treating it as a black box.

### Slab/slub

**Slab/slub** is a foundational concept within memory management internals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding slab/slub allows you to reason about system behavior rather than treating it as a black box.

### Page cache

**Page cache** is a foundational concept within memory management internals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding page cache allows you to reason about system behavior rather than treating it as a black box.

### Reclaim

**Reclaim** is a foundational concept within memory management internals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding reclaim allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# Kernel introspection commands
$ uname -r                         # kernel version
$ cat /proc/version                # build info
$ zcat /proc/config.gz | grep SMP  # kernel config
$ dmesg | tail -20                 # kernel log
$ cat /proc/kallsyms | head        # kernel symbol table
$ ls /sys/module/                  # loaded modules
```

## Key Insights

- **Pages** — understand this deeply and the rest of memory management internals follows naturally.
- **Zones** — understand this deeply and the rest of memory management internals follows naturally.
- **Buddy allocator** — understand this deeply and the rest of memory management internals follows naturally.
- **Slab/slub** — understand this deeply and the rest of memory management internals follows naturally.
- **Page cache** — understand this deeply and the rest of memory management internals follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Virtual memory areas**, builds directly on these ideas. Mappings and Faults extend what you've learned here into virtual memory areas.
