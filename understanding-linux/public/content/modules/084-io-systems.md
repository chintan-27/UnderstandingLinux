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

## Core Concepts
### I/O Subsystem Overview
An I/O subsystem bridges the CPU and peripheral devices, which operate at vastly different speeds and have independent timing. The CPU executes instructions at nanosecond granularity, while devices such as disks (millisecond latency), network interfaces (microsecond‑scale packet arrival), and human‑interface devices (character‑by‑character) generate data at rates ranging from a few bytes per second to gigabytes per second. If the CPU waited synchronously for each I/O operation, utilization would collapse to the ratio of device speed to CPU speed. The subsystem therefore employs **decoupling mechanisms**—buffering, spooling, interrupt-driven I/O, and DMA—to overlap computation with I/O and to match mismatched bandwidths.

### Why Buffering Is Necessary
A buffer is a region of RAM that temporarily holds data while it moves between producer and consumer. Consider a producer with rate \(R_p\) (bytes/s) and a consumer with rate \(R_c\) (bytes/s). Without buffering, the consumer must idle whenever \(R_p < R_c\) and the producer must block whenever \(R_p > R_c\). By inserting a buffer of size \(B\) bytes, the system can tolerate short-term rate mismatches. The time to fill the buffer from empty is  

\[
t_{\text{fill}} = \frac{B}{R_p}
\]

and the time to empty it from full is  

\[
t_{\text{drain}} = \frac{B}{R_c}.
\]

If \(R_p \neq R_c\), the buffer level oscillates between 0 and \(B\) with a period \(t_{\text{fill}}+t_{\text{drain}}\). The **average CPU utilization** saved by buffering equals the fraction of time the consumer is busy rather than waiting:

\[
U_{\text{save}} = 1 - \frac{R_p}{R_c} \quad (\text{when } R_p < R_c).
\]

Thus buffering converts a potentially blocking operation into a pipeline where the CPU can perform other work while the buffer drains.

### Why Spooling Is Necessary
Spooling (Simultaneous Peripheral Operations On‑Line) extends buffering to **job‑level** decoupling. Instead of buffering raw bytes, the system queues whole I/O jobs (e.g., print jobs, database transactions) in a spool directory. A spooler daemon consumes jobs at the device’s service rate \(\mu\) (jobs/s) while user processes submit jobs at arrival rate \(\lambda\) (jobs/s). This turns a synchronous device into an asynchronous service. The system behaves like an **M/M/1 queue** (Poisson arrivals, exponential service) with utilization  

\[
\rho = \frac{\lambda}{\mu}.
\]

When \(\rho < 1\) the queue reaches a steady state with expected length  

\[
L = \frac{\rho}{1-\rho}
\]

and average waiting time  

\[
W = \frac{L}{\lambda} = \frac{1}{\mu-\lambda}.
\]

Spooling therefore lets the CPU continue issuing jobs while the device works in the background, bounded only by spool storage.

### Why Interrupt‑Driven I/O Is Necessary
In pure programmed I/O the CPU repeatedly polls a device’s status register until the device signals completion, wasting cycles. An interrupt flips this model: the device asserts an interrupt line when it has finished a unit of work (e.g., received a character, completed a sector read). The CPU saves its current context, jumps to an **Interrupt Service Routine (ISR)**, services the device, and restores context.  

If each I/O unit takes \(t_{\text{dev}}\) time to process in the device and the ISR requires \(t_{\text{ISR}}\) CPU cycles, the fraction of CPU time spent handling interrupts is  

\[
U_{\text{int}} = \frac{t_{\text{ISR}}}{t_{\text{dev}}+t_{\text{ISR}}}.
\]

When \(t_{\text{ISR}} \ll t_{\text{dev}}\) (typical for high‑latency devices), the CPU can devote >90% of its time to other tasks.

### Why DMA Is Necessary
Even with interrupts, each byte/word transferred still requires CPU involvement to move data between an I/O register and memory. Direct Memory Access (DMA) offloads this copy to a dedicated DMA controller. The CPU programs the controller with a source address, destination address, and transfer length; the controller then hijacks the memory bus for each word (cycle‑stealing) or bursts a block, raising an interrupt only when the entire transfer finishes.  

For a transfer of \(N\) words of width \(w\) bytes, the CPU would spend  

\[
t_{\text{CPU}} = N \times t_{\text{copy}}
\]

where \(t_{\text{copy}}\) is the time to execute a load/store pair. With DMA, CPU time reduces to the programming overhead \(t_{\text{prog}}\) plus the interrupt handling time, yielding a speed‑up factor roughly  

\[
S \approx \frac{N \times t_{\text{copy}}}{t_{\text{prog}}+t_{\text{ISR}}}.
\]

DMA is essential for high‑bandwidth devices (disk, GPU, network) where \(N\) is large.

---

## How It Works
### Step‑by‑Step Data Flow with Decoupling
1. **Command Issue** – CPU writes a command to the device controller via either **port‑mapped I/O** (in/out instructions) or **memory‑mapped I/O** (MMIO). The controller decodes the command and sets internal state (e.g., sector number, DMA mode).  
2. **Device Activation** – Controller asserts control lines to the peripheral (e.g., asserts \(\overline{\text{WRITE}}\) on a disk). The peripheral begins its mechanical/electrical operation (seek, rotation, transmission).  
3. **Data Transfer Mode Selection** – Depending on device capabilities and driver choice, the transfer proceeds via:  
   * **Programmed I/O** – CPU loops, reading/writing the controller’s data register until the controller’s status register indicates completion.  
   * **Interrupt‑Driven I/O** – Controller raises an interrupt line when its internal buffer is full (input) or empty (output). The ISR empties/fills the buffer and may re‑arm the controller.  
   * **DMA** – CPU programs the DMA controller (source/dest address, word count, mode). The DMA controller then performs the transfer independently, asserting an interrupt only on completion.  
4. **Buffering** – In all modes, data is staged in a kernel buffer (often a **circular buffer**). For input, the device fills the buffer; for output, the consumer drains it. The buffer decouples producer/consumer rates as derived above.  
5. **Completion Signaling** – When the device finishes the requested operation (or an error occurs), it asserts an interrupt line. The interrupt controller (e.g., APIC) vectors the interrupt to the appropriate ISR.  
6. **ISR Execution** – The ISR:  
   * Saves CPU state (registers, flags).  
   * Acknowledges the interrupt to the controller (often by writing a status register).  
   * Transfers any residual data between the device’s internal FIFO and the kernel buffer.  
   * Updates bookkeeping (e.g., increments buffer pointers, wakes waiting threads).  
   * Restores CPU state and returns via `iret`.  
7. **User‑Space Notification** – If a process was blocked waiting for the I/O (e.g., via `read()`), the kernel marks it runnable; the scheduler may dispatch it immediately.

### Queuing Theory for Spooling
The spool directory acts as a FIFO queue. With arrival rate \(\lambda\) (jobs/s) and service rate \(\mu\) (jobs/s), the **expected response time** (time from submission to completion) is  

\[
R = W + \frac{1}{\mu} = \frac{1}{\mu-\lambda} + \frac{1}{\mu}.
\]

If \(\lambda\) approaches \(\mu\), response time grows hyperbolically, warning administrators to provision more spool bandwidth or increase device speed.

### Interrupt Overhead Example (UART)
A 16550 UART at 115200 baud transmits one start bit, 8 data bits, optional parity, and one stop bit → 10 bits/byte. Bit time \(t_b = 1/115200 \approx 8.68\,\mu\text{s}\). Byte time \(t_{\text{byte}} = 10 \times t_b \approx 86.8\,\mu\text{s}\).  

Assume an ISR takes \(t_{\text{ISR}} = 5\,\mu\text{s}\) (including context save/restore). Then  

\[
U_{\text{int}} = \frac{5}{86.8+5} \approx 0.054 \;(5.4\%).
\]

Thus >94% of CPU cycles remain available for other work while the UART streams data.

---

## Worked Examples
### Example 1: Buffering – Keyboard → Display
*Parameters*  
- Keyboard production rate \(R_k = 10\,\text{B/s}\) (typical slow keypress).  
- Display consumption rate \(R_d = 100\,\text{B/s}\) (fast terminal).  
- Buffer size \(B = 200\,\text{B}\).

**Step‑by‑step**  
1. Fill time: \(t_{\text{fill}} = B / R_k = 200/10 = 20\,\text{s}\).  
2. Drain time: \(t_{\text{drain}} = B / R_d = 200/100 = 2\,\text{s}\).  
3. The buffer will fill slowly (20 s) but empty quickly (2 s). After the first fill, the buffer will oscillate between near‑full and near‑empty with a period \(20+2 = 22\,\text{s}\).  
4. Average display utilization: the display is busy for \(t_{\text{drain}}/(t_{\text{fill}}+t_{\text{drain}}) = 2/22 \approx 9.1\%\) of the time; the CPU is free the rest.  
5. If the buffer were omitted, the CPU would have to wait 20 s after each keypress for the display to accept the next byte, reducing useful work to 4.8% of the time.  
**Result:** Buffering improves CPU availability from ~5% to ~91%.

### Example 2: Spooling – Print Server
*Parameters*  
- Printer speed: 10 pages/min → \(\mu_p = 10/60 = 0.1667\) pages/s.  
- Average print job: 2 pages → job service rate \(\mu = \mu_p / 2 = 0.08333\) jobs/s (5 jobs/min).  
- Job submission rate: \(\lambda = 5\) jobs/min = 0.08333 jobs/s.  
Thus \(\rho = \lambda/\mu = 1\). The system is at the stability boundary; any variance causes queue growth.

**Step‑by‑step**  
1. Compute expected queue length using the **M/M/1** formula for \(\rho < 1\). Slightly reduce \(\lambda\) to 0.075 jobs/s (4.5 jobs/min) to illustrate: \(\rho = 0.075/0.08333 = 0.9\).  
2. Expected number of jobs in system: \(L = \rho/(1-\rho) = 0.9/0.1 = 9\).  
3. Expected waiting time in queue: \(W_q = L/\lambda = 9/0.075 = 120\,\text{s}\) (2 min).  
4. Adding service time (1/μ = 12 s) gives total response time ≈ 2 min + 12 s ≈ 2 min 12 s.  
5. If the spool directory resides on a fast SSD with ample space, the only limiting factor is the printer; the CPU can submit jobs at 4.5 jobs/min without blocking.  
**Result:** Spooling decouples job submission from printing, allowing the CPU to stay productive as long as \(\rho < 1\). The example shows why provisioning a little extra printer capacity (or buffering jobs) dramatically reduces waiting time.

### Example 3: Interrupt‑Driven I/O – NIC Receiving Packets
*Parameters*  
- NIC receives Ethernet frames at 1 Gbps with average frame size 1000 bytes (including preamble, IFG).  
- Bit rate: \(1\times10^9\) bits/s → byte rate \(=125\times10^6\) B/s.  
- Frame rate: \(\lambda_f = 125\times10^6 / 1000 = 125{,}000\) frames/s.  
- Time between frames: \(t_f = 1/\lambda_f = 8\,\mu\text{s}\).  
- ISR overhead (including NIC register read, buffer copy, wakeup): \(t_{\text{ISR}} = 2\,\mu\text{s}\).

**Step‑by‑step**  
1. CPU fraction spent in ISR: \(U_{\text{int}} = t_{\text{ISR}}/(t_f + t_{\text{ISR}}) = 2/(8+2) = 0.2\) → 20% CPU utilization purely for interrupt handling.  
2. If the driver uses **NAPI** (New API) to poll the NIC when the interrupt rate exceeds a threshold, the CPU can switch to polling mode, reducing context‑switch overhead.  
3. With **jumbo frames** (9000 bytes), frame rate drops to ≈13 888 frames/s, \(t_f ≈ 72\,\mu\text{s}\), and \(U_{\text{int}} ≈ 2/(72+2) ≈ 2.7\%\).  
**Result:** Interrupt‑driven I/O is efficient when the device’s inter‑arrival time greatly exceeds ISR cost; otherwise, polling or hybrid schemes (NAPI, io_uring) are preferable.

---

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Assuming a fixed buffer size eliminates overflow** | Buffer overflow occurs when the producer’s instantaneous burst exceeds buffer capacity *plus* the consumer’s drain rate during the burst. | Data loss, security vulnerabilities (e.g., stack smashing if the buffer is in user space). |
| **Neglecting to handle `EINTR` in `read()`/`write()`** | System calls can be interrupted by a signal; they return `-1` with `errno == EINTR`. | Programs may treat a transient interrupt as a fatal error, causing early termination or lost data. |
| **Using DMA without cache‑coherency precautions** | On systems with non‑coherent DMA (or when using write‑back caches), the CPU may see stale data after DMA writes, or DMA may read stale data after CPU writes. | Corrupted buffers, hard‑to‑debug data inconsistencies. |
| **Configuring a spool directory on a filesystem with noexec or nodev** | Some spoolers need to execute filter scripts (e.g., `lp` uses `/usr/lib/cups/filter/`). | Print jobs fail silently; logs show “permission denied” despite readable spool. |
| **Believing that enabling DMA automatically maximizes throughput** | DMA controllers have limits on burst length, address alignment, and bus arbitration. Misaligned buffers force the controller into cycle‑stealing mode, halving effective bandwidth. | Observed throughput far below device spec, especially for SSDs and NVMe. |
| **Using `select()` on a large number of file descriptors without `FD_SETSIZE` increase** | `select()` uses a fixed-size bit array (typically 1024). Exceeding it leads to silent truncation. | High‑concurrency servers appear to stall; debugging shows “no events” despite active sockets. |
| **Assuming interrupt nesting is always safe** | Nesting interrupts can lead to stack overflow if the interrupt depth exceeds kernel stack size (often 8 KB–16 KB). | Kernel panic (“double fault”) under heavy interrupt load. |

---

## Exercises
### Easy
1. **Circular Buffer in C**  
   Implement a lock‑free single‑producer/single‑consumer circular buffer for bytes. Provide `buf_put(uint8_t)` and `buf_get(uint8_t *)` that return `-EAGAIN` when full/empty. Test with two pthreads: one producing at 1 MiB/s, the other consuming at 2 MiB/s; print buffer occupancy over time.

2. **Simple Spooler with `at`**  
   Create a directory `$HOME/print_spool`. Write a bash script that moves any `.ps` file dropped into the directory to `$HOME/print_spool/processed/` and submits it to `lp`. Use `inotifywait` to watch the directory and react instantly.

### Medium
1. **Interrupt‑Driven UART Driver (User‑Space Approximation)**  
   Using `/dev/ttyS0`, set the serial port to 115200 baud 8N1. Use `poll()` to wait for `POLLIN`. When data arrives, read it into a kernel‑like buffer (user space) and echo it back. Measure CPU utilization with `pidstat -p $$ 1` while generating traffic with `pv -qL 5000 < /dev/zero > /dev/ttyS0`. Compare to a busy‑loop (`read()` in a tight while) implementation.

2. **DMA‑Enabled Memory Copy with `io_uring`**  
   Write a C program that uses `io_uring_prep_read_fixed` and `io_uring_prep_write_fixed` to copy a 128 MiB file from a temporary tmpfs file to another, using a single fixed buffer registered with the ring. Verify correctness with `cmp` and report the number of submission/completion cycles needed.

### Hard
1. **Kernel Module that Programs a PCIe DMA Engine**  
   Using a simple PCIe endpoint (e.g., a Xilinx AXI DMA core exposed via VFIO), write a Linux kernel module that:  
   - Allocates a coherent DMA buffer with `dma_alloc_coherent`.  
   - Programs the DMA controller’s source/destination address and length registers via MMIO.  
   - Waits for completion using an interrupt (`request_irq`).  
   - Validates the transferred data with a known pattern.  
   Provide a Makefile and instructions to load/unload the module.

2. **Benchmarking Spooling vs. Direct Printing under Load**  
   Deploy a CUPS printer on a test machine. Use `print-bench` (or a custom script) to submit 500 print jobs of 1 page each at rates ranging from 1 to 30 jobs/min. Record average job latency with `lpstat -W completed -o`. Plot latency vs. submission rate for both direct printing (no spool) and spooling (default CUPS spool in `/var/spool/cups`). Explain the observed knee in the curve using the M/M/1 model.

---

## Linux Connection
### Subsystems and Interfaces
| Concept | Kernel Subsystem | Typical Files/Interfaces | Example Commands |
|---------|------------------|--------------------------|------------------|
| **Block I/O** | Block layer (`/dev/sd*`, `/dev/nvme*`) | Request queue, elevator (CFQ, deadline, mq‑deadline) | `iostat -x 1`, `lsblk -o NAME,ROTA,SIZE`, `hdparm -tT /dev/sda` |
| **Character I/O** | Char drivers (`/dev/tty*`, `/dev/input/*`) | `open()`, `read()`, `write()`, `ioctl()` | `stty -F /dev/ttyS0 115200`, `cat /dev/input/event0` |
| **Network I/O** | NET_RX/TX softirqs, NAPI, XDP | `/proc/net/dev`, `ethtool`, `ip link` | `ethtool -S eth0`, `watch -n1 cat /proc/net/dev` |
| **Interrupt Handling** | IRQ subsystem (`/proc/interrupts`) | `request_irq()`, `free_irq()`, `IRQF_SHARED` | `cat /proc/interrupts | grep -i usb` |
| **DMA** | DMA engine API (`dmaengine`) | `/sys/class/dma/`, `dma_alloc_coherent()` | `lspci -vv | grep -A2 -i dma`, `dmesg | grep -i dma` |
| **Spooling / Print** | CUPS (userspace) + `lp` spool directory | `/var/spool/cups`, `/etc/cups/` | `lpstat -t`, `lp -o raw file.ps` |
| **Asynchronous I/O** | `io_uring`, `aio` (POSIX), `epoll` | `io_uring_setup(2)`, `epoll_create1(2)` | `uringsrc-bench`, `perf trace -p $(pidof nginx) -e sys_enter_epoll_wait` |
| **Memory‑Mapped I/O** | MMIO via `ioremap()` | `/dev/mem` (requires root), `pci_iomap()` | `devmem2 0xfe000000 w` (careful!) |

### Runnable Demonstrations
```bash
# 1. Observe interrupt distribution for a USB keyboard
watch -n1 "grep -i usb /proc/interrupts | column -t"

# 2. Measure raw disk throughput with dd (bypassing page cache)
sudo dd if=/dev/sda of=/dev/null bs=4M count=64 iflag=direct oflag=direct status=progress

# 3. Show the effect of NCQ (Native Command Queuing) on an SSD
sudo hdparm -I /dev/sdb | grep -i "queue depth"
sudo hdparm -tT /dev/sdb   # timed reads

# 4. Use perf to count IRQ handling cycles during a network flood
sudo perf stat -e irq_vectors:irq_handler_entry,irq_vectors:irq_handler_exit \
    -r 5 -- ping -f -i 0.001 8.8.8.8   # flood ping (requires root)

# 5. Demonstrate io_uring based file copy (requires liburing)
gcc -o iocopy iocopy.c -luring
./iocopy /tmp/src.img /tmp/dst.img
```
*Sample C snippet for `io_uring` copy (compile with `-luring`):*
```c
#include <liburing.h>
#include <fcnt
