---
id: 84
title: "I/O systems"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Why This Matters

The CPU operates at nanosecond timescales. A disk seek takes milliseconds. That gap is not incidental — it is a fundamental constraint that shapes every layer of the kernel's I/O stack. Each mechanism in this module exists to solve a specific part of the mismatch:

- **Buffering** amortizes fixed per-I/O latency across many small writes
- **Spooling** serializes access to devices that physically cannot multiplex
- **Interrupts** eliminate CPU spinning during device wait time
- **DMA** eliminates CPU involvement in the data transfer itself

These are not independent optimizations — they compose. A `write()` call typically triggers all four. Understanding them separately first is the only way to understand how they interact.

---

## Core Concepts

### Buffering: Amortizing Fixed Latency

When a process calls `write()`, the data lands in the kernel's **page cache**, not on disk. The reason is purely arithmetic: I/O cost is dominated by fixed overhead (seek time, rotational latency, DMA setup), not by transfer size. Writing 1 byte costs nearly as much as writing 4096 bytes. Buffering accumulates writes until you can pay that fixed cost once for many bytes instead of once per byte.

The three strategies differ in when they flush:

| Strategy | Flush trigger | Use case |
|---|---|---|
| Unbuffered | Every `write()` | Audit logs, `O_SYNC` files |
| Fully buffered | Block full, timer, or `fsync()` | Regular files |
| Line buffered | Newline character | Terminals (`isatty()` returns true) |

The C library (`stdio`) adds a *second* buffering layer on top of the kernel's. `fwrite()` buffers in userspace first, then calls `write()` to push into the page cache, which itself buffers before hitting disk. You can have data that is invisible to the kernel entirely — sitting only in `FILE *` userspace buffers — until `fflush()` is called. This is a common source of data loss bugs.

The durability tradeoff is precise: a page in the page cache marked **dirty** has been accepted by the kernel but not committed to stable storage. Power loss between `write()` and writeback loses that data. `fsync()` closes this window by forcing dirty pages through to the device before returning.

### Spooling: Serializing an Exclusive Resource

A printer cannot interleave output from two concurrent processes — the physical mechanism is sequential. Without serialization, two processes writing simultaneously produce garbled output. Spooling solves this structurally: processes write to an intermediate queue (on disk), and a single daemon drains that queue to the device one job at a time.

The key insight is that spooling converts an **exclusive device** into a **queued resource**. The process's `write()` returns after writing to the spool directory — fast, non-blocking, and non-exclusive. The actual device serialization is handled entirely by the spooler daemon. CUPS, the Linux print system, does exactly this: jobs land in `/var/spool/cups/`, and `cupsd` feeds them to the device sequentially.

Spooling applies anywhere a device cannot multiplex: line printers, tape drives, serial ports at fixed baud rates. It does not apply to block devices like disks, which use a different serialization mechanism (the I/O scheduler).

### Interrupt-Driven I/O: Eliminating the Spin

Polling reads a device status register in a tight loop until the device signals readiness:

```c
// Polling — burns CPU proportionally to device latency
while ((inb(STATUS_PORT) & DEVICE_READY) == 0)
    ; // 30 million wasted cycles for a 10ms disk seek
```

For a disk with seek time $T_{\text{seek}} = 10\ \text{ms}$ and a CPU running at $f = 3 \times 10^9\ \text{Hz}$:

$$\text{wasted cycles} = T_{\text{seek}} \times f = 10 \times 10^{-3}\ \text{s} \times 3 \times 10^9\ \text{Hz} = 3 \times 10^7\ \text{cycles}$$

Polling is not always wrong — for NVMe drives with sub-100µs completion, the context-switch overhead of sleeping and waking can exceed the wait time, which is why `io_uring` supports a polled completion mode. But for anything with millisecond latency, spinning is indefensible.

Interrupt-driven I/O inverts the control: the CPU issues the request, marks the requesting process `TASK_UNINTERRUPTIBLE`, and runs something else. When the device finishes, it asserts an IRQ line. The CPU:

1. Finishes its current instruction (not the current process slice — just the current instruction)
2. Saves registers and the instruction pointer to the kernel stack
3. Indexes into the **Interrupt Descriptor Table (IDT)** using the IRQ number as an index
4. Jumps to the registered **Interrupt Service Routine (ISR)**
5. The ISR marks the I/O complete, wakes the sleeping process, and returns
6. The scheduler may immediately preempt to the now-runnable process

The IDT on x86-64 contains 256 entries. IRQ 0 is the timer; IRQ 1 is the keyboard; disk controllers typically use IRQs 14–15 (legacy IDE) or MSI vectors (modern PCIe). You can see current IRQ assignments and hit counts:

```bash
cat /proc/interrupts
```

The process sleeping on I/O consumes zero CPU. This is the mechanism behind `epoll` scaling to thousands of concurrent connections: thousands of processes can be blocked in `TASK_UNINTERRUPTIBLE`, all waiting for their respective IRQs, none burning CPU.

### DMA: Eliminating the Per-Byte CPU Overhead

With interrupts, the CPU is free *during the wait*. But if data transfer still requires the CPU — reading a device register, writing to memory, repeating for every word — then for a $N$-byte transfer at one word per instruction, the CPU spends $O(N)$ instructions just moving bytes. For a 1 MB read, that is $2^{18}$ memory-write instructions at the moment the ISR fires.

DMA delegates the copy to a dedicated **DMA controller** (DMAC) that sits on the memory bus and can drive it independently. The CPU programs the DMAC with three values and triggers the transfer:

- **Source address**: device I/O address or memory address
- **Destination address**: physical address of the target kernel buffer
- **Byte count**: length of transfer

The DMAC then drives the memory bus autonomously. The CPU involvement is $O(1)$ — setup and interrupt handling only, independent of transfer size:

$$\text{CPU cycles (DMA)} = C_{\text{setup}} + C_{\text{ISR}} \approx \text{const}$$
$$\text{CPU cycles (no DMA)} = C_{\text{setup}} + k \cdot N \quad \text{where } k \approx 2\text{–}4\ \text{cycles/word}$$

For $N = 1\ \text{MB}$ and $k = 2$: the non-DMA path burns roughly $2 \times 2^{18} \approx 500{,}000$ extra cycles in the ISR. DMA reduces this to a fixed ~200 cycles regardless of $N$.

---

## How It Works

### The Write Path Through the Page Cache

```
process write()
    │
    ▼
user buffer → [copy_from_user] → page cache (dirty page)
                                        │
                               [kworker/writeback]
                                        │
                                    block layer
                                        │
                               [bio structure built]
                                        │
                                  I/O scheduler
                                        │
                                 DMA transfer setup
                                        │
                                  device ←── DMAC
                                        │
                                   IRQ fires
                                        │
                                  page marked clean
```

Step by step:

1. `write()` enters the kernel via syscall, copies data from userspace into a page cache page with `copy_from_user()`.
2. The page is tagged **dirty** in the page's flags (`PG_dirty` bit).
3. `write()` returns. No disk I/O has occurred.
4. `kworker` threads (visible as `kworker/u:N` in `ps`) flush dirty pages when: the dirty ratio exceeds `/proc/sys/vm/dirty_ratio`, the page has been dirty longer than `/proc/sys/vm/dirty_expire_centisecs`, or `fsync()`/`sync()` is called explicitly.
5. The kernel builds a `struct bio` (block I/O descriptor) and submits it to the block layer.
6. The I/O scheduler (BFQ, mq-deadline, or none) may reorder or merge the bio with adjacent requests before dispatching.
7. The driver programs the DMAC and returns. The CPU is free.
8. DMAC completes transfer, fires IRQ. The ISR marks the bio complete and wakes any process blocked on `fsync()`.

You can observe dirty page accumulation and writeback in real time:

```bash
# Watch dirty and writeback page counts (in pages, multiply by 4 for KB)
watch -n 1 'grep -E "Dirty|Writeback" /proc/meminfo'

# Tune writeback aggressiveness (default: 20% of RAM before blocking writes)
cat /proc/sys/vm/dirty_ratio
cat /proc/sys/vm/dirty_background_ratio  # background writeback starts here
```

### Interrupt Mechanics in the Kernel

The `struct bio` submission path in the kernel uses completions to synchronize with the ISR:

```c
// Driver submits I/O and sleeps — simplified from block/blk-core.c pattern
struct completion io_done;
init_completion(&io_done);

bio->bi_end_io = my_bio_end_io;
bio->bi_private = &io_done;
submit_bio(bio);

// Process blocks here; scheduler runs other tasks
wait_for_completion(&io_done);
// Execution resumes here only after ISR calls complete()

// ISR / bio completion callback:
static void my_bio_
