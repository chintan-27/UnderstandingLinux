---
id: 155
title: "Wireless networking basics"
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
# Wireless networking basics

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Wireless networking basics** sits within Networking and Distributed Communication (Supermodule 11). This module covers 4 interconnected topics: Wi-Fi architecture, association, channels, encryption at a high level. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Wi-Fi architecture

**Wi-Fi architecture** is a foundational concept within wireless networking basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding Wi-Fi architecture allows you to reason about system behavior rather than treating it as a black box.

### Association

**Association** is a foundational concept within wireless networking basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding association allows you to reason about system behavior rather than treating it as a black box.

### Channels

**Channels** is a foundational concept within wireless networking basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding channels allows you to reason about system behavior rather than treating it as a black box.

### Encryption at a high level

**Encryption at a high level** is a foundational concept within wireless networking basics. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding encryption at a high level allows you to reason about system behavior rather than treating it as a black box.

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

- **Wi-Fi architecture** — understand this deeply and the rest of wireless networking basics follows naturally.
- **Association** — understand this deeply and the rest of wireless networking basics follows naturally.
- **Channels** — understand this deeply and the rest of wireless networking basics follows naturally.
- **Encryption at a high level** — understand this deeply and the rest of wireless networking basics follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Network security**, builds directly on these ideas. TLS fundamentals and Firewalls extend what you've learned here into network security.
