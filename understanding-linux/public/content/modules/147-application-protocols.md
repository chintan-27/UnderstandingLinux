---
id: 147
title: "Application protocols"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

When a machine boots with no IP address, it cannot unicast to anything — it doesn't know a server address, a gateway, or even its own identity. The only tool it has is Layer 2 broadcast. DHCP exploits this: a client broadcasts into the local segment, a server responds with a complete network identity, and the client transitions from Layer 2 isolation to fully routable in four packets. Every failure mode in this protocol — stale leases, exhausted pools, misconfigured relay agents — manifests as "the network is down" from the application layer's perspective, which is why understanding the mechanics matters beyond the happy path.

---

## Core Concepts

### BOOTP as Ancestor

DHCP does not have its own wire format. It reuses BOOTP (RFC 951, 1985) byte-for-byte, adding leases and a negotiation state machine on top. This inheritance has a concrete consequence: DHCP relay agents speak BOOTP because the framing is identical — only the options field distinguishes them. The `Op` field in the shared header takes only two values (1=request, 2=reply), which is insufficient to describe DHCP's eight message types. The actual message type lives in **Option 53**, which means any code that dispatches on DHCP message type must parse TLV options, not just the fixed header.

### The Lease Model

The server lends an address for duration $T_\text{lease}$, tracked by two renewal deadlines:

$$T_1 = \frac{T_\text{lease}}{2}, \qquad T_2 = \frac{7 \cdot T_\text{lease}}{8}$$

These aren't arbitrary fractions. $T_1$ is chosen to give the client half the lease period to attempt a quiet unicast renewal with its original server before anything visible happens on the network. $T_2$ is set close to expiry so the client has a last-resort window to broadcast to *any* server if the original is unreachable. If neither succeeds and the lease expires, the client loses its IP and must restart DORA from scratch — causing an application-layer outage.

The reclaim mechanism is the reason for leases at all: a device that powers off without sending `DHCPRELEASE` would permanently consume an address in a static-assignment model. With leases, the address returns to the pool after $T_\text{lease}$ regardless.

For a 24-hour lease ($T_\text{lease} = 86400\text{ s}$):

$$T_1 = 43200\text{ s} \quad (12\text{ h}), \qquad T_2 = 75600\text{ s} \quad (21\text{ h})$$

### Address Conflict Detection (ACD)

After receiving `DHCPACK`, a well-behaved client does not immediately configure the interface. It first sends a gratuitous ARP probing the offered IP. If any host replies, the address is in use despite the server's belief otherwise — stale server state caused by a client that left without releasing. The client sends `DHCPDECLINE`, then waits a mandatory 10 seconds before restarting (RFC 2131 §3.1, to avoid flooding a broken server). The 10-second delay is not advisory; it is the specified backoff.

### Options as the Real Protocol

The fixed BOOTP header carries addressing. Every DHCP-specific semantic — message type, lease duration, DNS servers, default gateway, domain name, PXE boot instructions — lives in the **Options field**. Option 53 is mandatory and carries the DHCP message type as a single byte:

| Value | Message       | `Op` |
|-------|---------------|------|
| 1     | DHCPDISCOVER  | 1    |
| 2     | DHCPOFFER     | 2    |
| 3     | DHCPREQUEST   | 1    |
| 4     | DHCPDECLINE   | 1    |
| 5     | DHCPACK       | 2    |
| 6     | DHCPNAK       | 2    |
| 7     | DHCPRELEASE   | 1    |
| 8     | DHCPINFORM    | 1    |

Both `DHCPDISCOVER` and `DHCPREQUEST` have `Op=1`. Dispatching on `Op` alone is a bug.

Options use **TLV encoding**: one byte type, one byte length, *n* bytes value. Two options are single-byte exceptions: `Pad` (type 0, no length, no value — used for alignment) and `End` (type 255, terminates the options field). All other options must have explicit length bytes, which is why a parser that skips the length field on option 0 or 255 will misalign on everything that follows.

### Relay Agents

A client broadcasts because it has no IP address and therefore cannot unicast. Routers drop broadcasts by default, so without intervention, DHCP would require a server on every subnet. A **relay agent** — typically running on the subnet's default gateway — intercepts the client's broadcast, fills the `giaddr` field with its own interface address, and unicasts the packet to a configured DHCP server. The server inspects `giaddr` to select the correct address pool: not the server's own subnet, but the client's. The relay then unicasts the server's response back to the client (or broadcasts it onto the client's segment if the client's broadcast flag is set).

The `giaddr` field is what makes a single DHCP server able to serve thousands of subnets. Without it, the server cannot distinguish a client on 10.1.0.0/24 from one on 10.2.0.0/24.

---

## How It Works

### The DORA Exchange

```
Client                              Server
  |                                   |
  |--DHCPDISCOVER (broadcast)-------> |  src: 0.0.0.0:68, dst: 255.255.255.255:67
  |                                   |
  |<--DHCPOFFER (broadcast or unicast)|  yiaddr: 10.0.0.57, lease: 43200s
  |                                   |
  |--DHCPREQUEST (broadcast)--------> |  "I accept the offer from server X"
  |                                   |
  |<--DHCPACK (broadcast or unicast)--|  confirmed
  |                                   |
```

The `DHCPREQUEST` remains a broadcast even though the client now knows the server's IP. This is intentional: multiple servers may have responded to the `DHCPDISCOVER` and speculatively reserved addresses. Broadcasting the `DHCPREQUEST` — which includes the chosen server's identifier in Option 54 — tells all other servers their offer was declined, freeing those reservations. A unicast `DHCPREQUEST` to the chosen server would leave other servers holding stale reservations until they time out.

The client sends `DHCPDISCOVER` from `0.0.0.0:68` to `255.255.255.255:67` because it has no source address yet. The server's `DHCPOFFER` includes the offered IP in `yiaddr`, not in the IP header's destination — the response is sent to broadcast (or to the client's MAC directly, if the client's broadcast flag is cleared and the OS supports pre-assignment ARP injection).

### Message Format

```c
struct dhcp_packet {
    uint8_t  op;          /* 1=BOOTREQUEST, 2=BOOTREPLY */
    uint8_t  htype;       /* Hardware type: 1=Ethernet */
    uint8_t  hlen;        /* Hardware address length: 6 for Ethernet */
    uint8_t  hops;        /* Incremented by each relay agent */
    uint32_t xid;         /* Transaction ID: random 32-bit, client-chosen */
    uint16_t secs;        /* Seconds since client began acquisition */
    uint16_t flags;       /* Bit 15: broadcast flag; bits 14-0: reserved */
    uint32_t ciaddr;      /* Client IP, only set if client is in BOUND/RENEW/REBIND */
    uint32_t yiaddr;      /* "Your" IP: address being offered */
    uint32_t siaddr;      /* IP of next bootstrap server (e.g. TFTP for PXE) */
    uint32_t giaddr;      /* Relay agent IP; 0 if no relay */
    uint8_t  chaddr[16];  /* Client hardware address; MAC in bytes 0-5, rest zero */
    uint8_t  sname[64];   /* Optional server hostname, null-terminated */
    uint8_t  file[128];   /* Boot filename, null-terminated */
    uint8_t  options[];   /* Variable; begins with 4-byte magic cookie */
};
```

The total fixed-header size before `options[]` is:

$$4 + 4 + 2 + 2 + 4 \times 4 + 16 + 64 + 128 = 236 \text{ bytes}$$

The Options field begins with the **magic cookie** `0x63825363`, which in dotted-decimal reads 99.130.83.99. This value distinguishes DHCP option encoding from BOOTP's original "vendor extensions" format. A parser that doesn't verify the magic cookie before interpreting TLV data will misparse BOOTP packets.

A minimal `DHCPDISCOVER` options field:

```
63 82 53 63        ← magic cookie
35 01 01           ← Option 53 (DHCP Message Type), len=1, value=1 (DISCOVER)
37 04 01 03 06 0f  ← Option 55 (Parameter Request List): subnet mask, router, DNS, domain
ff                 ← Option 255 (End)
```

The transaction ID `xid` is a random $2^{32}$-space value. Its purpose is to correlate responses to requests when multiple clients are exchanging simultaneously on the same segment. With $N$ concurrent exchanges, the probability of at least one collision is approximately:

$$P(\text{collision}) \approx 1 - e^{-N(N-1)/(2 \cdot 2^{32})}$$

which is negligible for any realistic $N$ but worth knowing if you are writing a
