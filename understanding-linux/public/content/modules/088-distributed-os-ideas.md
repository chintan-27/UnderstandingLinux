---
id: 88
title: "Distributed OS ideas"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Module 88: Distributed OS Ideas — Naming, Location Transparency, Failures, and Consistency

## Why This Matters

When a program calls `open("/mnt/nfs/notes.txt", O_RDONLY)`, the kernel's VFS layer routes that call through a mounted NFS filesystem driver, which issues a network RPC to a remote server — and the application sees none of this. That invisibility is the entire point, and achieving it requires solving three hard problems simultaneously: *naming* (how do you stably refer to something whose location can change?), *failure ambiguity* (how do you distinguish a slow server from a dead one?), and *consistency* (what is a reader allowed to see after a concurrent write?).

These problems compound each other. Solving naming with caches introduces consistency problems. Solving consistency with server-side state reintroduces the failure problem you were trying to eliminate. Understanding distributed OS design means understanding these tradeoffs as a system, not as isolated features.

---

## Core Concepts

### Naming

A **name** is an identifier decoupled from the resource's physical location. The critical property is **stability under relocation**: the name should remain valid even if the underlying storage moves.

The mechanism that achieves this is **indirection at a known rendezvous point**. DNS separates `mail.example.com` (a stable name clients hardcode) from `203.0.113.5` (a location that can change without client involvement). NFS uses **file handles** — opaque server-generated tokens, typically encoding `(filesystem_id, inode_number, generation_number)` — for exactly the same reason. The client stores the file handle; the server can reconstruct all context from it without maintaining per-client session state.

The generation number field matters: when an inode is freed and reallocated to a new file, the generation number increments. A stale file handle from a deleted file will not accidentally resolve to the new file even if it reuses the same inode slot.

At the kernel level, name resolution in a distributed filesystem passes through VFS. Every mount point registers a `dentry` and an associated `inode_operations` struct. When the pathname resolver crosses a mount point, it dispatches through the new filesystem's `lookup` operation instead of the local one:

```c
// Simplified: what NFS registers as its inode lookup operation
// fs/nfs/dir.c
static const struct inode_operations nfs_dir_inode_operations = {
    .lookup   = nfs_lookup,
    .create   = nfs_create,
    .unlink   = nfs_unlink,
    // ...
};

// nfs_lookup issues an RPC and returns a dentry backed by a remote inode.
// From the VFS caller's perspective, this is identical to ext4's lookup.
```

This is why location transparency is a *kernel design choice*, not a user-space hack: the abstraction boundary is inside the kernel, below any application call.

### Location Transparency

Location transparency means the client's interface is independent of where the resource lives. The cost is that **failure modes become semantically ambiguous** in a way that has no local equivalent.

On a local filesystem, `write()` returning `-1` with `errno = EIO` means the disk failed. Over NFS, the same error could mean:

1. The server never received the packet (write did not happen).
2. The server executed the write but the acknowledgment was lost (write happened, client doesn't know).
3. The server crashed mid-execution (write state is unknown).

From the client's perspective, all three produce identical observable behavior: the syscall eventually returns an error or times out. This is the **dual-failure problem** — network failure and server failure are indistinguishable from the outside. The consequence is that retrying a failed operation is only safe if the operation is **idempotent**.

### Idempotency

An operation $f$ is idempotent if applying it multiple times produces the same result as applying it once:

$$f(f(x)) = f(x)$$

More precisely, for an operation with side effects, idempotency means the side effect of $n$ applications equals the side effect of one application, for all $n \geq 1$.

| Operation | Idempotent? | Reason |
|---|---|---|
| `WRITE(fh, offset, data)` | Yes | Overwrites same bytes each time |
| `APPEND(fh, data)` | No | File size is mutable state; each call advances it |
| `READ(fh, offset, count)` | Yes | Pure read; no state change |
| `MKDIR(path)` | No | Second call fails or creates duplicate |
| `SETATTR(fh, size=0)` | Yes | Sets absolute value, not relative |

NFS v3 is designed so every procedure in the protocol is idempotent. This is not incidental — it is the explicit mechanism that makes crash recovery cheap. When the server restarts, clients retry their last RPC. The server executes it as if for the first time, and the result is correct. **Statelessness and idempotency are a package deal**: a stateless server can only be correct if its operations don't depend on execution history.

NFS v4 breaks this by introducing state (locks, delegations, open/close protocol). In exchange it gets better semantics — but now crash recovery requires a **grace period** where the server waits for clients to reclaim state before granting new conflicting state to anyone else.

### Consistency Models

Consistency defines the set of values a read is allowed to return given a history of writes. The models form a hierarchy ordered by strength — stronger models are easier to reason about but harder (more expensive) to implement.

**Sequential consistency**: All operations appear to execute in some total order consistent with each client's program order. Every client agrees on that order. This is what you implicitly assume when reasoning about a local filesystem.

**Close-to-open consistency** (NFS v3): When client A closes a file, all dirty data is flushed to the server (`COMMIT` RPC). When client B subsequently opens the same file, it fetches fresh attributes. Between open and close, B may serve reads from a stale local cache. This gives consistency at file-open granularity, not operation granularity.

**Callback consistency** (AFS): The server maintains a table of `(client, file)` pairs representing cached copies. When any client modifies a file, the server sends **callback break** messages to all other clients holding cached copies before acknowledging the write. The next access by those clients triggers a revalidation fetch. This approaches sequential consistency for reads, at the cost of server-side state.

The fundamental tension:

> Stronger consistency requires the server to track which clients have cached what. That server-side state is itself vulnerable to server crashes. Recovering it after a crash requires either a grace period (NFS v4), a persistent log (some distributed databases), or accepting that consistency degrades to a weaker model after a failure (AFS on callback loss).

---

## How It Works

### NFS: Stateless Protocol and Idempotent RPCs

The NFS v3 wire protocol is defined in RFC 1813. Every procedure is a self-contained RPC — the server needs no prior state to process it. The core read/write procedures:

```
NFSPROC3_READ(fh, offset, count)
    → (status, data, eof, post_op_attr)

NFSPROC3_WRITE(fh, offset, count, stable, data)
    → (status, count, committed, verf, post_op_attr)
```

The `stable` field in WRITE is significant: it can request `UNSTABLE` (data buffered in server RAM, fast but not durable), `DATA_SYNC` (data on disk, metadata buffered), or `FILE_SYNC` (full fsync, slow but safe). A client that uses `UNSTABLE` for performance must later issue a `COMMIT` RPC and verify the server's `verf` (write verifier) hasn't changed — if the server crashed and restarted between the WRITE and the COMMIT, the verifier changes, and the client knows it must retransmit everything.

The **file handle** is the distributed inode reference. On Linux's NFS server (`nfsd`), file handles are generated by `exportfs` and encoded by the kernel:

```bash
# Show what filesystems nfsd is currently exporting
cat /proc/fs/nfsd/exports

# nfsd threads live here; adjust thread count for throughput
cat /proc/fs/nfsd/threads

# nfsd filesystem is mounted at:
ls /proc/fs/nfsd/
```

The kernel NFS client caches file handles in its dcache/icache. You can observe NFS client statistics — including cache hits, revalidations, and RPC counts — directly:

```bash
# Per-mount NFS statistics: look for 'nfsv3' or 'nfsv4' sections
nfsstat -c

# Detailed per-RPC-procedure counters
cat /proc/net/rpc/nfs

# Per-mount stats including cache hit ratios, read/write bytes
cat /proc/self/mountstats
# Or for all mounts:
cat /proc/$(pgrep -n bash)/mountstats
```

### Observing Close-to-Open Consistency

The stale cache window in NFS v3 is measurable. The client caches file attributes for `acregmin`/`acregmax` seconds (default: 3–60s for regular files). During that window, a remote modification is invisible:

```bash
# Mount with aggressive caching (not recommended for shared data)
mount -t nfs -o acregmin=60,acregmax=120 server:/export /mnt/nfs

# Mount with minimal caching (closer to sequential consistency, slower)
mount -t nfs -o acregmin=0,acregmax=0 server:/export /mnt/nfs

# Check current mount options including cache timeouts
grep nfs /proc/mounts
# or
findmnt -t nfs -o TARGET,OPTIONS
```

You can reproduce the stale-read window experimentally: on client A, open a file and hold it open. On client B, write to it. Client A will not see the write until it closes and reopens (close-to-open), or until its attribute cache expires (whichever comes first).

### AFS: Callback Protocol

The AFS callback mechanism is more visible in OpenAFS on Linux. The kernel module registers with the server on each file fetch. You can inspect callback state:

```bash
# OpenAFS: list files with active callbacks
fs checkvolumes

#
