---
id: 136
title: "Interrupt-driven and DMA-capable drivers"
part: "X"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (LDD3)"
    url: "https://lwn.net/Kernel/LDD3/"
  - type: article
    title: "Bootlin — Kernel Training Materials"
    url: "https://bootlin.com/doc/training/linux-kernel/"
  - type: article
    title: "The Linux Kernel Module Programming Guide"
    url: "https://sysprog21.github.io/lkmpg/"
---
# Interrupt-driven and DMA-capable drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Interrupt-driven and DMA-capable drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 3 interconnected topics: mapping memory, coherency, completion paths. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Mapping memory

**Mapping memory** is a foundational concept within interrupt-driven and dma-capable drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding mapping memory allows you to reason about system behavior rather than treating it as a black box.

### Coherency

**Coherency** is a foundational concept within interrupt-driven and dma-capable drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding coherency allows you to reason about system behavior rather than treating it as a black box.

### Completion paths

**Completion paths** is a foundational concept within interrupt-driven and dma-capable drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding completion paths allows you to reason about system behavior rather than treating it as a black box.

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

- **Mapping memory** — understand this deeply and the rest of interrupt-driven and dma-capable drivers follows naturally.
- **Coherency** — understand this deeply and the rest of interrupt-driven and dma-capable drivers follows naturally.
- **Completion paths** — understand this deeply and the rest of interrupt-driven and dma-capable drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Driver concurrency and synchronization**, builds directly on these ideas. Locks and IRQ-safe paths extend what you've learned here into driver concurrency and synchronization.
