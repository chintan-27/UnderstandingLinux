---
id: 122
title: "Device model"
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
# Device model

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Device model** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 5 interconnected topics: buses, devices, drivers, classes, sysfs representation. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Buses

**Buses** is a foundational concept within device model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding buses allows you to reason about system behavior rather than treating it as a black box.

### Devices

**Devices** is a foundational concept within device model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding devices allows you to reason about system behavior rather than treating it as a black box.

### Drivers

**Drivers** is a foundational concept within device model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding drivers allows you to reason about system behavior rather than treating it as a black box.

### Classes

**Classes** is a foundational concept within device model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding classes allows you to reason about system behavior rather than treating it as a black box.

### Sysfs representation

**Sysfs representation** is a foundational concept within device model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding sysfs representation allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```c
// Minimal Linux kernel module
#include <linux/module.h>
#include <linux/init.h>

static int __init hello_init(void) {
    pr_info("hello: module loaded\n");
    return 0;
}

static void __exit hello_exit(void) {
    pr_info("hello: module unloaded\n");
}

module_init(hello_init);
module_exit(hello_exit);
MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Minimal example module");
```

## Key Insights

- **Buses** — understand this deeply and the rest of device model follows naturally.
- **Devices** — understand this deeply and the rest of device model follows naturally.
- **Drivers** — understand this deeply and the rest of device model follows naturally.
- **Classes** — understand this deeply and the rest of device model follows naturally.
- **Sysfs representation** — understand this deeply and the rest of device model follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Platform devices and device tree / ACPI concepts**, builds directly on these ideas. Hardware description and Enumeration models extend what you've learned here into platform devices and device tree / acpi concepts.
