---
id: 124
title: "PCI/PCIe drivers"
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
# PCI/PCIe drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**PCI/PCIe drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 5 interconnected topics: enumeration, BARs, interrupts, DMA, config space. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Enumeration

**Enumeration** is a foundational concept within pci/pcie drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding enumeration allows you to reason about system behavior rather than treating it as a black box.

### BARs

**BARs** is a foundational concept within pci/pcie drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding BARs allows you to reason about system behavior rather than treating it as a black box.

### Interrupts

**Interrupts** is a foundational concept within pci/pcie drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding interrupts allows you to reason about system behavior rather than treating it as a black box.

### DMA

**DMA** is a foundational concept within pci/pcie drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding DMA allows you to reason about system behavior rather than treating it as a black box.

### Config space

**Config space** is a foundational concept within pci/pcie drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding config space allows you to reason about system behavior rather than treating it as a black box.

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

- **Enumeration** — understand this deeply and the rest of pci/pcie drivers follows naturally.
- **BARs** — understand this deeply and the rest of pci/pcie drivers follows naturally.
- **Interrupts** — understand this deeply and the rest of pci/pcie drivers follows naturally.
- **DMA** — understand this deeply and the rest of pci/pcie drivers follows naturally.
- **Config space** — understand this deeply and the rest of pci/pcie drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **USB drivers**, builds directly on these ideas. Host controllers and Endpoints extend what you've learned here into usb drivers.
