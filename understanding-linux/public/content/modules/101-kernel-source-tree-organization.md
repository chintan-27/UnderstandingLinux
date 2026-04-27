---
id: 101
title: "Kernel source tree organization"
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
# Kernel source tree organization

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Kernel source tree organization** sits within Linux Kernel Internals (Supermodule 9). This module covers 8 interconnected topics: arch, mm, fs, net, drivers, kernel, lib, include. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Arch

**Arch** is a foundational concept within kernel source tree organization. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding arch allows you to reason about system behavior rather than treating it as a black box.

### Mm

**Mm** is a foundational concept within kernel source tree organization. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding mm allows you to reason about system behavior rather than treating it as a black box.

### Fs

**Fs** is a foundational concept within kernel source tree organization. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding fs allows you to reason about system behavior rather than treating it as a black box.

### Net

**Net** is a foundational concept within kernel source tree organization. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding net allows you to reason about system behavior rather than treating it as a black box.

### Drivers

**Drivers** is a foundational concept within kernel source tree organization. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding drivers allows you to reason about system behavior rather than treating it as a black box.

### Kernel

**Kernel** is a foundational concept within kernel source tree organization. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding kernel allows you to reason about system behavior rather than treating it as a black box.

### Lib

**Lib** is a foundational concept within kernel source tree organization. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding lib allows you to reason about system behavior rather than treating it as a black box.

### Include

**Include** is a foundational concept within kernel source tree organization. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding include allows you to reason about system behavior rather than treating it as a black box.

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

- **Arch** — understand this deeply and the rest of kernel source tree organization follows naturally.
- **Mm** — understand this deeply and the rest of kernel source tree organization follows naturally.
- **Fs** — understand this deeply and the rest of kernel source tree organization follows naturally.
- **Net** — understand this deeply and the rest of kernel source tree organization follows naturally.
- **Drivers** — understand this deeply and the rest of kernel source tree organization follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Boot path**, builds directly on these ideas. Firmware handoff and Bootloader extend what you've learned here into boot path.
