---
id: 85
title: "Device abstraction"
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
# Device abstraction

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Device abstraction** sits within Core Operating Systems (Supermodule 7). This module covers 3 interconnected topics: device models, block vs character, control paths. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Device models

**Device models** is a foundational concept within device abstraction. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding device models allows you to reason about system behavior rather than treating it as a black box.

### Block vs character

**Block vs character** is a foundational concept within device abstraction. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding block vs character allows you to reason about system behavior rather than treating it as a black box.

### Control paths

**Control paths** is a foundational concept within device abstraction. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding control paths allows you to reason about system behavior rather than treating it as a black box.

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

- **Device models** — understand this deeply and the rest of device abstraction follows naturally.
- **Block vs character** — understand this deeply and the rest of device abstraction follows naturally.
- **Control paths** — understand this deeply and the rest of device abstraction follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **IPC**, builds directly on these ideas. Pipes and Message queues extend what you've learned here into ipc.
