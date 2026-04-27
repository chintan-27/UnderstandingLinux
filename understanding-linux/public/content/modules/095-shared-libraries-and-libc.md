---
id: 95
title: "Shared libraries and libc"
part: "VIII"
supermoduleId: 8
estimatedMinutes: 50
resources:
  - type: book
    title: "The Linux Command Line (William Shotts)"
    url: "https://linuxcommand.org/tlcl.php"
  - type: article
    title: "Linux man pages online"
    url: "https://man7.org/linux/man-pages/"
  - type: article
    title: "ArchWiki"
    url: "https://wiki.archlinux.org/"
---
# Shared libraries and libc

## Why This Matters

Linux userspace is where you interact with the system daily — shells, utilities, filesystems, services. Mastering it makes you productive.

**Shared libraries and libc** sits within Linux User Space and System Programming (Supermodule 8). This module covers 4 interconnected topics: libc role, dynamic loader, ABI, API vs ABI. Each builds on the previous, forming a coherent picture of how Linux userspace works at this level.

## Core Concepts

### Libc role

**Libc role** is a foundational concept within shared libraries and libc. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding libc role allows you to reason about system behavior rather than treating it as a black box.

### Dynamic loader

**Dynamic loader** is a foundational concept within shared libraries and libc. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding dynamic loader allows you to reason about system behavior rather than treating it as a black box.

### ABI

**ABI** is a foundational concept within shared libraries and libc. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding ABI allows you to reason about system behavior rather than treating it as a black box.

### API vs ABI

**API vs ABI** is a foundational concept within shared libraries and libc. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding API vs ABI allows you to reason about system behavior rather than treating it as a black box.

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

- **Libc role** — understand this deeply and the rest of shared libraries and libc follows naturally.
- **Dynamic loader** — understand this deeply and the rest of shared libraries and libc follows naturally.
- **ABI** — understand this deeply and the rest of shared libraries and libc follows naturally.
- **API vs ABI** — understand this deeply and the rest of shared libraries and libc follows naturally.
- Think in terms of trade-offs: every design choice in Linux userspace sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Init and service management**, builds directly on these ideas. Init concepts and Service lifecycle extend what you've learned here into init and service management.
