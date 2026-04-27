---
id: 205
title: "Time and clocks"
part: "XIX"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Networking: A Top-Down Approach"
    url: "https://gaia.cs.umass.edu/kurose_ross/index.php"
  - type: article
    title: "Beej's Guide to Network Programming"
    url: "https://beej.us/guide/bgnet/"
  - type: book
    title: "TCP/IP Illustrated (Stevens)"
    url: "https://www.oreilly.com/library/view/tcpip-illustrated-volume/9780132808200/"
---
# Time and clocks

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Time and clocks** sits within Networking and Distributed Communication (Supermodule 11). This module covers 3 interconnected topics: monotonic vs wall clocks, synchronization, drift. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Monotonic vs wall clocks

**Monotonic vs wall clocks** is a foundational concept within time and clocks. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding monotonic vs wall clocks allows you to reason about system behavior rather than treating it as a black box.

### Synchronization

**Synchronization** is a foundational concept within time and clocks. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding synchronization allows you to reason about system behavior rather than treating it as a black box.

### Drift

**Drift** is a foundational concept within time and clocks. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding drift allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```bash
# Network diagnostic commands
$ ip addr show                  # interfaces & addresses
$ ip route show                 # routing table
$ ss -tlnp                      # listening TCP sockets
$ tcpdump -i eth0 -n port 80    # capture packets
$ traceroute 8.8.8.8            # path to destination
$ dig example.com               # DNS lookup
$ curl -v https://example.com   # HTTP with details
```

## Key Insights

- **Monotonic vs wall clocks** — understand this deeply and the rest of time and clocks follows naturally.
- **Synchronization** — understand this deeply and the rest of time and clocks follows naturally.
- **Drift** — understand this deeply and the rest of time and clocks follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Failure models**, builds directly on these ideas. Crash and Omission extend what you've learned here into failure models.
