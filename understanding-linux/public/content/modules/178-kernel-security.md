---
id: 178
title: "Kernel security"
part: "XIV"
supermoduleId: 12
estimatedMinutes: 50
resources:
  - type: book
    title: "Systems Performance (Brendan Gregg)"
    url: "https://www.brendangregg.com/systems-performance-2nd-edition-book.html"
  - type: article
    title: "Brendan Gregg's Blog"
    url: "https://www.brendangregg.com/"
  - type: book
    title: "The Linux Programming Interface"
    url: "https://man7.org/tlpi/"
---
# Kernel security

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Kernel security** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: module trust, LSMs, seccomp, namespaces as isolation building blocks. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Module trust

**Module trust** is a foundational concept within kernel security. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding module trust allows you to reason about system behavior rather than treating it as a black box.

### LSMs

**LSMs** is a foundational concept within kernel security. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding LSMs allows you to reason about system behavior rather than treating it as a black box.

### Seccomp

**Seccomp** is a foundational concept within kernel security. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding seccomp allows you to reason about system behavior rather than treating it as a black box.

### Namespaces as isolation building blocks

**Namespaces as isolation building blocks** is a foundational concept within kernel security. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding namespaces as isolation building blocks allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# Namespaces — the building blocks of containers
$ unshare --pid --fork --mount-proc bash
$ ps aux   # only sees processes in this namespace

# Cgroups — resource limits
$ cat /sys/fs/cgroup/memory/docker/<id>/memory.limit_in_bytes

# Container filesystem layering
$ docker inspect --format '{{.GraphDriver.Data}}' <container>

# Network namespace
$ ip netns add test
$ ip netns exec test ip addr show
```

## Key Insights

- **Module trust** — understand this deeply and the rest of kernel security follows naturally.
- **LSMs** — understand this deeply and the rest of kernel security follows naturally.
- **Seccomp** — understand this deeply and the rest of kernel security follows naturally.
- **Namespaces as isolation building blocks** — understand this deeply and the rest of kernel security follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Cryptography fundamentals**, builds directly on these ideas. Hashing and Symmetric/asymmetric encryption extend what you've learned here into cryptography fundamentals.
