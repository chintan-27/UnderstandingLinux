---
id: 126
title: "I2C and SPI drivers"
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
# I2C and SPI drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**I2C and SPI drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 4 interconnected topics: bus transactions, peripherals, sensors, embedded devices. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Bus transactions

**Bus transactions** is a foundational concept within i2c and spi drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding bus transactions allows you to reason about system behavior rather than treating it as a black box.

### Peripherals

**Peripherals** is a foundational concept within i2c and spi drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding peripherals allows you to reason about system behavior rather than treating it as a black box.

### Sensors

**Sensors** is a foundational concept within i2c and spi drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding sensors allows you to reason about system behavior rather than treating it as a black box.

### Embedded devices

**Embedded devices** is a foundational concept within i2c and spi drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding embedded devices allows you to reason about system behavior rather than treating it as a black box.

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

- **Bus transactions** — understand this deeply and the rest of i2c and spi drivers follows naturally.
- **Peripherals** — understand this deeply and the rest of i2c and spi drivers follows naturally.
- **Sensors** — understand this deeply and the rest of i2c and spi drivers follows naturally.
- **Embedded devices** — understand this deeply and the rest of i2c and spi drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **UART and serial subsystems**, builds directly on these ideas. TTY layer and Serial ports extend what you've learned here into uart and serial subsystems.
