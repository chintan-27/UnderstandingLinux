---
id: 112
title: "Block layer"
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
# Block layer

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Block layer** sits within Linux Kernel Internals (Supermodule 9). This module covers 4 interconnected topics: requests, queues, elevators, bio structures. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Requests

**Requests** is a foundational concept within block layer. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding requests allows you to reason about system behavior rather than treating it as a black box.

### Queues

**Queues** is a foundational concept within block layer. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding queues allows you to reason about system behavior rather than treating it as a black box.

### Elevators

**Elevators** is a foundational concept within block layer. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding elevators allows you to reason about system behavior rather than treating it as a black box.

### Bio structures

**Bio structures** is a foundational concept within block layer. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding bio structures allows you to reason about system behavior rather than treating it as a black box.

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

- **Requests** — understand this deeply and the rest of block layer follows naturally.
- **Queues** — understand this deeply and the rest of block layer follows naturally.
- **Elevators** — understand this deeply and the rest of block layer follows naturally.
- **Bio structures** — understand this deeply and the rest of block layer follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Character device infrastructure**, builds directly on these ideas. Device nodes and File operations extend what you've learned here into character device infrastructure.
