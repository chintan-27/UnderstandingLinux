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

## Core Concepts
A file system is the kernel‑mediated contract that maps **bytes on a block device** to a **hierarchical namespace** of files and directories.  
The mapping is performed by **metadata structures** that live on‑disk (inodes, superblock, allocation bitmaps) and are cached in memory by the VFS layer.  
Each file or directory is represented by an **inode** that stores:

* file type and mode (permissions, setuid, etc.)  
* owner UID/GID  
* size in bytes  
* timestamps (atime, mtime, ctime, crtime)  
* link count (hard links)  
* pointers to the data blocks that hold the file’s contents  

The **superblock** holds global parameters: block size, total block count, inode size, first inode number, feature flags, and the location of the first block group (in ext4).  
A **block group** (ext2/3/4) repeats the pattern: superblock backup, group descriptors, inode bitmap, block bitmap, inode table, data blocks. This grouping limits the distance metadata must travel during allocation, reducing seek time on spinning media.

Namespaces are built from **directory entries** (dentries). A directory is itself a file whose data blocks contain an array of `struct ext4_dir_entry_2` (or equivalent) entries: `{inode, name_len, name, record_len}`. The VFS resolves a pathname by walking dentry caches, each step performing an inode lookup via the directory’s data blocks.

Thus, a file system’s correctness rests on three invariants:

1. **Allocation invariants** – every allocated block is marked in the block bitmap; every allocated inode is marked in the inode bitmap.  
2. **Link‑count invariant** – an inode’s `i_nlink` equals the number of directory entries that reference it.  
3. **Consistency invariant** – journal or copy‑on‑write logs ensure that metadata updates are atomic with respect to power loss.

## How It Works
### On‑Disk Layout (ext4 as exemplar)
Assume a block size **B = 4096 B**, inode size **I = 256 B**, and a block group containing **N_b** blocks and **N_i** inodes.

* **Superblock** resides at block offset 1 (or at a sparse backup location).  
* **Block Group Descriptor Table** follows, each descriptor holding:  
  - `bg_block_bitmap` (block bitmap address)  
  - `bg_inode_bitmap` (inode bitmap address)  
  - `bg_inode_table` (starting block of the inode table)  
  - `bg_free_blocks_count`, `bg_free_inodes_count`, `bg_used_dirs_count`  

* **Bitmap size** = one bit per block/inode → `⌈N_b / 8⌉` bytes for block bitmap, `⌈N_i / 8⌉` bytes for inode bitmap.  
* **Inode table size** = `N_i * I` bytes → occupies `⌈N_i * I / B⌉` blocks.  

Given total blocks `S`, the number of block groups is `G = ⌈S / (blocks per group)⌉`. Blocks per group are chosen so that the bitmap+inode table fit within a group, typically `8 B` (32 KB) for the bitmaps plus the inode table.

**Allocation strategy**  
Ext4 uses **extents** for large files: each extent triplet `<start_block, length, flags>` replaces up to three indirect block levels. Small files store data directly in the inode’s `i_block` array (12 direct blocks). When an extent exceeds the direct array, the inode points to an extent tree node (leaf/internal) stored in the same `i_block` slots.

**Journaling** (ordered mode)  
Before modifying metadata, the journal writes a **descriptor block** (type, transaction ID, length) followed by the **metadata blocks** to be changed. After a commit block, the transaction is considered durable. Data blocks may be written later; ordering guarantees that after a crash, either both metadata and its dependent data are present, or neither is.

### Address Calculations
For an inode number `i` (1‑based), its disk location is:

$$
\text{inode\_block} = \text{bg\_inode\_table} + \left\lfloor\frac{(i-1) \cdot I}{B}\right\rfloor
$$
$$
\text{offset\_in\_block} = ((i-1) \cdot I) \bmod B
$$

If `i = 4500`, `B=4096`, `I=256`, and the block group’s inode table starts at block 1024:

```
block_offset = floor((4499*256)/4096) = floor(1151744/4096) = 281
offset       = (4499*256) mod 4096 = 1151744 mod 4096 = 0
inode block  = 1024 + 281 = 1305
```

Thus the inode resides at the start of block 1305.

### Complexity of Path Lookup
A pathname `/a/b/c` requires three directory reads. In ext4, a directory with `n` entries is stored as a **hash‑indexed tree** (HTree) when `n` exceeds a threshold, giving lookup **O(log n)** instead of linear scan. The HTree stores fixed‑size hash values in internal nodes, enabling binary search on the hash before linear probing within a leaf.

## Worked Examples
### Example 1: Creating a Regular File (`touch file`)  
Assumptions: block size 4 KB, inode size 256 B, current directory inode `dir_ino = 12345`.

1. **Inode allocation**  
   - VFS calls `ext4_new_inode(dir, S_IFREG|0644, &cred)`.  
   - ext4 locks the inode bitmap, finds first zero bit → `ino = 67890`.  
   - Updates inode bitmap (sets bit), decrements `bg_free_inodes_count`.  
   - Writes the updated bitmap block to journal (ordered mode).  
   - Initializes inode fields: `i_mode`, `i_uid`, `i_gid`, `i_size = 0`, `i_blocks = 0`, `i_block[0..11] = 0`.  

2. **Directory entry insertion**  
   - Reads the directory’s data blocks (maybe block 5000).  
   - Finds a free slot (record_len ≥ needed). If none, allocates a new data block:  
     - Allocates block from block bitmap → `blk = 20000`.  
     - Updates block bitmap, journal write.  
   - Writes `struct ext4_dir_entry_2 { .inode = 67890, .name_len = 4, .name = "file", .rec_len = 12 }` into the slot.  
   - Updates directory’s `i_size` (if new block added) and `i_mtime`, `i_ctime`.  

3. **Journal commit**  
   - After all metadata buffers are dirtied, ext4 issues a commit descriptor.  
   - On success, the inode allocation and directory update are durable.  

**Shell view**:
```bash
$ stat file
  File: file
  Size: 0           Blocks: 0          IO Block: 4096   regular empty file
Device: 801h/2049d  Inode: 67890       Links: 1
Access: (0644/-rw-r--r--)  Uid: ( 1000/   alice)   Gid: ( 1000/   alice)
```

### Example 2: Reading a File (`read(fd, buf, 1024)`)  
Assume file’s inode `ino = 67890` points to extent covering blocks `[25000, 25007]` (8 blocks = 32 KB) and we request bytes 0‑1023.

1. **VFS lookup** → obtains `struct file *` with `f_mode = FMODE_READ`.  
2. **ext4_file_read_iter** calls `ext4_map_blocks` to translate file offset to logical block:  
   - Offset 0 falls within first extent → `lblk = 0`, `len = min(1024, extent_len*B - offset) = 1024`.  
   - Returns `mapped_len = 1024`, `mblk = 25000`.  
3. **page cache** checks if page covering offset 0‑4095 is present; if not, issues a **readpage** to the block device:  
   - Sends a bio requesting block 25000 (size 4 KB).  
   - Device returns data; page is filled and marked up‑to‑date.  
4. **copy_to_user** copies the first 1024 bytes from the page into user buffer.  
5. Returns 1024 to caller; updates `f_pos`.  

**C demonstration** (using raw syscalls):
```c
#define _GNU_SOURCE
#include <fcntl.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int fd = syscall(SYS_open, "file", O_RDONLY, 0);
    if (fd < 0) { perror("open"); exit(1); }

    char buf[1024];
    ssize_t n = syscall(SYS_read, fd, buf, sizeof(buf));
    if (n < 0) { perror("read"); exit(1); }
    write(STDOUT_FILENO, buf, n);   // echo to stdout

    syscall(SYS_close, fd);
    return 0;
}
```

### Example 3: Deleting a File (`unlink`)  
Assume same file `file` with inode 67890, link count 1.

1. **VFS** calls `ext4_unlink(dir, dentry)`.  
2. **Directory modification**: locate the dir entry for "file", set its `inode` field to 0, increase `rec_len` of previous entry to cover the freed space (or leave a hole). Update directory’s `i_size` if the last block becomes empty; decrement `i_nlink` of directory (not needed for regular file unlink).  
3. **Inode update**: decrement `i_nlink` from 1 → 0. Since now zero, ext4 triggers `ext4_delete_inode`:  
   - For each extent block, clear corresponding bits in block bitmap (journalled).  
   - Clear the inode’s bitmap bit.  
   - Return the inode to the free list.  
4. **Journal commit** of directory bitmap change, inode bitmap change, and any freed block bitmap changes.  

**Shell verification**:
```bash
$ rm file
$ stat file 2>/dev/null || echo "no such file"
no such file
```

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Assuming an inode number uniquely identifies a file across reboots** | Inode numbers are reused after the inode is freed; only the pair (device ID, inode number) is stable. | A program that caches inode numbers may open the wrong file after the original is deleted and a new file allocates the same inode. |
| **Treating directory entries as containing file data** | Directory entries store only metadata (inode, name, length); the actual file data lives in the inode’s block pointers. | Code that attempts to read a directory as a regular file will see garbage and may corrupt the filesystem if written. |
| **Believing that `fsync` flushes only the file’s data** | `fsync(fd)` forces *both* data and metadata (size, timestamps, inode) to be written; `fdatasync` omits metadata. | Relying on `fsync` for performance may incur unnecessary journal commits, slowing workloads that only need data durability. |
| **Ignoring return values of `mkfs`/`mount`** | These commands can fail due to device errors, insufficient permissions, or existing filesystem signatures. | Proceeding with a failed mount leads to silent I/O errors; later `read`/`write` return `EIO`. |
| **Assuming hard links can span filesystem boundaries** | Hard links share the same inode; an inode cannot belong to two distinct filesystems because its block allocations are tied to a specific block device. | Attempting `ln /mnt/a /mnt/b` across mount points yields “Invalid cross‑device link”. |

Each mistake stems from a misunderstanding of the **allocation invariants** or the **VFS namespace model**. Recognizing the underlying on‑disk structures prevents these errors.

## Exercises
### Easy – Filesystem Creation & Inspection
1. Create a 100 MB file-backed loop device:  
   ```bash
   $ dd if=/dev/zero of=fs.img bs=1M count=100
   $ losetup -f --show fs.img
   /dev/loop0
   ```
2. Format it as ext4 with a 1 KB inode size (to illustrate space trade‑off):  
   ```bash
   $ mkfs -t ext4 -I 128 /dev/loop0
   ```
3. Mount and query free inodes/blocks:  
   ```bash
   $ mkdir /mnt/test
   $ mount /dev/loop0 /mnt/test
   $ df -i /mnt/test
   Filesystem      Inodes IUsed IFree IUse% Mounted on
   /dev/loop0       12800     11  12789    1% /mnt/test
   $ df -h /mnt/test
   Filesystem      Size  Used Avail Use% Mounted on
   /dev/loop0        96M   14M   77M  16% /mnt/test
   ```
4. Create a file, check its inode number with `stat`, then unmount and detach the loop device.  

### Medium – Directory Traversal & Inode Statistics
Write a C program that walks a directory tree recursively using `opendir`/`readdir`, prints each entry’s **inode**, **file type**, and **size**, and accumulates total directories, regular files, and symbolic links.  
*Use `stat` (not `lstat`) to follow symlinks for size, but record link type separately.*  
Challenge: avoid allocating a fixed‑size buffer for paths; use `pathconf(_PC_PATH_MAX)` or dynamically grow with `realloc`.  

### Hard – Block Allocator Simulator
Implement a user‑space simulator of the ext4 block allocator for a virtual disk of 64 MB with 4 KB blocks.  
- Maintain a **block bitmap** (array of bits).  
- Provide functions `alloc_block()` and `free_block(blk)` that update the bitmap and return the block number.  
- Extend to **extent allocation**: given a request for `n` contiguous blocks, scan the bitmap to find a run of `n` zeros, mark them, and return the start block.  
- Measure allocation latency for random vs sequential requests (use `clock_gettime`).  
- Discuss how fragmentation affects the average run length and relate to real‑world extent trees.  

## Linux Connection
### VFS Layer
All filesystems register with the **Virtual File System (VFS)** via `struct file_system_type`.  
Key operations (from `<linux/fs.h>`):
```c
struct file_system_type {
    const char *name;
    int fs_flags;
    struct dentry *(*mount) (struct file_system_type *, int, const char *, void *);
    void (*kill_sb) (struct super_block *);
};
```
When you run `mount -t ext4 /dev/sdb1 /mnt`, the VFS calls `ext4_mount`, which reads the superblock, allocates a `struct super_block`, and sets `s_root` to the root dentry.

### Core Ext4 Structures (kernel)
- **`struct ext4_super_block`** – on‑disk superblock (see `include/linux/ext4_fs.h`).  
- **`struct ext4_inode_info`** – in‑memory inode, extends `struct ext4_inode` with i_data (extent tree), i_disksize, etc.  
- **`struct ext4_dir_entry_2`** – on‑disk directory entry (see above).  

### System Calls & Library Wrappers
| Concept | Syscall | Glibc Wrapper | Example |
|---------|---------|---------------|---------|
| Open file | `open` | `int open(const char *pathname, int flags, mode_t mode);` | `int fd = open("file", O_RDWR|O_CREAT, 0644);` |
| Read/Write | `read`, `write` | `ssize_t read(int fd, void *buf, size_t count);` | `read(fd, buf, 4096);` |
| Change size | `ftruncate` | `int ftruncate(int fd, off_t length);` | `ftruncate(fd, 0);` |
| Sync data/metadata | `fsync`, `fdatasync` | `int fsync(int fd);` | `fsync(fd);` |
| Create hard link | `link` | `int link(const char *oldpath, const char *newpath);` | `link("src", "dst");` |
| Create symlink | `symlink` | `int symlink(const char *target, const char *linkpath);` | `symlink("target", "lnk");` |
| Remove file | `unlink` | `int unlink(const char *pathname);` | `unlink("tmp");` |
| Remove directory | `rmdir` | `int rmdir(const char *pathname);` | `rmdir("dir");` |
| Get filesystem stats | `statfs` | `int statfs(const char *path, struct statfs *buf);` | `statfs("/mnt", &buf);` |

### Kernel‑space Debugging Tools
- **`debugfs`** – interact directly with an ext2/3/4 filesystem:  
  ```bash
  $ debugfs -w /dev/sdb1
  debugfs:  stats
  ```
- **`blkid`** – show UUID, type, and labels:  
  ```bash
  $ blkid /dev/sdb1
  /dev/sdb1: UUID="a1b2c3d4" TYPE="ext4"
  ```
- **`e2fsprogs` suite** (`tune2fs`, `dumpe2fs`, `e2fsck`) – tune parameters, dump superblock, check/repair.  
- **`/proc/self/mounts`** and **`/sys/fs/ext4/<dev>/`** expose mount options and per‑group statistics live.

### Sample Kernel‑Level Code Snippet (reading an inode)
```c
/* From fs/ext4/inode.c */
static struct ext4_inode *ext4_raw_inode(struct ext4_inode_info *ei,
                                         struct ext4_block_bh *bh,
                                         int ino)
{
    struct ext4_sb_info *sbi = EXT4_SB(ei->vfs_inode.i_sb);
    struct ext4_inode *raw_inode;
    raw_inode = ext4_raw_inode_ptr(sbi, bh, ino);
    return raw_inode;
}
```
The function calculates the on‑disk offset using the formula derived earlier, fetches the buffer head containing the inode table block, and returns a pointer to the raw inode structure for further manipulation.

## Why This Matters
File systems are the **foundation of persistent storage**; every higher‑level service—databases, container images, build systems, virtual machines—relies on the guarantees they provide. Understanding the **on‑disk invariants** (allocation bitmaps, link counts, journaling) lets you:

* **Predict performance**: Knowing how extent trees reduce fragmentation explains why sequential workloads on ext4 achieve near‑raw device bandwidth, while random small writes suffer from increased metadata overhead and potential journal commit latency.  
* **Tune for workloads**: Adjusting `stride` and `stripe-width` via `mkfs -E stride=16,stripe-width=64` aligns allocations with RAID chunk size, eliminating read‑modify‑write penalties on striped arrays.  
* **Debug failures**: When a power loss corrupts a filesystem, the journal replay process can be traced via `debugfs` to pinpoint which transaction was incomplete, guiding recovery or informing hardware‑firmware updates.  
* **Build reliable software**: Applications that call `fsync` after each transaction understand the cost of metadata updates and can batch operations or use `O_DIRECT` + `fdatasync` to avoid unnecessary journal commits.  
* **Engage with modern trends**: Copy‑on‑write filesystems (btrfs, ZFS) replace the inode bitmap with extent‑based allocation and checksumming; grasping the classic inode/block model makes the transition conceptually easier.  

In short, mastering file‑system internals transforms you from a user who merely invokes `mkfs` and `mount` into an engineer who can **design, optimize, and troubleshoot** the storage stack that underpins all Linux‑based systems.
