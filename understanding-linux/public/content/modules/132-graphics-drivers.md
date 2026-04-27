---
id: 132
title: "Graphics drivers"
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
# Graphics drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Graphics drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 3 interconnected topics: DRM/KMS concepts, framebuffer history, display pipelines. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### DRM/KMS concepts

**DRM/KMS concepts** is a foundational concept within graphics drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding DRM/KMS concepts allows you to reason about system behavior rather than treating it as a black box.

### Framebuffer history

**Framebuffer history** is a foundational concept within graphics drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding framebuffer history allows you to reason about system behavior rather than treating it as a black box.

### Display pipelines

**Display pipelines** is a foundational concept within graphics drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding display pipelines allows you to reason about system behavior rather than treating it as a black box.

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

- **DRM/KMS concepts** — understand this deeply and the rest of graphics drivers follows naturally.
- **Framebuffer history** — understand this deeply and the rest of graphics drivers follows naturally.
- **Display pipelines** — understand this deeply and the rest of graphics drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Audio drivers**, builds directly on these ideas. ALSA concepts and PCM extend what you've learned here into audio drivers.
