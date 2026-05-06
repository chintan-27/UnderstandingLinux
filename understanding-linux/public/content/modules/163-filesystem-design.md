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

## Core Concepts
### Allocation Strategies
A filesystem must map logical file offsets to physical storage blocks. Three classic strategies differ in how they store this mapping and the resulting fragmentation overhead.

*Contiguous allocation* reserves a run of **N** consecutive blocks for a file of size **S = N·B**, where **B** is the block size.  
- **Pros:** Sequential I/O achieves peak throughput because the drive can read/write the run without seeks.  
- **Cons:** External fragmentation grows as free space becomes scattered. The probability that a random free hole of size **H** can accommodate a new file of size **S** is  
  \[
  P_{\text{fit}} = \frac{\max(0, H-S+1)}{H+1}
  \]
  assuming uniformly distributed hole locations. Over time, **P_fit** declines, forcing the allocator to either split files (defeating contiguity) or fail allocation.

*Linked allocation* stores each block with a pointer to the next block (usually a 4‑byte field inside the block). The file is a singly‑linked list.  
- **Space overhead:** each data block loses **P** bytes for the pointer, leaving usable capacity **B‑P** per block. For **B=4 KiB** and **P=4 B**, overhead is **0.1 %**.  
- **Pros:** No external fragmentation; any free block can be used.  
- **Cons:** Random access requires traversing **O(N)** pointers; each pointer read incurs an extra I/O unless the block is cached.

*Indexed allocation* keeps an index block (or tree) that lists pointers to all data blocks. A single index block can hold **⌊B/P⌋** pointers.  
- **For B=4 KiB, P=4 B:** an index block can reference **1024** data blocks → maximum file size **1024·B = 4 MiB** with a single index level. Larger files use multi‑level trees (e.g., ext4 extent trees).  
- **Space overhead:** index blocks consume **⌈S/(B·⌊B/P⌋)⌉·B** bytes. For a 1 GiB file, overhead ≈ **1 MiB** (0.1 %).  
- **Pros:** Supports efficient random access (O(log_F N) with fan‑out **F = B/P**) and eliminates external fragmentation.  
- **Cons:** Slightly more complex allocation/free logic; index blocks must be kept coherent with data blocks.

The modern Linux filesystems (ext4, XFS, btrfs) use *extent‑based indexed allocation*: each extent records a triplet **(start_block, length, flag)**. An extent can describe a run of contiguous blocks, giving the benefits of contiguous allocation while retaining the flexibility of indexed allocation.

### Metadata and the Inode
Metadata (ownership, permissions, timestamps, ACLs, xattr pointers) is stored separately from file data to enable fast lookup and sharing. In Linux VFS each file is represented by an **inode** (index node).  

*On‑disk layout (ext4 example):*  
- Fixed size **256 B** (adjustable via `mke2fs -I`).  
- Fields:  
  - `__le16 i_mode` (file type + permissions)  
  - `__le32 i_uid`, `__le32 i_gid`  
  - `__le64 i_size` (bytes)  
  - `__le32 i_atime`, `__le32 i_ctime`, `__le32 i_mtime`, `__le32 i_dtime`  
  - `__le16 i_links_count`  
  - `__le32 i_blocks` (count of 512‑byte sectors)  
  - `__le32 i_flags` (e.g., `EXT4_EXTENT_FL` for extent‑based mapping)  
  - `__le32 i_block[EXT4_N_BLOCKS]` (array: first 12 direct, then indirect, double‑indirect, triple‑indirect; if extent flag set, this array holds extent tree root).  

*Memory representation:* `struct inode` in the VFS layer points to a filesystem‑specific struct (`struct ext4_inode_info`) that caches the on‑disk fields and adds radix trees for page cache, locking, etc.

The inode number (`i_ino`) is a unique identifier within a filesystem; directory entries store `(name, i_ino)` pairs, enabling O(1) lookup via the directory’s hash table (ext4 uses a linear list with optional `dx` hash tree for large directories).

### Journaling (Write‑Ahead Log)
Journaling guarantees *atomicity* of metadata updates and, optionally, data updates, by recording intent before committing changes to the main filesystem.

A transaction proceeds as follows:
1. **Begin:** allocate a transaction ID (`tid`) and reserve space in the journal (a circular log on disk).  
2. **Update:** write modified metadata blocks (and, if `data=journal` mode, data blocks) to the journal *as they are modified*. Each logged block includes a header with `{tid, block_type, length, checksum}`.  
3. **Commit:** write a *commit block* to the journal that records the final `tid`. The filesystem then **flushes** the journal to disk (ensuring the log is durable).  
4. **Checkpoint:** after the commit block is safely on disk, the actual filesystem blocks may be overwritten in place. The journal entry is later erased when its `tid` falls behind the checkpoint tail.

*Why this works:* If power fails after step 3 but before step 4, the journal contains a complete, ordered record of all changes. On remount, the replayer redoes (`redo`) each logged block in order, reconstructing the filesystem to a consistent state. If the failure occurs before the commit block, the transaction is incomplete and is simply ignored (no partial updates become visible).

The journal size must accommodate the *worst‑case* dirty metadata during a transaction. For ext4, the default journal is **128 MiB** (≈ 32 768 blocks of 4 KiB). The required size **J** can be estimated by  
\[
J \ge T_{\max} \cdot B_{\text{meta}}
\]
where `T_max` is the maximum number of metadata blocks that may be dirtied in a single syscall (e.g., rename updates two directory entries + parent inodes) and `B_meta` is block size.

### Crash Consistency
Beyond journaling, modern filesystems employ additional mechanisms to achieve *crash consistency*:

- **Metadata checksums:** each metadata block (inode, extent tree, directory block) carries a CRC32c. On read, the kernel verifies the checksum; a mismatch triggers `EIO` and marks the filesystem read‑only to prevent propagating corruption.  
- **Write barriers:** block‑device flush (`flush` cache) ensures that data written to the device’s volatile cache reaches non‑volatile media before subsequent writes. The VFS issues `blkdev_issue_flush()` after a journal commit.  
- **Orphan list:** inodes that are unlinked but still open are placed on a per‑superblock orphan list; after a crash, `fsck` truncates them to zero length, reclaiming space.  

Together, these guarantee that after a crash the filesystem can be brought back to a state where all *committed* transactions are reflected and no dangling pointers exist.

### Copy‑on‑Write (COW)
COW defers overwriting existing data by writing modifications to a *new* location and updating pointers only after the new copy is safely persisted. This yields two key benefits:

1. **Inline snapshots:** the old version remains accessible via the original pointers, enabling read‑only snapshots without extra space (except for diverging blocks).  
2. **Crash safety:** if a crash occurs before the pointer update, the original data is untouched; if it occurs after, the new data is fully written and the pointer update is atomic (usually a single sector write).

In btrfs, each file is represented by a *root node* of a B‑tree that holds extent items `(logical_start, physical_start, length, type)`. When a range `[L, L+S)` is modified:
- Allocate new physical blocks for the data (`S` bytes).  
- Create new extent items pointing to those blocks.  
- Insert the new items into the tree, splitting nodes as needed (copy‑on‑write propagates up to the root).  
- Write the new root block; then atomically replace the old root pointer in the tree’s superblock with a `commit_write` operation (protected by a superblock checksum and write barrier).  

The space overhead of COW is proportional to the amount of divergent data: each modified block consumes **2·B** (original + copy) until the snapshot is deleted or the block is re‑referenced.

---

## How It Works
When a user process issues a file operation, the VFS translates it into a sequence of low‑level actions that involve allocation, metadata updates, journaling, and possibly COW. Consider the `open("file", O_CREAT|O_WRONLY, 0644); write(fd, buf, len);` sequence on an **ext4** filesystem with `data=ordered` (the default).

1. **Path lookup** – VFS walks the directory tree, reading directory blocks and checking each entry’s `i_ino` against the name hash. For a large directory, ext4’s `dx` hash tree reduces lookup from O(N) to O(log N).  
2. **Inode allocation** – If `O_CREAT` and the inode does not exist, the allocator selects a free inode from the inode bitmap. The inode bitmap is itself stored in a block group; locating a zero bit uses a *find‑first‑zero* instruction (`ffz`) on each 64‑bit word, yielding O(number of words) ≈ O(​inode‑blocks/64). The chosen inode is then initialized: mode set, size cleared, link count set to 1, and the inode is marked dirty.  
3. **Journal start** – A transaction is begun; the inode allocation bitmap block and the new inode block are written to the journal.  
4. **Data block allocation** – Extent‑based allocator searches the free‑space bitmap (or uses a buddy allocator per block group) for a run of **N** contiguous blocks where `N = ⌈len / B⌉`. The allocator prefers *preallocation* (via `fallocate`) to reduce fragmentation; if unavailable, it may split the request into multiple extents.  
5. **Extent tree update** – The new extent `(phys_start, len, flag)` is inserted into the inode’s extent tree. This may cause node splits; each split creates a new buffer that is journaled.  
6. **Data write** – The user data is copied into the page cache; the filesystem marks the corresponding pages dirty. In `data=ordered` mode, the data is *not* journaled yet; instead, the filesystem ensures that the data blocks are written to disk *before* the transaction commits (via `writepage` and `flush`).  
7. **Commit** – After all dirty data pages have been flushed to the underlying block device, the journal writes a commit block. A final `flush` ensures the commit reaches non‑volatile media.  
8. **Inode update** – The inode’s `i_size`, `i_blocks`, and `i_mtime` fields are updated and marked dirty; these changes are part of the same transaction and thus are journaled with the commit.  
9. **End** – The transaction is marked complete; the journal tail may advance, freeing space for future transactions.

If the same operation were performed on a **btrfs** filesystem with COW and snapshots enabled, steps 4–6 differ:

- Allocation: btrfs allocates new physical blocks for the data (no attempt to place them contiguously unless a hint is given).  
- COW: the existing extent tree nodes covering the modified range are *not* overwritten; instead, new nodes are allocated and linked, leaving the old tree intact (snapshot preserved).  
- Commit: the new superblock root is written, then a barrier ensures its durability; the old superblock remains valid until the next commit overwrites it.

Thus, the same high‑level syscall results in distinct on‑disk actions dictated by the allocation/journaling/COW policies of the underlying filesystem.

---

## Worked Examples
### Example 1: Creating a 128 KiB File on ext4 (default 4 KiB blocks, journal=128 MiB)
**Goal:** Show the exact number of metadata blocks touched and the journal space consumed.

**Parameters:**  
- Block size **B = 4096 B**  
- Extent header overhead: each extent tree node = one block (holds up to **⌊(B‑sizeof(struct ext4_extent_header))/sizeof(struct ext4_extent)⌋ ≈ 400 extents).  
- File size **S = 128 KiB = 32 blocks**.

**Step‑by‑step:**

| Step | Action | Blocks written (data) | Blocks written (metadata) | Journal blocks |
|------|--------|-----------------------|---------------------------|----------------|
| 1 | Allocate inode (bitmap + inode block) | 0 | 2 (bitmap + inode) | 2 |
| 2 | Allocate data blocks (contiguous run) | 32 | 0 (bitmap updates are metadata) | 1 (data‑bitmap block) |
| 3 | Insert extent into inode’s extent tree (tree depth = 1, root fits in one block) | 0 | 1 (extent tree root block) | 1 |
| 4 | Update inode (size, blocks, timestamps) – part of same inode block | 0 | 0 (already counted) | 0 |
| 5 | Commit block | 0 | 1 | 1 |
| **Total** | | **32** | **4** | **5** |

**Journal consumption:** 5 blocks × 4 KiB = **20 KiB** << 128 MiB journal, leaving ample headroom. The on‑disk layout after commit:
- Inode at block `i_ino·inode_size/B` (e.g., block 12345) contains extent `{phys_start=56789, len=32}`.  
- Data blocks 56789–56820 hold the file’s contents.  
- The journal’s head now points past block 5 (the commit).

**Verification via shell:**
```bash
# Create a 128 KiB file with known pattern
dd if=/dev/zero of=testfile bs=4K count=32 status=none
# Force sync to ensure journal commit
sync
# Dump filesystem metadata (requires root)
sudo dumpe2fs -h /dev/sda1 2>/dev/null | grep -E 'Inode size|Journal size|Journal inode'
# Inspect extent mapping
sudo hdparm --fibmap testfile 2>&1 | awk '{print $1}'
```
The `fibmap` output lists the physical block numbers allocated for the file; they should be consecutive (contiguous extent) unless fragmentation forced a split.

### Example 2: Reading the Same File with Page Cache and Readahead
Assume the file from Example 1 is now read via `read(fd, buf, 64*1024)` (two 4 KiB blocks).  

1. **VFS lookup** reuses the dentry from the previous open (positive dentry cache hit) → no disk I/O.  
2. **File’s `struct file`** points to the inode’s `i_mapping` (address_space).  
3. The generic `read` implementation calls `filemap_read()` which:
   - Checks the page cache for the requested pages.  
   - On a miss, allocates two page frames, submits a bio to the block device requesting blocks 56789 and 56790 (since the file is contiguous).  
   - The block device scheduler may issue a *readahead* of, say, 8 additional blocks (56791–56798) anticipating sequential read.  
4. After the DMA completes, the pages are marked up‑to‑date; the data is copied to user space via `copy_to_user`.  
5. The file’s `f_pos` is advanced; subsequent reads hit the page cache until eviction.

**Performance numbers (typical SSD, 4 KiB block, 100 µs latency):**
- Cache hit: ~0 µs (pure CPU).  
- Cache miss (no readahead): 2 × 100 µs = 200 µs + transfer time (2 × 4 KiB / 500 MB/s ≈ 16 µs) ≈ 216 µs.  
- With readahead of 8 blocks: the initial 2 blocks still cost 200 µs, but the next 6 blocks are already in cache, reducing latency for sequential reads to near zero until the readahead window is exhausted.

**Shell verification:**
```bash
# Clear page cache (requires root)
sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'
# Time a read of the file
time dd if=testfile of=/dev/null bs=64K count=1 iflag=direct,nocache 2>&1
# Repeat without direct I/O to see cache effect
time dd if=testfile of=/dev/null bs=64K count=1 2>&1
```
The first command (bypassing cache) shows roughly the raw device latency; the second shows a dramatically lower time due to page cache and readahead.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Assuming `write()` guarantees data is on disk** | `write()` only copies data to the kernel’s page cache; the actual device write may be delayed by the writeback mechanism (controlled by `/proc/sys/vm/dirty_*` ratios). A power loss before writeback loses data. | Call `fsync(fd)` (data+metadata) or `fdatasync(fd)` (data only) after the final write, or open with `O_SYNC`/`O_DIRECT`. |
| 2 | **Using `creat()` or `open(O_CREAT)` without checking `errno` for `EEXIST`** | If the file already exists, `open(O_CREAT|O_EXCL, …)` would fail with `EEXIST`. Ignoring this can silently truncate an existing file or open the wrong file. | Use `open(O_CREAT|O_EXCL, …)` when you need atomic creation, and handle `EEXIST` explicitly. |
| 3 | **Neglecting to check return values of `read()`/`write()` for short counts** | These syscalls may transfer fewer bytes than requested (e.g., due to signals, non‑blocking mode, or device limits). Assuming full transfer leads to buffer overruns or incomplete data. | Loop until the requested number of bytes is transferred, handling `EINTR` by restarting the call. |
| 4 | **Relying on `stat().st_blocks` to compute file size as `st_blocks * 512`** | `st_blocks` counts *allocated* 512‑byte sectors, which may be larger than the actual file size due to internal fragmentation (e.g., partially allocated last block) or filesystem‑specific block allocation policies (extent‑based, COW). | Use `st_size` for logical size; use `st_blocks` only when you need to know on‑disk space consumption. |
| 5 | **Assuming `fsync()` flushes the journal only** | On ext4 with `data=writeback`, `fsync()` flushes metadata *and* forces the associated data blocks to be written (via `writepage`). On some filesystems (e.g., XFS with `logbufs`), `fsync()` may only flush the log; data may still be pending in the page cache. | Understand the filesystem’s mode (`mount -o data=…`) and, if necessary, follow `fsync()` with `sync()` or `blockdev --flushbufs`. |
| 6 | **Using `fallocate()` to reserve space and then writing without updating `i_size`** | `fallocate()` preallocates blocks but leaves `i_size` unchanged; reading beyond the current `i_size` returns zeroes, leading to holes that appear as sparse files unintentionally. | After writing into the preallocated region, update `i_size` via `ftruncate()` or ensure writes extend the file size. |
| 7 | **Misjudging the cost of extent tree depth** | Assuming extent lookups are O(1) regardless of file size can cause surprise when a heavily fragmented file forces a deep tree (e.g., many small extents), increasing CPU overhead per `read`/`write`. | Monitor fragmentation with `filefrag -v`; consider defragmenting (`e4defrag`) or using a filesystem with better clustering (XFS allocation groups). |
| 8 | **Ignoring `O_DIRECT` alignment requirements** | `O_DIRECT` bypasses the page cache but demands that buffers, file offset, and transfer length be aligned to the filesystem’s block size (usually 4 KiB). Misaligned requests fail with `EINVAL`. | Allocate buffers with `memalign` or `posix_memalign` to block size, and align `lseek` offsets accordingly. |

---

## Exercises
### Easy
1. **Create and verify a file**  
   Write a C program that opens `/tmp/exercise.txt` with `O_CREAT|O_WRONLY|O_TRUNC`, writes the string `"LinuxFS"` followed by a newline, calls `fsync`, closes the file, and then uses `stat(2)` to print `st_size` and `st_blocks`. Run it and confirm the output matches expectations.

2. **Force journal commit**  
   Using the shell, create a 1 MiB file with `dd if=/dev/zero of=/tmp/jtest bs=1M count=1`. Run `sync`, then immediately `sudo dumpe2fs -h /dev/sda1 | grep 'Journal size'` to see the journal usage. Delete the file, run `sync` again, and observe whether the journal usage drops (it should, as the metadata changes are checkpointed).

### Medium
3. **Implement a simple write‑ahead log**  
   In C, create a fixed‑size circular log file (`log.dat`, 64 KiB). Provide two functions: `log_begin(tid)`, `log_write(tid, blocknum, data, len)`, and `log_commit(tid)`. Each log entry should contain a 4‑byte CRC‑32c of the payload. Write a test program that logs updates to an in‑memory array of 4‑KiB blocks, commits, then simulates a power loss by truncating the log mid‑commit and verifies that the recovery routine reapplies only complete transactions.

4. **Measure extent fragmentation**  
   Write a script that creates a file of size 100 MiB by writing 4 KiB chunks at random offsets within the file (using `pwrite`). After each iteration, call `filefrag -v` on the file and record the
