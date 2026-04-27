---
id: 83
title: "File systems"
part: "VII"
supermoduleId: 7
estimatedMinutes: 60
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
# File systems

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**File systems** sits within Core Operating Systems (Supermodule 7). This module covers 6 interconnected topics: files, directories, metadata, naming, consistency, journaling. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Files

**Files** is a foundational concept within file systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding files allows you to reason about system behavior rather than treating it as a black box.

### Directories

**Directories** is a foundational concept within file systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding directories allows you to reason about system behavior rather than treating it as a black box.

### Metadata

**Metadata** is a foundational concept within file systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding metadata allows you to reason about system behavior rather than treating it as a black box.

### Naming

**Naming** is a foundational concept within file systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding naming allows you to reason about system behavior rather than treating it as a black box.

### Consistency

**Consistency** is a foundational concept within file systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding consistency allows you to reason about system behavior rather than treating it as a black box.

### Journaling

**Journaling** is a foundational concept within file systems. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding journaling allows you to reason about system behavior rather than treating it as a black box.

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

- **Files** — understand this deeply and the rest of file systems follows naturally.
- **Directories** — understand this deeply and the rest of file systems follows naturally.
- **Metadata** — understand this deeply and the rest of file systems follows naturally.
- **Naming** — understand this deeply and the rest of file systems follows naturally.
- **Consistency** — understand this deeply and the rest of file systems follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **I/O systems**, builds directly on these ideas. Buffering and Spooling extend what you've learned here into i/o systems.
