---
id: 154
title: "Performance engineering for networking"
part: "XI"
supermoduleId: 11
estimatedMinutes: 60
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
# Performance engineering for networking

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Performance engineering for networking** sits within Networking and Distributed Communication (Supermodule 11). This module covers 6 interconnected topics: zero-copy ideas, batching, RSS, RPS, CPU affinity, latency vs throughput. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Zero-copy ideas

**Zero-copy ideas** is a foundational concept within performance engineering for networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding zero-copy ideas allows you to reason about system behavior rather than treating it as a black box.

### Batching

**Batching** is a foundational concept within performance engineering for networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding batching allows you to reason about system behavior rather than treating it as a black box.

### RSS

**RSS** is a foundational concept within performance engineering for networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding RSS allows you to reason about system behavior rather than treating it as a black box.

### RPS

**RPS** is a foundational concept within performance engineering for networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding RPS allows you to reason about system behavior rather than treating it as a black box.

### CPU affinity

**CPU affinity** is a foundational concept within performance engineering for networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding CPU affinity allows you to reason about system behavior rather than treating it as a black box.

### Latency vs throughput

**Latency vs throughput** is a foundational concept within performance engineering for networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding latency vs throughput allows you to reason about system behavior rather than treating it as a black box.

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

- **Zero-copy ideas** — understand this deeply and the rest of performance engineering for networking follows naturally.
- **Batching** — understand this deeply and the rest of performance engineering for networking follows naturally.
- **RSS** — understand this deeply and the rest of performance engineering for networking follows naturally.
- **RPS** — understand this deeply and the rest of performance engineering for networking follows naturally.
- **CPU affinity** — understand this deeply and the rest of performance engineering for networking follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Wireless networking basics**, builds directly on these ideas. Wi-Fi architecture and Association extend what you've learned here into wireless networking basics.
