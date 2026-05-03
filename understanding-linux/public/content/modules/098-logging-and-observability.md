---
id: 98
title: "Logging and observability"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Why This Matters

A running process has no persistent voice. When it crashes, misbehaves, or silently corrupts state, every clue dies with it unless the process deliberately wrote evidence somewhere first. The challenge is not just *writing* logs — it is writing them in a way that survives restart, survives disk pressure, and produces signal rather than noise. Without log rotation, a verbose daemon fills `/var/log` and the filesystem hits 100% capacity, at which point the kernel cannot write PID files, cannot fork, and shells cannot redirect output — the system is operationally dead without any process having crashed. Without the counter/gauge/histogram distinction, you instrument the wrong thing and your metrics answer questions nobody asked.

---

## Core Concepts

### Syslog: Emission Decoupled from Routing

Before syslog, every daemon invented its own format and destination. Syslog (4.2BSD, 1983) defines a single kernel-side API — `syslog(3)` — and a single daemon (`syslogd`, `rsyslogd`, `syslog-ng`) that decides where messages go. The calling process sends a datagram to the Unix domain socket `/dev/log` and immediately returns. It holds no file descriptor to the log file, performs no `fsync`, and has no knowledge of rotation. The syslog daemon receives the datagram, applies routing rules, and writes to files, remote hosts, or named pipes. This decoupling means a daemon can log safely even when the filesystem is full — the write failure is the syslog daemon's problem, not the daemon's.

### Priority Encoding: Facility × Level

Every syslog message carries a **priority** integer encoding two orthogonal dimensions:

- **Facility**: the logical source — `LOG_KERN` (0), `LOG_USER` (1), `LOG_MAIL` (2), `LOG_DAEMON` (3), `LOG_AUTH` (4), `LOG_SYSLOG` (5), `LOG_LPR` (6), `LOG_NEWS` (7), `LOG_UUCP` (8), `LOG_CRON` (9), `LOG_LOCAL0`–`LOG_LOCAL7` (16–23).
- **Level**: severity — `LOG_EMERG` (0) through `LOG_DEBUG` (7).

The encoding is:

$$\text{priority} = (\text{facility} \times 8) + \text{level}$$

The factor of 8 is not arbitrary — it reserves exactly 3 bits for the level field, so you can recover both dimensions with integer arithmetic:

$$\text{facility} = \lfloor \text{priority} / 8 \rfloor, \qquad \text{level} = \text{priority} \bmod 8$$

Or equivalently in C:

```c
int facility = priority >> 3;
int level    = priority & 0x07;
```

`LOG_DAEMON` (facility 3) at `LOG_ERR` (level 3) gives priority $3 \times 8 + 3 = 27$. `syslogd` uses this single integer to route messages: a selector like `daemon.err` matches all messages where facility is `LOG_DAEMON` and level $\leq 3$ (i.e., `LOG_ERR` through `LOG_EMERG`).

### syslog.conf: Selector–Action Rules

`/etc/rsyslog.conf` maps selectors to actions. Selector syntax is `facility.level`, meaning "this facility at this level *and above* (numerically lower, more severe)." Actions are file paths, remote hosts (`@host`), named users, or pipes.

```
# /etc/rsyslog.conf excerpt
kern.warn                       /var/log/kernel-warnings
daemon.*                        /var/log/daemon.log
*.emerg                         :omusrmsg:*          # broadcast to all logged-in users
mail.info                       /var/log/mail.log
local7.debug                    /var/log/app-debug.log
```

Rules are evaluated independently — a single message can match multiple selectors and be written to multiple destinations simultaneously. The `*` level means all levels; `none` explicitly suppresses a facility.

On modern systems with `rsyslogd`, you can also use RainerScript for structured filtering:

```
if $programname == 'mydaemon' and $syslogseverity <= 3 then /var/log/mydaemon-errors.log
```

### The Journal: Structured Binary Log Storage

`systemd-journald` does not replace the syslog API — it intercepts messages from `/dev/log`, from the kernel's `printk` ring buffer via `/proc/kmsg`, and from the stdout/stderr of every systemd-managed unit. It stores structured binary records in `/var/log/journal/<machine-id>/`. Each record contains arbitrary `KEY=VALUE` fields plus automatically populated metadata: `_PID`, `_UID`, `_GID`, `_COMM`, `_EXE`, `_SYSTEMD_UNIT`, `_BOOT_ID`, plus both a monotonic timestamp (nanoseconds since boot, immune to clock adjustments) and a realtime timestamp.

The binary format is why plain `grep` does not work — but it is also why you can filter on any field with exact-match semantics rather than parsing text:

```bash
# Show only messages from sshd in the current boot
journalctl _COMM=sshd -b

# Show kernel messages at warning level and above since yesterday
journalctl -k -p warning --since yesterday

# Follow new messages from a specific systemd unit
journalctl -u nginx.service -f

# Show the 50 most recent entries with full metadata
journalctl -n 50 -o verbose

# Export to JSON for programmatic processing
journalctl -u postgresql.service -o json | jq '.MESSAGE'
```

The journal persists across boots when `/var/log/journal/` exists; otherwise it uses `/run/log/journal/` (volatile, lost on reboot). To make it persistent:

```bash
mkdir -p /var/log/journal
systemd-tmpfiles --create --prefix /var/log/journal
systemctl restart systemd-journald
```

### Log Rotation: The Inode Problem

A daemon that calls `open("app.log", O_WRONLY|O_APPEND)` holds a file descriptor pointing to an **inode**, not a filename. The directory entry is just a name-to-inode mapping. When `logrotate` renames `app.log` to `app.log.1`, the inode does not change — the daemon's file descriptor still points to the same inode, and subsequent writes land in `app.log.1`. The name `app.log` no longer exists from the daemon's perspective.

This is why rotation requires a signal. The standard sequence:

```
logrotate:                          daemon:
  rename app.log → app.log.1
  create new empty app.log
  send SIGHUP to PID from pidfile
                                →   signal handler: hupReceived = 1
  (rotation script exits)
                                →   main loop detects hupReceived
                                    close(log_fd)
                                    log_fd = open("app.log", O_WRONLY|O_CREAT|O_APPEND, 0644)
                                    hupReceived = 0
```

`logrotate` reads the daemon's PID from its pidfile and sends `SIGHUP`; the daemon must implement the handler. `/etc/logrotate.d/` contains per-package rotation configs:

```
# /etc/logrotate.d/mydaemon
/var/log/mydaemon.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        kill -HUP $(cat /var/run/mydaemon.pid)
    endscript
}
```

`delaycompress` leaves `app.log.1` uncompressed for one rotation cycle — necessary if the daemon might still have the old inode open and writing when compression runs.

You can verify that a daemon is still writing to the old inode after rotation using `lsof`:

```bash
lsof -p $(pidof mydaemon) | grep log
# If you see app.log.1 open for writing, the daemon has not yet received/handled SIGHUP
```

### Metrics: Counters, Gauges, Histograms

Logs record discrete events; metrics record continuous numerical state sampled over time. The distinction determines what operations are mathematically valid on the data.

**Counter**: monotonically increasing, reset only on restart. Valid operation: compute rate over an interval.

$$\text{rate}(t) = \frac{C(t) - C(t - \Delta t)}{\Delta t}$$

If a counter wraps or resets (process restart), the rate formula produces a negative number — monitoring systems must handle this by treating a decrease as a reset and emitting no rate for that interval.

**Gauge**: a value that can increase or decrease arbitrarily — memory usage, queue depth, active connection count. You cannot meaningfully sum gauges across time; you can compute min/max/average over a window.

**Histogram**: a set of counters, one per bucket, where each counter increments when a measurement falls in that bucket's range. For request latency with buckets $[0, 1), [1, 5), [5, 10), [10, \infty)$ ms, after $N$ requests the fraction that completed in under 10 ms is:

$$P(\text{latency} < 10\text{ ms}) = \frac{\text{count}_{[0,1)} + \text{count}_{[1,5)} + \text{count}_{[5,10)}}{N}$$

Histograms are counters internally, so they survive restarts meaningfully (compare deltas). They are how you compute percentiles — $p99$ latency — without storing every individual measurement.

The standard Linux tool for ad-hoc system metrics is `perf stat`, which reads hardware performance counters; for process-level metrics, `/proc/<pid>/stat`, `/proc/<pid>/status`, and `/proc/<pid>/io` expose gauges the kernel maintains directly.

---

## How It Works

### The syslog(3) API

```c
#include <syslog.h>

void openlog(const char *ident, int options, int facility);
void syslog
