---
id: 147
title: "Application protocols"
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
# Application protocols

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Application protocols** sits within Networking and Distributed Communication (Supermodule 11). This module covers 6 interconnected topics: HTTP, TLS concepts, SSH, SMTP, NTP, DHCP at a systems level. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### HTTP

**HTTP** is a foundational concept within application protocols. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding HTTP allows you to reason about system behavior rather than treating it as a black box.

### TLS concepts

**TLS concepts** is a foundational concept within application protocols. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding TLS concepts allows you to reason about system behavior rather than treating it as a black box.

### SSH

**SSH** is a foundational concept within application protocols. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding SSH allows you to reason about system behavior rather than treating it as a black box.

### SMTP

**SMTP** is a foundational concept within application protocols. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding SMTP allows you to reason about system behavior rather than treating it as a black box.

### NTP

**NTP** is a foundational concept within application protocols. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding NTP allows you to reason about system behavior rather than treating it as a black box.

### DHCP at a systems level

**DHCP at a systems level** is a foundational concept within application protocols. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding DHCP at a systems level allows you to reason about system behavior rather than treating it as a black box.

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

- **HTTP** — understand this deeply and the rest of application protocols follows naturally.
- **TLS concepts** — understand this deeply and the rest of application protocols follows naturally.
- **SSH** — understand this deeply and the rest of application protocols follows naturally.
- **SMTP** — understand this deeply and the rest of application protocols follows naturally.
- **NTP** — understand this deeply and the rest of application protocols follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Sockets API**, builds directly on these ideas. Socket lifecycle and Bind extend what you've learned here into sockets api.
