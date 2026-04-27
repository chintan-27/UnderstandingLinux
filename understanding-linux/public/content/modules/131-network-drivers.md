---
id: 131
title: "Network drivers"
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
# Network drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Network drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 5 interconnected topics: NIC initialization, RX/TX rings, NAPI, interrupts, offloads. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### NIC initialization

**NIC initialization** is a foundational concept within network drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding NIC initialization allows you to reason about system behavior rather than treating it as a black box.

### RX/TX rings

**RX/TX rings** is a foundational concept within network drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding RX/TX rings allows you to reason about system behavior rather than treating it as a black box.

### NAPI

**NAPI** is a foundational concept within network drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding NAPI allows you to reason about system behavior rather than treating it as a black box.

### Interrupts

**Interrupts** is a foundational concept within network drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding interrupts allows you to reason about system behavior rather than treating it as a black box.

### Offloads

**Offloads** is a foundational concept within network drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding offloads allows you to reason about system behavior rather than treating it as a black box.

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

- **NIC initialization** — understand this deeply and the rest of network drivers follows naturally.
- **RX/TX rings** — understand this deeply and the rest of network drivers follows naturally.
- **NAPI** — understand this deeply and the rest of network drivers follows naturally.
- **Interrupts** — understand this deeply and the rest of network drivers follows naturally.
- **Offloads** — understand this deeply and the rest of network drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Graphics drivers**, builds directly on these ideas. DRM/KMS concepts and Framebuffer history extend what you've learned here into graphics drivers.
