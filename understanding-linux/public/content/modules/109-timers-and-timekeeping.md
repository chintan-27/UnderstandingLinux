---
id: 109
title: "Timers and timekeeping"
part: "IX"
supermoduleId: 9
estimatedMinutes: 55
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
# Timers and timekeeping

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Timers and timekeeping** sits within Linux Kernel Internals (Supermodule 9). This module covers 5 interconnected topics: jiffies, hrtimers, clocksources, timers, scheduler clock. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Jiffies

**Jiffies** is a foundational concept within timers and timekeeping. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding jiffies allows you to reason about system behavior rather than treating it as a black box.

### Hrtimers

**Hrtimers** is a foundational concept within timers and timekeeping. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding hrtimers allows you to reason about system behavior rather than treating it as a black box.

### Clocksources

**Clocksources** is a foundational concept within timers and timekeeping. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding clocksources allows you to reason about system behavior rather than treating it as a black box.

### Timers

**Timers** is a foundational concept within timers and timekeeping. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding timers allows you to reason about system behavior rather than treating it as a black box.

### Scheduler clock

**Scheduler clock** is a foundational concept within timers and timekeeping. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding scheduler clock allows you to reason about system behavior rather than treating it as a black box.

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

- **Jiffies** — understand this deeply and the rest of timers and timekeeping follows naturally.
- **Hrtimers** — understand this deeply and the rest of timers and timekeeping follows naturally.
- **Clocksources** — understand this deeply and the rest of timers and timekeeping follows naturally.
- **Timers** — understand this deeply and the rest of timers and timekeeping follows naturally.
- **Scheduler clock** — understand this deeply and the rest of timers and timekeeping follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Synchronization in kernel**, builds directly on these ideas. Spinlocks and Mutexes extend what you've learned here into synchronization in kernel.
