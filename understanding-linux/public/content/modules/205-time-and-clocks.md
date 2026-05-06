---
id: 205
title: "Time and clocks"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Monotonic vs. Wall Clocks – First Principles
A **clocksource** in the Linux kernel is a hardware counter that increments at a fixed frequency (e.g., the Time‑Stamp Counter (TSC) at the CPU core rate, HPET at ~14 MHz, or the ACPI Power Management timer). The kernel converts raw cycles to nanoseconds using a fixed‑point multiplier (`mult`) and shift (`shift`):
$$
\text{ns} = \frac{\text{cycles} \times \text{mult}}{2^{\text{shift}}}
$$
A **monotonic clock** is derived directly from this counter; the kernel guarantees it never decreases by applying only *forward* corrections (e.g., when the TSC is detected to go backwards due to CPU migration, the kernel adds the missed cycles). Consequently, `CLOCK_MONOTONIC` represents **elapsed time since an arbitrary point** (usually boot) and is suitable for measuring intervals, timeouts, and RTT.

A **wall clock** (`CLOCK_REALTIME`) must track **Coordinated Universal Time (UTC)**, which is subject to human‑made adjustments: leap seconds, daylight‑saving changes, and explicit admin sets via `settimeofday()` or `clock_settime()`. The kernel maintains an offset `wall_to_monotonic` such that:
$$
\text{wall\_time} = \text{monotonic\_time} + \text{wall\_to\_monotonic}
$$
When the admin changes the wall clock, only this offset is altered; the monotonic counter keeps ticking unchanged. This asymmetry is why wall clocks can jump backward or forward, while monotonic clocks cannot.

### Why Synchronization Is Needed
Distributed systems require a *common notion of time* to order events, expire leases, and correlate logs. If two nodes drift apart, a timeout that is valid on one may expire too early or too late on the other, causing spurious retries or missed deadlines. **Drift** arises because each clocksource’s frequency deviates from its nominal value (temperature, voltage, aging). The typical drift of a quartz RTC is ±20 ppm → ±1.7 s/day; a TSC can drift more when CPU frequency scaling is active. Synchronization protocols (NTP, PTE) continuously measure the offset and frequency error and apply *slews* (tiny adjustments via `adjtime()`) rather than steps, preserving monotonicity where possible.

## How It Works
### From Hardware Counter to Time Values
1. **Capture cycles** – the kernel reads the current value of the selected clocksource (e.g., `rdtsc` for TSC).  
2. **Convert to nanoseconds** – apply the clocksource‑specific `mult`/`shift` pair.  
3. **Apply offsets** – for `CLOCK_REALTIME` add `wall_to_monotonic`; for `CLOCK_BOOTTIME` add suspended time; for `CLOCK_TAI` add TAI‑UTC offset.

The **vdso** (virtual dynamic shared object) exposes `clock_gettime()` as a fast userspace call that avoids a trap into the kernel for most clocks.

### TCP Timestamps (RFC 1323)
The TCP Timestamp Option (TS) carries two 32‑bit fields:
- **TSval** – sender’s timestamp clock value.
- **TSecr** – echo receiver’s TSval (valid only when the ACK flag is set).

The timestamp clock increments roughly every **1 ms** (granularity configurable via `TCP_TIMESTAMP`). Because it is 32‑bit, it wraps after:
$$
2^{32} \text{ ticks} \approx 49.7 \text{ days} \quad (\text{at 1 kHz})
$$
Senders compute RTT as:
$$
\text{RTT} = \text{now}_{\text{TSval}} - \text{TSecr}_{\text{echo}}
$$
where `now_TSval` is the sender’s current timestamp clock when the ACK arrives.

### Karn’s Algorithm & Jacobson/Karels RTT Estimation
When a packet is retransmitted, the measured RTT is ambiguous (did the ACK belong to the original or the retransmission?). **Karn’s algorithm** discards RTT samples from retransmitted packets, preventing corruption of the estimators.

For each *valid* RTT sample `R`:
$$
\begin{aligned}
\text{SRTT} &\leftarrow (1 - \alpha) \cdot \text{SRTT} + \alpha \cdot R \\
\text{RTTVAR} &\leftarrow (1 - \beta) \cdot \text{RTTVAR} + \beta \cdot |R - \text{SRTT}| \\
\text{RTO}   &\leftarrow \text{SRTT} + K \cdot \text{RTTVAR}
\end{aligned}
$$
with typical constants $\alpha = 0.125$, $\beta = 0.25$, $K = 4$, and a minimum RTO bounded by the clock granularity $G$ (often 1 ms):
$$
\text{RTO} = \max(\text{SRTT} + K \cdot \text{RTTVAR},\; G)
$$
*Derivation*: SRTT is an exponential moving average (EMA) of RTT; RTTVAR tracks the EMA of absolute deviation, providing a measure of jitter. The RTO adds a safety margin proportional to observed jitter.

## Worked Examples
### Example 1: Measuring RTT with `ping -D`
```bash
$ ping -D -c 1 8.8.8.8
PING 8.8.8.8 (8.8.8.8) 56 data bytes
64 bytes from 8.8.8.8: icmp_seq=1 ttl=113 time=23.4 ms
```
The `-D` flag prints a Unix timestamp (seconds.microseconds) before each line. Suppose the output shows:
```
[1620000000.123456] 64 bytes from 8.8.8.8: icmp_seq=1 ttl=113 time=23.4 ms
[1620000000.146896] 64 bytes from 8.8.8.8: icmp_seq=2 ttl=113 time=23.4 ms
```
The RTT for the first packet is:
$$
\Delta t = 1620000000.146896 - 1620000000.123456 = 0.02344\text{ s} = 23.44\text{ ms}
$$
Matches the `time=` field.

### Example 2: TCP Timestamp Exchange
Capture a SYN‑SYN/ACK exchange with `tcpdump`:
```bash
$ sudo tcpdump -vvv -s 0 -l -i eth0 port 80 and tcp[13] & 0x02 != 0
```
Sample output (hex values shown):
```
12:34:56.789012 IP client.54321 > server.http: Flags [S], seq 123456789, win 29200, options [TS val 1234567 ecr 0, ...]
12:34:56.789150 IP server.http > client.54321: Flags [S.], seq 987654321, ack 123456790, win 27960, options [TS val 987654 ecr 1234567, ...]
```
- Sender’s TSval = `0x1234567` = 19 170 000 (≈19.17 s at 1 kHz).  
- Receiver echoes `ecr = 1234567`.  
When the ACK arrives, the sender’s TSval has advanced to `0x12345A0` = 19 170 208.  
RTT calculation:
$$
\text{RTT} = (19\,170\,208 - 19\,170\,000) \times 1\text{ ms} = 208\text{ ms}
$$
(Actual RTT includes processing delay; the example illustrates the math.)

### Example 3: Karn’s Algorithm Step‑by‑Step
Assume the first three *valid* RTT samples (in ms) are: 100, 120, 80.  
Initialize: SRTT = 0, RTTVAR = 0, α = 0.125, β = 0.25, K = 4.

| Sample | SRTT update | RTTVAR update | RTO (ms) |
|--------|-------------|---------------|----------|
| 100    | SRTT = 0.875·0 + 0.125·100 = **12.5** | RTTVAR = 0.75·0 + 0.25·|100‑0| = **25** | 12.5 + 4·25 = **112.5** |
| 120    | SRTT = 0.875·12.5 + 0.125·120 = **23.44** | RTTVAR = 0.75·25 + 0.25·|120‑12.5| = **49.22** | 23.44 + 4·49.22 = **220.32** |
| 80     | SRTT = 0.875·23.44 + 0.125·80 = **28.05** | RTTVAR = 0.75·49.22 + 0.25·|80‑23.44| = **46.71** | 28.05 + 4·46.71 = **214.89** |

After three samples the RTO stabilizes around **215 ms**, reflecting the measured jitter.

## Common Mistakes
### Mistake 1 – Using `gettimeofday()` for Timeouts
**What’s wrong:** Code like `usleep(timeout * 1000);` where `timeout` is derived from `gettimeofday()` can expire early or late if the wall clock is stepped (e.g., via `date -s` or NTP slew).  
**Why:** `gettimeofday()` reads `CLOCK_REALTIME`, which may jump. A timeout based on an absolute wall time does not guarantee monotonic elapsed time.  
**Fix:** Use `clock_gettime(CLOCK_MONOTONIC, …)` to compute a deadline, then `nanosleep()` until that deadline.

### Mistake 2 – Ignoring TCP Timestamp Wraparound
**What’s wrong:** Treating TSval as a simple unsigned integer and computing `RTT = now - echo` without modulo 2³² arithmetic can produce negative RTT after a wrap.  
**Why:** The timestamp clock is 32‑bit; after ~49.7 days it rolls to zero. A naïve subtraction yields a large positive number (due to underflow) or a negative value if interpreted as signed.  
**Fix:** Compute RTT with unsigned 32‑bit arithmetic:
```c
uint32_t now = tcp_timestamp_clock();
uint32_t echo = received_ts_ecr;
uint32_t rtt = (now >= echo) ? (now - echo) : (0xFFFFFFFFU - echo + now + 1);
```

### Mistake 3 – Assuming a Fixed Clocksource Across CPU Frequency Changes
**What’s wrong:** Reading the TSC directly (`rdtsc`) and assuming each tick equals a fixed time interval can give apparent drift when the CPU enters a deeper C‑state or changes P‑state.  
**Why:** The TSC frequency may vary with CPU scaling unless the `constant_tsc` and `nonstop_tsc` flags are present. The kernel abstracts this via the clocksource framework, but raw TSC reads bypass it.  
**Fix:** Use the kernel‑provided `clock_gettime()` or, if raw cycles are needed, read `/sys/devices/system/clocksource/clocksource0/available_clocksource` to confirm a stable source (e.g., `hlt` or `hpet`) before using TSC, or apply the kernel’s `tsc_to_ns` conversion factor obtained from `/sys/devices/system/clocksource/clocksource0/tsc`.

## Exercises
### Easy – Compare Monotonic and Wall Clock
1. Run:
   ```bash
   # Monotonic seconds since boot (with fractions)
   cat /proc/uptime
   # Wall clock seconds since epoch
   date +%s.%N
   ```
2. Change the system clock (`sudo date -s '+2 hours'`), then repeat the commands. Observe that `/proc/uptime` advances only by the real elapsed time, while `date` jumps.

### Medium – RTT Measurement Program
Write a C program that sends a UDP packet to a peer (or localhost) and measures RTT using `gettimeofday()` before `sendto()` and after `recvfrom()`.  
- Repeat 10 000 times, collect samples.  
- Compute mean, standard deviation, and plot a histogram (optional).  
- Verify that the measured RTT matches the output of `ping -i 0.2 <target>` for the same payload size.

### Hard – Implement Karn’s Algorithm and Test with Loss
1. Implement a simple TCP‑like sender/receiver using `SOCK_DGRAM` (UDP) that:
   - Sends a packet with a 64‑bit monotonic timestamp (`clock_gettime(CLOCK_MONOTONIC)`).
   - On receipt, echoes the timestamp back.
   - The sender discards RTT samples from retransmissions (implemented by resending after a timeout without updating the estimators).  
2. Inject artificial loss (e.g., using `netem`):
   ```bash
   sudo tc qdisc add dev lo root netem loss 10%
   ```
3. Run the program and verify that the estimated RTO converges despite the loss, and that ignoring retransmitted samples prevents the RTO from collapsing to zero.

## Linux Connection
### Subsystems and Files
| Component | Kernel Subsystem | Relevant Files / Paths |
|-----------|------------------|------------------------|
| Clocksource drivers | `drivers/clocksource/` | `/sys/devices/system/clocksource/clocksource0/current_clocksource` |
| Timekeeping core | `kernel/time/timekeeping.c` | `/proc/timer_list` (active hrtimers) |
| POSIX clocks | `kernel/time/posix-timers.c` | `clock_gettime()` (VDSO) |
| NTP daemon | `ntp` (userspace) | `/etc/ntp.conf`, `/var/log/ntpstats/*` |
| PTP / chrony | `chrony` | `/etc/chrony/chrony.conf`, `chronyc` tool |
| HW clock (RTC) | `drivers/rtc/` | `/dev/rtc0`, `hwclock --show` |
| Timer syscalls | `kernel/time/timer.c` | `gettimeofday()`, `clock_gettime()`, `nanosleep()`, `adjtime()` |

### Demonstration Commands
```bash
# 1. List available clock sources and the one currently used
cat /sys/devices/system/clocksource/clocksource0/available_clocksource
cat /sys/devices/system/clocksource/clocksource0/current_clocksource

# 2. Read monotonic time via /proc/uptime (seconds since boot)
cat /proc/uptime

# 3. Read wall clock with nanosecond resolution
date +%s.%N

# 4. Show NTP synchronization status (if ntpd is running)
ntpq -p   # or: chronyc tracking

# 5. Adjust the RTC from the system clock (requires CAP_SYS_TIME)
sudo hwclock --systohc   # set RTC from system time
sudo hwclock --hctosys   # set system time from RTC

# 6. Example C program to get monotonic time (compile & run)
```
```c
/* monotonic_demo.c */
#define _POSIX_C_SOURCE 199309L
#include <time.h>
#include <stdio.h>

int main(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) == -1) {
        perror("clock_gettime");
        return 1;
    }
    printf("Monotonic: %ld.%09ld seconds\n", ts.tv_sec, ts.tv_nsec);
    return 0;
}
```
```bash
gcc -O2 -Wall monotonic_demo.c -o monotonic_demo
./monotonic_demo
```

### Kernel Tracing (optional)
```bash
# Trace hrtimer expirations
sudo trace-cmd record -p function -g hrtimer_*
sudo trace-cmd report
```

## Why This Matters
Accurate timekeeping is the hidden fabric that lets distributed systems agree on the order of events, lets TCP retransmit at the right moment, and lets logging from thousands of hosts be correlated into a coherent timeline. 

- **Monotonic clocks** prevent timeouts from collapsing when the wall clock is stepped, ensuring that latency-sensitive applications (real
