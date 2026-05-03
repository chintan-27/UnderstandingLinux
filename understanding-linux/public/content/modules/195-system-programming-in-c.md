---
id: 195
title: "System programming in C"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every program runs inside a process — a kernel-managed abstraction that gives your code a private virtual address space, a set of open file descriptors, and the illusion of owning the CPU. When that illusion breaks, the failure is usually silent: a process writes past its allocation and corrupts a neighbor's memory; two threads race on a shared counter and lose increments; a file descriptor leaks across a `fork()` and a pipe never delivers EOF; a signal arrives mid-`read()` and the caller never checks `EINTR`. You cannot diagnose these failures without understanding the mechanism. This module is about that mechanism.

---

## Core Concepts

### Processes

A process is the kernel's runtime record of an executing instance: a virtual address space, open file descriptors, credentials (UID/GID/capabilities), signal state, and one or more threads. The kernel represents each process as a `task_struct` (`include/linux/sched.h`). A process moves between scheduler states:

- `TASK_RUNNING` — on-CPU or runnable, waiting for a timeslice
- `TASK_INTERRUPTIBLE` — sleeping, woken by I/O completion or a signal
- `TASK_UNINTERRUPTIBLE` — sleeping, woken only by I/O completion (shows as `D` in `ps`)
- `EXIT_ZOMBIE` — exited but not yet reaped; `task_struct` persists until the parent calls `wait()`

**Why `fork` + `exec` instead of a single "spawn" call?** Separating creation from execution gives the child a window — between `fork()` returning and `exec()` loading the new image — to manipulate its own environment: close file descriptors, set up pipes with `dup2()`, drop privileges, adjust resource limits. This is why shells implement redirection cleanly without kernel involvement.

### Virtual Memory

Each process sees a private address space. The CPU's MMU translates virtual addresses to physical addresses through a multi-level page table. On x86-64 with 4-level paging, a 48-bit virtual address is decomposed as:

$$\underbrace{[47{:}39]}_{\text{PML4}} \underbrace{[38{:}30]}_{\text{PDPT}} \underbrace{[29{:}21]}_{\text{PD}} \underbrace{[20{:}12]}_{\text{PT}} \underbrace{[11{:}0]}_{\text{offset (4 KiB page)}}$$

A page is 4 KiB = $2^{12}$ bytes. The kernel maps pages lazily (demand paging): the page table entry exists but is marked not-present until the first access, which triggers a page fault that the kernel handles by allocating a physical frame. The canonical address space of a 64-bit process is $2^{48}$ bytes — 256 TiB — of which roughly the upper half is kernel space.

Inspect a running process's memory layout:

```bash
cat /proc/$$/maps          # virtual memory areas: address, perms, offset, inode, path
cat /proc/$$/smaps         # per-VMA RSS, PSS, swap usage
pmap -x $$                 # same data, formatted
```

A VMA entry looks like:

```
7f3a4c000000-7f3a4c200000 rw-p 00000000 00:00 0
```

Fields: `[start]-[end] perms offset dev inode pathname`. `p` means private (copy-on-write); `s` means shared.

The kernel represents each VMA as a `struct vm_area_struct` (`include/linux/mm_types.h`), linked into a red-black tree per process for $O(\log n)$ lookup by address.

### File Descriptors

The kernel maintains three tables:

1. **Per-process FD table** — maps integer FDs to open file descriptions
2. **System-wide open file table** — one entry per `open()` call, holding offset, flags, and a pointer to the inode/socket; this entry is shared across `fork()` and `dup()`
3. **Inode table** — the actual file metadata

```
Process A              Open File Table         Inode Table
 fd 3 ─────────────▶  [offset=512, O_RDWR] ─▶  inode 7741
 fd 4 ─┐
        └──────────▶  [offset=0,   O_RDWR] ─▶  inode 7741
Process B
 fd 5 ─────────────▶  [offset=512, O_RDWR] (same entry as A fd 3)
```

After `fork()`, parent and child share the same open file table entries. If both write sequentially to a log file without `O_APPEND`, they race on the offset field of that shared entry. `O_APPEND` makes each `write()` atomic with respect to seeking to the end — the kernel holds `i_mutex` across the seek+write.

FD limits per process:

```bash
ulimit -n                  # soft limit (e.g., 1024)
cat /proc/sys/fs/file-max  # system-wide hard limit
```

### Signals

A signal is a kernel-delivered asynchronous notification. The kernel sets a bit in `task_struct->pending` (for per-process signals) or `thread->pending` (for thread-directed signals) and schedules delivery on the next return from kernel mode. Signals are not queued by default — two `SIGUSR1` deliveries before the handler runs may appear as one. The exception is real-time signals (`SIGRTMIN` to `SIGRTMAX`), which are queued.

When a signal arrives during a blocking syscall like `read()`:
- If the handler is installed with `SA_RESTART`, the kernel re-enters the syscall automatically.
- Without `SA_RESTART`, the syscall returns `-1` with `errno == EINTR`.

**Every blocking syscall in a production program must handle `EINTR`.** Missing it produces intermittent failures that only appear under load or when a debugger attaches (because `ptrace` uses `SIGSTOP`/`SIGCONT`).

Signal delivery is asynchronous with respect to memory operations, so signal handlers may only call functions listed in `signal-safety(7)`. The async-signal-safe set is smaller than you expect: `printf` is not on it; `write(2)` is.

The signal mask blocks delivery (not receipt) of listed signals. `sigprocmask()` modifies it. `sigpending()` returns the set of blocked signals that have been sent but not yet delivered.

```bash
kill -l               # list all signal names and numbers
kill -SIGTERM $$      # send SIGTERM to this shell (it will ignore it)
```

### Pipes

A pipe is a kernel-managed, unidirectional byte stream with an in-kernel ring buffer. On Linux, the default pipe capacity is 65536 bytes (64 KiB), configurable via `fcntl(fd, F_SETPIPE_SZ, size)` up to `/proc/sys/fs/pipe-max-size`.

Write behavior depends on write size relative to `PIPE_BUF` (4096 bytes on Linux):
- Writes $\leq$ `PIPE_BUF` are **atomic**: they either complete fully or block; they will not interleave with concurrent writers.
- Writes $>$ `PIPE_BUF` may be interleaved with other writers.

A write to a pipe with no readers delivers `SIGPIPE` to the writer; if `SIGPIPE` is blocked or ignored, `write()` returns `-1` with `errno == EPIPE`.

### Sockets

A socket is a bidirectional communication endpoint created with `socket(domain, type, protocol)`. The domain determines the address family:

- `AF_INET` / `AF_INET6` — TCP/UDP over IPv4/IPv6
- `AF_UNIX` — local IPC via filesystem path or abstract name

For `SOCK_STREAM` (TCP or Unix stream), the connection setup involves a three-way handshake managed entirely by the kernel; `accept()` dequeues an already-established connection from the backlog. The backlog size passed to `listen()` limits the number of completed connections waiting for `accept()`, not the number of half-open connections (that's controlled by `tcp_max_syn_backlog`).

For high-throughput data transfer between sockets and files, `sendfile(2)` avoids the user-space copy:

$$\text{traditional: disk} \to \text{kernel buffer} \to \text{user buffer} \to \text{socket buffer} \to \text{NIC}$$
$$\text{sendfile: disk} \to \text{kernel buffer} \to \text{socket buffer} \to \text{NIC}$$

### epoll

`select(2)` and `poll(2)` require passing the entire watched FD set to the kernel on each call and scanning it linearly. For $n$ FDs, each call costs $O(n)$ regardless of how many are ready.

`epoll` separates registration from waiting:

- `epoll_create1(0)` — create an epoll instance (returns an FD)
- `epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &event)` — register an FD; stored in a kernel-side red-black tree
- `epoll_wait(epfd, events, maxevents, timeout)` — block until ready; returns only ready FDs from a linked list the kernel maintains

Wakeup cost: $O(1)$ in the number of registered FDs, $O(k)$ in the number of ready FDs $k$. For $n = 10000$ FDs with $k = 5$ ready, `epoll_wait` does $O(5)$ work where `poll` would do $O(10000)$.

Two triggering modes:
- **Level-triggered (default)**: `epoll_wait` returns the FD as long as it remains readable/writable. Missed events are recovered on the next call.
- **Edge-triggered** (`EPOLLET`): `epoll_wait` returns the FD only on state transitions (not-ready → ready). You must drain the FD completely on each notification — typically with a `read()` loop until `EAGAIN
