---
id: 94
title: "Processes in practice"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Why This Matters

Every running program lives inside a control structure the kernel enforces whether you think about it or not: a session, a process group, and possibly a controlling terminal. When you press Ctrl-C, the kernel doesn't search for "the current program" — it delivers `SIGINT` to every process in the foreground process group by walking `session→foreground_pgid→task list`. When a server accumulates zombie children until `fork()` returns `EAGAIN`, that's a missing `SIGCHLD` handler. When `cmd1 | cmd2 | cmd3` stops atomically on Ctrl-Z, that's `SIGTSTP` hitting a shared process group. The bugs from getting this wrong — lost signals, handler deadlocks, zombie floods — appear under load, not in testing.

---

## Core Concepts

### Signals as Kernel-Delivered Bitmask Notifications

A signal is an integer notification delivered by the kernel to a process or thread. It carries no payload beyond its number — except when `SA_SIGINFO` is set, in which case the kernel also fills a `siginfo_t` describing the sender, the faulting address, or the timer ID.

The kernel records a pending standard signal by setting bit $k$ in `task_struct->pending.signal`, a `sigset_t` bitmask. Because it is a bitmask, sending signal $k$ twice before delivery yields exactly one delivery:

$$\text{pending}[k] \mathbin{|}= 1 \implies \text{pending}[k] = 1 \quad \forall \text{ repetitions}$$

Realtime signals (`SIGRTMIN` through `SIGRTMAX`) are different: the kernel maintains a linked list of `struct sigqueue` nodes, so $n$ sends produce $n$ deliveries in FIFO order, each with its own `siginfo_t`. The queue depth is bounded by `RLIMIT_SIGPENDING` (inspect it with `cat /proc/self/limits | grep pending`).

### Signal Disposition

Each signal has exactly one of three dispositions at any moment:

| Disposition | Effect on delivery |
|---|---|
| Default | Signal-specific: terminate, core dump, stop, continue, or ignore |
| `SIG_IGN` | Kernel discards the signal before delivery — it never becomes pending in a meaningful sense |
| Handler | Kernel saves process state, redirects execution to the registered function |

`SIGKILL` and `SIGSTOP` have no disposition choice. The kernel hard-codes their handling inside `complete_signal()` in `kernel/signal.c`. No `sigaction`, no `sigprocmask`, no `SIG_IGN` can override them. This is the kernel's guarantee of last resort.

The distinction between `SIG_IGN` and blocking matters: **blocking defers delivery** (the signal stays pending and fires when unblocked); **ignoring discards it** (it never fires). A process that ignores `SIGCHLD` tells the kernel to auto-reap children. A process that blocks `SIGCHLD` collects it later with `sigwaitinfo` or by unblocking.

### Signal Mask Per Thread

Each thread maintains a `sigset_t` signal mask. Signals in the mask are blocked — deferred, not dropped. The mask is inherited across `fork()` and preserved across `execve()`, which is why daemons and setuid helpers must explicitly reset it with `sigprocmask(SIG_SETMASK, &empty, NULL)` before invoking untrusted code.

In a multithreaded process, `sigprocmask(2)` is officially undefined; use `pthread_sigmask(3)`. A signal sent to a process (rather than a specific thread via `tgkill`) is delivered to any thread that doesn't have it blocked. The kernel selects among eligible threads non-deterministically.

### Reliable Signal Semantics

Original UNIX signals (pre-POSIX) reset the disposition to default after each delivery and had no way to block signals during handler execution. A second `SIGINT` arriving during an `SIGINT` handler would kill the process. `sigaction(2)` with POSIX semantics fixes both: the handler remains installed, and the delivered signal is automatically added to the thread's mask for the handler's duration (unless `SA_NODEFER` is set, which re-enables recursive delivery of the same signal).

### Process Groups, Sessions, and Controlling Terminals

```
Session (SID = leader PID)
  ├── Foreground process group (PGID)
  │     ├── shell
  │     └── foreground job processes
  └── Background process groups
        └── background job processes
```

A *session* is created by `setsid(2)`, which makes the calling process a session leader with a new SID equal to its PID and no controlling terminal. A session acquires a controlling terminal when a session leader opens a terminal device without `O_NOCTTY` — or explicitly via `TIOCSCTTY` ioctl.

The terminal driver holds the session's foreground PGID. When you type Ctrl-C, the driver calls `kill(-foreground_pgid, SIGINT)` — one `kill()` call targeting a PGID. Background processes reading from the terminal receive `SIGTTIN` and stop; writing (without `stty tostop`) is permitted by default.

`getpgrp()`, `getpgid(pid)`, `getsid(pid)` expose the hierarchy. Inspect any process:

```bash
ps -o pid,ppid,pgid,sid,tty,comm -p $$
```

### Daemons

A daemon is a process with no controlling terminal, running in its own session. The canonical sequence:

1. `fork()` — parent exits. The child is guaranteed not to be a process group leader (its PID ≠ parent's PGID), which is required for `setsid()`.
2. `setsid()` — new session, new process group, no controlling terminal.
3. `fork()` again — the grandchild is not a session leader, so it can never accidentally reacquire a controlling terminal by opening a tty without `O_NOCTTY`. This second fork is a defense, not a requirement.
4. `chdir("/")` — releases any mount point the daemon might hold open.
5. Redirect or close fd 0, 1, 2 — prevents accidental reads/writes to a terminal that may no longer exist.
6. `umask(0)` or an explicit `umask(022)` — the daemon shouldn't inherit unexpected file creation masks.

Modern Linux: `sd_notify(3)` and the `Type=notify` systemd unit replace the double-fork with a simpler model, but the kernel semantics are identical.

---

## How It Works

### Sending Signals

```c
#include <signal.h>
#include <unistd.h>

kill(target_pid, SIGTERM);    // to a specific process
kill(-pgrp,      SIGTERM);    // to an entire process group
kill(0,          SIGUSR1);    // to every process in the caller's process group
raise(SIGUSR1);               // to yourself; equivalent to kill(getpid(), SIGUSR1)
tgkill(getpid(), gettid(), SIGUSR1);  // to a specific thread in this process
```

Kernel path: `kill(2)` → `sys_kill()` → `__send_signal()` in `kernel/signal.c` → sets the pending bit (or enqueues a `sigqueue` node for RT signals) in `task_struct->pending` → if the target is sleeping interruptibly (`TASK_INTERRUPTIBLE`), calls `wake_up_process()`. The signal is *delivered* — and the handler actually runs — at the next transition from kernel mode to user mode (syscall return, interrupt return, or schedule).

The gap between *pending* and *delivered* matters: a signal can be pending for an arbitrarily long time if the target is in uninterruptible sleep (`TASK_UNINTERRUPTIBLE`, shown as `D` in `ps`). Even `SIGKILL` cannot terminate a process in `D` state until it returns from kernel space.

### Installing a Handler

```c
#include <signal.h>
#include <unistd.h>
#include <stdio.h>

static volatile sig_atomic_t got_sigint = 0;

static void handler(int sig) {
    /* Only async-signal-safe operations here.
       sig_atomic_t write is safe; printf is not. */
    got_sigint = 1;
}

int main(void) {
    struct sigaction sa = {
        .sa_handler = handler,
        .sa_flags   = SA_RESTART,  /* restart EINTR syscalls automatically */
    };
    sigemptyset(&sa.sa_mask);
    sigaddset(&sa.sa_mask, SIGQUIT);  /* also block SIGQUIT while in handler */

    if (sigaction(SIGINT, &sa, NULL) == -1) {
        perror("sigaction");
        return 1;
    }

    while (!got_sigint)
        pause();

    puts("caught SIGINT");
    return 0;
}
```

`SA_RESTART` causes the kernel to transparently restart certain slow syscalls (`read`, `write`, `accept`, `nanosleep`, etc.) when interrupted by this signal rather than returning `-1` with `errno == EINTR`. Not all syscalls restart — `poll`, `select`, `epoll_wait`, and `futex` with timeouts do not, regardless of `SA_RESTART`. Verify with `man 7 signal` under "Interruption of system calls."

### Async-Signal-Safe Functions

Inside a signal handler, you may only call functions listed as async-signal-safe in `man 7 signal`. The reason is reentrancy: if a signal interrupts a call to `malloc()` while the heap lock is held, calling `malloc()` again inside the handler deadlocks. The safe pattern is:

```c
/* Safe: write() is async-signal-safe */
static void handler(int sig) {
    const char msg[] = "caught\n";
    write(STDERR_FILENO, msg, sizeof(msg) - 1);
    _exit(1);   /* _exit is safe; exit() (which flushes stdio) is not */
}
```

The correct general approach for complex logic: block the signal, use
