---
id: 108
title: "Interrupt handling"
part: "IX"
supermoduleId: 9
estimatedMinutes: 50
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
# Interrupt handling

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Interrupt handling** sits within Linux Kernel Internals (Supermodule 9). This module covers 4 interconnected topics: hard IRQ, softirq, tasklets history, threaded interrupts. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Hard IRQ

**Hard IRQ** is a foundational concept within interrupt handling. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding hard IRQ allows you to reason about system behavior rather than treating it as a black box.

### Softirq

**Softirq** is a foundational concept within interrupt handling. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding softirq allows you to reason about system behavior rather than treating it as a black box.

### Tasklets history

**Tasklets history** is a foundational concept within interrupt handling. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding tasklets history allows you to reason about system behavior rather than treating it as a black box.

### Threaded interrupts

**Threaded interrupts** is a foundational concept within interrupt handling. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding threaded interrupts allows you to reason about system behavior rather than treating it as a black box.

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

- **Hard IRQ** — understand this deeply and the rest of interrupt handling follows naturally.
- **Softirq** — understand this deeply and the rest of interrupt handling follows naturally.
- **Tasklets history** — understand this deeply and the rest of interrupt handling follows naturally.
- **Threaded interrupts** — understand this deeply and the rest of interrupt handling follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Timers and timekeeping**, builds directly on these ideas. Jiffies and Hrtimers extend what you've learned here into timers and timekeeping.
