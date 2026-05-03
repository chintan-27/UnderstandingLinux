---
id: 118
title: "Security subsystems"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

The root/non-root binary was never a security model — it was an administrative convenience that hardened into an assumption. The actual problem is that privilege is not a scalar: binding to port 80, loading a kernel module, and rebooting the machine are unrelated operations that happen to share the same gate. The mechanisms covered here attack four distinct failure modes:

- **Capabilities** eliminate the false equivalence between "needs one privilege" and "gets all privileges"
- **LSM** allows site-specific mandatory policy to be enforced inside the kernel, where userspace cannot bypass it
- **seccomp** reduces the kernel's attack surface visible to a process to exactly the syscalls it legitimately needs
- **Audit** ensures that security-relevant events are recorded before control returns to the process that caused them — making after-the-fact suppression structurally impossible

Each mechanism is independently useful. Each has a different threat model. None of them replaces the others.

---

## Core Concepts

### Capabilities: Decomposing Root

The kernel does not check `euid == 0` directly for most privileged operations. It checks whether a specific capability bit is set in the calling thread's *effective* set. A process running as root with all capabilities dropped is, for most purposes, unprivileged. A process running as a normal user with `CAP_NET_BIND_SERVICE` can bind port 80 without touching anything else.

Every thread carries three capability sets, each a bitmask over 64 defined capabilities:

| Set | Semantics |
|---|---|
| `cap_permitted` | Ceiling: the process can never raise effective above this |
| `cap_effective` | Active: checked at each privileged operation |
| `cap_inheritable` | Survives `execve()` into the new image's permitted set, subject to the new binary's inheritable set |

The asymmetry that matters: dropping a capability from `cap_permitted` is permanent and unrecoverable for that process. This is the mechanism privilege-separated daemons use — acquire what you need during initialization, call `capset()` to shrink the permitted set, and the subsequent attack surface is structurally bounded even if the process is compromised.

File capabilities (`setcap`/`getcap`, stored in the `security.capability` xattr) allow non-root binaries to receive specific capabilities at `execve()` without being setuid root. The kernel computes the new capability sets during `execve()` using:

$$P'_{\text{permitted}} = (P_{\text{inheritable}} \cap F_{\text{inheritable}}) \cup (F_{\text{permitted}} \cap P_{\text{bounding}})$$

$$P'_{\text{effective}} = \begin{cases} P'_{\text{permitted}} & \text{if } F_{\text{effective}} \text{ is set} \\ \emptyset & \text{otherwise} \end{cases}$$

where $P$ is the parent's sets and $F$ is the file's capability xattr. The bounding set acts as a hard ceiling for the entire process tree.

### LSM: Mandatory Policy Inside the Kernel

LSM hooks are function-pointer tables registered at boot time, placed inside the kernel at points where access decisions are made. The placement rule is precise: hooks sit *after* DAC (discretionary access control — the standard `rwx` permission bits and ACLs) and return denial means the operation is refused regardless of what DAC said. An LSM cannot grant access; it can only add denials on top of DAC.

This is enforced structurally, not by convention. In `inode_permission()`, `generic_permission()` (DAC) runs first; if it returns non-zero, the LSM hook is never called. An LSM that wanted to grant extra access would have to modify DAC, which it cannot do through the hook interface.

The hook table (`security_hook_heads`) covers around 250 operations: file open, `mmap`, socket creation, signal delivery, `ptrace` attachment, capability checks, key management, and more. Multiple LSMs can stack since Linux 4.17 — the result of a chain is the logical AND of all verdicts (any denial wins).

### seccomp: Reducing Kernel Attack Surface

The kernel's syscall interface is the only boundary between userspace and kernel code. Every reachable syscall is potential attack surface against kernel vulnerabilities. seccomp lets a process install a BPF program that intercepts every syscall *before* the kernel dispatches it. The program receives a `seccomp_data` struct and returns a verdict.

The critical design property: the BPF verifier guarantees the filter terminates (no loops, bounded instruction count), so the overhead is bounded — typically a few dozen nanoseconds per syscall. The filter runs in kernel context but is written and loaded from userspace, and once loaded, it cannot be removed or weakened, only augmented with additional restrictive filters.

Containers and sandboxes use seccomp as a defense-in-depth layer: even if a container escapes its namespace, a seccomp filter that forbids `mount()`, `ptrace()`, and `clone()` with certain flags substantially limits what an attacker can do with that escape.

### Audit: Pre-Return Record Guarantees

The audit subsystem writes records to a kernel ring buffer *before* the syscall returns to userspace. This is not a subtle point: it means a process cannot complete a privileged operation and then prevent its logging. The record exists in the kernel buffer before the process has an opportunity to act on the result.

`auditd` drains records from the buffer via a netlink socket. The kernel also writes records synchronously if the buffer is full and the audit failure mode is set to `AUDIT_FAIL_PANIC` — the machine halts rather than lose records. For forensic environments this is configurable via `/proc/sys/kernel/audit*` and `auditctl`.

---

## How It Works

### Capability Check Path

```c
/* fs/exec.c — simplified execve capability computation */
SYSCALL_DEFINE4(reboot, int, magic1, int, magic2, unsigned int, cmd,
                void __user *, arg)
{
    if (!capable(CAP_SYS_REBOOT))
        return -EPERM;
    /* ... */
}
```

`capable(cap)` calls `ns_capable(current_user_ns(), cap)`, which calls `security_capable()`. That function first calls `cap_capable()` from `commoncap.c` to test the raw bit, then invokes the active LSM's `capable` hook. The LSM therefore gets a veto even on an operation the raw capability set would permit — SELinux's type enforcement can deny `CAP_SYS_MODULE` to a labeled process that possesses it.

The bitmask arithmetic for a 64-capability set split across two 32-bit words:

```c
/* include/uapi/linux/capability.h */
#define CAP_TO_INDEX(x)   ((x) >> 5)        /* word 0 or word 1 */
#define CAP_TO_MASK(x)    (1u << ((x) & 31))

/* kernel/capability.c */
static inline bool cap_raised(kernel_cap_t c, int flag)
{
    return (c.cap[CAP_TO_INDEX(flag)] & CAP_TO_MASK(flag)) != 0;
}
```

For capability $i$, the word index is $\lfloor i/32 \rfloor$ and the bit position within that word is $i \bmod 32$:

$$\text{has\_cap}(i) = \left( \texttt{cap.cap}\!\left[\left\lfloor i/32 \right\rfloor\right] \gg (i \bmod 32) \right) \mathbin{\&} 1$$

Selected capabilities and their exact scope:

| Capability | Unlocks |
|---|---|
| `CAP_SYS_REBOOT` | `reboot(2)` |
| `CAP_NET_BIND_SERVICE` | `bind(2)` to ports $< 1024$ |
| `CAP_SYS_MODULE` | `init_module(2)`, `delete_module(2)` |
| `CAP_DAC_OVERRIDE` | Bypass `rwx` checks on any file |
| `CAP_SETUID` | Arbitrary `setuid(2)` / `setgid(2)` |
| `CAP_SYS_PTRACE` | `ptrace(2)` any process |
| `CAP_SYS_ADMIN` | Catch-all for ~50 operations; treat as root equivalent |

`CAP_SYS_ADMIN` deserves special mention: it covers `mount`, `pivot_root`, namespace operations, `bpf()` in some contexts, and dozens more. Granting it to a container is functionally equivalent to granting root. Any policy that hands out `CAP_SYS_ADMIN` to reduce a permission error has almost certainly made a mistake.

### LSM Hook Call Chain

The call path from `open(2)` to SELinux:

```
sys_openat()
  → do_filp_open()
    → may_open()
      → inode_permission()
          → generic_permission()          /* DAC: uid/gid/rwx/ACL */
          → security_inode_permission()   /* LSM dispatch */
              → selinux_inode_permission()
                  → avc_has_perm()        /* SELinux AVC cache lookup */
```

The `security_inode_permission` call expands to an indirect call through `security_hook_heads.inode_permission`, which is a linked list of registered hooks. Each hook returns 0 (allow) or a negative errno (deny). The first non-zero return short-circuits the chain.

AppArmor stores its policy as pathname-based rules in `/etc/apparmor.d/` and enforces them at the `vfs_open` hook. SELinux stores policy as type-enforcement rules compiled into a binary at `/sys/fs/selinux/policy` and enforces them via security context labels stored in file xattrs (`security.selinux`). They address different threat models: AppArmor is easier to write profiles for; SELinux provides stronger separation because labels travel with objects rather than being path-dependent.

### seccomp-BPF Internals

The filter input is a fixed-size struct, read-only to the BPF program:

```
