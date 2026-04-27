---
id: 114
title: "Module system"
part: "IX"
supermoduleId: 9
estimatedMinutes: 45
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
# Module system

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Module system** sits within Linux Kernel Internals (Supermodule 9). This module covers 3 interconnected topics: loadable modules, symbol export, taint basics. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Loadable modules

**Loadable modules** is a foundational concept within module system. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding loadable modules allows you to reason about system behavior rather than treating it as a black box.

### Symbol export

**Symbol export** is a foundational concept within module system. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding symbol export allows you to reason about system behavior rather than treating it as a black box.

### Taint basics

**Taint basics** is a foundational concept within module system. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding taint basics allows you to reason about system behavior rather than treating it as a black box.

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

- **Loadable modules** — understand this deeply and the rest of module system follows naturally.
- **Symbol export** — understand this deeply and the rest of module system follows naturally.
- **Taint basics** — understand this deeply and the rest of module system follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Kernel memory allocation APIs**, builds directly on these ideas. Kmalloc and Vmalloc extend what you've learned here into kernel memory allocation apis.
