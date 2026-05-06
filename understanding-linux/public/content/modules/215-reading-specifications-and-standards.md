---
id: 215
title: "Reading specifications and standards"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts  
### Introduction to Reading Specifications and Standards  
Specifications and standards are **contracts** that define permissible behavior between independent components. In Linux systems these contracts appear as:  

* **RFCs** – protocol wire formats and state machines (the “what must be sent/received”).  
* **ABI documents** – binary interface between user space and kernel (system‑call numbers, register conventions, struct layouts).  
* **Architecture manuals** – hardware‑level description of CPU, memory model, and bus transactions that the kernel must obey.  
* **Vendor documentation** – device‑specific registers, timing constraints, and firmware interfaces.  

Understanding each layer lets you predict **how a change in one layer propagates** to another: a change in the TCP header layout (RFC) forces a change in the socket data‑structure (ABI), which may require a kernel patch (architecture) and a driver update (vendor).  

### Request for Comments (RFCs)  
RFCs are immutable snapshots of protocol specifications maintained by the IETF. They are written in **formal language** (ABNF, state diagrams) to eliminate ambiguity. Key properties:  

* **Versioning** – an RFC number never changes; updates receive a new number (e.g., RFC 793 → RFC 1122).  
* **Mathematical precision** – fields are defined by bit offsets and lengths; checksums are defined as one’s‑complement sums over 16‑bit words.  
* **Conformance clauses** – “MUST”, “SHALL”, “SHOULD” map to mandatory, recommended, and optional behavior, directly influencing error handling in implementations.  

### Application Binary Interface (ABI) Docs  
The Linux syscall ABI is defined by three orthogonal pieces:  

1. **System‑call numbers** – architecture‑specific constants (e.g., `__NR_socket = 41` for x86_64, `__NR_socket = 41` for arm64).  
2. **Calling convention** – registers used for arguments (RDI, RSI, RDX, R10, R8, R9 on x86_64) and return value (RAX).  
3. **Data structure layout** – defined by kernel headers (`<linux/*>`) and glibc; includes explicit padding and alignment attributes (`__attribute__((packed))`, `__aligned__(8)`).  

These rules guarantee that a user‑space program compiled against glibc 2.31 will invoke the same kernel entry point as a program compiled against glibc 2.36, provided the kernel respects the same syscall table.  

### Architecture Manuals  
Architecture manuals describe the **hardware contract** the kernel must satisfy:  

* **Memory model** – x86‑64 provides Total Store Order (TSO); ARMv8 provides a weaker model requiring explicit `dmb` barriers.  
* **Instruction set** – encoding, privilege levels, and trap mechanisms (e.g., `syscall` instruction vs `svc` on ARM).  
* **Bus protocols** – PCIe configuration space layout, MSI-X table format, and DMA address translation (IOMMU).  

Knowing these lets you reason why a driver must issue a `wmb()` before updating a device’s descriptor ring, or why a spinlock must disable preemption on SMP systems.  

### Vendor Docs  
Vendor documentation supplies the **implementation‑specific details** that standards leave optional:  

* Register offsets and bit fields for a NIC’s TX/RX rings.  
* Firmware download sequences and checksum procedures.  
* Power‑management state transitions and latency numbers.  

When a vendor deviates from the standard (e.g., proprietary offload features), the docs are the only source to program those features correctly.  

---  

## How It Works  
### From Specification to Working Code  
Consider building a TCP client that sends an HTTP request. The flow of constraints is:  

1. **RFC 793** defines the TCP header: 20 bytes fixed + options, with fields: source port (16 bits), destination port (16 bits), sequence number (32 bits), acknowledgment number (32 bits), data offset (4 bits), reserved (3 bits), flags (9 bits), window (16 bits), checksum (16 bits), urgent pointer (16 bits).  
2. The **checksum** is the one’s‑complement sum of the TCP pseudo‑header (IP src/dst, protocol, TCP length) plus the TCP segment, then one’s‑complemented.  
3. The **ABI** tells us how to pass data to the kernel:  
   * `int socket(int domain, int type, int protocol);` → `domain=AF_INET (2)`, `type=SOCK_STREAM (1)`, `protocol=IPPROTO_TCP (6)`.  
   * On x86_64, the syscall number is `__NR_socket = 41`; arguments go in RDI, RSI, RDX.  
   * The `struct sockaddr_in` laid out by `<netinet/in.h>` is:  

```c
struct sockaddr_in {
    sa_family_t sin_family;   /* 2 bytes  */
    uint16_t    sin_port;     /* 2 bytes  */
    struct in_addr sin_addr;  /* 4 bytes  */
    char        sin_zero[8];  /* 8 bytes  */ /* padding to 16 bytes */
};
```  
   * The total size is 16 bytes, matching the `sockaddr` size expected by `connect`.  
4. **Architecture** tells us that the `connect` syscall will trap via the `syscall` instruction, entering kernel mode at entry point `sys_connect` (`net/socket.c:sys_connect`). The kernel copies the user `sockaddr_in` into kernel space using `copy_from_user`, checks the address family, and then allocates a `struct sock`.  
5. **Vendor docs** for the NIC (e.g., Intel I210) specify that the TX descriptor must be written with the `DMA_ADDR` field little‑endian, and that the descriptor’s `CMD` byte must have the `RS` (Report Status) bit set for the NIC to generate an interrupt after transmission.  

Thus each layer adds a **deterministic transformation**:  
```
Application data → (TCP header per RFC 793) → IP packet → (checksum per RFC 793) → 
socket() args → (ABI registers) → syscall → (kernel validation per architecture) → 
NIC descriptor → (vendor register layout) → wire
```  

If any step violates its contract, the packet is dropped, the connection resets, or the kernel returns `-EFAULT`.  

---  

## Worked Examples  

### Example 1: Building a TCP Client with Full Specification Trace  
We will develop a client that sends a single line `"GET / HTTP/1.0\r\nHost: example.com\r\n\r\n"` to `example.com` port 80 and prints the response.  

#### Step 1 – Socket creation (ABI)  
```c
#define _GNU_SOURCE             /* for TCP_NODELAY */
#include <stdio.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <string.h>

int main(void)
{
    int sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd < 0) {
        perror("socket");
        return 1;
    }
    /* Disable Nagle’s algorithm to reduce latency (RFC 896) */
    int flag = 1;
    setsockopt(sockfd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));
```

*Why*: `socket` allocates a `struct sock` and assigns a file descriptor. The TCP_NODELAY option toggles the `TCP_NODELAY` flag in the socket’s `tp->nonagle` field, which the kernel checks before coalescing small packets (per RFC 896).  

#### Step 2 – Populate destination address (RFC 793 + ABI)  
```c
    struct sockaddr_in serv = {0};
    serv.sin_family = AF_INET;                /* 2 bytes */
    serv.sin_port   = htons(80);              /* network‑byte order */
    if (inet_pton(AF_INET, "93.184.216.34", &serv.sin_addr) != 1) {
        perror("inet_pton");
        close(sockfd);
        return 1;
    }
```
*Why*: `htons` converts host‑order 16‑bit integer to network order (big‑endian) as required by the TCP header. `inet_pton` performs the dotted‑decimal → 32‑bit binary conversion defined in RFC 791.  

#### Step 3 – Connect (kernel interaction)  
```c
    if (connect(sockfd, (struct sockaddr *)&serv, sizeof(serv)) < 0) {
        perror("connect");
        close(sockfd);
        return 1;
    }
```
The kernel verifies the address family, allocates a `struct sock`, performs a three‑way handshake (SYN, SYN‑ACK, ACK) as per the TCP state machine in RFC 793, and puts the socket in `TCP_ESTABLISHED`.  

#### Step 4 – Send request (data formatting)  
```c
    const char *req = "GET / HTTP/1.0\r\n"
                      "Host: example.com\r\n"
                      "\r\n";
    ssize_t n = write(sockfd, req, strlen(req));
    if (n != (ssize_t)strlen(req)) {
        perror("write");
        close(sockfd);
        return 1;
    }
```
`write` ultimately invokes the `send` syscall (`__NR_send = 44`). The kernel copies the buffer into the socket’s send queue, adds the TCP header (per RFC 793) and computes the checksum:  

\[
\text{checksum} = \overline{\sum_{i=0}^{N-1} \text{word}_i}
\]  

where the sum is one’s‑complement and the overline denotes one’s‑complement negation.  

#### Step 5 – Receive response  
```c
    char buf[4096];
    ssize_t len;
    while ((len = read(sockfd, buf, sizeof(buf)-1)) > 0) {
        buf[len] = '\0';
        printf("%s", buf);
    }
    if (len < 0) perror("read");
    close(sockfd);
    return 0;
}
```
`read` maps to the `__NR_read = 0` syscall; the kernel copies data from the receive queue, which has been filled by the NIC after it validated the TCP checksum and reassembled the segment.  

**Compile & run**  
```bash
gcc -O2 -Wall -Wextra -std=c11 tcp_client.c -o tcp_client
./tcp_client
```  

You should see an HTTP 1.0 response header followed by the HTML body.  

---  

### Example 2: Decoding the `socket` Syscall ABI  
We examine the exact register usage and structure layout on x86_64.  

```bash
# Show the syscall number for socket on x86_64
$ grep '#define __NR_socket' /usr/include/asm/unistd_64.h
#define __NR_socket 41
```

Now look at the glibc wrapper:  

```bash
$ objdump -d /lib/x86_64-linux-gnu/libc.so.6 | grep -A5 '<socket@plt>'
000000000004e5a0 <socket@plt>:
  4e5a0:   ff 25 2a 0b 20 00       jmp    *0x200b2a(%rip)        # 6f05d0 <_GLOBAL_OFFSET_TABLE_+0x18>
  4e5a6:   68 29 00 00 00          push   $0x29
  4e5ab:   e9 e0 ff ff ff          jmp    4e590 <socket@plt-0x10>
```

The push `$0x29` is the syscall number (41 decimal). The actual entry point in the kernel (`entry_SYSCALL_64`) loads the arguments from registers:  

| Register | Argument | Meaning |
|----------|----------|---------|
| RDI      | `int domain`   | Protocol family (e.g., `AF_INET = 2`) |
| RSI      | `int type`     | Socket type (`SOCK_STREAM = 1`) |
| RDX      | `int protocol` | Protocol (`IPPROTO_TCP = 0` → let kernel choose) |
| R10      | `unsigned long flags` | Socket type flags (e.g., `SOCK_CLOEXEC`) |
| R8       | `int` (unused) | – |
| R9       | `int` (unused) | – |

After the syscall, the kernel returns the new file descriptor in **RAX** (or a negative errno).  

**Verifying the layout of `sockaddr_in`**  

```bash
$ cat > show_sockaddr.c <<'EOF'
#include <stdio.h>
#include <netinet/in.h>
int main(void) {
    printf("sizeof(sockaddr_in) = %zu\n", sizeof(struct sockaddr_in));
    printf("offset sin_family = %zu\n", offsetof(struct sockaddr_in, sin_family));
    printf("offset sin_port   = %zu\n", offsetof(struct sockaddr_in, sin_port));
    printf("offset sin_addr   = %zu\n", offsetof(struct sockaddr_in, sin_addr));
    printf("offset sin_zero   = %zu\n", offsetof(struct sockaddr_in, sin_zero));
}
EOF
$ gcc -Wall -Wextra -o show_sockaddr show_sockaddr.c
$ ./show_sockaddr
sizeof(sockaddr_in) = 16
offset sin_family = 0
offset sin_port   = 2
offset sin_addr   = 4
offset sin_zero   = 8
```

The kernel expects exactly this layout when it calls `copy_from_user` inside `sys_connect`. Any mismatch (e.g., packing the struct incorrectly) leads to `EFAULT`.  

---  

## Common Mistakes  

| # | Mistake | What’s Wrong | Why It Fails |
|---|---------|--------------|--------------|
| 1 | **Ignoring byte‑order** – using `serv_addr.sin_port = 80;` instead of `htons(80)`. | The TCP header field is defined as **network byte order** (big‑endian) by RFC 793. On little‑endian CPUs the bytes are reversed, so the packet carries destination port 0x5000 (20480) instead of 80. | The remote host discards the packet (no listening service) or responds with a RST; the application sees “Connection refused”. |
| 2 | **Assuming `sizeof(struct sockaddr)` equals wire size** – passing a larger struct (with extra padding) to `connect`. | The kernel copies **exactly** `addrlen` bytes from user space. If you pass a struct that includes compiler‑added padding beyond the defined `sockaddr_in` fields, those extra bytes are interpreted as part of the address (often garbage). | The kernel may interpret the garbage as an invalid address family, returning `EINVAL`, or worse, silently corrupt the address leading to mis‑routed packets. |
| 3 | **Not checking return values of `send`/`recv`** – treating them as guaranteed to transfer the full buffer. | TCP is a **stream** protocol; `send` may return fewer bytes than requested due to space limits in the send buffer, and `recv` may return 0 (EOF) or `-EAGAIN`/`EWOULDBLOCK` on nonblocking sockets. | Partial sends cause truncated messages; treating EOF as data leads to infinite loops or corrupted output. |
| 4 | **Using blocking sockets without handling `SIGPIPE`** – writing to a closed connection. | When the peer closes the TCP connection, the kernel generates `SIGPIPE` for a `write` on a broken pipe; the default action terminates the process. | The client aborts unexpectedly instead of reporting a clean error. The proper fix is either `signal(SIGPIPE, SIG_IGN)` or checking for `EPIPE` from `send`. |
| 5 | **Disabling Nagle’s algorithm globally with `setsockopt(..., TCP_NODELAY, ...)` on a latency‑insensitive bulk transfer**. | Nagle’s algorithm (RFC 896) reduces small‑packet overhead by buffering unacknowledged data until an ACK arrives. Turning it off increases packet count and CPU interrupt load. | For large file transfers this can cut throughput by 10‑30 % and increase interrupt latency on the NIC. The rule: enable `TCP_NODELAY` only for latency‑sensitive, small‑message protocols (e.g., RPC, gaming). |

---  

## Exercises  

### Exercise 1 – Easy: Decode an RFC Field  
*Given*: RFC 793 defines the TCP **Data Offset** field as 4 bits, indicating the number of 32‑bit words in the TCP header.  

1. Compute the minimum and maximum TCP header size in bytes.  
2. Show, using a C `struct`, how you would represent a TCP header with options up to the maximum size, using `__attribute__((packed))`.  

*Deliverable*: Short answer with calculations and a code snippet.  

### Exercise 2 – Medium: ABI Inspection  
1. Using `readelf -s` on the libc binary, locate the symbol `socket` and verify its version (`GLIBC_2.2.5`).  
2. Write a program that invokes `socket` **directly** via the `syscall` instruction (using `syscall(41, ...)`) and compare its return value to the glibc wrapper.  
3. Explain any difference in errno handling.  

*Deliverable*: Source code, build commands, and a brief write‑up.  

### Exercise 3 – Hard: Implement a Checksum Verifier  
Write a user‑space program that:  

1. Constructs a raw TCP segment (header + payload) according to RFC 793, **including** a pseudo‑header for the checksum calculation.  
2. Computes the one’s‑complement checksum **exactly** as the kernel does (you may reference the implementation in `net/ipv4/tcp_output.c`).  
3. Sends the segment with `sendto(..., IPPROTO_RAW)` to a local loopback address bound to a raw socket, then receives it back and validates the checksum.  

*Deliverable*: Full source, explanation of the one’s‑complement algorithm, and a test run showing success/failure when you deliberately corrupt a byte.  

---  

## Linux Connection  

### Manual Pages as Specification Anchors  
* `man 7 tcp` – describes the TCP state machine, socket options (`TCP_NODELAY`, `TCP_KEEPALIVE`, `TCP_MAXSEG`) and references RFC 793/1122.  
* `man 2 socket`, `man 2 connect`, `man 2 send`, `man 2 recv` – the ABI contracts (syscall numbers, argument registers, error codes).  
* `man 4 ip` – IP protocol specifics (header length, TOS, fragmentation).  

### Kernel Source Navigation  
* **Syscall entry** – `arch/x86/entry/syscalls/syscall_64.tbl` line 41: `common  socket  sys_socket`.  
* **Socket creation** – `net/socket.c:sock_create` → `__sys_socket`.  
* **TCP transmission** – `net/ipv4/tcp_output.c:tcp_transmit_skb` (builds header, computes checksum, calls `ip_queue_xmit`).  
* **NIC driver example** – Intel I210 driver: `drivers/net/ethernet/intel/i40e/i40e_tx.c` shows descriptor fields (`DMA_ADDR`, `CMD`, `LEN`).  

### Runnable Commands  

```bash
# 1. Show the socket syscall number and its definition
$ grep '#define __NR_socket' /usr/include/asm/unistd_64.h
#define __NR_socket 41

# 2. View the glibc wrapper for socket (dynamic)
$ objdump -T /lib/x86_64-linux-gnu/libc.so.6 | grep socket
000000000004f5a0 g    DF .text  0000000000000012  GLIBC_2.2.5 socket

# 3. Examine kernel source for the TCP checksum helper
$ grep -n 'csum_tcpudp_magic' net/ipv4/tcp_output.c
# (look at the function that builds the pseudo‑header)

# 4. List socket options documented in the man page
$ man 7 tcp | grep -A2 'TCP_NODELAY'

# 5. Check the layout of struct sockaddr_in with pahole (if installed)
$ pahole struct sockaddr_in
```

---  

## Why This Matters  

Specifications are the **foundation of trust** between hardware, kernel, and user space. When you read an RFC you learn *what must appear on the wire*; when you read the ABI you learn *how the kernel expects to receive that data*; when you study the architecture manual you learn *why the kernel must issue certain memory barriers or privilege checks*; and when you consult vendor docs you learn *how to turn those abstract requirements into register writes on a concrete device*.  

If any layer is misunderstood, the resulting software will:  

* **Fail silently** (mis‑ordered bytes, dropped packets) – leading to elusive bugs that appear only under load.  
* **Introduce security flaws** (buffer overflows from mis‑calculated lengths, privilege escalation via incorrect syscall numbers).  
* **Waste resources** (excessive interrupts, unnecessary retransmissions, suboptimal throughput).  

By mastering the habit of tracing a single operation—say, a `send` call—through the RFC → ABI → kernel → NIC stack, you acquire a mental model that lets you predict the effect of any change, debug failures faster, and write Linux software that is **correct, performant, and secure**. This is why reading specifications and standards is not a optional “nice‑to‑have” but a core competency for every Linux professional.
