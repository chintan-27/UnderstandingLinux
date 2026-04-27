---
id: 149
title: "Linux network stack internals"
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
# Linux network stack internals

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Linux network stack internals** sits within Networking and Distributed Communication (Supermodule 11). This module covers 5 interconnected topics: sk_buff, receive path, transmit path, routing lookup, socket buffers. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Sk_buff

**Sk_buff** is a foundational concept within linux network stack internals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding sk_buff allows you to reason about system behavior rather than treating it as a black box.

### Receive path

**Receive path** is a foundational concept within linux network stack internals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding receive path allows you to reason about system behavior rather than treating it as a black box.

### Transmit path

**Transmit path** is a foundational concept within linux network stack internals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding transmit path allows you to reason about system behavior rather than treating it as a black box.

### Routing lookup

**Routing lookup** is a foundational concept within linux network stack internals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding routing lookup allows you to reason about system behavior rather than treating it as a black box.

### Socket buffers

**Socket buffers** is a foundational concept within linux network stack internals. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding socket buffers allows you to reason about system behavior rather than treating it as a black box.

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

- **Sk_buff** — understand this deeply and the rest of linux network stack internals follows naturally.
- **Receive path** — understand this deeply and the rest of linux network stack internals follows naturally.
- **Transmit path** — understand this deeply and the rest of linux network stack internals follows naturally.
- **Routing lookup** — understand this deeply and the rest of linux network stack internals follows naturally.
- **Socket buffers** — understand this deeply and the rest of linux network stack internals follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **NIC interaction**, builds directly on these ideas. DMA rings and Interrupts extend what you've learned here into nic interaction.
