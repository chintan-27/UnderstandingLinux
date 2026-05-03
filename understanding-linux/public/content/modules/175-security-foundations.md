---
id: 175
title: "Security foundations"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every privilege escalation in Linux history traces back to a violation of one or more of three principles: something trusted that shouldn't have been, a surface exposed that didn't need to be, or a process given power it didn't require. The kernel enforces security boundaries in hardware — privilege rings, memory protection, syscall interposition — but those mechanisms only work when software is designed to use them correctly. A misconfigured capability set, a missing seccomp filter, or a container with access to the host's network namespace can each independently undo everything the hardware provides. Understanding these foundations lets you reason about *why* a configuration is broken, not just that a scanner flagged it.

## Core Concepts

### Threat Model

A threat model is a structured answer to three questions: who is the adversary, what do they want, and what paths exist to get it? Without it, security effort is misallocated — you harden the wrong boundary. The threat model for a public API server (adversary: remote unauthenticated, goal: RCE or data exfiltration, vectors: HTTP parsing, dependency CVEs) differs from one for a multi-tenant container runtime (adversary: malicious tenant, goal: host escape, vectors: syscall interface, namespace misconfigurations, kernel bugs).

A minimal threat model specifies:

1. **Assets** — what must be protected (credential files, kernel memory, IPC channels between services)
2. **Adversaries** — who is trying to reach those assets and from which trust boundary (remote unauthenticated, local unprivileged user UID 1000, compromised container with default capabilities)
3. **Attack vectors** — the reachable paths (open TCP sockets, exposed syscalls, SUID binaries, shared kernel objects like `/proc`)

### Attack Surface

The attack surface is the complete set of entry points through which an adversary can interact with a system. Every open socket, every reachable syscall, every SUID binary, every loaded kernel module — these are all surface. The key relationship: more surface means more code that must be correct under adversarial input, which means a larger probability of an exploitable path. This is not linear — each additional entry point potentially interacts with every existing one.

Reducing surface means removing entry points that have no justified use in the current deployment. A process that doesn't need network access should hold no file descriptors to network sockets. A container that doesn't need raw packet access should not have `CAP_NET_RAW` — which it gets by default in Docker unless you explicitly drop it.

### Least Privilege

Least privilege means every component — process, user, kernel module, container — holds exactly the capabilities required for its function. The reason this bounds damage: when a component is compromised, the attacker inherits only what that component was authorized to do. A web server worker with no write access to `/etc` and no `CAP_SYS_ADMIN` cannot overwrite `/etc/passwd` or remount filesystems even when fully controlled by an attacker.

Linux implements least privilege through layered mechanisms that operate at different granularities:

- **UID/GID** — file and process ownership at the DAC layer
- **POSIX capabilities** — decomposed root privileges, per-process
- **seccomp BPF** — per-process syscall allowlist enforced in kernel
- **LSM (SELinux/AppArmor)** — mandatory access control beyond DAC
- **Namespaces** — isolation of kernel resources (PID, network, mount, user, IPC, UTS, cgroup, time)

These are not redundant. A process can have the right UID but the wrong capability. A container can have the right capabilities but the wrong seccomp profile. Defense in depth means an attacker must defeat multiple independent mechanisms.

### Trust Boundaries

A trust boundary is a point where data or control passes between components with different privilege levels. The canonical example is the user space / kernel space boundary: user programs cannot execute privileged instructions directly; they must cross via the syscall interface, where the kernel controls the transition and validates the arguments. Other trust boundaries:

- Process-to-process over a Unix domain socket: the receiver should not trust the sender's claimed identity without verifying credentials via `SO_PEERCRED`
- Container-to-host: a Linux container shares the host kernel, so the syscall interface *is* the boundary — there is no hardware VM exit
- Guest-to-hypervisor: a VM exit occurs when the guest attempts a privileged operation; this is hardware-enforced

Vulnerabilities concentrate at trust boundaries because that is where one component's assumptions about another's behavior are most likely to be violated — input validation failures, confused deputy attacks, and TOCTOU races all exploit the gap between what one side expects and what the other provides.

## How It Works

### The Hardware Trust Boundary: Privilege Rings

x86-64 processors enforce privilege separation through protection rings. Linux uses two: ring 0 for the kernel and ring 3 for user processes. Rings 1 and 2 are unused. Privileged instructions — `HLT`, `LGDT`, `MOV CRn`, direct port I/O — fault immediately if executed from ring 3. The processor checks the Current Privilege Level (CPL), stored in the low two bits of the `CS` register. If `CPL != 0` and the instruction requires ring 0, the processor raises a General Protection Fault (`#GP`), which the kernel handles.

```
Ring 0: Kernel — page table control, interrupt management, I/O ports, MSR writes
Ring 1: Unused
Ring 2: Unused
Ring 3: User processes — no direct hardware access, no privileged instructions
```

When a user process needs a privileged operation it issues a syscall. On x86-64, the `syscall` instruction:

1. Saves `RIP` and `RFLAGS` into `RCX` and `R11`
2. Loads the kernel entry point from `MSR_LSTAR` into `RIP`
3. Switches `CPL` to 0
4. Transfers execution to `entry_SYSCALL_64` in `arch/x86/entry/entry_64.S`

This is a *mode switch* — the CPU changes privilege level. A *context switch* is separate: it occurs when the scheduler suspends one thread and resumes another, which requires saving and restoring the full task struct including `task_struct->thread` state. A blocking `read()` on a socket causes both: a mode switch into the kernel, then a context switch to another runnable thread while the current thread waits.

The cost of crossing the ring boundary:

$$\text{syscall overhead} \approx 100\text{–}300\ \text{ns on modern x86-64 (with Spectre mitigations)}$$

Before Spectre/Meltdown mitigations (KPTI, retpoline), a raw syscall round-trip was roughly $50\ \text{ns}$. KPTI flushes TLB entries on every user↔kernel transition because the kernel page table is no longer mapped in user space. The TLB miss cost on re-entry adds $50\text{–}150\ \text{ns}$ depending on working set size and cache state. This is why `io_uring` — which batches many I/O operations through a shared ring buffer, requiring only two syscalls (`io_uring_enter` or zero with kernel polling) for arbitrarily many operations — improves performance under high I/O rates.

### System Calls as Attack Surface

Linux exposes approximately 350 syscalls on x86-64, all reachable from any unprivileged process by default. Each executes at ring 0, parsing arguments that arrive from untrusted user space. The argument values are copied from the user-space stack into kernel memory via `copy_from_user()` — a bounds-checked copy — but the logic that processes those arguments must itself be correct. Historically:

- `ptrace()` — multiple privilege escalation CVEs due to incorrect permission checks
- `perf_event_open()` — CVE-2013-2094 (local root via `perf_swevent_overflow`)
- `keyctl()` — CVE-2016-0728 (reference count overflow to root)
- `clone()` / `unshare()` — user namespace bugs leading to host escape from containers

**seccomp BPF** reduces this surface by installing a per-process syscall filter. The filter is a BPF program that runs on every syscall entry, before the kernel dispatches to the syscall handler. The program receives a `seccomp_data` struct:

```c
struct seccomp_data {
    int   nr;                   /* syscall number */
    __u32 arch;                 /* AUDIT_ARCH_X86_64, etc. */
    __u64 instruction_pointer;  /* RIP at time of syscall */
    __u64 args[6];              /* syscall arguments */
};
```

The filter returns an action: `SECCOMP_RET_ALLOW`, `SECCOMP_RET_KILL_PROCESS`, `SECCOMP_RET_ERRNO`, or `SECCOMP_RET_TRAP`. A process that needs only `read`, `write`, `exit`, and `rt_sigreturn` can filter everything else to `SECCOMP_RET_KILL_PROCESS`. The 340+ syscall handlers that process never calls become unreachable code — they exit the attack surface entirely.

Installing a minimal filter in C:

```c
#include <linux/seccomp.h>
#include <linux/filter.h>
#include <linux/audit.h>
#include <sys/prctl.h>
#include <stddef.h>

/* BPF macros for seccomp — validate arch, then allow or kill */
struct sock_filter filter[] = {
    /* Validate architecture: reject non-x86-64 to prevent arch confusion */
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS,
             offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),

    /* Load syscall number */
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS,
             offsetof(struct seccomp_data, nr)),
