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

## Core Concepts
### Users, Groups, and Identities
Every process in Linux carries three integer identifiers that the kernel uses for permission checks: the real UID (`ruid`), the effective UID (`euid`), and the saved set‑UID (`suid`). Likewise there are real, effective, and saved GIDs. When a program executes, the kernel sets `euid` and `egid` to the values found in the password entry for the user that invoked the program (unless the binary has the set‑UID bit set, in which case `euid` becomes the file’s owner UID). Supplementary group IDs are obtained from `/etc/group` and stored in the task’s credential struct.  
**Why:** The kernel’s access‑check algorithm compares the requester’s `euid`/`egid` (and supplementary GIDs) against the file’s owner UID, owning GID, and ACL entries. Using effective IDs allows a privileged program to temporarily drop privileges (via `seteuid`) while still being able to regain them later.

### Mode Bits (the traditional UNIX permission model)
Each inode stores a 16‑bit `i_mode` field. The low 9 bits encode the classic *read/write/execute* for *owner/group/others*:

```
bits 8‑6 → owner   (rwx)
bits 5‑3 → group   (rwx)
bits 2‑0 → others  (rwx)
```

A permission bit is **1** if the corresponding access is granted. The numeric value of each triad is computed as:

```
owner_bits   = 4*r_owner + 2*w_owner + 1*x_owner
group_bits   = 4*r_group  + 2*w_group  + 1*x_group
other_bits   = 4*r_other  + 2*w_other  + 1*x_other
mode         = (owner_bits << 6) | (group_bits << 3) | other_bits
```

*Example:* `rwxr-x---` → owner = 7 (111), group = 5 (101), others = 0 (000) → mode = (7<<6)|(5<<3)|0 = 0o750.

**Why this layout?** The VFS permission check (`inode_permission`) extracts these three fields with shifts and masks, then compares them against the caller’s credentials. The simplicity makes the check O(1) and storable in the inode without extra allocation.

### Access Control Lists (ACLs) – POSIX.1e Extensions
When the filesystem is mounted with the `acl` option, each inode can have an extended attribute named `system.posix_acl_access` (and optionally a default ACL for directories). An ACL is a variable‑length array of `struct posix_ace` entries:

```c
struct posix_ace {
    __le16 e_tag;   // ACL_USER_OBJ, ACL_USER, ACL_GROUP_OBJ, ACL_GROUP, ACL_MASK, ACL_OTHER
    __le32 e_id;    // UID or GID for USER/GROUP entries, ignored otherwise
    __le16 e_perm;  // permission bits (same layout as mode bits)
};
```

Evaluation order (performed by the VFS after checking traditional mode bits):

1. If the requester’s `euid` equals the file owner UID → check `ACL_USER_OBJ`.
2. Else if there is an entry with `e_tag == ACL_USER` and `e_id == euid` → use that entry.
3. Else check all `ACL_GROUP` entries whose `e_id` matches any of the requester’s supplementary GIDs; compute the union of their permissions.
4. If an `ACL_MASK` entry exists, the union from step 3 is masked (bitwise AND) with its permissions.
5. Finally, if none of the above matched, check `ACL_OTHER`.

The effective permission is the union of the applicable user entry (if any) and the masked group union.  
**Why:** ACLs let you grant permissions to specific users or groups without changing the file’s owning UID/GID, which is essential for shared directories (e.g., a project folder where several developers need read/write but no single Unix group maps exactly to that set).

### Privilege Escalation with sudo
`sudo` is a set‑uid root executable (`/usr/bin/sudo`). When invoked, it:

1. Changes its `euid` to 0 (root) via the set‑uid bit.
2. Reads `/etc/sudoers` (or included files) to determine whether the invoking user is allowed to run the requested command, optionally with a password prompt.
3. If authorized, it creates a new process via `fork()` and `execve()` that runs the target command with `euid` = 0 (and usually `egid` = 0). The environment is sanitized unless `env_keep` or `env_reset` options are set.
4. After successful authentication, sudo writes a timestamp file (`/var/run/sudo/ts/<user>`) to allow password‑free sudo for a configurable timeout (default 5 min).

**Why this design?** The set‑uid root bit gives sudo the necessary privilege to consult the sudoers policy and spawn a root‑owned child. The policy file enforces *least privilege* by specifying exactly which commands (and arguments) a user may run as root, reducing the attack surface compared to logging in as root directly.

## How It Works
### Permission Check Flow in the VFS
When a syscall such as `openat(dirfd, pathname, flags)` reaches the VFS:

1. The dentry’s inode is looked up.
2. `inode_permission(inode, mask, unsigned int flags)` is called, where `mask` encodes the requested operation (`MAY_READ`, `MAY_WRITE`, `MAY_EXEC`).
3. The function extracts the caller’s credentials: `uid = current_cred()->euid`, `gid = current_cred()->egid`, and the supplementary group list.
4. It compares `uid` against `inode->i_uid` and `gid` (plus supplementary groups) against `inode->i_gid`.
5. **If the caller is the owner**, the permission bits shifted for the owner (`(mode >> 6) & 0x7`) are tested against `mask`.
6. **Else if the caller’s groups match the owning group**, the group bits (`(mode >> 3) & 0x7`) are tested.
7. **Else**, the other bits (`mode & 0x7`) are tested.
8. If any of the above succeeds, the check returns 0 (permission granted).  
   If all fail, the VFS then looks for a POSIX ACL:
   - Retrieve `system.posix_acl_access` via `getxattr`.
   - Parse the ACE list and apply the algorithm described in the Core Concepts section.
   - If the ACL grants the requested bit, return 0; otherwise return `-EACCES`.

Thus ACLs are consulted *only* after the traditional mode bits have been denied, providing a fallback that preserves backward compatibility.

### UMask and Default Mode Creation
When a process creates a new file via `creat()` or `open(..., O_CREAT)`, the kernel takes the mode argument supplied by the caller and clears the bits set in the process’s file mode creation mask (`umask`). Mathematically:

```
granted_mode = requested_mode & ~umask
```

If the caller does not specify a mode (e.g., `open(..., O_WRONLY|O_CREAT)`), the default is `0666` for files and `0777` for directories before umask application.  
**Why:** This allows users to enforce a baseline privacy policy (e.g., `umask 0027` → new files get `640`, directories `750`) without having to remember to `chmod` each new object.

### Sudo Authentication and Timestamp Mechanics
The sudo PAM module (`pam_sudo`) performs the following steps:

1. **Conversation:** Prompts the user for a password (unless `targetpw` is set or the user is listed with `NOPASSWD`).
2. **Verification:** Calls `crypt()` or the system’s password hashing scheme (usually SHA‑512) against the entry in `/etc/shadow`.
3. **Success:** Updates the timestamp file:
   ```
   touch /var/run/sudo/ts/$USER
   ```
   The file’s modification time is compared against `timeout` (default 300 s). If `now - mtime < timeout`, subsequent sudo invocations skip the password prompt.
4. **Failure:** Logs the attempt via syslog and returns authentication error.

The timestamp file is owned by root and mode `0700` to prevent other users from tampering with it.

## Worked Examples
### Example 1: Computing Mode from Symbolic Permission
**Goal:** Set a file’s mode to `rw-r--r--` (owner read/write, group read, others read).  
**Step‑by‑step:**
1. Owner: `rwx` → `rw-` → `4+2+0 = 6`.
2. Group: `rwx` → `r--` → `4+0+0 = 4`.
3. Others: `rwx` → `r--` → `4+0+0 = 4`.
4. Combine: `mode = (6<<6) | (4<<3) | 4 = 0b110_100_100 = 0o644`.
5. Apply with `chmod`:
   ```bash
   $ touch example.txt
   $ chmod 644 example.txt
   $ stat -c "%a %n" example.txt
   644 example.txt
   ```

### Example 2: Creating an Effective ACL with Mask
**Scenario:** Give user `alice` read/write, group `staff` read-only, and mask to limit group to read.  
**Commands:**
```bash
$ touch shared.txt
$ setfacl -m u:alice:rw shared.txt          # user ACL entry
$ setfacl -m g:staff:r  shared.txt          # group ACL entry
$ setfacl -m m:r        shared.txt          # mask = read only
$ getfacl shared.txt
# file: shared.txt
# owner: alice
# group: alice
user::rw-
user:alice:rw-                     #effective:rw-
group::r-
group:staff:r-                     #effective:r-
mask::r-
other::r-
```
**Explanation:** The mask (`m:r`) forces the union of all group entries (`group::r-` and `group:staff:r-`) to be AND‑ed with `r-`, resulting in effective `r-` for both the owning group and the `staff` group. Without the mask, `staff` would have inherited the owning group’s `rw-` (if the file were group‑writable).

### Example 3: sudoers Policy and Timestamp
**Goal:** Allow user `deploy` to restart `nginx` without a password, but require a password for any other command.  
**Edit `/etc/sudoers.d/deploy_nginx` (using `visudo`):**
```nginx
deploy ALL=(root) NOPASSWD: /usr/sbin/systemctl restart nginx
deploy ALL=(root) PASSWD: ALL
```
**Test:**
```bash
$ sudo -u deploy -v   # refresh timestamp, will prompt for password
[sudo] password for deploy: ******
$ sudo -u deploy systemctl restart nginx   # no password prompt
$ sudo -u deploy ls /root                  # password required again
```
**Why:** The first line matches the exact command path with `NOPASSWD`; the second line is a catch‑all that requires authentication. The timestamp file is updated after the `-v` validation, so the `restart` command runs without prompting if executed within the timeout window.

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---------|--------------|----------------|
| **Assuming `chmod` affects ACLs** | Running `chmod` only modifies the low‑9‑bit mode; existing ACL entries remain unchanged. | A file may appear to have permissive mode bits (`755`) while an ACL still restricts a specific user, leading to confusing “access denied” errors. |
| **Ignoring the ACL mask** | Adding a user ACE with `rwx` but leaving the mask at `r--` results in that user getting only read access. | The mask limits the effective permissions of all named user and group entries; forgetting to adjust it yields over‑privileged or under‑privileged outcomes. |
| **Using `sudo -i` to run a single command** | `sudo -i` launches a login shell as root, inheriting root’s environment; subsequent commands run in that shell without re‑checking sudoers. | If the shell is left open, any user with access to the terminal gains unrestricted root until the shell exits, violating least‑privilege. |
| **Believing that `chgrp` changes the file’s owning group for ACL evaluation** | `chgrp` updates `i_gid`, but ACL entries that explicitly name a group (`ACL_GROUP`) still require the entry’s `e_id` to match the requester’s GID, not the file’s owning group. | In shared directories where a specific group (e.g., `devops`) needs access, merely changing the owning group won’t help unless an ACL entry for that group exists or the mask permits it. |
| **Setting a overly permissive umask (e.g., `000`) and relying on `chmod` later** | Files are created with `666` (or `777` for dirs) then `chmod` reduces permissions; there is a race window where other users can read/write the file before `chmod` runs. | On multi‑user systems, this race can expose sensitive data (e.g., temporary keys) to unintended readers. The correct approach is to set an appropriate umask upfront. |

## Exercises
### Easy
1. **Mode bits:** Create a file `test.txt`. Use `chmod` to set its mode to `020` (write‑only for owner). Verify with `stat -c "%a %n" test.txt`. Then try to read it as your user and note the error.  
2. **Basic ACL:** Create a directory `acldir`. Give user `guest` read and execute access via `setfacl -m u:guest:rx acldir`. Use `getfacl` to confirm, then `su - guest -c "ls -ld acldir"` to verify access.

### Medium
3. **Umask effect:** Set `umask 0027`. Create a file `f1` and a directory `d1`. Check their default modes with `stat`. Explain why the file got `640` and the directory `750`.  
4. **sudoers NOPASSWD:** Add a line to `/etc/sudoers.d/` allowing your user to run `/bin/df` without a password. Test with `sudo df -h`. Then attempt `sudo ls /root` and confirm you are prompted for a password.

### Hard
5. **C program – raw syscalls:** Write a C program that:
   - Opens or creates a file `perm_test.bin` with mode `0640` using the `openat` syscall (`O_CREAT|O_WRONLY`).
   - Calls `fchmod` to change the mode to `0660`.
   - Retrieves the file’s ACL via `getxattr` (`system.posix_acl_access`) and prints each ACE in human‑readable form.
   - Modifies the ACL to add an entry for UID `1000` (your user) with `rw` using `setxattr`.
   - Compile and run as a regular user, then verify with `getfacl` and `strace`.
6. **ACL mask calculation:** Given a file with mode `0640` and ACL entries:  
   - `user::rw-`  
   - `user:alice:rwx`  
   - `group::r--`  
   - `group:staff:rwx`  
   - `mask::rwx`  
   - `other::---`  
   Compute the effective permissions for alice and for a process whose supplementary GIDs include the staff GID. Show your work using bitwise operations.  
7. **sudo timestamp timeout:** Reduce sudo’s timestamp timeout to 30 seconds by editing `/etc/sudoers.d/` (`Defaults timestamp_timeout=0.5`). Verify that after authenticating, you have exactly 30 seconds to run another sudo command without a password, and that after 31 seconds you are prompted again.

## Linux Connection
### VFS Permission Checking
- **Source:** `fs/namei.c` – function `inode_permission(const struct inode *inode, int mask, unsigned int flags)`.  
- **Key data:** `inode->i_mode` (mode_t), `inode->i_uid`, `inode->i_gid`.  
- **ACL retrieval:** `generic_get_acl(struct inode *inode, int type)` → `get_xattr(&init_user_ns, inode, POSIX_ACL_XATTR_ACCESS, …)`.

### Syscall Wrappers
```c
/* change mode bits */
int chmod(const char *pathname, mode_t mode);
/* change mode bits of an open file descriptor */
int fchmod(int fd, mode_t mode);

/* POSIX ACL via extended attributes */
ssize_t getxattr(const char *path, const char *name,
                 void *value, size_t size);
ssize_t setxattr(const char *path, const char *name,
                 const void *value, size_t size, int flags);
```
The VFS forwards these to the filesystem’s `setattr`/`getxattr` implementations (e.g., ext4’s `ext4_setattr`).

### Sudo Internals
- **Binary:** `/usr/bin/sudo` (set‑uid root, mode `4755`).  
- **Policy file:** `/etc/sudoers` (parsed by `sudoers.so` plugin).  
- **PAM module:** `/usr/lib/x86_64-linux-gnu/security/pam_sudo.so`.  
- **Timestamp directory:** `/var/run/sudo/ts/` (owned by root, mode `0755`). Each user gets a file named after their username; its mtime is checked against `timestamp_timeout`.

### Relevant Kernel Structures
```c
struct inode {
    umode_t    i_mode;   // permission bits + file type
    kuid_t     i_uid;    // owner user ID (mapped to global uid)
    kgid_t     i_gid;    // owner group ID
    /* … */
};
struct posix_ace {
    __le16 e_tag;
    __le32 e_id;
    __le16 e_perm;
};
```
**Why this matters:** Understanding these structures lets you interpret `stat` output, debug permission denials via `dmesg` (look for `audit:` messages), and develop security tools that manipulate ACLs at the syscall level rather than relying solely on wrapper commands.

## Why This Matters
Mastering the interplay of mode bits, ACLs, and sudo equips you to enforce the principle of least privilege on a multi‑user Linux system. Mode bits give you a fast, immutable baseline; ACLs let you carve out precise exceptions without proliferating Unix groups; sudo provides a controlled, auditable gateway to root privileges. Together they form the foundation for:

* **Container security:** Namespaces inherit the caller’s credentials; incorrect mode bits or overly permissive ACLs become immediate escape vectors.  
* **Service hardening:** Daemons that drop privileges (via `setuid`) rely on correct file ownership and mode to read configuration or bind to privileged ports.  
* **Shared workloads:** Projects like build farms or scientific clusters use ACLs to give specific users or groups access to intermediate data while keeping the broader system locked down.  
* **Compliance:** Audits often require evidence that privileged commands are restricted via sudoers and that file permissions follow a documented policy (e.g., PCI‑DSS requirement 7).  

By internalizing the mechanisms—how the VFS evaluates mode bits first, then falls back to POSIX ACLs, and how sudo brokers root access through a set‑uid binary and policy file—you gain the ability to diagnose permission failures accurately, harden systems against privilege escalation, and automate administrative tasks safely. This knowledge is not just theoretical; it translates directly into reliable, secure Linux administration.
