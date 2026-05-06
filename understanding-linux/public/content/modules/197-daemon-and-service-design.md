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

## Core Concepts
A **daemon** is a long‑running process that detaches from any controlling terminal and operates in the background to provide system‑wide services. Unlike ordinary interactive programs, a daemon must:

1. **Run without a terminal** – otherwise it would receive `SIGINT`/`SIGQUIT` from the keyboard and could be stopped inadvertently.
2. **Not inherit the caller’s environment** – file descriptors, umask, working directory, and session ID must be reset to known safe values to avoid leaking resources or affecting other processes.
3. **Be immune to terminal‑generated signals** – after detachment the daemon should only respond to explicit management signals (`SIGTERM`, `SIGHUP`, `SIGUSR1`, etc.) that the system administrator or a supervisor sends.

These requirements follow from the Unix process model:

* **Fork semantics** – `fork()` creates a child with a **copy‑on‑write** duplicate of the parent’s memory pages, file‑descriptor table, signal dispositions, and credentials. The child inherits **open file descriptors**; unless they are explicitly closed, they remain usable and can cause descriptor leaks.
* **Session and process groups** – A new session created by `setsid()` makes the process a **session leader** with no controlling terminal. This prevents the kernel from delivering terminal‑generated signals (e.g., `SIGINT` from `Ctrl+C`) to the daemon.
* **Resource limits** – The maximum number of file descriptors a process may hold is given by `RLIMIT_NOFILE`. Daemons must close **all** descriptors up to this limit, not an arbitrary constant like 1024, to be portable across systems with different limits.
* **Umask** – The file creation mask (`umask`) determines the default permission bits for newly created files. Daemons typically set a restrictive umask (e.g., `022`) to avoid inadvertently creating world‑writable files.

Understanding these mechanisms lets us reason about why each step in the canonical daemon‑startup sequence is necessary, rather than treating it as a magical recipe.

## How It Works
### Detailed daemon initialization
Below is the canonical sequence, with the **why** and error‑checking for each syscall.

```c
#define _XOPEN_SOURCE 700   /* for daemon() declaration if needed */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <sys/resource.h>
#include <sys/stat.h>

static void daemonize(void)
{
    pid_t pid;

    /* 1. Fork and exit parent – ensures the child is not a process group leader */
    pid = fork();
    if (pid < 0) {
        perror("fork");
        exit(EXIT_FAILURE);
    }
    if (pid > 0)               /* parent */
        exit(EXIT_SUCCESS);    /* child continues */

    /* 2. Create a new session – detach from any controlling terminal */
    if (setsid() < 0) {
        perror("setsid");
        exit(EXIT_FAILURE);
    }
    /* After setsid(): the process is session leader, has no controlling tty,
       and its process group ID equals its PID. */

    /* 3. Optional second fork – prevents the daemon from ever acquiring a
       controlling terminal again (important for programs that may call
       open() with O_NOCTTY). */
    pid = fork();
    if (pid < 0) {
        perror("fork 2");
        exit(EXIT_FAILURE);
    }
    if (pid > 0)
        exit(EXIT_SUCCESS);    /* intermediate parent exits */
    /* Now we are the grandchild; guaranteed not to be a session leader. */

    /* 4. Change working directory to a safe, neutral location */
    if (chdir("/") < 0) {
        perror("chdir");
        exit(EXIT_FAILURE);
    }
    /* Changing dir avoids keeping a mounted filesystem busy, which would
       block umount operations. */

    /* 5. Reset file creation mask */
    umask(022);                /* default: rw-r--r-- for files, rwxr-xr-x for dirs */

    /* 6. Close all inherited file descriptors */
    {
        struct rlimit rl;
        if (getrlimit(RLIMIT_NOFILE, &rl) == 0) {
            for (int fd = 0; fd < rl.rlim_max; ++fd)
                close(fd);
        } else {
            /* Fallback: close up to a large number if getrlimit fails */
            for (int fd = 0; fd < 1024; ++fd)
                close(fd);
        }
    }

    /* 7. Redirect standard descriptors to /dev/null */
    int nullfd = open("/dev/null", O_RDWR);
    if (nullfd < 0) {
        perror("open /dev/null");
        exit(EXIT_FAILURE);
    }
    if (dup2(nullfd, STDIN_FILENO)  < 0 ||
        dup2(nullfd, STDOUT_FILENO) < 0 ||
        dup2(nullfd, STDERR_FILENO) < 0) {
        perror("dup2");
        exit(EXIT_FAILURE);
    }
    if (nullfd > STDERR_FILENO)    /* close the original descriptor if duplicated */
        close(nullfd);
}
```

#### Why each step matters
* **Fork‑exit** – Guarantees the child is **not** a process group leader, a prerequisite for `setsid()` to succeed.
* **Setsid()** – Creates a new session; the kernel automatically **disassociates** the process from any controlling terminal, preventing accidental terminal signals.
* **Second fork** – Ensures the daemon **cannot** reacquire a controlling terminal even if it later calls a library function that tries to allocate one (e.g., some GUI toolkits). This is the *double‑fork* pattern used by many robust daemons.
* **Chdir("/")** – Releases any hold on a mounted filesystem; otherwise `umount` would fail with “target is busy”.
* **Umask** – Sets a known baseline for file permissions; inheriting a loose umask from the parent could lead to security issues.
* **Close all fds** – Prevents descriptor leaks that would waste kernel resources and could expose unintended files to the daemon. Using `getrlimit(RLIMIT_NOFILE)` makes the loop portable.
* **Redirect to /dev/null** – Guarantees that any inadvertent writes to `stdin/stdout/stderr` are discarded, and reads return EOF immediately.

### Signal handling with `sigaction`
The historic `signal()` function is unreliable because its behavior varies across implementations and it does not allow safe modification of the signal mask. `sigaction()` provides full control:

```c
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>

static void term_handler(int sig)
{
    /* Async‑signal‑safe: only use functions guaranteed safe inside a handler */
    const char msg[] = "Received SIGTERM, shutting down\n";
    write(STDERR_FILENO, msg, sizeof(msg)-1);
    /* Set a volatile flag checked by the main loop */
    extern volatile sig_atomic_t terminate;
    terminate = 1;
}

int main(void)
{
    struct sigaction sa;
    sa.sa_handler = term_handler;
    sigemptyset(&sa.sa_mask);          /* no additional blocked signals */
    sa.sa_flags = 0;                   /* no SA_RESTART; we will handle EINTR */
    if (sigaction(SIGTERM, &sa, NULL) == -1) {
        perror("sigaction");
        exit(EXIT_FAILURE);
    }

    /* Main loop – check terminate flag */
    volatile sig_atomic_t terminate = 0;
    while (!terminate) {
        /* Perform work; if interrupted by a signal, errno==EINTR */
        pause();                       /* efficient sleep until a signal */
    }
    return 0;
}
```

* **Why `sigemptyset(&sa.sa_mask)`?** – By default, the handler executes with the signal that invoked it blocked; we explicitly define which additional signals should be blocked during handler execution.
* **Why `SA_RESTART` omitted?** – We prefer to handle `EINTR` explicitly (e.g., restarting `read()`/`write()` loops) to demonstrate full control; `SA_RESTART` would automatically restart certain syscalls, hiding the need for error‑checking.
* **Async‑signal‑safety** – Only a limited set of functions (e.g., `write`, `_exit`, `sigatomic_t` operations) are safe inside a handler; calling `printf()` or `malloc()` can lead to deadlock or memory corruption.

## Worked Examples
### Example 1: A logging daemon that writes a timestamp every 5 seconds
We combine the daemonization code with a simple timer using `clock_nanosleep()` (monotonic, unaffected by system‑time changes).

```c
#define _XOPEN_SOURCE 700
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <time.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <string.h>

static volatile sig_atomic_t stop = 0;

static void term_handler(int sig)
{
    (void)sig;                     /* unused */
    stop = 1;
}

static void daemonize(void)
{
    pid_t pid;

    pid = fork();
    if (pid < 0) { perror("fork"); exit(EXIT_FAILURE); }
    if (pid > 0) exit(EXIT_SUCCESS);

    if (setsid() < 0) { perror("setsid"); exit(EXIT_FAILURE); }

    /* Second fork */
    pid = fork();
    if (pid < 0) { perror("fork 2"); exit(EXIT_FAILURE); }
    if (pid > 0) exit(EXIT_SUCCESS);

    if (chdir("/") < 0) { perror("chdir"); exit(EXIT_FAILURE); }
    umask(022);

    struct rlimit rl;
    if (getrlimit(RLIMIT_NOFILE, &rl) == 0) {
        for (int fd = 0; fd < rl.rlim_max; ++fd) close(fd);
    } else {
        for (int fd = 0; fd < 1024; ++fd) close(fd);
    }

    int nullfd = open("/dev/null", O_RDWR);
    if (nullfd < 0) { perror("open /dev/null"); exit(EXIT_FAILURE); }
    dup2(nullfd, STDIN_FILENO);
    dup2(nullfd, STDOUT_FILENO);
    dup2(nullfd, STDERR_FILENO);
    if (nullfd > STDERR_FILENO) close(nullfd);
}

int main(void)
{
    struct sigaction sa;
    sa.sa_handler = term_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0;
    if (sigaction(SIGTERM, &sa, NULL) == -1) {
        perror("sigaction SIGTERM");
        exit(EXIT_FAILURE);
    }

    daemonize();

    /* Open log file with append mode, create if missing */
    int logfd = open("/var/log/mydaemon.log",
                     O_WRONLY | O_CREAT | O_APPEND, 0644);
    if (logfd < 0) {
        perror("open log");
        exit(EXIT_FAILURE);
    }

    struct timespec interval = { .tv_sec = 5, .tv_nsec = 0 };
    struct timespec remaining;

    while (!stop) {
        time_t now = time(NULL);
        char timestamp[64];
        strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", localtime(&now));
        int n = dprintf(logfd, "%s daemon heartbeat\n", timestamp);
        if (n < 0) { perror("dprintf"); break; }

        /* Sleep, but restart if interrupted by a signal */
        if (clock_nanosleep(CLOCK_MONOTONIC, 0, &interval, &remaining) == -1 &&
            errno == EINTR) {
            interval = remaining;   /* sleep the rest of the interval */
        }
    }

    close(logfd);
    return 0;
}
```

**Step‑by‑step reasoning**
1. **Signal preparation** – Install a handler for `SIGTERM` that merely sets a `volatile sig_atomic_t` flag; this is async‑signal‑safe.
2. **Daemonization** – Uses the double‑fork, `setsid()`, chdir, umask, fd‑close, and `/dev/null` redirection as proven necessary.
3. **Log file** – Opened with `O_APPEND` so multiple instances (if any) safely coexist; mode `0644` respects the umask we set earlier.
4. **Timing loop** – `clock_nanosleep()` with `CLOCK_MONOTONIC` provides a drift‑free interval; we handle `EINTR` to preserve the exact 5‑second period even if a signal arrives.
5. **Termination** – When `stop` becomes true, we flush and close the log file, then exit cleanly.

### Example 2: Daemon that reloads its configuration on `SIGHUP` and exits on `SIGTERM`
Illustrates handling multiple signals and re‑initializing resources without restarting the process.

```c
#define _XOPEN_SOURCE 700
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/stat.h>

static volatile sig_atomic_t reload_requested = 0;
static volatile sig_atomic_t terminate_requested = 0;

static void hup_handler(int sig)  { (void)sig; reload_requested = 1; }
static void term_handler(int sig) { (void)sig; terminate_requested = 1; }

static void load_config(const char *path)
{
    FILE *fp = fopen(path, "r");
    if (!fp) { perror("fopen config"); return; }
    char line[256];
    while (fgets(line, sizeof(line), fp)) {
        /* In a real daemon we would parse key=value pairs here */
        fprintf(stderr, "config: %s", line);
    }
    fclose(fp);
}

static void daemonize(void)
{
    pid_t pid = fork();
    if (pid < 0) { perror("fork"); exit(EXIT_FAILURE); }
    if (pid > 0) exit(EXIT_SUCCESS);

    if (setsid() < 0) { perror("setsid"); exit(EXIT_FAILURE); }

    pid = fork();
    if (pid < 0) { perror("fork 2"); exit(EXIT_FAILURE); }
    if (pid > 0) exit(EXIT_SUCCESS);

    if (chdir("/") < 0) { perror("chdir"); exit(EXIT_FAILURE); }
    umask(022);

    struct rlimit rl;
    if (getrlimit(RLIMIT_NOFILE, &rl) == 0) {
        for (int fd = 0; fd < rl.rlim_max; ++fd) close(fd);
    } else {
        for (int fd = 0; fd < 1024; ++fd) close(fd);
    }

    int nullfd = open("/dev/null", O_RDWR);
    if (nullfd < 0) { perror("open /dev/null"); exit(EXIT_FAILURE); }
    dup2(nullfd, STDIN_FILENO);
    dup2(nullfd, STDOUT_FILENO);
    dup2(nullfd, STDERR_FILENO);
    if (nullfd > STDERR_FILENO) close(nullfd);
}

int main(void)
{
    struct sigaction sa;
    sa.sa_handler = hup_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0;
    if (sigaction(SIGHUP, &sa, NULL) == -1) { perror("sigaction SIGHUP"); exit(EXIT_FAILURE); }

    sa.sa_handler = term_handler;
    if (sigaction(SIGTERM, &sa, NULL) == -1) { perror("sigaction SIGTERM"); exit(EXIT_FAILURE); }

    daemonize();

    const char *config_path = "/etc/mydaemon.conf";
    load_config(config_path);   /* initial load */

    while (!terminate_requested) {
        if (reload_requested) {
            reload_requested = 0;
            load_config(config_path);   /* re‑read without restart */
        }
        /* Do useful work here – we just sleep */
        pause();   /* efficient wait for a signal */
    }

    return 0;
}
```

**Explanation**
* Two independent handlers set flags; the main loop checks them safely.
* `SIGHUP` triggers a **configuration reload** – a common daemon convention that avoids the expense of a full restart.
* The daemon stays in `pause()` until a signal arrives, minimizing CPU usage.

## Common Mistakes
| # | Mistake | Why it’s wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Closing file descriptors with a fixed limit (e.g., `for (i=0;i<1024;i++) close(i);`)** | The actual limit is given by `RLIMIT_NOFILE`. On systems where the limit is >1024 (modern containers often allow 4096+), inherited descriptors >1024 remain open, leaking resources and potentially exposing privileged files. | File‑descriptor exhaustion; `EMFILE` errors in later `open()` calls; security risk if a descriptor refers to a sensitive file. |
| 2 | **Using `signal()` instead of `sigaction()`** | `signal()` semantics differ between BSD and System V; it does not let you block other signals during handler execution, and it may reset the handler to `SIG_DFL` after invocation on some platforms. | Unreliable signal handling; missed signals; race conditions leading to zombie processes or deadlocks. |
| 3 | **Neglecting to reset the umask** | Inheriting a loose umask (e.g., `000`) from a shell can cause the daemon to create world‑writable files or directories, violating the principle of least privilege. | Potential privilege escalation if other users can modify daemon‑created files (e.g., log files, PID files). |
| 4 | **Forking only once and omitting the second fork** | After the first `setsid()`, the daemon is still a **session leader**. If it later opens a terminal device (e.g., via a library that calls `open("/dev/tty", …)`), it may accidentally acquire a controlling terminal, making it vulnerable to `SIGINT`/`SIGQUIT` from the keyboard. | Daemon may stop unexpectedly when a user presses `Ctrl+C` on any terminal that happens to be opened. |
| 5 | **Writing log messages with `printf()` inside a signal handler** | `printf()` uses internal locks and malloc‑like structures; calling it from an async‑signal context can deadlock if the signal interrupts a thread that already holds the same lock, or corrupt the heap. | Intermittent hangs, corrupted log output, or crashes. |
| 6 | **Failing to check return values of `fork()`, `setsid()`, `open()`, etc.** | System calls can fail for reasons like resource exhaustion (`EAGAIN`, `ENOMEM`) or permission issues (`EACCES`). Ignoring these leads to undefined behavior (e.g., continuing as if a daemon had been created). | Silent daemon failure; difficult debugging; service appears hung. |
| 7 | **Using `sleep()` in the main loop instead of a monotonic timer** | `sleep()` can be interrupted early by signals, causing drift; also it measures **wall‑clock** time, which can jump backwards/forwards due to NTP adjustments, breaking periodic expectations. | Log entries appear at irregular intervals; monitoring alerts fire incorrectly. |

## Exercises
### Easy
1. **Basic logger** – Write a daemon that appends the current epoch time (seconds since 1970‑01‑01) to `/tmp/daemon.log` every 3 seconds.  
   *Requirements*:  
   - Use the double‑fork daemonization procedure.  
   - Handle `SIGTERM` to break the loop and close the log file cleanly.  
   - Check every syscall return value and `exit(EXIT_FAILURE)` on error with a descriptive `perror()`.

2. **Signal flag** – Modify the easy logger to also toggle a boolean flag on `SIGUSR1`; when the flag is set, prepend each log line with `[VERBOSE]`.  
   *Goal*: Practice async‑signal‑safe flag setting and checking in the main loop.

### Medium
3. **Double‑fork + umask** – Create a daemon that:
   - Sets `umask(002)` (group‑writable).  
   - Opens a file `/var/run/mydaemon.pid` with `O_CREAT|O_EXCL|O_WRONLY` to store its PID (fail if the file already exists).  
   - Implements a **SIGHUP** handler that closes and reopens the log file (log rotation).  
   - Uses `clock_nanosleep(CLOCK_MONOTONIC)` for a 10‑second interval, handling `EINTR`.

4. **Syslog integration** – Replace the plain file logger with the `syslog()` facility (`LOG_DAEMON`).  
   - Ensure the daemon calls `openlog("mydaemon", LOG_PID, LOG_DAEMON);` after daemonization.  
   - Log messages at `LOG_INFO` level.  
   - Verify output with `journalctl -u mydaemon -f`.

### Hard
5. **Supervised watchdog** – Write a daemon **watchdog** that:
   - Forks a child process that runs a target program (e.g., `/bin/sleep 30`).  
   - Uses `sigaction(SIGCHLD, …)` to reap the child and detect its exit status.  
   - If the child terminates unexpectedly (non‑zero exit or killed by a signal), the watchdog restarts it after a 5‑second back‑off, doubling the delay on each successive failure up to a maximum of 60 seconds.  
   - Logs each start, stop, and restart event to syslog.  
   - Responds to `SIGTERM` by sending `SIGTERM` to the child, waiting for its exit, then exiting itself.  
   - Must correctly daemonize (double‑fork, close fds, etc.) and avoid leaving zombie processes.

6. **Socket‑activated service** – Design a daemon that can be launched on demand by `systemd` via socket activation:  
   - The daemon inherits a listening socket file descriptor (passed via environment variable `LISTEN_FDS`).  
   - After daemonization, it must **not** close inherited descriptors >2 unless they are not the listening socket (check `LISTEN_FDS`).  
   - It then enters
