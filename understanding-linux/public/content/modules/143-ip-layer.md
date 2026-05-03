---
id: 143
title: "IP layer"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

IP is the waist of the Internet's hourglass: every transport protocol above it (TCP, UDP, QUIC) and every link technology below it (Ethernet, Wi-Fi, MPLS) must pass through it. The design choices in IPv4's header — a 16-bit identification field, a 13-bit fragment offset, an 8-bit TTL — are not arbitrary. Each field exists to solve a specific failure mode that would otherwise make internetworking impossible. Understanding the header at the bit level tells you exactly why `traceroute` works, why path MTU discovery can silently break, and why a misconfigured subnet mask produces connectivity failures that look random.

---

## Core Concepts

### IPv4 Addressing: 32-Bit Integers in Disguise

An IPv4 address is a 32-bit unsigned integer. Dotted-quad notation is purely a display convention; the kernel never uses it internally. The integer form is what matters for routing lookups, firewall rules, and subnet operations:

$$192.168.1.1 = \underbrace{11000000}_{192}\;\underbrace{10101000}_{168}\;\underbrace{00000001}_{1}\;\underbrace{00000001}_{1} = \texttt{0xC0A80101}$$

The address space spans $2^{32} = 4{,}294{,}967{,}296$ addresses. This became a critical shortage because classful allocation reserved enormous fixed blocks (a single Class A block holds $2^{24} - 2 = 16{,}777{,}214$ hosts regardless of need), NAT obscured billions of devices behind single public addresses, and IANA exhausted its free pool in 2011.

Converting a dotted-quad string to its 32-bit value and back:

```c
#include <arpa/inet.h>
#include <stdio.h>

int main(void) {
    struct in_addr addr;

    /* String → network-byte-order 32-bit integer */
    inet_pton(AF_INET, "192.168.1.1", &addr);
    printf("0x%08X\n", ntohl(addr.s_addr));   /* 0xC0A80101 */

    /* 32-bit integer → string */
    char buf[INET_ADDRSTRLEN];
    addr.s_addr = htonl(0xC0A80101);
    inet_ntop(AF_INET, &addr, buf, sizeof(buf));
    printf("%s\n", buf);                        /* 192.168.1.1 */
    return 0;
}
```

Never use the deprecated `inet_aton`/`inet_ntoa` pair — they are not thread-safe and do not handle IPv6.

### IPv6 Addressing: 128 Bits and Honest Notation

IPv6 addresses are 128 bits, written as eight 16-bit groups in hexadecimal separated by colons. The address space is:

$$2^{128} \approx 3.4 \times 10^{38}$$

To put that in perspective: if every atom on Earth's surface were assigned an IPv4 address, you would exhaust IPv4 in seconds. IPv6 can assign $\approx 6.7 \times 10^{17}$ addresses per square millimeter of Earth's surface.

Two canonical compression rules (RFC 5952):

1. **Drop leading zeros per group:** `0058` → `58`
2. **Replace the longest run of consecutive all-zero groups with `::`** (at most once — two `::` would be ambiguous about how many zero groups each absorbs)

```
fe80:0000:0000:0000:0001:0000:0000:0001
  →  fe80::1:0:0:1          (not fe80::1::1 — ambiguous)
```

The `struct in6_addr` in the kernel stores this as 16 contiguous bytes:

```c
#include <arpa/inet.h>
#include <stdio.h>

int main(void) {
    struct in6_addr addr;
    char buf[INET6_ADDRSTRLEN];

    inet_pton(AF_INET6, "fe80::1:0:0:1", &addr);
    inet_ntop(AF_INET6, &addr, buf, sizeof(buf));
    printf("%s\n", buf);   /* fe80::1:0:0:1 */

    /* Print raw bytes */
    for (int i = 0; i < 16; i++)
        printf("%02x ", addr.s6_addr[i]);
    printf("\n");
    return 0;
}
```

### CIDR and Subnetting

Classful addressing allocated fixed-size blocks (/8, /16, /24) with no mechanism for subdivision. The problem: a company needing 300 addresses got a Class B (65,534 hosts), wasting 65,234 addresses that no one else could use. CIDR (RFC 4632) replaced this with arbitrary prefix lengths.

In CIDR, `address/N` means:
- The **network prefix** occupies the top $N$ bits
- The **host portion** occupies the bottom $32 - N$ bits
- The subnet mask is the 32-bit value with $N$ leading 1s: $\texttt{0xFFFFFFFF} \ll (32 - N)$, masked to 32 bits

For `192.168.1.47/26`:

$$\text{mask} = \underbrace{11111111.11111111.11111111.}_{24\text{ bits}}\underbrace{11}_{+2}\underbrace{000000}_{6} = \texttt{255.255.255.192}$$

$$\text{network} = \texttt{192.168.1.47} \;\mathbin{\&}\; \texttt{255.255.255.192} = \texttt{192.168.1.0}$$

$$\text{broadcast} = \text{network} \;\mathbin{|}\; \mathbin{\sim}\text{mask} = \texttt{192.168.1.0} \;\mathbin{|}\; \texttt{0x3F} = \texttt{192.168.1.63}$$

$$\text{usable hosts} = 2^{32-26} - 2 = 62$$

The $-2$ subtracts the network address (all host bits zero) and the broadcast address (all host bits one), neither of which can be assigned to an interface.

A `/26` partitions the final octet into four blocks: `.0/26`, `.64/26`, `.128/26`, `.192/26`. These can only be aggregated if they are numerically contiguous **and** the merged block aligns to a power-of-two boundary. `.0/26` and `.64/26` aggregate to `.0/25` because together they span bits $[0,127]$ and the `.0` address has bit 25 clear. But `.64/26` and `.128/26` cannot aggregate — they are not contiguous in a power-of-two sense (their combined range $[64,191]$ is not a valid CIDR block).

Quickly verify subnet math from the shell:

```bash
# ipcalc gives network/broadcast/range immediately
ipcalc 192.168.1.47/26

# ip shows what the kernel assigned to an interface
ip -4 addr show dev eth0

# Check what network a host is on (useful in scripts)
python3 -c "
import ipaddress
n = ipaddress.ip_interface('192.168.1.47/26').network
print(n)                          # 192.168.1.0/26
print(n.num_addresses - 2)        # 62 usable
"
```

### Fragmentation

Every link layer defines a **Maximum Transmission Unit (MTU)**: the largest payload it can carry in a single frame. Ethernet's standard MTU is 1500 bytes. If an IPv4 datagram's Total Length exceeds the MTU on an outgoing interface and the DF (Don't Fragment) bit is clear, the router fragments it.

Fragmentation splits the IP payload (not the header) into pieces. Each fragment is a complete IP datagram — it acquires its own header — and is routed independently. The destination host reassembles them. Three header fields coordinate this:

| Field | Size | Role |
|---|---|---|
| Identification | 16 bits | Same across all fragments of one original datagram |
| MF flag | 1 bit | Set on every fragment except the last |
| Fragment Offset | 13 bits | Byte position of this fragment's data ÷ 8 |

The offset is in units of 8 bytes because only 13 bits are available, yet the field must express positions up to 65,528 bytes (maximum payload):

$$\text{max offset value} = 2^{13} - 1 = 8191 \implies \text{max byte position} = 8191 \times 8 = 65{,}528$$

This unit constraint forces every fragment except the last to carry a payload whose length is a multiple of 8 bytes. If the original payload is 3020 bytes and the MTU is 1500 bytes:

$$\text{max fragment data} = \lfloor (1500 - 20) / 8 \rfloor \times 8 = 1480 \text{ bytes}$$

| Fragment | Offset field | Data bytes | MF |
|---|---|---|---|
| 1 | 0 | 1480 | 1 |
| 2 | 185 | 1480 | 1 |
| 3 | 370 | 60 | 0 |

Fragment 2's offset: $1480 / 8 = 185$. Fragment 3's offset: $2960 / 8 = 370$.

The reassembled datagram's maximum size is bounded by the 16-bit Total Length field: $2^{16} - 1 = 65{,}535$ bytes, of which at most $65{,}535 - 20 = 65{,}515$ bytes are payload.

**IPv6 removes in-network fragmentation entirely.** Ro
