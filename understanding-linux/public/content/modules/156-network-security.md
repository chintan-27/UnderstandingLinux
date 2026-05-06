---
id: 156
title: "Network security"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Introduction to Network Security
Network security concerns the protection of data *in transit* across packet‑switched networks. The threat model assumes an adversary can observe, inject, modify, or drop packets on any link. Security mechanisms therefore aim to provide confidentiality, integrity, and authenticity despite a potentially hostile medium. Rather than listing generic goals, we derive them from the adversary capabilities:  
- **Confidentiality** prevents the adversary from learning plaintext; achieved by encrypting payloads with keys unknown to the attacker.  
- **Integrity** guarantees any modification is detectable; achieved by appending a cryptographic MAC or authenticating encryption tag.  
- **Authenticity** ensures the source can be verified; achieved by binding the MAC/tag to a public‑key certificate or pre‑shared secret.  

These three properties are the foundation for TLS, firewalls, VPNs, authentication, and anti‑spoofing techniques.

### TLS Fundamentals
TLS (Transport Layer Security) operates above TCP (transport layer) and below application protocols. Its design separates *key establishment* (asymmetric) from *data protection* (symmetric).  

**Key establishment** – The client and server must agree on a shared secret without prior communication. TLS 1.3 uses an ephemeral Diffie‑Hellman (DH) exchange: each party generates a private scalar $a$ or $b$, computes $A = g^a \bmod p$ and $B = g^b \bmod p$, and sends the public value. The shared secret is $S = g^{ab} \bmod p$. Because $a$ and $b$ are secret, an eavesdropper seeing only $g^a$ and $g^b$ cannot compute $S$ without solving the discrete logarithm problem, which is infeasible for appropriately sized $p$ (2048‑bit or larger).  

**Symmetric protection** – From $S$ TLS derives traffic keys via a KDF (HKDF‑SHA256). For each direction we obtain:  
- Encryption key $K_e$ (256‑bit for AES‑256‑GCM)  
- IV $K_{iv}$ (96‑bit nonce)  
- MAC key $K_m$ (implicit in GCM tag)  

The record layer then encrypts plaintext $P$ as $C = \text{AES‑GCM}_{K_e, K_{iv}}(P, AAD)$ where $AAD$ includes sequence number, type, length, and version. GCM provides both confidentiality and integrity; any bit flip in $C$ results in a tag mismatch with probability $2^{-128}$.

**Handshake flow** – The TLS handshake negotiates protocol version, cipher suite, exchanges certificates, performs the DH exchange, and finally derives keys. The entire exchange is protected against tampering by the *finished* messages, which contain a MAC over the whole handshake transcript.

### Firewalls
A firewall is a *packet filter* that decides, for each incoming or outgoing packet, whether to accept or drop it based on a rule set. The decision is deterministic: given a packet header $\langle srcIP, dstIP, srcPort, dstPort, proto\rangle$, the firewall scans rules in order until a match is found; the associated target (ACCEPT/DROP/REJECT/LOG) is applied.  

If no rule matches, the *default policy* (often DROP) decides the fate. This linear scan yields worst‑case time $O(N)$ where $N$ is the number of rules; modern kernels use *tuple space search* (e.g., efc in nftables) to achieve $O(\log N)$.

Stateful firewalls extend this model by tracking connection state (e.g., TCP SYN, SYN‑ACK, ACK). A rule may specify `-m state --state ESTABLISHED,RELATED` to allow return traffic without explicit rules for each ephemeral port.

### VPN Concepts
A VPN creates a *virtual* point‑to‑point link over an untrusted IP network by encapsulating and encrypting packets. The encapsulation adds a new outer IP header (tunnel endpoint IPs) and optionally an ESP (Encapsulating Security Payload) header carrying cryptographic material.  

Two common modes:  
- **Transport mode** – encrypts only the payload; outer IP header retains original source/destination (used for host‑to‑host).  
- **Tunnel mode** – encrypts the entire inner IP packet; outer header shows VPN gateway addresses (used for site‑to‑site or remote‑access).  

Security relies on the *Security Association* (SA) which defines:  
- SPI (Security Parameters Index) – identifies the SA  
- Sequence number – prevents replay  
- Cryptographic algorithm (e.g., AES‑256‑GCM) and keys  

The SA is negotiated via IKEv2 (Internet Key Exchange v2), which itself uses DH for key exchange and certificates for authentication, mirroring TLS but focused on IPsec.

### Authentication
Authentication verifies that a principal possesses a claimed identity. In network security we distinguish:  
- **Something you know** – password, PIN; verified via a hash comparison (e.g., SHA‑256(salt‖pwd)).  
- **Something you have** – token, smartcard; generates a time‑based one‑time password (TOTP) $OTP = \text{HMAC‑SHA1}(K, \lfloor T/30\rfloor)$ where $K$ is a secret key and $T$ is Unix time.  
- **Something you are** – biometrics; typically matched locally, then a session token is issued.  

Public‑key authentication (PKI) uses a certificate chain: the client proves possession of the private key corresponding to a public key certified by a trusted CA. The server verifies the signature over the certificate and then checks a proof‑of-possession (e.g., signing a nonce).  

### Spoofing Basics
Spoofing involves forging packet fields to masquerade as another entity. The most common is **IP address spoofing**, where the attacker sets `srcIP` to a victim’s address. Because TCP uses a three‑way handshake, pure spoofing cannot complete a connection unless the attacker can see the SYN‑ACK (i.e., is on‑path).  

**ARP spoofing** exploits the lack of authentication in ARP: an attacker sends a gratuitous ARP reply claiming “I am $IP_{gateway}$ at $MAC_{attacker}$”, causing hosts to update their ARP cache and send traffic to the attacker.  

**DNS spoofing** (cache poisoning) injects false DNS responses; mitigated by DNSSEC which signs RRsets, allowing resolvers to verify authenticity using a chain of trust anchored in root keys.

## How It Works
### TLS Handshake (TLS 1.3)
The handshake consists of 1‑round‑trip (1‑RTT) key exchange plus optional 0‑RTT resumption. Below is a step‑by‑step description with the exact messages.

1. **ClientHello**  
   - `legacy_version = 0x0303` (TLS 1.2) for compatibility  
   - `supported_versions` extension indicates TLS 1.3  
   - `key_share` entry: client’s DH public value $A = g^a \bmod p$  
   - `signature_algorithms` list (e.g., `ecdsa_secp256r1_sha256`)  
   - `supported_groups` (e.g., `x25519`)  
   - `random` – 32‑byte nonce  

2. **ServerHello**  
   - Picks TLS 1.3, echoes `supported_versions`  
   - Selects a `key_share`: server’s DH public $B = g^b \bmod p$  
   - Chooses cipher suite (e.g., `TLS_AES_256_GCM_SHA384`)  
   - `random` – 32‑byte nonce  

3. **EncryptedExtensions** (encrypted under handshake keys)  
   - Contains extensions like `server_name`, `supported_groups`, etc.

4. **Certificate** (encrypted)  
   - Server’s X.509 chain; includes public key $PK_{server}$.

5. **CertificateVerify** (encrypted)  
   - Signature over the entire handshake transcript using $SK_{server}$.

6. **Finished** (encrypted)  
   - `verify_data = HMAC‑sha256(derived_key, TranscriptHash)`  

7. **Client** (after verifying server’s Finished) sends its own `Finished` (encrypted).  

From the DH values both sides compute $S = g^{ab} \bmod p$. HKDF‑Expand‑Label derives:  
$$
\begin{aligned}
\text{client\_write\_key} &= \text{HKDF-Expand-Label}(S, \text{"key"}, \text{hash}, 32)\\
\text{server\_write\_key} &= \text{HKDF-Expand-Label}(S, \text{"key"}, \text{hash}, 32)\\
\text{client\_write\_iv}  &= \text{HKDF-Expand-Label}(S, \text{"iv"}, \text{hash}, 12)\\
\text{server\_write\_iv}  &= \text{HKDF-Expand-Label}(S, \text{"iv"}, \text{hash}, 12)\\
\end{aligned}
$$  
Application data is then protected with AES‑256‑GCM using the appropriate key/IV.

```c
/* Minimal TLS 1.3 client using OpenSSL 3.0 */
#include <openssl/ssl.h>
#include <openssl/err.h>

int main(void)
{
    SSL_CTX *ctx;
    SSL *ssl;
    const char *hostname = "example.com";
    int ret;

    /* Load error strings and algorithms */
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();

    ctx = SSL_CTX_new(TLS_client_method());
    if (!ctx) { ERR_print_errors_fp(stderr); return 1; }

    /* Prefer TLS 1.3 only */
    SSL_CTX_set_min_proto_version(ctx, TLS1_3_VERSION);
    SSL_CTX_set_max_proto_version(ctx, TLS1_3_VERSION);

    /* Verify server certificate */
    SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, NULL);
    SSL_CTX_load_verify_locations(ctx, "/etc/ssl/certs/ca-certificates.crt", NULL);

    ssl = SSL_new(ctx);
    if (!ssl) { ERR_print_errors_fp(stderr); return 1; }

    SSL_set_tlsext_host_name(ssl, hostname);

    /* Connect and perform handshake */
    ret = SSL_connect(ssl);
    if (ret != 1) {
        ERR_print_errors_fp(stderr);
        return 1;
    }

    /* At this point, SSL_get_write_key(ssl) etc. can be inspected */
    SSL_shutdown(ssl);
    SSL_free(ssl);
    SSL_CTX_free(ctx);
    return 0;
}
```

### Firewall Configuration (nftables)
Modern Linux uses **nftables** as the packet filtering framework, replacing the legacy `iptables`. The kernel maintains a set of tables, each containing chains (e.g., `input`, `forward`, `output`). Rules are expressed in a high‑level language that gets compiled to bytecode.

**Example: drop inbound HTTP, allow outbound SSH**  
```bash
# Create a table named filter if it does not exist
sudo nft add table inet filter

# Flush existing chains (clean slate)
sudo nft flush chain inet filter input
sudo nft flush chain inet filter output

# Input chain: drop TCP packets destined for port 80
sudo nft add rule inet filter input ip protocol tcp tcp dport 80 drop

# Output chain: allow TCP packets sourced from port 22 (SSH replies)
sudo nft add rule inet filter output ip protocol tcp tcp sport 22 accept

# Set default policies (optional)
sudo nft add rule inet filter input drop
sudo nft add rule inet filter output accept
```

**Stateful rule example** – allow related/established traffic:
```bash
sudo nft add rule inet filter input ct state established,related accept
```
Here `ct` refers to the connection tracking subsystem (`nf_conntrack`). The kernel maintains a hash table of Conntrack entries; lookup is $O(1)$ average.

**Performance note** – evaluating a linear list of $N$ rules costs $O(N)$; nftables builds a *set* or *map* (e.g., a hash map of `{dport:action}`) yielding $O(\log N)$ or $O(1)$ average.

### VPN Establishment (OpenVPN)
OpenVPN implements a user‑space VPN using TLS for key exchange and then encrypts IP packets with the derived keys. The process:

1. **TLS handshake** over UDP port 1194 (client ↔ server) – identical to the TLS handshake described above, but the *application data* after the handshake are control messages (e.g., `PUSH_REPLY`, `PULL_REQUEST`).  
2. **Key derivation** – From the TLS master secret, OpenVPN derives two symmetric keys: one for the *data channel* (encrypting tunneled IP packets) and one for the *control channel* (protecting further TLS messages).  
3. **TUN/TAP device** – OpenVPN opens `/dev/net/tun` (TUN for layer‑3, TAP for layer‑2). Packets written to this device are read by the OpenVPN process, encrypted, and sent over the UDP socket; incoming UDP packets are decrypted and written to the TUN device, appearing as normal IP packets to the kernel.  
4. **Routing** – The client adds a route via `ip route add 10.8.0.0/24 dev tun0` (or the server pushes `route` via `push "route 10.8.0.0 255.255.255.0"`).  

```bash
# Install OpenVPN (Debian/Ubuntu)
sudo apt-get update && sudo apt-get install -y openvpn easy-rsa

# Generate PKI (server side)
make-cadir ~/openvpn-ca
cd ~/openvpn-ca
source vars
./clean-all
./build-ca          # ca.crt
./build-key-server server  # server.crt + server.key
./build-dh          # dh2048.pem
openvpn --genkey --secret ta.key

# Server configuration (/etc/openvpn/server.conf)
cat <<'EOF' | sudo tee /etc/openvpn/server.conf
port 1194
proto udp
dev tun
ca ca.crt
cert server.crt
key server.key  # This file should be kept secret
dh dh2048.pem
tls-auth ta.key 0
topology subnet
server 10.8.0.0 255.255.255.0
ifconfig-pool-persist ipp.txt
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS 1.1.1.1"
keepalive 10 120
cipher AES-256-GCM
user nobody
group nogroup
persist-key
persist-tun
status openvpn-status.log
verb 3
EOF

# Start the service
sudo systemctl start openvpn@server
sudo systemctl enable openvpn@server

# Client configuration (/etc/openvpn/client.conf)
cat <<'EOF' | sudo tee /etc/openvpn/client.conf
client
dev tun
proto udp
remote your_vpn_server_ip 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
verb 3
<ca>
# paste ca.crt content here
</ca>
<cert>
# paste client.crt content here
</cert>
<key>
# paste client.key content here
</key>
<tls-auth>
# paste ta.key content here
</tls-auth>
EOF

# Connect
sudo openvpn --config /etc/openvpn/client.conf
```

## Worked Examples
### Example 1: TLS 1.3 Handshake with Numerical Values
Assume the server uses the **X25519** curve ($g$ is the base point, $p = 2^{255}-19$).  

- Client private scalar $a = 0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b$ (256‑bit).  
- Computed public $A = g^a$. Suppose the resulting $A$ (encoded) is `0x5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b`.  

- Server private scalar $b = 0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c`.  
- Public $B = g^b = 0x6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c$.  

Shared secret (X25519) $S = X25519(a, B) = X25519(b, A)$. For brevity, assume the 32‑byte result is:  
$$S = \texttt{0x8f1e2d3c4b5a6978876543210fedcba9876543210fedcba9876543210fedcba9}$$

HKDF‑Extract (with salt = all zeros) yields a pseudorandom key $PRK = \text{HMAC‑SHA256}(0^{32}, S)$.  
HKDF‑Expand‑Label then produces:  

- `client_write_key` = first 32 bytes of `HKDF-Expand-Label(PRK, "key", SHA256, 32)`  
- `server_write_key` = next 32 bytes  
- `client_write_iv`  = first 12 bytes of `HKDF-Expand-Label(PRK, "iv", SHA256, 12)`  
- `server_write_iv`  = next 12 bytes  

Suppose the derived AES‑256‑GCM key for the client direction is:  
$$K_e^{C\to S} = \texttt{0x112233445566778899aabbccddeeff00112233445566778899aabbccddeeff}$$  
and the corresponding IV (nonce) is:  
$$K_{iv}^{C\to S} = \texttt{0xabcdef012345}$$  

When the client sends the plaintext `"GET / HTTP/1.1\r\nHost: example.com\r\n\r\n"` (44 bytes), AES‑256‑GCM encrypts it as:  
$$C = \text{AES‑GCM}_{K_e^{C\to S}, K_{iv}^{C\to S}}(P, \text{AAD})$$  
where AAD includes the record header (`0x17 0x0303 0x002c`). The resulting ciphertext (shown in hex) is:  
```
1f8a3c5e6b7d9a0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f
```
The 16‑byte authentication tag appended is `0x9fa8b7c6d5e4f3a2b1c0d9e8f7a6b5c4`.  

Upon receipt, the server recomputes the tag; any single‑bit flip in $C$ changes the tag with probability $2^{-128}$, thus guaranteeing integrity.

### Example 2: nftables Rule Evaluation Complexity
Consider a table with $N=10^5$ rules, each matching on a 5‑tuple (srcIP, dstIP, srcPort, dstPort, proto). A naive linear scan would, in the worst case, examine all $N$ rules per packet → $O(N) = 10^5$ operations.  

nftables can convert the rule set into a **hash map** keyed by `(proto, dstPort)`. Suppose there are only $M=10$ distinct destination ports used. The kernel builds $M$ hash tables, each containing the subset of rules sharing that port. Lookup cost becomes $O(1)$ to fetch the correct bucket plus $O(L)$ to scan the bucket, where $L \approx N/M = 10^4$.  

If we further split by `srcPort` using a **trie**, the expected depth is $\log_2(\text{range}) \approx 16$ for 16‑bit ports, yielding $O(\log N)$ ≈ 17 steps.  

Thus, for the same rule set, nftables reduces per‑packet processing from ~100k comparisons to a few dozen, a >1000× speedup.

### Example 3: OpenVPN MTU and Fragmentation
OpenVPN adds overhead:  
- Outer UDP header: 8 B  
- Outer IP header: 20 B (IPv4)  
- Control/TLS headers: variable, but data channel adds:  
  - OpenVPN header: 2 B (packet ID)  
  - TLS record header (if using TLS‑crypt): 1 B  
  - AES‑GCM tag: 16 B  

Total per‑packet overhead ≈ 46 B (assuming IPv4).  

If the physical link MTU is 1500 B, the maximum IP payload that can be sent without fragmentation is:  
$$\text{MTU}_{\text{VPN}} = 1500 - 46 = 1454\text{ B}$$  

The TUN/MAC layer therefore sets its MTU to 1454. Applications sending larger packets (e.g., Ethernet frames of 1500 B) will be fragmented by the IP layer before encryption, causing extra CPU overhead. To avoid this, either:  

1. Reduce application MTU (`ip link set dev eth0 mtu 1454`)  
2. Enable `fragment` and `mssfix` options in OpenVPN (`fragment 1300`, `mssfix 1300`) so OpenVPN itself performs IP‑level fragmentation before encryption.  

## Common Mistakes
### Mistake 1: Using TLS 1.0/1.1 for Modern Services
**What’s wrong:** TLS 1.0 and 1.1 use MD5/SHA‑1 in the PRF and allow CBC‑mode ciphers with weak IV generation, making them vulnerable to **BEAST** and **POODLE** attacks.  
**Why it matters:** An active network attacker can decrypt or tamper with session data. Modern browsers and PCI DSS forbid these versions.  
**Fix:** Enforce `SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION)` (or better TLS 1.3). Disable fallback via `SSL_CTX_set_options(ctx, SSL_OP_NO_TLSv1 | SSL_OP_NO_TLSv1_1)`.

### Mistake 2: Assuming “ESTABLISHED,RELATED” Rules Are Sufficient for All Return Traffic
**What’s wrong:** The `ct state` matcher only sees traffic that the connection tracking module has seen. Asymmetric routing (reply via a different path) or protocols that embed IP addresses (FTP active mode, SIP) can cause the reply to appear as a new connection, not matching the state.  
**Why it matters:** Legitimate return packets are dropped, causing intermittent service failures that are hard to diagnose.  
**Fix:** Use `ct helper` for protocol‑specific helpers (`ftp`, `sip`) or employ **conntrack‑expect**
