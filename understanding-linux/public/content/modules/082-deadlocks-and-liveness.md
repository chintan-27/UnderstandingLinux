---
id: 82
title: "Deadlocks and liveness"
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
# Deadlocks and liveness

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Deadlocks and liveness** sits within Core Operating Systems (Supermodule 7). This module covers 4 interconnected topics: deadlock conditions, avoidance, starvation, fairness. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Deadlock conditions

**Deadlock conditions** is a foundational concept within deadlocks and liveness. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding deadlock conditions allows you to reason about system behavior rather than treating it as a black box.

### Avoidance

**Avoidance** is a foundational concept within deadlocks and liveness. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding avoidance allows you to reason about system behavior rather than treating it as a black box.

### Starvation

**Starvation** is a foundational concept within deadlocks and liveness. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding starvation allows you to reason about system behavior rather than treating it as a black box.

### Fairness

**Fairness** is a foundational concept within deadlocks and liveness. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding fairness allows you to reason about system behavior rather than treating it as a black box.

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

- **Deadlock conditions** — understand this deeply and the rest of deadlocks and liveness follows naturally.
- **Avoidance** — understand this deeply and the rest of deadlocks and liveness follows naturally.
- **Starvation** — understand this deeply and the rest of deadlocks and liveness follows naturally.
- **Fairness** — understand this deeply and the rest of deadlocks and liveness follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **File systems**, builds directly on these ideas. Files and Directories extend what you've learned here into file systems.
