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

## Why This Matters

When the kernel finishes bootstrapping, it executes exactly one userspace binary — PID 1. Not as a convenience, but as a hard architectural boundary: the kernel's scheduler, wait-queue logic, and orphan-reaping mechanism all special-case PID 1. If that process exits, the kernel panics. If it leaks zombie children, the system eventually exhausts its PID namespace. If it starts services in the wrong order, those services silently operate on resources that don't exist yet. Everything on a running Linux system — every socket, every daemon, every login session — is a consequence of decisions made by PID 1.

## Core Concepts

### PID 1 and the Init Contract

The kernel hardcodes the exec of `/sbin/init` (falling back through `/etc/init`, `/bin/init`, `/bin/sh`) as PID 1. This is enforced in `kernel/pid.c` and `init/main.c` in the kernel source. Three properties follow from holding PID 1:

1. **SIGKILL immunity.** The kernel skips signal delivery to PID 1 for signals it does not explicitly handle. A runaway `kill -9 1` does nothing; the check is `is_global_init()` in `kernel/signal.c`.
2. **Orphan adoption.** When any process exits while still having children, those children are reparented to PID 1. This is the only guaranteed reaper on the system.
3. **Zombie accumulation.** If PID 1 never calls `wait()`, every orphaned child that exits becomes a zombie forever. Zombie entries hold a slot in the kernel's process table; the table is finite (default `pid_max` is 32768, tunable via `/proc/sys/kernel/pid_max`).

### Orphan Reaping

A process that has exited but whose exit status has not been collected by a `wait()` call occupies a `TASK_ZOMBIE` entry in the process table. The entry holds no memory pages or file descriptors — only the PID, exit status, and some accounting fields — but it does occupy a slot. With $N_{\max}$ = 32768 and a leaking PID 1, a sufficiently active system will hit the ceiling and `fork()` will start returning `EAGAIN`.

The kernel delivers `SIGCHLD` to the parent of any exiting process. PID 1 must handle this signal and drain its children with `waitpid()`:

```c
#include <sys/wait.h>
#include <signal.h>

static void reap(int sig) {
    (void)sig;
    int saved_errno = errno;
    while (waitpid(-1, NULL, WNOHANG) > 0)
        ;   /* drain all exited children in one handler invocation */
    errno = saved_errno;
}

/* In main(), before any fork(): */
struct sigaction sa = { .sa_handler = reap, .sa_flags = SA_RESTART };
sigaction(SIGCHLD, &sa, NULL);
```

The `while` loop is required because multiple children can exit between signal deliveries — POSIX signals do not queue, so a single `SIGCHLD` may represent $n \geq 1$ exits.

### Runlevels and Targets

SysV init models system state as a single integer called a *runlevel*:

| Level | Meaning |
|-------|---------|
| 0 | Halt |
| 1 | Single-user (maintenance) |
| 2–5 | Multi-user variants (distro-defined) |
| 6 | Reboot |

The init process reads `/etc/inittab` to determine the default runlevel and what scripts to execute on transitions. Scripts live under `/etc/rc.d/rcN.d/` (where `N` is the runlevel), named with a `S`/`K` prefix and a two-digit sequence number. On a transition to runlevel 3, init runs all `K` scripts in the *current* level (stopping services) and all `S` scripts in level 3 (starting services), in numeric order. The ordering is manual — there is no dependency graph, only sequence numbers.

Systemd replaces runlevels with *targets* — `.target` units that express ordering and dependency via `Requires=`, `Wants=`, `Before=`, and `After=` directives. `multi-user.target` is the rough equivalent of runlevel 3; `graphical.target` adds a display manager. The dependency graph is evaluated at activation time, allowing parallel startup of independent units.

### The utmp/wtmp Accounting Layer

The kernel records nothing about who is logged in or what runlevel is active. That information lives entirely in two binary files:

- `/var/run/utmp` — current login sessions and run state (volatile; often tmpfs)
- `/var/log/wtmp` — append-only historical log of all login/logout and runlevel events

Both files contain fixed-size `utmpx` records written by init, `getty`, `login`, and `sshd`. Their format is defined in `<utmpx.h>`:

```c
struct utmpx {
    short           ut_type;        /* type of record (see below) */
    pid_t           ut_pid;         /* PID of login process */
    char            ut_line[32];    /* terminal device, e.g. "tty1" */
    char            ut_id[4];       /* inittab id or abbreviation */
    char            ut_user[32];    /* username */
    char            ut_host[256];   /* hostname for remote logins */
    struct exit_status ut_exit;     /* exit status if DEAD_PROCESS */
    long            ut_session;     /* session ID */
    struct timeval  ut_tv;          /* time of entry */
    int32_t         ut_addr_v6[4];  /* IPv4 or IPv6 address */
};
```

Relevant `ut_type` constants:

| Constant | Value | Meaning |
|----------|-------|---------|
| `BOOT_TIME` | 2 | System boot timestamp |
| `RUN_LVL` | 1 | Runlevel change |
| `USER_PROCESS` | 7 | Active login session |
| `DEAD_PROCESS` | 8 | Session ended |

For a `RUN_LVL` record, the kernel version is stored in `ut_host` and the runlevel encoding is unconventional: `ut_user[0]` holds the *new* runlevel as an ASCII digit, and `ut_user[1]` holds the *previous* runlevel. This is why `runlevel(8)` reports two characters — it reads `ut_user[0]` and `ut_user[1]` directly from the most recent `RUN_LVL` record in utmp.

### Service Supervision

A supervisor separates two concerns: *starting* a service and *owning* it. Ownership means receiving `SIGCHLD` when the service exits, collecting its exit status, and deciding what to do next. The exit status word from `waitpid()` is a bitfield:

```
bits 15-8: exit code (if WIFEXITED)
bits  6-0: signal number (if WIFSIGNALED)
bit     7: core dump flag
```

Decoding it correctly:

```c
int status;
pid_t pid = waitpid(service_pid, &status, 0);

if (WIFEXITED(status)) {
    int code = WEXITSTATUS(status);
    /* code == 0: clean shutdown; don't restart unless policy says so */
    /* code != 0: service reported failure */
} else if (WIFSIGNALED(status)) {
    int sig  = WTERMSIG(status);
    int core = WCOREDUMP(status);   /* non-zero if /proc/sys/kernel/core_pattern fired */
    /* Crashed. Restart with backoff. */
}
```

A useful policy distinction: restart on `WIFSIGNALED` (crash) but not on `WIFEXITED` with code 0 (intentional stop). Systemd exposes this as `Restart=on-failure` vs `Restart=always`.

## How It Works

### The Minimal Init Loop

A complete minimal init that handles orphan reaping and supervised service restart:

```c
#include <sys/wait.h>
#include <sys/types.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <time.h>

#define MAX_SERVICES 16

typedef struct {
    const char *path;
    char *const *argv;
    pid_t        pid;
    int          failures;
    time_t       next_start;
} Service;

static Service services[MAX_SERVICES];
static int     nservices;

static void spawn(Service *s) {
    pid_t pid = fork();
    if (pid == 0) {
        execv(s->path, s->argv);
        _exit(127);     /* execv failed; _exit avoids flushing parent's stdio */
    }
    s->pid = pid;
}

int main(void) {
    /* Mount /proc, /sys, set hostname, etc. */
    /* Populate services[] and call spawn() for each */

    for (;;) {
        int status;
        pid_t pid = waitpid(-1, &status, 0);
        if (pid <= 0) continue;

        time_t now = time(NULL);

        for (int i = 0; i < nservices; i++) {
            if (services[i].pid != pid) continue;

            int crashed = WIFSIGNALED(status) ||
                          (WIFEXITED(status) && WEXITSTATUS(status) != 0);
            if (crashed) {
                services[i].failures++;
                /* backoff: delay = min(300, 1 * 2^failures) seconds */
                long delay = 1L << services[i].failures;
                if (delay > 300) delay = 300;
                services[i].next_start = now + delay;
            } else {
                services[i].failures = 0;
            }
        }

        /* Restart any service
