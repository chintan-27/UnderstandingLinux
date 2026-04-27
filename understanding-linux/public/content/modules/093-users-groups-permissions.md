---
id: 93
title: "Users, groups, permissions"
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
# Users, groups, permissions

## Why This Matters

Linux userspace is where you interact with the system daily — shells, utilities, filesystems, services. Mastering it makes you productive.

**Users, groups, permissions** sits within Linux User Space and System Programming (Supermodule 8). This module covers 4 interconnected topics: ownership, mode bits, ACL concepts, sudo basics. Each builds on the previous, forming a coherent picture of how Linux userspace works at this level.

## Core Concepts

### Ownership

**Ownership** is a foundational concept within users, groups, permissions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding ownership allows you to reason about system behavior rather than treating it as a black box.

### Mode bits

**Mode bits** is a foundational concept within users, groups, permissions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding mode bits allows you to reason about system behavior rather than treating it as a black box.

### ACL concepts

**ACL concepts** is a foundational concept within users, groups, permissions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding ACL concepts allows you to reason about system behavior rather than treating it as a black box.

### Sudo basics

**Sudo basics** is a foundational concept within users, groups, permissions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding sudo basics allows you to reason about system behavior rather than treating it as a black box.

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

- **Ownership** — understand this deeply and the rest of users, groups, permissions follows naturally.
- **Mode bits** — understand this deeply and the rest of users, groups, permissions follows naturally.
- **ACL concepts** — understand this deeply and the rest of users, groups, permissions follows naturally.
- **Sudo basics** — understand this deeply and the rest of users, groups, permissions follows naturally.
- Think in terms of trade-offs: every design choice in Linux userspace sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Processes in practice**, builds directly on these ideas. Fork/exec and Signals extend what you've learned here into processes in practice.
