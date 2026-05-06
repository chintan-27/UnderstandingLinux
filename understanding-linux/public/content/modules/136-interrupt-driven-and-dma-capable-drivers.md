---
id: 136
title: "Interrupt-driven and DMA-capable drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Interrupts – From Signal to Service
An interrupt is a hardware‑asserted line that forces the CPU to abandon its current instruction stream and jump to a predefined handler. The *why* is simple: CPUs cannot poll every device at nanosecond granularity without wasting cycles; instead, devices raise a signal only when an event occurs, letting the CPU do useful work until needed.

* **Line types** – Most modern x86 platforms use the Advanced Programmable Interrupt Controller (APIC). Interrupts can be **edge‑triggered** (a transition from low to high) or **level‑triggered** (held active until serviced). Edge‑triggered lines avoid spurious re‑assertions but require the handler to clear the source; level‑triggered lines are safer for shared lines but need the device to de‑assert before the handler exits.
* **Vectoring** – The CPU reads an 8‑bit vector from the APIC that indexes the Interrupt Descriptor Table (IDT). Each vector points to a handler descriptor containing the segment selector and offset. This indirection allows the kernel to install multiple handlers per device (e.g., MSI‑X provides up to 2048 independent vectors).
* **Context switch cost** – When an interrupt arrives, the CPU performs:
  1. **Detection** – APIC asserts INTR pin.
  2. **Acknowledgement** – CPU runs an interrupt acknowledge cycle (≈ 50 ns on modern APIC).
  3. **State save** – Pushes RIP, CS, RFLAGS, SS, RSP onto the kernel stack (≈ 200 ns).
  4. **Dispatch** – Looks up vector in IDT, jumps to handler (≈ 100 ns).
  5. **Handler execution** – Runs with interrupts disabled unless explicitly re‑enabled.
  6. **Return** – `iretq` restores saved state.

Thus total latency $L = T_{ack}+T_{save}+T_{dispatch}+T_{handler}$. For a typical handler that merely wakes a thread, $T_{handler}$ ≈ 1–2 µs, giving $L$ ≈ 2.5–3 µs.

### DMA – Bypassing the CPU for Bulk Moves
Direct Memory Access lets a peripheral read/write system RAM without involving the CPU core for each transfer word. The *why* is bandwidth: a modern NVMe SSD can sustain > 3 GB/s; if the CPU had to copy each 512‑byte sector via programmed I/O, it would spend > 90 % of its time waiting for the bus.

* **DMA controller** – In PCs the role is taken by the PCIe bus master device itself (or a legacy 8237 for ISA). The device asserts a **DREQ** (DMA request) signal; the bus arbiter grants the bus when the current transaction ends.
* **Address translation** – The device sees *physical* addresses. The kernel must either allocate **DMA‑coherent** memory (already mapped 1:1) or use the IOMMU to translate virtual → physical on the fly. For coherent allocations the kernel guarantees that the CPU cache lines are flushed/invalidated before the device accesses them, eliminating coherency hazards.
* **Transfer modes** – 
  * *Single‑cycle*: device releases bus after each word (high latency, low bandwidth). 
  * *Block*: device holds bus for a programmable burst (typically 16–64 bytes). 
  * *Cycle‑stealing*: device releases bus after each word but can re‑request immediately, letting the CPU slip in between.
* **Throughput model** – For a burst of $B$ bytes, width $w$ bits per cycle, setup time $t_{setup}$ (descriptor programming) and cycle time $t_{cycle}$ per word:
  $$
  \text{Effective bandwidth} = \frac{B \cdot w}{t_{setup} + \frac{B}{w}\,t_{cycle}}
  $$
  Example: 64‑byte burst, 64‑bit bus ($w=8$ B), $t_{setup}=200$ ns, $t_{cycle}=2$ ns → bandwidth ≈ $ \frac{64·8}{200+8·2}= \frac{512}{216}\approx2.37$ GB/s per channel (limited by PCIe gen3 x1 ≈ 1 GB/s, so the real bound is the bus width).

### Coherency – Keeping Caches, Memory, and Devices in Sync
When a device writes via DMA, the CPU may still hold stale copies in its caches. Conversely, after the CPU writes, a device may read old data if the cache line hasn’t been flushed. Coherency protocols solve this:

* **MESI** (Modified, Exclusive, Shared, Invalid) is the default snooping protocol on x86. When a device performs a DMA write, it issues a *Read‑Ownership* transaction on the bus, forcing all caches holding the line to invalidate (or write‑back if Modified). The kernel must therefore:
  1. **Flush** dirty lines before the device reads (`dma_sync_single_for_device`).
  2. **Invalidate** after the device writes (`dma_sync_single_for_cpu`).
* **DMA‑coherent allocations** bypass this by using memory marked as *write‑combining* and *uncached* in the page tables (PCD/PWT bits set). The kernel allocates such pages via `dma_alloc_coherent`, guaranteeing that any CPU access sees the most recent device data without explicit flushing.

### Completion Paths – Knowing When a Transfer Is Done
A driver must be notified when the hardware has finished its work, otherwise it would either waste CPU cycles polling or risk using incomplete data.

* **Interrupt‑driven completion** – The device (or DMA controller) asserts an interrupt line after the last transaction. This is the most common path because it lets the CPU sleep until needed.
* **Polling** – The driver repeatedly reads a status register until a “done” bit is set. Useful when interrupt latency is unacceptable (e.g., high‑speed NICs with NAPI) or when the device lacks an interrupt line.
* **Hybrid (interrupt‑mitigation)** – The device raises an interrupt only after N packets or after a timeout, reducing interrupt load while keeping latency bounded.

## How It Works
### Interrupt‑Driven Drivers – Step‑by‑Step
1. **Device asserts IRQ** – e.g., a keyboard controller pulls its IRQ line low (active‑low) after scanning a key.
2. **APIC prioritises** – If multiple IRQs are pending, the APIC selects the highest‑priority vector and asserts the CPU’s INTR line.
3. **CPU acknowledges** – Runs an interrupt acknowledge cycle; the APIC returns the vector (e.g., 0x21 for IRQ 1).
4. **Vector lookup** – CPU reads the IDT entry for vector 0x21, which points to `kernel_thread_handler` (the common entry point for all interrupts).
5. **Context switch** – Hardware pushes RIP, CS, RFLAGS, SS, RSP onto the kernel stack; switches to kernel stack if coming from user mode.
6. **Interrupt handler entry** – The kernel’s `do_IRQ` disables further interrupts on that line (to avoid re‑entry), calls the registered handler via `irq_desc->action->handler`.
7. **Handler work** – Reads the device’s data register, acknowledges the interrupt (often by writing a status register), wakes any waiting task (`wake_up_process`), and possibly re‑enables the line.
8. **Return** – Executes `iretq`, restoring the saved state; the CPU resumes the interrupted context.

*Why each step matters*: Skipping the APIC acknowledgement leaves the INTR line asserted, causing the CPU to re‑enter the handler instantly (spurious interrupt storm). Forgetting to disable the line in the handler can lead to re‑entrancy if the device asserts again before the handler finishes.

### DMA‑Capable Drivers – Step‑by‑Step
1. **DMA request** – Device raises its DREQ line (or writes a PCIe DMA request descriptor).
2. **Bus arbitration** – The PCIe arbiter grants the bus when the current transaction ends; latency depends on outstanding traffic (typically < 1 µs).
3. **Descriptor programming** – The host (CPU) writes a DMA descriptor into the device’s MMIO registers: source address, destination address, transfer length, mode (single/block/cyclic), and interrupt‑on‑completion flag.
   - Addresses must be **physical**; if using `dma_map_single`, the kernel returns the DMA‑address and ensures the underlying pages are pinned.
4. **Transfer start** – Device asserts its internal DMA engine, begins reading/writing memory in bursts of size $B$.
5. **Data movement** – For each burst, the device places the address on the address bus, asserts the command (read/write), and transfers $B$ bytes per cycle.
6. **Completion signalling** – After the final burst, the device either:
   - Asserts an interrupt line (if interrupt‑on‑completion set), **or**
   - Sets a status bit that the driver can poll.
7. **Interrupt handler (if used)** – Reads the status register to confirm no errors, calls `dma_unmap_single` (or `dma_sync_*` if using coherent memory), and notifies upper layers (e.g., completes a bio block request).

*Why the setup matters*: If the descriptor’s length exceeds the actual allocated buffer, the device will read/write beyond the allocated pages, causing a page fault or silent data corruption. If the address is not page‑aligned to the device’s burst size, some controllers split the transfer into extra transactions, reducing effective bandwidth.

### Completion Paths – Interrupt vs Polling
*Interrupt path* (shown above) adds latency $L_{int}$ but frees the CPU.  
*Polling path* latency is simply the polling interval $T_{poll}$ plus the time to read the status register ($t_{reg}\approx 50$ ns). For a NIC that receives a packet every 10 µs, polling at 1 µs gives worst‑case latency of 1 µs but consumes ~10 % of a core.  

*Hybrid (NAPI)*: The NIC raises an interrupt only after receiving ≥ $N$ packets or after a timeout $\tau$. The driver then enters a polling loop (`napi_schedule`) that processes packets until the ring is empty, then re‑enables interrupts. This reduces interrupt rate while keeping latency bounded by $\max(\tau, \frac{N}{\text{rate}})$.

## Worked Examples
### Example 1 – Interrupt‑Driven Keyboard Driver (PS/2)
**Goal**: Capture scancodes from a PS/2 keyboard and make them available to the input subsystem.

**Relevant constants**:
* PS/2 keyboard IRQ = 1 (mapped to APIC vector 0x21).
* Default scancode set 1: make code = key value, break code = key value + 0x80.
* Debounce time ≈ 5 ms (hardware filtered; we ignore in software).

**Data structures**:
```c
/* Minimal state for the demo */
static DEFINE_SPINLOCK(kbd_lock);
static uint8_t kbd_scancode;    /* last scancode received */
static wait_queue_head_t kbd_wait;
```

**Handler**:
```c
static irqreturn_t kbd_interrupt_handler(int irq, void *dev_id)
{
    uint8_t sc;

    /* 1. Read scancode from keyboard data port (0x60) */
    sc = inb(0x60);

    /* 2. Update state under lock (protects against nested IRQs on same line) */
    spin_lock(&kbd_lock);
    kbd_scancode = sc;
    spin_unlock(&kbd_lock);

    /* 3. Wake any task waiting for a key */
    wake_up_interruptible(&kbd_wait);

    /* 4. Acknowledge interrupt – PS/2 controller does this automatically */
    return IRQ_HANDLED;
}
```

**Module init**:
```c
static int __init kbd_init(void)
{
    int ret;
    init_waitqueue_head(&kbd_wait);
    ret = request_irq(1, kbd_interrupt_handler,
                      IRQF_SHARED, "ps2-kbd", NULL);
    if (ret)
        pr_err("Failed to request IRQ 1: %d\n", ret);
    return ret;
}
```

**Why each line matters**:
* `request_irq` binds the handler to IRQ 1; `IRQF_SHARED` allows other devices (e.g., mouse) to share the line, requiring the handler to verify the source (we assume a dedicated line for simplicity).
* Reading from port 0x60 is the *only* way to obtain the scancode; any delay adds directly to interrupt latency.
* The spinlock prevents a second interrupt (possible if the keyboard’s internal buffer overruns) from corrupting `kbd_scancode`.
* `wake_up_interruptible` puts any task blocked on `kbd_wait` into the run queue; without it, a polling application would waste CPU.
* Returning `IRQ_HANDLED` tells the interrupt core not to invoke any other handlers on the same line (important for shared lines).

**Timing calculation** (typical values):
* Detect + ack: 50 ns (APIC)  
* State save: 200 ns  
* Dispatch: 100 ns  
* Handler (spinlock + inb + wakeup): ≈ 800 ns  
* Total latency $L$ ≈ 1.15 µs, well within the 5 ms debounce window.

### Example 2 – DMA‑Capable SATA Disk Driver (using `dmaengine`)
**Goal**: Transfer a 64 KB block from disk buffers to system memory using the SATA controller’s DMA engine.

**Assumptions**:
* SATA controller exposes a DMA channel via the `dmaengine` API (most modern controllers do).
* Desired transfer size = 64 KB = $2^{16}$ B.
* Bus width = 64 bits (8 B) – typical for PCIe Gen3 x1.
* Controller burst size = 64 B (internal FIFO).

**Steps**:

1. **Allocate a coherent buffer** (ensures the device sees up‑to‑date data):
```c
struct device *dev = pci_dev_to_dev(pdev);
size_t size = 64 * 1024;
dma_addr_t dma_addr;
void *cpu_addr = dma_alloc_coherent(dev, size, &dma_addr, GFP_KERNEL);
if (!cpu_addr)
    return -ENOMEM;
```
`dma_alloc_coherent` returns both a virtual address (`cpu_addr`) for the kernel and a DMA address (`dma_addr`) for the device, guaranteeing that any CPU writes are flushed before the device reads.

2. **Request a DMA channel**:
```c
struct dma_chan *chan = dma_request_chan(dev, "sata-dma");
if (IS_ERR(chan))
    return PTR_ERR(chan);
```

3. **Configure the transfer** (descriptor for a single block):
```c
struct dma_slave_config cfg = {
    .direction        = DMA_FROM_DEVICE,   /* disk → memory */
    .src_addr_width   = DMA_SLAVE_BUSWIDTH_8_BYTE,
    .dst_addr_width   = DMA_SLAVE_BUSWIDTH_8_BYTE,
    .src_maxburst     = 8,                 /* 64 B / 8 B = 8 beats */
    .dst_maxburst     = 8,
    .device_fc        = false,             /* not flow‑controlled */
};
ret = dmaengine_slave_config(chan, &cfg);
if (ret)
    goto err_chan;
```

4. **Prepare the descriptor**:
```c
struct dma_async_tx_descriptor *tx;
tx = dmaengine_prep_slave_single(chan,
                                 dma_addr,          /* src (disk) */
                                 size,
                                 DMA_FROM_DEVICE,
                                 DMA_PREP_INTERRUPT | DMA_CTRL_ACK);
if (!tx) {
    ret = -EINVAL;
    goto err_chan;
}
```

5. **Submit and wait** (synchronous for demo; real drivers use callbacks):
```c
dma_cookie_t cookie = tx->tx_submit(tx);
dma_async_issue_pending(chan);

/* Wait until completion (polling the descriptor status) */
enum dma_status status;
do {
    status = dma_async_is_tx_complete(chan, cookie, NULL, NULL);
    cpu_relax();
} while (status == DMA_IN_PROGRESS);

/* Optional: check for errors */
if (status != DMA_SUCCESS)
    pr_err("DMA completed with error %d\n", status);
```

6. **Cleanup**:
```c
err_chan:
    dma_release_channel(chan);
    dma_free_coherent(dev, size, cpu_addr, dma_addr);
    return ret;
```

**Why each piece matters**:
* `dma_alloc_coherent` eliminates the need for explicit cache flush/invalidate; if we had used ordinary `vmalloc`, we would need `dma_sync_single_for_cpu/device` before and after the transfer, otherwise the device could see stale data.
* The slave config’s `src_maxburst`/`dst_maxburst` must match the device’s FIFO size; otherwise the controller splits the transfer into many small beats, reducing effective bandwidth.
* `DMA_PREP_INTERRUPT` tells the engine to raise an interrupt when done; we could also poll the descriptor status (`dma_async_is_tx_complete`) – the latter is useful in atomic contexts where sleeping is forbidden.
* The `dma_async_issue_pending` call starts the engine; forgetting it leaves the descriptor queued but idle.

**Bandwidth calculation** (using the formula from Core Concepts):
* $B = 64$ KB = $2^{16}$ B, $w = 8$ B, $t_{setup}$ ≈ 200 ns (descriptor programming), $t_{cycle} = 2$ ns per 8 B beat (PCIe Gen3 x1 raw rate ≈ 1 GB/s → 1 ns per byte, but we conservatively use 2 ns to account for overhead).
* Effective bandwidth = $\frac{2^{16}·8}{200·10^{-9} + (2^{16}/8)·2·10^{-9}} ≈ \frac{524288}{200·10^{-9} + 4096·2·10^{-9}} ≈ \frac{524288}{200·10^{-9} + 8192·10^{-9}} ≈ \frac{524288}{8392·10^{-9}} ≈ 62.5$ MB/s.  
The result is far below the theoretical PCIe x1 limit because the `t_setup` dominates for small transfers. For a 1 MiB transfer, bandwidth climbs to ≈ 250 MB/s, illustrating why large I/O blocks are essential.

### Example 3 – Completion Paths: Network Driver (e1000e) Using NAPI
**Goal**: Show how the Intel gigabit Ethernet driver uses interrupt mitigation and NAPI polling.

**Key data structures** (simplified):
```c
struct e1000_adapter {
    struct napi_struct napi;
    spinlock_t          lock;
    /* ... */
};
```

**Interrupt handler** (top‑half):
```c
static irqreturn_t e1000_intr(int irq, void *data)
{
    struct e1000_adapter *adapter = data;
    u32 icr = er32(ICR);          /* read interrupt cause register */

    if (!icr)
        return IRQ_NONE;          /* not our interrupt */

    /* Disable further interrupts until we finish NAPI poll */
    er32_write(IMC, ~0);          /* Interrupt Mask Clear */

    /* Schedule NAPI poll */
    if (napi_schedule_prep(&adapter->napi)) {
        __napi_schedule(&adapter->napi);
    }
    return IRQ_HANDLED;
}
```

**NAPI poll function** (bottom‑half):
```c
static int e1000_poll(struct napi_struct *napi, int budget)
{
    struct e1000_adapter *adapter = container_of(napi, struct e1000_adapter, napi);
    int work_done = 0;
    bool clean_complete;

    /* Transmit completion */
    e1000_clean_tx_irq(adapter);

    /* Receive packets */
    clean_complete = e1000_clean_rx_irq(adapter, budget, &work_done);

    if (clean_complete) {
        /* All work done – re‑enable interrupts and exit NAPI */
        napi_complete_done(napi, work_done);
        er32_write(IMS, IMS_ENABLE_MASK); /* re‑enable */
    }
    return work_done;
}
```

**Why this works**:
* The top‑half disables interrupts (`IMC`) to prevent a storm while we process packets.
* `napi_schedule_prep` checks if NAPI is already scheduled; if not, it marks it for polling.
* The poll function processes up to `budget` packets (default 64). If it finishes early (`clean_complete` true), it exits NAPI and re‑enables interrupts (`IMS`), allowing the next interrupt to arrive.
* If the ring is still full, NAPI stays scheduled and will be invoked again either by the next interrupt or by a timer (`netdev_nice`), guaranteeing progress even if interrupts are suppressed.
* This hybrid approach reduces interrupt rate from potentially thousands per second to a few hundred while keeping latency bounded by the NAPI schedule timeout (typically a few jiffies ≈ 1‑10 ms).

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Causes Problems |
|---|---------|--------------|------------------------|
| 1 | **Failing to mask the interrupt line in the handler** (leaving IRQ enabled) | Device can re‑assert the line before the handler finishes, causing nested invocation or infinite interrupt storm. | On shared lines, this can starve other CPUs; on exclusive lines it wastes CPU cycles handling the same event repeatedly. |
|
