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

## Why This Matters

Without hardware-enforced privilege separation, any process could overwrite kernel memory, any user could delete any file, and a buggy program could compromise the entire system. The protection mechanisms covered here are not software conventions — they are enforced by the CPU itself. When they fail (a setuid binary with an exploitable buffer overflow, a kernel with a broken capability check), the attacker doesn't "break the rules": they exploit a gap in enforcement. Understanding how these mechanisms are constructed is what lets you reason about where gaps can appear.

---

## Core Concepts

### Privilege Levels (Rings)

x86 hardware defines four privilege rings, but Linux uses only two: **ring 0** (kernel mode) and **ring 3** (user mode). In ring 3, instructions that touch hardware state — loading a new page table base into `CR3`, disabling interrupts with `cli`, writing to model-specific registers — raise a general protection fault. The CPU checks the current privilege level (CPL, stored in the low two bits of the `CS` segment register) before executing any such instruction.

The only legitimate way from ring 3 to ring 0 is through a controlled gate. On x86-64, this is the `syscall` instruction, which transfers control to the address stored in the `LSTAR` MSR — an address the kernel writes at boot and the user process cannot modify (writing MSRs is itself a privileged operation). This creates a ratchet: user code can request kernel services, but it cannot choose where the kernel begins executing or what it does with its privilege.

### Users and the UID Model

The kernel tracks identity as integers. Every process has a set of credentials — UIDs and GIDs — stored in a `struct cred` attached to its `task_struct`. Every filesystem object has an owner UID, owner GID, and permission bitmask stored in its inode. All access decisions reduce to arithmetic comparisons between these numbers.

UID 0 (root) is not a special account in any magical sense. It is the literal integer 0, and the kernel's access-check code has explicit `== 0` tests that skip most permission enforcement. This means root privilege is binary at the kernel level: you either have UID 0 or you don't. The capabilities system (discussed below) is the modern attempt to subdivide this.

`/etc/passwd` and `/etc/shadow` are **userspace** constructs. The kernel never reads them. Programs like `login` and `sshd` read them, verify credentials, and then call `setuid()`/`setgid()` to assign the resulting UID to the process. From that point forward, the kernel only sees numbers.

### File Permissions

Each inode stores a 12-bit mode field. The low 9 bits encode read/write/execute for three categories — owner, group, other:

$$\underbrace{r\,w\,x}_{\text{owner (bits 8–6)}}\ \underbrace{r\,w\,x}_{\text{group (bits 5–3)}}\ \underbrace{r\,w\,x}_{\text{other (bits 2–0)}}$$

The upper 3 bits are the setuid bit ($2^{11}$), setgid bit ($2^{10}$), and sticky bit ($2^9$).

The kernel evaluates permission categories **exclusively, in order**: owner bits apply if `cred->uid == inode->i_uid`, group bits apply else if the process's GID or any supplementary GID matches `inode->i_gid`, other bits apply otherwise. The first match wins — there is no OR-ing across categories. A file with mode `0640` owned by `alice:devs` gives alice read+write, members of `devs` read-only, and everyone else nothing. If alice is *also* in `devs`, the group bits are irrelevant to her — she matched the owner category first.

For directories, the semantics shift: `r` lets you call `getdents()` (list entries), `x` lets you resolve names within the directory (needed for any path traversal through it), and `w` lets you create or unlink entries. A directory with mode `0311` is traversable and writable but not listable — you can access files if you know their names, but you can't enumerate them.

### The setuid Bit

Normally `execve()` preserves the caller's EUID into the new process. When the executed file has the setuid bit set, the kernel instead sets the new process's EUID to the file's owner UID. This is implemented directly in `fs/exec.c` during `bprm_fill_uid()`.

This is how `passwd(1)` works: `/usr/bin/passwd` is owned by root with mode `4755`. Any user can execute it; when they do, the resulting process has EUID 0 and can open `/etc/shadow` (mode `0640`, owned `root:shadow`) for writing.

The security invariant a setuid binary must maintain: it receives untrusted input (arguments, environment, file descriptors) with privileged credentials. Any path from untrusted input to privileged action that isn't explicitly validated is a vulnerability. Classic attacks include passing malicious `PATH` entries (the binary calls `system()` which calls `sh` which finds a trojan), symlink races in `/tmp`, and signal handling that interrupts privileged operations mid-way.

### Linux Capabilities

Root-or-nothing is too coarse for real systems. Linux implements **capabilities** — a decomposition of root privilege into ~40 distinct units. A few important ones:

| Capability | What it permits |
|---|---|
| `CAP_NET_BIND_SERVICE` | Bind to ports below 1024 |
| `CAP_SYS_PTRACE` | Trace arbitrary processes |
| `CAP_DAC_OVERRIDE` | Bypass file permission checks |
| `CAP_SYS_ADMIN` | Broad administrative operations (effectively root) |

A process has three capability sets: **permitted** (what it can have), **effective** (what the kernel checks), and **inheritable** (what can be passed across `execve`). A service that only needs `CAP_NET_BIND_SERVICE` can drop all other capabilities at startup — even if it's later compromised, the attacker can't leverage root privilege it never had.

### Authentication Basics

Authentication is strictly a userspace problem. `login`, `sshd`, `sudo`, and `su` all verify identity by reading `/etc/shadow`, contacting an LDAP server, or delegating to PAM. What they produce — the only thing the kernel cares about — is a UID/GID set established via `setuid()`/`setgid()`/`setgroups()` before the user's shell or process is exec'd.

**PAM** (`/etc/pam.d/`) lets you stack authentication modules. A PAM configuration for `sshd` might require a password check, then an OTP check, then enforce time-of-day restrictions — each as a separate module. The calling program (`sshd`) only sees pass/fail; it doesn't know which module fired.

---

## How It Works

### The Trap Mechanism for System Calls

On x86-64, `syscall` does the following atomically in hardware:

1. Saves `RIP` → `RCX`, saves `RFLAGS` → `R11`
2. Clears `RFLAGS` bits specified in `FMASK` MSR (masking interrupts during transition)
3. Loads `CS`/`SS` from `STAR` MSR (switching to kernel selectors, CPL → 0)
4. Jumps to `LSTAR` MSR (the kernel's `entry_SYSCALL_64` handler)

The kernel then saves all registers to the process's kernel stack, reads the syscall number from `RAX`, indexes into `sys_call_table[]`, and dispatches. Arguments are in `RDI`, `RSI`, `RDX`, `R10`, `R8`, `R9` (note: `R10` not `RCX` because `syscall` clobbers `RCX`).

```asm
; x86-64: write(1, buf, len) — raw syscall
section .data
    msg db "hello", 0x0a

section .text
global _start
_start:
    mov     rax, 1          ; SYS_write
    mov     rdi, 1          ; fd = stdout
    lea     rsi, [rel msg]  ; buffer address
    mov     rdx, 6          ; byte count
    syscall                 ; CPL 3 → CPL 0 → CPL 3

    mov     rax, 60         ; SYS_exit
    xor     rdi, rdi
    syscall
```

The address `LSTAR` points to is set once by the kernel during boot via `wrmsrl(MSR_LSTAR, (unsigned long)entry_SYSCALL_64)`. A process in ring 3 cannot call `wrmsr` (privileged instruction), so it cannot redirect this pointer.

### Permission Check in the Kernel

The kernel's `inode_permission()` in `fs/namei.c` calls down to `generic_permission()`, which implements the logic below. This runs entirely in kernel mode — by the time these comparisons execute, the user process cannot interfere:

```c
/* Simplified from linux/fs/namei.c: generic_permission() */
int check_permission(struct inode *inode, int mask, const struct cred *cred)
{
    umode_t mode = inode->i_mode;

    /* CAP_DAC_OVERRIDE bypasses permission bits (not ownership) */
    if (capable(CAP_DAC_OVERRIDE))
        return 0;

    if (uid_eq(cred->fsuid, inode->i_uid))
        mode >>= 6;             /* apply owner bits */
    else if (in_group_p(inode->i_gid))
        mode >>= 3;             /* apply group bits */
    /* else: other bits remain in position 2-0 */

    if ((mode & mask & 0007) == mask)
        return 0;

    return -EACCES;
}
```

The `mask` argument encodes what access is being requested: `MAY_READ` (4), `MAY_WRITE` (2), `MAY_EXEC` (1). The check `(mode & mask & 0007) == mask` verifies that every requested
