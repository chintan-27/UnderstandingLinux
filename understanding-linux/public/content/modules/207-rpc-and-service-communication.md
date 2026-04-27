---
id: 207
title: "RPC and service communication"
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
# RPC and service communication

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**RPC and service communication** sits within Networking and Distributed Communication (Supermodule 11). This module covers 4 interconnected topics: retries, deadlines, serialization, load balancing. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Retries

**Retries** is a foundational concept within rpc and service communication. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding retries allows you to reason about system behavior rather than treating it as a black box.

### Deadlines

**Deadlines** is a foundational concept within rpc and service communication. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding deadlines allows you to reason about system behavior rather than treating it as a black box.

### Serialization

**Serialization** is a foundational concept within rpc and service communication. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding serialization allows you to reason about system behavior rather than treating it as a black box.

### Load balancing

**Load balancing** is a foundational concept within rpc and service communication. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding load balancing allows you to reason about system behavior rather than treating it as a black box.

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

- **Retries** — understand this deeply and the rest of rpc and service communication follows naturally.
- **Deadlines** — understand this deeply and the rest of rpc and service communication follows naturally.
- **Serialization** — understand this deeply and the rest of rpc and service communication follows naturally.
- **Load balancing** — understand this deeply and the rest of rpc and service communication follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Consistency basics**, builds directly on these ideas. Replication and Consensus intuition extend what you've learned here into consistency basics.
