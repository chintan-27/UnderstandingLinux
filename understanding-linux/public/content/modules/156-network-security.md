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

## Why This Matters

TCP/IP was designed for a cooperative academic network where every participant was trusted. There is no built-in mechanism in IPv4 to verify that a source address is genuine, that a packet hasn't been modified in transit, or that the host you're connecting to is who it claims to be. Every mechanism in this module exists because the protocol stack has no native answer to adversaries. Understanding *why* each mechanism was invented tells you exactly what breaks when it's absent or misconfigured.

---

## Core Concepts

### TLS: Encryption and Authentication at the Transport Layer

TLS sits between the application layer and TCP, providing two independent guarantees: **confidentiality** (ciphertext is computationally indistinguishable from random bytes to a passive observer) and **authentication** (the server proves possession of a private key corresponding to a certificate signed by a trusted CA). These are separate properties — you can have encryption without authentication (vulnerable to MITM) or authentication without encryption (integrity without privacy). TLS provides both.

The handshake uses asymmetric cryptography exclusively to establish a shared secret, then discards it in favor of symmetric keys. The reason is speed: RSA-2048 decryption runs at roughly $10^3$ operations/second on a modern CPU; AES-GCM runs at $10^9$ bytes/second with hardware acceleration (AES-NI). Using RSA to encrypt bulk data would be three to four orders of magnitude slower.

The trust anchor is the certificate chain. Your OS maintains a set of trusted CA certificates:
- Linux: `/etc/ssl/certs/` or `/etc/ca-certificates.conf`
- NSS store used by Firefox/Chrome: `~/.pki/nssdb/`

When a server presents its certificate, the client verifies the CA's signature over the server's public key and hostname. If the CA is in the trust store and the signature is valid, the client accepts the server's identity. A compromised or malicious CA can sign certificates for any domain — this is the single-point-of-failure in the PKI model, which Certificate Transparency (CT logs) was designed to partially address.

### Firewalls: Policy Enforcement on Packet Flows

A firewall is a policy engine that classifies packets and decides: forward, drop, or reject. The distinction between stateless and stateful is not just a feature difference — it reflects a fundamental question of whether a packet can be evaluated in isolation.

**Stateless (packet-filtering):** Rules match on fields available in a single packet header: source/destination IP, source/destination port, protocol, TCP flags. The rule `DROP tcp dport 23` drops every packet destined for port 23, regardless of whether a legitimate connection was already established. This creates a problem: return traffic from a server you contacted also has to be explicitly permitted, or you must open broad port ranges for established connections — which undermines the model.

**Stateful:** The firewall maintains a connection tracking table keyed on the 5-tuple $(src_{ip}, dst_{ip}, src_{port}, dst_{port}, proto)$. When the first SYN arrives, an entry is created in state `SYN_SENT`. When the SYN-ACK returns, it transitions to `ESTABLISHED`. Return traffic is automatically permitted because it matches an existing entry. New unsolicited packets claiming to be `ESTABLISHED` (TCP ACK with no prior SYN) are dropped. This is why stateful firewalls are the default model for any perimeter defense.

**IP fragmentation as an evasion vector:** IPv4 allows large packets to be split into fragments; only the first fragment contains the TCP/UDP header. A stateless firewall evaluating port-based rules sees the first fragment (with the header), applies the rule, and then must pass subsequent fragments — which it cannot classify. An attacker can place a malicious payload in fragment 2 onwards, bypassing the rule entirely. A stateful firewall buffers and reassembles fragments before evaluating policy. The Linux kernel's `nf_defrag_ipv4` module does this as part of the conntrack subsystem.

### VPNs: Tunneling and Encapsulation

A VPN encapsulates original IP packets as the payload of new encrypted IP packets addressed to the VPN gateway. From the perspective of the underlying network, there is only outer-packet traffic between two endpoints. The inner packets — their source, destination, and content — are invisible.

**IPsec** operates at the IP layer and has two deployment modes:

- **Transport mode:** Only the payload is encrypted; the original IP header remains. Used for host-to-host tunnels where routing is unchanged.
- **Tunnel mode:** The entire original packet (header + payload) is encrypted and wrapped in a new IP header. The new header carries the gateway addresses; the original addresses are hidden inside. This is the basis of site-to-site VPNs and is why tunnel-mode traffic reveals nothing about the internal network topology to a passive observer.

IPsec provides these functions through two protocols:

- **AH (Authentication Header, RFC 4302):** Computes an HMAC over the IP header and payload, providing integrity and authentication. Does not encrypt. Breaks with NAT because NAT modifies the source IP, which invalidates the HMAC over the header. This is why AH is rarely used in practice.
- **ESP (Encapsulating Security Payload, RFC 4303):** Encrypts the payload and optionally the inner IP header (in tunnel mode), then appends an integrity check value. NAT-compatible because the mutable outer header is not included in the integrity computation.

Key exchange uses **IKEv2** (RFC 7296). Before data flows, IKEv2 negotiates a **Security Association (SA)** — a one-directional agreement specifying algorithm suite, keys, and lifetime. SAs are directional: a bidirectional tunnel requires two SAs. The `IKE_SA_INIT` exchange runs a Diffie-Hellman key exchange over UDP port 500. The `IKE_AUTH` exchange authenticates peers and establishes the first child SA. Subsequent child SAs (e.g., for rekeying) use `CREATE_CHILD_SA`.

**WireGuard** is a more recent alternative. It runs in the Linux kernel (merged in 5.6), uses fixed cryptographic primitives (Curve25519 for key exchange, ChaCha20-Poly1305 for encryption, BLAKE2s for hashing), and has a configuration model based on peer public keys rather than negotiated algorithm suites. The simplified cryptographic state machine makes it far easier to audit than IKE/IPsec.

### Authentication: Proving Identity

Authentication answers: *does this entity possess the credential it claims?* The three factor categories (something you know, have, are) matter because factors from different categories are independent — stealing a password doesn't give you the hardware token.

**EAP (Extensible Authentication Protocol, RFC 3748)** is a framework that separates the *transport* of authentication messages from the *method* used to authenticate. EAP itself defines only the packet format and negotiation sequence; the actual cryptography is in the method layer:

- **EAP-TLS:** Mutual certificate authentication inside a TLS tunnel. Strongest method; requires client certificates.
- **EAP-TTLS/PEAP:** Establishes a one-sided TLS tunnel (server certificate only), then runs a legacy method (MSCHAPv2, PAP) inside. Common in enterprise Wi-Fi because it doesn't require per-user client certificates.

In 802.1X, three roles exist:
- **Supplicant:** The device seeking network access; runs EAP over the link layer (EAPoL, EAP over LAN).
- **Authenticator:** A switch or access point that relays EAP messages between supplicant and server. Critically, it does not inspect EAP method payloads — it is a transparent relay.
- **Authentication server:** Typically RADIUS (UDP 1812/1813); performs actual credential verification and signals the authenticator with an `Access-Accept` or `Access-Reject`.

On success, the EAP method derives a **Master Session Key (MSK)**, delivered to the authenticator, and an **Extended MSK (EMSK)**, retained by the supplicant and server and never exposed to the authenticator. The MSK roots the lower-layer key hierarchy (e.g., WPA2 derives the Pairwise Master Key from the MSK). The EMSK is reserved for future or domain-specific uses. Both have a recommended lifetime of 8 hours before re-authentication.

### Spoofing: Forging Identity at the Packet Level

**IP spoofing** — sending packets with a source address you don't control — is limited against TCP because the three-way handshake requires the attacker to receive the SYN-ACK sent to the spoofed address. An attacker who cannot receive that packet cannot complete the connection (blind spoofing). However, spoofing enables several attacks that don't require completing a TCP handshake:

- **Amplification/reflection:** Send a small request with the victim's IP as source to a server that generates a large response. DNS, NTP, and memcached are all historically exploited amplifiers. The amplification factor for DNS can reach $\times 50$; for NTP's `monlist` command it reached $\times 556$ (CVE-2013-5211).
- **ICMP attacks:** Forged `ICMP Destination Unreachable` or `ICMP Source Quench` messages can tear down TCP connections or throttle throughput for any source/destination pair, since ICMP error processing doesn't require completing a handshake.
- **ARP spoofing:** ARP has no authentication. On a LAN, any host can broadcast an unsolicited ARP reply claiming "IP 192.168.1.1 is at MAC aa:bb:cc:dd:ee:ff." Other hosts update their ARP caches, routing traffic for that IP to the attacker. ARP operates below IP, so IP-layer protections don't help; the mitigations are Dynamic ARP Inspection (DAI) on managed switches and static ARP entries for critical hosts.

**Ingress filtering (BCP 38, RFC 2827):** A router drops any packet arriving on an interface whose source address is not topologically plausible for that interface. An internal host sending packets with a globally routable source address outside the allocated prefix is a red flag. This is effective only when deployed by ISPs — a single non-filtering ISP undermines the defense globally, which is why spoofing-based amplification attacks remain viable decades later.

---

## How It Works

### TLS 1.3 Handshake in Detail

TLS 1.3 mandates forward secrecy by requiring ephemeral key exchange
