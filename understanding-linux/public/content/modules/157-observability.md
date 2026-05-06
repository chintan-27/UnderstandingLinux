---
id: 157
title: "Observability"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Observability in Linux Systems
Observability is the quantitative ability to infer a system’s internal state from its externally emitted signals. In Linux, those signals are kernel‑generated events (system calls, scheduler traces, network packets, hardware performance counters) exposed through well‑defined interfaces such as **/proc**, **/sys**, **tracepoints**, and **perf events**. The usefulness of observability hinges on three properties:

1. **Instrumentation granularity** – the smallest observable unit (e.g., a single packet, a single CPU cycle, a single socket state transition).  
2. **Filtering expressiveness** – the ability to discard irrelevant data before it overwhelms the collector (BPF for packets, ftrace filters, perf event selectors).  
3. **Low‑overhead retrieval** – the mechanism must not perturb the system being observed beyond an acceptable bound (typically < 1 % CPU overhead for perf, < 0.5 % for socket statistics via ss).

If any of these properties fails, the collected data either loses fidelity or corrupts the very behavior it aims to measure.

### Core Tools and Their Interfaces
| Tool | Primary Kernel Interface | Data Unit | Typical Filter Language |
|------|--------------------------|----------|--------------------------|
| `tcpdump` | Packet socket (`AF_PACKET`) + BPF | Ethernet frame | Berkeley Packet Filter (BPF) bytecode |
| `ss` | Netlink (`NETLINK_INET_DIAG`) | Socket entry (struct `inet_diag_msg`) | None (uses Netlink attribute matching) |
| `iproute2` (`ip`, `tc`) | Netlink (`NETLINK_ROUTE`) | Link/address/route/queue objects | Netlink attribute matching |
| `ethtool` | Ethtool ioctl (`SIOCETHTOOL`) on net device | Device registers, statistics, offload flags | None (direct ioctl) |
| `perf` | `perf_event_open()` syscall + perf events subsystem | Hardware/software event samples | Event type/config, sampling period/frequency |
| `tracing` (`ftrace`, `systemtap`, `eBPF`) | Tracepoints, kprobes, uprobes, eBPF maps | Trace records (custom structs) | FTrace filter functions, eBPF programs |

Each tool therefore maps a **kernel‑internal data structure** to a **user‑visible representation** via a well‑defined ABI. Understanding that mapping is essential for interpreting output correctly and for extending the toolchain (e.g., writing a new eBPF program).

## How It Works
### tcpdump – Packet Capture via AF_PACKET and BPF
When `tcpdump -i eth0` runs, it opens a **packet socket**:

```c
int sock = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));
```

The socket is bound to the interface `eth0` via `setsockopt(sock, SOL_SOCKET, SO_BINDTODEVICE, "eth0", 5)`.  
All incoming frames are delivered to the socket’s receive queue. Before copying data to user space, the kernel runs the attached **Berkeley Packet Filter (BPF)** program. A BPF program is a sequence of 64‑bit instructions that performs a pure‑function test on each packet; if the test returns non‑zero, the packet is kept, otherwise it is dropped.

**Example filter** – capture only TCP SYN packets destined for port 443:

```
tcp[tcpflags] & (tcp-syn) != 0 && dst port 443
```

The kernel translates this pseudo‑code into BPF bytecode (see `tcpdump -d`). The overhead of BPF is O(number of instructions) per packet, typically < 200 ns on modern CPUs.

If `-s 0` (snaplen) is omitted, the kernel copies only the first *snaplen* bytes of each frame; setting snaplen to the MTU (e.g., 1500) avoids unnecessary copying while preserving full packet headers.

### ss – Querying Socket State via Netlink
`ss` communicates with the kernel over the **NETLINK_INET_DIAG** protocol. The user sends a `struct nlmsghdr` containing a `struct inet_diag_req_v2` that specifies:

- `idiag_family` (AF_INET or AF_INET6)  
- `idiag_states` (bitmask of TCP states, e.g., `TCPF_ESTABLISHED|TCPF_TIME_WAIT`)  
- `idiag_ext` (requested extensions, e.g., `INET_DIAG_MEMINFO` for memory usage)

The kernel replies with a series of `nlmsg` messages, each holding an `inet_diag_msg` followed by the requested attribute TLVs (time, retransmits, cwnd, etc.). Because Netlink is a **socket‑based, message‑passing** interface, the overhead is proportional to the number of matching sockets, not to total system load.

A typical request to dump all TCP sockets:

```bash
ss -t -a -n -p
```

 translates to:

- `-t`: `idiag_family = AF_INET` (TCP)  
- `-a`: `idiag_states = TCPF_ALL`  
- `-n`: disables symbolic resolution (no `/etc/services` lookup)  
- `-p`: requests the `INET_DIAG_INFO` attribute that carries the owning PID/fd.

### iproute2 – Manipulating Network Objects via NETLINK_ROUTE
The `ip` and `tc` binaries are thin wrappers around **NETLINK_ROUTE**. To add an address, the user builds a Netlink message:

```c
struct {
    struct nlmsghdr n;
    struct ifaddrmsg ifa;
    char buf[256];
} req;

req.n.nlmsg_len = NLMSG_LENGTH(sizeof(struct ifaddrmsg));
req.n.nlmsg_type = RTM_NEWADDR;
req.n.nlmsg_flags = NLM_F_REQUEST | NLM_F_ACK | NLM_F_CREATE | NLM_F_EXCL;
req.ifa.ifa_family = AF_INET;
req.ifa.ifa_prefixlen = 24;   /* /24 */
req.ifa.ifa_index = if_nametoindex("eth0");
snprintf(req.buf, sizeof(req.buf), "%s", "192.168.1.100");
if (send(fd, &req, req.n.nlmsg_len, 0) < 0) … ;
```

The kernel validates the request against routing tables, updates the `inetdev` structure, and sends an acknowledgment (`NLMSG_ERROR` with error=0) or a negative acknowledgment on failure.

### ethtool – Device‑Specific ioctl Interface
`ethtool` uses the **SIOCETHTOOL** ioctl on a net device file descriptor. The ioctl command encodes a struct `ethtool_cmd` (or derived structs like `ethtool_drvinfo`, `ethtool_value`). Example to retrieve driver info:

```c
struct ethtool_drvinfo info = { .cmd = ETHTOOL_GDRVINFO };
if (ioctl(fd, SIOCETHTOOL, &info) < 0) perror("ethtool");
printf("driver: %s\n", info.driver);
```

The ioctl copies data from the device’s private data structure (e.g., `struct net_device`) into user space. Because it is a synchronous syscall, the overhead is essentially the cost of a context switch plus the time the driver spends gathering the requested statistics (typically a few microseconds).

### perf – Hardware Performance Counters via perf_event_open
The `perf` subsystem exposes **Performance Monitoring Units (PMUs)** through the `perf_event_open()` syscall. The call takes a `struct perf_event_attr` that defines:

- `type`: `PERF_TYPE_HARDWARE`, `PERF_TYPE_SOFTWARE`, `PERF_TYPE_TRACEPOINT`, `PERF_TYPE_HW_CACHE`, or `PERF_TYPE_RAW`.  
- `config`: event selector (e.g., `PERF_COUNT_HW_CPU_CYCLES`).  
- `sample_period` or `sample_frequency`: how often to generate a sample.  
- `read_format`: what fields to return (value, time, id, etc.).  
- `disabled`: start/stop flag.

Kernel creates a file descriptor referencing the event; reading from it returns a `struct perf_event_header` followed by the sample data. When `sample_period` is set, the kernel programs the hardware counter to trigger an interrupt after that many events, executing the **perf interrupt handler** which copies the sample into a per‑CPU buffer and wakes the reader.

**Derivation of sampling overhead**:  
If a CPU runs at 3 GHz and we sample every 10⁶ cycles (`sample_period = 1e6`), the interrupt rate is 3000 Hz. Assuming each interrupt costs ~5 µs (handler + context switch), overhead ≈ 3000 × 5 µs = 15 ms/s ≈ 1.5 % CPU. Choosing a larger period reduces overhead linearly.

### Tracing – ftrace, kprobes, and eBPF
**ftrace** maintains a ring buffer per CPU. When a tracepoint (e.g., `sched:sched_switch`) is declared with `TRACE_EVENT(...)`, the kernel generates a call to `__tracepoint_sched_sched_switch` at compile time. At runtime, if the tracepoint is enabled, the macro expands to a call to `trace_event_buffer_reserve()` which reserves space in the per‑cpu buffer, writes the struct fields, and commits. The overhead of an enabled tracepoint is typically ~200 ns (just a few atomic ops and a memory write).

**eBPF** extends this by allowing user‑supplied programs (in a restricted C-like language) to be attached to tracepoints, kprobes, or socket filters. The verifier ensures the program cannot loop infinitely or access invalid memory; the JIT then compiles it to native code. Execution cost is the cost of the native instructions plus the overhead of the attachment point (usually a few dozen nanoseconds).

---

## Worked Examples
### Example 1: Capturing HTTP GET Requests with tcpdump – Step‑by‑Step
Goal: capture the first 50 HTTP GET packets on `eth0`, store them in `http.pcapng`, and display a short summary.

1. **Choose snaplen** – HTTP headers rarely exceed 200 B; set `-s 256` to be safe while minimizing copy overhead.  
2. **BPF filter** – HTTP uses TCP, destination port 80 (or source port 80 for responses). To see only requests: `tcp[((tcp[12]>>2)&0x3c):4] = 0x50474520` (hex for “GET ”) after the TCP header. Simpler: `tcp port 80 and tcp[((tcp[12]>>2)&0x3c):4] = 0x50474520`.  
3. **Command**:

```bash
tcpdump -i eth0 -n -vv -s 256 -c 50 -w http.pcapng \
    'tcp port 80 and tcp[((tcp[12]>>2)&0x3c):4] = 0x50474520'
```

- `-n`: no DNS/Port name resolution (avoids extra system calls).  
- `-vv`: verbose (prints TTL, IP ID, TCP seq/ack).  
- `-c 50`: stop after 50 packets.  
- `-w`: write raw packets in pcapng format (preserves original bytes).  

**Verification** – after capture, run:

```bash
tcpdump -r http.pcapng -n -q
```

You should see lines like `12.34.56.78.12345 > 98.76.54.32.80: Flags [P.], seq 1:513, ack 1, win 29200, length 512: HTTP: GET /index.html HTTP/1.1`.

### Example 2: Measuring L1 Cache Miss Rate with perf
Goal: compute the ratio `cache-misses / cache-references` for a tight loop that walks a large array.

1. **Write test program** (`cache_test.c`):

```c
#include <stdlib.h>
#include <stdio.h>
#define N (1024*1024*64)   // 64 MiB
static unsigned char *buf;

int main(void) {
    buf = aligned_alloc(64, N);
    for (size_t i = 0; i < N; i += 64)   // stride = cache line
        buf[i] = (unsigned char)i;
    free(buf);
    return 0;
}
```

2. **Run perf** collecting both events:

```bash
perf stat -e cache-references,cache-misses ./cache_test
```

Sample output (numbers will vary):

```
 Performance counter stats for './cache_test':
        12,345,678      cache-references
          987,654      cache-misses
              8.00%  cache-misses%
```

3. **Interpretation** – The miss rate is ~8 %. If we increase stride to 4 KiB (page size), we expect a higher miss rate because each access hits a new page; we can test:

```bash
perf stat -e cache-references,cache-misses ./cache_test  # after modifying stride to 4096
```

Observe the miss rate climb, demonstrating the memory hierarchy effect.

### Example 3: Adding a Secondary IP Address with iproute2 and Verifying via /proc
Goal: assign `192.168.10.50/24` to `eth0` as a secondary address and confirm it appears in `/proc/net/if_inet6` (IPv4 uses `/proc/net/tcp`? Actually IPv4 addresses are in `/proc/net/dev`? We'll use `ip -4 addr show`).

1. **Add address**:

```bash
sudo ip addr add 192.168.10.50/24 dev eth0 label eth0:1
```

- `label` creates an alias interface (`eth0:1`) for readability; the kernel still treats it as the same netdevice.  

2. **Verify**:

```bash
ip -4 addr show dev eth0
```

Expected output snippet:

```
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0
       valid_lft forever preferred_lft forever
    inet 192.168.10.50/24 brd 192.168.10.255 scope global secondary eth0:1
       valid_lft forever preferred_lft forever
```

3. **Check via proc** (optional):

```bash
grep :10. /proc/net/tcp
```

Each line shows the local address in hex little‑endian; `10.168.192.0a` corresponds to `192.168.10.50`.  

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Using `-s 0` with tcpdump on a 10 GbE link** | `-s 0` forces snaplen = 65535, causing the kernel to copy the entire frame (up to 9 KB) for every packet. | On high‑speed links, the copy cost can dominate CPU usage, leading to dropped packets and distorted latency measurements. |
| **Running `ss -p` as an unprivileged user** | The `pid` and `fd` fields require `CAP_SYS_PTRACE` or ownership of the socket. Without it, `ss` shows `-` for PID/FD. | You may incorrectly assume a service is not bound to a port, missing a hidden listener or misdiagnosing a permission issue. |
| **Changing Ethernet speed with `ethtool -s eth0 speed 1000 duplex full` without checking link negotiation** | If the partner port is set to autonegotiate off, forcing speed/duplex creates a mismatch, resulting in constant collisions or link loss. | The interface may appear “up” (`ip link show`) but experience massive packet loss, making troubleshooting frustrating. |
| **Collecting perf samples with a period of 1 (`sample_period = 1`)** | This triggers an interrupt after every single event, essentially turning the CPU into a tracing probe. | Overhead can exceed 50 % and perturb the very behavior you aim to measure (e.g., cache miss rate becomes meaningless). |
| **Attaching an eBPF program to a tracepoint without checking its return value** | If the program violates the verifier (e.g., out‑of‑bounds map access), the load fails silently if you ignore `-` return code. | You may think tracing is active while no data is being collected, leading to blind spots in debugging. |
| **Assuming `ip route get 8.8.8.8` shows the *outgoing* interface** | The command resolves the route using the current routing table *and* the source address selection rules; if multiple matching routes exist, the kernel may prefer a different source. | Misinterpretation can cause you to believe traffic leaves via `eth0` when it actually uses `eth1`, leading to incorrect firewall or NAT rules. |

---

## Exercises
### Easy
1. **Socket inspection** – Run `ss -t -a -n -p` and count how many TCP sockets are in `ESTABLISHED` state. Report the number and the PID of the process owning the socket with the highest local port.  
2. **Interface statistics** – Use `ethtool -S eth0` to retrieve the total number of received packets (`rx_packets`) and transmitted packets (`tx_packets`). Compute the ratio `rx_packets / (rx_packets + tx_packets)` and interpret whether the interface is receive‑heavy or transmit‑heavy.  

### Medium
3. **BPF filter crafting** – Write a tcpdump command that captures only TCP packets where the payload length > 0 and the SYN flag is *not* set. Explain the BPF expression you used (`tcp[13] & 0x02 == 0 && tcp[((tcp[12]>>2)&0x3c):4] != 0`).  
4. **perf event programming** – Write a C program that opens a perf event for `PERF_COUNT_HW_CACHE_MISS` (L1 data cache miss) on the current process, reads the count after executing a tight loop that increments a volatile variable 10⁸ times, prints the miss count, and closes the fd. Compile and run it; compare the miss count to the loop iteration count to estimate miss probability.  

### Hard
5. **Custom eBPF tracepoint** – Using `bpftool` or `bpftrace`, attach an eBPF program to the `sched:sched_switch` tracepoint that timestamps each context switch and stores the delta in a per‑CPU histogram (histogram of switch latency). After running a workload (e.g., `stress --cpu 4` for 10 s), read the histogram and report the 95th‑percentile switch latency. Explain how you ensured the program passed the verifier (bounded loops, map size limits).  
6. **Netlink address manipulation** – Implement a small C program that uses `netlink` (via `libmnl` or raw `socket`) to add an IPv6 address `2001:db8::1/64` to `eth0` and then immediately delete it. Verify success by checking the return codes of the `NLMSG_ERROR` messages. Discuss the need for `NLM_F_ACK` and how you would handle a `NLM_F_ECHO` to retrieve the generated message.  

---

## Linux Connection
Observability in Linux is not a collection of isolated commands; it is the **manifestation of kernel subsystems that expose internal state through well‑defined interfaces**. Below is a mapping from each tool to the subsystem that supplies its data, the exact file‑ or socket‑paths involved, and a concrete command you can run on a typical Ubuntu/Debian system.

| Tool | Kernel Subsystem | Interface | Representative Path / Socket | Example Command (run as root unless noted) |
|------|------------------|-----------|------------------------------|--------------------------------------------|
| `tcpdump` | Packet sockets (`AF_PACKET`) + BPF | `socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL))` | `/dev/null` (the socket is abstract; no file) | `tcpdump -i eth0 -n -c 5 -w - | tcpdump -r - -nn` |
| `ss` | Netlink – `NETLINK_INET_DIAG` | Netlink socket (`NETLINK_INET_DIAG`) | `ss` opens a Netlink FD internally; you can see it with `lsof -p $(pidof ss)` | `ss -t -a -n -p state ESTABLISHED` |
| `iproute2` (`ip`, `tc`) | Netlink – `NETLINK_ROUTE` | Netlink socket (`NETLINK_ROUTE`) | Same as above; kernel replies via the same socket | `ip -4 addr show dev eth0` |
| `ethtool` | Ethtool ioctl (`SIOCETHTOOL`) on net device | Character device `/sys/class/net/eth0/device` (via ioctl) | No file path; ioctl on `int fd = socket(AF_INET, SOCK_DGRAM, 0);` | `ethtool -i eth0` |
| `perf` | `perf_events` subsystem (via `perf_event_open()` syscall) | perf event FD (anonymous in‑kernel buffer) | `/proc/<pid>/fd/<n>` after opening | `perf stat -e cycles ./a.out` |
| `tracing` (`ftrace`) | Tracepoint/ftrace buffer | Debug filesystem trace files | `/sys/kernel/debug/tracing/trace`, `/sys/kernel/debug/tracing/events/` | `echo 1 > /sys/kernel/debug/tracing/events/sched/sched_switch/enable` |
| `tracing` (`eBPF`) | eBPF maps + verifier + JIT | BPF filesystem (`/sys/fs/bpf/`) and user‑space FD returned by `bpf()` | `bpftool prog show` / `bpftrace -e 'tracepoint:sched:sched_switch { @ = hist(arg0); }'` | `bpftrace -e 'tracepoint:sched:sched_switch { @ = hist((unsigned long long)args->prev_prio - args->next_prio); }'` |

**Key take‑aways:**

- **Netlink** is the workhorse for configuration and diagnostics (`ip`, `ss`, `tc`). It is asynchronous, message‑based, and respects namespace boundaries (you can run `ip netns exec ns0 ip addr` to see a container’s view).  
- **AF_PACKET** gives raw access to NIC frames; it bypasses the normal IP stack, which is why `tcpdump` can see packets that `iptables` never touches.  
- **Ethtool ioctls** are device‑specific; they expose driver capabilities (offload, coalescing, ring sizes) that are not available via Netlink.  
- **Perf** and **ftrace/eBPF** both rely on per‑CPU buffers to achieve low overhead; the size of those buffers (`/sys/kernel/debug/tracing/buffer_size_kb`, `/proc/sys/kernel/perf_event_max_stack`) directly influences how much data can be captured before overflow.  
- All of these interfaces respect **Linux namespaces** (net, pid, user, mnt). Running a tool inside a container (`docker exec -it <container> ss -t -a`) shows only the resources visible to that namespace, a crucial fact for cloud‑native observability.

---

## Why This Matters
Observability turns a black‑box Linux system into a set of **measurable, queryable signals**. By understanding *how* each tool extracts data—whether through a packet socket’s BPF filter, a Netlink request‑reply exchange, a perf event’s hardware counter, or a tracepoint’s per‑CPU buffer—you gain two essential advantages:

1. **Accuracy** – You can predict and control the probing overhead, ensuring that the act of observation does not invalidate the measurement (e.g., choosing an appropriate `sample_period` for perf, or a sane snaplen for tcpdump).  
2. **Extensibility** – When the built‑in tools fall short, you can plug directly into the same kernel interfaces: write a new eBPF program attached to a tracepoint, craft a custom Netlink message to configure a QoS queue, or open a perf event with a raw config to measure a niche CPU event.  

Mastery of these mechanisms lets you move from “I ran a command and saw a number” to “I know *why* that number appeared, how trustworthy it is, and how to improve the system that produced it.” That shift is the foundation of performance engineering, reliable incident response, and secure, efficient Linux‑based services.
