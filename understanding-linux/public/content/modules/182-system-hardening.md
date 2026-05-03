---
id: 182
title: "System hardening"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A Linux system running with default settings is optimized for functionality, not security. The kernel enforces privilege boundaries using hardware rings — user-mode code cannot directly touch hardware or other processes' memory — but that hardware enforcement only works if the software layer respects it. When a daemon runs as root because nobody bothered to drop privileges, when a known CVE sits unpatched because the update cycle is slow, when seccomp is absent so every syscall in the kernel is reachable, the CPU's ring enforcement becomes irrelevant. Hardening is the practice of systematically closing those gaps before an attacker or a misconfigured process closes them for you.

---

## Core Concepts

### Patching

When a CVE is published, two things exist simultaneously: the patch, and working exploit code. Every day a system runs an unpatched kernel is a day an attacker can use a known, documented technique against it. Kernel patches arrive through distribution security channels (`apt`, `dnf`) and via upstream stable releases at kernel.org. The kernel version you are running is not an abstract number — it determines exactly which CVEs are open on that machine.

Check your current kernel and compare against published CVEs:

```bash
uname -r
# Cross-reference against https://www.cve.org or `cve-check-update` if installed

# On Debian/Ubuntu: show available security updates
apt list --upgradable 2>/dev/null | grep -i security

# On RHEL/Fedora:
dnf updateinfo list security
```

For live patching without rebooting (production systems), `kpatch` (Red Hat) and `livepatch` (Canonical) apply binary patches to the running kernel by redirecting function pointers in the kernel's text segment.

### Least Privilege

Every process should hold exactly the permissions it needs — not because it is polite convention, but because it limits blast radius. A compromised process running as root gives an attacker full kernel access: they can load modules, read `/proc/kcore`, kill arbitrary processes, and rewrite `/etc/shadow`. The same process running as an unprivileged UID with only `CAP_NET_BIND_SERVICE` limits what an attacker can do even after a successful exploit. They get the process; they do not get the machine.

Least privilege applies at multiple layers simultaneously: Unix UID/GID, Linux capabilities, seccomp syscall filters, SELinux/AppArmor MAC policies, and filesystem DAC permissions. Applying it at only one layer is insufficient — a process can hold no capabilities but still read `/etc/passwd` if file permissions allow it.

### Attack Surface Reduction

Attack surface is the set of all code paths an attacker can reach. A kernel module that is loaded but unused is reachable. A syscall a process never legitimately calls is reachable via exploit. The relationship is direct: if the code path does not exist (module not loaded, syscall blocked by seccomp, port not open), no vulnerability in that code path can be triggered, regardless of whether one exists.

The kernel's own documentation acknowledges that `CAP_SYS_ADMIN` alone exposes several hundred kernel code paths. Blocking one capability can eliminate more attack surface than patching individual CVEs.

### Auditing

Auditing captures security-relevant events — file accesses, privilege escalations, syscall invocations, authentication attempts — so you can detect anomalous behavior and reconstruct events after an incident. The Linux audit subsystem (`auditd`) writes structured records to `/var/log/audit/audit.log`. Without it, an attacker who reaches a hardened system can operate silently; you will not know a hardening control failed until the damage is done.

### Isolation

Isolation limits what a compromised component can affect. It does not prevent compromise — it contains consequences. A web server process running in its own mount namespace cannot read `/etc/shadow` even if it is exploited, because that path does not exist in its filesystem view. A container with a private network namespace cannot directly reach other containers on the host network. Isolation is multiplicative with other controls: hardening + isolation means an attacker who bypasses one must also bypass the other.

### Logging

Logging is the operational layer of auditing. The audit subsystem records syscall-level security events; logging is broader — application logs, kernel ring buffer (`dmesg`/`/dev/kmsg`), the systemd journal (`/run/log/journal/`), and syslog (`/var/log/syslog` or `/var/log/messages`). Logs are only useful if they are written to a location the attacker cannot modify after gaining access — specifically, a remote syslog server that the compromised machine cannot reach over a write path. A log sitting on the compromised machine is evidence an attacker can erase.

---

## How It Works

### Privilege Rings and the Kernel Boundary

The x86-64 architecture implements four privilege rings (0–3). Linux uses ring 0 for the kernel and ring 3 for all user processes. Hypervisors occupy VMX root mode (sometimes called ring −1), enforced by Intel VT-x/AMD-V hardware extensions — a guest OS running in ring 0 is actually in VMX non-root mode, and attempts to execute privileged instructions cause a VM exit to the hypervisor rather than executing directly on hardware.

User code that attempts a privileged instruction causes a general protection fault (`#GP`). The kernel handles it — typically delivering `SIGSEGV` or returning `EACCES`. This enforcement happens on every instruction fetch, in hardware.

A syscall is the legitimate mechanism for crossing the ring boundary:

```
user process
  → syscall instruction (sets RCX=RIP, R11=RFLAGS, loads kernel RSP from MSR_LSTAR)
  → ring 3 → ring 0 transition
  → kernel entry point (arch/x86/entry/entry_64.S: entry_SYSCALL_64)
  → syscall dispatch table (sys_call_table[RAX])
  → kernel handler executes
  → sysretq back to ring 3
```

The syscall number is passed in `RAX`. Arguments are in `RDI`, `RSI`, `RDX`, `R10`, `R8`, `R9` — note `R10` not `RCX`, because `syscall` clobbers `RCX`. Every syscall is a potential attack vector. Seccomp intercepts at the dispatch point, before the handler runs.

### Linux Capabilities

Traditional Unix privilege is binary: UID 0 has unconditional access; UID non-0 does not. Linux capabilities decompose root's privileges into discrete units, each independently grantable and droppable. The kernel checks capabilities on privileged operations — not UID 0. A process with UID 0 but all capabilities dropped has less privilege than a process with UID 1000 and `CAP_SYS_PTRACE`.

Key capabilities and why they are dangerous:

| Capability | What it permits | Why dangerous |
|---|---|---|
| `CAP_NET_BIND_SERVICE` | Bind ports < 1024 | Narrow; acceptable to grant |
| `CAP_SYS_ADMIN` | ~200 distinct privileged operations | Effectively root; avoid entirely |
| `CAP_DAC_OVERRIDE` | Bypass all DAC file permission checks | Reads any file regardless of mode |
| `CAP_SYS_PTRACE` | Trace arbitrary processes | Full memory read/write of any process |
| `CAP_NET_RAW` | Raw sockets, packet capture | ARP spoofing, traffic interception |
| `CAP_SYS_MODULE` | Load/unload kernel modules | Arbitrary kernel code execution |

Each thread has five capability sets. Let $C_e$, $C_p$, $C_i$, $C_{amb}$, and $C_{bnd}$ denote the effective, permitted, inheritable, ambient, and bounding sets respectively. The constraint is:

$$C_e \subseteq C_p \subseteq C_{bnd}$$

A capability can only be effective if it is permitted; permitted capabilities are bounded by the bounding set. When `execve` runs a new binary, the kernel computes the new permitted set as:

$$C_p' = \left(C_i \cap C_i^{\text{file}}\right) \cup \left(C_p^{\text{file}} \cap C_{bnd}\right) \cup C_{amb}$$

where $C_i^{\text{file}}$ and $C_p^{\text{file}}$ are the inheritable and permitted sets stored in the file's extended attributes.

Inspect and modify capability sets:

```bash
# Show capabilities of a running process (e.g., PID 1234)
cat /proc/1234/status | grep Cap
# CapInh, CapPrm, CapEff, CapBnd, CapAmb — each is a hex bitmask

# Decode the bitmask
capsh --decode=0000000000003000

# Show file capabilities
getcap /usr/bin/ping
# /usr/bin/ping cap_net_raw=ep

# Set a file capability (removes need for setuid)
setcap cap_net_bind_service=ep /usr/local/bin/myserver

# Run a shell with a reduced capability set (drop CAP_SYS_ADMIN and CAP_NET_RAW)
capsh --drop=cap_sys_admin,cap_net_raw --

# In a daemon's C startup code, drop all capabilities after binding the port:
```

```c
#include <sys/capability.h>
#include <sys/prctl.h>

// After binding port 80, drop everything except what's needed
cap_t caps = cap_from_text("cap_net_bind_service=ep");
if (cap_set_proc(caps) < 0) { perror("cap_set_proc"); exit(1); }
cap_free(caps);

// Also prevent privilege re-escalation via execve
prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);
```

`PR_SET_NO_NEW_PRIVS` is non-negotiable in a hardened daemon: once set, no child process can gain privileges via setuid or file capabilities, regardless of what binary it executes.

### Seccomp Filtering

`seccomp` intercepts every syscall before the kernel handler runs and applies a BPF program. If the filter returns `SECCOMP_RET_KILL_PROCESS`, the kernel sends `SIG
