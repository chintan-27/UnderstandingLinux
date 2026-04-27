---
id: 118
title: "Security subsystems"
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
# Security subsystems

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Security subsystems** sits within Linux Kernel Internals (Supermodule 9). This module covers 4 interconnected topics: capabilities, LSM framework, seccomp, audit basics. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Capabilities

**Capabilities** is a foundational concept within security subsystems. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding capabilities allows you to reason about system behavior rather than treating it as a black box.

### LSM framework

**LSM framework** is a foundational concept within security subsystems. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding LSM framework allows you to reason about system behavior rather than treating it as a black box.

### Seccomp

**Seccomp** is a foundational concept within security subsystems. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding seccomp allows you to reason about system behavior rather than treating it as a black box.

### Audit basics

**Audit basics** is a foundational concept within security subsystems. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding audit basics allows you to reason about system behavior rather than treating it as a black box.

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

- **Capabilities** — understand this deeply and the rest of security subsystems follows naturally.
- **LSM framework** — understand this deeply and the rest of security subsystems follows naturally.
- **Seccomp** — understand this deeply and the rest of security subsystems follows naturally.
- **Audit basics** — understand this deeply and the rest of security subsystems follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Namespaces and cgroups**, builds directly on these ideas. Process isolation and Resource control extend what you've learned here into namespaces and cgroups.
