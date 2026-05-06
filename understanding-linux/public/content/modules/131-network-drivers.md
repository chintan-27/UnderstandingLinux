---
id: 131
title: "Network drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Network Driver Fundamentals
A network driver is the kernel‑mediated interface between the **network interface controller (NIC)** hardware and the rest of the operating system. Its primary responsibilities are:
* **Descriptor management** – allocating and maintaining transmit (TX) and receive (RX) descriptor rings that the NIC reads/writes via DMA.
* **Lifecycle control** – bringing the NIC up/down, resetting hardware, and configuring operational modes (speed, duplex, offloads).
* **Packet steering** – deciding whether a packet is processed in interrupt context or via NAPI polling based on load.
* **Offload coordination** – telling the NIC which checksum, segmentation, or tunneling tasks it may perform.

### NIC Initialization – From First Principles
When the driver’s probe routine runs, it must transform a raw PCI(e) device into a usable `struct net_device`. The steps are forced by hardware constraints:

1. **Resource acquisition** – request I/O/MMIO spaces (`pci_iomap`) and IRQ (`request_irq`).  
   *Why*: The NIC’s registers are only accessible after mapping; the IRQ line must be reserved before the NIC can assert it.
2. **Reset and self‑test** – write to the NIC’s reset register, poll until the status indicates completion.  
   *Why*: Guarantees a known state; residual configurations from prior drivers or firmware can cause undefined behavior.
3. **MAC address retrieval** – read the station address from the NIC’s EEPROM or registers and store it in `dev->dev_addr`.  
   *Why*: The MAC is the link‑layer identifier; without it, Ethernet frames cannot be correctly sourced or filtered.
4. **Offload feature discovery** – query the NIC’s capabilities (e.g., `ETHTOOL_GSG`, `ETHTOOL_GGSO`) and set `dev->features` accordingly.  
   *Why*: Mis‑matching advertised vs. actual capabilities leads to dropped packets or kernel warnings.
5. **Memory allocation for descriptor rings** – allocate DMA‑coherent memory for TX and RX rings (`dma_alloc_coherent`).  
   *Why*: The NIC accesses these structures via DMA; using non‑coherent memory would require explicit cache flushing, adding latency and complexity.

The initialization can be expressed as a series of causal constraints:
\[
\text{usable NIC} \iff
\bigl(\text{resources acquired}\bigr) \land
\bigl(\text{hardware reset}\bigr) \land
\bigl(\text{MAC set}\bigr) \land
\bigl(\text{features negotiated}\bigr) \land
\bigl(\text{rings allocated}\bigr)
\]

### RX/TX Rings – Circular Buffer Mechanics
Both rings are arrays of descriptors. A descriptor typically contains:
* **buf_addr** – DMA address of the data buffer.
* **buf_len** – length of the buffer.
* **cmd/status bits** – ownership (NIC vs. driver), completion flags, offload hints.

Because the NIC and driver concurrently update indices, the rings are implemented as **power‑of‑two** buffers to allow wrap‑around via a simple mask:
\[
\text{idx} = (\text{base} + \text{offset}) \ \& \ (N-1)
\]
where \(N = 2^k\).  
*Derivation*: If \(N\) is a power of two, \(N-1\) has all low \(k\) bits set; addition modulo \(N\) is equivalent to bitwise AND with \(N-1\). This avoids costly division.

**Memory overhead**: For a ring with \(N\) descriptors each of size \(S\) bytes,
\[
\text{total} = N \times S
\]
Alignment to cache lines (typically 64 B) is required to prevent false sharing:
\[
S' = \lceil S / 64 \rceil \times 64
\]
Thus the driver often rounds each descriptor up to a cache‑line boundary before allocation.

### NAPI – Polling vs. Interrupt Trade‑off
Interrupt‑driven RX works well at low packet rates but scales poorly:
* Each packet triggers an interrupt → context switch → kernel entry/exit → cache pollution.
* At 10 Gbps with minimum‑size Ethernet frames (84 B on wire), the packet rate is:
\[
\lambda = \frac{10 \times 10^9}{84 \times 8} \approx 14.88 \text{ Mpps}
\]
Handling ~15 M interrupts/s would saturate a CPU.

NAPI replaces the per‑packet interrupt with a **budgeted poll**:
1. NIC asserts an interrupt → driver disables further IRQs (`disable_irq_nosync`) and schedules a NAPI poll.
2. The poll routine (`napi_poll`) processes up to `weight` packets (default 64) from the RX ring.
3. If more work remains, it returns a value ≥ weight, keeping the poll scheduled; otherwise it re‑enables IRQs and exits.

The **effective interrupt rate** becomes:
\[
\lambda_{\text{IRQ}} = \frac{\lambda}{\text{weight}} \times P_{\text{rearm}}
\]
where \(P_{\text{rearm}}\) is the probability that the NIC still has pending packets after a poll. For heavy load, \(P_{\text{rearm}} \approx 1\), giving a reduction by roughly the weight factor.

### Interrupts – Signalling Mechanism
The NIC asserts an interrupt line when:
* **TX completion** – a descriptor’s `DD` (done) bit is set.
* **RX packet available** – one or more RX descriptors have transitioned from owned by NIC to owned by driver.

The driver’s ISR must:
1. **Acknowledge** the interrupt (write to the NIC’s interrupt‑clear register).  
   *Why*: Prevents the NIC from re‑asserting the same IRQ, which would cause a storm.
2. **Schedule** further processing:
   * For TX: if the ring is low on free descriptors, wake the TX queue (`netif_wake_subqueue`).
   * For RX: if NAPI is enabled, `__napi_schedule`; otherwise, process packets directly and re‑enable IRQs.

Incorrect acknowledgement leads to **interrupt storms**, where the CPU spends > 90 % of time in the ISR, starving other tasks.

### Offloads – Shifting Work to Hardware
Offloads are NIC capabilities that let the driver delegate costly per‑packet processing:

| Offload | What the NIC does | Driver responsibility |
|---------|-------------------|------------------------|
| **Checksum offload (TX)** | Computes IPv4/TCP/UDP checksum on data in the buffer. | Set `skb->ip_summed = CHECKSUM_PARTIAL` and describe where the checksum should be inserted. |
| **TCP Segmentation Offload (TSO)** | Splits a large TCP socket buffer into MTU‑sized frames, adding sequence numbers. | Provide a single large `skb` (`skb->len > MTU`) and set `skb->shinfo->gso_type = SKB_GSO_TCPV4`. |
| **Scatter‑Gather (SG)** | Reads multiple fragments from a single `skb`’s `frags[]` array. | Ensure `skb_shinfo(skb)->nr_frags` is valid and each fragment page is DMA‑mapped. |
| **Receive Side Scaling (RSS)** | Distributes incoming flows across multiple RX queues based on a hash of header fields. | Allocate multiple RX queues, set indirection table, and enable `dev->features |= NETIF_F_RXRSS`. |

By moving checksum calculation or segmentation to the NIC, the driver reduces CPU cycles per packet from O(L) (where L is packet length) to O(1) for the offloaded portion.

---

## How It Works
### End‑to‑End Packet Transmission (TX)
1. **User‑space request** – Application calls `sendto(fd, buf, len, …)`.  
   *Kernel path*: `sock_sendmsg → __sock_sendmsg → dev_queue_xmit(skb)`.
2. **Queue discipline** – `dev_queue_xmit` applies the selected qdisc (default `pfifo_fast`). If the qdisc is congested, it returns `-EBUSY`; otherwise it passes the `skb` to the driver’s `ndo_start_xmit`.
3. **Driver TX entry** – `ndo_start_xmit(struct sk_buff *skb, struct net_device *dev)`:
   * Acquire TX lock (`spin_lock_irqsave(&tx_lock, flags)`).
   * Compute next free descriptor index: `tx_next = READ_ONCE(dev->tx_ring->next_to_use)`.
   * If `tx_next == dev->tx_ring->next_to_clean` → ring full → return `NETDEV_TX_BUSY` (qdisc will retry later).
   * Map the skb’s data buffer for DMA: `dma_addr = dma_map_single(dev, skb->data, skb->len, DMA_TO_DEVICE)`.
   * Fill descriptor:
     ```c
     struct tx_desc *txd = &tx_ring[tx_next];
     txd->buf_addr = cpu_to_le64(dma_addr);
     txd->buf_len  = cpu_to_le32(skb->len);
     txd->cmd      = TX_DESC_CMD_EOP | TX_DESC_CMD_RS; // end of packet, report status
     txd->status   = 0;
     ```
   * Increment `next_to_use` (with wrap using mask).
   * **Kick the NIC**: write the descriptor index to the NIC’s TX doorbell register (`writel(tx_next, NIC_TX_TAIL)`).
   * Release lock and return `NETDEV_TX_OK`.
4. **NIC DMA** – The NIC reads the descriptor, copies the packet from host memory onto the wire, and when finished sets the `DD` bit in the descriptor and asserts TX‑complete interrupt.
5. **Interrupt handling** – ISR:
   * `disable_irq_nosync(irq)`.
   * Scan TX ring for descriptors with `DD` set, `dma_unmap_single`, free the associated `skb`.
   * Update `next_to_clean`.
   * If free descriptors ≥ wake threshold → `netif_wake_subqueue(dev, queue)`.
   * Re‑enable IRQ (`enable_irq(irq)`) or schedule NAPI if Rx work also pending.
6. **Completion** – The socket layer eventually returns to user space after the `skb` is freed.

### End‑to‑End Packet Reception (RX)
1. **NIC DMA** – Incoming packet passes the NIC’s filters, is written via DMA into an RX buffer pointed to by the current RX descriptor, and the descriptor’s `DD` bit is set.
2. **Interrupt or NAPI** – NIC asserts RX interrupt.
   *If NAPI disabled*: ISR processes each packet directly:
   * `dma_sync_single_for_cpu` (if needed), `skb = netdev_alloc_skb(ip_align, dev->mtu + NET_IP_ALIGN)`, copy data, `netif_receive_skb(skb)`, then `dma_unmap_single`.
   *If NAPI enabled*: ISR disables IRQ, calls `__napi_schedule(&dev->napi)`.
3. **NAPI poll** – `napi_poll(struct napi_struct *napi, int budget)`:
   * Loop up to `budget` times:
     * Read descriptor status; if not owned by driver, break.
     * Extract DMA address, `dma_sync_single_for_cpu`.
     * Build `skb` (`skb = netdev_alloc_skb(ip_align, len)`), `skb_put_data`, `skb->protocol = eth_type_trans(skb, dev)`.
     * `netif_receive_skb(skb)`.
     * `dma_unmap_single`, mark descriptor as clean, advance `next_to_rx`.
   * If processed < `budget` → re‑enable IRQ (`enable_irq`), return `budget - work_done`.
   * Else → return `budget` (keep poll scheduled).
4. **Upper stack** – `netif_receive_skb` passes the packet to the appropriate protocol handler (IPv4, ARP, etc.) based on `skb->protocol`.

**Timing example**: 1 Gbps link, average packet 600 B (wire).  
Transmission time per packet:
\[
T_{\text{tx}} = \frac{600 \times 8}{1 \times 10^9} = 4.8 \,\mu\text{s}
\]
If the driver can process a descriptor in 0.2 µs (typical), the NIC can keep the pipe full as long as the interrupt/NAPI overhead per packet stays below ~4.6 µs. With NAPI weight = 64, the interrupt overhead is amortized, yielding effective per‑packet overhead ≈ 0.07 µs, well within the budget.

---

## Worked Examples
### Example 1: Transmitting a 1500‑Byte Ethernet Frame
*Assumptions*: MTU = 1500, Ethernet header = 14 B, no VLAN, IPv4 + UDP (20 + 8 = 28 B). Payload = 1500 − (14 + 28) = 1458 B.

**Step‑by‑step with real numbers** (driver code omitted for brevity, only key values shown):

1. **Socket creation & sendto**  
   ```c
   int sock = socket(AF_INET, SOCK_DGRAM, 0);
   struct sockaddr_in dst = {
       .sin_family = AF_INET,
       .sin_port   = htons(5000),
       .sin_addr.s_addr = inet_addr("10.0.0.2")
   };
   char *msg = "Hello network driver!";
   sendto(sock, msg, strlen(msg), 0,
          (struct sockaddr *)&dst, sizeof(dst));
   ```

2. **Kernel path** – `dev_queue_xmit` creates an `skb`:
   * `skb->len = 142` (14 ETH + 20 IP + 8 UDP + 100 B payload example).  
   * `skb->data` points to linear buffer containing the packet.

3. **Driver TX** (`ixgbe_xmit_frame` in Intel 10G driver):
   * `tx_next = 57` (current tail).  
   * `dma_map_single` returns `0x7f8a12345000`.  
   * Descriptor fields (little‑endian):
     ```
     buf_addr = 0x7f8a12345000
     buf_len  = 0x0000008e   // 142 decimal
     cmd      = 0x01 | 0x02  // EOP | RS
     status   = 0x00
     ```
   * Doorbell write: `writel(58, IXGBE_TDT);` (tail = next_to_use).

4. **NIC processing** – Reads descriptor, DMA reads 142 bytes, sends on wire:
   * Wire time = (142 × 8) / 10⁹ ≈ 1.136 µs (at 10 Gbps).  
   * After transmission, NIC sets `DD` bit in descriptor status.

5. **Interrupt** – ISR sees `DD`, `dma_unmap_single(0x7f8a12345000, 142, DMA_TO_DEVICE)`, frees `skb`, updates `next_to_clean = 58`.  
   *If TX ring now has > 32 free descriptors*, `netif_wake_subqueue` is called.

**Result**: The user‑space `sendto` returns after the kernel has queued the packet; actual wire latency ≈ 1.1 µs plus driver overhead (~0.3 µs).

### Example 2: Receiving a UDP Packet via NAPI
*Assumptions*: 10 Gbps NIC, RX ring size = 256 descriptors, weight = 64, packet size = 200 B (including Ethernet header).

1. **NIC writes packet** to descriptor index = 112, sets `DD`.
2. **Interrupt fires** – ISR disables IRQ, calls `__napi_schedule(&dev->napi)`.
3. **NAPI poll** (`ixgbe_poll`):
   * Loop:
     * Desc[112] status shows `DD` and `OWNER = DMA`.  
     * `dma_addr = le64_to_cpu(desc[112].buf_addr) = 0x7f8b20001000`.
     * `dma_sync_single_for_cpu(..., 200, DMA_FROM_DEVICE)`.
     * Allocate `skb = netdev_alloc_skb(ip_align, 200)`; `skb_put(skb, 200)`.
     * Copy: `skb_put_data(skb, dma_addr, 200)`.
     * `skb->protocol = eth_type_trans(skb, dev)` → `0x0800` (IPv4).
     * `netif_receive_skb(skb)`.
     * `dma_unmap_single(..., 200, DMA_FROM_DEVICE)`.
     * Mark descriptor clean (`desc[112].status = 0`), advance `next_to_rx`.
   * After processing 64 packets, poll returns `budget` → NAPI stays scheduled.
4. **When RX ring empties**, poll returns `< budget`, IRQs re‑enabled.

**Math**: Interrupt rate reduction:
\[
\lambda_{\text{IRQ}} = \frac{\lambda}{\text{weight}} = \frac{10\text{Gbps}/(200\times8)}{64}
   \approx \frac{6.25\text{Mpps}}{64} \approx 97.6\text{kIRQ/s}
\]
A single core can easily handle ~100 kIRQ/s, leaving ample CPU for application processing.

---

## Common Mistakes
| Mistake | Why it’s Wrong | Consequence |
|---------|----------------|-------------|
| **Using `GFP_KERNEL` in ISR or NAPI poll** | `GFP_KERNEL` may sleep; ISR/NAPI run in atomic context where sleeping is forbidden. | Kernel oops (`BUG: sleeping function called from invalid context`) or system hang. |
| **Failing to set `dev->features` after offload negotiation** | The driver may advertise capabilities the NIC lacks (or vice‑versa). | Kernel drops packets with `NETDEV_TX_OK` but NIC actually didn’t perform offload → corrupted checksums, segmentation faults in upper stack. |
| **Not checking return of `dma_map_single`** | Mapping can fail (`DMA_MAPPING_ERROR`) if the address exceeds the NIC’s DMA mask. | Silent data corruption; NIC reads garbage or crashes on bus error. |
| **Using a non‑power‑of‑two ring size with modulo instead of mask** | Wrap‑around logic becomes expensive and error‑prone. | Mis‑indexed descriptors lead to overwritten buffers, NIC hangs, or duplicated packets. |
| **Neglecting to clear the interrupt status register before re‑enabling IRQs** | Some NICs latch the interrupt until cleared. | Immediate re‑assertion → interrupt storm, 100 % CPU usage in ISR. |
| **Not calling `netif_napi_add` before registering the netdev** | NAPI struct won’t be linked to the device. | Polling never scheduled; driver falls back to interrupt mode, losing NAPI benefits. |
| **Leaving TX queue stopped after a transient error** | Forgetting to `netif_wake_subqueue` when descriptors become free. | Upper layers see `NETDEV_TX_BUSY` forever → application stalls on `send`. |
| **Misaligning DMA buffers (not cache‑line aligned)** | Causes false sharing or extra cache line fills during NIC reads/writes. | Increased latency, especially noticeable at high packet rates. |

Each mistake stems from violating a **kernel contract** (atomic context, DMA correctness, resource accounting) rather than from ignorance of a high‑level concept.

---

## Exercises
### Easy
1. **Minimal netdev skeleton** – Write a module that allocates a `struct net_device`, assigns a static MAC (`02:00:00:00:00:01`), registers it with `register_netdev`, and implements only `ndo_open`/`ndo_close` that printk a message. Load with `insmod` and verify with `ip link show`.  
   *Goal*: Understand device lifecycle and sysfs representation (`/sys/class/net/<name>/`).

2. **Offload query** – Using `ethtool -k eth0`, list all offload features. Then disable TSO (`ethtool -K eth0 tso off`) and observe the change in `ethtool -i eth0`.  
   *Goal*: Connect driver-reported features to user‑visible tool.

### Medium
3. **TX ring implementation** – Extend the skeleton driver to allocate a power‑of‑two TX ring (`N = 64`) of `struct tx_desc` (define your own descriptor with `buf_addr`, `buf_len`, `cmd`, `status`). Implement `ndo_start_xmit` to fill descriptors, kick the NIC via a mock doorbell (`writel` to a dummy I/O port), and clean completed descriptors in a timer (`mod_timer`). No real hardware needed; simulate NIC completion by setting the `DD` bit after a short delay in a workqueue.  
   *Goal*: Practice DMA mapping, descriptor ownership, and ring arithmetic.

4. **NAPI poll with budget** – Add a NAPI struct, implement `napi_poll` that pretends to receive packets by generating dummy `skb`s (using `alloc_skb`) up to the weight, and returns appropriate values. Use `netif_rx` to feed the stack. Verify with `ping -c 5 127.0.0.1` that packets are processed without interrupt storms (check `/proc/interrupts`).  
   *Goal*: Experience the interrupt‑amortization effect.

### Hard
5. **True hardware offload (TSO)** – On a real NIC that supports TSO (e.g., Intel ixgbe), implement a driver fragment that, when `skb_shinfo(skb)->gso_type & SKB_GSO_TCPV4` is set, sets the appropriate TX descriptor CMD bits (`IXGBE_TXD_CMD_TSE`). Ensure the NIC’s `MAX_TXD` limit is respected and that the driver correctly calculates the MSS (`skb_shinfo(skb)->gso_size`). Test with `iperf3 -c <server> -w 64K -M 1460` and confirm CPU usage drops compared to TSO‑off.  
   *Goal*: Bridge driver logic to real NIC register programming and validate performance gain.

6. **Interrupt storm detection & recovery** – Modify the ISR to detect if more than 1000 interrupts have been seen in the last 10 ms (using a timestamp ring buffer). If detected, temporarily disable NAPI (`napi_disable`) and schedule a workqueue to re‑enable after a cool‑down period. Log the event with `pr_err`.  
   *Goal*: Practice defensive programming and
