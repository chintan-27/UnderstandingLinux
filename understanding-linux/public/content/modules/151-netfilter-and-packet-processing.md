---
id: 151
title: "Netfilter and packet processing"
part: "XI"
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
# Netfilter and packet processing

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Netfilter and packet processing** sits within Networking and Distributed Communication (Supermodule 11). This module covers 4 interconnected topics: filtering, NAT, hooks, packet traversal intuition. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Filtering

**Filtering** is a foundational concept within netfilter and packet processing. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding filtering allows you to reason about system behavior rather than treating it as a black box.

### NAT

**NAT** is a foundational concept within netfilter and packet processing. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding NAT allows you to reason about system behavior rather than treating it as a black box.

### Hooks

**Hooks** is a foundational concept within netfilter and packet processing. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding hooks allows you to reason about system behavior rather than treating it as a black box.

### Packet traversal intuition

**Packet traversal intuition** is a foundational concept within netfilter and packet processing. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding packet traversal intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Filtering** — understand this deeply and the rest of netfilter and packet processing follows naturally.
- **NAT** — understand this deeply and the rest of netfilter and packet processing follows naturally.
- **Hooks** — understand this deeply and the rest of netfilter and packet processing follows naturally.
- **Packet traversal intuition** — understand this deeply and the rest of netfilter and packet processing follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Traffic control**, builds directly on these ideas. Qdiscs and Shaping extend what you've learned here into traffic control.
