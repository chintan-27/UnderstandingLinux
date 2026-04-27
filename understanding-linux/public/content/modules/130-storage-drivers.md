---
id: 130
title: "Storage drivers"
part: "X"
supermoduleId: 10
estimatedMinutes: 50
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
# Storage drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Storage drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 4 interconnected topics: SATA, NVMe concepts, SCSI layer, block interfaces. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### SATA

**SATA** is a foundational concept within storage drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding SATA allows you to reason about system behavior rather than treating it as a black box.

### NVMe concepts

**NVMe concepts** is a foundational concept within storage drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding NVMe concepts allows you to reason about system behavior rather than treating it as a black box.

### SCSI layer

**SCSI layer** is a foundational concept within storage drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding SCSI layer allows you to reason about system behavior rather than treating it as a black box.

### Block interfaces

**Block interfaces** is a foundational concept within storage drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding block interfaces allows you to reason about system behavior rather than treating it as a black box.

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

- **SATA** — understand this deeply and the rest of storage drivers follows naturally.
- **NVMe concepts** — understand this deeply and the rest of storage drivers follows naturally.
- **SCSI layer** — understand this deeply and the rest of storage drivers follows naturally.
- **Block interfaces** — understand this deeply and the rest of storage drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Network drivers**, builds directly on these ideas. NIC initialization and RX/TX rings extend what you've learned here into network drivers.
