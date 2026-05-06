---
id: 96
title: "Init and service management"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Core Concepts
### The Role of PID 1
The kernel’s final init step is to execute the first user‑space process, conventionally `/sbin/init`. This process receives **PID 1** and has special properties:
- It is **reaped** by the kernel only on system shutdown; otherwise it must call `waitpid(-1, ...)` to reap orphaned children, preventing zombie accumulation.
- It ignores `SIGCHLD` by default, but may install a handler to reap children explicitly.
- It cannot be killed by `SIGTERM` from ordinary users; only `SIGPOWER` or `SIGINT` from the kernel (e.g., via `Ctrl‑Alt‑Del`) can trigger a shutdown sequence.

These constraints make PID 1 the natural place for an **init system** that manages the rest of user space.

### Service Model in Modern Linux
A *service* is a long‑running program that provides a capability (e.g., network file system, display manager). In systemd the canonical representation is a **unit file** (`*.service`). Key concepts:
- **State machine**: `inactive` (dead) → `activating` (start) → `active` (running) → `deactivating` (stop) → `inactive`. Additional states: `failed`, `maintenance`.
- **Dependencies** expressed via `Wants=`, `Requires=`, `After=`, `Before=` form a **directed acyclic graph (DAG)**. The init daemon topologically sorts this graph to determine start order.
- **Activation types**: `simple` (default), `forking`, `oneshot`, `notify`, `dbus`. Each tells systemd how to detect when the service is truly ready.

### Boot Userspace Transition
After the kernel mounts the root filesystem and executes `/sbin/init`, the init system performs:
1. **Early boot** – loads essential kernel modules, sets up basic devices (`/dev`, `/sys`, `/proc` via `udev`/`systemd-udevd`).
2. **Basic target** – reaches `systemd` target `basic.target`, which includes low‑level services (udev, syslog, tmpfiles).
3. **Target synchronization** – waits for all dependencies of the chosen boot target (e.g., `multi-user.target` or `graphical.target`) to be satisfied.
4. **Enter default target** – executes the `ExecStart=` of services in the target’s dependency order, handing control to login managers or shells.

The kernel hands over control *only* once; all subsequent process creation is performed by the init system via `fork()`+`execve()`.

## How It Works
### Unit File Parsing and Dependency Graph
When systemd starts, it scans unit directories (`/usr/lib/systemd/system/`, `/run/systemd/system/`, `/etc/systemd/system/`). Each `[Service]` section is parsed into a struct containing:
```c
typedef struct {
    char *ExecStart;      /* argv[0] + args */
    char *ExecStop;
    char *Type;           /* simple|forking|... */
    char *Wants;          /* space-separated list */
    char *Requires;
    char *After;
    char *Before;
    uint64_t TimeoutStartSec;
    /* ... */
} ServiceDesc;
```
From `Wants/Requires/After/Before` edges, systemd builds a **DAG** `G = (V, E)`. A topological order `π` satisfies: ∀(u→v)∈E, π(u) < π(v). The start time of a service `s` is:
$$T_s = \begin{cases}
0 & \text{if } s \text{ has no dependencies}\\
\max\limits_{p \in \text{pred}(s)} (T_p + \delta_p) & \text{otherwise}
\end{cases}$$
where $\delta_p$ is the actual start‑up latency of predecessor `p`. The overall boot time is the length of the **critical path**, i.e., the maximum $T_s$ over all services in the target.

### Process Creation and Reaping
For a `simple` service, systemd does:
```c
pid_t pid = fork();
if (pid == 0) {
    /* child */
    setsid();                     /* new session */
    execve(unit->ExecStart, argv, envp);
    _exit(127);                   /* exec failed */
}
/* parent */
pid_t waited = waitpid(pid, &status, 0);
if (WIFEXITED(status)) {
    /* service exited cleanly */
} else if (WIFSIGNALED(status)) {
    /* service killed by signal */
}
```
For `forking` services, the parent expects the child to call `exit()` after the daemon forks and the parent exits; systemd tracks the original fork’s PID as the main process.

### Activation Notification
Services using `Type=notify` must call `sd_notify(0, "READY=1")` (provided by `libsystemd`). Systemd watches the file descriptor passed via `NOTIFY_SOCKET=` environment variable; upon receipt it transitions the unit to `active`. This eliminates guess‑about‑ready time and reduces race conditions.

### State Persistence
Systemd writes runtime state to `/run/systemd/system/` (symlinks to unit files) and maintains a transient database in `/var/lib/systemd/`. The `enable` operation creates a symlink in the appropriate `*.wants/` directory under `/etc/systemd/system/` or `/usr/lib/systemd/system/` to cause automatic start on boot.

## Worked Examples
### Example 1: Inspecting the Init Process
```bash
# Show PID 1’s command line and state
$ ps -p 1 -o pid,ppid,comm,state
  PID  PPID COMMAND         S
    1     0 systemd         S

# Examine its wait-channel (should be waiting on SIGCHLD)
$ cat /proc/1/status | grep -E 'Name|State|SigBlk|SigCatch'
Name:   systemd
State:  S (sleeping)
SigBlk: 0000000000000000
SigCatch: 0000000000000000
```
*Why?* PID 1 stays in `S` (sleeping) in `wait4()` for child termination; it blocks no signals and catches none, letting the default `SIGCHLD` handler reap children.

### Example 2: Starting a Service with Dependencies
Consider a custom service `myapp.service` that needs `network-online.target` and `local-fs.target` to be up before it starts.

**Unit file** (`/etc/systemd/system/myapp.service`):
```ini
[Unit]
Description=My Example Application
After=network-online.target local-fs.target
Wants=network-online.target local-fs.target

[Service]
Type=simple
ExecStart=/usr/local/bin/myapp --config /etc/myapp.conf
Restart=on-failure
TimeoutStartSec=30

[Install]
WantedBy=multi-user.target
```
**Explanation**:
- `Wants=` adds edges `myapp → network-online.target` and `myapp → local-fs.target` (soft dependencies).
- `After=` adds reverse edges `network-online.target → myapp` and `local-fs.target → myapp`, ensuring the targets are *started* before `myapp` begins.
- Systemd builds the DAG, computes a topological order, and launches `myapp` only after both targets report `active`.

**Verification**:
```bash
$ sudo systemctl daemon-reload          # parse new unit
$ sudo systemctl start myapp
$ sudo systemctl status myapp
● myapp.service - My Example Application
   Loaded: loaded (/etc/systemd/system/myapp.service; disabled; vendor preset: disabled)
   Active: active (running) since Thu 2025-09-16 10:12:34 UTC; 5s ago
 Main PID: 8423 (myapp)
    Tasks: 4 (limit: 4915)
   Memory: 12.3M
   CGroup: /system.slice/myapp.service
           └─8423 /usr/local/bin/myapp --config /etc/myapp.conf
```
*Why does it show `Active: active (running)`?* The `Type=simple` contract tells systemd the service is ready as soon as the `execve` succeeds; systemd transitions to `active` immediately after the fork/exec.

### Example 3: Measuring Boot Impact with `systemd-analyze`
```bash
$ systemd-analyze
Startup finished in 2.314s (kernel) + 1.842s (userspace) = 4.156s
 graphical.target reached after 1.842s in userspace

$ systemd-analyze blame
          820ms systemd-modules-load.service
          540ms lvm2-monitor.service
          410ms dev-sda1.device
          300ms NetworkManager-wait-online.service
          210ms systemd-udev-trigger.service
          ...
```
*Derivation*: If we model each service’s start time as $t_i$ and the dependency DAG’s longest path length as $L = \max\limits_{path} \sum_{i \in path} t_i$, then the reported userspace time (1.842 s) approximates $L$. The `blame` output lists individual $t_i$ for services on or near the critical path.

## Common Mistakes
1. **Confusing `Wants=` with `Requires=`**  
   *What’s wrong*: Assuming `Wants=` prevents a service from starting if the dependency fails.  
   *Why*: `Wants=` creates a soft dependency; the service will still start even if the listed unit fails to activate. Only `Requires=` adds a hard dependency that aborts the dependent unit if the required unit fails.  
   *Fix*: Use `Requires=` when the service cannot function without the dependency (e.g., a database needing its filesystem mounted).

2. **Neglecting to run `systemctl daemon-reload` after editing a unit file**  
   *What’s wrong*: Changes appear to have no effect; `systemctl status` still shows the old `ExecStart=`.  
   *Why*: Systemd caches parsed unit files in memory; it only checks for changes on filesystem events when the daemon receives a `SIGHUP` or explicit reload command.  
   *Fix*: Always run `sudo systemctl daemon-reload` after creating or modifying any unit under `/etc/systemd/system/` or `/run/systemd/system/`.

3. **Using `service` command on a systemd host**  
   *What’s wrong*: `service httpd start` may succeed on older sysvinit systems but on systemd it merely redirects to `systemctl` and can mask errors, especially for services with non‑standard names.  
   *Why*: The `service` script translates the name to a unit file (appending `.service`) and calls `systemctl`. If a unit is masked or the name does not match a unit, the script prints a misleading “unused” message.  
   *Fix*: Prefer `systemctl` directly; it gives full control over masking, environment, and returns accurate exit codes.

4. **Assuming a service is active immediately after `systemctl start`**  
   *What’s wrong*: Checking `$?` or `ps` right after start and concluding success, while the service may still be in the `activating` state or fail shortly after.  
   *Why*: For `Type=notify` or `Type=forking`, the main process may not yet have signaled readiness; systemd only moves to `active` after receiving the notification or detecting the forked child’s exit.  
   *Fix*: Use `systemctl is-active --wait myapp` or `systemctl status myapp` and watch for `Active: active (running)`; alternatively, check `Main PID` and journal logs with `journalctl -u myapp -f`.

## Exercises
### Easy
1. **Check init state** – Run `ps -p 1 -o pid,comm,state` and `cat /proc/1/status`. Explain why the `State` field shows `S` (sleeping).  
2. **Start/stop a service** – `sudo systemctl start sshd` then `sudo systemctl status sshd`. Stop it and verify the change in `Active:` and `Main PID`.  

### Medium
1. **Create a oneshot service** – Write `/etc/systemd/system/hello-once.service` that runs `/usr/bin/logger "Hello from oneshot"` on start. Enable it, reboot, and confirm the message appears in `journalctl -b`.  
2. **Dependency ordering** – Create two services `first.service` (`ExecStart=/bin/sleep 10`) and `second.service` (`After=first.service; Wants=first.service`). Start `second.service` and measure the delay before it activates using `systemctl --no-pager status second.service`.  

### Hard
1. **Debug a failing service** – Write a faulty service that execs a non‑binary (`ExecStart=/bin/false`). Start it, capture its journal (`journalctl -u faulty.service`), and explain why the state goes to `failed` and what `Result=exit-code` signifies.  
2. **Analyze boot critical path** – On a VM, run `systemd-analyze plot > boot.svg`. Open the SVG, identify the longest chain of services, and calculate the theoretical minimum userspace time assuming each service could start instantly except for its own `ExecStart` duration (use `systemd-analyze blame` to get individual times). Compare to the actual userspace time reported by `systemd-analyze`.  

## Linux Connection
### Key Files and Directories
| Path | Purpose |
|------|---------|
| `/usr/lib/systemd/system/` | Vendor‑provided unit files (read‑only). |
| `/run/systemd/system/` | Runtime‑generated units (e.g., from `systemd-tmpfiles`). |
| `/etc/systemd/system/` | Administrator overrides; highest priority. |
| `/etc/systemd/system/<target>.wants/` | Symlinks created by `systemctl enable` to pull in units for a target. |
| `/proc/1/` | Information about PID 1 (the init process). |
| `/run/systemd/inhibit/` | Inhibitor locks that can delay shutdown or sleep. |
| `/var/log/journal/` | Persistent journal data accessed via `journalctl`. |
| `/sys/fs/cgroup/systemd/` | cgroup v2 hierarchy where systemd places each service. |

### Illustrative Commands
```bash
# Show the cgroup placement of a service
$ systemctl status nginx
● nginx.service - The NGINX HTTP and Reverse Proxy Server
   Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)
   Active: active (running) since Thu 2025-09-16 10:05:12 UTC; 8min ago
 Main PID: 2984 (nginx)
    Tasks: 2 (limit: 4915)
   Memory: 14.2M
   CGroup: /system.slice/nginx.service
           ├─2984 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
           └─2985 nginx: worker process

# Verify that the service’s cgroup matches the path shown above
$ cat /proc/2984/cgroup
0::/system.slice/nginx.service

# List all units that are pulled into multi-user.target
$ systemctl list-dependencies multi-user.target
multi-user.target
├─systemd-modules-load.service
├─systemd-journald.socket
├─systemd-udev-control.socket
├─[...]
└─nginx.service

# Examine the kernel’s init argument (what the kernel executed)
$ cat /proc/1/cmdline
/usr/lib/systemd/systemd --system --deserialize 21
```
*Note*: The kernel passes `--system` to indicate a system instance and `--deserialize` with a fd for early‑boot state (used by initramfs).  

## Why This Matters
Understanding the init system is not memorizing commands; it is grasping **how the kernel hands control to user space**, how **process lifecycle** is managed by PID 1, and how **service dependencies** shape boot latency and reliability.  

- **Reliability**: Proper `Requires=`/`After=` edges prevent services from starting before their prerequisites, eliminating race conditions that cause data corruption or service failures.  
- **Performance**: By modeling the boot process as a DAG, administrators can identify and shorten the critical path (using `systemd-analyze blame` and `plot`), directly reducing time‑to‑login.  
- **Security**: Systemd’s cgroup isolation, capability bounding, and `ProtectSystem=`/`ProtectHome=` options shrink the attack surface of each service. Knowing where these controls live (`/etc/systemd/system/<unit>.d/`) lets you harden the system without patching binaries.  
- **Operational clarity**: Distinguishing `Wants=` from `Requires=`, recognizing the difference between `start` and `enable`, and using `journalctl` for real‑time diagnostics turns routine administration into predictable, repeatable workflows.  

Mastering these concepts equips you to design, debug, and tune Linux systems from embedded devices to cloud‑scale clusters—forming the bedrock for advanced topics such as container orchestration, real‑time kernels, and security‑focused hardening.
