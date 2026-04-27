---
id: 150
title: "NIC interaction"
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
# NIC interaction

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**NIC interaction** sits within Networking and Distributed Communication (Supermodule 11). This module covers 5 interconnected topics: DMA rings, interrupts, NAPI, checksum offload, segmentation offload. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### DMA rings

**DMA rings** is a foundational concept within nic interaction. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding DMA rings allows you to reason about system behavior rather than treating it as a black box.

### Interrupts

**Interrupts** is a foundational concept within nic interaction. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding interrupts allows you to reason about system behavior rather than treating it as a black box.

### NAPI

**NAPI** is a foundational concept within nic interaction. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding NAPI allows you to reason about system behavior rather than treating it as a black box.

### Checksum offload

**Checksum offload** is a foundational concept within nic interaction. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding checksum offload allows you to reason about system behavior rather than treating it as a black box.

### Segmentation offload

**Segmentation offload** is a foundational concept within nic interaction. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding segmentation offload allows you to reason about system behavior rather than treating it as a black box.

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

- **DMA rings** — understand this deeply and the rest of nic interaction follows naturally.
- **Interrupts** — understand this deeply and the rest of nic interaction follows naturally.
- **NAPI** — understand this deeply and the rest of nic interaction follows naturally.
- **Checksum offload** — understand this deeply and the rest of nic interaction follows naturally.
- **Segmentation offload** — understand this deeply and the rest of nic interaction follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Netfilter and packet processing**, builds directly on these ideas. Filtering and NAT extend what you've learned here into netfilter and packet processing.
