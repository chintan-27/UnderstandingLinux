---
id: 125
title: "USB drivers"
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
# USB drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**USB drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 5 interconnected topics: host controllers, endpoints, transfers, classes, hotplug. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Host controllers

**Host controllers** is a foundational concept within usb drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding host controllers allows you to reason about system behavior rather than treating it as a black box.

### Endpoints

**Endpoints** is a foundational concept within usb drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding endpoints allows you to reason about system behavior rather than treating it as a black box.

### Transfers

**Transfers** is a foundational concept within usb drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding transfers allows you to reason about system behavior rather than treating it as a black box.

### Classes

**Classes** is a foundational concept within usb drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding classes allows you to reason about system behavior rather than treating it as a black box.

### Hotplug

**Hotplug** is a foundational concept within usb drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding hotplug allows you to reason about system behavior rather than treating it as a black box.

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

- **Host controllers** — understand this deeply and the rest of usb drivers follows naturally.
- **Endpoints** — understand this deeply and the rest of usb drivers follows naturally.
- **Transfers** — understand this deeply and the rest of usb drivers follows naturally.
- **Classes** — understand this deeply and the rest of usb drivers follows naturally.
- **Hotplug** — understand this deeply and the rest of usb drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **I2C and SPI drivers**, builds directly on these ideas. Bus transactions and Peripherals extend what you've learned here into i2c and spi drivers.
