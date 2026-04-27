---
id: 128
title: "GPIO and pin control"
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
# GPIO and pin control

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**GPIO and pin control** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 3 interconnected topics: general purpose I/O, pin multiplexing, interrupts. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### General purpose I/O

**General purpose I/O** is a foundational concept within gpio and pin control. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding general purpose I/O allows you to reason about system behavior rather than treating it as a black box.

### Pin multiplexing

**Pin multiplexing** is a foundational concept within gpio and pin control. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding pin multiplexing allows you to reason about system behavior rather than treating it as a black box.

### Interrupts

**Interrupts** is a foundational concept within gpio and pin control. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding interrupts allows you to reason about system behavior rather than treating it as a black box.

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

- **General purpose I/O** — understand this deeply and the rest of gpio and pin control follows naturally.
- **Pin multiplexing** — understand this deeply and the rest of gpio and pin control follows naturally.
- **Interrupts** — understand this deeply and the rest of gpio and pin control follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Input subsystem**, builds directly on these ideas. Keyboards and Mice extend what you've learned here into input subsystem.
