---
id: 156
title: "Network security"
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
# Network security

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Network security** sits within Networking and Distributed Communication (Supermodule 11). This module covers 5 interconnected topics: TLS fundamentals, firewalls, VPN concepts, authentication, spoofing basics. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### TLS fundamentals

**TLS fundamentals** is a foundational concept within network security. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding TLS fundamentals allows you to reason about system behavior rather than treating it as a black box.

### Firewalls

**Firewalls** is a foundational concept within network security. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding firewalls allows you to reason about system behavior rather than treating it as a black box.

### VPN concepts

**VPN concepts** is a foundational concept within network security. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding VPN concepts allows you to reason about system behavior rather than treating it as a black box.

### Authentication

**Authentication** is a foundational concept within network security. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding authentication allows you to reason about system behavior rather than treating it as a black box.

### Spoofing basics

**Spoofing basics** is a foundational concept within network security. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding spoofing basics allows you to reason about system behavior rather than treating it as a black box.

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

- **TLS fundamentals** — understand this deeply and the rest of network security follows naturally.
- **Firewalls** — understand this deeply and the rest of network security follows naturally.
- **VPN concepts** — understand this deeply and the rest of network security follows naturally.
- **Authentication** — understand this deeply and the rest of network security follows naturally.
- **Spoofing basics** — understand this deeply and the rest of network security follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Observability**, builds directly on these ideas. Tcpdump and Ss extend what you've learned here into observability.
