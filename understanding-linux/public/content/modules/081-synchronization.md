---
id: 81
title: "Synchronization"
part: "VII"
supermoduleId: 7
estimatedMinutes: 55
resources:
  - type: book
    title: "Operating Systems: Three Easy Pieces"
    url: "https://pages.cs.wisc.edu/~remzi/OSTEP/"
  - type: video
    title: "MIT 6.S081 — Operating System Engineering"
    url: "https://pdos.csail.mit.edu/6.S081/2021/"
  - type: article
    title: "OSDev Wiki"
    url: "https://wiki.osdev.org/"
---
# Synchronization

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Synchronization** sits within Core Operating Systems (Supermodule 7). This module covers 5 interconnected topics: locks, semaphores, monitors, condition variables, atomics. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Locks

**Locks** is a foundational concept within synchronization. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding locks allows you to reason about system behavior rather than treating it as a black box.

### Semaphores

**Semaphores** is a foundational concept within synchronization. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding semaphores allows you to reason about system behavior rather than treating it as a black box.

### Monitors

**Monitors** is a foundational concept within synchronization. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding monitors allows you to reason about system behavior rather than treating it as a black box.

### Condition variables

**Condition variables** is a foundational concept within synchronization. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding condition variables allows you to reason about system behavior rather than treating it as a black box.

### Atomics

**Atomics** is a foundational concept within synchronization. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding atomics allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# Inspecting the Linux filesystem hierarchy
$ ls /proc/self/          # current process info
$ cat /proc/meminfo       # memory statistics
$ cat /proc/cpuinfo       # CPU details
$ ls /sys/class/net/      # network interfaces
$ mount | column -t       # mounted filesystems
```

## Key Insights

- **Locks** — understand this deeply and the rest of synchronization follows naturally.
- **Semaphores** — understand this deeply and the rest of synchronization follows naturally.
- **Monitors** — understand this deeply and the rest of synchronization follows naturally.
- **Condition variables** — understand this deeply and the rest of synchronization follows naturally.
- **Atomics** — understand this deeply and the rest of synchronization follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Deadlocks and liveness**, builds directly on these ideas. Deadlock conditions and Avoidance extend what you've learned here into deadlocks and liveness.
