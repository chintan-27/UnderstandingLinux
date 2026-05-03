---
id: 207
title: "RPC and service communication"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

When two processes on different machines need to cooperate, you cannot pass a pointer — memory addresses mean nothing across a network boundary. Every assumption that makes local function calls cheap (shared memory, stack frames, nanosecond latency, no partial failure) evaporates the moment you cross a network. RPC is the engineering discipline of making that cross-machine call *look* local while handling what can go wrong: the network drops your packet, the server crashes mid-execution, the response arrives after your deadline, or the two machines disagree on how to represent a 64-bit integer.

The failure modes are not theoretical. Without explicit serialization, `struct` layout differences silently corrupt data. Without idempotency, retries double-charge users. Without deadlines, a slow downstream service blocks threads until the entire call chain exhausts its connection pool. Every modern service framework — gRPC, Thrift, Sun RPC — is an answer to exactly these four problems: serialization, retries, deadlines, load balancing.

---

## Core Concepts

### Serialization: Turning Structure Into Bytes

A `struct` in C has a layout determined by your compiler, architecture, and ABI. No other machine shares those guarantees. Serialization converts in-memory data into a canonical byte sequence that any conforming implementation can decode — independent of compiler flags or CPU architecture.

Two concrete failure modes without it:

**Endianness mismatch.** A 32-bit integer `0x0A0B0C0D` stored little-endian in memory occupies bytes `[0D 0C 0B 0A]`. A big-endian host reading those same bytes naively reconstructs `0x0D0C0B0A`. The value is silently wrong — no signal is raised, no checksum fails unless you build one.

**Padding/alignment mismatch.** Consider:

```c
struct msg {
    char  type;     /* 1 byte */
    /* 3 bytes padding on most 32-bit x86 ABIs */
    int   value;    /* 4 bytes */
};
```

The compiler inserts 3 bytes after `type` to align `value` to a 4-byte boundary. A different compiler or a packed struct on the remote end places `value` at offset 1. Writing raw struct bytes over the wire means each side reads different fields.

You can inspect the actual layout at runtime:

```c
#include <stdio.h>
#include <stddef.h>

struct msg {
    char type;
    int  value;
};

int main(void) {
    printf("sizeof(msg)        = %zu\n", sizeof(struct msg));
    printf("offsetof(type)     = %zu\n", offsetof(struct msg, type));
    printf("offsetof(value)    = %zu\n", offsetof(struct msg, value));
    return 0;
}
```

```bash
gcc -o layout layout.c && ./layout
# sizeof(msg)        = 8
# offsetof(type)     = 0
# offsetof(value)    = 4
```

The Internet low-level standard for solving this is **XDR (eXternal Data Representation, RFC 4506)**: everything is big-endian, all values are aligned to 4-byte boundaries, strings carry an explicit length prefix. The encoding is fully deterministic regardless of host architecture.

### Retries: When to Try Again

Networks lose packets. A retry resends the same request after a timeout. The critical constraint is **idempotency**: an operation is idempotent if applying it $n$ times produces the same result as applying it once, for all $n \geq 1$.

- `GET /resource` — idempotent. The resource's state is unchanged by reading.
- `POST /transfer?amount=100` — **not** idempotent. Each execution moves money; retrying without deduplication charges the user twice.

The standard remedy: assign each request a unique nonce (the XID in Sun RPC, a UUID in HTTP APIs). The server stores `(nonce → result)` for recently completed requests. On receiving a duplicate nonce, it returns the cached result without re-executing. This is called **at-most-once** semantics. Without it, a retry policy turns a network blip into a data integrity violation.

### Deadlines: Bounding How Long You Wait

A **deadline** is an absolute timestamp after which the caller gives up. A **timeout** is a relative duration. The distinction matters in chained service calls.

If service A calls B which calls C, and A's deadline is $T_0 + 200\text{ms}$, A transmits the absolute value $T_0 + 200\text{ms}$ to B. B passes the *same* value to C. Each hop computes remaining time as $T_{\text{deadline}} - T_{\text{now}}$ and refuses to start work when that quantity is zero or negative.

A pure relative timeout compounds incorrectly: a 200 ms timeout at each of three hops allows up to 600 ms of latency before A's local timer fires, by which point A has already returned an error to its caller. The deadline has already expired; the downstream work was wasted.

Without deadlines, a slow service C blocks B's thread, which blocks A's thread. Thread pools exhaust, new requests queue, queues fill, the load balancer marks healthy instances as failed — a **cascading failure** originating in a single slow dependency.

### Load Balancing: Distributing Work

A single server has bounded throughput. Load balancing spreads requests across a pool. The core tradeoff is between **accuracy** (routing to the least-loaded server) and **coordination overhead** (measuring and communicating load state).

| Strategy | Mechanism | When to use |
|---|---|---|
| Round-robin | Cycle through servers in order | Uniform, cheap requests |
| Least connections | Track open connection count per server | Variable request duration |
| Consistent hashing | $\text{server} = H(\text{key}) \bmod N$ | Caching, stateful sessions |
| Power of two choices | Sample 2 random servers, route to less-loaded | Good balance, $O(1)$ coordination |

Consistent hashing deserves elaboration: when $N$ changes by 1 (a server is added or removed), only $\approx 1/N$ of keys must be remapped. A naive modulo scheme remaps nearly all keys, invalidating any server-side cache.

---

## How It Works

### XDR Serialization in Detail

XDR encodes a 32-bit unsigned integer as exactly 4 bytes, most-significant byte first. A variable-length byte string of $n$ bytes is encoded as a 4-byte length field followed by the bytes padded to the next 4-byte boundary:

$$\text{encoded\_size}(n) = 4 + 4\left\lceil \frac{n}{4} \right\rceil \text{ bytes}$$

For example, the string `"hi"` ($n = 2$) encodes to $4 + 4\lceil 2/4 \rceil = 4 + 4 = 8$ bytes: `[00 00 00 02]` followed by `[68 69 00 00]`. The two trailing zero bytes are mandatory padding, not part of the string.

A Sun RPC CALL frame (RFC 5531) on the wire:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     XID (transaction ID)                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|              Message Type (0=CALL, 1=REPLY)                   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    RPC Version (= 2)                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Program Number                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Version Number                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Procedure Number                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

The XID is the idempotency key. The client generates a random 32-bit XID, sends the CALL, and matches the REPLY by XID. On timeout, the client retransmits the *same* XID — the server detects the duplicate and replays the cached result without re-executing the procedure. This is why the XID must be random: a predictable sequence (0, 1, 2…) allows a delayed REPLY for XID $k$ to be mistaken for the REPLY to a later request that reused $k$ after wraparound.

In C, the Sun RPC client runtime in `libc` (glibc's `tirpc` or the standalone `libtirpc`) handles this in `clnt_call()`. The RPC credential and verifier fields follow the fixed header; authentication plugins are swapped in via the `AUTH *` pointer in the `CLIENT` structure.

### Retry with Exponential Backoff

Naive fixed-interval retries under load cause **retry storms**: all clients time out at the same moment and retransmit simultaneously, amplifying the load spike that caused the original failure. Exponential backoff with jitter spreads retries across time:

$$t_k = \min\!\left(t_{\max},\; t_{\text{base}} \cdot 2^k\right) + U\!\left(0,\; \delta\right)$$

where $k$ is the zero-indexed attempt number, $t_{\text{base}}$ is the initial wait (e.g., 100
