---
id: 100
title: "Kernel high-level structure"
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
# Kernel high-level structure

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Kernel high-level structure** sits within Linux Kernel Internals (Supermodule 9). This module covers 4 interconnected topics: monolithic kernel, modules, subsystems, syscall boundary. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Monolithic kernel

**Monolithic kernel** is a foundational concept within kernel high-level structure. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding monolithic kernel allows you to reason about system behavior rather than treating it as a black box.

### Modules

**Modules** is a foundational concept within kernel high-level structure. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding modules allows you to reason about system behavior rather than treating it as a black box.

### Subsystems

**Subsystems** is a foundational concept within kernel high-level structure. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding subsystems allows you to reason about system behavior rather than treating it as a black box.

### Syscall boundary

**Syscall boundary** is a foundational concept within kernel high-level structure. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding syscall boundary allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```c
// System call entry path (simplified)
// 1. User calls libc wrapper: write(fd, buf, count)
// 2. libc executes: syscall instruction (x86-64)
//    - RAX = __NR_write (syscall number)
//    - RDI = fd, RSI = buf, RDX = count
// 3. CPU transitions to ring 0, jumps to entry_SYSCALL_64
// 4. Kernel saves registers, calls sys_write()
// 5. sys_write() does the work via VFS
// 6. Return value placed in RAX
// 7. sysret instruction returns to ring 3

// Trace it yourself:
// $ strace -e write echo "hello"
// write(1, "hello\n", 6) = 6
```

## Key Insights

- **Monolithic kernel** — understand this deeply and the rest of kernel high-level structure follows naturally.
- **Modules** — understand this deeply and the rest of kernel high-level structure follows naturally.
- **Subsystems** — understand this deeply and the rest of kernel high-level structure follows naturally.
- **Syscall boundary** — understand this deeply and the rest of kernel high-level structure follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Kernel source tree organization**, builds directly on these ideas. Arch and Mm extend what you've learned here into kernel source tree organization.
