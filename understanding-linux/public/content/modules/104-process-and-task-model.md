---
id: 104
title: "Process and task model"
part: "IX"
supermoduleId: 9
estimatedMinutes: 50
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
# Process and task model

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Process and task model** sits within Linux Kernel Internals (Supermodule 9). This module covers 4 interconnected topics: task_struct, scheduling entities, PID model, namespaces relation. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Task_struct

**Task_struct** is a foundational concept within process and task model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding task_struct allows you to reason about system behavior rather than treating it as a black box.

### Scheduling entities

**Scheduling entities** is a foundational concept within process and task model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding scheduling entities allows you to reason about system behavior rather than treating it as a black box.

### PID model

**PID model** is a foundational concept within process and task model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding PID model allows you to reason about system behavior rather than treating it as a black box.

### Namespaces relation

**Namespaces relation** is a foundational concept within process and task model. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding namespaces relation allows you to reason about system behavior rather than treating it as a black box.

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

- **Task_struct** — understand this deeply and the rest of process and task model follows naturally.
- **Scheduling entities** — understand this deeply and the rest of process and task model follows naturally.
- **PID model** — understand this deeply and the rest of process and task model follows naturally.
- **Namespaces relation** — understand this deeply and the rest of process and task model follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Scheduler internals**, builds directly on these ideas. CFS intuition and Run queues extend what you've learned here into scheduler internals.
