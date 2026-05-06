---
id: 139
title: "Debugging drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to Debugging Drivers
A Linux driver is a kernel module that translates hardware operations (MMIO registers, I/O ports, interrupts) into kernel services (character devices, block devices, network interfaces). Because the driver runs in privileged kernel space, any bug can corrupt memory, deadlock the scheduler, or trigger an oops that crashes the whole system. Debugging therefore requires tools that can observe kernel state **without** altering the timing or memory layout of the driver itself. The core primitives are:

* **printk** – the kernel’s printf‑like logging facility that writes to a fixed‑size circular buffer (the *ring buffer*).  
* **dynamic_debug** – a pr_debug‑based switch that lets you enable/disable individual `pr_debug()` statements at runtime via debugfs.  
* **tracepoints** – statically compiled hooks (`TRACE_EVENT`) that record structured data into the tracing buffer when enabled.  
* **lockdep** – a lock‑graph validator that records every lock acquisition/release and checks for cycles that indicate a potential deadlock.  
* **sanitizers** (KASAN, KCSAN, UBSAN) – compile‑time instrumentation that inserts checks for illegal memory accesses, data races, or undefined behavior.

Each tool answers a different class of failure:  
*printk* → asynchronous error messages;  
*dynamic_debug* → verbose, on‑demand tracing of specific code paths;  
*tracepoints* → low‑overhead, high‑frequency event streams;  
*lockdep* → lock‑ordering correctness;  
*sanitizers* → memory‑safety and concurrency bugs.

### Understanding dmesg and the Kernel Ring Buffer
The kernel maintains a ring buffer of size **RB_SIZE** bytes (default 1 MiB, configurable via `CONFIG_LOG_BUF_SHIFT`). Each call to `printk()` formats a message and copies it into the buffer at index **tail**. The kernel advances `tail = (tail + len) % RB_SIZE`. When `tail` catches up to `head` (the read pointer), the oldest messages are overwritten.

The probability that a message of average length **μ** bytes is lost due to overflow can be approximated by a Poisson arrival model. If messages arrive at rate **λ** per second, the buffer can hold **B = RB_SIZE/μ** messages. The overflow time **Tₒᵥₑᵣ** ≈ **B/λ**. For example, with RB_SIZE = 1 MiB, μ = 200 B, λ = 500 msgs/s → B ≈ 5242 messages → Tₒᵥₑᵣ ≈ 10 s. Hence, if you need to capture a burst longer than ~10 s you must increase `CONFIG_LOG_BUF_SHIFT` or consume the buffer faster (e.g., `dmesg -w`).

`dmesg` simply reads `/dev/kmsg` (or the sysfs equivalent `/sys/kernel/debug/dmesg`) and prints the buffer contents. Adding `-T` converts internal timestamps to human‑readable form; `-w` follows the buffer like `tail -f`.

### Dynamic Debug
Dynamic debug relies on the `pr_debug()` macro, which expands to nothing unless `CONFIG_DYNAMIC_DEBUG` is set. At boot, each `pr_debug()` call site registers a unique **flags** word in the `__debug` section. The debugfs file `/sys/kernel/debug/dynamic_debug/control` holds lines of the form:

```
filename:lineno [function]flags = [+p|-p]
```

Writing `+p` enables the call site; writing `-p` disables it. The kernel checks the flag on each invocation, so overhead is negligible when disabled (~a few nanoseconds). This lets you confine verbose logging to a single source file, function, or even a specific line, avoiding the flood that would result from enabling `pr_debug` globally.

### Tracepoints
A tracepoint is defined with:

```c
TRACE_EVENT(my_driver_foo,
    TP_PROTO(int arg),
    TP_ARGS(arg),
    TP_STRUCT__entry(
        __field(int, arg)
    ),
    TP_fast_assign(
        __entry->arg = arg;
    ),
    TP_printk("arg = %d", __entry->arg)
);
```

The macro expands to a static inline function that, when the tracepoint is enabled, calls `trace_event_buffer_reserve()` to obtain a per‑CPU buffer slot, stores the fields, and invokes `trace_event_buffer_commit()`. If disabled, the function is a no‑call (the compiler optimizes it away). Enumerated events appear under `/sys/kernel/debug/tracing/events/<system>/<name>/`. Writing `1` to the `enable` file turns the tracepoint on; reading `trace` consumes the buffered records.

Tracepoints incur virtually zero overhead when off (only a few bytes of reserved space) and a deterministic cost when on (typically < 1 µs per event on modern CPUs).

### Lockdep
Lockdep maintains a directed graph **G = (V, E)** where each vertex **v** is a lock class (e.g., `&my_driver->mutexA`) and each directed edge **v → w** indicates that lock **v** was held while lock **w** was acquired. A cycle in **G** signals a potential deadlock, regardless of whether the particular acquisition sequence has been observed.

Lockdep instruments every spinlock, mutex, rw_semaphore, and rcu read-side critical section via macros like `__mutex_lock_common()`. On each lock acquisition, it pushes the lock class onto a per‑task stack and updates the graph; on release, it pops. Cycle detection runs periodically (or on demand via `echo 1 > /sys/kernel/debug/lockdep`) using a depth‑first search; its complexity is **O(|V|+|E|)**, which remains small because the number of distinct lock classes in a typical driver is < 100.

### Sanitizers
* **KASAN (Kernel Address SANitizer)** – compiles with `-fsanitize=kernel-address`, inserting checks before every memory access. It uses shadow memory (1 byte shadow per 8 bytes of real memory) to track whether each byte is *valid*, *freed*, or *redzone*. On violation, KASAN prints a detailed slab out‑of‑bounds or use‑after‑free report, including a stack trace.
* **KCSAN (Kernel Concurrency SANitizer)** – enables `-fsanitize=thread`‑like tracking for kernel data races, using a hybrid happens‑before model.
* **UBSAN (UndefinedBehavior SANitizer)** – catches integer overflow, misaligned shifts, etc.

These tools add runtime overhead (typically 2× for KASAN, 3–5× for KCSAN) and therefore are used in debugging or test kernels, not production.

---

## How It Works
### Step‑by‑Step Debugging Methodology
1. **Symptom Classification**  
   *Oops*: kernel BUG, null‑ptr deref → look for `RIP:` and call stack in `dmesg`.  
   *Hang*: no scheduler progress → check for lockdep warnings or soft‑lockup detector (`softlockup` watchdog).  
   *Data corruption*: device returns garbage → suspect DMA mapping errors or race conditions.

2. **Information Gathering**  
   ```bash
   uname -r                               # kernel version
   lspci -vvnn -d <vendor>:<device>      # device BARs, IRQ
   modinfo my_driver.ko                  # module parameters, alias
   cat /proc/kallsyms | grep my_driver   # exported symbols
   sudo grep -R my_driver /sys/module   # current parameters
   ls -l /sys/kernel/debug/tracing      # ensure debugfs mounted
   ```
   Collect the full `dmesg` buffer before reproducing the fault:
   ```bash
   dmesg -T > dmesg_pre.txt
   ```

3. **Enable Targeted Debugging Facilities**  
   *Increase ring buffer* if needed: `sudo sysctl -w kernel.log_buf_len=16777216` (requires reboot).  
   *Dynamic debug*: enable only the suspect source file:
   ```bash
   echo -n 'file my_driver.c +p' > /sys/kernel/debug/dynamic_debug/control
   ```
   *Tracepoint*: enable a specific event:
   ```bash
   echo 1 > /sys/kernel/debug/tracing/events/my_driver/my_event/enable
   ```
   *Lockdep*: ensure the kernel was built with `CONFIG_LOCKDEP=y` (default in debug kernels).  
   *KASAN*: boot with `kasanoff` disabled or use a debug kernel; verify via `dmesg | grep -i kasan`.

4. **Data Collection**  
   *Live kernel messages*: `sudo dmesg -Tw | tee live.log`  
   *Trace buffer*: after reproducing the issue,
   ```bash
   echo 0 > /sys/kernel/debug/tracing/tracing_on   # stop further writes
   cat /sys/kernel/debug/tracing/trace > trace.out
   ```
   *Lockdep graph*: 
   ```bash
   echo 1 > /sys/kernel/debug/lockdep
   cat /sys/kernel/debug/lockdep > lockdep.out
   ```
   *KASAN report*: appears automatically in `dmesg`; capture with `dmesg -T | grep -A20 kasan`.

5. **Analysis**  
   *Correlate timestamps*: align `dmesg` timestamps with tracepoint records (`# cat trace.out | grep -E 'my_driver_foo'`).  
   *Backtrace inspection*: each oops lists `Call Trace:`; use `addr2line -e vmlinux <addr>` to translate to source lines.  
   *Lockdep cycles*: look for ` Circular locking dependency detected` and the chain of locks.  
   *KASAN shadow*: the report shows the offending address and shadow value (`0xfa` = freed, `0xf1` = redzone).

6. **Fix and Regression Test**  
   Apply the patch, rebuild the module (`make -C /lib/modules/$(uname -r)/build M=$PWD modules`), reload (`sudo rmmod my_driver; sudo insmod my_driver.ko`), and repeat steps 3‑5 to confirm the symptom disappears and no new warnings appear.

---

## Worked Examples
### Example 1: Using `dmesg` to Isolate a Firmware Load Failure
**Scenario**: A USB Wi‑Fi driver (`ath9k_htc`) fails to initialize; the device never appears as `wlan0`.

1. **Clear buffer** and capture baseline:
   ```bash
   sudo dmesg -C
   sudo dmesg -Tw > before.txt &
   ```
2. **Insert the device**:
   ```bash
   sudo modprobe ath9k_htc
   ```
3. **Stop capture** after 5 s and examine:
   ```bash
   sudo kill %1
   grep -i ath9k before.txt | head -20
   ```
   Output (excerpt):
   ```
   [ 12.345678] ath9k_htc 1-1.2:1.0: firmware: failed to load ath9k_htc/htc_9271.fw (-2)
   [ 12.345789] usb 1-1.2: device firmware failed
   ```
   The error code `-2` corresponds to `-ENOENT` (file not found).  
   **Root cause**: firmware missing from `/lib/firmware/`.  
   **Fix**: Install the firmware package (`sudo apt install firmware-atheros`) or copy the file manually.

**Why this works**: The ring buffer preserves the exact timestamped message emitted by `usb_submit_urb()` when the firmware request fails. No additional tooling is needed because the driver already prints a descriptive error with `dev_err()`.

### Example 2: Dynamic Debug to Trace a Race in `my_driver`
**Scenario**: Intermittent corruption of a hardware register when two threads call `my_driver_write()` concurrently.

1. **Identify suspect code**: In `my_driver.c`, the function `hw_write_reg()` performs a read‑modify‑write without locking.
2. **Enable dynamic debug for that function only**:
   ```bash
   echo -n 'func hw_write_reg +p' > /sys/kernel/debug/dynamic_debug/control
   ```
3. **Generate load** with a stress test:
   ```bash
   for i in {1..1000}; do
       ./hw_test_ioctl &   # spawns threads that call the ioctl
   done
   wait
   ```
4. **Collect messages**:
   ```bash
   sudo dmesg -T | grep hw_write_reg > dd.log
   ```
   Sample log:
   ```
   [ 98.765432] my_driver: hw_write_reg: reg=0x14 old=0x0000ffff new=0x0000ff00
   [ 98.765438] my_driver: hw_write_reg: reg=0x14 old=0x0000ff00 new=0x0000ffff
   ```
   The overlapping old/new values indicate a lost‑update race.

5. **Root cause**: Two threads read the same stale value, modify different bits, and write back, causing one thread’s changes to be overwritten.

6. **Fix**: Add a `spinlock_t reg_lock;` and protect the read‑modify‑write:
   ```c
   spin_lock(&reg_lock);
   val = readl(reg);
   val = (val & ~mask) | value;
   writel(val, reg);
   spin_unlock(&reg_lock);
   ```
   Re‑run the stress test; the dynamic debug log now shows a strict ordering of old→new values without overlap.

**Why dynamic debug is preferable here**: Enabling `pr_debug()` globally would flood the buffer with thousands of lines per second, making the relevant entries hard to find. Limiting the debug to a single function yields a signal‑to‑noise ratio > 20:1.

### Example 3: Tracepoints to Detect DMA Mapping Errors
**Scenario**: A PCIe driver occasionally reports `dma_map_single failed: -ENOMEM`.

1. **Add a tracepoint** (already present in the kernel as `mm/dma_mapping`):
   ```c
   TRACE_EVENT(dma_map_page,
       TP_PROTO(struct device *dev, phys_addr_t phys, size_t size,
                enum dma_data_direction dir, bool forced_unmap),
       TP_ARGS(dev, phys, size, dir, forced_unmap),
       TP_STRUCT__entry(
           __field(struct device *, dev)
           __field(phys_addr_t, phys)
           __field(size_t, size)
           __field(enum dma_data_direction, dir)
           __field(bool, forced_unmap)
       ),
       TP_fast_assign(
           __entry->dev = dev;
           __entry->phys = phys;
           __entry->size = size;
           __entry->dir = dir;
           __entry->forced_unmap = forced_unmap;
       ),
       TP_printk("dev=%s phys=%pa size=%zu dir=%s %s",
                 dev_name(__entry->dev), &__entry->phys,
                 __entry->size,
                 __entry->dir == DMA_TO_DEVICE ? "TO" :
                 __entry->dir == DMA_FROM_DEVICE ? "FROM" : "BIDI",
                 __entry->forced_unmap ? "(forced)" : "")
   );
   ```
2. **Enable the tracepoint**:
   ```bash
   echo 1 > /sys/kernel/debug/tracing/events/kmem/dma_map_page/enable
   ```
3. **Run the workload** that triggers the error (e.g., `fio --filename=/dev/nvme0n1 --rw=randwrite --bs=4k --iodepth=32`).
4. **Stop tracing and extract**:
   ```bash
   echo 0 > /sys/kernel/debug/tracing/tracing_on
   cat /sys/kernel/debug/tracing/trace > dma_trace.txt
   ```
5. **Excerpt** showing the failure:
   ```
   cpu#0  12345.678901: dma_map_page: dev=0000:01:00.0 phys=00000000a1b2c000 size=4096 dir=FROM forced_unmap=0
   cpu#0  12345.678902: dma_map_page: dev=0000:01:00.0 phys=00000000a1b2c000 size=4096 dir=FROM forced_unmap=1
   ```
   The second line shows the allocator falling back to the *forced* path after the first attempt returned `-ENOMEM`. The trace also reveals that the device’s DMA mask is only 32 bits while the system has > 4 GiB RAM, causing the allocation to fall outside the addressable range.

6. **Fix**: Increase the DMA mask via `dma_set_mask_and_coherent(dev, DMA_BIT_MASK(64));` or allocate with `dma_alloc_coherent()` using `GFP_DMA32`. After applying the fix, the trace shows no `forced_unmap=1` entries and the error disappears.

**Why tracepoints help**: They give a structured, low‑overhead view of every DMA map/unmap operation, including the direction and outcome, which would be impossible to infer from `printk` alone without adding many custom log statements.

### Example 4: Lockdep Detecting a Potential Deadlock
**Scenario**: A driver uses two mutexes, `lock_a` and `lock_b`, acquired in opposite order in two code paths.

1. **Verify lockdep is active** (default in `CONFIG_DEBUG_KERNEL`):
   ```bash
   cat /sys/kernel/debug/lockdep
   ```
   Should show `lockdep: enabled`.
2. **Run a concurrent test** that triggers both paths:
   ```bash
   # Path A: ioctl1() -> lock_a then lock_b
   # Path B: ioctl2() -> lock_b then lock_a
   ./stress_ioctl &
   ./stress_ioctl &
   wait
   ```
3. **Check lockdep output**:
   ```bash
   dmesg | grep -i lockdep
   ```
   Sample:
   ```
   [  123.456789] lockdep: WARNING: circular locking dependency detected
   [  123.456790]  ___klocks_acquire+0x0/0x30
   [  123.456791]   #1: (&lock_b)->{+.+.}, at: [<ffffffffc0123456>] ioctl2+0x20/0x80
   [  123.456792]   #0: (&lock_a)->{+.+.}, at: [<ffffffffc0123ab0>] ioctl1+0x18/0x70
   [  123.456793]   ... (chain continues)
   ```
   The warning shows the cycle `lock_a → lock_b → lock_a`.

4. **Root cause**: Inconsistent lock ordering across entry points.

5. **Fix**: Enforce a global ordering (e.g., always acquire `lock_a` before `lock_b`). Refactor `ioctl2()` to take `lock_a` first, using `mutex_lock_nested()` with appropriate subclass if needed.

6. **Validate**: Re‑run the stress test; no lockdep warnings appear.

**Why lockdep is essential**: The deadlock may never manifest under light load; lockdep’s static analysis catches the *possibility* of a cycle regardless of scheduling timing.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Matters |
|---|---------|--------------|----------------|
| 1 | **Relying solely on `dmesg` without timestamps** | Messages appear as relative seconds since boot; correlating with external events (e.g., hardware interrupt) becomes guesswork. | Without `-T` or `%{monotonic}` you cannot align driver actions with user‑space timestamps, leading to missed cause‑effect links. |
| 2 | **Enabling dynamic debug globally (`echo -n '-p' > …`)** | Turns on every `pr_debug()` in the kernel, flooding the ring buffer (often > 100 MB/s) and overwriting useful messages within seconds. | The overflow obscures the very bug you’re hunting; you may need to increase the buffer size or lose data entirely. |
| 3 | **Mounting debugfs incorrectly or not at all** | Attempting to write to `/sys/kernel/debug/*` fails with “No such file or directory”. | Dynamic debug, tracepoints, and lockdep all depend on debugfs; without it the tools are inert, giving a false impression that they’re not working. |
| 4 | **Activating a tracepoint but forgetting to enable tracing** | Writing `1` to the event’s `enable` file arms the probe, but the trace buffer stays empty unless `tracing_on` is set to `1`. | You’ll see no output and conclude the tracepoint is broken, wasting time checking kernel configuration. |
| 5 | **Assuming lockdep reports *all* deadlocks** | Lockdep only detects *potential* deadlocks based on observed lock orders; it cannot predict deadlocks that require three or more locks never seen together. | A complex deadlock involving three locks may slip through, leading to a false sense of security. |
| 6 | **Running KASAN on a production system** | KASAN inserts shadow memory checks, doubling memory bandwidth usage and slowing context switches. | On a load‑sensitive server, the overhead can cause missed deadlines or trigger soft‑lockups, corrupting the very data you intend to protect. |
| 7 | **Not clearing the trace buffer before a test** | Stale events
