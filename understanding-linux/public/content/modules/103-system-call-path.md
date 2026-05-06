---
id: 103
title: "System call path"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts  
A system call is the **only controlled gateway** from user‑space to kernel‑space. The CPU operates in two privilege levels:  
- **Ring 3** (user mode) – ordinary instructions execute with limited access to memory and I/O.  
- **Ring 0** (kernel mode) – the kernel runs with full access to hardware, page tables, and interrupt controllers.  

A system call triggers a **controlled transition** from Ring 3 to Ring 0 via a trap instruction (`syscall` on x86‑64, `int 0x80` on legacy i386, or `sysenter`). The transition saves user registers, switches to a kernel stack, and transfers control to a fixed entry point in the kernel.  

The **system call interface** is defined by the **Application Binary Interface (ABI)** for the architecture:  
- Which register holds the system‑call number.  
- Which registers hold up to six arguments (more are passed on the user stack).  
- The convention for returning a value (usually in `rax`) and an error code (negative errno).  

The kernel maintains a **system call table** (`sys_call_table`), an array of function pointers indexed by the system‑call number. The table is built at compile time from `syscalls.h`/`syscall_*.tbl` and resides in read‑only kernel memory after boot, preventing arbitrary overwrites (though some kernels allow modification via `/dev/kmem` for debugging).  

Thus, a system call is not a generic function call; it is a **privileged transition** governed by strict register conventions, a dispatch table, and kernel validation of arguments and numbers.

---

## How It Works  
Below is the step‑by‑step flow for an x86‑64 Linux system call (the same principles apply to other arches, with register names changed).

1. **User‑space wrapper** (e.g., `glibc`’s `fork()`) loads the arguments into the ABI‑defined registers:  

   ```asm
   ; rax = system‑call number (e.g., __NR_fork = 57)
   ; rdi = first arg, rsi = second, rdx = third,
   ; r10 = fourth, r8 = fifth, r9 = sixth
   mov     rax, 57          ; __NR_fork
   xor     rdi, rdi         ; fork takes no arguments
   xor     rsi, rsi
   xor     rdx, rdx
   ```

2. **Trap to kernel** – execute the `syscall` instruction:  

   ```asm
   syscall                  ; causes a switch to kernel mode
   ```

   The CPU performs:  
   - Saves `rip`, `rflags`, `cs`, `ss`, `rsp` onto the kernel stack.  
   - Loads `rip` from the MSR `IA32_LSTAR` (the address of `entry_SYSCALL_64`).  
   - Clears `RF` in `rflags`, disables interrupts (`IF = 0`).  

3. **Kernel entry** (`entry_SYSCALL_64` in `arch/x86/entry/entry_64.S`):  

   - Saves volatile registers (`rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8‑r11`) on the kernel stack.  
   - Loads the kernel stack pointer (`rsp`) from `cpu_current_top_of_stack`.  
   - Checks that the system‑call number in `rax` is `< NR_syscalls`; if not, returns `-ENOSYS`.  

4. **Dispatch** – compute the function address:  

   $$
   \text{func} = \text{sys\_call\_table} + (\text{rax} \times \text{sizeof(void*)})
   $$

   On a 64‑bit kernel, `sizeof(void*) = 8`. The table resides in the kernel’s `.data` section; its address is exposed via `kallsyms` (`sudo cat /proc/kallsyms | grep sys_call_table`).  

5. **Invoke the kernel routine** (e.g., `sys_fork`). The routine receives the same register set as arguments, performs the work (duplicating the task struct, allocating a new PID via `pid_alloc()`, copying memory pages with copy‑on‑write, etc.), and returns a signed long in `rax`.  

6. **Return to user** – `entry_SYSCALL_64` restores the saved registers, executes `sysret` to reload user `rip`, `rflags`, `cs`, `ss`, and `rsp`. The CPU transitions back to Ring 3; execution continues after the `syscall` instruction with the result in `rax`.  

**Timing estimate (typical Xeon):**  

- User‑space setup: ~30 ns  
- Trap entry/exit (save/restore + MSR load): ~150 ns  
- Kernel work (for `getpid`): ~200 ns  
- Total ≈ 380 ns ≈ 0.38 µs.  

More complex calls (e.g., `read` from disk) dominate with I/O latency, not the transition cost.

---

## Worked Examples  

### Example 1: `fork()` + `execve()` – creating a process that runs `/bin/ls`  

```c
#define _GNU_SOURCE
#include <unistd.h>
#include <sys/wait.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    pid_t pid = fork();                 /* sys_fork, __NR_fork = 57 */
    if (pid == -1) {
        perror("fork");
        exit(EXIT_FAILURE);
    }
    if (pid == 0) {                     /* child */
        /* execve replaces the current image */
        execlp("ls", "ls", "-l", (char *)NULL); /* sys_execve, __NR_execve = 59 */
        perror("execlp");               /* only reached on failure */
        _exit(EXIT_FAILURE);
    }
    /* parent */
    int status;
    if (waitpid(pid, &status, 0) == -1) {   /* sys_wait4, __NR_wait4 = 260 */
        perror("waitpid");
        exit(EXIT_FAILURE);
    }
    if (WIFEXITED(status))
        printf("child exited with %d\n", WEXITSTATUS(status));
    return 0;
}
```

**Step‑by‑step reasoning**

| Step | Action | Kernel work |
|------|--------|-------------|
| 1 | `fork` invokes wrapper → `syscall` with `rax=57` | `sys_fork` duplicates `task_struct`, allocates new PID (`pid_alloc()`), marks child as `TASK_STOPPED` initially, sets up copy‑on‑write VM (`copy_process`). Returns child PID to parent, 0 to child. |
| 2 | In child, `execlp` → `execve("/bin/ls", …)` with `rax=59` | `sys_execve` checks filename permission (`inode_permission`), loads ELF header, releases old memory (`flush_old_exec`), sets up new `mm_struct`, loads interpreter if needed, jumps to entry point. |
| 3 | Parent calls `waitpid` → `sys_wait4` (`rax=260`) | Kernel puts parent in `TASK_INTERRUPTIBLE` on the child’s wait queue; when child exits (`exit()`), `release_task` wakes the waiter, returns child’s PID and status. |

Running the program under `strace -f -e trace=fork,execve,wait4 ./a.out` shows the exact syscall numbers and return values.

---

### Example 2: Reading a file with `read()` (handling short reads and `EINTR`)  

```c
#define _GNU_SOURCE
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

ssize_t read_all(int fd, void *buf, size_t count) {
    size_t total = 0;
    while (total < count) {
        ssize_t n = read(fd, (char *)buf + total, count - total);
        if (n == -1) {
            if (errno == EINTR)          /* interrupted by signal, retry */
                continue;
            perror("read");
            return -1;
        }
        if (n == 0)                      /* EOF */
            break;
        total += (size_t)n;
    }
    return (ssize_t)total;
}

int main(void) {
    int fd = open("data.bin", O_RDONLY);
    if (fd < 0) {
        perror("open");
        return EXIT_FAILURE;
    }
    const size_t BUFSZ = 4096;
    char buf[BUFSZ];
    ssize_t n;
    while ((n = read_all(fd, buf, BUFSZ)) > 0) {
        if (write(STDOUT_FILENO, buf, (size_t)n) != n) {
            perror("write");
            close(fd);
            return EXIT_FAILURE;
        }
    }
    if (n == -1) {
        close(fd);
        return EXIT_FAILURE;
    }
    close(fd);
    return EXIT_SUCCESS;
}
```

**Why the loop is needed**

- `read()` may return fewer bytes than requested (short read) due to buffering, signal interruption, or reaching EOF.  
- `EINTR` occurs when a signal handler is invoked; POSIX requires the caller to retry unless `SA_RESTART` was set.  
- The function accumulates until the requested count is satisfied or EOF/error is encountered.

**Mathematical note:** If the file size is `S` bytes and we request `B` bytes per iteration, the expected number of loop iterations is  

$$
\left\lceil\frac{S}{B}\right\rceil + \mathbb{E}[\text{EINTR retries}]
$$

Assuming a Poisson signal rate λ per second and average read time τ, the expected retries ≈ λτ.

---

### Example 3: Writing a file with `open(O_CREAT|O_WRONLY)` and `write()`  

```c
#define _GNU_SOURCE
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    const char *msg = "Hello, system call world!\n";
    size_t len = strlen(msg);
    int fd = open("out.txt",
                  O_WRONLY | O_CREAT | O_TRUNC,   /* sys_open, __NR_open = 2 */
                  0644);                         /* mode: rw-r--r-- */
    if (fd < 0) {
        perror("open");
        return EXIT_FAILURE;
    }
    size_t written = 0;
    while (written < len) {
        ssize_t n = write(fd, msg + written, len - written);
        if (n == -1) {
            if (errno == EINTR)
                continue;
            perror("write");
            close(fd);
            return EXIT_FAILURE;
        }
        written += (size_t)n;
    }
    if (close(fd) == -1) {              /* sys_close, __NR_close = 3 */
        perror("close");
        return EXIT_FAILURE;
    }
    puts("File written successfully");
    return EXIT_SUCCESS;
}
```

**Key points**

- `O_CREAT` causes the VFS to allocate a new `inode` if the path does not exist; the mode `0644` is passed to `inode_init_owner`.  
- `write()` may return `< len` due to non‑blocking descriptors, signals, or internal buffer limits; the loop guarantees full delivery.  
- After the final `write`, `flush` is implicit because we close the descriptor; the kernel writes any dirty pages to the backing store via the filesystem’s `write_end` operation.

---

## Common Mistakes  

| Mistake | What’s wrong | Why it matters (kernel view) |
|---------|--------------|------------------------------|
| **Ignoring return values** | Assuming `read()`, `write()`, `open()` always succeed. | The kernel returns `-errno` to signal conditions like `ENODEV` (device removed), `EFAULT` (bad user pointer), or `EFBIG` (file size limit). Ignoring it can lead to using uninitialized buffers or writing to a closed fd, causing silent data corruption or security issues. |
| **Using `read()`/`write()` without handling `EINTR`** | Treating `-1`/errno as fatal. | Signals (e.g., `SIGALRM` from timers) interrupt blocking syscalls. If the program exits, it may leak resources or leave files in an inconsistent state. The kernel deliberately returns `EINTR` to let the caller decide whether to retry. |
| **Assuming file descriptor inheritance across `execve`** | Expecting a fd opened before `exec` to stay open unless `FD_CLOEXEC` is set. | By default, **all** descriptors are inherited (`close-on-exec` flag is cleared). Sensitive descriptors (e.g., a socket to a privileged service) could be leaked to a child program, violating the principle of least privilege. The correct pattern: `fcntl(fd, F_SETFD, FD_CLOEXEC);` after opening. |
| **Passing a user pointer without validating length** | e.g., `write(fd, buf, huge_len)` where `buf` is actually smaller. | The kernel copies data from user space using `copy_from_user()`. If the length exceeds the actual allocation, it will read beyond the buffer, potentially triggering a page fault that kills the process (`SIGSEGV`) or, if the fault hits a kernel page, could expose kernel memory (information leak). Always bound the length to the actual buffer size. |
| **Using `O_NONBLOCK` incorrectly** | Assuming a non‑blocking `read()` that returns `EAGAIN` means “no data available forever”. | `EAGAIN` merely indicates the resource is temporarily unavailable (e.g., pipe buffer empty, socket receive queue empty). The caller must retry later (e.g., with `poll()`/`epoll`). Treating it as fatal leads to busy‑waiting or premature failure. |
| **Not releasing resources on error paths** | Forgetting `close(fd)` after an `open()` failure. | Leaked file descriptors exhaust the per‑process limit (`/proc/sys/fs/file-max`), causing subsequent `open()` calls to fail with `EMFILE`. The kernel tracks each fd in the `files_struct`; leaks accumulate until the process hits its `RLIMIT_NOFILE`. |

---

## Exercises  

### Easy  
**Goal:** Familiarize with basic syscall wrappers and error checking.  
Write a program `mygetpid.c` that:  

1. Calls `getpid()` (sys_getpid, `__NR_getpid = 39`).  
2. Prints the PID as a decimal number followed by a newline.  
3. Checks the return value of `printf` (though not a syscall, it’s good practice) and exits with `EXIT_FAILURE` on any error.  

*Test:* `./mygetpid` should output a number; `strace -e trace=getpid ./mygetpid` shows the syscall.

### Medium  
**Goal:** Implement robust I/O with looping and signal handling.  
Create `mycat.c` that behaves like `cat` but:  

- Accepts exactly one filename argument (or reads from stdin if `-` is given).  
- Uses `open()`, `read()`, `write()` with the robust loops shown in Worked Example 2.  
- Handles `EINTR` and short reads/writes.  
- Exits with status 0 on success, 1 on any system‑call error.  

*Test:*  
```bash
dd if=/dev/urandom of=test.bin bs=1M count=5
./mycat test.bin | sha256sum
# compare with sha256sum test.bin
```

### Hard  
**Goal:** Build a minimal shell that supports pipes and redirection.  
Write `mysh.c` that:  

1. Reads a line from stdin (`getline()` is allowed; it uses `read` internally).  
2. Parses simple commands separated by `|` (pipe) and supports `<` and `>` redirection.  
3. For each command:  
   - `fork()` → child.  
   - In child, `dup2()` to rearrange stdin/stdout for pipes/files (`sys_dup2`, `__NR_dup2 = 33`).  
   - `execvp()` to locate and execute the program.  
   - Close unused file descriptors.  
4. Parent uses `waitpid()` (`__NR_wait4 = 260`) to reap all children, collecting exit statuses.  
5. Handles `Ctrl+C` (`SIGINT`) by sending the signal to the foreground process group (`killpg`).  

*Test:*  
```bash
./mysh
$ ls -l | grep ".c" | wc -l
```
Should behave like the corresponding bash pipeline.  

*Strace validation:* Run `strace -f -e trace=clone,execve,dup2,pipe,wait4 ./mysh` and verify that each pipeline stage results in a `clone`, appropriate `dup2`, and `execve`.

---

## Linux Connection  

### Subsystems involved  

| Subsystem | Role in a syscall | Example files / interfaces |
|-----------|-------------------|----------------------------|
| **VFS (Virtual File System)** | Provides the abstraction layer for `open`, `read`, `write`, `close`. Each filesystem (ext4, xfs, btrfs, tmpfs) supplies its own `file_operations` struct. | `/proc/filesystems`, `/sys/fs/ext4/` |
| **Process Scheduler** | Manages `task_struct` lifecycle during `fork`, `exec`, `exit`, `wait`. The Completely Fair Scheduler (CFS) picks the next task after a syscall returns to user mode. | `/proc/sched_debug`, `cat /proc/$$/sched` |
| **Memory Manager** | Handles copy‑on‑write pages during `fork`, allocates new `mm_struct` for `exec`, faults pages on demand via `do_page_fault`. | `/proc/<pid>/smaps`, `/proc/sys/vm/overcommit_memory` |
| **Network Stack** | For socket‑related syscalls (`socket`, `bind`, `accept`, `send`, `recv`). Implements protocols (TCP, UDP) in `net/` and uses `sock` structures. | `/proc/net/tcp`, `ss -tanp` |
| **Signal Delivery** | Asynchronous interruption of syscalls; kernel sets `TIF_SIGPENDING` and delivers signals before returning to user space (`do_signal`). | `/proc/<pid>/status` (look for `SigPnd`) |
| **System Call Table** | Central dispatch mechanism; architecture‑specific, read‑only after boot. | `arch/x86/entry/syscalls/syscall_64.tbl` (source), `/boot/System.map-$(uname -r)` (symbol `sys_call_table`) |

### Concrete commands to explore  

```bash
# 1. List all syscall numbers and names for x86-64
grep -E '^#define __NR_' /usr/include/asm/unistd_64.h | head -5

# 2. Find the address of the sys_call_table in the running kernel
sudo grep sys_call_table /proc/kallsyms

# 3. Show the raw table (first 10 entries) – note each entry is a function pointer
sudo sh -c "echo -n 'sys_call_table[0..9] = '; \
    awk '{printf \"%p \", strtonum(\"0x\"$1)}' \
    <(sudo grep sys_call_table /proc/kallsyms | awk '{print $1}') | head -c 80; echo"

# 4. Trace a simple program to see which syscalls it uses
strace -c -e trace=open,read,write,close ./mygetpid

# 5. Observe the effect of FD_CLOEXEC
bash -c 'exec 3>tmpfile; ls -l /proc/$$/fd; \
         exec {var}<&3; echo $var; ls -l /proc/$$/fd'

# 6. Check signal pending mask while a read is blocked
# (in one terminal) sleep 30 &
# (in another) while true; do cat /proc/$(pgrep sleep)/status | grep SigPnd; sleep 0.5; done
```

These commands reveal the *real* data structures that underpin the abstract concepts discussed earlier.

---

## Why This Matters  

Understanding the system call boundary is not academic—it is the **foundation** upon which every Linux program interacts with hardware, isolates faults, and secures resources.  

1. **Performance:** The cost of a syscall (~0.3 µs on modern CPUs) sets a lower bound for any I/O‑bound operation. Designing bulk reads/writes or using mechanisms like `mmap`, `splice`, or `io_uring` amortizes this overhead.  
2. **Reliability:** Proper error handling (checking return values, reacting to `EINTR`, respecting short transfers) prevents silent data loss, resource leaks, and denial‑of‑service caused by exhausted file descriptors or leaked privileges.  
3. **Security:** Privilege transitions are the only vetted path from user to kernel. Misusing file descriptors (`FD_CLOEXEC`), passing bad pointers, or ignoring signal interruptions can lead to privilege escalation or information leaks. Kernel defenses (e.g., `MAP_DENYWRITE`, `seccomp-bpf`) rely on correct syscall usage.  
4. **Portability:** While the ABI varies across architectures (x86‑64, arm64, riscv), the *concept* of a numbered dispatch table and register‑based argument passing is universal. Mastery on Linux equips you to reason about any POSIX‑compliant system.  
5. **Observability:** Tools like `strace`, `bpftrace`, and `perf` expose the syscall stream, enabling performance tuning, debugging, and security auditing. Knowing what each number means turns raw traces into actionable insight.  

By internalizing the mechanics—how a trap instruction saves state, how the kernel indexes into `sys_call_table`, how file descriptors are inherited, and how signals interrupt blocking calls—you move from *using* APIs to *designing* systems that are fast, correct, and secure. This deep intuition is the payoff for mastering the system call path.
