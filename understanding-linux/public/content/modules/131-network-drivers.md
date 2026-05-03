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

## Why This Matters

A NIC sits at the boundary between DMA hardware and the kernel's socket layer. It writes packet data directly into kernel memory without CPU involvement, signals completion via interrupts, and expects the driver to replenish descriptors fast enough to keep pace with wire speed. At 10 Gbps, a 1500-byte frame arrives every $\approx 1.2\,\mu\text{s}$. If the driver takes $2\,\mu\text{s}$ per frame to refill the RX ring, the NIC runs out of descriptors and drops packets — silently, with no error returned to any application. The failures caused by a broken network driver are not clean: DMA into freed memory causes data corruption with no stack trace; an unacknowledged interrupt causes an IRQ storm that pegs a CPU at 100%; a missing memory barrier causes the NIC to read a descriptor before the CPU finishes writing it, transmitting garbage.

---

## Core Concepts

### DMA Descriptor Rings

The NIC does not request buffers one at a time. Both TX and RX operate on **descriptor rings**: arrays of fixed-size descriptors in physically contiguous memory that the CPU and the NIC's DMA engine access simultaneously via different address spaces. The CPU sees a virtual address; the NIC sees a `dma_addr_t` (a bus address, which on x86 with no IOMMU is the physical address, but may be translated on other architectures).

Each descriptor is typically 16–32 bytes and contains:

- A bus address pointing to the packet buffer
- A length field
- An ownership bit: `0` = CPU owns, `1` = NIC owns

The NIC scans the ring looking for hardware-owned descriptors. When it fills one with an incoming packet it flips the ownership bit and raises an interrupt. The CPU must check the ownership bit — not the interrupt — to determine whether a descriptor is ready, because the NIC may fill multiple descriptors between two interrupt deliveries.

Ring size $N$ is always a power of two so that index wrapping uses a bitmask rather than a division:

$$\text{next}(i) = (i + 1) \mathbin{\&} (N - 1)$$

The ring is full (from the NIC's perspective — no place to write) when the NIC's write pointer catches up to the CPU's read pointer. This is not backpressure; the NIC simply discards the frame. Specifically, if the CPU is $N$ descriptors behind, **every arriving frame is dropped** until at least one descriptor is refilled. This makes ring drain latency a hard real-time constraint, not a soft performance goal.

The total memory for a coherent RX ring of $N$ descriptors of size $S$ bytes is:

$$M_{\text{ring}} = N \cdot S$$

Plus $N$ separately allocated `sk_buff` payload buffers, each at least MTU + headroom bytes. A typical configuration: $N = 256$, $S = 16\,\text{B}$, payload $= 2048\,\text{B}$, giving $M_{\text{ring}} = 4\,\text{KB}$ for the ring itself and $512\,\text{KB}$ for the buffers.

### `sk_buff`: The Kernel's Packet Container

Every in-flight packet is represented by an `sk_buff`. The driver allocates one per RX slot at initialization. The `sk_buff`'s `data` pointer is DMA-mapped using `dma_map_single()`, which pins the page and returns the bus address written into the descriptor. The CPU **must not read the buffer data** between the moment it hands the descriptor to the NIC (sets `DESC_HW_OWNED`) and the moment it calls `dma_unmap_single()` after the interrupt fires. This is not a convention — it is a cache coherency contract enforced differently on different architectures (on non-coherent architectures, the map/unmap calls issue explicit cache flushes).

After the NIC fills the buffer, the driver calls `dma_unmap_single()`, sets `skb->protocol` by parsing the Ethernet header, and calls `netif_receive_skb()` to hand the packet to the network stack. It then allocates a fresh `sk_buff` for that descriptor slot and re-hands ownership to the NIC.

### Interrupt Handling

The driver registers an IRQ handler with `request_irq()`. When the NIC asserts its interrupt line, the CPU invokes the handler with local interrupts disabled (for `IRQF_DISABLED`, now deprecated) or with the specific IRQ masked. The handler runs in hardirq context: it cannot sleep, cannot block on a mutex, and should do the absolute minimum work.

The canonical pattern:

```c
static irqreturn_t my_nic_interrupt(int irq, void *dev_id)
{
    struct my_nic *nic = dev_id;
    u32 status;

    status = ioread32(nic->bar0 + REG_IRQ_STATUS);
    if (!(status & IRQ_SOURCES_MASK))
        return IRQ_NONE;  /* shared IRQ line, not ours */

    iowrite32(status, nic->bar0 + REG_IRQ_ACK);  /* clear before scheduling */
    napi_schedule(&nic->napi);                    /* schedule poll */
    return IRQ_HANDLED;
}
```

The interrupt is cleared **before** scheduling deferred work, not after. If you clear it after, a packet arriving in the window between scheduling and clearing causes the interrupt to be lost, and that descriptor slot is never processed until the next packet arrives.

### NAPI: Why Pure Interrupts Fail at Line Rate

At 10 Gbps with 64-byte frames, the NIC delivers $\approx 14.8 \times 10^6$ packets per second. Each interrupt has a fixed overhead — save/restore registers, switch context, run the handler, return. If that overhead is $1\,\mu\text{s}$, interrupt-driven reception consumes:

$$14.8 \times 10^6 \text{ interrupts/s} \times 1\,\mu\text{s/interrupt} = 14.8\,\text{s of CPU per second}$$

which is physically impossible on one core. The system enters **interrupt liveness collapse**: it spends all its time entering and leaving interrupt context and makes zero forward progress on processing packets or running user processes.

NAPI solves this with a state machine per receive queue:

1. First frame arrives → interrupt fires → driver calls `napi_schedule()` → **interrupt disabled for this queue**
2. `net_rx_action` softirq runs `napi_poll()` with a budget (default 64 packets)
3. Driver's `poll()` drains descriptors up to the budget, calling `netif_receive_skb()` for each
4. If the ring empties before budget exhaustion → call `napi_complete_done()` → re-enable interrupt
5. If budget exhausted → return the budget value → softirq yields and reschedules; interrupt stays off

Step 5 is the key: the interrupt remains disabled as long as frames are arriving faster than the budget can drain them. The CPU stops paying interrupt overhead and instead amortizes it over a batch of up to 64 packets. At low load (step 4), you still get one interrupt per first-packet, preserving latency.

The NAPI poll function skeleton:

```c
static int my_nic_poll(struct napi_struct *napi, int budget)
{
    struct my_nic *nic = container_of(napi, struct my_nic, napi);
    int work_done = 0;

    while (work_done < budget) {
        struct my_rx_desc *desc = &nic->rx_ring[nic->rx_head];

        if (desc->flags & DESC_HW_OWNED)
            break;  /* NIC hasn't filled this one yet */

        dma_unmap_single(&nic->pdev->dev, desc->addr,
                         RX_BUF_SIZE, DMA_FROM_DEVICE);

        netif_receive_skb(nic->rx_skbs[nic->rx_head]);
        my_nic_refill_rx(nic, nic->rx_head);  /* allocate new skb, re-arm */

        nic->rx_head = (nic->rx_head + 1) & (RX_RING_SIZE - 1);
        work_done++;
    }

    if (work_done < budget)
        napi_complete_done(napi, work_done);  /* re-enables interrupt */

    return work_done;
}
```

### Hardware Offloads

Offloads shift computation from the kernel's protocol stack to the NIC's dedicated logic. This matters because checksum computation and TCP segmentation are $O(n)$ in packet size — at 10 Gbps they consume measurable CPU cycles that compound across millions of packets.

| Offload | Mechanism |
|---|---|
| TX checksum offload | Driver sets `skb->ip_summed = CHECKSUM_PARTIAL`; NIC fills in the checksum field before transmit |
| RX checksum offload | NIC validates checksum; driver sets `skb->ip_summed = CHECKSUM_UNNECESSARY`; stack skips verification |
| TSO (TCP Segmentation Offload) | Kernel hands NIC a single buffer up to 64 KB; NIC segments into MTU-sized frames. The kernel avoids $\lfloor\text{len}/\text{MTU}\rfloor$ copy operations |
| GRO (Generic Receive Offload) | Kernel (not NIC) coalesces matching TCP segments into a single large `sk_buff` before delivering to the socket; reduces per-packet overhead in the stack |

The driver advertises capability by setting bits in `netdev->hw_features` and enabling them in `netdev->features`. The stack checks `skb->ip_summed` before computing checksums, and checks `NETIF_F_TSO` in `dev->features` before segmenting.

---

## How It Works

### Initialization: `probe()` to `register_netdev()`

The PCI subsystem calls `probe()` after matching the device's vendor/device ID against the driver's `pci_device_id` table. The driver must
