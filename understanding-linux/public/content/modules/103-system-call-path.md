---
id: 103
title: "System call path"
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
# System call path

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**System call path** sits within Linux Kernel Internals (Supermodule 9). This module covers 4 interconnected topics: entry, dispatch, privilege transition, return to userspace. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Entry

**Entry** is a foundational concept within system call path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding entry allows you to reason about system behavior rather than treating it as a black box.

### Dispatch

**Dispatch** is a foundational concept within system call path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding dispatch allows you to reason about system behavior rather than treating it as a black box.

### Privilege transition

**Privilege transition** is a foundational concept within system call path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding privilege transition allows you to reason about system behavior rather than treating it as a black box.

### Return to userspace

**Return to userspace** is a foundational concept within system call path. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding return to userspace allows you to reason about system behavior rather than treating it as a black box.

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

- **Entry** — understand this deeply and the rest of system call path follows naturally.
- **Dispatch** — understand this deeply and the rest of system call path follows naturally.
- **Privilege transition** — understand this deeply and the rest of system call path follows naturally.
- **Return to userspace** — understand this deeply and the rest of system call path follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Process and task model**, builds directly on these ideas. Task_struct and Scheduling entities extend what you've learned here into process and task model.
