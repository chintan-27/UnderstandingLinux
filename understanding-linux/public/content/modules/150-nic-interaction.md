---
id: 150
title: "NIC interaction"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

At 10 Gbps with 64-byte minimum frames, a NIC delivers one packet every $\frac{64 \times 8}{10 \times 10^9} = 51.2\text{ ns}$. A modern interrupt round-trip — APIC signaling, context save, handler execution, context restore — costs roughly 1–4 µs. Servicing every packet with a dedicated interrupt therefore requires $\frac{1000\text{ ns}}{51.2\text{ ns}} \approx 20\times$ more CPU time than the packets actually arrive in. The CPU never escapes interrupt context. This is **receive livelock**: the system is scheduled, interrupts are firing, and no userspace process runs.

DMA rings, NAPI, and hardware offloads are the three mechanisms that collectively prevent this. Each one removes a specific bottleneck: DMA eliminates per-packet CPU involvement in data movement; NAPI converts interrupt-per-packet into poll-under-load; offloads eliminate per-packet kernel computation of checksums and segmentation. None of them is optional at 10 Gbps+.

---

## Core Concepts

### DMA Rings

A NIC cannot call `memcpy()`. It is a bus master: given a physical address and a byte count, it can read or write host memory via PCIe without involving the CPU. The kernel exploits this with a **descriptor ring** — a circular array of small structs in DMA-coherent memory that both the CPU and NIC can see consistently.

Each **descriptor** (16–32 bytes depending on the NIC) holds a physical address pointing to a packet buffer and metadata fields. The NIC and driver maintain separate pointers into this ring:

- **Head (NIC-owned):** the next descriptor the NIC will write into (receive) or read from (transmit).
- **Tail (driver-owned):** the last descriptor the driver has made available to the NIC, communicated by writing the tail index to an MMIO register.
- **Consumer (driver-owned, software only):** where the driver is currently processing completed descriptors.

The ring wraps: descriptor index is always $i \bmod N$. Because $N$ is always a power of two, the modulus is a bitmask: `idx & (N - 1)`, which compiles to a single AND instruction with no branch.

The NIC signals a descriptor is complete by setting the **DD (Descriptor Done)** bit in the status field. The driver polls this bit rather than relying solely on interrupts — this is what NAPI's poll loop checks.

On the receive path, the driver pre-allocates `sk_buff` data areas, DMA-maps them, and fills descriptors with the resulting physical addresses *before* packets arrive. The NIC writes packet data directly into those buffers and sets DD. The CPU never touches the payload bytes during transfer — it only reads them afterward when processing the `sk_buff`.

On the transmit path, the driver writes descriptors pointing to existing packet data (already in memory), writes the tail register to prod the NIC, and the NIC reads and transmits. Completion is signaled by DD, at which point the driver frees the `sk_buff`.

### The Livelock Problem, Precisely

Under interrupt-per-packet, the CPU's interrupt load grows linearly with packet rate. Let $\lambda$ be packets/second and $C_{irq}$ be cycles per interrupt. The CPU fraction consumed by interrupt overhead alone is:

$$f_{\text{irq}} = \frac{\lambda \cdot C_{\text{irq}}}{f_{\text{cpu}}}$$

At $\lambda = 14.88 \times 10^6$ pps (10 GbE minimum-frame line rate), $C_{\text{irq}} = 3000$ cycles, $f_{\text{cpu}} = 3 \times 10^9$ Hz:

$$f_{\text{irq}} = \frac{14.88 \times 10^6 \times 3000}{3 \times 10^9} = 14.88 \approx 15$$

The fraction exceeds 1.0 — the CPU cannot keep up regardless of what the interrupt handler does. Livelock is structural, not a software bug. The only fix is to decouple packet arrival from interrupt delivery.

### NAPI

NAPI's insight: once traffic is high enough that polling is cheaper than interrupting, *stop interrupting and poll*. The transition is automatic:

1. A packet arrives. The NIC raises a hardware interrupt.
2. The interrupt handler **disables further interrupts on that NIC queue** (writes a mask register) and calls `napi_schedule()`, which enqueues the device's `napi_struct` onto the current CPU's `softnet_data` poll list and raises `NET_RX_SOFTIRQ`.
3. Softirq runs `net_rx_action()`, which iterates the poll list and calls each device's registered `poll` function with a **budget** (default 64 packets per call).
4. The poll function drains descriptors up to budget. If budget is exhausted without draining the ring, it returns `budget` — `net_rx_action` reschedules it. **Interrupts stay disabled.**
5. If the ring empties before budget is exhausted, the poll function calls `napi_complete_done()`, which re-enables NIC interrupts and removes the device from the poll list.

The budget bound is critical: it prevents one high-traffic device from monopolizing a CPU, giving other devices and softirqs a chance to run. The total work `net_rx_action` will do across all devices in one softirq invocation is capped at `netdev_budget` (default 300), visible at `/proc/sys/net/core/netdev_budget`.

Under low load: each packet costs one interrupt, identical to the pre-NAPI path.  
Under high load: interrupt cost is amortized across up to 64 packets per poll call. The effective interrupt rate is bounded at $\lambda / 64$ regardless of $\lambda$.

### Checksum Offload

TCP and UDP checksums are the 16-bit one's complement sum of all 16-bit words in the pseudo-header, transport header, and payload, then bitwise inverted:

$$\text{csum} = \sim\!\!\left(\sum_{i=0}^{n-1} w_i \!\!\pmod{2^{16}-1}\right)$$

The $\bmod\ (2^{16}-1)$ is implemented via **end-around carry**: if the 32-bit accumulator overflows 16 bits, add the carry back into the low 16 bits. For an odd-length payload, a zero pad byte is appended conceptually — it is never transmitted.

This is $O(n)$ in payload size. For a 64 KB TSO super-segment, that's 32,768 additions. The NIC's dedicated checksum engine performs this in one DMA pass over data it was already reading. The CPU cost is zero.

The kernel communicates checksum intent via flags in `sk_buff`:

- `CHECKSUM_PARTIAL`: driver must ask NIC to compute and fill the checksum. The `csum_start` and `csum_offset` fields in `sk_buff` tell the NIC exactly where to start and where to write the result.
- `CHECKSUM_UNNECESSARY`: NIC has validated the checksum on receive; the kernel stack can skip verification.
- `CHECKSUM_COMPLETE`: NIC has provided the raw checksum value in `skb->csum`; the stack can verify without re-summing.

### Segmentation Offload (TSO/GSO)

Without offload, `tcp_write_xmit()` segments a large send buffer into MTU-sized chunks, computing a TCP header (including sequence number and checksum) for each. For a 1 MB write over a 1500-byte MTU, that is $\lceil 10^6 / 1460 \rceil = 685$ segments, each requiring its own header construction and checksum.

With **TSO (TCP Segmentation Offload)**, the kernel sends one descriptor pointing to a buffer up to 64 KB, with one TCP header. The NIC splits it into MTU-sized frames, increments sequence numbers, and computes checksums — all in silicon, during the DMA read it was doing anyway.

The kernel tracks TSO capability in `netdev->hw_features` (flag `NETIF_F_TSO`). When TSO is unavailable, **GSO (Generic Segmentation Offload)** is the fallback: segmentation still happens in software, but it is deferred until `dev_hard_start_xmit()` — after the packet has traversed the entire stack as a single large `sk_buff`. This keeps `tcp_write_xmit()` fast regardless of NIC capability, concentrating the segmentation cost in one place.

**GRO (Generic Receive Offload)** is the receive-side analogue: NAPI's `napi_gro_receive()` coalesces arriving segments belonging to the same TCP stream into a single large `sk_buff` before passing it up the stack, reducing per-packet overhead in `tcp_rcv_established()`.

---

## How It Works

### DMA Ring Layout

```c
/* Simplified receive descriptor — matches Intel e1000 layout */
struct rx_desc {
    __le64 buffer_addr;   /* Physical address of sk_buff->data */
    __le16 length;        /* Bytes written by NIC on receive */
    __le16 csum;          /* Hardware checksum (if CHECKSUM_COMPLETE) */
    __u8   status;        /* Bit 0 (DD): descriptor done */
    __u8   errors;        /* Bit 0: CRC error, etc. */
    __le16 vlan;          /* VLAN tag if stripped */
};
```

For a ring of $N = 512$ descriptors:

$$\text{descriptor ring} = 512 \times 16 = 8192 \text{ bytes}$$

Each descriptor references a separate 2 KB packet buffer. Total pinned DMA memory for one receive ring:

$$512 \times (16 + 2048) = 512 \times 2064 = 1{,}056{,}768 \text{ bytes} \approx 1 \text{ MB}$$

The descriptor ring must be **physically contiguous** (the NIC gets one base address and strides through it
