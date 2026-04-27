---
id: 142
title: "Physical and link layer basics"
part: "XI"
supermoduleId: 11
estimatedMinutes: 55
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
# Physical and link layer basics

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Physical and link layer basics** sits within Networking and Distributed Communication (Supermodule 11). This module covers 5 interconnected topics: copper, fiber, signaling intuition, Ethernet framing, MAC addresses. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Copper

**Copper** is a foundational concept within physical and link layer basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding copper allows you to reason about system behavior rather than treating it as a black box.

### Fiber

**Fiber** is a foundational concept within physical and link layer basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding fiber allows you to reason about system behavior rather than treating it as a black box.

### Signaling intuition

**Signaling intuition** is a foundational concept within physical and link layer basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding signaling intuition allows you to reason about system behavior rather than treating it as a black box.

### Ethernet framing

**Ethernet framing** is a foundational concept within physical and link layer basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding Ethernet framing allows you to reason about system behavior rather than treating it as a black box.

### MAC addresses

**MAC addresses** is a foundational concept within physical and link layer basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding MAC addresses allows you to reason about system behavior rather than treating it as a black box.

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

- **Copper** — understand this deeply and the rest of physical and link layer basics follows naturally.
- **Fiber** — understand this deeply and the rest of physical and link layer basics follows naturally.
- **Signaling intuition** — understand this deeply and the rest of physical and link layer basics follows naturally.
- **Ethernet framing** — understand this deeply and the rest of physical and link layer basics follows naturally.
- **MAC addresses** — understand this deeply and the rest of physical and link layer basics follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **IP layer**, builds directly on these ideas. IPv4 and IPv6 extend what you've learned here into ip layer.
