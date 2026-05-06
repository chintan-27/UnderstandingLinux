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

## Core Concepts
### Threat Model
A threat model quantifies **expected loss** from an adversary by combining:
- **Assets** \(A\): value (monetary, confidentiality, integrity) of what must be protected.  
- **Threat agents** \(T\): characterized by skill level \(s_T\) and resources \(r_T\).  
- **Threat vectors** \(V\): each vector \(v_i\) has an intrinsic success probability \(p_i\) given the agent’s capability.  
- **Vulnerabilities** \(U\): weaknesses that increase \(p_i\); often expressed as a factor \(\alpha_u \ge 1\) (e.g., a buffer overflow raises \(p_i\) by 10×).

The **risk** for a vector is  
\[
R_i = A \cdot \bigl(1-(1-p_i)^{n_i}\bigr) \cdot \prod_{u\in U_i}\alpha_u,
\]  
where \(n_i\) is the number of independent attempts an attacker can make.  
*Why*: The term \(1-(1-p_i)^{n_i}\) is the probability of at least one success in \(n_i\) trials (derived from the complement of all failures). Multiplying by asset value converts a probability into expected loss. Understanding each factor lets defenders target the largest contributors: reduce \(n_i\) (rate limiting), lower \(p_i\) (patch), or decrease \(\alpha_u\) (input validation).

### Attack Surface
The attack surface \(S\) is the **set of all entry points** an attacker can reach without prior privilege. Formally, if each interface \(e_j\) exposes a set of syscalls/files \(C_j\), then  
\[
S = \bigcup_j C_j .
\]  
*Why*: The probability that a random probe finds a usable vector is proportional to \(|S|/|C_{total}|\). Reducing \(|S|\) linearly lowers the chance of encountering a vulnerable vector. Interfaces include network ports, UNIX domain sockets, syscall entry points, and device files.

### Least Privilege
A process \(P\) should hold the minimal set of privileges \(\mathcal{P}_P\) such that \(\forall a\in\text{actions}(P): a\) is authorized iff the required privilege subset \(\mathcal{P}_a\subseteq\mathcal{P}_P\).  
*Why*: If a compromise grants the attacker the process’s privilege set, the **blast radius** is \(|\mathcal{P}_P|\). By minimizing \(|\mathcal{P}_P|\) we bound the maximum damage. Mathematically, expected damage \(D = \Pr[\text{compromise}] \times |\mathcal{P}_P|\); lowering \(|\mathcal{P}_P|\) reduces \(D\) even if compromise probability stays constant.

### Trust Boundaries
A trust boundary separates domains with differing **trust levels** \(\tau\). When data crosses from domain \(X\) (\(\tau_X\)) to \(Y\) (\(\tau_Y<\tau_X\)), the receiver must apply a **validation function** \(v\) that maps inputs to a safe subset:  
\[
v: \mathcal{I}_X \rightarrow \{i\in\mathcal{I}_X \mid \text{policy}(i,\tau_Y)=\text{allow}\}.
\]  
*Why*: Without validation, an attacker can inject \(\tau_X\)-level privileges into a \(\tau_Y\) context, effectively elevating privilege. The kernel/user-space boundary is the canonical example: the kernel trusts only validated syscall arguments.

---

## How It Works
1. **Threat Model Identification**  
   - Enumerate assets (e.g., SSH private keys, database). Assign a monetary value \(A\).  
   - Profile threat agents: script kiddie (\(s_T\approx0.1\)), insider (\(s_T\approx0.8\)), nation‑state (\(s_T\approx1.0\)).  
   - For each vector (e.g., remote HTTP, local PTY), estimate base success probability \(p_i\) from public exploit data.  
   - Multiply by vulnerability factors \(\alpha_u\) (e.g., ASLR bypass \(\alpha=2\), missing canary \(\alpha=5\)).  
   - Compute \(R_i\) to prioritize mitigations.

2. **Attack Surface Reduction**  
   - Close unused TCP/UDP ports: each closed port removes a vector \(v_i\) with \(p_i>0\).  
   - Apply firewall rules (nftables) that drop packets before they reach listeners, effectively setting \(n_i=0\) for those vectors.  
   - Restrict syscall availability via seccomp-bpf: if a process never needs `ptrace`, filter it out, eliminating that column of \(S\).

3. **Least Privilege Implementation**  
   - Determine the minimal privilege set \(\mathcal{P}_{min}\) by analyzing required syscalls (via `strace -c`).  
   - Drop unnecessary privileges early: after parsing config, call `setuid(getuid())` to relinquish root, then `setgid(getgid())`.  
   - Use Linux capabilities: keep only `CAP_NET_BIND_SERVICE` for binding to ports <1024, drop all others with `cap_set_proc`.

4. **Trust Boundary Establishment**  
   - Identify boundaries: (a) network ↔ app, (b) app ↔ kernel (syscalls), (c) IPC ↔ processes (UNIX sockets, DBus).  
   - At each boundary, enforce validation:  
     * Network: parse HTTP with a whitelist of methods, reject `%00` etc.  
     * Syscall: kernel checks `cred->uid/gid` against the requested operation’s ACL (e.g., `CAP_SYS_ADMIN` for `mount`).  
     * IPC: AppArmor/SELinux policies mediate access based on labels.

---

## Worked Examples
### Example 1: Hardening a Linux Web Server (nginx)
**Threat model**:  
- Asset value \(A = \$10^6\) (potential data breach).  
- Attacker: opportunistic botnet (\(s_T=0.2\)).  
- Vector: HTTP GET on port 80. Base exploit probability for an outdated nginx version \(p_0 = 10^{-4}\).  
- Vulnerability: missing stack canary (\(\alpha=4\)).  

Risk before mitigation:  
\[
R = 10^6 \cdot \bigl(1-(1-10^{-4})^{10^4}\bigr) \cdot 4 \approx 10^6 \cdot (1-e^{-1}) \cdot 4 \approx 2.5\times10^6.
\]

**Mitigations & effect**:  
1. **Reduce attack surface**: block port 8080 (admin) with `nft add rule inet filter input tcp dport 8080 drop`. Now \(n_i\) for admin vector = 0 → \(R_{admin}=0\).  
2. **Patch**: upgrade nginx → \(p_i = 10^{-6}\).  
3. **Enable stack protection**: compiler flag `-fstack-protector-strong` → \(\alpha=1\).  
4. **Least privilege**: run nginx as user `wwwuid` (UID 101) with only `CAP_NET_BIND_SERVICE`.  
5. **Trust boundary validation**: enable `modsecurity` with rule set `OWASP CRS` to sanitize inputs (e.g., reject `|` in query strings).  

Re‑computed risk:  
\[
R' = 10^6 \cdot \bigl(1-(1-10^{-6})^{10^4}\bigr) \cdot 1 \approx 10^6 \cdot (1-e^{-0.01}) \approx 1.0\times10^4.
\]  
*Why*: Each step attacks a different factor in the risk equation, yielding a >200‑fold reduction.

**Concrete commands** (run as root):
```bash
# 1. Install nginx with hardening flags
apt-get install -y nginx-extras
# 2. Create restricted user
useradd -r -s /usr/sbin/nologin wwwuid
# 3. Edit /etc/nginx/nginx.conf
#    user wwwuid;
#    worker_processes auto;
#    pid /run/nginx.pid;
#    events { worker_connections 1024; }
#    http {
#        include /etc/nginx/mime.types;
#        default_type application/octet-stream;
#        sendfile on;
#        keepalive_timeout 65;
#        include /etc/nginx/conf.d/*.conf;
#        # ModSecurity (if compiled)
#        modsecurity on;
#        modsecurity_rules_file /etc/modsecurity/modsec-includes.conf;
#    }
# 4. Bind only to needed ports (listen 80; listen 443 ssl;)
# 5. Drop capabilities
setcap cap_net_bind_service=+ep /usr/sbin/nginx
# 6. Apply nftables rule
nft add rule inet filter input tcp dport 8080 drop
# 7. Verify
ss -tlnp | grep nginx
```

### Example 2: Secure System Call Handling (openat)
When a user program calls `openat(fd, pathname, flags, mode)`, the kernel performs:
1. **Credential check**: retrieve `current_cred()->uid` and `gid`.  
2. **Capability test**: if `flags` includes `O_CREAT` and the target directory lacks `w` permission for the uid, require `CAP_DAC_OVERRIDE`.  
3. **Pathname validation**: copy the user‑space string with `strncpy_from_user`, limiting to `PATH_MAX` (4096) bytes; reject embedded `\0` or `..` sequences that would escape a chroot.  
4. **Filesystem permission check**: call `inode_permission` to compare requested mode (`flags`) against the inode’s `i_mode` and the caller’s uid/gid.  
5. **Audit**: if `audit_enabled`, log `syscall_openat` with `uid`, `pid`, `fd`, `flags`, and the resolved pathname.

*Why*: Steps 2‑4 enforce the trust boundary between user space (untrusted) and kernel (trusted). Missing any step allows privilege escalation: e.g., skipping the capability test lets a non‑privileged user create files anywhere via `O_CREAT|O_DIRECTORY`.

**Illustrating with strace** (run as a normal user):
```bash
$ strace -e trace=openat -f -o /tmp/open.log sh -c 'echo hi > /tmp/test'
$ grep openat /tmp/open.log
openat(AT_FDCWD, "/tmp/test", O_WRONLY|O_CREAT|O_TRUNC, 0666) = 3
```
The kernel succeeded because the caller had write permission in `/tmp` (mode 1777) and no extra capabilities were needed.

---

## Common Mistakes
1. **Missing Canonicalization Before Validation**  
   *What*: Checking `if (strstr(input, "../")) reject;` on raw input.  
   *Why*: Attackers can bypass with encoded sequences like `%2e%2e%2f` or double encoding. The validation must occur **after** decoding to the byte string the kernel will use.  
   *Fix*: Normalize (decode URL, resolve symlinks with `realpath`) then apply a whitelist.

2. **Relying on Default Umask for Privilege Drop**  
   *What*: Assuming `setuid(getuid())` alone limits file creation.  
   *Why*: The process may still inherit dangerous capabilities (e.g., `CAP_SYS_CHROOT`) or have open file descriptors with elevated privileges.  
   *Fix*: After `setuid`, call `prctl(PR_SET_KEEPCAPS, 1)` then `cap_set_proc` to zero the capability mask, and close all inherited FD >2 via a loop over `/proc/self/fd`.

3. **Trusting Client‑Side Input Length Fields**  
   *What*: Using `len = ntohs(*(uint16_t*)buf);` to allocate a buffer then reading `len` bytes without checking against the actual recv length.  
   *Why*: An attacker can set `len` larger than the real packet, causing a read past the buffer (heap overflow).  
   *Fix*: Validate `len <= recv_len` before use; better, use a length‑bounded copy: `memcpy(dest, buf+2, min(len, recv_len-2))`.

4. **Overlooking Time‑of‑Check‑Time‑of‑Use (TOCTOU) on Symlinks**  
   *What*: Checking `if (access(path, W_OK)==0) open(path, O_WRONLY);`  
   *Why*: Between `access` and `open`, an attacker can replace `path` with a symlink to a privileged file.  
   *Fix*: Open the file descriptor **first** with `openat(dirfd, path, O_RDONLY|O_NOFOLLOW, 0)` and then use `faccessat(fd, "", AT_EACCESS, W_OK)` or simply rely on the opened FD’s permissions.

---

## Exercises
### 1. Easy – Configure a Minimal Web Server
*Goal*: Serve static files on port 8080 only, drop privileges after binding, and log every request.  
*Steps*:
```bash
# Install lightweight server
apt-get install -y lighttpd
# Create unprivileged user
useradd -r -s /usr/sbin/nologin webuser
# Edit /etc/lighttpd/lighttpd.conf
#    server.username = "webuser"
#    server.groupname = "webuser"
#    server.port = 8080
#    server.document-root = "/var/www/html"
#    accesslog.filename = "/var/log/lighttpd/access.log"
#    server.tag = "lighttpd"
# Create test page
mkdir -p /var/www/html && echo "Hello LS" > /var/www/html/index.html
# Restart and verify
systemctl restart lighttpd
curl -I http://localhost:8080/
# Ensure process runs as webuser
ps -o pid,user,comm -C lighttpd
```
*Check*: No other ports listening (`ss -tlnp | grep LISTEN`).

### 2. Medium – Least‑Privilege C Program with setuid
*Goal*: Write a program that reads a file only readable by root, drops privileges after opening, then prints the first line.  
*Source (`droppriv.c`)*:
```c
#define _GNU_SOURCE
#include <unistd.h>
#include <fcntl.h>
#include <sys/prctl.h>
#include <sys/capability.h>
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>

int main(void) {
    /* Keep only CAP_DAC_READ_SEARCH (needed to read /etc/shadow) */
    cap_t caps = cap_get_proc();
    cap_value_t keep[] = { CAP_DAC_READ_SEARCH };
    cap_set_flag(caps, CAP_EFFECTIVE, 1, keep, CAP_SET);
    cap_set_flag(caps, CAP_PERMITTED, 1, keep, CAP_SET);
    cap_set_proc(caps);
    cap_free(caps);

    /* Drop uid/gid after we have opened the file */
    int fd = open("/etc/shadow", O_RDONLY);
    if (fd < 0) { perror("open"); exit(1); }
    if (setgid(getgid()) == -1) { perror("setgid"); exit(1); }
    if (setuid(getuid()) == -1) { perror("setuid"); exit(1); }

    char buf[256];
    ssize_t n = read(fd, buf, sizeof(buf)-1);
    if (n < 0) { perror("read"); exit(1); }
    buf[n] = '\0';
    printf("First line: %.*s\n", (int)strcspn(buf, "\n"), buf);
    close(fd);
    return 0;
}
```
*Build & test*:
```bash
gcc -Wall -Wextra -O2 droppriv.c -o droppriv -lcap
sudo chown root:root droppriv
sudo chmod 4755 droppriv   # setuid root
./droppriv   # should print first line of /etc/shadow then drop to user
id -u   # verify uid is now your normal user
```
*Why*: The program retains only the capability needed to read the shadow file, then relinquishes UID/GID, limiting post‑exploitation impact.

### 3. Hard – Analyze strace for a Missing Privilege Drop
*Goal*: Find a binary that retains unnecessary capabilities after startup and propose a fix.  
*Procedure*:
1. Pick a common utility (e.g., `/usr/bin/ping`).  
2. Run with `strace -f -e trace=capget,capset,setuid,setgid -o /tmp/ping.strace ping -c 1 127.0.0.1`.  
3. Examine the output: you’ll see `capget` retrieving a set that includes `CAP_NET_RAW` (needed) but also `CAP_SETUID` (not needed).  
4. Verify with `getcap /usr/bin/ping`: likely shows `cap_net_raw+ep`.  
5. If the binary incorrectly retains `CAP_SETUID`, suggest rebuilding with `-DROP_NONEMPTY` or using `filecap` to strip it.  
*Deliverable*: A short report (`/tmp/ping_report.md`) listing the extraneous capability, why it’s dangerous (allows uid changes if compromised), and the command to remove it:  
```bash
sudo setcap cap_net_raw+ep /usr/bin/ping   # ensure only NET_RAW remains
sudo getcap /usr/bin/ping
```
*Verification*: After removal, repeat the strace; `capset` for `CAP_SETUID` should no longer appear.

---

## Linux Connection
### SELinux (Security‑Enhanced Linux)
- **Policy storage**: `/etc/selinux/targeted/policy/policy.[vers]`  
- **Booleans**: toggle runtime behavior, e.g., `setsebool -P httpd_can_network_connect 1` allows Apache to make outbound TCP connections.  
- **Types**: each file/process has a SELinux type (`httpd_t`, `shadow_t`). Use `ls -Z` to view.  
- **Example confinement**: restrict nginx to read only its own config:  
  ```bash
  sudo semanage fcontext -a -t httpd_config_t "/etc/nginx(/.*)?"
  sudo restorecon -Rv /etc/nginx
  sudo setsebool -P httpd_enable_cgi 0   # disable CGI if not needed
  ```
- **Audit**: `ausearch -m avc -ts recent` shows denied AVCs; use `audit2why` to explain.

### AppArmor
- **Profiles**: `/etc/apparmor.d/` (e.g., `/etc/apparmor.d/usr.sbin.nginx`).  
- **Modes**: `aa-complain /etc/apparmor.d/usr.sbin.nginx` logs violations without enforcing; `aa-enforce` activates.  
- **Rule snippet** for nginx:  
  ```
  /etc/nginx/** r,
  /var/www/html/** r,
  capability net_bind_service,
  network inet stream,
  ```
- **Reload**: `systemctl reload apparmor` after edits.

### Linux Capabilities
- **Bounding set**: view with `cat /proc/$$/status | grep Cap`.  
- **Drop all but needed**:  
  ```bash
  # Keep only CAP_NET_BIND_SERVICE
  capsh --print --drop=cap_net_bind_service -- -c "id -u"
  ```
- **Ambient capabilities** (inherited across exec): control via `prctl(PR_CAP_AMBIENT, ...)`. Useful for services that need a capability after fork‑exec without setuid.

### Namespaces & Seccomp
- **User namespaces**: allow unprivileged users to create a new uid/gid map, limiting the effect of a compromised process.  
  ```bash
  unshare -Ur --map-root-user -- sh -c 'echo $$ > /proc/self/setgroups; echo 0 $(id -u) 1 > /proc/self/uid_map; echo 0 $(id -g) 1 > /proc/self/gid_map; exec "$@"'
  ```
- **Seccomp‑BPF filter**: block all syscalls except a whitelist. Example using `libseccomp`:  
  ```c
  #include <seccomp.h>
  scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_KILL);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit_group), 0);
  seccomp_load(ctx);
  ```
- **Verification**: `cat /proc/$$/status | grep Seccomp` shows mode 2 (filter) when active.

### Auditing & Logging
- **auditd**: watch syscalls that cross trust boundaries.  
  ```bash
  sudo auditctl -a exit,always -F arch=b64 -S openat -F uid>=1000 -k privileged_open
  sudo ausearch -k privileged_open | aureport -f
  ```
- **Journal**: `journalctl -u nginx.service` captures service‑specific logs.

These subsystems let you **enforce** the theoretical concepts: SELinux/AppArmor implement mandatory access control (trust boundaries), capabilities realize fine‑grained least privilege, namespaces provide isolated environments, and seccomp reduces the syscall attack surface.

---

## Why This Matters
Security is not a checklist; it is a quantitative risk‑management problem. By modeling assets, threat agents, vectors, and vulnerabilities we can compute expected loss and prioritize mitigations that shrink the attack surface, enforce least privilege, and validate every trust‑boundary crossing. In Linux, the kernel exposes precise mechanisms—capabilities, SELinux types, AppArmor profiles, seccomp filters, and namespaces—that map directly to the mathematical factors in the risk equation. When a developer understands *why* closing a port reduces \(n_i\), *why* dropping a capability lowers \(|\mathcal{P}_P|\), and *why* validating input after canonicalization eliminates \(\alpha_u\), they can design systems where the product of probability and impact is driven toward zero. This rigorous foundation turns security from an afterthought into a provable property, essential for protecting infrastructure as it scales in complexity and value.
