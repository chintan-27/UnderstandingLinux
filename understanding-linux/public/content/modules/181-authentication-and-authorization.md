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

## Core Concepts
### Introduction to Authentication and Authorization
Authentication proves *who* a principal is; authorization decides *what* that principal may do. In Linux the two are decoupled: authentication mechanisms (passwords, keys, tokens) feed the kernel’s credential subsystem, while authorization is enforced by discretionary access control (DAC) via file mode bits, POSIX capabilities, and increasingly by mandatory access control (MAC) frameworks such as SELinux or AppArmor. Understanding the flow from secret verification to credential construction is essential for hardening any service.

### Passwords
A password is a shared secret * *s* * that the system stores in a form that does not reveal *s* if the storage is compromised. Historically UNIX used a one‑way hash * h = crypt(s, salt)* * with DES‑based `crypt(3)`. Modern shadows use stronger algorithms (SHA‑256, SHA‑512, yescrypt) with per‑user salts and configurable work factors. The salt defeats pre‑computed rainbow tables; the work factor throttles brute‑force attempts.  

When a login program receives a candidate password *p*, it retrieves the stored shadow entry, extracts the salt, computes `crypt(p, salt)`, and compares the result to the stored hash. Equality implies *p = s* with overwhelming probability because the hash function is collision‑resistant for the chosen work factor.

### PAM Concepts
Pluggable Authentication Modules (PAM) provide an abstraction layer between applications and authentication schemes. An application links against `libpam` and calls `pam_start()`, `pam_authenticate()`, `pam_acct_mgmt()`, etc. The PAM library reads configuration files under `/etc/pam.d/` (or `/etc/pam.conf`) which list **module type** (`auth`, `account`, `password`, `session`), **control flag** (`required`, `requisite`, `sufficient`, `optional`), and the **module path** (e.g., `pam_unix.so`).  

Modules are executed in order; the overall success/failure is determined by the control flags using a short‑circuit algebra:
- `required`: all must succeed; failure is recorded but processing continues.
- `requisite`: failure returns immediately.
- `sufficient`: success returns immediately (if no prior required failed).
- `optional`: ignored unless it is the only module of its type.

This stacking enables multi‑factor authentication (MFA) without changing the application source.

### Tokens
A hardware or software token generates a **One‑Time Password (OTP)** that is valid for a short interval. The most common scheme is **TOTP** (RFC 6238):  
$$ \text{OTP} = \text{Truncate}\big(HMAC\text{-}SHA1(K, \lfloor T / X \rfloor)\big) $$
where *K* is a secret key shared with the token, *T* is the current Unix time, *X* is the timestep (usually 30 s), and `Truncate` yields a 6‑digit decimal code.  

Because the OTP depends only on *K* and the current time interval, both sides can compute the same value without network communication, yet an observer who sees a single OTP cannot predict future ones without *K*. Tokens thus add a **something you have** factor to the traditional **something you know** (password).

### Policy
Authorization policies map authenticated credentials to allowed operations. In Linux the simplest policy is the file’s mode bits: `rwx` for owner, group, others. More expressive policies are encoded in:
- **POSIX capabilities** (e.g., `CAP_NET_BIND_SERVICE` lets a non‑root process bind ports < 1024).
- **SELinux/AppArmor** type enforcement: a subject (process) labeled *t* may perform class *c* on object *o* only if a rule `allow t o:c` exists in the policy.
- **sudoers** (`/etc/sudoers`) which specifies which users may run which commands as which target user, optionally with NOPASSWD or environment restrictions.

Policy decisions are made after the kernel has constructed the credential structure (`struct cred`) from the authentication phase; subsequent syscalls check this credential against the policy.

---

## How It Works
### Authentication Process (Step‑by‑Step)
1. **Credential acquisition** – The user supplies a username and secret (password, OTP, key).  
2. **Lookup** – `login` (or `sshd`, `su`, etc.) calls `getspnam()` to fetch the shadow entry for the username. The shadow line has the format:  
   `username:hash:lastchg:min:max:warn:inact:expire:flag`  
   where `hash` follows `$id$salt$encrypted` (e.g., `$6$salt$...` for SHA‑512).  
3. **Hash verification** – The auth module extracts the salt and compute `crypt(candidate, salt)`. Equality is checked via `strcmp()`.  
4. **PAM stacking** – If the password hash matches, control passes to the PAM stack configured for the service (e.g., `/etc/pam.d/sshd`). Each module may:
   - verify a second factor (`pam_oath.so` for TOTP),
   - check account expiration (`pam_unix.so` account module),
   - set environment (`pam_env.so`),  
   - establish a session (`pam_limits.so`).  
5. **Credential construction** – On success, PAM calls `pam_setcred()` which updates the process’s `uid`, `gid`, supplementary groups, and Linux capabilities. The kernel’s `struct cred` now represents the authenticated subject.  
6. **Authorization check** – Subsequent syscalls (e.g., `open()`, `execve()`) compare the subject’s credentials against the object’s ACL, capabilities, or MAC policy.

### PAM Module Stacking – Detailed Mechanics
Consider the SSH daemon’s auth stack (`/etc/pam.d/sshd`):

```
auth    required   pam_sepermit.so          # if AllowUsers/DenyUsers in sshd_config
auth    required   pam_env.so               # read /etc/environment, ~/.pam_env
auth    required   pam_unix.so nullok       # password verification (shadow)
auth    required   pam_oath.so usersfile=/etc/users.oath  # TOTP check
account required   pam_unix.so              # account expiration, password change
session required   pam_limits.so            # enforce ulimits
session required   pam_loginuid.so          # set loginuid audit field
```

- **Control flow**: If `pam_sepermit.so` fails, the attempt is rejected immediately because it is `required`.  
- If it succeeds, processing continues to `pam_env.so` (always succeeds unless fatal error).  
- `pam_unix.so` with `nullok` allows empty passwords only if the shadow field is empty; otherwise it verifies the password hash. Failure is recorded but does **not** abort because later `required` modules could still succeed (though in practice we want all to succeed).  
- `pam_oath.so` computes TOTP from the shared secret stored in `/etc/users.oath` and compares it to the user‑supplied OTP. Failure aborts the stack because it is `required`.  
- Only when all `required` modules succeed does PAM return `PAM_SUCCESS` to the daemon, which then proceeds to account and session modules.

### Token‑Based Authentication – TOTP Derivation
Let the shared secret be a base‑32 string *K* (decoded to raw bytes). Define the time counter:
$$ C = \left\lfloor \frac{T - T_0}{X} \right\rfloor $$
with epoch `T0 = 0` and step `X = 30 s`.  
The HMAC‑SHA1 output is 20 bytes. Dynamic truncation (per RFC 4226) selects an offset *o* from the low‑order 4 bits of byte 19:
$$ o = \text{HMAC}[19] \& 0x0f $$
Then the 32‑bit integer:
$$ \text{BI} = (\text{HMAC}[o] \& 0x7f) << 24 \;|\; (\text{HMAC}[o+1] \& 0xff) << 16 \;|\; (\text{HMAC}[o+2] \& 0xff) << 8 \;|\; (\text{HMAC}[o+3] \& 0xff) $$
The OTP is `BI mod 10^6`, zero‑padded to six digits.  

If the server allows a **window** of *w* steps (commonly w = 1 to tolerate clock skew), it accepts any OTP where `|C - C'| ≤ w`. The probability of a random guess succeeding in one attempt is $1/10^6$; with *w* = 2 the odds become $2/10^6$, still negligible.

---

## Worked Examples
### Example 1: Password Hash Verification with `crypt(3)`
Suppose the shadow entry for user *alice* is:
```
alice:$6$Vh2gFz9L$G5JZx0V8eU6b2YfKjZl8uR9tYbX6Q2eJc4vL0pR9k7t3u1v2w3x4y5z6a7b8c9d0e:19000:0:99999:7:::
```
The algorithm identifier `$6$` denotes SHA‑512 with 5000 rounds (default on glibc 2.3+). Salt is `Vh2gFz9L`.  

**C program to verify a candidate password**:
```c
#define _XOPEN_SOURCE   /* needed for crypt */
#include <stdio.h>
#include <string.h>
#include <unistd.h>     /* for _PASSWORD_LEN */

int main(void)
{
    const char *candidate = "correcthorsebatterystaple";
    const char *shadow_hash = "$6$Vh2gFz9L$G5JZx0V8eU6b2YfKjZl8uR9tYbX6Q2eJc4vL0pR9k7t3u1v2w3x4y5z6a7b8c9d0e";

    /* crypt() will use the salt embedded in shadow_hash */
    char *computed = crypt(candidate, shadow_hash);
    if (computed == NULL) {
        perror("crypt");
        return 1;
    }

    if (strcmp(computed, shadow_hash) == 0)
        puts("Password matches");
    else
        puts("Password mismatch");
    return 0;
}
```
Compile with `gcc -Wall -O2 verify.c -lcrypt -o verify`.  
Running it with the correct password prints *Password matches*; any wrong candidate yields mismatch. The work factor (5000 SHA‑512 rounds) makes each `crypt()` call ~0.5 ms on a modern CPU, limiting brute‑force to a few thousand guesses per second per core.

### Example 2: PAM Stack for Multi‑Factor SSH
Create a custom PAM service `/etc/pam.d/ssh-mfa`:
```bash
#%PAM-1.0
auth    required   pam_env.so
auth    required   pam_unix.so try_first_pass nullok
auth    required   pam_oath.so usersfile=/etc/ssh/oath_userinfo window=3
account required   pam_unix.so
session required   pam_limits.so
session required   pam_loginuid.so
```
Explanation:
- `try_first_pass` tells `pam_unix.so` to reuse the password supplied by the previous module (none yet), prompting the user if needed.  
- `nullok` allows empty passwords only if the shadow field is empty (disabled for production).  
- `pam_oath.so` expects a file `/etc/ssh/oath_userinfo` with lines like:  
  `alice HMAC-SHA1 160530 30 - 3000`  
  where `160530` is the base‑32 secret, `30` the step, and `window=3` allows ±90 s clock skew.  
- If either password or OTP fails, the stack returns `PAM_AUTH_ERR` and SSH aborts the login.

Test with:
```bash
ssh -o PAMServiceName=ssh-mfa alice@localhost
```
You will be prompted for password, then for the OTP from your authenticator app.

### Example 3: Implementing TOTP in C (RFC 6238)
```c
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdint.h>
#include <time.h>
#include <openssl/hmac.h>
#include <string.h>

/* Base32 decode (RFC 4648) – simplified for illustration */
static void b32decode(const char *src, uint8_t *out, size_t *outlen)
{
    const char *table = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    uint32_t bits = 0, next = 0, count = 0;
    size_t i = 0, o = 0;
    while (src[i]) {
        char c = src[i++];
        if (c == ' ') continue;
        const char *p = strchr(table, c);
        if (!p) continue;
        uint32_t val = (uint32_t)(p - table);
        bits = (bits << 5) | val;
        next += 5;
        if (next >= 8) {
            next -= 8;
            out[o++] = (bits >> next) & 0xff;
            count++;
        }
    }
    *outlen = o;
}

/* Dynamic truncation per RFC 4226 */
static uint32_t truncate(const uint8_t *hmac, size_t hlen)
{
    int offset = hmac[hlen - 1] & 0x0f;
    uint32_t bin = ((hmac[offset]   & 0x7f) << 24) |
                   (hmac[offset+1]  << 16) |
                   (hmac[offset+2]  <<  8) |
                    hmac[offset+3];
    return bin;
}

int main(void)
{
    const char *b32_secret = "JBSWY3DPEHPK3PXP";   // example secret → "HELLOWORLD"
    uint8_t key[16];
    size_t keylen;
    b32decode(b32_secret, key, &keylen);

    time_t t = time(NULL);
    uint64_t C = t / 30;                     // TOTP timestep
    unsigned char hmac[EVP_MAX_MD_SIZE];
    unsigned int hlen;

    HMAC(EVP_sha1(), key, keylen,
         (unsigned char *)&C, sizeof(C),
         hmac, &hlen);

    uint32_t truncated = truncate(hmac, hlen);
    uint32_t otp = truncated % 1000000;      // 6‑digit code

    printf("TOTP for %ld: %06u\n", (long)t, otp);
    return 0;
}
```
Compile: `gcc -Wall -O2 totp.c -lcrypto -o totp`.  
Running yields a six‑digit code that matches Google Authenticator for the same secret and time step. The code demonstrates the full derivation from secret → HMAC‑SHA1 → truncation → modulo.

---

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Storing passwords in `/etc/passwd`** (plaintext or weak DES) | `/etc/passwd` is world‑readable; any local user can read the hash and launch offline attacks. | Credential compromise leads to privilege escalation. |
| **Using DES‑based `crypt` without per‑user salt** | DES is broken (≈2⁵⁶ work) and identical passwords produce identical hashes, enabling rainbow‑table attacks. | Attackers can recover passwords for many users simultaneously. |
| **Configuring PAM with `sufficient` before `required` modules** | A `sufficient` module that succeeds (e.g., `pam_permit.so`) will cause PAM to return success *even if later required modules would have failed*. | Authentication bypass; attackers can log in without satisfying policy. |
| **Reusing the same TOTP secret across multiple services** | If one service leaks the secret (e.g., via logs), an attacker can generate valid OTPs for *all* services. | Correlation of breach expands attack surface. |
| **Setting `pam_unix.so` `nullok` in production** | Allows authentication with an empty password when the shadow field is empty (often the case for disabled accounts). | Unauthorized access via accounts intended to be locked. |
| **Neglecting to update the `loginuid` audit field** | Without `pam_loginuid.so`, the kernel’s loginuid remains unset, breaking audit correlation (`ausearch -ui 1000`). | Loss of forensic traceability; actions cannot be tied to a specific login session. |
| **Using weak entropy for token seeds** (e.g., a 4‑digit PIN) | OTP security relies on the secrecy of *K*; low‑entropy seeds are guessable. | Brute‑force of the secret becomes feasible, defeating the second factor. |

---

## Exercises
### Easy
1. **Shadow inspection** – Run `sudo grep ^alice /etc/shadow` and interpret each field. Explain the meaning of the `$id$` algorithm identifier and the salt length.  
2. **PAM dry‑run** – Use `pamtester` (`sudo apt install pamtester`) to test the `ssh` service:  
   ```bash
   pamtester ssh alice authenticate
   ```  
   Observe the prompts for password and (if configured) OTP.

### Medium
3. **Custom PAM module** – Write a simple PAM module (`pam_hello.so`) that prints “Hello, <user>!” on success and returns `PAM_SUCCESS`. Compile with:  
   ```bash
   gcc -fPIC -DPIC -shared pam_hello.c -lpam -o pam_hello.so
   ```  
   Install it to `/lib/x86_64-linux-gnu/security/` and add a line `auth optional pam_hello.so` to `/etc/pam.d/sshd`. Verify that the message appears upon login.  
4. **TOTP verification server** – Extend the C TOTP example to accept a user‑provided OTP via stdin, compare it to the computed value, and exit with code 0 on match, 1 otherwise. Use `getopt` to allow specifying the secret and window size.

### Hard
5. **Implement RFC 6238‑compliant TOTP with HMAC‑SHA256** – Modify the TOTP code to use `EVP_sha256()` and produce a 6‑digit code via dynamic truncation (RFC 4226 works for any HMAC length). Test against the reference implementation (`oathtool --totp -v`).  
6. **SELinux policy for PAM** – Create a custom SELinux type `pam_totp_t` and allow `sshd_t` to read `/etc/ssh/oath_userinfo` only if the file is labeled `pam_totp_t`. Show the `audit2allow` steps and verify with `sealert -a /var/log/audit/audit.log`.  
7. **Brute‑force resistance measurement** – Write a script that times how many SHA‑512‑based `crypt()` calls your CPU can perform per second (`openssl speed -evp sha512`). Use this to calculate the expected time to exhaust a 8‑character alphanumeric password (62⁸ combinations). Report the result in days/years.

---

## Linux Connection
- **Shadow password subsystem** – `/etc/shadow` (owned by `root:shadow`, mode `0640`). Fields are colon‑separated; the hash field follows `$id$salt$hash`.  
  ```bash
  sudo cat /etc/shadow | head -n 1
  # Output example: root:$6$.salt$...:19000:0:99999:7:::
  ```
- **getspnam(3)** – Retrieves a shadow entry:  
  ```c
  #include <shadow.h>
  struct spwd *getspnam(const char *name);
  ```
  Returns a pointer to a struct containing `sp_pwdp` (the hashed password).  
- **crypt(3)** – Generic password hashing function:  
  ```c
  #include <unistd.h>
  char *crypt(const char *key, const char *salt);
  ```
  The salt encodes algorithm (`$1$`=MD5, `$2a$`=bcrypt, `$5$`=SHA‑256, `$6$`=SHA‑512, `$y$`=yescrypt).  
- **PAM configuration** – Files under `/etc/pam.d/`. Service name matches the daemon (e.g., `sshd`, `login`, `su`).  
  Example line: `auth required pam_tally2.so deny=5 unlock_time=900` locks an account after five failed attempts.  
- **Pluggable modules** – Located in `/lib/x86_64-linux-gnu/security/` (Debian/Ubuntu) or `/lib64/security/` (RHEL). Each is a `.so` object implementing the PAM function set (`pam_sm_authenticate`, `pam_sm_acct_mgmt`, etc.).  
- **Credential structure** – After successful authentication, the kernel’s `struct cred` (found in `<linux/cred.h>`) holds `uid`, `gid`, `cap_effective`, etc. The `switch_task_creds()` function is used by `setuid()`/`setgid()` helpers.  
- **Audit loginuid** – Set by `pam_loginuid.so`; readable via `/proc/<pid>/loginuid`.  
  ```bash
  cat /proc/$$/loginuid   # shows the UID of the user that logged in this session
  ```
- **TOTP helper** – The `oathtool` package provides CLI TOTP generation/validation:  
  ```bash
  oathtool --totp -b JBSWY3DPEHPK3PXP   # base32 secret
  ```
- **sudoers** – `/etc/sudoers` (edited via `visudo`). Example line granting password‑less `systemctl` for the `admin` group:  
  `%admin ALL=(ALL) NOPASSWD: /bin/systemctl`  

---

## Why This Matters
Authentication and authorization are the gatekeepers of every privileged operation on a Linux system. A flaw in password storage (e.g., leaving hashes in `/etc/passwd` or using a weak `crypt` algorithm) lets an attacker recover credentials offline, after which *any* service that trusts those credentials becomes vulnerable—**privilege escalation is often just a single compromised password away**.  

PAM’s modular design lets administrators compose **defense‑in‑depth** stacks: password + TOTP + account lockout + audit logging. Understanding the control‑flag algebra (`required`, `requisite`, `sufficient`, `optional`) prevents subtle misconfigurations that can silently bypass factors (a classic pitfall is placing a `sufficient` `pam_permit.so` before a `required` password check).  

Tokens add a *something you have* factor that mitigates credential theft; the mathematics of TOTP (HMAC‑based, time‑bound, truncation) guarantees that observing a single OTP reveals nothing about future ones, provided the secret stays secret.  

Finally, authorization policies—whether simple file mode bits, POSIX capabilities, or MAC frameworks like SELinux—rely on the **credential** constructed after authentication. If the credential is incorrect or overly permissive, the policy cannot protect the system. Mastering these mechanisms enables you to build systems where **only the right subject, with the right proof of identity, can exercise the right privilege**, which is the foundation of secure multi‑user environments, container isolation, and cloud‑scale infrastructure.
