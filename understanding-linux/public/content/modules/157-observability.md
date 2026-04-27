---
id: 157
title: "Observability"
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
# Observability

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Observability** sits within Networking and Distributed Communication (Supermodule 11). This module covers 6 interconnected topics: tcpdump, ss, iproute2, ethtool, perf, tracing. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Tcpdump

**Tcpdump** is a foundational concept within observability. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding tcpdump allows you to reason about system behavior rather than treating it as a black box.

### Ss

**Ss** is a foundational concept within observability. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding ss allows you to reason about system behavior rather than treating it as a black box.

### Iproute2

**Iproute2** is a foundational concept within observability. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding iproute2 allows you to reason about system behavior rather than treating it as a black box.

### Ethtool

**Ethtool** is a foundational concept within observability. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding ethtool allows you to reason about system behavior rather than treating it as a black box.

### Perf

**Perf** is a foundational concept within observability. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding perf allows you to reason about system behavior rather than treating it as a black box.

### Tracing

**Tracing** is a foundational concept within observability. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding tracing allows you to reason about system behavior rather than treating it as a black box.

## Practical Example

```c
#include <sys/socket.h>
#include <netinet/in.h>

// TCP server skeleton
int server_fd = socket(AF_INET, SOCK_STREAM, 0);

struct sockaddr_in addr = {
    .sin_family = AF_INET,
    .sin_port = htons(8080),
    .sin_addr.s_addr = INADDR_ANY,
};

bind(server_fd, (struct sockaddr *)&addr, sizeof(addr));
listen(server_fd, 128);  // backlog of 128

while (1) {
    int client = accept(server_fd, NULL, NULL);
    // handle client connection
    char buf[4096];
    ssize_t n = read(client, buf, sizeof(buf));
    write(client, "HTTP/1.1 200 OK\r\n\r\nHello\n", 26);
    close(client);
}
```

## Key Insights

- **Tcpdump** — understand this deeply and the rest of observability follows naturally.
- **Ss** — understand this deeply and the rest of observability follows naturally.
- **Iproute2** — understand this deeply and the rest of observability follows naturally.
- **Ethtool** — understand this deeply and the rest of observability follows naturally.
- **Perf** — understand this deeply and the rest of observability follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Distributed systems interplay**, builds directly on these ideas. Retries and Timeouts extend what you've learned here into distributed systems interplay.
