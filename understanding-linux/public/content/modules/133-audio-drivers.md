---
id: 133
title: "Audio drivers"
part: "X"
supermoduleId: 10
estimatedMinutes: 50
resources:
  - type: book
    title: "Linux Device Drivers (LDD3)"
    url: "https://lwn.net/Kernel/LDD3/"
  - type: article
    title: "Bootlin — Kernel Training Materials"
    url: "https://bootlin.com/doc/training/linux-kernel/"
  - type: article
    title: "The Linux Kernel Module Programming Guide"
    url: "https://sysprog21.github.io/lkmpg/"
---
# Audio drivers

## Why This Matters

Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.

**Audio drivers** sits within Drivers and Hardware Interaction (Supermodule 10). This module covers 4 interconnected topics: ALSA concepts, PCM, mixer, streaming. Each builds on the previous, forming a coherent picture of how device drivers works at this level.

## Core Concepts

### ALSA concepts

**ALSA concepts** is a foundational concept within audio drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding ALSA concepts allows you to reason about system behavior rather than treating it as a black box.

### PCM

**PCM** is a foundational concept within audio drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding PCM allows you to reason about system behavior rather than treating it as a black box.

### Mixer

**Mixer** is a foundational concept within audio drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding mixer allows you to reason about system behavior rather than treating it as a black box.

### Streaming

**Streaming** is a foundational concept within audio drivers. Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities. In practice, understanding streaming allows you to reason about system behavior rather than treating it as a black box.

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

- **ALSA concepts** — understand this deeply and the rest of audio drivers follows naturally.
- **PCM** — understand this deeply and the rest of audio drivers follows naturally.
- **Mixer** — understand this deeply and the rest of audio drivers follows naturally.
- **Streaming** — understand this deeply and the rest of audio drivers follows naturally.
- Think in terms of trade-offs: every design choice in device drivers sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Camera and media drivers**, builds directly on these ideas. V4L2 concepts and Buffers extend what you've learned here into camera and media drivers.
