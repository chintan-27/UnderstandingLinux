---
id: 144
title: "Routing"
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
# Routing

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Routing** sits within Networking and Distributed Communication (Supermodule 11). This module covers 4 interconnected topics: forwarding tables, ARP/ND, gateways, dynamic routing intuition. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Forwarding tables

**Forwarding tables** is a foundational concept within routing. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding forwarding tables allows you to reason about system behavior rather than treating it as a black box.

### ARP/ND

**ARP/ND** is a foundational concept within routing. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding ARP/ND allows you to reason about system behavior rather than treating it as a black box.

### Gateways

**Gateways** is a foundational concept within routing. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding gateways allows you to reason about system behavior rather than treating it as a black box.

### Dynamic routing intuition

**Dynamic routing intuition** is a foundational concept within routing. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding dynamic routing intuition allows you to reason about system behavior rather than treating it as a black box.

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

- **Forwarding tables** — understand this deeply and the rest of routing follows naturally.
- **ARP/ND** — understand this deeply and the rest of routing follows naturally.
- **Gateways** — understand this deeply and the rest of routing follows naturally.
- **Dynamic routing intuition** — understand this deeply and the rest of routing follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Transport layer**, builds directly on these ideas. TCP and UDP extend what you've learned here into transport layer.
