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

## Core Concepts
### Capabilities
Capabilities split the traditional superuser privilege into distinct bits that can be independently enabled or disabled per thread. In the kernel each thread’s credentials (`struct cred`) contain three capability sets:
- **Permitted** (`cap_permitted`) – the upper bound of capabilities the thread may assume.
- **Effective** (`cap_effective`) – the capabilities actually checked for permission.
- **Inheritable** (`cap_inheritable`) – capabilities that may be passed to child threads after an `execve`.

Each set is a `kernel_cap_t`, i.e. an array of two `__u32` words (64 bits total). The kernel defines `_CAP_LAST_CAP` (currently 62) so the bitmap size is `$_CAP_LAST_CAP+1 = 63$` bits.  
A capability `c` is tested by the macro:

```c
#define capable(c) \
    (cap_issubset((1ULL << (c)), current_cred()->cap_effective))
```

which expands to a bitwise test:

```
(current_cred()->cap_eff.cap[0] & (1U << (c))) != 0
```

If the bit is set, the kernel proceeds; otherwise it returns `-EPERM`.  
Capabilities are inherited across `fork()` unchanged, but across `execve()` the **permitted** set is intersected with the thread’s **bounding** set (`cap_bset`) and the **inheritable** set, while the **effective** set is cleared unless the file being executed has a file‑system capability (`cap_effective` and `cap_permitted` xattr) that raises them.

### Linux Security Module (LSM) Framework
The LSM framework inserts a series of hook points into security‑sensitive kernel operations (e.g., `inode_permission`, `file_open`, `task_alloc`). Each hook is a function pointer in a `struct security_hook_heads`. When a hook is invoked, the kernel walks the list of registered LSMs and calls each module’s implementation. The first non‑zero return value (typically `-EACCES` or `-EPERM`) stops the chain and causes the operation to fail; a return of `0` allows the next module to be consulted.  

Registration occurs via `register_security(&ops)` where `ops` is a `struct security_operations` filled with the module’s hook functions. The core kernel provides a `security_ops` default that simply returns `0`. Real LSMs (SELinux, AppArmor, Smack, TOMOYO, Yama) replace or augment these hooks.  

Importantly, LSM checks happen **after** pathname resolution and **after** the basic capability check, but **before** the actual operation (e.g., before the VFS `open` code touches the inode). This ordering lets an LSM enforce policies based on resolved paths, credentials, or even the executable’s binary signature.

### Seccomp
Seccomp (secure compute mode) filters system calls at the very entry point of the `syscall` instruction, before the kernel dispatches to the syscall table. Two modes exist:

| Mode | Description |
|------|-------------|
| `SECCOMP_MODE_STRICT` | Only `read`, `write`, `exit`, `sigreturn` allowed; any other syscall triggers `SIGKILL`. |
| `SECCOMP_MODE_FILTER` | A Berkeley Packet Filter (BPF) program is attached via `prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog)`. The BPF program reads the syscall number (`ARG0`) and may allow, kill, trap, return an errno, or trace the call. |

A BPF program consists of `struct sock_filter` instructions:

```c
struct sock_filter {
    __u16 code;   // opcode
    __u8  jt;     // jump true
    __u8  jf;     // jump false
    __u32 k;      // constant
};
```

The classic filter layout for allowing a set `{sys1, sys2, …}` is:

```
0:  LD   W   ABS   offsetof(struct seccomp_data, nr)
1:  JEQ  k   0    1   ; if nr == sys1 -> allow
2:  JEQ  k   0    1   ; if nr == sys2 -> allow
...
N:  RET  K   SECCOMP_RET_KILL   ; default action
```

Each `JEQ` adds two instructions; the kernel limits a filter to `BPF_MAXINSNS = 4096`.  
The return value determines the outcome:
- `SECCOMP_RET_ALLOW` – syscall proceeds.
- `SECCOMP_RET_KILL` – task dies without core dump.
- `SECCOMP_RET_TRAP` – sends `SIGSYS` and invokes user‑space tracer if `PTRACE_SECCOMP_GET_FILTER` is active.
- `SECCOMP_RET_ERRNO` – returns a user‑specified `errno`.
- `SECCOMP_RET_TRACE` – notifies a tracer via `PTRACE_EVENT_SECCOMP`.

Seccomp is inherited across `fork()` and preserved across `execve()` unless the thread has the `no_new_privs` flag set, which prevents gaining new privileges that could bypass the filter.

### Audit Basics
The audit subsystem generates immutable records of security‑relevant events. The kernel produces audit messages via `audit_log()` family functions, which format a netlink message (`NLMSG_TYPE_AUDIT`) consumed by the userspace daemon `auditd`.  

An audit rule has the syntax:

```
-a <action>,<list> -F <field>=<value> -S <syscall>
```

where `<action>` is one of `always`, `never`, `exit`, `enter`; `<list>` is typically `exit` for syscall exit events. Fields can be:
- `arch` – `b32` or `b64` (personality)
- `uid`, `gid`, `auid` (login UID)
- `pid`, `pid`
- `path` – for pathname‑based filters (requires `auditd` to watch the inode)
- `msgtype` – to filter specific message types.

Rules are loaded with `auditctl` and stored in the kernel’s rule table; they can be inspected with `auditctl -l`. Events are written to `/var/log/audit/audit.log` (or via `ausearch`/`aureport` for querying).  

The audit subsystem adds negligible overhead when no rules match; each matching rule incurs a hash table lookup and netlink message copy, typically a few microseconds.

## How It Works
1. **Capability check** – When a syscall such as `open()` is invoked, the VFS first calls `capable()` (or `file_capable()` for file‑system caps) using the caller’s effective capability set. If the required bit is missing, the syscall returns `-EPERM` *before* any filesystem or LSM code runs.  
   *Why?* Capabilities are a lightweight, credential‑based test that avoids expensive path resolution when the caller lacks the fundamental privilege.

2. **LSM invocation** – If the capability check passes, the kernel proceeds to pathname resolution (dentry lookup, permission bits, ACLs). After the inode is obtained, each LSM hook relevant to the operation (e.g., `security_inode_permission` for `open`, `security_file_open` for the file struct) is called in registration order. The first denying hook aborts the call.  
   *Why?* LSMs need the resolved inode to make decisions based on object labels, paths, or executable attributes, which are unavailable at the capability‑only stage.

3. **Seccomp filtering** – Regardless of capability or LSM outcome, the syscall entry path invokes `secure_computing()` (via `sysenter`/`sysexit` or `int 0x80` stub). This function runs the attached BPF filter on the raw syscall number. If the filter returns `SECCOMP_RET_KILL` or `SECCOMP_RET_TRAP`, the syscall never reaches the kernel tables.  
   *Why?* Seccomp is designed as a *system‑call firewall* that operates before any kernel work, providing a low‑overhead way to reduce the attack surface of a sandboxed process.

4. **Audit logging** – If the syscall survives all prior checks and completes (return value ≥ 0 or a specific error that is configured to be audited), the audit subsystem checks its rule table. Matching rules trigger `audit_log_syscall_exit()`, which constructs a record containing: `pid`, `uid`, `syscall`, `arguments`, `return value`, `errno`, and optional fields like `path` or `msg`. The record is sent over netlink to `auditd`.  
   *Why?* Auditing is intentionally placed last so that only *successful* (or specifically failed) operations that have passed all security checks are recorded, reducing noise while still capturing policy‑relevant events.

## Worked Examples
### Example 1: Dropping All Capabilities Except `CAP_DAC_READ_SEARCH`
`CAP_DAC_READ_SEARCH` allows a process to bypass file read permission and directory search checks. The following program drops every capability, then restores only this one, and attempts to open `/etc/shadow` for reading (which should succeed) and for writing (which should fail with `EACCES`).

```c
/* cap_drop.c – compile with: gcc -Wall cap_drop.c -lcap -o cap_drop */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <sys/capability.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>

int main(void)
{
    /* 1. Retrieve current capability sets */
    cap_t caps = cap_get_proc();
    if (!caps) {
        perror("cap_get_proc");
        return 1;
    }

    /* 2. Clear all sets */
    if (cap_set_flag(caps, CAP_PERMITTED, 0, NULL, CAP_CLEAR) < 0 ||
        cap_set_flag(caps, CAP_EFFECTIVE, 0, NULL, CAP_CLEAR) < 0 ||
        cap_set_flag(caps, CAP_INHERITABLE, 0, NULL, CAP_CLEAR) < 0) {
        perror("cap_set_flag CLEAR");
        cap_free(caps);
        return 1;
    }

    /* 3. Raise CAP_DAC_READ_SESW in effective and permitted */
    cap_value_t cap = CAP_DAC_READ_SEARCH;
    if (cap_set_flag(caps, CAP_EFFECTIVE, 1, &cap, CAP_SET) < 0 ||
        cap_set_flag(caps, CAP_PERMITTED, 1, &cap, CAP_SET) < 0) {
        perror("cap_set_flag SET");
        cap_free(caps);
        return 1;
    }

    /* 4. Apply the modified set */
    if (cap_set_proc(caps) < 0) {
        perror("cap_set_proc");
        cap_free(caps);
        return 1;
    }
    cap_free(caps);

    /* 5. Test read access to /etc/shadow (should succeed) */
    int fd = open("/etc/shadow", O_RDONLY);
    if (fd < 0) {
        perror("open O_RDONLY");
        return 1;
    }
    printf("Read opened /etc/shadow, fd=%d\n", fd);
    close(fd);

    /* 6. Test write access (should fail with EACCES) */
    fd = open("/etc/shadow", O_WRONLY);
    if (fd < 0) {
        if (errno == EACCES)
            printf("Write correctly denied: %s\n", strerror(errno));
        else
            perror("open O_WRONLY unexpected");
        return 1;
    }
    fprintf(stderr, "ERROR: Write succeeded despite missing CAP_DAC_WRITE\n");
    return 0;
}
```

**Explanation of numbers**  
- `CAP_DAC_READ_SEARCH` is defined as bit 3 in `<linux/capability.h>` (value 3).  
- The macro `capable(CAP_DAC_READ_SEARCH)` expands to a test of `current_cred()->cap_eff.cap[0] & (1U << 3)`.  
- After `cap_set_proc()`, `/proc/$$/status` shows:  

```
CapInh: 0000000000000000
CapPrm: 0000000000000004
CapEff: 0000000000000004
CapBnd: 00000000000003ff   /* inherited bounding set unchanged */
```

The permitted and effective bits show only bit 2 set (since bits are zero‑indexed, bit 2 = 4). The process can therefore read any file but cannot write to privileged ones.

### Example 2: Seccomp Filter Allowing Only `openat`, `read`, `write`, `exit`
This example uses the `libseccomp` library to construct a BPF filter that kills the process on any syscall not in the whitelist.

```c
/* seccomp_allow.c – compile with: gcc -Wall seccomp_allow.c -lseccomp -o seccomp_allow */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <seccomp.h>
#include <sys/prctl.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>

int main(void)
{
    /* 1. No new privs prevents setuid binaries from gaining extra rights */
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) < 0) {
        perror("prctl NO_NEW_PRIVS");
        return 1;
    }

    /* 2. Start with a default action of KILL */
    scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_KILL);
    if (!ctx) {
        perror("seccomp_init");
        return 1;
    }

    /* 3. Add rules for allowed syscalls */
    if (seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(openat), 0) < 0 ||
        seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0) < 0 ||
        seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0) < 0 ||
        seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit_group), 0) < 0 ||
        seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit), 0) < 0) {
        perror("seccomp_rule_add");
        seccomp_release(ctx);
        return 1;
    }

    /* 4. Load the filter into the kernel */
    if (seccomp_load(ctx) < 0) {
        perror("seccomp_load");
        seccomp_release(ctx);
        return 1;
    }
    seccomp_release(ctx);

    /* 5. Test allowed syscalls */
    int fd = openat(AT_FDCWD, "/tmp/seccomp_test", O_CREAT|O_RDWR, 0600);
    if (fd < 0) {
        perror("openat");
        return 1;
    }
    const char msg[] = "hello\n";
    ssize_t n = write(fd, msg, sizeof(msg)-1);
    if (n != sizeof(msg)-1) {
        perror("write");
        return 1;
    }
    lseek(fd, 0, SEEK_SET);
    char buf[16];
    n = read(fd, buf, sizeof(buf)-1);
    if (n < 0) {
        perror("read");
        return 1;
    }
    buf[n] = '\0';
    printf("Read back: %s", buf);
    close(fd);
    unlink("/tmp/seccomp_test");

    /* 6. Test a disallowed syscall – should trigger SIGSYS */
    /* We intentionally call mkdir to see the fault */
    if (mkdir("/tmp/should_fail", 0700) != -1) {
        perror("mkdir unexpectedly succeeded");
        return 1;
    }
    if (errno == ENOSYS) {
        /* This would happen if the syscall number is invalid – not our case */
        fprintf(stderr, "mkdir returned ENOSYS (unexpected)\n");
        return 1;
    }
    /* If we reach here, the process was killed by SIGSYS and we won't continue */
    /* In practice the parent would see a SIGSYS; for demo we just exit */
    return 0;
}
```

**Running and observing the fault**

```bash
$ ./seccomp_allow
Read back: hello
$ echo $?
0
$ ./seccomp_allow 2>&1; echo $?
mkdir: Cannot create directory ‘/tmp/should_fail’: Permission denied
131
```

Exit status 131 indicates termination by `SIGSYS` (128 + 31). The `strace` output confirms:

```
$ strace -f -e trace=%seccomp ./seccomp_allow
...
seccomp_load(0x7fffd6c6c6a0, 8, 0x7fffd6c6c680) = 0
...
openat(AT_FDCWD, "/tmp/seccomp_test", O_CREAT|O_RDWR, 0600) = 3
write(3, "hello\n", 6) = 6
read(3, 0x7fffd6c6c5af, 15) = 5
--- SIGSYS {si_signo=SIGSYS, si_code=SYS_SECCOMP, si_callo=..., si_arch=...} ---
+++ killed by SIGSYS +++
```

The BPF filter prevented `mkdir` (syscall 83) from reaching the kernel, delivering a `SIGSYS` instead.

## Common Mistakes
| # | Mistake | Why it’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Assuming dropping capabilities also clears the ambient set** | The ambient capability set (`CAP_AMBIENT`) is a separate kernel attribute that can raise capabilities during `execve` even if the permitted set is empty. It must be cleared with `prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_CLEAR)` or by setting `no_new_privs`. | A process may unexpectedly regain a dropped capability after executing a binary with file‑caps, leading to privilege escalation. |
| 2 | **Using seccomp without `PR_SET_NO_NEW_PRIVS`** | If a thread can gain new privileges (e.g., via a setuid binary), the seccomp filter is **not** inherited across the `execve` boundary; the new program runs with the default kernel policy. | A sandboxed process can escape by executing a privileged helper that bypasses the filter. |
| 3 | **Believing the first LSM *allow* wins** | LSM hooks are chained; the first non‑zero (denying) return stops the chain and causes failure. An early `return 0` merely lets the next module decide. | Misconfiguring a policy‑module to return `0` too early can unintentionally permit actions that a later restrictive module would have blocked. |
| 4 | **Writing audit rules without filtering on `auid` or `pid`** | Without `-F auid>=1000` (or similar) the kernel logs every syscall from kernel threads and privileged daemons, quickly filling the log and obscuring relevant events. | Audit logs become unusable due to volume; administrators may disable auditing altogether, losing visibility. |
| 5 | **Confusing file‑system capabilities with thread capabilities** | File‑system capabilities (`getfattr -n security.capability`) are stored as xattr on executables and raise the *permitted* and *effective* sets **only** for that
