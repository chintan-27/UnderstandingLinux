---
id: 181
title: "Authentication and authorization"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When a process requests a resource, the kernel must answer two questions: *who is asking*, and *are they allowed*. These are distinct. Authentication without authorization means any verified identity gets everything. Authorization without authentication means policy is enforced against claims no one verified. Nearly every privilege escalation in Linux history is a failure at one of these two layers — a setuid binary that trusts an environment variable, a PAM stack with a misconfigured control flag, a capability left ambient when it shouldn't be.

---

## Core Concepts

### Identity: UIDs, GIDs, and `struct cred`

The kernel does not know "alice". It knows UID 1000. Every process carries a `struct cred` (defined in `include/linux/cred.h`) containing:

```c
struct cred {
    kuid_t   uid;    /* real UID — who owns the process */
    kgid_t   gid;    /* real GID */
    kuid_t   suid;   /* saved UID — allows re-escalation */
    kgid_t   sgid;   /* saved GID */
    kuid_t   euid;   /* effective UID — used in permission checks */
    kgid_t   egid;   /* effective GID */
    struct group_info *group_info; /* supplementary groups */
    kernel_cap_t cap_effective;    /* currently usable capabilities */
    kernel_cap_t cap_permitted;    /* ceiling on cap_effective */
    kernel_cap_t cap_inheritable;  /* survives execve */
    /* ... */
};
```

The **real UID** records who launched the process. The **effective UID** is what the kernel actually checks against file permissions and capability gates. The **saved UID** is why a setuid program can drop to the caller's UID and then reclaim privilege without keeping `euid=0` for its entire lifetime — `seteuid(getuid())` drops privilege, `seteuid(saved_uid)` reclaims it, and both are legal precisely because the saved value is held in the credential structure.

The setuid bit causes the kernel to set `euid` to the *file owner's* UID at `execve()` time. Without it, `euid` would equal the caller's `uid`, and `passwd` could never open `/etc/shadow` (owned by root, mode `0640`).

### Passwords and `/etc/shadow`

The stored credential is never the password — it is a salted hash:

$$\text{stored} = H(\text{salt} \,\|\, \text{password})$$

The salt is randomly generated per-user and stored in plaintext alongside the hash. Its effect: identical passwords produce different stored values, invalidating precomputed rainbow tables. An attacker cannot amortize hash inversions across users — each account requires independent work.

`/etc/shadow` is readable only by root (or group `shadow` on some distributions). `/etc/passwd` remains world-readable for UID→name mapping, but contains only `x` in the password field. This split happened because world-readable `/etc/passwd` with embedded hashes enables offline dictionary attacks by any local user.

The stored string is self-describing:

```
$6$rounds=5000$saltsaltsalt$<88-char-base64-hash>
```

- `$6$` → SHA-512 crypt  
- `$y$` → yescrypt (current default on modern distributions)  
- `$2b$` → bcrypt  

The cost/rounds parameter is the asymmetric lever. If one hash evaluation takes time $t$, an attacker testing $k$ candidates pays $k \cdot t$. Doubling rounds doubles attacker cost while adding a sub-millisecond delay to a single legitimate login. The relationship is linear, not exponential — which is why modern schemes like yescrypt also incorporate **memory hardness**: the work function requires $M$ bytes of RAM, so GPU-parallel attacks are limited by memory bandwidth, not just compute:

$$\text{attacker cost} = k \cdot t \cdot \frac{M}{\text{GPU memory bandwidth}}$$

Inspect your system's defaults:

```bash
grep -E '^ENCRYPT_METHOD|^SHA_CRYPT_MIN_ROUNDS' /etc/login.defs
# Show the hash prefix for an existing account (requires root)
sudo getent shadow root | cut -d: -f2 | cut -c1-10
```

### PAM: Pluggable Authentication Modules

Without PAM, every binary (`login`, `sshd`, `sudo`, `su`) would embed its own credential-checking logic. Adding TOTP to a system would require patching each binary independently. PAM interposes a configuration-driven dispatch layer between the application and the mechanism.

PAM defines four **management groups**:

| Group | Purpose |
|---|---|
| `auth` | Verify claimed identity |
| `account` | Enforce account policy (expired, locked, time restrictions) |
| `password` | Update stored credentials |
| `session` | Establish/teardown session environment (mount home, set limits) |

Each group runs a stack of modules. The **control flag** determines how each module's result propagates:

- `required` — failure is fatal, but the remaining stack still executes. This prevents an attacker from distinguishing *which* module rejected them by measuring the response time.
- `requisite` — failure is immediately fatal; the stack aborts. Use this when later modules would be harmful to run (e.g., don't prompt for TOTP if the password was wrong — it wastes the time-window).
- `sufficient` — success short-circuits the remaining stack; prior `required` failures are ignored.
- `optional` — result only affects the outcome if no other module in the stack produces a decision.

The distinction between `required` and `requisite` is a deliberate security/usability tradeoff. `required` sacrifices the information leak; `requisite` sacrifices the timing protection in favor of halting early.

### TOTP and Session Tokens

A token is any credential that proves possession of a secret without transmitting it directly. TOTP (RFC 6238) derives a short-lived code from a shared secret $K$ and the current time:

$$\text{OTP}(K, t) = \text{Truncate}\!\left(\text{HMAC-SHA1}\!\left(K,\; \left\lfloor \frac{t}{30} \right\rfloor\right)\right)$$

The 30-second window is the quantization interval. Neither side transmits $K$ — only the derived 6-digit value crosses the wire, and it is only valid for one interval. The security property: an intercepted code cannot be replayed after its window closes, and the secret cannot be recovered from the code (HMAC preimage resistance).

After initial authentication, re-authenticating every operation would be expensive and poor UX. The system issues a **session credential** — an SSH session key, a Kerberos ticket, or a signed session cookie — that the kernel or application can verify cheaply without re-running the full auth stack.

### Authorization: DAC, Capabilities, and MAC

Linux uses three layered authorization mechanisms that are checked in order:

**DAC (Discretionary Access Control)** — the inode stores owner UID, owner GID, and a 12-bit permission mask. The kernel's check in `fs/namei.c` reduces to:

```
if (euid == 0)            → historically bypass (now mitigated by capabilities)
if (euid == inode.uid)    → apply owner bits
if (egid in groups && egid == inode.gid) → apply group bits
else                      → apply other bits
```

The "discretionary" in DAC means the file owner controls the policy. This is its weakness: a misconfigured permission is the owner's fault and no other mechanism corrects it.

**Capabilities** decompose the monolithic `euid==0` check into ~40 discrete privileges. A process does not need `euid=0` to bind port 80 — it needs `CAP_NET_BIND_SERVICE`. It does not need `euid=0` to call `ptrace` — it needs `CAP_SYS_PTRACE`. This is least privilege made concrete at the kernel level.

Each process has three capability sets:
- `cap_permitted`: the ceiling — a process cannot have a capability in `cap_effective` that is not in `cap_permitted`
- `cap_effective`: the set the kernel checks
- `cap_inheritable`: what survives across `execve`

```bash
# Show capabilities of the current shell
cat /proc/$$/status | grep Cap
# Decode the hex bitmask
capsh --decode=0000000000000000

# Show file capabilities (no setuid needed for these)
getcap /usr/bin/ping
# ping now uses CAP_NET_RAW via file capabilities instead of setuid
```

**MAC (Mandatory Access Control)** via SELinux or AppArmor enforces policy the file owner *cannot* override. A process with `euid=0` and all capabilities can still be blocked by SELinux type enforcement. MAC labels persist on inodes (`security.selinux` xattr) and are checked after DAC in `security/selinux/hooks.c`.

```bash
# Show SELinux context of a file
ls -Z /etc/shadow
# Show the current process context
cat /proc/$$/attr/current
```

---

## How It Works

### The `execve` + Setuid Path

The kernel processes a setuid binary in `fs/exec.c` → `security/commoncap.c`:

1. `execve()` opens the file, reads the inode  
2. `cap_bprm_set_creds()` checks `S_ISUID` on the inode mode  
3. If set, `bprm->cred->euid` is set to `inode->i_uid`  
4. The saved UID (`suid`) is set to the new `euid`  
5. The credential is committed to the new task before the program's `main()` runs  

```c
/* Simplified from security/commoncap.c */
if (!uid_eq(bprm->cred->euid, current_cred()->uid) ||
    !gid_eq(bprm->cred->egid, current_cred()->gid)) {
    /* setuid/setgid transition: clear dangerous env vars, etc. */
    bprm->per_clear |= PER_CLEAR_
