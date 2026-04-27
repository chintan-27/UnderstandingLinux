---
id: 123
title: "Platform devices and device tree / ACPI concepts"
part: "X"
supermoduleId: 10
estimatedMinutes: 40
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
# Platform devices and device tree / ACPI concepts

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Platform devices and device tree / ACPI concepts** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 2 interconnected topics: hardware description, enumeration models. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Hardware description

**Hardware description** is a foundational concept within platform devices and device tree / acpi concepts. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding hardware description allows you to reason about system behavior rather than treating it as a black box.

### Enumeration models

**Enumeration models** is a foundational concept within platform devices and device tree / acpi concepts. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding enumeration models allows you to reason about system behavior rather than treating it as a black box.

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

- **Hardware description** — understand this deeply and the rest of platform devices and device tree / acpi concepts follows naturally.
- **Enumeration models** — understand this deeply and the rest of platform devices and device tree / acpi concepts follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **PCI/PCIe drivers**, builds directly on these ideas. Enumeration and BARs extend what you've learned here into pci/pcie drivers.
