---
id: 141
title: "Networking fundamentals"
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
# Networking fundamentals

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Networking fundamentals** sits within Networking and Distributed Communication (Supermodule 11). This module covers 5 interconnected topics: layering, framing, packets, switching, routing. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Layering

**Layering** is a foundational concept within networking fundamentals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding layering allows you to reason about system behavior rather than treating it as a black box.

### Framing

**Framing** is a foundational concept within networking fundamentals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding framing allows you to reason about system behavior rather than treating it as a black box.

### Packets

**Packets** is a foundational concept within networking fundamentals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding packets allows you to reason about system behavior rather than treating it as a black box.

### Switching

**Switching** is a foundational concept within networking fundamentals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding switching allows you to reason about system behavior rather than treating it as a black box.

### Routing

**Routing** is a foundational concept within networking fundamentals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding routing allows you to reason about system behavior rather than treating it as a black box.

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

- **Layering** — understand this deeply and the rest of networking fundamentals follows naturally.
- **Framing** — understand this deeply and the rest of networking fundamentals follows naturally.
- **Packets** — understand this deeply and the rest of networking fundamentals follows naturally.
- **Switching** — understand this deeply and the rest of networking fundamentals follows naturally.
- **Routing** — understand this deeply and the rest of networking fundamentals follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Physical and link layer basics**, builds directly on these ideas. Copper and Fiber extend what you've learned here into physical and link layer basics.
