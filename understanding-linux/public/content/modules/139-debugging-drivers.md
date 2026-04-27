---
id: 139
title: "Debugging drivers"
part: "X"
supermoduleId: 10
estimatedMinutes: 55
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
# Debugging drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Debugging drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 5 interconnected topics: dmesg, dynamic debug, tracepoints, lockdep, sanitizers. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Dmesg

**Dmesg** is a foundational concept within debugging drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding dmesg allows you to reason about system behavior rather than treating it as a black box.

### Dynamic debug

**Dynamic debug** is a foundational concept within debugging drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding dynamic debug allows you to reason about system behavior rather than treating it as a black box.

### Tracepoints

**Tracepoints** is a foundational concept within debugging drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding tracepoints allows you to reason about system behavior rather than treating it as a black box.

### Lockdep

**Lockdep** is a foundational concept within debugging drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding lockdep allows you to reason about system behavior rather than treating it as a black box.

### Sanitizers

**Sanitizers** is a foundational concept within debugging drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding sanitizers allows you to reason about system behavior rather than treating it as a black box.

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

- **Dmesg** — understand this deeply and the rest of debugging drivers follows naturally.
- **Dynamic debug** — understand this deeply and the rest of debugging drivers follows naturally.
- **Tracepoints** — understand this deeply and the rest of debugging drivers follows naturally.
- **Lockdep** — understand this deeply and the rest of debugging drivers follows naturally.
- **Sanitizers** — understand this deeply and the rest of debugging drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Security and robustness of drivers**, builds directly on these ideas. Input validation and Lifetime bugs extend what you've learned here into security and robustness of drivers.
