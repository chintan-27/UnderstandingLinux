---
id: 102
title: "Boot path"
part: "IX"
supermoduleId: 9
estimatedMinutes: 60
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
# Boot path

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Boot path** sits within Linux Kernel Internals (Supermodule 9). This module covers 6 interconnected topics: firmware handoff, bootloader, kernel decompression, early init, initramfs, userspace init. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Firmware handoff

**Firmware handoff** is a foundational concept within boot path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding firmware handoff allows you to reason about system behavior rather than treating it as a black box.

### Bootloader

**Bootloader** is a foundational concept within boot path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding bootloader allows you to reason about system behavior rather than treating it as a black box.

### Kernel decompression

**Kernel decompression** is a foundational concept within boot path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding kernel decompression allows you to reason about system behavior rather than treating it as a black box.

### Early init

**Early init** is a foundational concept within boot path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding early init allows you to reason about system behavior rather than treating it as a black box.

### Initramfs

**Initramfs** is a foundational concept within boot path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding initramfs allows you to reason about system behavior rather than treating it as a black box.

### Userspace init

**Userspace init** is a foundational concept within boot path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding userspace init allows you to reason about system behavior rather than treating it as a black box.

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

- **Firmware handoff** — understand this deeply and the rest of boot path follows naturally.
- **Bootloader** — understand this deeply and the rest of boot path follows naturally.
- **Kernel decompression** — understand this deeply and the rest of boot path follows naturally.
- **Early init** — understand this deeply and the rest of boot path follows naturally.
- **Initramfs** — understand this deeply and the rest of boot path follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **System call path**, builds directly on these ideas. Entry and Dispatch extend what you've learned here into system call path.
