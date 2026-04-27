---
id: 84
title: "I/O systems"
part: "VII"
supermoduleId: 7
estimatedMinutes: 50
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
# I/O systems

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**I/O systems** sits within Core Operating Systems (Supermodule 7). This module covers 4 interconnected topics: buffering, spooling, interrupt-driven I/O, DMA. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Buffering

**Buffering** is a foundational concept within i/o systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding buffering allows you to reason about system behavior rather than treating it as a black box.

### Spooling

**Spooling** is a foundational concept within i/o systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding spooling allows you to reason about system behavior rather than treating it as a black box.

### Interrupt-driven I/O

**Interrupt-driven I/O** is a foundational concept within i/o systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding interrupt-driven I/O allows you to reason about system behavior rather than treating it as a black box.

### DMA

**DMA** is a foundational concept within i/o systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding DMA allows you to reason about system behavior rather than treating it as a black box.

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

- **Buffering** — understand this deeply and the rest of i/o systems follows naturally.
- **Spooling** — understand this deeply and the rest of i/o systems follows naturally.
- **Interrupt-driven I/O** — understand this deeply and the rest of i/o systems follows naturally.
- **DMA** — understand this deeply and the rest of i/o systems follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Device abstraction**, builds directly on these ideas. Device models and Block vs character extend what you've learned here into device abstraction.
