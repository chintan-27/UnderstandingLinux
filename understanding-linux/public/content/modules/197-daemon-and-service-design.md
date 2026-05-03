---
id: 197
title: "Daemon and service design"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A daemon is a process that runs without a controlling terminal, persists across user sessions, and responds to system events — but nothing about the Linux process model makes this automatic. Without deliberate design, a daemon leaks file descriptors, ignores termination signals, writes logs to a terminal that no longer exists, and leaves zombie children behind. Understanding *why* each piece of the design exists requires understanding what breaks without it.

## Core Concepts

### Lifecycle: Fork, Detach, and the Double-Fork

A process inherits its session ID (SID) and process group ID (PGID) from its parent. The kernel tracks both in `task_struct`. If you don't escape the original session, the terminal emulator or SSH session that spawned your process can deliver `SIGHUP` when it closes — killing your "daemon" silently.

The escape sequence:

1. **`fork()`** — parent exits. The child is now an orphan adopted by PID 1 (or the nearest subreaper set via `prctl(PR_SET_CHILD_SUBREAPER, ...)`). The shell's job control drops the process because job control tracks process groups, and the group leader just exited.
2. **`setsid()`** — child calls this. It succeeds only if the caller is *not* a process group leader (the fork guarantees this). The process becomes leader of a new session with no controlling terminal. Its SID equals its PID.
3. **Second `fork()`** — the session leader created by `setsid()` *can* acquire a controlling terminal by opening a terminal device (on Linux, without `O_NOCTTY` only if it is the session leader). The second fork produces a child that is not a session leader — `getpid() != getsid(0)` — so it cannot acquire one by accident.

After detach: close all inherited file descriptors, redirect stdin/stdout/stderr to `/dev/null`, and `chdir("/")` so the daemon does not hold a reference to a mount point that would block `umount`.

### Supervision: Who Watches the Watcher

The kernel does not restart processes. A process that exits is gone. Supervision is entirely a userspace policy layered on top of `fork`/`exec`/`waitpid`. A supervisor's job is to hold an accurate model of which children should be running and to re-execute them when they are not.

The restart policy matters more than the mechanism. Immediate restart on any exit causes a **crash loop**: a daemon that fails in 10 ms and restarts immediately consumes a full CPU core and may write gigabytes of logs in minutes. Exponential backoff is the standard mitigation. If the delay after the $n$-th consecutive failure is $d_n$, a common policy is:

$$d_n = \min(d_0 \cdot 2^n,\ d_{\max})$$

where $d_0$ is the initial delay (often 1 s) and $d_{\max}$ caps the wait (often 30–300 s). `systemd` implements this via `RestartSec=` and `StartLimitBurst=` / `StartLimitIntervalSec=` in the unit file.

The supervisor tree: `systemd` (PID 1) forks unit processes. Those processes may themselves fork workers. `systemd` watches only its direct children; worker supervision is the daemon's own responsibility.

### Signals: Asynchronous Control

When a process calls `kill(pid, signum)`, the kernel sets a bit in the target's `task_struct.pending` signal set. The signal is delivered at the next kernel–user transition (syscall return, interrupt return) or when the process is next scheduled after being woken. Delivery is not instantaneous — it is bounded by scheduling latency.

Signals carry no payload beyond their number. The total information content of a signal is $\log_2(64) = 6$ bits on x86-64 Linux (64 real-time + standard signals). `SIGTERM` tells you nothing about *why* termination was requested.

For daemon design, the conventional mapping is:

| Signal | Default action | Daemon convention | Why this convention |
|--------|---------------|-------------------|---------------------|
| `SIGTERM` | Terminate | Graceful shutdown | Sent by `systemd`/`kill` as the polite stop request |
| `SIGHUP` | Terminate | Reload configuration | Originally: terminal hangup; reused because daemons have no terminal to hang up |
| `SIGINT` | Terminate | Interactive stop | Ctrl-C from a terminal; usually equivalent to `SIGTERM` |
| `SIGCHLD` | Ignore | Reap zombie children | Kernel notifies parent when child state changes |
| `SIGUSR1/2` | Terminate | Application-defined | No kernel semantics; pure application convention |

None of this is enforced by the kernel. A daemon that does not install a `SIGHUP` handler will terminate on `SIGHUP` because the default action is termination.

### Logging: Where Output Goes

After detach, fd 1 and fd 2 point to `/dev/null`. Any `printf` or `write(2, ...)` call is silently discarded. Deliberate logging requires one of:

- **syslog protocol**: `openlog("mydaemon", LOG_PID, LOG_DAEMON)` followed by `syslog(LOG_ERR, "...")`. On modern systems this writes to the `AF_UNIX` datagram socket `/dev/log`. `systemd-journald` listens there and stores structured records in `/run/log/journal/` (volatile) and `/var/log/journal/` (persistent). Query with `journalctl -u myservice -f`.
- **Direct file**: Open a log file at startup, keep the fd. Survives config reloads. `logrotate` renames the file and then signals the daemon (typically `SIGHUP`) to call `close`/`reopen` so the new fd points to the fresh file. A daemon that ignores `SIGHUP` after rotation writes to the renamed (or deleted) inode indefinitely — disk space appears to be freed but is not, because the open fd holds a reference to the inode. Check with `lsof +L1` to find files with no directory entries but open file descriptors.

Under systemd, if a service has `StandardOutput=journal` in its unit file, the daemon does not need `syslog()` at all — writes to fd 1 and fd 2 are captured by the journal automatically via a pipe set up before `exec`.

### Configuration and Reloads

The reason signal handlers use a flag rather than doing work directly is that signal handlers run asynchronously on the same thread stack as the interrupted code. If `SIGHUP` arrives while the main loop is inside `malloc`, the handler calling `malloc` re-enters the allocator's internal lock — producing a deadlock that is nearly impossible to reproduce deterministically.

POSIX defines the set of **async-signal-safe** functions (listed in `signal-safety(7)`). It is short. `read`, `write`, `_exit`, `waitpid`, and `sigaction` are on it. `malloc`, `printf`, `fopen`, `syslog`, and nearly everything from `<stdio.h>` are not.

The safe pattern:

1. Signal handler writes `1` to a `volatile sig_atomic_t` flag. This is a single memory write, guaranteed atomic by the type.
2. Main event loop checks the flag on each iteration (or uses `pselect`/`ppoll` with a signal mask to wake on signal delivery).
3. Work happens in the main loop, not the handler.

## How It Works

### The Double-Fork in C

```c
#include <unistd.h>
#include <stdlib.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/resource.h>

void daemonize(void) {
    pid_t pid;

    /* First fork: parent exits, child is orphaned to init/subreaper */
    pid = fork();
    if (pid < 0)  exit(EXIT_FAILURE);
    if (pid > 0)  exit(EXIT_SUCCESS);   /* parent */

    /* Child is now guaranteed not a process group leader → setsid() succeeds */
    if (setsid() < 0) exit(EXIT_FAILURE);

    /* Second fork: child of session leader → cannot acquire controlling terminal */
    pid = fork();
    if (pid < 0)  exit(EXIT_FAILURE);
    if (pid > 0)  exit(EXIT_SUCCESS);   /* session leader exits */

    /* Daemon proper starts here */
    umask(0);       /* don't inherit restrictive umask from caller */
    chdir("/");     /* don't pin a mount point */

    /* Close every fd the process inherited.
       sysconf(_SC_OPEN_MAX) may return INT_MAX on Linux; cap it. */
    struct rlimit rl;
    getrlimit(RLIMIT_NOFILE, &rl);
    int maxfd = (rl.rlim_max == RLIM_INFINITY) ? 1024 : (int)rl.rlim_max;
    for (int fd = 0; fd < maxfd; fd++) close(fd);

    /* Reopen standard fds to /dev/null so accidental writes don't fail */
    int fd0 = open("/dev/null", O_RDWR);    /* fd 0 = stdin  */
    dup2(fd0, STDOUT_FILENO);               /* fd 1 = stdout */
    dup2(fd0, STDERR_FILENO);               /* fd 2 = stderr */
    /* fd0 is 0 already; if open() returned something else, close the extra */
    if (fd0 > 2) close(fd0);
}
```

Note: `sd_notify(0, "READY=1")` from `libsystemd` should be called after full initialization, not immediately after `daemonize()`. systemd waits for this notification when `Type=notify` is set in the unit file.

For new code, consider using `daemon(3)` from glibc, which performs the same sequence, or simply letting systemd manage the process lifecycle entirely via `Type=simple` or `Type=exec` and skipping the double-fork.

### Signal Handling with a Flag

```c
#include <signal.h>
#include <unistd.h
