---
id: 76
title: "Threads"
part: "VII"
supermoduleId: 7
estimatedMinutes: 40
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
# Threads

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Threads** sits within Core Operating Systems (Supermodule 7). This module covers 2 interconnected topics: user vs kernel threads, concurrency models. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### User vs kernel threads

**User vs kernel threads** is a foundational concept within threads. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding user vs kernel threads allows you to reason about system behavior rather than treating it as a black box.

### Concurrency models

**Concurrency models** is a foundational concept within threads. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding concurrency models allows you to reason about system behavior rather than treating it as a black box.

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

- **User vs kernel threads** — understand this deeply and the rest of threads follows naturally.
- **Concurrency models** — understand this deeply and the rest of threads follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Scheduling**, builds directly on these ideas. Policies and Fairness extend what you've learned here into scheduling.
