---
id: 198
title: "Interprocess communication design"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every non-trivial program eventually needs to talk to another program. The choice of IPC mechanism determines latency, throughput, synchronization cost, and failure semantics. Pick the wrong one and a database that should handle 100k queries/second stalls at 3k because every request crosses a socket boundary unnecessarily; or two processes corrupt shared state because there is no memory barrier between writer and reader. Understanding IPC from first principles means understanding what the kernel does when data moves between address spaces — and therefore where the cost comes from.

---

## Core Concepts

### Address Space Isolation Is the Root Problem

Each process lives in its own virtual address space. A pointer valid in process A is meaningless in process B — it refers to a different physical page, or no mapped page at all. Every IPC mechanism is a controlled exception to this isolation, and the kernel overhead of each mechanism comes directly from what it must do to bridge that gap safely.

### Pipes: Kernel-Mediated Byte Streams

A pipe is a kernel-managed ring buffer. One file descriptor is the write end; one is the read end. The kernel copies data from the writer's address space into the buffer on `write(2)`, then copies it again into the reader's address space on `read(2)`. This is a **two-copy** model. The pipe has no structure — it is a raw byte stream. The kernel enforces flow control: writes block when the buffer is full; reads block when it is empty. That blocking behavior is what makes pipes safe for producer-consumer synchronization without any explicit locks in userspace.

### Shared Memory: Zero-Copy, Full Responsibility

Shared memory maps the same physical pages into two or more virtual address spaces simultaneously via `mmap(2)`. There is **no kernel copy** on the data path after setup. This is the fastest IPC mechanism for bulk data precisely because the bottleneck becomes memory bandwidth rather than kernel crossing cost. The tradeoff is that all synchronization is now your problem. Without explicit primitives — POSIX semaphores, futexes, or at minimum C11 atomic operations with the correct memory order — the reader can observe a partially written structure. The kernel provides the mapping; it provides nothing about ordering.

### Sockets: Addressable, Bidirectional Streams

A Unix domain socket is a pipe with addressing: you name it with a filesystem path, and multiple independent processes can connect to it without a prior `fork`. A TCP socket extends this over a network. Both involve kernel copies like pipes, but carry connection state and support bidirectional communication. The `connect`/`accept` lifecycle adds syscall overhead absent in pipes; what you gain is that the communicating processes need no common ancestor.

### RPC: Protocol Layered on Transport

RPC is not a kernel mechanism — it is a software convention. A caller marshals arguments into a message, sends it over some transport (socket, pipe, shared memory), the receiver unmarshals and dispatches to the appropriate function, then sends a response back. The kernel sees only bytes. RPC adds structure to an unstructured channel. Its cost is serialization and the full round-trip latency of the underlying transport, which is why latency-sensitive systems (Redis, memcached) use carefully designed binary protocols over Unix sockets rather than gRPC or similar.

### Protocol Design: The Contract Between Processes

Any time two processes communicate over a stream, they need framing: how does the reader know where one message ends and the next begins? Without framing, a `read(2)` on a stream socket may return half a message, one message, or three messages concatenated. This is not an edge case — it is the guaranteed behavior of SOCK_STREAM and pipes. Bad framing causes parsers that silently corrupt data, not parsers that fail loudly.

---

## How It Works

### Pipe Internals

The kernel's pipe buffer is a circular buffer of pages. On Linux the default capacity is 65536 bytes (16 × 4096-byte pages), observable via:

```bash
cat /proc/sys/fs/pipe-max-size     # system maximum, typically 1048576
ulimit -p                          # per-process default in 512-byte units
```

A write of $N \leq \texttt{PIPE\_BUF}$ bytes (4096 on Linux, defined in `<limits.h>`) is **atomic** — no other writer can interleave. Writes larger than `PIPE_BUF` may be split into multiple non-atomic operations, which matters when multiple processes write to the same pipe.

The round-trip latency for a ping-pong message of size $N$ bytes through a pipe is approximately:

$$t_{\text{pipe}} \approx 2 \cdot C_{\text{syscall}} + 2 \cdot \frac{N}{B_{\text{mem}}}$$

where $C_{\text{syscall}} \approx 100\text{–}300\ \text{ns}$ on a modern Linux kernel (measurable with `perf stat`) and $B_{\text{mem}}$ is memory bandwidth. The factor of 2 on both terms comes from the write-in and read-out copy pair. For $N = 64$ bytes, the copy term is negligible and syscall overhead dominates. For $N = 4\ \text{MB}$, the copy term at $B_{\text{mem}} = 40\ \text{GB/s}$ costs $\approx 200\ \mu\text{s}$ and dominates.

```c
#include <unistd.h>

int main(void) {
    int fds[2];
    pipe(fds);   // fds[0] = read end, fds[1] = write end

    if (fork() == 0) {
        close(fds[0]);               // child is writer; close read end
        write(fds[1], "hello", 5);
        _exit(0);
    }

    close(fds[1]);                   // parent is reader; MUST close write end
    char buf[5];
    read(fds[0], buf, 5);
    // buf now contains "hello"
}
```

Closing the unused end is not a hygiene issue — it is a correctness issue. The kernel tracks the reference count on each pipe end. If the parent holds the write end open while calling `read(2)`, the read will block forever: the kernel sees a nonzero refcount on the write end and therefore cannot signal EOF, even though no process will ever write to it.

You can also increase pipe capacity for high-throughput use:

```c
#include <fcntl.h>
// After pipe(fds):
fcntl(fds[1], F_SETPIPE_SZ, 1 << 20);  // request 1 MiB buffer
```

### Shared Memory: mmap and POSIX shm

POSIX shared memory creates a named object in `tmpfs` under `/dev/shm/`. The `shm_open(3)` call returns a file descriptor backed by that object; `mmap(2)` maps it into the calling process's address space. Two processes mapping the same object get different virtual addresses pointing to the same physical pages — no copy occurs on access.

```c
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdatomic.h>

// Process A: creator and writer
int fd = shm_open("/myregion", O_CREAT | O_RDWR, 0600);
ftruncate(fd, 4096);
void *addr = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
close(fd);   // fd no longer needed after mmap

atomic_store_explicit((_Atomic int *)addr, 42, memory_order_release);

// Process B: reader
int fd2 = shm_open("/myregion", O_RDONLY, 0);
void *addr2 = mmap(NULL, 4096, PROT_READ, MAP_SHARED, fd2, 0);
close(fd2);

int val = atomic_load_explicit((_Atomic int *)addr2, memory_order_acquire);
// val is 42 if process A's store has completed; the acquire/release pair
// ensures the compiler and CPU do not reorder across these operations.
```

The named object persists in the filesystem until explicitly removed:

```bash
ls /dev/shm/            # see live shared memory objects
rm /dev/shm/myregion    # or: shm_unlink("myregion") from C
ipcs -m                 # also shows System V shmget segments
```

Without the `memory_order_release` / `memory_order_acquire` pair, the compiler is free to reorder the store past subsequent operations, and on ARM the CPU may also reorder the store relative to the load in the other process. On x86 the CPU memory model (TSO) prevents most reorderings, but compiler reordering is still possible. The correct abstraction is C11 atomics or `__sync_*` builtins — not x86-specific assumptions.

The virtual address layout when two processes map the same physical pages looks like this. Let the shared region occupy physical frames $[p, p+k)$. In each process the page table entries for their respective virtual ranges point to the same physical frames:

$$\text{PTE}_A[v_A + i] = \text{PTE}_B[v_B + i] = p + i \quad \text{for } i \in [0, k)$$

A write to $v_A + i \cdot 4096$ by process A is immediately visible at $v_B + i \cdot 4096$ in process B, subject only to memory ordering constraints.

### The Cost Difference: Copy vs. No-Copy

For a message of size $N$ bytes:

| Mechanism | Copies | Syscalls per message |
|---|---|---|
| Pipe | 2 | 2 |
| Unix domain socket | 2 | 2 |
| Shared memory (data path) | 0 | 0 |
| `sendfile(2)` | 0–1 (kernel DMA path) | 1 |

For small messages ($N \ll 1\ \text{KB}$), syscall overhead dominates: $t \approx 2 \cdot C_{\text{syscall}}$ regardless of $N$. For large messages ($N \gg 1\ \text{MB}$), the copy cost dominates: $t \appro
