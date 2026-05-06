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

## Core Concepts  
### User and Group Identification  
Every Linux task is represented by a `task_struct` whose credential subsystem (`struct cred`) stores four integer IDs: real UID (`ruid`), effective UID (`euid`), saved set‑user‑ID (`suid`), and the analogous GID trio (`rgid`, `egid`, `sgid`). The kernel interprets these IDs as follows:  

* **Real ID** (`ruid`/`rgid`) – the identity of the user who launched the process; used for signal permission checks (`kill`) and for tracking ownership in `/proc`.  
* **Effective ID** (`euid`/`egid`) – the ID consulted by the VFS when checking permission bits on inodes; determines whether a `read`, `write`, or `exec` syscall succeeds.  
* **Saved ID** (`suid`/`sgid`) – a placeholder that allows a set‑uid/set‑gid program to temporarily drop privileges and later restore them via `seteuid`/`setegid`.  

The root user is defined by the value **0** for both UID and GID. UIDs are allocated sequentially from **1** upward by `useradd`/`adduser`; the kernel does not enforce any particular range, but the `/etc/login.defs` file defines `UID_MIN` (typically 1000) for ordinary accounts.  

### Permission Bits as Bitmask  
A file’s mode (`mode_t`) occupies 16 bits. The layout (from most‑significant to least‑significant) is:  

| Bits | Symbol | Meaning |
|------|--------|---------|
| 15   | `S_ISUID` | set‑uid bit (04000₈) |
| 14   | `S_ISGID` | set‑gid bit (02000₈) |
| 13   | `S_ISVTX` | sticky bit (01000₈) |
| 12‑10| owner  | `rwx` (0-7) |
| 9‑7  | group  | `rwx` (0-7) |
| 6‑0  | other  | `rwx` (0-7) |

Thus the numeric mode `0x800` (decimal 2048) corresponds to `S_ISUID`. When the kernel evaluates an `open` request, it computes:  

```
if (mode & S_ISUID)  euid = inode->i_uid;
if (mode & S_ISGID)  egid = inode->i_gid;
```

### Capabilities – Fine‑Grained Privileges  
Capabilities split the traditional “all‑or‑nothing” root privilege into independent bits. The kernel stores three 64‑bit masks per credential:  

* **Permitted** (`cap_permitted`) – the ceiling of capabilities the thread may assume.  
* **Effective** (`cap_effective`) – the capabilities currently checked by the kernel.  
* **Inheritable** (`cap_inheritable`) – capabilities that may be passed to child processes across `execve`.  

A capability is represented by a number `< 64` (e.g., `CAP_CHOWN = 6`, `CAP_NET_BIND_SERVICE = 10`). The kernel provides the syscalls `capget` and `capset` to read/modify these masks; the `libcap` package offers the wrapper `cap_get_proc()`/`cap_set_proc()`.  

### Access Control Lists (ACLs) – POSIX.1e Extensions  
POSIX ACLs extend the traditional owner/group/other model with named user and group entries. An ACL is stored as an extended attribute (`system.posix_acl_access` for files, `system.posix_acl_default` for directories). The kernel evaluates ACLs in the following order (each step stops on first match):  

1. `ACL_USER_OBJ` – matches the file owner (`uid == inode->i_uid`).  
2. `ACL_USER` – matches a specific `uid qualifier`.  
3. `ACL_GROUP_OBJ` – matches the file group (`gid == inode->i_gid`).  
4. `ACL_GROUP` – matches a specific `gid qualifier`.  
5. `ACL_OTHER` – matches everyone else.  

Each entry contains a permission set (`rwx`) encoded as bits `4` (read), `2` (write), `1` (execute). The effective permissions are further limited by the `ACL_MASK` entry, which acts as a ceiling for all named user/group entries and the group class.  

---  

## How It Works  
### Process Credential Lifecycle  
When a process calls `fork()`, the child inherits a *copy* of the parent’s `struct cred`. The kernel does **not** duplicate the underlying `uid_t/gid_t` values; they are simply copied. On `execve()`, the kernel may modify credentials based on the executable’s mode bits:  

```c
/* execve → load_binary → prepare_binprm */
if (bprm->file->f_inode->i_mode & S_ISUID)
    new_cred->euid = bprm->file->f_inode->i_uid;
if (bprm->file->f_inode->i_mode & S_ISGID)
    new_cred->egid = bprm->file->f_inode->i_gid;
```

The saved IDs are set to the *previous* effective IDs so that a set‑uid program can later drop privileges:  

```c
new_cred->suid = old_cred->euid;
new_cred->sgid = old_cred->egid;
```

After `execve`, the thread may invoke `setuid(uid)` (or `setgid`) to change the real and effective IDs, provided one of the following holds:  

* The caller is privileged (`CAP_SETUID` in its permitted set).  
* The requested `uid` equals the real, effective, or saved ID.  

This rule prevents a non‑privileged process from arbitrarily assuming another user’s identity.  

### Capability Transformation Across execve  
During `execve`, the kernel computes the new capability sets as follows (see `cap_bprm_set_creds`):  

```
new_permitted = (file_permitted  & cap_permitted)  |
                (file_inheritable & cap_inheritable);
new_effective = file_effective ? new_permitted : 0;
new_inheritable = cap_inheritable;
```

* `file_permitted`, `file_effective`, `file_inheritable` are the capability sets attached to the executable file (via `setcap`).  
* If the file has no capability bits, the process inherits only those capabilities that were both permitted and inheritable in the old set.  

Consequently, a program that lacks `CAP_SETUID` in its permitted set cannot gain it via `execve`, even if the binary is set‑uid root—unless the file itself carries that capability.  

### ACL Permission Check  
When the VFS receives an `open` request for an inode with an ACL, the function `generic_permission` calls `posix_acl_permission`. The algorithm is:  

1. Retrieve the ACL extended attribute (if any).  
2. Find the matching ACL entry per the ordered list above.  
3. Extract the permission mask (`mutemp`) for that entry.  
4. Compute the final allowed mask: `mutemp & ~current_umask & ACL_MASK` (if an `ACL_MASK` entry exists).  
5. Compare against the requested mode (e.g., `MAY_READ`).  

If no POSIX ACL is present, the kernel falls back to the traditional mode‑bit check.  

---  

## Worked Examples  

### Example 1: Setuid Execution – UID Transition Trace  
**Scenario**: `/usr/bin/passwd` is owned by root, mode `4755` (`rwsr-xr-x`).  

1. **Before exec** (shell running as user `alice`, UID=1000):  
   * `ruid = 1000`, `euid = 1000`, `suid = 1000` (from `/proc/$$/status`: `Uid: 1000 1000 1000 0`).  
2. **Kernel load**: detects `S_ISUID` bit set → sets `euid` to file’s UID (`0`).  
3. **After exec** (inside `passwd`):  
   * `ruid = 1000` (unchanged – the invoking user),  
   * `euid = 0` (root),  
   * `suid = 1000` (saved original effective UID).  
4. **Privilege drop**: `passwd` calls `seteuid(1000)` to temporarily drop root while editing `/etc/shadow`, then restores `euid = 0` to write the updated password hash.  

**Verification commands**:  

```bash
# Show current credentials
id -u           # → 1000 (shell)
id -G           # → 1000 (supplementary groups)

# Run passwd and inspect its /proc status in another terminal
sudo -u alice /usr/bin/passwd -S alice &   # background, non-interactive
# In a second terminal while it's paused (e.g., with SIGSTOP):
cat /proc/$(pidof passwd)/status | grep -E 'Uid|Gid'
# Expected: Uid: 1000    0    1000    0   (ruid, euid, suid, fsuid)
```

### Example 2: Capability‑Restricted Binary – Binding to a Privileged Port  
**Goal**: Run a minimal web server that can bind to port 80 without being root.  

1. **Create the binary** (C):  

```c
/* tiny_httpd.c */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

int main(void) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port   = htons(80),   /* privileged port */
        .sin_addr.s_addr = INADDR_ANY
    };
    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        return 1;
    }
    listen(fd, 10);
    puts("Listening on port 80");
    pause();   /* wait for SIGTERM */
}
```

2. **Compile and set capability**:  

```bash
gcc -static -o tiny_httpd tiny_httpd.c
sudo setcap cap_net_bind_service=ep tiny_httpd
# Verify
getcap tiny_httpd   # → tiny_httpd = cap_net_bind_service+ep
```

3. **Run as unprivileged user**:  

```bash
./tiny_httpd &
# In another terminal, test the port:
nc -z localhost 80 && echo "port 80 open" || echo "port 80 closed"
```

**Why it works**: The file’s permitted set contains `CAP_NET_BIND_SERVICE`. At `execve`, the kernel computes `new_permitted = file_permitted & old_permitted` (the latter is empty for an unprivileged user) → `new_permitted = CAP_NET_BIND_SERVICE`. Since the file’s effective flag is set, `new_effective` inherits that capability, allowing the `bind` syscall to succeed despite the process having `euid ≠ 0`.  

### Example 3: ACL Mask Interaction  
**Scenario**: Directory `/srv/project` owned by group `devs`. We want user `alice` (not in `devs`) to read files, but members of `devs` to read **and write**.  

```bash
# Base permissions: rwxrwx--- (0770)
chmod 0770 /srv/project
chown root:devs /srv/project

# Give alice read access via named user ACL
setfacl -m u:alice:r-- /srv/project

# View effective mask
getfacl /srv/project
# Output:
# file: /srv/project
# owner: root
# group: devs
# user::rwx
# group::rwx
# other::---
# user:alice:r--          # effective:r--
# mask::rwx
# other::---
```

**Explanation**: The `mask::rwx` entry states that the maximum permissions any named user or group entry may obtain are `rwx`. Since we set `mask` to `rwx` (default when no explicit mask is given), Alice’s `r--` is honored, yielding read‑only access. If we later run `setfacl -m m:rx /srv/project`, the mask becomes `rx` and Alice’s effective permissions drop to `r--` (still read) while the group `devs` loses write (`w`) because the mask strips it.  

---  

## Common Mistakes  

| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Assuming `setuid` bits are inherited across `execve`** | The kernel only changes `euid`/`egid` based on the file’s mode bits; the real and saved IDs remain those of the caller. | A set‑uid program that calls `setuid(getuid())` to drop privileges will *not* regain the original elevated `euid` later unless it saves the saved ID first. |
| **Thinking capabilities are automatically inherited** | Across `execve`, only capabilities that are both **permitted** and **inheritable** in the parent survive unless the executable file has its own capability bits. | A daemon started by root may lose `CAP_SYS_ADMIN` after exec’ing a binary that lacks the inheritable flag, causing silent failures (e.g., inability to mount namespaces). |
| **Believing ACL mask is irrelevant if no named entries exist** | The mask limits the *group* and *other* classes when a named user or group entry is present; if no named entries exist, the mask is ignored and traditional mode bits apply. | Setting `setfacl -m m::r-- /file` on a file with no named ACL entries has no effect; administrators sometimes wonder why permissions didn’t tighten. |
| **Using `chmod u+s` on a directory expecting inheritance** | The set‑gid bit on a directory forces newly created files to inherit the directory’s group, but set‑uid on directories is ignored (POSIX leaves it undefined). | Expecting set‑uid on a directory to cause files to be owned by the directory’s owner leads to confusion; only set‑gid has defined semantics. |
| **Overlooking `nosuid` mount option** | Filesystems mounted with `nosuid` ignore set‑uid/set‑gid bits; the kernel clears them when mapping inodes from disk. | Deploying a set‑uid binary on a `/tmp` mount (`nosuid`, `nodev`, `noexec`) results in normal execution without elevated privileges—a frequent source of “setuid not working” reports. |

---  

## Exercises  

### Easy  
1. **Credential inspection** – Run `id -u`, `id -g`, `groups`. Then read `/proc/$$/status` and note the lines `Uid:` and `Gid:`. Explain each field (ruid, euid, suid, fsuid).  
2. **Capability query** – Execute `getcap /bin/ping`. State which capability allows ping to send ICMP echo requests and why it is needed.  

### Medium  
3. **Setuid C program** – Write a program that prints `getuid()`, `geteuid()`, then calls `setuid(getuid())` and prints the IDs again. Compile, set the set‑uid bit (`sudo chown root:root ./prog && sudo chmod u+s ./prog`), and run as a normal user. Observe the change before and after the `setuid` call.  
4. **Capability drop** – Using `capsh`, start a shell with only `CAP_SETUID` permitted, then attempt to `setuid(0)`. Record the error and explain why the operation fails despite the capability being present.  

### Hard  
5. **ACL mask experiment** – Create a directory, set a group `proj` with `rwx` permissions via traditional mode bits, then add a named user ACL for `alice` with `rwx`. Explicitly set the mask to `r--` and verify that neither `alice` nor members of `proj` can write. Explain the interaction between the mask and the effective permissions.  
6. **Custom capability binary** – Write a small daemon that calls `prctl(PR_SET_KEEPCAPS, 1)` to retain capabilities after dropping uid to 65534 (nobody). Attach `CAP_NET_RAW` to the binary via `setcap`. Start it as root, verify it can open a raw socket (`socket(AF_INET, SOCK_RAW, IPPROTO_ICMP)`) even after dropping to nobody. Document each step with `ps -o pid,user,cap_eff` (using `ps -eo pid,user,cap=`).  

---  

## Linux Connection  

| Concept | Kernel Subsystem | Source Files (approx.) | Key Data Structures | User‑Space Tools |
|---------|------------------|------------------------|---------------------|------------------|
| UID/GID handling | `kernel/fork.c`, `kernel/exec.c` | `struct cred` (`include/linux/cred.h`) | `uid_t uid, gid;`, `uid_t euid, egid;`, `uid_t suid, sgid;` | `id`, `getuid(2)`, `setuid(2)`, `/proc/<pid>/status` |
| Setuid/Setgid bits | VFS inode permission check (`fs/namei.c`) | `mode_t i_mode` in `struct inode` | `S_ISUID (04000)`, `S_ISGID (02000)` | `chmod`, `ls -l`, `stat`, `/proc/sys/fs/suid_dumpable` |
| Capabilities | `security/capability.c` | `struct cred` includes `cap_t cap_inheritable, cap_permitted, cap_effective;` | `cap_flag_t` (CAP_PERMITTED, etc.), macros `CAP_TO_MASK`, `CAP_TO_INDEX` | `capget(2)`, `capset(2)`, `getcap`, `setcap`, `capsh`, `libcap` |
| POSIX ACLs | `fs/posix_acl.c` (VFS hooks in `fs/open.c`) | `struct posix_acl *acl;` stored as xattr `system.posix_acl_access` | `struct posix_acl_entry { uid_t uid_gid; short perm; }` | `getfacl`, `setfacl`, `attr` (for raw xattr inspection) |
| `/proc` credential exposure | `fs/proc/array.c` | `proc_pid_status` function outputs `Uid:` and `Gid:` lines | Shows `ruid euid suid fsuid` (fsuid used for filesystem checks) | `cat /proc/$$/status` |

**Run‑able illustrations**  

```bash
# 1. View a task's credential struct via /proc
cat /proc/self/status | grep -E 'Uid|Gid'

# 2. Inspect the capability bounding set (inheritable set passed to children)
cat /proc/self/status | grep -E 'CapInh|CapPrt|CapEff'

# 3. Show the raw ACL xattr on a file
getfacl -e myfile   # -e shows the effective mask too
# Or directly:
getfattr -n system.posix_acl_access -d - -e hex myfile

# 4. Demonstrate nosuid preventing setuid elevation
sudo mount -o remount,nosuid /tmp
cp /bin/bash /tmp/bash_suid
sudo chown root:root /tmp/bash_suid
sudo chmod u+s /tmp/bash_suid
/tmp/bash_suid -c 'id -u'   # will output your normal UID, not 0
```

---  

## Why This Matters  

Linux’s permission and identity model is the foundation upon which every security‑critical operation rests: process isolation, file access control, network privilege delegation, and containerization. Understanding the precise mechanics—how the kernel transforms `ruid/euid/suid` across `execve`, how capability masks are computed from file attributes, and how ACL entries are evaluated in a deterministic order—enables you to:

* **Diagnose** mysterious “permission denied” failures that stem from masked capabilities or overlooked `nosuid` mounts.  
* **Design** least‑privilege services by attaching only the necessary capabilities (e.g., `CAP_NET_BIND_SERVICE` for a web listener) and avoiding unnecessary set‑uid root binaries.  
* **Leverage** advanced features like user namespaces (`CLONE_NEWUID`) where UID/GID mapping relies on the same credential structures described here.  
* **Audit** system integrity: tools such as `getcap`, `getfacl`, and `ps -eo pid,user,cap=` let you verify that no unintended privilege pathways exist.  

By mastering these low‑level details, you move beyond rote command usage to a principled ability to harden, troubleshoot, and extend Linux systems—exactly the expertise required for systems programming, DevOps engineering, and security research.
