---
id: 78
title: "Context switching"
part: "VII"
supermoduleId: 7
estimatedMinutes: 45
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
# Context switching

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Context switching** sits within Core Operating Systems (Supermodule 7). This module covers 3 interconnected topics: register state, MMU context, kernel entry/exit costs. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Register state

**Register state** is a foundational concept within context switching. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding register state allows you to reason about system behavior rather than treating it as a black box.

### MMU context

**MMU context** is a foundational concept within context switching. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding MMU context allows you to reason about system behavior rather than treating it as a black box.

### Kernel entry/exit costs

**Kernel entry/exit costs** is a foundational concept within context switching. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding kernel entry/exit costs allows you to reason about system behavior rather than treating it as a black box.

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

- **Register state** — understand this deeply and the rest of context switching follows naturally.
- **MMU context** — understand this deeply and the rest of context switching follows naturally.
- **Kernel entry/exit costs** — understand this deeply and the rest of context switching follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Memory management**, builds directly on these ideas. Allocation and Fragmentation extend what you've learned here into memory management.
