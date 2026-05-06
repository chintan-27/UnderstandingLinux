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

## Core Concepts
Secure networking guarantees **confidentiality**, **integrity**, **authenticity**, and **availability** of data exchanged over a network. These properties are not optional; without them an attacker can passively eavesdrop, actively modify, or impersonate parties, leading to data theft, service disruption, or privilege escalation. The mechanisms that provide these guarantees are built from a small set of cryptographic primitives:

* **Symmetric encryption** (e.g., AES‑GCM) uses a single secret key $k$ for both encryption and decryption. Its security reduces to the difficulty of distinguishing $E_k(m)$ from random, which for a 128‑bit key is ≈$2^{128}$ operations.  
* **Asymmetric encryption** (e.g., X25519 Diffie‑Hellman, RSA) relies on hard mathematical problems: the elliptic‑curve discrete logarithm problem (ECDLP) for X25519, and integer factorization for RSA. A shared secret derived from an ephemeral DH exchange provides **forward secrecy**— compromise of long‑term keys does not reveal past session keys.  
* **Message authentication** (MAC or AEAD tags) ensures any alteration is detected. In AES‑GCM the authentication tag is $T = \text{GHASH}_k(C) \oplus E_k(J_0)$, where a forged tag requires guessing a 128‑bit value.  

### TLS (Transport Layer Security)
TLS 1.3 is the current standard. Its handshake combines an **ephemeral key exchange** (usually X25519) with **certificate‑based authentication** to derive traffic keys that provide confidentiality and integrity. The handshake is deliberately structured to avoid round‑trips and to prevent downgrade attacks.

### Certificates and Public Key Infrastructure (PKI)
An X.509 certificate binds a subject’s public key to identifying information (e.g., DNS name) and is signed by a Certificate Authority (CA). Validation proceeds in four steps:
1. **Signature verification**: confirm $\sigma = \text{Sign}_{sk_{CA}}(TBS)$ using the CA’s public key $pk_{CA}$.
2. **Chain building**: verify each certificate’s issuer matches the subject of the next certificate up to a trusted root.
3. **Validity period**: ensure current time lies between `notBefore` and `notAfter`.
4. **Hostname verification**: compare the presented DNS name(s) in the certificate’s `subjectAltName` extension with the target hostname.

If any step fails, the connection must be aborted; otherwise the public key inside the leaf certificate can be trusted for authentication.

### SSH Trust Models
SSH replaces password‑based authentication with **public‑key authentication** to defeat brute‑force and credential‑reuse attacks. The server proves its identity by presenting a host key (stored in `/etc/ssh/ssh_host_*_key` and copied to the client’s `~/.ssh/known_hosts` on first connection). The client verifies the host key’s signature over the session identifier; a mismatch indicates a man‑in‑the‑middle (MITM).  
For user authentication, the client signs a session‑specific value with its private key; the server checks the signature against the public key listed in `~/.ssh/authorized_keys`. This eliminates password transmission entirely.

### VPN Concepts
A VPN creates a **logical private network** over a public medium by encapsulating and encrypting packets. Two common approaches:

* **IPsec** operates at the network layer. It defines Security Associations (SAs) that specify SPIs, encryption/authentication algorithms, and keys. SAs are negotiated by IKEv2, which performs a Diffie‑Hellman exchange, derives keys via pseudorandom functions (PRF), and installs the SAs into the kernel’s **xfrm** subsystem.
* **WireGuard** is a newer, minimal‑protocol VPN that uses the Noise protocol framework. Its core operation is a series of Diffie‑Hellman mixes (static‑static, ephemeral‑ephemeral, etc.) followed by HKDF‑based key derivation to produce sending/receiving keys and nonces for ChaCha20‑Poly1305.

Both mechanisms rely on the same primitives discussed above; their security hinges on proper key management and verification of peer identities.

## How It Works
### TLS 1.3 Handshake – Step‑by‑Step
1. **ClientHello**  
   - Sends `client_random` (32 bytes), a list of supported cipher suites, and an `X25519` key‑share extension containing the client’s ephemeral public key $X_C = x_C \cdot G$.  
2. **ServerHello**  
   - Returns `server_random` (32 bytes), selects a cipher suite (e.g., `TLS_AES_256_GCM_SHA384`), and provides its own X25519 public key $X_S = x_S \cdot G$.  
3. **Deriving the Shared Secret**  
   - Both parties compute the elliptic‑curve Diffie‑Hellman secret:  
     $$Z = x_C \cdot X_S = x_S \cdot X_C \in \mathbb{F}_{p}$$  
   - For X25519, $Z$ is a 32‑byte value.  
4. **HKDF‑Based Key Schedule** (simplified)  
   - $$\text{early\_secret} = \text{HKDF-Extract}(0,\,\text{"derived"})$$  
   - $$\text{handshake\_secret} = \text{HKDF-Extract}(\text{early\_secret},\, Z)$$  
   - $$\text{master\_secret} = \text{HKDF-Extract}(\text{handshake\_secret},\, \text{empty})$$  
   - Traffic keys are then:  
     $$\text{client\_write\_key} = \text{HKDF-Expand-Label}(\text{master\_secret},\text{"client traffic key"},\,\text{hash},\,\text{key\_len})$$  
     (similarly for IV and server keys).  
5. **Encrypted Extensions, Certificate, CertificateVerify, Finished**  
   - All subsequent messages are encrypted with the derived traffic keys, providing confidentiality and integrity from the first flight after the ServerHello.  
   - The `Finished` message contains a HMAC‑based verify‑data over the entire handshake transcript; any alteration aborts the connection.

### Certificate Verification Mathematics
Let the TBS (to‑be‑signed) certificate be a byte string $M$. The CA’s signature is $\sigma = \text{Sign}_{sk_{CA}}(M) = M^{d} \bmod N$ (RSA) or an EC signature. Verification computes:
$$M' = \text{Ver}_{pk_{CA}}(\sigma) = \sigma^{e} \bmod N$$  
and checks that $M' = M$. For ECDSA, verification involves checking that the point $R$ derived from $(\sigma, M, pk_{CA})$ satisfies the curve equation; a malformed signature fails this test.

### SSH Public‑Key Authentication
During authentication, the client generates a signature:
$$\text{sig} = \text{Sign}_{sk_{client}}(H)$$  
where $H$ is a hash of the session identifier, client/user name, server host key, and the public key being offered. The server verifies:
$$\text{Ver}_{pk_{client}}(\text{sig}, H) = \text{true}$$  
Only possession of $sk_{client}$ yields a valid signature, thus authenticating the user without revealing the secret.

### IPsec IKEv2 Key Derivation (simplified)
After the DH exchange yielding shared secret $Z_{DH}$, IKEv2 derives:
$$\text{SK\_d} = \text{PRF}_{Z_{DH}}(\text{key\_pad} \| \text{negotiated\_spi} \| 0)$$  
$$\text{SK\_ai} = \text{PRF}_{SK\_d}(Z_{DH} \| \text{key\_pad} \| \text{negotiated\_spi} \| 1)$$  
$$\text{SK\_ar} = \text{PRF}_{SK\_d}(Z_{DH} \| \text{key\_pad} \| \text{negotiated\_spi} \| 2)$$  
$$\text{SK\_ei} = \text{PRF}_{SK\_d}(Z_{DH} \| \text{key\_pad} \| \text{negotiated\_spi} \| 3)$$  
$$\text{SK\_e} = \text{PRF}_{SK\_d}(Z_{DH} \| \text{key\_pad} \| \text{negotiated\_spi} \| 4)$$  
These keys are used for authentication ($\text{SK\_ai/a r}$) and encryption ($\text{SK\_ei/e}$) of the IKE and child SAs.

### WireGuard Noise Pattern (Illustrated)
WireGuard’s initiation message proceeds as:
1. **Static‑Static DH**: $E_1 = \text{static\_private}_{initiator} \cdot \text{static\_public}_{responder}$  
2. **Ephem‑Ephemeral DH**: $E_2 = \text{ephem\_private}_{initiator} \cdot \text{ephem\_public}_{responder}$  
3. **Static‑Ephem DH**: $E_3 = \text{static\_private}_{initiator} \cdot \text{ephem\_public}_{responder}$  
4. **Ephem‑Static DH**: $E_4 = \text{ephem\_private}_{initiator} \cdot \text{static\_public}_{responder}$  

The symmetric key $k$ and nonce $n$ are then derived via HKDF256 over the concatenation of the four DH outputs, a fixed protocol name, and optional pre‑shared keys. The resulting $k$, $n$ feed ChaCha20‑Poly1305 for packet encryption/authentication.

## Worked Examples
### Example 1: TLS 1.3 Handshake with Real Numbers
We connect to **cloudflare.com** using OpenSSL and capture the handshake messages.

```bash
# Capture full handshake in human‑readable form
openssl s_client -tls1_3 -connect cloudflare.com:443 \
    -servername cloudflare.com -msg 2> tls_handshake.txt
```

**Key observations from `tls_handshake.txt`:**

* ClientHello `client_random` = `a3f1…` (32 bytes)  
* ServerHello `server_random` = `b7c2…` (32 bytes)  
* Server’s X25519 public key (key_share) = `9fd4…`  
* Client’s X25519 public key = `4a2b…`

**Deriving the shared secret (X25519):**  
Using the private scalar derived from the client’s ephemeral key (not shown) we compute:
$$Z = \text{X25519}(x_C, X_S) = \text{hex}\texttt{1e8a3f…}$$  
(32‑byte result).  

**Key schedule (HKDF‑SHA256):**  
```text
early_secret   = HKDF-Extract(0, "derived") = …
handshake_secret = HKDF-Extract(early_secret, Z) = …
master_secret    = HKDF-Extract(handshake_secret, "") = …
client_write_key = HKDF-Expand-Label(master_secret, "client traffic key",
                                    hash, 32) = …
```
These 32‑byte keys are then used by AES‑256‑GCM to encrypt application data. The handshake finishes with the server’s `Finished` message containing a verify‑data HMAC over the transcript; any tampering would cause a verification failure.

### Example 2: Verifying a Server Certificate
We fetch a certificate and verify it against a known CA.

```bash
# Download the leaf certificate
openssl s_client -connect badssl.com:443 -showcerts </dev/null 2>/dev/null |
    openssl x509 -outform PEM > leaf.pem

# Verify using the system CA bundle
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt leaf.pem
```

If verification succeeds, OpenSSL prints `leaf.pem: OK`.  
To see the verification steps manually:

```bash
# Show TBS certificate (everything except the signature)
openssl asn1parse -in leaf.pem -noout -dump  |
    awk '/^    0:/ {print}' > tbs.der

# Compute SHA‑256 of TBS
sha256sum tbs.der   # yields hash H

# Verify RSA signature (assuming RSA‑2048 CA)
openssl rsautl -verify -inkey ca_pubkey.pem -pubin -in leaf_sig.bin \
    -out verified.bin
```

`verified.bin` should match the DER‑encoded TBS certificate; any mismatch indicates a forged or altered certificate.

### Example 3: WireGuard VPN Between Two Network Namespaces
We create two isolated network namespaces, assign each a WireGuard interface, and exchange encrypted packets.

```bash
# Create namespaces
sudo ip netns add ns1
sudo ip netns add ns2

# Generate key pairs for each peer
wg genkey | tee ns1_private.key | wg pubkey > ns1_public.key
wg genkey | tee ns2_private.key | wg pubkey > ns2_public.key

# Read keys (keep them secret!)
NS1_PRIV=$(cat ns1_private.key)
NS1_PUB=$(cat ns1_public.key)
NS2_PRIV=$(cat ns2_private.key)
NS2_PUB=$(cat ns2_public.key)

# Configure ns1 side
sudo ip netns exec ns1 ip link add dev wg0 type wireguard
sudo ip netns exec ns1 ip address add dev wg0 10.0.0.1/24
sudo ip netns exec ns1 wg set wg0 \
    private-key <(echo "$NS1_PRIV") \
    peer "$NS2_PUB" \
    allowed-ips 10.0.0.2/32 \
    endpoint 127.0.0.1:51820   # dummy; we’ll use veth later
sudo ip netns exec ns1 ip link set up dev wg0

# Configure ns2 side (mirrored)
sudo ip netns exec ns2 ip link add dev wg0 type wireguard
sudo ip netns exec ns2 ip address add dev wg0 10.0.0.2/24
sudo ip netns exec ns2 wg set wg0 \
    private-key <(echo "$NS2_PRIV") \
    peer "$NS1_PUB" \
    allowed-ips 10.0.0.1/32 \
    endpoint 127.0.0.1:51820
sudo ip netns exec ns2 ip link set up dev wg0

# Connect the namespaces via a veth pair for routing
sudo ip link add veth1 type veth peer name veth2
sudo ip link set veth1 netns ns1 up
sudo ip link set veth2 netns ns2 up
sudo ip netns exec ns1 ip address add dev veth1 169.254.0.1/30
sudo ip netns exec ns2 ip address add dev veth2 169.254.0.2/30
sudo ip netns exec ns1 ip route add 10.0.0.2/24 dev veth1 via 169.254.0.2
sudo ip netns exec ns2 ip route add 10.0.0.1/24 dev veth2 via 169.254.0.1

# Test connectivity
sudo ip netns exec ns1 ping -c 3 10.0.0.2
```

**What happens cryptographically:**  
Each peer’s public key is a Curve25519 point derived from its private scalar. When a packet is sent, WireGuard computes an ephemeral‑ephemeral DH share, mixes it with static keys via HKDF, and obtains a unique **ChaCha20 key** and **Poly1305 nonce** for that packet. The receiver, possessing the same static private key and the sender’s static public key, reproduces the same session key, decrypts, and authenticates the packet. If an attacker tampers with the packet, the authentication tag fails and the packet is dropped.

## Common Mistakes
| Mistake | Why It’s Wrong | Concrete Consequence |
|---------|----------------|----------------------|
| **Using TLS 1.0/1.1 or RSA key exchange** | No forward secrecy; vulnerable to BEAST, POODLE, and passive decryption if the server’s private key is later compromised. | Past sessions can be decrypted retroactively. |
| **Accepting any certificate without hostname verification** | Breaks authentication; an attacker can present a valid cert for another domain and perform a MITM. | User talks to attacker thinking it’s the legitimate service. |
| **Storing private keys with world‑readable permissions (`chmod 644`)** | Any local user can steal the key and impersonate the service or decrypt traffic. | Privilege escalation, data leakage. |
| **Skipping certificate revocation checks (OCSP/CRL)** | A compromised CA‑issued cert remains trusted until it expires. | Attacker can continue using a stolen cert. |
| **Using weak Diffie‑Hellman groups (e.g., 1024‑bit MODP)** | Vulnerable to log‑jam attacks; feasible for nation‑state adversaries. | Shared secret can be recovered,
