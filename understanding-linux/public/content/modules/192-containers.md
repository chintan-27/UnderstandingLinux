---
id: 192
title: "Containers"
part: "XVI"
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
# Containers

## Why This Matters

These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.

**Containers** sits within Performance, Security, Virtualization, and Beyond (Supermodule 12). This module covers 4 interconnected topics: namespaces, cgroups, filesystem layering, OCI intuition. Each builds on the previous, forming a coherent picture of how storage, concurrency, security, performance, and systems practice works at this level.

## Core Concepts

### Namespaces

**Namespaces** is a foundational concept within containers. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding namespaces allows you to reason about system behavior rather than treating it as a black box.

### Cgroups

**Cgroups** is a foundational concept within containers. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding cgroups allows you to reason about system behavior rather than treating it as a black box.

### Filesystem layering

**Filesystem layering** is a foundational concept within containers. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding filesystem layering allows you to reason about system behavior rather than treating it as a black box.

### OCI intuition

**OCI intuition** is a foundational concept within containers. This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering. In practice, understanding OCI intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Namespaces** — understand this deeply and the rest of containers follows naturally.
- **Cgroups** — understand this deeply and the rest of containers follows naturally.
- **Filesystem layering** — understand this deeply and the rest of containers follows naturally.
- **OCI intuition** — understand this deeply and the rest of containers follows naturally.
- Think in terms of trade-offs: every design choice in storage, concurrency, security, performance, and systems practice sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Orchestration concepts**, builds directly on these ideas. Scheduling and Service discovery extend what you've learned here into orchestration concepts.
