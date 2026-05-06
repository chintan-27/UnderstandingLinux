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

## Core Concepts
### Threat Model and Kernel Trust Boundary
The kernel is the **trusted computing base (TCB)**: it runs at CPU privilege level 0 (ring 0) and mediates all hardware access. Any flaw that lets attacker‑controlled code execute in ring 0 bypasses all higher‑level defenses. Therefore kernel security focuses on:
* **Integrity** – ensuring only unmodified, authorized code runs in ring 0.  
* **Confidentiality** – preventing leakage of kernel‑only data (e.g., credential structs, cryptographic keys).  
* **Availability** – denying attackers the ability to crash or hang the kernel.

### Module Trust: Why Signing Is Necessary
Loadable kernel modules (LKMs) are ordinary ELF objects linked against the kernel’s exported symbols. If an attacker can inject a malicious `.ko`, they gain arbitrary ring 0 execution. Signature verification mitigates this by binding a cryptographic digest of the module to a trusted public key stored in the kernel keyring (`.builtin_trusted_keys`).  

**Why a signature works:**  
Let \(M\) be the module binary, \(H = \text{SHA256}(M)\) its hash, and \(\sigma = \text{Sign}_{sk}(H)\) the signature generated with a private key \(sk\). Verification computes \(H' = \text{SHA256}(M)\) and checks \(\text{Verify}_{pk}(\sigma, H')\). Forgery probability is bounded by the security of the signature scheme; with RSA‑2048 it is ≈ \(2^{-2048}\).

### Linux Security Modules (LSM): Hook‑Based MAC Framework
LSM does **not** implement a policy itself; it provides a set of **kernel hooks** (function pointers) placed at security‑relevant points (e.g., `inode_open`, `file_mmap`, `task_alloc`). When a hook is invoked, the kernel calls the active LSM’s callback, which returns `0` to allow or `-EPERM` to deny.  

*Hook registration:* at boot, each LSM registers via `security_add_hooks(struct security_hook_list *hooks, int count, char *lsm)`. The first LSM that returns non‑zero wins; others are stacked (e.g., SELinux → AppArmor → Yama).  

*Why hooks are safe:* they are called **after** credential and capability checks, so an LSM can only add restrictions, not bypass DAC.

### Seccomp: Programmable System‑Call Filter
Seccomp‑BPF attaches a **Berkeley Packet Filter (BPF)** program to a task’s `seccomp` mode. The filter runs **in kernel mode** for every `syscall` instruction, inspecting the syscall number and arguments, then returning an action code:

```
action = BPF_PROG(syscall_nr, args)
```

Possible actions (from `linux/seccomp.h`):
* `SCMP_ACT_ALLOW` – let the syscall proceed.  
* `SCMP_ACT_ERRNO(err)` – return `errno` to userspace.  
* `SCMP_ACT_KILL` – send `SIGSYS` and terminate.  
* `SCMP_ACT_TRAP` – send `SIGSYS` and invoke userspace tracer (ptrace).  

*Why BPF?* BPF programs are **verified** (no loops, bounded length) guaranteeing O(1) execution time per syscall (typically 30‑150 ns on x86‑64). The worst‑case cost is proportional to the number of BPF instructions; a typical filter with 20‑40 instructions adds < 200 ns overhead.

### Namespaces: Isolation via Clone Flags
A namespace wraps a global kernel resource (mounts, PID table, network stack, etc.) in a **proxy object**. The `clone()` syscall creates a new namespace when supplied with flags such as `CLONE_NEWNS`, `CLONE_NEWPID`, `CLONE_NEWNET`, `CLONE_NEWIPC`, `CLONE_NEWUTS`, `CLONE_NEWUSER`, `CLONE_NEWCGROUP`.  

*Why isolation works:* each namespace maintains its own instance of the relevant data structures (e.g., `struct mount_namespace` for mounts). Processes only see objects reachable through their namespace’s proxy; cross‑namespace access requires explicit bindings (e.g., `bind mount`, `veth` pair) or privileged capabilities (`CAP_SYS_ADMIN`).  

*Resource cost:* each namespace adds a small kernel object (≈ 1‑2 KB). The lookup overhead is an extra pointer dereference per resource operation (negligible compared to the operation itself).

---

## How It Works
### Module Loading and Signature Verification
1. **User request:** `modprobe foo.ko` (or `insmod`) invokes the `sys_init_module` syscall.  
2. **Kernel reads** the ELF file, extracts the `.modinfo` section containing `sig=...` and `sig_keyid=...`.  
3. **Key lookup:** the kernel searches the `.builtin_trusted_keys` keyring for a key matching `sig_keyid`. If `CONFIG_MODULE_SIG_FORCE` is set and no key is found, loading aborts with `-ENOKEY`.  
4. **Signature check:** computes `SHA256` of the module (excluding the signature field) and verifies the RSA signature using the public key.  
5. **Result:** on success, the module is relocated into kernel memory, its symbols exported via `kallsyms`, and `module_init` is called. Failure returns `-ENOKEY` or `-EBADSIG`.  

*Timing:* SHA256 of a 1 MiB module ≈ 0.4 ms; RSA‑2048 verification ≈ 0.6 ms on a modern Core i7.  

### LSM Policy Enforcement Flow
For each syscall that triggers an LSM hook (e.g., `vfs_open` → `inode_open` hook):
1. **Credentials check:** DAC (uid/gid, capabilities) already evaluated.  
2. **LSM callback:** `security_inode_open(struct inode *inode, struct file *file)` is invoked.  
3. **Policy decision:** the LSM consults its internal rule set (e.g., AppArmor profile stored in `security/apparmor/profiles/`).  
4. **Return:** `0` → continue; `-EPERM` → syscall fails with `EACCES`.  

*Why this order:* DAC provides a baseline; LSM adds **mandatory** constraints that cannot be disabled by unprivileged users.

### Seccomp Filter Application
A typical workflow using libseccomp:

```c
#include <seccomp.h>
#include <linux/seccomp.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <stdio.h>

int main(void) {
    scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_KILL); // default: kill
    if (!ctx) return 1;

    // allow read, write, exit, brk, mmap, munmap
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(brk), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(mmap), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(munmap), 0);

    // restrict architecture to native (optional)
    seccomp_attr_set(ctx, SCMP_FLTATR_CTL_NNP, 1); // no new privs

    if (seccomp_load(ctx) < 0) {
        perror("seccomp_load");
        return 1;
    }

    // Now the process is filtered
    pause(); // wait for signals
    seccomp_release(ctx);
    return 0;
}
```

*Explanation:*  
* `seccomp_init` sets the **default action** (here `KILL`).  
* Each `seccomp_rule_add` inserts a BPF jump that matches the syscall number and returns `ALLOW`.  
* After `seccomp_load`, the kernel attaches the filter; subsequent syscalls are evaluated by the BPF program. Any syscall not explicitly allowed triggers the default `KILL`, sending `SIGSYS`.  

### Namespace Creation and Usage
Creating a isolated environment with `unshare`:

```bash
# Create a new user, mount, UTS, IPC, PID, and network namespace
unshare --user --mount --uts --ipc --pid --net --fork bash
```

Inside the child shell:
* **User namespace:** UID 0 inside the namespace maps to an unprivileged UID outside (requires `/proc/<pid>/uid_map` write).  
* **Mount namespace:** private mount table; `mount --bind /tmp /mnt` does not affect the host.  
* **UTS namespace:** `hostname container` changes only the namespace’s hostname.  
* **IPC namespace:** separate System V IPC objects.  
* **PID namespace:** `ps` shows only processes in this namespace; PID 1 is the init process of the container.  
* **Network namespace:** `ip link` shows only loopback; a veth pair can be moved in to provide networking.

*Why each flag matters:* each flag creates a distinct kernel object; omitting a flag leaves that resource shared with the parent, potentially leaking information.

---

## Worked Examples
### Example 1: Loading a Signed Kernel Module
**Goal:** Load a module `good.ko` that provides a simple `good_op` syscall, verifying its signature.

**Steps:**
1. **Generate a test key pair** (in practice, use distro‑provided keys):
   ```bash
   openssl genrsa -out module_key.priv 2048
   openssl rsa -in module_key.priv -pubout -out module_key.pub
   ```
2. **Sign the module** (kernel provides `scripts/sign-file`):
   ```bash
   ./scripts/sign-file sha256 module_key.priv module_key.pub good.ko
   ```
   This appends a `.modinfo` block containing `sig_id=...` and `sig=...`.  
3. **Enforce signing** (ensure kernel config):
   ```bash
   grep CONFIG_MODULE_SIG_FORCE /boot/config-$(uname -r) # should be y
   sudo sysctl -w kernel.modules_sig_enforce=1
   ```
4. **Load the module:**
   ```bash
   sudo modprobe good.ko
   dmesg | tail -n 5
   ```
   Expected output:
   ```
   [ 12.345678] module_signature: good.ko: signature verified
   [ 12.345701] good: module loaded
   ```
5. **Verify via `modinfo`:**
   ```bash
   modinfo -F sig good.ko
   # prints the signer key ID
   ```
6. **Test the new syscall** (assuming the module exports `sys_good_op`):
   ```c
   #include <linux/unistd.h>
   #include <sys/syscall.h>
   #define __NR_good_op 335 // check /boot/System.map-$(uname -r) for actual number
   long good_op(void) {
       return syscall(__NR_good_op);
   }
   int main() { printf("good_op returned %ld\n", good_op()); }
   ```
   Compile and run; should return the value defined in the module (e.g., `42`).

**Why each step matters:**  
*Key generation* ensures only holders of the private key can produce a valid signature.  
*Signing* binds the hash to the key; any tampering changes the hash, causing verification failure.  
*Enforcing* via `modules_sig_enforce` prevents bypass by loading unsigned modules even if the key is present.  
*Verification* is performed **before** the module’s code is mapped, eliminating the window where malicious code could run.

### Example 2: AppArmor Profile to Shield `/etc/shadow`
**Goal:** Prevent any process under the profile from reading `/etc/shadow`.

**Profile (`/etc/apparmor.d/usr.bin.cat`):**
```apparmor
#include <tunables/global>

/usr/bin/cat {
    # allow reading generic files
    /etc/passwd r,
    /etc/group  r,
    # deny shadow explicitly
    denial /etc/shadow r,
}
```
*`denial`* keyword tells AppArmor to log the attempt and return `EACCES`.

**Load and enforce:**
```bash
sudo apparmor_parser -r /etc/apparmor.d/usr.bin.cat
sudo aa-status | grep usr.bin.cat
```
**Test:**
```bash
sudo -u testuser /usr/bin/cat /etc/shadow   # should fail
sudo -u testuser /usr/bin/cat /etc/passwd   # should succeed
```
**Explanation:**  
When `cat` calls `open("/etc/shadow", O_RDONLY)`, the VFS invokes the `inode_open` LSM hook. AppArmor’s callback checks the profile, sees the `denial` rule, returns `-EPERM`. The kernel then returns `EACCES` to userspace. The audit log (`/var/log/audit/audit.log`) contains a message like `type=APPARMOR_DENIED...`.

### Example 3: Seccomp Sandbox for a TCP Echo Server
**Goal:** Allow only `socket`, `bind`, `listen`, `accept`, `read`, `write`, `close`, and `exit_group`. Kill on any other syscall.

**C code (`echo_sandbox.c`):**
```c
#define _GNU_SOURCE
#include <seccomp.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>

static void install_filter(void) {
    scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_KILL);
    if (!ctx) _exit(1);

    // socket family
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(socket), 1,
                     SCMP_A0(SCMP_CMP_EQ, AF_INET));
    // bind, listen, accept
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(bind), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(listen), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(accept), 0);
    // I/O
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(close), 0);
    // exit
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit_group), 0);

    if (seccomp_load(ctx) < 0) _exit(1);
    seccomp_release(ctx);
}

int main(void) {
    install_filter();

    int s = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in addr = { .sin_family = AF_INET,
                                .sin_port = htons(8080),
                                .sin_addr.s_addr = INADDR_ANY };
    bind(s, (struct sockaddr *)&addr, sizeof(addr));
    listen(s, 1);
    int c = accept(s, NULL, NULL);
    char buf[64];
    ssize_t n;
    while ((n = read(c, buf, sizeof(buf))) > 0)
        write(c, buf, n);
    close(c);
    close(s);
    return 0;
}
```
**Build and run:**
```bash
gcc -Wall -o echo_sandbox echo_sandbox.c -lseccomp
./echo_sandbox &
# Test with nc localhost 8080
```
**Why it works:**  
The BPF program checks each syscall number; if it matches one of the allowed entries, it returns `ALLOW`. Any other syscall (e.g., `execve`, `mmap`, `ptrace`) triggers the default `KILL`, terminating the process instantly—preventing a breakout even if the server is compromised.

### Example 4: Creating a Restricted User Namespace with UID Mapping
**Goal:** Run a shell as UID 1000 inside a new user namespace, but map it to an unprivileged UID 65534 outside, limiting privileged operations.

**Commands:**
```bash
# Unshare a new user namespace and keep a shell
unshare --user --map-root-user --fork bash
# Inside the new namespace:
cat /proc/$$/uid_map
# Expected: 0       65534     1
# (maps inner UID 0 -> outer UID 65534)
# Try to chown a file (should fail with EPERM)
touch /tmp/testfile
chown 65534:65534 /tmp/testfile  # fails
# But we can setgid inside the namespace because we have CAP_SETGID there
```
**Explanation:**  
`unshare --user --map-root-user` creates a user namespace where the caller’s UID is mapped to UID 0 inside, but the kernel also writes a uid_map that maps inner UID 0 to an outer UID taken from `/proc/sys/kernel/overflowuid` (usually 65534). Consequently, although the process sees itself as root, it lacks real privileges; privileged syscalls like `setuid(0)` are allowed inside the namespace but have no effect outside. This demonstrates **namespace isolation** plus **capability limiting**.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---|---|---|
| **Relying on module signing without enabling `CONFIG_MODULE_SIG_FORCE`** | The kernel will load unsigned modules if a matching key isn’t found, only logging a warning. | Attackers can drop a malicious `.ko` in `/lib/modules` and load it via `insmod`; signature check is bypassed silently. |
| **Using a weak RSA key (≤ 1024 bits) for module signatures** | Signature forgery becomes feasible with modest resources. | Compromised key lets attackers sign arbitrary modules, defeating the whole trust chain. |
| **AppArmor profile missing `deny` rules for sensitive files** | Default is *allow*; forgetting to explicitly deny `/etc/shadow` leaves it readable. | A compromised service inheriting the profile can still leak credentials. |
| **Seccomp filter omitting `SCMP_ACT_ERRNO` for `open` and using `SCMP_ACT_KILL` instead** | Killing the process on every `open` attempt may break legitimate functionality (e.g., reading config). | Over‑restriction leads to denial‑of‑service; finer‑grained errno returns allow fallback paths. |
| **Failing to mount `proc` inside a new PID namespace** | `ps` and `/proc/<pid>/` appear empty, causing confusion and breaking tools that rely on procfs. | Essential utilities (`top`, `kill`, `systemd`) malfunction, leading to operational instability. |
| **Using `CLONE_NEWUSER` without setting `uid_map`/`gid_map`** | The process has no valid UID/GID inside the namespace; many syscalls fail with `EINVAL`. | Prevents creation of a usable isolated environment; administrators may mistakenly think namespaces are broken. |
| **Assuming `seccomp` blocks all file access** | Seccomp filters syscalls, not VFS paths; a process can still `open` files if the syscall is allowed. | A filter that allows `open` but not `read` still leaks file metadata; path‑based MAC (e.g., AppArmor) is still needed. |
| **Stacking multiple LSMs without understanding order** | The first LSM that returns non‑zero decides; later LSMs never see the call. | Adding a weak LSM before a strong one can unintentionally weaken security (e.g., placing `yamalow` before SELinux). |

---

## Exercises
### Easy
1. **Verify module signatures**  
   ```bash
   # Show whether a loaded module is signed
   modinfo -F sig_name $(basename $(modinfo -F filename vboxdrv))
   # Check kernel enforces signing
   sysctl kernel.modules_sig_enforce
   ```
2. **List active AppArmor profiles**  
   ```bash
   sudo aa-status
   ```
3. **Create a basic seccomp filter that only allows `exit`**  
   Write a C program using libseccomp (as in the sandbox example) that loads a filter with default `KILL` and only `ALLOW` for `SCMP_SYS(exit)`.
