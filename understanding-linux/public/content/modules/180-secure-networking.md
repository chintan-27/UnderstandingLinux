---
id: 180
title: "Secure networking"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every packet traversing a network passes through routers and switches you do not control. Without cryptographic protection, any node along the path can read your data, inject forged responses, or silently modify what you receive. This is not a theoretical risk — it is the default behavior of plaintext protocols like HTTP, Telnet, and FTP, and it is trivially exploitable on any shared network segment with tools like `tcpdump` or `mitmproxy`.

TLS, SSH, and VPNs all solve versions of the same problem: how do two parties who have never met agree on a secret, verify they are talking to the right machine, and protect every byte in transit? The failure modes are asymmetric: a misconfigured "encrypted" connection that authenticates nobody is worse than a known-plaintext channel, because you behave as if you are safe while you are not.

---

## Core Concepts

### Symmetric vs. Asymmetric Encryption

Symmetric encryption (AES-GCM, ChaCha20-Poly1305) uses one key for both encryption and decryption. It is fast — AES-NI on modern x86 processes data at memory bandwidth speeds, typically 10–40 GB/s — because the cipher maps directly to hardware instructions. The constraint is bootstrapping: both parties must already share a secret before they can use it.

Asymmetric encryption (RSA, elliptic curve) uses a key pair where anything encrypted with the public key decrypts only with the private key. The cost is approximately $O(k^3)$ in the key size $k$ for RSA, making it roughly $10^3\times$ slower than AES for equivalent key lengths. No protocol uses asymmetric encryption for bulk data. Its sole role in TLS and SSH is to establish a shared symmetric key and authenticate identity — after that it steps aside entirely.

### The Key Exchange Problem

Before two parties can encrypt traffic, they must agree on a symmetric key without an eavesdropper learning it. Diffie-Hellman (DH) solves this algebraically. Given a large prime $p$ and a generator $g$:

$$A = g^a \bmod p \qquad B = g^b \bmod p$$

Alice sends $A$, Bob sends $B$. Each computes the shared secret:

$$S = B^a \bmod p = A^b \bmod p = g^{ab} \bmod p$$

An observer who sees $g$, $p$, $A$, and $B$ cannot recover $a$ or $b$ without solving the discrete logarithm problem. No polynomial-time algorithm is known for this over large primes, which is why the security holds.

For elliptic curve Diffie-Hellman (ECDH), the group operation moves from modular exponentiation to point multiplication on a curve defined over $\mathbb{F}_p$:

$$y^2 \equiv x^3 + ax + b \pmod{p}$$

The discrete logarithm problem on elliptic curves is harder: no subexponential algorithm is known for properly chosen curves. This is why a 256-bit ECDH key (e.g., X25519) provides security roughly equivalent to a 3072-bit finite-field DH key, or a 128-bit symmetric key — the asymptotic hardness differs by curve choice, not just key size.

Ephemeral key exchange — generating a fresh DH keypair per session — provides **forward secrecy**: compromise of the server's long-term private key does not retroactively decrypt previously recorded sessions, because each session's DH private value was discarded.

### Authentication and Certificates

Key exchange establishes *a* shared secret, not a secret with a *specific party*. Without authentication, a man-in-the-middle attacker intercepts both sides' key exchanges, establishes independent shared secrets with each, and transparently re-encrypts all traffic. Both parties believe they have a direct encrypted channel; the attacker reads everything.

X.509 certificates solve this by binding a public key to an identity with a signature from a third party both sides already trust. The chain structure exists because you cannot distribute one CA's key to every device globally and keep it secure indefinitely — instead, a small set of root CAs (embedded in your OS or browser) sign intermediate CAs, which sign end-entity certificates. Revocation of a compromised intermediate does not require updating root trust stores.

When you connect to `api.example.com`, the server presents a certificate chain. Your TLS implementation verifies:

1. Each certificate's signature validates under its issuer's public key.
2. The chain terminates at a trusted root CA.
3. The leaf certificate's `Subject Alternative Name` (SAN) extension matches the hostname — not the `CN` field, which is deprecated for this purpose (RFC 2818).
4. No certificate has expired.
5. Optionally, no certificate has been revoked (via OCSP or CRL).

If any check fails, `SSL_connect()` returns an error. The correct response is to abort, not to log a warning and proceed.

### TLS: Putting It Together

TLS combines asymmetric authentication with symmetric encryption via a structured handshake. TLS 1.3 (RFC 8446) redesigned this for two goals: reduce latency and eliminate negotiation of weak options.

The latency improvement is structural. TLS 1.2 required two full round trips before application data could flow:

$$\text{Latency}_{1.2} = 2 \times \text{RTT} + T_{\text{cert-verify}}$$

TLS 1.3 sends the client's key share in the first message, so the server can derive session keys immediately and respond with its certificate and encrypted extensions in one round trip:

$$\text{Latency}_{1.3} = 1 \times \text{RTT}$$

TLS 1.3 also removed support for RSA key exchange (which lacks forward secrecy), CBC cipher modes (historically exploited in BEAST and POODLE), and MD5/SHA-1 in signatures. There is no negotiation path to these weak options — they simply do not exist in the protocol.

### SSH Trust Models

SSH does not use a CA hierarchy by default. The first connection to a host stores its public key fingerprint in `~/.ssh/known_hosts`. Subsequent connections verify the server presents the same key — **trust on first use (TOFU)**. If the key changes, SSH aborts with a warning. This is the correct behavior: it prevents silent MITM attacks after the initial connection, though it cannot prevent them on the first.

TOFU does not scale. If you manage thousands of hosts, distributing `known_hosts` entries is operationally expensive and error-prone. SSH certificates solve this: your organization runs an internal CA, signs host keys with `ssh-keygen -s`, and clients trust that CA via `@cert-authority` entries in `known_hosts`. A single CA public key replaces per-host fingerprints entirely.

User authentication via public key works the same way in reverse: the server stores your public key in `~/.ssh/authorized_keys`; during connection your client proves possession of the corresponding private key by signing a challenge. The private key never leaves your machine.

### VPN Concepts

A VPN creates a virtual network interface (e.g., `tun0` or `wg0` on Linux). The kernel routes packets destined for the remote network through this interface. A userspace or kernel process reads those packets, encrypts them, and sends them as the payload of UDP or TCP datagrams to a VPN gateway, which decrypts and re-injects them.

Encapsulation structure:

```
[ Outer IP header ][ UDP header ][ Encrypted: Inner IP header + TCP/UDP/payload ]
```

This imposes a fixed per-packet overhead. If the physical MTU is 1500 bytes and WireGuard's overhead is 60 bytes (IP + UDP + WireGuard header + Poly1305 tag), the inner MTU becomes:

$$\text{MTU}_{\text{inner}} = \text{MTU}_{\text{outer}} - \text{overhead} = 1500 - 60 = 1440 \text{ bytes}$$

Packets that exceed $\text{MTU}_{\text{inner}}$ must either be fragmented before entering the tunnel or rejected with ICMP "fragmentation needed" (type 3, code 4). Many firewalls silently drop these ICMP messages, which causes TCP connections to hang after the initial handshake — the classic symptom of MTU misconfiguration. The fix is to set the tunnel interface MTU explicitly, or use TCP MSS clamping.

---

## How It Works

### TLS 1.3 Handshake in Detail

```
Client                                          Server
  |                                               |
  |--- ClientHello (key_share, cipher_suites) --->|
  |                                               |
  |<-- ServerHello (key_share) -------------------|
  |<-- {EncryptedExtensions} --------------------|
  |<-- {Certificate} ----------------------------|
  |<-- {CertificateVerify} ---------------------|
  |<-- {Finished} -------------------------------|
  |                                               |
  |--- {Finished} -------------------------------->|
  |--- [Application Data] ------------------------>|
```

Braces `{}` indicate encryption under the **handshake traffic secret**, derived from the DH shared secret immediately after `ServerHello`. This means the server's certificate — and therefore the server's identity — is hidden from passive observers. In TLS 1.2, certificates traveled in plaintext.

Key derivation uses HKDF (RFC 5869). Starting from the DH output as input key material (IKM):

$$\text{PRK} = \text{HKDF-Extract}(\text{salt}, \text{IKM}) = \text{HMAC-Hash}(\text{salt}, \text{IKM})$$

$$\text{OKM} = \text{HKDF-Expand}(\text{PRK}, \text{info}, L)$$

TLS 1.3 derives a hierarchy of secrets from PRK using distinct `info` labels: separate keys for handshake encryption, application data encryption, and resumption. Compromise of the application traffic key does not expose handshake keys or resumption secrets, because they are derived through separate expand operations with different labels.

### Certificate Verification in OpenSSL

When `libssl` verifies a chain, the call path is:

1. `d2i_X509()` parses the DER-encoded certificate into an `X509` struct.
2. `X509_
