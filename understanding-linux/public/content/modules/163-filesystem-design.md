---
id: 163
title: "Filesystem design"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A filesystem turns a raw block device — a sequence of numbered 512-byte or 4096-byte sectors — into the named, hierarchical, persistent structure every program depends on. The design choices made here determine three concrete outcomes: whether your filesystem survives power loss, whether it stays fast after months of use, and how much CPU you burn on every `open()` call.

The failure modes are specific. **Fragmentation** on spinning media costs ~7 ms per seek; a file scattered across 100 blocks costs 700 ms to read sequentially versus ~5 ms if contiguous — a 140× difference. **Crash inconsistency** without journaling requires `fsck` to scan an entire 1 TiB disk, which takes minutes to hours. **Poor allocation** on multi-core systems serializes all allocations behind a single lock, making writes single-threaded regardless of how many CPUs you have.

---

## Core Concepts

### Block Allocation and Fragmentation

A filesystem carves disk space into fixed-size **blocks** (typically 4 KiB). The allocator's job is to decide which blocks to assign to which files. The naive approach — a simple free list threaded through every free block — degrades over time because deletions return blocks to the list in arbitrary positions. New files get blocks scattered across the disk.

On spinning media, the cost is seek latency. A disk rotates at 7200 RPM, completing one revolution in $\frac{60}{7200} \approx 8.3\ \text{ms}$. A random seek averages roughly half a rotation plus arm movement, typically **5–10 ms**. At 4 KiB per block, reading a 1 MiB file split into 256 scattered blocks costs:

$$t_{\text{fragmented}} \approx 256 \times 7\ \text{ms} = 1.79\ \text{s}$$

versus a contiguous read at, say, 150 MB/s:

$$t_{\text{contiguous}} = \frac{1\ \text{MiB}}{150\ \text{MB/s}} \approx 6.7\ \text{ms}$$

This is why early Unix filesystems degraded from ~175 KB/s to ~30 KB/s after weeks of normal use — an 83% throughput loss from free list scrambling alone.

**Extents** are the modern answer. Rather than storing a list of individual block numbers, an extent encodes a contiguous run:

```
extent = (start_block: u64, length_in_blocks: u32)
```

A 1 GiB file stored contiguously requires **one** extent entry instead of $\frac{1\ \text{GiB}}{4\ \text{KiB}} = 262{,}144$ individual block pointers. This reduces metadata overhead and eliminates per-block pointer indirection for large sequential files.

**Allocation groups** (XFS) partition the disk into independent regions, each with its own free space bitmap, inode table, and allocator state. Because each group is self-contained, multiple threads can allocate simultaneously without contention — allocation scales with CPU count. As a secondary benefit, files are allocated near the inodes that describe them, so reading a file's inode and then its first data block is likely a short seek rather than a full disk crossing.

### Metadata and the Inode

Every file has **data** (user bytes) and **metadata** (everything describing those bytes). The core metadata structure is the **inode**, which in ext4 looks roughly like this in the kernel source:

```c
struct ext4_inode {
    __le16  i_mode;         /* file type and permissions */
    __le16  i_uid;          /* lower 16 bits of owner uid */
    __le32  i_size_lo;      /* file size in bytes (lower 32 bits) */
    __le32  i_atime;
    __le32  i_ctime;
    __le32  i_mtime;
    __le32  i_dtime;        /* deletion time */
    __le16  i_gid;
    __le16  i_links_count;
    __le32  i_blocks_lo;    /* block count (lower 32 bits) */
    __le32  i_flags;        /* EXT4_EXTENTS_FL, etc. */
    /* ... */
    __le32  i_block[EXT4_N_BLOCKS]; /* 15 entries: direct, indirect, extent tree root */
    /* ... */
    __le32  i_size_high;    /* upper 32 bits of file size */
};
```

The `i_block` array is dual-purpose: if `EXT4_EXTENTS_FL` is set in `i_flags`, it holds the root of an extent tree; otherwise it holds the legacy block pointer tree. This flag is per-inode, not per-filesystem.

Directories are themselves files whose data encodes a name → inode number mapping. ext4 uses an HTree (a variant of a B-tree) for large directories to keep lookup $O(\log n)$ rather than $O(n)$. Path resolution is a chain of inode reads:

```
stat("/home/user/notes.txt")
  → lookup inode 2 (root)    → read its directory data → find "home" → inode N
  → read inode N             → read its directory data → find "user" → inode M
  → read inode M             → read its directory data → find "notes.txt" → inode K
  → read inode K             → return stat data from inode K
```

Without caching, this is 4+ disk reads for a single `stat()`. The Linux **dentry cache** (dcache) and **inode cache** (icache) in `fs/dcache.c` and `fs/inode.c` keep recently resolved path components in memory. A warm cache reduces all of the above to pure RAM lookups.

### Journaling and Crash Consistency

A simple file append requires three distinct disk writes:

1. Write the new data blocks to their locations
2. Update the inode (new block pointers, new `i_size`)
3. Update the block group's free space bitmap (mark those blocks used)

Power can fail between any two writes. Between writes 1 and 2: data is on disk but the inode doesn't reference it — the blocks are leaked, invisible to the filesystem, unrecoverable without `fsck`. Between writes 2 and 3: the inode references blocks still marked free — a subsequent allocation can overwrite them, silently corrupting a live file.

The pre-journaling solution was `fsck`, which repairs inconsistencies by scanning the entire filesystem: reading every inode, every directory, every bitmap, cross-checking all references. On a 1 TiB disk with millions of files, this takes minutes to hours and blocks mount. It is not a recovery strategy; it is a consequence of having no recovery strategy.

**Journaling** imposes **write-ahead logging**: before any change reaches its final on-disk location, a description of that change is written to a fixed circular region — the **journal** — and confirmed with a commit record. The sequence:

1. Write a **journal descriptor block** (lists which blocks this transaction modifies)
2. Write the modified metadata blocks into the journal
3. Write a **commit block** (the atomic seal — a single sector write)
4. **Checkpoint**: copy journal contents to their final locations
5. Reclaim journal space

Crash before step 3: the transaction has no commit block and is ignored on recovery — the disk is in the pre-operation state. Crash after step 3: on next mount, the kernel replays the journal forward to the last commit. Recovery time is bounded by journal size (typically 128 MiB), not filesystem size. For a 128 MiB journal at 100 MB/s replay speed, worst-case recovery is ~1.3 seconds.

**Journaling modes** trade safety for performance:

| Mode | What's journaled | Crash guarantee |
|---|---|---|
| `journal` | data + metadata | No data loss for committed writes |
| `ordered` | metadata only; data flushed before commit | No stale data exposed via new metadata |
| `writeback` | metadata only; no ordering | Consistent structure, possibly stale file contents |

`ordered` mode (ext4's default) prevents the specific hazard where a crash could cause a newly-extended file to expose uninitialized disk blocks. The data flush before journal commit ensures that if the inode update is recovered, the data it points to is actually there.

The write amplification of journaling is real. For metadata-only journaling (`ordered` mode):

$$\text{total writes} = \underbrace{N_{\text{data}}}_{\text{data, once}} + \underbrace{2 \times N_{\text{meta}}}_{\text{journal + final location}}$$

For `journal` mode (data + metadata both journaled):

$$\text{total writes} = 2 \times N_{\text{data}} + 2 \times N_{\text{meta}}$$

This is why metadata-heavy workloads (many small file creates) feel the cost of journaling most acutely — each `creat()` touches inode, directory block, and bitmap, all of which are written twice.

### Copy-on-Write (CoW)

Journaling still modifies blocks in place — it just logs the intent first. CoW takes a different invariant: **no block is ever overwritten**. When a block is modified:

1. Allocate a new block
2. Write new content to the new block
3. Update the parent structure to point to the new block
4. Release the old block when no snapshot references it

Because the old block is intact until all parent pointers are updated, the filesystem is always consistent at the last **checkpointed tree root** — a single pointer that atomically defines the filesystem state. On recovery, discard any tree nodes written after the last valid root. No journal replay needed; no `fsck` needed.

The snapshot mechanism falls out of this for free. A snapshot is just an additional reference to a tree root. Since old blocks are never overwritten, the snapshot's tree remains valid indefinitely. Creating a snapshot costs $O(1)$ — one pointer write.

The cost: CoW cannot update a block in place, so every write to the middle of a file triggers a cascade of new allocations up the tree (data block → parent node → ... → root). This **write amplification** is bounded by tree depth but is nonzero even for single-byte writes. It also makes CoW filesystems
