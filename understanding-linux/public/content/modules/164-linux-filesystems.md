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

## Core Concepts
### Inode‑Centric Metadata Separation
In Linux a file’s **metadata** (ownership, permissions, timestamps, ACLs, extent pointers) lives in an **inode**, while the file’s **data** lives in one or more **blocks**. Splitting metadata from data enables:
* **Constant‑time attribute lookup** – `stat()` needs only the inode, not a full directory scan.
* **Hard links** – multiple directory entries can point to the same inode without duplicating data.
* **Efficient space reclamation** – when the link count drops to zero, the inode and its blocks can be freed independently.

The inode structure (simplified) is:
```c
struct ext4_inode {
    __le16  i_mode;        /* File mode */
    __le16  i_uid;         /* Low 16 bits of UID */
    __le32  i_size;        /* Size in bytes */
    __le32  i_atime;       /* Access time */
    __le32  i_ctime;       /* Inode change time */
    __le32  i_mtime;       /* Modification time */
    __le32  i_dtime;       /* Deletion Time */
    __le16  i_gid;         /* Low 16 bits of GID */
    __le16  i_links_count;/* Hard link count */
    __le32  i_blocks;      /* Blocks count */
    __le32  i_flags;       /* File flags */
    /* ... extent tree or block pointers ... */
};
```
### Blocks and Allocation Granularity
A **block** is the smallest unit of storage the filesystem allocates. Typical values:
* **512 B** – legacy, matches sector size.
* **4 KiB** – default for ext4/XFS/Btrfs on modern hardware; balances internal fragmentation vs. I/O efficiency.

Choosing a block size involves a trade‑off:
* **Small blocks** → less internal fragmentation for tiny files, but larger inode tables and more metadata overhead.
* **Large blocks** → higher sequential throughput (fewer I/O ops) but waste space for sub‑block files.

### Superblock: The Filesystem’s Bootstrap Record
The **superblock** resides at a fixed offset (usually 1 KiB) and contains immutable parameters needed to interpret the rest of the FS:
* Total block count `$B$`
* Total inode count `$I$`
* Block size `$S_{blk}$` (in bytes)
* Inode size `$S_{inode}$`
* First data block number
* Magic number (e.g., `0xEF53` for ext2/3/4)
* Feature flags (compatibility, ro‑compatibility, incompat)

If the superblock is corrupted, the FS is unmountable; therefore ext2/3/4 keep **redundant superblock copies** at the start of each block group (see below).

### Block Groups and Scalability
Ext2/3/4 divide the disk into **block groups** to limit the size of linear scans (e.g., during `fsck`). Each group typically contains:
* `$B_{gp}$` blocks (commonly 32 768 blocks → 128 MiB with 4 KiB blocks)
* `$I_{gp}$` inodes (`$I_{gp} = \frac{B_{gp}\cdot S_{blk}}{S_{inode}}$`)
* Its own copy of the superblock, block bitmap, inode bitmap, inode table, and data blocks.

The **group descriptor table** (located after the primary superblock) holds one descriptor per group:
```c
struct ext4_group_desc {
    __le32  bg_block_bitmap;   /* Blocks bitmap block */
    __le32  bg_inode_bitmap;   /* Inodes bitmap block */
    __le32  bg_inode_table;    /* Inode table start block */
    __le16  bg_free_blocks_count;
    __le16  bg_free_inodes_count;
    __le16  bg_used_dirs_count;/* Directory count */
    __le16  bg_flags;
    /* ... */
};
```
### Journaling: From Metadata‑Only to Data‑Mode
Traditional Unix FSes updated metadata in-place; a crash could leave the FS inconsistent (e.g., an allocated block not recorded in the inode). **Journaling** writes a *transaction* to a dedicated log before modifying the main FS. On replay, the FS either redoes or undoes the transaction, guaranteeing **metadata consistency**.

* **ext3 default (ordered mode)** – metadata journaled, data written directly; after a crash, data may be outdated but the FS structure is sound.
* **ext4 journal modes** – `journal` (metadata + data), `ordered` (default), `writeback` (metadata only).  
  The trade‑off: stronger consistency vs. higher I/O latency.

### Extents vs. Indirect Block Mapping
Early ext2 used **indirect block pointers** (single, double, triple) to map file offsets to blocks. For large files this caused:
* **Fragmented lookup** – up to three disk reads to find a block.
* **Large overhead** – each indirect block consumes a whole block just for pointers.

ext4 (and XFS/Btrfs) replaces this with an **extent tree**: each extent records a contiguous run `[start_block, length]`. The on‑disk structure is:
```c
struct ext4_extent {
    __le32  ee_block;   /* first logical block extent covers */
    __le16  ee_len;     /* number of blocks (1‑32767) */
    __le16  ee_start_hi;/* high 16 bits of starting physical block */
    __le32  ee_start_lo;/* low 32 bits */
};
```
A file’s extent tree is stored in the inode’s `i_block` array (inline extents) or a separate extent index block. Lookup is **O(log n)** where *n* is the number of extents, typically far fewer than indirect‑block levels.

### Btrfs: Copy‑On‑Write (CoW) and Subvolumes
Btrfs treats the entire filesystem as a **B‑tree** of items (inodes, extents, dir entries). Updates allocate new blocks and modify only the affected tree nodes, leaving the old version intact until the transaction commits. This enables:
* **Snapshots** – cheap, read‑only or read‑write subvolume copies.
* **Transparent compression** – LZO/ZSTD applied per‑extent.
* **Scrubbing** – background read‑verify of all blocks using checksums.

---

## How It Works
### VFS Layer and Filesystem Registration
All concrete filesystems (ext4, XFS, Btrfs, …) register with the **Virtual Filesystem Switch (VFS)** via `register_filesystem()`. The VFS provides a common interface:
* `struct file_system_type` – holds name, `mount()`, `kill_sb()`.
* `struct super_operations` – ops on the superblock (e.g., `write_inode`, `sync_fs`).
* `struct inode_operations` – ops on inodes (e.g., `create`, `lookup`, `permission`).
* `struct file_operations` – ops on open file descriptors (e.g., `read_iter`, `write_iter`, `mmap`).

When a block device is mounted, the VFS calls the FS’s `mount()` which:
1. Reads the **superblock** from the device (validates magic, checks feature flags).
2. Allocates an in‑memory `struct super_block` and fills it with fields from the on‑disk superblock.
3. Reads the **group descriptor table** to locate block/inode bitmaps and inode tables.
4. Sets up the **inode cache** (`struct inode`) and **dentry cache** (directory entries) for path lookup.

### File Creation – Step‑by‑Step (ext4 example)
Assume we run `open("foo.txt", O_CREAT|O_WRONLY, 0644)`. The VFS dispatches to ext4’s `create` inode operation.

1. **Parent directory lookup** – VFS walks the path using dentry cache; each step calls ext4’s `lookup` which reads the directory’s data blocks, searches for a matching filename, and returns the target inode number (or `ENOENT`).
2. **Inode allocation** – ext4 finds a free inode via the inode bitmap of the appropriate block group, marks it used, and increments `bg_free_inodes_count`.
3. **Inode initialization** – fills `i_mode`, `i_uid/gid`, `i_links_count = 1`, `i_size = 0`, and sets the extent tree to empty.
4. **Directory entry update** – allocates a slot in the parent directory’s data block (may involve extending the directory if needed), writes the filename and the new inode number, updates the directory’s `i_size` and `i_mtime`.
5. **Journaling** – if the journal is enabled, the changes to the inode bitmap, inode table, and directory block are logged as a transaction before being written to the main FS. On commit, the journal block is freed.
6. **Return** – VFS returns a new `struct file` pointing to the allocated inode; the user gets a file descriptor.

### File Read – Path Resolution and Data Retrieval
Reading via `pread(fd, buf, count, offset)` proceeds:
1. **Inode retrieval** – VFS uses the `fd`’s `struct file->f_inode` (already looked up at open). No further pathname walk needed.
2. **Extent mapping** – ext4’s `get_extent()` walks the extent tree (or fallback indirect blocks) to find the physical block(s) covering `[offset, offset+count)`. For a 4 KiB block size and extent length `L`, the number of blocks needed is `$\lceil count / S_{blk} \rceil$`.
3. **Page cache lookup** – The VFS checks the page cache for each required page; if present, data is copied directly to user space (zero‑copy if `splice()` used).
4. **Disk I/O** – Missing pages trigger `submit_bh()` to read the underlying block(s). The I/O scheduler merges adjacent requests.
5. **Completion** – Data is copied from the page cache to the user buffer; `pread` returns the number of bytes transferred.

### File Write – Delayed Allocation and Writeback
`pwrite(fd, buf, count, offset)` (or `write()` after `lseek`) follows:
1. **Page fault** – The VFS finds or allocates a page cache page for the target offset; marks it **dirty**.
2. **Delayed allocation** – ext4 does **not** immediately allocate blocks; instead it notes the dirty page range in the `i_private_data` extent state. This allows merging multiple writes into a single allocation decision, reducing fragmentation.
3. **Writeback trigger** – When the dirty page count exceeds a threshold (`vm.dirty_ratio`) or after a timeout (`vm.dirty_expire_centisecs`), the kernel’s `pdflush` thread calls ext4’s `writepage`.
4. **Block allocation** – `writepage` calls `ext4_map_blocks()` which allocates free blocks from the block group’s bitmap, updates the extent tree, and marks the allocated blocks used.
5. **Journaling** – For `ordered` mode, the newly allocated blocks are first written to the journal (metadata only), then the data blocks are written to disk; finally the journal transaction is committed. For `writeback` mode only metadata is journaled.
6. **Completion** – The dirty page is cleared; the function returns the number of bytes written to the caller.

---

## Worked Examples
### Example 1: Creating a File – `touch example.txt`
We will trace the syscalls with concrete numbers (ext4, 4 KiB block size, 256‑byte inode).

```bash
$ strace -e trace=openat,open,creat,close touch example.txt
openat(AT_FDCWD, "example.txt", O_CREAT|O_WRONLY, 0666) = 3
close(3)                                = 0
```

**Step‑by‑step with numbers**:
1. `openat()` invokes VFS → ext4 `create`.
2. Parent directory (`.`), assume its inode #12, block #2048 holds the directory data.
3. Inode bitmap for block group 0 shows first free inode at offset 57 → inode #57.
4. Allocate inode #57:
   * Zero‑fill the 256‑byte inode.
   * Set `i_mode = 0100644` (regular file, rw‑r‑‑r‑‑).
   * `i_uid = i_gid = 1000` (current user).
   * `i_links_count = 1`.
   * `i_blocks = 0`.
5. Update parent directory block #2048:
   * Add a 12‑byte directory entry: `name_len = 11 ("example.txt")`, `inode = 57`.
   * New directory size = old size + 12 → round up to next 4 KiB block if needed.
6. Journal transaction (if enabled) logs:
   * Bitmap update for inode #57.
   * Inode #57 zero‑initialization.
   * Directory block modification.
7. Commit journal → superblock updated (`s_free_inodes_count--`).
8. `close(3)` releases the `struct file`; no further FS action.

**Result**: `stat example.txt` shows:
```
  File: example.txt
  Size: 0               Blocks: 0          IO Block: 4096   regular empty file
Device: 801h/2049d      Inode: 57          Links: 1
```

### Example 2: Reading a File – `cat example.txt`
Assume we previously wrote 7 KiB of data (`dd if=/dev/zero of=example.txt bs=1K count=7`).

```bash
$ strace -e trace=read,open,close cat example.txt
openat(AT_FDCWD, "example.txt", O_RDONLY) = 3
read(3, "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0", 4096) = 4096
read(3, "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0", 3072) = 3072
close(3)                                = 0
```

**Details**:
* File size = 7 KiB = 7 × 1024 = 7168 bytes.
* With 4 KiB blocks, the file occupies **2 blocks** (block #8421 and #8422) plus a partial third block for the last 3072 bytes.
* Extent tree (inline, because only 2 blocks):
  * `ee_block = 0`, `ee_len = 2`, `ee_start_lo = 8421`.
* First `read()`: VFS asks ext4 for blocks covering `[0,4096)`. Extent mapping returns block #8421. Page cache misses → issue `read(8421*4096, 4096)`. Data copied to user.
* Second `read()`: range `[4096,7168)`. Extent returns block #8422 (still within same extent). Since only 3072 bytes needed, the driver copies the first 3072 bytes of the page and discards the rest.
* No journal involvement for read‑only.

### Example 3: Writing to a File – `echo "Hello World" > example.txt`
We truncate then write 12 bytes plus newline (13 B).

```bash
$ strace -e trace=openat,write,close sh -c 'echo "Hello World" > example.txt'
openat(AT_FDCWD, "example.txt", O_WRONLY|O_CREAT|O_TRUNC, 0666) = 3
write(3, "Hello World\n", 13)           = 13
close(3)                                = 0
```

**FS actions**:
1. `openat()` with `O_TRUNC` calls ext4’s `setattr` → truncate to length 0:
   * Free existing blocks (if any) via block bitmap; update `i_blocks = 0`.
   * Journal: log bitmap frees and inode size change.
2. `write()`:
   * Locates or creates page cache page for offset 0 (size 4 KiB).
   * Copies "Hello World\n" into the page; marks page dirty.
   * Delayed allocation defers block assignment.
3. On background writeback (or sync):
   * ext4 allocates one free block (say #9500) from the block bitmap.
   * Updates extent tree: `ee_block=0, ee_len=1, ee_start_lo=9500`.
   * Writes the page’s data to block #9500.
   * Journal (ordered mode): logs block allocation and extent update, then commits after data write.
4. `close()` releases the file descriptor; inode now has `i_size=13`, `i_blocks=1` (1 × 4 KiB block allocated, though only 13 B used).

---

## Common Mistakes
### 1. “Inode number equals block number”
* **Wrong**: Assuming `stat -c %i file` gives the block where the file’s data starts.
* **Why it’s wrong**: The inode is a metadata structure; its **location on disk** is given by the block group’s inode table (`inode_table_start + (inode_number‑1)*inode_size`). Data blocks are pointed to by the inode’s extent tree or indirect blocks.
* **Correct way**: Use `debugfs -R "stat <filename>" <dev>` to see both inode block and data block ranges.

### 2. “Journaling guarantees that file data is never lost after a crash.”
* **Wrong**: Believing that a journaled FS protects user data as strongly as metadata.
* **Why it’s wrong**: Most Linux journals (ext3/4 ordered, writeback) only log **metadata**. Data may be written after the journal commit; a crash between data write and journal commit can lose the last few seconds of data while keeping the FS consistent.
* **Correct insight**: Only `data=journal` mode (ext4) or a FS like **ZFS/Btrfs with copy‑on‑write** guarantees data durability at the cost of higher write latency.

### 3. “Mounting a filesystem copies its contents into RAM.”
* **Wrong**: Thinking that `mount /dev/sdb1 /mnt` reads the whole block device into memory.
* **Why it’s wrong**: Mounting merely **binds** the block device’s superblock into the VFS namespace; data remains on the device and is fetched on demand via the block cache. RAM usage grows only with cached pages accessed.
* **Evidence**: Run `vmstat 1` before and after mounting a large, unused FS; observe little change in `free`/`buff` until you `ls -R` the mount point.

### 4. “Running `fsck` repairs corrupted file data.”
* **Wrong**: Assuming `fsck` can recover missing or garbled file contents.
* **Why it’s wrong**: `fsck` checks and repairs **metadata consistency** (bitmaps, inode tables, directory links). If a data block’s contents are corrupted but the bitmap still marks it allocated, `fsck` cannot know the correct data.
* **Correct practice**: Use backups or RAID‑level redundancy for data integrity; `fsck` only ensures the FS can be mounted safely.

### 5. “Increasing block size always improves performance.”
* **Wrong**: Assuming larger blocks = faster I/O for all workloads.
* **Why it’s wrong**: Larger blocks increase **internal fragmentation** for small files, waste space, and increase the amount of data read/written for tiny random accesses (read‑amplification). For sequential large‑file workloads, bigger blocks help; for metadata‑heavy or small‑file workloads, they hurt.
* **Correct approach**: Match block size to expected file size distribution; use `mkfs -b 4096` (default) for general purpose, `-b 65536` for large‑media archives.

---

## Exercises
### Easy – Inspect and Manipulate Existing FS
1. **Inode lookup**  
   ```bash
   # Create a file, find its inode, locate the inode on disk
   $ touch /tmp/foo
   $ STAT=$(stat -c '%i' /tmp/foo)
   $ sudo debugfs -R "stat /tmp/foo" /dev/sda1   # replace with your root FS
   ```
   *Question*: What block does the inode reside in? Show the calculation using `$inode_size` and the block group’s inode table offset.

2. **Block allocation view**  
   ```bash
   $ sudo dumpe2fs /dev/sda1 | grep -i "block size"
   $ sudo filefrag -v /tmp/foo   # shows extent mapping
   ```
   *Question*: How many blocks does the file occupy? Are they contiguous?

### Medium – Build and Tune a Filesystem
3. **Create a filesystem image**  
   ```bash
   $ dd if=/zero of=/tmp/fs.img bs=1M count=64   # 64 MiB file
   $ sudo losetup -fP /tmp/fs.img                # assign loop device, e.g., /dev/loop0
   $ sudo mkfs.ext4 -b 4096 -E stride=16,stripe-width=64 /dev/loop0
   $ sudo mount /dev/loop0 /mnt
   $ sudo chown $USER:$USER /mnt
   $ cp /etc/passwd /mnt/
   $ umount /mnt
   $ sudo losetup -d /dev/loop0
   ```
   *Tasks*:  
   - Verify block size with `dumpe2fs /dev/loop0`.  
   - Use `tune2fs -l /dev/loop0` to list feature flags (e.g., `has_journal`, `extent`).  
   - Resize the FS online: `sudo resize2
