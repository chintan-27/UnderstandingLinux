---
id: 176
title: "Linux permissions and identity"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every process on a Linux system runs with a numeric identity, and the kernel uses that identity — not a username, not a session cookie — to decide what the process can do. The permission system is what makes a multi-user OS meaningful: without it, any process running as your user could read your SSH private keys, and any setuid misconfiguration hands an attacker root. When you understand how the kernel actually evaluates these checks, you can reason about privilege escalation paths, audit setuid binaries, and design services that hold only the capabilities they need.

## Core Concepts

### UID and GID: Numeric Identity

Every process carries a **user ID (UID)** and a **group ID (GID)** — unsigned 32-bit integers. The kernel never looks up `/etc/passwd` during a permission check; usernames are a userspace convenience. The kernel compares integers. UID 0 is root and receives special treatment throughout the kernel (most capability checks short-circuit to allow). Every child process inherits its UIDs and GIDs from its parent via `fork()`, so identity flows down the process tree from login.

Each process carries *four* UIDs, not one:

| Field | Meaning |
|---|---|
| **RUID** | Who you actually are — set at login, rarely changes |
| **EUID** | What the kernel checks for most permission decisions |
| **SUID** | Saved copy of EUID before a privilege drop, enabling later restoration |
| **FSUID** | Used specifically for filesystem permission checks; normally tracks EUID |

The same four-way structure applies to groups (RGID, EGID, SGID, FSGID), plus a supplementary group list (up to `NGROUPS_MAX`, typically 65536). A process's full group identity is the union of EGID and all supplementary GIDs — the kernel checks all of them during a group permission test.

FSUID exists because of NFS: an NFS server acting on behalf of a client needs to perform filesystem checks as the client's UID without actually changing its EUID, so that signals and other EUID-based checks still apply to the server process correctly. In ordinary programs, FSUID follows EUID automatically.

### Capabilities: Decomposing Root

Historically, privilege was binary: UID 0 or not. This is coarse — a DNS server needs `CAP_NET_BIND_SERVICE` to bind port 53, but has no business touching `/etc/shadow`. **POSIX capabilities** (implemented in Linux via `include/uapi/linux/capability.h`) decompose root's power into ~40 distinct privileges. Each process carries three sets per the kernel's `cred` structure:

- **Permitted** (`CapPrm`): the ceiling — capabilities the process could activate
- **Effective** (`CapEff`): currently active; what the kernel actually checks
- **Inheritable** (`CapInh`): what survives an `execve()` into a new binary

A fourth set, **ambient** (`CapAmb`, added in Linux 4.3), allows non-setuid binaries to inherit capabilities across `execve()` without requiring file capabilities, which solves the problem of capability-aware scripts and interpreted programs.

Dropping a capability from **permitted** is irreversible for that process — it cannot be regained without a new `execve()` of a binary with file capabilities granting it. Dropping only from **effective** while keeping it in **permitted** lets a process temporarily relinquish a privilege and reclaim it later via `capset()`.

### setuid: Temporary Identity Elevation

The setuid bit on an executable changes what EUID the kernel assigns to the new process at `execve()` time. Instead of inheriting the caller's EUID, the process gets the file owner's UID as its EUID. RUID still reflects the original caller, so the program can always audit who invoked it via `getuid()`.

This is why `/usr/bin/passwd` can write `/etc/shadow` — the binary is owned by root with the setuid bit set. The kernel's `fs/exec.c` applies this during `bprm_fill_uid()`: it reads the inode's owner UID and sets the new credentials' EUID accordingly before the new process image is loaded.

The setgid bit works identically for group identity: EGID becomes the file's group owner on execution.

A subtlety: setuid is **ignored on shell scripts** (files beginning with `#!`) in Linux. This is deliberate — the race condition between the kernel opening the script and the interpreter reading it would create a TOCTOU vulnerability. Setuid only applies to ELF binaries (and other directly-executable formats) where the kernel controls the entire execution setup.

### ACLs: Beyond the Nine Bits

Traditional Unix permissions have three subjects: owner, owning group, other. This cannot express "alice can read this file, but bob cannot, even though both are in the same group." **POSIX ACLs** (implemented via the `ext4`, `xfs`, `btrfs` filesystem ACL infrastructure and the `acl` kernel option) attach a list of `(type, qualifier, permissions)` entries to an inode. When an ACL is present, the VFS layer calls into `posix_acl_permission()` instead of the standard three-bucket check.

The ACL **mask** entry is not optional decoration — it is the maximum effective permission for all named-user and named-group entries. If the mask is `r--` and alice's entry says `rwx`, alice gets `r--`. The mask is recomputed by `setfacl` when you modify group entries, which surprises people who set a named-user entry and then lose it to a mask change.

## How It Works

### Kernel Permission Check Path

When a process calls `open()`, the VFS calls `inode_permission()` in `fs/namei.c`, which calls `do_inode_permission()`, which reaches `generic_permission()`. The evaluation order is fixed:

1. If `cred->fsuid == 0` (root), bypass read/write checks; execute requires at least one execute bit set anywhere on the file.
2. If `cred->fsuid == inode->i_uid`, apply owner permission bits.
3. If `cred->fsgid == inode->i_gid` or any supplementary GID matches, apply group bits.
4. Otherwise apply other bits.

If a POSIX ACL is present on the inode, step 2 is replaced by `posix_acl_permission()`, which walks the ACL entries and ANDs the result with the mask.

The permission bits occupy 12 bits of the inode's mode field:

$$\text{mode} = \underbrace{b_{11}b_{10}b_9}_{\text{setuid, setgid, sticky}} \underbrace{b_8b_7b_6}_{\text{owner}} \underbrace{b_5b_4b_3}_{\text{group}} \underbrace{b_2b_1b_0}_{\text{other}}$$

Each three-bit group encodes $r = 4$, $w = 2$, $x = 1$, so `chmod 4754` means:

$$4000 + 7\cdot8^2 + 5\cdot8 + 4 = \text{setuid} + \text{owner:rwx} + \text{group:r-x} + \text{other:r--}$$

Or equivalently: owner gets $4+2+1=7$, group gets $4+1=5$, other gets $4$.

The full octal value including the special bits:

| Octal | Bit | Effect |
|---|---|---|
| 4000 | $b_{11}$ | setuid on exec |
| 2000 | $b_{10}$ | setgid on exec (or mandatory locking on non-exec files) |
| 1000 | $b_9$ | sticky (on directories: only owner can delete their own files) |

### setuid in Practice

```bash
ls -l /usr/bin/passwd
# -rwsr-xr-x 1 root root 68208 Jan 10 2024 /usr/bin/passwd
#   ^ lowercase 's' = setuid bit set AND owner execute bit set
#     uppercase 'S' would mean setuid set but execute NOT set (useless and suspicious)
```

Execution path at the kernel level:

```
execve("/usr/bin/passwd", argv, envp)
  → bprm_fill_uid() in fs/exec.c
  → inode has S_ISUID set and fsuid != inode->i_uid
  → new cred->euid = inode->i_uid  (becomes 0)
  → new cred->suid = 0             (saved for potential drop/restore)
  → cred->uid (real) unchanged     (remains calling user's UID)
```

A setuid program that calls `seteuid(getuid())` drops privilege temporarily; it can restore it with `seteuid(0)` because SUID still holds 0. A program that calls `setuid(getuid())` — without 'e' — permanently drops root because `setuid()` for a root process sets all three of RUID, EUID, and SUID simultaneously.

```c
#include <unistd.h>
#include <stdio.h>

int main(void) {
    printf("ruid=%d euid=%d\n", getuid(), geteuid());

    /* Temporary drop */
    seteuid(getuid());
    printf("after seteuid drop: ruid=%d euid=%d\n", getuid(), geteuid());

    /* Restore — works because suid still holds 0 */
    seteuid(0);
    printf("after seteuid restore: ruid=%d euid=%d\n", getuid(), geteuid());

    /* Permanent drop — sets ruid=euid=suid=calling uid */
    setuid(getuid());
    printf("after setuid drop: ruid=%d euid=%d\n", getuid(), geteuid());

    /* This will fail: EPERM — suid is no longer 0 */
    if (seteuid(0) < 0)
        perror("seteuid(0) failed as expected");

    return 0;
}
```

Compile and test: `gcc -o suid_demo suid_demo.c && sudo chown root
