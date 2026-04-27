---
id: 77
title: "Scheduling"
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
# Scheduling

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Scheduling** sits within Core Operating Systems (Supermodule 7). This module covers 5 interconnected topics: policies, fairness, latency, throughput, real-time concepts. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Policies

**Policies** is a foundational concept within scheduling. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding policies allows you to reason about system behavior rather than treating it as a black box.

### Fairness

**Fairness** is a foundational concept within scheduling. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding fairness allows you to reason about system behavior rather than treating it as a black box.

### Latency

**Latency** is a foundational concept within scheduling. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding latency allows you to reason about system behavior rather than treating it as a black box.

### Throughput

**Throughput** is a foundational concept within scheduling. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding throughput allows you to reason about system behavior rather than treating it as a black box.

### Real-time concepts

**Real-time concepts** is a foundational concept within scheduling. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding real-time concepts allows you to reason about system behavior rather than treating it as a black box.

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

- **Policies** — understand this deeply and the rest of scheduling follows naturally.
- **Fairness** — understand this deeply and the rest of scheduling follows naturally.
- **Latency** — understand this deeply and the rest of scheduling follows naturally.
- **Throughput** — understand this deeply and the rest of scheduling follows naturally.
- **Real-time concepts** — understand this deeply and the rest of scheduling follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Context switching**, builds directly on these ideas. Register state and MMU context extend what you've learned here into context switching.
