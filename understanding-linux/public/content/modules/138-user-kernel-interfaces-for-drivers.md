---
id: 138
title: "User-kernel interfaces for drivers"
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
# User-kernel interfaces for drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**User-kernel interfaces for drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 7 interconnected topics: ioctl, sysfs, procfs, netlink, mmap, read/write, poll. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### Ioctl

**Ioctl** is a foundational concept within user-kernel interfaces for drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding ioctl allows you to reason about system behavior rather than treating it as a black box.

### Sysfs

**Sysfs** is a foundational concept within user-kernel interfaces for drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding sysfs allows you to reason about system behavior rather than treating it as a black box.

### Procfs

**Procfs** is a foundational concept within user-kernel interfaces for drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding procfs allows you to reason about system behavior rather than treating it as a black box.

### Netlink

**Netlink** is a foundational concept within user-kernel interfaces for drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding netlink allows you to reason about system behavior rather than treating it as a black box.

### Mmap

**Mmap** is a foundational concept within user-kernel interfaces for drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding mmap allows you to reason about system behavior rather than treating it as a black box.

### Read/write

**Read/write** is a foundational concept within user-kernel interfaces for drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding read/write allows you to reason about system behavior rather than treating it as a black box.

### Poll

**Poll** is a foundational concept within user-kernel interfaces for drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding poll allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```c
// Simplified view of task_struct (kernel/sched/sched.h)
struct task_struct {
    volatile long         state;       // TASK_RUNNING, etc.
    struct thread_info    thread_info;
    unsigned int          flags;
    int                   prio;        // dynamic priority
    int                   static_prio; // nice-based
    struct sched_entity   se;          // CFS scheduling entity
    struct mm_struct      *mm;         // memory descriptor
    pid_t                 pid;
    pid_t                 tgid;        // thread group ID
    struct task_struct    *parent;
    struct list_head      children;
    struct files_struct   *files;      // open file table
    // ... hundreds more fields
};
```

## Key Insights

- **Ioctl** — understand this deeply and the rest of user-kernel interfaces for drivers follows naturally.
- **Sysfs** — understand this deeply and the rest of user-kernel interfaces for drivers follows naturally.
- **Procfs** — understand this deeply and the rest of user-kernel interfaces for drivers follows naturally.
- **Netlink** — understand this deeply and the rest of user-kernel interfaces for drivers follows naturally.
- **Mmap** — understand this deeply and the rest of user-kernel interfaces for drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Debugging drivers**, builds directly on these ideas. Dmesg and Dynamic debug extend what you've learned here into debugging drivers.
