---
id: 93
title: "Users, groups, permissions"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Why This Matters

Every process on Linux runs as a specific user and belongs to specific groups. Every file has an owner and a set of permission bits. When a process tries to open a file, the kernel checks these identities against those bits before allowing the operation. Understanding this from first principles means you can reason about *why* a permission denied error occurs, trace it to a specific mismatch between an effective UID and an inode's `st_uid`, and fix it precisely — rather than reaching for `chmod 777`.

---

## Core Concepts

### User and Group Identity

Every process carries multiple numeric IDs in its kernel-maintained task struct (`task_struct` in `include/linux/sched.h`):

- **Real UID / Real GID** — the identity of the user who launched the process; inherited across `fork()`, used for accounting and `access(2)`
- **Effective UID / Effective GID** — what the kernel actually checks for most permission decisions (file open, signal delivery, binding privileged ports)
- **Saved set-user-ID** — a snapshot of the effective UID taken when a privilege transition occurs, enabling later restoration via `seteuid(2)` without requiring root
- **Supplementary groups** — up to `NGROUPS_MAX` (typically 65536) additional GIDs, loaded from `/etc/group` at login; the kernel checks these during group permission tests

These IDs are separate because privilege must be both *delegatable* and *revocable*. A daemon that starts as root can drop to an unprivileged UID by calling `setuid(2)`, then cannot regain root — because the saved set-UID was also overwritten. A set-UID program, by contrast, keeps the original real UID so it can be audited.

Inspect a live process's credentials directly:

```bash
cat /proc/$$/status | grep -E '^(Uid|Gid|Groups)'
```

The four columns under `Uid` and `Gid` are: real, effective, saved, filesystem.

### The Inode and Ownership

Every file has an inode. The inode stores:

- `st_uid` — the owning user ID
- `st_gid` — the owning group ID
- `st_mode` — a bitmask encoding the file type and the nine permission bits plus three special bits

Ownership is a property of the inode, not the filename. A hard link is just a directory entry pointing to the same inode. Creating a hard link does not create a new permission set — there is only one, shared by all names that resolve to that inode.

### Mode Bits: The Permission Bitmask

The lower 12 bits of `st_mode` encode permissions:

$$\underbrace{b_{11}\ b_{10}\ b_9}_{\text{special}} \quad \underbrace{b_8\ b_7\ b_6}_{\text{owner}} \quad \underbrace{b_5\ b_4\ b_3}_{\text{group}} \quad \underbrace{b_2\ b_1\ b_0}_{\text{other}}$$

Each of the three permission triples encodes read/write/execute as:

$$\text{value} = 4r + 2w + x$$

So mode `0644` decomposes as:

| Bits | Octal | Who | Permissions |
|------|-------|-----|-------------|
| `110` | 6 | owner | read + write |
| `100` | 4 | group | read only |
| `100` | 4 | other | read only |

The three special bits are:

- **Set-UID (SUID, bit 11)** — on an executable, the kernel sets the process's effective UID to `st_uid` at `execve(2)` time. This is how `passwd(1)` can write to `/etc/shadow` (owned by root) when run by an unprivileged user.
- **Set-GID (SGID, bit 10)** — analogous for GID. On a *directory*, new files created inside inherit the directory's GID rather than the creator's primary GID — critical for shared project directories.
- **Sticky bit (bit 9)** — on a directory, prevents users from deleting or renaming files they do not own, even with write permission on the directory. This is why `/tmp` (mode `1777`) is world-writable but users cannot delete each other's files.

To inspect the raw numeric mode of a file:

```bash
stat -c '%a %U %G %n' /tmp /usr/bin/passwd /etc/shadow
```

### The Permission Check Algorithm

When a process accesses a file, the kernel applies exactly **one** of the three permission triples — in order, stopping at the first match:

1. If `euid == st_uid`: apply the **owner** bits
2. Else if `egid` or any supplementary GID matches `st_gid`: apply the **group** bits
3. Else: apply the **other** bits

This has a non-obvious consequence: if the owner triple denies access but the group triple would grant it, and the process is the owner, the access is still **denied**. The kernel does not OR the triples together. A file with mode `0064` is readable by the group but not by the owner.

Root (`euid == 0`) bypasses read and write checks entirely. It still needs at least one execute bit set *anywhere* on the file to execute it — this prevents accidentally running non-executable data files as root.

### The umask

When a file is created, the kernel applies the process's umask to strip bits from the mode requested by the caller:

$$\text{actual\_mode} = \text{requested\_mode}\ \&\ (\sim\text{umask})$$

A umask of `0022` (octal) strips write permission from group and other. If `open(2)` requests mode `0666`:

$$0666_8\ \&\ \sim 0022_8 = 0666_8\ \&\ 0755_8 = 0644_8$$

In binary:

$$\underbrace{110\ 110\ 110}_{0666}\ \&\ \underbrace{111\ 101\ 101}_{0755} = \underbrace{110\ 100\ 100}_{0644}$$

The umask is *subtractive only* — it can remove bits, never add them. It is per-process, inherited across `fork()`, and invisible to other processes. There is no syscall that reads the umask without also setting it (see the C example below).

### ACLs: Access Control Lists

The nine mode bits cannot express "grant write access to exactly one additional user." POSIX ACLs solve this by attaching a named permission table to the inode, stored in an extended attribute (`security.posix_acl_access` or `system.posix_acl_access` depending on implementation). An ACL entry looks like:

```
user::rwx
user:alice:rw-
group::r--
mask::rw-
other::---
```

The `mask` entry is critical: it caps effective permissions for all *named* users and named groups (but not the owning user or `other`). If `alice` has `rwx` but `mask` is `rw-`, alice's effective permission is `rw-`. This lets you reduce the ceiling without editing every named entry.

ACLs require filesystem support (ext4, xfs, btrfs all provide it). When an ACL is present, the `ls -l` output shows a trailing `+` on the mode string.

```bash
# Set an ACL
setfacl -m u:alice:rw /path/to/file

# Inspect the ACL
getfacl /path/to/file

# Remove a specific ACL entry
setfacl -x u:alice /path/to/file
```

### sudo

`sudo` is a set-UID-root executable (`ls -l /usr/bin/sudo` shows mode `4755`, with the SUID bit set). When a normal user runs it, `execve` sets the effective UID to 0 because `st_uid` is 0 and SUID is set. `sudo` then:

1. Reads `/etc/sudoers` (which must be owned by root and not writable by others — `sudo` refuses to run if this is violated)
2. Checks whether the real UID is authorized for the requested command
3. Calls `execve(2)` on the target command with root's effective UID

The entire security of `sudo` collapses if `/etc/sudoers` or the `sudo` binary itself can be written by an unprivileged user. Always edit `/etc/sudoers` via `visudo`, which validates syntax before writing.

---

## How It Works

### Stat and the Mode Field

The `stat(2)` syscall fills a `struct stat`. Masking `st_mode` with `07777` isolates the 12 permission bits; masking with `S_IFMT` (`0xF000`) isolates the file type.

```c
#include <sys/stat.h>
#include <stdio.h>

int main(void) {
    struct stat sb;
    if (stat("/etc/shadow", &sb) == -1) {
        perror("stat");   /* likely EACCES or ENOENT */
        return 1;
    }
    printf("uid=%u  gid=%u  mode=%04o  type=%s\n",
           (unsigned)sb.st_uid,
           (unsigned)sb.st_gid,
           (unsigned)(sb.st_mode & 07777),
           S_ISREG(sb.st_mode) ? "regular" :
           S_ISDIR(sb.st_mode) ? "directory" : "other");
    return 0;
}
```

On a typical system, `/etc/shadow` is owned by `root:shadow`, mode `0640` — readable only by root and members of the `shadow` group. `passwd(1)` accesses it through its set-UID-root effective UID, not through group membership.

### Checking Permissions: access(2) vs. Attempting the Operation

`access(2)` checks permissions using the **real** UID/GID, not the effective UID. This exists specifically so set-UID programs can ask: "would the *actual user who invoked me* be allowed to read this file?" But it has a
