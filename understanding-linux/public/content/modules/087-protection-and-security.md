---
id: 87
title: "Protection and security"
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
# Protection and security

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Protection and security** sits within Core Operating Systems (Supermodule 7). This module covers 4 interconnected topics: users, permissions, privilege, authentication basics. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Users

**Users** is a foundational concept within protection and security. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding users allows you to reason about system behavior rather than treating it as a black box.

### Permissions

**Permissions** is a foundational concept within protection and security. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding permissions allows you to reason about system behavior rather than treating it as a black box.

### Privilege

**Privilege** is a foundational concept within protection and security. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding privilege allows you to reason about system behavior rather than treating it as a black box.

### Authentication basics

**Authentication basics** is a foundational concept within protection and security. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding authentication basics allows you to reason about system behavior rather than treating it as a black box.

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

- **Users** — understand this deeply and the rest of protection and security follows naturally.
- **Permissions** — understand this deeply and the rest of protection and security follows naturally.
- **Privilege** — understand this deeply and the rest of protection and security follows naturally.
- **Authentication basics** — understand this deeply and the rest of protection and security follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Distributed OS ideas**, builds directly on these ideas. Naming and Location transparency extend what you've learned here into distributed os ideas.
