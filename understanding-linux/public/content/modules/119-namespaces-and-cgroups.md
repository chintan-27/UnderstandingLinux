---
id: 119
title: "Namespaces and cgroups"
part: "IX"
supermoduleId: 9
estimatedMinutes: 45
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
# Namespaces and cgroups

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Namespaces and cgroups** sits within Linux Kernel Internals (Supermodule 9). This module covers 3 interconnected topics: process isolation, resource control, container primitives. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Process isolation

**Process isolation** is a foundational concept within namespaces and cgroups. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding process isolation allows you to reason about system behavior rather than treating it as a black box.

### Resource control

**Resource control** is a foundational concept within namespaces and cgroups. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding resource control allows you to reason about system behavior rather than treating it as a black box.

### Container primitives

**Container primitives** is a foundational concept within namespaces and cgroups. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding container primitives allows you to reason about system behavior rather than treating it as a black box.

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

- **Process isolation** — understand this deeply and the rest of namespaces and cgroups follows naturally.
- **Resource control** — understand this deeply and the rest of namespaces and cgroups follows naturally.
- **Container primitives** — understand this deeply and the rest of namespaces and cgroups follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Kernel configuration and build**, builds directly on these ideas. Kconfig and Makefiles extend what you've learned here into kernel configuration and build.
