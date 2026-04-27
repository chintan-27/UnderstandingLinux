---
id: 79
title: "Memory management"
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
# Memory management

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Memory management** sits within Core Operating Systems (Supermodule 7). This module covers 5 interconnected topics: allocation, fragmentation, paging, segmentation history, demand paging. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Allocation

**Allocation** is a foundational concept within memory management. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding allocation allows you to reason about system behavior rather than treating it as a black box.

### Fragmentation

**Fragmentation** is a foundational concept within memory management. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding fragmentation allows you to reason about system behavior rather than treating it as a black box.

### Paging

**Paging** is a foundational concept within memory management. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding paging allows you to reason about system behavior rather than treating it as a black box.

### Segmentation history

**Segmentation history** is a foundational concept within memory management. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding segmentation history allows you to reason about system behavior rather than treating it as a black box.

### Demand paging

**Demand paging** is a foundational concept within memory management. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding demand paging allows you to reason about system behavior rather than treating it as a black box.

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

- **Allocation** — understand this deeply and the rest of memory management follows naturally.
- **Fragmentation** — understand this deeply and the rest of memory management follows naturally.
- **Paging** — understand this deeply and the rest of memory management follows naturally.
- **Segmentation history** — understand this deeply and the rest of memory management follows naturally.
- **Demand paging** — understand this deeply and the rest of memory management follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Virtual memory**, builds directly on these ideas. Address spaces and Translation extend what you've learned here into virtual memory.
