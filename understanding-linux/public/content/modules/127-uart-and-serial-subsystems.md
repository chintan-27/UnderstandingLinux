---
id: 127
title: "UART and serial subsystems"
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
# UART and serial subsystems

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**UART and serial subsystems** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 3 interconnected topics: TTY layer, serial ports, consoles. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### TTY layer

**TTY layer** is a foundational concept within uart and serial subsystems. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding TTY layer allows you to reason about system behavior rather than treating it as a black box.

### Serial ports

**Serial ports** is a foundational concept within uart and serial subsystems. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding serial ports allows you to reason about system behavior rather than treating it as a black box.

### Consoles

**Consoles** is a foundational concept within uart and serial subsystems. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding consoles allows you to reason about system behavior rather than treating it as a black box.

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

- **TTY layer** — understand this deeply and the rest of uart and serial subsystems follows naturally.
- **Serial ports** — understand this deeply and the rest of uart and serial subsystems follows naturally.
- **Consoles** — understand this deeply and the rest of uart and serial subsystems follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **GPIO and pin control**, builds directly on these ideas. General purpose I/O and Pin multiplexing extend what you've learned here into gpio and pin control.
