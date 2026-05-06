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

## Core Concepts
### Physical Layer Fundamentals
The physical layer is concerned with the **electrical, optical, or radio representation of bits** and the **synchronization** needed to recover those bits at the receiver.  
Key responsibilities:

* **Line coding** – maps binary digits to signal levels. Choices affect DC balance, clock content, and bandwidth.  
  *NRZ‑L* (non‑return‑to‑zero level) transmits a constant voltage for each bit but lacks built‑in clock transitions, making long runs of identical bits problematic for clock recovery. *Manchester* encoding guarantees a transition in the middle of each bit period, providing self‑clocking at the cost of doubling the required bandwidth.  
* **Modulation** – when the medium is band‑pass (e.g., wireless, DSL), the baseband line code is shifted to a carrier frequency using ASK, FSK, PSK, or QAM. The choice trades spectral efficiency against robustness to noise and interference.  
* **Bit rate vs. baud rate** – the **bit rate** \(R_b\) (bits/s) equals the **baud rate** \(R_s\) (symbols/s) times the number of bits per symbol \(k\):  
  \[
  R_b = k \, R_s .
  \]  
  For Manchester, \(k=1/2\) (one data bit per two symbol periods), so the baud rate is twice the bit rate.

* **Nyquist limit** – a noiseless channel of bandwidth \(B\) Hz can support at most \(2B\) symbols per second without inter‑symbol interference. Hence the maximum achievable bit rate for a given line code is \(R_b \le 2B \log_2 M\) where \(M\) is the number of distinct signal levels.

* **Shannon limit** – with signal‑to‑noise ratio \(S/N\), the channel capacity is  
  \[
  C = B \log_2\!\left(1+\frac{S}{N}\right) \text{ bits/s}.
  \]  
  Practical line codes and modulation schemes aim to approach this bound.

### Link Layer Fundamentals
The link layer (OSI layer 2) provides **node‑to‑node delivery** over a single physical segment. Its core functions are:

1. **Framing** – encapsulates network‑layer packets into a frame with delimiters, addressing, and error detection.  
2. **Addressing** – uses **MAC addresses** to identify the specific NIC that should receive the frame on a shared medium.  
3. **Error detection** – appends a frame check sequence (FCS) (usually a CRC‑32) so the receiver can detect corruption introduced by the physical layer.  
4. **Media access control** – regulates when a node may transmit (e.g., CSMA/CD for classic half‑duplex Ethernet, CSMA/CA for Wi‑Fi, or TDMA for switched full‑duplex links).  

#### MAC Address Structure
A MAC address is 48 bits, conventionally written as six hexadecimal octets. The bits have specific meanings:

| Bit position (from left) | Meaning |
|--------------------------|---------|
| **I/G** (Individual/Group) – bit 0 of the first octet | 0 = unicast (individual NIC), 1 = multicast/broadcast |
| **U/L** (Universal/Local) – bit 1 of the first octet | 0 = globally unique (assigned by IEEE), 1 = locally administered |
| Remaining 46 bits | vendor‑assigned (OUI) + NIC‑specific |

Example: `02:1a:2b:3c:4d:5e` is locally administered (`02` = `0000 0010` → I/G=0, U/L=1) and thus not guaranteed to be globally unique.

#### Ethernet Frame Format (IEEE 802.3)
```
+--------+--------+------------+----------+---------+--------+
| Preamble | SFD | Dest MAC | Src MAC | EtherType| Payload | FCS |
+--------+--------+------------+----------+---------+--------+
```
* **Preamble** (7 bytes) – alternating `10101010` pattern allows the receiver’s clock recovery circuit to lock onto the incoming signal.  
* **SFD** (Start Frame Delimiter, 1 byte) – `10101011` signals the end of the preamble and the start of the actual frame.  
* **Dest MAC / Src MAC** – 6 bytes each.  
* **EtherType** – 2 bytes; indicates the protocol of the payload (`0x0800` for IPv4, `0x86DD` for IPv6, `0x0806` for ARP). In early Ethernet the same field could hold the payload length (< 1500) but modern usage treats it strictly as EtherType.  
* **Payload** – 46‑1500 bytes (padding added if < 46 bytes to meet minimum frame size).  
* **FCS** (Frame Check Sequence) – 4 bytes containing a CRC‑32 over the Destination MAC, Source MAC, EtherType, and Payload fields (excluding preamble and SFD).  

The CRC‑32 uses the polynomial  
\[
G(x) = x^{32}+x^{26}+x^{23}+x^{22}+x^{16}+x^{12}+x^{11}+x^{10}+x^{8}+x^{7}+x^{5}+x^{4}+x^{2}+x+1
\]  
represented in normal form as `0x04C11DB7`. The transmitted FCS is the **bit‑wise complement** of the remainder.

---

## How It Works
### From Upper‑Layer Data to Transmitted Bits
1. **Packet handoff** – The network layer (e.g., IP) passes a packet to the link layer via a socket buffer (`struct sk_buff` in Linux).  
2. **Framing** – The link layer allocates a new `skb`, reserves space for the Ethernet header (`struct ethhdr`), copies the packet into the data area, and computes the CRC‑32 over the header+data.  
   *Why*: The header contains the addressing needed for the NIC to decide whether to accept the frame; the FCS lets the receiver detect bit flips, burst errors, or mis‑delimitations introduced by the physical medium.  
3. **Header population** –  
   * Destination MAC is filled from the ARP cache (or broadcast `ff:ff:ff:ff:ff:ff` for ARP requests).  
   * Source MAC is taken from `dev->dev_addr`.  
   * EtherType is set according to the packet’s protocol (`htons(ETH_P_IP)` for IPv4).  
4. **Transmission queue** – The framed `skb` is handed to the device driver’s `hard_start_xmit` (or `ndo_start_xmit`) callback, which copies the data into the NIC’s transmit ring buffer and updates the NIC’s DMA descriptors.  
5. **Physical layer encoding** – The NIC’s MAC (Media Access Control) sub‑serializer converts the octet stream into the chosen line code (e.g., NRZ for copper, MLT‑3 for 100BASE‑TX, PAM‑5 for 10GBASE‑T). Simultaneously, it inserts the preamble and SFD before the first data octet.  
   *Why preamble/SFD*: The receiver’s clock recovery circuit needs a known pattern to synchronize its sampling clock; the SFD provides a unique marker so the receiver knows where the MAC header begins.  
6. **Signal propagation** – The encoded electrical/optical signal travels over the medium (twisted‑pair, fiber, wireless). Attenuation, noise, and dispersion may corrupt bits.  
7. **Reception** – The NIC’s analog front‑end amplifies, filters, and samples the signal at the baud rate. The decoder (inverse of the line code) recovers the raw octet stream, stripping preamble and SFD.  
8. **FCS verification** – The NIC (or driver) recomputes the CRC‑32 over the received header+payload and compares it to the received FCS. A mismatch triggers a discard event counted in `rx_errors`/`rx_crc_errors`.  
9. **Frame acceptance** – If the FCS matches and the destination MAC matches the NIC’s address (or is a multicast/broadcast address the NIC is configured to accept), the driver strips the Ethernet header, places the payload in a new `skb`, and passes it up the stack via `netif_receive_skb`.  
10. **Upper‑layer processing** – The network layer (IP) examines the EtherType, dispatches to the appropriate protocol handler (e.g., `ip_rcv`), and the cycle repeats.

### Timing Example (100 Mbps Ethernet)
* **Bit time** \(T_b = 1 / 100\text{ Mbps} = 10\text{ ns}\).  
* **Slot time** (for CSMA/CD) = 512 bit‑times = 5.12 µs, chosen to be twice the maximum round‑trip propagation delay in a 2500 m collision domain (2 × 2500 m / (2 × 10⁸ m/s) ≈ 25 µs one‑way).  
* **Inter‑packet gap** = 96 bit‑times = 9.6 µs, ensuring the NIC has time to reset its internal state between frames.

---

## Worked Examples
### Example 1: Building and Verifying an Ethernet Frame (IPv4 Payload)
Suppose we want to send the IPv4 packet `0x45 0x00 0x00 0x3c 0x1c 0x46 0x00 0x00 0x40 0x06 0x00 0x00 0xc0 0xa8 0x01 0x64 0xc0 0xa8 0x01 0x01` (20‑byte header + no data) from host A (`MAC_A = 00:11:22:33:44:55`, `IP_A = 192.168.1.100`) to host B (`MAC_B = aa:bb:cc:dd:ee:ff`, `IP_B = 192.168.1.1`).  

**Step‑by‑step**

1. **Assemble Ethernet header** (big‑endian):  

   ```c
   struct ethhdr {
       unsigned char   h_dest[ETH_ALEN];   // 6
       unsigned char   h_source[ETH_ALEN]; // 6
       __be16          h_proto;            // 2
   };
   ```
   * `h_dest` = `{0xaa,0xbb,0xcc,0xdd,0xee,0xff}`  
   * `h_source` = `{0x00,0x11,0x00,0x33,0x44,0x55}`  
   * `h_proto` = `htons(ETH_P_IP)` = `0x0800`  

2. **Concatenate header + payload** (total length = 14 + 20 = 34 bytes).  

3. **Compute CRC‑32** (standard Ethernet polynomial, reflected input/output, final xor `0xFFFFFFFF`). Using a reference implementation:

   ```bash
   # Build a binary file with header+payload
   printf '\xaa\xbb\xcc\xdd\xee\xff\x00\x11\x00\x33\x44\x55\x08\x00' > frame.bin
   printf '\x45\x00\x00\x3c\x1c\x46\x00\x00\x40\x06\x00\x00\xc0\xa8\x01\x64\xc0\xa8\x01\x01' >> frame.bin
   # Compute CRC-32 (Linux utility crc32 from libmhash)
   crc32 < frame.bin
   # Output: 0x9e1c5d3a
   ```

   The transmitted FCS is the bitwise complement: `0x61e3a2c5`.  

4. **On‑the‑wire byte order** (including preamble and SFD):  

   ```
   Preamble: 55 55 55 55 55 55 55
   SFD:      D5
   Dest MAC: aa bb cc dd ee ff
   Src MAC:  00 11 00 33 44 55
   EtherType: 08 00
   Payload:  45 00 00 3c 1c 46 00 00 40 06 00 00 c0 a8 01 64 c0 a8 01 01
   FCS:      c5 a2 e3 61   (note: little‑endian transmission of each byte, but bits within each byte are sent LSB‑first for Ethernet)
   ```

5. **Receiver check** – The NIC recomputes CRC‑32 over the same octets (excluding preamble/SFD) and obtains `0x9e1c5d3a`. It compares with the received FCS (`0x61e3a2c5` after complement) → match → frame accepted.

### Example 2: Deriving a Locally Administered MAC from an IPv4 Address (Illustrative)
While real hardware does **not** derive MAC from IP, the exercise shows bit manipulation.

Given IPv4 address `192.168.1.100` → 32‑bit value `0xC0A80164`.  
Choose a 24‑bit OUI `0x001ABC` (locally administered → set U/L=1).  

Compute:  

\[
\text{MAC}_{48} = (\text{OUI} << 24) \;|\; (\text{IP}_{32} \oplus 0x12345678)
\]

* `OUI << 24` = `0x001ABC000000`  
* `IP xor 0x12345678` = `0xC0A80164 ⊕ 0x12345678 = 0xD29C571C`  
* Combine → `0x001ABCD29C571C`  

Rendered as hex groups: `00:1a:bc:d2:9c:57:1c` → truncate to 48 bits → `00:1a:bc:d2:9c:57`.  
Set U/L bit: the second hex digit of the first octet (`0x00` → `0000 0000`). To make it locally administered we set bit 1 → `0x02`. Final MAC: `02:1a:bc:d2:9c:57`.

**C implementation** (demonstrates endianness and bitwise ops):

```c
#include <stdint.h>
#include <stdio.h>

int main(void) {
    uint32_t ip = 0xC0A80164;          // 192.168.1.100
    uint32_t seed = 0x12345678;
    uint32_t host_part = ip ^ seed;    // 0xD29C571C
    uint8_t mac[6];
    mac[0] = 0x02;                     // locally administered, unicast
    mac[1] = 0x1a;
    mac[2] = 0xbc;
    mac[3] = (host_part >> 16) & 0xff;
    mac[4] = (host_part >> 8)  & 0xff;
    mac[5] =  host_part        & 0xff;
    printf("%02x:%02x:%02x:%02x:%02x:%02x\n",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return 0;
}
```

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Understanding |
|---|---------|----------------|-----------------------|
| 1 | **Assuming MAC addresses are globally unique by default** | The U/L bit determines uniqueness; a locally administered address (`U/L=1`) may clash with another device if not coordinated. | Always check the U/L bit; for virtual interfaces (e.g., VPN, containers) you often set a locally administered MAC deliberately. |
| 2 | **Confusing the EtherType field with the length field** | In original Ethernet (1980) the field could hold length (< 1500) *or* EtherType (≥ 1506). Modern IEEE 802.3 treats it strictly as EtherType; length is implied by the MAC layer’s frame size. | Treat the field as EtherType; if you need to know payload length, use `skb->len - ETH_HLEN`. |
| 3 | **Believing the CRC‑32 detects all errors** | CRC‑32 catches all single‑bit, double‑bit, odd‑bit, and burst errors up to 32 bits, but certain multi‑burst patterns can slip through (probability ≈ 2⁻³²). | Use stronger checks (e.g., CRC‑64 in some link‑layer protocols) or higher‑layer integrity (TCP checksum, application‑level hashes) when needed. |
| 4 | **Thinking the preamble is part of the frame size for MTU calculations** | The preamble (8 bytes) and SFD are **not** counted toward the Ethernet MTU (1500 bytes). They are overhead added by the PHY. | MTU = maximum payload size; maximum Ethernet frame on the wire = 14 (header) + payload + 4 (FCS) + 8 (preamble+SFD) = 1518 bytes (or 1522 with VLAN tag). |
| 5 | **Using host byte order for multi‑byte fields in packet construction** | Network protocols define big‑endian (network byte order) for fields like EtherType, IP addresses, TCP/UDP ports. | Always convert with `htons()`/`htonl()` when filling headers, and `ntohs()`/`ntohl()` when reading. |
| 6 | **Assuming all NICs support jumbo frames (> 1500 MTU) without checking** | Jumbo frame support requires NIC driver, switch, and sometimes kernel configuration (`net.dev.mtu`). Enabling it on a mismatched link causes frame drops or silent truncation. | Verify with `ethtool -i eth0` (driver version) and `ethtool -k eth0` (features: `tx-checksumming`, `rx-checksumming`, `jumbo-frame`). |

---

## Exercises
### Easy
1. **CRC‑8 Computation** – Given the byte sequence `0x31 0x32 0x33 0x34`, compute the CRC‑8 using polynomial `x⁸ + x² + x + 1` (`0x07`). Show the intermediate shift‑register states.  
2. **MAC Address Extraction** – Run `ip link show eth0` and parse the output to isolate the MAC address. Write a one‑liner Bash script that prints it in uppercase.

### Medium
3. **Ethernet Frame Parser** – Write a C program that reads a raw Ethernet frame from a binary file (no preamble/SFD) and prints: destination MAC, source MAC, EtherType (as hex), payload length, and validates the CRC‑32. Use libpcap’s `pcap_open_offline` if you prefer reading a pcap.  
4. **Linux ethtool Statistics** – Execute `ethtool -S eth0` and explain the meaning of at least three counters (e.g., `rx_packets`, `tx_errors`, `rx_crc_errors`). Correlate each with a possible root cause (cable fault, duplex mismatch, excessive collisions).

### Hard
5. **Simple Ethernet Driver Skeleton** – Using the Linux netdevice API, implement a minimal driver that allocates an `etherdev`, sets the MAC address to `02:00:00:00:00:01`, and in `hard_start_xmit` simply prints the frame length and drops the packet (no actual hardware). Register the device with `register_netdev`. Compile as a loadable module (`make -C /lib/modules/$(uname -r)/build M=$(pwd) modules`).  
6. **Jumbo Frame Performance Test** – Configure two directly connected machines with MTU = 9000, send a large UDP payload using `iperf3 -u -l 8000 -b 100M`, and compare CPU utilization and retransmission rates with the default MTU = 1500. Explain why larger MTU can reduce per‑packet overhead but increase susceptibility to noise‑induced corruption.

---

## Linux Connection
### Kernel Subsystems
| Subsystem | Purpose | Key Structures / Functions |
|-----------|---------|----------------------------|
| **netdev** (`net/core/dev.c`) | Generic network device representation. | `struct net_device` (represents a NIC), `alloc_etherdev(sizeof(struct priv))`, `dev_queue_xmit(skb)`, `netif_receive_skb(skb)`. |
| **ethernet** (`drivers/net/ethernet/`) | Implements Ethernet‑specific MAC logic. | `struct ethhdr` (in `include/linux/if_ether.h`), `eth_type_trans(skb, dev)` (determines protocol based on EtherType). |
| **ETHTOOL** (`net/core/ethtool.c`) | User‑space interface to query/modify NIC features. | `ethtool -i eth0` (driver, version), `ethtool -k eth0` (feature flags), `ethtool -S eth0` (statistics). |
| **TUN/TAP** (`drivers/net/tun.c`) | Provides a virtual network interface for user‑space programs. | `open("/dev/net/tun", O_RDWR)`, `ioctl(fd, TUNSETI
