---
id: 94
title: "Processes in practice"
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
# Processes in practice

## Why This Matters

Linux userspace is where you interact with the system daily — shells, utilities, filesystems, services. Mastering it makes you productive.

**Processes in practice** sits within Linux User Space and System Programming (Supermodule 8). This module covers 4 interconnected topics: fork/exec, signals, sessions, daemons. Each builds on the previous, forming a coherent picture of how Linux userspace works at this level.

## Core Concepts

### Fork/exec

**Fork/exec** is a foundational concept within processes in practice. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding fork/exec allows you to reason about system behavior rather than treating it as a black box.

### Signals

**Signals** is a foundational concept within processes in practice. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding signals allows you to reason about system behavior rather than treating it as a black box.

### Sessions

**Sessions** is a foundational concept within processes in practice. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding sessions allows you to reason about system behavior rather than treating it as a black box.

### Daemons

**Daemons** is a foundational concept within processes in practice. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding daemons allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```c
#include <unistd.h>
#include <sys/wait.h>
#include <stdio.h>

int main(void) {
    pid_t pid = fork();
    if (pid == 0) {
        // Child process
        execl("/bin/echo", "echo", "hello from child", NULL);
        _exit(1);  // only reached if exec fails
    }
    // Parent process
    int status;
    waitpid(pid, &status, 0);
    printf("child exited with %d\n", WEXITSTATUS(status));
    return 0;
}
```

## Key Insights

- **Fork/exec** — understand this deeply and the rest of processes in practice follows naturally.
- **Signals** — understand this deeply and the rest of processes in practice follows naturally.
- **Sessions** — understand this deeply and the rest of processes in practice follows naturally.
- **Daemons** — understand this deeply and the rest of processes in practice follows naturally.
- Think in terms of trade-offs: every design choice in Linux userspace sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Shared libraries and libc**, builds directly on these ideas. Libc role and Dynamic loader extend what you've learned here into shared libraries and libc.
