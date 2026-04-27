---
id: 117
title: "Kernel tracing and observability"
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
# Kernel tracing and observability

## Why This Matters

The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.

**Kernel tracing and observability** sits within Linux Kernel Internals (Supermodule 9). This module covers 4 interconnected topics: ftrace, tracepoints, perf events, eBPF concepts. Each builds on the previous, forming a coherent picture of how the Linux kernel works at this level.

## Core Concepts

### Ftrace

**Ftrace** is a foundational concept within kernel tracing and observability. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding ftrace allows you to reason about system behavior rather than treating it as a black box.

### Tracepoints

**Tracepoints** is a foundational concept within kernel tracing and observability. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding tracepoints allows you to reason about system behavior rather than treating it as a black box.

### Perf events

**Perf events** is a foundational concept within kernel tracing and observability. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding perf events allows you to reason about system behavior rather than treating it as a black box.

### EBPF concepts

**EBPF concepts** is a foundational concept within kernel tracing and observability. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding eBPF concepts allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# Kernel introspection commands
$ uname -r                         # kernel version
$ cat /proc/version                # build info
$ zcat /proc/config.gz | grep SMP  # kernel config
$ dmesg | tail -20                 # kernel log
$ cat /proc/kallsyms | head        # kernel symbol table
$ ls /sys/module/                  # loaded modules
```

## Key Insights

- **Ftrace** — understand this deeply and the rest of kernel tracing and observability follows naturally.
- **Tracepoints** — understand this deeply and the rest of kernel tracing and observability follows naturally.
- **Perf events** — understand this deeply and the rest of kernel tracing and observability follows naturally.
- **EBPF concepts** — understand this deeply and the rest of kernel tracing and observability follows naturally.
- Think in terms of trade-offs: every design choice in the Linux kernel sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Security subsystems**, builds directly on these ideas. Capabilities and LSM framework extend what you've learned here into security subsystems.
