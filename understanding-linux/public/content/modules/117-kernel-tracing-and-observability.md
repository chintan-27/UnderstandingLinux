---
id: 117
title: "Kernel tracing and observability"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
Kernel tracing and observability are the set of interfaces that let user‑space inspect the internal state of the Linux kernel without recompiling or rebooting it. The need arises because the kernel executes in a privileged mode where traditional debugging (breakpoints, printf) is infeasible; any observation must be done through mechanisms the kernel itself exposes.

The four primary mechanisms differ in **where** they inject observation points, **how** they store data, and **what** they are optimized for:

| Mechanism | Injection point | Data storage | Typical use case | Overhead |
|-----------|----------------|--------------|------------------|----------|
| **ftrace** | Dynamic function entry/exit via `-pg` instrumentation (mcount) or kprobe‑style hooks | Per‑CPU ring buffer (`trace_buffer`) | Function‑level tracing, latency histograms, scheduler events | Low (≈ 1 % CPU when enabled) |
| **Tracepoints** | Static `TRACE_EVENT` macros compiled into kernel source | Same ftrace buffer (but filtered per‑event) | Fixed‑event auditing (syscalls, interrupts, block I/O) | Very low (≈ 0.1 % when enabled) |
| **Perf events** | Hardware performance counters (PMU) or software counters (via `perf_event_open`) | Per‑CPU counter arrays, optional mmap’d sample buffer | CPU cycles, cache misses, branch mispredictions, custom software counters | Determined by sampling rate; can be made negligible |
| **eBPF** | User‑supplied bytecode loaded into kernel via `bpf()` syscall, attached to hooks (kprobe, tracepoint, XDP, socket, etc.) | BPF maps (hash, array, perf ring buffer, etc.) | Programmable observation: packet filtering, security auditing, custom metrics | Overhead proportional to program complexity; JIT‑compiled to native code |

Each mechanism satisfies a different **observability trade‑off**: ftrace gives fine‑grained call‑graph data with minimal code change; tracepoints provide stable, low‑overhead event names; perf events expose hardware‑level metrics; eBPF lets you write arbitrary kernel‑side logic without leaving user space.

## How It Works
### Ftrace Internals
When the kernel is built with `CONFIG_FUNCTION_TRACER`, each function prologue contains a call to `mcount()` (or `__trace_function()`). At boot, ftrace patches these calls to either a nop or a handler that writes a record into a per‑CPU ring buffer.

A ftrace record consists of:
```c
struct trace_entry {
    u32  type;        // enum trace_event_type
    u32  len;         // size of record
    unsigned long ip; // instruction pointer (return address)
    u32  flags;
    u64  timestamp;   // local clock (usually sched_clock)
    /* event‑specific payload follows */
};
```
The per‑CPU buffer is a **power‑of‑two sized ring** (`size = 2^n` pages). Let `B` be the buffer size in bytes and `R` the record size. The maximum number of records storable before wrap‑around is:
$$ N_{max} = \left\lfloor \frac{B}{R} \right\rfloor $$
If the producer rate `λ` (records/s) exceeds the consumer rate `μ` (records/s drained by user‑space), the buffer overruns after:
$$ t_{overrun} = \frac{B}{λ - μ} $$
Choosing `B` large enough (e.g., 4 MiB per CPU) makes overruns rare for typical tracing workloads.

### Tracepoints
A tracepoint is defined with:
```c
TRACE_EVENT(sys_enter,
    TP_PROTO(const char __user *filename, int flags, umode_t mode),
    TP_ARGS(filename, flags, mode),
    TP_STRUCT__entry(
        __string(filename, filename)
        __field(int, flags)
        __field(umode_t, mode)
    ),
    TP_fast_assign(
        __assign_str(filename, filename);
        __entry->flags = flags;
        __entry->mode = mode;
    ),
    TP_printk("fname=%s flags=%d mode=%o",
              __get_str(filename), __entry->flags, __entry->mode)
);
```
The macro expands to a static inline function `trace_sys_enter(...)` that, when the kernel is built with `CONFIG_TRACEPOINTS`, emits a call to that function at the call‑site. The function checks a per‑event enabled flag (a single byte) before writing to the ftrace buffer—hence the negligible overhead when disabled.

### Perf Events
The `perf_event_open()` syscall creates a file descriptor that references a **performance event**. The kernel maintains per‑CPU counters (`struct perf_event`) that can be:
* **Hardware**: driven by the CPU’s Performance Monitoring Unit (PMU). Each event selects a counter and a unit mask (UMASK) via the `config` field.
* **Software**: maintained by the kernel (e.g., `PERF_COUNT_SW_PAGE_FAULTS`, `PERF_COUNT_SW_CONTEXT_SWITCHES`).

When sampling is enabled (`sample_period` > 0), the kernel uses the **PMU interrupt** to interrupt execution, capture a sample (instruction pointer, registers, call chain), and write it to a **mmap’d circular buffer** (size `2^npages`). The interrupt rate is:
$$ f_{int} = \frac{CPU\_freq}{sample\_period} $$
For a 3 GHz CPU and `sample_period = 100000` cycles, `f_int ≈ 30 kHz`, yielding ~30 k samples/s per CPU.

### eBPF Runtime
An eBPF program is a sequence of 64‑bit instructions verified for safety (no loops without bounded depth, no out‑of‑bounds memory access). After verification, the kernel either:
* **Interprets** the bytecode (slow path), or
* **JIT‑compiles** it to native machine code (fast path, via `CONFIG_BPF_JIT`).

The program accesses kernel data through **helpers** (e.g., `bpf_map_lookup_elem`, `bpf_probe_read_kernel`) and stores results in **BPF maps**. A hash map with `n` buckets and load factor `α` has expected lookup cost:
$$ O(1 + α) $$
Maps are backed by per‑CPU arrays when appropriate to avoid atomic contention.

## Worked Examples
### Example 1: Ftrace – Measuring Interrupt Latency
Goal: Compute the worst‑case latency between a timer interrupt firing and the handler’s first instruction.

1. Enable the `irq` tracer:
   ```bash
   echo irq > /sys/kernel/debug/tracing/current_tracer
   ```
2. Set a sufficiently large buffer (per‑CPU):
   ```bash
   echo 8 > /sys/kernel/debug/tracing/buffer_size_kb   # 8 MiB per CPU
   ```
3. Start recording:
   ```bash
   echo 1 > /sys/kernel/debug/tracing/tracing_on
   ```
4. Generate a known interrupt (e.g., via `ping`):
   ```bash
   ping -i 0.001 127.0.0.1 &   # 1 kHz ICMP echo requests
   sleep 5
   kill %1
   ```
5. Stop recording and extract the trace:
   ```bash
   echo 0 > /sys/kernel/debug/tracing/tracing_on
   cat /sys/kernel/debug/tracing/trace > irq_latency.txt
   ```
6. Analyze: each line contains a timestamp (`usecs`) and the function name. The latency for an IRQ entry is:
   $$ L = t_{handler\_entry} - t_{irq\_entry} $$
   Using `awk` we can compute the 99th‑percentile:
   ```bash
   awk '/irq_enter/ {tenter=$2} /handler/ {print $2 - tenter}' irq_latency.txt \
       | sort -n | awk '{a[NR]=$1} END{print a[int(NR*0.99)]}'
   ```
   On an idle x86_64 system this typically yields **L₉₉ ≈ 5‑10 µs**; under load it can rise to **> 30 µs**, demonstrating where real‑time tuning is needed.

### Example 2: Tracepoints – Counting `sys_open` Invocations
Goal: Count how many times `sys_open` is called per second by a workload.

1. Ensure tracepoints are enabled:
   ```bash
   echo 1 > /sys/kernel/debug/tracing/events/syscalls/sys_enter_open/enable
   ```
2. Open the trace pipe for consumption:
   ```bash
   cat /sys/kernel/debug/tracing/trace_pipe &
   ```
3. Run a workload (e.g., `find /usr -type f -exec cat {} \;`):
   ```bash
   timeout 10 find /usr -type f -exec cat {} \; >/dev/null
   ```
4. Stop the consumer and count lines:
   ```bash
   kill %1   # stops cat trace_pipe
   wc -l < /tmp/trace_pipe.out   # hypothetical file; in practice pipe output is counted live
   ```
   Suppose we observed **12 345** openings in 10 s → rate **λ = 1 234.5 open/s**.
   The tracepoint adds roughly **≈ 150 ns** per event (measured via `perf stat -e tracepoint:syscalls/sys_enter_open`).

### Example 3: eBPF – Tracking TCP Retransmissions per Destination IP
Goal: Maintain a per‑destination‑IP counter of TCP retransmissions using an eBPF hash map.

**eBPF C program (`retransmit.c`):**
```c
/* SPDX-License-Identifier: GPL */
#include <linux/bpf.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <bpf/bpf_helpers.h>

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 65536);
    __type(key, __u32);   /* IPv4 dst */
    __type(value, __u64); /* retransmit count */
} retransmits SEC(".maps");

SEC("tracepoint/tcp/tcp_retransmit_skb")
int handle_retransmit(struct trace_event_raw_tcp *ctx)
{
    __u32 daddr = ctx->__data_loc_ipv4_dst ? 
                  ((struct iphdr *)((unsigned long)ctx + ctx->__data_loc_ipv4_dst))->daddr : 0;
    __u64 *cnt = bpf_map_lookup_elem(&retransmits, &daddr);
    if (cnt) {
        __u64 new = *cnt + 1;
        bpf_map_update_elem(&retransmits, &daddr, &new, BPF_ANY);
    }
    return 0;
}

char _license[] SEC("license") = "GPL";
```
Compile and load:
```bash
clang -O2 -target bpf -c retransmit.c -o retransmit.o
sudo bpftool prog load retransmit.o /sys/fs/bpf/retransmit type tracepoint \
    name tcp_retransmit_skb
sudo bpftool map pin name retransmits /sys/fs/bpf/retransmits_map
```
Attach to the tracepoint (already done by `bpftool prog load` with type `tracepoint`).  
Read the map periodically:
```bash
while true; do
    sudo bpftool map dump name retransmits_map | \
        awk '{print $1, $2}' | sort -nrk2 | head -5
    sleep 1
done
```
Output shows the top‑5 destination IPs with retransmit counts, enabling quick identification of problematic flows.

## Common Mistakes
| Mistake | Why it’s wrong | Consequence |
|---------|----------------|-------------|
| **Leaving ftrace buffer size at default (1 MiB) while tracing high‑frequency events** | The buffer fills quickly; overrun drops oldest events, biasing analysis toward recent activity. | Missed early‑phase bugs; inaccurate latency histograms. |
| **Attaching an eBPF program to a kprobe on a function that may be optimized away (e.g., inline)** | The kernel may inline the function, removing the probe point; the kprobe then attaches to the prologue of the caller, causing incorrect context. | Program sees wrong parameters or never fires, leading to false negatives. |
| **Using perf’s `sample_period` without converting to CPU cycles** | `sample_period` expects cycles; supplying a time‑based value yields either massive overhead (if too small) or no samples (if too large). | Either system stall due to interrupt flood, or blind performance measurement. |
| **Assuming tracepoint IDs are stable across kernel versions** | Tracepoints can be added, removed, or renumbered; relying on a numeric ID from `/sys/kernel/debug/tracing/available_events` breaks when the kernel is upgraded. | Scripts silently stop collecting data after a kernel update. |
| **Not pinning BPF maps before program unload** | If a map is not pinned (`bpftool map pin`), unloading the program also removes the map, losing accumulated data. | Inability to retrieve long‑term statistics after program update or rollback. |

## Exercises
### Easy
1. **Ftrace function graph**: Enable the `function_graph` tracer, set buffer to 4 MiB, run `ls -l /usr/bin | head -5`, then disable and display the last 20 lines of the trace. Explain why the graph shows both entry and exit timestamps.
2. **Tracepoint syscall count**: Enable `syscalls/sys_enter_read` and `syscalls/sys_exit_read`. Run a program that reads from `/dev/zero` for 5 seconds and compute the average read size from the timestamps and returned counts.

### Medium
3. **Perf hardware counters**: Use `perf stat -e cycles,instructions,cache-references,cache-misses` to measure the CPI (cycles per instruction) of `ffmpeg -i input.mp4 -f null -`. Derive CPI from the collected numbers and discuss what a CPI > 1 indicates.
4. **eBPF XDP drop**: Write an XDP program that drops packets destined to port 8080. Load it on `eth0` with `ip link set dev eth0 xdp obj xdp_drop.o sec xdp`. Verify with `tcpdump` that packets to port 8080 no longer appear.

### Hard
5. **Combined ftrace + perf**: Design an experiment to correlate scheduler latency (ftrace `sched_wakeup`) with CPU stall cycles (perf `stalled-cycles-frontend`). Outline the steps to synchronize timestamps, the required buffer sizes, and a method to compute the Pearson correlation coefficient from the collected data.
6. **Dynamic eBPF map resizing**: Implement an eBPF program that uses an LRU hash map (`BPF_MAP_TYPE_LRU_HASH`) to track flow statistics. When the map reaches 90 % occupancy, trigger a userspace notification via `bpf_perf_event_output` to flush and reset the map. Provide the userspace daemon that receives the notifications and performs the reset.

## Linux Connection
- **Ftrace source**: `kernel/trace/` – core files `trace.c`, `trace_output.c`, `trace_events.c`. The ring buffer implementation lives in `kernel/trace/ring_buffer.c`.
- **Tracepoint definitions**: Scattered throughout the kernel; e.g., `include/trace/events/sched.h` for scheduler tracepoints, `include/trace/events/syscalls.h` for syscalls.
- **Perf events subsystem**: `kernel/events/` – `core.c` (generic event handling), `perf_cpu.c` (per‑CPU context), `perf_sys.c` (syscall interface). The syscall wrapper is `sys_perf_event_open` in `kernel/events/syscalls.c`.
- **eBPF subsystem**: `kernel/bpf/` – `core.c` (verifier, JIT), `helpers.c` (BPF helper functions), `map.c` (map implementations). User‑space tools:
  * `bpftool` – `/usr/sbin/bpftool` (part of `linux-tools` package)
  * `tc` – for attaching eBPF to networking devices (`tc filter add dev eth0 ingress bpf da obj prog.o sec foo`)
  * `ip link` – for XDP (`ip link set dev eth0 xdp obj prog.o sec xdp`)
- **Sample commands to explore kernel config**:
  ```bash
  grep -E 'CONFIG_FUNCTION_TRACER|CONFIG_TRACEPOINTS|CONFIG_PERF_EVENTS|CONFIG_BPF' /boot/config-$(uname -r)
  ```
- **Reading ftrace buffer directly** (bypassing trace-cmd):
  ```bash
  sudo cat /sys/kernel/debug/tracing/trace   # raw ASCII
  sudo cat /sys/kernel/debug/tracing/trace.bin | od -t x1   # binary raw
  ```
- **Perf mmap sample layout**: The sample buffer begins with a `perf_event_header` followed by an optional `perf_sample_id` and then the raw sample data (IP, TID, CPU, period, etc.). The header structure is defined in `include/linux/perf_event.h`.

## Why This Matters
Mastering these tracing mechanisms transforms kernel development from guesswork into an empirical science. Ftrace gives you the **call‑graph** needed to understand *why* a function is taking time; tracepoints provide **stable, low‑overhead event names** for longitudinal monitoring; perf events expose the **hardware‑level cost** (cycles, stalls, cache misses) that explains *how* the CPU spends its time; eBPF lets you **program arbitrary observations**—from packet filtering to custom security audits—without leaving user space or recompiling the kernel.  

Together they form a layered observability stack: start with coarse, always‑on counters (perf), drill into specific events (tracepoints), inspect the exact code paths (ftrace), and finally deploy programmable sensors (eBPF) for production‑grade monitoring. The ability to correlate data across layers—e.g., linking a spike in cache‑misses (perf) to a particular scheduler latency spike (ftrace) and then validating it with an eBPF‑generated histogram—is what separates superficial debugging from deep performance optimization and reliable systems engineering. This lesson equips you to wield each tool with an understanding of its internal mechanics, avoiding common pitfalls and enabling you to design experiments that yield quantitative, actionable insights into the Linux kernel’s behavior.
