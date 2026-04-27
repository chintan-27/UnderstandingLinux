---
id: 92
title: "Filesystem hierarchy and conventions"
part: "VIII"
supermoduleId: 8
estimatedMinutes: 60
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
# Filesystem hierarchy and conventions

## Why This Matters

Linux userspace is where you interact with the system daily — shells, utilities, filesystems, services. Mastering it makes you productive.

**Filesystem hierarchy and conventions** sits within Linux User Space and System Programming (Supermodule 8). This module covers 8 interconnected topics: `/bin`, `/usr`, `/etc`, `/proc`, `/sys`, `/dev`, `/var`, `/home`. Each builds on the previous, forming a coherent picture of how Linux userspace works at this level.

## Core Concepts

### `/bin`

**`/bin`** is a foundational concept within filesystem hierarchy and conventions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding `/bin` allows you to reason about system behavior rather than treating it as a black box.

### `/usr`

**`/usr`** is a foundational concept within filesystem hierarchy and conventions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding `/usr` allows you to reason about system behavior rather than treating it as a black box.

### `/etc`

**`/etc`** is a foundational concept within filesystem hierarchy and conventions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding `/etc` allows you to reason about system behavior rather than treating it as a black box.

### `/proc`

**`/proc`** is a foundational concept within filesystem hierarchy and conventions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding `/proc` allows you to reason about system behavior rather than treating it as a black box.

### `/sys`

**`/sys`** is a foundational concept within filesystem hierarchy and conventions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding `/sys` allows you to reason about system behavior rather than treating it as a black box.

### `/dev`

**`/dev`** is a foundational concept within filesystem hierarchy and conventions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding `/dev` allows you to reason about system behavior rather than treating it as a black box.

### `/var`

**`/var`** is a foundational concept within filesystem hierarchy and conventions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding `/var` allows you to reason about system behavior rather than treating it as a black box.

### `/home`

**`/home`** is a foundational concept within filesystem hierarchy and conventions. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding `/home` allows you to reason about system behavior rather than treating it as a black box.

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

- **`/bin`** — understand this deeply and the rest of filesystem hierarchy and conventions follows naturally.
- **`/usr`** — understand this deeply and the rest of filesystem hierarchy and conventions follows naturally.
- **`/etc`** — understand this deeply and the rest of filesystem hierarchy and conventions follows naturally.
- **`/proc`** — understand this deeply and the rest of filesystem hierarchy and conventions follows naturally.
- **`/sys`** — understand this deeply and the rest of filesystem hierarchy and conventions follows naturally.
- Think in terms of trade-offs: every design choice in Linux userspace sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Users, groups, permissions**, builds directly on these ideas. Ownership and Mode bits extend what you've learned here into users, groups, permissions.
