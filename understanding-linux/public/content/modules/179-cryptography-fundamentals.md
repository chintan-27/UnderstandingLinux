---
id: 179
title: "Cryptography fundamentals"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to Cryptography
Cryptography provides **confidentiality**, **integrity**, **authenticity**, and **non‑repudiation** by reducing these goals to hard mathematical problems. Confidentiality prevents unauthorized reading; integrity guarantees that any alteration is detectable; authenticity binds a message to a claimed sender; non‑repudiation prevents the sender from denying authorship. These properties are achieved through primitives whose security rests on assumptions such as the difficulty of factoring large integers, computing discrete logarithms, or finding collisions in hash functions.

### Hashing
A cryptographic hash function \(H : \{0,1\}^* \rightarrow \{0,1\}^n\) maps arbitrarily long inputs to a fixed‑length digest. It must satisfy:

1. **Pre‑image resistance**: given \(y\), finding any \(x\) such that \(H(x)=y\) is infeasible.  
2. **Second‑pre‑image resistance**: given \(x\), finding \(x'\neq x\) with \(H(x')=H(x)\) is infeasible.  
3. **Collision resistance**: finding any distinct \(x,x'\) with \(H(x)=H(x')\) is infeasible.

These properties follow from the **avalanche effect** (a single‑bit input change flips ~½ of output bits) and the **Merkle‑Damgård** construction, which processes the message in fixed‑size blocks using a compression function \(C\). If \(C\) is collision‑resistant, the overall hash inherits resistance.

### Symmetric Encryption
Symmetric schemes use a single secret key \(k\) for both encryption \(E_k\) and decryption \(D_k\), with \(D_k(E_k(p))=p\). Security relies on the **confusion** and **diffusion** principles introduced by Shannon: confusion obscures the relationship between key and ciphertext; diffusion spreads plaintext statistics over many ciphertext bits. Block ciphers achieve this via rounds of substitution‑permutation networks. For AES‑128, each round consists of:

- **SubBytes**: non‑linear byte substitution using an S‑box (inverse in \(\mathbb{F}_{2^8}\) followed by affine transform).  
- **ShiftRows**: cyclic shift of rows; provides diffusion across columns.  
- **MixColumns**: matrix multiplication over \(\mathbb{F}_{2^8}\); spreads each column’s influence.  
- **AddRoundKey**: XOR with round key derived from \(k\) via the key schedule.

After \(Nr\) rounds (10 for AES‑128), the output is ciphertext. Decryption applies the inverse operations in reverse order.

### Asymmetric Encryption
Public‑key cryptography separates encryption and decryption keys. RSA, the most widely used scheme, is based on the **integer factorization problem**. Key generation:

1. Choose two distinct large primes \(p,q\).  
2. Compute \(n=pq\) and \(\phi(n)=(p-1)(q-1)\).  
3. Select public exponent \(e\) with \(1<e<\phi(n)\) and \(\gcd(e,\phi(n))=1\).  
4. Compute private exponent \(d\equiv e^{-1}\pmod{\phi(n)}\).

Encryption: \(c \equiv p^{e}\pmod n\).  
Decryption: \(p \equiv c^{d}\pmod n\).

Correctness follows from **Euler’s theorem**: \(a^{\phi(n)}\equiv1\pmod n\) for \(\gcd(a,n)=1\). Thus  
\(c^{d}\equiv(p^{e})^{d}\equiv p^{ed}\equiv p^{1+k\phi(n)}\equiv p\pmod n\).

Security: recovering \(p\) from \(c\) requires computing \(e\)-th roots modulo \(n\), which is as hard as factoring \(n\).

### Digital Signatures
A signature scheme proves authenticity and integrity. RSA signatures are the inverse of encryption: the signer computes \(\sigma \equiv s^{d}\pmod n\) where \(s\) is a padded hash of the message; the verifier checks \(s' \equiv \sigma^{e}\pmod n\) and validates the padding and hash. Padding (PKCS#1 v1.5 or PSS) prevents existential forgery by ensuring that only the signer, who knows \(d\), can produce a valid \(\sigma\).

### Key Exchange
Diffie‑Hellman (DH) enables two parties to derive a shared secret without transmitting it. Public parameters: a large prime \(p\) and generator \(g\) of \(\mathbb{Z}_p^{\*}\). Each party chooses a private exponent (\(a\) or \(b\)), computes public values \(A=g^{a}\bmod p\) and \(B=g^{b}\bmod p\), and exchanges them. The shared secret is  

\[
K = B^{a}\equiv g^{ab}\equiv A^{b}\pmod p .
\]

An eavesdropper seeing \(g, p, A, B\) must solve the **diffie‑hellman problem**: compute \(g^{ab}\) from \(g^{a}\) and \(g^{b}\), which is infeasible under the discrete logarithm assumption.

## How It Works
### Hash Function Construction (Merkle‑Damgård)
Let the message \(M\) be padded to a multiple of block size \(b\) bits, split into blocks \(M_1,\dots,M_t\). Define an initial vector \(IV\) (fixed constant). For each block:

\[
H_i = C(H_{i-1}, M_i),\quad H_0 = IV .
\]

The output digest is \(H_t\). If the compression function \(C\) is modeled as a random function, finding a collision requires about \(2^{n/2}\) operations (birthday bound). For SHA‑256, \(n=256\), so collision resistance is ~\(2^{128}\).

### Symmetric Encryption Example: AES‑128 in CBC Mode
Cipher Block Chaining (CBC) adds an initialization vector (IV) \(IV\) and computes:

\[
C_0 = IV,\quad C_i = E_k(P_i \oplus C_{i-1})\;(1\le i\le t).
\]

Decryption:

\[
P_i = D_k(C_i) \oplus C_{i-1}.
\]

The XOR with previous ciphertext ensures that identical plaintext blocks produce different ciphertext blocks, thwarting codebook attacks.

### Asymmetric Encryption Example: RSA with OAEP Padding
Optimal Asymmetric Encryption Padding (OAEP) expands the plaintext \(m\) to a block \(x\) of length \(k\) bytes using a mask‑generation function (MGF) based on a hash \(H\). Encryption:

\[
c = (x^{e} \bmod n).
\]

Decryption recovers \(x\) via \(x = c^{d} \bmod n\) and then removes OAEP to obtain \(m\). OAEP prevents chosen‑ciphertext attacks by introducing randomness that is infeasible to invert without the private key.

### Digital Signature Example: RSA‑PSS
Probabilistic Signature Scheme (PSS) encodes the message hash \(H(m)\) into an EMSA‑PSS encoded message \(EM\) using a salt and MGF. Signature:

\[
\sigma = (EM^{d} \bmod n).
\]

Verification computes \(EM' = \sigma^{e} \bmod n\) and checks that \(EM'\) matches the PSS encoding of \(H(m)\). The salt ensures signatures are probabilistic, thwarting replay attacks.

### Key Exchange Example: Diffie‑Hellman with 2048‑bit Prime
Choose a safe prime \(p = 2q+1\) where \(q\) is also prime (ensuring a large subgroup). Let \(g\) be a generator of the order‑\(q\) subgroup. Private keys \(a,b\) are random integers in \([2,q-2]\). The shared secret \(K = g^{ab}\bmod p\) is then fed into a key‑derivation function (e.g., HKDF‑SHA256) to produce symmetric keys for AES‑GCM.

## Worked Examples
### Example 1: SHA‑256 of “Hello, World!”
```bash
# Compute SHA-256 digest without trailing newline
printf 'Hello, World!' | sha256sum
```
Output:
```
315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3  -
```
*Explanation*: `printf` omits the newline that `echo` would add; `sha256sum` reads the exact bytes, processes them through the Merkle‑Damgård compression function (64 rounds of bitwise operations, modular additions, and constant additions), and yields the 256‑bit hash shown.

### Example 2: AES‑128‑CBC Encryption with OpenSSL
```bash
# Generate a random 16‑byte key and IV
KEY=$(openssl rand -hex 16)   # e.g., 8f3c2a1b9e4d6a7c5f0123456789abcd
IV=$(openssl rand -hex 16)    # e.g., a1b2c3d4e5f60718293a4b5c6d7e8f90

# Encrypt
printf 'Hello, World!' | openssl enc -aes-128-cbc -K $KEY -iv $IV -nosalt -base64
```
Sample ciphertext (base64):
```
U2FsdGVkX1+xxxxxx...
```
*Explanation*: The `-nosalt` flag disables OpenSSL’s default salt; we supply our own key and IV. The plaintext is padded with PKCS#7 to a multiple of 16 bytes, then each block is XOR‑ed with the previous ciphertext block (or IV for the first) before AES‑128 encryption. Decryption reverses the process:
```bash
printf 'U2FsdGVkX1+xxxxxx...' | openssl enc -d -aes-128-cbc -K $KEY -iv $IV -base64
```
returns the original plaintext.

### Example 3: RSA‑PSS Signature with OpenSSL
```bash
# Generate a 2048‑bit RSA key pair
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private_key.pem
openssl rsa -pubout -in private_key.pem -out public_key.pem

# Create a file to sign
printf 'Hello, World!' > message.txt

# Sign using PSS with SHA‑256
openssl dgst -sha256 -sign private_key.pem -out signature.bin message.txt

# Verify
openssl dgst -sha256 -verify public_key.pem -signature signature.bin message.txt
# Output: Verified OK
```
*Explanation*: The `-sign` operation computes `EMSA-PSS` encoding of `SHA256(message)`, raises it to the private exponent `d` modulo `n`, and writes the raw signature. Verification raises the signature to the public exponent `e` and checks that the recovered EMSA‑PSS block matches a fresh encoding of the hash.

### Example 4: Diffie‑Hellman Shared Secret via OpenSSL
```bash
# Generate DH parameters (2048‑bit safe prime)
openssl dhparam -out dhparams.pem 2048

# Party A: generate private/public pair
openssl pkeyutl -derive -inkey privateA.pem -peerpub pubB.pem -out secretA.bin

# Party B: analogous
openssl pkeyutl -derive -inkey privateB.pem -peerpub pubA.pem -out secretB.bin

# Both files contain the same raw shared secret (e.g., 256 bytes)
cmp secretA.bin secretB.bin && echo "Secrets match"
```
*Explanation*: `pkeyutl -derive` performs the DH calculation \(K = (peer\_public)^{private} \bmod p\). The resulting byte strings are identical, confirming that both parties derived the same secret without transmitting it.

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---|---|---|
| **Using ECB mode** for block ciphers (e.g., `openssl enc -aes-128-ecb`) | Identical plaintext blocks produce identical ciphertext blocks. | Leaks structure; an attacker can infer plaintext patterns (e.g., bitmap images remain recognizable). |
| **RSA encryption without padding** (raw `m^e mod n`) | Deterministic; small messages may be vulnerable to cube‑root attacks. | An attacker can recover `m` by taking the integer e‑th root when `m^e < n`. |
| **Reusing IV in CBC or CTR mode** | Same IV with same key leads to xor‑of‑plaintexts exposure. | In CTR, reuse reduces to a many‑time pad; XOR of two ciphertexts yields XOR of plaintexts, enabling trivial recovery. |
| **Using non‑cryptographic random number generators** (e.g., `rand()`) for keys or nonces | Predictable output reduces entropy. | Brute‑force or state‑recovery attacks become feasible; e.g., Debian OpenSSL RNG flaw (CVE‑2008‑0166) allowed predictable keys. |
| **Accepting self‑signed certificates without verification** in TLS | No chain‑of‑trust validation. | Man‑in‑the‑middle can present any certificate; encryption provides confidentiality but not authenticity. |
| **Hash length extension attacks** on Merkle‑Damgård hashes (e.g., using SHA‑1 directly in MAC) | Given `H(m)`, attacker can compute `H(m‖padding‖extra)` without knowing `k`. | Invalidates naïve MAC constructions like `H(key‖message)`. Use HMAC instead. |
| **Using small Diffie‑Hellman groups** (e.g., 1024‑bit prime) | Subgroup attacks or pre‑computation become viable. | Well‑funded adversaries can solve discrete logs for these groups; modern recommendations are ≥2048‑bit or elliptic‑curve DH. |

## Exercises
### Easy
1. **Hash Playground** – Write a Bash script that hashes a given string with SHA‑1, SHA‑256, and SHA‑512 using `openssl dgst`. Compare output lengths and observe the avalanche effect by flipping one input bit.
2. **AES‑ECB vs CBC** – Encrypt a 64‑byte repeated pattern (`printf 'A%.0s' {1..64}`) with AES‑128‑ECB and AES‑128‑CBC (random IV). View the hex dumps; explain why ECB reveals patterns.
3. **RSA Key Generation** – Generate a 1024‑bit RSA key pair (`openssl genpkey -out key.pem 1024`). Extract modulus and exponent (`openssl rsa -in key.pem -noout -modulus -openssl rsa -in key.pem -noout -pubout`). Verify that `modulus = p·q`.

### Intermediate
4. **HMAC Construction** – Implement HMAC‑SHA256 in Bash using `openssl dgst -hmac`. Verify with test vectors from RFC 2202.
5. **RSA‑PSS Sign/Verify** – Create a 2048‑bit RSA key pair, sign a file with `openssl dgst -sha256 -sign`, then verify. Modify one byte of the file and confirm verification fails.
6. **Diffie‑Hellman Demo** – Use `openssl genpkey -param_enc explicit -algorithm DH -out dhparam.pem` to generate parameters, then have two parties compute shared secrets via `pkeyutl -derive`. Derive AES‑256‑GCM keys from the secret using `openssl enc -aes-256-gcm -k <hex>` and encrypt/decrypt a message.

### Hard
7. **Toy Merkle‑Damgård Hash** – Write a Python program that implements a simplified Merkle‑Damgård hash with a custom compression function (e.g., Davies‑Meyer with a toy block cipher). Test collision resistance by attempting to find a pair of 4‑block messages that collide (birthday attack ~2⁴ work).
8. **Side‑Channel Resistant AES** – Using OpenSSL’s EVP API, encrypt data with AES‑128‑CTR while ensuring the nonce is never reused. Log the number of encryptions per nonce and discuss why nonce reuse defeats CTR security.
9. **Protocol Analysis** – Capture a TLS handshake with `openssl s_client -connect www.example.com:443 -tls1_3 -debug`. Extract the negotiated cipher suite, verify that the key‑share uses an elliptic curve (e.g., X25519), and explain how forward secrecy is achieved.

## Linux Connection
### Kernel Cryptographic API
The Linux kernel provides a **crypto subsystem** (`/lib/modules/$(uname -r)/kernel/crypto/`) that registers algorithms via the `crypto_alg` structure. Users can list available algorithms:

```bash
cat /proc/crypto
```
Output includes entries like:
```
name         : sha256
driver       : sha256-generic
module       : kernel
priority     : 0
refcnt       : 1
...
name         : aes
driver       : aes-generic
module       : kernel
priority     : 0
...
```

### User‑Space Access
#### AF_ALG Socket
Applications can access kernel crypto via the **AF_ALG** socket family:

```c
#include <sys/socket.h>
#include <linux/if_alg.h>
#include <string.h>
int fd = socket(AF_ALG, SOCK_SEQPACKET, 0);
struct sockaddr_alg sa = {
    .salg_family = AF_ALG,
    .salg_type   = "skcipher",
    .salg_name   = "cbc(aes)"
};
bind(fd, (struct sockaddr *)&sa, sizeof(sa));
```
Then send `setkey` and `crypt` operations via `sendmsg`/`recvmsg`. This avoids copying data to user space for high‑throughput workloads.

#### /dev/crypto (Deprecated)
Older kernels exposed `/dev/crypto` via the `cryptodev` module; modern systems prefer AF_ALG or the `cryptodev` compatibility layer.

### Filesystem Encryption
* **dm‑crypt** – Device‑mapper target providing transparent block‑level encryption.  
  ```bash
  # Create an encrypted loop device
  dd if=/dev/zero of=/tmp/img.img bs=1M count=100
  losetup /dev/loop0 /tmp/img.img
  cryptsetup luksFormat /dev/loop0
  cryptsetup open /dev/loop0 cryptvol
  mkfs.ext4 /dev/mapper/cryptvol
  mount /dev/mapper/cryptvol /mnt/secret
  ```
* **eCryptfs** – Stacked cryptographic filesystem (now largely superseded by fscrypt).

### Tools and Libraries
| Tool/Library | Purpose | Example Command |
|--------------|---------|-----------------|
| `openssl` | Command‑line cryptography (TLS, key generation, symmetric/asymmetric ops) | `openssl rand -hex 32` |
| `gnutls-cli` | TLS client/debugger | `gnutls-cli --debug 9 --port 443 www.example.com` |
| `ipsec` / `strongswan` | IPsec VPN keying (IKEv2) | `swanctl --list-sas` |
| `ss` / `netstat` | Inspect TCP socket state (shows `tcp_auth_opt` for TCP-MD5) | `ss -tin` |
| `perf` | Measure crypto performance (e.g., AES‑NI cycles) | `perf stat -e cycles:u openssl speed -evp aes-128-gcm` |
| `sysctl` | Tune kernel RNG (`kernel.random.read_wakeup_threshold`) | `sysctl -w kernel.random.entropy_avail=2048` |

### Verifying Hardware Acceleration
Modern CPUs provide AES‑NI and SHA‑extensions. Check availability:

```bash
grep -o aes /proc/cpuinfo | head -1
# or
lscpu | grep Flags
```
If present, OpenSSL will automatically use them (`openssl speed -evp aes-128-gcb` shows increased MB/s).

## Why This Matters
Cryptography transforms abstract security goals—confidentiality, integrity, authenticity—into concrete mathematical guarantees that can be implemented and audited. Understanding the **why** behind each primitive (e.g., why collision resistance prevents undetected tampering, why RSA’s reliance on factoring yields asymmetric security, why DH’s shared secret emerges from the hardness of discrete logs) enables engineers to select the right tool for a given threat model, avoid subtle pitfalls like IV reuse or deterministic padding, and leverage Linux’s crypto stack—from kernel AF_ALG sockets to dm‑crypt—to build systems that resist both software and hardware attacks. As attacks grow more sophisticated (side‑channels, quantum‑ready cryptanalysis, supply‑chain tampering), a deep, principled grasp of these foundations becomes indispensable for designing protocols that remain trustworthy over time. Without this depth, developers resort to cargo‑cult copying of code snippets, leading to the very mistakes enumerated above; with it, they can construct, evaluate, and evolve secure solutions that protect data, preserve privacy, and uphold the integrity of modern computing infrastructure.
