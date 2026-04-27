---
id: 135
title: "Power management in drivers"
part: "X"
supermoduleId: 10
estimatedMinutes: 50
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
# Power management in drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Power management in drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 4 interconnected topics: suspend/resume, runtime PM, clock control, regulators. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Suspend/resume

**Suspend/resume** is a foundational concept within power management in drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding suspend/resume allows you to reason about system behavior rather than treating it as a black box.

### Runtime PM

**Runtime PM** is a foundational concept within power management in drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding runtime PM allows you to reason about system behavior rather than treating it as a black box.

### Clock control

**Clock control** is a foundational concept within power management in drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding clock control allows you to reason about system behavior rather than treating it as a black box.

### Regulators

**Regulators** is a foundational concept within power management in drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding regulators allows you to reason about system behavior rather than treating it as a black box.

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

- **Suspend/resume** — understand this deeply and the rest of power management in drivers follows naturally.
- **Runtime PM** — understand this deeply and the rest of power management in drivers follows naturally.
- **Clock control** — understand this deeply and the rest of power management in drivers follows naturally.
- **Regulators** — understand this deeply and the rest of power management in drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Interrupt-driven and DMA-capable drivers**, builds directly on these ideas. Mapping memory and Coherency extend what you've learned here into interrupt-driven and dma-capable drivers.
