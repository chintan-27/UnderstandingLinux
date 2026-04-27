---
id: 146
title: "DNS and naming"
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
# DNS and naming

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**DNS and naming** sits within Networking and Distributed Communication (Supermodule 11). This module covers 4 interconnected topics: recursive resolution, caching, record types, stub resolvers. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Recursive resolution

**Recursive resolution** is a foundational concept within dns and naming. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding recursive resolution allows you to reason about system behavior rather than treating it as a black box.

### Caching

**Caching** is a foundational concept within dns and naming. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding caching allows you to reason about system behavior rather than treating it as a black box.

### Record types

**Record types** is a foundational concept within dns and naming. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding record types allows you to reason about system behavior rather than treating it as a black box.

### Stub resolvers

**Stub resolvers** is a foundational concept within dns and naming. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding stub resolvers allows you to reason about system behavior rather than treating it as a black box.

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

- **Recursive resolution** — understand this deeply and the rest of dns and naming follows naturally.
- **Caching** — understand this deeply and the rest of dns and naming follows naturally.
- **Record types** — understand this deeply and the rest of dns and naming follows naturally.
- **Stub resolvers** — understand this deeply and the rest of dns and naming follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Application protocols**, builds directly on these ideas. HTTP and TLS concepts extend what you've learned here into application protocols.
