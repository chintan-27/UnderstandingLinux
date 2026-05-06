---
id: 87
title: "Protection and security"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
### Subjects, Objects, and Access Control
In an operating system a **subject** (process or thread) attempts to perform an operation on an **object** (file, device, socket, etc.). Protection is the mechanism that decides whether the subject may carry out the requested operation. The decision is based on an **access control model** that binds a set of **permissions** (read, write, execute, etc.) to each subject‑object pair.

A common model is the **access control matrix**: rows = subjects, columns = objects, each cell holds the permissions granted. Storing the full matrix is infeasible, so operating systems derive permissions from **credentials** attached to the subject and **mode bits** stored in the object's metadata.

### Unix‑style Permission Bits
Each file’s mode (`st_mode`) contains nine permission bits, grouped as three triples:
- **owner** (user who owns the file)
- **group** (users in the file’s owning group)
- **others** (all remaining users)

For each triple the bits encode:
- **read** (`r`) → value 4
- **write** (`w`) → value 2
- **execute** (`x`) → value 1

The numeric mode is the sum of the three values for each class, expressed in octal.  
Formally, for a class *c*:
$$
\text{mode}_c = 4\cdot r_c + 2\cdot w_c + 1\cdot x_c
$$
and the full 9‑bit field is:
$$
\text{mode} = (\text{mode}_{\text{owner}} << 6) \;|\; (\text{mode}_{\text{group}} << 3) \;|\; \text{mode}_{\text{others}}
$$
Example: `-rw-r--r--` → owner = 6, group = 4, others = 4 → octal `0644`.

### UID, GID, and Groups
Every process has a **real UID** (`ruid`), **effective UID** (`euid`), **saved set‑UID** (`suid`), and analogous GID fields. The kernel uses `euid` (and `egid`) for most permission checks; `ruid` is used for signaling and for restoring privileges after a `setuid()` call. Supplemental group IDs (up to `NGROUPS_MAX`, typically 65536) broaden access without changing the primary GID.

### Least Privilege and Separation of Duty
Protection mechanisms exist to enforce the **principle of least privilege**: a subject should possess only the permissions necessary to complete its task. Violations lead to privilege escalation, data corruption, or covert channels. Separation of duty (e.g., splitting audit logs from the audited subsystem) reduces the impact of a compromised subject.

---

## How It Works
### Permission Checking in the VFS Layer
When a process invokes a system call such as `open()` or `stat()`, the Virtual File System (VFS) obtains the target inode’s `i_mode`. The check proceeds as follows (simplified pseudocode from the Linux kernel):

```c
/* inode->i_mode contains the 9-bit mode */
umode_t mode = inode->i_mode;
kuid_t   uid = inode->i_uid;
kgid_t   gid = inode->i_gid;

/* Determine which triple applies */
if (uid_eq(current_euid(), uid))
        mode &= S_IRWXU;          /* owner bits */
else if (in_egroup_p(gid))       /* gid or any supplemental gid matches */
        mode &= S_IRWXG;          /* group bits */
else
        mode &= S_IRWXO;          /* others bits */

/* Translate requested operation to mask */
int acc = 0;
if (want_read)  acc |= S_IRUSR;
if (want_write) acc |= S_IWUSR;
if (want_exec)  acc |= S_IXUSR;

/* Permission granted if all requested bits are present */
return (mode & acc) == acc;
```

**Why this works:**  
- The `euid` (or any supplemental `gid`) uniquely identifies the subject’s authority.  
- Masking isolates the relevant triple, ensuring that a user cannot inadvertently gain permissions intended for another class.  
- The final comparison guarantees that *all* requested bits are satisfied; missing any bit results in `EACCES`.

### SetUID, SetGID, and Sticky Bit
Beyond the basic triples, three special bits modify interpretation:
- **SetUID (S_ISUID)** → when set on an executable, the process’ `euid` becomes the file’s owner `uid` at exec time.  
- **SetGID (S_ISGID)** → on exec, `egid` becomes the file’s owner `gid`; on a directory, new files inherit the directory’s `gid`.  
- **Sticky (S_ISVTX)** → on a directory, only the file’s owner, directory owner, or root may delete/rename files inside (prevents `/tmp` abuse).

These bits enable **privileged helper programs** (e.g., `/usr/bin/passwd`) to temporarily elevate a subject’s authority to perform a specific, controlled operation.

### Authentication: Passwords, Salt, and Hashing
Linux stores user account data in `/etc/passwd` (public) and `/etc/shadow` (restricted). The shadow entry contains:
```
username:encrypted_password:last_change:min:max:warn:inactive:expire:flag
```
The `encrypted_password` field is the output of a **cryptographic hash** (traditionally DES‑based `crypt`, now usually SHA‑256 or SHA‑512 with a salt).  

Given a salt `s` and password `p`, the stored hash is:
$$
H = \text{hash}(s \, \| \, p)
$$
During login, the supplied password is hashed with the same salt; equality of the resulting hash to the stored value authenticates the user.

**Why salt?**  
- Prevents pre‑computed rainbow‑table attacks.  
- Ensures identical passwords yield different hashes, thwarting offline comparison.

Pluggable Authentication Modules (PAM) sit between applications and the actual authentication stack (`pam_unix`, `pam_ssh`, `pam_google_authenticator`, etc.), allowing stacking of multiple factors (something you know, have, or are) without modifying the application.

---

## Worked Examples
### Example 1: Computing and Changing Mode Bits
**Scenario:** Create a file with `umask 0022`, then change its mode to allow the group to write.

```bash
# 1. Check current umask
$ umask
0022

# 2. Create a file; the kernel applies umask to the requested mode 0666
$ touch example.txt
$ stat -c "%a %n" example.txt
644 example.txt   # 0666 & ~0022 = 0644

# 3. Verify symbolic layout
$ ls -l example.txt
-rw-r--r-- 1 user user 0 Sep 26 12:34 example.txt

# 4. Add write permission for the group (symbolic)
$ chmod g+w example.txt
$ stat -c "%a %n" example.txt
664 example.txt   # 0644 | 0020 = 0664

# 5. Same change using octal notation
$ chmod 664 example.txt
$ stat -c "%a %n" example.txt
664 example.txt
```
**Explanation:**  
- The requested mode for `touch` is `0666` (rw‑rw‑rw‑).  
- The umask `0022` removes write for group and others (`~0022 = 7755` in binary).  
- Resulting mode: `0666 & 0755 = 0644`.  
- Adding `g+w` sets the group write bit (`0020`), yielding `0664`.

### Example 2: SetUID Root Password Change
**Scenario:** Observe how `/usr/bin/passwd` uses the setuid bit to let a normal user update `/etc/shadow`.

```bash
# 1. Examine the binary’s mode and ownership
$ ls -l /usr/bin/passwd
-rwsr-xr-x 1 root root 67896 Sep 10 08:12 /usr/bin/passwd

# Note the 's' in the owner execute position → setuid bit set.

# 2. Run as a regular user; the process gains root euid temporarily
$ id -u
1000
$ /usr/bin/passwd
Changing password for user1.
(current) UNIX password: 
...
passwd: password updated successfully

# 3. Verify that the effective UID changed during execution (via ps)
$ ps -o pid,user,euser,comm -C passwd
  PID USER   EUSER COMMAND
 1234 user1  root  passwd
```
**Why this is safe:**  
- The executable is owned by root and only root can modify it (mode `755`).  
- The setuid bit restricts the elevation to the exact purpose of the program (updating authentication tokens).  
- The program drops privileges as soon as the operation finishes (calls `setuid(getuid())`).

### Example 3: Authenticating with PAM and Verifying a Shadow Hash
**Scenario:** Compute the SHA‑512 crypt of a password and compare it to the shadow entry.

```bash
# 1. Get the shadow line for user 'testuser'
$ sudo grep ^testuser: /etc/shadow
testuser:$6$VxYzAbCd$E9F2G3H4I5J6K7L8M9N0O1P2Q3R4S5T6U7V8W9X0Y1Z2a3b4c5d6e7f8g9h0i:19678:0:99999:7:::

# Fields: username:$6$salt$hash:...
# $6$ indicates SHA‑512 crypt.

# 2. Extract salt and hash
$ SALT=$(sudo grep ^testuser: /etc/shadow | cut -d'$' -f3)
$ HASHED=$(sudo grep ^testuser: /etc/shadow | cut -d'$' -f4)

# 3. Compute hash of a candidate password
$ PASSWORD="CorrectHorseBatteryStaple"
$ COMPUTED=$(mkpasswd -m sha-512 "$PASSWORD" -S "$SALT")
$ echo "$COMPUTED"
$6$VxYzAbCd$E9F2G3H4I5J6K7L8M9N0O1P2Q3R4S5T6U7V8W9X0Y1Z2a3b4c5d6e7f8g9h0i

# 4. Comparison (they match → authentication succeeds)
$ [ "$COMPUTED" = "$SALT:$HASHED" ] && echo "Authenticated" || echo "Fail"
Authenticated
```
**Explanation:**  
- `mkpasswd` (from `whois` package) applies the crypt algorithm with the supplied salt.  
- Equality of the derived string to the shadow field confirms the password is correct without ever storing the plaintext password.

---

## Common Mistakes
### Mistake 1: Confusing Real and Effective UID
**What:** A script runs `setuid(0)` to gain root privileges but later forgets to revert to the original UID before performing unprivileged work.  
**Why it’s dangerous:** Any subsequently opened file or network socket inherits root privileges, expanding the attack surface. If the script is compromised, an attacker gains unrestricted root access.  
**Fix:** Use `seteuid()` to toggle the effective UID, or save the real UID and restore it with `setreuid(ruid, -1)` after the privileged section. Always check the return value and log failures.

### Mistake 2: World‑Writable Directory Without Sticky Bit
**What:** Creating a shared directory `chmod 777 /shared` for temporary files.  
**Why it’s dangerous:** Any user can delete or rename any other user’s files, leading to data loss or a denial‑of‑service attack (e.g., deleting another user’s PID file to crash a daemon).  
**Fix:** Set the sticky bit: `chmod 1777 /shared`. The kernel then permits unlink/rename only if the user owns the file, owns the directory, or is root.

### Mistake 3: Weak Password Hash (MD5) in Legacy Systems
**What:** Using an `/etc/shadow` entry that begins with `$1$` (MD5‑based crypt).  
**Why it’s dangerous:** MD5 is vulnerable to collision attacks and can be brute‑forced at rates exceeding billions of hashes per second on modern GPUs.  
**Fix:** Migration to SHA‑256 (`$5$`) or SHA‑512 (`$6$`) with a sufficiently long salt (≥16 bits) and consider using `yescrypt` or `argon2` via PAM modules (`pam_unix` with `rounds=` option). Update passwords via `passwd` after changing `/etc/pam.d/common-password`.

### Mistake 4: TOCTOU Race in Permission Checks
**What:** A privileged program checks `access(path, W_OK)` then opens the file with `open(path, O_WRONLY)`. Between the check and the open, an attacker replaces `path` with a symlink to a sensitive file.  
**Why it’s dangerous:** The program unintentionally writes to the attacker‑chosen target, possibly corrupting system data or elevating privileges.  
**Fix:** Use `openat()` with the `O_NOFOLLOW` flag and perform the operation on the file descriptor returned by `open()`. Alternatively, open the file first, then use `fstat()` to verify the mode matches expectations.

---

## Exercises
### Easy – Permission Manipulation
1. Create a file `easy.txt`.  
2. Set its mode so that the owner can read/write, the group can read, and others have no access (`0640`).  
3. Verify with `stat -c "%a %n" easy.txt`.  

### Medium – Group Collaboration & SetGID Directory
1. Create a group `proj`.  
2. Add your user to that group (`sudo usermod -aG proj $USER`).  
3. Make a directory `/srv/proj` owned by root:proj with mode `2775` (setgid + rwxrwxr-x).  
4. Create a file inside `/srv/proj` and confirm that its group owner is `proj` regardless of who created it.  

### Hard – Privilege Dropping in a Setuid Root Binary
1. Write a small C program `droppriv.c` that:
   - Calls `setuid(geteuid())` to drop to real UID after performing a single privileged action (e.g., creating a file in `/root`).  
   - Prints the real, effective, and saved UIDs before and after the drop.  
2. Compile: `gcc -Wall -O2 droppriv.c -o droppriv`.  
3. Change ownership to root and set the setuid bit: `sudo chown root:root droppriv && sudo chmod u+s droppriv`.  
4. Run as a normal user and observe that the program can create the file in `/root` *only* during the privileged window, then drops back to your UID.  
5. Discuss what would happen if the `setuid()` call were omitted or placed after the file creation.

### Challenge – PAM Two‑Factor Authentication
1. Install `libpam-google-authenticator`.  
2. Run `google-authenticator` to generate a secret and QR code for your user.  
3. Edit `/etc/pam.d/common-auth` to include `auth required pam_google_authenticator.so nullok` before `pam_unix`.  
4. Attempt to log in via SSH; verify that both password and verification code are required.  
5. Document the failure modes (e.g., losing the token, clock skew) and how to recover.

---

## Linux Connection
### Kernel Subsystems Involved
| Concept | Kernel Subsystem / Data Structure | Key Interfaces |
|---------|-----------------------------------|----------------|
| Credentials | `struct cred` (in `include/linux/cred.h`) – fields `uid`, `gid`, `suid`, `sgid`, `euid`, `egid`, `fsuid`, `fsgid`, `cap_inheritable`, `cap_permitted`, `cap_effective` | `get_current_cred()`, `commit_creds()`, `prepare_creds()` |
| Permission Checking | VFS layer (`fs/namei.c`, `inode.c`) – functions `inode_permission()`, `generic_permission()` | `may_open()`, `may_create()` |
| SetUID/SetGID Binary Exec | `fs/exec.c` – `do_execve_common()`, `prepare_binprm()` | `bprm->cred->euid = inode->i_uid` when `S_ISUID` set |
| PAM | User‑space library (`libpam`) – modules loaded via `/etc/pam.d/*` | `pam_start()`, `pam_authenticate()`, `pam_setcred()` |
| Shadow Utilities | `libshadow` – functions `getspnam()`, `putspent()`, `shadow_auth()` | `getspnam()`, `crypt()` |
| SELinux | Security server (`security/selinux/`) – policy enforcement via hooks (`selinux_inode_permission()`, `selinux_task_setuid()`) | `getenforce()`, `sestatus`, `avcstat` |
| AppArmor | Profiles in `/etc/apparmor.d/` – enforced via LSM hooks (`apparmor_inode_permission()`) | `aa-status`, `apparmor_parser` |
| Audit Subsystem | `auditctl`, `auditd` – logs syscalls, credential changes, file accesses | `auditctl -w /etc/shadow -p wa -k shadow_changes` |

### Concrete Commands and Code
**Inspecting a process’ credentials:**
```bash
$ cat /proc/$$/status | grep -E 'Uid:|Gid:'
Uid:    1000    1000    1000    1000
Gid:    1000    1000    1000    1000
```
Fields: real, effective, saved, filesystem UID/GID.

**Viewing SELinux context of a file:**
```bash
$ ls -Z /etc/shadow
-rw-r----- root root system_u:object_r:shadow_t:s0 /etc/shadow
```

**Running a setuid binary and observing UID change:**
```bash
$ id -u
1000
$ /usr/bin/passwd -S user1
user1 L 09/26/2024 0 99999 7 -1 (Password locked.)
$ ps -o pid,user,euser,comm -C passwd
  PID USER   EUSER COMMAND
  5678 user1  root  passwd
```

**Applying an ACL (beyond traditional mode bits):**
```bash
$ setfacl -m u:alice:rwX /srv/shared
$ getfacl /srv/shared
# file: srv/shared
# owner: root
# group: proj
user::rwx
user:alice:rwx        #effective:rwx
group::rwx
mask::rwx
other::rwx
```

**Checking for nosuid,nodev,noexec mounts:**
```bash
$ mount | grep tmpfs
tmpfs on /run type tmpfs (rw,nosuid,nodev,noexec,size=65536k)
```
These mount options disable setuid‑root execution, device node creation, and binary execution from the filesystem—common hardening steps for temporary filesystems.

---

## Why This Matters
Protection and security are not optional add‑ons; they are the foundation that lets multiple users, services, and workloads coexist on a single machine without compromising confidentiality, integrity, or availability. The Linux kernel enforces these principles through a layered approach:

1. **Least‑privilege credentials** (`struct cred`) ensure a process only holds the rights it absolutely needs.  
2. **Mode bits, ACLs, and capabilities** provide fine‑grained, check‑able authorizations that the VFS consults on every file operation.  
3. **Setuid/setgid binaries** enable controlled, temporary elevation—exemplified by `/usr/bin/passwd`—while the kernel’s credential switching prevents lasting privilege creep.  
4. **Authentication mechanisms** (password hashing with salt, PAM, hardware tokens) bind a secret to an identity, making impersonation computationally infeasible without the secret.  
5. **LSM frameworks** (SELinux, AppArmor) add mandatory access controls that can confine even privileged processes, limiting the blast radius of a vulnerability.  
6. **Audit and mounting options** give administrators visibility and the ability to reduce the attack surface (e.g., `nosuid` on `/tmp`).  

Understanding *why* each check exists—rooted in the need to prevent unauthorized reading, writing, or execution—allows system administrators and kernel developers to reason about trade‑offs, design secure services, and diagnose failures when the protection model is violated. Mastery of these concepts translates directly into building systems that resist privilege escalation, data leakage, and denial‑of‑service attacks, which is precisely the payoff promised by this module.
