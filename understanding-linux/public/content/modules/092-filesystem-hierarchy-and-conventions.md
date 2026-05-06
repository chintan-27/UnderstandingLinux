---
id: 92
title: "Filesystem hierarchy and conventions"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Core Concepts
### Filesystem Hierarchy and the FHS
The Linux filesystem hierarchy is not an arbitrary tree; it is a deliberately engineered namespace that separates **shareable** from **unshareable** and **static** from **variable** data, as codified in the Filesystem Hierarchy Standard (FHS).  
- **Shareable** (`/usr`, `/var/mail`) can be mounted read‑only on multiple machines.  
- **Unshareable** (`/etc`, `/var/run`) contains machine‑specific state and must be locally writable.  
- **Static** (`/bin`, `/lib`) holds binaries and libraries that do not change during normal operation.  
- **Variable** (`/var/log`, `/var/spool`) holds data that is constantly rewritten.

At the root (`/`) the VFS (Virtual Filesystem Switch) presents a single namespace that can be assembled from many underlying block devices, pseudo‑filesystems, and network sources. Each mount point is a **dentry** (directory entry) that the VFS binds to a **superblock** representing the mounted filesystem.

### Key Directories (beyond the obvious)
| Directory | FHS Rationale | Typical Contents | Kernel Subsystem |
|-----------|---------------|------------------|------------------|
| `/bin`, `/sbin` | Essential user and admin binaries needed for boot and repair (must be available before `/usr` is mounted) | `bash`, `mount`, `fsck` | VFS → executable lookup |
| `/lib`, `/lib64` | Shared libraries and kernel modules required by binaries in `/bin` and `/sbin` | `ld-linux.so.2`, `modules.*` | kmod, ELF loader |
| `/usr` | Secondary hierarchy for shareable, read‑only data; `/usr/bin` for user commands, `/usr/lib` for libraries, `/usr/include` for headers | Most user‑space packages | Same as `/bin` but mounted later |
| `/usr/local` | Locally compiled software that should not be overwritten by package updates | `src`, `bin` | Same as `/usr` |
| `/opt` | Add‑on application software packages (often static, third‑party) | `/opt/java`, `/opt/mysql` | Same as `/usr` |
| `/etc` | Host‑specific configuration; **unshareable** | `fstab`, `passwd`, `sysctl.conf` | VFS (config files) |
| `/dev` | Device nodes (character/block) created by **udev** or statically for early boot | `sda`, `ttyUSB0`, `null` | devtmpfs, udev |
| `/proc` | Process‑information pseudo‑filesystem; kernel exposes internal data structures via the **procfs** interface | `1/`, `meminfo`, `mounts` | procfs (no backing storage) |
| `/sys` | Device‑information pseudo‑filesystem exposing the **kobject** hierarchy; used by udev, power management, etc. | `block/sda/`, `class/net/eth0/` | sysfs (backed by kernel objects) |
| `/var` | Variable data that persists across reboots; split into sub‑dirs for logs, spool, cache, lib | `log/`, `lib/`, `spool/` | VFS (writable) |
| `/run` | Runtime variable data (since FHS 3.0); replaces `/var/run` for early‑boot tmpfs | `utmp`, `lock/` | tmpfs (mounted early) |
| `/home` | User home directories; **unshareable** and **variable** | `alice/`, `bob/` | VFS (often separate mount or encrypted) |
| `/tmp` | Temporary files; typically a **tmpfs** (RAM‑backed) or cleared on boot | `-` | tmpfs (mode 1777) |
| `/mnt`, `/media` | Temporary mount points for sysadmins (`/mnt`) and removable media (`/media`) | `-` | VFS (no special semantics) |

> **Why it matters:** Knowing which directories are *shareable* vs *unshareable* lets you decide what can be NFS‑mounted read‑only, what must be locally writable, and where to place custom software without interfering with package managers.

## How It Works
### VFS Mounting Mechanics (from first principles)
When a process invokes `mount(2)`, the kernel does not simply “attach a device”; it performs a sequence of well‑defined operations in the **Virtual Filesystem Switch (VFS)**:

1. **Path lookup** – The `target` pathname is walked using the current namespace’s dentry/inode trees. Each component is resolved via `lookup()` in the appropriate filesystem’s inode operations. The result is a **dentry** for the mount point and its parent inode.
2. **Permission check** – The kernel verifies `CAP_SYS_ADMIN` (or that the process owns the mount namespace) and that the target directory is not a **shared mount** unless `MS_SHARED` flags are set.
3. **Filesystem type resolution** – The kernel searches the registered `file_systems` list (built from `CONFIG_FS_*` and modules) for a matching `filesystemtype` string (e.g., `"ext4"`). If none is found, it attempts to load a module named `fs-<type>`.
4. **Superblock acquisition** – The filesystem’s `get_sb()` (or `mount()` in newer VFS) callback is invoked with:
   - `source` (device name, UUID, label, or pseudo‑fs identifier)
   - `flags` (mount flags like `MS_RDONLY`, `MS_NOEXEC`, `MS_BIND`, `MS_REC`, `MS_PRIVATE`, etc.)
   - `data` (option string parsed by the FS, e.g., `"data=ordered"` for ext4).
   The callback allocates a **superblock** (`struct super_block`), reads the on‑disk superblock (if any), and initializes FS‑specific structures (inode cache, journal, etc.).
5. **Dentry attachment** – The VFS creates a new **mount** structure (`struct mount`) linking the target dentry to the superblock’s root dentry. The mount is inserted into the mount namespace’s mount list and, if propagation is enabled, into peer namespaces.
6. **Updating `/proc/mounts`** – The procfs entry is generated on‑the‑fly from the mount list; no explicit write occurs. Each line contains:
   ```
   device target fstype options dump pass
   ```
   where `options` are the effective mount flags translated back to a comma‑separated string (e.g., `rw,relatime`).

> **Why each step is necessary:**  
> - Path lookup ensures the mount point exists and is not busy (EBUSY).  
> - Capability check prevents unprivileged users from altering the global namespace.  
> - Filesystem type resolution lets the kernel select the correct driver (e.g., `ext4` vs `xfs`).  
> - Superblock acquisition reads the filesystem’s metadata root; without it the VFS cannot interpret on‑disk structures.  
> - The mount structure maintains per‑mount flags (e.g., `nosuid`, `nodev`) that affect subsequent VFS permission checks.

### Example: Mount flags and their effect
| Flag | Meaning | Numeric value (Linux) | Effect on VFS checks |
|------|---------|-----------------------|----------------------|
| `MS_RDONLY` | Read‑only mount | 1 | All write‑related syscalls (`open(O_WRONLY)`, `unlink`, `mkdir`) return `EROFS`. |
| `MS_NOEXEC` | Disallow execution of binaries | 4 | `execve()` returns `EACCES` even if the file is marked executable. |
| `MS_NOSUID` | Ignore set‑UID/GID bits | 2 | `execve()` clears set‑UID/GID; `prctl(PR_SET_KEEPCAPS)` ignored. |
| `MS_BIND` | Bind mount (duplicate a subtree) | 0x1000 | No new superblock; the same filesystem is visible at another location. |
| `MS_REC` | Recursive bind/make private/etc. | 0x4000 | Applies operation to all submounts. |
| `MS_PRIVATE` | Make mount private (no propagation) | 0x20000 | Changes do not propagate to/from peer mount namespaces. |

> **Derivation:** The flag values are defined in `<linux/mount.h>` as bitmasks; combining them with bitwise OR yields the `mountflags` argument to `sys_mount`.

## Worked Examples
### Example 1: Mounting an ext4 partition by UUID
**Goal:** Mount the partition with UUID `a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8` at `/mnt/data` with default options (`rw,relatime`) and ensure it is remounted read‑only after use.

```bash
# 1. Identify the device via blkid (optional, shows UUID→device mapping)
sudo blkid -U a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8
# Output: /dev/sdb2

# 2. Mount read‑write
sudo mount -U a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8 /mnt/data

# 3. Verify options via /proc/mounts
grep '/mnt/data' /proc/mounts
# Expected line: /dev/sdb2 /mnt/data ext4 rw,relatime 0 0

# 4. Perform work (e.g., copy a file)
sudo cp /var/log/syslog /mnt/data/

# 5. Remount read‑only
sudo mount -o remount,ro /mnt/data

# 6. Verify new options
grep '/mnt/data' /proc/mounts
# Expected line: /dev/sdb2 /mnt/data ext4 ro,relatime 0 0
```

**Why this works:**  
- `-U` tells `mount` to resolve the UUID via `/dev/disk/by-uuid`, avoiding reliance on unstable device names (`sdb2` may change after re‑plug).  
- The VFS creates a new `struct super_block` for ext4, reads its inode table, and sets the `sb->s_flags` based on the mount options.  
- `remount,ro` simply flips the `MS_RDONLY` flag in the existing mount structure; no new superblock is allocated.

### Example 2: Bind mount and making it private
**Goal:** Expose `/opt/app/data` also at `/srv/shared` without allowing propagation to sibling mount namespaces (useful in containers).

```bash
# 1. Create the target directory if missing
sudo mkdir -p /srv/shared

# 2. Perform a bind mount
sudo mount --bind /opt/app/data /srv/shared

# 3. Make the bind mount private (stop propagation)
sudo mount --make-private /srv/shared

# 4. Verify propagation type
findmnt -o TARGET,PROPAGATION /srv/shared
# Output: /srv/shared private
```

**Why this works:**  
- `--bind` calls `sys_mount` with `MS_BIND` flag; the VFS re‑uses the existing superblock and creates a new `mount` struct pointing to the same dentry tree.  
- `--make-private` sets `MS_PRIVATE` on the mount, clearing the `MS_SHARED` bit; subsequent mount/unmount events in this namespace will not be sent to peers, preventing leaks in container environments.

### Example 3: Creating a tmpfs of a specific size and checking available space
**Goal:** Mount a 256 MiB tmpfs at `/tmp/work` and compute the exact free bytes available after creating a 50 MiB file.

```bash
# 1. Mount tmpfs with explicit size
sudo mount -t tmpfs -o size=256M tmpfs /tmp/work

# 2. Verify mount options
grep '/tmp/work' /proc/mounts
# Expected: tmpfs /tmp/work tmpfs rw,size=256k,nr_inodes=...,mode=755 0 0

# 3. Create a 50 MiB file
dd if=/dev/zero of=/tmp/work/bigfile bs=1M count=50 status=none

# 4. Use statfs to query free space (C snippet)
cat > /tmp/check.c <<'EOF'
#define _GNU_SOURCE
#include <stdio.h>
#include <sys/statfs.h>
int main() {
    struct statfs buf;
    if (statfs("/tmp/work", &buf) == -1) {
        perror("statfs");
        return 1;
    }
    /* f_bfree = free blocks, f_bsize = block size */
    printf("Free bytes: %lu\n", (unsigned long)buf.f_bfree * buf.f_bsize);
    return 0;
}
EOF
gcc -O2 /tmp/check.c -o /tmp/check
/tmp/check
# Expected output close to (256MiB - 50MiB) = 209715200 bytes (maybe slightly less due to overhead)
```

**Why this works:**  
- `tmpfs` is a RAM‑backed pseudo‑filesystem; its `get_sb()` allocates pages from the page cache up to the `size` limit.  
- The `statfs` syscall returns a `struct statfs` where `f_bfree * f_bsize` yields the exact number of free bytes, demonstrating the mathematical relationship between block count and block size.

## Common Mistakes
| Mistake | What’s wrong | Why it matters (kernel/VFS perspective) |
|---------|--------------|------------------------------------------|
| **Mounting over a non‑empty directory without realizing it hides existing data** | `sudo mount /dev/sdb1 /mnt` when `/mnt` already contains files makes those files inaccessible until the unmount. | The VFS overlays the new mount’s dentry tree on top of the target dentry. Lookups now resolve via the new superblock; the original dentries are still present but shadowed. If you later `umount`, the hidden data re‑appears, which can cause confusion or apparent data loss. |
| **Using `noexec` on `/tmp` then expecting scripts in `/tmp` to run** | Many build systems place temporary executables in `/tmp`; mounting with `-o noexec` causes `execve()` to return `EACCES`. | The `MS_NOEXEC` flag is checked in `do_execve_common()` before searching the interpreter. The VFS treats the filesystem as if it lacked the executable bit on all inodes, regardless of actual mode bits. |
| **Assuming `/etc/mtab` is a regular file** | On modern systems `/etc/mtab` is a symlink to `/proc/self/mounts`. Writing to it directly has no effect; edits are lost on remount. | `/proc/self/mounts` is generated dynamically from the mount namespace’s mount list. The symlink ensures legacy tools that read `/etc/mtab` still see current state, but writing bypasses the VFS and goes to the underlying `procfs` which ignores write attempts (returns `EBADF`). |
| **Attempting to mount a FAT32 filesystem with `mount -t ext4 …`** | The kernel will reject with “wrong fs type, bad option, bad superblock …” because the on‑disk superblock signature does not match ext4. | During `get_sb()`, the ext4 driver reads the superblock magic (`0xEF53`). FAT32’s boot sector lacks this value, causing `-EINVAL`. The VFS aborts before any data is interpreted, protecting the filesystem from corruption. |
| **Failing to propagate a mount change in a shared namespace** | In a container, executing `mount --make-shared /` then bind‑mounting inside the container does not appear on the host. | Propagation flags (`MS_SHARED`, `MS_SLAVE`, `MS_PRIVATE`) control whether mount events are sent to peer namespaces. Without `MS_SHARED`, the mount stays isolated; the host’s mount namespace never receives the update, leading to “missing mount” surprises when inspecting from the host. |
| **Using `mount -o remount,rw /` on a root filesystem mounted read‑only due to errors** | If the root FS was remounted read‑only because of I/O errors, a simple `remount,rw` may succeed but the underlying device may still be faulty, leading to silent data corruption. | The kernel sets `SB_RDONLY` on the superblock when it detects critical errors. A remount clears the flag, but the error bits (`sb->s_flags & SB_ERROR`) remain; subsequent writes may still fail, and the kernel may log I/O errors without aborting the operation. |

## Exercises
### Easy
1. **List current mounts**  
   ```bash
   mount | head -n 5
   ```
   *Explain what each column means (device, mount point, filesystem type, options).*

2. **Create a directory and bind‑mount it**  
   ```bash
   mkdir -p /tmp/alpha /tmp/beta
   touch /tmp/alpha/file
   sudo mount --bind /tmp/alpha /tmp/beta
   ls /tmp/beta
   ```
   *Verify that changes in one side appear in the other.*

3. **Query free space of a tmpfs**  
   ```bash
   sudo mount -t tmpfs -o size=100M tmpfs /tmp/ts
   df -h /tmp/ts
   ```
   *Note the size shown by `df` matches the mount option.*

### Medium
4. **Mount a filesystem by label and verify UUID persistence**  
   ```bash
   sudo blkid -o device -t LABEL=MYDATA
   sudo mount -L MYDATA /mnt/test
   grep '/mnt/test' /proc/mounts
   sudo umount /mnt/test
   ```
   *Explain why using a label/UUID is safer than a device name.*

5. **Remount the root filesystem read‑only and then back to read‑write**  
   ```bash
   sudo mount -o remount,ro /
   # Try to create a file – should fail
   sudo touch /cannot
   sudo mount -o remount,rw /
   sudo touch /can
   ```
   *Describe the kernel checks that block the first `touch`.*

6. **Create a loop device from a file and mount an ext4 image**  
   ```bash
   dd if=/dev/zero of=/tmp/disk.img bs=1M count=100
   sudo mkfs.ext4 -F /tmp/disk.img
   sudo mkdir -p /mnt/img
   sudo mount -o loop /tmp/disk.img /mnt/img
   df -h /mnt/img
   sudo umount /mnt/img
   ```
   *Show how `losetup` is invoked internally by the `loop` option.*

### Hard
7. **Set up a private mount namespace and propagate a bind mount only to the parent**  
   ```bash
   # Unshare a new mount namespace
   sudo unshare --mount --propagation unchanged --fork --pid bash
   # Inside the new namespace:
   mkdir -p /parent/child
   mount --bind / /parent/child
   mount --make-shared /parent
   mount --make-slave /parent/child   # child receives changes from parent, not vice‑versa
   # Verify from parent namespace (open another terminal)
   mount | grep '/parent/child'
   ```
   *Explain the difference between `shared`, `slave`, and `private` propagation types.*

8. **Perform a pivot_root to change the apparent root filesystem**  
   ```bash
   # Prepare new root
   sudo mkdir -p /newroot
   sudo mount -t ext4 /dev/sda2 /newroot
   sudo mkdir -p /newroot/oldroot
   # Copy minimal system (busybox) – omitted for brevity
   sudo pivot_root /newroot /newroot/oldroot
   exec chroot . /bin/sh   # now / is the new root
   ```
   *Discuss why `pivot_root` requires the old root to be a mount point and how the kernel updates the mount namespace’s root dentry.*

9. **Calculate the theoretical maximum number of files an ext4 filesystem can store given its inode ratio**  
   *Derive formula: `max_files = floor( (block_count * block_size) / (inode_size + overhead) )` using `dumpe2fs` output.*  
   ```bash
   sudo dumpe2fs /dev/sda1 2>/dev/null | grep -E 'Block size|Inode size|Inode count|Free inodes'
   ```
   *Show the calculation steps and compare with the actual `df -i` output.*

## Linux Connection
### Real subsystem names and tools
| Concept | Kernel subsystem | Representative source file | User‑space tool | Example command |
|---------|------------------|----------------------------|-----------------|-----------------|
| VFS core | `fs/` (vfs.c, namei.c, mount.c) | `fs/vfs.c` | `mount`, `umount`, `findmnt` | `findmnt -t ext4` |
| Superblock | `fs/super.c` | `fs/super.c` | `dumpe2fs`, `tune2fs` | `dumpe2fs /dev/sda1` |
| Inode/dentry cache | `fs/inode.c`, `fs/dcache.c` | `fs/inode.c` | `slabtop` (shows dentry_inode_cache) | `slabtop | grep dentry` |
| Procfs | `fs/proc/` | `fs/proc/mount.c` | `cat /proc/mounts` | `grep '^/dev' /proc/mounts` |
| Sysfs | `fs/sysfs/` | `fs/sysfs/mount.c` | `ls /sys` | `ls /sys/block/sda` |
| Tmpfs | `fs/shmem.c` | `fs/shmem.c` | `mount -t tmpfs` | `mount -t tmpfs -o size=512M tmpfs /mnt/ram` |
| Loop device | `drivers/block/loop.c` | `drivers/block/loop.c` | `losetup`, `losetup -f` | `sudo losetup /dev/loop0 /tmp/file.img` |
| Bind/move mounts | `fs/namespace.c` | `fs/namespace.c` | `mount --bind`, `mount --move` | `sudo mount --move /old /new` |
| Mount namespaces | `fs/namespace.c` (clone flags) | `fs/namespace.c` | `unshare`, `nsenter` | `sudo unshare --mount bash` |
| fstab parsing | `libmount` (util-linux) | `lib/mount.c` | `mount -a` | `sudo mount -a` (reads `/etc/fstab`) |
| blkid/uuid resolution | `libblkid` | `blkid/blkid.c` | `blkid`, `findfs` | `sudo blkid -U <uuid>` |
| System call interface | `arch/x86/entry/syscalls/syscall_64.tbl` | `sys_mount` | `syscall(2)` | `syscall(SYS_mount, src, tgt, type, flags, data)` |

### Runnable shell commands illustrating the connection
```bash
# Show the VFS mount struct
