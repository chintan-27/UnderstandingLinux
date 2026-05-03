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

## Why This Matters

Every time you use `ssh`, `gpg`, `openssl`, or `git commit --gpg-sign`, you depend on a small set of mathematical primitives. Without them, a network observer reads your SSH session verbatim, injects commands into a package manager update, or forges a signed binary your system executes as trusted. Linux exposes these primitives through the kernel `crypto/` subsystem, AF_ALG sockets, and userspace libraries. Understanding the math is the only way to reason correctly about which configurations are dangerously wrong and what "secure" actually means in a specific threat model.

---

## Core Concepts

### Hashing: One-Way Compression

A cryptographic hash function maps arbitrary-length input to a fixed-length digest:

$$H: \{0,1\}^* \rightarrow \{0,1\}^n$$

Three distinct properties matter, each strictly stronger than the last:

1. **Pre-image resistance**: Given $d$, finding any $m$ with $H(m) = d$ requires $O(2^n)$ work.
2. **Second pre-image resistance**: Given $m_1$, finding $m_2 \neq m_1$ with $H(m_1) = H(m_2)$ requires $O(2^n)$ work.
3. **Collision resistance**: Finding *any* pair $(m_1, m_2)$ with $H(m_1) = H(m_2)$ requires only $O(2^{n/2})$ work by the birthday bound — so collision resistance is strictly harder to break than it sounds, but also strictly cheaper to attack than pre-image resistance.

Why this distinction matters in practice: MD5 has known collision attacks ($O(2^{18})$ in optimized implementations), so an attacker can produce two documents with the same MD5 hash. But second pre-image attacks on MD5 are still expensive. Using MD5 to check whether a *specific* downloaded file matches a *known* hash is less catastrophically broken than using MD5 to verify that two submitted documents are different — though both uses should be abandoned.

A hash has no key and cannot be reversed. Its purpose is binding a message to its content, not hiding the content.

**Algorithm selection today:**
- SHA-256 / SHA-512: standard, well-analyzed, use by default
- SHA-3 (Keccak): different internal construction (sponge, not Merkle-Damgård), useful when you need independence from the SHA-2 family
- BLAKE2/BLAKE3: faster than SHA-2 in software, no length-extension vulnerability, good for checksums and MACs
- MD5, SHA-1: broken for collision resistance; MD5 collisions are trivially constructible; never use for security

### Symmetric Encryption: One Shared Secret

Both parties hold the same key $k$. Encryption and decryption are inverses:

$$C = E_k(M), \quad M = D_k(C)$$

Without $k$, recovering $M$ from $C$ should require exhaustive key search: $O(2^{|k|})$ operations. AES-128 provides $2^{128}$ security; AES-256 is conservative against hypothetical quantum attacks (Grover's algorithm reduces symmetric security to $O(2^{n/2})$, so AES-256 retains $2^{128}$ post-quantum).

The unsolved problem symmetric encryption introduces: *key distribution*. How do two parties who have never communicated agree on $k$ without an eavesdropper learning it? This is precisely what asymmetric cryptography and key exchange solve.

### Asymmetric Encryption: Key Pairs

Each party generates a linked pair: public key $K_{pub}$ (freely distributed) and private key $K_{priv}$ (never leaves the owner). The binding:

$$C = E_{K_{pub}}(M), \quad M = D_{K_{priv}}(C)$$

Security rests on problems believed hard without the trapdoor:
- **RSA**: integer factorization — given $n = pq$, recover $p$ and $q$
- **ECDH/ECDSA/Ed25519**: elliptic curve discrete logarithm — given $Q = kP$, recover $k$

Asymmetric encryption solves key distribution but carries a cost. AES on modern hardware processes roughly $1\,\text{GB/s}$ per core. RSA-2048 encryption runs around $10\,\text{MB/s}$ — roughly $100\times$ slower — and RSA decryption (private key operation) is slower still. This is why TLS does not encrypt your traffic with RSA: it uses RSA or ECDH to negotiate a shared symmetric key, then switches to AES-GCM for bulk data.

### Digital Signatures: Authenticity and Non-Repudiation

Signing reverses key roles: the *private* key signs, the *public* key verifies.

$$S = \text{Sign}_{K_{priv}}(H(M)), \quad \text{Verify}_{K_{pub}}(H(M),\, S) \in \{\text{valid},\, \text{invalid}\}$$

Signing the digest $H(M)$ rather than $M$ directly serves two purposes: performance (RSA operates on a fixed modulus size, not arbitrary-length data), and avoiding specific algebraic attacks where operating on structured plaintext leaks the private key.

A valid signature proves two things simultaneously: the message was touched by the private key holder (authenticity), and the message has not changed since signing (integrity). It does not prove the private key holder intended the meaning you infer — that's a policy question, not a cryptographic one.

### Key Exchange: Agreeing on a Secret Over a Watched Channel

Diffie-Hellman allows two parties to derive a shared secret over a fully observed channel. The classic version uses a multiplicative group modulo a large prime $p$:

$$\text{Alice sends: } A = g^a \bmod p, \quad \text{Bob sends: } B = g^b \bmod p$$
$$\text{Shared secret: } S = B^a \bmod p = A^b \bmod p = g^{ab} \bmod p$$

An observer sees $g$, $p$, $A$, $B$ but must solve the discrete logarithm to recover $a$ or $b$ — computationally infeasible for large $p$.

Modern TLS uses **ECDHE** (Elliptic Curve Diffie-Hellman Ephemeral). The *ephemeral* qualifier is critical: each session generates a fresh key pair used only once, then discarded. This provides **forward secrecy**: if the server's long-term private key is compromised years later, the attacker cannot decrypt previously recorded sessions because the ephemeral keys are gone. Static DH (without ephemeral) does not have this property.

---

## How It Works

### Hash Internals: SHA-256 and the Birthday Bound

SHA-256 pads input to a multiple of 512 bits, then processes it in 512-bit blocks. Each block runs through 64 rounds of a compression function that mixes 8 32-bit words ($a$ through $h$) using bitwise rotations, XOR, and a message schedule derived from the block. The initial state is derived from the fractional parts of the square roots of the first 8 primes — this choice is auditable and eliminates nothing-up-my-sleeve concerns.

The avalanche effect is not a feature bolted on; it emerges from iterated nonlinear mixing. One input bit change propagates through the message schedule and state words so that by round 64, roughly half the output bits differ.

The birthday bound explains why collision resistance fails at $2^{n/2}$ rather than $2^n$: if you sample $2^{n/2}$ random messages and hash them, the expected number of colliding pairs is $O(1)$ by the birthday paradox. For SHA-256 with $n = 256$:

$$\text{Collision work} \approx 2^{128} \text{ operations}$$

For SHA-1 ($n = 160$), the theoretical bound is $2^{80}$. Google's SHAttered attack achieved a practical SHA-1 collision in approximately $2^{63.1}$ operations — within reach of a large computation budget. This is why SHA-1 is dead for certificate signatures.

```bash
# Observe the avalanche effect directly
echo -n "hello" | sha256sum
echo -n "hellp" | sha256sum

# SHA-1 is still present on most systems — observe its output length
echo -n "hello" | sha1sum

# BLAKE2 is faster in software and lacks length-extension issues
echo -n "hello" | b2sum
```

**Length-extension attack**: SHA-256 (and all Merkle-Damgård constructions) are vulnerable. Given $H(m)$ and $\text{len}(m)$ but not $m$, an attacker can compute $H(m \| \text{padding} \| m')$ for arbitrary $m'$ without knowing $m$. This breaks naive MAC constructions like $H(k \| m)$. The correct construction is HMAC, which applies the hash twice with key mixing, or use BLAKE2/SHA-3 which are not vulnerable to this attack.

### AES: Why Mode of Operation Changes Everything

AES itself is a substitution-permutation network on 128-bit blocks. The raw cipher is a keyed bijection — it maps one 128-bit block to exactly one 128-bit block, deterministically. That determinism is the problem.

**ECB (Electronic Codebook):** $C_i = E_k(P_i)$

Identical plaintext blocks produce identical ciphertext blocks. Encrypt a bitmap and the structure of the image is visible in the ciphertext. This is not a corner case; it is an immediate pattern leak for any structured data.

**CBC (Cipher Block Chaining):** $C_i = E_k(P_i \oplus C_{i-1})$, with $C_0 = \text{IV}$

The IV must be random and unpredictable (not just unique) for each message. CBC hides patterns but is malleable: flipping a bit in $C_{i-1}$ predictably flips the corresponding bit in decrypted $P_i$. CBC also requires padding to fill the final block, which introduces **padding
