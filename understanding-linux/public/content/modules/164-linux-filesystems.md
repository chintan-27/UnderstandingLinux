---
id: 164
title: "Linux filesystems"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A filesystem translates a flat sequence of addressable blocks into a named, hierarchical, crash-consistent structure. The translation is non-trivial: a single `write(2)` may require updating an inode, a block allocation bitmap, a directory entry, and journal records — none of which are atomically writable on real hardware. ext4, XFS, and Btrfs each solve this problem with different data structures, and those differences have direct performance consequences. A workload that saturates ext4's journal under parallel small writes may run without contention on XFS because XFS never had a single global allocation lock in the first place. Understanding the internals lets you predict behavior, not just observe it.

---

## Core Concepts

### The Block Layer and VFS

Every filesystem registers itself with the kernel's **VFS (Virtual Filesystem Switch)** by filling a `struct file_operations` and `struct inode_operations` with function pointers. The VFS routes `open(2)`, `read(2)`, `write(2)`, and `stat(2)` through those pointers, which is why the same syscall path reaches ext4, XFS, a tmpfs, or a FUSE mount. The filesystem itself sits atop the **block layer**, which presents storage as a linear array of fixed-size logical blocks (512 B or 4 KiB depending on device and filesystem configuration).

The relevant kernel source lives under `fs/ext4/`, `fs/xfs/`, and `fs/btrfs/`. The block layer itself is under `block/`.

### Journaling: The Problem and the Three Solutions

Writing a file is not atomic. Creating a new file requires, at minimum:

1. Allocating an inode (updating the inode bitmap)
2. Writing inode metadata
3. Allocating data blocks (updating the block bitmap)
4. Writing the directory entry

These touch at least four separate disk locations. A power failure between any two leaves the filesystem inconsistent. **Journaling** solves this by writing a commit record to a dedicated log region before scattering updates to their final locations. On recovery, `e2fsck` or `xfs_repair` replays or discards incomplete transactions based on that log.

Three modes, in order of increasing safety and decreasing write throughput:

| Mode | What's journaled | Guarantee on crash | Typical overhead |
|---|---|---|---|
| `writeback` | Metadata only | No stale data in new blocks, but old data may appear | Lowest |
| `ordered` | Metadata only, but data flushed first | Data blocks written before journal commit | Moderate |
| `journal` | Data + metadata | Fully consistent, but all data I/O is doubled | Highest |

`ordered` is ext4's default. The ordering constraint means that if the journal commit is on disk, the data it references is also on disk — but the journal itself carries no data blocks, so there is no write amplification for data.

To inspect or change the journaling mode on ext4:

```bash
# Check current mount options (look for data=ordered / data=journal / data=writeback)
grep -E 'ext4|data=' /proc/mounts

# Mount with explicit mode (writeback example)
mount -o remount,data=writeback /dev/sda1 /mnt
```

### Extents vs. Block Maps

ext2/ext3 tracked file block locations using a **block map**: a tree of single-block pointers. For a 1 GiB file with 4 KiB blocks, that is $1024^3 / 4096 = 262{,}144$ pointer entries. The tree has three indirection levels; reaching a block near the end of the file requires reading the triple-indirect block, then an indirect block, then the data block — three extra reads.

**Extents** replace this with a `(start_block, length)` pair describing a physically contiguous run. A perfectly unfragmented 1 GiB file needs exactly one extent. The metadata cost drops from $O(n)$ pointers to $O(k)$ extents where $k$ is the fragmentation count. ext4 and XFS both use extents exclusively.

The ext4 extent descriptor:

```c
struct ext4_extent {
    __le32  ee_block;    /* first logical block number in this extent */
    __le16  ee_len;      /* number of blocks covered (max 32768) */
    __le16  ee_start_hi; /* high 16 bits of physical block number */
    __le32  ee_start_lo; /* low 32 bits of physical block number */
};
```

The length field is 15 usable bits (the high bit marks an uninitialized/preallocated extent), so the maximum size of one extent is:

$$2^{15} \times 4096 \text{ B} = 32768 \times 4096 = 128 \text{ MiB per extent}$$

A file can have up to 4 extents stored inline in the inode itself (in the 60 bytes that ext2/ext3 used for block pointers). Beyond 4 extents, the inode holds the root of an **extent B-tree** instead.

Inspect extents directly with `filefrag`:

```bash
# Show physical extent layout for a file
filefrag -v /path/to/file

# Count extents (fragmentation proxy)
filefrag /path/to/file | grep extents
```

### Allocation Groups (XFS)

XFS divides the filesystem into **Allocation Groups (AGs)**, each a fully self-contained region with its own inode B-tree, free-space B-trees, and reference count structures. The default AG size is 1 GiB (adjustable at `mkfs` time with `-d agsize=`). Because each AG has independent locks, threads writing to files in different AGs never contend — allocation scales linearly with the number of AGs up to the point of storage bandwidth saturation.

Within each AG, XFS maintains **two** free-space B-trees:

- **bno tree**: extents sorted by starting block number — used for locality-aware allocation ("give me a free extent near block X")
- **cnt tree**: extents sorted by size — used for best-fit allocation ("give me any free extent of at least N blocks")

This dual-tree design means both query shapes run in $O(\log n)$ time, where $n$ is the number of free extents in the AG. ext4's single free-space structure does not support both queries with equal efficiency.

Inspect AG layout:

```bash
# Show AG structure summary
xfs_info /dev/sda1

# Dump AG free-space B-trees for AG 0
xfs_db -r /dev/sda1 -c 'agf 0' -c 'print'
```

### Delayed Allocation (XFS and ext4)

When an application writes to a file, the kernel stores the data in the **page cache** and marks the pages dirty. A naive filesystem would assign physical blocks immediately at write time. **Delayed allocation** defers block assignment until the page cache writeback actually happens. The benefit: by the time writeback runs, the filesystem knows the full extent of a growing file and can allocate a single large contiguous extent rather than many small ones assigned incrementally.

For a file that grows from 0 to $N$ bytes in small writes, delayed allocation reduces extent count from $O(N / \text{block\_size})$ to $O(1)$ in the ideal case. The tradeoff is that `df` and `du` may disagree transiently — unwritten cached data consumes no on-disk space yet.

```bash
# Force writeback of dirty pages (triggers delayed allocation commits)
sync

# Or per-file
fsync(fd)   # syscall; from shell: use 'cp --no-preserve=all && sync'
```

### Copy-on-Write (Btrfs)

Btrfs never overwrites existing blocks. On a write, it:

1. Writes new data to a freshly allocated block
2. Updates the parent B-tree node to point to the new block (also writing that node to a new location)
3. Walks up the tree, rewriting each ancestor node
4. Atomically swaps the tree root pointer to the new root

This walk is the reason Btrfs requires no separate journal for metadata consistency: the old tree is fully intact until the new root is committed. Crash at any point before the root swap leaves the old tree visible; crash after leaves the new tree visible. No intermediate state is reachable.

Write amplification from COW: a write to a leaf data block triggers rewriting $O(h)$ B-tree nodes, where $h$ is the tree height. For a filesystem with millions of files, $h \approx 4$–$6$, so one data write may cause 5–7 block writes total.

Snapshots are $O(1)$ in both time and space at creation:

```bash
# Create a snapshot of subvolume /data to /snapshots/data-20240101
btrfs subvolume snapshot /data /snapshots/data-20240101

# List all subvolumes and snapshots
btrfs subvolume list /

# Show per-subvolume disk usage (exclusive vs. shared blocks)
btrfs filesystem du -s /snapshots/data-20240101
```

The snapshot simply increments the reference count on the existing B-tree root. Blocks become exclusive to the snapshot only as the original subvolume's COW writes diverge from it — at that point Btrfs allocates new blocks for the diverged path.

---

## How It Works

### ext4 On-Disk Layout

ext4 divides the device into **block groups**, each typically 128 MiB. The layout within a block group:

```
[ superblock (copy) ][ group descriptors ][ block bitmap ][ inode bitmap ][ inode table ][ data blocks ]
```

The superblock at byte offset 1024 from partition start holds global state: block size, total block and inode counts, the journal inode number, and a feature bitmap that controls which on-disk format extensions are active. Reading it:

```bash
# Human-readable superblock dump
dumpe2fs /dev/sda1 | head -60

# Raw hex at offset 1024 (superblock magic is 0xEF53 at offset +56)
xxd -s 1024 -l 128 /dev/sda1
```

The inode stores timestamps, permission bits, size, and — for small files — up to 60 bytes of inline data or
