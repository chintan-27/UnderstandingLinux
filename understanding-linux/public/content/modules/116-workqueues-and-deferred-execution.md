---
id: 116
title: "Workqueues and deferred execution"
part: "IX"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Robert Love)"
    url: "https://www.oreilly.com/library/view/linux-kernel-development/9780768696974/"
  - type: article
    title: "Kernel Newbies"
    url: "https://kernelnewbies.org/"
  - type: article
    title: "LWN.net — Linux Weekly News"
    url: "https://lwn.net/"
---
# Workqueues and deferred execution

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Workqueues and deferred execution** sits within Linux Kernel Internals (Supermodule 9). This module covers 3 interconnected topics: bottom halves, workqueues, task scheduling in kernel. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Bottom halves

**Bottom halves** is a foundational concept within workqueues and deferred execution. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding bottom halves allows you to reason about system behavior rather than treating it as a black box.

### Workqueues

**Workqueues** is a foundational concept within workqueues and deferred execution. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding workqueues allows you to reason about system behavior rather than treating it as a black box.

### Task scheduling in kernel

**Task scheduling in kernel** is a foundational concept within workqueues and deferred execution. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding task scheduling in kernel allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```c
// Simplified view of task_struct (kernel/sched/sched.h)
struct task_struct {
    volatile long         state;       // TASK_RUNNING, etc.
    struct thread_info    thread_info;
    unsigned int          flags;
    int                   prio;        // dynamic priority
    int                   static_prio; // nice-based
    struct sched_entity   se;          // CFS scheduling entity
    struct mm_struct      *mm;         // memory descriptor
    pid_t                 pid;
    pid_t                 tgid;        // thread group ID
    struct task_struct    *parent;
    struct list_head      children;
    struct files_struct   *files;      // open file table
    // ... hundreds more fields
};
```

## Key Insights

- **Bottom halves** — understand this deeply and the rest of workqueues and deferred execution follows naturally.
- **Workqueues** — understand this deeply and the rest of workqueues and deferred execution follows naturally.
- **Task scheduling in kernel** — understand this deeply and the rest of workqueues and deferred execution follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Kernel tracing and observability**, builds directly on these ideas. Ftrace and Tracepoints extend what you've learned here into kernel tracing and observability.
