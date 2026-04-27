---
id: 120
title: "Kernel configuration and build"
part: "IX"
supermoduleId: 9
estimatedMinutes: 50
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
# Kernel configuration and build

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Kernel configuration and build** sits within Linux Kernel Internals (Supermodule 9). This module covers 4 interconnected topics: Kconfig, Makefiles, modules vs built-in, image generation. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Kconfig

**Kconfig** is a foundational concept within kernel configuration and build. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding Kconfig allows you to reason about system behavior rather than treating it as a black box.

### Makefiles

**Makefiles** is a foundational concept within kernel configuration and build. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding Makefiles allows you to reason about system behavior rather than treating it as a black box.

### Modules vs built-in

**Modules vs built-in** is a foundational concept within kernel configuration and build. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding modules vs built-in allows you to reason about system behavior rather than treating it as a black box.

### Image generation

**Image generation** is a foundational concept within kernel configuration and build. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding image generation allows you to reason about system behavior rather than treating it as a black box.

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

- **Kconfig** — understand this deeply and the rest of kernel configuration and build follows naturally.
- **Makefiles** — understand this deeply and the rest of kernel configuration and build follows naturally.
- **Modules vs built-in** — understand this deeply and the rest of kernel configuration and build follows naturally.
- **Image generation** — understand this deeply and the rest of kernel configuration and build follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Driver fundamentals**, builds directly on these ideas. What a driver is and Probing extend what you've learned here into driver fundamentals.
