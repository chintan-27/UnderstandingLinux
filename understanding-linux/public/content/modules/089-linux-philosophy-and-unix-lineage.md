---
id: 89
title: "Linux philosophy and Unix lineage"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Core Concepts
### Unix Philosophy and Its Consequences
The Unix philosophy advocates *small, single-purpose programs* that can be composed. The causal chain is:
1. **Simplicity → Ease of verification** – a program that does one thing has a smaller state space, making bugs easier to locate and fix.
2. **Uniform interface → Reusability** – if every program consumes and produces byte streams, any program can be plugged into any other without adapters.
3. **Modularity → Incremental improvement** – replacing one component (e.g., a better sorting algorithm) does not require rewriting the whole pipeline.

These principles are not abstract; they are enforced by the kernel’s file descriptor abstraction, which treats all I/O objects as files.

### Everything is a File – Mechanism
In Linux, the Virtual File System (VFS) layer provides a common set of operations (`open`, `read`, `write`, `ioctl`, `mmap`, …) for diverse objects:
- **Regular files** – data stored on a block device.
- **Device nodes** – `/dev/sda`, `/dev/tty0` – map to driver routines.
- **Pipes/FIFOs** – kernel buffers with read/write ends.
- **Sockets** – network endpoints.
- **Special filesystems** – `/proc`, `/sys`, `tmpfs`.

Because each object implements the same VFS ops, a program that calls `read(fd, buf, n)` works identically whether `fd` refers to a disk file, a keyboard, or a network socket. This uniformity eliminates the need for device‑specific code paths in user space.

### Composability via Pipes – Why It Works
A pipe is a kernel‑maintained buffer with two file descriptors: one for writing, one for reading. When the write end passes data, the kernel copies bytes from the user buffer into the pipe’s internal buffer; a subsequent `read` copies from that buffer to the reader’s user space. The key properties are:
- **Atomic writes up to PIPE_BUF** (typically 4096 bytes on Linux). Writes ≤ PIPE_BUF are guaranteed not to interleave with writes from other processes, enabling safe concurrent producers.
- **Blocking semantics** – a write blocks if the pipe is full; a read blocks if empty. This provides flow control without busy‑waiting.
- **Reference counting** – the pipe object persists until both ends are closed, preventing premature reclamation.

Thus, chaining `prog1 | prog2 | prog3` merely requires the shell to create two pipes, dup the appropriate ends into each child’s stdin/stdout, and exec the programs. No data copying occurs in the shell; the kernel handles all transfers.

### Text Streams – Universality
A text stream is a sequence of bytes interpreted as characters (usually ASCII/UTF‑8). Because the kernel does not enforce any structure on the data, any program can:
- **Generate** text (e.g., `ls`, `date`).
- **Transform** text (e.g., `grep`, `sed`, `awk`).
- **Consume** text (e.g., `less`, `wc`).

The lack of framing means that filters can be stacked arbitrarily; the only limitation is the semantic compatibility of the output of one stage with the input of the next. This is why Unix tools excel at log processing, configuration generation, and ad‑hoc data munging.

### Process‑Centric Design – Isolation and Concurrency
Each process receives:
- A **private virtual address space** (typically split into text, data, heap, stack, and guard pages).
- A **file descriptor table** (inherited across `fork`, but `execve` replaces the memory image while preserving open descriptors unless `FD_CLOEXEC` is set).
- **Separate kernel resources** (signal dispositions, timers, credentials).

Concurrency arises because the scheduler can interleave independent processes without them sharing mutable memory (unless they explicitly use shared memory or threads). The cost of a context switch is dominated by saving/restoring registers and flushing the TLB; on x86‑64 this is roughly 0.5–1 µs per switch on a modern CPU.

## How It Works
### System Calls as the Kernel‑User Contract
When a program invokes `open("file", O_RDONLY)`, the kernel:
1. Resolves the pathname via the VFS dentry/inode cache.
2. Checks permissions against the process’s credentials.
3. Allocates a free slot in the process’s file descriptor table (typically the lowest unused integer ≥ 3).
4. Returns that integer to user space; the file descriptor indexes an entry that points to a `struct file` containing:
   - Pointer to the underlying inode/device.
   - File offset (`loff_t f_pos`).
   - Pointer to the `file_operations` table (the driver‑specific implementations of `read`, `write`, etc.).

Subsequent `read(fd, buf, n)` calls:
- Verify `fd` is valid and open for reading.
- Invoke the appropriate `read` method (e.g., `generic_file_read_iter` for regular files, `pipe_read` for pipes).
- Copy up to `n` bytes from kernel space to the user buffer, updating `f_pos`.
- Return the number of bytes actually transferred (or ‑1 on error, with `errno` set).

### Pipe Implementation Details
A pipe is represented by a `struct pipe_inode_info` containing:
- A circular buffer of `nr_pages` × `PAGE_SIZE` bytes (default 16 pages → 64 KiB).
- `head` and `tail` indices (modulo buffer size).
- A wait queue for readers and writers.
- Reference counters for the read and write ends.

**Write path** (`write(fd, buf, n)`):
```
if (n > 0) {
    while (n > 0 && !pipe_full) {
        copy_from_user(buf, pipe_buf + head, min(n, space_available));
        head = (head + copied) % buf_size;
        n -= copied;
        wake_up_readers();
    }
    if (pipe_full) {
        if (O_NONBLOCK) return -EAGAIN;
        wait_event(wq_write, !pipe_full);
    }
}
```
**Read path** mirrors this, waking writers when space appears.

Because the buffer resides in kernel memory, no user‑space copying occurs beyond the mandatory copy‑in/copy‑out required by the API.

### Fork, Copy‑on‑Write, and Exec
`fork()` creates a child process by:
- Duplicating the parent’s page table entries (marking them read‑only).
- Incrementing the reference count on each physical page.
- Setting the child’s TID and returning 0 in the child, the child's PID in the parent.

If either process writes to a page, a page fault triggers a copy‑on‑write (CoW) fault: the kernel allocates a new physical page, copies the contents, updates the page table, and resumes execution. Thus, the *incremental* cost of a fork is roughly:
- Allocate a new `task_struct` (~1.5 KiB).
- Duplicate the page table (~8 KiB for a typical 64‑bit process with ~2 MiB of mapped memory).
- No immediate memory duplication; real copy occurs only on writes.

`execve(path, argv, envp)` replaces the current memory image:
- Reads the ELF executable, loads segments into fresh pages (discarding the old ones via `munmap`‑like operations).
- Sets up the new stack with `argv` and `envp`.
- Transfers control to the entry point (`e_entry`).

The ELF loader performs relocations and dynamic linking if needed; the total latency for a statically linked binary is typically 10–30 µs on a modern SSD‑backed system, dominated by page fault handling and TLB flushes.

### Memory Layout Example
A typical 64‑bit Linux process layout (addresses grow upward):
```
0x0000000000000000 - 0x00007fffffffffff  : user space (128 TiB)
│
├─ 0x0000555555554000 - 0x0000555555575fff : .text (code, read‑only)
├─ 0x0000555555576000 - 0x0000555555578fff : .rodata
├─ 0x000055555557a000 - 0x000055555557cfff : .data
├─ 0x000055555557d000 - 0x000055555557ffff : .bss
├─ 0x0000555555580000 - 0x000055557fffffff : heap (grows upward via brk/mmap)
├─ 0x00007ffffffff000 - 0x00007fffffffffff : stack (grows downward, default 8 MiB)
└─ 0x00007fffffffffe000 - 0x00007fffffffffff : vdso, vsyscall
```
Guard pages (typically one page) separate heap and stack to detect overflow.

## Worked Examples
### Example 1 – Reading a File with Error Handling and Partial Reads
```c
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>

int main(void) {
    const char *path = "/etc/hosts";
    int fd = open(path, O_RDONLY);
    if (fd < 0) {
        /* open can fail for ENOENT, EACCES, etc. */
        fprintf(stderr, "open(%s): %s\n", path, strerror(errno));
        return 1;
    }

    char buf[4096];
    ssize_t total = 0;
    while (1) {
        ssize_t r = read(fd, buf, sizeof(buf));
        if (r == 0)               /* EOF */
            break;
        if (r < 0) {
            if (errno == EINTR)   /* interrupted by signal, retry */
                continue;
            fprintf(stderr, "read: %s\n", strerror(errno));
            close(fd);
            return 1;
        }
        /* In a real program we would process buf[0:r] here */
        total += r;
    }

    printf("Read %zd bytes from %s\n", total, path);
    close(fd);
    return 0;
}
```
**Step‑by‑step reasoning:**
1. `open` returns the lowest free fd (usually 3 because 0‑2 are stdin/stdout/stderr).  
2. The loop accommodates *short reads*: `read` may return fewer than requested bytes due to signals, non‑blocking descriptors, or reaching EOF mid‑buffer.  
3. `EINTR` handling is essential because any system call can be interrupted by a signal; restarting the call is the portable way to avoid premature failure.  
4. After the loop, we explicitly `close` the fd to free the kernel `struct file` reference; otherwise the descriptor would linger until process exit, consuming kernel memory.

### Example 2 – Writing a File with Atomicity Guarantees
```c
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>

int main(void) {
    const char *path = "/tmp/message.txt";
    const char *msg = "Hello, world!\n";
    size_t msg_len = strlen(msg);

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        fprintf(stderr, "open(%s): %s\n", path, strerror(errno));
        return 1;
    }

    size_t written = 0;
    while (written < msg_len) {
        ssize_t w = write(fd, msg + written, msg_len - written);
        if (w < 0) {
            if (errno == EINTR)
                continue;
            fprintf(stderr, "write: %s\n", strerror(errno));
            close(fd);
            return 1;
        }
        written += w;
    }

    /* Ensure data reaches storage */
    if (fsync(fd) < 0) {
        fprintf(stderr, "fsync: %s\n", strerror(errno));
        close(fd);
        return 1;
    }

    close(fd);
    return 0;
}
```
**Why `fsync`?**  
`write` only updates the page cache; data may remain in volatile memory until the kernel’s flush daemon writes it back. Calling `fsync` forces the dirty pages to be persisted, which is necessary for durability guarantees (e.g., after a crash).

### Example 3 – A Robust Pipeline (`ls | sort`) with Proper Cleanup
```c
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>
#include <errno.h>
#include <string.h>

int main(void) {
    int pipefd[2];
    if (pipe(pipefd) == -1) {
        perror("pipe");
        return 1;
    }

    pid_t pid = fork();
    if (pid == -1) {
        perror("fork");
        return 1;
    }

    if (pid == 0) {               /* Child: becomes sort */
        close(pipefd[0]);         /* Close unused read end */
        if (dup2(pipefd[1], STDOUT_FILENO) == -1) {
            perror("dup2");
            _exit(127);
        }
        close(pipefd[1]);         /* Original write dup'd, now close */
        execlp("sort", "sort", (char *)NULL);
        /* If execlp fails */
        perror("execlp sort");
        _exit(127);
    } else {                      /* Parent: becomes ls */
        close(pipefd[1]);         /* Close unused write end */
        if (dup2(pipefd[0], STDIN_FILENO) == -1) {
            perror("dup2");
            close(pipefd[0]);
            waitpid(pid, NULL, 0);
            return 1;
        }
        close(pipefd[0]);         /* Original read dup'd, now close */
        execlp("ls", "ls", (char *)NULL);
        perror("execlp ls");
        /* Parent must reap child even on exec failure */
        waitpid(pid, NULL, 0);
        _exit(127);
    }
    /* Never reached */
}
```
**Explanation of each step:**
1. `pipe(pipefd)` creates two fds: `pipefd[0]` (read end) and `pipefd[1]` (write end). The kernel allocates a pipe buffer (default 64 KiB).  
2. `fork` duplicates the parent’s fd table; both processes initially have copies of both ends.  
3. In the child, we close the read end (`close(pipefd[0])`) because `sort` only writes. We then duplicate the write end onto `STDOUT_FILENO` (`dup2`) so that `sort`’s standard output goes into the pipe. After a successful `dup2`, the original write fd (`pipefd[1]`) is redundant and must be closed to avoid leaving the write end open twice (which would prevent EOF detection).  
4. The parent symmetrically closes the write end, duplicates the read end onto `STDIN_FILENO`, and closes the original read fd.  
5. `execlp` replaces the process image; if it fails we report the error and exit with a non‑zero status.  
6. The parent waits for the child (`waitpid`) to reap it and avoid a zombie. Note that the wait must occur *before* the parent exits, otherwise the child could become a zombie if the parent dies first (though init would reap it eventually).

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Assuming `read`/`write` always transfer the requested byte count** | The kernel may return fewer bytes (short I/O) due to signals, non‑blocking mode, or reaching EOF/buffer limits. Treating a short count as an error leads to premature termination or data loss. | Loop until the desired number of bytes is transferred, handling `EINTR` by retrying. |
| 2 | **Leaving the unused end of a pipe open in both parent and child** | If both ends retain a copy of the write (or read) end, the pipe never sees EOF (or never becomes full), causing the opposite block to hang indefinitely. | After `dup2`, close the original descriptor that was duplicated. Close the opposite end entirely in each process. |
| 3 | **Using `O_NONBLOCK` without handling `EAGAIN`** | A non‑blocking `write` that would block returns `‑1/EAGAIN`. Ignoring this causes the program to treat a would‑block condition as a fatal error, aborting unnecessarily. | On `EAGAIN`, either use `select`/`poll`/`epoll` to wait for writability, or retry after a brief back‑off. |
| 4 | **Calling `exit` instead of `_exit` in a child after a failed `exec`** | `exit` runs user‑space cleanup handlers (e.g., flushing stdio buffers) that may double‑flush data already copied into pipes, corrupting the pipeline. | Use `_exit` (or `return` from `main` in the child *before* any stdio buffering) to avoid stdio flushes. |
| 5 | **Neglecting to set `FD_CLOEXEC` on file descriptors that should not survive `exec`** | Leaking descriptors (e.g., a listening socket) into an exec’d program can cause resource exhaustion or unintended behavior. | Use `fcntl(fd, F_SETFD, FD_CLOEXEC)` or open with `O_CLOEXEC` flag (available since Linux 2.6.23). |
| 6 | **Assuming `fork` duplicates memory immediately** | Believing the child gets a full copy of the parent’s RAM leads to over‑estimating fork cost and missing the benefits of CoW. | Remember that only page tables are duplicated; physical pages are shared until a write triggers a fault. |
| 7 | **Using `stdio` functions (`printf`, `fgets`) on raw file descriptors obtained via `open`** | stdio maintains its own buffering; mixing raw `read`/`write` with stdio on the same fd causes interleaved buffers and lost data. | Either use stdio exclusively (`fdopen`) or use raw syscalls exclusively on that fd. |

## Exercises
### Easy
1. **File cat with exact byte count** – Write a program that takes a filename and a byte count `N` as arguments, opens the file, reads exactly `N` bytes (handling short reads and EOF), and writes them to stdout. Use only `open`, `read`, `write`, `close`. Test with `/bin/ls` and `N=42`.

### Medium
2. **User‑space tee** – Implement a program that reads from stdin, writes the data to stdout *and* to a file specified on the command line, without using the `tee` utility. You must use `dup2` to redirect stdout to a pipe, then read from the pipe in a loop, duplicating each chunk to both outputs. Ensure proper handling of `EINTR` and short writes.

### Hard
3. **Mini‑shell with pipelines and background jobs** – Create a shell that:
   - Parses a command line into stages separated by `|`.
   - For each stage, forks a child, sets up pipes as needed, and `execvp` the program.
   - Supports an optional `&` at the end to run the pipeline in the background (the parent should not `wait` for it).
   - Implements basic job control: lists background jobs with `jobs`, and can bring the most recent background job to the foreground with `fg`.
   - Correctly reap zombies via a `SIGCHLD` handler or periodic `waitpid(-1, …, WNOHANG)`.
   - Handles `Ctrl‑C` (`SIGINT`) to interrupt only the foreground pipeline.
   - Demonstrates understanding of file descriptor duplication, pipe buffer limits (`PIPE_BUF`), and process lifecycle.

## Linux Connection
### Concrete Subsystems and Tools
- **Virtual File System (VFS)** – the abstraction layer that unifies `open`, `read`, `write`, `ioctl`, `mmap`. Visible via `/proc/filesystems` (list of registered filesystems) and `/proc/<pid>/fd` (symlinks to opened objects).
- **Pipe Filesystem (`pipefs`)** – the special filesystem that backs anonymous pipes. Inspect with:
  ```bash
  $ mount | grep pipefs
  pipefs on /proc/sys/fs/pipe-max-size type pipefs (rw,relatime)
  ```
- **`/proc/sys/fs/pipe-max-size`** – maximum size (in bytes) an unprivileged user can set for a pipe via `fcntl(fd, F_SETPIPE_SZ, size)`. Default is 65536 bytes (16 × PAGE_SIZE). Example:
  ```bash
  $ sysctl fs.pipe-max-size
  fs.pipe-max-size = 65536
  $ # Try to increase (requires CAP_SYS_RESOURCE)
  $ sysctl -w fs.pipe-max-size=131072   # may fail without privilege
  ```
- **`PIPE_BUF`** – maximum atomic write size. Query with:
  ```bash
  $ getconf PIPE_BUF
  4096
  ```
- **`splice`, `tee`, `vmsplice`** – zero‑copy syscalls that move data between pipes and files without user‑space copying. Example: copy a file to another using a pipe:
  ```bash
  $ # Create a pipe
  $ pipefd=($(mktemp -u); mktemp -u)
  $ mkfifo "${pipefd[0]}"
  $ # splice from
