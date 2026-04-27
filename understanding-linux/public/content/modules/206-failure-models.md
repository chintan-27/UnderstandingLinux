---
id: 206
title: "Failure models"
part: "XIX"
supermoduleId: 11
estimatedMinutes: 50
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
# Failure models

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Failure models** sits within Networking and Distributed Communication (Supermodule 11). This module covers 4 interconnected topics: crash, omission, partition, partial failure. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Crash

**Crash** is a foundational concept within failure models. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding crash allows you to reason about system behavior rather than treating it as a black box.

### Omission

**Omission** is a foundational concept within failure models. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding omission allows you to reason about system behavior rather than treating it as a black box.

### Partition

**Partition** is a foundational concept within failure models. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding partition allows you to reason about system behavior rather than treating it as a black box.

### Partial failure

**Partial failure** is a foundational concept within failure models. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding partial failure allows you to reason about system behavior rather than treating it as a black box.

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

- **Crash** — understand this deeply and the rest of failure models follows naturally.
- **Omission** — understand this deeply and the rest of failure models follows naturally.
- **Partition** — understand this deeply and the rest of failure models follows naturally.
- **Partial failure** — understand this deeply and the rest of failure models follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **RPC and service communication**, builds directly on these ideas. Retries and Deadlines extend what you've learned here into rpc and service communication.
