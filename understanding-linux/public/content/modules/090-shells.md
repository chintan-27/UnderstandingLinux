---
id: 90
title: "Shells"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Core Concepts
### Sessions, Process Groups, and Job Control
A **session** is a kernel object that groups one or more process groups under a single controlling terminal. The session ID (`sid`) equals the process ID of the **session leader**, the first process in the session (usually the login shell). A session is created with the `setsid()` system call, which detaches the calling process from its current terminal, creates a new session, and makes the caller the session leader and the leader of a new process group.

A **process group** (or **job**) is a collection of processes that share a process group ID (`pgid`). The `pgid` equals the process ID of the **group leader**, the process that called `setpgid()` with `pgid == 0` or explicitly set the group ID. Processes in the same group receive terminal-generated signals (e.g., `SIGINT`, `SIGTSTP`) together, enabling job control.

**Job control** is the shell’s facility to manipulate process groups: start jobs in the background, stop them with `SIGTSTP`, resume with `SIGCONT`, and move them between foreground and background. The shell maintains a job table mapping job numbers to `pgid`s and tracks the terminal’s foreground process group via the `TCGETS/TCSETS` ioctls on the controlling terminal (`/dev/tty`). When the foreground process group changes, the kernel delivers `SIGTTIN`/`SIGTTOU` to background jobs that attempt to read/write the terminal.

### Signals
A **signal** is an asynchronous software interrupt identified by a positive integer (`signo`) and a symbolic name (e.g., `SIGINT = 2`). The kernel sends a signal by setting a bit in the task’s `pending.signal` bitmap and, if not blocked, invoking the signal handler via `do_signal()`. Signals can originate from:
* the kernel (e.g., `SIGSEGV` on invalid memory access),
* another process (via `kill(pid, signo)` or `killpg(pgid, signo)`),
* the process itself (via `raise()` or `pthread_kill()`).

Signal disposition is defined by `sigaction()`: `SIG_DFL` (default action), `SIG_IGN` (ignore), or a handler address. Real‑time signals (`SIGRTMIN`..`SIGRTMAX`) are queued; standard signals are not.

---

## How It Works
### Session Creation
1. **Caller invokes `setsid()`**.  
   - If the caller is already a session leader, `setsid()` returns `-1` with `EPERM`.  
   - Otherwise, the kernel allocates a new `struct pid` for the session, sets `session->sid = caller->pid`, and removes the caller from its old session and controlling terminal.  
   - The caller becomes the leader of a new session **and** a new process group (its `pgid` is set to its `pid`).  
   - Returns the new `sid` on success.

### Process Group Creation
* `setpgid(pid, pgid)`  
  - If `pid == 0`, the caller’s PID is used.  
  - If `pgid == 0`, the new group’s `pgid` is set to `pid`.  
  - The kernel verifies that `pid` and (if specified) `pgid` belong to the same session; otherwise returns `-1` with `EPERM`.  
  - On success, the target process’s `group_leader` pointer is updated and its `pgid` field is set.

### Job Control Flow in a Shell (e.g., Bash)
1. **Parse command line** → determine foreground/background (`&`).  
2. **Fork**:  
   ```c
   pid_t pid = fork();
   if (pid < 0) { perror("fork"); exit(1); }
   ```
   - On error, shell reports and continues.  
   - On success, parent retains `pid`; child gets `0`.  
3. **In child** (if background or explicit `setpgid`):  
   ```c
   if (background || want_new_pgid) {
       setpgid(0, 0);          // become leader of new group
   }
   execvp(argv[0], argv);
   ```
   - If `setpgid()` fails, child exits with error; shell may retry or abort.  
4. **In parent**:  
   - If foreground:  
     ```c
     tcsetpgrp(STDIN_FILENO, pid);   // make child’s group foreground
     int status;
     waitpid(pid, &status, 0);       // block until job ends
     tcsetpgrp(STDIN_FILENO, getpgrp()); // restore shell’s group
     ```  
   - If background:  
     ```c
     setpgid(pid, pid);   // ensure child is leader (if not already)
     // add job to internal table, do NOT waitpid yet
     ```  
5. **Signal handling**:  
   - Shell installs a handler for `SIGCHLD` (`sigaction(..., SA_NOCLDSTOP | SA_NOCLDWAIT, ...)`).  
   - When a child stops or terminates, the handler reapplies `waitpid(-1, &status, WNOHANG|WUNTRACED)` to update the job table.  
   - If the foreground job receives `SIGTSTP` (Ctrl‑Z), the kernel stops all processes in that group; the shell notices via `SIGCHLD` with `WIFSTOPPEN(status)` and marks the job as stopped.  
   - Issuing `bg` sends `SIGCONT` to the stopped job’s `pgid`; issuing `fg` sends `SIGCONT` and then calls `tcsetpgrp()` to make that group foreground again.

### Signal Delivery Mechanics
When `kill(pid, signo)` is invoked:
1. Kernel looks up `struct task_struct *t = find_task_by_vpid(pid)`.  
2. If `t` is `NULL`, returns `-1` with `ESRCH`.  
3. Checks permissions: either caller’s `uid` == `t->uid` or caller has `CAP_KILL`.  
4. Sets bit `signo-1` in `t->pending.signal`.  
5. If the signal is not blocked (`sigismember(&t->blocked, signo) == 0`) and `t` is runnable, the kernel invokes `do_signal()` on the next tick, which:
   * Clears the pending bit,
   * Looks up `t->sigactions[signo]`,
   * If `SA_SIGINFO`, calls handler with three arguments; otherwise with one,
   * Restores saved registers via `sigreturn()`.  
If the signal’s default action is `SIG_DFL` and the disposition is `SIG_DFL`, the kernel performs the default (e.g., `SIGKILL` → `do_exit(SIGKILL)`).

---

## Worked Examples
### Example 1: Creating a New Session and Printing IDs
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <unistd.h>
#include <sys/types.h>

int main(void) {
    pid_t pid = getpid();
    pid_t sid_before = getsid(0);   // current session ID
    printf("Before setsid(): pid=%d, sid=%d\n", pid, sid_before);

    pid_t sid = setsid();           // creates new session, becomes leader
    if (sid == -1) {
        perror("setsid");
        return 1;
    }

    pid_t pgid = getpgrp();         // after setsid(), pgid == pid
    pid_t sid_after = getsid(0);
    printf("After setsid(): pid=%d, pgid=%d, sid=%d\n",
           getpid(), pgid, sid_after);
    return 0;
}
```
**Step‑by‑step reasoning**
1. Process starts in the invoking shell’s session (e.g., `sid=3420`).  
2. `getsid(0)` returns that session ID.  
3. `setsid()`:  
   * Kernel checks that the caller is not a session leader → proceeds.  
   * Allocates new `struct pid` with `sid = caller->pid` (say `3421`).  
   * Detaches from controlling terminal (`/dev/tty` becomes `-1`).  
   * Makes caller leader of new session **and** new process group → `pgid` set to `3421`.  
4. `getpgrp()` returns the caller’s `pgid`, which equals its `pid` after `setsid()`.  
5. `getsid(0)` now returns the new `sid` (`3421`).  

**Sample output** (running under Bash with PID 3420):
```
Before setsid(): pid=3420, sid=3420
After setsid(): pid=3421, pgid=3421, sid=3421
```

### Example 2: Creating a Job and Inspecting Its Process Group
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>

int main(void) {
    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        return 1;
    }

    if (pid == 0) {                 /* child */
        /* Put child in its own process group */
        if (setpgid(0, 0) == -1) {
            perror("setpgid");
            _exit(1);
        }
        printf("Child: pid=%d, pgid=%d, sid=%d\n",
               getpid(), getpgrp(), getsid(0));
        /* Execute a long‑running command */
        execlp("sleep", "sleep", "30", (char *)NULL);
        perror("execlp");
        _exit(1);
    } else {                        /* parent */
        /* Parent does *not* wait; child runs in background */
        printf("Parent: forked child pid=%d\n", pid);
        /* Illustrate that parent’s pgid unchanged */
        printf("Parent: pid=%d, pgid=%d, sid=%d\n",
               getpid(), getpgrp(), getsid(0));
        sleep(5);                  /* give child time to start */
        return 0;
    }
}
```
**Explanation**
* After `fork()`, child inherits the parent’s `pgid` and `sid`.  
* Child calls `setpgid(0,0)`:  
  * `pid == 0` → use child’s PID; `pgid == 0` → new `pgid` set to child’s PID.  
  * Kernel verifies same session (true) and updates child’s `group_leader`.  
* Child’s `pgid` now equals its own `pid` (e.g., `3425`).  
* Parent’s `pgid` remains the shell’s group (e.g., `3420`).  
* The child then `exec`s `sleep 30`; the PID and PGID stay unchanged across `exec`.  

**Sample output**
```
Parent: forked child pid=3425
Parent: pid=3420, pgid=3420, sid=3420
Child: pid=3425, pgid=3425, sid=3420
```
(Here the shell’s session ID is `3420`; the child starts a new process group but stays in the same session.)

### Example 3: Sending a Signal to a Process Group
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <unistd.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/wait.h>

int main(void) {
    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        return 1;
    }

    if (pid == 0) {                 /* child */
        if (setpgid(0, 0) == -1) {  /* new group */
            perror("setpgid");
            _exit(1);
        }
        printf("Child (pgid=%d) sleeping...\n", getpgrp());
        /* Ignore SIGINT so we can see SIGTERM work */
        signal(SIGINT, SIG_IGN);
        while (1) pause();          /* wait for signals */
    } else {                        /* parent */
        sleep(2);                   /* let child start */
        /* Send SIGTERM to the whole process group */
        if (kill(-getpgid(pid), SIGTERM) == -1) {
            perror("kill");
            return 1;
        }
        printf("Parent sent SIGTERM to pgid %d\n", getpgid(pid));
        int status;
        waitpid(pid, &status, 0);
        if (WIFSIGNALED(status))
            printf("Child terminated by signal %d\n", WTERMSIG(status));
        return 0;
    }
}
```
**Reasoning**
* `kill(-pgid, signo)` addresses a **process group**: the kernel negates the `pgid` to signal all members of that group.  
* Child’s `pgid` after `setpgid(0,0)` equals its `pid` (say `3428`).  
* Parent computes `-getpgid(pid)` → `-3428`. Kernel delivers `SIGTERM` to every task whose `group_leader`’s `pgid` is `3428` (here just the child).  
* Child’s `while(1) pause()` loop breaks when the signal handler runs; default action for `SIGTERM` is termination, so `WIFSIGNALED` yields true.  

**Sample output**
```
Child (pgid=3428) sleeping...
Parent sent SIGTERM to pgid 3428
Child terminated by signal 15
```

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Leads to Bugs |
|---------|--------------|----------------------|
| **Ignoring return value of `setsid()`** | Assuming the call always succeeds. | If the caller is already a session leader, `setsid()` fails with `EPERM`. The program would retain the old session, causing unexpected terminal inheritance (e.g., a daemon accidentally keeping a controlling terminal). |
| **Using `signal()` instead of `sigaction()`** | `signal()` provides unreliable semantics (implementation‑defined restart behavior, no `SA_NOCLDSTOP`). | Portability issues: on some systems `SIGCHLD` may not be delivered for stopped children, breaking job‑control shells. `sigaction()` lets you specify flags explicitly. |
| **Calling `setpgid()` after `exec()`** | Attempting to change the process group of an already‑executed program. | `exec()` preserves the existing `pgid`; trying to change it afterward requires another `fork()`, which is wasteful and may race with the program’s startup. The correct place is **before** `exec()` in the child. |
| **Not handling `EINTR` in `waitpid()`** | Treating `-1`/`EINTR` as a fatal error. | Signal handlers interrupt blocking syscalls; if the shell ignores `EINTR` it may exit the wait loop prematurely, leaving a zombie or missing a status update. |
| **Assuming `getpgrp()` returns the session ID** | Confusing `pgid` with `sid`. | After `setsid()`, `getpgrp()` equals the leader’s PID, but `getsid(0)` returns the session ID. Using the wrong value breaks logic that relies on session boundaries (e.g., checking whether a process is a session leader). |
| **Using `kill(pid, SIGKILL)` on a process group** | Missing the minus sign. | `kill(pid, SIGKILL)` affects only the single process; background jobs with multiple processes (e.g., a pipeline) would only kill the first member, leaving others running. The correct form is `kill(-pgid, SIGKILL)`. |
| **Updating the shell’s job table without blocking `SIGCHLD`** | Race between job insertion and signal handler. | If a `SIGCHLD` arrives while the shell is still adding a job, the handler may reap the child before the job entry exists, causing the shell to lose track of the job or double‑reap it. The fix is to block `SIGCHLD` (`sigprocmask`) while modifying the table. |

---

## Exercises
### Easy
1. **Session ID printing** – Write a C program that calls `setsid()`, then prints the returned `sid`, the process’s `pid`, and its `pgid` using `getsid(0)`, `getpid()`, and `getpgrp()`. Run it from a terminal and verify that the printed `sid` equals the printed `pid`.  
2. **Background job with `sleep`** – In Bash, run `sleep 60 &`, then use `jobs -l` to list the job. Note the displayed job number, `pgid`, and state. Bring it to the foreground with `fg %1` and terminate it with `Ctrl‑C`.  

### Medium
3. **Simple job‑control shell** – Implement a minimal shell in C that:
   * reads a line (`fgets`),
   * forks,
   * in the child, calls `setpgid(0,0)` **before** `execvp`,
   * in the parent, if the command ends with `&`, adds the child’s `pgid` to a job list and does **not** wait; otherwise calls `waitpid` and then restores the terminal’s foreground process group with `tcsetpgrp(STDIN_FILENO, getpgrp())`.  
   * Installs a `SIGCHLD` handler (`sigaction` with `SA_NOCLDSTOP | SA_NOCLDWAIT`) that reaps any stopped or terminated children and updates the job list.  
   Test by running `yes | head -5 &`, `sleep 10 &`, and using `jobs`, `fg`, `bg`.  

4. **Signal to a process group** – Write a program that forks two children, each puts itself in a new process group (`setpgid(0,0)`), then execs `sleep 30`. The parent sends `SIGUSR1` to the **first** child’s group using `kill(-pgid1, SIGUSR1)`. Have each child install a handler for `SIGUSR1` that prints its `pid` and `pgid`. Verify that only the first group’s children print the message.  

### Hard
5. **Daemon‑style session leader** – Create a program that:
   * Calls `setsid()` to detach from the terminal,
   * Changes working directory to `/`,
   * Closes all open file descriptors (iterating over `/proc/self/fd`),
   * Opens `/dev/null` and duplicates it to `stdin`, `stdout`, `stderr`,
   * Then loops, printing a timestamp to `/var/log/daemon.log` every 5 seconds.  
   Verify with `ps -o pid,ppid,pgid,sid,stat,command` that the process has no controlling terminal (`?` in the `TTY` column) and that its `sid` equals its `pid`.  
6. **Robust signal mask manipulation** – Modify the medium‑difficulty shell so that, while updating the job list, it blocks **all** signals (`sigfillset`) except `SIGCHLD`, which it leaves unblocked, then restores the previous mask. Explain why this prevents lost `SIGCHLD` notifications.  

---

## Linux Connection
### Kernel Subsystems and Interfaces
| Concept | Kernel Structure / File | Relevant Syscalls / Commands | Example Usage |
|---------|------------------------|------------------------------|---------------|
| Session | `struct pid` (session ID stored in `signal->session->nr`) | `setsid()`, `getsid()` | `setsid()` creates a new session; `cat /proc/$$/status` shows `Sid:` field. |
| Process group | `struct task_struct->group_leader` and `signal->tty->pgrp` | `setpgid()`, `getpgrp()`, `tcsetpgrp()`, `tcgetpgrp()` | `ps -o pid,pgid,stat,command` lists PGIDs. |
| Controlling terminal | `/dev/tty` (character device major 5, minor 0) | `open("/dev/tty", O_RDWR)`, `ioctl(fd, TIOCGPGRP, ...)`, `ioctl(fd, TIOCSPGRP, ...)` | Shell uses `tcsetpgrp(STDIN_FILENO, pgid)` to change foreground group. |
| Job table (shell) | Not a kernel object; maintained in user space (e.g., `bash`'s `jobs` builtin) | `jobs`, `bg %n`, `fg %n`, `kill -s SIGNAL %n` | `sleep 100 &; jobs -l` shows job number, PGID, state. |
| Signal disposition | `struct k_sigaction` per signal (`current->siga[signo]`) | `sigaction()`, `signal()`, `kill()`, `killpg()` | `trap 'echo SIGINT' SIGINT` in bash installs a handler. |
| Namespaces (relevant for containers) | `pid_namespace` (isolates PID allocation) | `unshare(CLONE_NEWPID)`, `setns()` | Running `unshare -f --pid --mount-proc bash
