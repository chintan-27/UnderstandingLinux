---
id: 147
title: "Application protocols"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
Application protocols define the syntax and semantics of messages exchanged between processes that reside on different hosts. They sit atop the transport layer (usually TCP or UDP) and provide the *meaning* of the data—whether that data represents a web page, an email, a cryptographic key, or a clock value.  

Because the transport layer only guarantees delivery of a byte stream (TCP) or datagrams (UDP), the application layer must:
* **Frame** messages so the receiver knows where one ends and the next begins (e.g., HTTP’s blank line, SMTP’s `.` line, TLS records).  
* **Interpret** fields (methods, status codes, options) to drive state machines (e.g., a TCP connection stays open across multiple HTTP requests only if Keep‑Alive is negotiated).  
* **Provide security** (authentication, integrity, confidentiality) when the underlying transport does not (TLS, SSH).  
* **Enable discovery and configuration** without manual intervention (DHCP, NTP).  

The six protocols studied here illustrate different points in this design space:
| Protocol | Transport | Primary Goal | Key Design Feature |
|----------|-----------|--------------|--------------------|
| HTTP/1.1 | TCP | Hypermedia transfer | Stateless request/response, extensible headers, persistent connections |
| TLS | TCP | Channel security | Handshake that negotiates ciphers, authenticates via X.509, derives symmetric keys |
| SSH | TCP | Secure remote login & port forwarding | Authenticated key exchange (Diffie‑Hellman), multiplexed channels, strong MACs |
| SMTP | TCP | Mail transfer | Envelope (MAIL/RCPT) separate from header, line‑oriented commands, STARTTLS upgrade |
| NTP | UDP | Clock synchronization | Offset/delay measurement, filtering & clustering algorithms, stratum hierarchy |
| DHCP | UDP | Network configuration | Client‑server DORA exchange, options field for extensibility (router, DNS, lease) |

Understanding these mechanisms from first principles lets you predict behavior, troubleshoot failures, and extend or replace components safely.

## How It Works
### HTTP (Hypertext Transfer Protocol)
HTTP/1.1 is a *text‑based* request/response protocol built on a reliable byte stream (TCP).  
**Why request/response?** It simplifies intermediaries (proxies, caches) because each message is self‑contained.  
**Why persistent connections?** Establishing a TCP triple‑handshake costs ~1 RTT; keeping the socket open amortizes that cost over many requests.  

**Message format**  
```
<method> <request-target> HTTP/<version>\r\n
<header-field>: <value>\r\n
...
\r\n
[message-body]
```
* `Host:` is mandatory in HTTP/1.1 to support virtual hosting; omitting it makes the server unable to select the correct virtual host.  
* `Transfer-Encoding: chunked` allows the sender to stream a body without knowing its length up front—essential for dynamic content.  
* Status codes are divided into classes (1xx informational, 2xx success, 3xx redirection, 4xx client error, 5xx server error) so generic handlers can act on the class without knowing the exact code.

**State machine (simplified)**  
```
CLOSED --[TCP connect]--> ESTABLISHED --[send request]--> WAITING_FOR_RESPONSE
                                 --[recv response]--> (keep‑alive?) ESTABLISHED | CLOSED
```
If `Connection: close` is present, the sender explicitly closes after the response; otherwise the connection may be reused.

### TLS (Transport Layer Security)
TLS provides *confidentiality, integrity, and authentication* over a reliable transport (usually TCP). It does so by performing a handshake that establishes shared symmetric keys, then protecting application data with an authenticated encryption (AEAD) construction.  

**Handshake goals**  
1. **Version & cipher suite negotiation** – ensures both ends agree on algorithms they support.  
2. **Server authentication** – the server proves possession of a private key matching a certificate trusted by the client.  
3. **Key exchange** – derives a *premaster secret* that only the client and server can compute (via RSA encryption or (EC)DHE).  
4. **Key derivation** – expands the premaster secret into *client_write_key*, *server_write_key*, *client_write_IV*, *server_write_IV*, and MAC keys via a PRF (TLS 1.2) or HKDF (TLS 1.3).  
5. **Finished messages** – each side sends a MAC over the entire handshake transcript; any tampering is detected before application data flows.

**Record layer**  
Each plaintext record is fragmented (≤ 2¹⁴ bytes), optionally compressed, then:
```
AEAD-enc(key, nonce, plaintext, additional_data) = ciphertext || auth_tag
```
For TLS 1.2 with AES‑256‑GCM:  
* `nonce = seq_num || fixed_IV` (64‑bit seq num, 96‑bit fixed IV)  
* `additional_data = record_type || version || length`  

The use of an AEAD mode eliminates the need for a separate MAC and provides provable integrity.

**Forward secrecy** – when the key exchange uses (EC)DHE, compromising the server’s long‑term private key does *not* reveal past session keys, because the premaster secret is derived from an ephemeral Diffie‑Hellman exchange.

### SSH (Secure Shell)
SSH replaces insecure protocols (telnet, rsh) by offering an encrypted, authenticated channel that also supports multiplexed logical channels (shell, port forward, file transfer).  

**Protocol phases**  
1. **Identification string exchange** – each side sends `SSH-proto-version-software-version\r\n` (e.g., `SSH-2.0-OpenSSH_8.9p1 Ubuntu-3`). This allows version‑specific bug workarounds.  
2. **Algorithm negotiation** – client sends a list of supported key exchange, encryption, MAC, and compression algorithms; server picks the first match in its list.  
3. **Key exchange** – typically an ephemeral Diffie‑Hellman group exchange (diffie-hellman-group14-sha256) or curve25519-sha256. Both parties compute a shared secret *K* and exchange a hash *H* of the entire exchange for authentication.  
4. **Server authentication** – the server signs *H* with its host key (RSA, ECDSA, Ed25519). The client checks the signature against known hosts (`~/.ssh/known_hosts`).  
5. **User authentication** – password, public‑key, keyboard‑interactive, or GSSAPI. Public‑key auth involves the client signing a session‑specific blob with its private key; the server verifies with the stored public key.  
6. **Channel creation** – after authentication, the client may request a session channel (`shell`), a direct‑tcpip channel (port forward), etc. Each channel gets a local and remote channel number and a window size for flow control.  

**Encryption & MAC** – after key exchange, both sides derive encryption keys (`client_to_server_key`, `server_to_client_key`) and MAC keys (`client_to_server_mac`, `server_to_client_mac`) using a KDF (typically HKDF‑SHA256). Packet format:  
```
uint32 packet_length   // does not include this field or MAC
byte   payload[packet_length]
byte   mac[mac_len]    // HMAC-SHA256(seq_num || packet_length || payload)
```
Sequence numbers prevent replay attacks.

### SMTP (Simple Mail Transfer Protocol)
SMTP transfers *mail envelopes* between MTAs. It is a line‑oriented, command/response protocol where each command ends with `<CRLF>` and responses begin with a three‑digit code.  

**Why separate envelope from header?**  
The envelope (`MAIL FROM`, `RCPT TO`) determines delivery routing and bounce addresses; the header (`From:`, `To:`, `Subject:`) is for the user agent and may be spoofed. This separation enables features like mailing lists, BCC, and VERP.  

**Key extensions**  
* **SIZE** – advertises maximum message size; client can abort early if too large.  
* **8BITMIME** – allows transmission of UTF‑8 bodies without MIME encoding.  
* **STARTTLS** – upgrades to TLS protection after the initial plaintext handshake (command `STARTTLS`, response `220 Ready to start TLS`).  
* **PIPELINING** – client may send multiple commands without waiting for each response, reducing latency.  

**Session flow** (simplified)  
```
C: EHLO client.example.com
S: 250-host server.example.com ... 250 SIZE 52428800
C: MAIL FROM:<sender@example.com>
S: 250 OK
C: RCPT TO:<recipient@example.com>
S: 250 OK
C: DATA
S: 354 Start mail input; end with <CRLF>.<CRLF>
C: Subject: Test
C: Hello world.
C: .
S: 250 OK
C: QUIT
S: 221 Bye
```
If the server advertised `STARTTLS`, the client would issue `STARTTLS` after the `EHLO` response, perform a TLS handshake, then continue with `MAIL FROM` inside the protected channel.

### NTP (Network Time Protocol)
NTP synchronizes clocks to within a few milliseconds over LANs and tens of milliseconds over WANs by measuring *offset* and *delay* using UDP packets.  

**Timestamp model** (four timestamps per exchange)  
* `t1` – client transmit time  
* `t2` – server receive time  
* `t3` – server transmit time  
* `t4` – client receive time  

From these we compute:  
* **Offset** (clock error)  
  \[
  \theta = \frac{(t_2 - t_1) + (t_3 - t_4)}{2}
  \]
* **Round‑trip delay**  
  \[
  \delta = (t_4 - t_1) - (t_3 - t_2)
  \]

**Why the factor ½?** The offset assumes symmetric path delays; the average of the two one‑way delays estimates the client’s clock error relative to the server.  

**Filtering & clustering**  
NTP maintains a shift register of the last *N* samples (typically 8–16). It applies a *Marzullo* algorithm to find the interval intersected by the maximum number of confidence intervals (`[θ - ε, θ + ε]` where `ε = δ/2 + dispersion`). The intersection’s midpoint is the selected offset.  

**Stratum hierarchy**  
* Stratum 0 – hardware reference (GPS, atomic clock)  
* Stratum 1 – server directly attached to stratum 0  
* Stratum 2+ – servers synchronized to the previous stratum, with each hop adding ~1 ms of error.  
Clients avoid synchronizing to strangers at the same stratum to prevent timing loops.

### DHCP (Dynamic Host Configuration Protocol)
DHCP lets a host obtain an IP address and other configuration parameters without manual intervention. It builds on UDP (client port 68, server port 67) and uses a *client‑identifier* (often the MAC address) to distinguish clients.  

**Message format (simplified)**  
| Field | Size | Description |
|-------|------|-------------|
| op | 1 | 1=REQUEST, 2=REPLY |
| htype | 1 | Hardware type (1=Ethernet) |
| hlen | 1 | Hardware address length (6) |
| hops | 1 | Relay agent hop count |
| xid | 4 | Transaction ID (random) |
| secs | 2 | Elapsed seconds since client began acquisition |
| flags | 2 | Broadcast flag (bit 15) |
| ciaddr | 4 | Client IP (if already known) |
| yiaddr | 4 | ‘Your’ (client) IP address |
| siaddr | 4 | Server IP address |
| giaddr | 4 | Gateway IP address |
| chaddr | 16 | Client hardware address |
| sname | 64 | Server host name (optional) |
| file | 128 | Boot file name (optional) |
| options | variable | Tag‑length‑value (TLV) options (e.g., 53=message type, 1=subnet mask, 3=router, 6=DNS, 51=lease time) |

**DORA exchange**  
1. **DISCOVER** – client broadcasts (`0.0.0.0:68 → 255.255.255.255:67`) with `xid` and option 53=1.  
2. **OFFER** – server(s) unicast (or broadcast if flag set) reply with `yiaddr`= offered address, option 53=2, lease time, etc.  
3. **REQUEST** – client broadcasts request for the chosen server, echoing the server identifier (option 54) and the requested address (option 50).  
4. **ACK** – server acknowledges, supplying final configuration; client configures its interface and enters the *bound* state.  

If the client needs to renew, it unicasts a REQUEST directly to the server after 50% of the lease time; if no reply, it rebounds to broadcast at 87.5% and, failing that, restarts DISCOVER.

## Worked Examples
### Example 1: HTTP Request‑Response with Persistent Connection
**Goal:** Retrieve `https://example.com/index.html` using HTTP/1.1 over TLS, showing the TCP/TLS handshake and the HTTP exchange.

1. **TCP three‑way handshake** (SYN, SYN‑ACK, ACK) – 1 RTT.  
2. **TLS 1.2 handshake** (simplified):  
   * `ClientHello` (random cₙ, cipher suites, extensions)  
   * `ServerHello` (random sₙ, chosen cipher `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`)  
   * `Certificate` (server’s X.509 chain)  
   * `ServerKeyExchange` (ECDHE public point)  
   * `ServerHelloDone`  
   * `ClientKeyExchange` (client’s ECDHE public point)  
   * `ChangeCipherSpec` (both sides)  
   * `Encrypted Handshake Message` (Finished) from each side  
   – ~2 RTTs total.  
3. **HTTP request** (sent inside TLS record):  
   ```http
   GET /index.html HTTP/1.1
   Host: example.com
   Accept: text/html
   Connection: keep-alive
   ```
4. **TLS‑protected HTTP response**:  
   ```http
   HTTP/1.1 200 OK
   Content-Type: text/html
   Content-Length: 1234
   Connection: keep-alive

   <html>…</html>
   ```
5. **Keep‑alive:** If the client issues another request on the same socket, steps 3‑4 repeat without a new TCP/TLS handshake, saving ~2 RTTs.

**Numerical example** (LAN, 0.5 ms RTT):  
* TCP handshake: 0.5 ms  
* TLS handshake: 2 × 0.5 ms = 1.0 ms  
* HTTP request/response: 0.5 ms (request) + 0.5 ms (response) = 1.0 ms  
* Total for first request ≈ 2.5 ms; subsequent requests ≈ 1.0 ms each.

### Example 2: Full TLS 1.2 Handshake with ECDHE_RSA (shown via `openssl s_client`)
Run the following command to see the raw handshake (output trimmed for clarity):
```bash
$ openssl s_client -connect example.com:443 -tls1_2 -debug -msg 2>&1 | \
    grep -E '(ClientHello|ServerHello|Certificate|ServerKeyExchange|ClientKeyExchange|ChangeCipherSpec|Finished)'
```
Typical output:
```
>>> ClientHello (tls1_2)
    version 0x0303
    random: 5a 3f 9c … 1e
    cipher suites: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, …
<<< ServerHello (tls1_2)
    version 0x0303
    random: 9c 1e 2a … 7b
    cipher suite: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
<<< Certificate (tls1_2)
    length=1423
    -----BEGIN CERTIFICATE-----
    MIID...
<<< ServerKeyExchange (tls1_2)
    EC Point Format: uncompressed
    Elliptic Curve: X25519 (0x001d)
    Point: 04…
<<< ClientKeyExchange (tls1_2)
    EC Point Format: uncompressed
    Point: 04…
<<< ChangeCipherSpec (tls1_2)
<<< Encrypted Handshake Message (Finished)   (tls1_2)
>>> ChangeCipherSpec (tls1_2)
>>> Encrypted Handshake Message (Finished)   (tls1_2)
```
**Interpretation**  
* The server chose `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`.  
* `ServerKeyExchange` carries the server’s elliptic‑curve public value; the client replies with its own.  
* Both sides derive the shared secret via the Elliptic Curve Diffie‑Hellman (ECDHE) operation on curve25519.  
* The `Finished` messages contain a HMAC‑SHA256 of all previous handshake messages, proving integrity.  
* After the `ChangeCipherSpec`, subsequent records are encrypted with AES‑256‑GCM using keys derived from the shared secret.

### Example 3: SMTP Session with STARTTLS and AUTH LOGIN
```bash
$ telnet mail.example.com 25
Trying 93.184.216.34...
Connected to mail.example.com.
Escape character is '^]'.
220 mail.example.com ESMTP Postfix
EHLO client.example.com
250-mail.example.com
250-PIPELINING
250-SIZE 10240000
250-VRFY
250-ETRN
250-STARTTLS
250-AUTH LOGIN PLAIN
250 8BITMIME
STARTTLS
220 2.0.0 Ready to start TLS
```
Now we perform a TLS handshake (omitted for brevity) and continue inside the encrypted tunnel:
```bash
AUTH LOGIN
334 VXNlcm5hbWU6
dGVzdEBleGFtcGxlLmNvbQ==
334 UGFzc3dvcmQ6
cGFzc3dvcmQxMjM=
235 2.7.0 Authentication successful
MAIL FROM:<test@example.com>
250 2.1.0 Ok
RCPT TO:<friend@example.com>
250 2.1.5 Ok
DATA
354 End data with <CR><LF>.<CR><LF>
Subject: Hello from Linux
This is a test message.
.
250 2.0.0 Ok: queued as 12345
QUIT
221 2.0.0 Bye
Connection closed.
```
**Why each step matters**  
* `EHLO` advertises extensions; we pick `STARTTLS` to protect credentials.  
* `AUTH LOGIN` uses base64 encoding (not encryption) – hence the prior TLS upgrade is essential.  
* The `DATA` command ends with a lone dot line; any dot inside the message must be escaped (e.g., prefixed with an extra dot) to avoid premature termination, a rule defined in RFC 821.  
* After `QUIT`, the server sends `221` and closes the TCP connection.

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Omitting `Host:` in HTTP/1.1 requests** | Virtual hosting relies on the header to select the correct site; without it the server may return the default site or a 404. | Always include `Host: <authority>`; for HTTP/1.0, add it if you know the server uses virtual hosting. |
| 2 | **Accepting any server certificate in TLS** | Skipping verification enables man‑in‑the‑middle attacks; an attacker can present a self‑signed cert and decrypt traffic. | Use `openssl s_client -verify_return_error` or configure libraries to validate the chain, check expiration, hostname matching, and revocation (OCSP/CRL). |
| 3 | **Using SSH with weak MACs like `hmac-md5`** | MD5 is vulnerable to collision attacks; an attacker could forge packet authentication and inject data. | Prefer `hmac-sha2-256` or `hmac-sha2-512`; disable weak MACs in `/etc/ssh/sshd_config` (`MACs hmac-sha2-256,hmac-sha2-512`). |
|
