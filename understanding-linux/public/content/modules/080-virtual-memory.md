---
id: 80
title: "Virtual memory"
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
# Virtual memory

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Virtual memory** sits within Core Operating Systems (Supermodule 7). This module covers 5 interconnected topics: address spaces, translation, protection, copy-on-write, mmap. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Address spaces

**Address spaces** is a foundational concept within virtual memory. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding address spaces allows you to reason about system behavior rather than treating it as a black box.

### Translation

**Translation** is a foundational concept within virtual memory. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding translation allows you to reason about system behavior rather than treating it as a black box.

### Protection

**Protection** is a foundational concept within virtual memory. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding protection allows you to reason about system behavior rather than treating it as a black box.

### Copy-on-write

**Copy-on-write** is a foundational concept within virtual memory. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding copy-on-write allows you to reason about system behavior rather than treating it as a black box.

### Mmap

**Mmap** is a foundational concept within virtual memory. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding mmap allows you to reason about system behavior rather than treating it as a black box.

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

- **Address spaces** — understand this deeply and the rest of virtual memory follows naturally.
- **Translation** — understand this deeply and the rest of virtual memory follows naturally.
- **Protection** — understand this deeply and the rest of virtual memory follows naturally.
- **Copy-on-write** — understand this deeply and the rest of virtual memory follows naturally.
- **Mmap** — understand this deeply and the rest of virtual memory follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Synchronization**, builds directly on these ideas. Locks and Semaphores extend what you've learned here into synchronization.
