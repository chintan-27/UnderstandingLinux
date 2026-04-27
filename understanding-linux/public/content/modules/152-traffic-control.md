---
id: 152
title: "Traffic control"
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
# Traffic control

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Traffic control** sits within Networking and Distributed Communication (Supermodule 11). This module covers 4 interconnected topics: qdiscs, shaping, policing, queueing behavior. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Qdiscs

**Qdiscs** is a foundational concept within traffic control. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding qdiscs allows you to reason about system behavior rather than treating it as a black box.

### Shaping

**Shaping** is a foundational concept within traffic control. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding shaping allows you to reason about system behavior rather than treating it as a black box.

### Policing

**Policing** is a foundational concept within traffic control. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding policing allows you to reason about system behavior rather than treating it as a black box.

### Queueing behavior

**Queueing behavior** is a foundational concept within traffic control. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding queueing behavior allows you to reason about system behavior rather than treating it as a black box.

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

- **Qdiscs** — understand this deeply and the rest of traffic control follows naturally.
- **Shaping** — understand this deeply and the rest of traffic control follows naturally.
- **Policing** — understand this deeply and the rest of traffic control follows naturally.
- **Queueing behavior** — understand this deeply and the rest of traffic control follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Virtual networking**, builds directly on these ideas. Bridges and Veth extend what you've learned here into virtual networking.
