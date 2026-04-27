---
id: 148
title: "Sockets API"
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
# Sockets API

## Why This Matters

Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.

**Sockets API** sits within Networking and Distributed Communication (Supermodule 11). This module covers 7 interconnected topics: socket lifecycle, bind, listen, accept, connect, send/recv, nonblocking I/O. Each builds on the previous, forming a coherent picture of how networking works at this level.

## Core Concepts

### Socket lifecycle

**Socket lifecycle** is a foundational concept within sockets api. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding socket lifecycle allows you to reason about system behavior rather than treating it as a black box.

### Bind

**Bind** is a foundational concept within sockets api. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding bind allows you to reason about system behavior rather than treating it as a black box.

### Listen

**Listen** is a foundational concept within sockets api. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding listen allows you to reason about system behavior rather than treating it as a black box.

### Accept

**Accept** is a foundational concept within sockets api. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding accept allows you to reason about system behavior rather than treating it as a black box.

### Connect

**Connect** is a foundational concept within sockets api. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding connect allows you to reason about system behavior rather than treating it as a black box.

### Send/recv

**Send/recv** is a foundational concept within sockets api. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding send/recv allows you to reason about system behavior rather than treating it as a black box.

### Nonblocking I/O

**Nonblocking I/O** is a foundational concept within sockets api. In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace. In practice, understanding nonblocking I/O allows you to reason about system behavior rather than treating it as a black box.

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

- **Socket lifecycle** — understand this deeply and the rest of sockets api follows naturally.
- **Bind** — understand this deeply and the rest of sockets api follows naturally.
- **Listen** — understand this deeply and the rest of sockets api follows naturally.
- **Accept** — understand this deeply and the rest of sockets api follows naturally.
- **Connect** — understand this deeply and the rest of sockets api follows naturally.
- Think in terms of trade-offs: every design choice in networking sacrifices something to gain something else.
- Build mental models, not memorized facts. The goal is to predict behavior from first principles.

## What Comes Next

The next module, **Linux network stack internals**, builds directly on these ideas. Sk_buff and Receive path extend what you've learned here into linux network stack internals.
