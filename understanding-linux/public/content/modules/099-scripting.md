---
id: 99
title: "Scripting"
part: "VIII"
supermoduleId: 8
estimatedMinutes: 40
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
# Scripting

## Why This Matters

Linux userspace is where you interact with the system daily — shells, utilities, filesystems, services. Mastering it makes you productive.

**Scripting** sits within Linux User Space and System Programming (Supermodule 8). This module covers 2 interconnected topics: shell scripting, Python for systems automation. Each builds on the previous, forming a coherent picture of how Linux userspace works at this level.

## Core Concepts

### Shell scripting

**Shell scripting** is a foundational concept within scripting. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding shell scripting allows you to reason about system behavior rather than treating it as a black box.

### Python for systems automation

**Python for systems automation** is a foundational concept within scripting. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding Python for systems automation allows you to reason about system behavior rather than treating it as a black box.

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

- **Shell scripting** — understand this deeply and the rest of scripting follows naturally.
- **Python for systems automation** — understand this deeply and the rest of scripting follows naturally.
- Think in terms of trade-offs: every design choice in Linux userspace sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Kernel high-level structure**, builds directly on these ideas. Monolithic kernel and Modules extend what you've learned here into kernel high-level structure.
