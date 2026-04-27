---
id: 153
title: "Virtual networking"
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
# Virtual networking

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Virtual networking** sits within Networking and Distributed Communication (Supermodule 11). This module covers 5 interconnected topics: bridges, veth, tap/tun, namespaces, overlays. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Bridges

**Bridges** is a foundational concept within virtual networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding bridges allows you to reason about system behavior rather than treating it as a black box.

### Veth

**Veth** is a foundational concept within virtual networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding veth allows you to reason about system behavior rather than treating it as a black box.

### Tap/tun

**Tap/tun** is a foundational concept within virtual networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding tap/tun allows you to reason about system behavior rather than treating it as a black box.

### Namespaces

**Namespaces** is a foundational concept within virtual networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding namespaces allows you to reason about system behavior rather than treating it as a black box.

### Overlays

**Overlays** is a foundational concept within virtual networking. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding overlays allows you to reason about system behavior rather than treating it as a black box.

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

- **Bridges** — understand this deeply and the rest of virtual networking follows naturally.
- **Veth** — understand this deeply and the rest of virtual networking follows naturally.
- **Tap/tun** — understand this deeply and the rest of virtual networking follows naturally.
- **Namespaces** — understand this deeply and the rest of virtual networking follows naturally.
- **Overlays** — understand this deeply and the rest of virtual networking follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Performance engineering for networking**, builds directly on these ideas. Zero-copy ideas and Batching extend what you've learned here into performance engineering for networking.
