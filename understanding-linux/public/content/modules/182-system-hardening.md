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

## Core Concepts
### System Hardening
System hardening is the disciplined reduction of a system’s *attack surface*—the set of points where an attacker can attempt to inject or extract data. Formally, if we model each potential entry point *i* as having an independent exploit probability *pᵢ*, the overall compromise probability *P* after *t* time units (assuming a Poisson arrival of attack attempts with rate λ) is  

$$
P = 1 - \exp\!\Bigl(-\lambda t \sum_i p_i\Bigr).
$$

Hardening lowers *pᵢ* (by removing or mitigating the vulnerability) or reduces the sum ∑pᵢ (by removing unnecessary services). The causal chain is: **fewer exploitable flaws → lower λ·∑pᵢ → lower P**. This is why hardening is not a checklist but a quantitative risk‑reduction process.

### Patching
A vulnerability exists when a piece of code contains a logical flaw that can be triggered by attacker‑controlled input. Patching replaces the flawed binary (or script) with a corrected version, thereby setting *pᵢ = 0* for that flaw. The effectiveness of patching depends on two latencies:  

* **Discovery‑to‑patch latency (Δ₁)** – time between public disclosure and vendor fix.  
* **Deployment latency (Δ₂)** – time between fix availability and actual installation on a host.

If attacks arrive as a Poisson process with rate λ, the expected number of successful exploits before patching is  

$$
E[N] = \lambda \int_{0}^{Δ₁+Δ₂} p(t)\,dt,
$$

where *p(t)* is the time‑varying exploit probability (often approximated as constant *p₀* before the patch). Reducing Δ₂ through automated patch management (e.g., unattended‑upgrades) directly cuts *E[N]*.

### Least Privilege
The principle states that a subject *s* should possess only the minimal set of permissions *Pₛ* required to execute its legitimate tasks. In Linux, permissions are modeled as a lattice of capabilities (UID/GID, POSIX ACLs, Linux capabilities, SELinux types). Granting excess permissions enlarges the *privilege escalation surface*: any compromised process can leverage the extra rights to reach higher‑integrity objects.  

Formally, let *R* be the set of resources a process may access; the *privilege leakage* *L* is  

$$
L = |\{r \in R : \text{process can access } r \text{ but } r \notin Pₛ\}|.
$$

Minimizing *L* reduces the expected impact of a compromise because the attacker’s post‑exploitation *reach* shrinks.

### Auditing
Auditing records security‑relevant events so that posteriori analysis can detect anomalies. The kernel’s audit subsystem intercepts syscalls via the *audit hook* (auditfs). Each rule is a tuple *(action, filter, fields)*; when a syscall matches the filter, the kernel writes a record to the audit log.  

If we define an anomalous event as a deviation from a baseline profile *B* (e.g., frequency of `open("/etc/shadow", O_RDONLY)`), the detection probability *D* after observing *N* events follows a binomial model:

$$
D = 1 - (1 - β)^{N},
$$

where *β* is the per‑event probability that the audit rule flags the anomaly. Increasing *β* (by writing precise rules) or *N* (by extending observation window) improves detection.

### Isolation
Isolation enforces that a compromise in one domain cannot directly affect another. In Linux, this is achieved via *namespaces* (mount, PID, network, user, IPC, UTS) and *control groups* (cgroups). A process confined to a namespace sees only a subset of system resources; attempting to access a resource outside its namespace results in `EPERM` or `ENOENT`.  

Consider two processes *A* and *B* sharing the same kernel but placed in separate network namespaces. The probability that a packet crafted by *A* reaches *B*’s socket is zero because the network stack’s routing tables are namespaced. Thus, isolation reduces cross‑domain *pᵢ* to zero for network‑based attacks.

### Logging
Logging provides the immutable record needed for forensic reconstruction. Syslog (or `journald`) forwards messages from kernel (`printk`) and userspace applications to `/var/log/*`. The reliability of a log chain depends on *write‑ahead logging* (WAL): each log entry is first written to a volatile buffer, then flushed to disk via `fsync`. If a crash occurs after the buffer write but before `fsync`, the entry may be lost. The probability of loss *ℓ* is approximately  

$$
ℓ ≈ \frac{τ_{flush}}{τ_{cycle}},
$$

where *τ₍flush₎* is the average time to persist a batch and *τ₍cycle₎* the logging interval. Using synchronous mounts (`sync`) or `systemd-journald`'s `Storage=persistent` reduces *τ₍flush₎* to near zero, making logs durable.

### Attack Surface Reduction
The attack surface *S* can be quantified as the sum of *executable* surfaces (binaries, scripts, kernel modules) and *configurable* surfaces (open ports, setuid binaries, dbus services).  

$$
S = \sum_{j∈\text{binaries}} α_j·v_j + \sum_{k∈\text{ports}} β_k·γ_k,
$$

where *α_j* is the exposure weight (e.g., network‑ facing), *v_j* the vulnerability density (known CVEs per KLOC), *β_k* the protocol risk factor, and *γ_k* the openness factor (0 if firewalled, 1 if open). Hardening actions target each term: removing a binary sets *α_j=0*, applying a patch reduces *v_j*, firewalling a port sets *γ_k=0*. The causal effect is a direct reduction in *S*, which, per the earlier exploit probability formula, lowers *P*.

---

## How It Works
System hardening applies the above principles in a layered, repeatable workflow:

1. **Inventory & Measurement** – enumerate installed packages (`dpkg -l`, `rpm -qa`), list listening ports (`ss -tulnp`), and discover setuid binaries (`find / -perm -4000 -type l`).  
2. **Vulnerability Scanning** – run `openvas` or `lynis` to obtain *v_j* and *γ_k* estimates.  
3. **Prioritization** – compute risk score *Rᵢ = λ·pᵢ·impactᵢ* for each finding; treat highest *Rᵢ* first.  
4. **Apply Controls** – patch, reconfigure, drop capabilities, add audit rules, enforce namespaces.  
5. **Validate** – re‑run scans, check audit logs for false positives/negatives, test functionality.  
6. **Iterate** – schedule the cycle (e.g., weekly) to account for new disclosures.

Each step is justified by the causal chain: measurement reduces uncertainty (lowering *Δ₁*), prioritization focuses effort on highest *pᵢ*, and validation ensures that the intended reduction in *S* actually occurred.

---

## Worked Examples
### Example 1: Patching a Critical Apache Struts Vulnerability (CVE‑2017‑5638)
Suppose a server runs Apache 2.4.6 with the Struts 2 plugin (vulnerable to OGNL injection). The fix is in Apache 2.4.46+ (backported to Debian 10 as `apache2 2.4.38-0+deb10u9`).  

**Step‑by‑step**

```bash
# 1. Verify current version
$ apache2 -v
Server version: Apache/2.4.6 (Debian)
$ dpkg -l | grep apache2
ii  apache2          2.4.6-1+deb9u1   amd64

# 2. Check available update
$ apt update
$ apt policy apache2
apache2:
  Installed: 2.4.6-1+deb9u1
  Candidate: 2.4.38-0+deb10u9
  Version table:
     2.4.38-0+deb10u9 500
        500 http://deb.debian.org/debian buster/main amd64 Packages
        100 /var/lib/dpkg/status

# 3. Install the patched version (non‑interactive)
$ DEBIAN_FRONTEND=noninteractive apt-get install -y apache2

# 4. Confirm fix
$ apache2 -v
Server version: Apache/2.4.38 (Debian)
$ dpkg -l | grep apache2
ii  apache2          2.4.38-0+deb10u9   amd64
```

**Why it works:** The patch removes the faulty OGNL parser, setting *vⱼ* for CVE‑2017‑5638 to 0. The deployment latency Δ₂ was ~5 minutes (including `apt update`). Assuming λ = 0.1 attempts/min and *p₀* = 0.02 before patch, the expected exploits before patching were  

$$
E[N] = λ·p₀·Δ₂ = 0.1·0.02·5 = 0.01,
$$

i.e., a 1 % chance of compromise during the window—demonstrating the value of rapid patching.

### Example 2: Implementing Least Privilege with Linux Capabilities
A backup script needs to read `/etc/shadow` (requires `CAP_DAC_READ_SEARCH`) but should not retain full root privileges.

```bash
# 1. Create a dedicated user
$ sudo useradd -r -s /usr/sbin/nologin backupuser

# 2. Grant only the needed capability to the binary
$ sudo setcap cap_dac_read_search+ep /usr/local/bin/backup.sh

# 3. Verify
$ sudo -u backupuser /usr/local/bin/backup.sh   # succeeds reading shadow
$ sudo -u backupuser id -u   # returns non‑zero UID, no root
```

**Why it works:** The process retains UID ≠ 0, limiting damage if the script is compromised. The only extra privilege is the specific capability, reducing the privilege leakage *L* from potentially all root rights to a single bit.

### Example 3: Auditing Unauthorized `ptrace` Calls
Detect attempts to debug a privileged binary (e.g., `sshd`).

```bash
# 1. Add an audit rule to watch ptrace syscall (number 101 on x86_64)
$ sudo auditctl -a always,exit -F arch=b64 -S ptrace -k ptrace_watch

# 2. Verify rule loaded
$ sudo auditctl -l | grep ptrace
-a always,exit -F arch=b64 -S ptrace -k ptrace_watch

# 3. Trigger a test (as non‑root)
$ sudo -u testuser strace -p 1   # will be blocked, audit generated

# 4. Search the log
$ sudo ausearch -k ptrace_watch --raw | aureport -f -i
```

**Why it works:** The kernel audit hook intercepts each `ptrace` syscall, writes a record, and the rule’s filter ensures only 64‑bit ptrace events are logged. The probability of missing an event *β* is near zero because the rule matches all invocations; thus detection probability *D* approaches 1 after a single attempt.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Undermines Hardening |
|---------|--------------|-----------------------------|
| **Relying on “security through obscurity”** (e.g., changing SSH port to 2222 and considering it safe) | Only alters *γₖ* (openness factor) marginally; does not reduce *vⱼ* or *pᵢ*. Attackers scan all ports; the effort increase is logarithmic, not exponential. | The exploit probability *pᵢ* remains unchanged; the expected time to compromise grows only by a factor of log₂(65535) ≈ 16, negligible against automated scanners. |
| **Granting `NOPASSWD` to a broad sudoers rule** (`%admin ALL=(ALL) NOPASSWD: ALL`) | Gives any member of admin group full root without authentication, drastically increasing *L*. | If a low‑privilege service is compromised and can exec `sudo`, the attacker gains immediate root, nullifying least privilege. |
| **Leaving unused kernel modules loaded** (e.g., `cfg80211` on a headless server) | Adds unnecessary *vⱼ* (potential zero‑day in wireless stack) and expands *S*. | Each extra module adds a term αⱼ·vⱼ to *S*; even a low‑severity flaw raises the overall compromise probability. |
| **Disabling SELinux/AppArmor because “it breaks things”** | Removes MAC enforcement, setting *pᵢ* for many kernel‑level exploits to their baseline. | MAC confines processes to types; without it, a compromised process can inherit the full set of permissions of its user, increasing *L* dramatically. |
| **Using world‑writable directories for temporary files** (`/tmp` with `1777` is safe, but `/var/tmp` with `0777` is not) | Allows any user to replace or symlink‑attack files used by privileged programs. | The attack surface includes file‑based race conditions; *pᵢ* for symlink attacks rises from near zero to measurable, enabling privilege escalation. |

Each mistake is non‑trivial: it stems from a misunderstanding of how the underlying security mechanism (capabilities, MAC, audit, etc.) reduces *pᵢ* or *L*, and correcting it requires a concrete configuration change, not just a vague “be more careful” admonition.

---

## Exercises
### Easy
1. **Patch verification** – On a Debian/Ubuntu system, list all packages with available upgrades and identify any that have a CVE > 2022.  
   ```bash
   $ apt list --upgradable 2>/dev/null | grep -v Listing
   $ apt-get update && apt-get install -y debian-goodies
   $ checkrestart | grep -v "No files"
   ```

2. **Port inventory** – Show all listening TCP/UDP ports and associate each with the owning process.  
   ```bash
   $ sudo ss -tulnp
   ```

### Medium
3. **Least‑privilege user** – Create a user `backup` that can run `/usr/local/bin/backup.sh` (which needs to read `/etc/shadow` and write to `/mnt/backup`) using only Linux capabilities, no sudo.  
   - Steps: create user, setcap on binary, verify with `sudo -u backup ...`.  

4. **Audit rule for file access** – Configure `auditd` to log any write to `/etc/passwd` and test it.  
   ```bash
   $ sudo auditctl -w /etc/passwd -p wa -k passwd_write
   $ sudo echo test >> /etc/passwd   # should be blocked, audit generated
   $ sudo ausearch -k passwd_write
   ```

### Hard
5. **Seccomp profile** – Write a JSON seccomp filter that allows only `read`, `write`, `exit`, and `brk` for a test program, then run the program with `sudo prlimit --pid=$$ --as=67108864` to enforce low memory. Show that a call to `open` is blocked with `SIGSYS`.  
   ```json
   {
     "defaultAction": "SCMP_ACT_ERRNO",
     "syscalls": [
       { "name": "read",   "action": "SCMP_ACT_ALLOW" },
       { "name": "write",  "action": "SCMP_ACT_ALLOW" },
       { "name": "exit",   "action": "SCMP_ACT_ALLOW" },
       { "name": "brk",    "action": "SCMP_ACT_ALLOW" }
     ]
   }
   ```
   ```bash
   $ sudo cp seccomp.json /etc/seccomp.json
   $ sudo prctl --seccomp=2 --filter=/etc/seccomp.json ./testprog
   ```

6. **Namespace isolation** – Run a network‑isolated shell that cannot reach the host’s external interface, then attempt to curl a public site and confirm failure.  
   ```bash
   $ sudo uname -n   # show host hostname
   $ sudo unshare -n --map-root-user -- bash
   $ ip link set lo up
   $ curl -I http://deb.debian.org  # should timeout or return "Network is unreachable"
   $ exit
   ```

Each exercise progresses from observation (easy) to configuration (medium) to low‑level mechanism enforcement (hard).

---

## Linux Connection
System hardening in Linux is realized through concrete subsystems, tools, and files:

| Hardening Principle | Linux Subsystem / Tool | Key Files / Commands | Example |
|---------------------|------------------------|----------------------|---------|
| **Patching** | Package managers (`apt`, `yum`, `dnf`) | `/etc/apt/sources.list.d/`, `/var/log/apt/term.log` | `apt-get update && apt-get upgrade -y` |
| **Least Privilege** | Linux capabilities, `setcap`, `getcap`, `sudoers` | `/etc/sudoers.d/`, `/proc/<pid>/status` (CapEff) | `setcap cap_net_bind_service+ep /usr/sbin/lighttpd` |
| **Auditing** | `auditd`, `auditctl`, `ausearch`, `aureport` | `/etc/audit/audit.rules`, `/var/log/audit/audit.log` | `auditctl -w /etc/shadow -p rw -k shadow_watch` |
| **Isolation** | Namespaces (`ip netns`, `unshare`, `systemd-nspawn`), cgroups v2 | `/run/netns/`, `/sys/fs/cgroup/` | `sudo ip netns add isolated; sudo ip netns exec isolated bash` |
| **MAC** | SELinux (`sestatus`, `setenforce`), AppArmor (`aa-status`, `apparmor_parser`) | `/etc/selinux/config`, `/etc/apparmor.d/` | `semanage fcontext -a -t httpd_sys_content_t "/var/www/html(/.*)?"` |
| **Logging** | `systemd-journald`, `rsyslog`, `logrotate` | `/etc/systemd/journald.conf`, `/etc/rsyslog.conf`, `/etc/logrotate.d/` | `journalctl -u sshd --since "1 hour ago"` |
| **Attack Surface Reduction** | Service management (`systemctl`), firewall (`nftables`, `firewalld`), `sysctl` | `/etc/systemd/system/`, `/etc/nftables.conf`, `/etc/sysctl.d/` | `systemctl disable avahi-daemon.service; sudo nft add rule inet filter input tcp dport 22 drop` |

These components map directly to the abstract concepts: capabilities enact least privilege; auditd implements auditing; namespaces and cgroups provide isolation; SELinux/AppArmor enforce MAC that further reduces *pᵢ*; disabling services and configuring `nftables` shrink *S*; `journalctl` preserves logs for forensic analysis.

---

## Why This Matters
System hardening transforms security from a reactive “patch‑after‑breach” mindset into a proactive, quantifiable risk‑reduction process. By measuring the attack surface *S*, understanding how each control reduces individual exploit probabilities *pᵢ*, and verifying those reductions through auditing and testing, administrators can answer the fundamental question: **“How much safer is my system after applying this control?”**  

The Linux ecosystem provides the precise instrumentation—package managers for Δ₂ reduction, capabilities and MAC for privilege minimization, auditd for detection, namespaces for isolation, and logging for accountability—to implement each principle with mathematical rigor. Mastery of these tools allows a Linux administrator to not only follow best‑practice checklists but to justify every hardening decision with observable, repeatable evidence, thereby ensuring that the systems they manage resist both known threats and the inevitable emergence of new vulnerabilities.
