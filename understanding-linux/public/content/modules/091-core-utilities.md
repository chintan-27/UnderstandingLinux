---
id: 91
title: "Core utilities"
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
# Core utilities

## Why This Matters

Linux userspace is where you interact with the system daily — shells, utilities, filesystems, services. Mastering it makes you productive.

**Core utilities** sits within Linux User Space and System Programming (Supermodule 8). This module covers 10 interconnected topics: grep, sed, awk, find, xargs, sort, cut, tr, ps, top. Each builds on the previous, forming a coherent picture of how Linux userspace works at this level.

## Core Concepts

### Grep

**Grep** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding grep allows you to reason about system behavior rather than treating it as a black box.

### Sed

**Sed** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding sed allows you to reason about system behavior rather than treating it as a black box.

### Awk

**Awk** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding awk allows you to reason about system behavior rather than treating it as a black box.

### Find

**Find** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding find allows you to reason about system behavior rather than treating it as a black box.

### Xargs

**Xargs** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding xargs allows you to reason about system behavior rather than treating it as a black box.

### Sort

**Sort** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding sort allows you to reason about system behavior rather than treating it as a black box.

### Cut

**Cut** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding cut allows you to reason about system behavior rather than treating it as a black box.

### Tr

**Tr** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding tr allows you to reason about system behavior rather than treating it as a black box.

### Ps

**Ps** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding ps allows you to reason about system behavior rather than treating it as a black box.

### Top

**Top** is a foundational concept within core utilities. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding top allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# Find all .c files modified in the last day
$ find /usr/src -name "*.c" -mtime -1

# Count lines of code by file type
$ find . -name "*.c" | xargs wc -l | sort -n | tail

# Extract function signatures from a C file
$ grep -n '^[a-z].*(.*)\s*{$' kernel/sched/core.c

# Replace all occurrences across files
$ find . -name "*.h" -exec sed -i 's/old_name/new_name/g' {} +
```

## Key Insights

- **Grep** — understand this deeply and the rest of core utilities follows naturally.
- **Sed** — understand this deeply and the rest of core utilities follows naturally.
- **Awk** — understand this deeply and the rest of core utilities follows naturally.
- **Find** — understand this deeply and the rest of core utilities follows naturally.
- **Xargs** — understand this deeply and the rest of core utilities follows naturally.
- Think in terms of trade-offs: every design choice in Linux userspace sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Filesystem hierarchy and conventions**, builds directly on these ideas. `/bin` and `/usr` extend what you've learned here into filesystem hierarchy and conventions.
