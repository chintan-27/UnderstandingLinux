---
id: 75
title: "Processes"
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
# Processes

## Why This Matters

The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.

**Processes** sits within Core Operating Systems (Supermodule 7). This module covers 4 interconnected topics: process model, process state, creation, termination. Each builds on the previous, forming a coherent picture of how operating system concepts works at this level.

## Core Concepts

### Process model

**Process model** is a foundational concept within processes. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding process model allows you to reason about system behavior rather than treating it as a black box.

### Process state

**Process state** is a foundational concept within processes. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding process state allows you to reason about system behavior rather than treating it as a black box.

### Creation

**Creation** is a foundational concept within processes. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding creation allows you to reason about system behavior rather than treating it as a black box.

### Termination

**Termination** is a foundational concept within processes. This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance. In practice, understanding termination allows you to reason about system behavior rather than treating it as a black box.

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

- **Process model** — understand this deeply and the rest of processes follows naturally.
- **Process state** — understand this deeply and the rest of processes follows naturally.
- **Creation** — understand this deeply and the rest of processes follows naturally.
- **Termination** — understand this deeply and the rest of processes follows naturally.
- Think in terms of trade-offs: every design choice in operating system concepts sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Threads**, builds directly on these ideas. User vs kernel threads and Concurrency models extend what you've learned here into threads.
