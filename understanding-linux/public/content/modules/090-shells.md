---
id: 90
title: "Shells"
part: "VIII"
supermoduleId: 8
estimatedMinutes: 55
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
# Shells

## Why This Matters

Linux userspace is where you interact with the system daily — shells, utilities, filesystems, services. Mastering it makes you productive.

**Shells** sits within Linux User Space and System Programming (Supermodule 8). This module covers 5 interconnected topics: parsing, expansion, redirection, pipelines, job control. Each builds on the previous, forming a coherent picture of how Linux userspace works at this level.

## Core Concepts

### Parsing

**Parsing** is a foundational concept within shells. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding parsing allows you to reason about system behavior rather than treating it as a black box.

### Expansion

**Expansion** is a foundational concept within shells. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding expansion allows you to reason about system behavior rather than treating it as a black box.

### Redirection

**Redirection** is a foundational concept within shells. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding redirection allows you to reason about system behavior rather than treating it as a black box.

### Pipelines

**Pipelines** is a foundational concept within shells. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding pipelines allows you to reason about system behavior rather than treating it as a black box.

### Job control

**Job control** is a foundational concept within shells. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding job control allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# Pipelines: each command runs in its own process
$ cat /var/log/syslog | grep error | sort | uniq -c | sort -rn | head

# Redirections
$ command > stdout.txt 2> stderr.txt   # separate stdout/stderr
$ command > all.txt 2>&1               # merge stderr into stdout
$ command < input.txt                  # stdin from file

# Process substitution
$ diff <(sort file1) <(sort file2)
```

## Key Insights

- **Parsing** — understand this deeply and the rest of shells follows naturally.
- **Expansion** — understand this deeply and the rest of shells follows naturally.
- **Redirection** — understand this deeply and the rest of shells follows naturally.
- **Pipelines** — understand this deeply and the rest of shells follows naturally.
- **Job control** — understand this deeply and the rest of shells follows naturally.
- Think in terms of trade-offs: every design choice in Linux userspace sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Core utilities**, builds directly on these ideas. Grep and Sed extend what you've learned here into core utilities.
