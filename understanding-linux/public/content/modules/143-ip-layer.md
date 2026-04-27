---
id: 143
title: "IP layer"
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
# IP layer

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**IP layer** sits within Networking and Distributed Communication (Supermodule 11). This module covers 6 interconnected topics: IPv4, IPv6, addressing, subnetting, fragmentation, TTL/hop limit. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### IPv4

**IPv4** is a foundational concept within ip layer. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding IPv4 allows you to reason about system behavior rather than treating it as a black box.

### IPv6

**IPv6** is a foundational concept within ip layer. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding IPv6 allows you to reason about system behavior rather than treating it as a black box.

### Addressing

**Addressing** is a foundational concept within ip layer. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding addressing allows you to reason about system behavior rather than treating it as a black box.

### Subnetting

**Subnetting** is a foundational concept within ip layer. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding subnetting allows you to reason about system behavior rather than treating it as a black box.

### Fragmentation

**Fragmentation** is a foundational concept within ip layer. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding fragmentation allows you to reason about system behavior rather than treating it as a black box.

### TTL/hop limit

**TTL/hop limit** is a foundational concept within ip layer. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding TTL/hop limit allows you to reason about system behavior rather than treating it as a black box.

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

- **IPv4** — understand this deeply and the rest of ip layer follows naturally.
- **IPv6** — understand this deeply and the rest of ip layer follows naturally.
- **Addressing** — understand this deeply and the rest of ip layer follows naturally.
- **Subnetting** — understand this deeply and the rest of ip layer follows naturally.
- **Fragmentation** — understand this deeply and the rest of ip layer follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Routing**, builds directly on these ideas. Forwarding tables and ARP/ND extend what you've learned here into routing.
