---
id: 193
title: "Orchestration concepts"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Scheduling
Scheduling in Linux is the kernel’s decision of which runnable task receives the CPU at any instant. The goal is not merely “fairness” but to **maximize throughput while bounded latency** for interactive workloads and to **prevent starvation** of low‑priority tasks. The kernel achieves this by assigning each task a *virtual runtime* (`vruntime`) that advances at a rate inversely proportional to its scheduling weight. Tasks with smaller `vruntime` are selected first; after running, their `vruntime` increases, pushing them back in the red‑black tree ordered by `vruntime`. This yields proportional‑share scheduling: a task with weight `w` receives a fraction `w / Σw` of CPU time over a long interval.

### Service Discovery
Service discovery enables a client to locate a service instance without hard‑coded addresses. In Linux the prevalent zero‑configuration mechanism is **multicast DNS (mDNS) combined with DNS‑based Service Discovery (DNS‑SD)**, implemented by the Avahi daemon. A service publishes a DNS‑SRV record of the form `_proto._tcp.local.` (e.g., `_http._tcp.local.`) together with associated TXT records containing metadata. Avahi sends these records via IPv4/IPv6 multicast to address `224.0.0.251` (IPv4) or `ff02::fb` (IPv6) on port 5353. Listeners subscribe to the same multicast group, receive the announcements, and cache them in a local mDNS responder, allowing name resolution via `<instance>._proto._tcp.local.` without unicast DNS.

### Health Checks
Health checks are active probes that determine whether a service is functioning correctly. In Linux they are typically implemented as **periodic exec‑based tests** that return a success/failure exit status, or as **socket/port probes** (TCP connect, HTTP request). The key design principle is **failure detection before user‑visible impact**: a check must be cheap enough to run frequently (seconds) yet robust enough to avoid false positives. Systemd provides a watchdog mechanism where the service must periodically call `sd_notify("WATCHDOG=1")`; missing the deadline triggers a restart. Monit, by contrast, executes a user‑defined program and interprets its exit code.

### Resource Limits
Resource limits constrain the consumption of CPU, memory, I/O, etc., to protect the system from overload. Linux offers two orthogonal mechanisms:
* **Per‑process limits** via `ulimit` (and the underlying `getrlimit/setrlimit` system calls) that affect a single task and its children.
* **Hierarchical limits** via **cgroups (control groups)**, specifically **cgroups v2**, which allow aggregating limits over a subtree of processes. The kernel enforces limits by checking the accumulated usage against thresholds defined in files such as `cpu.max`, `memory.max`, `io.max`. When a threshold is exceeded, the kernel may throttle (CPU), reject allocations (memory), or delay I/O.

---

## How It Works
### Scheduling – CFS Details
The Completely Fair Scheduler (CFS) maintains, for each runnable task, a `struct sched_entity` containing:
* `vruntime` – the accumulated virtual runtime.
* `weight` – derived from the task’s nice value.
* `load_weight` – a scaled version used for load balancing.

**Weight calculation**  
```
weight = 1024 / (1.25 ^ (nice - 0))
```
A nice value of 0 yields weight = 1024; each increment of nice reduces weight by ≈ 1.25×, each decrement increases it.

**Virtual runtime update**  
When a task runs for `Δt` nanoseconds, its `vruntime` increments by:
```
Δvruntime = Δt * (weight0 / weight)
```
where `weight0` is the weight of a nice‑0 task (1024). Thus a task with higher weight (lower nice) accumulates `vruntime` more slowly, receiving more CPU proportionally.

The scheduler picks the leftmost node in the rb‑tree (smallest `vruntime`). After the task’s timeslice expires (or it blocks), its `vruntime` is updated and the node is re‑inserted.

**Example numbers** (nice = 0 vs nice = 5):
* weight₀ = 1024
* weight₅ = 1024 / (1.25⁵) ≈ 1024 / 3.05 ≈ 336
* Ratio weight₀/weight₅ ≈ 3.05 → a nice 5 task’s `vruntime` grows ~3× faster, so it gets ≈ 1/3 the CPU of a nice 0 task.

### Service Discovery – Avahi Flow
1. **Publishing** – `avahi-daemon` reads service definitions from `/etc/avahi/services/` or via `avahi-publish`. It constructs a DNS‑SRV record:
   ```
   _http._tcp.local. 0 0 80 myservice.local.
   ```
   and optional TXT records (e.g., `version=1.0`).
2. **Multicast transmission** – The daemon sends a UDP packet to `224.0.0.251:5353` (IPv4) containing the DNS message.
3. **Reception** – All hosts on the same link‑layer subnet join the multicast group; their `avahi-daemon` caches the record.
4. **Resolution** – A client runs `avahi-browse -r _http._tcp.local.` or uses `getaddrinfo()` with the `.local.` suffix; the resolver queries the local cache, returns the IP address and port.

If the service moves to another subnet, multicast does not cross routers; a separate Avahi instance must be present on each link, or a unicast DNS‑SD proxy (e.g., `avahi-daemon` with `enable-dbus=no` and `publish-addresses=yes`) is required.

### Health Checks – systemd Watchdog
A systemd unit can declare:
```ini
[Service]
ExecStart=/usr/local/bin/mydaemon
WatchdogSec=30
Restart=on-failure
```
The kernel expects the daemon to invoke `sd_notify("WATCHDOG=1")` at least every `WatchdogSec` seconds. If the watchdog expires, systemd sends `SIGABRT` (or `SIGKILL` after `TimeoutStopSec`) and restarts the service per `Restart=`. This couples health checking to the service’s own liveness logic, avoiding external false positives.

### Health Checks – monit Example
Monit reads `/etc/monit/monitrc`. A typical check:
```monit
check process myservice with pidfile /var/run/myservice.pid
    start program = "/etc/init.d/myservice start"
    stop program  = "/etc/init.d/myservice stop"
    if failed port 80 protocol http
        and timeout 10 seconds
        then restart
    if 5 restarts within 5 cycles
        then timeout
```
Monit forks, executes the start/stop programs, and performs a TCP connect to port 80 followed by an HTTP GET; failure triggers the restart action.

### Resource Limits – cgroups v2
Create a hierarchy:
```bash
# mount the v2 filesystem (usually already mounted)
mount -t cgroup2 none /sys/fs/cgroup
# create a sub‑group
mkdir /sys/fs/cgroup/mygroup
# set CPU max: 50 % of one CPU (i.e., 50000 µs out of 100000 µs period)
echo 50000 100000 > /sys/fs/cgroup/mygroup/cpu.max
# set memory limit: 200 MiB
echo $((200*1024*1024)) > /sys/fs/cgroup/mygroup/memory.max
# move a process into the group
echo <pid> > /sys/fs/cgroup/mygroup/cgroup.procs
```
The kernel tracks cumulative usage; if the group attempts to exceed `memory.max`, the allocation fails with `ENOMEM`. If it tries to consume more CPU than `cpu.max`, the scheduler throttles the group’s tasks, extending their `vruntime` accumulation.

### Resource Limits – ulimit
Per‑process limits are queried/set with:
```bash
ulimit -n        # show open file limit
ulimit -n 4096   # raise to 4096 (requires appropriate privileges)
```
These limits derive from `RLIMIT_NOFILE`; exceeding them causes `open()` to return `EMFILE`.

---

## Worked Examples
### Example 1: Scheduling – Comparing nice values
**Goal:** Observe how nice values affect CPU share using `vruntime` from `/proc/<pid>/sched`.

**Steps**
1. Start two CPU‑bound loops with different niceness:
   ```bash
   # nice 0 (default)
   nice -n 0 sha256sum /dev/zero &
   PID0=$!
   # nice 5
   nice -n 5 sha256sum /dev/zero &
   PID5=$!
   ```
2. Let them run for 10 seconds, then sample `vruntime`:
   ```bash
   sleep 10
   cat /proc/$PID0/sched | grep -E 'se.vruntime|sum_exec_runtime'
   cat /proc/$PID5/sched | grep -E 'se.vruntime|sum_exec_runtime'
   ```
   Sample output (values in nanoseconds):
   ```
   se.vruntime:  4283745600
   sum_exec_runtime: 4283745600
   ...
   se.vruntime:  12851236800
   sum_exec_runtime: 4283745600
   ```
   Both tasks consumed ~4.28 s of real CPU (`sum_exec_runtime` equal). The nice 5 task’s `vruntime` is ~3× larger, reflecting its lower weight.

3. Compute expected weight ratio:
   * weight₀ = 1024
   * weight₅ ≈ 336 (as derived)
   * Expected vruntime ratio = weight₀/weight₅ ≈ 3.05, matching observation (~3.0).

**Conclusion:** The CFS enforces proportional CPU allocation; nice values translate directly into weight and thus into `vruntime` growth rate.

### Example 2: Service Discovery – Publishing an HTTP service with Avahi
**Goal:** Advertise a local web server and discover it from another host.

**Steps on the publisher (host A)**
1. Install Avahi utilities:
   ```bash
   sudo apt-get install avahi-daemon avahi-utils
   ```
2. Ensure the daemon is running:
   ```bash
   sudo systemctl start avahi-daemon
   sudo systemctl enable avahi-daemon
   ```
3. Publish the service (port 80, text record `version=1.0`):
   ```bash
   avahi-publish -s "My Web Server" _http._tcp 80 "version=1.0"
   ```
   The command blocks, keeping the service announced until interrupted.

**Steps on a client (host B, same subnet)**
1. Browse for `_http._tcp` services:
   ```bash
   avahi-browse -t _http._tcp.local.
   ```
   Expected output:
   ```
   +   eth0 IPv4 My Web Server _http._tcp.local. local
   ```
2. Resolve the address and port:
   ```bash
   avahi-resolve-address -n My\ Web\ Server.local.
   # Returns: 192.168.1.42
   avahi-resolve -n My\ Web\ Server._http._tcp.local.
   # Returns: 192.168.1.42 80
   ```
3. Verify connectivity:
   ```bash
   curl http://My\ Web\ Server.local.:80
   ```
   Should return the web server’s response.

**Explanation:** The `avahi-publish` process sends multicast DNS‑SRV/TXT records; all hosts on the link listen on `224.0.0.251:5353`, cache the entry, and respond to unicast queries for the `.local.` name.

### Example 3: Health Checks – systemd Watchdog + Monit Fallback
**Goal:** Create a resilient service that self‑reports liveness to systemd, with monit as an external safety net.

**Unit file (`/etc/systemd/system/myapp.service`)**
```ini
[Unit]
Description=My resilient application
After=network.target

[Service]
Type=notify                 # expects sd_notify calls
ExecStart=/usr/local/bin/myapp
WatchdogSec=20              # must notify every 20s
Restart=on-failure
RestartSec=5
# Export a notification socket for monit (optional)
# Not required; monit will use its own checks.

[Install]
WantedBy=multi-user.target
```
**Application snippet (`myapp.c`)** – using libsystemd:
```c
#include <systemd/sd-daemon.h>
#include <unistd.h>

int main(void) {
    // Notify startup
    sd_notify(0, "READY=1");

    while (1) {
        // do work ...
        // inform systemd we are alive
        sd_notify(0, "WATCHDOG=1");
        sleep(5);   // interval < WatchdogSec
    }
    return 0;
}
```
Build and install:
```bash
gcc -o /usr/local/bin/myapp myapp.c -lsystemd
sudo systemctl daemon-reload
sudo systemctl enable --now myapp.service
```
**Monit configuration (`/etc/monit/monitrc`)** – external check:
```monit
check process myapp with pidfile /run/myapp.pid
    start program = "/bin/systemctl start myapp.service"
    stop  program = "/bin/systemctl stop myapp.service"
    if failed port 8080 protocol http
        and timeout 5 seconds
        then restart
    if 5 restarts within 5 cycles
        then timeout
```
**Explanation:**  
* Systemd’s watchdog guarantees the daemon calls `sd_notify` at least every 20 s; a hung process misses the deadline and is restarted automatically.  
* Monit adds a layer: if the service fails to respond on its HTTP port (perhaps the watchdog failed to trigger due to a bug), monit restarts it via systemd. This dual‑check reduces the chance of both false negatives (missed hangs) and false positives (unnecessary restarts).

---

## Common Mistakes
1. **Misinterpreting nice as a priority scale**  
   *Wrong:* “Nice -20 gives the process highest CPU share.”  
   *Why:* Nice values only affect the CFS weight relative to other **SCHED_OTHER** tasks. Real‑time policies (`SCHED_FIFO`, `SCHED_RR`) ignore nice entirely and can preempt any CFS task regardless of its nice. Setting a negative nice does not grant real‑time immunity.

2. **Publishing a service with Avahi on a multi‑host network without checking multicast scope**  
   *Wrong:* Running `avahi-publish` on a host behind a router and expecting clients on another subnet to discover it.  
   *Why:* mDNS uses link‑local multicast (`224.0.0.251`/`ff02::fb`) which routers do not forward. Without a repeater or unicast DNS‑SD proxy, the service is invisible beyond the local link.

3. **Relying solely on systemd Watchdog without verifying `sd_notify` success**  
   *Wrong:* Assuming `WatchdogSec` guarantees recovery if the daemon forgets to call `sd_notify`.  
   *Why:* If the daemon crashes before reaching the notification code, the watchdog will fire, but if the daemon enters a non‑responsive loop that still calls `sd_notify` (e.g., a busy loop that calls the notify function), systemd will consider it healthy despite being stuck. Pair watchdog with an external health check (e.g., monit or a custom ExecStartPre script) to catch such cases.

4. **Setting `cpu.max` in cgroups v2 to a value larger than the period**  
   *Wrong:* `echo 150000 100000 > cpu.max` (i.e., 150 % of a CPU).  
   *Why:* The kernel rejects values where the quota exceeds the period, returning `EINVAL`. The correct way to allow bursts is to use `cpu.max` with a quota ≤ period, or to use `cpu.weight` for proportional sharing without hard caps.

5. **Using `ulimit -n` to raise the open‑file limit for a service started via systemd without adjusting `LimitNOFILE`**  
   *Wrong:* Running `ulimit -n 65535` in a shell and expecting a systemd service to inherit it.  
   *Why:* Systemd resets limits according to the unit file; unless `LimitNOFILE=` is specified (or `DefaultLimitNOFILE=` in `systemd.conf`), the service starts with the default (often 1024). The correct approach is to add `LimitNOFILE=65535` to the unit.

---

## Exercises
### Easy
1. **Nice and CPU share**  
   - Launch two `yes` processes, one with `nice -n 0`, another with `nice -n 7`.  
   - Use `top -p <pid1>,<pid2>` to observe the `%CPU` column over 30 seconds.  
   - Verify that the ratio approximates the weight ratio derived from the nice values.

2. **ulimit effect**  
   - In a fresh shell, run `ulimit -n` (note the value).  
   - Attempt to open 2000 files with a simple loop (`for i in {1..2000}; do : > /tmp/file$i; done`).  
   - Observe the `Too many open files` error when the soft limit is exceeded, then raise the limit with `ulimit -n 4096` and repeat.

### Medium
1. **cgroups v2 memory limit**  
   - Create a cgroup `memlimit` under `/sys/fs/cgroup`.  
   - Set `memory.max` to 50 MiB.  
   - Run a memory‑hogging program (e.g., `stress --vm 1 --vm-bytes 100M`) inside the cgroup (by moving its PID to `cgroup.procs`).  
   - Confirm that the process is killed with `SIGKILL` and check `dmesg` for “Out of memory: Kill process …”.

2. **Avahi service discovery across two virtual machines**  
   - Set up two VMs on the same host‑only network.  
   - Install Avahi on both.  
   - On VM A, publish an `_ssh._tcp` service on port 22.  
   - On VM B, run `avahi-browse -r _ssh._tcp.local.` and verify the service appears.  
   - Test connectivity with `ssh user@<service-name>.local`.

### Hard
1. **Custom health‑checking daemon with systemd watchdog and external monit**  
   - Write a C program that:  
     * Performs a real workload (e.g., serves HTTP on port 8080).  
     * Calls `sd_notify("WATCHDOG=1")` every 12 seconds.  
     * Exposes a `/health` endpoint that returns 200 only if a background thread reports no errors.  
   - Create a systemd unit with `WatchdogSec=20` and `Restart=on-failure`.  
   - Add a monit check that verifies the `/health` endpoint (TCP + HTTP GET) and restarts the unit on failure.  
   - Simulate a deadlock where the watchdog still fires but the health endpoint fails; verify monit triggers a restart while the watchdog alone does not.

2. **Analyzing CFS vruntime mathematically**  
   - Derive the expected `vruntime` after a period `T` for two tasks with nice values `n1` and `n2`.  
   - Write a short script that plots `vruntime(t)` for `t ∈ [0,30]` s using the weight formula.  
   - Confirm the script’s output matches empirical data gathered from `/proc/<pid>/sched` for a pair of CPU‑bound tasks.

---

## Linux Connection
“…….”

**Subsystems & Files**
| Concept | Kernel Subsystem / Path | Key Data Structures | Relevant Tools / Files |
|---|---|---|---|
| Scheduling | `kernel/sched/fair.c` (CFS) | `struct sched_entity`, `struct load_weight`, `struct cfs_rq` | `/proc/<pid>/sched` (shows `se.vruntime`, `sum_exec_runtime`), `chrt`, `nice`, `renice`, `sysctl kernel.sched_*` |
| Service Discovery | `avahi-daemon` (user‑space) – uses `libavahi-client` | mDNS socket (`AF_INET6`, `SOCK_DGRAM` bound to `224.0.0.251:5353`), DNS‑SD record cache | `avahi-browse`, `avahi-publish`, `avahi-resolve`, `/etc/avahi/avahi-daemon.conf`, `/etc/avahi/services/` |
| Health Checks | `systemd` (pid 1) – watchdog via `sd_notify`; `monit` (daemon) | `sd_notify` interface; monit’s `check` statements | `systemd` unit files (`/etc/systemd/system/*.service`), `monitrc` (`/etc/monit/monitrc`), `sd_notify(3)` man page |
| Resource Limits (cgroups v2) | `kernel/cgroup/cgroup-v2.c` | `cgroup_subsys_state`, `css_set`, `rcpu` (CPU controller), `memory` controller | `/sys/fs/cgroup/` hierarchy (`cpu.max`, `memory.max`, `io.max`), `cgcreate`, `cgexec`, `systemd` slice/service units (`CPUQuota=`, `MemoryLimit=`), `ulimit` (`getrlimit/setrlimit`) |

**Concrete Commands**

*Show CFS weight for a task:*
```bash
# Get nice value
nice -n 0 bash -c 'echo $$'   # PID of bash
# Read weight from /proc/<pid>/sched
cat /proc/$$/sched | grep load.weight
# Output example: load.weight = 1024
```

*Modify a cgroup v2 CPU quota:*
```bash
sudo mkdir -p /sys/fs/cgroup/myapp
echo 75000 100000 | sudo tee /sys/fs/cgroup/myapp/cpu.max   # 7
