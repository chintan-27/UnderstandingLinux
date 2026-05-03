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

## Module 205: Time and Clocks — Monotonic vs Wall Clocks, Synchronization, and Drift

## Why This Matters

Wall clock time can jump backwards. When NTP corrects a drifting clock with a step adjustment, any code that computes elapsed time as $t_2 - t_1$ using `CLOCK_REALTIME` can return a negative duration, fire a timeout instantly, or stall indefinitely. This is not a theoretical edge case: it happens on every production server during the first NTP sync after boot, and again whenever drift exceeds the step threshold (~128ms in `ntpd`).

The failure modes are protocol-specific and concrete. TCP retransmission timers measure elapsed time to decide when to retransmit — a backward clock jump can reset that counter, causing a connection to stall. A NAT fragment reassembly cache uses a timeout to bound how long partial datagrams sit in memory; if that timeout is measured in wall time, a backward step extends the cache lifetime, enabling memory exhaustion. DHCP lease expiry, ICE connectivity check pacing, and TLS session ticket lifetimes all share the same vulnerability if implemented against `CLOCK_REALTIME`.

---

## Core Concepts

### Two Separate Timelines

**Wall clock time** (`CLOCK_REALTIME`) is UTC-anchored civil time. It can be set by root, stepped by NTP, and slewed continuously. It is the correct answer to "what is the timestamp on this log entry?" It is the wrong answer to "how long did this operation take?"

**Monotonic time** (`CLOCK_MONOTONIC`) is a counter that only moves forward. Its epoch is unspecified — typically somewhere near boot — so its absolute value is meaningless. Only the difference between two readings is meaningful. The kernel guarantee is strict: for any two calls where the second follows the first in program order,

$$t_2 - t_1 \geq 0$$

These are not derived from a single source. The kernel maintains them with separate state: the wall clock carries an NTP-managed offset that can be stepped; the monotonic clock does not.

There is a third clock worth knowing: `CLOCK_BOOTTIME` behaves like `CLOCK_MONOTONIC` but continues advancing during system suspend. `CLOCK_MONOTONIC` freezes while the CPU is halted during suspend/resume, so elapsed time across a suspend event is undercounted. For anything involving lease timeouts or session lifetimes that must survive sleep, use `CLOCK_BOOTTIME`.

### Hardware Counters and the `clocksource`

The CPU's **TSC** (Time Stamp Counter) increments every clock cycle and is the primary clocksource on modern x86 hardware. The kernel also supports **HPET** (High Precision Event Timer) and the **ACPI PM timer** as fallbacks when the TSC is unstable (e.g., on older multi-socket systems where per-core TSCs are not synchronized).

The active clocksource is visible and switchable at runtime:

```bash
cat /sys/devices/system/clocksource/clocksource0/current_clocksource
# tsc

cat /sys/devices/system/clocksource/clocksource0/available_clocksource
# tsc hpet acpi_pm
```

Between timer interrupts, the kernel reads the TSC to interpolate sub-tick time. This is called **clock interpolation** or **timekeeping continuation**. The resolution of `clock_gettime` is therefore not limited to the tick period (typically 1ms or 4ms depending on `CONFIG_HZ`), but to the TSC granularity — which is sub-nanosecond on modern hardware.

Read the kernel's internal timekeeping resolution:

```bash
cat /proc/timer_list | grep -E "clock|resolution" | head -20
```

### Drift and the Parts-Per-Million Model

A crystal oscillator nominally running at frequency $f_0$ actually runs at $f_0(1 + \epsilon)$ where $\epsilon$ is the fractional frequency error. After real elapsed time $T$, the local clock reads:

$$T_{\text{local}} = T(1 + \epsilon)$$

so the drift accumulated is:

$$\Delta = T \cdot \epsilon$$

A commodity server oscillator has $|\epsilon| \approx 10\,\text{ppm}$. Over one day ($T = 86400\,\text{s}$):

$$\Delta = 86400 \times 10 \times 10^{-6} = 0.864\,\text{s/day}$$

Over 30 days without correction, drift reaches ~26 seconds. Kerberos authentication tickets expire if the client clock is more than 5 minutes from the KDC — a drifting clock breaks Kerberos in roughly 300 days on a 10 ppm oscillator if NTP is absent. Certificate validation, signed JWT expiry, and TOTP (time-based one-time passwords) have similar sensitivities.

### NTP Clock Discipline

NTP does not set the clock. It disciplines it — adjusting the rate at which the kernel advances `CLOCK_REALTIME` so that the error decays to zero without a discontinuous step.

The kernel exposes this through `adjtimex(2)`. The NTP daemon writes a **frequency correction** $\phi$ (in parts per billion) and a **phase offset** $\theta$ (in nanoseconds). The kernel then runs its clock slightly fast or slow — by at most 500 ppm — until the offset is consumed.

A single NTP round-trip exchange produces four timestamps: $t_1$ and $t_4$ are taken locally (before sending and after receiving), $t_2$ and $t_3$ are taken by the server (on receipt and on transmit). The offset estimate is:

$$\theta = \frac{(t_2 - t_1) + (t_3 - t_4)}{2}$$

and the round-trip delay is:

$$\delta = (t_4 - t_1) - (t_3 - t_2)$$

The offset estimate assumes symmetric network delay. Asymmetric paths introduce a systematic error of $(\delta_{\text{forward}} - \delta_{\text{return}})/2$ that NTP cannot measure and cannot correct.

A step correction fires only when $|\theta| > 128\,\text{ms}$ (default in `ntpd`; `chronyd` uses a more conservative 1 second by default for non-initial steps). This is the event that breaks wall-clock-based elapsed-time code.

---

## How It Works

### The `adjtimex` State

The full NTP discipline state is visible through `adjtimex(2)`. The `timex` struct fields that matter most:

| Field | Meaning | Units |
|---|---|---|
| `offset` | Current measured clock offset from UTC | nanoseconds (mode STA_NANO) |
| `freq` | Frequency correction being applied | ppb × 2¹⁶ (scaled) |
| `maxerror` | Accumulated upper bound on total error | microseconds |
| `esterror` | NTP daemon's estimated error | microseconds |
| `status` | Bitmask: PLL/FLL mode, leap second, sync | — |

```c
#include <sys/timex.h>
#include <stdio.h>

int main(void) {
    struct timex tx = {0};
    int state = adjtimex(&tx);

    /* state: TIME_OK=0, TIME_INS=1, TIME_DEL=2, TIME_OOP=3,
              TIME_WAIT=4, TIME_ERROR=5 */
    printf("kernel clock state: %d\n", state);
    printf("offset:    %ld ns\n",       tx.offset);
    printf("freq adj:  %.3f ppm\n",     (double)tx.freq / 65536.0 / 1000.0);
    printf("maxerror:  %ld us\n",       tx.maxerror);
    printf("esterror:  %ld us\n",       tx.esterror);
    printf("status:    0x%04x\n",       tx.status);
    printf("tick:      %ld us\n",       tx.tick); /* nominal tick length */
    return 0;
}
```

`freq` is stored as a 16.16 fixed-point value in ppb, so the actual frequency correction in ppm is `tx.freq / 65536.0 / 1000.0`. If NTP is not running, `maxerror` climbs at `tx.tick` microseconds per second — the kernel tracks that it is losing synchronization.

From the shell, `chronyc tracking` or `ntpq -p` report the same information at a higher level:

```bash
chronyc tracking
# Reference ID    : A29FC87B (time.cloudflare.com)
# System time     : 0.000012453 seconds fast of NTP time
# Frequency       : 14.233 ppm fast
# Residual freq   : +0.005 ppm
# Skew            : 0.031 ppm

ntpq -p          # shows stratum, offset, jitter, poll interval per peer
timedatectl      # shows sync status and NTP service
```

### Linux Clock IDs

```c
clock_gettime(clockid_t clk_id, struct timespec *tp);
```

| Clock ID | Jumps on NTP step? | Advances during suspend? | Use for |
|---|---|---|---|
| `CLOCK_REALTIME` | Yes | Yes | Timestamps, log entries |
| `CLOCK_MONOTONIC` | No | No | Timeouts, elapsed time within a session |
| `CLOCK_BOOTTIME` | No | Yes | Timeouts across suspend/resume |
| `CLOCK_TAI` | No (no leap seconds) | Yes | Protocols needing linear UTC-like time |
| `CLOCK_MONOTONIC_RAW` | No | No | Benchmarking; immune to NTP slew |

`CLOCK_TAI` differs from `CLOCK_REALTIME` by the current TAI-UTC offset (37 seconds as of 2024). It avoids the 1-second discontinuity that leap second insertions cause in `CLOCK_REALTIME`. PTP (IEEE 1588) hardware timestamping often uses
