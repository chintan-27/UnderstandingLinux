---
id: 178
title: "Kernel security"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

The kernel has no peer process above it to enforce constraints on its own behavior — every privilege escalation attack ultimately aims to execute code in ring 0, because from there an attacker can rewrite credentials, silence audit subsystems, install persistent hooks, and exfiltrate arbitrary memory. Without layered controls, the entire security model collapses to: "trust every syscall from every process." The four mechanisms covered here — module signing, LSMs, seccomp, and namespaces — are independent because they block at different points in the call path. An attacker who bypasses seccomp still faces LSM policy. An attacker who escapes a namespace still faces DAC and LSM. Defeating all four independently is the goal; each layer imposes a separate cost.

---

## Core Concepts

### Kernel Module Trust

A loaded kernel module executes in ring 0 with no sandbox, no memory separation from the rest of the kernel, and no capability check after the `init_module` syscall returns. The module's `init` function runs directly in kernel context. This means a module can call `kallsyms_lookup_name` to find any kernel symbol, overwrite function pointers in `ftrace` or `kprobes` dispatch tables, or patch the syscall table directly.

Module signing closes the loading gate. At kernel build time, `scripts/sign-file` embeds a public key into the kernel image (stored in the `.builtin_trusted_keys` keyring). Every module must carry a signature block appended after the ELF sections. Before `do_init_module` is called, `module_sig_check` verifies the signature against the kernel keyring. If verification fails, behavior depends on the config:

- `CONFIG_MODULE_SIG=y` — unsigned modules produce a warning but load
- `CONFIG_MODULE_SIG_FORCE=y` — unsigned modules are hard-rejected
- Lockdown mode (`CONFIG_SECURITY_LOCKDOWN_LSM=y`) — even root cannot load unsigned modules, because loading an unsigned module is treated as a direct integrity violation

The signing key lives at `/proc/keys` (the `.builtin_trusted_keys` keyring) and can be inspected:

```bash
# List keys in the built-in kernel keyring
keyctl show %:.builtin_trusted_keys

# Check whether a module carries a valid signature
modinfo --field=sig_id /lib/modules/$(uname -r)/kernel/drivers/net/dummy.ko

# Attempt to load a stripped (unsigned) module — will fail with EKEYREJECTED
# if MODULE_SIG_FORCE is set
insmod /tmp/unsigned.ko
```

The reason `lockdown` mode matters separately: `CAP_SYS_MODULE` grants the ability to load modules, but lockdown overrides even that capability at the LSM layer — root with the right capability still cannot bypass lockdown. This is the practical demonstration that LSMs sit above capability checks.

### Linux Security Modules (LSMs)

DAC (discretionary access control) — uid/gid ownership and `rwx` bits — is controlled by the resource owner and can be changed by that owner or root. It is discretionary precisely because it is delegable. LSMs impose mandatory access control: a central policy that neither the resource owner nor root can override at runtime without changing the policy itself.

LSMs work by registering function pointers into a statically allocated array (`security_hook_list`) at boot. The kernel source contains over 200 `security_*` call sites spread across `fs/`, `net/`, `kernel/`, and `ipc/`. Each call site is a hook. At every hook, the kernel iterates the registered handlers; the first non-zero return value terminates the chain and propagates the error to the caller.

The critical ordering: DAC checks run first, then capability checks, then LSM hooks. This means an LSM can deny operations that passed DAC and capability checks — including operations attempted by root. The policy authority is the LSM, not the process credential.

SELinux and AppArmor differ in their policy model:

| | SELinux | AppArmor |
|---|---|---|
| Policy anchor | Label on every object (inode, socket, process) | File path (profile) |
| Config location | `/etc/selinux/` | `/etc/apparmor.d/` |
| Inspect process context | `ps -eZ` | `aa-status` |
| Inspect file label | `ls -Z` | `ls` (path is the label) |
| Default stance | Deny all not explicitly permitted | Allow all not explicitly denied (in complain mode) |

```bash
# SELinux: see the type label on a file
ls -Z /etc/shadow
# system_u:object_r:shadow_t:s0 /etc/shadow

# SELinux: see the domain your shell is running in
id -Z
# unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023

# AppArmor: list loaded profiles and their enforcement status
aa-status

# AppArmor: run a command under a specific profile
aa-exec -p /usr/bin/curl -- curl https://example.com

# Check which LSMs are active in the running kernel
cat /sys/kernel/security/lsm
# lockdown,capability,landlock,yama,apparmor
```

The file `/sys/kernel/security/lsm` is the authoritative runtime answer; the kernel selected the LSM stack at boot based on `CONFIG_LSM` and the `lsm=` kernel parameter.

### seccomp (Secure Computing Mode)

Every syscall entry is a potential attack vector. A process that can call `ptrace` can attach to any process it owns and inspect or modify its memory. A process that can call `kexec_load` can replace the running kernel. A process that can call `perf_event_open` with certain arguments can read arbitrary kernel memory via side-channel. seccomp eliminates these vectors by reducing the syscall surface to exactly what the process needs.

The mechanism: `prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog)` attaches a cBPF program to the calling thread. On every syscall entry — in the architecture's syscall entry path, before dispatch — the kernel evaluates the filter. The filter operates on a `struct seccomp_data`:

```c
/* linux/seccomp.h */
struct seccomp_data {
    int   nr;                   /* syscall number */
    __u32 arch;                 /* AUDIT_ARCH_* value */
    __u64 instruction_pointer;  /* at syscall entry */
    __u64 args[6];              /* raw arguments */
};
```

The filter is a function $F : \mathbb{Z} \times \mathbb{Z}^6 \to \text{verdict}$, where the verdict encodes both the action and an optional 16-bit data value:

$$\text{verdict} = \underbrace{(\text{action} \ll 16)}_{\text{upper 16 bits}} \mid \underbrace{\text{data}}_{\text{lower 16 bits}}$$

The actions in priority order (highest wins when multiple filters are stacked):

| Action | Effect |
|---|---|
| `SECCOMP_RET_KILL_PROCESS` | Terminate entire thread group immediately |
| `SECCOMP_RET_KILL` | Terminate calling thread |
| `SECCOMP_RET_TRAP` | Deliver `SIGSYS` to the process |
| `SECCOMP_RET_ERRNO` | Return `-data` as errno, syscall never runs |
| `SECCOMP_RET_TRACE` | Notify a `ptrace` tracer (used by container runtimes) |
| `SECCOMP_RET_LOG` | Allow, but log via audit |
| `SECCOMP_RET_ALLOW` | Allow |

A minimal filter that permits only `read`, `write`, `exit`, and `exit_group`:

```c
#include <linux/seccomp.h>
#include <linux/filter.h>
#include <linux/audit.h>
#include <sys/prctl.h>
#include <stddef.h>

struct sock_filter filter[] = {
    /* Verify architecture first — syscall numbers differ by ABI */
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS,
             offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),

    /* Load syscall number and match against allowlist */
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS,
             offsetof(struct seccomp_data, nr)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_read,       3, 0),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_write,      2, 0),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_exit,       1, 0),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_exit_group, 0, 1),

    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
};

struct sock_fprog prog = {
    .len    = sizeof(filter) / sizeof(filter[0]),
    .filter = filter,
};

/* Without NO_NEW_PRIVS, a non-privileged process cannot install a filter
   that would apply to a setuid child — the kernel rejects the prctl */
prctl(PR_SET_NO_NEW_PRIVS,
