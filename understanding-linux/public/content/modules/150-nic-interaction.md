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

## Core Concepts
### DMA Rings
A DMA ring is a circular buffer of descriptors residing in RAM that the NIC can read and write without CPU intervention. Each descriptor contains:
- **buf_addr**: physical address of the data buffer (must be page‑aligned and contiguous for the NIC’s DMA engine).
- **len**: length of the buffer in bytes.
- **status/flags**: bits written by the NIC (e.g., `OWN`, `EOP`) to signal ownership and packet boundaries.

The NIC maintains two pointers:
- **producer index (PI)** – where the NIC will write the next received descriptor.
- **consumer index (CI)** – where the driver reads the next filled descriptor.

When the NIC writes a packet, it advances PI; when the driver processes a buffer, it advances CI. The ring is full when `(PI + 1) % size == CI` and empty when `PI == CI`.  
Why DMA? Copying packets through the CPU costs ~2–3 ns per byte on modern CPUs; at 10 Gbps (1.25 GB/s) this would consume >3 GB/s of memory bandwidth, starving other cores. DMA lets the NIC use the memory controller directly, overlapping I/O with computation and keeping the CPU free for higher‑level work.

### Interrupts
When the NIC updates PI (or detects an error condition) it asserts an interrupt line. Modern NICs use **Message Signalled Interrupts (MSI/MSI‑X)** which write a value to a reserved memory address, avoiding the legacy IRQ pin and allowing multiple independent vectors.  
The interrupt handler runs in interrupt context, which imposes strict limits: it must be short, cannot sleep, and must acknowledge the interrupt before returning. The cost of an interrupt includes:
- **Entry/exit overhead** (~1–2 µs on x86).
- **Cache flushes** due to context switch.
- **Potential thundering herd** if many cores share the same IRQ without affinity.

Thus, for high packet rates, generating an interrupt per packet becomes a bottleneck. The solution is to **moderate** interrupts: the NIC can delay asserting the interrupt until a certain number of packets have been received or a timeout expires.

### NAPI (New API)
NAPI replaces the pure‑interrupt model with a hybrid approach:
1. The NIC raises an interrupt for the first packet (or after a moderation interval).
2. The interrupt handler **disables further interrupts** on that queue (`napi_disable`/`napi_schedule`).
3. It schedules a **NAPI poll** routine (`napi_schedule`) which runs in softirq context.
4. The poll routine processes packets directly from the DMA ring up to a **weight** `W` (typically 32–64 packets).
5. After processing ≤ `W` packets, if more work remains the poll returns with a budget > 0 and the NIC stays in polling mode (interrupts still disabled). If the ring is empty, the handler **re‑enables interrupts** (`napi_complete_done`) and exits.

Why does this reduce interrupt load?  
If the average packet arrival rate is λ pps and the NAPI weight is W, the maximum interrupt rate becomes λ/W (ignoring timeouts). The CPU cycles saved per second are roughly:
$$
\text{saved cycles} = \lambda \cdot (C_{\text{irq}} - C_{\text{poll}}) \cdot \left(1 - \frac{1}{W}\right)
$$
where `C_irq` is the cost of handling an interrupt and `C_poll` the cost of processing a packet in the poll loop. For λ = 100 kpps, `C_irq` ≈ 1500 cycles, `C_poll` ≈ 300 cycles, W = 64 → saved ≈ 8.6 M cycles/s (~0.01 % of a 3 GHz core), but more importantly the interrupt rate drops from 100 kpps to ~1.6 kpps, eliminating contention on the interrupt controller.

### Checksum Offload
The NIC can compute the Internet checksum (or CRC‑32 for Ethernet) for TCP/UDP/IPv4 headers and payloads. For transmission, the networking stack provides a **pseudo‑header** (source/dest IP, protocol, TCP length) and the NIC adds it to the data before calculating the checksum, storing the result in the TCP/UDP header field.  
For reception, the NIC verifies the checksum; if correct it indicates success via a status bit in the descriptor, allowing the stack to skip the verification step.  
Why offload? Calculating a 16‑bit one’s‑complement sum over N bytes costs ~N/2 CPU cycles. At 10 Gbps with 1500‑byte packets, that is ~125 M cycles/s (~4 % of a core). Offloading moves this work to dedicated silicon, freeing cycles for protocol processing, encryption, or application logic. The caveat is that the stack must still set up the pseudo‑header correctly; otherwise the NIC will compute a wrong checksum and the packet will be dropped by the receiver.

### Segmentation Offload (TSO/GSO/LRO)
**Transmit Segmentation Offload (TSO)** lets the stack hand a large buffer (up to 64 KB) to the NIC, which then splits it into MSS‑sized segments, adds the appropriate L2/L3/L4 headers, and computes a checksum for each segment. This reduces the per‑packet overhead of the stack (header synthesis, checksum, checksum validation) from O(number of segments) to O(1).  
**Generic Receive Offload (GRO)** and **Large Receive Offload (LRO)** perform the inverse on the receive side: multiple contiguous packets belonging to the same TCP flow are merged into a single SKB before being passed up the stack, reducing the number of packets the stack must process.

Mathematically, if the MSS is `M` and the application sends `S` bytes, the number of packets generated by the NIC is:
$$
N_{\text{seg}} = \left\lceil \frac{S}{M} \right\rceil
$$
Without TSO the stack would perform `N_seg` times the work of header creation and checksum; with TSO it does that work once.

## How It Works
1. **Packet Reception via DMA**  
   - The NIC writes the packet data into the buffer pointed to by the current descriptor (PI).  
   - It updates the descriptor’s status flags (e.g., sets `EOP` when the last byte of a packet is written).  
   - It increments PI (mod ring size).  
   - If the NIC’s interrupt moderation scheme is satisfied (e.g., `PI` has changed by `cnt` packets or a timer expires), it asserts an MSI‑X interrupt.

2. **Interrupt Handling**  
   - The CPU enters the interrupt handler (`irq_handler`).  
   - The handler acknowledges the interrupt (writes to the MSI‑X address).  
   - It disables further interrupts for the queue (`napi_disable`).  
   - It schedules a NAPI poll (`napi_schedule(&napi_struct)`).

3. **NAPI Poll Loop**  
   ```c
   static int mydrv_poll(struct napi_struct *napi, int budget)
   {
       unsigned int processed = 0;
       while (processed < budget) {
           struct desc *d = &rx_ring[ci];
           if (!(d->status & DESC_OWN_NIC))   /* NIC still owns */
               break;
           /* Process packet */
           skb = build_skb(d->buf_addr, d->len);
           netif_receive_skb(skb);
           /* Release descriptor */
           d->status = 0;
           ci = (ci + 1) % RING_SIZE;
           processed++;
       }
       if (processed < budget) {
           napi_complete_done(napi, processed);
           /* Re‑enable interrupts */
           wr_reg(INT_MASK, INT_ENABLE);
       }
       return processed;
   }
   ```
   - The loop extracts up to `budget` packets (the NAPI weight) from the ring, builds an `skb`, and hands it to the stack.  
   - If the ring becomes empty before exhausting the budget, the poll exits, re‑enables interrupts, and returns.

4. **Checksum Offload in Action**  
   - On RX, after DMA writes the packet, the NIC computes the one’s‑complement sum over the IP header + TCP/UDP header + payload.  
   - It compares the result to the checksum field stored in the packet; if equal, it sets `DESC_RX_CSUM_GOOD` in the descriptor status.  
   - The driver checks this bit; if set, it skips `ip_fast_csum`/`tcp_v4_check` and passes the `skb` directly up.

5. **Transmit Segmentation Offload (TSO)**  
   - The stack creates a large `skb` (size `S`) and sets `skb_shinfo(skb)->gso_size = MSS`.  
   - In `dev_queue_xmit`, the NIC driver sees `skb_is_gso(skb)` and programs the NIC’s context registers:  
     - `MSS`  
     - `IP header length`  
     - `TCP/UDP header length`  
     - `TCP sequence number` (for TCP).  
   - The NIC then performs the following for each segment `i = 0 … N_seg-1`:  
     - Copies `MSS` bytes (except possibly the last) from the skb’s data buffer into the NIC’s internal FIFO.  
     - Prefetches the L2 header, inserts the IP/TCP header with updated fields (IP ID, TCP seq, etc.).  
     - Computes the checksum over the pseudo‑header + segment data and writes it into the TCP header.  
   - The NIC signals completion via a TX descriptor when all segments are DMA‑ed to the wire.

## Worked Examples
### Example 1: Interrupt Reduction with NAPI
Assume a 10 GbE NIC receiving minimum‑size Ethernet frames (84 bytes on wire, including preamble and IFG).  
- Link rate: 10 Gbps = 1.25 GB/s.  
- Frame size on wire: 84 B → **packet rate** λ = 1.25e9 / 84 ≈ **14.88 Mpps**.  

Without interrupt moderation, the NIC would generate λ interrupts per second.  
Each interrupt costs ~1500 cycles (entry/exit + cache effects). CPU cycles per second spent in IRQ handling:
$$
C_{\text{irq,total}} = λ \cdot 1500 \approx 22.3\text{ G cycles/s}
$$
Clearly impossible on a 3 GHz core.

Now enable MSI‑X with interrupt moderation: the NIC asserts an interrupt after every **W = 64** packets or after 10 µs, whichever comes first. The effective interrupt rate is roughly λ/W:
$$
λ_{\text{eff}} ≈ \frac{14.88\text{ Mpps}}{64} ≈ 232\text{ kpps}
$$
Cycles per second:
$$
C_{\text{irq,total}} ≈ 232\text{k} \cdot 1500 ≈ 348\text{ M cycles/s}
$$
Still high, but now we add NAPI: the IRQ handler disables further interrupts and processes up to **budget = W = 64** packets in softirq context. Each packet processed in the poll costs ~300 cycles (skb allocation, header pull, checksum check).  
Cycles per second for polling:
$$
C_{\text{poll}} = λ \cdot 300 ≈ 4.46\text{ G cycles/s}
$$
Total cycles (IRQ + poll) ≈ 4.8 G cycles/s → about 1.6 core equivalents, which is feasible on a modern multi‑core system. The key gain is that the **interrupt controller sees only 232k interrupts/s**, reducing lock contention and allowing other cores to service other devices.

### Example 2: Checksum Offload Calculation
Consider an IPv4 TCP packet with:
- Source IP: 192.168.1.10 (`0xC0A8010A`)  
- Dest IP:   192.168.1.20 (`0xC0A80114`)  
- Protocol: TCP (`0x06`)  
- TCP length: 20 B header + 100 B payload = 120 B (`0x0078`)  

The pseudo‑header (12 bytes) is:
```
src_ip      dst_ip      zero  proto   tcp_len
C0 A8 01 0A C0 A8 01 14 00    06    00 78
```
The NIC computes the one’s‑complement sum over pseudo‑header + TCP segment (header+payload).  
If the TCP header checksum field is initially zero, the sum `S` is computed; the checksum stored is `~S` (bitwise NOT).  

Suppose after summing we obtain `S = 0x1234`. The NIC writes `0xEDCB` into the checksum field.  
On reception, the NIC repeats the same sum (including the checksum field). If the packet is intact, the total sum will be `0xFFFF`; the NIC verifies this and sets the `DESC_RX_CSUM_GOOD` bit.  
The driver can then skip the software `tcp_v4_check` call, saving roughly `(tcp_len/2) ≈ 60` cycles per packet.

### Example 3: TSO Segmentation
An application wishes to send 64 KB (65535 bytes) of data over TCP with MSS = 1460.  
Number of segments:
$$
N = \left\lceil \frac{65535}{1460} \right\rceil = 45
$$
Without TSO, the stack would:
1. Allocate 45 SKBs.  
2. For each, copy headers, compute checksum, and call `dev_queue_xmit`.  
Total per‑packet overhead ≈ 800 cycles → 45 × 800 ≈ 36 k cycles.

With TSO:
1. One SKB of 65535 bytes, `gso_size = 1460`.  
2. NIC performs the 45 header insertions and checksum calculations in hardware.  
3. Software overhead ≈ 200 cycles (SKB allocation + context setup).  
Net saving ≈ 34 k cycles per large send, which at 10 Gbps (≈1500 such sends/s) saves ≈ 50 M cycles/s.

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Misaligned DMA buffers** (e.g., using a normal `kmalloc` buffer not page‑aligned) | The NIC’s DMA engine may silently drop writes or cause bus errors on architectures that require alignment (ARM, some Intel NICs). | Leads to lost packets, kernel oops, or degraded performance due to fallback to bounce buffers. |
| **Leaving interrupts enabled during NAPI poll** | If the NIC can re‑assert an interrupt while the driver is still processing the ring, the interrupt handler may run concurrently, corrupting the ring’s CI/PI pointers. | Causes double‑processing, missed packets, or null‑pointer dereference; observed as sporadic “NAPI poll scheduled while already active” warnings. |
| **Incorrect pseudo‑header for TX checksum offload** (e.g., forgetting to set `ip_summed = CHECKSUM_PARTIAL`) | The NIC will compute a checksum over the data only, omitting the IP pseudo‑header, resulting in a wrong TCP checksum. | The receiver discards the packet; the sender sees retransmissions, dramatically lowering throughput. |
| **Setting NAPI weight too low** (e.g., weight = 2) | The driver exits poll after processing only a few packets, forcing the NIC to re‑enable interrupts frequently. | Interrupt rate approaches the raw packet rate, negating the benefit of NAPI and increasing CPU overhead. |
| **Ignoring interrupt moderation timeout** | Relying solely on packet‑count moderation can cause latency spikes during low‑traffic periods (the NIC waits for the count threshold). | Interactive applications (e.g., SSH, gaming) suffer increased latency; better to combine count‑and‑timeout moderation. |
| **Enabling GRO/LRO on a VLAN‑tagged interface without stripping VLAN first** | The offload engine sees the VLAN tag as part of the payload and may incorrectly merge packets from different VLANs. | Results in corrupted packets or mis‑delivered traffic; observed as checksum failures or VLAN ID mismatches. |

## Exercises
### Easy
1. **DMA Buffer Allocation**  
   Write a kernel module that allocates a descriptor ring using `dma_alloc_coherent`, fills three descriptors with known data patterns, and prints the physical addresses. Verify alignment with `__attribute__((aligned(64)))` and check that the returned address is page‑aligned (`(addr & ~PAGE_MASK) == 0`).

2. **Interrupt Handler Skeleton**  
   Implement a minimal MSI‑X interrupt handler for a dummy NIC that: acknowledges the interrupt, disables the line, schedules NAPI, and re‑enables the line after `napi_complete_done`. Use `request_irq` with `IRQF_NO_SUSPEND`.

### Medium
3. **NAPI Poll with Budget**  
   Using the descriptor ring from Exercise 1, write a poll function that processes up to `weight` packets, builds an `skb` with `netdev_alloc_skb`, copies the data, and submits it via `netif_receive_skb`. Track the number of packets processed and return it to the core. Ensure the function correctly handles the case where the ring becomes empty before exhausting the budget.

4. **Checksum Offload Verification**  
   Write a userspace program that sends a UDP packet via `setsockopt(fd, IPPROTO_IP, IP_CHECKSUM, ...)` (or uses `sendmmsg` with `MSG_CHECKSUM_HW`) and captures it with `tcpdump -i eth0 -nn -vv -s 0 -c 1 'udp'`. Verify that the UDP checksum field is non‑zero and that the kernel marks the packet as `CHECKSUM_UNNECESSARY` (check via `ethtool -k eth0` and `ethtool -S eth0`).  

### Hard
5. **Enable TSO and Verify Segmentation**  
   - In a VM or on a physical NIC, turn TSO on: `ethtool -K eth0 tso on`.  
   - Use `iperf3 -c <server> -t 10 -l 64K` to send a 64 KB buffer.  
   - Capture with `tcpdump -i eth0 -w tso.pcap`.  
   - Use `tshark -r tso.pcap -Y tcp -T fields -e tcp.len` to observe that each captured TCP segment has length ≤ MSS (typically 1460).  
   - Explain why the IP Identification field increments per segment and why the TCP sequence number increases by MSS each time.  

6. **Interrupt Moderation Tuning**  
   - Check current moderation settings: `ethtool -c eth0`.  
   - Modify the interrupt‑moderation rate to 2000 ints/s: `ethtool -C eth0 rx-usecs 200 rx-frames 64`.  
   - Measure CPU usage (`pidstat -u 1`) and latency (`ping -i 0.001 <local‑ip>`) before and after the change.  
   - Discuss the trade‑off observed between throughput and latency.

## Linux Connection
The NIC interaction model lives primarily in the **`net`** subsystem:

- **Core networking**: `net/core/dev.c` (device registration, `net_device` structure).  
- **NAPI implementation**: `net/core/napi.c` (`struct napi_struct`, `napi_schedule`, `napi_poll`).  
- **Device‑specific drivers**: located under `drivers/net/ethernet/<vendor>/`. Example: the Intel igb driver (`drivers/net/ethernet/intel/igb/igb_main.c`).  
- **Offload flags**: exposed via `ethtool -k <iface>` and modified with `ethtool -K <iface> <feature> on|off`.  
- **Interrupt statistics**: viewable in `/proc/interrupts`; each NIC’s MSI‑X vectors appear as separate lines (e.g., `eth0-TxRx-0`).  
- **Descriptor
