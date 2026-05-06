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

## Core Concepts
A **process** is the kernel’s representation of an executing program: a `task_struct` containing a unique PID, virtual memory layout (mm_struct), file descriptor table, signal state, accounting info, and scheduling data. The isolation of these structures is why changes in one process’s memory do not affect another—each process owns its own page tables, and the kernel enforces protection via the MMU.

### Why `fork()` Duplicates (Copy‑on‑Write)
When a process calls `fork()`, the kernel creates a new `task_struct` for the child and **shares** the parent’s memory pages, marking them read‑only. If either process writes to a page, the kernel allocates a fresh physical page and copies the contents (copy‑on‑write, COW). This avoids the cost of a full memory copy while preserving the semantics of a separate address space. The child inherits open file descriptors, signal handlers, and the current working directory, but gets its own PID and a clean `tid` (thread ID).

### Why `execve()` Replaces the Image
`execve()` does **not** create a new process; it loads a new executable into the existing `mm_struct`, resetting the stack, heap, and program counter, while preserving PID, open files, and signal disposition. The kernel accomplishes this by:
1. Allocating a new set of page tables.
2. Loading the ELF executable’s segments into memory.
3. Setting `entry point` to the program’s start address.
Thus the process identity (PID, parent‑child relationships, credentials) stays unchanged, which is why a shell can `exec` a command without losing job control.

### Why Signals Are Asynchronous Notifications
A signal is a kernel‑maintained bitmask (`sigset_t`) attached to each process. When `kill(pid, sig)` is invoked, the kernel sets the corresponding bit in the process’s `pending` signal set. If the signal is not blocked (`sigprocmask`), the kernel interrupts the normal flow, saves user‑mode registers on the stack, and invokes the handler via a `sigreturn` trampoline. The handler runs in the process’s context, allowing it to react to events like hardware exceptions (`SIGFPE`) or user requests (`SIGINT`) without polling.

### Why Sessions and Process Groups Matter for Job Control
A **session** groups processes that share a controlling terminal; a **process group** (or job) groups processes that can be signaled together. The session leader (the process that called `setsid()`) gets a session ID equal to its PID. The controlling terminal is assigned to the session via the `TIOCSCTTY` ioctl. Only one session may own the terminal at a time, preventing background jobs from interfering with foreground input. The kernel stores:
* `signal_struct->session` – session ID
* `signal_struct->pgrp` – process group ID
These values are returned by `getsid(0)` and `getpgrp(0)`.

## How It Works
### Process Creation (`fork()` + `execve()`)
1. **Syscall entry** – user triggers `fork()` → kernel entry via `sys_fork`.
2. **Task duplication** – `copy_process()` creates a new `task_struct`, increments the PID counter, and sets `child_tid = 0` (return value for child) and `parent_tid = child->pid` (return value for parent) by manipulating the return registers in the `pt_regs` struct.
3. **Memory sharing** – `dup_mmap()` marks all VMAs `VM_SHARED` and flips the page‑table entries to read‑only; the kernel records that the child shares the parent’s `mm_struct`.
4. **Return path** – after `copy_process()` finishes, the kernel switches to the child context; the child sees `eax == 0`. The parent resumes with `eax == child_pid`.
5. **Optional exec** – if the child calls `execve()`, `load_elf_binary()` allocates a fresh `mm_struct`, loads the new program, and **does not** change the PID. The old `mm_struct` is freed after the final `flush_old_exec()`.

### Signal Delivery
1. **Generation** – `kill(pid, sig)` → `__send_signal()` sets `sig->bit` in `task->pending.signal`.
2. **Mask check** – before returning to user mode, `get_signal_to_deliver()` computes `pending & ~blocked`. If non‑zero, picks the lowest numbered signal.
3. **Handler invocation** – kernel builds a `sigframe` on the user stack containing:
   * old mask
   * return address (to `sigreturn`)
   * signal number
   * pointer to `siginfo_t` (if `SA_SIGINFO` set)
   Then it changes `eip/rip` to the handler address.
4. **Completion** – handler executes; upon `return`, the `sigreturn` trampoline restores registers and mask via `rt_sigreturn()` syscall.

### Sessions & Process Groups
* `setsid()` → creates new session if caller is not a process group leader; returns new session ID = caller’s PID.
* `setpgid(pid, pgid)` → joins or creates a process group; if `pgid == 0`, uses caller’s PID as new PGID.
* Kernel enforces that only the session leader may allocate a controlling terminal via `open("/dev/tty", O_RDWR)` followed by `TIOCSCTTY`.

## Worked Examples
### Example 1: Simple `fork()` with Return‑Value Reasoning
```c
/* fork_print.c */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main(void) {
    pid_t pid = fork();          /* 1: kernel creates child, returns twice */
    if (pid == -1) {
        perror("fork");
        exit(EXIT_FAILURE);
    }
    if (pid == 0) {              /* 2: child sees 0 */
        printf("[CHILD] pid=%d, ppid=%d\n", getpid(), getppid());
        /* child continues independently */
    } else {                     /* 3: parent sees child's pid */
        printf("[PARENT] pid=%d, child=%d\n", getpid(), pid);
        /* parent may wait or continue */
    }
    return 0;
}
```
**Step‑by‑step**
1. Parent calls `fork()`; kernel allocates new `task_struct`, copies VMAs read‑only.
2. In child context, `eax` (return register) set to `0`; child prints its PID (e.g., 3425) and PPID (parent’s PID, e.g., 3424).
3. Parent resumes with `eax` = child PID (3425); prints its own PID (3424) and child’s.
4. Both processes exit; parent should `wait()` to avoid zombie (shown later).

### Example 2: `fork()` + `execl()` with Error Path
```c
/* fork_exec.c */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main(void) {
    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        exit(EXIT_FAILURE);
    }
    if (pid == 0) {                     /* child */
        /* Replace current image with /bin/ls -l */
        execl("/bin/ls", "ls", "-l", (char *)NULL);
        /* If execl returns, it failed */
        perror("execl");
        exit(EXIT_FAILURE);
    }
    /* parent continues */
    printf("[PARENT] waiting for child %d\n", pid);
    int status;
    waitpid(pid, &status, 0);           /* reap child */
    printf("[PARENT] child exited with status %d\n", WEXITSTATUS(status));
    return 0;
}
```
**Explanation**
* After `fork()`, child has an identical address space but its own PID.
* `execl()` loads `/bin/ls`; on success, **no return** occurs—the child’s code is replaced.
* If the executable is missing or not executable, `execl()` returns `-1`; we report via `perror`.
* Parent uses `waitpid()` to reap the child, preventing a zombie.

### Example 3: Signal Handler with `sigaction()` and `SA_RESTART`
```c
/* sig_handler.c */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>

volatile sig_atomic_t got_sigint = 0;

void handler(int sig, siginfo_t *si, void *unused) {
    (void)si; (void)unused;
    write(STDOUT_FILENO, "Caught SIGINT\n", 14);
    got_sigint = 1;
}

int main(void) {
    struct sa = {
        .sa_sigaction = handler,
        .sa_flags = SA_SIGINFO | SA_RESTART,   /* restart interrupted syscalls */
    };
    sigemptyset(&sa.sa_mask);
    if (sigaction(SIGINT, &sa, NULL) == -1) {
        perror("sigaction");
        exit(EXIT_FAILURE);
    }
    printf("Waiting for SIGINT (press Ctrl‑C)... pid=%d\n", getpid());
    while (!got_sigint) {
        pause();          /* EINTR avoided by SA_RESTART */
    }
    printf("Exiting after signal.\n");
    return 0;
}
```
**Why `SA_RESTART`?**
If a blocking syscall like `read()` is interrupted by a signal, the kernel would return `-1`/`EINTR`. With `SA_RESTART`, the kernel automatically restarts the syscall after the handler finishes, simplifying loops.

## Common Mistakes
| Mistake | What’s Wrong | Why It Causes Problems |
|---------|--------------|------------------------|
| **Assuming `fork()` returns only once** | Forgetting that the child also continues execution after the `if (pid == 0)` block. | Leads to duplicate work (e.g., two processes both trying to bind a socket) or resource leaks. |
| **Using `signal()` instead of `sigaction()`** | `signal()` provides unreliable semantics (handler reset, no control over mask, not async‑signal‑safe on many systems). | Race conditions: a second signal may arrive before the handler is reset, causing default termination or lost signals. |
| **Not clearing `SA_NOCLDSTOP` when waiting for stopped children** | `waitpid()` with `WUNTRACED` needed to catch `SIGSTOP`/`SIGCONT`. | Parent may miss notification that a child stopped, causing a shell to think the job ran to completion. |
| **Calling `execl()` without checking its return** | Assuming `execl()` never returns on success; ignoring failure path. | If the executable path is wrong, the child continues as the original program, often with undefined behavior (e.g., trying to interpret binary as text). |
| **Using `kill(pid, 0)` to test existence without checking `ESRCH`** | `kill()` with signal 0 checks permission; returns `-1` with `ESRCH` if no such process. | Ignoring `ESRCH` leads to false belief that a process exists when it has already exited. |
| **Believing file descriptors are duplicated with independent offsets** | After `fork()`, both processes share the same `struct file`; offsets are shared. | Concurrent writes can interleave unexpectedly; one process’s `lseek` affects the other. |
| **Assuming a signal handler can call any library function** | Only async‑signal‑safe functions (listed in `signal-safety(7)`) may be invoked. | Calling `malloc()` or `printf()` inside a handler can corrupt heap or deadlock due to lock acquisition. |
| **Neglecting to reap children → zombie accumulation** | Parent never calls `wait*`; child exits but remains in `EXIT_ZOMBIE` state. | Zombies consume a PID slot; if `pid_max` is reached, `fork()` fails with `EAGAIN`. |
| **Using `setsid()` from a process that is already a process group leader** | `setsid()` fails with `EPERM` if caller is a PG leader. | Daemonization code that calls `setsid()` twice will abort unexpectedly. |
| **Ignoring `EINTR` from `read()`/`write()` when not using `SA_RESTART`** | Signal interrupts syscall; returning `-1`/`EINTR` must be handled. | Loops may exit prematurely, causing truncated I/O or infinite retry. |

## Exercises
### Easy
1. **PID Printing** – Write a program that forks twice, prints each process’s PID, PPID, PGID, and SID. Use `getpid()`, `getppid()`, `getpgrp()`, `getsid()`. Verify output with `ps -o pid,ppid,pgid,sid,command`.
2. **Simple Exec** – Create a program that `fork()`s and the child executes `/bin/date`. Parent waits and prints the child’s exit status.

### Medium
3. **Signal Counter** – Implement a handler for `SIGUSR1` that increments a `volatile sig_atomic_t` counter. Main loop prints the counter every second using `sleep(1)`. Test with `kill -USR1 <pid>`.
4. **Pipe‑Based Filter** – Write a program that forks two children: the first runs `ls -l`, the second runs `grep .c`. Connect their stdout/stdin via a pipe. Parent waits for both. Use `pipe()`, `dup2()`, `close()` appropriately.

### Hard
5. **Mini Shell** – Build a REPL that reads a line, splits on `|`, forks a process per stage, sets up pipes, and `execvp`s each command. Implement built‑in `cd` (change `chdir`) and `exit`. Handle `SIGINT` (Ctrl‑C) to interrupt the foreground job without exiting the shell. Use `waitpid()` with `WUNTRACED` to support `Ctrl‑Z` (optional bonus: implement job control with `setpgid`/`tcsetpgrp`).
6. **Ptrace Tracer** – Write a tracer that forks a child, calls `ptrace(PTRACE_TRACEME)`, then `execve("/bin/true")`. In the parent loop, wait for `PTRACE_EVENT_EXEC`, read registers (`PTRACE_GETREGS`), print `rip`, then `PTRACE_CONT` until exit. Demonstrates how a debugger observes exec.

## Linux Connection
### Kernel Subsystems & Data Structures
* **`task_struct`** – core process descriptor (`include/linux/sched.h`). Fields: `pid`, `tgid` (thread group ID), `real_parent`, `parent`, `children`, `files` (fd table), `sighand` (signal handlers), `mm` (memory manager), `signal` (pending/blocked signals).
* **PID allocation** – global `pid_max` (`/proc/sys/kernel/pid_max`). IDs are allocated via `pid_alloc()` using a bitmap; wrap‑around occurs at `pid_max`.
* **Copy‑on‑Write** – handled in `mm/mmu_context.c`; page table entries are marked `_PAGE_RW` cleared on fork; write‑fault triggers `do_wp_page()`.
* **Exec Binary Loader** – `fs/exec.c`: `search_binary_handler()` walks `fmt` list (ELF, script); `load_elf_binary()` builds new `mm_struct`, sets `start_code`, `end_code`, `start_stack`.
* **Signal Delivery** – kernel entry `do_signal()` (`arch/x86/kernel/signal.c`); builds `sigframe` on user stack; uses `sigreturn` to restore context.
* **Session/Process Groups** – `struct signal_struct` holds `session` and `pgrp`; `tcgetpgrp()`/`tcsetpgrp()` manipulate the controlling terminal via the tty driver (`drivers/tty/`).
* **Namespaces & Cgroups** – `clone()` flags `CLONE_NEWNS`, `CLONE_NEWUTS`, `CLONE_NEWPID`, `CLONE_NEWNET` create isolated hierarchies; cgroup v2 filesystem mounted at `/sys/fs/cgroup`.

### Concrete Tool Commands
```bash
# Show current process’s kernel view
cat /proc/$$/status   # $$ expands to shell PID
# Fields: Name, Umask, State, Tgid, Pid, PPid, Uid, Gid, FDSize, Groups, NStgid, NSpid, ...

# View process tree with PIDs, PGIDs, SIDs
ps -ejH               # -e all, -j job control, -H hierarchical

# Find controlling terminal of a session
ps -o sid,tty,command -s $(ps -o sid= -p $$)   # get session ID of current shell, list its members

# Send a signal and observe disposition
kill -s SIGUSR1 1234   # send SIGUSR1 to PID 1234
cat /proc/1234/status | grep Sig   # shows pending/blocked/ignored bit masks

# Adjust maximum PID (requires root)
sysctl kernel.pid_max=4194304   # raise limit; persistent via /etc/sysctl.d/

# Trace syscalls of a fork+exec program
strace -f -e trace=fork,execve,wait4,kill ./a.out

# Create a new PID namespace (unshare)
unshare -f --pid --mount-proc sh   # child sees PID 1 inside namespace

# Limit a process’s memory with cgroups v2
sudo cgcreate -g memory:/demo_limit
echo 50000000 > /sys/fs/cgroup/memory/demo_limit/memory.max   # 50 MiB limit
sudo cgexec -g memory:demo_limit ./mem_hogger   # run program under limit
```

### Relevant Files
* `/proc/sys/kernel/pid_max` – tune PID space.
* `/proc/sys/kernel/threads-max` – max threads (affects `clone()`).
* `/proc/sys/kernel/rand_seed` – influences ASLR (address space layout randomization) for `exec`.
* `/proc/<pid>/maps` – shows VMAs; useful to verify COW (look for `r--p` vs `rw-p` before/after writes).
* `/proc/<pid>/fd/` – symlinks to opened files; after `fork()` both processes see same targets.
* `/proc/<pid>/task/` – per‑thread entries (relevant for multi‑threaded processes).

## Why This Matters
Understanding the mechanics of processes lets you **engineer systems that are fast, safe, and observable**.

* **Performance** – Copy‑on‑Write makes `fork()` cheap enough for high‑frequency servers (e.g., preforking web servers) while `exec()` lets you reuse the same PID and file descriptors, avoiding costly re‑initialisation of sockets or descriptors.
* **Correctness** – Mastery of signal semantics (`sigaction`, `SA_RESTART`, async‑signal‑safety) prevents lost interrupts and ensures that critical sections remain robust under asynchronous events.
* **Resource Discipline** – Knowing that zombies linger until reaped teaches you to always pair `fork()` with `wait*` or `waitpid()`, eliminating PID exhaustion and keeping `/proc` tidy.
* **Security & Isolation** – The same `clone()` machinery that implements `fork()` underlies Linux namespaces and containers; grasping the PID, mount, and network flags lets you build sandboxes (`unshare`, `firejail`) or orchestrate workloads (Kubernetes pods rely on PID and network namespaces).
* **Observability** – `/proc` and `strace` expose the exact kernel state you just learned about: you can inspect a process’s memory map, signal masks, or open files without adding instrumentation, turning theory into practical debugging.

By linking abstract concepts—address‑space duplication, signal bit arithmetic, session hierarchies—to real kernel structures, tunable knobs, and command‑line tools, you gain the ability to **design, tune, and troubleshoot** Linux applications with confidence rather than guesswork. This deep, causal understanding is the foundation for writing high‑performance daemons, reliable shells, secure containers, and efficient debugging tools.
