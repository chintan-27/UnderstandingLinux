---
id: 121
title: "Driver fundamentals"
part: "X"
supermoduleId: 10
estimatedMinutes: 60
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
# Driver fundamentals

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Driver fundamentals** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 6 interconnected topics: what a driver is, probing, binding, device IDs, resources, lifecycles. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### What a driver is

**What a driver is** is a foundational concept within driver fundamentals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding what a driver is allows you to reason about system behavior rather than treating it as a black box.

### Probing

**Probing** is a foundational concept within driver fundamentals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding probing allows you to reason about system behavior rather than treating it as a black box.

### Binding

**Binding** is a foundational concept within driver fundamentals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding binding allows you to reason about system behavior rather than treating it as a black box.

### Device IDs

**Device IDs** is a foundational concept within driver fundamentals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding device IDs allows you to reason about system behavior rather than treating it as a black box.

### Resources

**Resources** is a foundational concept within driver fundamentals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding resources allows you to reason about system behavior rather than treating it as a black box.

### Lifecycles

**Lifecycles** is a foundational concept within driver fundamentals. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding lifecycles allows you to reason about system behavior rather than treating it as a black box.

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

- **What a driver is** — understand this deeply and the rest of driver fundamentals follows naturally.
- **Probing** — understand this deeply and the rest of driver fundamentals follows naturally.
- **Binding** — understand this deeply and the rest of driver fundamentals follows naturally.
- **Device IDs** — understand this deeply and the rest of driver fundamentals follows naturally.
- **Resources** — understand this deeply and the rest of driver fundamentals follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Device model**, builds directly on these ideas. Buses and Devices extend what you've learned here into device model.
