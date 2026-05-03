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

## Why This Matters

Unix was designed in the early 1970s under severe resource constraints — small memory, slow disks, a tiny team. Those constraints forced decisions that turned out to be profoundly correct: make every tool do one thing well, connect tools through text streams, represent everything as a file. The alternative — what you get without this philosophy — is an operating system where each application invents its own IPC mechanism, its own configuration format, its own logging system, and composing them requires writing glue code for every pair. With the Unix model, `ls | grep | sort | head` works without any of those programs knowing about each other, and your terminal, your hard drive, a network socket, and a random-number generator are all opened with the same `open()` call and read with the same `read()` call. This is not historical context — it is the mental model that makes Linux legible.

## Core Concepts

### Everything Is a File

The claim is not that everything *is* literally a file on disk. It is that everything *exposes a file-like interface*: you open it, you read and write bytes, you close it. The kernel enforces this uniformity through the **Virtual File System (VFS)**, an abstraction layer that sits between system calls like `read()` and `write()` and the wildly different implementations underneath — ext4, NFS, a pipe, a device driver. The VFS defines a common set of operations (`open`, `read`, `write`, `close`, `seek`, `ioctl`), so userspace code never needs to branch on what kind of object it is talking to.

This is why `/dev/null` discards writes and returns EOF on read, `/dev/urandom` returns kernel-harvested entropy, and `/proc/cpuinfo` returns a dynamically generated text description of your CPU — and all three are opened with identical code:

```c
int fd = open("/proc/cpuinfo", O_RDONLY);   // same call for all three
read(fd, buf, sizeof(buf));                  // same call for all three
close(fd);                                   // same call for all three
```

The VFS achieves this through a table of function pointers, `struct file_operations`, one instance per file type. When you call `read()`, the kernel dispatches through that table. The uniformity in userspace is purchased by polymorphism in the kernel.

### File Descriptors Are Handles, Not Files

A **file descriptor** (fd) is a small non-negative integer — an index into the kernel's per-process **file descriptor table**. That table entry points to an **open file description** in a system-wide table, which in turn points to an **i-node**. The three-level indirection is not bureaucracy. Each level solves a specific problem:

- The **fd table** is per-process, so fd 3 in process A and fd 3 in process B are independent. It also stores the close-on-exec flag.
- The **open file description** stores the current file offset and access mode. Two fds can point to the same open file description — they share an offset. This is exactly what `fork()` needs: the child inherits the parent's open files, including their positions.
- The **i-node** stores the file's actual metadata and data pointers. Multiple open file descriptions can point to the same i-node — they have independent offsets on the same underlying file.

```
Process A                  Kernel
┌──────────┐               ┌──────────────────────┐       ┌──────────┐
│  fd 0    │──────────────▶│ open file description │──────▶│  i-node  │
│  fd 1    │──┐            │  offset=512, flags    │       │ on disk  │
│  fd 2    │  │            └──────────────────────┘       └──────────┘
└──────────┘  │            ┌──────────────────────┐            ▲
              │            │ open file description │            │
Process B     └───────────▶│  offset=0,  flags    │────────────┘
┌──────────┐               └──────────────────────┘
│  fd 5    │──────────────▶ (its own open file description)
└──────────┘
```

When `fork()` returns, parent and child share the same open file descriptions. A `read()` in the child advances the offset seen by the parent. This is intentional — it allows a parent to hand work to a child that continues reading from exactly where the parent left off.

### Text Streams as the Universal Interface

Unix tools communicate through **byte streams**. By convention those streams carry newline-delimited text, but this is a convention enforced by nothing except the tools themselves. The convention's value is that it eliminates protocol negotiation: any tool that writes lines can feed any tool that reads lines. The cost is that binary data is awkward and wide fields require careful delimiter handling. This is a deliberate trade-off, not an oversight.

The three standard streams are fixed by convention, not by the kernel:

| fd | Name | Convention |
|---|---|---|
| 0 | stdin | reads from terminal or pipe input |
| 1 | stdout | writes primary output |
| 2 | stderr | writes diagnostics; not captured by `\|` |

These are just file descriptors. The shell sets them up before your program starts. You can replace any of them with any open file using `dup2(newfd, targetfd)`, which closes `targetfd` if it is open and makes it point to the same open file description as `newfd`.

### Composability

Composability means the output of one program is a valid input to another without either program being written with the other in mind. The shell `|` operator makes this concrete: it calls `pipe()` to create an anonymous in-kernel byte buffer, then uses `dup2()` to connect the write end to the left program's stdout and the read end to the right program's stdin, then `fork()`s and `exec()`s both programs concurrently. No temporary files, no shared memory, no agreed-upon protocol.

The contract a composable program must satisfy is narrow: read from stdin by default, write primary output to stdout, write errors to stderr, and exit with a meaningful status code. Programs that satisfy this contract compose for free.

### Process-Centric Design

Unix is organized around **processes**, not objects or services. Every running program is a process with its own address space, file descriptor table, and credentials. New processes are created by `fork()` — which clones the calling process — and `exec()` — which replaces the process image with a new program while preserving the file descriptor table. The shell is itself just a process that forks children, manipulates their file descriptors with `dup2()`, and calls `exec()`. There is no special mechanism for "launching" programs; the shell uses the same syscalls available to any process.

## How It Works

### The VFS Dispatch Path

When you call `read(fd, buf, n)`, the kernel executes this sequence:

1. Validates `fd` and retrieves the `struct file *` from the process's fd table.
2. Checks the access mode stored in the open file description (`O_RDONLY` or `O_RDWR`).
3. Calls `file->f_op->read_iter()` — a function pointer in the `struct file_operations` associated with this file type.
4. That function pointer dispatches to the concrete implementation: ext4's page cache reader, a pipe's ring buffer drain, a character device driver's hardware register reader.

The `struct file_operations` for a pipe looks roughly like:

```c
// fs/pipe.c (simplified)
const struct file_operations pipefifo_fops = {
    .read_iter  = pipe_read,
    .write_iter = pipe_write,
    .poll       = pipe_poll,
    .release    = pipe_release,
};
```

For `/dev/urandom` the same slot holds `urandom_read`. The kernel's call site is identical; only the function pointer differs.

### The Three-Table Architecture

The kernel maintains three distinct data structures (from *The Linux Programming Interface*, §5.4):

| Structure | Scope | Contains |
|---|---|---|
| File descriptor table | Per-process | close-on-exec flag, pointer to open file description |
| Open file description table | System-wide | file offset, access mode, pointer to i-node |
| i-node table | System-wide | file type, permissions, size, data block pointers |

The separation between the fd table and the open file description table is what makes `dup()` semantics precise. After `dup(fd1)`, two file descriptors share one open file description, meaning they share the same offset: a `read()` on one advances the position seen by the other.

```c
int fd1 = open("data.txt", O_RDONLY);
int fd2 = dup(fd1);       // fd1 and fd2 now index the same open file description

char buf[4];
read(fd1, buf, 4);        // file offset advances to 4
read(fd2, buf, 4);        // reads bytes 4–7, not 0–3 — offset is shared
```

By contrast, two separate `open()` calls on the same file create two independent open file descriptions, each with its own offset, both pointing to the same i-node:

```c
int fd3 = open("data.txt", O_RDONLY);
int fd4 = open("data.txt", O_RDONLY);  // independent offset from fd3

read(fd3, buf, 4);        // offset of fd3 advances to 4
read(fd4, buf, 4);        // reads bytes 0–3 again — independent offset
```

### Pipe Internals and Flow Control

A pipe is a fixed-size kernel ring buffer — 65536 bytes on Linux since kernel 2.6.11, controllable up to `/proc/sys/fs/pipe-max-size` via `fcntl(fd, F_SETPIPE_SZ, size)`. The capacity constraint creates natural flow control without explicit synchronization:

- When the buffer is full, `write()` on the write end **blocks** until the reader consumes data.
- When the buffer is empty, `read()` on the read end **blocks** until the writer produces data.
- When all write ends are closed, `read()` returns 0 (EOF).
- When all read ends are closed and a process writes, the kernel delivers **SIGPIPE** to the writer. If SIGPIPE is ignored, `
