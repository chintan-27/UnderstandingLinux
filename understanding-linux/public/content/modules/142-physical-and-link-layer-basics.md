---
id: 142
title: "Physical and link layer basics"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

Every byte you send over a network must become a physical signal before anything else can happen. IP addressing, TCP reliability, DNS resolution — none of it exists until two interfaces on the same segment can agree on which bits belong to which machine. MAC addresses and Ethernet framing solve the local delivery problem: given four machines on the same switch, how does a frame reach exactly one of them without the others processing it? Understanding this layer explains why ARP exists, why the kernel maintains a neighbor table, why switches build forwarding tables, and why a misconfigured MTU silently corrupts throughput.

---

## Core Concepts

### Copper Signaling: Why Twisted Pair Works

A network interface encodes bits as voltage transitions on copper. The "twisted" geometry is not cosmetic — twisting the two conductors of a pair together ensures that any electromagnetic interference hits both wires nearly simultaneously. The receiver amplifies the *differential* voltage $V_+ - V_-$ rather than absolute voltage, so common-mode noise cancels algebraically. This is why 1000BASE-T reliably operates through the switching-power-supply noise in a server room.

Raw binary encoding fails at the physical layer because long runs of identical bits produce no transitions, and the receiver's clock recovery circuit loses synchronization. 100BASE-TX uses MLT-3 (Multi-Level Transmit, 3 levels): the signal cycles through $\{-1, 0, +1, 0, -1, \ldots\}$ on each `1` bit and stays constant on `0`, guaranteeing transitions. 1000BASE-T uses PAM-5 (five voltage levels) across all four pairs simultaneously, encoding 2 bits per symbol per pair.

For a link running at symbol rate $f_s$ symbols/second with $\log_2 M$ bits per symbol:

$$R = f_s \cdot \log_2 M \text{ bits/second}$$

1000BASE-T: $f_s = 125 \times 10^6$ symbols/s, $M = 5$ (PAM-5, but one level is used for error correction, giving an effective $\log_2 4 = 2$ bits/symbol per pair), four pairs: $125 \times 10^6 \times 2 \times 4 = 10^9$ b/s.

### Fiber: Attenuation and Why Distance Changes Everything

Fiber carries modulated light. The absence of electrical conduction eliminates electromagnetic interference entirely and reduces attenuation by roughly two orders of magnitude compared to copper. Signal power decays exponentially with distance:

$$P(d) = P_0 \cdot e^{-\alpha d}$$

For single-mode fiber at 1550 nm, $\alpha \approx 0.046\ \text{km}^{-1}$ (about 0.2 dB/km). For Cat6a copper at 500 MHz, $\alpha$ is roughly $100\times$ higher. A link budget check: if a transceiver outputs $P_0 = 1\ \text{mW}$ and the receiver requires $P_{\min} = 0.01\ \text{mW}$, the maximum reach before the signal is unreadable is:

$$d_{\max} = \frac{\ln(P_0 / P_{\min})}{\alpha} = \frac{\ln(100)}{0.046} \approx 100\ \text{km}$$

This is why 100GbE copper DAC cables top out at 5 meters, while 100GbE single-mode optics span 10–80 km. When a fiber link flaps intermittently, the first diagnostic question is whether received optical power is near the sensitivity floor — `ethtool -m <interface>` reports this on most transceivers.

### MAC Addresses: Structure and Kernel Representation

A MAC address is a 48-bit link-layer identifier. Its structure is not arbitrary:

```
Bit 47 (MSB of byte 0): I/G flag — 0 = unicast, 1 = multicast/broadcast
Bit 46:                 U/L flag — 0 = globally unique (OUI-assigned), 1 = locally administered
Bits 45–24:             OUI (Organizationally Unique Identifier, IEEE-assigned per vendor)
Bits 23–0:              NIC-specific serial, assigned by vendor
```

`ff:ff:ff:ff:ff:ff` is the broadcast address (all bits set). Any frame with this destination is accepted by every interface on the segment — this is how ARP requests reach all hosts simultaneously.

The U/L bit (bit 46) is how `ip link set eth0 address` works when you assign a locally administered address: the kernel sets this bit to signal that the address is not IEEE-assigned. When you generate a random MAC for a virtual interface, setting the U/L bit and clearing the I/G bit gives a valid unicast locally administered address:

```bash
# Read current MAC and flags
ip link show eth0

# Assign a locally administered unicast MAC
# Byte 0 = 0x02: bit 46 set (U/L), bit 47 clear (unicast)
ip link set eth0 address 02:de:ad:be:ef:01

# Inspect the raw bytes as the kernel sees them
cat /sys/class/net/eth0/address
```

In the kernel, a MAC address is a `u8[6]` array. The `net_device` structure carries it in two fields:

```c
// include/linux/netdevice.h (simplified)
struct net_device {
    unsigned char dev_addr[MAX_ADDR_LEN];   /* current MAC address */
    unsigned char perm_addr[MAX_ADDR_LEN];  /* permanent hardware MAC */
    // ...
};
```

`perm_addr` is burned into the NIC firmware. `dev_addr` is what the interface actually uses and can be changed at runtime. They diverge when you spoof a MAC.

### Ethernet Framing: Every Field Has a Job

An Ethernet II frame (the dominant format; 802.3 with LLC/SNAP is rare outside legacy bridging):

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                  Destination MAC (bytes 0–3)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Destination MAC (bytes 4–5)   |  Source MAC (bytes 0–1)      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                  Source MAC (bytes 2–5)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         EtherType             |        Payload (variable)    /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+                              /
/                    46–1500 bytes                            /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        FCS (4 bytes)                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

| Field | Size | Purpose |
|---|---|---|
| Destination MAC | 6 bytes | Link-layer delivery target |
| Source MAC | 6 bytes | Sender identity; switch learns this to build its forwarding table |
| EtherType | 2 bytes | Demultiplexes payload to the correct network-layer handler |
| Payload | 46–1500 bytes | IP packet, ARP message, or other L3 PDU |
| FCS | 4 bytes | CRC-32 over the entire frame; corrupt frames are silently dropped |

EtherType values worth knowing: `0x0800` = IPv4, `0x0806` = ARP, `0x86DD` = IPv6, `0x8100` = 802.1Q VLAN tag, `0x88CC` = LLDP.

The EtherType field is *why* the kernel can hand the payload to the right protocol handler without inspecting the payload itself. The driver passes the frame to `eth_type_trans()`, which reads the EtherType and sets `skb->protocol`, allowing `netif_receive_skb()` to dispatch to the registered handler for that protocol.

**Minimum frame size**: the 46-byte minimum payload enforces a 64-byte minimum frame. On half-duplex Ethernet, collision detection requires that a transmitted frame still be on the wire when a collision echo returns. At 10 Mb/s, the round-trip propagation time across the maximum cable run (up to 2500 m with repeaters) is $\approx 51.2\ \mu\text{s}$, which corresponds to exactly 512 bits = 64 bytes. Frames shorter than this would finish transmitting before a far-end collision was detectable. Full-duplex switched Ethernet has no collisions, but the minimum frame size is preserved for compatibility.

### CRC-32: Why Silent Discard Is the Right Behavior

The FCS is a CRC-32 computed over the frame's destination MAC through the end of the payload. CRC-32 uses the polynomial:

$$G(x) = x^{32} + x^{26} + x^{23} + x^{22} + x^{16} + x^{12} + x^{11} + x^{10} + x^8 + x^7 + x^5 + x^4 + x^2 + x + 1$$

represented in hex as `0xEDB88320` (reflected form used in hardware). The receiver recomputes the CRC over the arriving frame and compares it to the FCS. Any mismatch means the frame was corrupted and
