---
id: 83
title: "File systems"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Why This Matters

Every file append requires at minimum three separate on-disk writes: the inode (updated size and block pointer), the data bitmap (block marked allocated), and the data block itself. The disk subsystem provides no multi-sector atomicity guarantee — power can fail between any two of these writes. The question is not whether this happens but what state the file system is left in when it does. Without a consistency strategy, some failure windows produce silent corruption: an inode pointing to a block the bitmap considers free, or a file whose size field claims 4096 bytes of content but whose data block was never written.

---

## Core Concepts

### Files and Inodes

A file is an inode that points to data blocks. The name is a property of the directory entry, not the inode. This indirection is not cosmetic — it is the mechanism that makes hard links possible, and it determines what "deleting a file" actually means: `unlink()` decrements the inode's link count and removes the directory entry. The inode and its blocks are freed only when the link count reaches zero *and* no process holds the file open.

```c
// The kernel's in-memory representation (simplified from fs/ext4/ext4.h)
struct ext4_inode {
    __le16  i_mode;         // file type and permissions
    __le32  i_size_lo;      // lower 32 bits of file size
    __le32  i_atime;
    __le32  i_mtime;
    __le32  i_ctime;
    __le32  i_dtime;        // deletion time — nonzero means inode is unlinked
    __le16  i_links_count;  // hard link count; free when this hits 0
    __le32  i_blocks_lo;    // 512-byte blocks held by file
    __le32  i_block[EXT4_N_BLOCKS]; // block pointers (direct + indirect tree)
};
```

The inode stores no name. The name lives in the directory entry that references this inode number. Two directory entries with the same inode number are two names for one file.

### Block Pointer Tree

ext4 uses a tree of block pointers. For a file using 4 KiB blocks with 32-bit block numbers, a block pointer occupies 4 bytes, so one indirect block holds $4096 / 4 = 1024$ pointers. The reach of each level:

$$\text{Direct} = 12 \times 4\,\text{KiB} = 48\,\text{KiB}$$
$$\text{Single indirect} = 1024 \times 4\,\text{KiB} = 4\,\text{MiB}$$
$$\text{Double indirect} = 1024^2 \times 4\,\text{KiB} = 4\,\text{GiB}$$
$$\text{Triple indirect} = 1024^3 \times 4\,\text{KiB} = 4\,\text{TiB}$$

Modern ext4 replaces indirect blocks with **extents** — a (start block, length) pair stored directly in the inode's `i_block` field. A single extent can describe up to $2^{15}$ contiguous blocks = 128 MiB, collapsing a million-entry indirect tree into one record.

### Directories

A directory is a file whose data blocks contain a list of variable-length `(inode_number, entry_length, name_length, name)` records. Path resolution for `/home/user/foo.txt` requires:

1. Read root inode (inode 2, always) → read root data blocks → find `home`'s inode number
2. Read `home`'s inode → read `home`'s data blocks → find `user`'s inode number
3. Read `user`'s inode → read `user`'s data blocks → find `foo.txt`'s inode number
4. Read `foo.txt`'s inode → read data blocks

That is 4 inode reads and 4 directory/data reads for a three-component path, before any actual I/O on the file's contents. The `dentry` cache in the kernel (`dcache`) exists precisely to avoid this cost on repeated lookups.

### The Crash Consistency Problem

Appending one block to a file requires three writes. Call them $W_I$ (inode), $W_B$ (bitmap), $W_D$ (data block). The power can fail after any subset of the $2^3 - 1 = 7$ non-empty subsets complete:

| Completed writes | Structural state |
|---|---|
| $W_D$ only | Block contains data, nothing references it. Block appears free in bitmap. Harmless. |
| $W_I$ only | Inode references block; bitmap says it is free. **Inconsistency**: another file can be allocated this block. |
| $W_B$ only | Bitmap marks block allocated; no inode claims it. **Space leak** until fsck. |
| $W_D + W_I$, not $W_B$ | Data and inode agree; bitmap disagrees. fsck can repair. |
| $W_D + W_B$, not $W_I$ | Block allocated and initialized; inode still has old size and old block list. |
| $W_I + W_B$, not $W_D$ | Metadata fully updated; data block contains stale or uninitialized disk content. **Silent data corruption.** |
| All three | Consistent. |

The dangerous cases are $W_I$ only and $W_I + W_B$ without $W_D$: the inode now points to a block whose contents were never written, so a subsequent read returns whatever garbage was on disk at that location.

### fsck: Why It Became Unacceptable

`fsck` repairs inconsistencies by scanning every inode, every bitmap, and every directory block, then reconciling them. Recovery time is $O(d)$ where $d$ is disk capacity — independent of how large the most recent write was. On a 4 TiB spinning disk at 150 MB/s sustained read:

$$t_{\text{scan}} = \frac{4 \times 10^{12}\,\text{B}}{150 \times 10^6\,\text{B/s}} \approx 26{,}667\,\text{s} \approx 7.4\,\text{hours}$$

A database server that crashes and needs 7 hours before it can mount `/var` is not acceptable. The insight behind journaling is that this full scan is unnecessary: if you recorded *what you were about to do* before doing it, recovery only needs to examine that record.

---

## How It Works

### Journaling Protocol

The journal is a fixed-size circular log region on disk. Before modifying any file system structure, the kernel writes a transaction to the journal describing the intended changes. If a crash occurs, recovery replays committed transactions from the journal rather than scanning the full disk. Recovery time is $O(j)$ where $j$ is journal size — typically 128 MiB, making recovery take seconds rather than hours.

A transaction in the journal contains:

```
| TxB | I[v2] | B[v2] | Db | TxE |
   ↑                         ↑
   transaction begin     transaction end/commit
   (contains TID)        (contains checksum in ext4)
```

The protocol for **data journaling**:

```
1. Journal Write:  Write TxB + all modified blocks (data + metadata) to journal
2. Journal Commit: Write TxE to journal  ← atomicity pivot
3. Checkpoint:     Write modified blocks to their home locations on disk
4. Free:           Mark transaction space in journal as reclaimable
```

TxE is the critical write. It is a single 512-byte sector, and the disk firmware guarantees single-sector writes are atomic with respect to power failure. If TxE is absent, recovery ignores the transaction entirely — the file system is in its pre-transaction state. If TxE is present, recovery can safely replay every block in the transaction.

### Why Metadata-Only Journaling Is the Default

Data journaling writes every data block twice: once to the journal, once to its final location. For a sequential write of $n$ bytes, actual disk traffic is $2n + O(\text{metadata})$. For a database writing 1 GiB of data, this doubles I/O.

Metadata journaling (`data=ordered` in ext4) journals only inodes, bitmaps, and directory blocks. Data blocks are written directly to their final locations. This restores single-write traffic for data at the cost of one consistency guarantee: after a crash, metadata is always consistent, but a data block may contain stale content (though never another file's content, due to the ordering rule below).

### The Ordering Rule and Why It Exists

Metadata journaling creates a subtle hazard. Suppose the journal contains a committed transaction that recorded inode 47 as pointing to block 1000. After a checkpoint, block 1000 is freed and reallocated to inode 52, whose data is written directly to block 1000 (no journal for data). Now a crash occurs before the old journal transaction is freed.

Recovery replays the old transaction and writes inode 47's old version back, which points to block 1000 — overwriting inode 52's data with inode 47's old metadata pointer. This is a directed cross-file corruption.

The fix is a write ordering constraint: **data blocks must reach their final disk locations before the journal transaction that records their metadata is committed.** The sequence for metadata journaling is:

```
1. Write data blocks to final locations (D_write)
2. Issue write barrier — wait for D_write to complete
3. Write metadata blocks to journal
4. Write TxE
5. Checkpoint metadata to final locations
```

The barrier between steps 2 and 3 is what makes this safe. ext4 issues this as an `REQ_PREFLUSH` flag on the journal write, which causes the block layer to drain the write queue before proceeding.

### Atomic Rename: Crash Safety in Userspace

Because journaling makes individual metadata operations crash-consistent, `rename()` — which modifies a single directory entry — is atomic. This is the foundation of the safe-write pattern:

```c
#include <fcntl.h>
#include <unistd.h>
#include
