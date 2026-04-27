---
id: 74
title: "What an OS does"
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
# What an OS does

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**What an OS does** sits within Core Operating Systems (Supermodule 7). This module covers 4 interconnected topics: abstraction, resource management, isolation, multiplexing. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Abstraction

**Abstraction** is a foundational concept within what an os does. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding abstraction allows you to reason about system behavior rather than treating it as a black box.

### Resource management

**Resource management** is a foundational concept within what an os does. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding resource management allows you to reason about system behavior rather than treating it as a black box.

### Isolation

**Isolation** is a foundational concept within what an os does. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding isolation allows you to reason about system behavior rather than treating it as a black box.

### Multiplexing

**Multiplexing** is a foundational concept within what an os does. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding multiplexing allows you to reason about system behavior rather than treating it as a black box.

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

- **Abstraction** — understand this deeply and the rest of what an os does follows naturally.
- **Resource management** — understand this deeply and the rest of what an os does follows naturally.
- **Isolation** — understand this deeply and the rest of what an os does follows naturally.
- **Multiplexing** — understand this deeply and the rest of what an os does follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Processes**, builds directly on these ideas. Process model and Process state extend what you've learned here into processes.
